// API Tester demo responses — PURE, unit-tested.
//
// Demo mode has no org behind it: demoApiResponse answers a request the way Dataverse would, in
// the exact shape the live `customRequest` action hands the UI (content.js) — { ok, status,
// statusText, headers, body, bodyParsed, elapsed, url } — with header names lower-cased and sorted
// as fetch's Headers iterates them, and the body as compact JSON text. Answers come from the demo
// accounts (ROWS) and are deterministic (no clock, no Math.random): every demo render matches.
// Like the live action, a disallowed method or a foreign host THROWS instead of answering.
import { ROWS, FLDS, ENTS } from "./shared.jsx";

export const DEMO_ORG = "https://demo.crm4.dynamics.com"; // = the orgUrl app.jsx sets in demo mode
const HOST = new URL(DEMO_ORG).hostname;
const ALLOWED = new Set(["GET", "POST", "PATCH", "PUT", "DELETE", "HEAD", "OPTIONS"]);
const FUNCTIONS = new Set(["WhoAmI", "RetrieveVersion", "RetrieveCurrentOrganization"]);
const FMT = "@OData.Community.Display.V1.FormattedValue";
const NAV = "@Microsoft.Dynamics.CRM.associatednavigationproperty";
const LOGICAL = "@Microsoft.Dynamics.CRM.lookuplogicalname";
const JSON_CT = "application/json; odata.metadata=minimal; odata.streaming=true; IEEE754Compatible=false; charset=utf-8";
const STATUS_TEXT = { 200: "OK", 201: "Created", 204: "No Content", 400: "Bad Request", 404: "Not Found", 405: "Method Not Allowed", 412: "Precondition Failed" };
const BASE_MS = { GET: 38, HEAD: 30, OPTIONS: 22, POST: 142, PATCH: 118, PUT: 96, DELETE: 104 };
// Dataverse error codes as the platform returns them.
const E_ODATA = "0x80060888", E_MISSING = "0x80040217", E_PAYLOAD = "0x80048d19", E_DUPKEY = "0x80040237";

export const DEMO_IDS = {
  user: "3f6c8b21-4d7a-ef11-a73d-000d3a4b8c21",
  businessUnit: "c41a7e02-1b5f-ef11-a73d-000d3a4b1f09",
  organization: "0e9d4c77-1b5f-ef11-a73d-000d3a4b1f09",
  environment: "5d2f1a8e-63c4-4b7e-9a1d-2f8c7b6e4a90",
  tenant: "9b1c4e7a-2d3f-4a5b-8c6d-7e8f9a0b1c2d",
};

