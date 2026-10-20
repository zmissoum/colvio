import { describe, it, expect } from "vitest";
import { labelBody, targetParams, insertBody, updateBody, deleteBody, orderBody, validateNewOption, validateRename, moveValue, sameOrder, countRowsFetch, deleteConfirmText, OP_ACTION } from "../optionSetEdit.js";

const LOCAL = { isGlobal: false, entity: "account", attribute: "industrycode" };
const GLOBAL = { isGlobal: true, name: "new_region" };
const OPTS = [{ value: 1, label: "Retail" }, { value: 2, label: "Finance" }];

describe("request bodies", () => {
  it("targets a local or a global choice", () => {
    expect(targetParams(LOCAL)).toEqual({ EntityLogicalName: "account", AttributeLogicalName: "industrycode" });
    expect(targetParams(GLOBAL)).toEqual({ OptionSetName: "new_region" });
    expect(() => targetParams({ isGlobal: true, name: "bad name" })).toThrow(/Invalid/);
    expect(() => targetParams({ entity: "account", attribute: "x;y" })).toThrow(/Invalid/);
  });
  it("builds the four actions", () => {
    expect(labelBody("Retail", 1036).LocalizedLabels[0]).toMatchObject({ Label: "Retail", LanguageCode: 1036 });
    expect(insertBody(LOCAL, "Energy", "", 1033)).toEqual({ EntityLogicalName: "account", AttributeLogicalName: "industrycode", Label: labelBody("Energy", 1033) });
    expect(insertBody(GLOBAL, "EMEA", 100000003, 1033).Value).toBe(100000003);
    expect(updateBody(LOCAL, 2, "Banking", 1033)).toMatchObject({ Value: 2, MergeLabels: true });
    expect(deleteBody(GLOBAL, 7)).toEqual({ OptionSetName: "new_region", Value: 7 });
    expect(orderBody(LOCAL, ["2", 1]).Values).toEqual([2, 1]);
    expect(OP_ACTION.order).toBe("OrderOption");
  });
});

describe("validation", () => {
  it("a new option", () => {
    expect(validateNewOption("", "", OPTS)).toMatch(/label/);
    expect(validateNewOption("retail", "", OPTS)).toMatch(/already labelled/);
    expect(validateNewOption("Energy", "x", OPTS)).toMatch(/whole number/);
    expect(validateNewOption("Energy", "2", OPTS)).toMatch(/already used/);
    expect(validateNewOption("Energy", "99999999999", OPTS)).toMatch(/out of range/);
    expect(validateNewOption("Energy", "", OPTS)).toBe(null);
    expect(validateNewOption("Energy", "3", OPTS)).toBe(null);
  });
  it("a rename", () => {
    expect(validateRename("Retail", OPTS[0], OPTS)).toBe("unchanged");
    expect(validateRename("finance", OPTS[0], OPTS)).toMatch(/already labelled/);
    expect(validateRename("Shops", OPTS[0], OPTS)).toBe(null);
    expect(validateRename(" ", OPTS[0], OPTS)).toMatch(/empty/);
  });
});

describe("order and delete", () => {
  it("moves values and compares orders", () => {
    expect(moveValue([1, 2, 3], 2, -1)).toEqual([1, 3, 2]);
    expect(moveValue([1, 2, 3], 0, -1)).toEqual([1, 2, 3]);
    expect(sameOrder([1, 2], [1, 2])).toBe(true);
    expect(sameOrder([1, 2], [2, 1])).toBe(false);
  });
  it("counts rows before a delete and says what happens to them", () => {
    expect(countRowsFetch("account", "accountid", "industrycode", 3)).toContain('<condition attribute="industrycode" operator="eq" value="3"/>');
    expect(() => countRowsFetch("account", "accountid", "x'y", 3)).toThrow();
    const t = deleteConfirmText({ option: OPTS[0], rows: 42, isGlobal: true, name: "new_region", column: "account.industrycode" });
    expect(t).toMatch(/42 rows of this column hold it/);
    expect(t).toMatch(/other columns using it lose the option too/);
    expect(deleteConfirmText({ option: OPTS[0], rows: 0, column: "account.industrycode" })).not.toMatch(/break silently/);
    expect(deleteConfirmText({ option: OPTS[0], rows: "many", column: "c" })).toMatch(/More than 50,000/);
  });
});
