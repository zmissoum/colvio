import { describe, it, expect } from "vitest";
import { layoutBuTree } from "../buTreeUtils.js";

const OPTS = { nodeW: 100, nodeH: 50, hGap: 10, vGap: 40 };

describe("layoutBuTree", () => {
  it("centers a parent over its two children; children don't overlap", () => {
    const r = layoutBuTree([
      { id: "root", name: "Root", parentId: null },
      { id: "a", name: "A", parentId: "root" },
      { id: "b", name: "B", parentId: "root" },
    ], OPTS);
    const [root, a, b] = ["root", "a", "b"].map(id => r.nodes.find(n => n.id === id));
    expect(a.y).toBe(90); expect(b.y).toBe(90); expect(root.y).toBe(0);
    expect(b.x - a.x).toBe(110);                       // nodeW + hGap — no overlap
    expect(root.x).toBe((a.x + b.x) / 2);              // centered over the pair
    expect(r.edges).toHaveLength(2);
    expect(r.width).toBe(210);
  });
  it("treats orphans (parent not visible) as roots, side by side", () => {
    const r = layoutBuTree([
      { id: "x", name: "X", parentId: "ghost" },
      { id: "y", name: "Y", parentId: null },
    ], OPTS);
    expect(r.nodes.every(n => n.depth === 0)).toBe(true);
    expect(r.nodes).toHaveLength(2);
    expect(r.edges).toHaveLength(0);
  });
  it("survives a cyclic hierarchy without looping", () => {
    const r = layoutBuTree([{ id: "a", name: "A", parentId: "b" }, { id: "b", name: "B", parentId: "a" }], OPTS);
    expect(r.nodes.length).toBeGreaterThan(0); // partial layout, no hang
  });
  it("deep chain stacks vertically with one slot width", () => {
    const r = layoutBuTree([
      { id: "1", name: "1", parentId: null },
      { id: "2", name: "2", parentId: "1" },
      { id: "3", name: "3", parentId: "2" },
    ], OPTS);
    expect(r.width).toBe(100);
    expect(r.height).toBe(3 * 90 - 40);
    expect(new Set(r.nodes.map(n => n.x)).size).toBe(1); // all centered in the same column
  });
});
