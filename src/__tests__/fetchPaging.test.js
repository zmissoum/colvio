import { describe, it, expect } from "vitest";
import { sqlSelectColumns, odataSelectColumns, orderColumns, fetchXmlColumns, streamColumns } from "../fetchPaging.js";

describe("column order follows the query", () => {
  it("sqlSelectColumns reads the SELECT list in order, with aliases and qualifiers", () => {
    expect(sqlSelectColumns("SELECT revenue, name, accountid FROM account").map(c => c.name)).toEqual(["revenue", "name", "accountid"]);
    expect(sqlSelectColumns("SELECT c.fullname, a.name AS company, COUNT(*) AS n, SUM(x) FROM contact c JOIN account a ON 1=1").map(c => c.name)).toEqual(["fullname", "company", "n"]);
    expect(sqlSelectColumns("SELECT TOP 10 DISTINCT statecode s, name FROM account").map(c => c.name)).toEqual(["s", "name"]);
    expect(sqlSelectColumns("SELECT * FROM account")).toEqual([]);
    expect(sqlSelectColumns("select primarycontactid, name from account")[0].keys).toEqual(["primarycontactid", "_primarycontactid_value"]);
    expect(sqlSelectColumns("SELECT a.name FROM account a")[0].keys).toEqual(["a.name", "name", "_name_value"]);
  });
  it("odataSelectColumns reads $select, encoded or not", () => {
    expect(odataSelectColumns("accounts?$select=revenue,name,primarycontactid&$top=5").map(c => c.name)).toEqual(["revenue", "name", "primarycontactid"]);
    expect(odataSelectColumns("accounts?%24select=name%2Crevenue").length).toBe(0); // only a literal $select is the query's own
    expect(odataSelectColumns("accounts?$select=name%2Crevenue").map(c => c.name)).toEqual(["name", "revenue"]);
    expect(odataSelectColumns("accounts(1)")).toEqual([]);
  });
  it("orderColumns puts the declared columns first, through the key the rows have, then the rest", () => {
    const payload = ["accountid", "name", "_primarycontactid_value", "revenue", "createdon"];
    expect(orderColumns(payload, sqlSelectColumns("SELECT revenue, primarycontactid, name FROM account"))).toEqual(["revenue", "_primarycontactid_value", "name", "accountid", "createdon"]);
    expect(orderColumns(payload, [])).toEqual(payload);
    expect(orderColumns(payload, [{ name: "gone", keys: ["gone"] }])).toEqual(payload);
    // a declared column present under two keys is used once
    expect(orderColumns(["name", "_name_value"], [{ name: "name", keys: ["name", "_name_value"] }])).toEqual(["name", "_name_value"]);
  });
  it("FetchXML and stream columns keep the declared order", () => {
    const fx = '<fetch><entity name="account"><attribute name="revenue"/><attribute name="name"/><link-entity name="contact" from="contactid" to="primarycontactid" alias="c"><attribute name="fullname"/></link-entity></entity></fetch>';
    expect(fetchXmlColumns(fx).cols.map(c => c.name)).toEqual(["revenue", "name", "c.fullname"]);
    expect(streamColumns(sqlSelectColumns("SELECT revenue, name FROM account"), [{ accountid: "1", name: "x", revenue: 2 }]).map(c => c.name)).toEqual(["revenue", "name", "accountid"]);
  });
});
