// Data Loader — the file's columns matched to the table's fields. Pure (no React, no API).
//
// A column header may carry any name Dynamics writes: a logical name (emailaddress1), the OData
// name of a lookup (_primarycontactid_value — Colvio's own exports), a display name ("Account
// Name", "Main Phone" — Export to Excel, Advanced Find, views), or one of Excel's hidden export
// columns ("(Do Not Modify) Account" = the record id, "(Do Not Modify) Row Checksum",
// "(Do Not Modify) Modified On" — localized on non-English orgs, so only the parenthesised
// prefix is assumed, never its words). The table is chosen AFTER the file, so the match runs
// once when the file is read and again each time the table's metadata arrives.

export const GUID_RE = /^\{?[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\}?$/i;
export const isGuid = (v) => GUID_RE.test(String(v ?? "").trim());

// platform-managed / write-protected fields the loader never writes by default (migration mode
// re-enables a few of them — the Loader handles that on its own)
export const SKIP_FIELDS = new Set(["createdon", "modifiedon", "createdby", "modifiedby", "owningbusinessunit", "owningteam", "owninguser", "versionnumber", "importsequencenumber", "overriddencreatedon", "timezoneruleversionnumber", "utcconversiontimezonecode"]);

// spreadsheet-era aliases ("Email" → emailaddress1), applied only when the table has the field
const ALIASES = { firstname: "firstname", lastname: "lastname", email: "emailaddress1", phone: "telephone1", title: "jobtitle", mailingstreet: "address1_line1", mailingcity: "address1_city", mailingpostalcode: "address1_postalcode", mailingcountry: "address1_country", name: "name", accountnumber: "accountnumber", description: "description", website: "websiteurl", fax: "fax" };

// lookups whose target table isn't spelled by their name (used when the metadata doesn't say)
const KNOWN_TARGETS = { parentaccountid: "account", parentcontactid: "contact", ownerid: "systemuser", owningbusinessunit: "businessunit", transactioncurrencyid: "transactioncurrency", primarycontactid: "contact" };

const lc = (s) => String(s ?? "").toLowerCase();
export const norm = (s) => lc(s).replace(/^﻿/, "").trim().replace(/\s+/g, " ");

// the text after a leading parenthesised note — "(Do Not Modify) Account" → "Account",
// "(Ne pas modifier) Compte" → "Compte"; null when the header has no such prefix
export const afterParen = (h) => { const m = /^\([^)]*\)\s*(.+)$/.exec(String(h ?? "").trim()); return m ? m[1].trim() : null; };

// the first non-empty values of a column (rows are objects keyed by header)
export function sampleValues(rows, h, max = 20) {
  const out = [];
  for (const r of rows || []) {
    const v = r?.[h];
    if (v === undefined || v === null || String(v).trim() === "") continue;
    out.push(String(v).trim());
    if (out.length >= max) break;
  }
  return out;
}
export const columnIsGuid = (rows, h) => { const s = sampleValues(rows, h); return s.length > 0 && s.every(isGuid); };
const columnIsNumeric = (rows, h) => { const s = sampleValues(rows, h); return s.length === 0 || s.every(v => /^-?\d+$/.test(v)); };

// Every name a field answers to → one entry. `fields` holds metadata objects ({logical|l,
// display|d, type|t, odataName, isPrimaryId|pk, target}) or bare logical names (before the
// table's metadata is read, only the names are known).
export function fieldIndex(fields) {
  const byName = new Map(), byDisplay = new Map();
  let pk = "";
  for (const f of fields || []) {
    const raw = typeof f === "string" ? { logical: f } : f;
    if (!raw) continue;
    let logical = lc(raw.logical || raw.l);
    if (!logical) continue;
    const type = raw.type || raw.t || "";
    const isRef = type === "Lookup" || type === "Customer" || type === "Owner";
    // the demo's lookups are stored as "_x_value": the bare name is the field
    const m = /^_(.+)_value$/.exec(logical);
    if (m) logical = m[1];
    const e = { logical, type, isRef, display: raw.display || raw.d || "", isPrimaryId: !!(raw.isPrimaryId || raw.pk), target: raw.target || null };
    if (e.isPrimaryId && !pk) pk = logical;
    byName.set(logical, e);
    if (isRef || m) byName.set(lc(raw.odataName) || `_${logical}_value`, e);
    const d = norm(e.display);
    if (d && d !== logical) byDisplay.set(d, byDisplay.has(d) ? null : e); // null: two fields share the label
  }
  return { byName, byDisplay, pk };
}

