// The content script, now ES modules (src/content/), runs here against a fake page, a fake chrome
// and a scripted fetch: every request it sends is checked (URL, headers, body) and its answers
// to the panel too. Before the split (1.11.212) it was one 3,500-line IIFE with no test at all.
import { describe, it, expect, beforeAll } from "vitest";

const ORG = "https://org.crm4.dynamics.com";
const G = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const requests = [];
let listener = null;
// scripted answers: the first matching entry (method + url regexp) answers once; else a generic one
const script = [];
const reply = (status, body, headers = {}) => {
  const text = typeof body === "string";
  const h = { "content-type": text ? "text/plain" : "application/json; odata.metadata=minimal", ...headers };
  return { ok: status < 300, status, statusText: status === 204 ? "No Content" : status < 300 ? "OK" : "Error",
    headers: { get: (k) => h[k.toLowerCase()] ?? null, forEach: (fn) => Object.entries(h).forEach(([k, v]) => fn(v, k)) },
    text: async () => (text ? body : body == null ? "" : JSON.stringify(body)), json: async () => body };
};
const batchReply = (parts) => reply(200, parts.map(([cid, status, body]) => `--br\r\nContent-Type: application/http\r\nContent-Transfer-Encoding: binary\r\nContent-ID: ${cid}\r\n\r\nHTTP/1.1 ${status} X\r\nContent-Type: application/json\r\n\r\n${body ? JSON.stringify(body) : ""}\r\n`).join("") + "--br--\r\n", { "content-type": "multipart/mixed; boundary=br" });

beforeAll(async () => {
  globalThis.window = { location: { origin: ORG, href: `${ORG}/main.aspx?etn=account&id=%7B${G(5)}%7D`, search: `?etn=account&id=%7B${G(5)}%7D`, hash: "" } };
  globalThis.chrome = { runtime: { id: "colvio", onMessage: { addListener: (fn) => { listener = fn; } }, sendMessage: () => {} } };
  globalThis.fetch = async (url, opts = {}) => {
    const method = (opts.method || "GET").toUpperCase();
    requests.push({ method, url: String(url), headers: opts.headers || {}, body: opts.body == null ? null : String(opts.body) });
    const i = script.findIndex(s => s.method === method && s.re.test(String(url)));
    if (i >= 0) return script.splice(i, 1)[0].answer(String(url), opts);
    if (method === "GET") return reply(200, { value: [] });
    return reply(204, null);
  };
  await import("../content/index.js");
});
const send = (action, params) => new Promise((res) => listener({ __d365InspectorFromBg: true, action, params }, {}, res));
const since = (n) => requests.slice(n);

describe("content script - dispatch and context", () => {
  it("registers one listener, answers unknown actions readably, reads the org from the page", async () => {
    expect(typeof listener).toBe("function");
    expect(await send("noSuchAction", {})).toEqual({ error: "Unknown action: noSuchAction" });
    expect(await send("__proto__", {})).toEqual({ error: "Unknown action: __proto__" });
    const r = await send("getContext", {});
    expect(r.result).toMatchObject({ clientUrl: ORG, orgName: "org", apiVersion: "v9.2" });
    expect(await send("getCurrentRecord", {})).toEqual({ result: { entityType: "account", recordId: G(5) } });
  });
  it("every request stays on the org's host; the Script Console reaches the Web API only", async () => {
    const r1 = await send("customRequest", { method: "GET", path: "https://evil.example/x" });
    expect(r1.error).toMatch(/not your D365 org host/);
    const r2 = await send("scriptRequest", { method: "POST", path: "/api/data/v9.2/../../XRMServices/2011/Organization.svc/web", body: "<x/>" });
    expect(r2.error).toMatch(/Only Web API paths/);
    const n = requests.length;
    // the panel's runtime sends root-relative Web API paths; a bare "accounts" is not one
    expect((await send("scriptRequest", { method: "GET", path: "accounts?$top=1" })).error).toMatch(/Only Web API paths/);
    const r3 = await send("scriptRequest", { method: "GET", path: "/api/data/v9.2/accounts?$top=1" });
    expect(r3.result).toMatchObject({ ok: true, status: 200 });
    expect(since(n).map(q => q.url)).toEqual([`${ORG}/api/data/v9.2/accounts?$top=1`]);
  });
});

