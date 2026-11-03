import { describe, it, expect } from "vitest";
import { parseRecordInput, resolveRecordTable } from "../recordInput.js";

const G = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
const ORG = "https://contoso.crm4.dynamics.com";

describe("parseRecordInput — every form a record reference comes in", () => {
  it("a D365 form URL (etn= & id=), braces literal or %-encoded, parameters in any order", () => {
    expect(parseRecordInput(`${ORG}/main.aspx?etn=account&id=${G}&pagetype=entityrecord`)).toEqual({ id: G, kind: "entity", name: "account" });
    expect(parseRecordInput(`${ORG}/main.aspx?appid=1234&pagetype=entityrecord&etn=Contact&id={${G.toUpperCase()}}`)).toEqual({ id: G, kind: "entity", name: "contact" });
    expect(parseRecordInput(`${ORG}/main.aspx?etn=account&id=%7B${G}%7D`)).toEqual({ id: G, kind: "entity", name: "account" });
    expect(parseRecordInput(`main.aspx?etn=account&id=${G}`)).toEqual({ id: G, kind: "entity", name: "account" }); // relative: no host needed
    expect(parseRecordInput(`${ORG}/main.aspx?etn=account&pagetype=entitylist`)).toBeNull(); // a list, not a record
  });
  it("the hash form #/<table>/<guid>", () => {
    expect(parseRecordInput(`${ORG}/main.aspx#/account/${G}`)).toEqual({ id: G, kind: "entity", name: "account" });
    expect(parseRecordInput(`${ORG}/#/entity/account/{${G}}?x=1`)).toEqual({ id: G, kind: "entity", name: "account" });
  });
  it("a Web API URL, absolute or relative, any version, with a query or a navigation after the key", () => {
    expect(parseRecordInput(`${ORG}/api/data/v9.2/accounts(${G})`)).toEqual({ id: G, kind: "set", name: "accounts" });
    expect(parseRecordInput(`/api/data/v9.0/accounts(${G})?$select=name`)).toEqual({ id: G, kind: "set", name: "accounts" });
    expect(parseRecordInput(`api/data/v9.1/fou_stations({${G}})/fou_owner`)).toEqual({ id: G, kind: "set", name: "fou_stations" });
    expect(parseRecordInput(`  ${ORG}/api/data/v9.2/accounts(${G})  `)).toEqual({ id: G, kind: "set", name: "accounts" }); // surrounding spaces
  });
  it("table/guid and table(guid) — a logical name or an entity set, the list decides", () => {
    expect(parseRecordInput(`account/${G}`)).toEqual({ id: G, kind: "name", name: "account" });
    expect(parseRecordInput(`accounts/{${G}}`)).toEqual({ id: G, kind: "name", name: "accounts" });
    expect(parseRecordInput(`accounts(${G})`)).toEqual({ id: G, kind: "name", name: "accounts" });
    expect(parseRecordInput(`accounts({${G}})?$select=name`)).toEqual({ id: G, kind: "name", name: "accounts" });
  });
  it("a bare GUID, braces or not — the table is unknown", () => {
    expect(parseRecordInput(G)).toEqual({ id: G, kind: "id", name: null });
    expect(parseRecordInput(`{${G.toUpperCase()}}`)).toEqual({ id: G, kind: "id", name: null });
  });
  it("refuses what isn't a record reference", () => {
    expect(parseRecordInput("")).toBeNull();
    expect(parseRecordInput("   ")).toBeNull();
    expect(parseRecordInput("account")).toBeNull();
    expect(parseRecordInput("account/not-a-guid")).toBeNull();
    expect(parseRecordInput(`account/${G}x`)).toBeNull();
    expect(parseRecordInput(`${ORG}/api/data/v9.2/accounts?$select=name`)).toBeNull(); // a query, not one record
    expect(parseRecordInput("SELECT name FROM account")).toBeNull();
  });
});

describe("resolveRecordTable — the logical name behind what was typed", () => {
  const list = [{ logical: "account", display: "Account", entitySet: "accounts" }, { logical: "fou_station", entitySet: "fou_stations" }];
  it("an entity set becomes its table; a logical name is confirmed", () => {
    expect(resolveRecordTable({ kind: "set", name: "accounts", id: G }, list)).toEqual({ entity: "account", verified: true });
    expect(resolveRecordTable({ kind: "name", name: "accounts", id: G }, list)).toEqual({ entity: "account", verified: true });
    expect(resolveRecordTable({ kind: "name", name: "account", id: G }, list)).toEqual({ entity: "account", verified: true });
    expect(resolveRecordTable({ kind: "entity", name: "fou_station", id: G }, list)).toEqual({ entity: "fou_station", verified: true });
    expect(resolveRecordTable({ kind: "entity", name: "ACCOUNT", id: G }, list)).toEqual({ entity: "account", verified: true });
  });
  it("accepts the UI's { l, p } rows too", () => {
    expect(resolveRecordTable({ kind: "set", name: "fou_stations", id: G }, [{ l: "fou_station", d: "Station", p: "fou_stations" }])).toEqual({ entity: "fou_station", verified: true });
  });
  it("a name the org doesn't have is said so, not passed to a metadata read", () => {
    expect(resolveRecordTable({ kind: "name", name: "acount", id: G }, list)).toEqual({ error: "table 'acount' not found on this org" });
    expect(resolveRecordTable({ kind: "set", name: "nope", id: G }, list).error).toMatch(/not found on this org/);
  });
  it("without a list the name is taken as typed, unverified; a GUID alone can't name a table", () => {
    expect(resolveRecordTable({ kind: "name", name: "account", id: G }, null)).toEqual({ entity: "account", verified: false });
    expect(resolveRecordTable({ kind: "name", name: "account", id: G }, [])).toEqual({ entity: "account", verified: false });
    expect(resolveRecordTable({ kind: "id", name: null, id: G }, list).error).toMatch(/GUID alone/);
    expect(resolveRecordTable(null, list).error).toBeTruthy();
  });
});
