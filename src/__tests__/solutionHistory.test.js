import { describe, it, expect } from "vitest";
import { normalizeHistory, normalizeJobs, buildDeployments, flagsOf, deploymentSummary, versionLadder, filterDeployments, deploymentExportRows, DEPLOY_HEADERS, parseImportLog, fmtDuration, OPERATION } from "../solutionHistory.js";
import { demoSolutionHistory, demoImportJobLog } from "../solutionHistoryDemo.js";

const T0 = Date.parse("2026-10-01T10:00:00Z");
const at = (min) => new Date(T0 + min * 60000).toISOString();

describe("solution deployments - the rows", () => {
  it("normalises a history row: labels for the choices, booleans for Yes/No and Success/Failure, a duration", () => {
    const [r] = normalizeHistory([{ msdyn_solutionhistoryid: "h1", msdyn_name: "Contoso", msdyn_solutionversion: "1.2.0.0", msdyn_publishername: "Contoso Ltd", msdyn_operation: 0, msdyn_suboperation: 2, msdyn_status: 1, msdyn_result: "true", msdyn_starttime: at(0), msdyn_endtime: at(5), msdyn_totaltime: null, msdyn_ismanaged: true, msdyn_ispatch: "false", msdyn_isoverwritecustomizations: 1, msdyn_errorcode: "", msdyn_exceptionmessage: null }]);
    expect(r).toMatchObject({ id: "h1", source: "history", solution: "Contoso", version: "1.2.0.0", publisher: "Contoso Ltd", operationLabel: "Import", suboperationLabel: "Upgrade", statusLabel: "Completed", result: true, seconds: 300, managed: true, patch: false, overwrite: true, error: "" });
    expect(normalizeHistory([{ msdyn_operation: 42, msdyn_suboperation: 9, msdyn_result: null }])[0]).toMatchObject({ operationLabel: "Operation 42", suboperationLabel: "Sub-operation 9", result: null, seconds: null });
    expect(Object.keys(OPERATION)).toHaveLength(12);
    const [j] = normalizeJobs([{ importjobid: "j1", solutionname: "Contoso", startedon: at(1), completedon: at(6), createdon: at(1), progress: "100", _createdby_value: "U1", "_createdby_value@OData.Community.Display.V1.FormattedValue": "Zakaria" }]);
    expect(j).toMatchObject({ id: "j1", solution: "Contoso", progress: 100, by: "Zakaria", byId: "u1" });
  });
  it("joins each import to the job started closest to it (same solution, within 15 min), once; the rest become import-job rows", () => {
    const history = [
      { msdyn_solutionhistoryid: "h1", msdyn_name: "Contoso", msdyn_operation: 0, msdyn_suboperation: 3, msdyn_status: 1, msdyn_result: true, msdyn_starttime: at(0), msdyn_endtime: at(4) },
      { msdyn_solutionhistoryid: "h2", msdyn_name: "Contoso", msdyn_operation: 0, msdyn_suboperation: 3, msdyn_status: 1, msdyn_result: false, msdyn_starttime: at(60), msdyn_endtime: at(61), msdyn_errorcode: "0x1", msdyn_exceptionmessage: "boom" },
      { msdyn_solutionhistoryid: "h3", msdyn_name: "Contoso", msdyn_operation: 2, msdyn_status: 1, msdyn_result: true, msdyn_starttime: at(30), msdyn_endtime: at(31) },
      { msdyn_solutionhistoryid: "h4", msdyn_name: "Other", msdyn_operation: 0, msdyn_suboperation: 1, msdyn_status: 1, msdyn_result: true, msdyn_starttime: at(0), msdyn_endtime: at(2) },
    ];
    const jobs = [
      { importjobid: "j1", solutionname: "contoso", startedon: at(2), completedon: at(4), progress: 100, "_createdby_value@OData.Community.Display.V1.FormattedValue": "Zakaria" },
      { importjobid: "j2", solutionname: "Contoso", startedon: at(58), completedon: at(61), progress: 20, "_createdby_value@OData.Community.Display.V1.FormattedValue": "Alex" },
      { importjobid: "j3", solutionname: "Contoso", startedon: at(-3000), completedon: at(-2990), progress: 100, "_createdby_value@OData.Community.Display.V1.FormattedValue": "Paul" },
      { importjobid: "j4", solutionname: "Other", startedon: at(40), completedon: null, progress: 50, "_createdby_value@OData.Community.Display.V1.FormattedValue": "Paul" },
    ];
    const r = buildDeployments({ history, jobs });
    expect(r.matched).toBe(2);
    expect(r.orphanJobs).toBe(2);
    expect(r.rows.map(x => x.id)).toEqual(["h2", "job:j4", "h3", "h1", "h4", "job:j3"]); // newest first
    const by = Object.fromEntries(r.rows.map(x => [x.id, x]));
    expect(by.h1).toMatchObject({ by: "Zakaria", matchMinutes: 2 });
    expect(by.h2).toMatchObject({ by: "Alex", result: false });
    expect(by.h2.flags[0]).toEqual({ level: "error", text: "Failed (0x1): boom" });
    expect(by.h3.job).toBe(null); // an export has no import job
    expect(by.h4.by).toBe(""); // j4 is 40 min away: not the same import
    expect(by["job:j3"]).toMatchObject({ source: "importjob", operationLabel: "Import", result: true, by: "Paul", seconds: 600 });
    expect(by["job:j3"].flags.map(f => f.level)).toEqual(["info"]);
    expect(by["job:j4"]).toMatchObject({ result: null, end: null, statusLabel: "Started" });
    expect(by["job:j4"].flags.map(f => f.text)).toEqual(["Started, never completed (still running, or interrupted)", "Import job only — no history row (purged after 180 days, or not recorded)"]);
    expect(buildDeployments({})).toEqual({ rows: [], matched: 0, orphanJobs: 0 });
  });
  it("flags what matters: overwrite, long runs; durations read well", () => {
    expect(flagsOf({ result: true, overwrite: true, status: 1, end: at(1), seconds: 3700 }).map(f => [f.level, f.text])).toEqual([["warn", "Overwrote unmanaged customizations"], ["info", "Took 1 h 1 min"]]);
    expect(flagsOf({ result: true, status: 2 })).toEqual([{ level: "info", text: "Queued" }]);
    expect(fmtDuration(45)).toBe("45 s");
    expect(fmtDuration(125)).toBe("2 min 5 s");
    expect(fmtDuration(null)).toBe("");
  });
});

