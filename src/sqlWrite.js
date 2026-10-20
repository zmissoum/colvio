// Explorer › SQL — UPDATE and DELETE on ONE table, always previewed: the statement becomes the
// SELECT of the rows it would touch (run through the same SQL engine as any query), and only the
// rows of that preview are written. Constant values only (text in quotes, numbers, NULL,
// TRUE/FALSE); a WHERE is mandatory. Pure — parsing, preview SQL, typed bodies.

const NAME = "[A-Za-z_][A-Za-z0-9_]*";

// Scan text outside single-quoted strings ('' = an escaped quote): finds top-level keyword
// positions and splits on top-level commas.
function scan(s, onChar) {
  let inStr = false, depth = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inStr) { if (c === "'") { if (s[i + 1] === "'") { i++; continue; } inStr = false; } continue; }
    if (c === "'") { inStr = true; continue; }
    if (c === "(") depth++;
    else if (c === ")") depth--;
    if (onChar(c, i, depth) === false) return;
  }
}
function findKeyword(s, word) {
  let at = -1;
  const re = new RegExp(`^${word}\\b`, "i");
  scan(s, (c, i, depth) => {
    if (depth === 0 && /\s/.test(s[i - 1] ?? " ") && re.test(s.slice(i))) { at = i; return false; }
    return true;
  });
  return at;
}
function splitTop(s, sep = ",") {
  const out = []; let last = 0;
  scan(s, (c, i, depth) => { if (c === sep && depth === 0) { out.push(s.slice(last, i)); last = i + 1; } return true; });
  out.push(s.slice(last));
  return out.map(x => x.trim()).filter(Boolean);
}

// A constant → { value, sql } (value: what the typed-write code receives; sql: how it displays).
export function parseValue(text) {
  const t = String(text || "").trim();
  if (/^null$/i.test(t)) return { value: null, sql: "NULL" };
  if (/^(true|false)$/i.test(t)) return { value: t.toLowerCase() === "true", sql: t.toUpperCase() };
  if (/^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(t)) return { value: Number(t), raw: t, sql: t };
  const m = t.match(/^N?'((?:[^']|'')*)'$/s);
  if (m) return { value: m[1].replace(/''/g, "'"), sql: t };
  return { error: `"${t}" isn't a constant — use text in single quotes, a number, NULL, TRUE or FALSE (expressions and other columns aren't supported).` };
}

const NO_WHERE = (kind, table) => `Add a WHERE: ${kind} without one would touch every row of ${table}. To do that on purpose, write WHERE <primary key> IS NOT NULL.`;

// → null (not a write statement) | { error } | { kind: "update", table, alias, sets: [{ col, value, sql }], where } | { kind: "delete", table, alias, where }
// "-- …" to the end of the line, outside string literals only (a '--' inside quotes is data).
function stripLineComments(t) {
  let out = "", q = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) { out += c; if (c === "'") { if (t[i + 1] === "'") { out += "'"; i++; } else q = false; } continue; }
    if (c === "'") { q = true; out += c; continue; }
    if (c === "-" && t[i + 1] === "-") { while (i < t.length && t[i] !== "\n") i++; out += "\n"; continue; }
    out += c;
  }
  return out;
}