// One header → { entry, how } (how: logical | odata | display | export | alias), { ambiguous: true }
// when two fields share that display name, or null.
export function matchHeader(h, idx) {
  const n = norm(h);
  if (!n) return null;
  const e = idx.byName.get(n);
  if (e) return { entry: e, how: /^_.+_value$/.test(n) ? "odata" : "logical" };
  if (idx.byDisplay.has(n)) { const d = idx.byDisplay.get(n); return d ? { entry: d, how: "display" } : { ambiguous: true }; }
  const inner = afterParen(h);
  if (inner) { const r = matchHeader(inner, idx); return r && r.entry ? { ...r, how: "export" } : r; }
  const a = ALIASES[n];
  if (a && idx.byName.has(a)) return { entry: idx.byName.get(a), how: "alias" };
  if (a && idx.byName.size === 0) return { entry: { logical: a, type: "", isRef: false, display: "", isPrimaryId: false, target: null }, how: "alias" };
  return null;
}

// the relationship metadata of a lookup field, by its field or navigation property name
const lookupMetaFor = (lookupsMeta, name) => { const n = lc(name); if (!n) return null; return (lookupsMeta || []).find(m => lc(m.lookupField) === n || lc(m.navProperty) === n) || null; };

// The mapping of a file against a table → { maps, lookups, ambiguous, fit }.
//   headers / rows   the file (rows = objects keyed by header)
//   fields           the table's field metadata (or bare names before it is read)
//   lookupsMeta      its relationships ({ lookupField, navProperty, targetEntity })
//   target           its logical name; tableDisplay its display name (the export's id column is named after it)
//   primaryNames     { table: primary name field } — an export writes a related record's NAME, so a
//                    lookup column of names is resolved on that field when the table is known
//   prev             the current mapping: a row the user edited by hand (manual) is kept when its
//                    field exists on the table; everything else — a manual row whose field doesn't,
//                    included — is matched again from the names
// A map row: { csv, d365, transform, skip?, isPK?, isLookup?, auto?, manual?, matched? } — `matched` is
// the logical name a system row (auto "system") matched, kept so migration mode can map it.
export function autoMap({ headers = [], rows = [], fields = [], lookupsMeta = [], target = "", tableDisplay = "", primaryNames = {}, prev = null, keepManual = true } = {}) {
  const idx = fieldIndex(fields);
  const metaKnown = (fields || []).some(f => f && typeof f === "object");
  const lkKnown = (lookupsMeta || []).length > 0;
  const pk = idx.pk || (target ? lc(target) + "id" : "");
  const tDisp = norm(tableDisplay);
  const prevBy = new Map((prev || []).filter(m => m && m.csv).map(m => [m.csv, m]));
  const maps = [], lookups = [], parents = new Set(), ambiguous = [];
  const validTarget = (d) => { const n = lc(d); return !metaKnown || n === "statecode" || n === "statuscode" || idx.byName.has(n); };

  for (const h of headers) {
    const pm = prevBy.get(h);
    if (keepManual && pm?.manual && pm.d365 && validTarget(pm.d365)) { maps.push(pm); continue; }
    const n = norm(h);
    // "primarycontactid.emailaddress1": the lookup resolved by that column of the related table —
    // a lookup once the metadata says so (a data column may hold a dot too: "Q1.Revenue")
    if (h.includes(".")) {
      const p = h.split(".")[0];
      const lm = lookupMetaFor(lookupsMeta, p);
      if (!lkKnown || lm) {
        if (!parents.has(lc(p))) {
          parents.add(lc(p));
          lookups.push({ src: p + "Id", csv: h, entity: lm?.targetEntity || lc(p), nav: lm?.navProperty || `parentcustomerid_${lc(p)}`, d365f: "", fb: "skip", mode: "resolve" });
        }
        continue; // not a column of its own
      }
    }
    const r = matchHeader(h, idx);
    const e = r?.entry || null;
    if (r?.ambiguous) ambiguous.push(h);
    const guidCol = columnIsGuid(rows, h);
    const inner = afterParen(h);
    // the record's own id: the table's id column, or the export's "(Do Not Modify) <Table>" column
    if ((e && (e.isPrimaryId || e.logical === pk)) || n === pk || (inner && guidCol && tDisp && norm(inner) === tDisp)) { maps.push({ csv: h, d365: "", transform: "", skip: true, isPK: true, auto: "pk" }); continue; }
    const logical = e ? e.logical : n;
    // a platform-managed field: skipped, but the field it matched is remembered — migration mode
    // (migrationMaps) writes createdon / modifiedon / createdby / modifiedby from these very columns
    if (SKIP_FIELDS.has(logical)) { maps.push({ csv: h, d365: "", transform: "", skip: true, auto: "system", matched: logical }); continue; }
    // the export's bookkeeping columns ("(Do Not Modify) Row Checksum", another table's id) are never data
    if (!e && inner) { maps.push({ csv: h, d365: "", transform: "", skip: true, auto: "export" }); continue; }
    if (logical === "statecode") { maps.push({ csv: h, d365: "statecode", transform: "statecode", auto: r?.how || "logical" }); continue; }
    if (logical === "statuscode") { maps.push({ csv: h, d365: "statuscode", transform: columnIsNumeric(rows, h) ? "int" : "picklist", auto: r?.how || "logical" }); continue; }
    // a lookup: the field's type says so, the relationships know it, or — before the metadata —
    // a column of GUIDs named like one (…id). An export writes the related record's NAME, not its id.
    const bare = logical.replace(/^_/, "").replace(/_value$/, "");
    const lm = lookupMetaFor(lookupsMeta, bare);
    const isRef = (e && e.isRef) || !!lm || (!e && guidCol && n.endsWith("id"));
    if (isRef) {
      maps.push({ csv: h, d365: "", transform: "", skip: true, isLookup: true, auto: "lookup" });
      const entity = lm?.targetEntity || e?.target || KNOWN_TARGETS[bare] || (!e && guidCol ? bare.replace(/id$/, "") : "");
      const nav = lm?.navProperty || bare;
      if (guidCol) lookups.push({ src: "", csv: h, entity, nav, d365f: "", fb: "skip", mode: "direct" });
      else if (sampleValues(rows, h, 1).length) lookups.push({ src: "", csv: h, entity, nav, d365f: (entity && primaryNames[entity]) || "", fb: "skip", mode: "resolve", byName: true });
      continue;
    }
    if (e) {
      const t = e.type;
      const transform = (t === "Picklist" || t === "State" || t === "Status") ? (columnIsNumeric(rows, h) ? "int" : "picklist") : "";
      maps.push({ csv: h, d365: logical, transform, auto: r.how });
      continue;
    }
    maps.push({ csv: h, d365: "", transform: "" });
  }
  return { maps, lookups, ambiguous, fit: mappingFit(maps, lookups, ambiguous) };
}

