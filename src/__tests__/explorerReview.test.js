import { describe, it, expect } from "vitest";
import { countLabel, isCountCapped, completionLabel, isIncomplete, expandShortfall, pruneOrderBy, splitKnownColumns, unknownColumnsNote, resolveColumn, sqlColumnTracker } from "../explorerUtils.js";
import { sqlToFetchXml, transpileNotes, parseSqlToAst } from "../sqlToFetchXml.js";
import { sqlSelectColumns } from "../fetchPaging.js";

// Review pass of the Explorer (v1.11.217): the honesty rules and the pure helpers behind them.

describe("record counts: /$count stops at 5000", () => {
  it("5000 is a lower bound, not a size", () => {
    expect(countLabel(5000)).toBe("5,000+");
    expect(countLabel(12345)).toBe("12,345"); // above the cap the number came from an uncapped source (demo list, total-record-count) — exact
    expect(isCountCapped(5000)).toBe(true);
    expect(isCountCapped(4999)).toBe(false);
  });
  it("below the cap the count is exact", () => {
    expect(countLabel(4999)).toBe("4,999");
    expect(countLabel(0)).toBe("0");
    expect(countLabel(-1)).toBe(""); // "not available" from getEntityCount
    expect(countLabel(undefined)).toBe("");
  });
});

describe("completion wording after paging ends", () => {
  it("says nothing while pages are still coming", () => {
    expect(completionLabel({ fetching: true, stopped: true })).toBe("");
    expect(isIncomplete({ fetching: true, stopped: true })).toBe(false);
  });
  it("complete / stopped by the user / a failed page", () => {
    expect(completionLabel({ fetching: false })).toBe("loading complete");
    expect(completionLabel({ fetching: false, stopped: true })).toBe("stopped by you, incomplete");
    expect(completionLabel({ fetching: false, partial: true, partialPage: 7 })).toBe("incomplete (page 7 failed)");
    expect(completionLabel({ fetching: false, partial: true })).toBe("incomplete (a page failed)");
    expect(isIncomplete({ fetching: false, partial: true })).toBe(true);
    expect(isIncomplete({ fetching: false })).toBe(false);
    expect(isIncomplete(null)).toBe(false);
  });
  it("a stop wins over a failed page (the user's action is what explains the result)", () => {
    expect(completionLabel({ stopped: true, partial: true, partialPage: 3 })).toBe("stopped by you, incomplete");
  });
});

describe("$expand shortfall warning", () => {
  const base = { retrieved: 3000, count: 4000, hasExpand: true, filtered: false, topped: false, stopped: false, partial: false };
  it("warns with the exact count as denominator when the count is exact", () => {
    expect(expandShortfall(base)).toContain("3,000 records retrieved out of 4,000");
  });
  it("stays silent when the result is nearly complete, or another reason explains it", () => {
    expect(expandShortfall({ ...base, retrieved: 3900 })).toBeNull();
    expect(expandShortfall({ ...base, hasExpand: false })).toBeNull();
    expect(expandShortfall({ ...base, filtered: true })).toBeNull();
    expect(expandShortfall({ ...base, topped: true })).toBeNull();
    expect(expandShortfall({ ...base, stopped: true })).toBeNull();
    expect(expandShortfall({ ...base, partial: true })).toBeNull();
    expect(expandShortfall({ ...base, count: 0 })).toBeNull();
    expect(expandShortfall({ ...base, count: -1 })).toBeNull();
  });
  it("never uses a capped count as the denominator", () => {
    const m = expandShortfall({ ...base, count: 5000, retrieved: 3000 });
    expect(m).toContain("the table holds 5,000+ records");
    expect(m).toContain("so the result is incomplete");
    expect(m).not.toContain("out of 5,000");
    const maybe = expandShortfall({ ...base, count: 5000, retrieved: 5000 });
    expect(maybe).toContain("may be incomplete");
    expect(expandShortfall({ ...base, count: 5000, retrieved: 7000 })).toBeNull(); // past the cap nothing is knowable
  });
});

describe("orderBy against the table's fields", () => {
  it("keeps a sort on a known column, normalising the direction", () => {
    expect(pruneOrderBy({ f: "name", dir: "desc" }, ["name", "createdon"])).toEqual({ f: "name", dir: "desc" });
    expect(pruneOrderBy({ f: "name", dir: "DOWN" }, new Set(["name"]))).toEqual({ f: "name", dir: "asc" });
  });
  it("drops a sort column the table doesn't have (it was a 400 after a table switch)", () => {
    expect(pruneOrderBy({ f: "accountnumber", dir: "asc" }, ["fullname"])).toEqual({ f: "", dir: "asc" });
    expect(pruneOrderBy(null, ["fullname"])).toEqual({ f: "", dir: "asc" });
    expect(pruneOrderBy({ f: "", dir: "desc" }, [])).toEqual({ f: "", dir: "asc" });
  });
});

describe("saved / template columns the table no longer has", () => {
  it("splits known from unknown, keeping order", () => {
    expect(splitKnownColumns(["name", "oldcol", "createdon", "gone"], ["name", "createdon"])).toEqual({ known: ["name", "createdon"], unknown: ["oldcol", "gone"] });
    expect(splitKnownColumns([], ["name"])).toEqual({ known: [], unknown: [] });
    expect(splitKnownColumns(undefined, new Set(["name"]))).toEqual({ known: [], unknown: [] });
  });
  it("the note names them, counts them, and is empty when nothing is missing", () => {
    expect(unknownColumnsNote(["a", "b"])).toBe("2 saved columns aren't on this table: a, b — left out of the query");
    expect(unknownColumnsNote(["a"], { source: "template" })).toBe("1 template column isn't on this table: a — left out of the query");
    expect(unknownColumnsNote([], { source: "saved", orderBy: "revenue" })).toBe("the saved sort column revenue isn't on this table — sort removed");
    expect(unknownColumnsNote(["a"], { orderBy: "revenue" })).toBe("1 saved column isn't on this table: a — left out of the query; the saved sort column revenue isn't on this table — sort removed");
    expect(unknownColumnsNote([])).toBe("");
    expect(unknownColumnsNote(undefined)).toBe("");
  });
});

