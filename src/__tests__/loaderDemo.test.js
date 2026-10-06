import { describe, it, expect } from "vitest";
import { createDemoLoaderIO, parseOrEqFilter, demoGuid } from "../loaderDemo.js";

const FIELDS = [
  { l: "industrycode", opts: [{ v: 9, l: "Manufacturing" }, { v: 10, l: "Technology" }] },
  { l: "statecode", opts: [{ v: 0, l: "Active" }, { v: 1, l: "Inactive" }] },
];
const ROWS = [
  { accountid: "a1b2c3d4-e5f6-7890-abcd-ef1234567890", name: "ACME France", accountnumber: "ACC-001", industrycode: "Manufacturing", statecode: "Active" },
  { accountid: "b2c3d4e5-f6a7-8901-bcde-f12345678901", name: "Globex GmbH", accountnumber: "ACC-002", industrycode: "Technology", statecode: "Active" },
];
const ENTITIES = [{ l: "account", p: "accounts" }, { l: "opportunity", p: "opportunities" }];
const make = () => createDemoLoaderIO({ tables: { accounts: ROWS }, fields: FIELDS, entities: ENTITIES, sleep: async () => {} });

describe("parseOrEqFilter — the Loader's existence / lookup filter shape", () => {
  it("parses quoted, escaped, GUID and numeric literals joined by or", () => {
    expect(parseOrEqFilter("accountnumber eq 'ACC-001' or accountnumber eq 'O''Brien'")).toEqual([
      { field: "accountnumber", value: "ACC-001" }, { field: "accountnumber", value: "O'Brien" }]);
    expect(parseOrEqFilter("accountid eq a1b2c3d4-e5f6-7890-abcd-ef1234567890")).toEqual([{ field: "accountid", value: "a1b2c3d4-e5f6-7890-abcd-ef1234567890" }]);
    expect(parseOrEqFilter("numberofemployees eq 450")).toEqual([{ field: "numberofemployees", value: "450" }]);
    expect(parseOrEqFilter("name eq 'Bed or Breakfast'")).toEqual([{ field: "name", value: "Bed or Breakfast" }]);
  });
  it("refuses any other filter shape", () => {
    expect(parseOrEqFilter("contains(name,'a')")).toBeNull();
    expect(parseOrEqFilter("name eq 'a' and city eq 'b'")).toBeNull();
  });
});

