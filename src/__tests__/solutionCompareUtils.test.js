import { describe, it, expect } from "vitest";
import { compareComponents, groupByType, compareExportRows } from "../solutionCompareUtils.js";

const A = [
  { type: 1, objectId: "AAAA-1", name: "Account" },
  { type: 1, objectId: "AAAA-2", name: "Contact" },
  { type: 60, objectId: "FFFF-1", name: "Account Main" },
  { type: 60, objectId: "FFFF-1", name: "Account Main" }, // duplicate → collapsed
];
const B = [
  { type: 1, objectId: "aaaa-1", name: "" },              // same GUID, different case, unresolved name
  { type: 1, objectId: "AAAA-3", name: "Lead" },
  { type: 29, objectId: "WWWW-1", name: "My Workflow" },
];

describe("compareComponents", () => {
  const d = compareComponents(A, B);
  it("splits only-A / both / only-B, matching GUIDs case-insensitively", () => {
    expect(d.both.map(c => c.objectId)).toEqual(["AAAA-1"]);
    expect(d.onlyA.map(c => c.name).sort()).toEqual(["Account Main", "Contact"]);
    expect(d.onlyB.map(c => c.name).sort()).toEqual(["Lead", "My Workflow"]);
  });
  it("prefers whichever side resolved a name, and collapses duplicates", () => {
    expect(d.both[0].name).toBe("Account");            // B's copy had no name
    expect(d.onlyA.filter(c => c.objectId === "FFFF-1")).toHaveLength(1);
  });
  it("same type is required — identical GUID under a different type is NOT a match", () => {
    const r = compareComponents([{ type: 1, objectId: "X" }], [{ type: 2, objectId: "X" }]);
    expect(r.both).toHaveLength(0);
    expect(r.onlyA).toHaveLength(1);
    expect(r.onlyB).toHaveLength(1);
  });
  it("empty sides are safe", () => {
    expect(compareComponents([], []).both).toEqual([]);
    expect(compareComponents(A, []).onlyA).toHaveLength(3);
  });
});

describe("groupByType / compareExportRows", () => {
  const TYPES = { 1: { l: "Entity", i: "📦" }, 60: { l: "Form", i: "📄" } };
  it("groups by resolved label, unknown types get a raw fallback", () => {
    const g = groupByType([{ type: 1, objectId: "a", name: "Zed" }, { type: 1, objectId: "b", name: "Abc" }, { type: 999, objectId: "c" }], TYPES);
    expect(g.map(([, x]) => x.l)).toEqual(["Entity", "Type 999"]);
    expect(g[0][1].items.map(i => i.name)).toEqual(["Abc", "Zed"]); // sorted by name
  });
  it("export rows carry presence + type label per component", () => {
    const rows = compareExportRows(compareComponents(A, B), TYPES);
    expect(rows).toContainEqual(["both", "Entity", "Account", "AAAA-1"]);
    expect(rows).toContainEqual(["only A", "Form", "Account Main", "FFFF-1"]);
    expect(rows.filter(r => r[0] === "only B")).toHaveLength(2);
  });
});