describe("SQL UPDATE: SET column resolved to the logical name, case-insensitively", () => {
  const fields = [{ l: "name", odata: "name" }, { l: "primarycontactid", odata: "_primarycontactid_value" }, { l: "new_Score", odata: "new_score" }];
  it("exact, then case-insensitive logical, then odata name", () => {
    expect(resolveColumn("name", fields)).toBe("name");
    expect(resolveColumn("Name", fields)).toBe("name");
    expect(resolveColumn("NAME", fields)).toBe("name");
    expect(resolveColumn("new_Score", fields)).toBe("new_Score");
    expect(resolveColumn("NEW_SCORE", fields)).toBe("new_Score");
    expect(resolveColumn("_PrimaryContactId_Value", fields)).toBe("primarycontactid");
  });
  it("null when nothing matches in any case — that is the only refusal", () => {
    expect(resolveColumn("revenue", fields)).toBeNull();
    expect(resolveColumn("", fields)).toBeNull();
    expect(resolveColumn("name", [])).toBeNull();
  });
});

describe("native-SQL columns: seeded from the SELECT list, widened by every row", () => {
  it("a selected column with no value in any row is still a column, in SELECT order", () => {
    const c = sqlColumnTracker(sqlSelectColumns("SELECT name, revenue, createdon FROM account"));
    c.add([{ createdon: "2024-01-01", name: "A" }, { name: "B" }]); // revenue null everywhere → absent from the payload
    expect(c.fields()).toEqual(["name", "revenue", "createdon"]);
    expect(c.fieldMap()).toEqual({ name: "name", revenue: "revenue", createdon: "createdon" });
    expect(c.size()).toBe(3);
  });
  it("a lookup is pointed at its _x_value key once a row shows it", () => {
    const c = sqlColumnTracker(sqlSelectColumns("SELECT name, primarycontactid FROM account"));
    expect(c.add([{ name: "A" }])).toBe(false);                       // nothing new, nothing re-pointed
    expect(c.add([{ name: "B", _primarycontactid_value: "guid" }])).toBe(true);
    expect(c.fields()).toEqual(["name", "primarycontactid"]);
    expect(c.fieldMap().primarycontactid).toBe("_primarycontactid_value");
  });
  it("columns the SELECT didn't name (SELECT *, a join) are discovered from ANY row of ANY page", () => {
    const c = sqlColumnTracker(sqlSelectColumns("SELECT * FROM account"));
    expect(c.fields()).toEqual([]);
    c.add([{ accountid: "1", name: "A", "name@OData.Community.Display.V1.FormattedValue": "A", "@odata.etag": "x" }]);
    expect(c.fields()).toEqual(["accountid", "name"]);
    // page 300's row carries a column no earlier row had: it joins the header (the 200/50-row sample used to miss it)
    const rows = Array.from({ length: 300 }, (_, i) => (i === 299 ? { accountid: String(i), revenue: 5 } : { accountid: String(i) }));
    expect(c.add(rows)).toBe(true);
    expect(c.fields()).toEqual(["accountid", "name", "revenue"]);
    expect(c.add([{ __error: "x" }])).toBe(false); // the row-level error marker is not a column
  });
  it("a qualified SELECT column (a.name) is found under whichever key the server used", () => {
    const c = sqlColumnTracker(sqlSelectColumns("SELECT c.fullname, a.name FROM contact c JOIN account a ON c.parentcustomerid = a.accountid"));
    c.add([{ fullname: "X", name: "Y" }]);
    expect(c.fields()).toEqual(["fullname", "name"]);
    expect(c.fieldMap()).toEqual({ fullname: "fullname", name: "name" });
  });
  it("does not re-point a column whose current key the row also carries", () => {
    const c = sqlColumnTracker([{ name: "x", keys: ["x", "_x_value"] }]);
    c.add([{ x: 1, _x_value: 2 }]);
    expect(c.fieldMap().x).toBe("x");
  });
});

describe("transpiled SQL: TOP above 5000 is said, not swallowed", () => {
  it("returns a warning next to the clamped FetchXML", () => {
    const r = sqlToFetchXml("SELECT TOP 10000 name FROM account");
    expect(r.error).toBeNull();
    expect(r.fetchXml).toContain('top="5000"');
    expect(r.warnings).toEqual(["TOP 10,000 asked, FetchXML allows 5000 — 5,000 returned; omit TOP to page everything."]);
  });
  it("no warning at or under the cap, or without TOP", () => {
    expect(sqlToFetchXml("SELECT TOP 5000 name FROM account").warnings).toEqual([]);
    expect(sqlToFetchXml("SELECT name FROM account").warnings).toEqual([]);
    expect(transpileNotes(parseSqlToAst("SELECT name FROM account WHERE statecode = 0 TOP 25"))).toEqual([]);
    expect(transpileNotes(null)).toEqual([]);
  });
  it("the return shape stays backward compatible", () => {
    const r = sqlToFetchXml("SELECT name FROM account");
    expect(Object.keys(r).sort()).toEqual(["error", "fetchXml", "warnings"]);
    expect(sqlToFetchXml("DELETE FROM account").error).toBeTruthy();
  });
});
