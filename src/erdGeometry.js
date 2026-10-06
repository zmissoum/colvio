// ERD geometry — pure, unit-tested.

// Where an edge leaves its source card and enters its target. Side by side: the facing sides.
// Same table, or cards in overlapping columns: both on the right with an outward loop — facing
// sides would run the curve straight through the cards.
export function edgeAnchors(src, tgt, cardW, sameTable) {
  const srcCx = src.x + cardW / 2, tgtCx = tgt.x + cardW / 2;
  if (sameTable || Math.abs(srcCx - tgtCx) < cardW) return { sx: src.x + cardW, tx: tgt.x + cardW, dir: 1, loop: true };
  return srcCx < tgtCx
    ? { sx: src.x + cardW, tx: tgt.x, dir: 1, loop: false }
    : { sx: src.x, tx: tgt.x + cardW, dir: -1, loop: false };
}

// SVG path of an edge plus the point its label sits on.
export function edgePath({ sx, sy, tx, ty, dir, loop }) {
  if (loop) {
    const bulge = 60 + Math.abs(ty - sy) * 0.15;
    return { d: `M ${sx} ${sy} C ${sx + bulge} ${sy}, ${tx + bulge} ${ty}, ${tx} ${ty}`, midX: Math.max(sx, tx) + bulge * 0.75, midY: (sy + ty) / 2 };
  }
  const cp = Math.min(100, Math.abs(tx - sx) * 0.35);
  return { d: `M ${sx} ${sy} C ${sx + cp * dir} ${sy}, ${tx - cp * dir} ${ty}, ${tx} ${ty}`, midX: (sx + tx) / 2, midY: (sy + ty) / 2 };
}

// Zooms the viewBox by `factor`, keeping the point (px, py) where it is on screen. Sizes clamped.
export function zoomViewBox(vb, factor, px, py) {
  const w = Math.max(400, Math.min(6000, vb.w * factor));
  const h = Math.max(300, Math.min(5000, vb.h * factor));
  return { x: px - (px - vb.x) * (w / vb.w), y: py - (py - vb.y) * (h / vb.h), w, h };
}