const hash = (s, seed = 0x811c9dc5) => {
  let h = seed;
  for (const ch of String(s)) h = Math.imul(h ^ ch.charCodeAt(0), 0x01000193) >>> 0;
  return h;
};
const guid = (seed) => {
  const hex = [0x811c9dc5, 0x9e3779b9, 0x85ebca6b, 0xc2b2ae35].map(s => hash(seed, s).toString(16).padStart(8, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
};
const isGuid = (v) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(v));
const etag = (id) => `W/"${4100000 + (hash(id) % 900000)}"`;
const own = (o, k) => (Object.hasOwn(o, k) ? o[k] : null);
const decode = (s) => { try { return decodeURIComponent(s); } catch { return s; } };

class DataverseError {
  constructor(status, code, message) { this.status = status; this.code = code; this.message = message; }
}
const fail = (status, code, message) => { throw new DataverseError(status, code, message); };
const notAllowed = (m) => fail(405, E_ODATA, `The requested resource does not support http method '${m}'.`);
const noSegment = (s) => fail(404, E_ODATA, `Resource not found for the segment '${s}'.`);
const noProperty = (set, p) => fail(400, E_ODATA, `Could not find a property named '${p}' on type 'Microsoft.Dynamics.CRM.${set.l}'.`);

// ── Demo accounts as the Web API sends them ──
// ROWS hold display labels ("Manufacturing", "Jean Dupont"); the Web API sends raw values (option
// codes, lookup GUIDs) and the labels only as formatted-value annotations, on request.
const FLD = Object.fromEntries(FLDS.map(f => [f.l, f]));
const ACCOUNT_PROPS = new Set([...FLDS.map(f => f.l), "statuscode"]);
const fmtDate = (iso) => {
  const d = new Date(iso), h = d.getUTCHours();
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}/${d.getUTCFullYear()} ${h % 12 || 12}:${String(d.getUTCMinutes()).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
};
const fmtValue = (f, v) => {
  if (v === "" || v == null) return null;
  if (f?.t === "Money") return "€" + v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (f?.t === "Integer") return v.toLocaleString("en-US");
  if (f?.t === "DateTime") return fmtDate(v);
  return null;
};
const ACCOUNTS = ROWS.map(r => {
  const raw = {}, fmt = {};
  for (const [k, v] of Object.entries(r)) {
    const f = own(FLD, k);
    if (f?.opts) { raw[k] = f.opts.find(o => o.l === v)?.v ?? null; fmt[k] = v; }
    else if (f?.t === "Lookup") { raw[k] = v ? guid(`${f.target}:${v}`) : null; if (v) fmt[k] = v; }
    else { raw[k] = v === "" ? null : v; const s = fmtValue(f, v); if (s != null) fmt[k] = s; }
  }
  raw.statuscode = raw.statecode === 1 ? 2 : 1;
  fmt.statuscode = raw.statecode === 1 ? "Inactive" : "Active";
  return { raw, fmt };
});

const idName = (set) => `${set.l}id`;
const propOk = (set) => set.l === "account" ? (p) => ACCOUNT_PROPS.has(p) : () => true;
const rowsOf = (set) => set.l === "account" ? ACCOUNTS : [];

function selectCols(set, sel) {
  if (sel == null) return null;
  const cols = sel.split(",").map(s => s.trim()).filter(Boolean);
  const ok = propOk(set);
  for (const c of cols) if (!ok(c)) noProperty(set, c);
  return cols;
}

// Annotations precede their property, as in Dataverse's own payloads; the primary key is always sent.
function shapeRecord(set, row, cols, pref) {
  const o = { "@odata.etag": etag(row.raw[idName(set)]) };
  for (const c of cols || Object.keys(row.raw)) {
    if (pref.fmt && row.fmt[c] != null) o[c + FMT] = row.fmt[c];
    if (pref.lookup && own(FLD, c)?.t === "Lookup" && row.raw[c]) { o[c + NAV] = c.slice(1, -"_value".length); o[c + LOGICAL] = FLD[c].target; }
    o[c] = row.raw[c] ?? null;
  }
  if (!(idName(set) in o)) o[idName(set)] = row.raw[idName(set)];
  return o;
}

function readPrefer(hdr) {
  const v = hdr.prefer || "";
  const m = /odata\.include-annotations\s*=\s*(?:"([^"]*)"|([^,\s]*))/i.exec(v);
  const inc = m ? (m[1] ?? m[2] ?? "") : "";
  return {
    representation: /return\s*=\s*representation/i.test(v),
    include: m ? `odata.include-annotations="${inc}"` : "",
    fmt: inc === "*" || /FormattedValue|^OData\.\*|^OData\.Community/i.test(inc),
    lookup: inc === "*" || /Microsoft\.Dynamics\.CRM/i.test(inc),
  };
}

// ── $filter: comparisons (eq ne gt ge lt le), contains / startswith / endswith, not, and / or,
// parentheses. Anything else is answered as the syntax error Dataverse would return.
function tokenize(src, bad) {
  const out = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === " ") { i++; continue; }
    if ("(),".includes(c)) { out.push({ t: c, pos: i }); i++; continue; }
    if (c === "'") {
      let j = i + 1, v = "";
      for (;;) {
        if (j >= src.length) bad(i);
        if (src[j] === "'") { if (src[j + 1] === "'") { v += "'"; j += 2; continue; } break; }
        v += src[j++];
      }
      out.push({ t: "str", v, pos: i }); i = j + 1; continue;
    }
    const w = /^[^\s(),']+/.exec(src.slice(i))[0];
    out.push({ t: "word", v: w, pos: i }); i += w.length;
  }
  return out;
}
const lc = (v) => typeof v === "string" ? v.toLowerCase() : v;
const cmp = (a, b) => {
  if (a == null || b == null) return a == null ? (b == null ? 0 : -1) : 1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  const x = String(a).toLowerCase(), y = String(b).toLowerCase();
  return x < y ? -1 : x > y ? 1 : 0;
};
const OPS = {
  eq: (a, b) => lc(a) === lc(b), ne: (a, b) => lc(a) !== lc(b),
  gt: (a, b) => a != null && b != null && cmp(a, b) > 0, ge: (a, b) => a != null && b != null && cmp(a, b) >= 0,
  lt: (a, b) => a != null && b != null && cmp(a, b) < 0, le: (a, b) => a != null && b != null && cmp(a, b) <= 0,
};
const STR_FN = { contains: (s, v) => s.includes(v), startswith: (s, v) => s.startsWith(v), endswith: (s, v) => s.endsWith(v) };

