// Record activity — reads what one save triggered: plug-in execution chains (plugintracelog),
// the record's system jobs (asyncoperation), and the cloud flows whose Dataverse trigger watches the
// table (callbackregistration) with their runs (flowrun). The query function is injected — the
// bridge's in the extension, a deterministic fake in demo mode and tests. Each part fails on its
// own and says why; nothing is invented to fill a gap.
import {
  saveWindow, messageNamesFor, traceWindowFilter, jobsFilter, stepsFilter,
  pickCorrelations, buildChains, flowIdOf, flowVerdict, matchRun, isPending, isGuid, SYNC_MARGIN_MS,
  chainFilter, assignAsyncTraces, jobHistory, triggerText, odataString,
} from "./recordActivity.js";

const TRACE_SELECT = "plugintracelogid,typename,messagename,primaryentity,mode,operationtype,depth,correlationid,requestid,pluginstepid,performanceexecutionduration,performanceexecutionstarttime,createdon,exceptiondetails";
const JOB_SELECT = "asyncoperationid,name,operationtype,statecode,statuscode,createdon,startedon,completedon,friendlymessage,correlationid,requestid,retrycount,errorcode,_owningextensionid_value";
const JOB_DETAIL_SELECT = "message,friendlymessage,errorcode,retrycount,depth,executiontimespan,postponeuntil,workflowstagename,messagename,_ownerid_value";
const STEP_SELECT = "name,stage,mode,rank,filteringattributes,configuration,asyncautodelete,statecode,_impersonatinguserid_value,_sdkmessageprocessingstepsecureconfigid_value,_plugintypeid_value,_sdkmessageid_value";
const FMT = "@OData.Community.Display.V1.FormattedValue";
const REG_SELECT = "callbackregistrationid,name,entityname,message,sdkmessagename,filteringattributes,filterexpression,scope,runas,softdeletestatus";
const recs = (d) => (d && Array.isArray(d.records) ? d.records : Array.isArray(d?.value) ? d.value : []);
const errText = (e) => String(e?.message || e || "error");