export function parseSqlWrite(sql) {
  let s = stripLineComments(String(sql || "")).trim().replace(/;\s*$/, "").trim();
  if (!/^(update|delete)\b/i.test(s)) return null;
  if (/^update\b/i.test(s)) {
    const m = s.match(new RegExp(`^UPDATE\\s+(${NAME})(?:\\s+(?:AS\\s+)?(?!SET\\b)(${NAME}))?\\s+SET\\s+([\\s\\S]+)$`, "i"));
    if (!m) return { error: "Expected UPDATE <table> SET column = value[, …] WHERE <condition>." };
    const [, table, alias, rest] = m;
    if (findKeyword(rest, "FROM") >= 0 || findKeyword(rest, "JOIN") >= 0) return { error: "UPDATE … FROM / JOIN isn't supported — filter on this table's own columns in the WHERE." };
    const w = findKeyword(rest, "WHERE");
    if (w < 0) return { error: NO_WHERE("UPDATE", table) };
    const setPart = rest.slice(0, w).trim(), where = rest.slice(w + 5).trim();
    if (!where) return { error: NO_WHERE("UPDATE", table) };
    const sets = [];
    for (const a of splitTop(setPart)) {
      const am = a.match(new RegExp(`^(?:${NAME}\\.)?(${NAME})\\s*=\\s*([\\s\\S]+)$`));
      if (!am) return { error: `Can't read "${a}" — expected column = value.` };
      const v = parseValue(am[2]);
      if (v.error) return { error: v.error };
      if (sets.some(x => x.col.toLowerCase() === am[1].toLowerCase())) return { error: `"${am[1]}" is set twice.` };
      sets.push({ col: am[1], value: v.value, sql: v.sql, raw: v.raw });
    }
    if (!sets.length) return { error: "Nothing to SET." };
    return { kind: "update", table, alias: alias || null, sets, where };
  }
  const m = s.match(new RegExp(`^DELETE\\s+(?:FROM\\s+)?(${NAME})(?:\\s+(?:AS\\s+)?(?!WHERE\\b|JOIN\\b|INNER\\b|LEFT\\b|RIGHT\\b|FULL\\b|CROSS\\b)(${NAME}))?(?:\\s+([\\s\\S]*))?$`, "i"));
  if (!m) return { error: "Expected DELETE FROM <table> WHERE <condition>." };
  const [, table, alias, rest = ""] = m;
  if (/^top\b/i.test(table)) return { error: "DELETE TOP isn't supported — narrow the WHERE instead." };
  const w = findKeyword(" " + rest, "WHERE");
  if (w < 0) return { error: NO_WHERE("DELETE", table) };
  const where = (" " + rest).slice(w + 5).trim();
  if (!where) return { error: NO_WHERE("DELETE", table) };
  if (findKeyword(" " + rest.slice(0, Math.max(0, w - 1)), "JOIN") >= 0) return { error: "DELETE with a JOIN isn't supported — filter on this table's own columns." };
  return { kind: "delete", table, alias: alias || null, where };
}

// The SELECT whose rows the statement would touch: the key, the record's name, and (UPDATE) the
// current value of every column it sets.
export function previewSelect(plan, primaryId, primaryName) {
  const cols = [primaryId];
  if (primaryName && primaryName !== primaryId) cols.push(primaryName);
  if (plan.kind === "update") for (const st of plan.sets) if (!cols.some(c => c.toLowerCase() === st.col.toLowerCase())) cols.push(st.col);
  return `SELECT ${cols.join(", ")} FROM ${plan.table}${plan.alias ? ` AS ${plan.alias}` : ""} WHERE ${plan.where}`;
}

export const describeSets = (sets) => (sets || []).map(st => `${st.col} = ${st.sql}`).join(", ");

// The string the typed-write preparation (updateUtils.prepareUpdate) expects for a constant.
export function rawForPrepare(st) {
  if (st.value === null) return "";
  if (typeof st.value === "boolean") return st.value ? "true" : "false";
  if (typeof st.value === "number") return st.raw ?? String(st.value);
  return st.value;
}

// Field types and lookup bindings of a table — what prepareUpdate needs to type a value or bind a
// lookup. fields = [{ l, odata, t, target }], lookups = [{ navProperty, targetEntity, lookupField, type }].
export function updateMetaFor(fields, lookups, entities) {
  const fieldTypes = {}, lookupBinds = {};
  for (const f of fields || []) {
    fieldTypes[f.l] = f.t; if (f.odata) fieldTypes[f.odata] = f.t;
    if (f.t === "Lookup" || f.t === "Owner" || f.t === "Customer") {
      let navs = (lookups || []).filter(lk => lk.type !== "collection" && lk.lookupField === f.l)
        .map(n => ({ nav: n.navProperty, target: n.targetEntity, set: (entities || []).find(e2 => e2.l === n.targetEntity)?.p || null }));
      if (!navs.length && f.target) { // demo fields carry a plain target instead of relationship rows
        const base = f.l.replace(/^_/, "").replace(/_value$/, "");
        navs = [{ nav: base, target: f.target, set: (entities || []).find(e2 => e2.l === f.target)?.p || f.target + "s" }];
      }
      if (navs.length) { lookupBinds[f.l] = navs; if (f.odata) lookupBinds[f.odata] = navs; }
    }
  }
  return { fieldTypes, lookupBinds };
}
