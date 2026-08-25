import { describe, it, expect } from "vitest";
import { buildFilterClause } from "../filterUtils.js";

const FL = [
  { l: "name", odata: "name", t: "String" },
  { l: "revenue", odata: "revenue", t: "Money" },
  { l: "statecode", odata: "statecode", t: "State" },
  { l: "donotemail", odata: "donotemail", t: "Boolean" },
  { l: "modifiedon", odata: "modifiedon", t: "DateTime" },
  { l: "parentaccountid", odata: "_parentaccountid_value", t: "Lookup" },
  { l: "accountid", odata: "accountid", t: "Uniqueidentifier" },
];
const G = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";

describe("buildFilterClause", () => {
  it("string functions and their negations; quotes are escaped as ''", () => {
    expect(buildFilterClause("name", "contains", "O'Brien", FL)).toBe("contains(name,'O''Brien')");
    expect(buildFilterClause("name", "not_startswith", "AC", FL)).toBe("not startswith(name,'AC')");
  });
  it("null operators need no value", () => {
    expect(buildFilterClause("name", "is_null", "", FL)).toBe("name eq null");
    expect(buildFilterClause("parentaccountid", "is_not_null", "", FL)).toBe("_parentaccountid_value ne null");
  });
  it("numeric types go unquoted ONLY for strictly numeric values — injection text gets quoted inert", () => {
    expect(buildFilterClause("revenue", "gt", "1000.5", FL)).toBe("revenue gt 1000.5");
    expect(buildFilterClause("revenue", "eq", "1 or 1 eq 1", FL)).toBe("revenue eq '1 or 1 eq 1'");
    expect(buildFilterClause("statecode", "eq", "0", FL)).toBe("statecode eq 0");
  });
  it("booleans unquoted only for true/false", () => {
    expect(buildFilterClause("donotemail", "eq", "true", FL)).toBe("donotemail eq true");
    expect(buildFilterClause("donotemail", "eq", "vrai", FL)).toBe("donotemail eq 'vrai'");
  });
  it("lookups/uniqueidentifiers: valid GUID unquoted on the _value column, anything else quoted", () => {
    expect(buildFilterClause("parentaccountid", "eq", G, FL)).toBe(`_parentaccountid_value eq ${G}`);
    expect(buildFilterClause("parentaccountid", "eq", "not-a-guid", FL)).toBe("_parentaccountid_value eq 'not-a-guid'");
    expect(buildFilterClause("accountid", "ne", G, FL)).toBe(`accountid ne ${G}`);
  });
  it("contains on a non-string type degrades to eq instead of an invalid function call", () => {
    expect(buildFilterClause("revenue", "contains", "10", FL)).toBe("revenue eq 10");
  });
  it("dates stay quoted strings (Dataverse accepts them); unknown fields fall back to the raw name", () => {
    expect(buildFilterClause("modifiedon", "ge", "2026-08-01", FL)).toBe("modifiedon ge '2026-08-01'");
    expect(buildFilterClause("ghostfield", "eq", "x", FL)).toBe("ghostfield eq 'x'");
  });
  it("no field or no value → empty clause", () => {
    expect(buildFilterClause("", "eq", "x", FL)).toBe("");
    expect(buildFilterClause("name", "eq", "", FL)).toBe("");
  });
});