export function parseFilter(src, set) {
  const bad = (pos) => fail(400, E_ODATA, `Syntax error at position ${pos} in '${src}'.`);
  const tk = tokenize(src, bad);
  const ok = propOk(set);
  let i = 0;
  const here = () => tk[i]?.pos ?? src.length;
  const word = () => (tk[i]?.t === "word" ? tk[i].v.toLowerCase() : "");
  const expect = (t) => { if (tk[i]?.t !== t) bad(here()); return tk[i++]; };
  const prop = () => { const p = expect("word").v; if (!ok(p)) noProperty(set, p); return p; };
  const literal = () => {
    const t = tk[i];
    if (t?.t === "str") { i++; return t.v; }
    if (t?.t !== "word") bad(here());
    const v = t.v;
    let out;
    if (v === "null") out = null;
    else if (v === "true" || v === "false") out = v === "true";
    else if (/^-?\d+(\.\d+)?$/.test(v)) out = Number(v);
    else if (isGuid(v) || /^\d{4}-\d{2}-\d{2}(T[\d:.]+Z?)?$/.test(v)) out = v;
    else bad(here());
    i++;
    return out;
  };
  const primary = () => {
    if (tk[i]?.t === "(") { i++; const e = or(); expect(")"); return e; }
    const fn = own(STR_FN, word());
    if (fn && tk[i + 1]?.t === "(") {
      i += 2;
      const p = prop(); expect(",");
      const v = String(literal() ?? "").toLowerCase(); expect(")");
      return (r) => fn(String(r[p] ?? "").toLowerCase(), v);
    }
    const p = prop();
    const op = own(OPS, word());
    if (!op) bad(here());
    i++;
    const v = literal();
    return (r) => op(r[p] ?? null, v);
  };
  const unary = () => { if (word() === "not") { i++; const a = unary(); return (r) => !a(r); } return primary(); };
  const and = () => { let l = unary(); while (word() === "and") { i++; const a = l, b = unary(); l = (r) => a(r) && b(r); } return l; };
  const or = () => { let l = and(); while (word() === "or") { i++; const a = l, b = and(); l = (r) => a(r) || b(r); } return l; };
  const test = or();
  if (i < tk.length) bad(here());
  return test;
}

function orderRows(set, rows, ob) {
  const ok = propOk(set);
  const keys = ob.split(",").map(s => {
    const [p, dir = "asc", extra] = s.trim().split(/\s+/);
    if (!ok(p)) noProperty(set, p);
    if (extra || !/^(asc|desc)$/i.test(dir)) fail(400, E_ODATA, `Syntax error at position ${ob.indexOf(dir)} in '${ob}'.`);
    return [p, dir.toLowerCase() === "desc" ? -1 : 1];
  });
  return [...rows].sort((a, b) => { for (const [p, d] of keys) { const c = cmp(a.raw[p], b.raw[p]); if (c) return c * d; } return 0; });
}

