// Record activity — pure helpers for "what did this save trigger?": the server-time window of a
// save, the OData filters that find its plug-in traces / jobs / flow runs, plug-in execution
// chains, the verdict per cloud flow (will / may / won't trigger) and the refresh pacing.

const GUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;
export const isGuid = (v) => GUID_RE.test(String(v || ""));

export const TRACE_SETTING = { 0: "Off", 1: "Exceptions only", 2: "All" };
export const STAGE_LABEL = { 10: "Pre-validation", 20: "Pre-operation", 30: "Main operation", 40: "Post-operation", 50: "Post-operation" };
export const SYNC_MARGIN_MS = 3000;          // browser ↔ server clock (the Date header has 1 s resolution) + latency
export const ASYNC_WINDOW_MS = 15 * 60000;   // async plug-ins, jobs and flows looked for up to 15 min after the save
export const REFRESH_LIMIT_MS = 10 * 60000;  // auto-refresh stops 10 min after the save
const DELAYS = [2000, 5000, 10000, 30000];
export const nextDelay = (attempt) => DELAYS[Math.min(Math.max(0, attempt | 0), DELAYS.length - 1)];

// The save in SERVER time. The response's Date header gives the server clock at the end of the
// request; the browser's clock can be off by seconds, which would miss the traces entirely.
export function saveWindow(save) {
  const t0 = Number(save?.t0) || 0;
  const t1 = Number(save?.t1) || t0;
  const skew = Number.isFinite(save?.serverMs) ? save.serverMs - t1 : 0;
  const start = t0 + skew;
  const end = t1 + skew + 1000; // Date is floored to the second
  return {
    fromMs: start - SYNC_MARGIN_MS,
    syncToMs: end + SYNC_MARGIN_MS,
    asyncToMs: start + ASYNC_WINDOW_MS,
    from: new Date(start - SYNC_MARGIN_MS).toISOString(),
    syncTo: new Date(end + SYNC_MARGIN_MS).toISOString(),
    asyncTo: new Date(start + ASYNC_WINDOW_MS).toISOString(),
  };
}

// The plug-in messages a save can fire on its table.
export function messageNamesFor(save) {
  const cols = (save?.columns || []).map(c => String(c).toLowerCase());
  switch (save?.kind) {
    case "create": return ["Create"];
    case "delete": return ["Delete"];
    case "action": return save.action ? [save.action] : [];
    case "associate": return ["Associate"];
    case "disassociate": return ["Disassociate"];
    default: {
      const out = ["Update"];
      if (cols.includes("statecode") || cols.includes("statuscode")) out.push("SetState", "SetStateDynamicEntity");
      if (cols.includes("ownerid")) out.push("Assign");
      return out;
    }
  }
}

// OData filters — every interpolated value validated (names / GUIDs), dates are ISO literals.
export function traceWindowFilter(entityLogical, fromIso, toIso) {
  if (!NAME_RE.test(String(entityLogical || ""))) throw new Error(`Invalid table name: ${entityLogical}`);
  return `primaryentity eq '${entityLogical}' and createdon ge ${fromIso} and createdon le ${toIso}`;
}
export function correlationFilter(ids, fromIso, toIso) {
  const ok = [...new Set((ids || []).filter(isGuid).map(s => s.toLowerCase()))].slice(0, 10);
  if (!ok.length) return null;
  return `(${ok.map(id => `correlationid eq ${id}`).join(" or ")}) and createdon ge ${fromIso} and createdon le ${toIso}`;
}
export function jobsFilter(recordId, fromIso, toIso) {
  if (!isGuid(recordId)) throw new Error(`Invalid record id: ${recordId}`);
  return `_regardingobjectid_value eq ${recordId} and createdon ge ${fromIso} and createdon le ${toIso}`;
}
export function stepsFilter(stepIds) {
  const ok = [...new Set((stepIds || []).filter(isGuid).map(s => s.toLowerCase()))].slice(0, 40);
  return ok.length ? ok.map(id => `sdkmessageprocessingstepid eq ${id}`).join(" or ") : null;
}

