// Solutions › 🚀 Deployments — every solution operation the environment recorded, with its
// date, version, result, duration and who started it. Two sources, joined here:
//  - Dataverse's solution history (msdyn_solutionhistory, a virtual table): import / uninstall /
//    export / publish… with the sub-operation (new, upgrade, update, delete), start and end, the
//    result and its error; purged by Dataverse after 180 days; it does NOT say who did it;
//  - the import jobs (importjob): one row per import, with the user who started it, its start,
//    end and progress; kept longer, with the detailed log.
// Pure: labels, normalisation, the history ↔ import-job match, summary, ladder, filters, export.

const lc = (v) => (v == null ? "" : String(v).toLowerCase());
const num = (v) => (v == null || v === "" || Number.isNaN(Number(v)) ? null : Number(v));
const ms = (iso) => { const t = iso ? Date.parse(iso) : NaN; return Number.isNaN(t) ? null : t; };

export const OPERATION = { 0: "Import", 1: "Uninstall", 2: "Export", 3: "Publish", 4: "Publish all", 5: "Language provision", 6: "Import translation", 7: "Ribbon metadata generation", 8: "Workflow set state", 9: "None", 10: "Export (lite)", 11: "Updating missing packages" };
export const SUBOPERATION = { 0: "", 1: "New", 2: "Upgrade", 3: "Update", 4: "Delete", 5: "Inline upgrade", 6: "Waiting for missing packages", 7: "Installed missing packages", 8: "Failed installing missing packages" };
export const STATUS = { 0: "Started", 1: "Completed", 2: "Queued" };
// the operations worth a deployment timeline by default (the rest — publish all, ribbon
// generation… — is noise unless asked for)
export const MAIN_OPERATIONS = new Set([0, 1, 2, 10, 6, 11]);

const boolOf = (v) => (v === true || v === "true" || v === 1 || v === "1" ? true : v === false || v === "false" || v === 0 || v === "0" ? false : null);

// one msdyn_solutionhistory row → a deployment row
export function normalizeHistory(rows) {
  return (rows || []).map(r => {
    const start = r.start ?? r.msdyn_starttime ?? null, end = r.end ?? r.msdyn_endtime ?? null;
    const secs = num(r.seconds ?? r.msdyn_totaltime);
    const op = num(r.operation ?? r.msdyn_operation), sub = num(r.suboperation ?? r.msdyn_suboperation), st = num(r.status ?? r.msdyn_status);
    return {
      id: r.id || r.msdyn_solutionhistoryid || "", source: "history",
      solution: r.solution || r.msdyn_name || "", version: r.version || r.msdyn_solutionversion || "", publisher: r.publisher || r.msdyn_publishername || "",
      operation: op, operationLabel: OPERATION[op] || (op == null ? "" : `Operation ${op}`),
      suboperation: sub, suboperationLabel: SUBOPERATION[sub] ?? (sub == null ? "" : `Sub-operation ${sub}`),
      status: st, statusLabel: STATUS[st] || "",
      result: boolOf(r.result ?? r.msdyn_result),
      start, end, seconds: secs != null ? secs : (ms(start) != null && ms(end) != null ? Math.max(0, Math.round((ms(end) - ms(start)) / 1000)) : null),
      managed: boolOf(r.managed ?? r.msdyn_ismanaged), patch: boolOf(r.patch ?? r.msdyn_ispatch), overwrite: boolOf(r.overwrite ?? r.msdyn_isoverwritecustomizations),
      errorCode: String(r.errorCode ?? r.msdyn_errorcode ?? ""), error: String(r.error ?? r.msdyn_exceptionmessage ?? ""),
      activityId: String(r.activityId ?? r.msdyn_activityid ?? ""), correlationId: String(r.correlationId ?? r.msdyn_correlationid ?? ""),
      solutionId: lc(r.solutionId ?? r.msdyn_solutionid ?? ""), packageName: String(r.packageName ?? r.msdyn_packagename ?? ""), packageVersion: String(r.packageVersion ?? r.msdyn_packageversion ?? ""),
      description: String(r.description ?? r.msdyn_solutionhistorydescription ?? ""),
    };
  });
}

// one importjob row → { id, solution, name, started, completed, created, progress, by, byId, onBehalfOf, context }
export function normalizeJobs(rows) {
  return (rows || []).map(j => ({
    id: j.id || j.importjobid || "", solution: j.solution || j.solutionname || "", name: j.name || "",
    started: j.started ?? j.startedon ?? null, completed: j.completed ?? j.completedon ?? null, created: j.created ?? j.createdon ?? null,
    progress: num(j.progress), by: j.by || j["_createdby_value@OData.Community.Display.V1.FormattedValue"] || "", byId: lc(j.byId || j._createdby_value || ""),
    onBehalfOf: j.onBehalfOf || j["_createdonbehalfby_value@OData.Community.Display.V1.FormattedValue"] || "", context: String(j.context ?? j.operationcontext ?? ""), importContext: String(j.importContext ?? j.importcontext ?? ""),
  }));
}

