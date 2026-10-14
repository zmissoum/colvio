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
export function pickCorrelations({ windowRows, jobs, requestIds, messageNames }) {
  const req = new Set((requestIds || []).map(s => String(s).toLowerCase()));
  const ids = new Set();
  let exact = false;
  for (const r of windowRows || []) {
    if (r.requestid && req.has(String(r.requestid).toLowerCase()) && r.correlationid) { ids.add(String(r.correlationid).toLowerCase()); exact = true; }
  }
  for (const j of jobs || []) if (j.correlationid) { ids.add(String(j.correlationid).toLowerCase()); exact = true; }
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
  if (String(reg?.filterexpression || "").trim()) return { verdict: "maybe", reason: `row filter: ${String(reg.filterexpression).trim()}` };
  const scope = Number(reg?.scope);
  if (SCOPE_LABEL[scope]) return { verdict: "maybe", reason: `scope: ${SCOPE_LABEL[scope]}` };
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
