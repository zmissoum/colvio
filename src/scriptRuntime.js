// Script Console runtime — PURE (no DOM, no chrome.*), unit-tested.
//
// The user's script runs in the sandbox page (sandbox.js); every `dv.*` call it makes is relayed
// here and executed against the Web API through ONE injected function, `send({ method, path,
// headers, body })` — the content script's host-locked `scriptRequest` in the extension, the API
// Tester's demo responder in standalone mode. Everything a script can do goes through `call()`, so
// the three guarantees hold for every path, helper or raw:
//   • dry run  — any write (POST / PATCH / PUT / DELETE, $batch with a write, action) is recorded
//                in the plan and NOT sent; reads run for real so the script's logic is exercised.
//   • journal  — in a live run, each successful write gets its inverse operations, computed from a
//                before-image read just before the write (rollback = run them in reverse order).
//   • 429      — Service Protection rejections are retried after Retry-After (the request was
//                refused before execution, so a retry is safe for writes too).

import { pagedFetchXml, cookieFrom } from "./fetchPaging.js";

export const API_PREFIX = "/api/data/v9.2/";
const READ = new Set(["GET", "HEAD", "OPTIONS"]);
const GUID = /^\{?([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\}?$/i;
const NS = "Microsoft.Dynamics.CRM.";
const ANN_NAV = "@Microsoft.Dynamics.CRM.associatednavigationproperty";
const ANN_LOGICAL = "@Microsoft.Dynamics.CRM.lookuplogicalname";
const BEFORE_PREFER = `odata.include-annotations="${NS}lookuplogicalname,${NS}associatednavigationproperty"`;
export const MAX_BATCH = 1000; // Dataverse's limit of requests in one $batch

export class ScriptError extends Error {
  constructor(message, { status = 0, code = "", url = "" } = {}) {
    super(message);
    this.name = "ScriptError"; this.status = status; this.code = code; this.url = url;
  }
}
export class StopError extends Error {
  constructor() { super("Stopped"); this.name = "StopError"; }
}

// ── Paths ──────────────────────────────────────────────────────────────────────
// Any form a script may use → a root-relative path: "accounts?$top=1" (relative to the Web API),
// "/api/data/v9.1/…" (kept), an absolute org URL such as an @odata.nextLink (host dropped — the
// content script prefixes the org's own host, so a request can't leave the org).
export function toPath(p) {
  const s = String(p ?? "").trim();
  if (!s) throw new ScriptError("Empty path");
  if (/^https?:\/\//i.test(s)) { const u = new URL(s); return u.pathname + u.search; }
  if (s.startsWith("/")) return s;
  return API_PREFIX + s;
}

// The Web API resource of a path, without prefix and query: "accounts(…)/nav/$ref"; null when the
// path isn't under /api/data/vX.Y/ (then it can't be classified or journaled).
export function resourceOf(path) {
  const p = toPath(path);
  const q = p.indexOf("?");
  const m = (q < 0 ? p : p.slice(0, q)).match(/^\/api\/data\/v\d+(?:\.\d+)?\/(.*)$/i);
  return m ? m[1] : null;
}
export const queryOf = (path) => { const p = toPath(path); const q = p.indexOf("?"); return q < 0 ? "" : p.slice(q + 1); };

// A key as written inside parentheses: a GUID (braces dropped), an alternate key object
// ({ accountnumber: "A-1", region: 2 } → accountnumber='A-1',region=2), or a raw key expression.
export function keySegment(key) {
  if (key && typeof key === "object") {
    const parts = Object.entries(key).map(([k, v]) => {
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(k)) throw new ScriptError(`Invalid key column "${k}"`);
      if (v === null || v === undefined) throw new ScriptError(`Key column "${k}" has no value`);
      return `${k}=${typeof v === "string" ? `'${v.replace(/'/g, "''")}'` : String(v)}`;
    });
    if (!parts.length) throw new ScriptError("Empty key");
    return parts.join(",");
  }
  const s = String(key ?? "").trim();
  if (!s) throw new ScriptError("Missing record key");
  const g = s.match(GUID);
  return g ? g[1].toLowerCase() : s;
}

// Function parameters go through aliases: Name(a=@a)?@a=<value> — strings quoted, objects as JSON.
export function encodeParam(v) {
  if (v === null || v === undefined) return "null";
  if (typeof v === "string") return `'${v.replace(/'/g, "''")}'`;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (v instanceof Date) return v.toISOString();
  return JSON.stringify(v);
}
export function functionPath(name, params = {}) {
  const keys = Object.keys(params || {});
  if (!keys.length) return `${name}()`;
  const sig = keys.map(k => `${k}=@${k}`).join(",");
  const q = keys.map(k => `@${k}=${encodeURIComponent(encodeParam(params[k]))}`).join("&");
  return `${name}(${sig})?${q}`;
}

// Split a resource on "/" outside parentheses and quotes: accounts(name='a/b')/nav → 2 segments.
export function parseSegments(resource) {
  const segs = []; let cur = "", depth = 0, inQ = false;
  for (let i = 0; i < resource.length; i++) {
    const c = resource[i];
    if (inQ) { cur += c; if (c === "'") { if (resource[i + 1] === "'") { cur += "'"; i++; } else inQ = false; } continue; }
    if (c === "'") { inQ = true; cur += c; continue; }
    if (c === "(") depth++;
    else if (c === ")") depth--;
    if (c === "/" && depth === 0) { segs.push(cur); cur = ""; continue; }
    cur += c;
  }
  segs.push(cur);
  return segs.filter(s => s !== "").map(s => {
    const i = s.indexOf("(");
    if (i < 0 || !s.endsWith(")")) return { name: s, key: null };
    return { name: s.slice(0, i), key: s.slice(i + 1, -1) };
  });
}