export const MATCH_WINDOW_MS = 15 * 60 * 1000;

// The timeline: history rows (imports joined to the import job that started closest to them —
// same solution, within 15 min — for the "who"), plus the import jobs no history row covers
// (older than Dataverse's 180-day purge, or an import the history missed), sorted newest first.
export function buildDeployments({ history, jobs } = {}) {
  const rows = normalizeHistory(history);
  const jobRows = normalizeJobs(jobs);
  const free = new Set(jobRows.map(j => j.id));
  const bySolution = new Map();
  for (const j of jobRows) { const k = lc(j.solution); if (!bySolution.has(k)) bySolution.set(k, []); bySolution.get(k).push(j); }
  // imports first, newest first, so each job goes to the row it belongs to
  const imports = rows.filter(r => r.operation === 0).sort((a, b) => (ms(b.start) || 0) - (ms(a.start) || 0));
  for (const r of imports) {
    const t = ms(r.start);
    let best = null, bestD = Infinity;
    for (const j of bySolution.get(lc(r.solution)) || []) {
      if (!free.has(j.id)) continue;
      const jt = ms(j.started) ?? ms(j.created);
      const d = t != null && jt != null ? Math.abs(jt - t) : Infinity;
      if (d < bestD) { best = j; bestD = d; }
    }
    if (best && bestD <= MATCH_WINDOW_MS) { free.delete(best.id); r.job = best; r.by = best.by; r.matchMinutes = Math.round(bestD / 60000); }
  }
  for (const r of rows) { if (!("job" in r)) { r.job = null; r.by = ""; } r.flags = flagsOf(r); }
  const orphans = jobRows.filter(j => free.has(j.id)).map(j => {
    const start = j.started || j.created, end = j.completed;
    const r = {
      id: `job:${j.id}`, source: "importjob", solution: j.solution, version: "", publisher: "",
      operation: 0, operationLabel: "Import", suboperation: null, suboperationLabel: "", status: end ? 1 : 0, statusLabel: end ? "Completed" : "Started",
      result: end ? (j.progress != null && j.progress >= 100 ? true : null) : null,
      start, end, seconds: ms(start) != null && ms(end) != null ? Math.max(0, Math.round((ms(end) - ms(start)) / 1000)) : null,
      managed: null, patch: null, overwrite: null, errorCode: "", error: "", activityId: "", correlationId: "", solutionId: "", packageName: "", packageVersion: "", description: "",
      job: j, by: j.by, progress: j.progress,
    };
    r.flags = flagsOf(r);
    return r;
  });
  const all = [...rows, ...orphans].sort((a, b) => (ms(b.start) || 0) - (ms(a.start) || 0) || String(a.solution).localeCompare(String(b.solution)));
  return { rows: all, matched: rows.filter(r => r.job).length, orphanJobs: orphans.length };
}

// what to say about a row: a failure (with its error), customizations overwritten, still running, a long one
export function flagsOf(r) {
  const out = [];
  if (r.result === false) out.push({ level: "error", text: `Failed${r.errorCode ? ` (${r.errorCode})` : ""}${r.error ? `: ${String(r.error).replace(/\s+/g, " ").slice(0, 160)}` : ""}` });
  if (r.overwrite === true) out.push({ level: "warn", text: "Overwrote unmanaged customizations" });
  if (r.status === 0 && !r.end) out.push({ level: "warn", text: "Started, never completed (still running, or interrupted)" });
  if (r.status === 2) out.push({ level: "info", text: "Queued" });
  if (r.source === "importjob") out.push({ level: "info", text: r.result == null && r.end ? `Import job only — no history row (purged after 180 days, or not recorded); progress ${r.progress != null ? r.progress + "%" : "unknown"}` : "Import job only — no history row (purged after 180 days, or not recorded)" });
  if (r.seconds != null && r.seconds >= 1800) out.push({ level: "info", text: `Took ${fmtDuration(r.seconds)}` });
  return out;
}

export const fmtDuration = (s) => {
  if (s == null) return "";
  if (s < 60) return `${Math.round(s)} s`;
  if (s < 3600) return `${Math.floor(s / 60)} min ${Math.round(s % 60)} s`;
  return `${Math.floor(s / 3600)} h ${Math.floor((s % 3600) / 60)} min`;
};

export function deploymentSummary(rows) {
  const s = { total: 0, imports: 0, exports: 0, uninstalls: 0, failures: 0, overwrites: 0, solutions: 0, byKnown: 0, last: null, oldest: null };
  const sols = new Set();
  for (const r of rows || []) {
    s.total++;
    if (r.operation === 0) s.imports++;
    if (r.operation === 2 || r.operation === 10) s.exports++;
    if (r.operation === 1) s.uninstalls++;
    if (r.result === false) s.failures++;
    if (r.overwrite === true) s.overwrites++;
    if (r.by) s.byKnown++;
    if (r.solution) sols.add(lc(r.solution));
    const t = ms(r.start);
    if (t != null) { if (s.last == null || t > s.last) s.last = t; if (s.oldest == null || t < s.oldest) s.oldest = t; }
  }
  s.solutions = sols.size;
  return s;
}