// Which execution chains belong to this save. Exact when the response's request id is found on a
// trace, or through the record's own system jobs; otherwise by time on the table (another save of
// the same table in the same seconds would then show up too — the UI says so).
export function pickCorrelations({ windowRows, jobs, requestIds, messageNames, syncToMs }) {
  const req = new Set((requestIds || []).map(s => String(s).toLowerCase()));
  const ids = new Set();
  let exact = false;
  for (const r of windowRows || []) {
    if (r.requestid && req.has(String(r.requestid).toLowerCase()) && r.correlationid) { ids.add(String(r.correlationid).toLowerCase()); exact = true; }
  }
  // A job seeds a chain only when it is this save's: its request id matches, or it was created
  // inside the save's own synchronous window — a job from someone else's later save of the same
  // record must not be credited here as "exact".
  for (const j of jobs || []) {
    if (!j.correlationid) continue;
    const mine = (j.requestid && req.has(String(j.requestid).toLowerCase())) || syncToMs == null || !(Date.parse(j.createdon) > syncToMs);
    if (mine) { ids.add(String(j.correlationid).toLowerCase()); exact = true; }
  }
  if (!exact) {
    const names = new Set((messageNames || []).map(s => s.toLowerCase()));
    for (const r of windowRows || []) {
      if (r.correlationid && (!names.size || names.has(String(r.messagename || "").toLowerCase()))) ids.add(String(r.correlationid).toLowerCase());
    }
  }
  return { ids: [...ids], exact };
}

// "Unhandled exception: … Message: Credit limit can't exceed 500,000 …" → the message line.
export function exceptionLine(details) {
  const s = String(details || "");
  if (!s.trim()) return "";
  const m = s.match(/(?:^|\n)\s*Message:\s*(.+)/i);
  const line = (m ? m[1] : s.split(/\r?\n/).find(l => l.trim()) || "").trim();
  return line.length > 300 ? line.slice(0, 297) + "…" : line;
}
export const shortType = (typename) => String(typename || "").split(",")[0].split(".").pop() || String(typename || "");

// Trace rows (+ their steps) → execution chains, in execution order.
export function buildChains(rows, steps = {}) {
  const by = new Map();
  for (const r of rows || []) {
    const cid = String(r.correlationid || "none").toLowerCase();
    if (!by.has(cid)) by.set(cid, []);
    by.get(cid).push(r);
  }
  const t = (r) => Date.parse(r.performanceexecutionstarttime || r.createdon) || 0;
  const chains = [];
  for (const [cid, list] of by) {
    const nodes = list.slice().sort((a, b) => t(a) - t(b) || (a.depth || 0) - (b.depth || 0)).map(r => {
      const step = steps[String(r.pluginstepid || "").toLowerCase()] || null;
      const async = r.mode === 1;
      return {
        id: r.plugintracelogid,
        stepId: r.pluginstepid ? String(r.pluginstepid).toLowerCase() : null,
        typename: r.typename || "",
        type: shortType(r.typename),
        message: r.messagename || "",
        entity: r.primaryentity || "",
        depth: r.depth || 1,
        async,
        stage: async ? "Asynchronous" : (step && STAGE_LABEL[step.stage]) || (r.operationtype === 2 ? "Workflow activity" : "Synchronous"),
        durationMs: typeof r.performanceexecutionduration === "number" ? r.performanceexecutionduration : null,
        at: r.performanceexecutionstarttime || r.createdon || null,
        error: exceptionLine(r.exceptiondetails),
      };
    });
    chains.push({ correlationId: cid, nodes, failed: nodes.some(n => n.error) });
  }
  return chains.sort((a, b) => (Date.parse(a.nodes[0]?.at) || 0) - (Date.parse(b.nodes[0]?.at) || 0));
}

// System jobs (asyncoperation) → a state the UI can show.
export function jobState(j) {
  const s = j?.statecode, st = j?.statuscode;
  if (s === 3) return st === 30 ? "succeeded" : st === 32 ? "canceled" : "failed";
  if (s === 2) return "running";
  if (s === 1) return "waiting";
  return "pending";
}
export const jobKind = (j) => (j?.operationtype === 1 ? "Async plug-in" : j?.operationtype === 10 ? "Workflow" : j?.["operationtype@OData.Community.Display.V1.FormattedValue"] || `Job type ${j?.operationtype ?? "?"}`);

// callbackregistration.message → the row changes that fire the flow.
const MESSAGE_KINDS = { 1: ["create"], 2: ["delete"], 3: ["update"], 4: ["create", "update"], 5: ["create", "delete"], 6: ["update", "delete"], 7: ["create", "update", "delete"] };
const MESSAGE_LABEL = { 1: "added", 2: "deleted", 3: "modified", 4: "added or modified", 5: "added or deleted", 6: "modified or deleted", 7: "added, modified or deleted" };
const SCOPE_LABEL = { 1: "rows owned by the flow's user", 2: "rows in the user's business unit", 3: "rows in the user's business unit and its children" };

// The flow id a registration belongs to: its name, sometimes with a suffix ("<guid>:MTA").
export function flowIdOf(reg) {
  const id = String(reg?.name || "").split(":")[0].trim().toLowerCase();
  return isGuid(id) ? id : null;
}

// Does a column the save sent match a trigger column? "parentcustomerid_account" (a polymorphic
// lookup's navigation property) matches "parentcustomerid".
function sentMatches(sent, attr) {
  return sent === attr || sent.startsWith(attr + "_");
}

