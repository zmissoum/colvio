import { useState, useEffect, useMemo, useRef } from "react";
import { bridge } from "../d365-bridge.js";
import { C, Spin, mono, bt, crd, inp, copyText, confirmProd } from "../shared.jsx";
import { savesForRecord } from "../saveCapture.js";
import { createActivityLoader } from "../recordActivityLoader.js";
import { createActivityDemo } from "../recordActivityDemo.js";
import { TRACE_SETTING, REFRESH_LIMIT_MS, nextDelay, jobState, jobKind, runStatus, STAGE_LABEL, flowLinks } from "../recordActivity.js";

// Record activity — what each save of this record triggered: the plug-in execution chains, the
// record's system jobs and the cloud flows whose Dataverse trigger watches the table. Saves come
// from background.js (it observes the D365 tab's Web API writes); everything else is read from the
// org on demand, and refreshed on its own only while something is still running.

const STATE_COLOR = { succeeded: C.gn, failed: C.rd, canceled: C.yw, running: C.cy, pending: C.txm, waiting: C.yw };
const RUN_COLOR = (s) => (s === "succeeded" ? C.gn : s === "failed" ? C.rd : s === "running" ? C.cy : s === "cancelled" || s === "canceled" ? C.yw : C.txm);
const pill = (color, text, title) => <span title={title} style={{ fontSize: 11, padding: "1px 8px", borderRadius: 4, background: color + "22", color, fontWeight: 600, whiteSpace: "nowrap" }}>{text}</span>;
const hhmmss = (ms) => {
  const d = new Date(ms);
  const sameDay = d.toDateString() === new Date().toDateString();
  return (sameDay ? "" : d.toLocaleDateString() + " ") + d.toLocaleTimeString();
};
const durText = (ms) => (ms == null ? "" : ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(1)} s`);
const between = (a, b) => (a && b ? Math.max(0, Date.parse(b) - Date.parse(a)) : null);

// A step in words — "has a configuration" only, never its content (it can hold secrets).
function StepFacts({ step }) {
  if (!step) return null;
  const cols = String(step.filteringattributes || "").split(",").map(s => s.trim()).filter(Boolean);
  const bits = [
    STAGE_LABEL[step.stage] || null, step.mode.toLowerCase(), step.rank != null ? `order ${step.rank}` : null,
    cols.length ? `triggers on: ${cols.join(", ")}` : "triggers on any column",
    `runs as: ${step.runAs}`,
    `secure configuration: ${step.hasSecureConfig ? "yes" : "no"}`, `unsecure configuration: ${step.hasUnsecureConfig ? "yes" : "no"}`,
    step.enabled ? null : "step disabled",
  ].filter(Boolean);
  return <div style={{ fontSize: 11.5, color: C.txm, margin: "4px 0" }}><b style={{ fontWeight: 600 }}>Step</b> {step.name ? `${step.name} — ` : ""}{bits.join(" · ")}</div>;
}

// What a failure message usually means, and where to look first.
function errorHint(msg) {
  const m = String(msg || "");
  if (/\b401\b|unauthori[sz]ed|\b403\b|forbidden|invalid_client|AADSTS\d+/i.test(m)) return "The external service refused the credentials this plug-in sent — usually an expired or changed key, secret or token. Look where the step gets them: its secure / unsecure configuration (Plugin Registration Tool), an environment variable, a configuration table or a Key Vault. Once fixed, save the record again — a failed job doesn't run again on its own.";
  if (/time(d)? ?out|timeout|2 minutes/i.test(m)) return "Timeout — an external call took too long, or the plug-in hit the 2-minute limit of a single execution.";
  if (/\b(404|500|502|503|504)\b|name or service not known|could not be resolved/i.test(m)) return "The external service answered with an error or couldn't be reached — check its URL and whether it is up.";
  return "";
}

function historyText(h) {
  if (!h) return "";
  const d = (iso) => (iso ? new Date(iso).toLocaleString() : "?");
  if (h.autoDelete) return h.failed
    ? `${h.failed} failure${h.failed > 1 ? "s" : ""} of this step in the last 30 days (latest ${d(h.latest)}) — its successful runs are deleted automatically (step setting), so they can't be counted.`
    : "No failure of this step in the last 30 days — its successful runs are deleted automatically (step setting).";
  if (!h.total) return "No other run of this step in the last 30 days.";
  if (h.streak >= 2) return `Failing every time: the last ${h.streak} runs of this step failed — since ${d(h.failingSince)}${h.lastSuccess ? `; last success ${d(h.lastSuccess)}` : `; no success in the last ${h.total} runs (30 days)`}.`;
  if (h.failed === 0) return `The last ${h.total} runs of this step (30 days) all succeeded.`;
  return `${h.failed} of the last ${h.total} runs of this step failed (30 days)${h.lastSuccess ? ` — last success ${d(h.lastSuccess)}` : ""}.`;
}