export function createActivityLoader(query) {
  const steps = {};          // step id → { stage, name } — shared by every save of the session
  const stepInfos = new Map(); // step id → Promise<step facts> (the detail shown on click)
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
    const asyncJobs = out.jobs.filter(j => j.operationtype === 1);
    const cf = chainFilter({ correlationIds: pick.ids, requestIds: asyncJobs.flatMap(j => [j.requestid, j.asyncoperationid]) }, w.from, upTo);
    if (cf && !out.errors.traces) {
      try { rows = recs(await query("plugintracelogs", { select: TRACE_SELECT, filter: cf, orderby: "createdon asc", top: "200" })); }
      catch (e) { out.errors.traces = errText(e); }
    }
    // An asynchronous job whose trace wasn't found by id: same plug-in class, inside the job's run.
    let byJob = assignAsyncTraces(asyncJobs, rows, now);
    if (!out.errors.traces && asyncJobs.some(j => !byJob.has(j.asyncoperationid))) {
      try {
        const extra = recs(await query("plugintracelogs", { select: TRACE_SELECT, filter: `primaryentity eq '${entity}' and mode eq 1 and createdon ge ${w.from} and createdon le ${upTo}`, orderby: "createdon asc", top: "100" }));
        const seen = new Set(rows.map(r => r.plugintracelogid));
        byJob = assignAsyncTraces(asyncJobs, [...rows, ...extra.filter(r => !seen.has(r.plugintracelogid))], now);
        const used = new Set([...byJob.values()].flatMap(m => m.rows.map(r => r.plugintracelogid)));
        rows = [...rows, ...extra.filter(r => !seen.has(r.plugintracelogid) && used.has(r.plugintracelogid))];
      } catch { /* the jobs still show; their traces just stay unknown */ }
    }
    out.jobs = out.jobs.map(j => {
      const m = byJob.get(j.asyncoperationid);
      return { ...j, traceIds: m ? m.rows.map(r => r.plugintracelogid) : [], traceMatch: m ? m.how : null };
    });
    await stepsFor(rows);
    out.chains = buildChains(rows, steps);

    // Flows
    if (flowInfo.error) out.errors.flows = flowInfo.error;
    out.flows = flowInfo.regs.map(reg => {
      const id = flowIdOf(reg);
      const meta = flowInfo.names[id];
      const v = meta && meta.on === false ? { verdict: "no", reason: "the flow is turned off" } : flowVerdict(reg, save);
      return { id, name: meta?.name || id, ...v, trigger: triggerText(reg), run: null };
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

  // One plug-in step, in words (on click): its name, stage, mode, order, trigger columns, the user it
  // runs as, and WHETHER it has a configuration — never the configuration itself (it can hold secrets).
  function stepInfo(stepId) {
    const id = String(stepId || "").toLowerCase();
    if (!isGuid(id)) return Promise.resolve(null);
    if (!stepInfos.has(id)) {
      stepInfos.set(id, query(`sdkmessageprocessingsteps(${id})`, { select: STEP_SELECT }).then(d => {
        const s = recs(d)[0] || d || {};
        return {
          id, name: s.name || "", stage: s.stage, mode: s.mode === 1 ? "Asynchronous" : "Synchronous", rank: s.rank ?? null,
          filteringattributes: s.filteringattributes || "",
          runAs: s["_impersonatinguserid_value" + FMT] || (s._impersonatinguserid_value ? s._impersonatinguserid_value : "the calling user"),
          pluginType: s["_plugintypeid_value" + FMT] || "",
          message: s["_sdkmessageid_value" + FMT] || "",
          hasUnsecureConfig: !!String(s.configuration || "").trim(),
          hasSecureConfig: !!s._sdkmessageprocessingstepsecureconfigid_value,
          asyncAutoDelete: !!s.asyncautodelete,
          enabled: s.statecode !== 1,
        };
      }).catch(e => { stepInfos.delete(id); throw e; }));
    }
    return stepInfos.get(id);
  }

  // A system job, on click: the full message, the step behind it, and how its recent runs went.
  async function jobDetail(job) {
    if (!isGuid(job?.asyncoperationid)) throw new Error("Invalid job id");
    const out = { message: "", facts: {}, step: null, history: null, errors: {} };
    const [d, step] = await Promise.all([
      query(`asyncoperations(${job.asyncoperationid})`, { select: JOB_DETAIL_SELECT }).then(x => recs(x)[0] || x || {}, e => ({ __error: errText(e) })),
      stepInfo(job._owningextensionid_value).catch(e => ({ __error: errText(e) })),
    ]);
    if (d.__error) out.errors.job = d.__error;
    else {
      out.message = d.message || d.friendlymessage || "";
      out.facts = { retries: d.retrycount ?? null, depth: d.depth ?? null, executionMs: typeof d.executiontimespan === "number" ? d.executiontimespan * 1000 : null,
        owner: d["_ownerid_value" + FMT] || "", postponeUntil: d.postponeuntil || null, stage: d.workflowstagename || "", errorCode: d.errorcode ?? null };
    }
    if (step && step.__error) out.errors.step = step.__error; else out.step = step;
    const filter = isGuid(job._owningextensionid_value) ? `_owningextensionid_value eq ${String(job._owningextensionid_value).toLowerCase()}`
      : job.name ? `name eq ${odataString(job.name)}` : null;
    if (filter) {
      try {
        const h = recs(await query("asyncoperations", { select: "asyncoperationid,statecode,statuscode,createdon,friendlymessage", filter, orderby: "createdon desc", top: "20" }));
        out.history = jobHistory(h);
      } catch (e) { out.errors.history = errText(e); }
    }
    return out;
  }

  return { load, traceDetail, stepInfo, jobDetail, clearFlows: () => flowsByTable.clear() };
}