// What a request does. `isEntitySet(name)` answers whether a bare first segment is a table (a POST
// to it creates a row) or an operation (a POST to it runs an action); unknown → lowercase heuristic
// (entity sets are lowercase, actions and Custom APIs carry upper-case letters).
export function classify(method, path, isEntitySet = null) {
  const m = String(method || "GET").toUpperCase();
  if (READ.has(m)) return { kind: "read" };
  const res = resourceOf(path);
  if (res == null) return { kind: "other", table: path };
  const segs = parseSegments(res);
  const s0 = segs[0] || { name: "", key: null };
  if (s0.name === "$batch") return { kind: "batch", table: "$batch" };
  const base = { set: s0.name, key: s0.key, table: s0.name };
  if (segs.length === 1) {
    if (s0.key == null) {
      if (m !== "POST") return { kind: "other", ...base };
      const isSet = isEntitySet ? isEntitySet(s0.name) : /^[a-z0-9_]+$/.test(s0.name);
      return isSet ? { kind: "create", ...base } : { kind: "action", ...base, action: s0.name };
    }
    if (m === "PATCH") return { kind: "update", ...base };
    if (m === "DELETE") return { kind: "delete", ...base };
    return { kind: "other", ...base };
  }
  if (s0.key == null) return { kind: "other", ...base };
  const s1 = segs[1], last = segs[segs.length - 1];
  if (last.name === "$ref" && segs.length === 3) {
    const nav = s1.name, navKey = s1.key;
    if (m === "POST") return { kind: "addRef", ...base, nav };
    if (m === "PUT") return { kind: "setRef", ...base, nav };
    if (m === "DELETE") return navKey != null || /(^|&)\$id=/.test(queryOf(path)) ? { kind: "removeRef", ...base, nav, navKey } : { kind: "clearRef", ...base, nav };
    return { kind: "other", ...base };
  }
  if (s1.name.startsWith(NS)) return { kind: "action", ...base, action: s1.name.slice(NS.length) };
  if (segs.length === 2 && s1.key == null) {
    if (m === "PUT") return { kind: "setProp", ...base, prop: s1.name };
    if (m === "DELETE") return { kind: "clearProp", ...base, prop: s1.name };
    if (m === "POST") return { kind: "create", ...base, nav: s1.name, deep: true };
  }
  return { kind: "other", ...base };
}

