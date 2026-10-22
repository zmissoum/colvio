import { describe, it, expect } from "vitest";
import { workflowRunAs, classifyIdentity, parseFlowConnections, connectorName, buildWhoRunsWhat, kindCounts, identityExportRows, connectionExportRows, IDENTITY_HEADERS, CONNECTION_HEADERS } from "../identities.js";
import { DEMO_USERS, DEMO_REFS, DEMO_INSTANCES, DEMO_FLOW_DEFS, DEMO_IDENT as I } from "../identitiesDemo.js";

describe("classifyIdentity", () => {
  it("tells every kind apart", () => {
    expect(classifyIdentity({ fullname: "SAP app", applicationid: "x" }).kind).toBe("app");
    expect(classifyIdentity({ fullname: "# Dynamics 365 Sales", applicationid: "x" }).kind).toBe("msapp");
    expect(classifyIdentity({ fullname: "SYSTEM" }).kind).toBe("builtin");
    expect(classifyIdentity({ fullname: "INTEGRATION", domainname: "" }).kind).toBe("builtin");
    expect(classifyIdentity({ fullname: "Batch", accessmode: 4 }).kind).toBe("noninteractive");
    expect(classifyIdentity({ fullname: "Ops", accessmode: 3 }).kind).toBe("support");
    expect(classifyIdentity({ fullname: "Partner", accessmode: 5 }).kind).toBe("delegated");
    expect(classifyIdentity({ fullname: "CRM Sync", domainname: "crm.sync@contoso.com", accessmode: 0 }).kind).toBe("service");
    expect(classifyIdentity({ fullname: "Jane Doe", domainname: "svc-flows@contoso.com", accessmode: 0 }).kind).toBe("service");
    expect(classifyIdentity({ fullname: "Jane Doe", domainname: "jane.doe@contoso.com", accessmode: 0 }).kind).toBe("person");
    expect(classifyIdentity({ fullname: "Sylvie Botella", domainname: "sylvie.botella@contoso.com" }).kind).toBe("person"); // "bot" inside a word isn't a service
    expect(classifyIdentity(null).kind).toBe("unknown");
  });
});

describe("whose context a process runs in", () => {
  it("follows Microsoft's rules", () => {
    expect(workflowRunAs({ category: 0, mode: 1, runAs: 0 }).who).toBe("owner");
    expect(workflowRunAs({ category: 0, mode: 1, runAs: 1 }).who).toBe("caller");
    expect(workflowRunAs({ category: 0, mode: 0, triggerCreate: true }).who).toBe("owner");
    expect(workflowRunAs({ category: 0, mode: 0, triggerUpdate: "statuscode" }).label).toBe("Owner (started by an event)");
    expect(workflowRunAs({ category: 0, mode: 0, triggerCreate: true, onDemand: true }).label).toMatch(/on demand/);
    expect(workflowRunAs({ category: 0, mode: 0, onDemand: true }).who).toBe("starter");
    expect(workflowRunAs({ category: 0, mode: 0, child: true }).who).toBe("parent");
    expect(workflowRunAs({ category: 0, mode: 0 }).who).toBe("none");
    expect(workflowRunAs({ category: 5 }).who).toBe("connections");
    expect(workflowRunAs({ category: 2 }).who).toBe("caller");
  });
});

describe("flow definitions", () => {
  it("lists the connections a flow uses, references and invoker connections", () => {
    expect(parseFlowConnections(DEMO_FLOW_DEFS[0].clientdata)).toEqual([
      { key: "shared_commondataserviceforapps", api: "shared_commondataserviceforapps", refLogicalName: "contoso_dataverse", connectionName: "", source: "embedded" },
      { key: "shared_sap", api: "shared_sap", refLogicalName: "contoso_sapconnection", connectionName: "", source: "embedded" },
    ]);
    expect(parseFlowConnections(DEMO_FLOW_DEFS[2].clientdata)[0].source).toBe("invoker");
    const legacy = JSON.stringify({ properties: { connectionReferences: { shared_sharepointonline: { connectionName: "shared-sharepointonl-123", source: "Embedded", id: "/providers/Microsoft.PowerApps/apis/shared_sharepointonline" } } } });
    expect(parseFlowConnections(legacy)).toEqual([{ key: "shared_sharepointonline", api: "shared_sharepointonline", refLogicalName: "", connectionName: "shared-sharepointonl-123", source: "embedded" }]);
    expect(parseFlowConnections("not json")).toEqual([]);
    expect(connectorName("/providers/Microsoft.PowerApps/apis/shared_sharepointonline")).toBe("sharepointonline");
  });
});

