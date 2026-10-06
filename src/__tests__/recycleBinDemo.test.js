import { describe, it, expect } from "vitest";
import { createDemoBin, demoBinMeta, binGuid, DEMO_BIN_TABLES } from "../recycleBinDemo.js";

const NOW = Date.UTC(2026, 9, 6, 8, 0, 0);
const FMT = "@OData.Community.Display.V1.FormattedValue";
// The exact FetchXML RecycleBin.jsx builds (loadDeleted).
const binXml = (entity, { count = 250, page = 1, like = "" } = {}) => {
  const m = demoBinMeta(entity);
  const filter = like ? `<filter><condition attribute='${m.primaryName}' operator='like' value='%${like}%' /></filter>` : "";
  return `<fetch count='${count}' page='${page}' datasource='bin'><entity name='${entity}'>` +
    `<attribute name='${m.primaryId}' /><attribute name='${m.primaryName}' />` +
    `<attribute name='createdby' /><attribute name='createdon' />` +
    `<attribute name='modifiedby' /><attribute name='modifiedon' />` +
    filter + `<order attribute='modifiedon' descending='true' /></entity></fetch>`;
};

describe("demo recycle bin — query", () => {
  it("returns the live fetchXml shape with lookups' formatted names", () => {
    const r = createDemoBin(NOW).query(binXml("account"));
    expect(r).toMatchObject({ entitySetName: "accounts", moreRecords: false, pagingCookie: null });
    expect(r.count).toBe(r.records.length);
    const rec = r.records[0];
    expect(rec.accountid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(rec.name).toBe("Contoso Pharmaceuticals");
    expect(rec["_createdby_value" + FMT]).toBe("Marie Martin");
    expect(rec["_modifiedby_value" + FMT]).toBe("Alex Baker");
    expect(rec.createdon).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/);
  });

  it("orders by modifiedon descending, as the module asks", () => {
    const recs = createDemoBin(NOW).query(binXml("account")).records;
    for (let i = 1; i < recs.length; i++) expect(recs[i - 1].modifiedon >= recs[i].modifiedon).toBe(true);
  });

  it("pages with count/page and reports more pages like a paging cookie", () => {
    const bin = createDemoBin(NOW);
    const p1 = bin.query(binXml("account", { count: 100, page: 1 }));
    const p2 = bin.query(binXml("account", { count: 100, page: 2 }));
    expect(p1.records).toHaveLength(100);
    expect(p1.moreRecords).toBe(true);
    expect(p1.pagingCookie).toBeTruthy();
    expect(p2.records.length).toBeGreaterThan(0);
    expect(p2.moreRecords).toBe(false);
    const ids = new Set(p1.records.map(r => r.accountid));
    expect(p2.records.some(r => ids.has(r.accountid))).toBe(false);
  });

  it("filters by name server-side: case-insensitive contains on the XML-escaped term", () => {
    const bin = createDemoBin(NOW);
    const hits = bin.query(binXml("account", { like: "CONTOSO" })).records;
    expect(hits.length).toBeGreaterThan(3);
    expect(hits.every(r => /contoso/i.test(r.name))).toBe(true);
    expect(bin.query(binXml("account", { like: "Litware, Inc." })).records.map(r => r.name)).toEqual(["Litware, Inc."]);
    expect(bin.query(binXml("contact", { like: "L&#39;" })).records).toHaveLength(0);
    expect(bin.query(binXml("contact", { like: "Léa" })).records[0].fullname).toBe("Léa Chevalier");
  });

  it("gives the 140-row mass delete unique names", () => {
    const names = createDemoBin(NOW).query(binXml("account", { count: 5000 })).records.map(r => r.name);
    expect(names).toHaveLength(153);
    expect(new Set(names).size).toBe(153);
  });

  it("keeps an empty bin for tables with no deletions", () => {
    expect(createDemoBin(NOW).query(binXml("opportunity"))).toMatchObject({ records: [], count: 0, moreRecords: false });
  });

  it("is deterministic for a given now", () => {
    expect(createDemoBin(NOW).query(binXml("contact"))).toEqual(createDemoBin(NOW).query(binXml("contact")));
  });
});

describe("demo recycle bin — deleted by (audit)", () => {
  it("maps lower-cased ids to who/when, every deletion inside the 30-day retention and in the past", () => {
    const bin = createDemoBin(NOW);
    const map = bin.deletedBy("account");
    const recs = bin.query(binXml("account", { count: 5000 })).records;
    expect(Object.keys(map)).toHaveLength(recs.length);
    for (const r of recs) {
      const d = map[r.accountid.toLowerCase()];
      expect(d.by).toBeTruthy();
      const on = Date.parse(d.on);
      expect(on).toBeLessThan(NOW);
      expect(NOW - on).toBeLessThan(30 * 86400000);
      expect(Date.parse(r.modifiedon)).toBeLessThanOrEqual(on);
      expect(Date.parse(r.createdon)).toBeLessThan(Date.parse(r.modifiedon));
    }
  });

  it("honors top (most recent deletes first)", () => {
    const map = createDemoBin(NOW).deletedBy("account", 3);
    expect(Object.values(map).map(d => d.by)).toEqual(["Alex Baker", "Marie Martin", "Pierre Bernard"]);
  });
});

describe("demo recycle bin — restore", () => {
  it("removes a restored record from the bin", () => {
    const bin = createDemoBin(NOW);
    const first = bin.query(binXml("account")).records[0];
    expect(bin.restore("accounts", first.accountid)).toEqual({ id: first.accountid });
    expect(bin.query(binXml("account")).records.some(r => r.accountid === first.accountid)).toBe(false);
    expect(() => bin.restore("accounts", first.accountid)).toThrow(/not found|No deleted record/);
  });

  it("refuses the alternate-key conflict with the message the module maps", () => {
    const bin = createDemoBin(NOW);
    const ww = bin.query(binXml("account", { like: "Wide World" })).records[0];
    expect(() => bin.restore("accounts", ww.accountid)).toThrow(/Duplicate entity key/);
    expect(bin.query(binXml("account", { like: "Wide World" })).records).toHaveLength(1);
  });

  it("matches the entity set as well as the id", () => {
    const bin = createDemoBin(NOW);
    const c = bin.query(binXml("contact")).records[0];
    expect(() => bin.restore("accounts", c.contactid)).toThrow();
    expect(bin.restore("contacts", c.contactid)).toEqual({ id: c.contactid });
  });
});

describe("demo recycle bin — metadata", () => {
  it("gives the primary attributes, with content.js's fallbacks for other tables", () => {
    expect(demoBinMeta("contact")).toEqual({ primaryName: "fullname", primaryId: "contactid", entitySet: "contacts" });
    expect(demoBinMeta("new_thing")).toEqual({ primaryName: "name", primaryId: "new_thingid", entitySet: "new_things" });
  });
  it("lists restore-enabled tables without the virtual one", () => {
    expect(DEMO_BIN_TABLES).toContain("account");
    expect(DEMO_BIN_TABLES).not.toContain("new_sapcredit");
  });
  it("binGuid is stable and GUID-shaped", () => {
    expect(binGuid("x")).toBe(binGuid("x"));
    expect(binGuid("x")).not.toBe(binGuid("y"));
  });
});
