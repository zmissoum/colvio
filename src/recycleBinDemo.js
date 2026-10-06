// Demo-mode recycle bin: the deleted records, audit "deleted by" entries and Restore outcomes the
// Recycle Bin module gets from a live org, in the same shapes as content.js (fetchXml,
// deletesByEntity, restoreRecord). The demo walks the REAL UI — table picker, server-side name
// search, paging, restore + error mapping — against an in-memory bin. Pure: no React, no DOM, no
// network. `now` is injected so every deletion stays inside the 30-day retention the demo reports.

const FMT = "@OData.Community.Display.V1.FormattedValue";
const LOOKUP = "@Microsoft.Dynamics.CRM.lookuplogicalname";
const DAY = 86400000;
const MIN = 60000;

// The picker narrows to these: users, business units, currencies and the virtual SAP table of the
// demo org are left out (virtual tables are excluded by Microsoft).
export const DEMO_BIN_TABLES = ["account", "contact", "opportunity", "lead", "incident", "task", "phonecall", "email",
  "appointment", "team", "product", "salesorder", "contract", "campaign", "list", "quote", "annotation", "pricelevel", "knowledgearticle"];

const META = {
  account: ["name", "accountid", "accounts"],
  contact: ["fullname", "contactid", "contacts"],
  lead: ["fullname", "leadid", "leads"],
  opportunity: ["name", "opportunityid", "opportunities"],
  incident: ["title", "incidentid", "incidents"],
  task: ["subject", "activityid", "tasks"],
  phonecall: ["subject", "activityid", "phonecalls"],
  email: ["subject", "activityid", "emails"],
  appointment: ["subject", "activityid", "appointments"],
  annotation: ["subject", "annotationid", "annotations"],
};
// getEntityMetadata's primary-attribute fields; unknown tables get content.js's own fallbacks.
export function demoBinMeta(logicalName) {
  const m = META[logicalName];
  return m ? { primaryName: m[0], primaryId: m[1], entitySet: m[2] }
    : { primaryName: "name", primaryId: logicalName + "id", entitySet: logicalName + "s" };
}

const USERS = {
  alex: "Alex Baker", marie: "Marie Martin", pierre: "Pierre Bernard",
  sophie: "Sophie Lefevre", emma: "Emma Petit", integ: "# D365 Integration",
};

// Deterministic GUID from a string seed (FNV-1a, then multiply-xorshift rounds).
export function binGuid(seed) {
  let h = 0x811c9dc5;
  for (const ch of String(seed)) h = Math.imul(h ^ ch.charCodeAt(0), 0x01000193);
  let hex = "";
  for (let i = 0; i < 4; i++) {
    h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
    h = Math.imul(h ^ (h >>> 13), 0x2c1b3c6d);
    h ^= h >>> 16;
    hex += (h >>> 0).toString(16).padStart(8, "0");
  }
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

// [name, deleted by, deleted days ago, hour, minute (UTC), modified by, minutes modified before the
// delete, created by, created days ago]
const ACCOUNTS = [
  ["Contoso Pharmaceuticals", "alex", 1, 16, 42, "alex", 3, "marie", 412],
  ["Fabrikam Residences", "marie", 2, 10, 5, "pierre", 2880, "sophie", 690],
  ["Northwind Traders", "pierre", 3, 14, 20, "pierre", 12, "emma", 538],
  ["Adventure Works Cycles", "alex", 4, 9, 31, "marie", 8640, "marie", 301],
  ["Contoso Ltd (duplicate)", "marie", 5, 11, 48, "integ", 1440, "integ", 46],
  ["Tailspin Toys", "pierre", 6, 17, 2, "alex", 12960, "alex", 227],
  ["Wide World Importers", "alex", 7, 15, 16, "alex", 5, "sophie", 803],
  ["Woodgrove Bank", "pierre", 11, 10, 12, "marie", 5760, "pierre", 950],
  ["Litware, Inc.", "alex", 13, 13, 37, "alex", 1, "emma", 488],
  ["Contoso Suites", "marie", 16, 9, 3, "marie", 28800, "marie", 365],
  ["Alpine Ski House", "alex", 19, 16, 55, "pierre", 4320, "sophie", 1012],
  ["Coho Winery", "pierre", 23, 11, 21, "pierre", 8, "alex", 154],
  ["Fourth Coffee", "marie", 27, 8, 47, "alex", 43200, "marie", 720],
];
// A nightly dedup run that removed 140 duplicate accounts in one go — the reason the bin pages.
const MASS_BASES = ["Contoso", "Fabrikam", "Northwind", "Tailspin", "Woodgrove", "Litware", "Proseware", "Adatum", "Wingtip", "Relecloud"];
const MASS_CITIES = ["Lyon", "Lille", "Nantes", "Bordeaux", "Toulouse", "Marseille", "Rennes", "Strasbourg", "Leeds", "Bristol", "Manchester", "Glasgow", "Hamburg", "Munich"];
const MASS_DAYS_AGO = 9;
const CONTACTS = [
  ["Nathalie Girard", "marie", 1, 11, 15, "marie", 4, "alex", 380],
  ["Thomas Roux", "alex", 2, 15, 40, "pierre", 7200, "marie", 512],
  ["Camille Fontaine", "pierre", 4, 9, 12, "pierre", 2, "sophie", 845],
  ["Oliver Grant", "alex", 6, 14, 5, "alex", 1440, "emma", 433],
  ["Léa Chevalier", "marie", 8, 16, 30, "alex", 20160, "marie", 266],
  ["Daniel Hughes", "integ", 12, 3, 10, "integ", 2, "integ", 190],
  ["Hugo Lambert", "alex", 17, 10, 45, "marie", 10080, "pierre", 701],
  ["Chloe Bennett", "pierre", 25, 13, 20, "pierre", 15, "alex", 98],
];
// Re-created by the integration after its delete, with the same account number (alternate key):
// Dataverse refuses to restore it until the live duplicate is gone.
const KEY_CONFLICTS = new Set(["Wide World Importers"]);

const iso = (ms) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, "Z");
const unescapeXml = (s) => s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