// ── Responses ──────────────────────────────────────────────────────────────────
const header = (res, name) => {
  const h = res?.headers || {}; const want = name.toLowerCase();
  for (const k of Object.keys(h)) if (k.toLowerCase() === want) return h[k];
  return undefined;
};
export const bodyOf = (res) => {
  if (!res) return null;
  if (res.bodyParsed !== undefined && res.bodyParsed !== null) return res.bodyParsed;
  if (typeof res.body === "string" && res.body) { try { return JSON.parse(res.body); } catch { return res.body; } }
  return res.body ?? null;
};
// The id (and resource) in an OData-EntityId header: …/accounts(<guid>).
export function entityIdFrom(res) {
  const h = header(res, "odata-entityid");
  if (!h) return null;
  const g = String(h).match(/\(([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\)\s*$/i);
  let resource = null; try { resource = resourceOf(h); } catch { /* not a URL */ }
  return { id: g ? g[1].toLowerCase() : null, resource };
}
export function errorFrom(res, url = "") {
  const b = bodyOf(res);
  const msg = (b && typeof b === "object" && (b.error?.message || b.Message)) || (typeof b === "string" && b.slice(0, 300)) || `HTTP ${res?.status}`;
  return new ScriptError(`HTTP ${res?.status}${res?.statusText ? " " + res.statusText : ""}: ${msg}`, { status: res?.status || 0, code: (b && b.error?.code) || "", url });
}

// ── $batch ─────────────────────────────────────────────────────────────────────
// ops: [{ method, path, body?, headers? }] (paths already root-relative). atomic: every write in ONE
// changeset (all or nothing); reads stay outside (a changeset can't hold a GET). groups say which
// op indexes each top-level part carries, so the response can be mapped back.
export function buildBatch(ops, { orgUrl = "", atomic = true, id = "colvio" } = {}) {
  const boundary = `batch_${id}`, cs = `changeset_${id}`;
  const part = (op, contentId) => {
    const lines = ["Content-Type: application/http", "Content-Transfer-Encoding: binary"];
    if (contentId != null) lines.push(`Content-ID: ${contentId}`);
    lines.push("", `${op.method} ${orgUrl}${op.path} HTTP/1.1`, "Accept: application/json");
    const hasBody = op.body !== undefined && op.body !== null;
    for (const [k, v] of Object.entries(op.headers || {})) lines.push(`${k}: ${v}`);
    if (hasBody && !Object.keys(op.headers || {}).some(k => k.toLowerCase() === "content-type")) lines.push("Content-Type: application/json");
    lines.push("");
    if (hasBody) lines.push(typeof op.body === "string" ? op.body : JSON.stringify(op.body));
    return lines.join("\r\n");
  };
  const groups = []; const out = [];
  const writes = ops.map((op, i) => (READ.has(op.method) ? -1 : i)).filter(i => i >= 0);
  let csDone = false;
  ops.forEach((op, i) => {
    const isWrite = !READ.has(op.method);
    if (atomic && isWrite) {
      if (csDone) return;
      csDone = true;
      const inner = writes.map((wi, n) => `--${cs}\r\n${part(ops[wi], n + 1)}`).join("\r\n");
      out.push(`--${boundary}\r\nContent-Type: multipart/mixed; boundary=${cs}\r\n\r\n${inner}\r\n--${cs}--`);
      groups.push({ ops: writes, changeset: true });
    } else {
      out.push(`--${boundary}\r\n${part(op, null)}`);
      groups.push({ ops: [i], changeset: false });
    }
  });
  return { body: out.join("\r\n") + `\r\n--${boundary}--\r\n`, contentType: `multipart/mixed; boundary=${boundary}`, groups };
}

// A multipart/mixed response → top-level items, each a response or { changeset: [responses] }.
export function parseBatchResponse(text, contentType) {
  const parse = (txt, ct) => {
    const bm = String(ct || "").match(/boundary=(?:"([^"]+)"|([^;\s]+))/i);
    if (!bm) return [];
    const b = bm[1] || bm[2];
    const items = [];
    const chunks = String(txt).replace(/\r\n/g, "\n").split(`--${b}`);
    for (let i = 1; i < chunks.length; i++) {
      let c = chunks[i];
      if (c.startsWith("--")) break;
      c = c.replace(/^\n/, "");
      const sep = c.indexOf("\n\n");
      const head = sep < 0 ? c : c.slice(0, sep), rest = sep < 0 ? "" : c.slice(sep + 2);
      const pct = (head.match(/^content-type:\s*(.+)$/im) || [])[1] || "";
      if (/multipart\/mixed/i.test(pct)) { items.push({ changeset: parse(rest, pct) }); continue; }
      const lines = rest.split("\n");
      const st = (lines[0] || "").match(/^HTTP\/\d\.\d\s+(\d{3})\s*(.*)$/);
      if (!st) continue;
      const headers = {}; let j = 1;
      for (; j < lines.length && lines[j].trim() !== ""; j++) {
        const k = lines[j].indexOf(":"); if (k > 0) headers[lines[j].slice(0, k).trim().toLowerCase()] = lines[j].slice(k + 1).trim();
      }
      const raw = lines.slice(j + 1).join("\n").trim();
      let body = raw || null; if (raw) { try { body = JSON.parse(raw); } catch { /* text */ } }
      const status = Number(st[1]);
      items.push({ status, statusText: st[2] || "", ok: status >= 200 && status < 300, headers, body });
    }
    return items;
  };
  return parse(text, contentType);
}

// Responses in op order. A failed changeset answers with ONE error for all its writes; a batch that
// stopped at a failure (no continue-on-error) leaves the later parts unanswered → "not executed".
export function mapBatchResults(groups, items, total) {
  const out = new Array(total).fill(null);
  groups.forEach((g, gi) => {
    const it = items[gi];
    if (!it) { g.ops.forEach(i => { out[i] = { ok: false, status: 0, statusText: "Not executed", headers: {}, body: null, notExecuted: true }; }); return; }
    if (it.changeset) g.ops.forEach((i, n) => { out[i] = it.changeset[n] || it.changeset[it.changeset.length - 1] || { ok: false, status: 0, statusText: "Not executed", headers: {}, body: null, notExecuted: true }; });
    else g.ops.forEach(i => { out[i] = it; });
  });
  return out;
}

// ── Plan / journal summaries ───────────────────────────────────────────────────
export function summarize(entries) {
  const m = new Map();
  for (const e of entries || []) { const k = `${e.method} ${e.table || "?"}`; m.set(k, (m.get(k) || 0) + 1); }
  return [...m.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}
export function rollbackStats(entries) {
  const s = { full: 0, partial: 0, none: 0, ops: 0 };
  for (const e of entries || []) { s[e.reversible] = (s[e.reversible] || 0) + 1; s.ops += (e.inverse || []).length; }
  return s;
}
const clip = (v, n = 2000) => { if (v === undefined || v === null) return null; const s = typeof v === "string" ? v : JSON.stringify(v); return s.length > n ? s.slice(0, n) + "…" : s; };
export const fakeId = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

// Recreate a deleted row from its before-image: every column the table accepts on create (the
// metadata says which), lookups re-bound through their navigation property, then the state.
export function recreateOps({ set, info, attrs, rels, before, setOf }) {
  const body = {}; const skipped = [];
  for (const a of attrs || []) {
    if (!a.IsValidForCreate || a.AttributeOf) continue;
    const ln = a.LogicalName, t = a.AttributeType;
    if (t === "Lookup" || t === "Customer" || t === "Owner") {
      const v = before[`_${ln}_value`];
      if (v == null) continue;
      const tl = before[`_${ln}_value${ANN_LOGICAL}`];
      const rel = (rels || []).find(r => r.attr === ln && r.target === tl) || (rels || []).find(r => r.attr === ln);
      const nav = before[`_${ln}_value${ANN_NAV}`] || rel?.nav;
      const tset = tl && setOf(tl);
      if (nav && tset) body[`${nav}@odata.bind`] = `/${tset}(${v})`; else skipped.push(ln);
      continue;
    }
    if (["Virtual", "EntityName", "PartyList", "CalendarRules", "ManagedProperty", "Image", "File"].includes(t)) { if (before[ln] != null) skipped.push(ln); continue; }
    if (ln === "statecode") continue;
    if (Object.prototype.hasOwnProperty.call(before, ln) && before[ln] !== null) body[ln] = before[ln];
  }
  const pk = info?.PrimaryIdAttribute;
  if (pk && before[pk]) body[pk] = before[pk];
  const ops = [{ method: "POST", path: API_PREFIX + set, body }];
  if (pk && before[pk] && before.statecode != null && before.statecode !== 0) {
    ops.push({ method: "PATCH", path: `${API_PREFIX}${set}(${before[pk]})`, body: { statecode: before.statecode, ...(before.statuscode != null ? { statuscode: before.statuscode } : {}) }, headers: { "If-Match": "*" } });
  }
  return { ops, skipped };
}

// The inverse of a PATCH on an existing row: previous value of every column it set; a lookup set
// through name@odata.bind goes back to its old target (or is cleared through its $ref).
export function restoreOps({ idPath, info, rels, before, body, setOf }) {
  const restore = {}; const extra = []; const notes = [];
  for (const [k, v] of Object.entries(body || {})) {
    if (k.endsWith("@odata.bind")) {
      const nav = k.slice(0, -"@odata.bind".length);
      const rel = (rels || []).find(r => r.nav && r.nav.toLowerCase() === nav.toLowerCase());
      let attr = rel?.attr;
      if (!attr) {
        const hit = Object.keys(before).find(bk => bk.endsWith(ANN_NAV) && String(before[bk]).toLowerCase() === nav.toLowerCase());
        if (hit) attr = hit.slice(1, -("_value" + ANN_NAV).length);
      }
      if (!attr) { notes.push(`lookup ${nav} (relationship not found)`); continue; }
      const old = before[`_${attr}_value`];
      if (old == null) { extra.push({ method: "DELETE", path: `${API_PREFIX}${idPath}/${nav}/$ref` }); continue; }
      const tl = before[`_${attr}_value${ANN_LOGICAL}`] || rel?.target;
      const tset = tl && setOf(tl);
      if (!tset) { notes.push(`lookup ${nav} (target table unknown)`); continue; }
      // A polymorphic lookup (customer, regarding…) has one navigation property per target table:
      // the old value is bound back through the one of ITS table, not the one the script used.
      const back = (rels || []).find(r => r.attr === attr && r.target === tl)?.nav || nav;
      restore[`${back}@odata.bind`] = `/${tset}(${old})`;
      continue;
    }
    if (k.includes("@")) continue;
    if (v !== null && typeof v === "object" && !(v instanceof Date)) { notes.push(`${k} (nested write)`); continue; }
    restore[k] = Object.prototype.hasOwnProperty.call(before, k) ? before[k] : null;
  }
  const ops = [];
  if (Object.keys(restore).length) ops.push({ method: "PATCH", path: API_PREFIX + idPath, body: restore, headers: { "If-Match": "*" } });
  ops.push(...extra);
  return { ops, notes };
}

const defaultSleep = (ms) => new Promise(r => setTimeout(r, ms));

// ── Runtime ────────────────────────────────────────────────────────────────────
// mode "dry" | "live"; journal: compute inverses in a live run; onPlan / onJournal: each recorded
// entry as it happens (the UI streams them).
export function createRuntime({ send, orgUrl = "", mode = "live", journal = true, sleep = defaultSleep, isStopped = () => false, onPlan, onJournal, maxRetries = 6 }) {
  const dry = mode === "dry";
  const plan = [], entries = [];
  let seq = 0, fakeN = 0, batchN = 0, entitiesP = null;
  const relCache = new Map(), attrCache = new Map();
  const abs = (resource) => `${orgUrl}${API_PREFIX}${resource}`;

  const wait = async (ms) => {
    for (let left = ms; left > 0; left -= 500) { if (isStopped()) throw new StopError(); await sleep(Math.min(500, left)); }
    if (isStopped()) throw new StopError();
  };

  async function raw(op) {
    let attempt = 0;
    while (true) {
      if (isStopped()) throw new StopError();
      const res = await send({ method: op.method, path: toPath(op.path), headers: op.headers || {}, body: op.body });
      if (res?.clientError) throw new ScriptError(`${res.statusText || "Request failed"}: ${res.body || ""}`.trim(), { url: op.path });
      if (res?.status === 429 && attempt < maxRetries) {
        const ra = parseInt(header(res, "retry-after") || "", 10);
        await wait(Math.min(Number.isFinite(ra) ? ra : 2 ** attempt, 60) * 1000);
        attempt++;
        continue;
      }
      return res;
    }
  }
  const getJson = async (path, headers) => {
    const res = await raw({ method: "GET", path, headers });
    if (!res.ok) throw errorFrom(res, path);
    return bodyOf(res);
  };

  // Metadata used to classify and journal (loaded once per run, on first need).
  function entities() {
    if (!entitiesP) entitiesP = getJson("EntityDefinitions?$select=LogicalName,EntitySetName,PrimaryIdAttribute,PrimaryNameAttribute")
      .then(b => {
        const bySet = new Map(), byLogical = new Map();
        for (const e of b?.value || []) { if (e.EntitySetName) bySet.set(e.EntitySetName.toLowerCase(), e); byLogical.set(e.LogicalName, e); }
        return { bySet, byLogical, ok: bySet.size > 0 };
      })
      .catch(() => ({ bySet: new Map(), byLogical: new Map(), ok: false }));
    return entitiesP;
  }
  const setOfLogical = (ents) => (logical) => ents.byLogical.get(logical)?.EntitySetName || null;
  async function rels(logical) {
    if (!relCache.has(logical)) relCache.set(logical, getJson(`EntityDefinitions(LogicalName='${logical}')/ManyToOneRelationships?$select=ReferencingAttribute,ReferencingEntityNavigationPropertyName,ReferencedEntity`)
      .then(b => (b?.value || []).map(r => ({ attr: r.ReferencingAttribute, nav: r.ReferencingEntityNavigationPropertyName, target: r.ReferencedEntity })))
      .catch(() => []));
    return relCache.get(logical);
  }
  async function attrs(logical) {
    if (!attrCache.has(logical)) attrCache.set(logical, getJson(`EntityDefinitions(LogicalName='${logical}')/Attributes?$select=LogicalName,IsValidForCreate,AttributeType,AttributeOf`)
      .then(b => b?.value || []));
    return attrCache.get(logical);
  }

  async function classifyOp(op) {
    const segs = (() => { try { const r = resourceOf(op.path); return r == null ? [] : parseSegments(r); } catch { return []; } })();
    let isSet = null;
    if (op.method === "POST" && segs.length === 1 && segs[0].key == null && segs[0].name !== "$batch") {
      const ents = await entities();
      if (ents.ok) isSet = (n) => ents.bySet.has(n.toLowerCase());
    }
    return classify(op.method, op.path, isSet);
  }

  // Before-image of a write, read just before it is sent. Returns what finalize() needs.
  async function capture(cls, op) {
    const ents = await entities();
    const info = cls.set ? ents.bySet.get(String(cls.set).toLowerCase()) : null;
    const rec = cls.set && cls.key != null ? `${cls.set}(${cls.key})` : null;
    const read = async (path, headers) => { const r = await raw({ method: "GET", path, headers }); return r.ok ? { found: true, body: bodyOf(r) } : (r.status === 404 || r.status === 204 ? { found: false } : (() => { throw errorFrom(r, path); })()); };
    switch (cls.kind) {
      case "update": {
        const b = await read(rec, { Prefer: BEFORE_PREFER });
        return { ents, info, before: b.found ? b.body : null, rels: info ? await rels(info.LogicalName) : [] };
      }
      case "delete": {
        const b = await read(rec, { Prefer: BEFORE_PREFER });
        if (!b.found || !info) return { ents, info, before: b.found ? b.body : null };
        return { ents, info, before: b.body, rels: await rels(info.LogicalName), attrs: await attrs(info.LogicalName) };
      }
      case "setProp": case "clearProp": {
        const b = await read(`${rec}/${cls.prop}`);
        return { old: b.found ? b.body?.value ?? null : null };
      }
      case "setRef": case "clearRef": {
        const b = await read(`${rec}/${cls.nav}/$ref`);
        return { old: b.found ? b.body?.["@odata.id"] || null : null };
      }
      case "removeRef": {
        const q = queryOf(op.path).match(/(?:^|&)\$id=([^&]+)/);
        if (q) return { target: decodeURIComponent(q[1]) };
        const b = await read(`${rec}/${cls.nav}(${cls.navKey})`);
        const ctx = b.found ? String(b.body?.["@odata.context"] || "") : "";
        const tset = (ctx.match(/\$metadata#([^/(]+)/) || [])[1];
        return { target: tset ? abs(`${tset}(${cls.navKey})`) : null };
      }
      default: return { ents, info };
    }
  }

  function finalize(cls, op, cap, res) {
    const e = { seq: ++seq, method: op.method, path: resourceOf(op.path) ?? op.path, kind: cls.kind, table: cls.table || cls.set, inverse: [], reversible: "full", note: "" };
    const setOf = cap?.ents ? setOfLogical(cap.ents) : () => null;
    const created = entityIdFrom(res);
    switch (cls.kind) {
      case "create": {
        let target = created?.resource;
        if (!target && cap?.info) { const b = bodyOf(res); const id = b && b[cap.info.PrimaryIdAttribute]; if (id) target = `${cls.set}(${id})`; }
        if (target) e.inverse = [{ method: "DELETE", path: API_PREFIX + target }];
        else { e.reversible = "none"; e.note = "The new row's id wasn't returned"; }
        break;
      }
      case "update": {
        if (!cap.before) {
          // upsert that created the row
          if (created?.resource) e.inverse = [{ method: "DELETE", path: API_PREFIX + created.resource }];
          else { e.reversible = "none"; e.note = "Created by upsert, id not returned"; }
          break;
        }
        const pk = cap.info?.PrimaryIdAttribute;
        const idPath = pk && cap.before[pk] ? `${cls.set}(${cap.before[pk]})` : `${cls.set}(${cls.key})`;
        const body = typeof op.body === "string" ? (() => { try { return JSON.parse(op.body); } catch { return {}; } })() : op.body;
        const r = restoreOps({ idPath, info: cap.info, rels: cap.rels, before: cap.before, body, setOf });
        e.inverse = r.ops;
        if (r.notes.length) { e.reversible = "partial"; e.note = `Not restorable: ${r.notes.join(", ")}`; }
        break;
      }
      case "delete": {
        if (!cap.before || !cap.attrs) { e.reversible = "none"; e.note = "No before-image (row or table metadata unreadable)"; break; }
        const r = recreateOps({ set: cls.set, info: cap.info, attrs: cap.attrs, rels: cap.rels, before: cap.before, setOf });
        e.inverse = r.ops; e.reversible = "partial";
        e.note = "Recreated from its columns; rows deleted by cascade, N:N links, notes and files aren't restored (Recycle Bin can)" + (r.skipped.length ? `; columns not restorable: ${r.skipped.join(", ")}` : "");
        break;
      }
      case "setProp": {
        const p = `${API_PREFIX}${cls.set}(${cls.key})/${cls.prop}`;
        e.inverse = [cap.old == null ? { method: "DELETE", path: p } : { method: "PUT", path: p, body: { value: cap.old } }];
        break;
      }
      case "clearProp": {
        if (cap.old != null) e.inverse = [{ method: "PUT", path: `${API_PREFIX}${cls.set}(${cls.key})/${cls.prop}`, body: { value: cap.old } }];
        break;
      }
      case "addRef": {
        const b = typeof op.body === "string" ? (() => { try { return JSON.parse(op.body); } catch { return {}; } })() : op.body || {};
        const url = b["@odata.id"];
        if (url) e.inverse = [{ method: "DELETE", path: `${API_PREFIX}${cls.set}(${cls.key})/${cls.nav}/$ref?$id=${/^https?:/i.test(url) ? url : abs(String(url).replace(/^\//, ""))}` }];
        else { e.reversible = "none"; e.note = "No @odata.id in the body"; }
        break;
      }
      case "removeRef": {
        if (cap.target) e.inverse = [{ method: "POST", path: `${API_PREFIX}${cls.set}(${cls.key})/${cls.nav}/$ref`, body: { "@odata.id": cap.target } }];
        else { e.reversible = "none"; e.note = "The related row couldn't be read before the removal"; }
        break;
      }
      case "setRef": case "clearRef": {
        const p = `${API_PREFIX}${cls.set}(${cls.key})/${cls.nav}/$ref`;
        if (cap.old) e.inverse = [{ method: "PUT", path: p, body: { "@odata.id": cap.old } }];
        else if (cls.kind === "setRef") e.inverse = [{ method: "DELETE", path: p }];
        break;
      }
      case "action": e.reversible = "none"; e.note = `Action ${cls.action}: an operation can't be undone generically`; break;
      case "batch": e.reversible = "none"; e.note = "Raw $batch sent with dv.request — use dv.batch() to journal each operation"; break;
      default: e.reversible = "none"; e.note = "Operation not recognised — not journaled";
    }
    return e;
  }

  const record = (cls, op) => {
    const e = { seq: ++seq, method: op.method, path: resourceOf(op.path) ?? op.path, kind: cls.kind, table: cls.kind === "action" ? cls.action : (cls.table || cls.set), body: clip(op.body) };
    plan.push(e); onPlan?.(e);
    return e;
  };
  const synthetic = (cls) => {
    const headers = {};
    if (cls.kind === "create" || cls.kind === "update") headers["odata-entityid"] = abs(`${cls.kind === "create" && cls.deep ? cls.nav : cls.set}(${fakeId(++fakeN)})`);
    return { ok: true, status: 204, statusText: "No Content (dry run)", headers, body: "", bodyParsed: null, dryRun: true };
  };

  // Every request of a script goes through here.
  async function call(op0, { throwOnError = true } = {}) {
    const op = { method: String(op0.method || "GET").toUpperCase(), path: toPath(op0.path), headers: op0.headers || {}, body: op0.body };
    const cls = await classifyOp(op);
    const isWrite = cls.kind !== "read";
    if (isWrite && dry) { record(cls, op); return synthetic(cls); }
    let cap = null;
    if (isWrite && journal) { try { cap = await capture(cls, op); } catch (err) { if (err instanceof StopError) throw err; cap = { failed: err.message }; } }
    const res = await raw(op);
    if (!res.ok) { if (throwOnError) throw errorFrom(res, op.path); return res; }
    if (isWrite && journal) {
      const e = cap?.failed ? { seq: ++seq, method: op.method, path: resourceOf(op.path) ?? op.path, kind: cls.kind, table: cls.table || cls.set, inverse: [], reversible: "none", note: `Before-image unreadable: ${cap.failed}` } : finalize(cls, op, cap, res);
      entries.push(e); onJournal?.(e);
    } else if (isWrite) {
      const e = { seq: ++seq, method: op.method, path: resourceOf(op.path) ?? op.path, kind: cls.kind, table: cls.table || cls.set, inverse: [], reversible: "none", note: "Journal off" };
      entries.push(e); onJournal?.(e);
    }
    return res;
  }

  // ── The dv API (each method receives the script's default headers first) ──
  const hdr = (defaults, opts) => ({ ...(defaults || {}), ...(opts?.headers || {}) });
  const withPrefer = (h, pref) => ({ ...h, Prefer: h.Prefer ? `${h.Prefer},${pref}` : pref });
  const ann = (h, opts) => (opts?.formatted ? withPrefer(h, 'odata.include-annotations="*"') : h);
  const qs = (opts) => {
    const p = [];
    if (opts?.select) p.push(`$select=${Array.isArray(opts.select) ? opts.select.join(",") : opts.select}`);
    if (opts?.expand) p.push(`$expand=${opts.expand}`);
    return p.length ? `?${p.join("&")}` : "";
  };
  async function entitySet(logical) {
    const ents = await entities();
    const e = ents.byLogical.get(logical);
    if (e) return e.EntitySetName;
    const b = await getJson(`EntityDefinitions(LogicalName='${logical}')?$select=EntitySetName`);
    return b?.EntitySetName;
  }

  const api = {
    async request(d, method, path, opts = {}) {
      const res = await call({ method, path, headers: hdr(d, opts), body: opts.body }, { throwOnError: opts.throwOnError !== false });
      return { ok: res.ok, status: res.status, headers: res.headers || {}, body: bodyOf(res), dryRun: !!res.dryRun };
    },
    async get(d, path, opts = {}) { return bodyOf(await call({ method: "GET", path, headers: ann(hdr(d, opts), opts) })); },
    async getAll(d, path, opts = {}) {
      const max = opts.max ?? Infinity; const rows = [];
      const h = withPrefer(ann(hdr(d, opts), opts), `odata.maxpagesize=${opts.pageSize || 5000}`);
      let next = path;
      while (next && rows.length < max) {
        const b = bodyOf(await call({ method: "GET", path: next, headers: h }));
        rows.push(...(b?.value || []));
        next = b?.["@odata.nextLink"];
      }
      return rows.length > max ? rows.slice(0, max) : rows;
    },
    async retrieve(d, set, key, opts = {}) { return bodyOf(await call({ method: "GET", path: `${set}(${keySegment(key)})${qs(opts)}`, headers: ann(hdr(d, opts), opts) })); },
    async fetchXml(d, xml, opts = {}) {
      const m = String(xml || "").match(/<entity\s+name=["']([^"']+)["']/i);
      if (!m) throw new ScriptError("No <entity name='…'> in the FetchXML");
      const set = await entitySet(m[1]);
      if (!set) throw new ScriptError(`Table ${m[1]} not found`);
      const h = withPrefer(hdr(d, opts), `odata.include-annotations="${opts.formatted ? "*" : `${NS}fetchxmlpagingcookie,${NS}morerecords`}"`);
      const single = /\baggregate\s*=\s*["']true["']/i.test(xml) || /<fetch\b[^>]*\btop\s*=/i.test(xml) || opts.page != null;
      if (single) return bodyOf(await call({ method: "GET", path: `${set}?fetchXml=${encodeURIComponent(xml)}`, headers: h }))?.value || [];
      const max = opts.max ?? Infinity; const rows = [];
      let page = 1, cookie = null;
      while (rows.length < max) {
        const b = bodyOf(await call({ method: "GET", path: `${set}?fetchXml=${encodeURIComponent(pagedFetchXml(xml, page, cookie))}`, headers: h }));
        rows.push(...(b?.value || []));
        if (!b?.[`@${NS}morerecords`]) break;
        cookie = cookieFrom(b[`@${NS}fetchxmlpagingcookie`]); page++;
      }
      return rows.length > max ? rows.slice(0, max) : rows;
    },
    async create(d, set, data, opts = {}) {
      let h = hdr(d, opts); if (opts.returnRecord) h = withPrefer(h, "return=representation");
      const res = await call({ method: "POST", path: set, headers: h, body: data ?? {} });
      if (opts.returnRecord && !res.dryRun) return bodyOf(res);
      return entityIdFrom(res)?.id ?? null;
    },
    async update(d, set, key, data, opts = {}) {
      await call({ method: "PATCH", path: `${set}(${keySegment(key)})`, headers: { "If-Match": "*", ...hdr(d, opts) }, body: data ?? {} });
    },
    async upsert(d, set, key, data, opts = {}) {
      const res = await call({ method: "PATCH", path: `${set}(${keySegment(key)})`, headers: hdr(d, opts), body: data ?? {} });
      return entityIdFrom(res)?.id ?? null;
    },
    async delete(d, set, key, opts = {}) { await call({ method: "DELETE", path: `${set}(${keySegment(key)})`, headers: hdr(d, opts) }); },
    async associate(d, set, key, nav, targetSet, targetKey, opts = {}) {
      await call({ method: "POST", path: `${set}(${keySegment(key)})/${nav}/$ref`, headers: hdr(d, opts), body: { "@odata.id": abs(`${targetSet}(${keySegment(targetKey)})`) } });
    },
    async disassociate(d, set, key, nav, targetKey, opts = {}) {
      const p = targetKey != null ? `${set}(${keySegment(key)})/${nav}(${keySegment(targetKey)})/$ref` : `${set}(${keySegment(key)})/${nav}/$ref`;
      await call({ method: "DELETE", path: p, headers: hdr(d, opts) });
    },
    async callAction(d, name, params = {}, opts = {}) {
      const p = opts.bound ? `${opts.bound.set}(${keySegment(opts.bound.key)})/${NS}${name}` : name;
      const res = await call({ method: "POST", path: p, headers: hdr(d, opts), body: params ?? {} });
      return res.dryRun ? null : bodyOf(res);
    },
    async callFunction(d, name, params = {}, opts = {}) {
      const fn = functionPath(opts.bound ? `${NS}${name}` : name, params);
      const p = opts.bound ? `${opts.bound.set}(${keySegment(opts.bound.key)})/${fn}` : fn;
      return bodyOf(await call({ method: "GET", path: p, headers: hdr(d, opts) }));
    },
    async batch(d, ops, opts = {}) {
      if (!Array.isArray(ops) || !ops.length) return [];
      if (ops.length > MAX_BATCH) throw new ScriptError(`A $batch holds at most ${MAX_BATCH} requests (got ${ops.length}) — split it`);
      const norm = ops.map(o => ({ method: String(o.method || "GET").toUpperCase(), path: toPath(o.path), headers: { ...(d || {}), ...(o.headers || {}) }, body: o.body }));
      const out = (r) => ({ ok: r.ok, status: r.status, headers: r.headers || {}, body: bodyOf(r), dryRun: !!r.dryRun, notExecuted: !!r.notExecuted });
      if (dry) {
        const results = [];
        for (const op of norm) results.push(out(await call(op, { throwOnError: false })));
        return results;
      }
      const clss = []; const caps = [];
      for (const op of norm) {
        const cls = await classifyOp(op); clss.push(cls);
        let cap = null;
        if (cls.kind !== "read" && journal) { try { cap = await capture(cls, op); } catch (err) { if (err instanceof StopError) throw err; cap = { failed: err.message }; } }
        caps.push(cap);
      }
      const atomic = opts.atomic !== false;
      const b = buildBatch(norm, { orgUrl, atomic, id: `${Date.now().toString(36)}${(++batchN).toString(36)}` });
      let h = { "Content-Type": b.contentType, ...(opts.headers || {}) };
      if (opts.continueOnError && !atomic) h = withPrefer(h, "odata.continue-on-error");
      const res = await raw({ method: "POST", path: "$batch", headers: h, body: b.body });
      if (!res.ok && !/multipart/i.test(header(res, "content-type") || "")) throw errorFrom(res, "$batch");
      const results = mapBatchResults(b.groups, parseBatchResponse(res.body || "", header(res, "content-type")), norm.length);
      results.forEach((r, i) => {
        if (clss[i].kind === "read" || !r?.ok) return;
        const e = !journal ? { seq: ++seq, method: norm[i].method, path: resourceOf(norm[i].path), kind: clss[i].kind, table: clss[i].table || clss[i].set, inverse: [], reversible: "none", note: "Journal off" }
          : caps[i]?.failed ? { seq: ++seq, method: norm[i].method, path: resourceOf(norm[i].path), kind: clss[i].kind, table: clss[i].table || clss[i].set, inverse: [], reversible: "none", note: `Before-image unreadable: ${caps[i].failed}` }
          : finalize(clss[i], norm[i], caps[i], r);
        entries.push(e); onJournal?.(e);
      });
      const mapped = results.map(out);
      if (opts.throwOnError !== false) {
        const bad = mapped.findIndex(r => !r.ok);
        if (bad >= 0) {
          const r = results[bad];
          const err = r.notExecuted ? new ScriptError(`$batch request #${bad + 1} not executed (an earlier one failed)`) : errorFrom(r, norm[bad].path);
          err.message = `$batch request #${bad + 1}: ${err.message}`; err.results = mapped;
          throw err;
        }
      }
      return mapped;
    },
    async entity(d, logical) {
      const ents = await entities();
      const e = ents.byLogical.get(logical);
      if (e) return { ...e };
      return getJson(`EntityDefinitions(LogicalName='${logical}')?$select=LogicalName,EntitySetName,PrimaryIdAttribute,PrimaryNameAttribute`);
    },
    async entitySet(d, logical) { return entitySet(logical); },
    async whoAmI(d) { return bodyOf(await call({ method: "GET", path: "WhoAmI()", headers: hdr(d) })); },
  };

  return {
    methods: Object.keys(api),
    // invoke("update", ["accounts", id, {…}], { MSCRMCallerID: … })
    async invoke(method, args, defaults) {
      if (!Object.prototype.hasOwnProperty.call(api, method)) throw new ScriptError(`dv.${method} doesn't exist`);
      return api[method](defaults || {}, ...(args || []));
    },
    plan, entries, call,
  };
}

// Undo a journal: inverses of every entry, last write first. Each inverse goes through the same
// send (429 retries), without journaling. Returns per-entry outcomes.
export async function runRollback(entries, { send, sleep = defaultSleep, isStopped = () => false, onProgress } = {}) {
  const rt = createRuntime({ send, mode: "live", journal: false, sleep, isStopped });
  const todo = [...(entries || [])].sort((a, b) => b.seq - a.seq);
  const out = { undone: 0, failed: [], skipped: 0 };
  let i = 0;
  for (const e of todo) {
    i++;
    if (!e.inverse?.length) { out.skipped++; onProgress?.(i, todo.length); continue; }
    try {
      for (const op of e.inverse) await rt.call(op);
      out.undone++;
    } catch (err) {
      if (err instanceof StopError) { out.stopped = true; break; }
      out.failed.push({ seq: e.seq, method: e.method, path: e.path, error: err.message });
    }
    onProgress?.(i, todo.length);
  }
  return out;
}

// The line a script error points at: the sandbox wraps the code in an async function whose source
// starts with 2 header lines — "<anonymous>:LINE:COL" in the stack is LINE - 2 in the editor.
export function scriptLine(stack) {
  const m = String(stack || "").match(/<anonymous>:(\d+):(\d+)/);
  if (!m) return null;
  const line = Number(m[1]) - 2;
  return line > 0 ? line : null;
}
