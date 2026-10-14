// Record activity — reads what one save triggered: plug-in execution chains (plugintracelog),
// the record's system jobs (asyncoperation), and the cloud flows whose Dataverse trigger watches the
// table (callbackregistration) with their runs (flowrun). The query function is injected — the
// bridge's in the extension, a deterministic fake in demo mode and tests. Each part fails on its
// own and says why; nothing is invented to fill a gap.
import {
  saveWindow, messageNamesFor, traceWindowFilter, correlationFilter, jobsFilter, stepsFilter,
  pickCorrelations, buildChains, flowIdOf, flowVerdict, matchRun, isPending, isGuid, SYNC_MARGIN_MS,
} from "./recordActivity.js";

const TRACE_SELECT = "plugintracelogid,typename,messagename,primaryentity,mode,operationtype,depth,correlationid,requestid,pluginstepid,performanceexecutionduration,performanceexecutionstarttime,createdon,exceptiondetails";
const JOB_SELECT = "asyncoperationid,name,operationtype,statecode,statuscode,createdon,startedon,completedon,friendlymessage,correlationid";
const REG_SELECT = "callbackregistrationid,name,entityname,message,sdkmessagename,filteringattributes,filterexpression,scope,runas,softdeletestatus";
const recs = (d) => (d && Array.isArray(d.records) ? d.records : Array.isArray(d?.value) ? d.value : []);
const errText = (e) => String(e?.message || e || "error");

