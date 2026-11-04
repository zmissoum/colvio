import { describe, it, expect } from "vitest";
import { buildTriggerIndex, firesOn, watchedColumns, triggerText, flowTriggerText, stepTrigger, workflowTrigger, flowTrigger, firesExportRows, FIRES_HEADERS } from "../triggerIndex.js";
import { parseFlowIdentity } from "../flowIdentity.js";
import { DEMO_FLOW_DEFS, DEMO_IDENT as I } from "../identitiesDemo.js";

const STEPS = [
  { id: "s1", name: "Acme.PreCreate: Create of account", pluginType: "Acme.PreCreate", assembly: "Acme", stage: 20, mode: 0, state: 0, message: "Create", entity: "account", filteringAttributes: "" },
  { id: "s2", name: "Acme.Sync: Update of account", pluginType: "Acme.Sync", assembly: "Acme", stage: 40, mode: 1, state: 0, message: "Update", entity: "account", filteringAttributes: "name,new_sapid" },
  { id: "s3", name: "Acme.Audit: Update of account", pluginType: "Acme.Audit", assembly: "Acme", stage: 40, mode: 0, state: 1, message: "Update", entity: "account", filteringAttributes: "" },
  { id: "s4", name: "Acme.Qualify", pluginType: "Acme.Qualify", assembly: "Acme", stage: 40, mode: 0, state: 0, message: "QualifyLead", entity: "lead", filteringAttributes: "" },
  { id: "s5", name: "Acme.Owner: Update of account", pluginType: "Acme.Owner", assembly: "Acme", stage: 20, mode: 0, state: 0, message: "Update", entity: "Account", filteringAttributes: " OwnerId , statecode" },
];
const PROCS = [
  { id: "w1", name: "Big deal alert", category: 0, state: 1, mode: 1, entity: "account", triggerCreate: true, triggerDelete: false, triggerUpdate: "revenue,new_sapid", owner: "Zoe" },
  { id: "w2", name: "Nightly cleanup", category: 0, state: 1, mode: 0, entity: "account", triggerCreate: false, triggerDelete: false, triggerUpdate: "", onDemand: true, owner: "Zoe" },
  { id: "w3", name: "Validate number", category: 2, state: 1, mode: 0, entity: "account", triggerCreate: false, triggerDelete: false, triggerUpdate: "" },
  { id: "f1", name: "Sync to SAP", category: 5, state: 1, entity: "account", owner: "Paul" },
  { id: "f2", name: "Weekly digest", category: 5, state: 1, entity: "", owner: "Team" },
  { id: "f3", name: "Not read yet", category: 5, state: 1, entity: "account", owner: "Paul" },
  { id: "f4", name: "Any change", category: 5, state: 0, entity: "account", owner: "Paul" },
];
const dvTrigger = (params) => JSON.stringify({ properties: { connectionReferences: {}, definition: { triggers: { T: { type: "OpenApiConnectionWebhook", inputs: { host: { apiId: "/providers/Microsoft.PowerApps/apis/shared_commondataserviceforapps", connectionName: "shared_commondataserviceforapps", operationId: "SubscribeWebhookTrigger" }, parameters: params } } }, actions: {} } } });
const FLOW_DEFS = {
  f1: parseFlowIdentity(dvTrigger({ "subscriptionRequest/message": 4, "subscriptionRequest/entityname": "account", "subscriptionRequest/filteringattributes": "name,telephone1", "subscriptionRequest/scope": 4, "subscriptionRequest/filterexpression": "statecode eq 0" })),
  f2: parseFlowIdentity(JSON.stringify({ properties: { connectionReferences: {}, definition: { triggers: { Every_Monday: { type: "Recurrence", recurrence: { frequency: "Week" } } }, actions: {} } } })),
  f4: parseFlowIdentity(dvTrigger({ "subscriptionRequest/message": 3, "subscriptionRequest/entityname": "account", "subscriptionRequest/scope": 2 })),
};
const index = buildTriggerIndex({ steps: STEPS, procs: PROCS, flowDefs: FLOW_DEFS });
const names = (rows) => rows.map(r => r.name);

