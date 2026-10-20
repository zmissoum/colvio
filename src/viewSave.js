// Explorer › "Save as view": a query becomes a personal view (userquery) of its table — the FetchXML
// a view runs, and the layout (its columns) the app shows. Builder queries are converted to FetchXML
// here; FetchXML and SQL (through the transpiler) already are. Pure.

export const xmlEsc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

// Builder operator → FetchXML condition. Text matching becomes like / not-like.
const LIKE = {
  contains: ["like", (v) => `%${v}%`], startswith: ["like", (v) => `${v}%`], endswith: ["like", (v) => `%${v}`],
  not_contains: ["not-like", (v) => `%${v}%`], not_startswith: ["not-like", (v) => `${v}%`], not_endswith: ["not-like", (v) => `%${v}`],
};
const CMP = new Set(["eq", "ne", "gt", "ge", "lt", "le"]);
const TEXT = new Set(["String", "Memo"]);

function condition(c, type) {
  const f = c.field;
  if (!NAME_RE.test(String(f || ""))) return { error: `"${f}" isn't a column name.` };
  if (c.op === "is_null") return { xml: `<condition attribute="${f}" operator="null"/>` };
  if (c.op === "is_not_null") return { xml: `<condition attribute="${f}" operator="not-null"/>` };
  const raw = String(c.value ?? "");
  if (!raw) return { xml: "" };
  let op = c.op;
  // like the OData Builder: text operators on a non-text column compare for equality
  if (LIKE[op] && !TEXT.has(type)) op = op.startsWith("not_") ? "ne" : "eq";
  if (LIKE[op]) { const [fop, wrap] = LIKE[op]; return { xml: `<condition attribute="${f}" operator="${fop}" value="${xmlEsc(wrap(raw))}"/>` }; }
  if (!CMP.has(op)) return { error: `The "${op}" condition on ${f} can't be saved in a view.` };
  let v = raw.trim();
  if (type === "Boolean") v = v === "true" ? "1" : v === "false" ? "0" : v;
  return { xml: `<condition attribute="${f}" operator="${op}" value="${xmlEsc(v)}"/>` };
}

// The Builder's query → FetchXML. Related-table parts (expands, relational filters) aren't
// converted: they're refused with the reason instead of saving a different query.
export function builderToFetchXml({ entity, attrs, groups, groupLogic = "and", orderBy, fieldTypes = {}, hasExpands = false, hasRelFilters = false }) {
  if (!NAME_RE.test(String(entity || ""))) return { error: "No table selected." };
  if (hasExpands || hasRelFilters) return { error: "This query uses related tables (expanded lookups or relational filters) — a view saved from the Builder can't carry them yet. Build it in FetchXML mode (link-entity) and save from there." };
  const cols = (attrs || []).filter(a => NAME_RE.test(a));
  const groupXml = [];
  for (const g of groups || []) {
    const parts = [];
    for (const c of g.conditions || []) {
      if (!c.field) continue;
      const r = condition(c, fieldTypes[c.field]);
      if (r.error) return { error: r.error };
      if (r.xml) parts.push(r.xml);
    }
    if (parts.length === 1) groupXml.push(parts[0]);
    else if (parts.length) groupXml.push(`<filter type="${g.logic === "or" ? "or" : "and"}">${parts.join("")}</filter>`);
  }
  const filter = groupXml.length ? `<filter type="${groupLogic === "or" ? "or" : "and"}">${groupXml.join("")}</filter>` : "";
  const order = orderBy?.f && NAME_RE.test(orderBy.f) ? `<order attribute="${orderBy.f}" descending="${orderBy.dir === "desc" ? "true" : "false"}"/>` : "";
  return { fetchxml: `<fetch version="1.0" mapping="logical"><entity name="${entity}">${cols.map(a => `<attribute name="${a}"/>`).join("")}${order}${filter}</entity></fetch>` };
}

// Any FetchXML → what a view can hold: no paging, row count or total-count attributes on <fetch>,
// the table's key among the root attributes (the app needs it to open rows). Aggregates refused.
export function viewFetchXml(fx, primaryId) {
  let s = String(fx || "").trim();
  const head = s.match(/<fetch\b([^>]*)>/i);
  if (!head) return { error: "That isn't a FetchXML query." };
  if (/\baggregate\s*=\s*"true"/i.test(head[1])) return { error: "An aggregate query (GROUP BY / COUNT…) can't be a view." };
  const cleaned = head[1].replace(/\s+(page|count|top|paging-cookie|returntotalrecordcount)\s*=\s*(?:"[^"]*"|'[^']*')/gi, "");
  s = s.replace(head[0], `<fetch${cleaned}>`);
  const root = s.match(/<entity\b[^>]*name\s*=\s*"([^"]+)"[^>]*>/i);
  if (!root) return { error: "The FetchXML has no <entity>." };
  if (/<all-attributes\s*\/?>/i.test(s)) return { error: "A view needs named columns — replace <all-attributes/> with the <attribute> you want to see." };
  if (primaryId && NAME_RE.test(primaryId)) {
    // root attributes only: link-entities are removed innermost first (nested ones don't fool it)
    let body = s.slice(s.indexOf(root[0]) + root[0].length);
    const linkRe = /<link-entity\b[^>]*?(?:\/>|>(?:(?!<link-entity\b)[\s\S])*?<\/link-entity>)/i;
    let lm;
    while ((lm = body.match(linkRe))) body = body.replace(lm[0], "");
    if (!new RegExp(`<attribute\\b[^>]*\\bname\\s*=\\s*"${primaryId}"`, "i").test(body)) s = s.replace(root[0], `${root[0]}<attribute name="${primaryId}"/>`);
  }
  return { fetchxml: s, entity: root[1] };
}

// The columns the view shows: the FetchXML's own attributes, root first, link-entity ones as
// alias.attribute — never the key (the app opens rows with it, it doesn't show it).
export function layoutColumns(fx, primaryId) {
  const s = String(fx || "");
  const root = s.match(/<entity\b[^>]*>([\s\S]*)<\/entity>/i);
  if (!root) return [];
  let body = root[1];
  const cols = [];
  const linkRe = /<link-entity\b([^>]*?)(\/>|>((?:(?!<link-entity\b)[\s\S])*?)<\/link-entity>)/i;
  const attrOf = (tag, a) => (tag.match(new RegExp(`\\b${a}\\s*=\\s*"([^"]*)"`, "i")) || [])[1];
  const linkCols = [];
  let m;
  while ((m = body.match(linkRe))) {
    const alias = attrOf(m[1], "alias");
    if (alias) for (const a of (m[3] || "").match(/<attribute\b[^>]*\/?>/gi) || []) { const n = attrOf(a, "name"); if (n) linkCols.push(`${alias}.${n}`); }
    body = body.replace(m[0], "");
  }
  for (const a of body.match(/<attribute\b[^>]*\/?>/gi) || []) { const n = attrOf(a, "name"); if (n && n !== primaryId) cols.push(n); }
  return [...new Set([...cols, ...linkCols])];
}

// The view's layout: the grid the app draws (ObjectTypeCode, the name column to open a row by).
export function layoutXml({ objectTypeCode, primaryId, primaryName, columns }) {
  const cells = (columns || []).map(c => `<cell name="${xmlEsc(c)}" width="150"/>`).join("");
  return `<grid name="resultset" object="${Number(objectTypeCode) || 0}" jump="${xmlEsc(primaryName || "")}" select="1" icon="1" preview="1"><row name="result" id="${xmlEsc(primaryId)}">${cells}</row></grid>`;
}
