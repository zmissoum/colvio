// Demo org for the Data Explorer — PURE (no React, no DOM, no network), unit-tested.
//
// SQL: the demo org holds rows for ONE table, account (shared.jsx ROWS / FLDS). demoSqlAnswer
// runs a SELECT on them the way the server would answer it: the columns the SELECT names, in its
// order, under their alias; WHERE, ORDER BY, TOP, DISTINCT, GROUP BY with COUNT / SUM / AVG / MIN /
// MAX. A column the table doesn't have is refused with the server's words (worded like the SQL
// endpoint's "Invalid column name" for ⚡ Native — the ?sql= wording itself is unverified — and
// like FetchXML's "entity doesn't contain attribute" for ⇄ Transpiled). What the native engine
// doesn't take (SELECT *, TOP, HAVING — sqlNative.js / the engine's tooltip) is refused there.
// Another table, or a JOIN, is answered honestly: the demo has no rows for it.
//
// Views: checkViewFetchXml reads a view's FetchXML against the demo metadata (schemaDemo.js
// columns, passed in) the way Dataverse validates a userquery: every attribute, condition, sort
// column and link-entity from / to must exist on its table — a table the demo has no metadata for
// is not checked.
import { parseSqlToAst } from "./sqlToFetchXml.js";

export const DEMO_SQL_TABLE = "account";

const OPTION_TYPES = new Set(["Picklist", "State", "Status"]);
const NUMBER_TYPES = new Set(["Money", "Integer", "Decimal", "Double", "BigInt"]);
const blank = (v) => v === null || v === undefined || v === "";

// The server's words for a column the table doesn't have, per engine.
export function unknownColumnError(engine, table, col) {
  return engine === "native"
    ? `Invalid column name '${col}'.`
    : `'${table}' entity doesn't contain attribute with Name = '${col}' and NameMapping = 'Logical'.`;
}

// name (any case; a lookup as x or _x_value) → the demo field
function fieldIndex(fields) {
  const by = new Map();
  for (const f of fields || []) {
    by.set(String(f.l).toLowerCase(), f);
    const m = /^_(.+)_value$/.exec(f.l);
    if (m) by.set(m[1].toLowerCase(), f);
  }
  return (name) => by.get(String(name || "").toLowerCase()) || null;
}

const optionValue = (f, label) => {
  const o = (f.opts || []).find(x => String(x.l).toLowerCase() === String(label).toLowerCase());
  return o ? o.v : undefined;
};

// A comparable form of a row's value: an option's number, a number, or lowercased text (the
// server's collation is case-insensitive). null for an empty value.
function sortKey(f, v) {
  if (blank(v)) return null;
  if (f && OPTION_TYPES.has(f.t)) { const n = optionValue(f, v); return n === undefined ? String(v).toLowerCase() : n; }
  if (typeof v === "number") return v;
  if (f && NUMBER_TYPES.has(f.t) && !Number.isNaN(Number(v))) return Number(v);
  return String(v).toLowerCase();
}
// a literal of the query against a row's value: an option column takes its number or its label
function literalKey(f, lit) {
  if (f && OPTION_TYPES.has(f.t)) {
    if (/^-?\d+(\.\d+)?$/.test(String(lit))) return Number(lit);
    const n = optionValue(f, lit);
    return n === undefined ? String(lit).toLowerCase() : n;
  }
  if (f && NUMBER_TYPES.has(f.t) && /^-?\d+(\.\d+)?$/.test(String(lit))) return Number(lit);
  return String(lit).toLowerCase();
}
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const likeRe = (pat) => new RegExp(`^${String(pat).replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/%/g, ".*").replace(/_/g, ".")}$`, "is");

