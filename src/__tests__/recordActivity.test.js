import { describe, it, expect } from "vitest";
import {
  saveWindow, messageNamesFor, traceWindowFilter, correlationFilter, jobsFilter, pickCorrelations,
  exceptionLine, shortType, buildChains, jobState, flowIdOf, flowVerdict, matchRun, isPending, nextDelay,
  SYNC_MARGIN_MS,
} from "../recordActivity.js";
import { createActivityLoader } from "../recordActivityLoader.js";
import { createActivityDemo, DEMO_ACTIVITY_IDS } from "../recordActivityDemo.js";
import { savesForRecord } from "../saveCapture.js";

const ID = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
const G = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

describe("saveWindow", () => {
  it("moves the save to server time using the Date header", () => {
    const w = saveWindow({ t0: 100000, t1: 100400, serverMs: 160400 }); // server 60 s ahead
    expect(w.fromMs).toBe(160000 - SYNC_MARGIN_MS);
    expect(w.syncToMs).toBe(160400 + 1000 + SYNC_MARGIN_MS);
    expect(w.from).toBe(new Date(w.fromMs).toISOString());
  });
  it("trusts the browser clock when there is no Date header", () => {
    expect(saveWindow({ t0: 5000, t1: 5100 }).fromMs).toBe(5000 - SYNC_MARGIN_MS);
  });
});

describe("messageNamesFor", () => {
  it("adds SetState and Assign when the save touches those columns", () => {
    expect(messageNamesFor({ kind: "update", columns: ["name"] })).toEqual(["Update"]);
    expect(messageNamesFor({ kind: "update", columns: ["statecode", "ownerid"] })).toEqual(["Update", "SetState", "SetStateDynamicEntity", "Assign"]);
    expect(messageNamesFor({ kind: "create" })).toEqual(["Create"]);
    expect(messageNamesFor({ kind: "action", action: "QualifyLead" })).toEqual(["QualifyLead"]);
  });
});

describe("filters", () => {
  it("validate every value they interpolate", () => {
    expect(traceWindowFilter("account", "A", "B")).toBe("primaryentity eq 'account' and createdon ge A and createdon le B");
    expect(() => traceWindowFilter("account' or 1 eq 1", "A", "B")).toThrow();
    expect(() => jobsFilter("x", "A", "B")).toThrow();
    expect(correlationFilter([G(1), "junk", G(1).toUpperCase()], "A", "B")).toBe(`(correlationid eq ${G(1)}) and createdon ge A and createdon le B`);
    expect(correlationFilter(["junk"], "A", "B")).toBeNull();
  });
});

describe("pickCorrelations", () => {
  const rows = [
    { correlationid: G(1), requestid: G(9), messagename: "Update" },
    { correlationid: G(2), requestid: null, messagename: "Update" },
    { correlationid: G(3), requestid: null, messagename: "Retrieve" },
  ];
  it("is exact when the response's request id is on a trace", () => {
    expect(pickCorrelations({ windowRows: rows, jobs: [], requestIds: [G(9)], messageNames: ["Update"] })).toEqual({ ids: [G(1)], exact: true });
  });
  it("is exact through the record's own system jobs", () => {
    expect(pickCorrelations({ windowRows: rows, jobs: [{ correlationid: G(5) }], requestIds: [], messageNames: ["Update"] })).toEqual({ ids: [G(5)], exact: true });
  });
  it("falls back to the table's traces in the window, for the save's messages only", () => {
    expect(pickCorrelations({ windowRows: rows, jobs: [], requestIds: [], messageNames: ["Update"] })).toEqual({ ids: [G(1), G(2)], exact: false });
  });
});

