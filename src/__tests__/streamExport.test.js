import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import { cellValue, csvCell, csvLine, colLetter, xmlText, xlsxCell, sheetName, crc32, createSink, XLSX_MAX_CELL } from "../streamExport.js";
import { cookieFrom, pagedFetchXml, isCookieMismatch, fetchXmlColumns, streamColumns, uncoveredKey } from "../fetchPaging.js";

// An in-memory file: what the sinks write, joined.
function memOut() {
  const parts = [];
  return {
    parts, closed: false, aborted: false,
    async write(b) { parts.push(b instanceof Uint8Array ? b : new TextEncoder().encode(String(b))); },
    async close() { this.closed = true; },
    async abort() { this.aborted = true; },
    bytes() { const n = parts.reduce((a, p) => a + p.length, 0); const all = new Uint8Array(n); let o = 0; for (const p of parts) { all.set(p, o); o += p.length; } return all; },
  };
}

describe("cell values", () => {
  const rec = { name: "ACME", revenue: 1380.08, revenue__display: "$1,380.08", _owner_value: "g1", _owner_value__display: "Jean", flag: true, empty: null, obj: { a: 1 } };
  it("CSV writes what the grid shows, XLSX keeps numbers and booleans typed", () => {
    expect(cellValue(rec, ["revenue"], "csv")).toBe("$1,380.08");
    expect(cellValue(rec, ["revenue"], "xlsx")).toBe(1380.08);
    expect(cellValue(rec, ["owner", "_owner_value"], "csv")).toBe("Jean");
    expect(cellValue(rec, ["flag"], "xlsx")).toBe(true);
    expect(cellValue(rec, ["empty"], "csv")).toBe("");
    expect(cellValue(rec, ["missing"], "csv")).toBe("");
    expect(cellValue(rec, ["obj"], "csv")).toBe('{"a":1}');
  });
  it("CSV escapes quotes, separators, line breaks and formula starts", () => {
    expect(csvCell('say "hi", ok')).toBe('"say ""hi"", ok"');
    expect(csvCell("=SUM(A1)")).toBe("'=SUM(A1)");
    expect(csvCell("-5")).toBe("'-5");
    expect(csvCell(null)).toBe("");
    expect(csvLine(["a", "b\nc"])).toBe('a,"b\nc"\n');
  });
  it("XLSX helpers: column letters, XML text, typed cells, long text cut, sheet names", () => {
    expect([0, 25, 26, 27, 701, 702].map(colLetter)).toEqual(["A", "Z", "AA", "AB", "ZZ", "AAA"]);
    expect(xmlText('a<b>&"c"\u0001')).toBe("a&lt;b&gt;&amp;&quot;c&quot;");
    expect(xlsxCell(12, "B2")[0]).toBe('<c r="B2"><v>12</v></c>');
    expect(xlsxCell(false, "C2")[0]).toBe('<c r="C2" t="b"><v>0</v></c>');
    expect(xlsxCell("", "D2")[0]).toBe("");
    expect(xlsxCell("x".repeat(XLSX_MAX_CELL + 5), "E2")[1]).toBe(true);
    expect(sheetName("account", 1)).toBe("account");
    expect(sheetName("a[b]:c".repeat(10), 3).length).toBe(31);
    expect(sheetName("account", 3)).toBe("account (3)");
  });
  it("computes CRC-32 like ZIP does", () => {
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xCBF43926);
    const a = new TextEncoder().encode("1234"), b = new TextEncoder().encode("56789");
    expect(crc32(b, crc32(a))).toBe(0xCBF43926);
  });
});

describe("sinks", () => {
  it("CSV: BOM, header, rows added in pieces, closed", async () => {
    const out = memOut();
    const sink = await createSink(out, "csv", { headers: ["name", "n"] });
    await sink.add([["a", 1]]); await sink.add([["b,c", 2]]);
    await sink.close();
    expect(new TextDecoder("utf-8", { ignoreBOM: true }).decode(out.bytes())).toBe('﻿name,n\na,1\n"b,c",2\n');
    expect(out.closed).toBe(true);
    expect(sink.rows).toBe(2);
  });
  it("XLSX: a real workbook Excel readers open, typed cells, one sheet per 1,048,576 rows", async () => {
    const out = memOut();
    const sink = await createSink(out, "xlsx", { headers: ["name", "revenue", "active"], sheetBase: "account" });
    await sink.add([["ACME <France>", 1380.08, true], ["Globex", 28000000, false], ["", null, null]]);
    await sink.close();
    const wb = XLSX.read(out.bytes(), { type: "array" });
    expect(wb.SheetNames).toEqual(["account"]);
    const rows = XLSX.utils.sheet_to_json(wb.Sheets.account, { header: 1 });
    expect(rows[0]).toEqual(["name", "revenue", "active"]);
    expect(rows[1]).toEqual(["ACME <France>", 1380.08, true]);
    expect(rows[2]).toEqual(["Globex", 28000000, false]);
    expect(sink.rows).toBe(3);
    expect(sink.sheets).toBe(1);
  });
  it("XLSX: an abort leaves nothing committed", async () => {
    const out = memOut();
    const sink = await createSink(out, "xlsx", { headers: ["a"] });
    await sink.abort();
    expect(out.aborted).toBe(true);
  });
});