// Will this flow's Dataverse trigger fire for this save? { verdict: "yes" | "maybe" | "no", reason }.
export function flowVerdict(reg, save) {
  const kind = save?.kind;
  const msg = Number(reg?.message);
  const fires = MESSAGE_KINDS[msg] || [];
  if (!["create", "update", "delete"].includes(kind)) return { verdict: "no", reason: "not a row change (the trigger fires on rows added, modified or deleted)" };
  if (save.ok === false) return { verdict: "no", reason: "the save failed — nothing was committed, so no flow triggers" };
  if (!fires.includes(kind)) return { verdict: "no", reason: `triggers when a row is ${MESSAGE_LABEL[msg] || "changed"}` };
  if (kind === "update") {
    const attrs = String(reg?.filteringattributes || "").split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
    if (attrs.length) {
      const sent = (save.columns || []).map(c => String(c).toLowerCase());
      const hit = attrs.filter(a => sent.some(s => sentMatches(s, a)));
      if (!hit.length) return { verdict: "no", reason: `none of its trigger columns were sent (${attrs.join(", ")}) — a plug-in could still change them`, columns: attrs };
    }
  }
  if (String(reg?.filterexpression || "").trim()) return { verdict: "maybe", reason: "depends on its row filter — Colvio doesn't evaluate it" };
  const scope = Number(reg?.scope);
  if (SCOPE_LABEL[scope]) return { verdict: "maybe", reason: "depends on who owns the row (the trigger's scope)" };
  return { verdict: "yes", reason: "" };
}

// The run that answers this save: the first run of that flow in the save's window.
export function flowIdOfRun(run) {
  const k = Object.keys(run || {}).find(k => /^_workflow.*_value$/i.test(k));
  return k && run[k] ? String(run[k]).toLowerCase() : null;
}
export function matchRun(runs, flowId, fromMs, toMs) {
  const id = String(flowId || "").toLowerCase();
  return (runs || [])
    .filter(r => flowIdOfRun(r) === id)
    .map(r => ({ r, t: Date.parse(r.starttime) || 0 }))
    .filter(x => x.t >= fromMs && x.t <= toMs)
    .sort((a, b) => a.t - b.t)[0]?.r || null;
}
export const runStatus = (run) => String(run?.status || "").toLowerCase();

// Is something still on its way? Drives the auto-refresh (bounded by REFRESH_LIMIT_MS): a job not
// finished, a run still running, or a flow that WILL trigger but has no run yet. A "maybe" flow
// with no run may simply not have matched its filter — it doesn't keep the refresh going.
export function isPending({ jobs, flows }) {
  if ((jobs || []).some(j => ["pending", "running", "waiting"].includes(jobState(j)))) return true;
  return (flows || []).some(f => (f.run ? runStatus(f.run) === "running" : f.verdict === "yes"));
}

// ── v1.11.179: jobs ↔ traces, job history, flow trigger text and links ──

// OData string literal ('' escapes a quote).
export const odataString = (s) => `'${String(s ?? "").replace(/'/g, "''")}'`;

// The plug-in executions of a save's chains: by correlation id, and by request id (an asynchronous
// plug-in's trace can carry its system job's request id or id rather than the save's correlation).
export function chainFilter({ correlationIds = [], requestIds = [] }, fromIso, toIso) {
  const c = [...new Set(correlationIds.filter(isGuid).map(s => s.toLowerCase()))].slice(0, 10);
  const r = [...new Set(requestIds.filter(isGuid).map(s => s.toLowerCase()))].slice(0, 20);
  const parts = [...c.map(id => `correlationid eq ${id}`), ...r.map(id => `requestid eq ${id}`)];
  if (!parts.length) return null;
  return `(${parts.join(" or ")}) and createdon ge ${fromIso} and createdon le ${toIso}`;
}

// "Contoso.Plugins.X: Asynchronous Post Update of account" → "Contoso.Plugins.X";
// a trace's "Contoso.Plugins.X, Contoso.Plugins, Version=…" → "Contoso.Plugins.X".
export const jobClass = (j) => String(j?.name || "").split(":")[0].trim();
export const traceClass = (r) => String(r?.typename || "").split(",")[0].trim();

