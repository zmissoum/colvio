import { describe, it, expect } from "vitest";
import { compareComponents, groupByType, compareExportRows, compareComponentsCrossOrg, buildCompareFile, parseCompareFile, COMPARE_FILE_FORMAT } from "../solutionCompareUtils.js";

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

describe("compareComponentsCrossOrg", () => {
  it("pass 1 matches transported components by GUID even when names differ", () => {
    const r = compareComponentsCrossOrg(
      [{ type: 60, objectId: "F-1", name: "Account Main" }],
      [{ type: 60, objectId: "f-1", name: "Compte principal" }]   // same form, FR org
    );
    expect(r.both).toHaveLength(1);
    expect(r.both[0].matchedBy).toBe("id");
    expect(r.stats.idMatches).toBe(1);
  });
  it("pass 2 matches metadata by (type, name) when MetadataIds differ across orgs", () => {
    const r = compareComponentsCrossOrg(
      [{ type: 1, objectId: "META-ORG1", name: "Account" }, { type: 2, objectId: "A-ORG1", name: "revenue (Account)" }],
      [{ type: 1, objectId: "META-ORG2", name: "Account" }, { type: 2, objectId: "A-ORG2", name: "revenue (Account)" }]
    );
    expect(r.both).toHaveLength(2);
    expect(r.both.every(x => x.matchedBy === "name")).toBe(true);
    expect(r.stats.nameMatches).toBe(2);
    expect(r.onlyA).toHaveLength(0);
    expect(r.onlyB).toHaveLength(0);
  });
  it("ambiguous names do NOT cross-match (two forms named Information)", () => {
    const r = compareComponentsCrossOrg(
      [{ type: 60, objectId: "FA-1", name: "Information" }, { type: 60, objectId: "FA-2", name: "Information" }],
      [{ type: 60, objectId: "FB-1", name: "Information" }]
    );
    expect(r.both).toHaveLength(0); // if they were the same form the GUID pass would have caught it
    expect(r.onlyA).toHaveLength(2);
    expect(r.onlyB).toHaveLength(1);
  });
  it("unnamed leftovers are flagged, never name-matched", () => {
    const r = compareComponentsCrossOrg(
      [{ type: 9, objectId: "X-1", name: "" }],
      [{ type: 9, objectId: "Y-1", name: "" }]
    );
    expect(r.both).toHaveLength(0);
    expect(r.onlyA[0].unnamed).toBe(true);
    expect(r.stats.unnamedA).toBe(1);
    expect(r.stats.unnamedB).toBe(1);
  });
});

describe("compare file build / parse", () => {
  it("round-trips through JSON", () => {
    const f = buildCompareFile({ uniqueName: "core", displayName: "Core", version: "1.2.3", isManaged: false }, A, "dev.crm4.dynamics.com");
    const parsed = parseCompareFile(JSON.parse(JSON.stringify(f)));
    expect(f.format).toBe(COMPARE_FILE_FORMAT);
    expect(parsed.solution.uniqueName).toBe("core");
    expect(parsed.org).toBe("dev.crm4.dynamics.com");
    expect(parsed.components).toHaveLength(A.length);
    expect(parsed.components[0]).toEqual({ type: 1, objectId: "AAAA-1", name: "Account" });
  });
  it("rejects foreign or malformed JSON with a readable error", () => {
    expect(() => parseCompareFile(null)).toThrow(/JSON object/);
    expect(() => parseCompareFile({ hello: "world" })).toThrow(/compare file/);
    expect(() => parseCompareFile({ format: COMPARE_FILE_FORMAT, solution: {} })).toThrow(/solution descriptor/);
    expect(() => parseCompareFile({ format: COMPARE_FILE_FORMAT, solution: { uniqueName: "x" } })).toThrow(/components array/);
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