describe("FetchXML paging and columns", () => {
  it("reads the doubly-encoded cookie from the annotation", () => {
    const inner = '<cookie page="1"><accountid last="{A1}" first="{A0}" /></cookie>';
    const ann = `<cookie pagenumber="2" pagingcookie="${encodeURIComponent(encodeURIComponent(inner))}" istracking="False" />`;
    expect(cookieFrom(ann)).toBe(inner);
    expect(cookieFrom(null)).toBeNull();
    expect(cookieFrom('<cookie pagingcookie="%E0%A4%A" />')).toBeNull();
  });
  it("sets page and cookie on <fetch>, replacing earlier ones", () => {
    const x = '<fetch top="50" page="1"><entity name="account"/></fetch>';
    expect(pagedFetchXml(x, 3, null)).toBe('<fetch top="50" page="3"><entity name="account"/></fetch>');
    expect(pagedFetchXml(pagedFetchXml(x, 2, '<cookie page="1"><a last="x" /></cookie>'), 3, null)).toBe('<fetch top="50" page="3"><entity name="account"/></fetch>');
    expect(pagedFetchXml('<fetch><entity name="a"/></fetch>', 2, '<c v="1"/>')).toBe('<fetch page="2" paging-cookie="&lt;c v=&quot;1&quot;/&gt;"><entity name="a"/></fetch>');
    expect(isCookieMismatch("Paging Cookie And Query Do Not Match")).toBe(true);
  });
  it("lists a FetchXML's columns — lookups, aliases, link-entities — and says when rows must tell", () => {
    const fx = `<fetch><entity name="contact"><attribute name="fullname"/><attribute name="parentcustomerid"/><attribute name="createdon" alias="created"/>
      <link-entity name="account" from="accountid" to="parentcustomerid" alias="a"><attribute name="name"/><link-entity name="systemuser" from="systemuserid" to="ownerid" alias="o"><attribute name="fullname"/></link-entity></link-entity></entity></fetch>`;
    const r = fetchXmlColumns(fx);
    expect(r.complete).toBe(true);
    expect(r.cols.map(c => c.name)).toEqual(["fullname", "parentcustomerid", "created", "o.fullname", "a.name"]);
    expect(r.cols[1].keys).toEqual(["parentcustomerid", "_parentcustomerid_value"]);
    expect(fetchXmlColumns('<fetch><entity name="a"><all-attributes/></entity></fetch>').complete).toBe(false);
    expect(fetchXmlColumns('<fetch><entity name="a"><attribute name="x"/><link-entity name="b" from="b" to="c"><attribute name="y"/></link-entity></entity></fetch>').complete).toBe(false);
  });
  it("adds the first page's other columns, and spots a column no header covers", () => {
    const cols = streamColumns([{ name: "fullname", keys: ["fullname"] }], [{ fullname: "a", contactid: "1", "fullname@x": 1, x__display: "X", __error: 1 }]);
    expect(cols.map(c => c.name)).toEqual(["fullname", "contactid"]);
    expect(uncoveredKey(cols, { fullname: "b", contactid: "2", y__display: "Y" })).toBeNull();
    expect(uncoveredKey(cols, { fullname: "b", phone: "1" })).toBe("phone");
  });
});

describe("review pass", () => {
  it("replaces single-quoted page attributes too", () => {
    const out = pagedFetchXml("<fetch page='1' count='10'><entity name='account'/></fetch>", 2, null);
    expect(out).toBe('<fetch count=\'10\' page="2"><entity name=\'account\'/></fetch>');
  });
});

describe("review pass", () => {
  it("never quotes a typed number as a formula, and XLSX keeps labels when they aren't the number", () => {
    expect(csvCell(-5)).toBe("-5");
    expect(cellValue({ statecode: 0, statecode__display: "Active" }, ["statecode"], "xlsx")).toBe("Active");
    expect(cellValue({ revenue: 1380.08, revenue__display: "$1,380.08" }, ["revenue"], "xlsx")).toBe(1380.08);
    expect(cellValue({ donotemail: true, donotemail__display: "Do Not Allow" }, ["donotemail"], "xlsx")).toBe("Do Not Allow");
    expect(cellValue({ n: 3 }, ["n"], "xlsx")).toBe(3);
  });
});
