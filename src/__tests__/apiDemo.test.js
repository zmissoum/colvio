import { describe, it, expect } from "vitest";
import { demoApiResponse, DEMO_ORG, DEMO_IDS } from "../apiDemo.js";
import { detectEnv } from "../envDetect.js";
import { ROWS } from "../shared.jsx";

const API = "/api/data/v9.2/";
const send = (method, path, extra = {}) => demoApiResponse({ method, path: path.startsWith("http") ? path : API + path, ...extra });
const ACME = ROWS[0].accountid;
const FMT = "@OData.Community.Display.V1.FormattedValue";

describe("response shape (mirrors the live customRequest action)", () => {
  it("returns exactly the live fields, lower-cased sorted headers and compact JSON text", () => {
    const r = send("GET", "WhoAmI()");
    expect(Object.keys(r).sort()).toEqual(["body", "bodyParsed", "elapsed", "headers", "ok", "status", "statusText", "url"]);
    expect(r.url).toBe(`${DEMO_ORG}${API}WhoAmI()`);
    const names = Object.keys(r.headers);
    expect(names).toEqual([...names].sort());
    expect(names.every(n => n === n.toLowerCase())).toBe(true);
    expect(r.headers["content-type"]).toMatch(/^application\/json; odata\.metadata=minimal/);
    expect(r.body).toBe(JSON.stringify(r.bodyParsed));
  });
  it("is deterministic — the same request gives the same response, timing included", () => {
    expect(send("GET", "accounts?$select=name&$top=3")).toEqual(send("GET", "accounts?$select=name&$top=3"));
    expect(send("GET", "accounts?$top=1").elapsed).not.toBe(send("POST", "accounts", { body: '{"name":"x"}' }).elapsed);
  });
});

describe("functions", () => {
  it("WhoAmI answers the user, business unit and organization ids", () => {
    const r = send("GET", "WhoAmI()");
    expect(r).toMatchObject({ ok: true, status: 200, statusText: "OK" });
    expect(r.bodyParsed).toEqual({
      "@odata.context": `${DEMO_ORG}${API}$metadata#Microsoft.Dynamics.CRM.WhoAmIResponse`,
      BusinessUnitId: DEMO_IDS.businessUnit, UserId: DEMO_IDS.user, OrganizationId: DEMO_IDS.organization,
    });
  });
  it("RetrieveCurrentOrganization reports a sandbox — consistent with the demo's SANDBOX badge", () => {
    const d = send("GET", "RetrieveCurrentOrganization(AccessType=Microsoft.Dynamics.CRM.EndpointAccessType'Default')").bodyParsed.Detail;
    expect(d).toMatchObject({ OrganizationId: DEMO_IDS.organization, UrlName: "demo", State: "Enabled" });
    expect(d.Endpoints.Values[0]).toBe(`${DEMO_ORG}/`);
    expect(detectEnv(DEMO_ORG, d.OrganizationType)).toMatchObject({ label: "SANDBOX", isProduction: false });
  });
  it("a function only answers GET", () => {
    expect(send("POST", "WhoAmI()", { body: "{}" }).status).toBe(405);
  });
});

