import { describe, it, expect } from "vitest";
import { extractBaseTable, redactSql, isSqlOptionUnsupported } from "../sqlNative.js";

describe("extractBaseTable", () => {
  it("reads the base table, alias or not, case-insensitively", () => {
    expect(extractBaseTable("SELECT name FROM account")).toBe("account");
    expect(extractBaseTable("SELECT a.name FROM Account AS a WHERE a.name LIKE 'x%'")).toBe("account");
  });
  it("a JOIN query yields the FIRST table (the one the URL's entity set must match)", () => {
    expect(extractBaseTable("SELECT a.name, c.fullname\nFROM account AS a\nINNER JOIN contact AS c ON a.accountid = c.parentcustomerid")).toBe("account");
  });
  it("no FROM → null (caller shows a readable error instead of guessing)", () => {
    expect(extractBaseTable("SELECT 1")).toBeNull();
    expect(extractBaseTable("")).toBeNull();
  });
});

describe("redactSql (history privacy)", () => {
  it("PRIVACY: string literals never persist — doubled-quote escapes included", () => {
    const r = redactSql("SELECT name FROM account WHERE emailaddress1 = 'jane@x.com' AND name LIKE 'O''Brien%'");
    expect(r).not.toContain("jane@x.com");
    expect(r).not.toContain("Brien");
    expect(r).toContain("'...'");
  });
  it("PRIVACY: standalone numbers are redacted, identifiers with digits survive", () => {
    const r = redactSql("SELECT telephone1, address1_city FROM account WHERE statecode = 0 AND revenue > 50000.5");
    expect(r).toContain("telephone1");
    expect(r).toContain("address1_city");
    expect(r).not.toMatch(/\b0\b/);
    expect(r).not.toContain("50000.5");
  });
  it("structure survives — the entry can still be understood and re-typed", () => {
    const r = redactSql("SELECT a.name FROM account AS a WHERE a.createdon >= DATEADD(day, -3, GETUTCDATE())");
    expect(r).toContain("FROM account AS a");
    expect(r).toContain("DATEADD(day,");
  });
});

describe("isSqlOptionUnsupported (fallback gate)", () => {
  it("matches the org-lacks-the-feature shapes", () => {
    expect(isSqlOptionUnsupported("The query parameter 'sql' is not supported")).toBe(true);
    expect(isSqlOptionUnsupported("Invalid query option 'sql'")).toBe(true);
    expect(isSqlOptionUnsupported("Could not find a property named 'sql' on type...")).toBe(true);
  });
  it("NEVER matches genuine SQL errors — those must reach the user, not trigger a re-run", () => {
    expect(isSqlOptionUnsupported("Invalid column name 'foo'.")).toBe(false);
    expect(isSqlOptionUnsupported("AggregateQueryRecordLimit exceeded. Cannot perform this operation.")).toBe(false);
    expect(isSqlOptionUnsupported("Syntax error near 'HAVING'. HAVING is not supported in SQL queries.")).toBe(false);
  });
});
