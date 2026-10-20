import { describe, it, expect } from "vitest";
import {
  parseWriteUrl, writeKind, columnsFromBody, parseBatch, decodeRaw, startSave, finishSave,
  idFromEntityId, addSave, savesForRecord, MAX_SAVES,
} from "../saveCapture.js";

const ORG = "https://contoso.crm4.dynamics.com";
const ID = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
const bytes = (s) => [{ bytes: new TextEncoder().encode(s).buffer }];

describe("parseWriteUrl / writeKind", () => {
  it("reads the table, the record and what follows", () => {
    expect(parseWriteUrl(`${ORG}/api/data/v9.2/accounts(${ID.toUpperCase()})`)).toEqual({ entitySet: "accounts", recordId: ID, sub: null });
    expect(parseWriteUrl(`${ORG}/api/data/v9.0/accounts`)).toEqual({ entitySet: "accounts", recordId: null, sub: null });
    expect(parseWriteUrl(`${ORG}/api/data/v9.2/$batch`)).toEqual({ batch: true });
    expect(parseWriteUrl(`accounts({${ID}})`)).toEqual({ entitySet: "accounts", recordId: ID, sub: null });
    expect(parseWriteUrl(`${ORG}/api/data/v9.2/leads(${ID})/Microsoft.Dynamics.CRM.QualifyLead?x=1`).sub).toBe("Microsoft.Dynamics.CRM.QualifyLead");
    expect(parseWriteUrl(`${ORG}/main.aspx`)).toBeNull();
  });
  it("names the kind of write", () => {
    const k = (m, u) => writeKind(m, parseWriteUrl(u));
    expect(k("PATCH", `accounts(${ID})`)).toBe("update");
    expect(k("POST", "accounts")).toBe("create");
    expect(k("DELETE", `accounts(${ID})`)).toBe("delete");
    expect(k("POST", `leads(${ID})/Microsoft.Dynamics.CRM.QualifyLead`)).toBe("action");
    expect(k("POST", `accounts(${ID})/contact_customer_accounts/$ref`)).toBe("associate");
    expect(k("DELETE", `accounts(${ID})/primarycontactid/$ref`)).toBe("disassociate");
    expect(k("POST", "WhoAmI")).toBe("create"); // unbound — kept, but never matches a record
  });
});

describe("columnsFromBody", () => {
  it("keeps column names only, lookups without @odata.bind, no annotations", () => {
    expect(columnsFromBody(JSON.stringify({ name: "x", "primarycontactid@odata.bind": "/contacts(1)", "@odata.etag": "w", "revenue@OData.Community.Display.V1.FormattedValue": "1" })))
      .toEqual(["name", "primarycontactid"]);
  });
  it("is empty for anything that isn't a JSON object", () => {
    expect(columnsFromBody("")).toEqual([]);
    expect(columnsFromBody("not json")).toEqual([]);
    expect(columnsFromBody("[1,2]")).toEqual([]);
  });
});

describe("parseBatch", () => {
  it("finds the writes of a changeset and skips the reads", () => {
    const body = [
      "--batch_1", "Content-Type: application/http", "", `GET ${ORG}/api/data/v9.0/accounts(${ID})?$select=name HTTP/1.1`, "Accept: application/json", "",
      "--batch_1", "Content-Type: multipart/mixed; boundary=changeset_1", "",
      "--changeset_1", "Content-Type: application/http", "Content-ID: 1", "",
      `PATCH ${ORG}/api/data/v9.0/accounts(${ID}) HTTP/1.1`, "Content-Type: application/json", "", JSON.stringify({ telephone1: "1", "ownerid@odata.bind": "/systemusers(2)" }),
      "--changeset_1--", "--batch_1--",
    ].join("\r\n");
    expect(parseBatch(body)).toEqual([{ kind: "update", entitySet: "accounts", recordId: ID, action: null, columns: ["telephone1", "ownerid"] }]);
  });
});

describe("decodeRaw", () => {
  it("decodes the body and refuses missing ones", () => {
    expect(decodeRaw(bytes('{"a":1}'))).toBe('{"a":1}');
    expect(decodeRaw(undefined)).toBeNull();
    expect(decodeRaw([])).toBeNull();
  });
});

