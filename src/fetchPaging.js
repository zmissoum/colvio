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
  let attrs = m[1].replace(/\s+page\s*=\s*"[^"]*"/i, "").replace(/\s+paging-cookie\s*=\s*"[^"]*"/i, "");
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