describe("content script - security actions", () => {
  it("getRoleMemberIds pages to the end, ids only, no cap", async () => {
    const n = requests.length;
    script.push({ method: "GET", re: /systemusers\?\$select=systemuserid&\$filter=/, answer: () => reply(200, { value: [{ systemuserid: G(1).toUpperCase() }, { systemuserid: G(2) }], "@odata.nextLink": `${ORG}/api/data/v9.2/systemusers?$select=systemuserid&$skiptoken=p2` }) });
    script.push({ method: "GET", re: /\$skiptoken=p2/, answer: () => reply(200, { value: [{ systemuserid: G(2) }, { systemuserid: G(3) }] }) });
    const r = await send("getRoleMemberIds", { roleName: "Basic User" });
    expect(r.result).toEqual([G(1), G(2), G(3)]);
    const sent = since(n);
    expect(sent).toHaveLength(2);
    expect(sent[0].url).toContain("systemuserroles_association/any(o:o/name eq 'Basic%20User')"); // odataStr: percent-encoded value
    expect(sent[0].headers.Prefer).toBe("odata.maxpagesize=5000");
  });
  it("searchUsers matches the sign-in name (domainname) too, and returns it as upn", async () => {
    const n = requests.length;
    script.push({ method: "GET", re: /systemusers\?\$select=systemuserid,fullname,internalemailaddress,domainname/, answer: () => reply(200, { value: [{ systemuserid: G(1), fullname: "Alex Baker", internalemailaddress: "alex@contoso.com", domainname: "abaker@contoso.onmicrosoft.com", isdisabled: false, title: "Sales" }] }) });
    const r = await send("searchUsers", { search: "abaker" });
    expect(r.result).toEqual([{ id: G(1), fullname: "Alex Baker", email: "alex@contoso.com", upn: "abaker@contoso.onmicrosoft.com", disabled: false, title: "Sales" }]);
    expect(since(n)[0].url).toContain("$filter=contains(fullname,'abaker') or contains(internalemailaddress,'abaker') or contains(domainname,'abaker')&$top=20");
  });
  it("getLoginStatsSlice counts BOTH access actions (64 app, 65 web services) — the aggregate and its raw-scan fallback", async () => {
    const n = requests.length;
    script.push({ method: "GET", re: /audits\?fetchXml=/, answer: () => reply(200, { value: [{ uid: G(1), n: 3, last: "2026-10-02T08:00:00Z" }] }) });
    const r = await send("getLoginStatsSlice", { from: "2026-10-02T00:00:00Z", to: "2026-10-03T00:00:00Z" });
    expect(r.result).toEqual({ rows: [{ userId: G(1), userName: "", count: 3, last: "2026-10-02T08:00:00Z" }], method: "aggregate" });
    const fx = decodeURIComponent(since(n)[0].url.split("fetchXml=")[1]);
    expect(fx).toContain('<condition attribute="action" operator="in"><value>64</value><value>65</value></condition>');
    expect(fx).not.toContain('value="64"');
    // a full page (500 groups) means the aggregate was truncated → the exact scan, same two actions
    script.push({ method: "GET", re: /audits\?fetchXml=/, answer: () => reply(200, { value: Array.from({ length: 500 }, (_, i) => ({ uid: G(i + 1), n: 1, last: "2026-10-02T08:00:00Z" })) }) });
    script.push({ method: "GET", re: /audits\?\$select=createdon,_objectid_value/, answer: () => reply(200, { value: [{ createdon: "2026-10-02T09:00:00Z", _objectid_value: G(7) }, { createdon: "2026-10-02T10:00:00Z", _objectid_value: G(7) }] }) });
    const n2 = requests.length;
    const r2 = await send("getLoginStatsSlice", { from: "2026-10-02T00:00:00Z", to: "2026-10-03T00:00:00Z" });
    expect(r2.result).toEqual({ rows: [{ userId: G(7), userName: "", count: 2, last: "2026-10-02T10:00:00Z" }], method: "scan" });
    expect(since(n2)).toHaveLength(2);
    expect(since(n2)[1].url).toContain("$filter=(action eq 64 or action eq 65) and createdon ge 2026-10-02T00:00:00Z and createdon lt 2026-10-03T00:00:00Z");
  });
  it("getAccessAuditFloor: the oldest row of EITHER access action", async () => {
    const n = requests.length;
    expect((await send("getAccessAuditFloor", {})).result).toEqual({ floor: null });
    expect(since(n)[0].url).toContain("audits?$select=createdon&$filter=(action eq 64 or action eq 65)&$orderby=createdon asc&$top=1");
  });
  it("getUserRoles: direct roles + the roles of the user's teams in ONE expanded read, the team named on each row", async () => {
    const n = requests.length;
    script.push({ method: "GET", re: /systemusers\([^)]+\)\/systemuserroles_association/, answer: () => reply(200, { value: [{ roleid: G(11), name: "Salesperson" }] }) });
    script.push({ method: "GET", re: /teams\?\$select=teamid,name&\$filter=teammembership_association/, answer: () => reply(200, { value: [
      { teamid: G(21), name: "Sales EU", teamroles_association: [{ roleid: G(12), name: "Sales Manager" }, { roleid: G(13), name: "Basic User" }] },
      { teamid: G(22), name: "Everyone", teamroles_association: [] },
    ] }) });
    const r = await send("getUserRoles", { userId: G(1) });
    expect(r.result).toEqual({
      direct: [{ id: G(11), name: "Salesperson" }],
      inherited: [{ id: G(13), name: "Basic User", team: { id: G(21), name: "Sales EU" } }, { id: G(12), name: "Sales Manager", team: { id: G(21), name: "Sales EU" } }],
      teamsError: "",
    });
    const sent = since(n);
    expect(sent).toHaveLength(2);
    expect(sent[0].url).toBe(`${ORG}/api/data/v9.2/systemusers(${G(1)})/systemuserroles_association?$select=roleid,name`);
    expect(sent[1].url).toBe(`${ORG}/api/data/v9.2/teams?$select=teamid,name&$filter=teammembership_association/any(m:m/systemuserid eq ${G(1)})&$expand=teamroles_association($select=roleid,name)`);
    // the team read refused → the direct roles still answer, the failure is SAID (never "no team roles")
    script.push({ method: "GET", re: /systemusers\([^)]+\)\/systemuserroles_association/, answer: () => reply(200, { value: [{ roleid: G(11), name: "Salesperson" }] }) });
    script.push({ method: "GET", re: /teams\?\$select=teamid,name&\$filter=teammembership_association/, answer: () => reply(403, { error: { message: "Principal user is missing prvReadTeam privilege." } }) });
    const r2 = await send("getUserRoles", { userId: G(1) });
    expect(r2.result.direct).toEqual([{ id: G(11), name: "Salesperson" }]);
    expect(r2.result.inherited).toEqual([]);
    expect(r2.result.teamsError).toMatch(/prvReadTeam/);
    expect((await send("getUserRoles", { userId: "not-a-guid" })).error).toBeTruthy();
  });
});