describe("traces → chains", () => {
  it("reads the exception message and the class name", () => {
    expect(exceptionLine("Unhandled exception: \nException type: X\nMessage: Revenue can't drop.\nDetail: y")).toBe("Revenue can't drop.");
    expect(exceptionLine("Plain failure\nmore")).toBe("Plain failure");
    expect(exceptionLine(null)).toBe("");
    expect(shortType("Contoso.Plugins.AccountValidate, Contoso.Plugins, Version=1.0")).toBe("AccountValidate");
  });
  it("groups by correlation, in execution order, with the step's stage", () => {
    const chains = buildChains([
      { plugintracelogid: "b", correlationid: G(1), typename: "A.Post", depth: 1, mode: 0, pluginstepid: G(21), performanceexecutionstarttime: "2026-10-14T10:00:02Z" },
      { plugintracelogid: "a", correlationid: G(1), typename: "A.Pre", depth: 1, mode: 0, pluginstepid: G(20), performanceexecutionstarttime: "2026-10-14T10:00:01Z" },
      { plugintracelogid: "c", correlationid: G(1), typename: "A.Async", depth: 1, mode: 1, performanceexecutionstarttime: "2026-10-14T10:00:09Z", exceptiondetails: "Message: boom" },
    ], { [G(20)]: { stage: 10 }, [G(21)]: { stage: 40 } });
    expect(chains).toHaveLength(1);
    expect(chains[0].nodes.map(n => [n.type, n.stage])).toEqual([["Pre", "Pre-validation"], ["Post", "Post-operation"], ["Async", "Asynchronous"]]);
    expect(chains[0].failed).toBe(true);
  });
});

describe("jobs and flows", () => {
  it("maps system job states", () => {
    expect([{ statecode: 0 }, { statecode: 1 }, { statecode: 2 }, { statecode: 3, statuscode: 30 }, { statecode: 3, statuscode: 31 }, { statecode: 3, statuscode: 32 }].map(jobState))
      .toEqual(["pending", "waiting", "running", "succeeded", "failed", "canceled"]);
  });
  it("finds the flow id behind a registration, suffix or not", () => {
    expect(flowIdOf({ name: G(5) + ":MTA" })).toBe(G(5));
    expect(flowIdOf({ name: "legacy registration" })).toBeNull();
  });
  it("tells whether the trigger fires for this save", () => {
    const upd = { kind: "update", ok: true, columns: ["telephone1", "parentcustomerid_account"] };
    expect(flowVerdict({ message: 3, filteringattributes: "telephone1" }, upd).verdict).toBe("yes");
    expect(flowVerdict({ message: 3, filteringattributes: "parentcustomerid" }, upd).verdict).toBe("yes");
    expect(flowVerdict({ message: 3, filteringattributes: "ownerid, revenue" }, upd)).toMatchObject({ verdict: "no", columns: ["ownerid", "revenue"] });
    expect(flowVerdict({ message: 1 }, upd)).toMatchObject({ verdict: "no", reason: "triggers when a row is added" });
    expect(flowVerdict({ message: 4 }, { kind: "create", ok: true }).verdict).toBe("yes");
    expect(flowVerdict({ message: 3, filterexpression: "statecode eq 0" }, upd).verdict).toBe("maybe");
    expect(flowVerdict({ message: 3, scope: 1 }, upd).verdict).toBe("maybe");
    expect(flowVerdict({ message: 7 }, { kind: "update", ok: false, columns: [] }).verdict).toBe("no");
    expect(flowVerdict({ message: 7 }, { kind: "action", ok: true }).verdict).toBe("no");
  });
  it("matches the first run of that flow in the window", () => {
    const runs = [
      { _workflow_value: G(5), starttime: "2026-10-14T10:00:30Z", status: "Succeeded" },
      { _workflow_value: G(5), starttime: "2026-10-14T10:00:10Z", status: "Failed" },
      { _workflow_value: G(6), starttime: "2026-10-14T10:00:05Z" },
    ];
    expect(matchRun(runs, G(5), Date.parse("2026-10-14T10:00:00Z"), Date.parse("2026-10-14T10:05:00Z")).status).toBe("Failed");
    expect(matchRun(runs, G(5), Date.parse("2026-10-14T10:01:00Z"), Date.parse("2026-10-14T10:05:00Z"))).toBeNull();
  });
  it("keeps refreshing only while something will still happen", () => {
    expect(isPending({ jobs: [{ statecode: 2 }], flows: [] })).toBe(true);
    expect(isPending({ jobs: [], flows: [{ verdict: "yes", run: null }] })).toBe(true);
    expect(isPending({ jobs: [], flows: [{ verdict: "maybe", run: null }] })).toBe(false);
    expect(isPending({ jobs: [], flows: [{ verdict: "maybe", run: { status: "Running" } }] })).toBe(true);
    expect(isPending({ jobs: [{ statecode: 3, statuscode: 30 }], flows: [{ verdict: "yes", run: { status: "Succeeded" } }] })).toBe(false);
    expect([0, 1, 2, 3, 9].map(nextDelay)).toEqual([2000, 5000, 10000, 30000, 30000]);
  });
});