// Migration mode (Loader): the audit columns the mapper skipped as system fields — createdon,
// modifiedon, createdby, modifiedby, overriddencreatedon — are the very columns a migration exists to
// write. While it is active (`active`: migration mode on AND a pure create) those rows are mapped to
// the field they matched; when it goes off they are skipped again. A row the user edited by hand is
// left alone either way. `migrationFields` is the Loader's allowlist. Returns the same array when
// nothing changes (so a state update is a no-op).
export function migrationMaps(maps, active, migrationFields) {
  const allowed = new Set((migrationFields || []).map(lc));
  let changed = false;
  const out = (maps || []).map(m => {
    if (!m || m.manual) return m;
    // the field the row stands for: what a system row matched, or — a row of no match — its header
    const matched = lc(m.matched) || (m.auto === "system" ? "" : lc(m.csv));
    if (!allowed.has(matched)) return m;
    if (active && m.skip && m.auto === "system") { changed = true; return { ...m, skip: false, d365: matched, migrated: true }; }
    if (active && !m.skip && !m.d365 && !m.isPK && !m.isLookup) { changed = true; return { ...m, d365: matched, migrated: true }; }
    if (!active && m.migrated) {
      changed = true;
      const rest = { ...m }; delete rest.migrated;
      return m.auto === "system" ? { ...rest, skip: true, d365: "" } : { ...rest, d365: "" };
    }
    return m;
  });
  return changed ? out : maps;
}

