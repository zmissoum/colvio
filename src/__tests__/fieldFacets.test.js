import { describe, it, expect } from "vitest";
import { facetMap, facetText, facetTitle, facetCells, FACET_CASTS } from "../fieldFacets.js";

describe("fieldFacets", () => {
  it("merges the typed casts by column", () => {
    const m = facetMap([
      { LogicalName: "name", MaxLength: 160, Format: "Text" },
      { LogicalName: "amount", MinValue: 0, MaxValue: 100, Precision: 2 },
      { LogicalName: "createdon", Format: "DateAndTime", DateTimeBehavior: { Value: "UserLocal" } },
      { LogicalName: "doc", MaxSizeInKB: 32768 },
      { MaxLength: 5 },
    ]);
    expect(m).toEqual({
      name: { maxLength: 160, format: "Text" },
      amount: { minValue: 0, maxValue: 100, precision: 2 },
      createdon: { format: "DateAndTime", dateBehavior: "UserLocal" },
      doc: { maxSizeKB: 32768 },
    });
  });
  it("reads every typed cast getFields needs", () => {
    expect(FACET_CASTS.map(c => c[0])).toContain("StringAttributeMetadata");
    expect(FACET_CASTS.every(([, sel]) => sel.startsWith("LogicalName,"))).toBe(true);
  });
  it("text: max length, non-default format", () => {
    expect(facetText({ type: "String", maxLength: 100, format: "Text" })).toBe("max 100");
    expect(facetText({ type: "String", maxLength: 100, format: "Email" })).toBe("max 100 · Email");
    expect(facetText({ type: "Memo", maxLength: 1048576, format: "TextArea" })).toBe("max 1,048,576");
  });
  it("numbers: decimals, a range only when narrowed", () => {
    expect(facetText({ type: "Integer", minValue: -2147483648, maxValue: 2147483647, format: "None" })).toBe("");
    expect(facetText({ type: "Integer", minValue: 0, maxValue: 1000, format: "None" })).toBe("0 – 1,000");
    expect(facetText({ type: "Integer", minValue: 0, maxValue: 2147483647, format: "Duration" })).toBe("0 – 2,147,483,647 · Duration");
    expect(facetText({ type: "Decimal", precision: 2, minValue: -100000000000, maxValue: 100000000000 })).toBe("2 decimals");
    expect(facetText({ type: "Double", precision: 1, minValue: 0, maxValue: 5 })).toBe("1 decimal · 0 – 5");
    expect(facetText({ type: "Money", precision: 2, precisionSource: 2, minValue: -922337203685477, maxValue: 922337203685477 })).toBe("currency precision");
    expect(facetText({ type: "Money", precision: 4, precisionSource: 0 })).toBe("4 decimals");
  });
  it("dates and files", () => {
    expect(facetText({ type: "DateTime", format: "DateOnly", dateBehavior: "DateOnly" })).toBe("date · date only");
    expect(facetText({ type: "DateTime", format: "DateAndTime", dateBehavior: "TimeZoneIndependent" })).toBe("date and time · time-zone independent");
    expect(facetText({ type: "File", maxSizeKB: 32768 })).toBe("max 32 MB");
    expect(facetText({ type: "Image", maxSizeKB: 512 })).toBe("max 512 KB");
  });
  it("nothing known → empty, never a crash", () => {
    expect(facetText(undefined)).toBe("");
    expect(facetText({ type: "Lookup" })).toBe("");
    expect(facetTitle(undefined)).toBe("");
  });
  it("tooltip and export cells keep the defaults", () => {
    const f = { type: "Integer", minValue: -2147483648, maxValue: 2147483647, format: "None" };
    expect(facetTitle(f)).toBe("Min: -2,147,483,648\nMax: 2,147,483,647\nFormat: None");
    expect(facetCells({ type: "String", maxLength: 100, format: "Email" })).toEqual([100, "", "", "", "Email"]);
    expect(facetCells({ type: "Money", precision: 2, precisionSource: 2 })).toEqual(["", "currency precision", "", "", ""]);
    expect(facetCells(undefined)).toEqual(["", "", "", "", ""]);
  });
});
