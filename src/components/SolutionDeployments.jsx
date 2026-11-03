import { useState, useEffect, useMemo, useRef } from "react";
import { bridge } from "../d365-bridge.js";
import { C, Spin, mono, inp, bt, exportTable, dl, expName } from "../shared.jsx";
import { buildDeployments, deploymentSummary, versionLadder, filterDeployments, DEPLOY_HEADERS, deploymentExportRows, parseImportLog, fmtDuration, OPERATION, MAIN_OPERATIONS } from "../solutionHistory.js";

// Solutions › 🚀 Deployments — every solution operation the environment recorded (import,
// export, uninstall, publish…) with its date, version, duration, result, error and who started
// it. Two sources joined in solutionHistory.js: Dataverse's solution history (purged after 180
// days, no "who") and the import jobs (the user who started each import, kept longer, the log).
// Read-only; one paged read of each source, the import log of one job on demand.
const when = (iso) => { const d = iso ? new Date(iso) : null; return d && !Number.isNaN(d.getTime()) ? d.toLocaleString() : ""; };
const day = (iso) => { const d = iso ? new Date(iso) : null; return d && !Number.isNaN(d.getTime()) ? d.toLocaleDateString() : ""; };
const Chip = ({ color, children, title }) => <span title={title} style={{ fontSize: 10.5, padding: "1px 6px", borderRadius: 4, fontWeight: 600, whiteSpace: "nowrap", background: color + "22", color }}>{children}</span>;
const Result = ({ r }) => r.result === true ? <Chip color={C.gn}>Success</Chip> : r.result === false ? <Chip color={C.rd}>Failed</Chip> : r.status === 2 ? <Chip color={C.txd}>Queued</Chip> : r.status === 0 && !r.end ? <Chip color={C.yw}>Running</Chip> : <Chip color={C.txd} title="The source doesn't say">—</Chip>;
const OPS = [["main", "Imports, exports, uninstalls"], ["all", "Every operation"], [0, "Imports"], [2, "Exports"], [1, "Uninstalls"], [3, "Publish"], [4, "Publish all"]];
const PERIODS = [[0, "All time"], [7, "7 days"], [30, "30 days"], [90, "90 days"], [180, "180 days"]];

