import { describe, it, expect } from "vitest";
import { autoMap, guessTable, mappingFit, matchHeader, fieldIndex, afterParen, columnIsGuid } from "../loaderMapping.js";

// an account table as the Loader sees it live (getFields shape) …
const ACCOUNT = [
  { logical: "accountid", display: "Account", type: "Uniqueidentifier", isPrimaryId: true },
  { logical: "name", display: "Account Name", type: "String", required: true },
  { logical: "accountnumber", display: "Account Number", type: "String" },
  { logical: "telephone1", display: "Main Phone", type: "String" },
  { logical: "emailaddress1", display: "Email", type: "String" },
  { logical: "address1_city", display: "Address 1: City", type: "String" },
  { logical: "industrycode", display: "Industry", type: "Picklist" },
  { logical: "statecode", display: "Status", type: "State" },
  { logical: "statuscode", display: "Status Reason", type: "Status" },
  { logical: "createdon", display: "Created On", type: "DateTime" },
  { logical: "modifiedon", display: "Modified On", type: "DateTime" },
  { logical: "primarycontactid", display: "Primary Contact", type: "Lookup", odataName: "_primarycontactid_value" },
  { logical: "parentaccountid", display: "Parent Account", type: "Lookup", odataName: "_parentaccountid_value" },
  { logical: "ownerid", display: "Owner", type: "Owner", odataName: "_ownerid_value" },
  { logical: "new_legacyid", display: "Legacy Id", type: "String" },
  { logical: "new_code", display: "Code", type: "String" },
  { logical: "new_code2", display: "Code", type: "String" },
];
const ACCOUNT_LK = [
  { lookupField: "primarycontactid", navProperty: "primarycontactid", targetEntity: "contact" },
  { lookupField: "parentaccountid", navProperty: "parentaccountid", targetEntity: "account" },
  { lookupField: "ownerid", navProperty: "ownerid", targetEntity: "systemuser" },
];
// … and the demo's shape (l / d / t, lookups stored as _x_value with their target)
const DEMO = [
  { l: "accountid", d: "Account ID", t: "Uniqueidentifier" },
  { l: "name", d: "Account Name", t: "String" },
  { l: "telephone1", d: "Main Phone", t: "String" },
  { l: "_primarycontactid_value", d: "Primary Contact", t: "Lookup", target: "contact" },
];
const G1 = "a1b2c3d4-e5f6-7890-abcd-ef1234567890", G2 = "b2c3d4e5-f6a7-8901-bcde-f12345678901";
const rowsOf = (headers, ...lines) => lines.map(l => Object.fromEntries(headers.map((h, i) => [h, l[i] ?? ""])));
const byCsv = (res) => Object.fromEntries(res.maps.map(m => [m.csv, m]));
const ENTS = [
  { l: "account", d: "Account", pk: "accountid" }, { l: "contact", d: "Contact", pk: "contactid" },
  { l: "email", d: "Email", pk: "activityid" }, { l: "task", d: "Task", pk: "activityid" },
];