describe("GET a collection", () => {
  it("honours $select and $top: context lists the columns, the primary key always comes back", () => {
    const r = send("GET", "accounts?$select=name,accountnumber&$top=2");
    expect(r.bodyParsed["@odata.context"]).toBe(`${DEMO_ORG}${API}$metadata#accounts(name,accountnumber)`);
    expect(r.bodyParsed.value).toHaveLength(2);
    expect(Object.keys(r.bodyParsed.value[0])).toEqual(["@odata.etag", "name", "accountnumber", "accountid"]);
    expect(r.bodyParsed.value[0]).toMatchObject({ name: "ACME France", accountnumber: "ACC-001", accountid: ACME });
  });
  it("sends raw values — option codes and lookup GUIDs — not the demo grid's labels", () => {
    const a = send("GET", "accounts?$select=industrycode,statecode,statuscode,_ownerid_value&$top=1").bodyParsed.value[0];
    expect(a).toMatchObject({ industrycode: 9, statecode: 0, statuscode: 1 });
    expect(a._ownerid_value).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-/);
    expect(send("GET", "accounts?$select=fax&$top=1").bodyParsed.value[0].fax).toBeNull();
  });
  it("filters: comparisons, string functions, and/or, parentheses — case-insensitive like Dataverse", () => {
    const names = (f) => send("GET", `accounts?$select=name&$filter=${f}`).bodyParsed.value.map(a => a.name);
    expect(names("statecode eq 1")).toEqual(["Umbrella Corp"]);
    expect(names("contains(name,'CORP')")).toEqual(["Umbrella Corp"]);
    expect(names("address1_country eq 'United States' and revenue gt 100000000")).toEqual(["Stark Industries"]);
    expect(names("(address1_city eq 'Paris' or address1_city eq 'Berlin') and not startswith(name,'Globex')")).toEqual(["ACME France"]);
    expect(names("new_siretcode ne null")).toEqual(["ACME France", "Initech Ltd"]);
  });
  it("$orderby and $count=true (count before $top)", () => {
    const r = send("GET", "accounts?$select=name&$orderby=revenue desc&$top=2&$count=true").bodyParsed;
    expect(r["@odata.count"]).toBe(6);
    expect(r.value.map(a => a.name)).toEqual(["Stark Industries", "Wayne Enterprises"]);
  });
  it("adds formatted values (before each raw value) when Prefer asks for annotations", () => {
    const r = send("GET", "accounts?$select=name,industrycode,revenue,_ownerid_value&$top=1", { headers: { Prefer: 'odata.include-annotations="*"' } });
    const a = r.bodyParsed.value[0];
    expect(a["industrycode" + FMT]).toBe("Manufacturing");
    expect(a["revenue" + FMT]).toBe("€15,000,000.00");
    expect(a["_ownerid_value" + FMT]).toBe("Jean Dupont");
    expect(a["_ownerid_value@Microsoft.Dynamics.CRM.lookuplogicalname"]).toBe("systemuser");
    expect(Object.keys(a).indexOf("industrycode" + FMT)).toBe(Object.keys(a).indexOf("industrycode") - 1);
    expect(r.headers["preference-applied"]).toBe('odata.include-annotations="*"');
    expect(send("GET", "accounts?$top=1").bodyParsed.value[0]["industrycode" + FMT]).toBeUndefined();
  });
  it("another known table answers an empty page", () => {
    expect(send("GET", "contacts?$select=fullname").bodyParsed).toEqual({ "@odata.context": `${DEMO_ORG}${API}$metadata#contacts(fullname)`, value: [] });
  });
});

describe("Dataverse-shaped errors", () => {
  it("unknown entity set → 404 with Dataverse's error body", () => {
    const r = send("GET", "acounts?$top=1");
    expect(r).toMatchObject({ ok: false, status: 404, statusText: "Not Found" });
    expect(r.bodyParsed).toEqual({ error: { code: "0x80060888", message: "Resource not found for the segment 'acounts'." } });
  });
  it("unknown column in $select / $filter → 400 naming the property", () => {
    const r = send("GET", "accounts?$select=name,nmae");
    expect(r.status).toBe(400);
    expect(r.bodyParsed.error.message).toBe("Could not find a property named 'nmae' on type 'Microsoft.Dynamics.CRM.account'.");
    expect(send("GET", "accounts?$filter=foo eq 1").bodyParsed.error.message).toMatch(/'foo'/);
  });
  it("filter syntax errors and $skip are refused as Dataverse does", () => {
    expect(send("GET", "accounts?$filter=name eqq 'x'").bodyParsed.error.message).toBe("Syntax error at position 5 in 'name eqq 'x''.");
    expect(send("GET", "accounts?$skip=2").bodyParsed.error.message).toBe("The query parameter $skip is not supported");
    expect(send("GET", "accounts?$top=-1").status).toBe(400);
  });
});

describe("single record", () => {
  it("GET by id → $entity context and an etag header", () => {
    const r = send("GET", `accounts(${ACME})?$select=name`);
    expect(r.bodyParsed).toMatchObject({ "@odata.context": `${DEMO_ORG}${API}$metadata#accounts(name)/$entity`, name: "ACME France", accountid: ACME });
    expect(r.headers.etag).toBe(r.bodyParsed["@odata.etag"]);
  });
  it("GET by alternate key, and a single property", () => {
    expect(send("GET", "accounts(accountnumber='ACC-004')?$select=name").bodyParsed.name).toBe("Stark Industries");
    expect(send("GET", `accounts(${ACME})/address1_city`).bodyParsed.value).toBe("Paris");
    expect(send("GET", "accounts(name='x')").bodyParsed.error.message).toBe("The specified key attributes are not a defined key for the account entity");
  });
  it("missing record → 404 0x80040217 with the platform's wording", () => {
    const id = "00000000-0000-0000-0000-000000000000";
    expect(send("GET", `accounts(${id})`).bodyParsed.error).toEqual({ code: "0x80040217", message: `account With Id = ${id} Does Not Exist` });
    expect(send("DELETE", "accounts(accountnumber='NOPE')").bodyParsed.error.message).toBe("A record with the specified key values does not exist in account entity");
  });
});