export function createDemoBin(now) {
  const dayStart = Math.floor(now / DAY) * DAY;
  const at = (daysAgo, h, m, s = 0) => dayStart - daysAgo * DAY + (h * 60 + m) * MIN + s * 1000;
  const lookup = (key, u) => ({ [`_${key}_value`]: binGuid("user:" + u), [`_${key}_value${FMT}`]: USERS[u], [`_${key}_value${LOOKUP}`]: "systemuser" });

  const entry = (logical, name, delBy, deletedMs, modBy, modifiedMs, createdBy, createdMs) => {
    const [primaryName, primaryId] = META[logical];
    const id = binGuid(`${logical}:${name}`);
    return {
      logical, id, conflict: logical === "account" && KEY_CONFLICTS.has(name),
      del: { by: USERS[delBy], on: iso(deletedMs) },
      record: { [primaryId]: id, [primaryName]: name, ...lookup("createdby", createdBy), createdon: iso(createdMs), ...lookup("modifiedby", modBy), modifiedon: iso(modifiedMs) },
    };
  };
  const fromRow = (logical) => ([name, delBy, d, h, m, modBy, modBefore, createdBy, createdAgo]) => {
    const deletedMs = at(d, h, m);
    return entry(logical, name, delBy, deletedMs, modBy, deletedMs - modBefore * MIN, createdBy, at(createdAgo, 9, 30));
  };

  const mass = [];
  for (let i = 0; i < MASS_BASES.length * MASS_CITIES.length; i++) {
    // City shifted by base, so consecutive rows differ in both parts and every pair stays unique.
    const base = i % MASS_BASES.length, city = (Math.floor(i / MASS_BASES.length) + 3 * base) % MASS_CITIES.length;
    const name = `${MASS_BASES[base]} ${MASS_CITIES[city]}`;
    const deletedMs = at(MASS_DAYS_AGO, 2, 0, Math.round(i * 3.5));
    mass.push(entry("account", name, "integ", deletedMs, "integ", deletedMs - 14 * MIN, "integ", at(180 + (i * 7) % 200, 4, 15)));
  }
  const bin = {
    account: [...ACCOUNTS.map(fromRow("account")), ...mass],
    contact: CONTACTS.map(fromRow("contact")),
  };
  const restored = new Set();
  const live = (logical) => (bin[logical] || []).filter(e => !restored.has(e.id));

  return {
    // datasource='bin' FetchXML → content.js's fetchXml result: count/page paging, the like filter
    // the module adds for its name search, and the <order> it sends.
    query(fetchXml) {
      const xml = String(fetchXml || "");
      const logical = xml.match(/<entity\s+name=['"]([^'"]+)['"]/)?.[1] || "";
      const count = parseInt(xml.match(/<fetch[^>]*\scount=['"](\d+)['"]/)?.[1], 10) || 5000;
      const page = parseInt(xml.match(/<fetch[^>]*\spage=['"](\d+)['"]/)?.[1], 10) || 1;
      let rows = live(logical).map(e => e.record);
      const like = xml.match(/<condition\s+attribute=['"]([^'"]+)['"]\s+operator=['"]like['"]\s+value=['"]%([^'"]*)%['"]/);
      if (like) {
        const term = unescapeXml(like[2]).toLowerCase();
        rows = rows.filter(r => String(r[like[1]] ?? "").toLowerCase().includes(term));
      }
      const order = xml.match(/<order\s+attribute=['"]([^'"]+)['"](?:\s+descending=['"](true|false)['"])?/);
      if (order) {
        const [, attr, desc] = order;
        rows = [...rows].sort((a, b) => String(a[attr] ?? "").localeCompare(String(b[attr] ?? "")) * (desc === "true" ? -1 : 1));
      }
      const records = rows.slice((page - 1) * count, page * count);
      const moreRecords = rows.length > page * count;
      return {
        records, count: records.length,
        pagingCookie: moreRecords ? `<cookie page="${page}" />` : null,
        entitySetName: logical ? demoBinMeta(logical).entitySet : "",
        moreRecords,
      };
    },
    // deletesByEntity: { idLower: {by, on} } for the `top` most recent deletes of the table.
    deletedBy(logicalName, top = 2000) {
      const map = {};
      [...(bin[logicalName] || [])].sort((a, b) => b.del.on.localeCompare(a.del.on)).slice(0, top)
        .forEach(e => { map[e.id.toLowerCase()] = { ...e.del }; });
      return map;
    },
    // Restore by primary key: the record leaves the bin, or throws the Dataverse-style error the
    // module maps to guidance.
    restore(entitySet, id) {
      const idL = String(id || "").toLowerCase();
      const e = Object.values(bin).flat().find(x => x.id === idL && demoBinMeta(x.logical).entitySet === entitySet);
      if (!e || restored.has(e.id)) throw new Error(`HTTP 404: No deleted record with id '${id}' was found in the recycle bin for '${entitySet}'.`);
      if (e.conflict) {
        throw new Error(`HTTP 400: Duplicate entity key preventing restore of record '${e.logical}' with primary key '${demoBinMeta(e.logical).primaryId}' and primary key value '${e.id}'.`);
      }
      restored.add(e.id);
      return { id: e.id };
    },
  };
}
