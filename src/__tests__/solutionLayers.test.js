import { describe, it, expect } from "vitest";
import { parseChanges, normalizeLayers, layerSummary, overriddenKeys } from "../solutionLayers.js";
import { demoComponentLayers } from "../solutionLayersDemo.js";

describe("layer changes", () => {
  it("reads the usual { Attributes: [{ Key, Value }] } shape and anything else honestly", () => {
    expect(parseChanges(JSON.stringify({ Attributes: [{ Key: "displayname", Value: "SAP ID" }, { Key: "maxlength", Value: 20 }] }))).toEqual([{ key: "displayname", value: "SAP ID" }, { key: "maxlength", value: "20" }]);
    expect(parseChanges(JSON.stringify({ a: { b: 1 } }))).toEqual([{ key: "a", value: '{"b":1}' }]);
    expect(parseChanges("not json")).toEqual([{ key: "(raw)", value: "not json" }]);
    expect(parseChanges("")).toEqual([]);
    expect(parseChanges(JSON.stringify({ Attributes: [{ Key: "x", Value: "y".repeat(500) }] }))[0].value).toHaveLength(241);
  });
});

describe("layer stack", () => {
  it("sorts top first and flags an Active layer over a managed solution", () => {
    const l = normalizeLayers(demoComponentLayers({ componentName: "Attribute", logicalName: "new_sapid" }));
    expect(l.map(x => x.solution)).toEqual(["Active", "ContosoSAP", "System"]);
    expect(l[0].active).toBe(true);
    const s = layerSummary(l);
    expect(s.level).toBe("warn");
    expect(s.text).toMatch(/on top of the managed solution ContosoSAP and overrides 2 properties \(displayname, requiredlevel\)/);
    const over = overriddenKeys(l);
    expect(over.get(l[1])).toEqual(["displayname", "requiredlevel"]);
    expect(over.get(l[0])).toEqual([]);
  });
  it("tells the normal cases apart", () => {
    expect(layerSummary(normalizeLayers(demoComponentLayers({ componentName: "Attribute", logicalName: "new_siretcode" }))).text).toMatch(/normal state/);
    expect(layerSummary(normalizeLayers(demoComponentLayers({ componentName: "Attribute", logicalName: "name" }))).text).toMatch(/Only the system layer/);
    expect(layerSummary(normalizeLayers([{ msdyn_order: 2, msdyn_solutionname: "Contoso" }, { msdyn_order: 1, msdyn_solutionname: "System" }])).text).toMatch(/Managed by Contoso/);
    expect(layerSummary([]).level).toBe("info");
  });
});