// "accounts(…)/name" → { name, key, prop }. Quotes are honoured so a key value may hold ")".
function parseSegment(s) {
  const m = /^[A-Za-z_$][\w.$]*/.exec(s);
  if (!m) return { name: s.split(/[/(]/)[0] || s, key: null, prop: null };
  let i = m[0].length, key = null;
  if (s[i] === "(") {
    let q = false, j = i + 1;
    for (; j < s.length; j++) { if (s[j] === "'") q = !q; else if (s[j] === ")" && !q) break; }
    key = s.slice(i + 1, j); i = j + 1;
  }
  const rest = s.slice(i);
  if (rest && !rest.startsWith("/")) noSegment(s);
  return { name: m[0], key, prop: rest.slice(1) || null };
}

// Record by GUID (bare or `accountid=`) or by the demo alternate key (accountnumber).
function resolveKey(set, key) {
  const rows = rowsOf(set), idCol = idName(set);
  const k = key.trim();
  const pairs = k.split(",").map(p => /^\s*(\w+)\s*=\s*(?:'((?:[^']|'')*)'|([^,]+?))\s*$/.exec(p));
  let id = null;
  if (isGuid(k)) id = k;
  else if (pairs.length === 1 && pairs[0] && pairs[0][1] === idCol && isGuid(pairs[0][3])) id = pairs[0][3];
  if (id) {
    id = id.toLowerCase();
    return { id, row: rows.find(r => r.raw[idCol] === id) || null, alt: false };
  }
  if (!k || pairs.some(p => !p)) fail(400, E_ODATA, "Bad Request - Error in query syntax.");
  if (set.l !== "account" || pairs.length !== 1 || pairs[0][1] !== "accountnumber") {
    fail(400, E_ODATA, `The specified key attributes are not a defined key for the ${set.l} entity`);
  }
  const v = (pairs[0][2] ?? pairs[0][3]).replace(/''/g, "'").toLowerCase();
  const row = rows.find(r => String(r.raw.accountnumber ?? "").toLowerCase() === v) || null;
  return { id: row ? row.raw[idCol] : guid(`${set.l}:${k}`), row, alt: true };
}
const missing = (set, ref) => fail(404, E_MISSING, ref.alt
  ? `A record with the specified key values does not exist in ${set.l} entity`
  : `${set.l} With Id = ${ref.id} Does Not Exist`);

const payloadHelp = (set) => `Error identified in Payload provided by the user for Entity :'${set.p}', For more information on this error please follow this help link https://go.microsoft.com/fwlink/?linkid=2195293`;
const parseJson = (body) => { try { return JSON.parse(body ?? ""); } catch { return null; } };
function readBody(set, body) {
  const data = parseJson(body);
  if (!data || typeof data !== "object" || Array.isArray(data)) fail(400, E_PAYLOAD, payloadHelp(set));
  if (set.l === "account") {
    for (const k of Object.keys(data)) {
      if (k.includes("@") || (ACCOUNT_PROPS.has(k) && FLD[k].t !== "Lookup")) continue;
      fail(400, E_PAYLOAD, `${payloadHelp(set)}  ---->  InnerException : Microsoft.OData.ODataException: The property '${k}' does not exist on type 'Microsoft.Dynamics.CRM.${set.l}'. Make sure to only use property names that are defined by the type or mark the type as open type.`);
    }
  }
  return data;
}
const plain = (data) => Object.fromEntries(Object.entries(data).filter(([k]) => !k.includes("@")));

function functionCall(name, meta) {
  if (name === "WhoAmI") {
    return { "@odata.context": `${meta}#Microsoft.Dynamics.CRM.WhoAmIResponse`, BusinessUnitId: DEMO_IDS.businessUnit, UserId: DEMO_IDS.user, OrganizationId: DEMO_IDS.organization };
  }
  if (name === "RetrieveVersion") return { "@odata.context": `${meta}#Microsoft.Dynamics.CRM.RetrieveVersionResponse`, Version: "9.2.25093.00168" };
  const api = DEMO_ORG.replace("://demo.", "://demo.api.");
  return {
    "@odata.context": `${meta}#Microsoft.Dynamics.CRM.RetrieveCurrentOrganizationResponse`,
    Detail: {
      OrganizationId: DEMO_IDS.organization, FriendlyName: "Demo", OrganizationVersion: "9.2.25093.00168",
      EnvironmentId: DEMO_IDS.environment, DatacenterId: "4a8c2f71-0d3e-4b5a-9c6f-1e2d3c4b5a69", Geo: "EMEA",
      TenantId: DEMO_IDS.tenant, UrlName: "demo", UniqueName: "unq0e9d4c771b5fef11a73d000d3a4b1",
      Endpoints: {
        Count: 3, IsReadOnly: false,
        Keys: ["WebApplication", "OrganizationService", "OrganizationDataService"],
        Values: [`${DEMO_ORG}/`, `${api}/XRMServices/2011/Organization.svc`, `${api}/XRMServices/2011/OrganizationData.svc`],
      },
      State: "Enabled", OrganizationType: "CustomerTest", SchemaType: "Standard",
    },
  };
}

