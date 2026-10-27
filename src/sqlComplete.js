// Explorer › SQL mode completion — PURE (no React, no chrome.*), unit-tested.
//
// What the user is typing decides what is offered, like Salesforce Inspector does for SOQL:
//  · right after FROM / JOIN / UPDATE (or DELETE FROM): the environment's TABLES matching the
//    typed text (logical or display name);
//  · in the SELECT list, WHERE, ON, GROUP BY, HAVING, ORDER BY, SET: the COLUMNS of the table(s)
//    named after FROM / JOIN — nothing when there is no table yet or the table doesn't exist on
//    the org; `alias.` narrows to that table.
// The Explorer resolves the tables' columns (metadata, cached) and renders the list.

const KEYWORDS = new Set(["select", "from", "where", "join", "inner", "left", "right", "full", "cross", "outer", "on", "and", "or", "not", "group", "by", "order", "having", "top", "distinct", "as", "limit", "offset", "set", "update", "delete", "in", "like", "is", "null", "asc", "desc", "count", "sum", "avg", "min", "max", "between", "exists", "case", "when", "then", "else", "end", "with", "union", "all", "into", "values", "insert"]);
const IDENT = /^[A-Za-z_][\w]*$/;

// The tables of the statement: FROM / JOIN / UPDATE <table> [AS] [alias]. An alias must be an
// identifier that isn't a keyword ("FROM account WHERE" has no alias).
export function sqlTables(text) {
  const out = [];
  const re = /\b(from|join|update|into)\s+([A-Za-z_]\w*)(?:\s+(?:as\s+)?([A-Za-z_]\w*))?/gi;
  let m;
  while ((m = re.exec(text))) {
    const name = m[2].toLowerCase();
    if (KEYWORDS.has(name)) continue;
    const alias = m[3] && !KEYWORDS.has(m[3].toLowerCase()) ? m[3] : null;
    if (!out.some(t => t.name === name && (t.alias || null) === (alias || null))) out.push({ name, alias });
  }
  return out;
}

// Where the cursor is: { kind: "table" | "column" | null, word: { start, end, text, qualifier }, tables }
export function sqlContext(text, cursor) {
  const src = String(text || "");
  const pos = Math.max(0, Math.min(Number(cursor) || 0, src.length));
  const before = src.slice(0, pos);
  const tables = sqlTables(src);
  // inside a string literal: nothing to offer
  if (((before.match(/'/g) || []).length % 2) === 1) return { kind: null, word: null, tables };
  // the word under the cursor (identifier, possibly qualified: a.na|me)
  let start = pos;
  while (start > 0 && /[\w.]/.test(src[start - 1])) start--;
  let end = pos;
  while (end < src.length && /\w/.test(src[end])) end++;
  const raw = src.slice(start, pos);
  const dot = raw.lastIndexOf(".");
  const word = { start: dot >= 0 ? start + dot + 1 : start, end, text: dot >= 0 ? raw.slice(dot + 1) : raw, qualifier: dot >= 0 ? raw.slice(0, dot) : null };
  // the last clause keyword before the word
  const head = src.slice(0, word.start - (word.qualifier ? word.qualifier.length + 1 : 0));
  const kwRe = /\b(select|from|join|where|on|group\s+by|order\s+by|having|set|update|delete\s+from|top|and|or|into)\b/gi;
  let last = null, lastEnd = 0, m;
  while ((m = kwRe.exec(head))) { last = m[1].toLowerCase().replace(/\s+/g, " "); lastEnd = m.index + m[0].length; }
  if (!last) return { kind: null, word, tables };
  const between = head.slice(lastEnd);
  if (last === "from" || last === "join" || last === "update" || last === "delete from" || last === "into") {
    // the table name itself (first token after the keyword) → tables; after it (alias, next clause) → nothing
    return { kind: /^\s*$/.test(between) ? "table" : null, word, tables };
  }
  if (last === "top") return { kind: null, word, tables };
  if (word.qualifier && !IDENT.test(word.qualifier)) return { kind: null, word, tables };
  return { kind: "column", word, tables };
}

const norm = (s) => String(s || "").toLowerCase();
const rank = (name, display, typed) => {
  const t = norm(typed), n = norm(name), d = norm(display);
  if (!t) return 2;
  if (n.startsWith(t)) return 0;
  if (d.startsWith(t)) return 1;
  if (n.includes(t) || d.includes(t)) return 2;
  return -1;
};

// Tables matching the typed text — entities: [{ l, d }] (logical, display).
export function suggestTables(ctx, entities, limit = 15) {
  if (!ctx || ctx.kind !== "table") return [];
  const typed = ctx.word?.text || "";
  return (entities || [])
    .map(e => ({ e, r: rank(e.l, e.d, typed) }))
    .filter(x => x.r >= 0)
    .sort((a, b) => a.r - b.r || norm(a.e.l).localeCompare(norm(b.e.l)))
    .slice(0, limit)
    .map(({ e }) => ({ kind: "table", insert: e.l, label: e.l, detail: e.d !== e.l ? e.d : "", badge: e.tt && e.tt !== "Standard" ? e.tt : "" }));
}

// The tables whose columns apply at the cursor: the one named by `alias.`, else every table of
// the statement that exists on the org. [] when none (no FROM yet, unknown table, unknown alias).
export function columnScope(ctx, entities) {
  if (!ctx || ctx.kind !== "column") return [];
  const known = new Set((entities || []).map(e => norm(e.l)));
  const tables = (ctx.tables || []).filter(t => known.has(t.name));
  if (!tables.length) return [];
  if (ctx.word?.qualifier) {
    const q = norm(ctx.word.qualifier);
    return tables.filter(t => norm(t.alias) === q || t.name === q);
  }
  return tables;
}

// Columns matching the typed text — fieldsByTable: { [logical]: [{ l, d, t }] } (missing = not
// loaded yet → nothing for that table). With several tables in scope and no qualifier, the insert
// is prefixed by the table's alias (or name) so the server knows which table it belongs to.
export function suggestColumns(ctx, scope, fieldsByTable, limit = 15) {
  if (!ctx || ctx.kind !== "column" || !scope?.length) return [];
  const typed = ctx.word?.text || "";
  const multi = scope.length > 1 && !ctx.word?.qualifier;
  const out = [];
  for (const t of scope) {
    const fields = fieldsByTable?.[t.name];
    if (!Array.isArray(fields)) continue;
    const prefix = multi ? `${t.alias || t.name}.` : "";
    for (const f of fields) {
      const r = rank(f.l, f.d, typed);
      if (r < 0) continue;
      out.push({ kind: "column", r, insert: prefix + f.l, label: prefix + f.l, detail: [f.d !== f.l ? f.d : "", f.t].filter(Boolean).join(" · "), table: t.name });
    }
  }
  return out.sort((a, b) => a.r - b.r || norm(a.label).localeCompare(norm(b.label))).slice(0, limit).map(({ r, ...x }) => { void r; return x; });
}

// The text with the word under the cursor replaced by the suggestion, and where the cursor lands.
export function applySuggestion(text, word, insert) {
  const src = String(text || "");
  const start = word?.start ?? src.length, end = word?.end ?? src.length;
  const next = src.slice(0, start) + insert + src.slice(end);
  return { text: next, cursor: start + insert.length };
}