describe("triggerIndex — one row per registration, from what Dataverse stores", () => {
  it("plug-in steps: the message decides create/update/delete, the filtering attributes are the columns, none = every column", () => {
    expect(stepTrigger(STEPS[1])).toMatchObject({ kind: "step", entity: "account", on: { update: true, create: false }, columns: ["name", "new_sapid"], everyColumn: false, timing: "async", active: true });
    expect(stepTrigger(STEPS[2])).toMatchObject({ everyColumn: true, timing: "sync", active: false });
    expect(stepTrigger(STEPS[3])).toMatchObject({ on: { other: "QualifyLead" }, columns: [], everyColumn: false });
    expect(stepTrigger(STEPS[4]).columns).toEqual(["ownerid", "statecode"]); // trimmed, lower-cased, entity too
    expect(stepTrigger(STEPS[4]).entity).toBe("account");
  });
  it("classic workflows: the 'Record fields change' list is the update trigger; none and on demand = On demand", () => {
    expect(workflowTrigger(PROCS[0])).toMatchObject({ kind: "workflow", on: { create: true, update: true, delete: false }, columns: ["revenue", "new_sapid"], timing: "realtime" });
    expect(workflowTrigger(PROCS[1])).toMatchObject({ on: { update: false, other: "On demand" }, timing: "background" });
  });
  it("cloud flows: the Dataverse trigger's change type, table, Select columns, scope and row filter; other triggers named; unread said", () => {
    const f1 = flowTrigger(PROCS[3], FLOW_DEFS.f1);
    expect(f1).toMatchObject({ kind: "flow", entity: "account", on: { create: true, update: true, delete: false }, columns: ["name", "telephone1"], scope: "Organization", rowFilter: "statecode eq 0", pending: false });
    expect(flowTrigger(PROCS[4], FLOW_DEFS.f2)).toMatchObject({ entity: "", on: { other: "Recurrence" } });
    expect(flowTrigger(PROCS[5], undefined)).toMatchObject({ pending: true, entity: "account" });
    expect(flowTrigger(PROCS[6], FLOW_DEFS.f4)).toMatchObject({ everyColumn: true, scope: "Business unit", active: false });
    expect(flowTrigger(PROCS[3], null).on.other).toBe("definition not readable");
  });
  it("the index leaves business rules out and groups by table; the demo flows parse", () => {
    expect(index.rows.find(r => r.name === "Validate number")).toBeUndefined();
    expect([...index.byEntity.keys()].sort()).toEqual(["account", "lead"]);
    expect(index.pendingFlows).toBe(1);
    const sap = parseFlowIdentity(DEMO_FLOW_DEFS.find(d => d.id === I.flowSap).clientdata);
    expect(flowTriggerText(sap.trigger)).toBe("Create or Update of account · name, new_sapid, telephone1 · Organization");
  });
});

describe("triggerIndex — what fires on a column", () => {
  it("a column: the update triggers that list it or run on every column, blocking ones first; create/delete only counted", () => {
    const r = firesOn(index, "account", "new_sapid");
    expect(names(r.groups.step)).toEqual(["Acme.Audit", "Acme.Sync"]); // sync first (even disabled), then async
    expect(names(r.groups.workflow)).toEqual(["Big deal alert"]);
    expect(names(r.groups.flow)).toEqual(["Any change"]); // every column; Sync to SAP lists name,telephone1 only
    expect(r).toMatchObject({ total: 4, active: 2, blocking: 1, everyColumn: 2, alsoCreate: 3, alsoDelete: 0, pending: 1 });
  });
  it("a column nothing lists: only the every-column registrations", () => {
    const r = firesOn(index, "account", "description");
    expect(names([...r.groups.step, ...r.groups.workflow, ...r.groups.flow])).toEqual(["Acme.Audit", "Any change"]);
    expect(firesOn(index, "lead", "subject").total).toBe(0);
  });
  it("no column: everything registered on the table, including create-only and other messages; unknown table: nothing", () => {
    const r = firesOn(index, "account", "");
    expect(r.total).toBe(9); // 4 steps + 2 workflows + 3 flows (one not read yet)
    expect(names(r.groups.flow)).toEqual(["Not read yet", "Sync to SAP", "Any change"]); // active ones first, the draft flow last
    expect(firesOn(index, "lead", "").groups.step[0].on.other).toBe("QualifyLead");
    expect(firesOn(index, "contact", "").total).toBe(0);
  });
  it("watchedColumns counts the explicit lists and the every-column registrations apart", () => {
    const w = watchedColumns(index, "account");
    expect([...w.columns.entries()].sort()).toEqual([["name", 2], ["new_sapid", 2], ["ownerid", 1], ["revenue", 1], ["statecode", 1], ["telephone1", 1]]);
    expect(w.everyColumn).toBe(2);
  });
  it("texts: triggers, flow trigger cells, export rows", () => {
    expect(triggerText(index.rows.find(r => r.name === "Big deal alert"))).toBe("Create · Update (revenue, new_sapid)");
    expect(triggerText(index.rows.find(r => r.name === "Acme.Audit"))).toBe("Update (every column)");
    expect(triggerText(index.rows.find(r => r.name === "Not read yet"))).toBe("definition not read yet");
    expect(triggerText({ on: { create: false, update: true, delete: true, other: "" }, columns: ["a", "b", "c", "d", "e", "f"], everyColumn: false })).toBe("Update (a, b, c, d +2) · Delete");
    expect(flowTriggerText(FLOW_DEFS.f1.trigger)).toBe("Create or Update of account · name, telephone1 · Organization · rows: statecode eq 0");
    expect(flowTriggerText(FLOW_DEFS.f4.trigger)).toBe("Update of account · every column · Business unit");
    expect(flowTriggerText(FLOW_DEFS.f2.trigger)).toBe("Recurrence");
    expect(flowTriggerText(undefined)).toBe("");
    expect(flowTriggerText(null)).toBe("no trigger");
    const rows = firesExportRows(firesOn(index, "account", "new_sapid"));
    expect(rows).toHaveLength(4);
    expect(rows[0]).toHaveLength(FIRES_HEADERS.length);
    expect(rows.find(r => r[1] === "Any change")[5]).toBe("every column");
  });
});