// Per solution: its versions in the order they arrived (imports, newest first), the current
// one (the last successful import), and how many times it was deployed / failed.
export function versionLadder(rows) {
  const by = new Map();
  for (const r of rows || []) {
    if (!r.solution) continue;
    const k = lc(r.solution);
    if (!by.has(k)) by.set(k, { solution: r.solution, publisher: r.publisher || "", managed: null, entries: [], imports: 0, failures: 0, last: null, current: "" });
    const g = by.get(k);
    if (!g.publisher && r.publisher) g.publisher = r.publisher;
    if (g.managed == null && r.managed != null) g.managed = r.managed;
    if (r.operation !== 0 && r.operation !== 1) continue;
    g.entries.push({ id: r.id, operation: r.operation, operationLabel: r.operationLabel, version: r.version, suboperationLabel: r.suboperationLabel, start: r.start, result: r.result, by: r.by, managed: r.managed, patch: r.patch, overwrite: r.overwrite, source: r.source });
    if (r.operation === 0) { g.imports++; if (r.result === false) g.failures++; }
    const t = ms(r.start);
    if (t != null && (g.last == null || t > g.last)) g.last = t;
  }
  for (const g of by.values()) {
    g.entries.sort((a, b) => (ms(b.start) || 0) - (ms(a.start) || 0));
    const ok = g.entries.find(e => e.operation === 0 && e.result === true && e.version);
    const removed = g.entries[0]?.operation === 1 && g.entries[0].result !== false;
    g.current = removed ? "" : (ok?.version || "");
    g.removed = removed;
  }
  return [...by.values()].sort((a, b) => (b.last || 0) - (a.last || 0) || a.solution.localeCompare(b.solution));
}

// filters: q (solution / version / by / error), operation ("all" | "main" | number), result
// ("all" | "ok" | "failed"), days (0 = all), solution (unique name)
export function filterDeployments(rows, { q = "", operation = "main", result = "all", days = 0, solution = "" } = {}, now = Date.now()) {
  const s = q.trim().toLowerCase();
  const since = days > 0 ? now - days * 86400000 : null;
  return (rows || []).filter(r => {
    if (operation === "main" ? !MAIN_OPERATIONS.has(r.operation) : operation !== "all" && r.operation !== Number(operation)) return false;
    if (result === "ok" && r.result !== true) return false;
    if (result === "failed" && r.result !== false) return false;
    if (since != null) { const t = ms(r.start); if (t == null || t < since) return false; }
    if (solution && lc(r.solution) !== lc(solution)) return false;
    if (s && ![r.solution, r.version, r.publisher, r.by, r.operationLabel, r.suboperationLabel, r.error, r.errorCode].some(v => lc(v).includes(s))) return false;
    return true;
  });
}

export const DEPLOY_HEADERS = ["Start", "End", "Duration (s)", "Solution", "Version", "Publisher", "Operation", "Sub-operation", "Result", "Status", "By", "Managed", "Patch", "Overwrote customizations", "Error code", "Error", "Source", "Activity id"];
export const deploymentExportRows = (rows) => (rows || []).map(r => [r.start || "", r.end || "", r.seconds ?? "", r.solution, r.version, r.publisher, r.operationLabel, r.suboperationLabel, r.result === true ? "Success" : r.result === false ? "Failure" : "", r.statusLabel, r.by, r.managed == null ? "" : r.managed ? "Yes" : "No", r.patch == null ? "" : r.patch ? "Yes" : "No", r.overwrite == null ? "" : r.overwrite ? "Yes" : "No", r.errorCode, r.error, r.source === "importjob" ? "Import job" : "Solution history", r.activityId]);

// The import job's log (importexportxml): the overall result and the components that failed.
export function parseImportLog(xml) {
  const s = String(xml || "");
  if (!s.trim()) return null;
  const results = [];
  const RE = /<result\b([^>]*)\/?>/g;
  let m;
  while ((m = RE.exec(s))) {
    const at = (k) => { const a = new RegExp(`\\b${k}="([^"]*)"`, "i").exec(m[1]); return a ? a[1].replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&") : ""; };
    results.push({ result: lc(at("result")), errorCode: at("errorcode"), errorText: at("errortext"), datetime: at("datetime") });
  }
  const failures = results.filter(r => r.result === "failure" || (r.errorCode && r.errorCode !== "0"));
  const solution = /<solutionManifest\b[^>]*>[\s\S]*?<UniqueName>([^<]*)<\/UniqueName>/i.exec(s)?.[1] || /<solutionManifest\b[^>]*\bUniqueName="([^"]*)"/i.exec(s)?.[1] || "";
  const version = /<solutionManifest\b[\s\S]*?<Version>([^<]*)<\/Version>/i.exec(s)?.[1] || "";
  return { solution, version, results: results.length, failures, ok: results.length > 0 && failures.length === 0, bytes: s.length };
}