describe("who runs what", () => {
  const procs = [
    { id: I.flowSap, name: "Push new accounts to SAP", category: 5, state: 1, ownerId: I.paul, ownerType: "systemuser", owner: "Paul Durand" },
    { id: I.flowDigest, name: "Weekly account digest", category: 5, state: 1, ownerId: I.team, ownerType: "team", owner: "Integration team" },
    { id: I.flowNotify, name: "Notify me", category: 5, state: 0, ownerId: I.alex, ownerType: "systemuser", owner: "Alex Baker" },
    { id: "w1", name: "Set credit limit", category: 0, state: 1, mode: 1, runAs: 0, ownerId: I.zakaria, ownerType: "systemuser", owner: "Zakaria Missoum" },
    { id: "w2", name: "Background thing", category: 0, state: 1, mode: 0, runAs: 0, onDemand: true, ownerId: I.zakaria, ownerType: "systemuser", owner: "Zakaria Missoum" },
    { id: "w3", name: "On create", category: 0, state: 1, mode: 0, triggerCreate: true, ownerId: I.svc, ownerType: "systemuser", owner: "svc-integration" },
  ];
  const steps = [{ id: "s1", name: "SapSync: Update of account", state: 0, runAsId: I.sapApp, runAs: "SAP Connector (app)" }, { id: "s2", name: "Calling user step", state: 0, runAsId: null }];
  const users = Object.fromEntries(DEMO_USERS.map(u => [u.systemuserid, u]));
  const usersByAccount = Object.fromEntries(DEMO_USERS.filter(u => u.domainname).map(u => [u.domainname.toLowerCase(), u]));
  const flowConns = Object.fromEntries(DEMO_FLOW_DEFS.map(f => [f.id, parseFlowConnections(f.clientdata)]));
  const r = buildWhoRunsWhat({ procs, steps, refs: DEMO_REFS, instances: DEMO_INSTANCES, flowConns, users, usersByAccount });
  const by = Object.fromEntries(r.identities.map(i => [i.name, i]));

  it("puts a disabled owner of active automation first, with the reason", () => {
    expect(r.identities[0].name).toBe("Paul Durand");
    expect(by["Paul Durand"].flags[0]).toMatchObject({ level: "error" });
    expect(by["Paul Durand"].flags[0].text).toMatch(/Disabled, yet 1 active item runs through it/);
  });
  it("a background workflow started by an event runs as its owner; on demand it runs as the starter", () => {
    expect(by["svc-integration"].uses.map(u => `${u.what}:${u.kind}`)).toContain("runs as:Background workflow");
    expect(by["Zakaria Missoum"].uses.filter(u => u.name === "Background thing").map(u => u.what)).toEqual(["owns"]);
  });
  it("credits owners, run-as identities and signed-in accounts", () => {
    expect(by["SAP Connector (app)"]).toMatchObject({ kind: "app", active: 1 });
    expect(by["SAP Connector (app)"].uses[0]).toMatchObject({ what: "runs as", kind: "Plug-in step" });
    expect(by["Zakaria Missoum"].uses.map(u => `${u.what}:${u.kind}`)).toEqual(["owns:Classic workflow", "runs as:Real-time workflow", "owns:Classic workflow"]);
    expect(by["Zakaria Missoum"].flags[0].text).toMatch(/A person/);
    expect(by["svc-integration"]).toMatchObject({ kind: "noninteractive" });
    expect(by["svc-integration"].uses.find(u => u.what === "is the account of")).toMatchObject({ kind: "connection (commondataserviceforapps)", flows: 2 });
    expect(by["Integration team"]).toMatchObject({ kind: "team", type: "team" });
  });
  it("lists every connection with its account (or that it isn't stored) and the flows using it", () => {
    const sap = r.connections.find(c => c.logicalName === "contoso_sapconnection");
    expect(sap).toMatchObject({ connected: false, account: "", accountKnown: false, connector: "sap" });
    expect(sap.flows.map(f => f.name)).toEqual(["Push new accounts to SAP"]);
    const dv = r.connections.find(c => c.logicalName === "contoso_dataverse");
    expect(dv).toMatchObject({ account: "svc-integration@contoso.example", accountKind: { kind: "noninteractive" } });
    expect(dv.flows).toHaveLength(2);
    expect(r.invokerFlows.map(f => f.name)).toEqual(["Notify me"]);
  });
  it("an account that is nobody in the environment shows as external", () => {
    const r2 = buildWhoRunsWhat({ refs: [{ id: "r", name: "Ext", logicalName: "ext", connectorId: "shared_x", connectionId: "c1" }], instances: [{ id: "i", accountName: "someone@partner.example", internalId: "c1", refId: "r" }] });
    expect(r2.connections[0].accountKind.kind).toBe("external");
    expect(r2.identities[0]).toMatchObject({ type: "account", kind: "external", name: "someone@partner.example" });
  });
  it("lists idle integration identities, with what that means", () => {
    const r3 = buildWhoRunsWhat({ users, integrationUsers: DEMO_USERS }); // nothing owned or run: every integration identity is idle
    const ms = r3.identities.find(i => i.name === "# Dynamics 365 Sales Insights");
    expect(ms).toMatchObject({ kind: "msapp", total: 0 });
    const svc = r3.identities.find(i => i.name === "svc-integration");
    expect(svc.flags[0].text).toMatch(/an integration calls the Web API with it from outside/);
    expect(r3.identities.find(i => i.name === "SYSTEM")).toBeUndefined(); // built-in users only when they run something
  });
  it("counts and exports", () => {
    expect(kindCounts(r.identities)).toMatchObject({ person: 3, app: 1, noninteractive: 1, team: 1 });
    expect(identityExportRows(r.identities)[0]).toHaveLength(IDENTITY_HEADERS.length);
    const c = connectionExportRows(r.connections);
    expect(c[0]).toHaveLength(CONNECTION_HEADERS.length);
    expect(c.find(x => x[1] === "contoso_sapconnection")[4]).toBe("not stored in Dataverse");
  });
});