// Which traces belong to which asynchronous system job: same request / correlation first, else the
// same plug-in class running inside the job's start → end window (start −5 s, end +10 s).
export function assignAsyncTraces(jobs, rows, nowMs = Date.now()) {
  const out = new Map();
  const taken = new Set();
  const lc = (v) => String(v || "").toLowerCase();
  for (const j of jobs || []) {
    const keys = new Set([lc(j.requestid), lc(j.asyncoperationid)].filter(Boolean));
    const hit = (rows || []).filter(r => r.mode === 1 && (keys.has(lc(r.requestid)) || (j.correlationid && lc(r.correlationid) === lc(j.correlationid) && traceClass(r) === jobClass(j))));
    if (hit.length) { out.set(j.asyncoperationid, { rows: hit, how: "id" }); hit.forEach(r => taken.add(r.plugintracelogid)); }
  }
  for (const j of jobs || []) {
    if (out.has(j.asyncoperationid)) continue;
    const cls = jobClass(j);
    const a = (Date.parse(j.startedon || j.createdon) || 0) - 5000;
    const b = (Date.parse(j.completedon) || nowMs) + 10000;
    const hit = (rows || []).filter(r => r.mode === 1 && !taken.has(r.plugintracelogid) && traceClass(r) === cls)
      .map(r => ({ r, t: Date.parse(r.performanceexecutionstarttime || r.createdon) || 0 }))
      .filter(x => x.t >= a && x.t <= b)
      .sort((x, y) => Math.abs(x.t - a) - Math.abs(y.t - a));
    if (hit.length) { out.set(j.asyncoperationid, { rows: [hit[0].r], how: "time" }); taken.add(hit[0].r.plugintracelogid); }
  }
  return out;
}

// The last runs of one plug-in step (newest first) → is it failing every time, and since when?
export const HISTORY_DAYS = 30;

// The OData filter for a step's recent runs. The system job table can hold millions of rows: the
// job name leads (the System Jobs search relies on name filters too), the step id narrows it, and
// the last 30 days bound it. The step lookup alone, unbounded, was seen live keeping the detail
// on its spinner.
export function historyFilter(job, nowMs = Date.now()) {
  const parts = [];
  if (job?.name) parts.push(`name eq ${odataString(job.name)}`);
  if (isGuid(job?._owningextensionid_value)) parts.push(`_owningextensionid_value eq ${String(job._owningextensionid_value).toLowerCase()}`);
  if (!parts.length) return null;
  parts.push(`createdon ge ${new Date(nowMs - HISTORY_DAYS * 86400000).toISOString()}`);
  return parts.join(" and ");
}

// autoDelete: the step deletes its successful jobs ("Delete AsyncOperation if StatusCode =
// Successful") — then only failures are left, and "failing every time" would be a false alarm.
export function jobHistory(list, { autoDelete = false } = {}) {
  const rows = (list || []).slice().sort((a, b) => (Date.parse(b.createdon) || 0) - (Date.parse(a.createdon) || 0));
  const states = rows.map(jobState);
  let streak = 0;
  while (streak < states.length && states[streak] === "failed") streak++;
  const lastOk = rows.find(r => jobState(r) === "succeeded");
  return {
    total: rows.length,
    failed: states.filter(s => s === "failed").length,
    succeeded: states.filter(s => s === "succeeded").length,
    streak,                                              // failures in a row, newest first
    failingSince: streak ? rows[streak - 1].createdon : null,
    lastSuccess: lastOk ? lastOk.createdon : null,
    latest: rows[0] ? rows[0].createdon : null,
    autoDelete: !!autoDelete,
  };
}

// A flow trigger in words: "when a row is modified · columns: a, b · filter: … · rows owned by the flow's user".
export function triggerText(reg) {
  const parts = [`when a row is ${MESSAGE_LABEL[Number(reg?.message)] || "changed"}`];
  const cols = String(reg?.filteringattributes || "").split(",").map(s => s.trim()).filter(Boolean);
  if (cols.length) parts.push(`columns: ${cols.join(", ")}`);
  if (String(reg?.filterexpression || "").trim()) parts.push(`filter: ${String(reg.filterexpression).trim()}`);
  if (SCOPE_LABEL[Number(reg?.scope)]) parts.push(SCOPE_LABEL[Number(reg.scope)]);
  return parts.join(" · ");
}

// Power Automate links for a flow (and one of its runs). Commercial, US Government and China clouds.
export function flowLinks({ orgUrl, envId, flowId, runName }) {
  if (!isGuid(flowId) || !/^[0-9a-f-]{36}$/i.test(String(envId || "").replace(/^Default-/i, ""))) return null;
  const host = /\.microsoftdynamics\.us/i.test(orgUrl || "") ? "make.gov.powerautomate.us"
    : /\.dynamics\.cn/i.test(orgUrl || "") ? "make.powerautomate.cn" : "make.powerautomate.com";
  const base = `https://${host}/environments/${encodeURIComponent(envId)}/flows/${flowId}`;
  return { flow: `${base}/details`, run: runName && /^[A-Za-z0-9]+$/.test(runName) ? `${base}/runs/${runName}` : null };
}