describe("solution deployments - summary, ladder, filters, export, the demo", () => {
  const demo = demoSolutionHistory();
  const { rows } = buildDeployments(demo);
  it("sums up the org and ladders each solution's versions with its current one", () => {
    const s = deploymentSummary(rows);
    expect(s).toMatchObject({ total: 18, imports: 13, exports: 2, uninstalls: 1, failures: 1, overwrites: 1, solutions: 6 });
    expect(s.byKnown).toBe(11);
    const ladder = versionLadder(rows);
    const colvio = ladder.find(g => g.solution === "ColvioDemo");
    expect(colvio).toMatchObject({ publisher: "Contoso", current: "1.0.0.5", imports: 8, failures: 1, removed: false });
    expect(colvio.entries.filter(e => e.version).map(e => e.version).slice(0, 4)).toEqual(["1.0.0.5", "1.0.0.5", "1.0.0.4", "1.0.0.3"]);
    expect(colvio.entries.filter(e => e.source === "importjob")).toHaveLength(2);
    expect(colvio.entries.every(e => "status" in e && "end" in e)).toBe(true); // the Result chip reads the row, not a guess
    const legacy = ladder.find(g => g.solution === "ContosoLegacyReports");
    expect(legacy).toMatchObject({ removed: true, current: "" });
    expect(legacy.entries[0].operationLabel).toBe("Uninstall");
    expect(ladder[0].solution).toBe("ContosoHotfix"); // the most recent activity first
  });
  it("filters by period, operation, result, solution and text", () => {
    expect(filterDeployments(rows, { operation: "main" })).toHaveLength(16); // Publish and Publish all are noise
    expect(filterDeployments(rows, { operation: "all" })).toHaveLength(18);
    expect(filterDeployments(rows, { operation: 2 })).toHaveLength(2);
    expect(filterDeployments(rows, { result: "failed" }).map(r => r.version)).toEqual(["1.0.0.5"]);
    expect(filterDeployments(rows, { days: 7, operation: "all" })).toHaveLength(5);
    expect(filterDeployments(rows, { days: 7 })).toHaveLength(4);
    expect(filterDeployments(rows, { solution: "customerinsights" })).toHaveLength(1);
    expect(filterDeployments(rows, { q: "new_region" })).toHaveLength(1);
    expect(filterDeployments(rows, { q: "alex" }).every(r => r.by === "Alex Baker")).toBe(true);
    expect(filterDeployments(null, {})).toEqual([]);
  });
  it("exports one line per row with the headers' width", () => {
    const x = deploymentExportRows(rows);
    expect(x).toHaveLength(18);
    expect(x[0]).toHaveLength(DEPLOY_HEADERS.length);
    const failed = x.find(l => l[8] === "Failure");
    expect(failed[3]).toBe("ColvioDemo");
    expect(failed[14]).toBe("0x80048027");
    expect(x.find(l => l[16] === "Import job")[10]).toBe("Zakaria Missoum");
  });
  it("reads an import log: the solution, its result and the components that failed", () => {
    const ok = parseImportLog(demoImportJobLog("x").data);
    expect(ok).toMatchObject({ solution: "ColvioDemo", version: "1.0.0.5", ok: true, failures: [] });
    const bad = parseImportLog(demoImportJobLog("0000000d-0000-4000-c000-000000000502").data);
    expect(bad.ok).toBe(false);
    expect(bad.failures.map(f => f.errorText)).toEqual(["The solution depends on the column new_region on the account table, which is missing in the target environment.", "Attribute new_region not found on entity account"]);
    expect(parseImportLog("")).toBe(null);
    expect(parseImportLog("<importexportxml/>")).toMatchObject({ results: 0, ok: false });
  });
});
