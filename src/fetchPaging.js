// FetchXML paging and columns — pure. Paging with the server's cookie keeps every page as cheap
// as the first (page numbers alone make the server skip all earlier rows again, deep pages slow
// down and can time out); and a FetchXML's own attribute list says which columns exist even when
// the first rows have them all empty (the Web API leaves null attributes out of a row).

// The response annotation "<cookie pagenumber=… pagingcookie="%253ccookie…" …/>" → the inner cookie
// XML, decoded (it is URL-encoded twice). null when absent or unreadable.
export function cookieFrom(annotation) {
  const m = String(annotation || "").match(/pagingcookie="([^"]*)"/);
  if (!m) return null;
  try { return decodeURIComponent(decodeURIComponent(m[1])); } catch { return null; }
}

const xmlAttr = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// The query for page N: page (and, when known, paging-cookie) set on <fetch>, any previous values
// replaced — the old code added page="…" next to an existing one.
export function pagedFetchXml(xml, page, cookie) {
  const s = String(xml || "");
  const m = s.match(/<fetch\b([^>]*)>/i);
  if (!m) return s;
  let attrs = m[1].replace(/\s+page\s*=\s*(?:"[^"]*"|'[^']*')/i, "").replace(/\s+paging-cookie\s*=\s*(?:"[^"]*"|'[^']*')/i, "");
  const selfClose = /\/\s*$/.test(attrs);
  if (selfClose) attrs = attrs.replace(/\/\s*$/, "");
  attrs += ` page="${page}"` + (cookie ? ` paging-cookie="${xmlAttr(cookie)}"` : "");
  return s.replace(m[0], `<fetch${attrs}${selfClose ? "/" : ""}>`);
}

export const isCookieMismatch = (msg) => /paging cookie/i.test(String(msg || ""));

// The columns a FetchXML asks for: { cols: [{ name, keys }], complete } — keys = where the Web API
// puts the value in a row (a lookup comes back as _x_value); link-entity columns are named
// alias.attribute. complete = false when some columns can only be discovered from the rows
// (<all-attributes/>, a link-entity without an alias).
export function fetchXmlColumns(xml) {
  const s = String(xml || "");
  const root = s.match(/<entity\b[^>]*>([\s\S]*)<\/entity>/i);
  if (!root) return { cols: [], complete: false };
  let body = root[1];
  const linkCols = [];
  let complete = true;
  const attrOf = (tag, a) => (tag.match(new RegExp(`\\b${a}\\s*=\\s*"([^"]*)"`, "i")) || [])[1];
  // link-entities first (innermost first, nested ones flattened), then removed so only the root's
  // own attributes remain in the body
  const linkRe = /<link-entity\b([^>]*?)(\/>|>((?:(?!<link-entity\b)[\s\S])*?)<\/link-entity>)/i;
  let lm;
  while ((lm = body.match(linkRe))) {
    const alias = attrOf(lm[1], "alias");
    const inner = lm[3] || "";
    if (/<all-attributes\s*\/?>/i.test(inner)) complete = false;
    for (const a of inner.match(/<attribute\b[^>]*\/?>/gi) || []) {
      const n = attrOf(a, "name"), al = attrOf(a, "alias");
      if (!n) continue;
      if (al) linkCols.push({ name: al, keys: [al] });
      else if (alias) linkCols.push({ name: `${alias}.${n}`, keys: [`${alias}.${n}`, `${alias}._${n}_value`] });
      else complete = false;
    }
    body = body.replace(lm[0], "");
  }
  if (/<all-attributes\s*\/?>/i.test(body)) complete = false;
  const rootCols = [];
  for (const a of body.match(/<attribute\b[^>]*\/?>/gi) || []) {
    const n = attrOf(a, "name"), al = attrOf(a, "alias");
    if (!n) continue;
    rootCols.push(al ? { name: al, keys: [al] } : { name: n, keys: [n, `_${n}_value`] });
  }
  return { cols: [...rootCols, ...linkCols], complete: complete && rootCols.length + linkCols.length > 0 };
}

// Header columns for a stream: the declared ones (when any), then every column the first page
// shows that none of them covers. Keys ending __display / __entity, and annotations, are values of
// a column, not columns.
export function streamColumns(declared, firstRows) {
  const cols = (declared || []).map(c => ({ name: c.name, keys: [...c.keys] }));
  const covered = new Set(cols.flatMap(c => c.keys));
  for (const r of firstRows || []) {
    for (const k of Object.keys(r || {})) {
      if (covered.has(k) || k.includes("@") || k.endsWith("__display") || k.endsWith("__entity") || k === "__error") continue;
      covered.add(k);
      cols.push({ name: k, keys: [k] });
    }
  }
  return cols;
}

// A row key no column covers (once the header is written, a new column can't join the file).
export function uncoveredKey(cols, row) {
  const covered = new Set(cols.flatMap(c => c.keys));
  for (const k of Object.keys(row || {})) {
    if (covered.has(k) || k.includes("@") || k.endsWith("__display") || k.endsWith("__entity") || k === "__error") continue;
    return k;
  }
  return null;
}

// ── Column ORDER follows the query, not the payload ──────────────────────────────────────────
// The Web API lays a row's properties out in ITS order (metadata order, annotations between);
// the grid and every export must show the columns in the order the QUERY named them — the
// Builder's SELECT, the FetchXML's attributes, a SQL SELECT list, an OData $select. Columns the
// query doesn't name (expands, SELECT *) follow in the order the rows show them.

// The columns of a SQL SELECT list: [{ name, keys }] in order. "a.name" → name, keys a.name /
// name / _name_value; "x AS y" → y; an aggregate without alias has no known key → skipped (it is
// appended from the rows). SELECT * → [].
export function sqlSelectColumns(sql) {
  const s = String(sql || "");
  const m = s.match(/^\s*select\s+(?:(?:distinct|top\s+\d+)\s+)*([\s\S]*?)\s+from\b/i);
  if (!m) return [];
  const items = [];
  let depth = 0, cur = "";
  for (const ch of m[1]) {
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    if (ch === "," && depth === 0) { items.push(cur); cur = ""; } else cur += ch;
  }
  items.push(cur);
  const out = [];
  for (const raw of items) {
    const item = raw.trim();
    if (!item || item === "*" || /\.\*$/.test(item)) continue;
    const al = item.match(/\s+as\s+([A-Za-z_]\w*)\s*$/i) || item.match(/^(?:[A-Za-z_][\w.]*|[A-Za-z_]\w*\s*\([^)]*\))\s+([A-Za-z_]\w*)\s*$/i);
    if (al) { out.push({ name: al[1], keys: [al[1]] }); continue; }
    const col = item.match(/^([A-Za-z_][\w]*)(?:\.([A-Za-z_]\w*))?$/);
    if (!col) continue; // an expression without alias: the server names it
    const last = col[2] || col[1];
    out.push({ name: last, keys: col[2] ? [item, last, `_${last}_value`] : [last, `_${last}_value`] });
  }
  return out;
}

// The columns an OData query names in $select: [{ name, keys }] (a lookup lands in _x_value).
export function odataSelectColumns(pathOrUrl) {
  const sel = ((String(pathOrUrl || "").match(/[?&]\$select=([^&]*)/i) || [])[1] || "");
  let dec = sel;
  try { dec = decodeURIComponent(sel); } catch { /* keep as is */ }
  return dec.split(",").map(x => x.trim()).filter(Boolean).map(n => ({ name: n, keys: [n, `_${n}_value`] }));
}

// discovered: the column keys found in the rows (in payload order); declared: [{ name, keys }]
// from the query. Returns the discovered keys, the declared ones first in the query's order (each
// through the key it actually has in the rows), then the rest as they came.
export function orderColumns(discovered, declared) {
  const have = new Set(discovered || []);
  const out = [];
  const used = new Set();
  for (const d of declared || []) {
    const k = (d.keys || [d.name]).find(x => have.has(x) && !used.has(x));
    if (k) { out.push(k); used.add(k); }
  }
  for (const k of discovered || []) if (!used.has(k)) { out.push(k); used.add(k); }
  return out;
}
