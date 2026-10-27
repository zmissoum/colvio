import { describe, it, expect } from "vitest";
import { normalizeODataInput, displayODataPath, entityForSet, looksLikeOData } from "../odataPaste.js";

const ORG = "https://contoso.crm4.dynamics.com";

describe("normalizeODataInput", () => {
  it("reads Colvio's own GET form", () => {
    expect(normalizeODataInput("GET /api/data/v9.2/accounts?$select=name&$top=5", ORG))
      .toEqual({ path: "accounts?$select=name&$top=5", entitySet: "accounts", host: null, foreignHost: false });
  });
  it("reads a full URL from this org, %-encoded or not", () => {
    expect(normalizeODataInput(`${ORG}/api/data/v9.2/contacts?$select=fullname&$filter=statecode%20eq%200`, ORG))
      .toEqual({ path: "contacts?$select=fullname&$filter=statecode%20eq%200", entitySet: "contacts", host: "contoso.crm4.dynamics.com", foreignHost: false });
    expect(normalizeODataInput(`${ORG}/api/data/v9.0/accounts?%24select=name`, ORG).path).toBe("accounts?%24select=name");
  });
  it("flags a URL from another environment (it will run on this one)", () => {
    expect(normalizeODataInput("https://fabrikam-dev.crm.dynamics.com/api/data/v9.2/accounts?$top=1", ORG))
      .toMatchObject({ entitySet: "accounts", foreignHost: true, host: "fabrikam-dev.crm.dynamics.com" });
  });
  it("reads /api/data/… paths, bare paths, records and line breaks", () => {
    expect(normalizeODataInput("/api/data/v9.1/leads?$top=3", ORG).path).toBe("leads?$top=3");
    expect(normalizeODataInput("accounts?$select=name", ORG).path).toBe("accounts?$select=name");
    expect(normalizeODataInput("accounts(a1b2c3d4-e5f6-7890-abcd-ef1234567890)?$select=name", ORG).entitySet).toBe("accounts");
    expect(normalizeODataInput("GET /api/data/v9.2/accounts?$select=name\n&$top=5", ORG).path).toBe("accounts?$select=name&$top=5");
  });
  it("refuses what isn't an OData query", () => {
    expect(normalizeODataInput("", ORG).error).toBeTruthy();
    expect(normalizeODataInput(`${ORG}/main.aspx?etn=account`, ORG).error).toMatch(/Web API URL/);
    expect(normalizeODataInput("https://", ORG).error).toBeTruthy();
    expect(normalizeODataInput("$select=name", ORG).error).toMatch(/table name/);
    expect(normalizeODataInput("SELECT name FROM account", ORG).error).toMatch(/table name/);
  });
});

describe("helpers", () => {
  it("shows a path the way the OData box does", () => {
    expect(displayODataPath("accounts?$top=1")).toBe("GET /api/data/v9.2/accounts?$top=1");
  });
  it("finds the table behind an entity set", () => {
    const ents = [{ l: "account", p: "accounts" }, { l: "fou_station", p: "fou_stations" }];
    expect(entityForSet(ents, "FOU_STATIONS")).toEqual({ l: "fou_station", p: "fou_stations" });
    expect(entityForSet(ents, "nope")).toBeNull();
  });
  it("tells an OData query from other pasted text", () => {
    expect(looksLikeOData(`${ORG}/api/data/v9.2/accounts`)).toBe(true);
    expect(looksLikeOData("GET /api/data/v9.2/accounts")).toBe(true);
    expect(looksLikeOData("api/data/v9.2/accounts")).toBe(true);
    expect(looksLikeOData("accounts?$top=1")).toBe(false);
    expect(looksLikeOData("hello")).toBe(false);
  });
});

describe("review pass", () => {
  it("drops the indentation of a wrapped query with its line breaks", () => {
    expect(normalizeODataInput("accounts?$select=name\n   &$top=5\n", "https://org.crm.dynamics.com").path).toBe("accounts?$select=name&$top=5");
  });
});

describe("line breaks inside a query", () => {
  it("a break inside a $filter stands for a space; one next to a delimiter is pure wrapping", () => {
    expect(normalizeODataInput("accounts?$filter=statecode eq 0\n and revenue gt 1000\n&$select=name", ORG).path).toBe("accounts?$filter=statecode eq 0 and revenue gt 1000&$select=name");
    expect(normalizeODataInput("accounts?$select=name,\n  revenue&$expand=contacts(\n$select=fullname\n)", ORG).path).toBe("accounts?$select=name,revenue&$expand=contacts($select=fullname)");
  });
});
