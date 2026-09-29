import { describe, it, expect } from "vitest";
import { buildHistoryEntry, redactApiRequest, redactFetchXml, scrubStoredHistory, scrubApiEntries } from "../historyUtils.js";

const BASE = { entityLogical: "account", mode: "odata", fieldCount: 5, ts: 1756200000000 };

describe("buildHistoryEntry", () => {
  it("PRIVACY: $filter values are redacted from the stored query string", () => {
    const e = buildHistoryEntry({ ...BASE, query: "GET /api/data/v9.2/accounts?$select=name&$filter=emailaddress1 eq 'jane@x.com'&$top=10" });
    expect(e.query).toContain("$filter=...");
    expect(e.query).not.toContain("jane@x.com");
  });
  it("PRIVACY: EVERY $filter is redacted — the $expand inner filter comes before the WHERE in the URL", () => {
    const e = buildHistoryEntry({ ...BASE, query: "GET /x?$expand=contacts($select=fullname;$filter=emailaddress1 eq 'leak@x.com')&$filter=name eq 'secret corp'" });
    expect(e.query).not.toContain("leak@x.com");
    expect(e.query).not.toContain("secret corp");
  });
  it("caps the stored query at 1000 chars (the old 200 cap chopped long $selects mid-token)", () => {
    const e = buildHistoryEntry({ ...BASE, query: "GET /x?$select=" + "a".repeat(2000) });
    expect(e.query.length).toBe(1000);
  });
  it("builder entries snapshot the STRUCTURE with condition values BLANKED and counted", () => {
    const e = buildHistoryEntry({
      ...BASE, mode: "builder", query: "GET /x?$filter=name eq 'secret'",
      builderState: {
        fields: ["accountid", "name"],
        filterGroups: [{ logic: "and", conditions: [{ field: "name", op: "contains", value: "secret" }, { field: "statecode", op: "eq", value: "" }] }],
        groupLogic: "and", limit: 0, orderBy: { f: "name", dir: "asc" }, hadRel: true, hadExpand: false,
      },
    });
    expect(e.builder.filterGroups[0].conditions[0]).toEqual({ field: "name", op: "contains", value: "" });
    expect(e.builder.redacted).toBe(1);
    expect(e.builder.hadRel).toBe(true);
    expect(e.builder.hadExpand).toBe(false);
    expect(e.builder.fields).toEqual(["accountid", "name"]);
    expect(JSON.stringify(e)).not.toContain("secret");
  });
  it("non-builder entries carry no builder snapshot; missing entity becomes '?'", () => {
    const e = buildHistoryEntry({ ...BASE, entityLogical: null, query: "q" });
    expect(e.builder).toBeUndefined();
    expect(e.entity).toBe("?");
  });
  it("builder mode without state (defensive) stays a plain entry", () => {
    const e = buildHistoryEntry({ ...BASE, mode: "builder", query: "q", builderState: null });
    expect(e.builder).toBeUndefined();
  });
});

describe("redactApiRequest (API Tester history)", () => {
  it("PRIVACY: every $filter value in the path is redacted", () => {
    const r = redactApiRequest({ path: "contacts?$expand=account($filter=name eq 'S Corp')&$filter=emailaddress1 eq 'jane@x.com'", body: "" });
    expect(r.path).not.toContain("jane@x.com");
    expect(r.path).not.toContain("S Corp");
    expect(r.redacted).toBe(true);
  });
  it("PRIVACY: JSON body keeps keys, blanks strings/numbers, keeps booleans/null", () => {
    const r = redactApiRequest({ path: "contacts", body: '{"firstname":"Jane","creditlimit":5000,"donotemail":true,"parentcustomerid@odata.bind":"/accounts(abc)","nested":{"note":"secret"},"tags":["a","b"],"cleared":null}' });
    const b = JSON.parse(r.body);
    expect(b.firstname).toBe("");
    expect(b.creditlimit).toBe(null);
    expect(b.donotemail).toBe(true);
    expect(b["parentcustomerid@odata.bind"]).toBe("");
    expect(b.nested.note).toBe("");
    expect(b.tags).toEqual(["", ""]);
    expect(b.cleared).toBe(null);
    expect(r.redacted).toBe(true);
  });
  it("a non-JSON body persists EMPTY, never verbatim", () => {
    const r = redactApiRequest({ path: "x", body: "raw text with jane@x.com inside" });
    expect(r.body).toBe("");
    expect(r.redacted).toBe(true);
  });
  it("a value-free request is untouched and not flagged", () => {
    const r = redactApiRequest({ path: "accounts?$select=name&$top=5", body: "" });
    expect(r.path).toBe("accounts?$select=name&$top=5");
    expect(r.redacted).toBe(false);
  });
});

