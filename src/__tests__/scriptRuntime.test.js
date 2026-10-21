import { describe, it, expect } from "vitest";
import {
  toPath, resourceOf, keySegment, functionPath, parseSegments, classify, buildBatch, parseBatchResponse,
  mapBatchResults, summarize, rollbackStats, createRuntime, runRollback, scriptLine, StopError, fakeId,
} from "../scriptRuntime.js";

// ── A small in-memory Dataverse: metadata, rows, lookups, $ref, upsert, $batch, 429 ──────────────
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

function fakeOrg() {
  const t = {
    fou_salesorganizations: new Map([[g(1), { fou_salesorganizationid: g(1), fou_name: "SO-FR" }], [g(2), { fou_salesorganizationid: g(2), fou_name: "SO-DE" }]]),
    fou_spritcodes: new Map([
      [g(11), { fou_spritcodeid: g(11), fou_name: "SP-FR", _fou_salesorganizationid_value: g(1), _t: { fou_salesorganizationid: "fou_salesorganization" } }],
      [g(12), { fou_spritcodeid: g(12), fou_name: "SP-DE", _fou_salesorganizationid_value: g(2), _t: { fou_salesorganizationid: "fou_salesorganization" } }],
    ]),
    systemusers: new Map([
      [g(21), { systemuserid: g(21), fullname: "Alice", _fou_salesorganizationid_value: g(1), _fou_spritcodeid_value: null, _t: { fou_salesorganizationid: "fou_salesorganization" } }],
      [g(22), { systemuserid: g(22), fullname: "Bob", _fou_salesorganizationid_value: g(2), _fou_spritcodeid_value: g(11), _t: { fou_salesorganizationid: "fou_salesorganization", fou_spritcodeid: "fou_spritcode" } }],
      [g(23), { systemuserid: g(23), fullname: "Carol", _fou_salesorganizationid_value: null, _fou_spritcodeid_value: null, _t: {} }],
    ]),
    accounts: new Map([
      [g(31), { accountid: g(31), name: "Contoso", telephone1: "01", _parentaccountid_value: null, statecode: 1, statuscode: 2, modifiedon: "2026-01-01T00:00:00Z", _t: {} }],
      [g(32), { accountid: g(32), name: "Fabrikam", telephone1: null, _parentaccountid_value: g(31), statecode: 0, statuscode: 1, _t: { parentaccountid: "account" } }],
    ]),
    contacts: new Map([[g(41), { contactid: g(41), fullname: "Dan", _parentcustomerid_value: g(31), _t: { parentcustomerid: "account" } }], [g(42), { contactid: g(42), fullname: "Eve", _t: {} }]]),
  };
  const links = new Map(); // "accounts(id)/nav" → Set of absolute target urls (collection navs)
  let nextId = 900, throttleNext = 0;
  const log = [];
  const meta = (set) => META.find(m => m.EntitySetName === set);
  const out = (rec) => {
    const o = {};
    for (const [k, v] of Object.entries(rec)) {
      if (k === "_t") continue;
      o[k] = v;
      const m = k.match(/^_(.+)_value$/);
      if (m && v != null) {
        const tl = rec._t[m[1]];
        o[`${k}@Microsoft.Dynamics.CRM.lookuplogicalname`] = tl;
        const ent = META.find(e => e.EntitySetName === [...Object.keys(t)].find(s => t[s] === tableOf(rec)));
        const rel = (RELS[ent?.LogicalName] || []).find(r => r.ReferencingAttribute === m[1] && r.ReferencedEntity === tl) || (RELS[ent?.LogicalName] || []).find(r => r.ReferencingAttribute === m[1]);
        if (rel) o[`${k}@Microsoft.Dynamics.CRM.associatednavigationproperty`] = rel.ReferencingEntityNavigationPropertyName;
      }
    }
    return o;
  };
  const tableOf = (rec) => Object.values(t).find(m => [...m.values()].includes(rec));
  const ok = (status, body, headers = {}) => ({ ok: status < 300, status, statusText: "", headers, body: body == null ? "" : JSON.stringify(body), bodyParsed: body ?? null });
  const err = (status, message) => ok(status, { error: { code: "0x1", message } });
  const applyBody = (set, rec, body) => {
    const ent = meta(set);
    for (const [k, v] of Object.entries(body || {})) {
      if (k.endsWith("@odata.bind")) {
        const nav = k.slice(0, -11);
        const rel = (RELS[ent.LogicalName] || []).find(r => r.ReferencingEntityNavigationPropertyName === nav);
        if (!rel) throw new Error(`no nav ${nav}`);
        if (v == null) { rec[`_${rel.ReferencingAttribute}_value`] = null; continue; }
        const mm = String(v).match(/\/?([a-z_]+)\(([0-9a-f-]{36})\)/);
        rec[`_${rel.ReferencingAttribute}_value`] = mm[2]; rec._t[rel.ReferencingAttribute] = META.find(e => e.EntitySetName === mm[1]).LogicalName;
      } else rec[k] = v;
    }
  };
  function handle({ method, path, headers = {}, body }) {
    log.push(`${method} ${path}`);
    if (throttleNext > 0) { throttleNext--; return { ok: false, status: 429, statusText: "Too Many Requests", headers: { "retry-after": "1" }, body: "", bodyParsed: null }; }
    const res = resourceOf(path); const q = path.includes("?") ? path.slice(path.indexOf("?") + 1) : "";
    const b = typeof body === "string" && method !== "POST" ? JSON.parse(body) : body;
    if (res === "$batch") return batch(headers, body);
    if (res === "EntityDefinitions") return ok(200, { value: META });
    let m = res.match(/^EntityDefinitions\(LogicalName='([^']+)'\)\/ManyToOneRelationships$/);
    if (m) return ok(200, { value: RELS[m[1]] || [] });
    m = res.match(/^EntityDefinitions\(LogicalName='([^']+)'\)\/Attributes$/);
    if (m) return ATTRS[m[1]] ? ok(200, { value: ATTRS[m[1]] }) : err(404, "no attrs");
    if (res === "WhoAmI()") return ok(200, { UserId: g(21) });
    if (res === "DoThing") return ok(200, { done: true });
    const segs = parseSegments(res);
    const set = segs[0].name, tbl = t[set];
    if (!tbl) return err(404, `Resource not found for the segment '${set}'`);
    if (segs.length === 1 && segs[0].key == null) {
      if (method === "GET") {
        let rows = [...tbl.values()].map(out);
        const top = (q.match(/\$top=(\d+)/) || [])[1]; const max = (String(headers.Prefer || "").match(/maxpagesize=(\d+)/) || [])[1];
        const skip = Number((q.match(/\$skiptoken=(\d+)/) || [])[1] || 0);
        if (top) rows = rows.slice(0, Number(top));
        if (max && rows.length > skip + Number(max)) return ok(200, { value: rows.slice(skip, skip + Number(max)), "@odata.nextLink": `${ORG}/api/data/v9.2/${set}?$skiptoken=${skip + Number(max)}` });
        return ok(200, { value: rows.slice(skip) });
      }
      if (method === "POST") {
        const ent = meta(set); const id = b[ent.PrimaryIdAttribute] || g(++nextId);
        const rec = { [ent.PrimaryIdAttribute]: id, _t: {} }; applyBody(set, rec, b); tbl.set(id, rec);
        return ok(204, null, { "odata-entityid": `${ORG}/api/data/v9.2/${set}(${id})` });
      }
    }
    const key = segs[0].key; const rec = tbl.get(key);
    if (segs.length === 1) {
      if (method === "GET") return rec ? ok(200, out(rec)) : err(404, "Does Not Exist");
      if (method === "PATCH") {
        if (!rec) {
          if (headers["If-Match"] === "*") return err(404, "Does Not Exist");
          const ent = meta(set); const nr = { [ent.PrimaryIdAttribute]: key, _t: {} }; applyBody(set, nr, b); tbl.set(key, nr);
          return ok(204, null, { "odata-entityid": `${ORG}/api/data/v9.2/${set}(${key})` });
        }
        applyBody(set, rec, b); return ok(204, null, { "odata-entityid": `${ORG}/api/data/v9.2/${set}(${key})` });
      }
      if (method === "DELETE") { if (!rec) return err(404, "Does Not Exist"); tbl.delete(key); return ok(204, null); }
    }
    if (!rec) return err(404, "Does Not Exist");
    if (segs.length === 2 && segs[1].key == null && !segs[1].name.startsWith("Microsoft")) {
      const prop = segs[1].name;
      if (method === "GET") return rec[prop] == null ? ok(204, null) : ok(200, { value: rec[prop] });
      if (method === "PUT") { rec[prop] = b.value; return ok(204, null); }
      if (method === "DELETE") { rec[prop] = null; return ok(204, null); }
    }
    if (segs[segs.length - 1].name === "$ref") {
      const nav = segs[1].name; const lk = `${set}(${key})/${nav}`;
      const rel = (RELS[meta(set).LogicalName] || []).find(r => r.ReferencingEntityNavigationPropertyName === nav);
      if (rel) { // single-valued
        const attr = rel.ReferencingAttribute;
        if (method === "GET") { const v = rec[`_${attr}_value`]; return v ? ok(200, { "@odata.id": `${ORG}/api/data/v9.2/${META.find(e => e.LogicalName === rel.ReferencedEntity).EntitySetName}(${v})` }) : ok(204, null); }
        if (method === "PUT") { const mm = b["@odata.id"].match(/\(([0-9a-f-]{36})\)/); rec[`_${attr}_value`] = mm[1]; rec._t[attr] = rel.ReferencedEntity; return ok(204, null); }
        if (method === "DELETE") { rec[`_${attr}_value`] = null; return ok(204, null); }
      }
      const s = links.get(lk) || new Set(); links.set(lk, s);
      if (method === "POST") { s.add(b["@odata.id"]); return ok(204, null); }
      if (method === "DELETE") {
        const idq = (q.match(/\$id=(.+)$/) || [])[1];
        const target = idq ? decodeURIComponent(idq) : [...s].find(u => u.includes(`(${segs[1].key})`));
        s.delete(target); return ok(204, null);
      }
    }
    if (segs.length === 2 && segs[1].key != null && method === "GET") {
      const lk = `${set}(${key})/${segs[1].name}`; const s = links.get(lk) || new Set();
      const url = [...s].find(u => u.includes(`(${segs[1].key})`));
      if (!url) return err(404, "not linked");
      return ok(200, { "@odata.context": `${ORG}/api/data/v9.2/$metadata#${url.match(/v9\.2\/([a-z_]+)\(/)[1]}/$entity`, id: segs[1].key });
    }
    if (segs[1]?.name === "Microsoft.Dynamics.CRM.Bump") return ok(200, { bumped: key });
    return err(400, "unsupported");
  }
  function batch(headers, body) {
    const ct = headers["Content-Type"]; const bnd = ct.match(/boundary=(\S+)/)[1];
    const parts = body.split(`--${bnd}`).slice(1, -1);
    const respParts = [];
    for (const p of parts) {
      const reqs = [];
      const csm = p.match(/boundary=(changeset_\S+)/);
      const pieces = csm ? p.split(`--${csm[1]}`).slice(1, -1) : [p];
      for (const piece of pieces) {
        const lines = piece.split("\r\n");
        const i = lines.findIndex(l => /^(GET|POST|PATCH|PUT|DELETE) /.test(l));
        const [, m, url] = lines[i].match(/^(\S+) (\S+) HTTP/);
        const hs = {}; let j = i + 1;
        for (; lines[j] !== ""; j++) { const k = lines[j].indexOf(":"); hs[lines[j].slice(0, k)] = lines[j].slice(k + 2); }
        const bodyTxt = lines.slice(j + 1).join("\r\n").trim();
        reqs.push({ method: m, path: url, headers: hs, body: bodyTxt ? JSON.parse(bodyTxt) : undefined });
      }
      const resps = reqs.map(r => handle(r));
      const fmt = (r) => `Content-Type: application/http\r\nContent-Transfer-Encoding: binary\r\n\r\nHTTP/1.1 ${r.status} X\r\n${Object.entries(r.headers).map(([k, v]) => `${k}: ${v}\r\n`).join("")}\r\n${r.body || ""}`;
      if (csm) {
        const bad = resps.find(r => !r.ok);
        respParts.push(bad ? fmt(bad) : `Content-Type: multipart/mixed; boundary=cs_r\r\n\r\n${resps.map(r => `--cs_r\r\n${fmt(r)}`).join("\r\n")}\r\n--cs_r--`);
      } else respParts.push(fmt(resps[0]));
    }
    const txt = respParts.map(r => `--br\r\n${r}`).join("\r\n") + "\r\n--br--\r\n";
    return { ok: true, status: 200, statusText: "OK", headers: { "content-type": "multipart/mixed; boundary=br" }, body: txt, bodyParsed: null };
  }
  return { t, log, links, send: async (r) => handle(r), throttle: (n) => { throttleNext = n; } };
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
    expect(await rt.invoke("whoAmI", [])).toEqual({ UserId: g(21) });
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
    expect(await rt.invoke("whoAmI", [])).toEqual({ UserId: g(21) });
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