describe("writes", () => {
  it("POST → 204 No Content with the new record's URL in OData-EntityId", () => {
    const r = send("POST", "accounts", { body: '{"name":"Northwind"}' });
    expect(r).toMatchObject({ ok: true, status: 204, statusText: "No Content", body: "", bodyParsed: null });
    expect(r.headers["odata-entityid"]).toMatch(new RegExp(`^${DEMO_ORG}${API.replace(/\./g, "\\.")}accounts\\([0-9a-f-]{36}\\)$`));
    expect(r.headers["content-type"]).toBeUndefined();
  });
  it("POST with Prefer: return=representation → 201 Created with the record", () => {
    const r = send("POST", "accounts", { body: '{"name":"Northwind","address1_city":"Lyon"}', headers: { Prefer: "return=representation" } });
    expect(r).toMatchObject({ status: 201, statusText: "Created" });
    expect(r.bodyParsed).toMatchObject({ name: "Northwind", address1_city: "Lyon", statecode: 0 });
    expect(r.headers["odata-entityid"]).toContain(r.bodyParsed.accountid);
    expect(r.headers["preference-applied"]).toBe("return=representation");
  });
  it("payload errors: unknown property, unreadable JSON", () => {
    const bad = send("POST", "accounts", { body: '{"name":"x","citty":"Lyon"}' });
    expect(bad).toMatchObject({ status: 400 });
    expect(bad.bodyParsed.error.code).toBe("0x80048d19");
    expect(bad.bodyParsed.error.message).toContain("The property 'citty' does not exist on type 'Microsoft.Dynamics.CRM.account'");
    expect(send("POST", "accounts", { body: '{"name": "x"' }).status).toBe(400);
    expect(send("POST", "accounts", { body: '{"primarycontactid@odata.bind":"/contacts(1)"}' }).status).toBe(204);
  });
  it("PATCH is an upsert: existing → 204; missing → created, unless If-Match: *", () => {
    expect(send("PATCH", `accounts(${ACME})`, { body: '{"name":"ACME SA"}' }).status).toBe(204);
    expect(send("PATCH", "accounts(accountnumber='ABC123')", { body: '{"name":"New"}' }).status).toBe(204);
    expect(send("PATCH", "accounts(00000000-0000-0000-0000-000000000000)", { body: "{}", headers: { "If-Match": "*" } }).status).toBe(404);
    expect(send("PATCH", `accounts(${ACME})`, { body: "{}", headers: { "If-None-Match": "*" } }).status).toBe(412);
    expect(send("PATCH", `accounts(${ACME})`, { body: '{"name":"ACME SA"}', headers: { Prefer: "return=representation" } }).bodyParsed).toMatchObject({ name: "ACME SA", address1_city: "Paris" });
  });
  it("DELETE an existing record → 204, empty body", () => {
    expect(send("DELETE", `accounts(${ACME})`)).toMatchObject({ status: 204, body: "", bodyParsed: null });
    expect(send("DELETE", "accounts").status).toBe(405);
  });
});

describe("guards (same as the live action — they throw, nothing is answered)", () => {
  it("refuses any host other than the org", () => {
    expect(() => send("GET", "https://evil.example.com/api/data/v9.2/accounts")).toThrow("URL not allowed: evil.example.com is not your D365 org host (demo.crm4.dynamics.com)");
    expect(() => demoApiResponse({ method: "GET", path: "http://evil.example.com/x" })).toThrow(/evil\.example\.com is not your D365 org host/);
    expect(demoApiResponse({ method: "GET", path: "//evil.example.com/x" }).url).toBe(`${DEMO_ORG}//evil.example.com/x`); // stays on the org host
    expect(send("GET", `${DEMO_ORG}${API}WhoAmI()`).status).toBe(200);
  });
  it("refuses unknown methods and an empty path", () => {
    expect(() => send("TRACE", "accounts")).toThrow("Method not allowed: TRACE");
    expect(() => demoApiResponse({ method: "GET", path: "" })).toThrow("Missing path");
  });
});
