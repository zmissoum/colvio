import { describe, it, expect } from "vitest";
import {
  toPath, resourceOf, keySegment, functionPath, parseSegments, classify, buildBatch, parseBatchResponse,
  mapBatchResults, summarize, rollbackStats, createRuntime, runRollback, scriptLine, StopError, fakeId,
  hashRows, normalizeJournal, updateColumns,
} from "../scriptRuntime.js";
import { createDemoOrg } from "../scriptDemo.js";

// ── Dataverse for the tests ───────────────────────────────────────────────────────────────────────
const ORG = "https://org.crm4.dynamics.com";
const META = [
  { LogicalName: "systemuser", EntitySetName: "systemusers", PrimaryIdAttribute: "systemuserid", PrimaryNameAttribute: "fullname" },
  { LogicalName: "fou_spritcode", EntitySetName: "fou_spritcodes", PrimaryIdAttribute: "fou_spritcodeid", PrimaryNameAttribute: "fou_name" },
  { LogicalName: "fou_salesorganization", EntitySetName: "fou_salesorganizations", PrimaryIdAttribute: "fou_salesorganizationid", PrimaryNameAttribute: "fou_name" },
  { LogicalName: "account", EntitySetName: "accounts", PrimaryIdAttribute: "accountid", PrimaryNameAttribute: "name" },
  { LogicalName: "contact", EntitySetName: "contacts", PrimaryIdAttribute: "contactid", PrimaryNameAttribute: "fullname" },
];
const RELS = {
  systemuser: [
    { ReferencingAttribute: "fou_salesorganizationid", ReferencingEntityNavigationPropertyName: "fou_SalesOrganizationId", ReferencedEntity: "fou_salesorganization" },
    { ReferencingAttribute: "fou_spritcodeid", ReferencingEntityNavigationPropertyName: "fou_SpritcodeId", ReferencedEntity: "fou_spritcode" },
  ],
  fou_spritcode: [{ ReferencingAttribute: "fou_salesorganizationid", ReferencingEntityNavigationPropertyName: "fou_SalesOrganizationId", ReferencedEntity: "fou_salesorganization" }],
  account: [{ ReferencingAttribute: "parentaccountid", ReferencingEntityNavigationPropertyName: "parentaccountid", ReferencedEntity: "account" }],
  contact: [
    { ReferencingAttribute: "parentcustomerid", ReferencingEntityNavigationPropertyName: "parentcustomerid_account", ReferencedEntity: "account" },
    { ReferencingAttribute: "parentcustomerid", ReferencingEntityNavigationPropertyName: "parentcustomerid_contact", ReferencedEntity: "contact" },
  ],
};
const ATTRS = {
  account: [
    { LogicalName: "accountid", IsValidForCreate: true, AttributeType: "Uniqueidentifier" },
    { LogicalName: "name", IsValidForCreate: true, AttributeType: "String" },
    { LogicalName: "telephone1", IsValidForCreate: true, AttributeType: "String" },
    { LogicalName: "parentaccountid", IsValidForCreate: true, AttributeType: "Lookup" },
    { LogicalName: "parentaccountidname", IsValidForCreate: false, AttributeType: "String", AttributeOf: "parentaccountid" },
    { LogicalName: "statecode", IsValidForCreate: false, AttributeType: "State" },
    { LogicalName: "statuscode", IsValidForCreate: true, AttributeType: "Status" },
    { LogicalName: "modifiedon", IsValidForCreate: false, AttributeType: "DateTime" },
  ],
};
const g = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;

// The test org is the Script Console's own demo Dataverse (scriptDemo.js), on this dataset — one
// mock to maintain. Only what the demo doesn't serve is stubbed here: an unbound action and a
// bound one.
const rowsOf = () => ({
  fou_salesorganizations: [{ fou_salesorganizationid: g(1), fou_name: "SO-FR" }, { fou_salesorganizationid: g(2), fou_name: "SO-DE" }],
  fou_spritcodes: [
    { fou_spritcodeid: g(11), fou_name: "SP-FR", _fou_salesorganizationid_value: g(1), _t: { fou_salesorganizationid: "fou_salesorganization" } },
    { fou_spritcodeid: g(12), fou_name: "SP-DE", _fou_salesorganizationid_value: g(2), _t: { fou_salesorganizationid: "fou_salesorganization" } },
  ],
  systemusers: [
    { systemuserid: g(21), fullname: "Alice", _fou_salesorganizationid_value: g(1), _fou_spritcodeid_value: null, _t: { fou_salesorganizationid: "fou_salesorganization" } },
    { systemuserid: g(22), fullname: "Bob", _fou_salesorganizationid_value: g(2), _fou_spritcodeid_value: g(11), _t: { fou_salesorganizationid: "fou_salesorganization", fou_spritcodeid: "fou_spritcode" } },
    { systemuserid: g(23), fullname: "Carol", _fou_salesorganizationid_value: null, _fou_spritcodeid_value: null, _t: {} },
  ],
  accounts: [
    { accountid: g(31), name: "Contoso", telephone1: "01", _parentaccountid_value: null, statecode: 1, statuscode: 2, modifiedon: "2026-01-01T00:00:00Z", _t: {} },
    { accountid: g(32), name: "Fabrikam", telephone1: null, _parentaccountid_value: g(31), statecode: 0, statuscode: 1, _t: { parentaccountid: "account" } },
  ],
  contacts: [{ contactid: g(41), fullname: "Dan", _parentcustomerid_value: g(31), _t: { parentcustomerid: "account" } }, { contactid: g(42), fullname: "Eve", _t: {} }],
});
const json = (status, body) => ({ ok: status < 300, status, statusText: "", headers: { "content-type": "application/json" }, body: JSON.stringify(body), bodyParsed: body });
function fakeOrg() {
  const org = createDemoOrg({ orgUrl: ORG, meta: META, rels: RELS, attrs: ATTRS, tables: rowsOf(), userId: g(21) });
  const send = async (r) => {
    const res = resourceOf(r.path);
    if (res === "DoThing") { org.log.push(`${r.method} ${r.path}`); return json(200, { done: true }); }
    const bump = res && res.match(/^accounts\(([^)]+)\)\/Microsoft\.Dynamics\.CRM\.Bump$/);
    if (bump) { org.log.push(`${r.method} ${r.path}`); return json(200, { bumped: bump[1] }); }
    return org.send(r);
  };
  return { t: org.tables, log: org.log, links: org.links, throttle: org.throttle, send };
}
const noSleep = async () => {};

