// Metadata › column fill rate — for one table, how many rows have a value in each column. Exact:
// FetchXML aggregates (count of rows + countcolumn per column, 40 columns per query). Dataverse
// refuses an aggregate scanning more than 50,000 rows, so the table is first cut into created-on
// date slices small enough (bisection, plus a slice for rows without a date); every chunk of
// columns is then counted on every slice and summed. Never one request per row or per column.
// The fetch runner is injected (the bridge live, a fake in demo and tests). Pure planning.

const NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;
export const COLS_PER_QUERY = 40;
const MIN_SLICE_MS = 60000; // a minute holding > 50,000 rows can't be cut further by date

// Column types countcolumn works on (stored, single-valued). The rest is listed as not countable.
const COUNTABLE = new Set(["String", "Memo", "Integer", "BigInt", "Decimal", "Double", "Money", "Boolean", "DateTime", "Lookup", "Customer", "Owner", "Picklist", "State", "Status", "Uniqueidentifier"]);
export function countableColumns(fields) {
  const ok = [], skipped = [];
  for (const f of fields || []) {
    if (!NAME_RE.test(String(f.l || ""))) continue;
    if (COUNTABLE.has(f.t) && !/_base$/.test(f.l)) ok.push(f.l); else skipped.push(f.l);
  }
  return { ok, skipped };
}

export const isLimitError = (msg) => /AggregateQueryRecordLimit|50000|maximum record limit/i.test(String(msg || ""));

// One aggregate: the row count, and the non-empty count of each column, inside a slice.
export function fillFetch(entity, pk, cols, slice) {
  const attrs = cols.map((c, i) => `<attribute name="${c}" alias="c${i}" aggregate="countcolumn"/>`).join("");
  let filter = "";
  if (slice?.isNull) filter = `<filter><condition attribute="createdon" operator="null"/></filter>`;
  else if (slice) filter = `<filter><condition attribute="createdon" operator="ge" value="${new Date(slice.fromMs).toISOString()}"/><condition attribute="createdon" operator="lt" value="${new Date(slice.toMs).toISOString()}"/></filter>`;
  return `<fetch aggregate="true"><entity name="${entity}"><attribute name="${pk}" alias="n__" aggregate="count"/>${attrs}${filter}</entity></fetch>`;
}

export function chunk(list, n = COLS_PER_QUERY) {
  const out = [];
  for (let i = 0; i < list.length; i += n) out.push(list.slice(i, i + n));
  return out;
}