describe("demoGuid", () => {
  it("is deterministic and GUID-shaped", () => {
    expect(demoGuid("accounts#1#3")).toBe(demoGuid("accounts#1#3"));
    expect(demoGuid("accounts#1#3")).not.toBe(demoGuid("accounts#1#4"));
    expect(demoGuid("x")).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-a[0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});

describe("createDemoLoaderIO.query", () => {
  it("answers existence filters case-insensitively, with the selected columns + primary key", async () => {
    const io = make();
    const r = await io.query("accounts", { filter: "accountnumber eq 'acc-002' or accountnumber eq 'ACC-999'", select: "accountnumber", top: "2" });
    expect(r.records).toEqual([{ accountid: "b2c3d4e5-f6a7-8901-bcde-f12345678901", accountnumber: "ACC-002" }]);
  });
  it("returns option-set VALUES (what Dataverse returns), not the demo screens' labels", async () => {
    const r = await make().query("accounts", { filter: "accountnumber eq 'ACC-001'", select: "industrycode,statecode" });
    expect(r.records[0]).toMatchObject({ industrycode: 9, statecode: 0 });
  });
  it("matches primary keys whatever their braces / case", async () => {
    const r = await make().query("accounts", { filter: "accountid eq A1B2C3D4-E5F6-7890-ABCD-EF1234567890", select: "accountid" });
    expect(r.records).toHaveLength(1);
  });
  it("fails an unsupported filter (the engine falls back per value) and 404s an unknown single record", async () => {
    await expect(make().query("accounts", { filter: "startswith(name,'A')" })).rejects.toThrow(/400/);
    await expect(make().query("systemusers(00000000-0000-0000-0000-000000000001)", {})).rejects.toThrow(/404/);
  });
  it("an unknown table is empty, not an error", async () => {
    expect((await make().query("contacts", { filter: "emailaddress1 eq 'a@b.c'" })).records).toEqual([]);
  });
});

describe("createDemoLoaderIO batch calls — bridge-shaped results and per-chunk progress", () => {
  it("UPSERT: existing key → UPSERTED (and updated in place), new key → CREATED with a GUID", async () => {
    const io = make();
    const progress = [];
    const items = [{ keyValue: "ACC-002", record: { name: "Globex AG" } }, { keyValue: "ACC-101", record: { name: "Contoso Ltd" } }, { keyValue: "ACC-102", record: { name: "Fabrikam Inc" } }];
    const res = await io.batchUpsert("accounts", "accountnumber", items, false, p => progress.push(p), () => false, { chunk: 2, concurrency: 1 });
    expect(res).toMatchObject({ created: 2, updated: 1, errors: [], aborted: false });
    expect(res.log.map(e => [e.row, e.status])).toEqual([[1, "UPSERTED"], [2, "CREATED"], [3, "CREATED"]]);
    expect(res.log[1].id).toMatch(/^[0-9a-f-]{36}$/);
    expect(progress.map(p => [p.done, p.total, p.newLog.length])).toEqual([[2, 3, 2], [3, 3, 1]]);
    const after = await io.query("accounts", { filter: "accountnumber eq 'ACC-002' or accountnumber eq 'ACC-101'", select: "name" });
    expect(after.records.map(r => r.name)).toEqual(["Globex AG", "Contoso Ltd"]);
  });
  it("UPDATE only: a missing key is refused, nothing is created", async () => {
    const io = make();
    const res = await io.batchUpsert("accounts", "accountnumber", [{ keyValue: "ACC-404", record: { name: "X" } }], false, null, () => false, { updateOnly: true });
    expect(res).toMatchObject({ created: 0, updated: 0 });
    expect(res.log[0].status).toBe("ERROR");
    expect((await io.query("accounts", { filter: "accountnumber eq 'ACC-404'" })).records).toEqual([]);
  });
  it("CREATE then rollback by primary key deletes exactly the created records", async () => {
    const io = make();
    const c = await io.batchCreate("opportunities", [{ name: "A" }, { name: "B" }], null, () => false, {});
    expect(c.created).toBe(2);
    const ids = c.log.map(e => e.id);
    const d = await io.batchDeleteKeyed("opportunities", "opportunityid", ids.map(id => ({ keyValue: id })), true, null, () => false, {});
    expect(d).toMatchObject({ deleted: 2, errors: [] });
    const again = await io.batchDeleteKeyed("opportunities", "opportunityid", [{ keyValue: ids[0] }], true, null, () => false, {});
    expect(again.deleted).toBe(0);
    expect(again.log[0].status).toBe("ERROR");
  });
  it("same inputs → same GUIDs in a fresh instance (EN and FR renders match)", async () => {
    const run = async () => (await make().batchCreate("accounts", [{ name: "A" }, { name: "B" }], null, () => false, {})).log.map(e => e.id);
    expect(await run()).toEqual(await run());
  });
  it("a cancel between chunks flushes the never-sent rows as retryable errors", async () => {
    const io = make();
    let calls = 0;
    const res = await io.batchCreate("accounts", [{ name: "A" }, { name: "B" }, { name: "C" }], () => { calls++; }, () => calls >= 1, { chunk: 1, concurrency: 1 });
    expect(res.created).toBe(1);
    expect(res.aborted).toBe(true);
    expect(res.log.filter(e => e.status === "ERROR").map(e => e.row)).toEqual([2, 3]);
  });
  it("getOptionSet serves the demo columns' own choices", async () => {
    expect(await make().getOptionSet("account", "industrycode")).toEqual([{ value: 9, label: "Manufacturing", color: null }, { value: 10, label: "Technology", color: null }]);
    expect(await make().getOptionSet("account", "name")).toEqual([]);
  });
});
