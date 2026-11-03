// Explorer helpers that carry no React: what a record count means, whether a result is complete,
// which saved columns the table still has, how a native-SQL result's columns are tracked. Pure, so
// the honesty rules they implement are pinned by tests (src/__tests__/explorerReview.test.js).

// Dataverse's /$count stops at 5000: a table reporting exactly 5000 holds 5,000 OR MORE. The label
// says so, and nothing may use such a count as an exact figure (review finding: the sidebar, the
// header and the $expand warning all showed "5,000" as the table's size).
export const COUNT_CAP = 5000;
// exactly 5000 is the capped value; a count above it came from a source the cap doesn't apply to (the demo list, a total-record-count read) and is exact
export const isCountCapped = (n) => Number(n) === COUNT_CAP;

export function countLabel(n) {
  const v = Number(n);
  if (!Number.isFinite(v) || v < 0) return "";
  return isCountCapped(v) ? `${COUNT_CAP.toLocaleString("en-US")}+` : v.toLocaleString("en-US");
}

// The footer / header wording for a result that stopped paging: complete, stopped by the user, or
// cut by a page that couldn't be read. "" while pages are still coming. (It used to read "loading
// complete" after ■ Stop and after a failed page; review finding.)
export function completionLabel(res) {
  if (!res || res.fetching) return "";
  if (res.stopped) return "stopped by you, incomplete";
  if (res.partial) return res.partialPage ? `incomplete (page ${res.partialPage} failed)` : "incomplete (a page failed)";
  return "loading complete";
}
export const isIncomplete = (res) => !!(res && !res.fetching && (res.stopped || res.partial));

// The Builder's $expand shortfall warning: null when nothing can be said. retrieved = rows loaded;
// count = the table's /$count (capped at 5000); filtered / topped / stopped / partial = the other
// reasons a result is short, each of which used to trigger the warning falsely. A capped count is
// never the denominator: the table's real size is unknown, only that it is at least 5,000.
export function expandShortfall({ retrieved, count, hasExpand, filtered, topped, stopped, partial }) {
  if (!hasExpand || !count || count < 0 || filtered || topped || stopped || partial) return null;
  const n = Number(retrieved) || 0;
  const tail = "Remove expand to get all records, then enrich in a second query.";
  if (isCountCapped(count)) {
    if (n > COUNT_CAP) return null; // more than the count could say: nothing is knowable from here
    const verdict = n < COUNT_CAP ? "so the result is incomplete" : "so the result may be incomplete";
    return `⚠ ${n.toLocaleString("en-US")} records retrieved — D365 limits results with $expand; the table holds ${countLabel(count)} records (Dataverse's count stops at 5,000), ${verdict}. ${tail}`;
  }
  if (n < count * 0.9) return `⚠ ${n.toLocaleString("en-US")} records retrieved out of ${countLabel(count)} — D365 limits results with $expand. ${tail}`;
  return null;
}

// $orderby on a column the table doesn't have is a 400 (orderBy survived a table switch, and a
// saved query's sort column may be gone; review finding): the sort is kept only when the column is
// among the fields. fieldNames: an array or a Set of logical names.
export function pruneOrderBy(orderBy, fieldNames) {
  const f = orderBy && orderBy.f;
  if (!f) return { f: "", dir: "asc" };
  const names = fieldNames instanceof Set ? fieldNames : new Set(fieldNames || []);
  return names.has(f) ? { f, dir: orderBy.dir === "desc" ? "desc" : "asc" } : { f: "", dir: "asc" };
}

// A saved query's / template's / history entry's columns against the table's fields: which still
// exist and which don't. The unknown ones stay visible (red chips) and are said up front — run()
// used to prune them silently (review finding).
export function splitKnownColumns(cols, fieldNames) {
  const names = fieldNames instanceof Set ? fieldNames : new Set(fieldNames || []);
  const known = [], unknown = [];
  for (const c of cols || []) (names.has(c) ? known : unknown).push(c);
  return { known, unknown };
}

// The note for the columns (and the sort column) a table no longer has; "" when it has them all.
// source: "saved" | "template" | "recorded" — where the columns came from.
export function unknownColumnsNote(unknown, { source = "saved", orderBy = "" } = {}) {
  const parts = [];
  const u = unknown || [];
  if (u.length) parts.push(`${u.length} ${source} column${u.length > 1 ? "s aren't" : " isn't"} on this table: ${u.join(", ")} — left out of the query`);
  if (orderBy) parts.push(`the ${source} sort column ${orderBy} isn't on this table — sort removed`);
  return parts.join("; ");
}

// A SET column of a SQL UPDATE, as typed, → the table's logical name. SQL names are
// case-insensitive ("SET Name = …" used to be refused as not a column; review finding); the OData
// name (_x_value) is accepted too. null when nothing matches. fields = [{ l, odata }].
export function resolveColumn(name, fields) {
  const typed = String(name || "");
  const want = typed.toLowerCase();
  if (!want) return null;
  const list = fields || [];
  const exact = list.find(f => f.l === typed);
  if (exact) return exact.l;
  const byLogical = list.find(f => String(f.l || "").toLowerCase() === want);
  if (byLogical) return byLogical.l;
  const byOdata = list.find(f => String(f.odata || "").toLowerCase() === want);
  return byOdata ? byOdata.l : null;
}

// Columns of a native-SQL (?sql=) result. Seeded from the SELECT list ([{ name, keys }] from
// fetchPaging.sqlSelectColumns): a selected column with no value in any row is still a column of
// the grid and the exports — the Web API leaves null properties out of a row, and a 200-row sample
// used to lose such a column entirely (review finding). Then widened by whatever the rows carry
// that the SELECT didn't name (SELECT *, a LEFT JOIN's columns absent from row 1) — every row of
// every page, since reading a row's keys is cheap. A lookup's value sits under _x_value: the
// column is re-pointed at that key when a row shows it.
export function sqlColumnTracker(selectCols) {
  const names = [], keyOf = {}, colOfKey = {};
  for (const c of selectCols || []) {
    if (!c || !c.name || c.name in keyOf) continue;
    const keys = c.keys && c.keys.length ? c.keys : [c.name];
    names.push(c.name); keyOf[c.name] = keys[0];
    for (const k of keys) if (!(k in colOfKey)) colOfKey[k] = c.name;
  }
  // rows → true when a column was added or re-pointed (the grid must repaint its header)
  const add = (rows) => {
    let changed = false;
    for (const r of rows || []) for (const k of Object.keys(r || {})) {
      if (k.startsWith("@") || k.includes("@") || k === "__error") continue;
      const own = colOfKey[k];
      if (own) { if (keyOf[own] !== k && !(keyOf[own] in r)) { keyOf[own] = k; changed = true; } continue; }
      if (k in keyOf) continue;
      names.push(k); keyOf[k] = k; colOfKey[k] = k; changed = true;
    }
    return changed;
  };
  return { add, fields: () => [...names], fieldMap: () => ({ ...keyOf }), size: () => names.length };
}
