// Loader › association mode (many-to-many tables) — PURE, unit-tested.
//
// A row of an intersect table (teammembership, systemuserroles, a custom N:N) is not created: the
// two records are associated. The file gives one column per end — a GUID, or a value to resolve
// against a column of that end's table (an email for systemuser, a name for team). These helpers
// turn the file into pairs, keep what is sent honest (blank, unresolved, ambiguous, duplicate
// pairs are reported, never silently dropped or doubled) and summarize the run.

export const GUID_RE = /^\{?[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\}?$/;
export const normGuid = (v) => String(v ?? "").trim().replace(/[{}]/g, "").toLowerCase();
export const isGuid = (v) => GUID_RE.test(String(v ?? "").trim());

// The pairs of raw values from the rows: [{ row (index), v1, v2 }], blanks reported apart.
export function readPairs(rows, col1, col2) {
  const pairs = [], blank = [];
  (rows || []).forEach((r, i) => {
    const v1 = String(r?.[col1] ?? "").trim(), v2 = String(r?.[col2] ?? "").trim();
    if (!v1 || !v2) { blank.push({ row: i, missing: !v1 && !v2 ? "both" : !v1 ? col1 : col2 }); return; }
    pairs.push({ row: i, v1, v2 });
  });
  return { pairs, blank };
}

// The distinct values one end needs resolved (those that aren't GUIDs when the end is matched by
// a column; every value when the end is a GUID column — then nothing to resolve).
export function valuesToResolve(pairs, end, byField) {
  if (!byField) return [];
  const key = end === 1 ? "v1" : "v2";
  return [...new Set((pairs || []).map(p => p[key]).filter(v => !isGuid(v)))];
}

// pairs → the GUID pairs to send, plus what can't be: unresolved / ambiguous values, duplicates in
// the file (the same pair twice is sent once; its other rows are reported as duplicates).
// resolved1 / resolved2: Map(lowercased value → guid | { ambiguous: n }); a GUID value is its own id.
export function buildAssociationItems(pairs, resolved1, resolved2) {
  const items = [], problems = [], seen = new Map();
  const idOf = (v, map) => {
    if (isGuid(v)) return { id: normGuid(v) };
    const r = map?.get(String(v).trim().toLowerCase());
    if (r == null) return { error: `"${v}" not found` };
    if (typeof r === "object" && r.ambiguous) return { error: `"${v}" matches ${r.ambiguous} records — ambiguous` };
    return { id: normGuid(r) };
  };
  for (const p of pairs || []) {
    const a = idOf(p.v1, resolved1), b = idOf(p.v2, resolved2);
    if (a.error || b.error) { problems.push({ row: p.row, msg: [a.error, b.error].filter(Boolean).join("; ") }); continue; }
    const k = `${a.id}|${b.id}`;
    if (seen.has(k)) { problems.push({ row: p.row, msg: `duplicate of row ${seen.get(k) + 2} in the file — sent once`, duplicate: true }); continue; }
    seen.set(k, p.row);
    items.push({ row: p.row, id1: a.id, id2: b.id });
  }
  return { items, problems };
}

// Counts for the result card from the per-row log entries.
export function summarizeAssociation(log) {
  const out = { done: 0, already: 0, errors: 0 };
  for (const e of log || []) {
    if (e.status === "ERROR") out.errors++;
    else if (e.already || e.note) out.already++;
    else out.done++;
  }
  return out;
}
