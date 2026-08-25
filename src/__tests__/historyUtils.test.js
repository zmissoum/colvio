import { describe, it, expect } from "vitest";
import { buildHistoryEntry } from "../historyUtils.js";

const BASE = { entityLogical: "account", mode: "odata", fieldCount: 5, ts: 1756200000000 };

describe("buildHistoryEntry", () => {
  it("PRIVACY: $filter values are redacted from the stored query string", () => {
    const e = buildHistoryEntry({ ...BASE, query: "GET /api/data/v9.2/accounts?$select=name&$filter=emailaddress1 eq 'jane@x.com'&$top=10" });
    expect(e.query).toContain("$filter=...");
    expect(e.query).not.toContain("jane@x.com");
  });
  it("caps the stored query at 1000 chars (the old 200 cap chopped long $selects mid-token)", () => {
    const e = buildHistoryEntry({ ...BASE, query: "GET /x?$select=" + "a".repeat(2000) });
    expect(e.query.length).toBe(1000);
  });
  it("builder entries snapshot the STRUCTURE with condition values BLANKED and counted", () => {
    const e = buildHistoryEntry({
      ...BASE, mode: "builder", query: "GET /x?$filter=name eq 'secret'",
      builderState: {
        fields: ["accountid", "name"],
        filterGroups: [{ logic: "and", conditions: [{ field: "name", op: "contains", value: "secret" }, { field: "statecode", op: "eq", value: "" }] }],
        groupLogic: "and", limit: 0, orderBy: { f: "name", dir: "asc" }, hadRel: true, hadExpand: false,
      },
    });
    expect(e.builder.filterGroups[0].conditions[0]).toEqual({ field: "name", op: "contains", value: "" });
    expect(e.builder.redacted).toBe(1);
    expect(e.builder.hadRel).toBe(true);
    expect(e.builder.hadExpand).toBe(false);
    expect(e.builder.fields).toEqual(["accountid", "name"]);
    expect(JSON.stringify(e)).not.toContain("secret");
  });
  it("non-builder entries carry no builder snapshot; missing entity becomes '?'", () => {
    const e = buildHistoryEntry({ ...BASE, entityLogical: null, query: "q" });
    expect(e.builder).toBeUndefined();
    expect(e.entity).toBe("?");
  });
  it("builder mode without state (defensive) stays a plain entry", () => {
    const e = buildHistoryEntry({ ...BASE, mode: "builder", query: "q", builderState: null });
    expect(e.builder).toBeUndefined();
  });
});
