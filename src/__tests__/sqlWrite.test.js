import { describe, it, expect } from "vitest";
import { parseValue, parseSqlWrite, previewSelect, describeSets, rawForPrepare, updateMetaFor } from "../sqlWrite.js";
import { prepareUpdate } from "../updateUtils.js";

describe("parseValue", () => {
  it("reads the constants it supports", () => {
    expect(parseValue("NULL")).toEqual({ value: null, sql: "NULL" });
    expect(parseValue("true")).toEqual({ value: true, sql: "TRUE" });
    expect(parseValue("-12.5")).toMatchObject({ value: -12.5, raw: "-12.5" });
    expect(parseValue("'O''Brien, Ltd'")).toEqual({ value: "O'Brien, Ltd", sql: "'O''Brien, Ltd'" });
    expect(parseValue("N'café'").value).toBe("café");
  });
  it("refuses expressions and other columns", () => {
    expect(parseValue("revenue * 2").error).toMatch(/isn't a constant/);
    expect(parseValue("name").error).toBeTruthy();
  });
});

describe("parseSqlWrite", () => {
  it("is not a write: null", () => {
    expect(parseSqlWrite("SELECT name FROM account")).toBeNull();
    expect(parseSqlWrite("")).toBeNull();
  });
  it("reads an UPDATE with several columns, commas and keywords inside strings", () => {
    const p = parseSqlWrite("UPDATE account SET telephone1 = '01, 02 WHERE 03', revenue = 1500, description = NULL WHERE statecode = 0 AND name LIKE 'A%';");
    expect(p).toMatchObject({ kind: "update", table: "account", alias: null, where: "statecode = 0 AND name LIKE 'A%'" });
    expect(p.sets.map(s => [s.col, s.value])).toEqual([["telephone1", "01, 02 WHERE 03"], ["revenue", 1500], ["description", null]]);
  });
  it("accepts an alias and prefixed columns", () => {
    const p = parseSqlWrite("UPDATE account AS a SET a.creditonhold = TRUE WHERE a.revenue > 1000");
    expect(p).toMatchObject({ alias: "a", where: "a.revenue > 1000" });
    expect(p.sets[0]).toMatchObject({ col: "creditonhold", value: true });
  });
  it("reads a DELETE, with or without FROM and alias", () => {
    expect(parseSqlWrite("DELETE FROM contact WHERE emailaddress1 IS NULL")).toEqual({ kind: "delete", table: "contact", alias: null, where: "emailaddress1 IS NULL" });
    expect(parseSqlWrite("delete lead l where l.statecode = 2")).toEqual({ kind: "delete", table: "lead", alias: "l", where: "l.statecode = 2" });
  });
  it("demands a WHERE and refuses what it can't do safely", () => {
    expect(parseSqlWrite("UPDATE account SET name = 'x'").error).toMatch(/Add a WHERE/);
    expect(parseSqlWrite("DELETE FROM account").error).toMatch(/IS NOT NULL/);
    expect(parseSqlWrite("UPDATE account SET name = 'x' WHERE ").error).toMatch(/Add a WHERE/);
    expect(parseSqlWrite("UPDATE a SET name = 'x' FROM account a JOIN contact c ON 1=1 WHERE c.x = 1").error).toMatch(/FROM \/ JOIN/);
    expect(parseSqlWrite("UPDATE account SET revenue = revenue + 1 WHERE name = 'x'").error).toMatch(/constant/);
    expect(parseSqlWrite("UPDATE account SET name = 'a', name = 'b' WHERE x = 1").error).toMatch(/set twice/);
    expect(parseSqlWrite("UPDATE account WHERE x = 1").error).toMatch(/Expected UPDATE/);
  });
});

describe("preview and typing", () => {
  it("builds the preview SELECT: key, name, then the columns being set", () => {
    const p = parseSqlWrite("UPDATE account SET telephone1 = '1', name = 'X' WHERE statecode = 0");
    expect(previewSelect(p, "accountid", "name")).toBe("SELECT accountid, name, telephone1 FROM account WHERE statecode = 0");
    const d = parseSqlWrite("DELETE FROM contact c WHERE c.lastname = 'Doe'");
    expect(previewSelect(d, "contactid", "fullname")).toBe("SELECT contactid, fullname FROM contact AS c WHERE c.lastname = 'Doe'");
    expect(describeSets(p.sets)).toBe("telephone1 = '1', name = 'X'");
  });
  it("types the values through the shared write preparation (refusals before anything is sent)", () => {
    const fields = [{ l: "revenue", t: "Money" }, { l: "creditonhold", t: "Boolean" }, { l: "industrycode", t: "Picklist" }, { l: "parentaccountid", odata: "_parentaccountid_value", t: "Lookup" }];
    const lookups = [{ navProperty: "parentaccountid", targetEntity: "account", lookupField: "parentaccountid", type: "single" }];
    const meta = { ...updateMetaFor(fields, lookups, [{ l: "account", p: "accounts" }]), odataFieldMap: {} };
    const p = parseSqlWrite("UPDATE account SET revenue = 1500, creditonhold = FALSE, industrycode = 3, parentaccountid = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' WHERE x = 1");
    const bodies = p.sets.map(st => prepareUpdate(meta, st.col, rawForPrepare(st)));
    expect(bodies.every(b => b.ok)).toBe(true);
    expect(Object.assign({}, ...bodies.map(b => b.body))).toEqual({ revenue: 1500, creditonhold: false, industrycode: 3, "parentaccountid@odata.bind": "/accounts(a1b2c3d4-e5f6-7890-abcd-ef1234567890)" });
    const bad = parseSqlWrite("UPDATE account SET industrycode = 'Retail' WHERE x = 1");
    expect(prepareUpdate(meta, "industrycode", rawForPrepare(bad.sets[0])).ok).toBe(false);
    expect(prepareUpdate(meta, "revenue", rawForPrepare(parseSqlWrite("UPDATE account SET revenue = NULL WHERE x = 1").sets[0])).body).toEqual({ revenue: null });
  });
});
