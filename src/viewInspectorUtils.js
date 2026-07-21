// View-inspector logic — PURE functions, no I/O, fully unit-tested.
//
// The debugging question this answers: "why doesn't my child record show in that subgrid?"
// A subgrid renders a savedquery: its fetchxml holds the FILTERS (the usual culprit is
// statecode = 0 hiding inactive rows), its layoutxml the COLUMNS. The subgrid control itself
// lives in the form's formxml and says WHICH view it renders and through WHICH relationship.
// All three are XML — parsed here with a minimal dependency-free parser (DOMParser isn't
// available in the node test environment, and these documents are machine-generated).

// ── Minimal XML parser ────────────────────────────────────────────────────────
// Handles what Dataverse emits: elements, quoted attributes, self-closing tags, text nodes,
// comments, XML declarations, CDATA. Returns {tag, attrs, children, text} trees (text = own
// direct text). Throws on nothing — a malformed document yields a best-effort partial tree.
export function decodeEntities(s) {
  return String(s ?? "")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(parseInt(d, 10)))
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&"); // LAST — so &amp;lt; decodes to &lt;, not <
}

export function parseXml(xml) {
  const root = { tag: "#root", attrs: {}, children: [], text: "" };
  if (typeof xml !== "string" || !xml.trim()) return root;
  const stack = [root];
  // NOTE the /-exclusion in attribute names: without it, the " /" of a spaced self-closing tag
  // ("<x a='1' />") parses as a valueless attribute named "/", the tag reads as non-self-closing,
  // and every following sibling nests inside it — silently flattening filter trees.
  const tagRe = /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<\?[\s\S]*?\?>|<\/([^\s>]+)\s*>|<([^\s/>!?]+)((?:\s+[^\s=/>]+(?:\s*=\s*(?:"[^"]*"|'[^']*'))?)*)\s*(\/?)>/g;
  let last = 0, m;
  const top = () => stack[stack.length - 1];
  while ((m = tagRe.exec(xml)) !== null) {
    const between = xml.slice(last, m.index);
    if (between.trim()) top().text += decodeEntities(between.trim());
    last = tagRe.lastIndex;
    const token = m[0];
    if (token.startsWith("<!--") || token.startsWith("<?")) continue;
    if (token.startsWith("<![CDATA[")) { top().text += token.slice(9, -3); continue; }
    if (m[1] !== undefined) { // closing tag — pop to the matching open (tolerates mismatches)
      for (let i = stack.length - 1; i > 0; i--) if (stack[i].tag === m[1]) { stack.length = i; break; }
      continue;
    }
    const el = { tag: m[2], attrs: {}, children: [], text: "" };
    const attrRe = /([^\s=]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
    let a; while ((a = attrRe.exec(m[3] || "")) !== null) el.attrs[a[1]] = decodeEntities(a[2] ?? a[3] ?? "");
    top().children.push(el);
    if (!m[4]) stack.push(el); // not self-closing
  }
  return root;
}

const findAll = (node, tag, out = []) => {
  for (const c of node.children) { if (c.tag === tag) out.push(c); findAll(c, tag, out); }
  return out;
};
const child = (node, tag) => node.children.find(c => c.tag === tag);

// ── FetchXML → readable filter tree ──────────────────────────────────────────
// Operator labels — the common set Dataverse view designers emit. Unknown operators fall
// back to their raw name rather than being hidden: never mask a filter you can't pretty-print.
export const OP_LABELS = {
  "eq": "=", "ne": "≠", "neq": "≠", "gt": ">", "ge": "≥", "lt": "<", "le": "≤",
  "like": "contains", "not-like": "does not contain", "begins-with": "begins with",
  "not-begin-with": "does not begin with", "ends-with": "ends with", "not-end-with": "does not end with",
  "in": "is one of", "not-in": "is not one of", "null": "is empty", "not-null": "is not empty",
  "on": "on", "on-or-after": "on or after", "on-or-before": "on or before",
  "today": "is today", "yesterday": "is yesterday", "tomorrow": "is tomorrow",
  "this-week": "this week", "last-week": "last week", "next-week": "next week",
  "this-month": "this month", "last-month": "last month", "next-month": "next month",
  "this-year": "this year", "last-year": "last year", "next-year": "next year",
  "last-x-days": "in the last {x} days", "next-x-days": "in the next {x} days",
  "last-x-hours": "in the last {x} hours", "last-x-weeks": "in the last {x} weeks",
  "last-x-months": "in the last {x} months", "last-x-years": "in the last {x} years",
  "olderthan-x-days": "older than {x} days", "olderthan-x-months": "older than {x} months",
  "eq-userid": "equals current user", "ne-userid": "does not equal current user",
  "eq-userteams": "in current user's teams", "eq-useroruserteams": "current user or their teams",
  "eq-businessid": "equals current business unit", "ne-businessid": "≠ current business unit",
  "under": "under", "not-under": "not under", "above": "above", "eq-or-under": "equals or under",
  "contain-values": "contains values", "not-contain-values": "does not contain values",
};

export function opLabel(op, value) {
  const l = OP_LABELS[op] || op;
  return l.includes("{x}") ? l.replace("{x}", value ?? "?") : l;
}

const parseCondition = (c) => {
  const op = c.attrs.operator || "eq";
  const values = findAll(c, "value").map(v => v.text);
  return {
    kind: "cond",
    attribute: c.attrs.attribute || "",
    entityname: c.attrs.entityname || "",   // condition targeting a link-entity alias
    operator: op,
    opLabel: opLabel(op, c.attrs.value),
    value: c.attrs.value ?? (values.length ? values.join(", ") : ""),
    values,
  };
};

const parseFilter = (f) => ({
  kind: "group",
  logic: (f.attrs.type || "and").toUpperCase(),
  items: f.children
    .filter(c => c.tag === "condition" || c.tag === "filter")
    .map(c => (c.tag === "condition" ? parseCondition(c) : parseFilter(c))),
});

/**
 * Parse a view's fetchxml into a readable structure.
 * @returns {entity, filter: group|null, linkEntities:[{name,from,to,alias,type,filter,attributes}], orders:[{attribute,desc}], raw}
 */
export function parseViewFetchXml(fetchxml) {
  const tree = parseXml(fetchxml);
  const fetch = child(tree, "fetch");
  const ent = fetch ? child(fetch, "entity") : null;
  if (!ent) return { entity: "", filter: null, linkEntities: [], orders: [], raw: fetchxml || "" };
  const directFilters = ent.children.filter(c => c.tag === "filter").map(parseFilter);
  const filter = directFilters.length === 0 ? null
    : directFilters.length === 1 ? directFilters[0]
      : { kind: "group", logic: "AND", items: directFilters }; // multiple root filters AND together
  const linkEntities = findAll(ent, "link-entity").map(le => {
    const fs = le.children.filter(c => c.tag === "filter").map(parseFilter);
    return {
      name: le.attrs.name || "", from: le.attrs.from || "", to: le.attrs.to || "",
      alias: le.attrs.alias || "", type: le.attrs["link-type"] || "inner",
      filter: fs.length === 0 ? null : fs.length === 1 ? fs[0] : { kind: "group", logic: "AND", items: fs },
    };
  });
  const orders = ent.children.filter(c => c.tag === "order")
    .map(o => ({ attribute: o.attrs.attribute || o.attrs.alias || "", desc: o.attrs.descending === "true" }));
  return { entity: ent.attrs.name || "", filter, linkEntities, orders, raw: fetchxml || "" };
}

/** Parse a view's layoutxml into its display columns, in order. */
export function parseViewLayoutXml(layoutxml) {
  const tree = parseXml(layoutxml);
  return findAll(tree, "cell")
    .filter(c => c.attrs.name && !c.attrs.ishidden)
    .map(c => ({ name: c.attrs.name, width: c.attrs.width ? Number(c.attrs.width) : null }));
}

// ── Form XML → subgrid controls ───────────────────────────────────────────────
// A subgrid is a <control> with the well-known grid classid; its <parameters> say which view
// it renders (ViewId), on which child table (TargetEntityType), through which relationship
// (RelationshipName), and whether users can switch views (EnableViewPicker).
const SUBGRID_CLASSID = "e7a81278-8635-4d9e-8d4d-59480b391c5b";
const cleanGuid = (s) => String(s || "").replace(/[{}]/g, "").toLowerCase();
const paramText = (params, tag) => { const el = params && child(params, tag); return el ? el.text : ""; };

/**
 * Extract every subgrid on a form.
 * @returns [{controlId, label, targetEntity, viewId, relationshipName, viewPicker}]
 */
export function parseFormSubgrids(formxml) {
  const tree = parseXml(formxml);
  const out = [];
  const walk = (node, cellLabel) => {
    for (const c of node.children) {
      if (c.tag === "cell") {
        // A cell's label describes the control inside it (the caption users see on the form).
        const labels = child(c, "labels");
        const lab = labels && labels.children.find(l => l.tag === "label" && l.attrs.description);
        walk(c, lab ? lab.attrs.description : cellLabel);
      } else if (c.tag === "control" && cleanGuid(c.attrs.classid) === SUBGRID_CLASSID) {
        const params = child(c, "parameters");
        out.push({
          controlId: c.attrs.id || "",
          label: cellLabel || c.attrs.id || "",
          targetEntity: paramText(params, "TargetEntityType"),
          viewId: cleanGuid(paramText(params, "ViewId")),
          relationshipName: paramText(params, "RelationshipName"),
          viewPicker: /^true$/i.test(paramText(params, "EnableViewPicker")),
        });
      } else {
        walk(c, cellLabel);
      }
    }
  };
  walk(tree, "");
  return out;
}
