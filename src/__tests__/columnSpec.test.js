import { describe, it, expect } from "vitest";
import { parseSpecSheet, deriveSchemaName, parseOptions, validateSpecs, buildCreateBody, kindOf, requiredOf, TEMPLATE_HEADERS, TEMPLATE_ROWS, summarizeResults } from "../columnSpec.js";

const ctx = { prefix: "new", existingFields: [{ logical: "name" }, { logical: "new_sapid" }], entities: [{ logical: "account" }, { logical: "systemuser" }], valuePrefix: 10000 };

describe("reading the sheet", () => {
  it("maps header aliases, keeps row numbers, reports unknown headers", () => {
    const r = parseSpecSheet([["Display Name", "type", "Required?", "Max_Length", "Choices", "Foo"], ["SAP ID", "Text", "yes", "20", "", "x"], [], ["Risk", "Choice", "", "", "Low;High", ""]]);
    expect(r.error).toBeUndefined();
    expect(r.unknownHeaders).toEqual(["Required?", "Foo"]);
    expect(r.specs.map(s => [s.row, s.label, s.typeWord, s.maxLength, s.options])).toEqual([[2, "SAP ID", "Text", "20", ""], [4, "Risk", "Choice", "", "Low;High"]]);
    expect(parseSpecSheet([["Type"], ["Text"]]).error).toMatch(/Display name/);
    expect(parseSpecSheet([]).error).toMatch(/empty/);
  });
  it("knows the words", () => {
    expect(kindOf("Whole Number")).toBe("integer");
    expect(kindOf("yes/no")).toBe("boolean");
    expect(kindOf("Multiple Lines of Text")).toBe("memo");
    expect(kindOf("foo")).toBe(null);
    expect(requiredOf("Business Required")).toBe("ApplicationRequired");
    expect(requiredOf("")).toBe("None");
  });
  it("derives schema names and options", () => {
    expect(deriveSchemaName("Annual revenue (EUR)", "new")).toBe("new_AnnualRevenueEUR");
    expect(deriveSchemaName("Chiffre d'affaires été", "cr1a2_")).toBe("cr1a2_ChiffreDAffairesEte");
    expect(parseOptions("Low;Medium;High", 10000)).toEqual([{ value: 100000000, label: "Low" }, { value: 100000001, label: "Medium" }, { value: 100000002, label: "High" }]);
    expect(parseOptions("1:A | 2 = B")).toEqual([{ value: 1, label: "A" }, { value: 2, label: "B" }]);
  });
});

