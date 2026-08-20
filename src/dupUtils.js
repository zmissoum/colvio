// Duplicate detection over loaded Explorer rows — PURE, no I/O, unit-tested.
//
// A duplicate group = rows sharing the same normalized value on EVERY selected key column.
// Comparison happens on RAW values (the caller passes its raw getter): lookups compare by GUID
// (two different records with the same display name never merge), dates by their ISO string
// (optionally truncated to the day), money by number.

/**
 * Normalize one key component. Strings are trimmed + lowercased (case must not split a group);
 * with dayDates, an ISO datetime is truncated to its date part — "same day, different time"
 * counts as equal, which is the usual business rule.
 */
export function normalizeKeyPart(v, opts = {}) {
  if (v === null || v === undefined) return "";
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "number") return String(v);
  if (typeof v === "object") return JSON.stringify(v);
  let s = String(v).trim();
  if (opts.dayDates && /^\d{4}-\d{2}-\d{2}T/.test(s)) s = s.slice(0, 10);
  return s.toLowerCase();
}

/**
 * Group rows by a composite key over keyFields.
 * @param rows      loaded records
 * @param keyFields column names forming the duplicate rule
 * @param getVal    (row, field) => raw value — injected so this stays pure of the result shape
 * @param opts      {dayDates}
 * @returns {groups: [{key, rows}] size ≥2 sorted biggest-first, excess: rows beyond the first
 *          of each group, analyzed: total rows seen, blankSkipped: rows whose EVERY key part
 *          was empty (an all-empty key would lump unrelated incomplete rows into one "group")}
 */
export function findDuplicateGroups(rows = [], keyFields = [], getVal, opts = {}) {
  const map = new Map();
  let blankSkipped = 0;
  for (const r of rows) {
    const parts = keyFields.map(f => normalizeKeyPart(getVal(r, f), opts));
    if (parts.every(p => p === "")) { blankSkipped++; continue; }
    // U+001F (unit separator) can't appear in real field content — "a|b"+"" must not collide with "a"+"b|"
    const key = parts.join(String.fromCharCode(31));
    const g = map.get(key);
    if (g) g.push(r); else map.set(key, [r]);
  }
  const groups = [];
  let excess = 0;
  for (const [key, rws] of map) {
    if (rws.length > 1) { groups.push({ key, rows: rws }); excess += rws.length - 1; }
  }
  groups.sort((a, b) => b.rows.length - a.rows.length);
  return { groups, excess, analyzed: rows.length, blankSkipped };
}