// SELECT on the demo rows → { fields: [column names, in the SELECT's order], data: [rows keyed by
// those names] } or { error } (the text the Explorer shows, as it shows the server's).
export function demoSqlAnswer(sql, { engine = "native", rows = [], fields = [], table = DEMO_SQL_TABLE } = {}) {
  let ast;
  try { ast = parseSqlToAst(String(sql || "").trim().replace(/;+\s*$/, "")); }
  catch (e) { return { error: `Demo mode can't read this query (${e.message}) — it answers SELECTs on ${table}: columns and aliases, WHERE, ORDER BY, TOP, DISTINCT, GROUP BY with COUNT / SUM / AVG / MIN / MAX.` }; }
  const from = String(ast.from || "").toLowerCase();
  if (from !== table) return { error: `The demo org holds rows for ${table} only — this query reads ${ast.from}.` };
  if (ast.joins.length) return { error: `The demo org holds rows for ${table} only — a JOIN has no related rows to read here.` };
  if (engine === "native") {
    if (ast.select.some(s => s.expr === "*")) return { error: "SELECT * isn't supported by native SQL — name the columns, or switch to ⇄ Transpiled." };
    if (ast.top != null) return { error: "TOP isn't supported by native SQL — switch to ⇄ Transpiled for a row limit." };
    if (ast.having.length) return { error: "HAVING isn't supported by native SQL — switch to ⇄ Transpiled (Colvio applies it after the query)." };
  }
  const find = fieldIndex(fields);
  const own = new Set([from, String(ast.fromAlias || "").toLowerCase()].filter(Boolean));
  // "a.name" / "name" → the field, or the refusal the server would give
  const resolve = (name) => {
    const parts = String(name).split(".");
    if (parts.length > 1 && !own.has(parts[0].toLowerCase())) return { error: `The multi-part identifier "${name}" could not be bound.` };
    const col = parts[parts.length - 1];
    const f = find(col);
    return f ? { f, col } : { error: unknownColumnError(engine, table, col) };
  };

  // the output columns, every name checked before a row is read
  const out = [];
  if (ast.select.some(s => s.expr === "*")) {
    for (const f of fields) out.push({ name: f.l, f });
  } else {
    for (const s of ast.select) {
      if (s.expr === "aggregate") {
        let f = null;
        if (s.col !== "*") { const r = resolve(s.col); if (r.error) return { error: r.error }; f = r.f; }
        out.push({ name: s.alias, agg: s.fn, f });
        continue;
      }
      const r = resolve(s.name);
      if (r.error) return { error: r.error };
      out.push({ name: s.alias || r.col, f: r.f });
    }
  }
  const groups = [];
  for (const g of ast.groupBy) { const r = resolve(g); if (r.error) return { error: r.error }; groups.push(r.f); }
  const aggregate = out.some(o => o.agg);
  if (aggregate || groups.length) {
    const loose = out.find(o => !o.agg && !groups.includes(o.f));
    if (loose) return { error: `Column '${table}.${loose.f.l}' is invalid in the select list because it is not contained in either an aggregate function or the GROUP BY clause.` };
  }

  // WHERE: every column checked first, then each row tested (SQL's NULL compares to nothing)
  const conds = [];
  const walk = (n) => { if (!n) return; if (n.type === "logic") n.children.forEach(walk); else conds.push(n); };
  walk(ast.where);
  for (const c of conds) { const r = resolve(c.attribute); if (r.error) return { error: r.error }; c._f = r.f; }
  const test = (n, row) => {
    if (!n) return true;
    if (n.type === "logic") return n.op === "and" ? n.children.every(x => test(x, row)) : n.children.some(x => test(x, row));
    const f = n._f, raw = row[f.l];
    switch (n.operator) {
      case "null": return blank(raw);
      case "not-null": return !blank(raw);
      case "like": return !blank(raw) && likeRe(n.value).test(String(raw));
      case "not-like": return !blank(raw) && !likeRe(n.value).test(String(raw));
      case "in": return !blank(raw) && n.values.some(v => sortKey(f, raw) === literalKey(f, v));
      case "not-in": return !blank(raw) && !n.values.some(v => sortKey(f, raw) === literalKey(f, v));
      default: {
        if (blank(raw)) return false;
        const c = cmp(sortKey(f, raw), literalKey(f, n.value));
        return { eq: c === 0, ne: c !== 0, gt: c > 0, ge: c >= 0, lt: c < 0, le: c <= 0 }[n.operator] ?? false;
      }
    }
  };
  const picked = (rows || []).filter(r => test(ast.where, r));

  // ORDER BY: an alias of the SELECT or a column of the table (shown or not); empty values first,
  // as the server sorts them ascending
  const sortSpec = [];
  for (const ob of ast.orderBy) {
    const al = out.find(c => c.name.toLowerCase() === String(ob.col).toLowerCase());
    if (al) { sortSpec.push({ name: al.name, f: al.agg ? null : al.f, desc: ob.dir === "DESC" }); continue; }
    const r = resolve(ob.col);
    if (r.error) return { error: r.error };
    const shown = out.find(c => !c.agg && c.f === r.f);
    if ((aggregate || groups.length) && !shown) return { error: `Column '${table}.${r.f.l}' is invalid in the ORDER BY clause because it is not contained in either an aggregate function or the GROUP BY clause.` };
    sortSpec.push({ name: shown?.name, f: r.f, desc: ob.dir === "DESC" });
  }
  // get(o) reads the sort value of a row: a source row (before the projection) or an output row
  const sortBy = (list, get) => [...list].sort((a, b) => {
    for (const k of sortSpec) {
      const x = get(a, k), y = get(b, k);
      const c = x === null ? (y === null ? 0 : -1) : y === null ? 1 : cmp(x, y);
      if (c) return k.desc ? -c : c;
    }
    return 0;
  });
  const project = (rs) => rs.map(r => { const o = {}; for (const c of out) o[c.name] = r[c.f.l] ?? null; return o; });

  let data;
  if (aggregate || groups.length) {
    const byKey = new Map();
    for (const r of picked) {
      const k = JSON.stringify(groups.map(f => r[f.l] ?? null));
      if (!byKey.has(k)) byKey.set(k, []);
      byKey.get(k).push(r);
    }
    if (!groups.length && !byKey.size) byKey.set("[]", []); // an aggregate over no row is still one row
    data = [...byKey.values()].map(rs => {
      const o = {};
      for (const c of out) {
        if (!c.agg) { o[c.name] = rs[0]?.[c.f.l] ?? null; continue; }
        const vals = c.f ? rs.map(r => r[c.f.l]).filter(v => !blank(v)) : rs;
        const nums = vals.map(Number).filter(n => !Number.isNaN(n));
        const sum = nums.reduce((x, y) => x + y, 0);
        const ordered = c.f ? [...vals].sort((x, y) => cmp(sortKey(c.f, x), sortKey(c.f, y))) : [];
        o[c.name] = c.agg === "COUNT" ? vals.length
          : c.agg === "SUM" ? (nums.length ? sum : null)
          : c.agg === "AVG" ? (nums.length ? sum / nums.length : null)
          : c.agg === "MIN" ? (ordered.length ? ordered[0] : null)
          : (ordered.length ? ordered[ordered.length - 1] : null);
      }
      return o;
    });
    for (const h of ast.having) {
      const op = { eq: (x, y) => x === y, ne: (x, y) => x !== y, gt: (x, y) => x > y, ge: (x, y) => x >= y, lt: (x, y) => x < y, le: (x, y) => x <= y }[h.operator];
      data = data.filter(r => op(Number(r[h.alias]) || 0, Number(h.value)));
    }
    if (sortSpec.length) data = sortBy(data, (o, k) => sortKey(k.f, o[k.name]));
  } else {
    data = project(sortSpec.length ? sortBy(picked, (r, k) => sortKey(k.f, r[k.f.l])) : picked);
  }
  if (ast.distinct) {
    const seen = new Set();
    data = data.filter(o => { const k = JSON.stringify(out.map(c => o[c.name])); if (seen.has(k)) return false; seen.add(k); return true; });
  }
  if (ast.top != null) data = data.slice(0, Math.max(0, ast.top));
  return { fields: out.map(c => c.name), data };
}