describe("loaderMapping — logical names (what worked before, kept)", () => {
  it("maps logical names, skips the id and the audit fields, types the choice transforms", () => {
    const headers = ["accountid", "name", "telephone1", "statecode", "statuscode", "createdon", "versionnumber", "unknown_col"];
    const rows = rowsOf(headers, [G1, "ACME", "+33 1", "Active", "1", "2024-01-01", "123", "x"]);
    const m = byCsv(autoMap({ headers, rows, fields: ACCOUNT, lookupsMeta: ACCOUNT_LK, target: "account" }));
    expect(m.accountid).toMatchObject({ skip: true, isPK: true });
    expect(m.name).toMatchObject({ d365: "name", transform: "", auto: "logical" });
    expect(m.telephone1.d365).toBe("telephone1");
    expect(m.statecode).toMatchObject({ d365: "statecode", transform: "statecode" });
    expect(m.statuscode).toMatchObject({ d365: "statuscode", transform: "int" }); // numeric values → int
    expect(m.createdon).toMatchObject({ skip: true, auto: "system" });
    expect(m.versionnumber.skip).toBe(true);
    expect(m.unknown_col.d365).toBe(""); expect(m.unknown_col.skip).toBeFalsy();
  });
  it("a GUID column of a lookup becomes a direct lookup with the relationship's target and nav", () => {
    const headers = ["name", "parentaccountid", "ownerid"];
    const rows = rowsOf(headers, ["A", G1, G2]);
    const res = autoMap({ headers, rows, fields: ACCOUNT, lookupsMeta: ACCOUNT_LK, target: "account" });
    expect(byCsv(res).parentaccountid).toMatchObject({ skip: true, isLookup: true });
    expect(res.lookups).toEqual([
      { src: "", csv: "parentaccountid", entity: "account", nav: "parentaccountid", d365f: "", fb: "skip", mode: "direct" },
      { src: "", csv: "ownerid", entity: "systemuser", nav: "ownerid", d365f: "", fb: "skip", mode: "direct" },
    ]);
  });
  it("before the metadata (bare names), a GUID column named …id is still a lookup, with the known targets", () => {
    const headers = ["firstname", "parentcustomerid", "email", "transactioncurrencyid"];
    const rows = rowsOf(headers, ["Jean", G1, "j@x.fr", G2]);
    const res = autoMap({ headers, rows, fields: ["firstname", "lastname", "emailaddress1"], target: "contact" });
    expect(byCsv(res).firstname.d365).toBe("firstname");
    expect(byCsv(res).email).toMatchObject({ d365: "emailaddress1", auto: "alias" });
    expect(res.lookups.map(l => [l.csv, l.entity, l.mode])).toEqual([["parentcustomerid", "parentcustomer", "direct"], ["transactioncurrencyid", "transactioncurrency", "direct"]]);
  });
  it("the first non-empty value decides, not the first row (a blank first cell hid lookups)", () => {
    const headers = ["name", "parentaccountid"];
    const rows = rowsOf(headers, ["A", ""], ["B", G1], ["C", G2]);
    const res = autoMap({ headers, rows, fields: ACCOUNT, lookupsMeta: ACCOUNT_LK, target: "account" });
    expect(res.lookups[0]).toMatchObject({ csv: "parentaccountid", mode: "direct" });
    expect(columnIsGuid(rows, "parentaccountid")).toBe(true);
  });
  it("dotted headers: one resolve lookup per parent when the metadata knows it; a plain dotted column stays a column", () => {
    const headers = ["name", "primarycontactid.emailaddress1", "primarycontactid.fullname", "Q1.Revenue"];
    const rows = rowsOf(headers, ["A", "j@x.fr", "Jean", "12"]);
    const res = autoMap({ headers, rows, fields: ACCOUNT, lookupsMeta: ACCOUNT_LK, target: "account" });
    expect(res.lookups).toEqual([{ src: "primarycontactidId", csv: "primarycontactid.emailaddress1", entity: "contact", nav: "primarycontactid", d365f: "", fb: "skip", mode: "resolve" }]);
    expect(res.maps.map(m => m.csv)).toEqual(["name", "Q1.Revenue"]);
    expect(res.fit).toMatchObject({ total: 3, matched: 2, lookups: 1, unmatched: ["Q1.Revenue"] });
  });
  it("a GUID-shaped column whose field is a text column is a text column, not a lookup", () => {
    const headers = ["new_legacyid"];
    const rows = rowsOf(headers, [G1]);
    const res = autoMap({ headers, rows, fields: ACCOUNT, lookupsMeta: ACCOUNT_LK, target: "account" });
    expect(byCsv(res).new_legacyid.d365).toBe("new_legacyid"); expect(byCsv(res).new_legacyid.skip).toBeFalsy();
    expect(res.lookups).toEqual([]);
  });
  it("an alias applies only when the table has the field", () => {
    const res = autoMap({ headers: ["Phone", "Website"], rows: [], fields: ACCOUNT, target: "account" });
    expect(byCsv(res).Phone).toMatchObject({ d365: "telephone1", auto: "alias" });
    expect(byCsv(res).Website.d365).toBe(""); // no websiteurl on this table
  });
});

