import { describe, it, expect } from "vitest";
import { demoSqlAnswer, unknownColumnError, checkViewFetchXml, createDemoViews, demoExpandColumns } from "../explorerDemo.js";
import { builderToFetchXml, viewFetchXml, describeView, viewRelatedText, indentXml } from "../viewSave.js";

// A small copy of the demo org's account columns and rows (shared.jsx FLDS / ROWS shapes).
const FIELDS = [
  { l: "accountid", t: "Uniqueidentifier" },
  { l: "name", t: "String" },
  { l: "accountnumber", t: "String" },
  { l: "revenue", t: "Money" },
  { l: "address1_city", t: "String" },
  { l: "telephone2", t: "String" },
  { l: "statecode", t: "State", opts: [{ v: 0, l: "Active" }, { v: 1, l: "Inactive" }] },
  { l: "industrycode", t: "Picklist", opts: [{ v: 4, l: "Consulting" }, { v: 9, l: "Manufacturing" }, { v: 10, l: "Technology" }] },
  { l: "createdon", t: "DateTime" },
  { l: "_ownerid_value", t: "Lookup" },
];
const ROWS = [
  { accountid: "a1", name: "ACME France", accountnumber: "ACC-001", revenue: 15000000, address1_city: "Paris", statecode: "Active", industrycode: "Manufacturing", createdon: "2022-03-15T10:30:00Z", _ownerid_value: "Jean Dupont" },
  { accountid: "a2", name: "Globex GmbH", accountnumber: "ACC-002", revenue: 28000000, address1_city: "Berlin", statecode: "Active", industrycode: "Technology", createdon: "2021-11-08T14:15:00Z", _ownerid_value: "Marie Martin" },
  { accountid: "a3", name: "Wayne Enterprises", accountnumber: "ACC-003", revenue: 95000000, address1_city: "Gotham", statecode: "Active", industrycode: "Consulting", createdon: "2020-06-22T08:00:00Z", _ownerid_value: "Pierre Bernard" },
  { accountid: "a4", name: "Umbrella Corp", accountnumber: "ACC-006", revenue: 42000000, address1_city: "Tokyo", statecode: "Inactive", industrycode: "Technology", createdon: "2025-07-04T11:00:00Z", _ownerid_value: "Emma Petit" },
];
const ask = (sql, engine = "native") => demoSqlAnswer(sql, { engine, rows: ROWS, fields: FIELDS });

