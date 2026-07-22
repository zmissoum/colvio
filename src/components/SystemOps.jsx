import { useState, useEffect, useRef, Fragment } from "react";
import { bridge } from "../d365-bridge.js";
import { C, I, Spin, mono, inp, bt, crd, ths, tds, exportTable, confirmProd } from "../shared.jsx";
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

// Escape a single-quoted OData string literal (double the quotes). The query path is percent-
// encoded by fetch(), so only the OData-level quote needs handling.
const odEsc = (s) => String(s).replace(/'/g, "''");
// createdon range → OData conditions. The "to" date includes the whole day.
const dateConds = (col, from, to) => {
  const p = [];
  if (from) p.push(`${col} ge ${from}T00:00:00Z`);
  if (to) p.push(`${col} le ${to}T23:59:59Z`);
  return p;
};

function PluginTraces({ bp, orgFeatures, theme }) {
  const [rows, setRows] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [onlyErrors, setOnlyErrors] = useState(false);
  const [search, setSearch] = useState("");
  // Quick time windows instead of a date-range picker: the platform purges traces after ~24h,
  // so calendar dates are pointless here — "how far back within today" is the real question.
  const [win, setWin] = useState("");   // minutes back; "" = everything still retained
  const [minMs, setMinMs] = useState("");
  const [pageSize, setPageSize] = useState(100);
  const [nextLink, setNextLink] = useState(null);   // @odata.nextLink → another page exists
  const [loadingMore, setLoadingMore] = useState(false);
  const [expanded, setExpanded] = useState(null);

  const SELECT = "plugintracelogid,typename,messagename,primaryentity,mode,operationtype,exceptiondetails,messageblock,performanceexecutionduration,depth,correlationid,createdon";

  // All filters run SERVER-side (the plugintracelog table is small — auto-purged after ~24h — so
  // contains() is cheap here) so search/date span the whole table, not just the loaded pages.
  const buildFilter = () => {
    const f = [];
    if (onlyErrors) f.push("exceptiondetails ne null");
    const s = search.trim();
    if (s) f.push(`(contains(typename,'${odEsc(s)}') or contains(messagename,'${odEsc(s)}') or contains(primaryentity,'${odEsc(s)}'))`);
    const mins = parseInt(win, 10);
    if (mins > 0) f.push(`createdon ge ${new Date(Date.now() - mins * 60000).toISOString()}`);
    const ms = parseInt(minMs, 10);
    if (ms > 0) f.push(`performanceexecutionduration gt ${ms}`);
    return f.join(" and ");
  };

  const load = async () => {
    setLoading(true); setError(""); setExpanded(null);
    try {
      // maxpagesize (not $top) → server-driven paging: returns one page + a nextLink when there's more.
      const opts = { orderby: "createdon desc", maxpagesize: String(pageSize), select: SELECT };
      const filter = buildFilter();
      if (filter) opts.filter = filter;
      const data = await bridge.query("plugintracelogs", opts);
      setRows(data?.records || []);
      setNextLink(data?.nextLink || null);
    } catch (e) { setError(e.message); setRows([]); setNextLink(null); }
    setLoading(false);
  };
  // Append the next page (follow @odata.nextLink) — the nextLink carries the same $filter, so
  // appended rows already match. Everything stays loaded for CSV export.
  const loadMore = async () => {
    if (!nextLink || loadingMore) return;
    setLoadingMore(true);
    try {
      const data = await bridge.query(nextLink, {});
      setRows(prev => [...(prev || []), ...(data?.records || [])]);
      setNextLink(data?.nextLink || null);
    } catch (e) { setError(e.message); }
    setLoadingMore(false);
  };
  // First render loads immediately; later filter changes are debounced (350 ms) so typing a search
  // term doesn't fire a request per keystroke. Discrete controls also pass through the debounce —
  // an imperceptible delay, and it keeps a single source of truth.
  const firstRef = useRef(true);
  useEffect(() => {
    if (firstRef.current) { firstRef.current = false; load(); return; }
    const id = setTimeout(load, 350);
    return () => clearTimeout(id);
    /* eslint-disable-next-line */
  }, [onlyErrors, pageSize, search, win, minMs]);

  const filtered = rows || [];   // filtering is server-side now
  const anyFilter = !!(search.trim() || win || (parseInt(minMs, 10) > 0) || onlyErrors);
  const resetFilters = () => { setSearch(""); setWin(""); setMinMs(""); setOnlyErrors(false); };

  const exportCsv = (format = "csv") => {
    const headers = ["createdon", "typename", "messagename", "primaryentity", "mode", "duration_ms", "exception"];
    const rows = filtered.map(r => [r.createdon, r.typename, r.messagename, r.primaryentity, r["mode" + FMT] || r.mode, r.performanceexecutionduration, (r.exceptiondetails || "").substring(0, 500)]);
    exportTable(headers, rows, "plugin_traces", format, "Plugin Traces", true);
  };

  return (
    <div>
      {orgFeatures?.pluginTraceSetting===0&&<div style={{ padding: "10px 14px", background: C.yw + "14", border: `1px solid ${C.yw}44`, borderRadius: 8, color: C.yw, fontSize: 13, marginBottom: 10, lineHeight: 1.6 }}>⚠ {t("featuregate.traces_off")}</div>}
      <div style={{ fontSize: 12, color: C.txd, marginBottom: 10, lineHeight: 1.6 }}>{t("ops.traces_hint")}</div>
      <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap", alignItems: "center" }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder={t("ops.traces_search")} style={inp({ fontSize: 13, maxWidth: 240 })} />
        <select value={win} onChange={e => setWin(e.target.value)} title={t("ops.win_title")} style={inp({ width: "auto", fontSize: 12, padding: "5px 8px" })}>
          <option value="">{t("ops.win_all")}</option>
          <option value="15">{t("ops.win_15")}</option>
          <option value="60">{t("ops.win_60")}</option>
          <option value="360">{t("ops.win_360")}</option>
        </select>
        <input type="number" min="0" value={minMs} onChange={e => setMinMs(e.target.value)} placeholder={t("ops.min_ms")} title={t("ops.min_ms")} style={inp({ width: 96, fontSize: 12, padding: "5px 8px" })} />
        <label style={{ fontSize: 12.5, color: C.txm, display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}>
          <input type="checkbox" checked={onlyErrors} onChange={e => setOnlyErrors(e.target.checked)} style={{ accentColor: C.rd }} />
          {t("ops.only_exceptions")}
        </label>
        <select value={pageSize} onChange={e => setPageSize(+e.target.value)} style={inp({ width: "auto", fontSize: 12, padding: "5px 8px" })}>
          <option value={100}>100 {t("ops.per_page")}</option><option value={250}>250 {t("ops.per_page")}</option><option value={500}>500 {t("ops.per_page")}</option><option value={1000}>1000 {t("ops.per_page")}</option>
        </select>
        <button onClick={load} style={bt(null, { fontSize: 12 })}>↻</button>
        {anyFilter && <button onClick={resetFilters} style={bt(null, { fontSize: 12 })} title={t("ops.reset")}>✕</button>}
        {filtered.length > 0 && <button onClick={() => exportCsv("csv")} style={bt(null, { fontSize: 12 })}><I.Download /> CSV</button>}
        {filtered.length > 0 && <button onClick={() => exportCsv("xlsx")} style={bt(null, { fontSize: 12 })}><I.Download /> Excel</button>}
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
          <div style={{ padding: "6px 10px", borderTop: `1px solid ${C.bd}`, fontSize: 11, color: C.txd, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span>{(rows || []).length} {t("ops.loaded")}{nextLink ? "" : ` · ${t("ops.all_loaded")}`}</span>
            {nextLink && <button onClick={loadMore} disabled={loadingMore} style={bt(null, { fontSize: 12 })}>{loadingMore ? <><Spin s={11} /> …</> : <>↓ {t("ops.load_more")}</>}</button>}
          </div>
        </div>
      )}
    </div>
  );
}

function SystemJobs({ bp, isAdmin, theme }) {
  const [filterId, setFilterId] = useState("failed");
  const [rows, setRows] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(new Set());
  const [acting, setActing] = useState(null);  // {done,total,verb}
  const [actResults, setActResults] = useState(null);
  const [expanded, setExpanded] = useState(null);
  const [pageSize, setPageSize] = useState(100);
  const [nextLink, setNextLink] = useState(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const JOB_SELECT = "asyncoperationid,name,operationtype,statecode,statuscode,startedon,completedon,createdon,retrycount,friendlymessage";

  // asyncoperation can be huge, so search uses startswith(name,…) — sargable/indexable, unlike
  // contains() (a leading-wildcard LIKE scan). Combined with the status chip + date range, the
  // server set stays small.
  const buildFilter = (fid) => {
    const parts = [];
    const f = JOB_FILTERS.find(x => x.id === fid);
    if (f?.filter) parts.push(`(${f.filter})`);
    const s = search.trim();
    if (s) parts.push(`startswith(name,'${odEsc(s)}')`);
    parts.push(...dateConds("createdon", dateFrom, dateTo));
    return parts.join(" and ");
  };

  const load = async (fid = filterId) => {
    setLoading(true); setError(""); setSelected(new Set()); setActResults(null); setExpanded(null);
    try {
      // maxpagesize (not $top) → server-driven paging with a nextLink for "Load more".
      const opts = { orderby: "createdon desc", maxpagesize: String(pageSize), select: JOB_SELECT };
      const filter = buildFilter(fid);
      if (filter) opts.filter = filter;
      const data = await bridge.query("asyncoperations", opts);
      setRows(data?.records || []);
      setNextLink(data?.nextLink || null);
    } catch (e) { setError(e.message); setRows([]); setNextLink(null); }
    setLoading(false);
  };
  const loadMore = async () => {
    if (!nextLink || loadingMore) return;
    setLoadingMore(true);
    try {
      const data = await bridge.query(nextLink, {});
      setRows(prev => [...(prev || []), ...(data?.records || [])]);
      setNextLink(data?.nextLink || null);
    } catch (e) { setError(e.message); }
    setLoadingMore(false);
  };
  // Immediate first load; later filter changes debounced (350 ms) so the name search doesn't fire
  // a query per keystroke.
  // Status chips load immediately (primary interaction); the name search & dates are debounced so
  // typing doesn't fire a query per keystroke. filterId is intentionally NOT a dep — the chip's
  // onClick calls load(fid) directly, avoiding a double request.
  const firstRef = useRef(true);
  useEffect(() => {
    if (firstRef.current) { firstRef.current = false; load(); return; }
    const id = setTimeout(() => load(), 350);
    return () => clearTimeout(id);
    /* eslint-disable-next-line */
  }, [pageSize, search, dateFrom, dateTo]);
  const anyFilter = !!(search.trim() || dateFrom || dateTo);
  const resetFilters = () => { setSearch(""); setDateFrom(""); setDateTo(""); };

  // Cancel = statecode 3 / statuscode 32; Resume = statecode 0 (from Suspended).
  const act = async (verb) => {
    const targets = rows.filter(j => selected.has(j.asyncoperationid) && (verb === "cancel" ? CANCELABLE(j) : RESUMABLE(j)));
    if (!targets.length) return;
    if (!confirmProd(orgInfo?.isProduction, `${verb === "cancel" ? "Cancel" : "Resume"} ${targets.length} system job${targets.length > 1 ? "s" : ""}.`)) return;
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
          <button key={f.id} onClick={() => { setFilterId(f.id); load(f.id); }}
            style={{ padding: "4px 12px", fontSize: 12, borderRadius: 12, cursor: "pointer", fontWeight: 600, border: `1px solid ${filterId === f.id ? C.vi : C.bd}`, background: filterId === f.id ? C.vi + "22" : "transparent", color: filterId === f.id ? C.tx : C.txm }}>
            {t(f.label)}
          </button>
        ))}
        <button onClick={() => load()} style={bt(null, { fontSize: 12 })}>↻</button>
        <select value={pageSize} onChange={e => setPageSize(+e.target.value)} style={inp({ width: "auto", fontSize: 12, padding: "5px 8px" })}>
          <option value={100}>100 {t("ops.per_page")}</option><option value={250}>250 {t("ops.per_page")}</option><option value={500}>500 {t("ops.per_page")}</option><option value={1000}>1000 {t("ops.per_page")}</option>
        </select>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder={t("ops.jobs_search")} style={inp({ fontSize: 12, maxWidth: 200, padding: "5px 8px" })} />
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} title={t("ops.date_from")} style={inp({ width: "auto", fontSize: 12, padding: "4px 8px", colorScheme: theme === "light" ? "light" : "dark" })} />
          <span style={{ color: C.txd }}>→</span>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} title={t("ops.date_to")} style={inp({ width: "auto", fontSize: 12, padding: "4px 8px", colorScheme: theme === "light" ? "light" : "dark" })} />
        </span>
        {anyFilter && <button onClick={resetFilters} style={bt(null, { fontSize: 12 })} title={t("ops.reset")}>✕</button>}
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
          <div style={{ padding: "6px 10px", borderTop: `1px solid ${C.bd}`, fontSize: 11, color: C.txd, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span>{(rows || []).length} {t("ops.loaded")}{nextLink ? "" : ` · ${t("ops.all_loaded")}`}</span>
            {nextLink && <button onClick={loadMore} disabled={loadingMore} style={bt(null, { fontSize: 12 })}>{loadingMore ? <><Spin s={11} /> …</> : <>↓ {t("ops.load_more")}</>}</button>}
          </div>
        </div>
      )}
    </div>
  );
}

