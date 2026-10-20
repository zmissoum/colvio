import { describe, it, expect } from "vitest";
import { normalizeDeps, itemsToResolve, componentKind, fixHint, impactRows, groupRows, impactExportRows, IMPACT_HEADERS } from "../deleteImpact.js";
import { demoComponentDependencies } from "../deleteImpactDemo.js";

const T = "AAAAAAAA-0000-4000-8000-000000000001";
const raw = (type, id, extra = {}) => ({ dependentcomponenttype: type, dependentcomponentobjectid: id, requiredcomponenttype: 2, requiredcomponentobjectid: T, dependencytype: 2, ...extra });

describe("dependency rows", () => {
  it("normalizes ids and drops rows without a component", () => {
    const d = normalizeDeps([raw(60, "F0000000-0000-4000-8000-000000000001", { dependentcomponentparentid: "P1" }), { dependentcomponenttype: 26 }]);
    expect(d).toHaveLength(1);
    expect(d[0]).toMatchObject({ type: 60, id: "f0000000-0000-4000-8000-000000000001", parentId: "p1", requiredType: 2, requiredId: T.toLowerCase(), dependencyType: 2 });
  });

  it("names each component once, the deleted one never, required parts too", () => {
    const deps = normalizeDeps([
      raw(60, "f1"), raw(60, "f1"), raw(2, "c1", { dependentcomponentparentid: "e1" }),
      raw(26, "v1", { requiredcomponenttype: 2, requiredcomponentobjectid: "c9", requiredcomponentparentid: "e0" }),
    ]);
    expect(itemsToResolve(deps, T)).toEqual([
      { type: 60, id: "f1", parentId: "" }, { type: 2, id: "c1", parentId: "e1" },
      { type: 26, id: "v1", parentId: "" }, { type: 2, id: "c9", parentId: "e0" },
    ]);
  });
});

describe("kinds and hints", () => {
  it("tells processes and forms apart", () => {
    expect(componentKind(29, { category: 2 })).toBe("Business rule");
    expect(componentKind(29, { category: 5 })).toBe("Cloud flow");
    expect(componentKind(29, {})).toBe("Process");
    expect(componentKind(60, { formType: 7 })).toBe("Quick create form");
    expect(componentKind(92)).toBe("Plug-in step");
    expect(componentKind(999)).toBe("Component type 999");
  });
  it("says how to remove the dependency, for a column or a table", () => {
    expect(fixHint(26, {}, "column")).toMatch(/columns, filter and sort/);
    expect(fixHint(26, {}, "table")).toMatch(/links to it/);
    expect(fixHint(2, {}, "column")).toMatch(/calculated, rollup or formula/);
    expect(fixHint(2, {}, "table")).toMatch(/lookup column on another table/);
    expect(fixHint(29, { category: 2 }, "column")).toMatch(/business rule/);
    expect(fixHint(92, {}, "column")).toMatch(/filtering attributes/);
    expect(fixHint(12345)).toMatch(/Remove this reference/);
  });
});

describe("impact rows", () => {
  it("merges a component's dependencies, keeps the parts it goes through, flags unpublished and own parts", () => {
    const deps = normalizeDeps([
      raw(26, "v1", { requiredcomponentobjectid: "c1" }), raw(26, "v1", { requiredcomponentobjectid: "c2", dependencytype: 4 }),
      raw(60, "f1", { requiredcomponenttype: 1 }), raw(2, "own", { dependencytype: 1 }),
    ]);
    const names = { "26|v1": { name: "Big view", table: "contact" }, "2|c1": { name: "Company" }, "60|f1": { name: "Contact", formType: 2 }, "2|own": { name: "Name" } };
    const rows = impactRows(deps, names, "table", T);
    expect(rows.map(r => [r.kind, r.name, r.internal])).toEqual([["Main form", "Contact", false], ["View", "Big view", false], ["Column", "Name", true]]);
    expect(rows[1].through).toEqual(["Column Company", "Column c2…"]);
    expect(rows[1].unpublished).toBe(true);
    const g = groupRows(rows);
    expect(g.map(x => [x.kind, x.internal, x.rows.length])).toEqual([["Main form", false, 1], ["View", false, 1], ["Column", true, 1]]);
    const out = impactExportRows(rows);
    expect(out[0]).toHaveLength(IMPACT_HEADERS.length);
    expect(out[2][5]).toBe("Yes");
  });

  it("an unnamed component keeps its kind and id", () => {
    const rows = impactRows(normalizeDeps([raw(61, "w1")]), {}, "column", T);
    expect(rows[0]).toMatchObject({ kind: "Web resource", name: "", id: "w1" });
  });
});

describe("demo answers", () => {
  it("a wired custom column, a clean one, the table", () => {
    const sap = demoComponentDependencies({ componentType: 2, logicalName: "new_sapid" });
    const rows = impactRows(sap.deps, sap.names, "column", sap.targetId);
    expect(rows.length).toBe(9);
    expect(rows.every(r => r.name && !r.through.length)).toBe(true);
    expect(demoComponentDependencies({ componentType: 2, logicalName: "new_siretcode" }).deps).toEqual([]);
    const tUsed = demoComponentDependencies({ componentType: 1, mode: "used", logicalName: "account" });
    const tRows = impactRows(tUsed.deps, tUsed.names, "table", tUsed.targetId);
    expect(tRows.filter(r => r.internal).length).toBe(4);
    expect(tRows.find(r => r.name === "Contacts with their account").through).toEqual(["Column Account Name"]);
  });
});
