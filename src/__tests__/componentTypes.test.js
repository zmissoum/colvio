import { describe, it, expect } from "vitest";
import { COMPONENT_TYPES, COMP_TYPES, COMPONENT_LABEL, COMPONENT_RECORDS } from "../componentTypes.js";
import { COMP_TYPES as sharedCompTypes } from "../shared.jsx";
import { COMPONENT_LABEL as impactLabels, componentKind } from "../deleteImpact.js";

// The three maps used to drift apart (shared.jsx, deleteImpact.js, content.js); they are now views
// of one table. The labels are pinned because exports and the dependency UI print them verbatim.
describe("componentTypes — one table, several views", () => {
  it("shared.jsx and deleteImpact.js read the same table", () => {
    expect(sharedCompTypes).toBe(COMP_TYPES);
    expect(impactLabels).toBe(COMPONENT_LABEL);
  });
  it("keeps the explorer's labels and the dependency check's wording", () => {
    expect(COMP_TYPES[1]).toEqual({ l: "Entity", i: "📋" });
    expect(COMP_TYPES[60]).toEqual({ l: "System Form", i: "📝" });
    expect(COMP_TYPES[92]).toEqual({ l: "SDK Message Step", i: "📍" });
    expect(COMPONENT_LABEL[1]).toBe("Table");
    expect(COMPONENT_LABEL[2]).toBe("Column");
    expect(COMPONENT_LABEL[92]).toBe("Plug-in step");
    expect(componentKind(61)).toBe("Web resource");
    expect(Object.keys(COMP_TYPES)).toHaveLength(46);
    expect(Object.keys(COMPONENT_LABEL)).toHaveLength(65);
  });
  it("views carry only the keys they are for, and a record triple is whole or absent", () => {
    for (const v of Object.values(COMP_TYPES)) expect(Object.keys(v).sort()).toEqual(["i", "l"]);
    for (const v of Object.values(COMPONENT_RECORDS)) expect(Object.keys(v).sort()).toEqual(["id", "name", "set"]);
    for (const [t, v] of Object.entries(COMPONENT_TYPES)) {
      const n = ["set", "id", "name"].filter(k => v[k]).length;
      expect(n === 0 || n === 3, `type ${t}: partial record triple`).toBe(true);
      expect(!!v.l === !!v.i, `type ${t}: short label without icon`).toBe(true);
    }
    expect(COMPONENT_RECORDS[61]).toEqual({ set: "webresourceset", id: "webresourceid", name: "name" });
  });
});
