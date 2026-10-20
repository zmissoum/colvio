import { describe, it, expect } from "vitest";
import { statePatch, canEditFiltering, parseFiltering, formatFiltering, filteringDiff, filterableColumns, statePlan, stateConfirmText, applyStateLocally } from "../stepAdmin.js";

const S = (id, over = {}) => ({ id, name: `Step ${id}`, pluginType: `T${id}`, message: "Update", entity: "account", stage: 40, mode: 0, state: 0, managed: false, ...over });

describe("filtering attributes", () => {
  it("normalises, formats and diffs", () => {
    expect(parseFiltering("Name, telephone1,,name ,bad name")).toEqual(["name", "telephone1"]);
    expect(formatFiltering(["telephone1", "Name", "name"])).toBe("name,telephone1");
    expect(formatFiltering([])).toBe("");
    expect(filteringDiff("name,telephone1", "telephone1,revenue")).toEqual({ added: ["revenue"], removed: ["name"] });
  });
  it("only Update registrations on a table filter on columns", () => {
    expect(canEditFiltering(S("a"))).toBe(true);
    expect(canEditFiltering(S("b", { message: "Create" }))).toBe(false);
    expect(canEditFiltering(S("c", { stage: 30 }))).toBe(false);
    expect(canEditFiltering(S("d", { entity: "" }))).toBe(false);
  });
  it("offers updatable columns and keeps today's even when gone from metadata", () => {
    const cols = filterableColumns([{ logical: "name", display: "Name", validForUpdate: true }, { logical: "createdon", validForUpdate: false }, { logical: "revenue", display: "Revenue" }], "name,old_field");
    expect(cols.map(c => c.l)).toEqual(["name", "old_field", "revenue"]);
    expect(cols.find(c => c.l === "old_field").t).toBe("(not in metadata)");
  });
});

describe("enable / disable", () => {
  it("plans only the steps that change", () => {
    expect(statePatch(false)).toEqual({ statecode: 1, statuscode: 2 });
    expect(statePatch(true)).toEqual({ statecode: 0, statuscode: 1 });
    const p = statePlan([S("a"), S("b", { state: 1 }), S("c", { managed: true, mode: 1 })], false);
    expect(p.items).toEqual([{ keyValue: "a", record: { statecode: 1, statuscode: 2 } }, { keyValue: "c", record: { statecode: 1, statuscode: 2 } }]);
    expect(p).toMatchObject({ unchanged: 1, managed: 1, sync: 1 });
    const txt = stateConfirmText(p, false);
    expect(txt.split("\n")[0]).toBe("Disable 2 plug-in steps?");
    expect(txt).toMatch(/stop running at once, for every user/);
    expect(txt).toMatch(/1 of them come from managed solutions/);
    expect(txt).toMatch(/1 selected step is already disabled/);
  });
  it("applies the written state locally, failed rows untouched", () => {
    const steps = [S("a"), S("b"), S("c")];
    const p = statePlan(steps, false);
    const after = applyStateLocally(steps, p, false, [{ row: 2, msg: "denied" }]);
    expect(after.map(s => s.state)).toEqual([1, 0, 1]);
  });
});
