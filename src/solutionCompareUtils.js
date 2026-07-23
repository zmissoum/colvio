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