// ── Save as view ────────────────────────────────────────────────────────────────────────────
const attrOf = (tag, a) => (tag.match(new RegExp(`\\b${a}\\s*=\\s*"([^"]*)"`, "i")) || [])[1];

// A view's FetchXML read against the demo metadata. columnsOf(table) → [logical names] or null
// (no demo metadata: that table isn't checked). → { ok: true } | { error } in Dataverse's words.
export function checkViewFetchXml(fetchxml, columnsOf) {
  const fx = String(fetchxml || "");
  const colsCache = new Map();
  const colsOf = (t) => {
    if (!colsCache.has(t)) {
      const list = columnsOf(t);
      colsCache.set(t, list ? new Set(list.flatMap(c => { const l = String(c).toLowerCase(); const m = /^_(.+)_value$/.exec(l); return m ? [l, m[1]] : [l]; })) : null);
    }
    return colsCache.get(t);
  };
  const missing = (table, a) => ({ error: `'${table}' entity doesn't contain attribute with Name = '${a}' and NameMapping = 'Logical'.` });
  // aliases first: a condition can name a link-entity (entityname) declared after it
  const aliases = new Map();
  for (const m of fx.matchAll(/<link-entity\b([^>]*?)\/?>/gi)) { const al = attrOf(m[1], "alias"); if (al) aliases.set(al.toLowerCase(), attrOf(m[1], "name")); }
  const stack = [];
  for (const m of fx.matchAll(/<(\/?)([A-Za-z-]+)\b([^>]*?)(\/?)>/g)) {
    const [, close, tagName, rest, self] = m;
    const tag = tagName.toLowerCase();
    if (close) { if (tag === "entity" || tag === "link-entity") stack.pop(); continue; }
    const scope = stack[stack.length - 1] || null;
    if (tag === "entity" || tag === "link-entity") {
      const table = attrOf(rest, "name") || "";
      if (tag === "link-entity") {
        const from = attrOf(rest, "from"), to = attrOf(rest, "to"), own = colsOf(table);
        if (from && own && !own.has(from.toLowerCase())) return missing(table, from);
        if (to && scope?.cols && !scope.cols.has(to.toLowerCase())) return missing(scope.table, to);
      }
      if (!self) stack.push({ table, cols: colsOf(table) });
      continue;
    }
    if (tag !== "attribute" && tag !== "order" && tag !== "condition") continue;
    const a = attrOf(rest, tag === "attribute" ? "name" : "attribute");
    if (!a) continue;
    let s = scope;
    const en = tag === "condition" ? attrOf(rest, "entityname") : null;
    if (en) { const t = aliases.get(en.toLowerCase()); s = t ? { table: t, cols: colsOf(t) } : null; }
    if (s?.cols && !s.cols.has(a.toLowerCase())) return missing(s.table, a);
  }
  return { ok: true };
}