// The whole scan. run(xml) → records (throws on server errors). Returns
// { total, filled: { col: n }, errors: { col: reason }, skipped, slices, requests } — or throws
// "stopped" when shouldStop() turns true (no partial answer).
export async function scanFillRate({ entity, pk, fields, oldestMs, nowMs = Date.now(), run, shouldStop = () => false, onProgress = () => {} }) {
  if (!NAME_RE.test(entity) || !NAME_RE.test(pk)) throw new Error("Invalid table or key name.");
  const { ok, skipped } = countableColumns(fields);
  let requests = 0;
  const call = async (xml) => { if (shouldStop()) throw new Error("stopped"); requests++; onProgress({ requests }); return run(xml); };
  const count = async (slice) => { const r = await call(fillFetch(entity, pk, [], slice)); return Number(r?.[0]?.n__) || 0; };

  // 1. slices: the whole table if one aggregate can count it, else created-on bisection
  const slices = [];
  try { await count(null); slices.push(null); }
  catch (e) {
    if (!isLimitError(e.message)) throw e;
    const from = Number.isFinite(oldestMs) ? oldestMs : Date.parse("2000-01-01T00:00:00Z");
    const stack = [{ fromMs: from, toMs: nowMs + 86400000 }];
    while (stack.length) {
      const s = stack.pop();
      try { await count(s); slices.push(s); }
      catch (e2) {
        if (!isLimitError(e2.message)) throw e2;
        if (s.toMs - s.fromMs <= MIN_SLICE_MS) throw new Error(`More than 50,000 rows were created within one minute (${new Date(s.fromMs).toISOString()}) — the fill rate can't be counted exactly by date slices.`);
        const mid = s.fromMs + Math.floor((s.toMs - s.fromMs) / 2);
        stack.push({ fromMs: mid, toMs: s.toMs }, { fromMs: s.fromMs, toMs: mid });
      }
    }
    try { await count({ isNull: true }); slices.push({ isNull: true }); }
    catch (e3) { if (isLimitError(e3.message)) throw new Error("More than 50,000 rows have no created-on date — they can't be sliced."); throw e3; }
  }
  onProgress({ requests, slices: slices.length });

  // 2. every chunk of columns on every slice; a chunk the server refuses is split down to the
  //    column that causes it (reported, the others still counted)
  let total = 0;
  const filled = Object.fromEntries(ok.map(c => [c, 0]));
  const errors = {};
  const countChunk = async (cols, slice) => {
    try {
      const r = await call(fillFetch(entity, pk, cols, slice));
      const row = r?.[0] || {};
      cols.forEach((c, i) => { filled[c] += Number(row[`c${i}`]) || 0; });
      return Number(row.n__) || 0;
    } catch (e) {
      if (e.message === "stopped") throw e;
      if (isLimitError(e.message)) throw e; // the slices were checked — shouldn't happen
      if (cols.length === 1) { errors[cols[0]] = e.message || String(e); return null; }
      const half = Math.ceil(cols.length / 2);
      const a = await countChunk(cols.slice(0, half), slice);
      const b = await countChunk(cols.slice(half), slice);
      return a ?? b;
    }
  };
  for (const slice of slices) {
    let sliceTotal = null;
    for (const cols of chunk(ok.length ? ok : [])) {
      const n = await countChunk(cols, slice);
      if (sliceTotal == null && n != null) sliceTotal = n;
    }
    if (!ok.length) sliceTotal = await count(slice);
    total += sliceTotal || 0;
  }
  for (const c of Object.keys(errors)) delete filled[c];
  return { total, filled, errors, skipped, slices: slices.length, requests };
}

// Percent with one decimal below 10 %, whole numbers above; never "0 %" for a column with values.
export function percent(n, total) {
  if (!total) return "—";
  const p = (n / total) * 100;
  if (n > 0 && p < 0.1) return "<0.1 %";
  return `${p < 10 ? p.toFixed(1) : Math.round(p)} %`;
}

export function fillSummary(result) {
  const cols = Object.entries(result?.filled || {});
  return {
    empty: cols.filter(([, n]) => n === 0).map(([c]) => c),
    under5: cols.filter(([, n]) => n > 0 && result.total && n / result.total < 0.05).map(([c]) => c),
  };
}

// An aggregate runner over rows held in memory — demo mode answers the scan with it.
export function localAggregateRunner(rows, { limit = 50000 } = {}) {
  return async (xml) => {
    const ge = xml.match(/operator="ge" value="([^"]+)"/), lt = xml.match(/operator="lt" value="([^"]+)"/);
    const isNull = /operator="null"/.test(xml);
    const inSlice = (rows || []).filter(r => isNull ? r.createdon == null
      : ge ? (r.createdon != null && Date.parse(r.createdon) >= Date.parse(ge[1]) && Date.parse(r.createdon) < Date.parse(lt[1])) : true);
    if (inSlice.length > limit) throw new Error("AggregateQueryRecordLimit exceeded");
    const row = { n__: inSlice.length };
    for (const [, name, i] of xml.matchAll(/<attribute name="(\w+)" alias="c(\d+)" aggregate="countcolumn"\/>/g)) row[`c${i}`] = inSlice.filter(r => r[name] != null && r[name] !== "").length;
    await new Promise(res => setTimeout(res, 60));
    return [row];
  };
}