function route(m, u, hdr, body) {
  const api = /^\/api\/data\/(v\d+\.\d+)\/(.*)$/.exec(u.pathname);
  if (!api) noSegment(decode(u.pathname.slice(1)));
  const ver = api[1], meta = `${DEMO_ORG}/api/data/${ver}/$metadata`;
  const seg = parseSegment(decode(api[2]));
  const q = u.searchParams, pref = readPrefer(hdr);
  if (m === "OPTIONS") return { status: 200, headers: { allow: "GET, HEAD, POST, PATCH, PUT, DELETE, OPTIONS" } };

  if (FUNCTIONS.has(seg.name)) {
    if (seg.prop) noSegment(seg.prop);
    if (m !== "GET" && m !== "HEAD") notAllowed(m);
    return { status: 200, json: functionCall(seg.name, meta) };
  }
  const set = ENTS.find(e => e.p === seg.name);
  if (!set) noSegment(seg.name);
  const entityUrl = (id) => `${DEMO_ORG}/api/data/${ver}/${set.p}(${id})`;
  const applied = (...p) => { const v = [pref.include, ...p].filter(Boolean).join(","); return v ? { "preference-applied": v } : {}; };
  const context = (cols, tail = "") => `${meta}#${set.p}${cols ? `(${cols.join(",")})` : ""}${tail}`;

  if (seg.key == null) {
    if (m === "GET" || m === "HEAD") {
      if (q.has("$skip")) fail(400, E_ODATA, "The query parameter $skip is not supported");
      const cols = selectCols(set, q.get("$select"));
      let list = rowsOf(set);
      if (q.get("$filter")) { const test = parseFilter(q.get("$filter"), set); list = list.filter(r => test(r.raw)); }
      if (q.get("$orderby")) list = orderRows(set, list, q.get("$orderby"));
      const total = list.length;
      if (q.has("$top")) {
        const top = q.get("$top");
        if (!/^\d+$/.test(top)) fail(400, E_ODATA, `Invalid value '${top}' for $top query option found. The $top query option requires a non-negative integer value.`);
        list = list.slice(0, Number(top));
      }
      const json = { "@odata.context": context(cols) };
      if (q.get("$count") === "true") json["@odata.count"] = total;
      json.value = list.map(r => shapeRecord(set, r, cols, pref));
      return { status: 200, json, rows: list.length, headers: applied() };
    }
    if (m !== "POST") notAllowed(m);
    const data = readBody(set, body);
    const given = data[idName(set)];
    const id = isGuid(given) ? String(given).toLowerCase() : guid(`${set.p}:${hdr.prefer || ""}:${body}`);
    if (!pref.representation) return { status: 204, headers: { "odata-entityid": entityUrl(id) } };
    const cols = selectCols(set, q.get("$select"));
    const rec = { statecode: 0, statuscode: 1, ...plain(data), [idName(set)]: id };
    const json = { "@odata.context": context(cols, "/$entity"), "@odata.etag": etag(id) };
    for (const c of cols || Object.keys(rec)) json[c] = rec[c] ?? null;
    json[idName(set)] = id;
    return { status: 201, json, headers: { "odata-entityid": entityUrl(id), ...applied("return=representation") } };
  }

  const ref = resolveKey(set, seg.key);
  if (seg.prop) {
    if (!propOk(set)(seg.prop) || seg.prop === idName(set)) noSegment(seg.prop);
    if (!ref.row) missing(set, ref);
    if (m === "GET" || m === "HEAD") {
      const v = ref.row.raw[seg.prop];
      if (v == null) return { status: 204 };
      return { status: 200, json: { "@odata.context": `${meta}#${set.p}(${ref.id})/${seg.prop}`, value: v } };
    }
    if (m === "PUT") {
      const data = parseJson(body);
      if (!data || typeof data !== "object" || !("value" in data)) fail(400, E_PAYLOAD, payloadHelp(set));
      return { status: 204 };
    }
    if (m === "DELETE") return { status: 204 };
    notAllowed(m);
  }
  if (m === "GET" || m === "HEAD") {
    if (!ref.row) missing(set, ref);
    const cols = selectCols(set, q.get("$select"));
    const json = { "@odata.context": context(cols, "/$entity"), ...shapeRecord(set, ref.row, cols, pref) };
    return { status: 200, json, rows: 1, headers: { etag: json["@odata.etag"], ...applied() } };
  }
  if (m === "DELETE") {
    if (!ref.row) missing(set, ref);
    return { status: 204 };
  }
  if (m !== "PATCH") notAllowed(m);
  // PATCH is an upsert: a missing record is CREATED unless If-Match: * forbids it, and
  // If-None-Match: * makes it create-only.
  const data = readBody(set, body);
  if (!ref.row && hdr["if-match"] === "*") missing(set, ref);
  if (ref.row && hdr["if-none-match"] === "*") fail(412, E_DUPKEY, "A record with matching key values already exists.");
  if (!pref.representation) return { status: 204, headers: { "odata-entityid": entityUrl(ref.id) } };
  const { "@odata.etag": _old, ...base } = ref.row ? shapeRecord(set, ref.row, null, {}) : { statecode: 0, statuscode: 1 };
  const json = { "@odata.context": context(null, "/$entity"), "@odata.etag": etag(`${ref.id}:${body}`), ...base, ...plain(data), [idName(set)]: ref.id };
  return { status: ref.row ? 200 : 201, json, headers: { "odata-entityid": entityUrl(ref.id), ...applied("return=representation") } };
}

