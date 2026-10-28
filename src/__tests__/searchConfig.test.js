import { describe, it, expect } from "vitest";
import { parseQuickFind, parseSearchStatus, buildSearchTables, searchSummary, searchExportRows, SEARCH_HEADERS } from "../searchConfig.js";
import { demoSearchConfig } from "../searchConfigDemo.js";

const FX = `<fetch version="1.0" mapping="logical"><entity name="account"><attribute name="name" /><attribute name="accountnumber" /><attribute name="accountid" /><order attribute="name" descending="false" /><filter type="and"><condition attribute="statecode" operator="eq" value="0" /></filter><filter type="or" isquickfindfields="1"><condition attribute="name" operator="like" value="{0}" /><condition attribute="accountnumber" operator="like" value="{0}" /><condition attribute='emailaddress1' operator='like' value='{0}' /></filter></entity></fetch>`;
const LX = `<grid name="resultset" object="1"><row name="result" id="accountid"><cell name="name" width="300" /><cell name="address1_city" width="100" /><cell name="accountid" ishidden="1" /><cell name="name" width="1" /></row></grid>`;

describe("search result columns - the Quick Find view", () => {
  it("find columns come from the quick-find filter only; result columns from the layout, hidden cells left out, no repeats", () => {
    const r = parseQuickFind(FX, LX);
    expect(r.findColumns).toEqual(["name", "accountnumber", "emailaddress1"]); // statecode's filter isn't quick find
    expect(r.resultColumns).toEqual(["name", "address1_city"]);
  });
  it("without a layout the fetch's attributes stand in; without xml, nothing", () => {
    expect(parseQuickFind(FX, "").resultColumns).toEqual(["name", "accountnumber", "accountid"]);
    expect(parseQuickFind("", "")).toEqual({ findColumns: [], resultColumns: [] });
    expect(parseQuickFind(null, undefined)).toEqual({ findColumns: [], resultColumns: [] });
  });
});

describe("search result columns - the index status", () => {
  const v2 = { value: { status: "Provisioned", entitystatusresults: [{ entityname: "Account", recordcount: "12", lastsynctimeutc: "2026-10-27T10:00:00Z", status: "EntitySyncCompleted", searchableattributes: ["name"] }, { entityname: "", recordcount: 1 }, null] } };
  it("reads the v2 endpoint's shape, the older function's JSON string, a bare object; refuses the rest", () => {
    const s = parseSearchStatus(v2);
    expect(s.status).toBe("Provisioned");
    expect(s.tables.account).toEqual({ status: "EntitySyncCompleted", lastSync: "2026-10-27T10:00:00Z", records: 12, searchable: ["name"] });
    expect(Object.keys(s.tables)).toEqual(["account"]);
    expect(parseSearchStatus({ response: JSON.stringify(v2.value) }).tables.account.records).toBe(12);
    expect(parseSearchStatus(JSON.stringify(v2)).status).toBe("Provisioned");
    expect(parseSearchStatus({ status: "NotProvisioned" })).toEqual({ status: "NotProvisioned", tables: {} });
    expect(parseSearchStatus({ value: [] })).toBe(null);
    expect(parseSearchStatus("not json")).toBe(null);
    expect(parseSearchStatus(null)).toBe(null);
    expect(parseSearchStatus({ response: "{bad" })).toBe(null);
  });
});

describe("search result columns - per table", () => {
  const entities = [
    { logical: "contact", display: "Contact", set: "contacts", enabled: true, canEnable: true },
    { logical: "account", display: "Account", set: "accounts", enabled: true, canEnable: true },
    { logical: "new_project", display: "Project", set: "new_projects", enabled: true, canEnable: true, isCustom: true },
    { logical: "activitypointer", display: "Activity", set: "activitypointers", enabled: false, canEnable: false },
    { logical: "lead", display: "Lead", set: "leads", enabled: false, canEnable: true },
  ];
  const views = [
    { id: "v1", name: "Quick Find Accounts", entity: "account", fetchxml: FX, layoutxml: LX, isDefault: true },
    { id: "v0", name: "Old quick find", entity: "account", fetchxml: FX, layoutxml: "", isDefault: false },
    { id: "v2", name: "Quick Find Contacts", entity: "CONTACT", fetchxml: `<fetch><entity name="contact"><attribute name="fullname" /><filter type="or" isquickfindfields="1"></filter></entity></fetch>`, layoutxml: `<grid><row><cell name="fullname" /></row></grid>`, isDefault: true },
    { id: "v3", name: "Quick Find Leads", entity: "lead", fetchxml: FX, layoutxml: LX, isDefault: true },
  ];
  const status = parseSearchStatus({ value: { status: "Provisioned", entitystatusresults: [{ entityname: "account", recordcount: 5, status: "EntitySyncCompleted", searchableattributes: ["name", "accountnumber"] }, { entityname: "new_project", recordcount: 0, status: "EntitySyncNotStarted", searchableattributes: [] }] } });
  const rows = buildSearchTables({ entities, views, status });
  it("enabled tables first, alphabetically; the default Quick Find view wins; the index is joined", () => {
    expect(rows.map(r => r.logical)).toEqual(["account", "contact", "new_project", "activitypointer", "lead"]);
    const acc = rows[0];
    expect(acc.view).toMatchObject({ id: "v1", resultColumns: ["name", "address1_city"], findColumns: ["name", "accountnumber", "emailaddress1"] });
    expect(acc.index).toMatchObject({ records: 5, status: "EntitySyncCompleted" });
    expect(acc.notes.map(n => n.text)).toEqual(["Not reported as searchable by the index yet: emailaddress1 (a sync may be pending)"]);
  });
  it("says what is wrong: no Find column, no Quick Find view, an index not started, a table that can't be enabled", () => {
    const by = Object.fromEntries(rows.map(r => [r.logical, r]));
    expect(by.contact.notes.map(n => n.level + ":" + n.text)).toEqual(["warn:No Find column: no typed text can match this table's records"]);
    expect(by.new_project.notes.map(n => n.text)).toEqual(["No Quick Find view: nothing is searched or shown for this table", "Index: EntitySyncNotStarted"]);
    expect(by.activitypointer.notes.map(n => n.text)).toEqual(["Can't be enabled for search"]);
    expect(by.lead.notes).toEqual([]); // not enabled: its view is informative only
    expect(by.lead.view.resultColumns).toEqual(["name", "address1_city"]);
  });
  it("sums up and exports", () => {
    expect(searchSummary(rows)).toEqual({ tables: 5, enabled: 3, withView: 2, findColumns: 3, noView: 1, noFind: 1, indexed: 2 });
    const x = searchExportRows(rows);
    expect(x[0]).toEqual(["Account", "account", "Yes", "Quick Find Accounts", "name, address1_city", "name, accountnumber, emailaddress1", "EntitySyncCompleted", 5, "", "Not reported as searchable by the index yet: emailaddress1 (a sync may be pending)"]);
    expect(x[0]).toHaveLength(SEARCH_HEADERS.length);
  });
  it("the demo org parses into a readable table with its planted problems", () => {
    const d = demoSearchConfig();
    const s = parseSearchStatus(d.status);
    const r = buildSearchTables({ entities: d.entities, views: d.views, status: s });
    const by = Object.fromEntries(r.map(x => [x.logical, x]));
    expect(by.account.view.resultColumns).toEqual(["name", "accountnumber", "address1_city", "primarycontactid", "telephone1"]);
    expect(by.systemuser.notes[0].level).toBe("warn");
    expect(by.new_project.view).toBe(null);
    expect(searchSummary(r).enabled).toBe(6);
  });
});
