// BU org-chart layout — PURE, no I/O, unit-tested.
//
// Classic tidy top-down tree: a leaf occupies one slot; a parent's span is the sum of its
// children's spans and the parent box sits centered above them. Orphans (parentId pointing at
// a BU we can't see) and true roots are laid side by side. A visited guard keeps a corrupted
// (cyclic) hierarchy from looping forever — same defensive stance as the subtree filter.

/**
 * Expand/collapse support for big hierarchies (a 1000+-BU org laid flat is hundreds of
 * thousands of pixels wide — the chart must start folded). A node is visible when every
 * ancestor is expanded; its children stay hidden until it is expanded itself.
 * @param bus        [{id, name, parentId, disabled}]
 * @param expandedIds Set<id> — nodes whose CHILDREN are shown
 * @returns {list: visible nodes, childCount: Map<id, total direct children>} — childCount is
 * computed on the FULL hierarchy so a collapsed node can badge how much it hides.
 */
export function visibleBuList(bus = [], expandedIds = new Set()) {
  const ids = new Set(bus.map(b => b.id));
  const children = new Map();
  for (const b of bus) {
    if (b.parentId && ids.has(b.parentId)) {
      if (!children.has(b.parentId)) children.set(b.parentId, []);
      children.get(b.parentId).push(b);
    }
  }
  const childCount = new Map();
  for (const [id, kids] of children) childCount.set(id, kids.length);
  const list = [], seen = new Set();
  const walk = (b) => {
    if (seen.has(b.id)) return;
    seen.add(b.id);
    list.push(b);
    if (expandedIds.has(b.id)) for (const k of (children.get(b.id) || [])) walk(k);
  };
  bus.filter(b => !b.parentId || !ids.has(b.parentId)).forEach(walk);
  return { list, childCount };
}

export function layoutBuTree(bus = [], { nodeW = 180, nodeH = 56, hGap = 16, vGap = 46 } = {}) {
  const ids = new Set(bus.map(b => b.id));
  const children = new Map();
  for (const b of bus) {
    if (b.parentId && ids.has(b.parentId)) {
      if (!children.has(b.parentId)) children.set(b.parentId, []);
      children.get(b.parentId).push(b);
    }
  }
  for (const list of children.values()) list.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  const roots = bus.filter(b => !b.parentId || !ids.has(b.parentId)).sort((a, b) => (a.name || "").localeCompare(b.name || ""));

  const seen = new Set();
  const spanOf = new Map(); // id -> horizontal span of the whole subtree
  const measure = (b) => {
    if (seen.has(b.id)) { spanOf.set(b.id, 0); return 0; }
    seen.add(b.id);
    const kids = (children.get(b.id) || []).filter(k => !seen.has(k.id));
    let span;
    if (!kids.length) span = nodeW;
    else {
      span = kids.reduce((s, k) => s + measure(k), 0) + hGap * (kids.length - 1);
      span = Math.max(span, nodeW);
    }
    spanOf.set(b.id, span);
    return span;
  };
  roots.forEach(measure);
  // A PURE cycle has no root at all (every node has a visible parent) — without this, the whole
  // island would silently disappear from the chart. Any still-unmeasured node becomes a fallback root.
  const fallbackRoots = [];
  for (const b of bus) if (!seen.has(b.id)) { fallbackRoots.push(b); measure(b); }

  const nodes = [], edges = [];
  const placed = new Set();
  const place = (b, left, depth) => {
    if (placed.has(b.id)) return;
    placed.add(b.id);
    const span = spanOf.get(b.id) ?? nodeW;
    const x = left + span / 2 - nodeW / 2; // centered over the subtree span
    const y = depth * (nodeH + vGap);
    nodes.push({ id: b.id, name: b.name || "(unnamed)", disabled: !!b.disabled, x, y, depth });
    let cursor = left;
    for (const k of (children.get(b.id) || [])) {
      if (placed.has(k.id)) continue;
      const kSpan = spanOf.get(k.id) ?? nodeW;
      edges.push({ fromId: b.id, toId: k.id, x1: x + nodeW / 2, y1: y + nodeH, x2: cursor + kSpan / 2, y2: (depth + 1) * (nodeH + vGap) });
      place(k, cursor, depth + 1);
      cursor += kSpan + hGap;
    }
  };
  let leftCursor = 0;
  for (const r of [...roots, ...fallbackRoots]) {
    if (placed.has(r.id)) continue;
    place(r, leftCursor, 0);
    leftCursor += (spanOf.get(r.id) ?? nodeW) + hGap * 2;
  }
  const width = Math.max(nodeW, leftCursor - hGap * 2);
  const height = nodes.length ? (Math.max(...nodes.map(n => n.depth)) + 1) * (nodeH + vGap) - vGap : 0;
  return { nodes, edges, width, height, nodeW, nodeH };
}