describe("scriptRuntime — paths and keys", () => {
  it("normalizes every path form to a root-relative Web API path", () => {
    expect(toPath("accounts?$top=1")).toBe("/api/data/v9.2/accounts?$top=1");
    expect(toPath("/api/data/v9.1/accounts")).toBe("/api/data/v9.1/accounts");
    expect(toPath(`${ORG}/api/data/v9.2/accounts?$skiptoken=x`)).toBe("/api/data/v9.2/accounts?$skiptoken=x");
    expect(resourceOf("accounts(1)/nav/$ref?$id=x")).toBe("accounts(1)/nav/$ref");
    expect(resourceOf("/XRMServices/2011/Organization.svc")).toBe(null);
  });
  it("formats GUID, alternate and raw keys; function parameters through aliases", () => {
    expect(keySegment("{ABCDEF01-0000-0000-0000-000000000001}")).toBe("abcdef01-0000-0000-0000-000000000001");
    expect(keySegment({ accountnumber: "O'Brien", region: 2 })).toBe("accountnumber='O''Brien',region=2");
    expect(keySegment({ code: "A#1?%41" })).toBe("code='A%231%3F%2541'");
    expect(keySegment({ day: new Date("2026-01-02T00:00:00Z") })).toBe("day=2026-01-02T00:00:00.000Z");
    expect(functionPath("RetrieveAppComponents", { AppModuleId: { $guid: "{ABCDEF01-0000-0000-0000-000000000001}" } })).toBe("RetrieveAppComponents(AppModuleId=@AppModuleId)?@AppModuleId=abcdef01-0000-0000-0000-000000000001");
    expect(keySegment("accountnumber='A1'")).toBe("accountnumber='A1'");
    expect(() => keySegment({ "bad key": 1 })).toThrow();
    expect(functionPath("WhoAmI")).toBe("WhoAmI()");
    expect(functionPath("RetrieveTotalRecordCount", { EntityNames: ["account"] })).toBe(`RetrieveTotalRecordCount(EntityNames=@EntityNames)?@EntityNames=${encodeURIComponent('["account"]')}`);
  });
  it("splits segments outside quotes and parentheses", () => {
    expect(parseSegments("accounts(name='a/b')/nav(x)/$ref")).toEqual([{ name: "accounts", key: "name='a/b'" }, { name: "nav", key: "x" }, { name: "$ref", key: null }]);
  });
  it("classifies every kind of write", () => {
    const isSet = (n) => n === "accounts";
    expect(classify("GET", "accounts").kind).toBe("read");
    expect(classify("POST", "accounts", isSet).kind).toBe("create");
    expect(classify("POST", "WinOpportunity", isSet)).toMatchObject({ kind: "action", action: "WinOpportunity" });
    expect(classify("POST", "new_custom").kind).toBe("create"); // heuristic without metadata
    expect(classify("PATCH", "accounts(1)").kind).toBe("update");
    expect(classify("DELETE", "accounts(1)").kind).toBe("delete");
    expect(classify("PUT", "accounts(1)/name")).toMatchObject({ kind: "setProp", prop: "name" });
    expect(classify("DELETE", "accounts(1)/name").kind).toBe("clearProp");
    expect(classify("POST", "accounts(1)/contact_customer_accounts").kind).toBe("create");
    expect(classify("POST", "accounts(1)/nav/$ref").kind).toBe("addRef");
    expect(classify("DELETE", "accounts(1)/nav(2)/$ref").kind).toBe("removeRef");
    expect(classify("DELETE", "accounts(1)/nav/$ref?$id=x").kind).toBe("removeRef");
    expect(classify("DELETE", "accounts(1)/nav/$ref").kind).toBe("clearRef");
    expect(classify("PUT", "accounts(1)/nav/$ref").kind).toBe("setRef");
    expect(classify("POST", "accounts(1)/Microsoft.Dynamics.CRM.Bump")).toMatchObject({ kind: "action", action: "Bump" });
    expect(classify("POST", "$batch").kind).toBe("batch");
  });
  it("maps a script error's stack line back to the editor line", () => {
    expect(scriptLine("Error: x\n    at eval (eval at run (sandbox.js:1:2), <anonymous>:7:11)")).toBe(5);
    expect(scriptLine("no line")).toBe(null);
  });
});