export function demoApiResponse({ method, path, headers, body } = {}) {
  const m = String(method || "GET").toUpperCase();
  if (!ALLOWED.has(m)) throw new Error(`Method not allowed: ${m}`);
  if (!path) throw new Error("Missing path");
  // Same-origin guard, same wording as the live action: nothing goes to another host.
  let url;
  if (path.startsWith("http://") || path.startsWith("https://")) {
    const u = new URL(path);
    if (u.hostname !== HOST) throw new Error(`URL not allowed: ${u.hostname} is not your D365 org host (${HOST})`);
    url = path;
  } else {
    url = `${DEMO_ORG}${path.startsWith("/") ? path : `/${path}`}`;
  }
  const finalHost = new URL(url, DEMO_ORG).hostname;
  if (finalHost !== HOST) throw new Error(`URL not allowed: resolved host ${finalHost} is not your D365 org host (${HOST})`);

  const hdr = {};
  for (const [k, v] of Object.entries(headers || {})) hdr[k.toLowerCase()] = String(v ?? "").trim();
  let res;
  try { res = route(m, new URL(url, DEMO_ORG), hdr, body); }
  catch (e) {
    if (!(e instanceof DataverseError)) throw e;
    res = { status: e.status, json: { error: { code: e.code, message: e.message } } };
  }
  const reqId = guid(`${m} ${url} ${body ?? ""}`);
  const h = {
    "cache-control": "no-cache",
    "odata-version": "4.0",
    "req_id": reqId,
    "strict-transport-security": "max-age=31536000; includeSubDomains",
    "x-ms-ratelimit-burst-remaining-xrm-requests": "5999",
    "x-ms-ratelimit-time-remaining-xrm-requests": "1,200,000.00",
    "x-ms-service-request-id": reqId,
    ...res.headers,
  };
  if (res.json !== undefined) h["content-type"] = JSON_CT;
  const text = res.json === undefined || m === "HEAD" ? "" : JSON.stringify(res.json);
  return {
    ok: res.status >= 200 && res.status < 300,
    status: res.status,
    statusText: STATUS_TEXT[res.status] || "",
    headers: Object.fromEntries(Object.keys(h).sort().map(k => [k, h[k]])),
    body: text,
    bodyParsed: text ? JSON.parse(text) : null,
    elapsed: BASE_MS[m] + (hash(url) % 45) + (res.rows || 0) * 4,
    url,
  };
}