// The lookups after the table's metadata arrives: the ones the user set up by hand (`manual` — a
// template, for instance) are kept when their file column still exists, in the place of the
// auto-detected lookup on that column; the auto-detected ones cover the other columns. Replacing
// the list wholesale lost the template's resolve field / target / fallback.
export function mergeLookups(prev, auto, headers) {
  const hs = new Set(headers || []);
  const kept = (prev || []).filter(lk => lk && lk.manual && (!lk.csv || hs.has(lk.csv)));
  const byCsv = new Map(kept.filter(lk => lk.csv).map(lk => [lk.csv, lk]));
  const out = (auto || []).map(lk => (lk.csv && byCsv.get(lk.csv)) || lk);
  const autoCsv = new Set((auto || []).map(lk => lk.csv).filter(Boolean));
  for (const lk of kept) if (!lk.csv || !autoCsv.has(lk.csv)) out.push(lk);
  return out;
}

// How the file fits the table: the columns the table accounts for (mapped, lookups, the record
// id) against the ones nothing matched.
export function mappingFit(maps = [], lookups = [], ambiguous = []) {
  const dotted = lookups.filter(l => l.src).length; // "lookup.field" columns live in lookups only
  const total = maps.length + dotted;
  const mapped = maps.filter(m => m.d365 && !m.skip).length;
  const pk = maps.filter(m => m.isPK).length;
  const lk = maps.filter(m => m.isLookup).length + dotted;
  const system = maps.filter(m => m.skip && !m.isPK && !m.isLookup).length;
  const unmatched = maps.filter(m => !m.d365 && !m.skip).map(m => m.csv);
  return { total, matched: mapped + lk + pk, mapped, lookups: lk, pk, system, unmatched, ambiguous: [...ambiguous] };
}

// The table a file was exported from, read from its headers alone (no metadata): the export's
// "(Do Not Modify) <Table>" id column, or a "<table>id" column of GUIDs. null when nothing says
// (an "activityid" column names every activity table at once, for instance).
export function guessTable(headers, rows, entityList) {
  const ents = (entityList || []).filter(e => e && (e.l || e.logical));
  const byDisp = new Map();
  for (const e of ents) { const d = norm(e.d || e.display); if (d) byDisp.set(d, byDisp.has(d) ? null : e); }
  const pick = (e, h) => ({ logical: lc(e.l || e.logical), display: e.d || e.display || lc(e.l || e.logical), reason: `its "${h}" column` });
  for (const h of headers || []) {
    const inner = afterParen(h);
    if (!inner || !columnIsGuid(rows, h)) continue;
    const e = byDisp.get(norm(inner));
    if (e) return pick(e, h);
  }
  const found = new Map();
  for (const h of headers || []) {
    const n = norm(h);
    if (!n.endsWith("id") || !columnIsGuid(rows, h)) continue;
    for (const e of ents) { const l = lc(e.l || e.logical); if (n === l + "id" || (e.pk && n === lc(e.pk))) found.set(l, pick(e, h)); }
  }
  return found.size === 1 ? [...found.values()][0] : null;
}