describe("scriptRuntime — $batch wire format", () => {
  it("puts every write in one changeset (atomic), reads outside, and maps responses back", () => {
    const ops = [
      { method: "GET", path: "/api/data/v9.2/accounts" },
      { method: "PATCH", path: "/api/data/v9.2/accounts(1)", body: { name: "x" }, headers: { "If-Match": "*" } },
      { method: "DELETE", path: "/api/data/v9.2/accounts(2)" },
    ];
    const b = buildBatch(ops, { orgUrl: ORG, id: "t" });
    expect(b.contentType).toBe("multipart/mixed; boundary=batch_t");
    expect(b.groups).toEqual([{ ops: [0], changeset: false }, { ops: [1, 2], changeset: true }]);
    expect(b.body).toContain(`PATCH ${ORG}/api/data/v9.2/accounts(1) HTTP/1.1`);
    expect(b.body).toContain("Content-ID: 2");
    expect(b.body).toContain("Content-ID: 3"); // = op index + 1, so "$3" names ops[2]
    expect(buildBatch([{ method: "POST", path: "$1/contact_customer_accounts", body: {} }], { orgUrl: ORG, id: "r" }).body).toContain("POST $1/contact_customer_accounts HTTP/1.1");
    expect(b.body.endsWith("--batch_t--\r\n")).toBe(true);
    const resp = "--br\r\nContent-Type: application/http\r\n\r\nHTTP/1.1 200 OK\r\nContent-Type: application/json\r\n\r\n{\"value\":[]}\r\n--br\r\nContent-Type: multipart/mixed; boundary=cs\r\n\r\n--cs\r\nContent-Type: application/http\r\n\r\nHTTP/1.1 204 No Content\r\n\r\n\r\n--cs\r\nContent-Type: application/http\r\n\r\nHTTP/1.1 204 No Content\r\n\r\n\r\n--cs--\r\n--br--";
    const items = parseBatchResponse(resp, "multipart/mixed; boundary=br");
    const r = mapBatchResults(b.groups, items, 3);
    expect(r.map(x => x.status)).toEqual([200, 204, 204]);
    expect(r[0].body).toEqual({ value: [] });
  });
  it("a failed changeset fails all its writes; unanswered parts are 'not executed'", () => {
    const groups = [{ ops: [0, 1], changeset: true }, { ops: [2], changeset: false }];
    const items = parseBatchResponse("--b\r\nContent-Type: application/http\r\n\r\nHTTP/1.1 400 Bad Request\r\n\r\n{\"error\":{\"message\":\"boom\"}}\r\n--b--", "multipart/mixed; boundary=b");
    const r = mapBatchResults(groups, items, 3);
    expect(r[0].status).toBe(400); expect(r[1].status).toBe(400);
    expect(r[2].notExecuted).toBe(true);
  });
});

describe("scriptRuntime — dry run", () => {
  it("runs reads for real, records writes without sending them, returns usable fake ids", async () => {
    const org = fakeOrg(); const plan = [];
    const rt = createRuntime({ send: org.send, orgUrl: ORG, mode: "dry", onPlan: e => plan.push(e), sleep: noSleep });
    const users = await rt.invoke("getAll", ["systemusers?$select=systemuserid"]);
    expect(users).toHaveLength(3);
    const id = await rt.invoke("create", ["accounts", { name: "New" }]);
    expect(id).toBe(fakeId(1));
    await rt.invoke("update", ["systemusers", g(21), { "fou_SpritcodeId@odata.bind": `/fou_spritcodes(${g(11)})` }]);
    await rt.invoke("delete", ["accounts", g(31)]);
    await rt.invoke("callAction", ["DoThing", { a: 1 }]);
    await rt.invoke("request", ["PUT", `accounts(${g(31)})/name`, { body: { value: "Z" } }]);
    expect(org.log.filter(l => !l.startsWith("GET"))).toEqual([]);
    expect(org.t.accounts.size).toBe(2);
    expect(plan.map(p => `${p.method} ${p.kind} ${p.table}`)).toEqual(["POST create accounts", "PATCH update systemusers", "DELETE delete accounts", "POST action DoThing", "PUT setProp accounts"]);
    expect(summarize(plan)[0]).toEqual({ label: "DELETE accounts", count: 1 });
  });
  it("dry $batch: reads executed, writes recorded", async () => {
    const org = fakeOrg();
    const rt = createRuntime({ send: org.send, orgUrl: ORG, mode: "dry", sleep: noSleep });
    const r = await rt.invoke("batch", [[{ method: "GET", path: "accounts" }, { method: "DELETE", path: `accounts(${g(31)})` }]]);
    expect(r[0].body.value).toHaveLength(2);
    expect(r[1].dryRun).toBe(true);
    expect(rt.plan).toHaveLength(1);
    expect(org.t.accounts.size).toBe(2);
  });
});

