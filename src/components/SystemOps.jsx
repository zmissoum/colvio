import { useState, useEffect, Fragment } from "react";
import { bridge } from "../d365-bridge.js";
import { C, I, Spin, mono, inp, bt, crd, ths, tds, dl, expName } from "../shared.jsx";
import { t } from "../i18n.js";

// System Ops — two admin panels:
//  • Plugin Traces: the plugintracelog table (enabled via Organization.PluginTraceLogSetting —
//    Off/Exception/All; records auto-deleted after ~24h by a platform bulk-delete job).
//  • System Jobs: asyncoperation monitor. Cancel = PATCH {statecode:3, statuscode:32}
//    (valid from Ready/Suspended/Locked); Resume = {statecode:0} from Suspended.
//    Platform-maintenance jobs can't be cancelled — surfaced per row.
// Docs: learn.microsoft.com/power-apps/developer/data-platform/logging-tracing
//       learn.microsoft.com/power-apps/developer/data-platform/asynchronous-service

const FMT = "@OData.Community.Display.V1.FormattedValue";
const fmtDate = (v) => v ? new Date(v).toLocaleString() : "";

// asyncoperation state/status maps (Microsoft-documented values)
const JOB_FILTERS = [
  { id: "failed",    label: "ops.f_failed",    filter: "statecode eq 3 and statuscode eq 31" },
  { id: "waiting",   label: "ops.f_waiting",   filter: "(statecode eq 0) or (statecode eq 1 and statuscode eq 10)" },
  { id: "running",   label: "ops.f_running",   filter: "statecode eq 2" },
  { id: "canceled",  label: "ops.f_canceled",  filter: "statecode eq 3 and statuscode eq 32" },
  { id: "recent",    label: "ops.f_recent",    filter: "" },
];
const CANCELABLE = (j) => j.statecode === 0 || j.statecode === 1 || j.statecode === 2;
const RESUMABLE = (j) => j.statecode === 1;