// The demo's userquery create: checked like the server, then a new id (one per save).
export function createDemoViews(columnsOf) {
  let n = 0;
  const saved = [];
  return {
    create(view) {
      const chk = checkViewFetchXml(view?.fetchxml, columnsOf);
      if (chk.error) throw new Error(chk.error);
      const id = `00000000-0000-4000-8000-${(0xc0de + n++).toString(16).padStart(12, "0")}`;
      saved.push({ id, name: view.name, entity: view.entity, fetchxml: view.fetchxml, layoutxml: view.layoutxml });
      return { id };
    },
    list: () => saved.map(v => ({ ...v })),
  };
}

// ── Builder EXPAND ──────────────────────────────────────────────────────────────────────────
// The demo's related records: each account's owner (the user's full name the demo rows carry) and
// its primary contact. Any other related column is empty — the demo org has no other related rows.
export const DEMO_PRIMARY_CONTACTS = {
  "a1b2c3d4-e5f6-7890-abcd-ef1234567890": { fullname: "Claire Fontaine", emailaddress1: "claire.fontaine@acme.fr", telephone1: "+33 1 42 68 53 10", jobtitle: "Purchasing Director" },
  "b2c3d4e5-f6a7-8901-bcde-f12345678901": { fullname: "Jonas Weber", emailaddress1: "j.weber@globex.de", telephone1: "+49 30 1234500", jobtitle: "Head of IT" },
  "c3d4e5f6-a7b8-9012-cdef-123456789012": { fullname: "Lucius Fox", emailaddress1: "lucius.fox@wayne.com", telephone1: "+1 415 555 1200", jobtitle: "CEO" },
  "d4e5f6a7-b8c9-0123-defa-234567890123": { fullname: "Pepper Potts", emailaddress1: "pepper.potts@stark.com", telephone1: "+1 212 555 9800", jobtitle: "COO" },
  "e5f6a7b8-c9d0-1234-efab-345678901234": { fullname: "Bill Lumbergh", emailaddress1: "bill.lumbergh@initech.com", telephone1: "+44 207 123 400", jobtitle: "Division VP" },
  "f6a7b8c9-d0e1-2345-fabc-456789012345": { fullname: "Albert Wesker", emailaddress1: "a.wesker@umbrella.co.jp", telephone1: "+81 3 1234 5600", jobtitle: "Research Lead" },
};

// The Builder's expands on the demo rows → { fields: the "<table>.<column>" columns, as the live
// grid names them; data: the rows with those columns filled where the demo knows the record }.
export function demoExpandColumns(rows, expands) {
  const cols = [];
  for (const ex of expands || []) for (const f of ex.fields || []) {
    const valueOf = (r) => {
      if (ex.type === "collection") return null; // no child rows in the demo org
      if (ex.targetEntity === "systemuser" && ex.lookupField === "ownerid" && f === "fullname") return r._ownerid_value ?? null;
      if (ex.targetEntity === "contact" && ex.lookupField === "primarycontactid") return DEMO_PRIMARY_CONTACTS[r.accountid]?.[f] ?? null;
      return null;
    };
    cols.push({ name: `${ex.targetEntity}.${f}`, valueOf });
  }
  return { fields: cols.map(c => c.name), data: (rows || []).map(r => { const o = { ...r }; for (const c of cols) o[c.name] = c.valueOf(r); return o; }) };
}
