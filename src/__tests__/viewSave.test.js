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
    expect(builderToFetchXml({ entity: "", attrs: [] }).error).toMatch(/No table/);
    expect(builderToFetchXml({ entity: "account", attrs: ["name"], groups: [{ conditions: [{ field: "name", op: "regex", value: "x" }] }], fieldTypes }).error).toMatch(/can't be saved/);
  });
});

describe("builderToFetchXml — related tables", () => {
  const contactFields = [{ l: "fullname", t: "String" }, { l: "emailaddress1", t: "String" }, { l: "statecode", t: "State" }];
  const oppFields = [{ l: "name", t: "String" }, { l: "statecode", t: "State" }, { l: "estimatedvalue", t: "Money" }];
  const parent = { navProperty: "primarycontactid", targetEntity: "contact", lookupField: "primarycontactid", type: "single", allFields: contactFields };
  const children = { navProperty: "opportunity_customer_accounts", targetEntity: "opportunity", lookupField: "customerid", type: "collection", allFields: oppFields };

  it("an EXPAND is an outer link-entity carrying its columns under the nav property", () => {
    const r = builderToFetchXml({ entity: "account", attrs: ["name"], primaryId: "accountid", expands: [
      { ...parent, targetPk: "contactid", fields: ["fullname", "emailaddress1"] },
      { ...children, targetPk: "opportunityid", fields: ["name"], conditions: [{ field: "statecode", op: "eq", value: "0" }, { field: "gone", op: "eq", value: "1" }], conditionLogic: "and" },
      { ...parent, navProperty: "ownerid", targetEntity: "systemuser", lookupField: "ownerid", fields: [] }, // no column picked: not a join
    ] });
    expect(r.fetchxml).toBe('<fetch version="1.0" mapping="logical"><entity name="account"><attribute name="name"/>'
      + '<link-entity name="contact" from="contactid" to="primarycontactid" link-type="outer" alias="primarycontactid"><attribute name="fullname"/><attribute name="emailaddress1"/></link-entity>'
      + '<link-entity name="opportunity" from="customerid" to="accountid" link-type="outer" alias="opportunity_customer_accounts"><attribute name="name"/><filter type="and"><condition attribute="statecode" operator="eq" value="0"/></filter></link-entity>'
      + '</entity></fetch>');
    // the view's columns follow: alias.attribute
    expect(layoutColumns(r.fetchxml, "accountid")).toEqual(["name", "primarycontactid.fullname", "primarycontactid.emailaddress1", "opportunity_customer_accounts.name"]);
  });
  it("a parent REL filter is an inner join on its conditions; none set → no join", () => {
    const r = builderToFetchXml({ entity: "account", attrs: ["name"], primaryId: "accountid", relFilters: [
      { ...parent, targetPk: "contactid", mode: "any", conditionLogic: "or", conditions: [{ field: "emailaddress1", op: "contains", value: "@gmail" }, { field: "statecode", op: "eq", value: "1" }] },
      { ...parent, navProperty: "ownerid", targetEntity: "systemuser", lookupField: "ownerid", conditions: [{ field: "", op: "eq", value: "" }] },
    ] });
    expect(r.fetchxml).toBe('<fetch version="1.0" mapping="logical"><entity name="account"><attribute name="name"/>'
      + '<link-entity name="contact" from="contactid" to="primarycontactid" link-type="inner" alias="rel_primarycontactid"><filter type="or"><condition attribute="emailaddress1" operator="like" value="%@gmail%"/><condition attribute="statecode" operator="eq" value="1"/></filter></link-entity>'
      + '</entity></fetch>');
    expect(layoutColumns(r.fetchxml, "accountid")).toEqual(["name"]); // a REL filter shows no column
  });
  it("a child REL filter is link-type any / not any, with the child's conditions", () => {
    const has = builderToFetchXml({ entity: "account", attrs: ["name"], primaryId: "accountid", relFilters: [{ ...children, targetPk: "opportunityid", mode: "any", conditions: [{ field: "statecode", op: "eq", value: "0" }] }] });
    expect(has.fetchxml).toContain('<link-entity name="opportunity" from="customerid" to="accountid" link-type="any"><filter type="and"><condition attribute="statecode" operator="eq" value="0"/></filter></link-entity>');
    const none = builderToFetchXml({ entity: "account", attrs: ["name"], primaryId: "accountid", relFilters: [{ ...children, targetPk: "opportunityid", mode: "none", conditions: [] }] });
    expect(none.fetchxml).toContain('<link-entity name="opportunity" from="customerid" to="accountid" link-type="not any"></link-entity>');
  });
  it("keys fall back to <table>id, dropped conditions follow the Builder's schema-drift guard", () => {
    const r = builderToFetchXml({ entity: "account", attrs: ["name"], expands: [{ ...parent, fields: ["fullname"] }], relFilters: [{ ...children, mode: "any", conditions: [{ field: "statecode", op: "eq", value: "0" }] }] });
    expect(r.fetchxml).toContain('from="contactid" to="primarycontactid"');
    expect(r.fetchxml).toContain('from="customerid" to="accountid" link-type="any"');
    // every condition of a child filter gone from the schema: the filter is skipped, not turned into "has any child"
    const drifted = builderToFetchXml({ entity: "account", attrs: ["name"], relFilters: [{ ...children, mode: "any", conditions: [{ field: "gone", op: "eq", value: "0" }] }] });
    expect(drifted.fetchxml).not.toContain("link-entity");
    // a condition the view can't hold is refused with the reason
    expect(builderToFetchXml({ entity: "account", attrs: ["name"], relFilters: [{ ...parent, conditions: [{ field: "fullname", op: "regex", value: "x" }] }] }).error).toMatch(/can't be saved/);
    expect(builderToFetchXml({ entity: "account", attrs: ["name"], expands: [{ ...parent, lookupField: "bad name", fields: ["fullname"] }] }).error).toMatch(/link-entity/);
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