describe("scriptRuntime — review fixes", () => {
  it("a dry run never calls a Custom API function; built-in functions run", async () => {
    const org = fakeOrg();
    const rt = createRuntime({ send: org.send, orgUrl: ORG, mode: "dry", sleep: noSleep });
    expect(await rt.invoke("callFunction", ["new_Recalculate", { Id: { $guid: g(31) } }])).toBe(null);
    expect(await rt.invoke("whoAmI", [])).toMatchObject({ UserId: g(21) });
    expect(org.log.some(l => l.includes("new_Recalculate"))).toBe(false);
    expect(rt.plan.map(p => `${p.kind} ${p.table}`)).toEqual(["function new_Recalculate"]);
  });
  it("only Web API paths are accepted", async () => {
    const org = fakeOrg();
    const rt = createRuntime({ send: org.send, orgUrl: ORG, mode: "dry", sleep: noSleep });
    await expect(rt.invoke("request", ["GET", "/XRMServices/2011/Organization.svc/web"])).rejects.toThrow(/Only Web API paths/);
    await expect(rt.invoke("batch", [[{ method: "GET", path: "/main.aspx" }]])).rejects.toThrow(/Only Web API paths/);
  });
  it("an association made with a root-relative @odata.id is undone", async () => {
    const org = fakeOrg();
    const rt = createRuntime({ send: org.send, orgUrl: ORG, mode: "live", sleep: noSleep });
    await rt.invoke("request", ["POST", `accounts(${g(31)})/account_contacts/$ref`, { body: { "@odata.id": `/api/data/v9.2/contacts(${g(41)})` } }]);
    expect(rt.entries[0].inverse[0].path).toBe(`/api/data/v9.2/accounts(${g(31)})/account_contacts/$ref?$id=${ORG}/api/data/v9.2/contacts(${g(41)})`);
  });
  it("a write left without response is journaled as 'may or may not have run'", async () => {
    const org = fakeOrg();
    const send = async (r) => (r.method === "PATCH" ? { ok: false, status: 0, statusText: "Timeout (300s)", headers: {}, body: "aborted", clientError: true } : org.send(r));
    const rt = createRuntime({ send, orgUrl: ORG, mode: "live", sleep: noSleep });
    await expect(rt.invoke("update", ["accounts", g(31), { name: "X" }])).rejects.toThrow(/Timeout/);
    expect(rt.entries).toHaveLength(1);
    expect(rt.entries[0]).toMatchObject({ reversible: "partial", note: expect.stringMatching(/may or may not have run/) });
    expect(rt.entries[0].inverse[0].body).toEqual({ name: "Contoso" });
  });
  it("a rollback stopped half-way resumes without replaying what was undone", async () => {
    const org = fakeOrg();
    const rt = createRuntime({ send: org.send, orgUrl: ORG, mode: "live", sleep: noSleep });
    await rt.invoke("create", ["accounts", { name: "A" }]);
    await rt.invoke("create", ["accounts", { name: "B" }]);
    let calls = 0;
    const flaky = async (r) => (++calls === 1 ? org.send(r) : { ok: false, status: 500, statusText: "", headers: {}, body: "", bodyParsed: { error: { message: "boom" } } });
    const r1 = await runRollback(rt.entries, { send: flaky, sleep: noSleep });
    expect(r1).toMatchObject({ undone: 1, failed: [expect.objectContaining({ error: expect.stringMatching(/boom/) })] });
    const log0 = org.log.length;
    const r2 = await runRollback(r1.entries, { send: org.send, sleep: noSleep });
    expect(r2).toMatchObject({ undone: 1, already: 1, failed: [] });
    expect(org.log.length - log0).toBe(1); // only the remaining DELETE was sent
    expect(org.t.accounts.size).toBe(2);
  });
});

