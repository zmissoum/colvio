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
const FILTER_BUDGET = 5000;     // characters of $filter in one before-image query (URL limit: 32 KB)

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
// fetch() resolves "." / ".." segments (also written %2e), turns "\" into "/" and drops tabs and
// newlines before it sends: "/api/data/v9.2/../../XRMServices/…" READS as a Web API path but
// REACHES another endpoint. Such a path is refused, so the /api/data/ check holds for what is
// actually requested (a legitimate Web API path never needs one — a "/" inside a key value is
// percent-encoded by keySegment).
function assertPlainPath(p) {
  const q = p.indexOf("?");
  const path = q < 0 ? p : p.slice(0, q);
  for (let i = 0; i < path.length; i++) {
    const c = path.charCodeAt(i);
    if (c < 32 || c === 127 || c === 92) throw new ScriptError(`Backslashes and control characters aren't allowed in a path: ${JSON.stringify(p)}`);
  }
  for (const seg of path.split("/")) {
    const d = seg.replace(/%2e/gi, ".");
    if (d === "." || d === "..") throw new ScriptError(`"." and ".." segments aren't allowed in a path: ${p}`);
  }
  return p;
}

// Any form a script may use → a root-relative path: "accounts?$top=1" (relative to the Web API),
// "/api/data/v9.1/…" (kept), an absolute org URL such as an @odata.nextLink (host dropped — the
// content script prefixes the org's own host, so a request can't leave the org).
export function toPath(p) {
  const s = String(p ?? "").trim();
  if (!s) throw new ScriptError("Empty path");
  if (/^\$\d+(\/|$)/.test(s)) return assertPlainPath(s); // a $batch Content-ID reference, resolved by the server
  if (/^https?:\/\//i.test(s)) { const u = new URL(s); return assertPlainPath(u.pathname + u.search); }
  if (s.startsWith("/")) return assertPlainPath(s);
  return assertPlainPath(API_PREFIX + s);
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

// A typed value a script marks explicitly, in an alternate key or a function parameter: { $guid }
// (an Edm.Guid, unquoted), { $raw } (exactly as given), { $date } (a Date — a Date object itself
// crosses postMessage from the sandbox as an ISO STRING, so it would be quoted as text). The wire
// form, or undefined when v isn't a wrapper.
function wrapped(v) {
  if (!v || typeof v !== "object") return undefined;
  if (typeof v.$guid === "string") return keySegment(v.$guid);
  if (typeof v.$raw === "string") return v.$raw;
  if (v.$date !== undefined) {
    const d = new Date(v.$date);
    if (Number.isNaN(d.getTime())) throw new ScriptError(`Invalid $date: ${JSON.stringify(v.$date)}`);
    return d.toISOString();
  }
  return undefined;
}

// A key as written inside parentheses: a GUID (braces dropped), an alternate key object
// ({ accountnumber: "A-1", region: 2 } → accountnumber='A-1',region=2), or a raw key expression.
export function keySegment(key) {
  if (key && typeof key === "object") {
    const parts = Object.entries(key).map(([k, v]) => {
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(k)) throw new ScriptError(`Invalid key column "${k}"`);
      if (v === null || v === undefined) throw new ScriptError(`Key column "${k}" has no value`);
      const w = wrapped(v) ?? (v instanceof Date ? v.toISOString() : undefined);
      if (w !== undefined) return `${k}=${w}`;
      if (typeof v === "object") throw new ScriptError(`Key column "${k}": pass a Date as { $date: d }, a GUID as { $guid: "…" }, anything literal as { $raw: "…" }`);
      // the value is URL-encoded: a "#", "?" or "%41" in a key must reach Dataverse as typed
      return `${k}=${typeof v === "string" ? `'${encodeURIComponent(v.replace(/'/g, "''"))}'` : String(v)}`;
    });
    if (!parts.length) throw new ScriptError("Empty key");
    return parts.join(",");
  }
  const s = String(key ?? "").trim();
  if (!s) throw new ScriptError("Missing record key");
  const g = s.match(GUID);
  return g ? g[1].toLowerCase() : s;
}