describe("content script - metadata reads", () => {
  it("getOptionSet reads a multi-select choice through its own metadata cast (the Picklist cast 400s on it)", async () => {
    const n = requests.length;
    script.push({ method: "GET", re: /MultiSelectPicklistAttributeMetadata\?\$select=LogicalName&\$expand=OptionSet/, answer: () => reply(200, { LogicalName: "new_channels", OptionSet: { Options: [{ Value: 1, Label: { UserLocalizedLabel: { Label: "Email" }, LocalizedLabels: [{ Label: "Email" }, { Label: "Courriel" }] }, Color: null }, { Value: 2, Label: { UserLocalizedLabel: { Label: "Phone" }, LocalizedLabels: [] } }] } }) });
    const r = await send("getOptionSet", { entityName: "account", fieldName: "new_channels", attrType: "MultiSelectPicklist" });
    expect(r.result.map(o => [o.value, o.label, o.labels])).toEqual([[1, "Email", ["Email", "Courriel"]], [2, "Phone", []]]);
    expect(since(n)).toHaveLength(1);
    expect(since(n)[0].url).toContain("/Attributes(LogicalName='new_channels')/Microsoft.Dynamics.CRM.MultiSelectPicklistAttributeMetadata?");
  });
  it("getOptionSet's global-option-set fallback keeps the column's own cast", async () => {
    const n = requests.length;
    script.push({ method: "GET", re: /StatusAttributeMetadata\?\$select=LogicalName&\$expand=OptionSet/, answer: () => reply(400, { error: { message: "no local set" } }) });
    script.push({ method: "GET", re: /StatusAttributeMetadata\?\$select=LogicalName&\$expand=GlobalOptionSet/, answer: () => reply(200, { GlobalOptionSet: { Options: [{ Value: 1, Label: { UserLocalizedLabel: { Label: "Active" } } }] } }) });
    const r = await send("getOptionSet", { entityName: "account", fieldName: "statuscode", attrType: "Status" });
    expect(r.result.map(o => o.label)).toEqual(["Active"]);
    expect(since(n).map(q => /Microsoft\.Dynamics\.CRM\.(\w+)\?/.exec(q.url)[1])).toEqual(["StatusAttributeMetadata", "StatusAttributeMetadata"]);
  });
});