describe("loader on the demo org", () => {
  const setup = (elapsedMs) => {
    const startedAt = Date.parse("2026-10-14T10:00:00Z");
    const now = startedAt + elapsedMs;
    const demo = createActivityDemo({ recordId: ID, startedAt, clock: () => now });
    const loader = createActivityLoader(demo.query);
    const saves = savesForRecord(demo.saves, "accounts", ID);
    return { loader, saves, now };
  };
  it("lists the saves of the record, newest first", () => {
    expect(setup(0).saves.map(s => s.key)).toEqual(["demo-1", "demo-2", "demo-3"]);
  });
  it("a successful save: its exact chain with the cascade, its job, its flows", async () => {
    const { loader, saves, now } = setup(1000);
    const a = await loader.load(saves[0], { entity: "account", recordId: ID, now });
    expect(a.exact).toBe(true);
    expect(a.chains).toHaveLength(1);
    expect(a.chains[0].nodes.map(n => n.type)).toEqual(["AccountValidate", "ContactAddressSync", "ContactAddressSync", "ContactAddressSync", "AccountRollup"]);
    expect(a.chains[0].nodes[0].stage).toBe("Pre-validation");
    expect(a.jobs.map(jobState)).toEqual(["running"]);
    expect(a.flows.map(f => [f.name, f.verdict])).toEqual([
      ["Notify finance when revenue changes", "yes"], ["Sync account address to the ERP", "yes"],
      ["Key account review", "maybe"], ["Owner change alert", "no"], ["Welcome pack for new accounts", "no"],
    ]);
    expect(a.flows[0].run.status).toBe("Succeeded");
    expect(a.flows[1].run.status).toBe("Running");
    expect(a.pending).toBe(true);
  });
  it("later, the asynchronous plug-in has run and nothing is pending", async () => {
    const { loader, saves, now } = setup(13000);
    const a = await loader.load(saves[0], { entity: "account", recordId: ID, now });
    expect(a.chains[0].nodes.at(-1)).toMatchObject({ type: "SyncToErp", async: true });
    expect(a.pending).toBe(false);
  });
  it("a failed save: the exception, and no flow can trigger", async () => {
    const { loader, saves, now } = setup(1000);
    const a = await loader.load(saves[1], { entity: "account", recordId: ID, now, next: saves[0] });
    expect(a.chains[0].nodes[0].error).toBe("Revenue can't drop below the signed contracts total (12,000,000).");
    expect(a.flows.every(f => f.verdict === "no")).toBe(true);
    expect((await loader.traceDetail(a.chains[0].nodes[0].id)).trace).toMatch(/rejecting the save/);
  });
  it("a quiet save: no plug-in, only the flows that won't run and the one that may", async () => {
    const { loader, saves, now } = setup(1000);
    const a = await loader.load(saves[2], { entity: "account", recordId: ID, now, next: saves[1] });
    expect(a.chains).toEqual([]);
    expect(a.flows.filter(f => f.verdict !== "no").map(f => f.id)).toEqual([DEMO_ACTIVITY_IDS.f5]);
    expect(a.pending).toBe(false);
  });
  it("never credits a later save's job to an earlier one", async () => {
    const { loader, saves, now } = setup(1000);
    const a = await loader.load(saves[1], { entity: "account", recordId: ID, now, next: saves[0] });
    expect(a.jobs).toEqual([]);
    expect(a.chains.map(c => c.correlationId)).toEqual([DEMO_ACTIVITY_IDS.c2]);
  });
  it("reports a part that fails instead of hiding it", async () => {
    const loader = createActivityLoader(async (set) => { if (set === "callbackregistrations") throw new Error("HTTP 403: no read"); return { records: [] }; });
    const a = await loader.load({ kind: "update", t0: 1, t1: 2, columns: [] }, { entity: "account", recordId: ID, now: 10 });
    expect(a.errors.flows).toBe("HTTP 403: no read");
    expect(a.flows).toEqual([]);
  });
});
