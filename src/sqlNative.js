// Native Dataverse SQL support (Web API `?sql=` query option) — PURE, unit-tested.
//
// Dataverse executes a single SELECT server-side when passed URL-encoded via
// GET /api/data/v9.2/<entityset>?sql=... (entity set = the query's BASE table).
// Response is normal OData (value[], annotations, @odata.nextLink paging).
// Supported per MS docs: explicit columns + aliases, DISTINCT, INNER/LEFT JOIN
// (multi-table, self-joins; ON must be col = col), WHERE col-vs-constant with
// =,!=,<>,<,>,<=,>=,LIKE,IN,BETWEEN,IS NULL,AND/OR/parens, ORDER BY columns,
// GROUP BY + COUNT/SUM/AVG/MIN/MAX (50k aggregate cap), DATEADD/GETUTCDATE on
// literals. NOT supported: SELECT *, subqueries, HAVING, UNION, RIGHT/FULL/CROSS
// JOIN, CASE, column-to-column comparisons, functions on columns.

// The entity set for the URL comes from the FIRST table after FROM ("FROM account AS a"
// → "account"). Returns lowercase logical name, or null when no FROM is found.
export function extractBaseTable(sql) {
  const m = /\bFROM\s+([A-Za-z_][A-Za-z0-9_]*)/i.exec(sql || "");
  return m ? m[1].toLowerCase() : null;
}

// History privacy — same promise as OData history ($filter values never persist):
// string literals ('jane@x.com', doubled '' quotes included) collapse to '...' and
// standalone numeric literals to "...". Identifiers with embedded digits (telephone1,
// address1_city) are untouched: their digits have no word boundary before them.
export function redactSql(sql) {
  return String(sql || "")
    .replace(/'(?:[^']|'')*'/g, "'...'")
    .replace(/\b\d+(?:\.\d+)?\b/g, "...");
}

// Does this server error mean the org doesn't HAVE the sql query option (older
// deployment) — as opposed to a genuine SQL error the user must see? Only the
// former may trigger the silent FetchXML fallback: swallowing a real SQL error
// and re-running a transpilation would mask the server's diagnosis.
export function isSqlOptionUnsupported(msg) {
  const s = String(msg || "");
  // 'sql' must appear AS the option/parameter/property name -- a genuine SQL error that merely
  // mentions "SQL" ("HAVING is not supported in SQL queries") must NOT match.
  return (/(query (option|parameter)|property( named)?)\s*['"]?sql\b/i.test(s) && /not supported|not recognized|invalid|could not find/i.test(s))
    || /['"]sql['"] is not (supported|recognized)/i.test(s);
}