// Cloud flow runs — the flowrun table: run history of SOLUTION cloud flows that Dataverse keeps
// org-side (~28-day retention, backed by the Power Automate service). "My flows" outside a
// solution never appear here — their history lives only in make.powerautomate.com. The table is
// absent on older orgs (honest message instead of a raw 404), and being provider-backed it may
// reject $filter/$orderby — we then fall back to a bare fetch and filter client-side.
const FLOW_STATUS_COLOR = (s) => {
  const v = String(s || "").toLowerCase();
  return v === "succeeded" ? C.gn : v === "failed" ? C.rd : v === "cancelled" || v === "canceled" ? C.yw : v === "running" ? C.cy : C.txm;
};
// The flow lookup's exact name can drift across org versions — find any workflow lookup's
// formatted value rather than hard-coding one.
const flowNameOf = (r) => {
  const k = Object.keys(r).find(k => /^_workflow.*_value@/.test(k) && k.endsWith("FormattedValue"));
  return (k && r[k]) || r.name || "(unnamed flow)";
};
const runDurationS = (r) => {
  if (r.starttime && r.endtime) return Math.max(0, (new Date(r.endtime) - new Date(r.starttime)) / 1000);
  return typeof r.duration === "number" ? r.duration / 1000 : null;
};

function FlowRuns({ bp, theme }) {
  const [rows, setRows] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notSupported, setNotSupported] = useState(false);
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState(() => new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10));
  const [dateTo, setDateTo] = useState("");
  const [serverFiltered, setServerFiltered] = useState(true);
  const [nextLink, setNextLink] = useState(null);
  const [loadingMore, setLoadingMore] = useState(false);

  const load = async () => {
    setLoading(true); setError(""); setNotSupported(false);
    try {
      const filter = dateConds("starttime", dateFrom, dateTo).join(" and ");
      const opts = { orderby: "starttime desc", maxpagesize: "100" };
      if (filter) opts.filter = filter;
      let data;
      try {
        data = await bridge.query("flowruns", opts);
        setServerFiltered(true);
      } catch (e1) {
        if (/does not exist|Resource not found|404/i.test(e1.message || "")) throw e1;
        data = await bridge.query("flowruns", { maxpagesize: "100" });
        setServerFiltered(false);
      }
      setRows(data?.records || []);
      setNextLink(data?.nextLink || null);
    } catch (e) {
      if (/does not exist|Resource not found|404/i.test(e.message || "")) setNotSupported(true);
      else setError(e.message);
      setRows([]); setNextLink(null);
    }
    setLoading(false);
  };
  const loadMore = async () => {
    if (!nextLink || loadingMore) return;
    setLoadingMore(true);
    try {
      const data = await bridge.query(nextLink, {});
      setRows(prev => [...(prev || []), ...(data?.records || [])]);
      setNextLink(data?.nextLink || null);
    } catch (e) { setError(e.message); }
    setLoadingMore(false);
  };
  const firstRef = useRef(true);
  useEffect(() => {
    if (firstRef.current) { firstRef.current = false; load(); return; }
    const id = setTimeout(load, 350);
    return () => clearTimeout(id);
    /* eslint-disable-next-line */
  }, [dateFrom, dateTo]);

  // Status + name filters stay CLIENT-side: status values are provider strings and the flow
  // name only exists as a formatted value — neither is reliably filterable server-side.
  const inRange = (r) => {
    if (serverFiltered || !r.starttime) return true;
    const d = r.starttime.slice(0, 10);
    return (!dateFrom || d >= dateFrom) && (!dateTo || d <= dateTo);
  };
  const filtered = (rows || []).filter(r => {
    if (status && String(r.status || "").toLowerCase() !== status) return false;
    const s = search.trim().toLowerCase();
    if (s && !flowNameOf(r).toLowerCase().includes(s)) return false;
    return inRange(r);
  });

  const exportCsv = (format = "csv") => {
    const headers = ["flow", "status", "started", "ended", "duration_s", "trigger", "error"];
    const rowsX = filtered.map(r => [flowNameOf(r), r.status || "", r.starttime || "", r.endtime || "", runDurationS(r) != null ? runDurationS(r).toFixed(1) : "", r.triggertype || "", ((r.errormessage || r.errorcode || "")).toString().substring(0, 500)]);
    exportTable(headers, rowsX, "cloud_flow_runs", format, "Flow Runs", true);
  };

  if (notSupported) return (
    <div style={{ padding: "14px 16px", background: C.yw + "14", border: `1px solid ${C.yw}44`, borderRadius: 8, color: C.txm, fontSize: 13, lineHeight: 1.7 }}>
      {t("ops.flowruns_missing")}
    </div>
  );

  return (
    <div>
      <div style={{ fontSize: 12, color: C.txd, marginBottom: 10, lineHeight: 1.6 }}>{t("ops.flowruns_hint")}</div>
      <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap", alignItems: "center" }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder={t("ops.flowruns_search")} style={inp({ fontSize: 13, maxWidth: 240 })} />
        <select value={status} onChange={e => setStatus(e.target.value)} style={inp({ width: "auto", fontSize: 12, padding: "5px 8px" })}>
          <option value="">{t("ops.flow_all")}</option>
          <option value="succeeded">Succeeded</option>
          <option value="failed">Failed</option>
          <option value="cancelled">Cancelled</option>
          <option value="running">Running</option>
        </select>
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} title={t("ops.date_from")} style={inp({ width: "auto", fontSize: 12, padding: "4px 8px", colorScheme: theme === "light" ? "light" : "dark" })} />
          <span style={{ color: C.txd }}>→</span>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} title={t("ops.date_to")} style={inp({ width: "auto", fontSize: 12, padding: "4px 8px", colorScheme: theme === "light" ? "light" : "dark" })} />
        </span>
        <button onClick={load} disabled={loading} style={bt(null, { fontSize: 12, padding: "5px 10px" })}>{loading ? <Spin s={12} /> : "↻"}</button>
        <div style={{ flex: 1 }} />
        {filtered.length > 0 && <>
          <button onClick={() => exportCsv("csv")} style={bt(null, { fontSize: 12 })}><I.Download /> CSV</button>
          <button onClick={() => exportCsv("xlsx")} style={bt(null, { fontSize: 12 })}><I.Download /> Excel</button>
        </>}
      </div>
      {!serverFiltered && <div style={{ fontSize: 11.5, color: C.yw, marginBottom: 8 }}>⚠ {t("ops.flowruns_clientfilter")}</div>}
      {error && <div style={{ color: C.rd, fontSize: 13, marginBottom: 8 }}>{error}</div>}
      {loading && !rows && <div style={{ textAlign: "center", padding: 30 }}><Spin /></div>}
      {rows && (
        <div style={{ ...crd({ overflow: "auto" }) }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead><tr>
              <th style={ths()}>{t("ops.flow_col")}</th><th style={ths()}>Status</th><th style={ths()}>Started</th><th style={ths()}>Ended</th><th style={ths()}>Duration</th><th style={ths()}>Trigger</th><th style={ths()}>Error</th>
            </tr></thead>
            <tbody>
              {filtered.map((r, i) => {
                const durS = runDurationS(r);
                const err = r.errormessage || r.errorcode || "";
                return (
                  <tr key={(r.flowrunid || r.name || i) + i} style={{ borderBottom: `1px solid ${C.bd}` }}>
                    <td style={{ ...tds, maxWidth: 280 }} title={flowNameOf(r)}>{flowNameOf(r)}</td>
                    <td style={{ ...tds }}><span style={{ fontSize: 11, fontWeight: 700, padding: "1px 8px", borderRadius: 3, background: FLOW_STATUS_COLOR(r.status) + "22", color: FLOW_STATUS_COLOR(r.status) }}>{r.status || "?"}</span></td>
                    <td style={{ ...tds, ...mono, fontSize: 12 }}>{fmtDate(r.starttime)}</td>
                    <td style={{ ...tds, ...mono, fontSize: 12 }}>{fmtDate(r.endtime)}</td>
                    <td style={{ ...tds, ...mono, fontSize: 12 }}>{durS != null ? `${durS.toFixed(1)}s` : ""}</td>
                    <td style={{ ...tds, fontSize: 12, color: C.txm }}>{r.triggertype || ""}</td>
                    <td style={{ ...tds, maxWidth: 320, color: err ? C.rd : C.txd, fontSize: 12 }} title={err}>{err ? String(err).substring(0, 160) : ""}</td>
                  </tr>
                );
              })}
              {filtered.length === 0 && <tr><td colSpan={7} style={{ padding: 20, textAlign: "center", color: C.txd, fontSize: 13 }}>{t("ops.flowruns_empty")}</td></tr>}
            </tbody>
          </table>
        </div>
      )}
      {nextLink && (
        <div style={{ textAlign: "center", marginTop: 10 }}>
          <button onClick={loadMore} disabled={loadingMore} style={bt(null, { fontSize: 12 })}>{loadingMore ? <Spin s={12} /> : t("ops.load_more")}</button>
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
        {[["jobs", t("ops.tab_jobs")], ["traces", t("ops.tab_traces")], ["flowruns", t("ops.tab_flowruns")]].map(([id, label]) => (
          <button key={id} onClick={() => setPanel(id)}
            style={{ padding: "6px 16px", fontSize: 13, fontWeight: 600, borderRadius: 6, cursor: "pointer", border: `1px solid ${panel === id ? C.vi : C.bd}`, background: panel === id ? C.vi + "22" : "transparent", color: panel === id ? C.tx : C.txm }}>
            {label}
          </button>
        ))}
      </div>
      {panel === "traces" ? <PluginTraces bp={bp} orgFeatures={orgFeatures} theme={theme} /> : panel === "flowruns" ? <FlowRuns bp={bp} theme={theme} /> : <SystemJobs bp={bp} isAdmin={isAdmin} theme={theme} />}
    </div>
  );
}
