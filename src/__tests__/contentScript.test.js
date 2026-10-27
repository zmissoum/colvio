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