export function createActivityLoader(query) {
  const steps = {};          // step id → { stage, name } — shared by every save of the session
  const flowsByTable = new Map(); // table → Promise<{ regs, names, error }>

  async function stepsFor(rows) {
    const missing = [...new Set(rows.map(r => String(r.pluginstepid || "").toLowerCase()).filter(id => isGuid(id) && !steps[id]))];
    const filter = stepsFilter(missing);
    if (!filter) return;
    try {
      const d = await query("sdkmessageprocessingsteps", { select: "sdkmessageprocessingstepid,stage,name", filter });
      for (const s of recs(d)) steps[String(s.sdkmessageprocessingstepid).toLowerCase()] = { stage: s.stage, name: s.name };
    } catch { /* stages fall back to Synchronous / Asynchronous */ }
  }

  // The flows watching a table, once per session: registrations + the flows' names and state.
  function flowsFor(entity) {
    if (!flowsByTable.has(entity)) {
      flowsByTable.set(entity, (async () => {
        let regs;
        try {
          regs = recs(await query("callbackregistrations", { select: REG_SELECT, filter: `entityname eq '${entity}'` }))
            .filter(r => !(Number(r.softdeletestatus) > 0) && flowIdOf(r));
        } catch (e) { return { regs: [], names: {}, error: errText(e) }; }
        const ids = [...new Set(regs.map(flowIdOf))].slice(0, 40);
        const names = {};
        if (ids.length) {
          try {
            const d = await query("workflows", { select: "workflowid,name,statecode", filter: ids.map(id => `workflowid eq ${id}`).join(" or ") });
            for (const w of recs(d)) names[String(w.workflowid).toLowerCase()] = { name: w.name, on: w.statecode === 1 };
          } catch { /* names unknown — the flow id is shown instead */ }
        }
        return { regs, names, error: null };
      })());
    }
    return flowsByTable.get(entity);
  }

  async function runsIn(fromIso, toIso) {
    try {
      return { runs: recs(await query("flowruns", { filter: `starttime ge ${fromIso} and starttime le ${toIso}`, orderby: "starttime asc", top: "100" })), error: null, missing: false };
    } catch (e1) {
      const m = errText(e1);
      if (/does not exist|Resource not found|404/i.test(m)) return { runs: [], error: null, missing: true };
      try { return { runs: recs(await query("flowruns", { top: "200" })), error: null, missing: false, clientFiltered: true }; }
      catch (e2) { return { runs: [], error: errText(e2), missing: false }; }
    }
  }

  // Everything one save triggered, as known right now. `next` = the record's following save, if
  // any: the record's jobs and the flow runs (matched by record / time, not by execution chain)
  // are only looked for until it started, so a later save's work is never credited to this one.
  async function load(save, { entity, recordId, now = Date.now(), next = null }) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(String(entity || ""))) throw new Error(`Invalid table name: ${entity}`);
    const w = saveWindow(save);
    const upToMs = Math.min(w.asyncToMs, now + 60000);
    const upTo = new Date(upToMs).toISOString();
    const nextStartMs = next ? saveWindow(next).fromMs + SYNC_MARGIN_MS : Infinity;
    const recUpToMs = Math.max(w.fromMs, Math.min(upToMs, nextStartMs));
    const recUpTo = new Date(recUpToMs).toISOString();
    const out = { chains: [], exact: false, jobs: [], flows: [], errors: {}, runsMissing: false, loadedAt: now };

    const [windowRes, jobsRes, flowInfo] = await Promise.all([
      query("plugintracelogs", { select: TRACE_SELECT, filter: traceWindowFilter(entity, w.from, w.syncTo), orderby: "createdon asc", top: "100" }).then(recs, e => ({ error: errText(e) })),
      query("asyncoperations", { select: JOB_SELECT, filter: jobsFilter(recordId, w.from, recUpTo), orderby: "createdon asc", top: "50" }).then(recs, e => ({ error: errText(e) })),
      flowsFor(entity),
    ]);

    const windowRows = Array.isArray(windowRes) ? windowRes : [];
    if (windowRes.error) out.errors.traces = windowRes.error;
    out.jobs = Array.isArray(jobsRes) ? jobsRes : [];
    if (jobsRes.error) out.errors.jobs = jobsRes.error;

    // Plug-in chains: the correlation ids of this save, then every trace of those chains (cascades
    // on other tables and asynchronous steps included).
    const pick = pickCorrelations({ windowRows, jobs: out.jobs, requestIds: save.requestIds, messageNames: messageNamesFor(save) });
    out.exact = pick.exact;
    let rows = windowRows.filter(r => pick.ids.includes(String(r.correlationid || "").toLowerCase()));
    const cf = correlationFilter(pick.ids, w.from, upTo);
    if (cf && !out.errors.traces) {
      try { rows = recs(await query("plugintracelogs", { select: TRACE_SELECT, filter: cf, orderby: "createdon asc", top: "200" })); }
      catch (e) { out.errors.traces = errText(e); }
    }
    await stepsFor(rows);
    out.chains = buildChains(rows, steps);

    // Flows
    if (flowInfo.error) out.errors.flows = flowInfo.error;
    out.flows = flowInfo.regs.map(reg => {
      const id = flowIdOf(reg);
      const meta = flowInfo.names[id];
      const v = meta && meta.on === false ? { verdict: "no", reason: "the flow is turned off" } : flowVerdict(reg, save);
      return { id, name: meta?.name || id, ...v, run: null };
    });
    if (out.flows.some(f => f.verdict !== "no")) {
      const r = await runsIn(w.from, recUpTo);
      if (r.error) out.errors.runs = r.error;
      out.runsMissing = r.missing;
      for (const f of out.flows) if (f.verdict !== "no") f.run = matchRun(r.runs, f.id, w.fromMs, recUpToMs);
    }
    const order = { yes: 0, maybe: 1, no: 2 };
    out.flows.sort((a, b) => order[a.verdict] - order[b.verdict] || String(a.name).localeCompare(String(b.name)));
    out.pending = isPending(out);
    return out;
  }

  // Full trace text of one execution, on demand (the list leaves it out — it can be long).
  async function traceDetail(id) {
    if (!isGuid(id)) throw new Error("Invalid trace id");
    const d = await query(`plugintracelogs(${id})`, { select: "messageblock,exceptiondetails" });
    const r = recs(d)[0] || d || {};
    return { trace: r.messageblock || "", exception: r.exceptiondetails || "" };
  }

  return { load, traceDetail, clearFlows: () => flowsByTable.clear() };
}
