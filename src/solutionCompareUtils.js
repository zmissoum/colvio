// Solution-compare logic — PURE functions, no I/O, unit-tested.
//
// Intra-org comparison of two solutions' component lists. Same org ⇒ objectIds are directly
// comparable GUIDs, so membership is (type, objectId). The interesting output is usually the
// OVERLAP: two unmanaged solutions carrying the same form/table is the classic source of
// layering conflicts ("my change vanished"). The export format deliberately mirrors the
// per-solution component export so a future cross-org compare can reuse it.

/**
 * Diff two component lists.
 * @param compsA [{type, objectId, name}]  — duplicates within one side are collapsed
 * @param compsB [{type, objectId, name}]
 * @returns {onlyA, onlyB, both} — `both` prefers whichever side resolved a name
 */
export function compareComponents(compsA = [], compsB = []) {
  const keyOf = c => `${c.type}|${String(c.objectId || "").toLowerCase()}`;
  const mapA = new Map(), mapB = new Map();
  for (const c of compsA) { const k = keyOf(c); if (!mapA.has(k) || !mapA.get(k).name) mapA.set(k, c); }
  for (const c of compsB) { const k = keyOf(c); if (!mapB.has(k) || !mapB.get(k).name) mapB.set(k, c); }
  const onlyA = [], onlyB = [], both = [];
  for (const [k, c] of mapA) {
    const other = mapB.get(k);
    if (other) both.push({ type: c.type, objectId: c.objectId, name: c.name || other.name || "" });
    else onlyA.push({ type: c.type, objectId: c.objectId, name: c.name || "" });
  }
  for (const [k, c] of mapB) {
    if (!mapA.has(k)) onlyB.push({ type: c.type, objectId: c.objectId, name: c.name || "" });
  }
  return { onlyA, onlyB, both };
}

/**
 * Group a diff bucket by component type for display — [ [typeKey, {l, i, items}] ] sorted by
 * label, items sorted by name. compTypes = the COMP_TYPES map (passed in to stay pure).
 */
export function groupByType(items = [], compTypes = {}) {
  const map = {};
  for (const c of items) {
    const def = compTypes[c.type] || { l: `Type ${c.type}`, i: "?" };
    if (!map[c.type]) map[c.type] = { ...def, items: [] };
    map[c.type].items.push(c);
  }
  for (const g of Object.values(map)) g.items.sort((a, b) => (a.name || a.objectId || "").localeCompare(b.name || b.objectId || ""));
  return Object.entries(map).sort((a, b) => a[1].l.localeCompare(b[1].l));
}

/** Flat export rows: [presence, componentType, name, objectId] — one row per component. */
export function compareExportRows(diff, compTypes = {}) {
  const label = t => (compTypes[t] || { l: `Type ${t}` }).l;
  const rows = [];
  for (const [bucket, tag] of [[diff.onlyA, "only A"], [diff.both, "both"], [diff.onlyB, "only B"]]) {
    for (const c of bucket) rows.push([tag, label(c.type), c.name || "", c.objectId || ""]);
  }
  return rows;
}

// ── Cross-org comparison (DEV vs PROD drift, via an exported file) ───────────
// GUIDs are NOT comparable across orgs for METADATA components: MetadataIds are generated
// locally at import time. But solution-TRANSPORTED components (forms, views, workflows, web
// resources…) keep their GUIDs. So: pass 1 matches on (type, objectId) — catches transported
// components; pass 2 matches the remainder on (type, resolved name), but ONLY when that name
// is unambiguous on both sides — two forms named "Information" on different tables must not
// cross-match (if they were the same form, pass 1 would have caught them). Unnamed leftovers
// can't be matched at all and are flagged rather than silently piled into "only".

const norm = s => String(s || "").trim().toLowerCase();

export function compareComponentsCrossOrg(compsA = [], compsB = []) {
  const keyId = c => `${c.type}|${norm(c.objectId)}`;
  const keyName = c => `${c.type}|${norm(c.name)}`;
  const dedupe = (list) => { const m = new Map(); for (const c of list) { const k = keyId(c); if (!m.has(k) || !m.get(k).name) m.set(k, c); } return [...m.values()]; };
  const A = dedupe(compsA), B = dedupe(compsB);

  const bById = new Map(B.map(c => [keyId(c), c]));
  const usedB = new Set();
  const both = [], restA = [];
  for (const c of A) {
    const hit = bById.get(keyId(c));
    if (hit && !usedB.has(hit)) { both.push({ type: c.type, objectId: c.objectId, name: c.name || hit.name || "", matchedBy: "id" }); usedB.add(hit); }
    else restA.push(c);
  }
  const restB = B.filter(c => !usedB.has(c));

  const groupByName = (list) => { const m = new Map(); for (const c of list) { if (!norm(c.name)) continue; const k = keyName(c); if (!m.has(k)) m.set(k, []); m.get(k).push(c); } return m; };
  const gA = groupByName(restA), gB = groupByName(restB);
  const matchedA = new Set();
  for (const [k, listA] of gA) {
    const listB = gB.get(k);
    if (listA.length === 1 && listB && listB.length === 1) {
      both.push({ type: listA[0].type, objectId: listA[0].objectId, name: listA[0].name, matchedBy: "name" });
      matchedA.add(listA[0]); usedB.add(listB[0]);
    }
  }
  const onlyA = restA.filter(c => !matchedA.has(c)).map(c => ({ type: c.type, objectId: c.objectId, name: c.name || "", unnamed: !norm(c.name) }));
  const onlyB = restB.filter(c => !usedB.has(c)).map(c => ({ type: c.type, objectId: c.objectId, name: c.name || "", unnamed: !norm(c.name) }));
  const stats = {
    idMatches: both.filter(x => x.matchedBy === "id").length,
    nameMatches: both.filter(x => x.matchedBy === "name").length,
    unnamedA: onlyA.filter(c => c.unnamed).length,
    unnamedB: onlyB.filter(c => c.unnamed).length,
  };
  return { onlyA, onlyB, both, stats };
}

// ── Compare file (export on org 1, load on org 2) ────────────────────────────
export const COMPARE_FILE_FORMAT = "colvio-solution-components@1";

export function buildCompareFile(solution, components, org) {
  return {
    format: COMPARE_FILE_FORMAT,
    exportedAt: new Date().toISOString(),
    org: org || "",
    solution: { uniqueName: solution.uniqueName || "", displayName: solution.displayName || "", version: solution.version || "", isManaged: !!solution.isManaged },
    components: (components || []).map(c => ({ type: c.type, objectId: c.objectId || "", name: c.name || "" })),
  };
}

/** Validate a parsed JSON object as a compare file — throws a descriptive error otherwise. */
export function parseCompareFile(obj) {
  if (!obj || typeof obj !== "object") throw new Error("Not a JSON object");
  if (obj.format !== COMPARE_FILE_FORMAT) throw new Error(`Not a Colvio solution compare file (expected format "${COMPARE_FILE_FORMAT}")`);
  if (!obj.solution || typeof obj.solution.uniqueName !== "string") throw new Error("Compare file has no solution descriptor");
  if (!Array.isArray(obj.components)) throw new Error("Compare file has no components array");
  const components = obj.components
    .filter(c => c && (typeof c.type === "number" || typeof c.type === "string"))
    .map(c => ({ type: typeof c.type === "string" ? parseInt(c.type, 10) : c.type, objectId: String(c.objectId || ""), name: String(c.name || "") }));
  return { org: String(obj.org || ""), exportedAt: String(obj.exportedAt || ""), solution: obj.solution, components };
}
