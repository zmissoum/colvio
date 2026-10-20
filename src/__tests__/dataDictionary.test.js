import { describe, it, expect } from "vitest";
import { dictRows, labelOf, requiredLabel, typeLabel, chunks, optionSetsFrom, DICT_HEADERS } from "../dataDictionary.js";

const L = (s) => ({ UserLocalizedLabel: { Label: s }, LocalizedLabels: [{ Label: s }] });

describe("data dictionary rows", () => {
  it("reads labels, required levels and types", () => {
    expect(labelOf(L("Account"))).toBe("Account");
    expect(labelOf({ LocalizedLabels: [{ Label: "Compte" }] })).toBe("Compte");
    expect(labelOf(null)).toBe("");
    expect(requiredLabel({ Value: "ApplicationRequired" })).toBe("Required");
    expect(requiredLabel({ Value: "SystemRequired" })).toBe("System required");
    expect(typeLabel({ AttributeTypeName: { Value: "LookupType" } })).toBe("Lookup");
    expect(typeLabel({ AttributeType: "Money" })).toBe("Money");
  });
  it("lists every column, table by table, without helper columns", () => {
    const defs = [
      { LogicalName: "contact", DisplayName: L("Contact"), Description: L("People"), Attributes: [
        { LogicalName: "fullname", SchemaName: "FullName", DisplayName: L("Full Name"), AttributeTypeName: { Value: "StringType" }, RequiredLevel: { Value: "None" }, IsPrimaryName: true, IsValidForCreate: false, IsValidForUpdate: false },
        { LogicalName: "contactid", SchemaName: "ContactId", DisplayName: L("Contact"), AttributeTypeName: { Value: "UniqueidentifierType" }, RequiredLevel: { Value: "SystemRequired" }, IsPrimaryId: true, IsValidForCreate: true },
        { LogicalName: "parentcustomeridname", AttributeOf: "parentcustomerid" },
      ] },
      { LogicalName: "account", DisplayName: L("Account"), Attributes: [
        { LogicalName: "new_score", SchemaName: "new_Score", DisplayName: L("Score"), Description: L("Lead score"), AttributeTypeName: { Value: "IntegerType" }, RequiredLevel: { Value: "Recommended" }, IsCustomAttribute: true, IsValidForCreate: true, IsValidForUpdate: true },
      ] },
    ];
    const rows = dictRows(defs);
    expect(rows.map(r => `${r[0]}.${r[2]}`)).toEqual(["account.new_score", "contact.contactid", "contact.fullname"]);
    expect(rows[0]).toEqual(["account", "Account", "new_score", "new_Score", "Score", "Integer", "Recommended", "Yes", "", "", "Yes", "Yes", "Lead score", ""]);
    expect(rows[1].slice(6, 10)).toEqual(["System required", "No", "Yes", ""]);
    expect(rows[2][13]).toBe("People");
    expect(rows[0]).toHaveLength(DICT_HEADERS.length);
  });
  it("packets tables", () => {
    expect(chunks([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });
});

describe("option sets of a table in one read per type", () => {
  it("takes local options, else the global choice", () => {
    const out = optionSetsFrom([
      { LogicalName: "industrycode", OptionSet: { Options: [{ Value: 1, Label: L("Retail"), IsDefaultValue: true }] } },
      { LogicalName: "new_region", OptionSet: { Options: [] }, GlobalOptionSet: { Options: [{ Value: 100000000, Label: L("EMEA"), Color: "#0000ff" }] } },
      { LogicalName: "statecode", OptionSet: { Options: [{ Value: 0, Label: L("Active") }, { Value: 1, Label: L("Inactive") }] } },
    ]);
    expect(out.industrycode).toEqual([{ value: 1, label: "Retail", labels: ["Retail"], color: null, description: "", isDefault: true }]);
    expect(out.new_region[0]).toMatchObject({ value: 100000000, label: "EMEA", color: "#0000ff" });
    expect(out.statecode.map(o => o.label)).toEqual(["Active", "Inactive"]);
  });
});