// Function parameters go through aliases: Name(a=@a)?@a=<value> — strings quoted, objects as JSON,
// { $guid: "…" } unquoted (an Edm.Guid parameter), { $raw: "…" } exactly as given, { $date } ISO.
export function encodeParam(v) {
  if (v === null || v === undefined) return "null";
  const w = wrapped(v);
  if (w !== undefined) return w;
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

// Built-in GET functions that write: a dry run must not call them either (CalculateRollupField
// recalculates the rollup AND persists it on the row).
const WRITING_FUNCTIONS = new Set(["calculaterollupfield"]);

// A GET that calls a function with a publisher prefix (a Custom API — its plug-in may write), or a
// built-in one known to write: unbound new_Name(…) or bound …/Microsoft.Dynamics.CRM.new_Name(…).
// Other built-in functions have no "_". `custom` says the name may also be a table's (prefix_
// tables read with a key look the same — the metadata tells, see call()).
export function customFunctionOf(path) {
  const res = resourceOf(path);
  if (res == null) return null;
  const segs = parseSegments(res);
  const last = segs[segs.length - 1];
  if (!last || last.key == null) return null;
  const name = last.name.startsWith(NS) ? last.name.slice(NS.length) : last.name;
  if (segs.length > 1 && !last.name.startsWith(NS)) return null;
  if (name.includes("_")) return { name, bound: segs.length > 1, custom: true };
  return WRITING_FUNCTIONS.has(name.toLowerCase()) ? { name, bound: segs.length > 1, custom: false } : null;
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
    lines.push("", `${op.method} ${op.path.startsWith("$") ? op.path : orgUrl + op.path} HTTP/1.1`, "Accept: application/json");
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
      // Content-ID = the op's position in the list (1-based): "$3" in a later path is ops[2]'s result
      const inner = writes.map((wi) => `--${cs}\r\n${part(ops[wi], wi + 1)}`).join("\r\n");
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
  const s = { full: 0, partial: 0, none: 0, ops: 0, unreadable: 0 }; // unreadable: sent without a before-image ({ journal: "best-effort" })
  for (const e of entries || []) { s[e.reversible] = (s[e.reversible] || 0) + 1; s.ops += (e.inverse || []).length; if (e.unreadable) s.unreadable++; }
  return s;
}
const clip = (v, n = 2000) => { if (v === undefined || v === null) return null; const s = typeof v === "string" ? v : JSON.stringify(v); return s.length > n ? s.slice(0, n) + "…" : s; };
export const fakeId = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const bodyObj = (b) => (typeof b === "string" ? (() => { try { return JSON.parse(b); } catch { return {}; } })() : b || {});

// A cheap fingerprint of an input file's rows (FNV-1a over every header and cell): a file exported
// again with the same name and row count but other values must not inherit the old one's dry run.
export function hashRows(rows) {
  let h = 0x811c9dc5;
  const feed = (s) => {
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    h ^= 0x1f; h = Math.imul(h, 0x01000193); // separator: "ab","c" ≠ "a","bc"
  };
  for (const r of rows || []) {
    if (r && typeof r === "object") for (const [k, v] of Object.entries(r)) { feed(k); feed(v == null ? "" : String(v)); }
    else feed(String(r));
    feed("\n");
  }
  return `${(h >>> 0).toString(16).padStart(8, "0")}:${(rows || []).length}`;
}

// A journal read back (storage, or an imported file) → a shape the view and the rollback can
// trust, or null. Every inverse must be a write on a Web API path; a rollback record missing its
// lists gets empty ones, so a hand-edited file can't break the Writes tab.
const INVERSE_METHODS = new Set(["POST", "PATCH", "PUT", "DELETE"]);
const REVERSIBLE = new Set(["full", "partial", "none"]);
export function normalizeJournal(j) {
  if (!j || typeof j !== "object" || !Array.isArray(j.entries)) return null;
  const okOp = (o) => {
    if (!o || typeof o !== "object" || !INVERSE_METHODS.has(o.method) || typeof o.path !== "string" || !/^\/api\/data\/v\d/.test(o.path)) return false;
    try { return resourceOf(o.path) != null; } catch { return false; }
  };
  if (!j.entries.every(e => e && typeof e === "object" && Array.isArray(e.inverse) && e.inverse.every(okOp))) return null;
  const entries = j.entries.map((e, i) => {
    const out = { ...e, seq: Number.isFinite(e.seq) ? e.seq : i + 1, method: String(e.method || ""), path: String(e.path ?? ""), note: String(e.note || ""),
      reversible: REVERSIBLE.has(e.reversible) ? e.reversible : e.inverse.length ? "partial" : "none" };
    if (out.undoneOps !== undefined) out.undoneOps = Number.isInteger(e.undoneOps) && e.undoneOps > 0 ? Math.min(e.undoneOps, e.inverse.length) : 0;
    return out;
  });
  const out = { ...j, entries, script: String(j.script || ""), rolledBack: !!j.rolledBack, inProgress: !!j.inProgress };
  if (j.rollback && typeof j.rollback === "object") {
    const r = j.rollback;
    out.rollback = { ...r, undone: Number(r.undone) || 0, skipped: Number(r.skipped) || 0, already: Number(r.already) || 0, stopped: !!r.stopped,
      failed: Array.isArray(r.failed) ? r.failed.filter(f => f && typeof f === "object").map(f => ({ seq: f.seq, method: String(f.method || ""), path: String(f.path || ""), error: String(f.error || "") })) : [] };
  } else delete out.rollback;
  return out;
}

// The columns an update's inverse reads back: the ones it sets, the lookups it binds (their
// _x_value) and the primary key — not every column of the row. null = read the whole row (a bind
// through a navigation property the metadata doesn't know, a name that isn't a column).
export function updateColumns(body, pk, relList) {
  if (!pk || !body || typeof body !== "object") return null;
  const cols = new Set([pk]);
  for (const [k, v] of Object.entries(body)) {
    if (k.endsWith("@odata.bind")) {
      const nav = k.slice(0, -"@odata.bind".length).toLowerCase();
      const rel = (relList || []).find(r => r.nav && r.nav.toLowerCase() === nav);
      if (!rel) return null;
      cols.add(`_${rel.attr}_value`);
      continue;
    }
    if (k.includes("@")) continue;
    if (v !== null && typeof v === "object" && !(v instanceof Date)) continue; // nested write: not restored
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(k)) return null;
    cols.add(k);
  }
  return [...cols];
}

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
    // an inactive row's status reason is refused on create (it doesn't match the default active
    // state): the follow-up PATCH sets both
    if (ln === "statuscode" && before.statecode != null && before.statecode !== 0) continue;
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

  // Metadata used to classify and journal: loaded once per run, on first need. A FAILED read is
  // not kept — one transient error must not downgrade every later classification and journal
  // entry of the run (the next need reads again).
  function entities() {
    if (!entitiesP) {
      const p = getJson("EntityDefinitions?$select=LogicalName,EntitySetName,PrimaryIdAttribute,PrimaryNameAttribute")
        .then(b => {
          const bySet = new Map(), byLogical = new Map();
          for (const e of b?.value || []) { if (e.EntitySetName) bySet.set(e.EntitySetName.toLowerCase(), e); byLogical.set(e.LogicalName, e); }
          if (!bySet.size && entitiesP === p) entitiesP = null;
          return { bySet, byLogical, ok: bySet.size > 0 };
        })
        .catch(() => { if (entitiesP === p) entitiesP = null; return { bySet: new Map(), byLogical: new Map(), ok: false }; });
      entitiesP = p;
    }
    return entitiesP;
  }
  const setOfLogical = (ents) => (logical) => ents.byLogical.get(logical)?.EntitySetName || null;
  function rels(logical) {
    if (!relCache.has(logical)) {
      const p = getJson(`EntityDefinitions(LogicalName='${logical}')/ManyToOneRelationships?$select=ReferencingAttribute,ReferencingEntityNavigationPropertyName,ReferencedEntity`)
        .then(b => (b?.value || []).map(r => ({ attr: r.ReferencingAttribute, nav: r.ReferencingEntityNavigationPropertyName, target: r.ReferencedEntity })))
        .catch(() => { if (relCache.get(logical) === p) relCache.delete(logical); return []; });
      relCache.set(logical, p);
    }
    return relCache.get(logical);
  }
  function attrs(logical) {
    if (!attrCache.has(logical)) {
      const p = getJson(`EntityDefinitions(LogicalName='${logical}')/Attributes?$select=LogicalName,IsValidForCreate,AttributeType,AttributeOf`)
        .then(b => b?.value || []);
      p.catch(() => { if (attrCache.get(logical) === p) attrCache.delete(logical); });
      attrCache.set(logical, p);
    }
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

  // ── Before-images: what each write's inverse is computed from, read just before it is sent ──
  // The one read a write needs, from its classification (none for creates, actions, $id removals).
  function beforeRead(cls, op) {
    const rec = cls.set && cls.key != null ? `${cls.set}(${cls.key})` : null;
    if (!rec) return null;
    switch (cls.kind) {
      case "update": case "delete": return { row: true, path: rec };
      case "setProp": case "clearProp": return { path: `${rec}/${cls.prop}` };
      case "setRef": case "clearRef": return { path: `${rec}/${cls.nav}/$ref` };
      case "removeRef": return /(?:^|&)\$id=/.test(queryOf(op.path)) ? null : { path: `${rec}/${cls.nav}(${cls.navKey})` };
      default: return null;
    }
  }
  const readOne = async (path, headers) => {
    const r = await raw({ method: "GET", path, headers });
    if (r.ok) return { found: true, body: bodyOf(r) };
    if (r.status === 404 || r.status === 204) return { found: false };
    throw errorFrom(r, path);
  };
  const infoOf = (ents, cls) => (cls.set ? ents.bySet.get(String(cls.set).toLowerCase()) || null : null);
  // An update reads back only the columns it changes; a delete, the whole row (to recreate it).
  async function rowBefore(cls, op, info) {
    const rec = `${cls.set}(${cls.key})`, h = { Prefer: BEFORE_PREFER };
    const cols = cls.kind === "update" && info ? updateColumns(bodyObj(op.body), info.PrimaryIdAttribute, await rels(info.LogicalName)) : null;
    if (cols) {
      const r = await raw({ method: "GET", path: `${rec}?$select=${cols.join(",")}`, headers: h });
      if (r.ok) return { found: true, body: bodyOf(r) };
      if (r.status === 404) return { found: false };
      // a name $select refuses (not a column): the whole row, and the write will say what's wrong
    }
    return readOne(rec, h);
  }
  // What finalize() needs, from the read's result ({ found, body } or null when none was needed).
  async function buildCap(cls, op, ents, info, r) {
    const found = !!r?.found, body = r?.body;
    switch (cls.kind) {
      case "update": return { ents, info, before: found ? body : null, rels: info ? await rels(info.LogicalName) : [] };
      case "delete":
        if (!found || !info) return { ents, info, before: found ? body : null };
        return { ents, info, before: body, rels: await rels(info.LogicalName), attrs: await attrs(info.LogicalName) };
      case "setProp": case "clearProp": return { old: found ? body?.value ?? null : null };
      case "setRef": case "clearRef": return { old: found ? body?.["@odata.id"] || null : null };
      case "removeRef": {
        const q = queryOf(op.path).match(/(?:^|&)\$id=([^&]+)/);
        if (q) return { target: decodeURIComponent(q[1]) };
        const ctx = found ? String(body?.["@odata.context"] || "") : "";
        const tset = (ctx.match(/\$metadata#([^/(]+)/) || [])[1];
        return { target: tset ? abs(`${tset}(${cls.navKey})`) : null };
      }
      default: return { ents, info };
    }
  }
  // One write sent on its own.
  async function capture(cls, op) {
    const ents = await entities();
    const info = infoOf(ents, cls), rd = beforeRead(cls, op);
    if (!rd) return buildCap(cls, op, ents, info, null);
    return buildCap(cls, op, ents, info, rd.row ? await rowBefore(cls, op, info) : await readOne(rd.path));
  }
  // Every write of a $batch, read as SETS before the batch is sent: rows of a table keyed by id in
  // filtered queries ($filter=pk eq … or …, only the columns the updates change), everything else
  // (alternate keys, single properties, references) in ONE $batch of GETs — never one round trip
  // per write. Returns a cap per op (null for reads), { failed } where a before-image is unreadable.
  async function captureAll(clss, ops) {
    const caps = new Array(ops.length).fill(null);
    const want = clss.map((c, i) => (c.kind === "read" ? -1 : i)).filter(i => i >= 0);
    if (!want.length) return caps;
    const ents = await entities();
    const reads = new Map(); // op index → { found, body } | { failed }
    const loose = [];        // { i, path, headers }
    const byTable = new Map();
    for (const i of want) {
      const c = clss[i], rd = beforeRead(c, ops[i]);
      if (!rd) continue;
      const info = infoOf(ents, c), g = String(c.key ?? "").match(GUID);
      if (rd.row && info && g) {
        const cols = c.kind === "update" ? updateColumns(bodyObj(ops[i].body), info.PrimaryIdAttribute, await rels(info.LogicalName)) : null;
        if (!byTable.has(c.set)) byTable.set(c.set, { info, items: [] });
        byTable.get(c.set).items.push({ i, id: g[1].toLowerCase(), cols });
      } else loose.push({ i, path: rd.path, headers: rd.row ? { Prefer: BEFORE_PREFER } : {} });
    }
    const readRows = async (set, pk, part) => {
      const filter = [...new Set(part.map(x => x.id))].map(id => `${pk} eq ${id}`).join(" or ");
      const base = `${set}?$filter=${encodeURIComponent(filter)}`;
      const all = async (path) => {
        const rows = []; let next = path;
        while (next) {
          const r = await raw({ method: "GET", path: next, headers: { Prefer: BEFORE_PREFER } });
          if (!r.ok) return null;
          const b = bodyOf(r); rows.push(...(b?.value || [])); next = b?.["@odata.nextLink"];
        }
        return rows;
      };
      const cols = part.every(x => x.cols) ? [...new Set(part.flatMap(x => x.cols))] : null;
      let rows = cols ? await all(`${base}&$select=${cols.join(",")}`) : null;
      if (!rows) rows = await all(base);
      if (!rows) { for (const x of part) loose.push({ i: x.i, path: `${set}(${x.id})`, headers: { Prefer: BEFORE_PREFER } }); return; }
      const byId = new Map(rows.map(r => [String(r[pk]).toLowerCase(), r]));
      for (const x of part) { const row = byId.get(x.id); reads.set(x.i, row ? { found: true, body: row } : { found: false }); }
    };
    for (const [set, { info, items }] of byTable) {
      const pk = info.PrimaryIdAttribute;
      // chunked so each query's URL stays far below the limit (~100 ids)
      for (let k = 0, per = Math.max(10, Math.floor(FILTER_BUDGET / (pk.length + 50))); k < items.length; k += per) await readRows(set, pk, items.slice(k, k + per));
    }
    if (loose.length === 1) {
      const x = loose[0];
      try { reads.set(x.i, await readOne(x.path, x.headers)); } catch (err) { if (err instanceof StopError) throw err; reads.set(x.i, { failed: err.message }); }
    } else if (loose.length) {
      const gops = loose.map(x => ({ method: "GET", path: toPath(x.path), headers: x.headers }));
      const b = buildBatch(gops, { orgUrl, atomic: false, id: `${Date.now().toString(36)}r${(++batchN).toString(36)}` });
      let res = null, fail = "";
      try { res = await raw({ method: "POST", path: "$batch", headers: withPrefer({ "Content-Type": b.contentType }, "odata.continue-on-error"), body: b.body }); }
      catch (err) { if (err instanceof StopError) throw err; fail = err.message; }
      const multipart = res && /multipart/i.test(header(res, "content-type") || "");
      if (res && !multipart) fail = errorFrom(res, "$batch").message;
      const items = multipart ? mapBatchResults(b.groups, parseBatchResponse(res.body || "", header(res, "content-type")), gops.length) : [];
      loose.forEach((x, k) => {
        const r = items[k];
        if (!r) reads.set(x.i, { failed: fail || "no response" });
        else if (r.ok) reads.set(x.i, { found: true, body: bodyOf(r) });
        else if (r.status === 404 || r.status === 204) reads.set(x.i, { found: false });
        else reads.set(x.i, { failed: r.notExecuted ? "not executed" : errorFrom(r, x.path).message });
      });
    }
    for (const i of want) {
      const r = reads.get(i);
      if (r?.failed) { caps[i] = { failed: r.failed }; continue; }
      try { caps[i] = await buildCap(clss[i], ops[i], ents, infoOf(ents, clss[i]), r || null); }
      catch (err) { if (err instanceof StopError) throw err; caps[i] = { failed: err.message }; }
    }
    return caps;
  }

  // A journal entry that carries no inverse (journal off, before-image unreadable, …).
  const stub = (cls, op, note) => ({ seq: ++seq, method: op.method, path: resourceOf(op.path) ?? op.path, kind: cls.kind, table: cls.table || cls.set, inverse: [], reversible: "none", note });

  function finalize(cls, op, cap, res) {
    const e = { ...stub(cls, op, ""), reversible: "full" };
    const setOf = cap?.ents ? setOfLogical(cap.ents) : () => null;
    const created = entityIdFrom(res);
    switch (cls.kind) {
      case "create": {
        let target = created?.resource;
        if (!target && cap?.info && !cls.deep) { const b = bodyOf(res); const id = b && b[cap.info.PrimaryIdAttribute]; if (id) target = `${cls.set}(${id})`; }
        if (target) e.inverse = [{ method: "DELETE", path: API_PREFIX + target }];
        else { e.reversible = "none"; e.note = "The new row's id wasn't returned"; }
        const body = bodyObj(op.body);
        if (target && Object.entries(body).some(([k, v]) => !k.includes("@") && v !== null && typeof v === "object")) {
          e.reversible = "partial"; e.note = "Deep insert: rollback deletes the parent row only — related rows created with it are deleted only if the relationship cascades";
        }
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
        const body = bodyObj(op.body);
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
        const b = bodyObj(op.body);
        const url = b["@odata.id"];
        const full = /^https?:/i.test(url) ? url : String(url).startsWith("/") ? `${orgUrl}${url}` : abs(String(url));
        if (url) e.inverse = [{ method: "DELETE", path: `${API_PREFIX}${cls.set}(${cls.key})/${cls.nav}/$ref?$id=${full}` }];
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
      case "action": case "function": e.reversible = "none"; e.note = `${cls.kind === "action" ? "Action" : "Custom API function"} ${cls.action}: an operation can't be undone generically`; break;
      case "batch": e.reversible = "none"; e.note = "Raw $batch sent with dv.request — use dv.batch() to journal each operation"; break;
      default: e.reversible = "none"; e.note = "Operation not recognised — not journaled";
    }
    // A clearProp / clearRef of a value that was already empty (or an update of nothing) has no
    // inverse: counted as reversible, the rollback would skip it — say so instead.
    if (!e.inverse.length && e.reversible !== "none") { e.reversible = "none"; e.note = `Nothing to undo (no previous value)${e.note ? "; " + e.note : ""}`; }
    return e;
  }
  // A write sent and left without response (timeout, network): the server may have run it.
  // Journal what can be undone from the before-image, flagged — an inverse of a write that didn't
  // happen is harmless for updates (same values) and fails readably for the rest.
  const unanswered = (cls, op, cap, why) => {
    const e = finalize(cls, op, cap, { headers: {} });
    e.reversible = e.inverse.length ? "partial" : "none";
    e.note = `${why} — the write may or may not have run${e.note ? "; " + e.note : ""}`;
    entries.push(e); onJournal?.(e);
  };
  // The journal promised an inverse for every write: one whose before-image can't be read (503,
  // 403, a timeout, 429 attempts exhausted — a 404 is "no row", not a failure) would be
  // irreversible, so it is NOT sent, unless the script accepts that with { journal: "best-effort" }.
  const unreadable = (what, failed) => new ScriptError(`${what} not sent: its before-image couldn't be read for the rollback journal (${failed}) — retry, or pass { journal: "best-effort" } to write it anyway (not reversible)`);
  const unreadableStub = (cls, op, failed) => ({ ...stub(cls, op, `Before-image unreadable: ${failed}`), unreadable: true });

  const record = (cls, op) => {
    const e = { seq: ++seq, method: op.method, path: resourceOf(op.path) ?? op.path, kind: cls.kind, table: cls.kind === "action" || cls.kind === "function" ? cls.action : (cls.table || cls.set), body: clip(op.body) };
    plan.push(e); onPlan?.(e);
    return e;
  };
  const synthetic = (cls) => {
    const headers = {};
    if (cls.kind === "create" || cls.kind === "update") headers["odata-entityid"] = abs(`${cls.kind === "create" && cls.deep ? cls.nav : cls.set}(${fakeId(++fakeN)})`);
    return { ok: true, status: cls.kind === "function" ? 200 : 204, statusText: "No Content (dry run)", headers, body: "", bodyParsed: null, dryRun: true };
  };

  // Every request of a script goes through here. bestEffort: { journal: "best-effort" } on the call.
  async function call(op0, { throwOnError = true, bestEffort = false } = {}) {
    const op = { method: String(op0.method || "GET").toUpperCase(), path: toPath(op0.path), headers: op0.headers || {}, body: op0.body };
    if (resourceOf(op.path) == null) throw new ScriptError(`Only Web API paths (/api/data/…) are allowed: ${op.path}`);
    let cls = await classifyOp(op);
    if (cls.kind === "read" && dry && op.method === "GET") {
      // a Custom API function runs a plug-in that may write: not sent in a dry run (unless it is a table)
      const fn = customFunctionOf(op.path);
      if (fn) {
        let isTable = false;
        if (fn.custom && !fn.bound) {
          // new_things(<key>) reads a custom TABLE: only the metadata tells it from a function. Unknown
          // must not pass for a function (the read would be skipped, answered empty): read again, then refuse.
          let ents = await entities();
          if (!ents.ok) ents = await entities();
          if (!ents.ok) throw new ScriptError(`Metadata unreadable — can't tell whether ${fn.name}(…) is a table or a Custom API function; try again`, { url: op.path });
          isTable = ents.bySet.has(fn.name.toLowerCase());
        }
        if (!isTable) cls = { kind: "function", table: fn.name, action: fn.name };
      }
    }
    const isWrite = cls.kind !== "read";
    if (isWrite && dry) { record(cls, op); return synthetic(cls); }
    let cap = null;
    if (isWrite && journal) {
      try { cap = await capture(cls, op); } catch (err) { if (err instanceof StopError) throw err; cap = { failed: err.message }; }
      if (cap?.failed && !bestEffort) throw unreadable(`${op.method} ${resourceOf(op.path)}`, cap.failed);
    }
    let res;
    try { res = await raw(op); }
    catch (err) {
      if (isWrite && journal && !(err instanceof StopError) && !cap?.failed) unanswered(cls, op, cap, `No response (${err.message})`);
      throw err;
    }
    if (!res.ok) { if (throwOnError) throw errorFrom(res, op.path); return res; }
    if (isWrite && journal) {
      const e = cap?.failed ? unreadableStub(cls, op, cap.failed) : finalize(cls, op, cap, res);
      entries.push(e); onJournal?.(e);
    } else if (isWrite) {
      const e = stub(cls, op, "Journal off");
      entries.push(e); onJournal?.(e);
    }
    return res;
  }

  // ── The dv API (each method receives the script's default headers first) ──
  const hdr = (defaults, opts) => ({ ...(defaults || {}), ...(opts?.headers || {}) });
  const jopt = (opts) => ({ bestEffort: opts?.journal === "best-effort" }); // call() options of a write
  const withPrefer = (h, pref) => ({ ...h, Prefer: h.Prefer ? `${h.Prefer},${pref}` : pref });
  const ann = (h, opts) => (opts?.formatted ? withPrefer(h, 'odata.include-annotations="*"') : h);
  const qs = (opts) => {
    const p = [];
    if (opts?.select) p.push(`$select=${Array.isArray(opts.select) ? opts.select.join(",") : opts.select}`);
    if (opts?.expand) p.push(`$expand=${opts.expand}`);
    return p.length ? `?${p.join("&")}` : "";
  };
  async function dryRow(set, data, id) {
    const row = {};
    let info = null;
    try {
      const segs = parseSegments(resourceOf(set) || "");
      if (segs.length === 1 && segs[0].key == null) info = (await entities()).bySet.get(segs[0].name.toLowerCase()) || null;
    } catch { /* not a table path */ }
    const relList = info ? await rels(info.LogicalName) : [];
    for (const [k, v] of Object.entries(data || {})) {
      if (k.endsWith("@odata.bind")) {
        const nav = k.slice(0, -"@odata.bind".length).toLowerCase();
        const rel = relList.find(r => r.nav && r.nav.toLowerCase() === nav);
        const g = String(v ?? "").match(/\(\{?([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\}?\)\s*$/i);
        if (rel) row[`_${rel.attr}_value`] = g ? g[1].toLowerCase() : null;
      } else if (!k.includes("@")) row[k] = v;
    }
    if (info) row[info.PrimaryIdAttribute] = id;
    return row;
  }
  async function entitySet(logical) {
    const ents = await entities();
    const e = ents.byLogical.get(logical);
    if (e) return e.EntitySetName;
    const b = await getJson(`EntityDefinitions(LogicalName='${logical}')?$select=EntitySetName`);
    return b?.EntitySetName;
  }

  const api = {
    async request(d, method, path, opts = {}) {
      const res = await call({ method, path, headers: hdr(d, opts), body: opts.body }, { throwOnError: opts.throwOnError !== false, ...jopt(opts) });
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
      const res = await call({ method: "POST", path: set, headers: h, body: data ?? {} }, jopt(opts));
      const newId = entityIdFrom(res)?.id ?? null;
      if (!opts.returnRecord) return newId;
      // a dry run returns the row the server would: the columns sent, the placeholder id, the
      // lookups bound — so `acc.accountid` works in the mode meant to exercise the script
      return res.dryRun ? dryRow(set, data, newId) : bodyOf(res);
    },
    async update(d, set, key, data, opts = {}) {
      await call({ method: "PATCH", path: `${set}(${keySegment(key)})`, headers: { "If-Match": "*", ...hdr(d, opts) }, body: data ?? {} }, jopt(opts));
    },
    async upsert(d, set, key, data, opts = {}) {
      const res = await call({ method: "PATCH", path: `${set}(${keySegment(key)})`, headers: hdr(d, opts), body: data ?? {} }, jopt(opts));
      return entityIdFrom(res)?.id ?? null;
    },
    async delete(d, set, key, opts = {}) { await call({ method: "DELETE", path: `${set}(${keySegment(key)})`, headers: hdr(d, opts) }, jopt(opts)); },
    async associate(d, set, key, nav, targetSet, targetKey, opts = {}) {
      await call({ method: "POST", path: `${set}(${keySegment(key)})/${nav}/$ref`, headers: hdr(d, opts), body: { "@odata.id": abs(`${targetSet}(${keySegment(targetKey)})`) } }, jopt(opts));
    },
    async disassociate(d, set, key, nav, targetKey, opts = {}) {
      const p = targetKey != null ? `${set}(${keySegment(key)})/${nav}(${keySegment(targetKey)})/$ref` : `${set}(${keySegment(key)})/${nav}/$ref`;
      await call({ method: "DELETE", path: p, headers: hdr(d, opts) }, jopt(opts));
    },
    async callAction(d, name, params = {}, opts = {}) {
      const p = opts.bound ? `${opts.bound.set}(${keySegment(opts.bound.key)})/${NS}${name}` : name;
      const res = await call({ method: "POST", path: p, headers: hdr(d, opts), body: params ?? {} });
      return res.dryRun ? null : bodyOf(res);
    },
    async callFunction(d, name, params = {}, opts = {}) {
      const fn = functionPath(opts.bound ? `${NS}${name}` : name, params);
      const p = opts.bound ? `${opts.bound.set}(${keySegment(opts.bound.key)})/${fn}` : fn;
      const res = await call({ method: "GET", path: p, headers: hdr(d, opts) });
      return res.dryRun ? null : bodyOf(res);
    },
    async batch(d, ops, opts = {}) {
      if (!Array.isArray(ops) || !ops.length) return [];
      if (ops.length > MAX_BATCH) throw new ScriptError(`A $batch holds at most ${MAX_BATCH} requests (got ${ops.length}) — split it`);
      const norm = ops.map(o => ({ method: String(o.method || "GET").toUpperCase(), path: toPath(o.path), headers: { ...(d || {}), ...(o.headers || {}) }, body: o.body }));
      const out = (r) => ({ ok: r.ok, status: r.status, headers: r.headers || {}, body: bodyOf(r), dryRun: !!r.dryRun, notExecuted: !!r.notExecuted });
      for (const op of norm) if (!op.path.startsWith("$") && resourceOf(op.path) == null) throw new ScriptError(`Only Web API paths (/api/data/…) are allowed: ${op.path}`);
      if (dry) {
        const results = [];
        for (const op of norm) {
          if (op.path.startsWith("$")) { if (READ.has(op.method)) results.push({ ok: true, status: 200, headers: {}, body: null, dryRun: true }); else { record({ kind: "other", table: op.path.split("/")[0] }, op); results.push(out(synthetic({ kind: "other" }))); } continue; }
          results.push(out(await call(op, { throwOnError: false })));
        }
        return results;
      }
      const clss = [];
      for (const op of norm) clss.push(await classifyOp(op));
      let caps = new Array(norm.length).fill(null);
      if (journal) {
        try { caps = await captureAll(clss, norm); }
        catch (err) { if (err instanceof StopError) throw err; caps = clss.map(c => (c.kind === "read" ? null : { failed: err.message })); }
      }
      if (journal && opts.journal !== "best-effort") {
        const bad = caps.findIndex(c => c?.failed);
        if (bad >= 0) throw unreadable(`$batch (request #${bad + 1}, ${norm[bad].method} ${resourceOf(norm[bad].path)})`, caps[bad].failed);
      }
      const atomic = opts.atomic !== false;
      const b = buildBatch(norm, { orgUrl, atomic, id: `${Date.now().toString(36)}${(++batchN).toString(36)}` });
      let h = { "Content-Type": b.contentType, ...(opts.headers || {}) };
      if (opts.continueOnError && !atomic) h = withPrefer(h, "odata.continue-on-error");
      let res;
      try { res = await raw({ method: "POST", path: "$batch", headers: h, body: b.body }); }
      catch (err) {
        if (journal && !(err instanceof StopError)) clss.forEach((c, i) => { if (c.kind !== "read" && !caps[i]?.failed) unanswered(c, norm[i], caps[i], `No response to the $batch (${err.message})`); });
        throw err;
      }
      if (!res.ok && !/multipart/i.test(header(res, "content-type") || "")) throw errorFrom(res, "$batch");
      const results = mapBatchResults(b.groups, parseBatchResponse(res.body || "", header(res, "content-type")), norm.length);
      results.forEach((r, i) => {
        if (clss[i].kind === "read" || !r?.ok) return;
        const e = !journal ? stub(clss[i], norm[i], "Journal off")
          : caps[i]?.failed ? unreadableStub(clss[i], norm[i], caps[i].failed)
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
      // The sandbox relays the arguments as JSON: an explicit `undefined` arrives as null, and a
      // null skips a parameter default (`opts = {}` → "Cannot read properties of null"). Trailing
      // nulls are dropped so the defaults apply; every method reads a null in a data position
      // (`data ?? {}`, `targetKey != null`, a missing key) exactly as it reads an absent one.
      const a = [...(args || [])];
      while (a.length && a[a.length - 1] === null) a.pop();
      return api[method](defaults || {}, ...a);
    },
    plan, entries, call,
  };
}

// Undo a journal: inverses of every entry, last write first. Each inverse goes through the same
// send (429 retries), without journaling. Returns per-entry outcomes.
export async function runRollback(entries, { send, sleep = defaultSleep, isStopped = () => false, onProgress } = {}) {
  // Each entry keeps `undoneOps` (how many of its inverse operations already succeeded): running
  // a rollback again after a failure or a Stop resumes where it stopped instead of replaying
  // what was already undone. Returns the updated entries alongside the counts.
  const rt = createRuntime({ send, mode: "live", journal: false, sleep, isStopped });
  const next = (entries || []).map(e => ({ ...e }));
  const todo = [...next].sort((a, b) => b.seq - a.seq);
  const out = { undone: 0, failed: [], skipped: 0, already: 0, entries: next };
  let i = 0;
  for (const e of todo) {
    i++;
    const n = e.inverse?.length || 0;
    if (!n) { out.skipped++; onProgress?.(i, todo.length, next); continue; }
    if ((e.undoneOps || 0) >= n) { out.already++; onProgress?.(i, todo.length, next); continue; }
    try {
      for (let k = e.undoneOps || 0; k < n; k++) { await rt.call(e.inverse[k]); e.undoneOps = k + 1; }
      out.undone++;
    } catch (err) {
      if (err instanceof StopError) { out.stopped = true; break; }
      out.failed.push({ seq: e.seq, method: e.method, path: e.path, error: err.message });
    }
    onProgress?.(i, todo.length, next);
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
