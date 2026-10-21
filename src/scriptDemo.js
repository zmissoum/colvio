// Script Console demo org — PURE, deterministic, stateful (one per page load).
//
// The API Tester's demo responder is stateless; a script demo has to show a dry run, a real run,
// then a rollback putting every row back, so this one keeps its rows in memory and answers the
// Web API the way Dataverse does for what scripts use: metadata (EntityDefinitions, relationships,
// attributes), rows (paging, $top, FetchXML), create / update / upsert / delete, single-property
// PUT / DELETE, lookups through @odata.bind and $ref, N:N $ref, WhoAmI, $batch with changesets.
// createDemoOrg() takes the dataset (the runtime tests use their own); scriptDemoOrg() is the
// filmable one.
import { resourceOf, parseSegments } from "./scriptRuntime.js";

export const SCRIPT_DEMO_ORG = "https://demo.crm4.dynamics.com";
const V = "/api/data/v9.2/";

export function createDemoOrg({ orgUrl = SCRIPT_DEMO_ORG, meta = [], rels = {}, attrs = {}, tables = {}, delayMs = 0, userId = null } = {}) {
  const t = {};
  for (const [set, rows] of Object.entries(tables)) t[set] = new Map(rows.map(r => [r[meta.find(m => m.EntitySetName === set).PrimaryIdAttribute], { _t: {}, ...structuredClone(r) }]));
  const links = new Map();
  let nextId = 0, throttleNext = 0;
  const log = [];
  const ent = (set) => meta.find(m => m.EntitySetName === set);
  const setOf = (logical) => meta.find(m => m.LogicalName === logical)?.EntitySetName;
  const relsOf = (set) => rels[ent(set)?.LogicalName] || [];
  const newId = () => `d0000000-0000-4000-8000-${String(++nextId).padStart(12, "0")}`;
  const ok = (status, body, headers = {}) => ({ ok: status < 300, status, statusText: status === 204 ? "No Content" : status < 300 ? "OK" : "Error", headers: body == null ? headers : { "content-type": "application/json; odata.metadata=minimal", ...headers }, body: body == null ? "" : JSON.stringify(body), bodyParsed: body ?? null });
  const err = (status, message, code = "0x80040217") => ok(status, { error: { code, message } });
  const entityUrl = (set, id) => `${orgUrl}${V}${set}(${id})`;

  const out = (set, rec, select) => {
    const o = {};
    for (const [k, v] of Object.entries(rec)) {
      if (k === "_t") continue;
      if (select && !select.includes(k)) continue;
      o[k] = v;
      const m = k.match(/^_(.+)_value$/);
      if (m && v != null) {
        const rel = relsOf(set).find(r => r.ReferencingAttribute === m[1]);
        o[`${k}@OData.Community.Display.V1.FormattedValue`] = nameOf(rec._t[m[1]] || rel?.ReferencedEntity, v);
        o[`${k}@Microsoft.Dynamics.CRM.lookuplogicalname`] = rec._t[m[1]] || rel?.ReferencedEntity;
        if (rel) o[`${k}@Microsoft.Dynamics.CRM.associatednavigationproperty`] = rel.ReferencingEntityNavigationPropertyName;
      }
    }
    return o;
  };
  const nameOf = (logical, id) => {
    const e = meta.find(m => m.LogicalName === logical); const r = e && t[e.EntitySetName]?.get(id);
    return r ? r[e.PrimaryNameAttribute] : id;
  };
  const applyBody = (set, rec, body) => {
    for (const [k, v] of Object.entries(body || {})) {
      if (k.endsWith("@odata.bind")) {
        const nav = k.slice(0, -11);
        const rel = relsOf(set).find(r => r.ReferencingEntityNavigationPropertyName.toLowerCase() === nav.toLowerCase());
        if (!rel) throw Object.assign(new Error(`An undeclared property '${nav}' which only has property annotations in the payload but no property value was found in the payload.`), { status: 400 });
        if (v == null) { rec[`_${rel.ReferencingAttribute}_value`] = null; continue; }
        const mm = String(v).match(/\/?([A-Za-z0-9_]+)\(([0-9a-f-]{36})\)\s*$/i);
        const target = mm && t[mm[1]]?.get(mm[2].toLowerCase());
        if (!target) throw Object.assign(new Error(`${String(v)} Does Not Exist`), { status: 404 });
        rec[`_${rel.ReferencingAttribute}_value`] = mm[2].toLowerCase();
        rec._t[rel.ReferencingAttribute] = ent(mm[1]).LogicalName;
      } else if (!k.includes("@")) rec[k] = v;
    }
  };
  const query = (path) => { const i = path.indexOf("?"); return i < 0 ? "" : path.slice(i + 1); };
  const param = (q, name) => { const m = q.match(new RegExp(`(?:^|&)\\${name}=([^&]*)`)); return m ? decodeURIComponent(m[1]) : null; };

  // FetchXML: <entity name>, <attribute>s, <condition attribute operator value> (eq, ne, null,
  // not-null), <link-entity> ignored; page/count honoured with a morerecords flag.
  const runFetch = (set, xml) => {
    let rows = [...t[set].values()];
    for (const c of xml.matchAll(/<condition\s+([^>]*?)\/?>/g)) {
      const a = (n) => (c[1].match(new RegExp(`${n}=["']([^"']*)["']`)) || [])[1];
      const attr = a("attribute"), op = a("operator"), val = a("value");
      const key = (r) => (Object.prototype.hasOwnProperty.call(r, `_${attr}_value`) ? r[`_${attr}_value`] : r[attr]);
      rows = rows.filter(r => op === "null" ? key(r) == null : op === "not-null" ? key(r) != null : op === "ne" ? String(key(r)) !== val : String(key(r)).toLowerCase() === String(val).toLowerCase());
    }
    const sel = [...xml.matchAll(/<attribute\s+name=["']([^"']+)["']/g)].map(m => m[1]);
    const select = sel.length ? [ent(set).PrimaryIdAttribute, ...sel.flatMap(s => [s, `_${s}_value`])] : null;
    const count = Number((xml.match(/\bcount=["'](\d+)["']/) || [])[1] || 5000), page = Number((xml.match(/\bpage=["'](\d+)["']/) || [])[1] || 1);
    const slice = rows.slice((page - 1) * count, page * count);
    const body = { value: slice.map(r => out(set, r, select)) };
    if (rows.length > page * count) { body["@Microsoft.Dynamics.CRM.morerecords"] = true; body["@Microsoft.Dynamics.CRM.fetchxmlpagingcookie"] = `<cookie pagenumber="${page + 1}" pagingcookie="%253ccookie%2520page%253d%2522${page}%2522%253e%253c%252fcookie%253e" istracking="False" />`; }
    return ok(200, body);
  };

  function handle({ method, path, headers = {}, body }) {
    const m = String(method || "GET").toUpperCase();
    log.push(`${m} ${path}`);
    if (throttleNext > 0) { throttleNext--; return { ok: false, status: 429, statusText: "Too Many Requests", headers: { "retry-after": "1" }, body: "", bodyParsed: null }; }
    const res = resourceOf(path); const q = query(path);
    if (res == null) return err(404, `Resource not found: ${path}`);
    let b = body;
    if (typeof b === "string" && res !== "$batch") { try { b = JSON.parse(b); } catch { return err(400, "Invalid JSON body"); } }
    const h = {}; for (const [k, v] of Object.entries(headers || {})) h[k.toLowerCase()] = v;
    try {
      if (res === "$batch") return batch(h, body);
      if (res === "EntityDefinitions") {
        const f = param(q, "$filter"); const em = f && f.match(/LogicalName eq '([^']+)'/);
        return ok(200, { value: em ? meta.filter(x => x.LogicalName === em[1]) : meta });
      }
      let mm = res.match(/^EntityDefinitions\(LogicalName='([^']+)'\)$/);
      if (mm) { const e = meta.find(x => x.LogicalName === mm[1]); return e ? ok(200, e) : err(404, `Could not find entity ${mm[1]}`); }
      mm = res.match(/^EntityDefinitions\(LogicalName='([^']+)'\)\/ManyToOneRelationships$/);
      if (mm) return ok(200, { value: rels[mm[1]] || [] });
      mm = res.match(/^EntityDefinitions\(LogicalName='([^']+)'\)\/Attributes$/);
      if (mm) return attrs[mm[1]] ? ok(200, { value: attrs[mm[1]] }) : err(404, `Could not find entity ${mm[1]}`);
      if (/^WhoAmI(\(\))?$/.test(res)) return ok(200, { UserId: userId, BusinessUnitId: "d0000000-0000-4000-8000-0000000000b1", OrganizationId: "d0000000-0000-4000-8000-0000000000c1" });
      const segs = parseSegments(res);
      const set = segs[0].name, tbl = t[set];
      if (!tbl) return m === "POST" && segs.length === 1 ? err(404, `Resource not found for the segment '${set}'.`, "0x80060888") : err(404, `Resource not found for the segment '${set}'.`, "0x80060888");
      const e = ent(set);
      if (segs.length === 1 && segs[0].key == null) {
        if (m === "GET") {
          const fx = param(q, "fetchXml"); if (fx) return runFetch(set, fx);
          let rows = [...tbl.values()];
          const f = param(q, "$filter");
          if (f) for (const c of f.split(/\s+and\s+/i)) {
            const cm = c.trim().match(/^(\w+)\s+(eq|ne)\s+(null|'[^']*'|[\w-]+)$/i); if (!cm) return err(400, `Demo: unsupported $filter '${c}'`, "0x80060888");
            const v = cm[3] === "null" ? null : cm[3].replace(/^'|'$/g, "");
            rows = rows.filter(r => { const x = r[cm[1]] ?? null; return cm[2].toLowerCase() === "eq" ? (v === null ? x === null : String(x).toLowerCase() === v.toLowerCase()) : (v === null ? x !== null : String(x).toLowerCase() !== v.toLowerCase()); });
          }
          const sel = param(q, "$select"); const select = sel ? sel.split(",") : null;
          if (select) for (const s of select) if (!Object.keys(rows[0] || {}).includes(s) && !(attrs[e.LogicalName] || []).some(a => a.LogicalName === s || `_${a.LogicalName}_value` === s)) return err(400, `Could not find a property named '${s}' on type 'Microsoft.Dynamics.CRM.${e.LogicalName}'.`, "0x80060888");
          const top = param(q, "$top"); if (top) rows = rows.slice(0, Number(top));
          const maxp = Number((String(h.prefer || "").match(/maxpagesize=(\d+)/) || [])[1] || 5000);
          const skip = Number(param(q, "$skiptoken") || 0);
          const page = rows.slice(skip, skip + maxp).map(r => out(set, r, select ? [e.PrimaryIdAttribute, ...select] : null));
          const bodyOut = { "@odata.context": `${orgUrl}${V}$metadata#${set}`, value: page };
          if (rows.length > skip + maxp) bodyOut["@odata.nextLink"] = `${orgUrl}${V}${set}?${q.replace(/&?\$skiptoken=\d+/, "")}${q && !q.match(/^\$skiptoken/) ? "&" : ""}$skiptoken=${skip + maxp}`;
          return ok(200, bodyOut);
        }
        if (m === "POST") {
          const id = String(b?.[e.PrimaryIdAttribute] || newId()).toLowerCase();
          if (tbl.has(id)) return err(412, "A record with matching key values already exists.", "0x80040237");
          const rec = { [e.PrimaryIdAttribute]: id, _t: {} }; applyBody(set, rec, b); tbl.set(id, rec);
          return ok(204, null, { "odata-entityid": entityUrl(set, id) });
        }
        return err(405, `The requested resource does not support http method '${m}'.`, "0x80060888");
      }
      const key = String(segs[0].key).toLowerCase(); const rec = tbl.get(key);
      if (segs.length === 1) {
        if (m === "GET") return rec ? ok(200, out(set, rec, (param(q, "$select") || "").split(",").filter(Boolean).length ? [e.PrimaryIdAttribute, ...param(q, "$select").split(",")] : null)) : err(404, `${e.LogicalName} With Id = ${key} Does Not Exist`);
        if (m === "PATCH") {
          if (!rec) {
            if (h["if-match"] === "*") return err(404, `${e.LogicalName} With Id = ${key} Does Not Exist`);
            const nr = { [e.PrimaryIdAttribute]: key, _t: {} }; applyBody(set, nr, b); tbl.set(key, nr);
            return ok(204, null, { "odata-entityid": entityUrl(set, key) });
          }
          applyBody(set, rec, b); return ok(204, null, { "odata-entityid": entityUrl(set, key) });
        }
        if (m === "DELETE") { if (!rec) return err(404, `${e.LogicalName} With Id = ${key} Does Not Exist`); tbl.delete(key); return ok(204, null); }
        return err(405, `The requested resource does not support http method '${m}'.`, "0x80060888");
      }
      if (!rec) return err(404, `${e.LogicalName} With Id = ${key} Does Not Exist`);
      const s1 = segs[1];
      if (segs.length === 2 && s1.key == null && s1.name.startsWith("Microsoft.Dynamics.CRM.")) return err(404, `Demo: action ${s1.name.slice(23)} isn't available in demo mode`, "0x80060888");
      if (segs[segs.length - 1].name === "$ref" && segs.length === 3) {
        const nav = s1.name; const rel = relsOf(set).find(r => r.ReferencingEntityNavigationPropertyName.toLowerCase() === nav.toLowerCase());
        if (rel) {
          const attr = rel.ReferencingAttribute;
          if (m === "GET") { const v = rec[`_${attr}_value`]; return v ? ok(200, { "@odata.id": entityUrl(setOf(rec._t[attr] || rel.ReferencedEntity), v) }) : ok(204, null); }
          if (m === "PUT") { applyBody(set, rec, { [`${nav}@odata.bind`]: b["@odata.id"] }); return ok(204, null); }
          if (m === "DELETE") { rec[`_${attr}_value`] = null; return ok(204, null); }
        }
        const lk = `${set}(${key})/${nav}`; const s = links.get(lk) || new Set(); links.set(lk, s);
        if (m === "GET") return ok(200, { value: [...s].map(u => ({ "@odata.id": u })) });
        if (m === "POST") { s.add(String(b["@odata.id"]).toLowerCase()); return ok(204, null); }
        if (m === "DELETE") {
          const idq = param(q, "$id");
          const target = idq ? idq.toLowerCase() : [...s].find(u => u.includes(`(${String(s1.key).toLowerCase()})`));
          if (!target || !s.has(target)) return err(404, "The relationship doesn't exist");
          s.delete(target); return ok(204, null);
        }
      }
      if (segs.length === 2 && s1.key == null) {
        const prop = s1.name;
        if (m === "GET") return rec[prop] == null ? ok(204, null) : ok(200, { value: rec[prop] });
        if (m === "PUT") { rec[prop] = b?.value ?? null; return ok(204, null); }
        if (m === "DELETE") { rec[prop] = null; return ok(204, null); }
      }
      if (segs.length === 2 && s1.key != null && m === "GET") {
        const s = links.get(`${set}(${key})/${s1.name}`) || new Set();
        const url = [...s].find(u => u.includes(`(${String(s1.key).toLowerCase()})`));
        if (!url) return err(404, "Does Not Exist");
        const tset = (url.match(/\/v9\.\d\/([A-Za-z0-9_]+)\(/) || [])[1];
        return ok(200, { "@odata.context": `${orgUrl}${V}$metadata#${tset}/$entity`, ...out(tset, t[tset]?.get(String(s1.key).toLowerCase()) || {}) });
      }
      return err(400, `Demo: ${m} ${res} isn't supported in demo mode`, "0x80060888");
    } catch (x) {
      return err(x.status || 400, x.message);
    }
  }

  function batch(h, body) {
    const ct = h["content-type"] || ""; const bm = ct.match(/boundary=([^;\s]+)/);
    if (!bm) return err(400, "Missing batch boundary");
    const parts = String(body).split(`--${bm[1]}`).slice(1).filter(p => !p.startsWith("--"));
    const parseReq = (piece) => {
      const lines = piece.split(/\r?\n/);
      const i = lines.findIndex(l => /^(GET|POST|PATCH|PUT|DELETE) /.test(l));
      const [, mm, url] = lines[i].match(/^(\S+) (\S+) HTTP/);
      const hs = {}; let j = i + 1;
      for (; j < lines.length && lines[j] !== ""; j++) { const k = lines[j].indexOf(":"); hs[lines[j].slice(0, k)] = lines[j].slice(k + 1).trim(); }
      const txt = lines.slice(j + 1).join("\n").trim();
      return { method: mm, path: url, headers: hs, body: txt ? JSON.parse(txt) : undefined };
    };
    const fmt = (r) => `Content-Type: application/http\r\nContent-Transfer-Encoding: binary\r\n\r\nHTTP/1.1 ${r.status} ${r.statusText}\r\n${Object.entries(r.headers).map(([k, v]) => `${k}: ${v}\r\n`).join("")}\r\n${r.body || ""}`;
    const outParts = [];
    for (const p of parts) {
      const csm = p.match(/boundary=(changeset_[^\s;]+)/);
      if (csm) {
        const pieces = p.split(`--${csm[1]}`).slice(1).filter(x => !x.startsWith("--"));
        // all or nothing: run on a snapshot, keep it only when every write succeeded
        const snap = Object.fromEntries(Object.entries(t).map(([k, v]) => [k, new Map([...v].map(([id, r]) => [id, structuredClone(r)]))]));
        const resps = [];
        for (const piece of pieces) { const r = handle(parseReq(piece)); resps.push(r); if (!r.ok) break; }
        const bad = resps.find(r => !r.ok);
        if (bad) { for (const k of Object.keys(t)) t[k] = snap[k]; outParts.push(fmt(bad)); break; }
        outParts.push(`Content-Type: multipart/mixed; boundary=changesetresponse_demo\r\n\r\n${resps.map(r => `--changesetresponse_demo\r\n${fmt(r)}`).join("\r\n")}\r\n--changesetresponse_demo--`);
      } else {
        const r = handle(parseReq(p)); outParts.push(fmt(r));
        if (!r.ok && !/continue-on-error/.test(h.prefer || "")) break;
      }
    }
    const txt = outParts.map(r => `--batchresponse_demo\r\n${r}`).join("\r\n") + "\r\n--batchresponse_demo--\r\n";
    return { ok: true, status: 200, statusText: "OK", headers: { "content-type": "multipart/mixed; boundary=batchresponse_demo" }, body: txt, bodyParsed: null };
  }

  return {
    tables: t, links, log,
    throttle: (n) => { throttleNext = n; },
    send: async (r) => {
      if (delayMs) await new Promise(res => setTimeout(res, delayMs));
      return handle(r);
    },
  };
}

// ── The filmable dataset: sales organizations, their sales codes, users missing their code ──
const id = (n) => `d0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
export const DEMO_META = [
  { LogicalName: "systemuser", EntitySetName: "systemusers", PrimaryIdAttribute: "systemuserid", PrimaryNameAttribute: "fullname" },
  { LogicalName: "new_salesorganization", EntitySetName: "new_salesorganizations", PrimaryIdAttribute: "new_salesorganizationid", PrimaryNameAttribute: "new_name" },
  { LogicalName: "new_salescode", EntitySetName: "new_salescodes", PrimaryIdAttribute: "new_salescodeid", PrimaryNameAttribute: "new_name" },
  { LogicalName: "account", EntitySetName: "accounts", PrimaryIdAttribute: "accountid", PrimaryNameAttribute: "name" },
  { LogicalName: "contact", EntitySetName: "contacts", PrimaryIdAttribute: "contactid", PrimaryNameAttribute: "fullname" },
];
const DEMO_RELS = {
  systemuser: [
    { ReferencingAttribute: "new_salesorganizationid", ReferencingEntityNavigationPropertyName: "new_SalesOrganizationId", ReferencedEntity: "new_salesorganization" },
    { ReferencingAttribute: "new_salescodeid", ReferencingEntityNavigationPropertyName: "new_SalesCodeId", ReferencedEntity: "new_salescode" },
  ],
  new_salescode: [{ ReferencingAttribute: "new_salesorganizationid", ReferencingEntityNavigationPropertyName: "new_SalesOrganizationId", ReferencedEntity: "new_salesorganization" }],
  account: [{ ReferencingAttribute: "parentaccountid", ReferencingEntityNavigationPropertyName: "parentaccountid", ReferencedEntity: "account" }],
  contact: [{ ReferencingAttribute: "parentcustomerid", ReferencingEntityNavigationPropertyName: "parentcustomerid_account", ReferencedEntity: "account" }],
  new_salesorganization: [],
};
const A = (n, t, c = true, of) => ({ LogicalName: n, AttributeType: t, IsValidForCreate: c, ...(of ? { AttributeOf: of } : {}) });
const DEMO_ATTRS = {
  account: [A("accountid", "Uniqueidentifier"), A("name", "String"), A("accountnumber", "String"), A("telephone1", "String"), A("address1_city", "String"), A("revenue", "Money"), A("parentaccountid", "Lookup"), A("statecode", "State", false), A("statuscode", "Status")],
  contact: [A("contactid", "Uniqueidentifier"), A("fullname", "String", false), A("firstname", "String"), A("lastname", "String"), A("emailaddress1", "String"), A("parentcustomerid", "Customer"), A("statecode", "State", false), A("statuscode", "Status")],
  systemuser: [A("systemuserid", "Uniqueidentifier"), A("fullname", "String", false), A("internalemailaddress", "String"), A("new_salesorganizationid", "Lookup"), A("new_salescodeid", "Lookup")],
  new_salesorganization: [A("new_salesorganizationid", "Uniqueidentifier"), A("new_name", "String")],
  new_salescode: [A("new_salescodeid", "Uniqueidentifier"), A("new_name", "String"), A("new_salesorganizationid", "Lookup")],
};
const ORGS = [["SO-FR", "France"], ["SO-DE", "Germany"], ["SO-ES", "Spain"], ["SO-IT", "Italy"]];
const USERS = ["Jean Dupont", "Marie Martin", "Lukas Becker", "Sofía García", "Giulia Rossi", "Paul Bernard", "Anna Schmidt", "Carlos López", "Chiara Bianchi", "Luc Moreau", "Emma Weber", "Integration Service"];
export function scriptDemoOrg(opts = {}) {
  const so = ORGS.map(([code, name], i) => ({ new_salesorganizationid: id(100 + i), new_name: `${code} — ${name}` }));
  const codes = ORGS.map(([code], i) => ({ new_salescodeid: id(200 + i), new_name: code.replace("SO-", "SC-"), _new_salesorganizationid_value: id(100 + i) }));
  const users = USERS.map((n, i) => ({
    systemuserid: id(300 + i), fullname: n, internalemailaddress: `${n.toLowerCase().normalize("NFD").replace(/[^a-z ]/g, "").replace(/ /g, ".")}@contoso.com`,
    _new_salesorganizationid_value: i === USERS.length - 1 ? null : id(100 + (i % ORGS.length)),
    _new_salescodeid_value: i % 4 === 1 ? id(200 + (i % ORGS.length)) : null,
  }));
  const accounts = [["Contoso Ltd", "Paris"], ["Fabrikam GmbH", "Berlin"], ["Adventure Works", "Madrid"], ["Northwind SpA", "Milano"], ["Tailspin Toys", "Lyon"]]
    .map(([name, city], i) => ({ accountid: id(400 + i), name, accountnumber: `ACC-${1001 + i}`, telephone1: null, address1_city: city, revenue: 1200000 + i * 350000, _parentaccountid_value: null, statecode: 0, statuscode: 1 }));
  const contacts = [["Léa", "Durand", 0], ["Max", "Müller", 1], ["Ana", "Ruiz", 2]].map(([f, l, a], i) => ({ contactid: id(500 + i), firstname: f, lastname: l, fullname: `${f} ${l}`, emailaddress1: `${f.toLowerCase()}@example.com`, _parentcustomerid_value: id(400 + a), statecode: 0, statuscode: 1 }));
  return createDemoOrg({ meta: DEMO_META, rels: DEMO_RELS, attrs: DEMO_ATTRS, userId: id(300), delayMs: 12, ...opts, tables: { new_salesorganizations: so, new_salescodes: codes, systemusers: users, accounts, contacts } });
}
