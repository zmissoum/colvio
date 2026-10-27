import { describe, it, expect } from "vitest";
import { sqlTables, sqlContext, suggestTables, columnScope, suggestColumns, applySuggestion } from "../sqlComplete.js";

const ENTS = [{ l: "account", d: "Account" }, { l: "contact", d: "Contact" }, { l: "teammembership", d: "Team Membership", tt: "Intersect" }, { l: "new_invoice", d: "Invoice" }];
const FIELDS = {
  account: [{ l: "accountid", d: "Account", t: "Uniqueidentifier" }, { l: "name", d: "Account Name", t: "String" }, { l: "revenue", d: "Annual Revenue", t: "Money" }],
  contact: [{ l: "contactid", d: "Contact", t: "Uniqueidentifier" }, { l: "fullname", d: "Full Name", t: "String" }, { l: "parentcustomerid", d: "Company Name", t: "Customer" }],
};
const at = (s) => { const i = s.indexOf("|"); return [s.replace("|", ""), i]; };

describe("sqlTables", () => {
  it("reads FROM / JOIN / UPDATE tables with their aliases, never a keyword as alias", () => {
    expect(sqlTables("SELECT name FROM account WHERE statecode = 0")).toEqual([{ name: "account", alias: null }]);
    expect(sqlTables("SELECT c.fullname FROM contact AS c JOIN account a ON c.parentcustomerid = a.accountid")).toEqual([{ name: "contact", alias: "c" }, { name: "account", alias: "a" }]);
    expect(sqlTables("UPDATE account SET name = 'x' WHERE accountid = '1'")).toEqual([{ name: "account", alias: null }]);
    expect(sqlTables("SELECT name FROM ")).toEqual([]);
  });
});

describe("sqlContext", () => {
  it("right after FROM / JOIN it is a table, after the table name nothing", () => {
    expect(sqlContext(...at("SELECT name FROM acc|")).kind).toBe("table");
    expect(sqlContext(...at("SELECT name FROM |")).kind).toBe("table");
    expect(sqlContext(...at("SELECT name FROM account |")).kind).toBe(null);
    expect(sqlContext(...at("SELECT name FROM account a JOIN con|")).kind).toBe("table");
    expect(sqlContext(...at("DELETE FROM con|")).kind).toBe("table");
  });
  it("in SELECT, WHERE, ON, ORDER BY it is a column; an alias qualifies the word", () => {
    expect(sqlContext(...at("SELECT na| FROM account")).kind).toBe("column");
    expect(sqlContext(...at("SELECT name, | FROM account")).kind).toBe("column");
    expect(sqlContext(...at("SELECT name FROM account WHERE state|")).kind).toBe("column");
    expect(sqlContext(...at("SELECT name FROM account WHERE statecode = 0 AND rev|")).kind).toBe("column");
    expect(sqlContext(...at("SELECT name FROM account ORDER BY na|")).kind).toBe("column");
    const c = sqlContext(...at("SELECT c.ful| FROM contact c"));
    expect(c.kind).toBe("column");
    expect(c.word).toMatchObject({ text: "ful", qualifier: "c" });
  });
  it("offers nothing inside a string literal, after TOP, or before any keyword", () => {
    expect(sqlContext(...at("SELECT name FROM account WHERE name = 'con|")).kind).toBe(null);
    expect(sqlContext(...at("SELECT name FROM account TOP 1|")).kind).toBe(null);
    expect(sqlContext(...at("sel|")).kind).toBe(null);
  });
  it("the word spans the identifier under the cursor", () => {
    const c = sqlContext("SELECT name FROM account", 9); // SELECT na|me
    expect(c.word).toMatchObject({ start: 7, end: 11, text: "na" });
  });
});

describe("suggestions", () => {
  it("tables: logical-name prefix first, then display name, then contains; nothing elsewhere", () => {
    const ctx = sqlContext(...at("SELECT * FROM te|"));
    expect(suggestTables(ctx, ENTS).map(s => s.insert)).toEqual(["teammembership"]);
    expect(suggestTables(sqlContext(...at("SELECT * FROM inv|")), ENTS).map(s => s.insert)).toEqual(["new_invoice"]);
    expect(suggestTables(sqlContext(...at("SELECT * FROM |")), ENTS)).toHaveLength(4);
    expect(suggestTables(sqlContext(...at("SELECT na| FROM account")), ENTS)).toEqual([]);
    expect(suggestTables(ctx, ENTS)[0].badge).toBe("Intersect");
  });
  it("columns: only the FROM table's, nothing without a table or with an unknown one", () => {
    const one = sqlContext(...at("SELECT na| FROM account"));
    expect(suggestColumns(one, columnScope(one, ENTS), FIELDS).map(s => s.insert)).toEqual(["name"]);
    const none = sqlContext(...at("SELECT na| FROM "));
    expect(columnScope(none, ENTS)).toEqual([]);
    const unknown = sqlContext(...at("SELECT na| FROM nosuchtable"));
    expect(columnScope(unknown, ENTS)).toEqual([]);
    // not loaded yet → nothing for that table (the caller loads and asks again)
    expect(suggestColumns(one, columnScope(one, ENTS), {})).toEqual([]);
  });
  it("columns across a join: alias-prefixed, and `alias.` narrows to one table", () => {
    const both = sqlContext(...at("SELECT | FROM contact c JOIN account a ON c.parentcustomerid = a.accountid"));
    const all = suggestColumns(both, columnScope(both, ENTS), FIELDS);
    expect(all.map(s => s.insert)).toContain("c.fullname");
    expect(all.map(s => s.insert)).toContain("a.name");
    const narrowed = sqlContext(...at("SELECT a.| FROM contact c JOIN account a ON c.parentcustomerid = a.accountid"));
    expect(suggestColumns(narrowed, columnScope(narrowed, ENTS), FIELDS).map(s => s.insert)).toEqual(["accountid", "name", "revenue"]);
    const unknownAlias = sqlContext(...at("SELECT z.| FROM contact c"));
    expect(columnScope(unknownAlias, ENTS)).toEqual([]);
  });
  it("applySuggestion replaces the word under the cursor", () => {
    const ctx = sqlContext(...at("SELECT na| FROM account"));
    expect(applySuggestion("SELECT na FROM account", ctx.word, "name")).toEqual({ text: "SELECT name FROM account", cursor: 11 });
    const q = sqlContext(...at("SELECT a.na|me FROM account a"));
    expect(applySuggestion("SELECT a.name FROM account a", q.word, "name").text).toBe("SELECT a.name FROM account a");
  });
});