describe("SQL-mode history redaction (native SQL arc)", () => {
  it("PRIVACY: a SQL entry's WHERE literals never persist — structure does", () => {
    const e = buildHistoryEntry({ ...BASE, mode: "sql", query: "SELECT name FROM account WHERE emailaddress1 = 'jane@x.com' AND statecode = 0" });
    expect(e.query).not.toContain("jane@x.com");
    expect(e.query).toContain("FROM account");
    expect(e.query).toContain("'...'");
  });
  it("PRIVACY: an ApiTester path carrying ?sql= is redacted like $filter", () => {
    const r = redactApiRequest({ path: "accounts?sql=SELECT name FROM account WHERE name = 'Secret Corp'", body: "" });
    expect(r.path).toBe("accounts?sql=...");
    expect(r.redacted).toBe(true);
  });
});

describe("pre-publication review fixes (store-readiness pass)", () => {
  it("PRIVACY: FetchXML-mode entries redact condition values — attributes AND <value> children", () => {
    const e = buildHistoryEntry({ ...BASE, mode: "fetchxml", query: '<fetch><entity name="contact"><filter><condition attribute="emailaddress1" operator="eq" value="jane@x.com"/><condition attribute="statecode" operator="in"><value>0</value></condition></filter></entity></fetch>' });
    expect(e.query).not.toContain("jane@x.com");
    expect(e.query).toContain('value="..."');
    expect(e.query).toContain("<value>...</value>");
    expect(e.query).toContain('attribute="emailaddress1"'); // structure survives
  });
  it("STRUCTURE: $filter redaction keeps the paren closing an $expand group", () => {
    const r = redactApiRequest({ path: "contacts?$expand=account($filter=name eq 'x')&$select=fullname", body: "" });
    expect(r.path).toBe("contacts?$expand=account($filter=...)&$select=fullname");
  });
  it("PRIVACY: fetchXml= URL parameter is redacted in API Tester paths", () => {
    const r = redactApiRequest({ path: "contacts?fetchXml=<fetch>...value='jane@x.com'...</fetch>", body: "" });
    expect(r.path).toBe("contacts?fetchXml=...");
  });
  it("UPGRADE SCRUB: pre-redaction stored entries are cleaned once, flagged changed, and idempotent", () => {
    const dirty = [
      { mode: "sql", query: "SELECT x FROM y WHERE a = 'pii@x.com'" },
      { mode: "fetchxml", query: '<condition value="secret"/>' },
      { mode: "odata", query: "accounts?$filter=name eq 'S Corp'" },
    ];
    const first = scrubStoredHistory(dirty);
    expect(first.changed).toBe(true);
    expect(JSON.stringify(first.list)).not.toMatch(/pii@x\.com|secret|S Corp/);
    const second = scrubStoredHistory(first.list);
    expect(second.changed).toBe(false); // idempotent — no write-back churn on every mount
  });
  it("UPGRADE SCRUB: old raw API Tester entries get path+body re-redacted", () => {
    const { list, changed } = scrubApiEntries([{ method: "POST", path: "contacts?$filter=emailaddress1 eq 'j@x.com'", body: '{"firstname":"Jane"}' }]);
    expect(changed).toBe(true);
    expect(list[0].path).toBe("contacts?$filter=...");
    expect(JSON.parse(list[0].body).firstname).toBe("");
    expect(scrubApiEntries(list).changed).toBe(false);
  });
});