function JobDetail({ job, loader, orgUrl }) {
  const [d, setD] = useState(null);       // the job + its step (fast: two reads by id)
  const [runs, setRuns] = useState(null); // the step's recent runs (a search — can take a while)
  const [traces, setTraces] = useState([]);
  const [err, setErr] = useState("");
  useEffect(() => {
    let alive = true;
    setRuns(null);
    loader.jobInfo(job).then(x => {
      if (!alive) return;
      setD(x);
      loader.jobRuns(job, { autoDelete: !!x.step?.asyncAutoDelete }).then(r => { if (alive) setRuns(r); });
    }, e => { if (alive) setErr(e.message || String(e)); });
    Promise.all((job.traceIds || []).map(id => loader.traceDetail(id).catch(e => ({ error: e.message })))).then(t => { if (alive) setTraces(t); });
    return () => { alive = false; };
  }, [job.asyncoperationid, job.statecode, loader]); // re-read when the job finishes
  const st = jobState(job);
  const msg = d?.message || job.friendlymessage || "";
  const hint = st === "failed" ? errorHint(msg) : "";
  const link = orgUrl ? `${orgUrl}/main.aspx?etn=asyncoperation&id=${job.asyncoperationid}&pagetype=entityrecord` : null;
  const copy = () => copyText([
    `${job.name} — ${st}`, `started ${job.startedon || "?"} · ended ${job.completedon || "?"} · retries ${d?.facts?.retries ?? job.retrycount ?? 0}`,
    runs?.history ? historyText(runs.history) : "", d?.step ? `step: ${d.step.name} (${d.step.mode}, runs as ${d.step.runAs})` : "",
    msg ? `── Message ──\n${msg}` : "", ...traces.map(t => (t.trace || t.exception ? `── Trace ──\n${t.trace || ""}${t.exception ? "\n" + t.exception : ""}` : "")),
  ].filter(Boolean).join("\n"));
  return (
    <div style={{ margin: "2px 0 8px", padding: 10, background: C.bg, borderRadius: 6, border: `1px solid ${st === "failed" ? C.rd + "55" : C.bd}`, fontSize: 12 }}>
      <div style={{ display: "flex", gap: 6, float: "right" }}>
        {link && <a href={link} target="_blank" rel="noopener" style={{ ...bt(null, { fontSize: 11, padding: "2px 8px" }), textDecoration: "none" }}>Open in D365 ↗</a>}
        <button onClick={copy} style={bt(null, { fontSize: 11, padding: "2px 8px" })}>⧉ Copy</button>
      </div>
      {!d && !err && <div style={{ color: C.txd }}><Spin s={10} /> Loading the job and its step…</div>}
      {err && <div style={{ color: C.rd }}>{err}</div>}
      {d && (<>
        <div style={{ color: C.txm }}>
          Started {job.startedon ? new Date(job.startedon).toLocaleTimeString() : "—"} · ended {job.completedon ? new Date(job.completedon).toLocaleTimeString() : "—"}
          {` · retries ${d.facts.retries ?? job.retrycount ?? 0}`}{d.facts.owner ? ` · on behalf of ${d.facts.owner}` : ""}
        </div>
        {!runs && <div style={{ color: C.txd, marginTop: 4 }}><Spin s={10} /> Reading this step's runs of the last 30 days…</div>}
        {runs?.history && <div style={{ color: runs.history.streak >= 2 && !runs.history.autoDelete ? C.rd : C.txm, marginTop: 4, fontWeight: runs.history.streak >= 2 && !runs.history.autoDelete ? 600 : 400 }}>{historyText(runs.history)}</div>}
        {runs?.error && <div style={{ color: C.txd, marginTop: 4 }}>This step's history couldn't be read: {runs.error}</div>}
        <StepFacts step={d.step} />
        {d.errors.step && <div style={{ color: C.txd }}>Step unavailable: {d.errors.step}</div>}
        {hint && <div style={{ marginTop: 6, padding: "6px 8px", borderRadius: 5, background: C.yw + "14", color: C.yw }}>💡 {hint}</div>}
        {msg ? <pre style={{ margin: "8px 0 0", whiteSpace: "pre-wrap", wordBreak: "break-word", ...mono, fontSize: 11.5, color: st === "failed" ? C.rd : C.txm, maxHeight: 220, overflow: "auto" }}>{msg}</pre>
          : <div style={{ color: C.txd, marginTop: 6 }}>No message on this job.</div>}
        {(job.traceIds || []).length === 0 && <div style={{ color: C.txd, marginTop: 6 }}>No plug-in trace found for this run — the plug-in may write none (the log only keeps what the code traces, plus exceptions).</div>}
        {traces.map((t, i) => (
          <div key={i} style={{ marginTop: 8 }}>
            <div style={{ color: C.txd, fontSize: 11 }}>Plug-in trace{job.traceMatch === "time" ? " — matched by plug-in class and run time" : ""}</div>
            {t.error ? <div style={{ color: C.rd }}>{t.error}</div>
              : <pre style={{ margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-word", ...mono, fontSize: 11.5, color: C.txm }}>{t.trace || "(no trace text)"}</pre>}
          </div>
        ))}
      </>)}
    </div>
  );
}

function kindLabel(s) {
  switch (s.kind) {
    case "create": return "Created";
    case "delete": return "Deleted";
    case "action": return `Action ${s.action || ""}`.trim();
    case "associate": return "Linked a record";
    case "disassociate": return "Unlinked a record";
    default: return "Saved";
  }
}

function SaveCard({ save, next, loader, entity, recordId, labels, traceSetting, defaultOpen, orgUrl, envId }) {
  const [open, setOpen] = useState(defaultOpen);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [details, setDetails] = useState({}); // trace id → { loading, trace, exception, error }
  const [showNo, setShowNo] = useState(false);
  const [openJob, setOpenJob] = useState(null); // asyncoperationid shown in detail
  const [stepFacts, setStepFacts] = useState({}); // step id → facts (trace rows' detail)
  const [tick, setTick] = useState(0); // re-arms the refresh timer while the panel tab is hidden
  const gen = useRef(0);

  const load = async (fresh = false) => {
    const g = ++gen.current;
    setLoading(true); setError("");
    if (fresh) loader.clearFlows();
    try { const d = await loader.load(save, { entity, recordId, next }); if (gen.current === g) setData(d); }
    catch (e) { if (gen.current === g) setError(e.message || String(e)); }
    if (gen.current === g) setLoading(false);
  };
  useEffect(() => { if (open && !data && !loading) load(); }, [open]);
  useEffect(() => () => { gen.current++; }, []);

  // Auto-refresh while a job / run is still on its way, backing off 2 → 5 → 10 → 30 s, and only
  // for 10 minutes after the save. A hidden panel tab waits instead of querying.
  useEffect(() => {
    if (!open || !data?.pending || loading) return;
    if (Date.now() - (save.t1 || save.t0) > REFRESH_LIMIT_MS) return;
    const t = setTimeout(() => {
      if (document.hidden) { setTick(n => n + 1); return; }
      setAttempt(a => a + 1); load();
    }, nextDelay(attempt));
    return () => clearTimeout(t);
  }, [open, data, loading, tick]);

  const openDetail = async (id) => {
    if (details[id]) { setDetails(d => { const n = { ...d }; delete n[id]; return n; }); return; }
    setDetails(d => ({ ...d, [id]: { loading: true } }));
    const node = (data?.chains || []).flatMap(c => c.nodes).find(n => n.id === id);
    if (node?.stepId && !stepFacts[node.stepId]) loader.stepInfo(node.stepId).then(f => setStepFacts(m => ({ ...m, [node.stepId]: f })), () => {});
    try { const r = await loader.traceDetail(id); setDetails(d => ({ ...d, [id]: r })); }
    catch (e) { setDetails(d => ({ ...d, [id]: { error: e.message || String(e) } })); }
  };

  const failed = save.ok === false;
  const icon = failed ? <span style={{ color: C.rd }}>✗</span> : save.ok === null ? <span style={{ color: C.yw }} title="Sent inside a $batch — the outcome comes from the traces">⧗</span> : <span style={{ color: C.gn }}>✓</span>;
  const status = failed ? pill(C.rd, save.error ? `Failed · ${save.error}` : `Failed · HTTP ${save.status}`)
    : save.ok === null ? pill(C.yw, "In a $batch")
    : pill(C.gn, `HTTP ${save.status} · ${durText((save.t1 || save.t0) - save.t0)}`);
  const plugins = (data?.chains || []).reduce((n, c) => n + c.nodes.length, 0);
  const errors = (data?.chains || []).reduce((n, c) => n + c.nodes.filter(x => x.error).length, 0) + (data?.jobs || []).filter(j => jobState(j) === "failed").length + (data?.flows || []).filter(f => runStatus(f.run) === "failed").length;
  const willFlows = (data?.flows || []).filter(f => f.verdict !== "no");
  const noFlows = (data?.flows || []).filter(f => f.verdict === "no");
  const pendingCount = (data?.jobs || []).filter(j => ["pending", "running", "waiting"].includes(jobState(j))).length + willFlows.filter(f => (f.run ? runStatus(f.run) === "running" : f.verdict === "yes")).length;
  const cols = save.columns || [];
  const colText = cols.slice(0, 8).map(c => (labels[c] && labels[c] !== c ? `${labels[c]} (${c})` : c)).join(", ") + (cols.length > 8 ? ` +${cols.length - 8}` : "");
  const sec = (t, extra) => <div style={{ fontSize: 12, color: C.txd, fontWeight: 700, margin: "12px 0 4px", display: "flex", alignItems: "center", gap: 8 }}>{t}{extra}</div>;
  const row = { display: "flex", alignItems: "center", gap: 10, padding: "5px 0", borderTop: `1px solid ${C.bd}55`, fontSize: 12.5 };

  return (
    <div style={{ ...crd({ padding: "10px 14px", borderColor: failed ? C.rd + "66" : C.bd }), marginBottom: 8 }}>
      <div onClick={() => setOpen(o => !o)} style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", flexWrap: "wrap" }}>
        <span style={{ fontSize: 15 }}>{icon}</span>
        <span style={{ fontWeight: 700, fontSize: 13.5 }}>{hhmmss(save.t0)} · {kindLabel(save)}</span>
        {status}
        {save.opCount > 1 && pill(C.txm, `${save.opCount} changes in the request`)}
        {data && plugins > 0 && pill(C.vi, `${plugins} plug-in${plugins > 1 ? "s" : ""}`)}
        {data && data.jobs.length > 0 && pill(C.cy, `${data.jobs.length} job${data.jobs.length > 1 ? "s" : ""}`)}
        {data && willFlows.length > 0 && pill(C.or, `${willFlows.length} flow${willFlows.length > 1 ? "s" : ""}`)}
        {data && errors > 0 && pill(C.rd, `${errors} error${errors > 1 ? "s" : ""}`)}
        <span style={{ flex: 1 }} />
        {loading && <Spin s={11} />}
        <span style={{ color: C.txd, fontSize: 11 }}>{open ? "▲" : "▼"}</span>
      </div>
      {cols.length > 0 && <div style={{ fontSize: 12, color: C.txd, margin: "3px 0 0 24px" }}>{cols.length} column{cols.length > 1 ? "s" : ""} sent: {colText}</div>}

      {open && (
        <div style={{ marginLeft: 24 }}>
          {error && <div style={{ fontSize: 12, color: C.rd, marginTop: 8 }}>Couldn't read this save's activity: {error} <button onClick={() => load(true)} style={bt(null, { fontSize: 11, padding: "2px 8px", marginLeft: 6 })}>↻ Retry</button></div>}
          {!data && loading && <div style={{ fontSize: 12, color: C.txd, marginTop: 8 }}><Spin s={11} /> Reading the traces, jobs and flows…</div>}
          {data && (<>
            {/* Plug-ins */}
            {sec(`Plug-ins${plugins ? ` · ${plugins}` : ""}`)}
            {traceSetting === 0 && <div style={{ fontSize: 12, color: C.yw }}>⚠ The plug-in trace log is Off — plug-in executions aren't recorded. Switch it on above, then save again.</div>}
            {traceSetting === 1 && <div style={{ fontSize: 12, color: C.yw }}>⚠ Trace log = exceptions only — plug-ins that succeeded aren't recorded.</div>}
            {data.errors.traces && <div style={{ fontSize: 12, color: C.rd }}>Couldn't read the plug-in traces: {data.errors.traces}</div>}
            {!data.errors.traces && plugins > 0 && !data.exact && <div style={{ fontSize: 11.5, color: C.txd }}>Matched by time on the {entity} table — another {entity} saved at the same second would show here too.</div>}
            {!data.errors.traces && plugins === 0 && traceSetting !== 0 && <div style={{ fontSize: 12, color: C.txd }}>{data.jobs.some(j => j.operationtype === 1)
              ? "No synchronous plug-in ran. The asynchronous ones ran as system jobs (below) — click one for its message, its step and its history."
              : traceSetting === 2 ? "No plug-in ran for this save." : "No plug-in exception for this save."}</div>}
            {data.chains.map(ch => ch.nodes.map(n => (
              <div key={n.id}>
                <div onClick={() => openDetail(n.id)} title="Show the trace text" style={{ ...row, cursor: "pointer", paddingLeft: (n.depth - 1) * 18 }}>
                  <span style={{ width: 104, flexShrink: 0, color: C.txd, fontSize: 11.5 }}>{n.depth > 1 ? "↳ " : ""}{n.stage}</span>
                  <span style={{ flex: 1, minWidth: 0, ...mono, fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={n.typename}>
                    {n.type}
                    {(n.entity !== entity || n.depth > 1) && <span style={{ color: C.txd }}> · {n.message} {n.entity}</span>}
                    {n.async && <span style={{ color: C.cy }}> · async</span>}
                  </span>
                  <span style={{ color: C.txd, fontSize: 11.5, ...mono }}>{durText(n.durationMs)}</span>
                  <span style={{ color: n.error ? C.rd : C.gn }}>{n.error ? "✗" : "✓"}</span>
                </div>
                {n.error && <div style={{ fontSize: 12, color: C.rd, padding: `0 0 5px ${(n.depth - 1) * 18 + 114}px` }}>{n.error}</div>}
                {details[n.id] && (
                  <div style={{ margin: `2px 0 8px ${(n.depth - 1) * 18}px`, padding: 8, background: C.bg, borderRadius: 6, border: `1px solid ${C.bd}` }}>
                    {details[n.id].loading ? <span style={{ fontSize: 12, color: C.txd }}><Spin s={10} /> Loading the trace…</span>
                      : details[n.id].error ? <span style={{ fontSize: 12, color: C.rd }}>{details[n.id].error}</span>
                      : (<>
                        <button onClick={() => copyText(`${n.typename} · ${n.message} ${n.entity}\n${details[n.id].exception ? `── Exception ──\n${details[n.id].exception}\n` : ""}── Trace ──\n${details[n.id].trace || "(empty)"}`)} style={{ ...bt(null, { fontSize: 11, padding: "2px 8px" }), float: "right" }}>⧉ Copy</button>
                        <StepFacts step={n.stepId ? stepFacts[n.stepId] : null} />
                        <pre style={{ margin: 0, fontSize: 11.5, whiteSpace: "pre-wrap", wordBreak: "break-word", ...mono, color: C.txm }}>{details[n.id].trace || "(no trace text — the plug-in didn't write any)"}</pre>
                        {details[n.id].exception && <pre style={{ margin: "8px 0 0", fontSize: 11.5, whiteSpace: "pre-wrap", wordBreak: "break-word", ...mono, color: C.rd, maxHeight: 220, overflow: "auto" }}>{details[n.id].exception}</pre>}
                      </>)}
                  </div>
                )}
              </div>
            )))}

            {/* System jobs */}
            {(data.jobs.length > 0 || data.errors.jobs) && sec(`System jobs · ${data.jobs.length}`)}
            {data.errors.jobs && <div style={{ fontSize: 12, color: C.rd }}>Couldn't read the system jobs: {data.errors.jobs}</div>}
            {data.jobs.map(j => {
              const st = jobState(j);
              return (
                <div key={j.asyncoperationid}>
                  <div onClick={() => setOpenJob(o => (o === j.asyncoperationid ? null : j.asyncoperationid))} title="Show the message, the step and its recent runs" style={{ ...row, cursor: "pointer" }}>
                    <span style={{ width: 104, flexShrink: 0, color: C.txd, fontSize: 11.5 }}>{jobKind(j)}</span>
                    <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={j.friendlymessage || j.name}>{j.name}{st === "failed" && j.friendlymessage ? <span style={{ color: C.rd }}> — {j.friendlymessage}</span> : null}</span>
                    {j.traceIds?.length > 0 && <span style={{ fontSize: 10.5, color: C.txd }} title="A plug-in trace was found for this run">trace</span>}
                    <span style={{ color: C.txd, fontSize: 11.5, ...mono }}>{durText(between(j.startedon, j.completedon))}</span>
                    {pill(STATE_COLOR[st] || C.txm, st)}
                    <span style={{ color: C.txd, fontSize: 10 }}>{openJob === j.asyncoperationid ? "▲" : "▼"}</span>
                  </div>
                  {openJob === j.asyncoperationid && <JobDetail job={j} loader={loader} orgUrl={orgUrl} />}
                </div>
              );
            })}

            {/* Flows */}
            {sec(`Cloud flows${willFlows.length ? ` · ${willFlows.length} triggered` : ""}`)}
            {data.errors.flows && <div style={{ fontSize: 12, color: C.rd }}>Couldn't read the flow triggers (callbackregistration): {data.errors.flows}</div>}
            {!data.errors.flows && data.flows.length === 0 && <div style={{ fontSize: 12, color: C.txd }}>No cloud flow has a Dataverse trigger on the {entity} table.</div>}
            {willFlows.map(f => {
              const rs = runStatus(f.run);
              const links = flowLinks({ orgUrl, envId, flowId: f.id, runName: f.run?.name });
              return (
                <div key={f.id} style={{ borderTop: `1px solid ${C.bd}55`, padding: "5px 0" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 12.5 }}>
                    <span style={{ width: 104, flexShrink: 0, color: f.verdict === "yes" ? C.gn : C.yw, fontSize: 11.5 }}>{f.verdict === "yes" ? "Triggered" : "May trigger"}</span>
                    <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={f.id}>{f.name}{links && <a href={links.flow} target="_blank" rel="noopener" title="Open the flow in Power Automate" style={{ color: C.txd, marginLeft: 6, textDecoration: "none" }}>↗</a>}</span>
                    {f.run && <span style={{ color: C.txd, fontSize: 11.5, ...mono }}>{durText(between(f.run.starttime, f.run.endtime))}</span>}
                    {f.run ? pill(RUN_COLOR(rs), f.run.status || "?") : pill(C.txm, f.verdict === "yes" ? "no run yet" : "no run")}
                    {links?.run && <a href={links.run} target="_blank" rel="noopener" style={{ fontSize: 11, color: rs === "failed" ? C.rd : C.cy, textDecoration: "none", whiteSpace: "nowrap" }}>{rs === "failed" ? "Open failed run ↗" : "Open run ↗"}</a>}
                  </div>
                  <div style={{ fontSize: 11.5, color: C.txd, paddingLeft: 114 }}>Trigger: {f.trigger}</div>
                  {f.verdict === "maybe" && f.reason && <div style={{ fontSize: 11.5, color: C.yw, paddingLeft: 114 }}>{f.reason}</div>}
                  {f.run && (f.run.errorcode || f.run.errormessage) && <div style={{ fontSize: 12, color: C.rd, paddingLeft: 114 }}>{f.run.errorcode ? `${f.run.errorcode}: ` : ""}{String(f.run.errormessage || "").slice(0, 400)}</div>}
                </div>
              );
            })}
            {noFlows.length > 0 && (
              <div style={{ borderTop: `1px solid ${C.bd}55`, padding: "5px 0" }}>
                <div onClick={() => setShowNo(v => !v)} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 12.5, cursor: "pointer", color: C.txm }}>
                  <span style={{ width: 104, flexShrink: 0, color: C.txd, fontSize: 11.5 }}>Won't trigger</span>
                  <span style={{ flex: 1 }}>{noFlows.length} flow{noFlows.length > 1 ? "s" : ""}{!showNo ? ` · ${noFlows.slice(0, 2).map(f => f.name).join(", ")}${noFlows.length > 2 ? "…" : ""}` : ""}</span>
                  <span style={{ color: C.txd, fontSize: 11 }}>{showNo ? "▲" : "▼"}</span>
                </div>
                {showNo && noFlows.map(f => (
                  <div key={f.id} style={{ fontSize: 12, color: C.txm, padding: "3px 0 0 114px" }}>
                    <b style={{ fontWeight: 600 }}>{f.name}</b> — {f.reason}
                    <div style={{ fontSize: 11.5, color: C.txd }}>Trigger: {f.trigger}</div>
                  </div>
                ))}
              </div>
            )}
            {data.runsMissing && <div style={{ fontSize: 11.5, color: C.txd }}>This org has no flow run table (flowrun) — runs can't be shown.</div>}
            {data.errors.runs && <div style={{ fontSize: 12, color: C.rd }}>Couldn't read the flow runs: {data.errors.runs}</div>}
            {willFlows.some(f => !f.run && f.verdict === "yes") && !data.runsMissing && <div style={{ fontSize: 11.5, color: C.txd }}>Run history covers flows in a solution — a flow outside one never shows a run here.</div>}

            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, fontSize: 11.5, color: C.txd }}>
              {data.pending && Date.now() - (save.t1 || save.t0) <= REFRESH_LIMIT_MS
                ? <span><Spin s={10} /> Updating on its own — {pendingCount || 1} still running</span>
                : <span>Read at {new Date(data.loadedAt).toLocaleTimeString()}</span>}
              <button onClick={() => { setAttempt(0); load(true); }} disabled={loading} style={bt(null, { fontSize: 11, padding: "2px 9px", opacity: loading ? 0.5 : 1 })}>↻ Refresh</button>
            </div>
          </>)}
        </div>
      )}
    </div>
  );
}

export default function RecordActivity({ record, orgInfo, orgFeatures }) {
  const live = !!orgInfo?.isExtension;
  const entity = record.entity;
  const entitySet = record.entitySet || "accounts";
  // Demo: a fake org answering the real loader; live: the bridge. Fixed for this record.
  const env = useMemo(() => {
    if (live) return { query: (set, opts) => bridge.query(set, opts), demo: null };
    const demo = createActivityDemo({ recordId: record.id, entitySet });
    return { query: demo.query, demo };
  }, [live, record.id, entitySet]);
  const loader = useMemo(() => createActivityLoader(env.query), [env]);
  const [open, setOpen] = useState(true);
  const [allSaves, setAllSaves] = useState(() => (env.demo ? env.demo.saves : []));
  useEffect(() => {
    if (!live) return undefined;
    let alive = true;
    bridge.getRecordSaves().then(l => { if (alive) setAllSaves(l || []); }).catch(() => {});
    const off = bridge.onRecordSaves(l => setAllSaves(l));
    return () => { alive = false; off(); };
  }, [live]);
  const saves = useMemo(() => savesForRecord(allSaves, entitySet, record.id), [allSaves, entitySet, record.id]);
  const labels = useMemo(() => Object.fromEntries((record.fields || []).map(f => [f.l, f.d])), [record.fields]);

  // The org's plug-in trace log setting, and a pending revert after a debugging session.
  const [trace, setTrace] = useState({ setting: orgFeatures?.pluginTraceSetting ?? null, orgId: null });
  const [traceErr, setTraceErr] = useState("");
  const [traceBusy, setTraceBusy] = useState(false);
  const [revert, setRevert] = useState(null);
  const [minutes, setMinutes] = useState(30);
  useEffect(() => {
    let alive = true;
    env.query("organizations", { select: "organizationid,plugintracelogsetting", top: "1" })
      .then(d => { const o = (d?.records || [])[0]; if (alive && o) setTrace({ setting: o.plugintracelogsetting, orgId: o.organizationid }); })
      .catch(() => {});
    bridge.getTraceRevert().then(j => { if (alive) setRevert(j); }).catch(() => {});
    return () => { alive = false; };
  }, [env]);

  const logEverything = async () => {
    if (!trace.orgId) return;
    const prev = trace.setting ?? 0;
    const at = Date.now() + minutes * 60000;
    const back = new Date(at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    if (!window.confirm(`Set the plug-in trace log to "All" for ${minutes} minutes?\n\nEvery plug-in execution in the whole org then writes a trace row, for every user — a performance and storage cost. Colvio sets it back to "${TRACE_SETTING[prev]}" at ${back}, as long as this browser stays open.`)) return;
    if (!confirmProd(orgInfo?.isProduction, `Plug-in trace log → All for ${minutes} minutes (org-wide setting).`)) return;
    setTraceBusy(true); setTraceErr("");
    try {
      if (live) await bridge.update("organizations", trace.orgId, { plugintracelogsetting: 2 });
      const job = { orgId: trace.orgId, prev, at };
      await bridge.scheduleTraceRevert(job);
      setRevert(live ? job : { ...job, demo: true });
      setTrace(t => ({ ...t, setting: 2 }));
    } catch (e) { setTraceErr(e.message || String(e)); }
    setTraceBusy(false);
  };
  const revertNow = async () => {
    if (!revert) return;
    setTraceBusy(true); setTraceErr("");
    try {
      if (live) await bridge.update("organizations", revert.orgId, { plugintracelogsetting: revert.prev });
      await bridge.clearTraceRevert();
      setTrace(t => ({ ...t, setting: revert.prev }));
      setRevert(null);
    } catch (e) { setTraceErr(e.message || String(e)); }
    setTraceBusy(false);
  };

  const setting = trace.setting;
  return (
    <div style={{ ...crd({ padding: "12px 16px" }), marginBottom: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span onClick={() => setOpen(o => !o)} style={{ fontWeight: 700, fontSize: 14, cursor: "pointer" }}>⚡ Record activity {open ? "▲" : "▼"}</span>
        <span style={{ fontSize: 12, color: C.txd }}>{saves.length ? `${saves.length} save${saves.length > 1 ? "s" : ""} seen` : "no save seen yet"}</span>
        <span style={{ flex: 1 }} />
        {setting != null && pill(setting === 2 ? C.gn : setting === 1 ? C.yw : C.rd, `Trace log: ${TRACE_SETTING[setting] || setting}`, "Organization › plug-in trace log setting")}
        {revert ? (
          <span style={{ fontSize: 12, color: C.txm, display: "flex", alignItems: "center", gap: 6 }}>
            back to "{TRACE_SETTING[revert.prev]}" at {new Date(revert.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            {revert.lastError && <span style={{ color: C.rd }} title={revert.lastError}>· couldn't revert yet, retrying</span>}
            <button onClick={revertNow} disabled={traceBusy} style={bt(null, { fontSize: 11, padding: "2px 9px" })}>Revert now</button>
          </span>
        ) : setting != null && setting !== 2 && trace.orgId && (
          <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <button onClick={logEverything} disabled={traceBusy} style={bt(C.yw, { fontSize: 11, padding: "3px 10px" })}>{traceBusy ? <Spin s={10} /> : "Log every plug-in"}</button>
            <select value={minutes} onChange={e => setMinutes(+e.target.value)} title="Then back to the current setting" style={inp({ width: "auto", fontSize: 11, padding: "2px 6px" })}>
              {[15, 30, 60].map(m => <option key={m} value={m}>for {m} min</option>)}
            </select>
          </span>
        )}
      </div>
      {traceErr && <div style={{ fontSize: 12, color: C.rd, marginTop: 6 }}>Couldn't change the trace log: {traceErr}</div>}
      {open && (<>
        <div style={{ fontSize: 12, color: C.txd, margin: "4px 0 10px", lineHeight: 1.5 }}>
          What each save of this record triggered — plug-ins, system jobs and cloud flows. Colvio sees the saves made in this browser since it opened (form, ribbon actions, Colvio edits); older ones are in the audit history below.
        </div>
        {saves.length === 0 && <div style={{ fontSize: 12.5, color: C.txm, padding: "6px 0" }}>Save this record in its Dynamics 365 tab — the save appears here with what it triggered.</div>}
        {saves.slice(0, 20).map((s, i) => (
          <SaveCard key={s.key} save={s} next={i > 0 ? saves[i - 1] : null} loader={loader} entity={entity} recordId={record.id}
            labels={labels} traceSetting={setting} defaultOpen={i === 0} orgUrl={live ? orgInfo?.orgUrl : null} envId={live ? orgInfo?.environmentId : null} />
        ))}
        {saves.length > 20 && <div style={{ fontSize: 11.5, color: C.txd }}>Showing the 20 latest saves of {saves.length}.</div>}
      </>)}
    </div>
  );
}
