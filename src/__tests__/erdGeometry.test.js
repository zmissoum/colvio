import { describe, it, expect } from "vitest";
import { edgeAnchors, edgePath, zoomViewBox } from "../erdGeometry.js";

const W = 220;

describe("edgeAnchors", () => {
  it("joins the facing sides of cards side by side, in both directions", () => {
    expect(edgeAnchors({ x: 0, y: 0 }, { x: 400, y: 50 }, W, false)).toEqual({ sx: 220, tx: 400, dir: 1, loop: false });
    expect(edgeAnchors({ x: 400, y: 0 }, { x: 0, y: 50 }, W, false)).toEqual({ sx: 400, tx: 220, dir: -1, loop: false });
  });
  it("loops on the right for a lookup to the same table", () => {
    expect(edgeAnchors({ x: 100, y: 0 }, { x: 100, y: 0 }, W, true)).toEqual({ sx: 320, tx: 320, dir: 1, loop: true });
  });
  it("loops on the right for cards stacked in overlapping columns", () => {
    expect(edgeAnchors({ x: 0, y: 0 }, { x: 60, y: 400 }, W, false)).toMatchObject({ sx: 220, tx: 280, loop: true });
  });
});

describe("edgePath", () => {
  it("bulges a loop outward, to the right of both anchors", () => {
    const p = edgePath({ sx: 320, sy: 100, tx: 320, ty: 40, dir: 1, loop: true });
    const xs = p.d.match(/-?\d+(\.\d+)?/g).map(Number).filter((_, i) => i % 2 === 0);
    expect(Math.min(...xs)).toBe(320);
    expect(p.midX).toBeGreaterThan(320);
  });
  it("keeps the straight S-curve between facing sides", () => {
    expect(edgePath({ sx: 220, sy: 10, tx: 400, ty: 60, dir: 1, loop: false })).toEqual({ d: "M 220 10 C 283 10, 337 60, 400 60", midX: 310, midY: 35 });
  });
});

describe("zoomViewBox", () => {
  it("keeps the anchor point fixed: zooming around the centre keeps the centre", () => {
    const vb = { x: 0, y: 0, w: 1000, h: 800 };
    const z = zoomViewBox(vb, 0.8, 500, 400);
    expect(z.x + z.w / 2).toBeCloseTo(500);
    expect(z.y + z.h / 2).toBeCloseTo(400);
    expect(z.w).toBeCloseTo(800);
  });
  it("clamps the size", () => {
    expect(zoomViewBox({ x: 0, y: 0, w: 500, h: 400 }, 0.1, 0, 0)).toMatchObject({ w: 400, h: 300 });
  });
});