describe("scriptRuntime — live run, journal and rollback", () => {
  it("the lookup propagation case: writes, then rollback restores every user exactly", async () => {
    const org = fakeOrg();
    const rt = createRuntime({ send: org.send, orgUrl: ORG, mode: "live", sleep: noSleep });
    const codes = await rt.invoke("getAll", ["fou_spritcodes?$select=fou_spritcodeid,_fou_salesorganizationid_value"]);
    const bySo = Object.fromEntries(codes.map(c => [c._fou_salesorganizationid_value, c.fou_spritcodeid]));
    const users = await rt.invoke("getAll", ["systemusers"]);
    for (const u of users) {
      const sc = bySo[u._fou_salesorganizationid_value];
      if (sc) await rt.invoke("update", ["systemusers", u.systemuserid, { "fou_SpritcodeId@odata.bind": `/fou_spritcodes(${sc})` }]);
    }
    expect(org.t.systemusers.get(g(21))._fou_spritcodeid_value).toBe(g(11));
    expect(org.t.systemusers.get(g(22))._fou_spritcodeid_value).toBe(g(12));
    expect(rt.entries).toHaveLength(2);
    // Alice had no spritcode → clear the $ref; Bob had SP-FR → bind it back
    expect(rt.entries[0].inverse).toEqual([{ method: "DELETE", path: `/api/data/v9.2/systemusers(${g(21)})/fou_SpritcodeId/$ref` }]);
    expect(rt.entries[1].inverse[0].body).toEqual({ "fou_SpritcodeId@odata.bind": `/fou_spritcodes(${g(11)})` });
    expect(rollbackStats(rt.entries)).toMatchObject({ full: 2, ops: 2 });
    const r = await runRollback(rt.entries, { send: org.send, sleep: noSleep });
    expect(r).toMatchObject({ undone: 2, failed: [] });
    expect(org.t.systemusers.get(g(21))._fou_spritcodeid_value).toBe(null);
    expect(org.t.systemusers.get(g(22))._fou_spritcodeid_value).toBe(g(11));
  });
  it("create, plain update, upsert-create, property put and delete are all undone", async () => {
    const org = fakeOrg();
    const rt = createRuntime({ send: org.send, orgUrl: ORG, mode: "live", sleep: noSleep });
    const newId = await rt.invoke("create", ["accounts", { name: "Tmp" }]);
    expect(org.t.accounts.has(newId)).toBe(true);
    await rt.invoke("update", ["accounts", g(31), { name: "Contoso 2", telephone1: null }]);
    await rt.invoke("upsert", ["accounts", g(99), { name: "Upserted" }]);
    await rt.invoke("request", ["PUT", `accounts(${g(32)})/telephone1`, { body: { value: "555" } }]);
    await rt.invoke("delete", ["accounts", g(32)]);
    expect(org.t.accounts.has(g(32))).toBe(false);
    const del = rt.entries.find(e => e.kind === "delete");
    expect(del.reversible).toBe("partial");
    expect(del.inverse[0].body).toMatchObject({ accountid: g(32), name: "Fabrikam", telephone1: "555", statuscode: 1, "parentaccountid@odata.bind": `/accounts(${g(31)})` });
    expect(del.inverse[0].body).not.toHaveProperty("modifiedon");
    const r = await runRollback(rt.entries, { send: org.send, sleep: noSleep });
    expect(r.failed).toEqual([]);
    expect(org.t.accounts.has(newId)).toBe(false);
    expect(org.t.accounts.has(g(99))).toBe(false);
    expect(org.t.accounts.get(g(31))).toMatchObject({ name: "Contoso", telephone1: "01" });
    expect(org.t.accounts.get(g(32))).toMatchObject({ name: "Fabrikam", telephone1: null, _parentaccountid_value: g(31) });
  });
  it("a polymorphic lookup is restored through the navigation property of its OLD target table", async () => {
    const org = fakeOrg();
    const rt = createRuntime({ send: org.send, orgUrl: ORG, mode: "live", sleep: noSleep });
    await rt.invoke("update", ["contacts", g(41), { "parentcustomerid_contact@odata.bind": `/contacts(${g(42)})` }]);
    expect(org.t.contacts.get(g(41))._t.parentcustomerid).toBe("contact");
    expect(rt.entries[0].inverse[0].body).toEqual({ "parentcustomerid_account@odata.bind": `/accounts(${g(31)})` });
    await runRollback(rt.entries, { send: org.send, sleep: noSleep });
    expect(org.t.contacts.get(g(41))).toMatchObject({ _parentcustomerid_value: g(31), _t: { parentcustomerid: "account" } });
  });
  it("a deleted inactive row is recreated then set back to its state", async () => {
    const org = fakeOrg();
    const rt = createRuntime({ send: org.send, orgUrl: ORG, mode: "live", sleep: noSleep });
    await rt.invoke("delete", ["accounts", g(31)]);
    expect(rt.entries[0].inverse.map(o => o.method)).toEqual(["POST", "PATCH"]);
    expect(rt.entries[0].inverse[0].body).not.toHaveProperty("statuscode"); // refused on create for an inactive row
    expect(rt.entries[0].inverse[1].body).toEqual({ statecode: 1, statuscode: 2 });
    await runRollback(rt.entries, { send: org.send, sleep: noSleep });
    expect(org.t.accounts.get(g(31))).toMatchObject({ name: "Contoso", statecode: 1, statuscode: 2 });
  });
  it("N:N associate / disassociate and single-valued $ref are undone", async () => {
    const org = fakeOrg();
    const rt = createRuntime({ send: org.send, orgUrl: ORG, mode: "live", sleep: noSleep });
    await rt.invoke("associate", ["accounts", g(31), "account_contacts", "contacts", g(41)]);
    const lk = `accounts(${g(31)})/account_contacts`;
    expect(org.links.get(lk).size).toBe(1);
    await rt.invoke("disassociate", ["accounts", g(31), "account_contacts", g(41)]);
    expect(org.links.get(lk).size).toBe(0);
    await rt.invoke("disassociate", ["systemusers", g(22), "fou_SpritcodeId"]);
    expect(org.t.systemusers.get(g(22))._fou_spritcodeid_value).toBe(null);
    expect(rt.entries.map(e => e.reversible)).toEqual(["full", "full", "full"]);
    // undo in reverse: ref restored, link re-added, then removed again
    await runRollback(rt.entries, { send: org.send, sleep: noSleep });
    expect(org.t.systemusers.get(g(22))._fou_spritcodeid_value).toBe(g(11));
    expect(org.links.get(lk).size).toBe(0);
  });
  it("actions are flagged irreversible; functions and bound actions run", async () => {
    const org = fakeOrg();
    const rt = createRuntime({ send: org.send, orgUrl: ORG, mode: "live", sleep: noSleep });
    expect(await rt.invoke("whoAmI", [])).toMatchObject({ UserId: g(21) });
    expect(await rt.invoke("callAction", ["Bump", {}, { bound: { set: "accounts", key: g(31) } }])).toEqual({ bumped: g(31) });
    expect(rt.entries[0]).toMatchObject({ kind: "action", reversible: "none" });
  });
  it("$batch live: atomic changeset, every write journaled, rollback undoes them", async () => {
    const org = fakeOrg();
    const rt = createRuntime({ send: org.send, orgUrl: ORG, mode: "live", sleep: noSleep });
    const r = await rt.invoke("batch", [[
      { method: "PATCH", path: `accounts(${g(31)})`, body: { name: "B1" }, headers: { "If-Match": "*" } },
      { method: "POST", path: "accounts", body: { name: "B2" } },
      { method: "GET", path: `accounts(${g(31)})` },
    ]]);
    expect(r.map(x => x.status)).toEqual([204, 204, 200]);
    expect(r[2].body.name).toBe("B1");
    expect(rt.entries.map(e => e.kind)).toEqual(["update", "create"]);
    expect(org.t.accounts.size).toBe(3);
    await runRollback(rt.entries, { send: org.send, sleep: noSleep });
    expect(org.t.accounts.size).toBe(2);
    expect(org.t.accounts.get(g(31)).name).toBe("Contoso");
  });
  it("$batch failure throws with the request number; nothing journaled for an atomic failure", async () => {
    const org = fakeOrg();
    const rt = createRuntime({ send: org.send, orgUrl: ORG, mode: "live", sleep: noSleep });
    await expect(rt.invoke("batch", [[
      { method: "PATCH", path: `accounts(${g(31)})`, body: { name: "X" } },
      { method: "PATCH", path: `accounts(${g(77)})`, body: { name: "Y" }, headers: { "If-Match": "*" } },
    ]])).rejects.toThrow(/request #1/);
    expect(rt.entries).toHaveLength(0);
  });
  it("retries 429 after Retry-After, and Stop interrupts the run", async () => {
    const org = fakeOrg(); org.throttle(2);
    const slept = [];
    const rt = createRuntime({ send: org.send, orgUrl: ORG, sleep: async (ms) => { slept.push(ms); } });
    expect(await rt.invoke("get", [`accounts(${g(31)})`])).toMatchObject({ name: "Contoso" });
    expect(slept.reduce((a, b) => a + b, 0)).toBe(2000);
    let stop = false;
    const rt2 = createRuntime({ send: org.send, orgUrl: ORG, isStopped: () => stop, sleep: noSleep });
    stop = true;
    await expect(rt2.invoke("get", ["accounts"])).rejects.toBeInstanceOf(StopError);
  });
  it("errors carry the server's message and status; unknown methods are refused", async () => {
    const org = fakeOrg();
    const rt = createRuntime({ send: org.send, orgUrl: ORG, sleep: noSleep });
    await expect(rt.invoke("update", ["accounts", g(77), { name: "x" }])).rejects.toMatchObject({ status: 404, message: expect.stringMatching(/Does Not Exist/) });
    const raw = await rt.invoke("request", ["GET", `accounts(${g(77)})`, { throwOnError: false }]);
    expect(raw).toMatchObject({ ok: false, status: 404 });
    await expect(rt.invoke("eval", [])).rejects.toThrow(/doesn't exist/);
  });
  it("fetchXml resolves the entity set; withHeaders defaults travel with every request", async () => {
    const org = fakeOrg(); const seen = [];
    const send = async (r) => { seen.push(r.headers); return org.send(r); };
    const rt = createRuntime({ send, orgUrl: ORG, sleep: noSleep });
    const rows = await rt.invoke("fetchXml", ["<fetch><entity name='account'><attribute name='name'/></entity></fetch>"], { MSCRMCallerID: g(22) });
    expect(rows).toHaveLength(2);
    expect(seen.at(-1)).toMatchObject({ MSCRMCallerID: g(22) });
    expect(await rt.invoke("entitySet", ["fou_spritcode"])).toBe("fou_spritcodes");
  });
  it("getAll follows @odata.nextLink and honours max", async () => {
    const org = fakeOrg();
    const rt = createRuntime({ send: org.send, orgUrl: ORG, sleep: noSleep });
    expect(await rt.invoke("getAll", ["systemusers", { pageSize: 2 }])).toHaveLength(3);
    expect(await rt.invoke("getAll", ["systemusers", { pageSize: 2, max: 2 }])).toHaveLength(2);
  });
});

describe("scriptRuntime — PR review fixes", () => {
  it("refuses a path that fetch() would resolve elsewhere (dot segments, %2e, backslash, control chars)", async () => {
    for (const p of ["/api/data/v9.2/../../XRMServices/2011/Organization.svc/web", "/api/data/v9.2/%2e%2e/%2E%2e/main.aspx", "/api/data/v9.2/.%2e/x", "accounts/../../x", "/api/data/v9.2/accounts\\..\\..\\x", "/api/data/v9.2/.\t./x", "$1/../x"]) {
      expect(() => toPath(p), p).toThrow(/segments|Backslashes/);
    }
    expect(resourceOf(`${ORG}/api/data/v9.2/%2e%2e/%2e%2e/XRMServices`)).toBe(null); // the URL parser resolved it first
    expect(toPath("accounts(name='a.b')?$filter=name eq '..'")).toBe("/api/data/v9.2/accounts(name='a.b')?$filter=name eq '..'");
    expect(toPath(`accounts(${keySegment({ code: "a/../b" })})`)).toBe("/api/data/v9.2/accounts(code='a%2F..%2Fb')");
    const org = fakeOrg();
    const rt = createRuntime({ send: org.send, orgUrl: ORG, mode: "live", sleep: noSleep });
    await expect(rt.invoke("request", ["POST", "/api/data/v9.2/../../XRMServices/2011/Organization.svc/web", { body: "<soap/>" }])).rejects.toThrow(/segments/);
    await expect(rt.invoke("batch", [[{ method: "PATCH", path: "accounts(1)/../../../x", body: {} }]])).rejects.toThrow(/segments/);
    expect(org.log).toEqual([]);
  });
  it("a failed metadata read isn't kept for the run: the next write reads it again", async () => {
    const org = fakeOrg(); let fail = 1;
    const send = async (r) => (fail && /EntityDefinitions\?/.test(r.path) ? (fail--, json(503, { error: { message: "busy" } })) : org.send(r));
    const rt = createRuntime({ send, orgUrl: ORG, mode: "live", sleep: noSleep });
    await rt.invoke("delete", ["accounts", g(32)]);
    await rt.invoke("delete", ["accounts", g(31)]);
    expect(rt.entries[0]).toMatchObject({ reversible: "none" }); // metadata unreadable for that one
    expect(rt.entries[1]).toMatchObject({ reversible: "partial" });
    expect(rt.entries[1].inverse[0].body).toMatchObject({ accountid: g(31), name: "Contoso" });
    expect(org.log.filter(l => /EntityDefinitions\?/.test(l))).toHaveLength(1); // + the failed one
  });
  it("dv.create(…, { returnRecord: true }) returns a row in a dry run too", async () => {
    const org = fakeOrg();
    const rt = createRuntime({ send: org.send, orgUrl: ORG, mode: "dry", sleep: noSleep });
    const acc = await rt.invoke("create", ["accounts", { name: "N", "parentaccountid@odata.bind": `/accounts(${g(31)})` }, { returnRecord: true }]);
    expect(acc).toEqual({ name: "N", accountid: fakeId(1), _parentaccountid_value: g(31) });
    await rt.invoke("update", ["accounts", acc.accountid, { telephone1: "2" }]); // usable as a key
    expect(rt.plan.map(p => p.kind)).toEqual(["create", "update"]);
  });
  it("a live $batch reads its before-images as sets, not one GET per write", async () => {
    const org = fakeOrg();
    const rt = createRuntime({ send: org.send, orgUrl: ORG, mode: "live", sleep: noSleep });
    await rt.invoke("batch", [[
      { method: "PATCH", path: `accounts(${g(31)})`, body: { name: "B1" }, headers: { "If-Match": "*" } },
      { method: "PATCH", path: `accounts(${g(32)})`, body: { telephone1: "9" }, headers: { "If-Match": "*" } },
      { method: "PATCH", path: `systemusers(${g(22)})`, body: { "fou_SpritcodeId@odata.bind": `/fou_spritcodes(${g(12)})` }, headers: { "If-Match": "*" } },
      { method: "PUT", path: `accounts(${g(31)})/telephone1`, body: { value: "7" } },
      { method: "PUT", path: `contacts(${g(41)})/fullname`, body: { value: "Daniel" } },
    ]]);
    const rowGets = org.log.filter(l => /^GET .*\/(accounts|systemusers)\([^)]*\)(\?|$)/.test(l));
    expect(rowGets).toEqual([]); // no single-row read
    const setReads = org.log.filter(l => l.startsWith("GET ") && l.includes("$filter="));
    expect(setReads).toHaveLength(2); // accounts (2 rows), systemusers (1 row)
    expect(setReads[0]).toContain("$select=accountid,name,telephone1");
    expect(org.log.filter(l => l.startsWith("POST ") && l.includes("$batch"))).toHaveLength(2); // the 2 property reads, then the writes
    expect(rt.entries.map(e => e.reversible)).toEqual(["full", "full", "full", "full", "full"]);
    await runRollback(rt.entries, { send: org.send, sleep: noSleep });
    expect(org.t.accounts.get(g(31))).toMatchObject({ name: "Contoso", telephone1: "01" });
    expect(org.t.accounts.get(g(32)).telephone1).toBe(null);
    expect(org.t.systemusers.get(g(22))._fou_spritcodeid_value).toBe(g(11));
    expect(org.t.contacts.get(g(41)).fullname).toBe("Dan");
  });
  it("a single update reads back only the columns it changes", async () => {
    const org = fakeOrg();
    const rt = createRuntime({ send: org.send, orgUrl: ORG, mode: "live", sleep: noSleep });
    await rt.invoke("update", ["accounts", g(31), { name: "X", "parentaccountid@odata.bind": `/accounts(${g(32)})` }]);
    expect(org.log.some(l => l.includes(`accounts(${g(31)})?$select=accountid,name,_parentaccountid_value`))).toBe(true);
    expect(rt.entries[0].inverse.map(o => o.method)).toEqual(["PATCH", "DELETE"]); // name back, lookup cleared
    expect(updateColumns({ "new_unknown@odata.bind": "/x(1)" }, "accountid", [])).toBe(null); // can't map → whole row
    expect(updateColumns({ name: "a", primarycontactid: { firstname: "x" } }, "accountid", [])).toEqual(["accountid", "name"]);
  });
  it("an input file's fingerprint changes with its content, not only its size", () => {
    const a = [{ id: "1", v: "x" }, { id: "2", v: "y" }];
    expect(hashRows(a)).toBe(hashRows(structuredClone(a)));
    expect(hashRows(a)).not.toBe(hashRows([{ id: "1", v: "x" }, { id: "2", v: "z" }]));
    expect(hashRows([{ a: "bc" }])).not.toBe(hashRows([{ ab: "c" }]));
  });
  it("a journal read back is validated and normalized", () => {
    const ok = { at: "2026-10-22T00:00:00Z", orgUrl: ORG, script: "s", entries: [{ seq: 1, method: "PATCH", path: "accounts(1)", inverse: [{ method: "PATCH", path: "/api/data/v9.2/accounts(1)", body: {} }], reversible: "full" }], rollback: { at: "x", undone: 3 } };
    const n = normalizeJournal(ok);
    expect(n.rollback.failed).toEqual([]);
    expect(n.entries[0]).toMatchObject({ seq: 1, reversible: "full" });
    expect(normalizeJournal({ ...ok, entries: [{ ...ok.entries[0], inverse: [{ method: "POST", path: "/api/data/v9.2/../../XRMServices/2011/Organization.svc/web" }] }] })).toBe(null);
    expect(normalizeJournal({ ...ok, entries: [{ ...ok.entries[0], inverse: [{ method: "GET", path: "/api/data/v9.2/accounts" }] }] })).toBe(null);
    expect(normalizeJournal({ entries: "x" })).toBe(null);
    expect(normalizeJournal({ ...ok, entries: [{ method: "DELETE", path: "p", inverse: [] }] }).entries[0]).toMatchObject({ seq: 1, reversible: "none" });
  });
});

describe("scriptRuntime — third review fixes", () => {
  it("journal on: a write whose before-image can't be read is NOT sent, unless { journal: 'best-effort' }", async () => {
    const org = fakeOrg(); let fail = true;
    const send = async (r) => (fail && r.method === "GET" && /accounts/.test(r.path) ? json(503, { error: { message: "busy" } }) : org.send(r));
    const rt = createRuntime({ send, orgUrl: ORG, mode: "live", sleep: noSleep });
    await expect(rt.invoke("update", ["accounts", g(31), { name: "X" }])).rejects.toThrow(/not sent.*best-effort/);
    await expect(rt.invoke("batch", [[{ method: "PATCH", path: `accounts(${g(31)})`, body: { name: "X" } }]])).rejects.toThrow(/\$batch \(request #1.*not sent/);
    expect(org.log.filter(l => !l.startsWith("GET"))).toEqual([]); // nothing written
    expect(org.t.accounts.get(g(31)).name).toBe("Contoso");
    expect(rt.entries).toEqual([]);
    await rt.invoke("update", ["accounts", g(31), { name: "X" }, { journal: "best-effort" }]);
    await rt.invoke("batch", [[{ method: "PATCH", path: `accounts(${g(32)})`, body: { name: "Y" } }], { journal: "best-effort" }]);
    expect(org.t.accounts.get(g(31)).name).toBe("X");
    expect(rt.entries.map(e => e.reversible)).toEqual(["none", "none"]);
    expect(rt.entries[0]).toMatchObject({ unreadable: true, note: expect.stringMatching(/^Before-image unreadable/) });
    expect(rollbackStats(rt.entries)).toMatchObject({ none: 2, unreadable: 2 });
    fail = false; // a 404 is "no row", not a failure: an upsert that creates still goes through
    expect(await rt.invoke("upsert", ["accounts", g(99), { name: "New" }])).toBe(g(99));
    expect(rt.entries[2]).toMatchObject({ reversible: "full", inverse: [{ method: "DELETE" }] });
  });
  it("dry run: a keyed read of a prefix_ table with the metadata unreadable is refused, not skipped as a function", async () => {
    const org = fakeOrg(); let fail = true, metaReads = 0;
    const send = async (r) => (fail && /EntityDefinitions\?/.test(r.path) ? (metaReads++, json(503, { error: { message: "busy" } })) : org.send(r));
    const rt = createRuntime({ send, orgUrl: ORG, mode: "dry", sleep: noSleep });
    await expect(rt.invoke("retrieve", ["fou_spritcodes", g(11)])).rejects.toThrow(/Metadata unreadable/);
    expect(metaReads).toBe(2); // read, read again, then refused
    expect(rt.plan).toEqual([]);
    fail = false;
    expect(await rt.invoke("retrieve", ["fou_spritcodes", g(11)])).toMatchObject({ fou_name: "SP-FR" });
    expect(rt.plan).toEqual([]);
  });
  it("a dry run doesn't call a built-in function that writes (CalculateRollupField)", async () => {
    const org = fakeOrg();
    const rt = createRuntime({ send: org.send, orgUrl: ORG, mode: "dry", sleep: noSleep });
    expect(await rt.invoke("callFunction", ["CalculateRollupField", { Target: { "@odata.id": `accounts(${g(31)})` }, FieldName: "x" }])).toBe(null);
    expect(await rt.invoke("get", [`accounts(${g(31)})/Microsoft.Dynamics.CRM.CalculateRollupField(FieldName='x')`])).toBeFalsy();
    expect(org.log.some(l => /CalculateRollupField/i.test(l))).toBe(false);
    expect(rt.plan.map(p => `${p.kind} ${p.table}`)).toEqual(["function CalculateRollupField", "function CalculateRollupField"]);
    expect(await rt.invoke("whoAmI", [])).toMatchObject({ UserId: g(21) }); // other built-ins still run
  });
  it("an explicit undefined option (null after the sandbox's JSON) leaves the defaults in place", async () => {
    const org = fakeOrg();
    const rt = createRuntime({ send: org.send, orgUrl: ORG, mode: "dry", sleep: noSleep });
    expect(await rt.invoke("get", ["accounts?$top=1", null])).toMatchObject({ value: [expect.any(Object)] });
    expect(await rt.invoke("getAll", ["accounts", null])).toHaveLength(2);
    expect(await rt.invoke("retrieve", ["accounts", g(31), null])).toMatchObject({ name: "Contoso" });
    expect(await rt.invoke("create", ["accounts", { name: "N" }, null])).toBe(fakeId(1));
    expect(await rt.invoke("create", ["accounts", null, null])).toBe(fakeId(2)); // a null body stays "{}"
    await rt.invoke("update", ["accounts", g(31), null, null]);
    expect(await rt.invoke("callFunction", ["WhoAmI", null, null])).toMatchObject({ UserId: g(21) });
    expect(await rt.invoke("batch", [[{ method: "GET", path: "accounts" }], null])).toHaveLength(1);
    await rt.invoke("disassociate", ["accounts", g(32), "parentaccountid", null]); // null target = single-valued $ref
    expect(rt.plan.map(p => `${p.kind} ${p.table}`)).toEqual(["create accounts", "create accounts", "update accounts", "clearRef accounts"]);
  });
  it("alternate-key values accept { $guid } / { $raw } / { $date } like function parameters", () => {
    expect(keySegment({ owner: { $guid: `{${g(1).toUpperCase()}}` }, code: "A" })).toBe(`owner=${g(1)},code='A'`);
    expect(keySegment({ since: { $date: "2026-01-02T03:04:05.000Z" } })).toBe("since=2026-01-02T03:04:05.000Z");
    expect(keySegment({ since: { $date: new Date(Date.UTC(2026, 0, 2)) } })).toBe("since=2026-01-02T00:00:00.000Z");
    expect(keySegment({ n: { $raw: "1.5M" } })).toBe("n=1.5M");
    expect(() => keySegment({ since: { $date: "nope" } })).toThrow(/Invalid \$date/);
    expect(() => keySegment({ owner: { id: 1 } })).toThrow(/\$date.*\$guid.*\$raw/); // not "[object Object]"
    expect(functionPath("F", { d: { $date: "2026-01-02T00:00:00Z" } })).toBe("F(d=@d)?@d=2026-01-02T00%3A00%3A00.000Z");
  });
  it("a clear of a value that was already empty is 'nothing to undo', not a reversible entry the rollback skips", async () => {
    const org = fakeOrg();
    const rt = createRuntime({ send: org.send, orgUrl: ORG, mode: "live", sleep: noSleep });
    await rt.invoke("request", ["DELETE", `accounts(${g(32)})/telephone1`]); // telephone1 is null
    await rt.invoke("disassociate", ["accounts", g(31), "parentaccountid"]);   // no parent
    expect(rt.entries.map(e => e.reversible)).toEqual(["none", "none"]);
    expect(rt.entries[0].note).toMatch(/Nothing to undo/);
    expect(rollbackStats(rt.entries)).toMatchObject({ full: 0, none: 2, ops: 0 });
    await rt.invoke("request", ["DELETE", `accounts(${g(31)})/telephone1`]); // had "01": restored
    expect(rt.entries[2]).toMatchObject({ reversible: "full", inverse: [{ method: "PUT", body: { value: "01" } }] });
  });
});