export default function SolutionDeployments({ initialSolution = "", onClose }) {
  const [st, setSt] = useState({ phase: "loading" });
  const [f, setF] = useState({ q: "", operation: "main", result: "all", days: 0, solution: initialSolution || "" });
  const [view, setView] = useState("timeline");
  const [open, setOpen] = useState({});
  const [logs, setLogs] = useState({}); // job id → { phase, parsed, data, error }
  const gen = useRef(0);
  const load = async () => {
    const my = ++gen.current;
    setSt({ phase: "loading" });
    try {
      const raw = await bridge.getSolutionHistory();
      if (gen.current !== my) return;
      const b = buildDeployments({ history: raw?.history, jobs: raw?.jobs });
      setSt({ phase: "done", rows: b.rows, matched: b.matched, orphanJobs: b.orphanJobs, historyError: raw?.historyError || "", jobsError: raw?.jobsError || "", all: deploymentSummary(b.rows) });
    } catch (e) { if (gen.current === my) setSt({ phase: "error", error: e.message || String(e) }); }
  };
  useEffect(() => { load(); return () => { gen.current++; }; }, []);
  useEffect(() => { const h = e => { if (e.key === "Escape") onClose(); }; window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h); }, [onClose]);

  const rows = useMemo(() => (st.phase === "done" ? filterDeployments(st.rows, f) : []), [st, f]);
  const sum = useMemo(() => deploymentSummary(rows), [rows]);
  // the ladders describe each solution's whole recorded history: only the solution filter applies
  const ladderRows = useMemo(() => (st.phase === "done" ? filterDeployments(st.rows, { operation: "all", solution: f.solution }) : []), [st, f.solution]);
  const ladder = useMemo(() => versionLadder(ladderRows), [ladderRows]);
  const solutions = useMemo(() => (st.phase === "done" ? [...new Set(st.rows.map(r => r.solution).filter(Boolean))].sort((a, b) => a.localeCompare(b)) : []), [st]);
  const set = (k, v) => setF(x => ({ ...x, [k]: v }));
  const exp = (fmt) => exportTable(DEPLOY_HEADERS, deploymentExportRows(rows), "solution_deployments", fmt, "Deployments");

  // the import log of one job, read once, parsed for its result and the components that failed
  const loadLog = async (job) => {
    if (!job || logs[job.id]) return;
    setLogs(l => ({ ...l, [job.id]: { phase: "loading" } }));
    try {
      const r = await bridge.getImportJobLog(job.id);
      setLogs(l => ({ ...l, [job.id]: { phase: "done", parsed: parseImportLog(r?.data), data: r?.data || "" } }));
    } catch (e) { setLogs(l => ({ ...l, [job.id]: { phase: "error", error: e.message || String(e) } })); }
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,.55)" }} onClick={onClose}>
      <div style={{ width: 1100, maxWidth: "96vw", maxHeight: "90vh", display: "flex", flexDirection: "column", background: C.sf, border: `1px solid ${C.bd}`, borderRadius: 10, boxShadow: "0 16px 48px rgba(0,0,0,.5)" }} onClick={e => e.stopPropagation()}>
        <div style={{ padding: "14px 18px 10px", borderBottom: `1px solid ${C.bd}`, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontWeight: 700, fontSize: 15, flex: 1, minWidth: 220 }}>🚀 Deployments <span style={{ fontSize: 12, color: C.txd, fontWeight: 400 }}>· every solution import, export and uninstall — when, which version, how long, the result, who</span></span>
          {st.phase === "done" && <>
            {[["timeline", "Timeline"], ["solutions", "By solution"]].map(([k, l]) => <button key={k} onClick={() => setView(k)} style={{ padding: "4px 11px", fontSize: 12, border: `1px solid ${view === k ? C.vi : C.bd}`, borderRadius: 5, cursor: "pointer", background: view === k ? C.vi + "22" : "transparent", color: view === k ? C.vi : C.txm, fontWeight: view === k ? 600 : 400 }}>{l}</button>)}
            <button onClick={() => exp("csv")} style={bt(null, { fontSize: 12 })}>CSV</button><button onClick={() => exp("xlsx")} style={bt(null, { fontSize: 12 })}>Excel</button>
          </>}
          <button onClick={onClose} style={{ background: "none", border: "none", color: C.txd, cursor: "pointer", padding: 4, fontSize: 16 }}>✕</button>
        </div>
        {st.phase === "done" && <div style={{ padding: "8px 18px", borderBottom: `1px solid ${C.bd}`, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <input value={f.q} onChange={e => set("q", e.target.value)} placeholder="🔍 Solution, version, who, error…" style={inp({ width: 220, fontSize: 12.5, padding: "5px 9px" })} />
          <select value={f.solution} onChange={e => set("solution", e.target.value)} style={inp({ width: "auto", maxWidth: 240, fontSize: 12, padding: "5px 8px" })}>
            <option value="">All solutions ({solutions.length})</option>
            {solutions.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select value={String(f.operation)} onChange={e => set("operation", e.target.value === "main" || e.target.value === "all" ? e.target.value : Number(e.target.value))} style={inp({ width: "auto", fontSize: 12, padding: "5px 8px" })}>
            {OPS.map(([k, l]) => <option key={String(k)} value={String(k)}>{l}</option>)}
          </select>
          <select value={f.result} onChange={e => set("result", e.target.value)} style={inp({ width: "auto", fontSize: 12, padding: "5px 8px" })}>
            <option value="all">Any result</option><option value="ok">Succeeded</option><option value="failed">Failed</option>
          </select>
          <select value={String(f.days)} onChange={e => set("days", Number(e.target.value))} style={inp({ width: "auto", fontSize: 12, padding: "5px 8px" })}>
            {PERIODS.map(([k, l]) => <option key={k} value={String(k)}>{l}</option>)}
          </select>
          <span style={{ fontSize: 11, color: C.txd, ...mono }}>{rows.length.toLocaleString()} of {st.rows.length.toLocaleString()}</span>
          <span style={{ flex: 1 }} />
          <button onClick={load} title="Read the history and the import jobs again" style={bt(null, { fontSize: 11, padding: "3px 9px" })}>↻</button>
        </div>}
        <div style={{ flex: 1, overflow: "auto", padding: "10px 18px" }}>
          {st.phase === "loading" && <div style={{ display: "flex", alignItems: "center", gap: 8, color: C.txm, fontSize: 13 }}><Spin s={12} /> Reading the solution history and the import jobs…</div>}
          {st.phase === "error" && <div style={{ color: C.rd, fontSize: 13 }}>Couldn't read the deployments: {st.error} <button onClick={load} style={{ ...bt(null, { fontSize: 12 }), marginLeft: 8 }}>↻ Retry</button></div>}
          {st.phase === "done" && <>
            <div style={{ fontSize: 12.5, color: C.txm, marginBottom: 10, lineHeight: 1.6 }}>
              <b style={{ color: C.tx }}>{sum.total.toLocaleString()}</b> operation{sum.total === 1 ? "" : "s"} · <b style={{ color: C.tx }}>{sum.imports}</b> import{sum.imports === 1 ? "" : "s"} · {sum.exports} export{sum.exports === 1 ? "" : "s"} · {sum.uninstalls} uninstall{sum.uninstalls === 1 ? "" : "s"} · <b style={{ color: C.tx }}>{sum.solutions}</b> solution{sum.solutions === 1 ? "" : "s"}
              {sum.failures > 0 && <> · <span style={{ color: C.rd }}>{sum.failures} failed</span></>}
              {sum.overwrites > 0 && <> · <span style={{ color: C.yw }}>{sum.overwrites} overwrote customizations</span></>}
              {sum.last != null && <> · last {day(new Date(sum.last).toISOString())}</>}
              {sum.oldest != null && <> · oldest {day(new Date(sum.oldest).toISOString())}</>}
              <br />
              {st.historyError ? <span style={{ color: C.rd }}>Solution history not readable ({st.historyError}) — import jobs only. </span> : <span style={{ color: C.txd }}>Solution history: {st.rows.filter(r => r.source === "history").length} rows (Dataverse keeps 180 days). </span>}
              {st.jobsError ? <span style={{ color: C.rd }}>Import jobs not readable ({st.jobsError}) — no "who". </span> : <span style={{ color: C.txd }}>Import jobs: {st.matched} matched to an import{st.orphanJobs ? `, ${st.orphanJobs} older or unrecorded (shown as import-job rows)` : ""}.</span>}
            </div>
            {(view === "timeline" ? rows : ladder).length === 0 && <div style={{ color: C.txd, fontSize: 13 }}>No operation matches.</div>}
            {view === "solutions" && ladder.length > 0 && <div style={{ fontSize: 11.5, color: C.txd, marginBottom: 8 }}>Each solution's whole recorded history — the text, operation, result and period filters don't apply here.</div>}
            {view === "timeline" && rows.length > 0 && (
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
                <thead><tr>{["When", "Solution", "Version", "Operation", "Result", "By", "Notes"].map(h => <th key={h} style={{ padding: "5px 8px", textAlign: "left", borderBottom: `2px solid ${C.bd}`, color: C.txd, fontWeight: 600, fontSize: 11.5, position: "sticky", top: 0, background: C.sf, whiteSpace: "nowrap" }}>{h}</th>)}</tr></thead>
                <tbody>{rows.map(r => {
                  const isOpen = !!open[r.id], lg = r.job ? logs[r.job.id] : null;
                  return (
                    <RowGroup key={r.id} r={r} isOpen={isOpen} toggle={() => setOpen(o => ({ ...o, [r.id]: !o[r.id] }))} log={lg} loadLog={loadLog} />
                  );
                })}</tbody>
              </table>
            )}
            {view === "solutions" && ladder.map(g => (
              <div key={g.solution} style={{ borderLeft: `3px solid ${g.failures ? C.yw : g.removed ? C.txd : C.gn}`, background: C.bg, borderRadius: 4, padding: "8px 12px", marginBottom: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <b style={{ fontSize: 13 }}>{g.solution}</b>
                  {g.publisher && <span style={{ fontSize: 11.5, color: C.txd }}>{g.publisher}</span>}
                  {g.removed ? <Chip color={C.txd}>uninstalled</Chip> : g.current ? <Chip color={C.gn} title="The version of the last successful import">v{g.current}</Chip> : null}
                  {g.managed != null && <Chip color={g.managed ? C.vi : C.gn}>{g.managed ? "managed" : "unmanaged"}</Chip>}
                  <span style={{ flex: 1 }} />
                  <span style={{ fontSize: 11.5, color: C.txd }}>{g.imports} import{g.imports === 1 ? "" : "s"}{g.failures ? ` · ${g.failures} failed` : ""}{g.last != null ? ` · last ${day(new Date(g.last).toISOString())}` : ""}</span>
                </div>
                <div style={{ marginTop: 6, marginLeft: 4, display: "grid", gridTemplateColumns: "max-content max-content max-content max-content 1fr", gap: "3px 12px", fontSize: 12, alignItems: "baseline" }}>
                  {g.entries.map(e => <RowLadder key={e.id} e={e} />)}
                </div>
              </div>
            ))}
          </>}
        </div>
        <div style={{ padding: "8px 18px", borderTop: `1px solid ${C.bd}`, fontSize: 11.5, color: C.txd, lineHeight: 1.5 }}>
          Read-only. The <b>solution history</b> is Dataverse's own record of every solution operation (its result, timing and error) — Dataverse deletes it after 180 days and it doesn't say who started the operation. The <b>import jobs</b> give the user who started each import and are kept longer: each import is matched to the job started closest to it (same solution, within 15 minutes), and the jobs with no history row are shown on their own. Exports, uninstalls and publishes have no job, so no "who".
        </div>
      </div>
    </div>
  );
}

function RowGroup({ r, isOpen, toggle, log, loadLog }) {
  return (
    <>
      <tr onClick={toggle} style={{ borderBottom: `1px solid ${C.bd}22`, cursor: "pointer", verticalAlign: "top", background: isOpen ? C.bg : "transparent" }} title={isOpen ? "Hide the details" : "Show the details"}>
        <td style={{ padding: "5px 8px", whiteSpace: "nowrap" }}><div>{when(r.start)}</div><div style={{ fontSize: 11, color: C.txd }}>{r.seconds != null ? fmtDuration(r.seconds) : r.end ? "" : "—"}</div></td>
        <td style={{ padding: "5px 8px" }}><div style={{ fontWeight: 600 }}>{r.solution || <span style={{ color: C.txd }}>?</span>}</div>{r.publisher && <div style={{ fontSize: 11, color: C.txd }}>{r.publisher}</div>}</td>
        <td style={{ padding: "5px 8px", whiteSpace: "nowrap" }}><span style={mono}>{r.version}</span>{r.managed === true && <> <Chip color={C.vi}>managed</Chip></>}{r.managed === false && <> <Chip color={C.gn}>unmanaged</Chip></>}{r.patch === true && <> <Chip color={C.cy}>patch</Chip></>}</td>
        <td style={{ padding: "5px 8px", whiteSpace: "nowrap" }}>{r.operationLabel}{r.suboperationLabel ? <span style={{ color: C.txd }}> · {r.suboperationLabel}</span> : ""}</td>
        <td style={{ padding: "5px 8px" }}><Result r={r} /></td>
        <td style={{ padding: "5px 8px" }}>{r.by || <span style={{ color: C.txd }} title={r.operation === 0 ? "No import job matched this import" : "Only imports have a job, hence a who"}>—</span>}</td>
        <td style={{ padding: "5px 8px", fontSize: 12, lineHeight: 1.4 }}>{r.flags.map((x, i) => <div key={i} style={{ color: x.level === "error" ? C.rd : x.level === "warn" ? C.yw : C.txd }}>{x.level === "info" ? "ℹ " : "⚠ "}{x.text}</div>)}</td>
      </tr>
      {isOpen && <tr><td colSpan={7} style={{ padding: "6px 12px 12px 28px", background: C.bg, fontSize: 12, lineHeight: 1.6 }}>
        <div style={{ display: "grid", gridTemplateColumns: "max-content 1fr", gap: "2px 12px" }}>
          <span style={{ color: C.txd }}>Started</span><span>{when(r.start) || "—"}</span>
          <span style={{ color: C.txd }}>Ended</span><span>{when(r.end) || "—"}{r.seconds != null ? ` · ${fmtDuration(r.seconds)}` : ""}</span>
          {r.source === "history" && <><span style={{ color: C.txd }}>Status</span><span>{r.statusLabel || "—"}{r.overwrite != null ? ` · overwrite customizations: ${r.overwrite ? "yes" : "no"}` : ""}</span></>}
          {(r.packageName || r.packageVersion) && <><span style={{ color: C.txd }}>Package</span><span style={mono}>{r.packageName}{r.packageVersion ? ` v${r.packageVersion}` : ""}</span></>}
          {r.description && <><span style={{ color: C.txd }}>Description</span><span>{r.description}</span></>}
          {r.error && <><span style={{ color: C.rd }}>Error{r.errorCode ? ` ${r.errorCode}` : ""}</span><span style={{ color: C.rd, whiteSpace: "pre-wrap" }}>{r.error}</span></>}
          {r.activityId && <><span style={{ color: C.txd }}>Activity id</span><span style={mono} title="For Microsoft support">{r.activityId}</span></>}
          {r.job ? <>
            <span style={{ color: C.txd }}>Import job</span>
            <span>{r.job.by || "?"}{r.job.onBehalfOf ? ` (on behalf of ${r.job.onBehalfOf})` : ""} · started {when(r.job.started || r.job.created) || "?"}{r.job.completed ? ` · completed ${when(r.job.completed)}` : " · not completed"}{r.job.progress != null ? ` · ${r.job.progress}%` : ""}{r.matchMinutes != null && r.matchMinutes > 1 ? ` · matched ${r.matchMinutes} min apart` : ""}
              {!log && <button onClick={e => { e.stopPropagation(); loadLog(r.job); }} style={{ ...bt(null, { fontSize: 11, padding: "2px 8px" }), marginLeft: 8 }} title="Read this job's import log (one read; it can be large)">Load the import log</button>}
              {log?.phase === "loading" && <span style={{ marginLeft: 8 }}><Spin s={10} /></span>}
              {log?.phase === "error" && <span style={{ color: C.rd, marginLeft: 8 }}>log not readable: {log.error}</span>}
              {log?.phase === "done" && (log.parsed ? <div style={{ marginTop: 4 }}>
                <span style={{ color: log.parsed.ok ? C.gn : log.parsed.failures.length ? C.rd : C.txd }}>{log.parsed.ok ? `Log: ${log.parsed.results} results, no failure` : log.parsed.failures.length ? `Log: ${log.parsed.failures.length} failure${log.parsed.failures.length === 1 ? "" : "s"} of ${log.parsed.results} results` : `Log: ${log.parsed.results} results`}</span>
                {log.parsed.failures.slice(0, 20).map((x, i) => <div key={i} style={{ color: C.rd, marginLeft: 8 }}>• {x.errorCode ? `${x.errorCode} ` : ""}{x.errorText || "failure"}</div>)}
                {log.parsed.failures.length > 20 && <div style={{ color: C.txd, marginLeft: 8 }}>… {log.parsed.failures.length - 20} more in the file</div>}
                <button onClick={e => { e.stopPropagation(); dl(log.data, "application/xml", expName(`import_log_${(r.solution || "solution").replace(/[^a-z0-9_-]+/gi, "_")}`, "xml", true)); }} style={{ ...bt(null, { fontSize: 11, padding: "2px 8px" }), marginTop: 4 }}>Download the XML ({Math.max(1, Math.round(log.parsed.bytes / 1024))} KB)</button>
              </div> : <span style={{ color: C.txd, marginLeft: 8 }}>empty log</span>)}
            </span>
          </> : r.operation === 0 ? <><span style={{ color: C.txd }}>Import job</span><span style={{ color: C.txd }}>none matched (started by whom: unknown)</span></> : null}
        </div>
      </td></tr>}
    </>
  );
}

function RowLadder({ e }) {
  return (
    <>
      <span style={{ color: C.txd, whiteSpace: "nowrap" }}>{day(e.start)}</span>
      <span style={{ whiteSpace: "nowrap" }}>{e.operationLabel}{e.suboperationLabel ? <span style={{ color: C.txd }}> · {e.suboperationLabel}</span> : ""}</span>
      <span style={{ ...mono, whiteSpace: "nowrap" }}>{e.version || <span style={{ color: C.txd }}>—</span>}{e.patch ? " (patch)" : ""}</span>
      <span><Result r={e} /></span>
      <span style={{ color: C.txm }}>{e.by || ""}{e.overwrite ? <span style={{ color: C.yw }}> ⚠ overwrote customizations</span> : ""}{e.source === "importjob" ? <span style={{ color: C.txd }}> · import job only</span> : ""}</span>
    </>
  );
}

export { OPERATION, MAIN_OPERATIONS };