function PluginTraces({ bp, orgFeatures }) {
  const [rows, setRows] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [onlyErrors, setOnlyErrors] = useState(false);
  const [search, setSearch] = useState("");
  const [top, setTop] = useState(100);
  const [expanded, setExpanded] = useState(null);

  const load = async () => {
    setLoading(true); setError("");
    try {
      const opts = {
        orderby: "createdon desc", top: String(top),
        select: "plugintracelogid,typename,messagename,primaryentity,mode,operationtype,exceptiondetails,messageblock,performanceexecutionduration,depth,correlationid,createdon",
      };
      if (onlyErrors) opts.filter = "exceptiondetails ne null";
      const data = await bridge.query("plugintracelogs", opts);
      setRows(data?.records || []);
    } catch (e) { setError(e.message); }
    setLoading(false);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [onlyErrors, top]);

  const filtered = (rows || []).filter(r => !search ||
    [r.typename, r.messagename, r.primaryentity].some(v => (v || "").toLowerCase().includes(search.toLowerCase())));

  const exportCsv = () => {
    const esc = (v) => { let s = String(v ?? ""); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g, '""')}"` : s; };
    const head = ["createdon", "typename", "messagename", "primaryentity", "mode", "duration_ms", "exception"].join(",");
    const lines = filtered.map(r => [r.createdon, r.typename, r.messagename, r.primaryentity, r["mode" + FMT] || r.mode, r.performanceexecutionduration, (r.exceptiondetails || "").substring(0, 500)].map(esc).join(","));
    dl("﻿" + [head, ...lines].join("\n"), "text/csv;charset=utf-8", expName("plugin_traces", "csv", true));
  };

  return (
    <div>
      {orgFeatures?.pluginTraceSetting===0&&<div style={{ padding: "10px 14px", background: C.yw + "14", border: `1px solid ${C.yw}44`, borderRadius: 8, color: C.yw, fontSize: 13, marginBottom: 10, lineHeight: 1.6 }}>⚠ {t("featuregate.traces_off")}</div>}
      <div style={{ fontSize: 12, color: C.txd, marginBottom: 10, lineHeight: 1.6 }}>{t("ops.traces_hint")}</div>
      <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap", alignItems: "center" }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder={t("ops.traces_search")} style={inp({ fontSize: 13, maxWidth: 260 })} />
        <label style={{ fontSize: 12.5, color: C.txm, display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}>
          <input type="checkbox" checked={onlyErrors} onChange={e => setOnlyErrors(e.target.checked)} style={{ accentColor: C.rd }} />
          {t("ops.only_exceptions")}
        </label>
        <select value={top} onChange={e => setTop(+e.target.value)} style={inp({ width: "auto", fontSize: 12, padding: "5px 8px" })}>
          <option value={50}>Top 50</option><option value={100}>Top 100</option><option value={200}>Top 200</option>
        </select>
        <button onClick={load} style={bt(null, { fontSize: 12 })}>↻</button>
        {filtered.length > 0 && <button onClick={exportCsv} style={bt(null, { fontSize: 12 })}><I.Download /> CSV</button>}
      </div>
      {loading && <div style={{ textAlign: "center", marginTop: 24 }}><Spin s={18} /></div>}
      {error && <div style={{ color: C.rd, fontSize: 13, ...crd({ padding: 12 }) }}>{error}{error.includes("privilege") || error.includes("403") ? ` — ${t("ops.traces_priv_hint")}` : ""}</div>}
      {rows && !loading && filtered.length === 0 && <div style={{ color: C.txd, fontSize: 13, textAlign: "center", marginTop: 24 }}>{t("ops.traces_empty")}</div>}
      {!loading && filtered.length > 0 && (
        <div style={{ ...crd({ padding: 0, overflow: "hidden" }) }}>
          <div style={{ maxHeight: 480, overflow: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
              <thead><tr style={{ background: C.bg, position: "sticky", top: 0, zIndex: 1 }}>
                <th style={ths()}>{t("ops.col_when")}</th><th style={ths()}>Plug-in</th><th style={ths()}>Message</th>
                <th style={ths()}>{t("ops.col_entity")}</th><th style={ths()}>Mode</th><th style={ths()}>ms</th><th style={ths()}></th>
              </tr></thead>
              <tbody>{filtered.map(r => {
                const isEx = expanded === r.plugintracelogid;
                const hasErr = !!r.exceptiondetails;
                return (
                  <Fragment key={r.plugintracelogid}>
                    <tr onClick={() => setExpanded(isEx ? null : r.plugintracelogid)}
                      style={{ borderBottom: `1px solid ${C.bd}33`, cursor: "pointer", background: isEx ? C.vi + "11" : "transparent" }}>
                      <td style={{ ...tds, whiteSpace: "nowrap", fontSize: 11.5 }}>{isEx ? "▾" : "▸"} {fmtDate(r.createdon)}</td>
                      <td style={{ ...tds, ...mono, fontSize: 11.5, maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis" }} title={r.typename}>{(r.typename || "").split(",")[0]}</td>
                      <td style={tds}>{r.messagename}</td>
                      <td style={{ ...tds, ...mono, fontSize: 11.5 }}>{r.primaryentity}</td>
                      <td style={tds}>{r["mode" + FMT] || (r.mode === 1 ? "Async" : "Sync")}</td>
                      <td style={{ ...tds, textAlign: "right", color: (r.performanceexecutionduration || 0) > 2000 ? C.or : C.txm }}>{r.performanceexecutionduration ?? ""}</td>
                      <td style={tds}>{hasErr && <span style={{ fontSize: 10.5, padding: "1px 7px", borderRadius: 3, background: C.rd + "22", color: C.rd, fontWeight: 700 }}>EXC</span>}</td>
                    </tr>
                    {isEx && (
                      <tr style={{ background: C.bg }}><td colSpan={7} style={{ padding: "8px 14px", borderBottom: `1px solid ${C.bd}` }}>
                        {r.exceptiondetails && <><div style={{ fontSize: 11, fontWeight: 700, color: C.rd, marginBottom: 4 }}>Exception</div>
                          <pre style={{ ...mono, fontSize: 11, color: C.rd, whiteSpace: "pre-wrap", maxHeight: 180, overflow: "auto", margin: "0 0 8px" }}>{r.exceptiondetails}</pre></>}
                        <div style={{ fontSize: 11, fontWeight: 700, color: C.txm, marginBottom: 4 }}>Trace (10 KB max, oldest lines trimmed by the platform)</div>
                        <pre style={{ ...mono, fontSize: 11, color: C.txm, whiteSpace: "pre-wrap", maxHeight: 220, overflow: "auto", margin: 0 }}>{r.messageblock || "(empty)"}</pre>
                        <div style={{ fontSize: 10.5, color: C.txd, marginTop: 6, ...mono }}>correlation: {r.correlationid} · depth: {r.depth}</div>
                      </td></tr>
                    )}
                  </Fragment>
                );
              })}</tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function SystemJobs({ bp, isAdmin }) {
  const [filterId, setFilterId] = useState("failed");
  const [rows, setRows] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(new Set());
  const [acting, setActing] = useState(null);  // {done,total,verb}
  const [actResults, setActResults] = useState(null);
  const [expanded, setExpanded] = useState(null);

  const load = async (fid = filterId) => {
    setLoading(true); setError(""); setSelected(new Set()); setActResults(null);
    try {
      const f = JOB_FILTERS.find(x => x.id === fid);
      const opts = {
        orderby: "createdon desc", top: "100",
        select: "asyncoperationid,name,operationtype,statecode,statuscode,startedon,completedon,createdon,retrycount,friendlymessage",
      };
      if (f?.filter) opts.filter = f.filter;
      const data = await bridge.query("asyncoperations", opts);
      setRows(data?.records || []);
    } catch (e) { setError(e.message); }
    setLoading(false);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [filterId]);

  // Cancel = statecode 3 / statuscode 32; Resume = statecode 0 (from Suspended).
  const act = async (verb) => {
    const targets = rows.filter(j => selected.has(j.asyncoperationid) && (verb === "cancel" ? CANCELABLE(j) : RESUMABLE(j)));
    if (!targets.length) return;
    setActing({ done: 0, total: targets.length, verb });
    const out = [];
    for (const j of targets) {
      try {
        await bridge.update("asyncoperations", j.asyncoperationid, verb === "cancel" ? { statecode: 3, statuscode: 32 } : { statecode: 0 });
        out.push({ name: j.name, ok: true });
      } catch (e) {
        out.push({ name: j.name, ok: false, error: (e.message || "").includes("platform") || (e.message || "").includes("system") ? t("ops.platform_job_hint") : e.message });
      }
      setActing({ done: out.length, total: targets.length, verb });
    }
    setActing(null); setActResults(out);
    load();
  };

  const stBadge = (j) => {
    const label = j["statuscode" + FMT] || j.statuscode;
    const c = j.statuscode === 31 ? C.rd : j.statuscode === 30 ? C.gn : j.statuscode === 32 ? C.txd : j.statecode === 2 ? C.cy : C.yw;
    return <span style={{ fontSize: 10.5, padding: "2px 8px", borderRadius: 3, background: c + "22", color: c, fontWeight: 700 }}>{label}</span>;
  };

  return (
    <div>
      <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap", alignItems: "center" }}>
        {JOB_FILTERS.map(f => (
          <button key={f.id} onClick={() => setFilterId(f.id)}
            style={{ padding: "4px 12px", fontSize: 12, borderRadius: 12, cursor: "pointer", fontWeight: 600, border: `1px solid ${filterId === f.id ? C.vi : C.bd}`, background: filterId === f.id ? C.vi + "22" : "transparent", color: filterId === f.id ? C.tx : C.txm }}>
            {t(f.label)}
          </button>
        ))}
        <button onClick={() => load()} style={bt(null, { fontSize: 12 })}>↻</button>
        {selected.size > 0 && !acting && isAdmin && (
          <>
            <button onClick={() => act("cancel")} style={bt(null, { fontSize: 12, color: C.rd, borderColor: C.rd + "66" })}>⏹ {t("ops.cancel_jobs")} ({[...selected].filter(id => CANCELABLE(rows.find(j => j.asyncoperationid === id) || {})).length})</button>
            <button onClick={() => act("resume")} style={bt(null, { fontSize: 12, color: C.gn, borderColor: C.gn + "66" })}>▶ {t("ops.resume_jobs")} ({[...selected].filter(id => RESUMABLE(rows.find(j => j.asyncoperationid === id) || {})).length})</button>
          </>
        )}
        {acting && <span style={{ fontSize: 12.5, color: C.cy, fontWeight: 600 }}><Spin s={12} /> {acting.verb} {acting.done}/{acting.total}…</span>}
      </div>
      {actResults && (
        <div style={{ ...crd({ padding: 10 }), marginBottom: 10, fontSize: 12 }}>
          <b>{actResults.filter(r => r.ok).length}/{actResults.length} OK</b>
          {actResults.filter(r => !r.ok).map((r, i) => <div key={i} style={{ color: C.rd }}>✗ {r.name} — {r.error}</div>)}
        </div>
      )}
      {!isAdmin && <div style={{ fontSize: 11.5, color: C.txd, marginBottom: 8 }}>{t("ops.jobs_readonly_hint")}</div>}
      {loading && <div style={{ textAlign: "center", marginTop: 24 }}><Spin s={18} /></div>}
      {error && <div style={{ color: C.rd, fontSize: 13, ...crd({ padding: 12 }) }}>{error}</div>}
      {rows && !loading && rows.length === 0 && <div style={{ color: C.txd, fontSize: 13, textAlign: "center", marginTop: 24 }}>{t("ops.jobs_empty")}</div>}
      {!loading && rows && rows.length > 0 && (
        <div style={{ ...crd({ padding: 0, overflow: "hidden" }) }}>
          <div style={{ maxHeight: 480, overflow: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
              <thead><tr style={{ background: C.bg, position: "sticky", top: 0, zIndex: 1 }}>
                <th style={{ ...ths(), width: 28 }}><input type="checkbox" checked={rows.length > 0 && selected.size === rows.length} onChange={() => setSelected(selected.size === rows.length ? new Set() : new Set(rows.map(j => j.asyncoperationid)))} style={{ accentColor: C.vi }} /></th>
                <th style={ths()}>{t("ops.col_job")}</th><th style={ths()}>Type</th><th style={ths()}>{t("ops.col_status")}</th>
                <th style={ths()}>{t("ops.col_created")}</th><th style={ths()}>Retry</th>
              </tr></thead>
              <tbody>{rows.map(j => {
                const isEx = expanded === j.asyncoperationid;
                return (
                  <Fragment key={j.asyncoperationid}>
                    <tr onClick={() => setExpanded(isEx ? null : j.asyncoperationid)} style={{ borderBottom: `1px solid ${C.bd}33`, cursor: "pointer", background: selected.has(j.asyncoperationid) ? C.vi + "11" : "transparent" }}>
                      <td style={{ ...tds, width: 28 }} onClick={e => e.stopPropagation()}>
                        <input type="checkbox" checked={selected.has(j.asyncoperationid)} onChange={() => setSelected(p => { const s = new Set(p); s.has(j.asyncoperationid) ? s.delete(j.asyncoperationid) : s.add(j.asyncoperationid); return s; })} style={{ accentColor: C.vi }} />
                      </td>
                      <td style={{ ...tds, maxWidth: 320, overflow: "hidden", textOverflow: "ellipsis" }} title={j.name}>{j.name}</td>
                      <td style={{ ...tds, fontSize: 11.5, color: C.txm }}>{j["operationtype" + FMT] || j.operationtype}</td>
                      <td style={tds}>{stBadge(j)}</td>
                      <td style={{ ...tds, fontSize: 11.5, whiteSpace: "nowrap" }}>{fmtDate(j.createdon)}</td>
                      <td style={{ ...tds, textAlign: "right" }}>{j.retrycount ?? 0}</td>
                    </tr>
                    {isEx && (
                      <tr style={{ background: C.bg }}><td colSpan={6} style={{ padding: "8px 14px", borderBottom: `1px solid ${C.bd}`, fontSize: 12 }}>
                        <div style={{ color: C.txm, marginBottom: 4 }}>{t("ops.col_started")}: {fmtDate(j.startedon) || "—"} · {t("ops.col_completed")}: {fmtDate(j.completedon) || "—"}</div>
                        {j.friendlymessage && <pre style={{ ...mono, fontSize: 11, color: C.txm, whiteSpace: "pre-wrap", maxHeight: 160, overflow: "auto", margin: 0 }}>{j.friendlymessage}</pre>}
                      </td></tr>
                    )}
                  </Fragment>
                );
              })}</tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

export default function SystemOps({ bp, orgInfo, theme, permissions, orgFeatures }) {
  const [panel, setPanel] = useState("jobs");
  const isAdmin = permissions?.canBypassPlugins === true; // job cancel/resume needs write on asyncoperation — sysadmin proxy
  return (
    <div style={{ padding: bp.mobile ? 12 : 20, maxWidth: bp.mobile ? "100%" : 1500, margin: "0 auto" }}>
      <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 4, display: "flex", alignItems: "center", gap: 8 }}><I.Zap /> {t("ops.title")}</h2>
      <p style={{ color: C.txm, fontSize: 14, marginBottom: 12 }}>{t("ops.subtitle")}</p>
      <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
        {[["jobs", t("ops.tab_jobs")], ["traces", t("ops.tab_traces")]].map(([id, label]) => (
          <button key={id} onClick={() => setPanel(id)}
            style={{ padding: "6px 16px", fontSize: 13, fontWeight: 600, borderRadius: 6, cursor: "pointer", border: `1px solid ${panel === id ? C.vi : C.bd}`, background: panel === id ? C.vi + "22" : "transparent", color: panel === id ? C.tx : C.txm }}>
            {label}
          </button>
        ))}
      </div>
      {panel === "traces" ? <PluginTraces bp={bp} orgFeatures={orgFeatures} /> : <SystemJobs bp={bp} isAdmin={isAdmin} />}
    </div>
  );
}