describe("content script - automation reads", () => {
  it("getWorkflowXamlPage: classic workflows, dialogs and actions only, 25 per page, a foreign page link refused", async () => {
    const n = requests.length;
    script.push({ method: "GET", re: /workflows\?\$select=workflowid,xaml/, answer: () => reply(200, { value: [{ workflowid: G(21), xaml: "<Activity/>" }, { workflowid: G(22), xaml: null }], "@odata.nextLink": `${ORG}/api/data/v9.2/workflows?$select=workflowid,xaml&$skiptoken=p2` }) });
    const r = await send("getWorkflowXamlPage", {});
    expect(r.result.rows).toEqual([{ id: G(21), xaml: "<Activity/>" }, { id: G(22), xaml: "" }]);
    expect(r.result.next).toContain("$skiptoken=p2");
    const q = since(n)[0];
    expect(q.url).toBe(`${ORG}/api/data/v9.2/workflows?$select=workflowid,xaml&$filter=type eq 1 and (category eq 0 or category eq 1 or category eq 3)`);
    expect(q.headers.Prefer).toBe("odata.maxpagesize=25");
    const r2 = await send("getWorkflowXamlPage", { next: r.result.next });
    expect(r2.result).toEqual({ rows: [], next: null });
    expect(since(n)[1].url).toContain("$skiptoken=p2");
    expect((await send("getWorkflowXamlPage", { next: `${ORG}/api/data/v9.2/systemusers?$select=domainname` })).error).toMatch(/Invalid page link/);
  });
});