describe("startSave / finishSave", () => {
  const base = { requestId: "77", tabId: 4, timeStamp: 1000.4, method: "PATCH", url: `${ORG}/api/data/v9.0/accounts(${ID})`, requestBody: { raw: bytes(JSON.stringify({ telephone1: "1", revenue: 2 })) } };
  it("opens a save for a write, ignores reads, service workers and read-only batches", () => {
    expect(startSave(base)).toMatchObject({ key: "77", origin: ORG, tabId: 4, t0: 1000, batch: false, ops: [{ kind: "update", recordId: ID, columns: ["telephone1", "revenue"] }] });
    expect(startSave({ ...base, method: "GET" })).toBeNull();
    expect(startSave({ ...base, tabId: -1 })).toBeNull();
    expect(startSave({ ...base, method: "POST", url: `${ORG}/api/data/v9.0/$batch`, requestBody: { raw: bytes(`GET accounts(${ID}) HTTP/1.1\r\n\r\n`) } })).toBeNull();
  });
  it("keeps at most 50 ops of a big $batch but remembers how many there were", () => {
    const parts = Array.from({ length: 120 }, (_, i) => `--changeset_1
Content-Type: application/http

PATCH ${ORG}/api/data/v9.0/accounts(${ID}) HTTP/1.1
Content-Type: application/json

{"telephone1":"${i}"}
`).join("");
    const s = startSave({ ...base, method: "POST", url: `${ORG}/api/data/v9.0/$batch`, requestBody: { raw: bytes(parts + "--changeset_1--") } });
    expect(s.batch).toBe(true);
    expect(s.ops).toHaveLength(50);
    expect(s.opCount).toBe(120);
  });
  it("closes it with the outcome, the request ids and the server clock", () => {
    const s = finishSave(startSave(base), { timeStamp: 1412, statusCode: 204, responseHeaders: [
      { name: "Date", value: "Wed, 14 Oct 2026 10:00:05 GMT" }, { name: "x-ms-service-request-id", value: "AAAAAAAA-0000-4000-8000-000000000001" }, { name: "REQ_ID", value: "not-a-guid" },
    ] });
    expect(s).toMatchObject({ t1: 1412, status: 204, ok: true, requestIds: ["aaaaaaaa-0000-4000-8000-000000000001"], serverMs: Date.parse("2026-10-14T10:00:05Z") });
    expect(finishSave(startSave(base), { timeStamp: 1300, statusCode: 400, responseHeaders: [] }).ok).toBe(false);
    expect(finishSave(startSave(base), { timeStamp: 1300, error: "net::ERR_FAILED" })).toMatchObject({ ok: false, error: "net::ERR_FAILED" });
  });
  it("a create gets its record id from OData-EntityId; a batch's outcome stays unknown", () => {
    const create = startSave({ ...base, method: "POST", url: `${ORG}/api/data/v9.0/accounts`, requestBody: { raw: bytes('{"name":"New"}') } });
    expect(idFromEntityId(`${ORG}/api/data/v9.0/accounts(${ID})`)).toBe(ID);
    expect(finishSave(create, { timeStamp: 1500, statusCode: 204, responseHeaders: [{ name: "OData-EntityId", value: `${ORG}/api/data/v9.0/accounts(${ID})` }] }).ops[0].recordId).toBe(ID);
    const batch = startSave({ ...base, method: "POST", url: `${ORG}/api/data/v9.0/$batch`, requestBody: { raw: bytes(`PATCH accounts(${ID}) HTTP/1.1\r\nContent-Type: application/json\r\n\r\n{"name":"x"}\r\n--changeset--`) } });
    expect(finishSave(batch, { timeStamp: 1500, statusCode: 200, responseHeaders: [] }).ok).toBeNull();
  });
});

describe("addSave / savesForRecord", () => {
  const s = (key, t0, ops) => ({ key, t0, ops });
  it("keeps the newest first, replaces a key, caps the list", () => {
    let list = [];
    for (let i = 0; i < MAX_SAVES + 5; i++) list = addSave(list, s(String(i), i, []));
    expect(list).toHaveLength(MAX_SAVES);
    expect(list[0].key).toBe(String(MAX_SAVES + 4));
    expect(addSave([s("a", 1, []), s("b", 2, [])], s("a", 3, [])).map(x => x.key)).toEqual(["a", "b"]);
  });
  it("returns this record's saves with their columns merged", () => {
    const other = "b2c3d4e5-f6a7-8901-bcde-f12345678901";
    const list = [
      s("1", 10, [{ kind: "update", entitySet: "accounts", recordId: ID, columns: ["name"] }, { kind: "update", entitySet: "accounts", recordId: ID, columns: ["revenue", "name"] }]),
      s("2", 20, [{ kind: "update", entitySet: "accounts", recordId: other, columns: ["name"] }]),
      s("3", 30, [{ kind: "action", entitySet: "accounts", recordId: ID, action: "Merge", columns: [] }]),
      s("4", 5, [{ kind: "update", entitySet: "contacts", recordId: ID, columns: ["x"] }]),
    ];
    const mine = savesForRecord(list, "accounts", ID.toUpperCase());
    expect(mine.map(x => x.key)).toEqual(["3", "1"]);
    expect(mine[1]).toMatchObject({ kind: "update", columns: ["name", "revenue"], opCount: 2 });
    expect(mine[0]).toMatchObject({ kind: "action", action: "Merge" });
  });
});