describe("demo SQL — the SELECT list is the grid", () => {
  it("returns the named columns, in the SELECT's order, aliases included", () => {
    const r = ask("SELECT revenue, name AS account, accountid FROM account");
    expect(r.fields).toEqual(["revenue", "account", "accountid"]);
    expect(Object.keys(r.data[0])).toEqual(["revenue", "account", "accountid"]);
    expect(r.data[0]).toEqual({ revenue: 15000000, account: "ACME France", accountid: "a1" });
    expect(r.data).toHaveLength(4);
  });
  it("reads a qualified column, a lookup by its name, any case", () => {
    const r = ask("SELECT a.Name, ownerid FROM account a");
    expect(r.fields).toEqual(["Name", "ownerid"]);
    expect(r.data[1]).toEqual({ Name: "Globex GmbH", ownerid: "Marie Martin" });
  });
  it("a column of the table with no value is a column of nulls", () => {
    expect(ask("SELECT name, telephone2 FROM account").data[0]).toEqual({ name: "ACME France", telephone2: null });
  });
  it("refuses an unknown column with the server's words, per engine", () => {
    expect(ask("SELECT name, citty FROM account")).toEqual({ error: "Invalid column name 'citty'." });
    expect(ask("SELECT name, citty FROM account", "fetchxml")).toEqual({ error: unknownColumnError("fetchxml", "account", "citty") });
    expect(unknownColumnError("fetchxml", "account", "citty")).toMatch(/^'account' entity doesn't contain attribute with Name = 'citty'/);
    expect(ask("SELECT name FROM account WHERE nope = 1").error).toMatch(/nope/);
    expect(ask("SELECT name FROM account ORDER BY nope").error).toMatch(/nope/);
    expect(ask("SELECT x.name FROM account a").error).toMatch(/could not be bound/);
  });
  it("is honest about what the demo org doesn't hold", () => {
    expect(ask("SELECT fullname FROM contact").error).toMatch(/rows for account only/);
    expect(ask("SELECT a.name, c.fullname FROM account a JOIN contact c ON c.parentcustomerid = a.accountid").error).toMatch(/JOIN/);
  });
  it("native refuses what the native engine doesn't take; transpiled answers it", () => {
    expect(ask("SELECT * FROM account").error).toMatch(/SELECT \*/);
    expect(ask("SELECT TOP 2 name FROM account").error).toMatch(/TOP/);
    const all = ask("SELECT * FROM account", "fetchxml");
    expect(all.fields).toEqual(FIELDS.map(f => f.l));
    expect(ask("SELECT TOP 2 name FROM account", "fetchxml").data).toEqual([{ name: "ACME France" }, { name: "Globex GmbH" }]);
  });
});

describe("demo SQL — WHERE, ORDER BY, DISTINCT, aggregates", () => {
  it("filters: dates, numbers, options by number or label, LIKE, IN, NULL", () => {
    expect(ask("SELECT name FROM account WHERE createdon < '2024-01-01'").data).toHaveLength(3);
    expect(ask("SELECT name FROM account WHERE revenue > 30000000").data.map(r => r.name)).toEqual(["Wayne Enterprises", "Umbrella Corp"]);
    expect(ask("SELECT name FROM account WHERE statecode = 1").data).toEqual([{ name: "Umbrella Corp" }]);
    expect(ask("SELECT name FROM account WHERE statecode = 'Inactive'").data).toEqual([{ name: "Umbrella Corp" }]);
    expect(ask("SELECT name FROM account WHERE name LIKE 'g%'").data).toEqual([{ name: "Globex GmbH" }]);
    expect(ask("SELECT name FROM account WHERE address1_city IN ('Paris', 'Tokyo')").data).toHaveLength(2);
    expect(ask("SELECT name FROM account WHERE telephone2 IS NULL").data).toHaveLength(4);
    expect(ask("SELECT name FROM account WHERE telephone2 = 'x' OR (statecode = 0 AND address1_city = 'paris')").data).toEqual([{ name: "ACME France" }]);
  });
  it("sorts on a shown column, an alias or a column not shown", () => {
    expect(ask("SELECT name FROM account ORDER BY revenue DESC").data.map(r => r.name)).toEqual(["Wayne Enterprises", "Umbrella Corp", "Globex GmbH", "ACME France"]);
    expect(ask("SELECT name AS n FROM account ORDER BY n").data.map(r => r.n)[0]).toBe("ACME France");
    expect(ask("SELECT name FROM account ORDER BY statecode DESC, name").data[0]).toEqual({ name: "Umbrella Corp" });
  });
  it("DISTINCT and GROUP BY with aggregates", () => {
    expect(ask("SELECT DISTINCT industrycode FROM account").data).toHaveLength(3);
    const g = ask("SELECT industrycode, COUNT(*) AS n, SUM(revenue) AS total FROM account GROUP BY industrycode ORDER BY n DESC");
    expect(g.fields).toEqual(["industrycode", "n", "total"]);
    expect(g.data[0]).toEqual({ industrycode: "Technology", n: 2, total: 70000000 });
    expect(ask("SELECT COUNT(*) AS n FROM account WHERE revenue > 1000000000").data).toEqual([{ n: 0 }]);
    expect(ask("SELECT name, COUNT(*) AS n FROM account GROUP BY industrycode").error).toMatch(/not contained in either an aggregate/);
    expect(ask("SELECT industrycode, COUNT(*) AS n FROM account GROUP BY industrycode HAVING n > 1", "fetchxml").data).toEqual([{ industrycode: "Technology", n: 2 }]);
  });
  it("the preview SELECT of an UPDATE reads exactly what its WHERE matches", () => {
    const r = ask("SELECT accountid, name, statecode FROM account WHERE createdon < '2024-01-01'");
    expect(r.fields).toEqual(["accountid", "name", "statecode"]);
    expect(r.data.map(x => x.accountid)).toEqual(["a1", "a2", "a3"]);
  });
});

// The demo metadata of a few tables (schemaDemo.js shapes reduced to their names).
const COLS = {
  account: ["accountid", "name", "accountnumber", "ownerid", "primarycontactid", "createdon"],
  contact: ["contactid", "fullname", "emailaddress1", "telephone1", "parentcustomerid"],
};
const columnsOf = (t) => COLS[t] || null;

describe("demo Save as view — checked like the server", () => {
  const expand = { navProperty: "primarycontactid", targetEntity: "contact", lookupField: "primarycontactid", type: "single", fields: ["fullname", "emailaddress1"], conditions: [], allFields: [{ l: "fullname", t: "String" }, { l: "emailaddress1", t: "String" }] };
  const rel = { navProperty: "contact_customer_accounts", targetEntity: "contact", lookupField: "parentcustomerid", type: "collection", mode: "any", conditions: [{ field: "", op: "eq", value: "" }], allFields: [{ l: "fullname", t: "String" }] };
  const built = builderToFetchXml({ entity: "account", attrs: ["name", "accountnumber"], groups: [{ logic: "and", conditions: [{ field: "accountnumber", op: "startswith", value: "ACC" }] }], orderBy: { f: "accountnumber", dir: "asc" }, fieldTypes: { name: "String", accountnumber: "String" }, expands: [expand], relFilters: [rel], primaryId: "accountid" });
  const view = viewFetchXml(built.fetchxml, "accountid");

  it("accepts a view with an expanded lookup and a related-records filter", () => {
    expect(checkViewFetchXml(view.fetchxml, columnsOf)).toEqual({ ok: true });
    const v = createDemoViews(columnsOf);
    const a = v.create({ entity: "account", name: "Key accounts", fetchxml: view.fetchxml, layoutxml: "" });
    const b = v.create({ entity: "account", name: "Again", fetchxml: view.fetchxml, layoutxml: "" });
    expect(a.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(b.id).not.toBe(a.id);
    expect(v.list().map(x => x.name)).toEqual(["Key accounts", "Again"]);
  });
  it("refuses a column the related table doesn't have, in Dataverse's words", () => {
    const bad = view.fetchxml.replace('<attribute name="emailaddress1"/>', '<attribute name="accountnumber"/>');
    expect(checkViewFetchXml(bad, columnsOf)).toEqual({ error: "'contact' entity doesn't contain attribute with Name = 'accountnumber' and NameMapping = 'Logical'." });
    expect(() => createDemoViews(columnsOf).create({ fetchxml: bad })).toThrow(/'contact' entity doesn't contain attribute/);
    expect(checkViewFetchXml(view.fetchxml.replace('from="parentcustomerid"', 'from="parentid"'), columnsOf).error).toMatch(/'contact'.*'parentid'/);
    expect(checkViewFetchXml('<fetch><entity name="account"><attribute name="name"/><filter><condition entityname="pc" attribute="nope" operator="eq" value="1"/></filter><link-entity name="contact" from="contactid" to="primarycontactid" alias="pc"/></entity></fetch>', columnsOf).error).toMatch(/'contact'.*'nope'/);
  });
  it("doesn't judge a table it has no metadata for", () => {
    expect(checkViewFetchXml('<fetch><entity name="task"><attribute name="anything"/></entity></fetch>', columnsOf)).toEqual({ ok: true });
  });
  it("says what the view holds: related columns and related filters", () => {
    const d = describeView(view.fetchxml, "accountid");
    expect(d.columns).toEqual(["name", "accountnumber", "primarycontactid.fullname", "primarycontactid.emailaddress1"]);
    expect(d.related).toEqual([
      { table: "contact", alias: "primarycontactid", kind: "columns", columns: 2 },
      { table: "contact", alias: "", kind: "any", columns: 0 },
    ]);
    expect(viewRelatedText(d.related)).toEqual(["2 columns from contact (primarycontactid)", "only rows with at least one contact"]);
    expect(viewRelatedText([{ table: "contact", alias: "", kind: "not any", columns: 0 }, { table: "contact", alias: "rel_x", kind: "inner", columns: 0 }])).toEqual(["only rows with no contact", "only rows whose contact matches its conditions"]);
    expect(indentXml("<fetch><entity name=\"a\"><attribute name=\"b\"/></entity></fetch>")).toBe("<fetch>\n  <entity name=\"a\">\n    <attribute name=\"b\"/>\n  </entity>\n</fetch>");
  });
});

describe("demo Builder — expanded lookups", () => {
  it("fills the owner and the primary contact the demo knows, leaves the rest empty", () => {
    const rows = [{ accountid: "a1b2c3d4-e5f6-7890-abcd-ef1234567890", name: "ACME France", _ownerid_value: "Jean Dupont" }];
    const r = demoExpandColumns(rows, [
      { targetEntity: "contact", lookupField: "primarycontactid", type: "single", fields: ["fullname", "emailaddress1"] },
      { targetEntity: "systemuser", lookupField: "ownerid", type: "single", fields: ["fullname", "title"] },
      { targetEntity: "task", lookupField: "regardingobjectid", type: "collection", fields: ["subject"] },
    ]);
    expect(r.fields).toEqual(["contact.fullname", "contact.emailaddress1", "systemuser.fullname", "systemuser.title", "task.subject"]);
    expect(r.data[0]).toMatchObject({ name: "ACME France", "contact.fullname": "Claire Fontaine", "contact.emailaddress1": "claire.fontaine@acme.fr", "systemuser.fullname": "Jean Dupont", "systemuser.title": null, "task.subject": null });
  });
});