describe("content script - solutions reads", () => {
  it("getSolutionHistory: the history (orderby refused by the virtual table → read without it) and the import jobs, each failing on its own", async () => {
    const n = requests.length;
    script.push({ method: "GET", re: /msdyn_solutionhistories\?.*\$orderby=msdyn_starttime%20desc|msdyn_solutionhistories\?.*\$orderby=msdyn_starttime desc/, answer: () => reply(400, { error: { message: "The $orderby option is not supported on this virtual table." } }) });
    script.push({ method: "GET", re: /msdyn_solutionhistories\?\$select=msdyn_solutionhistoryid/, answer: () => reply(200, { value: [{ msdyn_solutionhistoryid: G(31), msdyn_name: "Contoso", msdyn_solutionversion: "1.0.0.2", msdyn_publishername: "Contoso", msdyn_operation: 0, msdyn_suboperation: 2, msdyn_status: 1, msdyn_result: true, msdyn_starttime: "2026-10-01T10:00:00Z", msdyn_endtime: "2026-10-01T10:04:00Z", msdyn_totaltime: 240, msdyn_ismanaged: true, msdyn_ispatch: false, msdyn_isoverwritecustomizations: false, msdyn_errorcode: null, msdyn_exceptionmessage: null }] }) });
    script.push({ method: "GET", re: /importjobs\?\$select=importjobid/, answer: () => reply(200, { value: [{ importjobid: G(41), solutionname: "Contoso", name: "Contoso_1_0_0_2.zip", startedon: "2026-10-01T10:00:30Z", completedon: "2026-10-01T10:04:00Z", createdon: "2026-10-01T10:00:30Z", progress: 100, operationcontext: "Default", importcontext: "Import", _createdby_value: G(1), "_createdby_value@OData.Community.Display.V1.FormattedValue": "Zakaria" }] }) });
    const r = await send("getSolutionHistory", {});
    expect(r.result.historyError).toBe("");
    expect(r.result.jobsError).toBe("");
    expect(r.result.history).toEqual([{ id: G(31), solution: "Contoso", version: "1.0.0.2", publisher: "Contoso", operation: 0, suboperation: 2, status: 1, result: true, start: "2026-10-01T10:00:00Z", end: "2026-10-01T10:04:00Z", seconds: 240, managed: true, patch: false, overwrite: false, errorCode: "", error: "", activityId: "", correlationId: "", solutionId: "", packageName: "", packageVersion: "", description: "" }]);
    expect(r.result.jobs).toEqual([{ id: G(41), solution: "Contoso", name: "Contoso_1_0_0_2.zip", started: "2026-10-01T10:00:30Z", completed: "2026-10-01T10:04:00Z", created: "2026-10-01T10:00:30Z", progress: 100, context: "Default", importContext: "Import", by: "Zakaria", byId: G(1), onBehalfOf: "" }]);
    const sent = since(n);
    expect(sent).toHaveLength(3);
    expect(sent[0].url).toContain("msdyn_solutionhistories?$select=msdyn_solutionhistoryid,msdyn_name");
    expect(sent[0].url).toContain("$orderby=msdyn_starttime");
    expect(sent[1].url).not.toContain("$orderby");
    expect(sent[2].url).toContain("importjobs?$select=importjobid,solutionname");
    expect(sent[2].url).not.toMatch(/\$select=[^&]*(^|,)data(,|&|$)/); // the log is never part of the list read
    expect(sent.every(q => String(q.headers.Prefer).includes("odata.maxpagesize=5000"))).toBe(true); // annotations kept: the job's createdby name
    // the jobs refused (no privilege) → said, the history still answered
    script.push({ method: "GET", re: /msdyn_solutionhistories\?/, answer: () => reply(200, { value: [] }) });
    script.push({ method: "GET", re: /importjobs\?/, answer: () => reply(403, { error: { message: "Principal user is missing prvReadImportJob privilege." } }) });
    const r2 = await send("getSolutionHistory", {});
    expect(r2.result.history).toEqual([]);
    expect(r2.result.jobsError).toMatch(/prvReadImportJob/);
  });
  it("getImportJobLog: one job's log by id, the id checked", async () => {
    const n = requests.length;
    script.push({ method: "GET", re: /importjobs\(/, answer: () => reply(200, { data: "<importexportxml/>", solutionname: "Contoso", completedon: "2026-10-01T10:04:00Z", progress: 100 }) });
    const r = await send("getImportJobLog", { id: G(41) });
    expect(r.result).toEqual({ id: G(41), solution: "Contoso", completed: "2026-10-01T10:04:00Z", progress: 100, data: "<importexportxml/>" });
    expect(since(n)[0].url).toBe(`${ORG}/api/data/v9.2/importjobs(${G(41)})?$select=data,solutionname,completedon,progress`);
    expect((await send("getImportJobLog", { id: "not-a-guid" })).error).toBeTruthy();
  });
});

describe("content script - writes", () => {
  it("updateWebResource: conditional on the ETag opened, refused with CHANGED_ON_SERVER on 412", async () => {
    const n = requests.length;
    script.push({ method: "PATCH", re: /webresourceset\(/, answer: () => reply(200, { "@odata.etag": 'W/"2"', modifiedon: "2026-10-27T10:00:00Z", "_modifiedby_value@OData.Community.Display.V1.FormattedValue": "Alex" }) });
    const r = await send("updateWebResource", { id: G(8), content: "YQ==", etag: 'W/"1"' });
    expect(r.result).toEqual({ ok: true, etag: 'W/"2"', modifiedOn: "2026-10-27T10:00:00Z", modifiedBy: "Alex" });
    const q = since(n)[0];
    expect(q.headers["If-Match"]).toBe('W/"1"');
    expect(q.headers.Prefer).toMatch(/return=representation/);
    expect(q.url).toContain(`webresourceset(${G(8)})?$select=modifiedon`);
    script.push({ method: "PATCH", re: /webresourceset\(/, answer: () => reply(412, { error: { message: "The version of the existing record doesn't match the RowVersion property provided." } }) });
    expect((await send("updateWebResource", { id: G(8), content: "YQ==", etag: 'W/"1"' })).error).toMatch(/CHANGED_ON_SERVER/);
    expect((await send("updateWebResource", { id: G(8), content: "YQ==", etag: "junk" })).error).toMatch(/Invalid ETag/);
    const n2 = requests.length;
    await send("updateWebResource", { id: G(8), content: "YQ==" });
    expect(since(n2)[0].headers["If-Match"]).toBe("*"); // no ETag: overwrite
  });
  it("batchAssociate: a missing RECORD is an error, a missing association on remove is 'was not associated'", async () => {
    script.push({ method: "POST", re: /\$batch$/, answer: () => batchReply([
      [1, 404, { error: { message: `systemuser With Id = ${G(1)} Does Not Exist` } }],
      [2, 404, { error: { message: "The relationship does not exist" } }],
      [3, 204, null],
    ]) });
    const r = await send("batchAssociate", { set1: "teams", nav1: "teammembership_association", set2: "systemusers", mode: "remove", items: [{ id1: G(9), id2: G(1) }, { id1: G(9), id2: G(2) }, { id1: G(9), id2: G(3) }] });
    expect(r.result.log.map(e => `${e.row}:${e.status}${e.already ? "/already" : ""}`)).toEqual(["1:ERROR", "2:DISASSOCIATED/already", "3:DISASSOCIATED"]);
    expect(r.result).toMatchObject({ done: 1, already: 1 });
    expect(r.result.errors[0].msg).toMatch(/Does Not Exist/);
  });
  it("run tokens: an aborted run sends nothing and reports every row as retryable", async () => {
    const rid = (await send("resetBatchAbort", {})).result.runId;
    expect(rid).toBeGreaterThan(0);
    await send("abortBatch", { runId: rid });
    const n = requests.length;
    const r = await send("batchAssociate", { runId: rid, set1: "teams", nav1: "teammembership_association", set2: "systemusers", items: [{ id1: G(9), id2: G(1) }] });
    expect(since(n)).toHaveLength(0);
    expect(r.result.aborted).toBe(true);
    expect(r.result.log[0]).toMatchObject({ status: "ERROR", msg: expect.stringMatching(/Aborted before send/) });
  });
});
