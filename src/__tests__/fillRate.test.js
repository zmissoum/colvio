import { describe, it, expect } from "vitest";
import { countableColumns, fillFetch, chunk, scanFillRate, percent, fillSummary, isLimitError } from "../fillRate.js";

// A fake org: rows with createdon (or none); aggregates refused over `limit` scanned rows; columns
// listed in `broken` make any query that counts them fail.
function fakeOrg(rows, { limit = 50000, broken = [] } = {}) {
  const calls = [];
  const run = async (xml) => {
    calls.push(xml);
    const ge = xml.match(/operator="ge" value="([^"]+)"/), lt = xml.match(/operator="lt" value="([^"]+)"/);
    const isNull = /operator="null"/.test(xml);
    const inSlice = rows.filter(r => isNull ? r.createdon == null : (ge || lt) ? (r.createdon != null && (!ge || Date.parse(r.createdon) >= Date.parse(ge[1])) && (!lt || Date.parse(r.createdon) < Date.parse(lt[1]))) : true);
    if (inSlice.length > limit) throw new Error("The maximum record limit is exceeded. Reduce the number of records. (AggregateQueryRecordLimit)");
    const cols = [...xml.matchAll(/<attribute name="(\w+)" alias="c(\d+)" aggregate="countcolumn"\/>/g)];
    if (cols.some(m => broken.includes(m[1]))) throw new Error(`Aggregate isn't supported on ${cols.find(m => broken.includes(m[1]))[1]}`);
    const row = { n__: inSlice.length };
    for (const [, name, i] of cols) row[`c${i}`] = inSlice.filter(r => r[name] != null && r[name] !== "").length;
    return [row];
  };
  return { run, calls };
}

describe("fill rate planning", () => {
  it("keeps the countable columns", () => {
    const r = countableColumns([{ l: "name", t: "String" }, { l: "revenue", t: "Money" }, { l: "revenue_base", t: "Money" }, { l: "fullname_yomi", t: "Virtual" }, { l: "photo", t: "Image" }, { l: "bad name", t: "String" }]);
    expect(r).toEqual({ ok: ["name", "revenue"], skipped: ["revenue_base", "fullname_yomi", "photo"] });
  });
  it("writes the aggregate for a slice", () => {
    expect(fillFetch("account", "accountid", ["name"], { fromMs: Date.parse("2026-01-01T00:00:00Z"), toMs: Date.parse("2026-02-01T00:00:00Z") }))
      .toBe('<fetch aggregate="true"><entity name="account"><attribute name="accountid" alias="n__" aggregate="count"/><attribute name="name" alias="c0" aggregate="countcolumn"/><filter><condition attribute="createdon" operator="ge" value="2026-01-01T00:00:00.000Z"/><condition attribute="createdon" operator="lt" value="2026-02-01T00:00:00.000Z"/></filter></entity></fetch>');
    expect(fillFetch("account", "accountid", [], { isNull: true })).toContain('operator="null"');
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(isLimitError("AggregateQueryRecordLimit exceeded")).toBe(true);
  });
  it("formats percentages", () => {
    expect(percent(5, 10)).toBe("50 %");
    expect(percent(1, 20)).toBe("5.0 %");
    expect(percent(1, 100000)).toBe("<0.1 %");
    expect(percent(0, 10)).toBe("0.0 %");
    expect(percent(3, 0)).toBe("—");
  });
});

describe("scanFillRate", () => {
  const fields = [{ l: "name", t: "String" }, { l: "telephone1", t: "String" }, { l: "revenue", t: "Money" }, { l: "photo", t: "Image" }];
  const day = (d) => `2026-0${d < 10 ? 1 : 2}-${String(((d - 1) % 28) + 1).padStart(2, "0")}T10:00:00Z`;

  it("counts a small table in one query per chunk", async () => {
    const rows = [{ name: "a", telephone1: "1", createdon: day(1) }, { name: "b", revenue: 0, createdon: day(2) }, { name: "", createdon: day(3) }];
    const org = fakeOrg(rows);
    const r = await scanFillRate({ entity: "account", pk: "accountid", fields, run: org.run });
    expect(r).toMatchObject({ total: 3, filled: { name: 2, telephone1: 1, revenue: 1 }, skipped: ["photo"], slices: 1, errors: {} });
    expect(r.requests).toBe(2); // the size check + one chunk
  });

  it("cuts a table over the aggregate limit into date slices — rows without a date included — and stays exact", async () => {
    const rows = [];
    for (let i = 0; i < 40; i++) rows.push({ name: i % 2 ? "x" : null, telephone1: i < 5 ? "t" : null, createdon: new Date(Date.parse("2026-01-01T00:00:00Z") + i * 86400000).toISOString() });
    rows.push({ name: "nodate", createdon: null });
    const org = fakeOrg(rows, { limit: 10 });
    const r = await scanFillRate({ entity: "account", pk: "accountid", fields, oldestMs: Date.parse("2026-01-01T00:00:00Z"), nowMs: Date.parse("2026-03-01T00:00:00Z"), run: org.run });
    expect(r.total).toBe(41);
    expect(r.filled).toEqual({ name: 21, telephone1: 5, revenue: 0 });
    expect(r.slices).toBeGreaterThan(4);
  });

  it("isolates a column the server can't aggregate, counts the others", async () => {
    const rows = [{ name: "a", telephone1: "1", revenue: 5, createdon: day(1) }];
    const r = await scanFillRate({ entity: "account", pk: "accountid", fields, run: fakeOrg(rows, { broken: ["telephone1"] }).run });
    expect(r.filled).toEqual({ name: 1, revenue: 1 });
    expect(r.errors.telephone1).toMatch(/isn't supported/);
  });

  it("stops without a partial answer", async () => {
    const rows = [{ name: "a", createdon: day(1) }];
    let n = 0;
    await expect(scanFillRate({ entity: "account", pk: "accountid", fields, run: fakeOrg(rows).run, shouldStop: () => ++n > 1 })).rejects.toThrow("stopped");
  });

  it("summarises empty and rare columns", () => {
    expect(fillSummary({ total: 100, filled: { a: 0, b: 3, c: 50 } })).toEqual({ empty: ["a"], under5: ["b"] });
  });
});

describe("review pass: rows outside the probed range", () => {
  const fields = [{ l: "name", t: "String" }];
  it("counts rows dated before the oldest-row probe and after now", async () => {
    const rows = [];
    for (let i = 0; i < 12; i++) rows.push({ name: "x", createdon: new Date(Date.parse("2026-01-01T00:00:00Z") + i * 86400000).toISOString() });
    rows.push({ name: "old", createdon: "1999-06-01T00:00:00Z" }, { name: "future", createdon: "2030-01-01T00:00:00Z" });
    const org = fakeOrg(rows, { limit: 5 });
    const r = await scanFillRate({ entity: "account", pk: "accountid", fields, oldestMs: Date.parse("2026-01-01T00:00:00Z"), nowMs: Date.parse("2026-02-01T00:00:00Z"), run: org.run });
    expect(r.total).toBe(14);
    expect(r.filled.name).toBe(14);
  });
});