describe("validation", () => {
  const sheet = (rows) => parseSpecSheet([TEMPLATE_HEADERS, ...rows]).specs;
  it("accepts the template", () => {
    const v = validateSpecs(sheet(TEMPLATE_ROWS), { ...ctx, existingFields: [{ logical: "name" }] });
    expect(v.every(s => !s.errors.length)).toBe(true);
    expect(v.map(s => s.schema)).toEqual(["new_SAPID", "new_CreditLimit", "new_RiskLevel", "new_Audited", "new_LastAudit", "new_KeyAccountManager", "new_InternalNotes"]);
    expect(v[2].options.map(o => o.value)).toEqual([100000000, 100000001, 100000002]);
    expect(v[0].required).toBe("Recommended");
  });
  it("refuses what Dataverse would, before anything is sent", () => {
    const v = validateSpecs(sheet([
      ["SAP ID", "", "Text", "", "", "", "", "", "", "", "", ""],
      ["Name", "new_SapId", "Text", "", "", "", "", "", "", "", "", ""],
      ["Weird", "", "Blob", "maybe", "", "", "", "", "", "", "", ""],
      ["Risk", "", "Choice", "", "", "", "", "", "", "", "", ""],
      ["Owner", "", "Lookup", "", "", "", "", "", "", "contact", "", ""],
      ["Too long", "", "Text", "", "9000", "", "", "", "", "", "", ""],
      ["Range", "", "Whole number", "", "", "", "10", "5", "", "", "", ""],
      ["Risk", "", "Choice", "", "", "", "", "", "Low;Low", "", "", ""],
      ["Other", "other_Thing", "Text", "", "", "", "", "", "", "", "", ""],
    ]), ctx);
    expect(v[0].errors[0]).toMatch(/already exists/);
    expect(v[1].errors.join(" ")).toMatch(/already exists/);
    expect(v[2].errors.join(" ")).toMatch(/Unknown type/);
    expect(v[2].errors.join(" ")).toMatch(/Unknown required level/);
    expect(v[3].errors[0]).toMatch(/needs its options/);
    expect(v[4].errors[0]).toMatch(/isn't in this org/);
    expect(v[5].errors[0]).toMatch(/1 to 4000/);
    expect(v[6].errors[0]).toMatch(/Min is above max/);
    expect(v[7].errors.join(" ")).toMatch(/given twice/);
    expect(v[8].errors[0]).toMatch(/doesn't start with the solution's prefix/);
    expect(validateSpecs(sheet([["Plain", "Plain", "Text", "", "", "", "", "", "", "", "", ""]]), ctx)[0]).toMatchObject({ schema: "new_Plain", errors: [] });
  });
});

describe("bodies", () => {
  const spec = (over) => validateSpecs([{ row: 2, label: "SAP ID", schema: "", typeWord: "Text", requiredWord: "", maxLength: "", precision: "", min: "", max: "", options: "", description: "", target: "", format: "", ...over }], ctx)[0];
  it("text, choice, yes/no, date", () => {
    const s = buildCreateBody(spec({ maxLength: "20", format: "email", description: "d" }), { entity: "account", languageCode: 1036 });
    expect(s.kind).toBe("attribute");
    expect(s.body).toMatchObject({ "@odata.type": "Microsoft.Dynamics.CRM.StringAttributeMetadata", AttributeType: "String", SchemaName: "new_SAPID", MaxLength: 20, FormatName: { Value: "Email" }, RequiredLevel: { Value: "None" } });
    expect(s.body.DisplayName.LocalizedLabels[0]).toMatchObject({ Label: "SAP ID", LanguageCode: 1036 });
    expect(s.body.Description.LocalizedLabels[0].Label).toBe("d");
    const c = buildCreateBody(spec({ label: "Risk", typeWord: "Choice", options: "Low;High" }), { entity: "account" }).body;
    expect(c["@odata.type"]).toBe("Microsoft.Dynamics.CRM.PicklistAttributeMetadata");
    expect(c.OptionSet.Options.map(o => o.Value)).toEqual([100000000, 100000001]);
    const b = buildCreateBody(spec({ label: "Audited", typeWord: "Yes/No", options: "Non;Oui" }), { entity: "account" }).body;
    expect(b.OptionSet.TrueOption.Label.LocalizedLabels[0].Label).toBe("Oui");
    expect(buildCreateBody(spec({ label: "When", typeWord: "Date" }), { entity: "account" }).body).toMatchObject({ Format: "DateOnly", DateTimeBehavior: { Value: "DateOnly" } });
    expect(buildCreateBody(spec({ label: "Amount", typeWord: "Currency", precision: "3" }), { entity: "account" }).body).toMatchObject({ PrecisionSource: 0, Precision: 3 });
    expect(buildCreateBody(spec({ label: "Multi", typeWord: "multiselect", options: "A;B" }), { entity: "account" }).body).toMatchObject({ AttributeType: "Virtual", AttributeTypeName: { Value: "MultiSelectPicklistType" } });
  });
  it("a lookup is a one-to-many relationship carrying the column", () => {
    const r = buildCreateBody(spec({ label: "Key account manager", typeWord: "Lookup", target: "systemuser" }), { entity: "account" });
    expect(r.kind).toBe("relationship");
    expect(r.body).toMatchObject({ "@odata.type": "Microsoft.Dynamics.CRM.OneToManyRelationshipMetadata", SchemaName: "new_systemuser_account_KeyAccountManager", ReferencedEntity: "systemuser", ReferencingEntity: "account", CascadeConfiguration: { Delete: "RemoveLink" } });
    expect(r.body.Lookup).toMatchObject({ "@odata.type": "Microsoft.Dynamics.CRM.LookupAttributeMetadata", SchemaName: "new_KeyAccountManager" });
  });
  it("summarises", () => {
    expect(summarizeResults([{ ok: true }, { ok: false }, {}])).toEqual({ ok: 1, failed: 1, skipped: 1 });
  });
});