describe("loaderMapping — a Dynamics export (display names, hidden columns, names in lookups)", () => {
  const headers = ["(Do Not Modify) Account", "(Do Not Modify) Row Checksum", "(Do Not Modify) Modified On", "Account Name", "Main Phone", "Address 1: City", "Industry", "Status", "Status Reason", "Primary Contact", "Owner", "Code", "Something Else"];
  const rows = rowsOf(headers, [G1, "abc123==", "2024-01-15 10:00", "ACME", "+33 1", "Paris", "Consulting", "Active", "Active", "Jean Dupont", "Zoe Admin", "C1", "x"], [G2, "def456==", "2024-01-16 10:00", "Globex", "+49 30", "Berlin", "Finance", "Inactive", "Inactive", "", "Zoe Admin", "C2", "y"]);
  const res = autoMap({ headers, rows, fields: ACCOUNT, lookupsMeta: ACCOUNT_LK, target: "account", tableDisplay: "Account", primaryNames: { contact: "fullname", systemuser: "fullname" } });
  const m = byCsv(res);
  it("the export's record id column is the primary key; its bookkeeping columns are skipped", () => {
    expect(m["(Do Not Modify) Account"]).toMatchObject({ skip: true, isPK: true });
    expect(m["(Do Not Modify) Row Checksum"]).toMatchObject({ skip: true, auto: "export" });
    expect(m["(Do Not Modify) Modified On"]).toMatchObject({ skip: true, auto: "system" });
  });
  it("display names map, whatever the case and spacing; choice labels get the picklist transform", () => {
    expect(m["Account Name"]).toMatchObject({ d365: "name", auto: "display" });
    expect(m["Main Phone"].d365).toBe("telephone1");
    expect(m["Address 1: City"].d365).toBe("address1_city");
    expect(m.Industry).toMatchObject({ d365: "industrycode", transform: "picklist" });
    expect(m.Status).toMatchObject({ d365: "statecode", transform: "statecode" });
    expect(m["Status Reason"]).toMatchObject({ d365: "statuscode", transform: "picklist" });
    expect(matchHeader("  account NAME ", fieldIndex(ACCOUNT)).entry.logical).toBe("name");
  });
  it("a lookup column of names becomes a resolve lookup on the related table's primary name", () => {
    expect(m["Primary Contact"]).toMatchObject({ skip: true, isLookup: true });
    expect(res.lookups).toEqual([
      { src: "", csv: "Primary Contact", entity: "contact", nav: "primarycontactid", d365f: "fullname", fb: "skip", mode: "resolve", byName: true },
      { src: "", csv: "Owner", entity: "systemuser", nav: "ownerid", d365f: "fullname", fb: "skip", mode: "resolve", byName: true },
    ]);
  });
  it("a display name two fields share is left unmapped and reported; the rest is counted", () => {
    expect(m.Code.d365).toBe("");
    expect(res.ambiguous).toEqual(["Code"]);
    expect(res.fit).toMatchObject({ total: 13, matched: 9, mapped: 6, lookups: 2, pk: 1, system: 2, unmatched: ["Code", "Something Else"] });
  });
  it("a localized export: only the parenthesised prefix is assumed, the table's display name does the rest", () => {
    const h2 = ["(Ne pas modifier) Compte", "(Ne pas modifier) Somme de contrôle", "Nom du compte"];
    const r2 = rowsOf(h2, [G1, "x==", "ACME"]);
    const fr = [{ logical: "accountid", display: "Compte", type: "Uniqueidentifier", isPrimaryId: true }, { logical: "name", display: "Nom du compte", type: "String" }];
    const m2 = byCsv(autoMap({ headers: h2, rows: r2, fields: fr, target: "account", tableDisplay: "Compte" }));
    expect(m2["(Ne pas modifier) Compte"]).toMatchObject({ isPK: true });
    expect(m2["(Ne pas modifier) Somme de contrôle"]).toMatchObject({ skip: true, auto: "export" });
    expect(m2["Nom du compte"].d365).toBe("name");
    expect(afterParen("(Do Not Modify) Account")).toBe("Account");
    expect(afterParen("Account")).toBe(null);
  });
  it("another table's export id column is skipped, never taken for this table's key", () => {
    const h3 = ["(Do Not Modify) Contact", "Account Name"];
    const m3 = byCsv(autoMap({ headers: h3, rows: rowsOf(h3, [G1, "ACME"]), fields: ACCOUNT, target: "account", tableDisplay: "Account" }));
    expect(m3["(Do Not Modify) Contact"]).toMatchObject({ skip: true, auto: "export" }); expect(m3["(Do Not Modify) Contact"].isPK).toBeFalsy();
  });
  it("Colvio's own export: OData names, names in the lookup columns; the demo's _x_value fields match too", () => {
    const h4 = ["accountid", "name", "_primarycontactid_value", "_ownerid_value"];
    const r4 = rowsOf(h4, [G1, "ACME", "Jean Dupont", "Zoe Admin"]);
    const res4 = autoMap({ headers: h4, rows: r4, fields: ACCOUNT, lookupsMeta: ACCOUNT_LK, target: "account", primaryNames: { contact: "fullname" } });
    expect(byCsv(res4)._primarycontactid_value).toMatchObject({ isLookup: true });
    expect(res4.lookups.map(l => [l.csv, l.entity, l.d365f, l.mode])).toEqual([["_primarycontactid_value", "contact", "fullname", "resolve"], ["_ownerid_value", "systemuser", "", "resolve"]]);
    const demo = autoMap({ headers: ["Account ID", "Account Name", "Primary Contact"], rows: rowsOf(["Account ID", "Account Name", "Primary Contact"], [G1, "ACME", "Jean"]), fields: DEMO, target: "account", tableDisplay: "Account" });
    expect(byCsv(demo)["Account ID"]).toMatchObject({ isPK: true });
    expect(byCsv(demo)["Account Name"].d365).toBe("name");
    expect(demo.lookups[0]).toMatchObject({ csv: "Primary Contact", entity: "contact", nav: "primarycontactid", mode: "resolve" });
  });
});

