// Demo-mode stand-in for the Dataverse calls the Data Loader's run engine makes (query,
// getOptionSet, batchCreate / batchUpsert / batchDeleteKeyed). Same signatures and result shapes
// as the bridge, so a demo run goes through the REAL engine — transforms, option-set conversion,
// existence checks, delta, dry-run classification, live log, retry, rollback — against a small
// in-memory table instead of an org. Pure: no React, no DOM, no network; time comes from `sleep`.
import { flushNeverSent } from "./loaderUtils.js";

const defaultSleep = (ms) => new Promise(r => setTimeout(r, ms));

// Per-chunk "round trip", staggered by chunk index so parallel chunks land one after the other as
// they do against a real org; capped so a big demo paste stays quick. Deterministic: the EN and FR
// video renders must match.
export const demoChunkDelay = (idx, n) => 900 + Math.min(n, 10) * 150 + (idx % 3) * 300;
export const DEMO_QUERY_DELAY = 350;

// Deterministic GUID from a string seed (FNV-1a + multiply-xorshift mixing).
export function demoGuid(seed) {
  let h = 0x811c9dc5;
  for (const ch of String(seed)) h = Math.imul(h ^ ch.charCodeAt(0), 0x01000193);
  let hex = "";
  for (let i = 0; i < 4; i++) {
    h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
    h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
    h ^= h >>> 15;
    hex += (h >>> 0).toString(16).padStart(8, "0");
  }
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

// "f eq 'a' or f eq 'b'" (the only filter shape the Loader sends) → [{field, value}]; null for
// anything else, which the caller fails like Dataverse would (400).
export function parseOrEqFilter(filter) {
  const CLAUSE = /^\s*([A-Za-z_]\w*)\s+eq\s+('(?:[^']|'')*'|[^\s']+)\s*/;
  let rest = String(filter ?? "");
  const out = [];
  for (;;) {
    const m = rest.match(CLAUSE);
    if (!m) return null;
    out.push({ field: m[1], value: m[2].startsWith("'") ? m[2].slice(1, -1).replace(/''/g, "'") : m[2] });
    rest = rest.slice(m[0].length);
    if (!rest) return out;
    const o = rest.match(/^or\s+/i);
    if (!o) return null;
    rest = rest.slice(o[0].length);
  }
}

const normStr = (v) => String(v ?? "").trim().toLowerCase();
const normGuid = (v) => String(v ?? "").replace(/[^0-9a-fA-F]/g, "").toLowerCase();

