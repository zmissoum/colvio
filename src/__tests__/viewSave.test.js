import { describe, it, expect } from "vitest";
import { builderToFetchXml, viewFetchXml, layoutColumns, layoutXml, xmlEsc } from "../viewSave.js";

describe("builderToFetchXml", () => {
  const fieldTypes = { name: "String", revenue: "Money", creditonhold: "Boolean", statecode: "State", _ownerid_value: "Owner", ownerid: "Owner" };
  it("turns columns, groups, order into FetchXML", () => {
    const r = builderToFetchXml({
      entity: "account", attrs: ["name", "revenue"], groupLogic: "and", orderBy: { f: "name", dir: "desc" }, fieldTypes,
      groups: [
        { logic: "and", conditions: [{ field: "statecode", op: "eq", value: "0" }, { field: "name", op: "contains", value: "Contoso & Co" }] },
        { logic: "or", conditions: [{ field: "creditonhold", op: "eq", value: "true" }, { field: "revenue", op: "gt", value: "1000" }] },
      ],
    });
    expect(r.fetchxml).toBe('<fetch version="1.0" mapping="logical"><entity name="account"><attribute name="name"/><attribute name="revenue"/><order attribute="name" descending="true"/><filter type="and"><filter type="and"><condition attribute="statecode" operator="eq" value="0"/><condition attribute="name" operator="like" value="%Contoso &amp; Co%"/></filter><filter type="or"><condition attribute="creditonhold" operator="eq" value="1"/><condition attribute="revenue" operator="gt" value="1000"/></filter></filter></entity></fetch>');
  });
  it("maps null checks and text operators, skips empty conditions", () => {
    const r = builderToFetchXml({ entity: "contact", attrs: ["fullname"], fieldTypes: { fullname: "String", birthdate: "DateTime" }, groups: [{ logic: "and", conditions: [
      { field: "emailaddress1", op: "is_null" }, { field: "fullname", op: "not_startswith", value: "Test" }, { field: "birthdate", op: "contains", value: "2000-01-01" }, { field: "", op: "eq", value: "x" }, { field: "fullname", op: "eq", value: "" },
    ] }] });
    expect(r.fetchxml).toContain('<condition attribute="emailaddress1" operator="null"/>');
    expect(r.fetchxml).toContain('<condition attribute="fullname" operator="not-like" value="Test%"/>');
    expect(r.fetchxml).toContain('<condition attribute="birthdate" operator="eq" value="2000-01-01"/>');
    expect((r.fetchxml.match(/<condition/g) || []).length).toBe(3);
  });
  it("refuses what a Builder view can't carry", () => {
    expect(builderToFetchXml({ entity: "account", attrs: ["name"], hasExpands: true }).error).toMatch(/related tables/);
    expect(builderToFetchXml({ entity: "", attrs: [] }).error).toMatch(/No table/);
    expect(builderToFetchXml({ entity: "account", attrs: ["name"], groups: [{ conditions: [{ field: "name", op: "regex", value: "x" }] }], fieldTypes }).error).toMatch(/can't be saved/);
  });
});

describe("viewFetchXml", () => {
  it("drops paging and count attributes, adds the key, keeps the rest", () => {
    const r = viewFetchXml('<fetch top="50" page="2" count="10" distinct="true"><entity name="account"><attribute name="name"/><link-entity name="contact" from="parentcustomerid" to="accountid" alias="c"><attribute name="accountid"/></link-entity></entity></fetch>', "accountid");
    expect(r.entity).toBe("account");
    expect(r.fetchxml).toBe('<fetch distinct="true"><entity name="account"><attribute name="accountid"/><attribute name="name"/><link-entity name="contact" from="parentcustomerid" to="accountid" alias="c"><attribute name="accountid"/></link-entity></entity></fetch>');
    expect(viewFetchXml('<fetch><entity name="account"><attribute name="accountid"/></entity></fetch>', "accountid").fetchxml).toBe('<fetch><entity name="account"><attribute name="accountid"/></entity></fetch>');
  });
  it("refuses aggregates, all-attributes and non-FetchXML", () => {
    expect(viewFetchXml('<fetch aggregate="true"><entity name="a"/></fetch>').error).toMatch(/aggregate/);
    expect(viewFetchXml('<fetch><entity name="a"><all-attributes/></entity></fetch>').error).toMatch(/named columns/);
    expect(viewFetchXml("SELECT 1").error).toBeTruthy();
  });
});

describe("layout", () => {
  it("lists the view's columns, root first, links as alias.attribute, never the key", () => {
    const fx = '<fetch><entity name="account"><attribute name="accountid"/><attribute name="name"/><attribute name="revenue"/><link-entity name="systemuser" from="systemuserid" to="ownerid" alias="o"><attribute name="fullname"/></link-entity></entity></fetch>';
    expect(layoutColumns(fx, "accountid")).toEqual(["name", "revenue", "o.fullname"]);
  });
  it("builds the grid layout", () => {
    expect(layoutXml({ objectTypeCode: 1, primaryId: "accountid", primaryName: "name", columns: ["name", "o.fullname"] }))
      .toBe('<grid name="resultset" object="1" jump="name" select="1" icon="1" preview="1"><row name="result" id="accountid"><cell name="name" width="150"/><cell name="o.fullname" width="150"/></row></grid>');
    expect(xmlEsc('a"<')).toBe("a&quot;&lt;");
  });
});

describe("review pass", () => {
  it("finds the key among root attributes even after nested link-entities and alias-first attributes", () => {
    const fx = '<fetch><entity name="account"><link-entity name="contact" from="contactid" to="primarycontactid" alias="c"><link-entity name="systemuser" from="systemuserid" to="ownerid" alias="o"><attribute name="fullname"/></link-entity><attribute name="accountid"/></link-entity><attribute alias="k" name="accountid"/></entity></fetch>';
    const r = viewFetchXml(fx, "accountid");
    expect((r.fetchxml.match(/name="accountid"/g) || []).length).toBe(2); // the link's and the root's — none added
    expect(viewFetchXml("<fetch page='2' count='50'><entity name=\"account\"><attribute name=\"name\"/></entity></fetch>", "accountid").fetchxml).toMatch(/^<fetch><entity/);
  });
});