describe("loaderMapping — matching again when the table changes", () => {
  const headers = ["Full Name", "Email", "Account Name", "Industry"];
  const rows = rowsOf(headers, ["Jean Dupont", "j@x.fr", "ACME", "Consulting"]);
  const CONTACT = [
    { logical: "contactid", display: "Contact", type: "Uniqueidentifier", isPrimaryId: true },
    { logical: "fullname", display: "Full Name", type: "String" },
    { logical: "emailaddress1", display: "Email", type: "String" },
    { logical: "description", display: "Description", type: "Memo" },
  ];
  it("the file read against the wrong table maps nothing; the right table maps it", () => {
    const wrong = autoMap({ headers, rows, fields: ACCOUNT, target: "account" });
    expect(wrong.fit.matched).toBe(3); // Email, Account Name, Industry are account columns
    expect(byCsv(wrong)["Full Name"].d365).toBe("");
    const right = autoMap({ headers, rows, fields: CONTACT, target: "contact", prev: wrong.maps });
    expect(byCsv(right)["Full Name"].d365).toBe("fullname");
    expect(byCsv(right).Email.d365).toBe("emailaddress1");
    expect(byCsv(right)["Account Name"].d365).toBe(""); // not a contact column: the old auto mapping is gone
  });
  it("a manual choice survives when its field exists on the new table; one whose field doesn't is matched again from its name", () => {
    const prev = [
      { csv: "Full Name", d365: "description", transform: "", manual: true },
      { csv: "Email", d365: "emailaddress1", transform: "lower", manual: true },
      { csv: "Account Name", d365: "name", transform: "", manual: true },
      { csv: "Industry", d365: "industrycode", transform: "picklist", auto: "display" },
    ];
    const m = byCsv(autoMap({ headers, rows, fields: CONTACT, target: "contact", prev }));
    expect(m["Full Name"]).toMatchObject({ d365: "description", manual: true });
    expect(m.Email).toMatchObject({ d365: "emailaddress1", transform: "lower", manual: true });
    expect(m["Account Name"].d365).toBe(""); expect(m["Account Name"].manual).toBeFalsy(); // back on account it maps again
    expect(m.Industry).toMatchObject({ d365: "" }); // auto on the old table, nothing on this one
    expect(byCsv(autoMap({ headers, rows, fields: CONTACT, target: "contact", prev, keepManual: false }))["Full Name"].d365).toBe("fullname");
  });
});

describe("loaderMapping — which table the file comes from", () => {
  it("the export's id column names the table; so does a <table>id column of GUIDs", () => {
    const h1 = ["(Do Not Modify) Contact", "Full Name"];
    expect(guessTable(h1, rowsOf(h1, [G1, "Jean"]), ENTS)).toMatchObject({ logical: "contact", display: "Contact" });
    const h2 = ["accountid", "name"];
    expect(guessTable(h2, rowsOf(h2, [G1, "ACME"]), ENTS)).toMatchObject({ logical: "account" });
  });
  it("says nothing when the id column is shared by several tables, isn't GUIDs, or there is none", () => {
    const h1 = ["activityid", "subject"];
    expect(guessTable(h1, rowsOf(h1, [G1, "Call"]), ENTS)).toBe(null);
    const h2 = ["accountid", "name"];
    expect(guessTable(h2, rowsOf(h2, ["ACC-001", "ACME"]), ENTS)).toBe(null);
    expect(guessTable(["name"], rowsOf(["name"], ["ACME"]), ENTS)).toBe(null);
    expect(guessTable(["(Do Not Modify) Account"], rowsOf(["(Do Not Modify) Account"], [G1]), [])).toBe(null);
  });
  it("mappingFit counts the columns the table accounts for", () => {
    const fit = mappingFit([{ csv: "a", d365: "a" }, { csv: "b", d365: "", skip: true, isPK: true }, { csv: "c", d365: "", skip: true, isLookup: true }, { csv: "d", d365: "" }, { csv: "e", d365: "", skip: true }], [{ src: "pId", csv: "p.x" }], ["d"]);
    expect(fit).toEqual({ total: 6, matched: 4, mapped: 1, lookups: 2, pk: 1, system: 1, unmatched: ["d"], ambiguous: ["d"] });
  });
});