// tables:   { [entitySet]: rows } — rows as the demo screens show them. Option-set LABELS are stored
//           as their option VALUES (what Dataverse returns), using `fields` ({l, opts:[{v, l}]}).
// entities: [{l, p}] — logical name per entity set, for the primary key name (<logical>id).
export function createDemoLoaderIO({ tables = {}, fields = [], entities = [], sleep = defaultSleep } = {}) {
  const optsByField = new Map(fields.filter(f => Array.isArray(f.opts)).map(f => [f.l, f.opts]));
  const toRaw = (row) => {
    const r = { ...row };
    for (const [k, v] of Object.entries(r)) {
      const opts = optsByField.get(k);
      if (!opts || typeof v !== "string") continue;
      const o = opts.find(x => normStr(x.l) === normStr(v));
      if (o) r[k] = o.v;
    }
    return r;
  };
  const pkFor = (set) => (entities.find(e => e.p === set)?.l || set.replace(/s$/, "")) + "id";
  const store = {};
  for (const [set, rows] of Object.entries(tables)) store[set] = { pk: pkFor(set), rows: (rows || []).map(toRaw) };
  const tableOf = (set) => store[set] || (store[set] = { pk: pkFor(set), rows: [] });
  const matcher = (t, field, value, asPk) => {
    const isPk = asPk || field === t.pk;
    const norm = isPk ? normGuid : normStr;
    const want = norm(value);
    return (row) => want !== "" && norm(row[field]) === want;
  };
  let callNo = 0;

  // Same worker pool as the bridge: CHUNK records per round trip, CONCURRENCY in flight, abort
  // checked between chunks, never-dispatched chunks flushed as retryable errors.
  const runChunks = async (items, onProgress, shouldAbort, opts, agg, handle) => {
    const CHUNK = Math.max(1, Math.min(500, opts.chunk || 100));
    const CONCURRENCY = Math.max(1, Math.min(10, opts.concurrency || 5));
    const chunks = [];
    for (let i = 0; i < items.length; i += CHUNK) chunks.push({ start: i, slice: items.slice(i, i + CHUNK) });
    let nextIdx = 0, processed = 0;
    const worker = async () => {
      for (;;) {
        if (shouldAbort?.()) { agg.aborted = true; return; }
        const idx = nextIdx++;
        if (idx >= chunks.length) return;
        const { start, slice } = chunks[idx];
        await sleep(demoChunkDelay(idx, slice.length));
        const chunkLog = slice.map((it, i) => handle(it, start + i + 1));
        const chunkErrors = chunkLog.filter(e => e.status === "ERROR").map(e => ({ row: e.row, msg: e.msg, payload: "" }));
        agg.errors.push(...chunkErrors);
        agg.log.push(...chunkLog);
        processed += slice.length;
        onProgress?.({ done: Math.min(processed, items.length), total: items.length, errorCount: agg.errors.length, newErrors: chunkErrors, newLog: chunkLog });
      }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, chunks.length) }, () => worker()));
    flushNeverSent(agg, chunks, nextIdx, items.length, processed, onProgress);
    return agg;
  };

  return {
    async query(entitySet, options = {}) {
      await sleep(DEMO_QUERY_DELAY);
      const keyed = String(entitySet).match(/^(\w+)\((.+)\)$/); // single-record read, e.g. systemusers(<guid>)
      if (keyed) {
        const t = store[keyed[1]];
        const row = t && t.rows.find(matcher(t, t.pk, keyed[2], true));
        if (!row) throw new Error(`HTTP 404 — ${keyed[1]}(${keyed[2]}) does not exist in the demo data`);
        return { records: [{ ...row }] };
      }
      const t = tableOf(entitySet);
      let rows = t.rows;
      if (options.filter) {
        const clauses = parseOrEqFilter(options.filter);
        if (!clauses) throw new Error("HTTP 400 — the demo data only answers 'field eq value' filters");
        const tests = clauses.map(c => matcher(t, c.field, c.value));
        rows = rows.filter(r => tests.some(fn => fn(r)));
      }
      if (options.top) rows = rows.slice(0, Number(options.top) || rows.length);
      const cols = options.select ? [...new Set([t.pk, ...String(options.select).split(",").map(s => s.trim()).filter(Boolean)])] : null;
      return { records: rows.map(r => cols ? Object.fromEntries(cols.filter(c => r[c] !== undefined).map(c => [c, r[c]])) : { ...r }) };
    },

    async getOptionSet(entityName, fieldName) {
      const opts = optsByField.get(fieldName);
      if (opts) return opts.map(o => ({ value: o.v, label: o.l, color: null }));
      if (fieldName === "statuscode") return [{ value: 1, label: "Active", color: null }, { value: 2, label: "Inactive", color: null }];
      return [];
    },

    async batchCreate(entitySet, records, onProgress, shouldAbort, opts = {}) {
      const t = tableOf(entitySet), call = ++callNo;
      const agg = { created: 0, errors: [], log: [], aborted: false };
      return runChunks(records, onProgress, shouldAbort, opts, agg, (rec, row) => {
        const id = demoGuid(`${entitySet}#${call}#${row}`);
        t.rows.push({ ...rec, [t.pk]: id });
        agg.created++;
        return { row, status: "CREATED", id };
      });
    },

    async batchUpsert(entitySet, keyField, items, isPrimaryKey = false, onProgress, shouldAbort, opts = {}) {
      const t = tableOf(entitySet), call = ++callNo;
      const agg = { created: 0, updated: 0, errors: [], log: [], aborted: false };
      return runChunks(items, onProgress, shouldAbort, opts, agg, (it, row) => {
        const existing = t.rows.find(matcher(t, keyField, it.keyValue, isPrimaryKey));
        if (existing) { Object.assign(existing, it.record); agg.updated++; return { row, status: "UPSERTED" }; }
        if (opts.updateOnly) return { row, status: "ERROR", msg: `HTTP 404 — no ${entitySet} record with ${keyField}="${it.keyValue}" in the demo data (update only: If-Match: *)` };
        const id = isPrimaryKey ? String(it.keyValue).trim() : demoGuid(`${entitySet}#${call}#${row}`);
        t.rows.push({ ...it.record, [keyField]: it.keyValue, [t.pk]: id });
        agg.created++;
        return { row, status: "CREATED", id };
      });
    },

    async batchDeleteKeyed(entitySet, keyField, items, isPrimaryKey = false, onProgress, shouldAbort, opts = {}) {
      const t = tableOf(entitySet);
      const agg = { deleted: 0, errors: [], log: [], aborted: false };
      return runChunks(items, onProgress, shouldAbort, opts, agg, (it, row) => {
        const i = t.rows.findIndex(matcher(t, keyField, it.keyValue, isPrimaryKey));
        if (i < 0) return { row, status: "ERROR", msg: `HTTP 404 — no ${entitySet} record with ${keyField}="${it.keyValue}" in the demo data` };
        t.rows.splice(i, 1);
        agg.deleted++;
        return { row, status: "DELETED" };
      });
    },
  };
}
