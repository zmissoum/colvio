import { useState, useEffect, useRef, useMemo } from "react";
import { bridge } from "../d365-bridge.js";
import { C, I, Spin, ENTS, mono, inp, bt, crd, exportTable, isTrulyCustom } from "../shared.jsx";
import { storageClass, SYSTEM_HOGS, FILE_SOURCES, scanFileSource, formatBytes } from "../storageUtils.js";
import { t } from "../i18n.js";

// Storage — where the capacity goes, with the numbers the Dataverse Web API can honestly give:
// rows per table (Dataverse's own snapshot, <= 24 h old — a few calls, not a scan) and file bytes
// per table (aggregates over notes / file columns / email attachments, run in the background
// AFTER the table list is on screen). The GB Microsoft bills on live in the admin center only.

// Module-level session cache: tabs unmount on switch, and the whole point is that coming back
// is instant. Keyed by org so two environments never mix.
let SESSION = null; // { org, entities, counts, failed, at, files }

const DEMO_SYSTEM = [
  { l: "asyncoperation", d: "System Job" }, { l: "workflowlog", d: "Process Log" }, { l: "plugintracelog", d: "Plug-in Trace Log" },
  { l: "audit", d: "Auditing" }, { l: "activitymimeattachment", d: "Attachment" }, { l: "importlog", d: "Import Log" }, { l: "duplicaterecord", d: "Duplicate Record" },
];

const CLASS_META = {
  db: { label: "Database", color: "vi" },
  file: { label: "File + DB", color: "cy" },
  log: { label: "Log", color: "or" },
};

export default function Storage({ bp, orgInfo }) {
  const isLive = orgInfo?.isExtension;
  const orgKey = orgInfo?.orgUrl || "demo";
  const cached = SESSION?.org === orgKey ? SESSION : null;
  const [entities, setEntities] = useState(cached?.entities || null);
  const [counts, setCounts] = useState(cached?.counts || null);
  const [failed, setFailed] = useState(cached?.failed || []);
  const [loadedAt, setLoadedAt] = useState(cached?.at || null);
  const [progress, setProgress] = useState(null);   // 0..1 while counting
  const [error, setError] = useState("");
  const [chip, setChip] = useState("all");           // all | custom | standard | growth | file | log
  const [search, setSearch] = useState("");
  const [files, setFiles] = useState(cached?.files || null); // { srcKey: { status, rows, complete, grouped, error, progress } }
  const [auditDays, setAuditDays] = useState(undefined);
  const [showFailed, setShowFailed] = useState(false);
  const gen = useRef(0);          // bumps on reload/unmount: a stale run never writes the current view
  const fileAbort = useRef(false);

  const startFiles = async (g) => {
    fileAbort.current = false;
    const state = {};
    FILE_SOURCES.forEach(s => { state[s.key] = { status: "pending" }; });
    setFiles({ ...state });
    for (const src of FILE_SOURCES) {
      if (gen.current !== g || fileAbort.current) break;
      state[src.key] = { status: "running", progress: 0 };
      setFiles({ ...state });
      try {
        const res = await scanFileSource({
          run: (range, grouped) => bridge.fileStorageAggregate(src.key, range, grouped),
          getOldest: () => bridge.getOldestCreatedOn(src.key),
          onProgress: (p) => { if (gen.current === g) { state[src.key] = { ...state[src.key], progress: p }; setFiles({ ...state }); } },
          shouldAbort: () => gen.current !== g || fileAbort.current,
        });
        state[src.key] = { status: "done", ...res };
      } catch (e) {
        state[src.key] = { status: "error", error: e.message || String(e) };
      }
      if (gen.current !== g) return;
      setFiles({ ...state });
    }
    if (gen.current !== g) return;
    FILE_SOURCES.forEach(s => { if (state[s.key].status === "pending") state[s.key] = { status: "cancelled" }; });
    setFiles({ ...state });
    const allSettled = FILE_SOURCES.every(s => state[s.key].status === "done" || state[s.key].status === "error");
    if (allSettled && SESSION?.org === orgKey) SESSION.files = { ...state };
  };

  const load = async (force) => {
    const g = ++gen.current;
    setError(""); setProgress(0); setCounts(null); setFailed([]); setFiles(null); setShowFailed(false);
    try {
      if (force) { try { await bridge.clearCache(); } catch { /* best effort */ } }
      let ents;
      if (isLive) {
        const raw = await bridge.getEntities();
        ents = (raw || []).map(e => ({ l: e.logical, d: e.display || e.logical, tt: e.tableType || "Standard", custom: !!(e.isCustom && isTrulyCustom(e.logical, e.isManaged)) }));
      } else {
        ents = [...ENTS.map(e => ({ l: e.l, d: e.d, tt: e.tt || "Standard", custom: false })), ...DEMO_SYSTEM.map(e => ({ ...e, tt: "Standard", custom: false }))];
      }
      ents = ents.filter(e => storageClass(e.l, e.tt) !== null); // virtual tables store nothing in Dataverse
      if (gen.current !== g) return;
      setEntities(ents);
      const r = await bridge.getRecordCounts(ents.map(e => e.l), p => { if (gen.current === g) setProgress(p); });
      if (gen.current !== g) return;
      const at = Date.now();
      setCounts(r.counts); setFailed(r.failed); setProgress(null); setLoadedAt(at);
      SESSION = { org: orgKey, entities: ents, counts: r.counts, failed: r.failed, at, files: null };
      startFiles(g);
    } catch (e) {
      if (gen.current === g) { setError(e.message || String(e)); setProgress(null); }
    }
  };

  useEffect(() => {
    if (!cached) load(false);
    else if (!cached.files) startFiles(gen.current);
    bridge.getOrgFeatures().then(f => setAuditDays(f?.auditRetentionDays ?? null)).catch(() => setAuditDays(null));
    return () => { gen.current++; fileAbort.current = true; };
  }, []);

  const totalRows = useMemo(() => Object.values(counts || {}).reduce((a, b) => a + b, 0), [counts]);
  const rows = useMemo(() => {
    if (!entities || !counts) return [];
    const tot = totalRows || 1;
    return entities.filter(e => e.l in counts)
      .map(e => ({ ...e, rows: counts[e.l], share: counts[e.l] / tot, cls: storageClass(e.l, e.tt), hog: SYSTEM_HOGS[e.l] || null }))
      .sort((a, b) => b.rows - a.rows);
  }, [entities, counts, totalRows]);
  const nameOf = useMemo(() => Object.fromEntries((entities || []).map(e => [e.l, e.d])), [entities]);

  const s = search.trim().toLowerCase();
  const shown = rows.filter(r => {
    if (chip === "custom" && !r.custom) return false;
    if (chip === "standard" && (r.custom || r.hog)) return false;
    if (chip === "growth" && !r.hog) return false;
    if (chip === "file" && r.cls !== "file") return false;
    if (chip === "log" && r.cls !== "log") return false;
    return !s || r.l.includes(s) || (r.d || "").toLowerCase().includes(s);
  });
  const chipCount = (k) => k === "all" ? rows.length : k === "custom" ? rows.filter(r => r.custom).length : k === "standard" ? rows.filter(r => !r.custom && !r.hog).length
    : k === "growth" ? rows.filter(r => r.hog).length : rows.filter(r => r.cls === k).length;
  const hogs = rows.filter(r => r.hog && r.rows > 0);
  const biggest = rows[0];

  // File breakdown: one row per owning table, a column per source.
  const fileTable = useMemo(() => {
    if (!files) return { rows: [], total: 0, files: 0 };
    const m = new Map();
    for (const src of FILE_SOURCES) {
      const st = files[src.key];
      if (st?.status !== "done") continue;
      for (const r of st.rows || []) {
        const cur = m.get(r.key) || { key: r.key, label: r.label, bySrc: {}, bytes: 0, files: 0 };
        cur.bySrc[src.key] = (cur.bySrc[src.key] || 0) + r.bytes;
        cur.bytes += r.bytes; cur.files += r.files;
        if (!cur.label && r.label) cur.label = r.label;
        m.set(r.key, cur);
      }
    }
    const list = [...m.values()].filter(r => r.bytes > 0 || r.files > 0).sort((a, b) => b.bytes - a.bytes);
    return { rows: list, total: list.reduce((a, r) => a + r.bytes, 0), files: list.reduce((a, r) => a + r.files, 0) };
  }, [files]);
  const filesRunning = files && FILE_SOURCES.some(x => files[x.key]?.status === "running" || files[x.key]?.status === "pending");
  const tableLabel = (key, label) => key === "_total" ? "(not attributed to a table)" : (nameOf[key] || label || key);

  const exportRows = (format) => exportTable(["table", "logicalName", "storageClass", "rows", "shareOfRows", "systemGrowth"],
    shown.map(r => [r.d, r.l, CLASS_META[r.cls].label, r.rows, `${(r.share * 100).toFixed(2)}%`, r.hog ? "yes" : ""]),
    "storage_rows_per_table", format, "Rows per table");
  const exportFiles = (format) => exportTable(["table", "logicalName", "notesBytes", "fileColumnsBytes", "emailAttachmentsBytes", "totalBytes", "files"],
    fileTable.rows.map(r => [tableLabel(r.key, r.label), r.key, r.bySrc.notes || 0, r.bySrc.filecols || 0, r.bySrc.emailatt || 0, r.bytes, r.files]),
    "storage_files_per_table", format, "File storage");

  const tile = (label, value, sub, color) => (
    <div style={{ ...crd({ padding: "10px 14px" }), flex: "1 1 170px", minWidth: 150 }}>
      <div style={{ fontSize: 10.5, color: C.txd, fontWeight: 700, letterSpacing: ".4px" }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: color || C.tx, ...mono, margin: "2px 0" }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: C.txd, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={typeof sub === "string" ? sub : undefined}>{sub}</div>}
    </div>
  );
  const badge = (cls) => { const m = CLASS_META[cls]; return <span style={{ fontSize: 9.5, padding: "1px 6px", borderRadius: 3, background: C[m.color] + "22", color: C[m.color], fontWeight: 700, letterSpacing: ".3px", whiteSpace: "nowrap" }}>{m.label.toUpperCase()}</span>; };

  return (
    <div style={{ padding: bp.mobile ? 12 : 20, maxWidth: 1400, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4, flexWrap: "wrap" }}>
        <span style={{ fontSize: 18, fontWeight: 700 }}>💾 {t("nav.storage")}</span>
        <div style={{ flex: 1 }} />
        {loadedAt && <span style={{ fontSize: 11, color: C.txd }}>Loaded {new Date(loadedAt).toLocaleTimeString()} · snapshot ≤ 24 h old</span>}
        <button onClick={() => load(true)} disabled={progress !== null} title="Reload counts and re-run the file analysis" style={bt(null, { fontSize: 12, opacity: progress !== null ? 0.5 : 1 })}>↻ Refresh</button>
      </div>
      <div style={{ ...crd({ padding: "8px 12px", background: C.cy + "0c", borderColor: C.cy + "44" }), fontSize: 12, color: C.txm, lineHeight: 1.55, marginBottom: 14 }}>
        Row counts come from Dataverse's own snapshot (refreshed by the platform, at most 24 h old) — fast, but not live. The capacity you are billed on, in GB of Database / File / Log, is only shown in the <a href="https://admin.powerplatform.microsoft.com/" target="_blank" rel="noopener" style={{ color: C.vil }}>Power Platform admin center ↗</a> (Licensing → Dataverse → Environments); Colvio can't read it with your session. Use this view to find <b>which tables</b> fill it.
      </div>

      {error && <div style={{ ...crd({ padding: 12, borderColor: C.rd + "66" }), color: C.rd, fontSize: 13, marginBottom: 12 }}>⚠ {error} <button onClick={() => load(true)} style={bt(null, { fontSize: 12, marginLeft: 8 })}>↻ Retry</button></div>}

      {progress !== null && (
        <div style={{ ...crd({ padding: "14px 16px" }), marginBottom: 14 }}>
          <div style={{ fontSize: 13, marginBottom: 8, display: "flex", alignItems: "center", gap: 8 }}><Spin s={14} /> Reading row counts for {entities ? entities.length.toLocaleString() : "…"} tables…</div>
          <div style={{ height: 6, background: C.bg, borderRadius: 3, overflow: "hidden" }}><div style={{ height: 6, width: `${Math.round(progress * 100)}%`, background: C.cy, transition: "width .2s" }} /></div>
        </div>
      )}

      {counts && <>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
          {tile("ROWS (ALL TABLES)", totalRows.toLocaleString(), `${rows.length.toLocaleString()} tables counted`)}
          {tile("BIGGEST TABLE", biggest ? biggest.rows.toLocaleString() : "—", biggest ? `${biggest.d} (${biggest.l})` : "")}
          {tile("FILE STORAGE (MEASURED)", files && !filesRunning ? formatBytes(fileTable.total) : <Spin s={16} />, files && !filesRunning ? `${fileTable.files.toLocaleString()} files in ${fileTable.rows.length} tables` : "analyzing in the background…", C.cy)}
          {tile("AUDIT RETENTION", auditDays === undefined ? "…" : auditDays == null ? "—" : auditDays === -1 ? "Forever" : `${auditDays} d`, counts.audit != null ? `${counts.audit.toLocaleString()} audit rows (Log storage)` : "audit is the main Log consumer", C.or)}
        </div>

        {failed.length > 0 && (
          <div style={{ fontSize: 11.5, color: C.yw, marginBottom: 10 }}>
            ⚠ {failed.length} table{failed.length > 1 ? "s" : ""} couldn't be counted by the snapshot function (not listed below). <button onClick={() => setShowFailed(v => !v)} style={{ background: "none", border: "none", color: C.vil, cursor: "pointer", fontSize: 11.5, padding: 0 }}>{showFailed ? "hide" : "show"}</button>
            {showFailed && <div style={{ ...mono, fontSize: 11, color: C.txd, marginTop: 4, lineHeight: 1.6, maxHeight: 90, overflow: "auto" }}>{failed.join(", ")}</div>}
          </div>
        )}

        {hogs.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Tables that grow silently</div>
            <div style={{ display: "grid", gridTemplateColumns: bp.mobile ? "1fr" : "repeat(auto-fill, minmax(300px, 1fr))", gap: 8 }}>
              {hogs.map(h => (
                <div key={h.l} style={{ ...crd({ padding: "9px 12px" }) }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                    <span style={{ fontWeight: 600, fontSize: 13 }}>{h.d}</span>
                    <span style={{ ...mono, fontSize: 10.5, color: C.txd }}>{h.l}</span>
                    <span style={{ marginLeft: "auto", ...mono, fontWeight: 700, color: h.rows >= 1e6 ? C.rd : h.rows >= 1e5 ? C.or : C.tx }}>{h.rows.toLocaleString()}</span>
                  </div>
                  <div style={{ fontSize: 11.5, color: C.txm, marginTop: 4, lineHeight: 1.45 }}>{h.hog}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* File storage by table — loads in the background, never blocks the rest of the page */}
        <div style={{ ...crd({ padding: "10px 14px" }), marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
            <span style={{ fontSize: 13, fontWeight: 700 }}>File storage by table</span>
            <span style={{ fontSize: 11, color: C.txd }}>sum of file sizes: notes, file &amp; image columns, email attachments</span>
            <div style={{ flex: 1 }} />
            {filesRunning && <button onClick={() => { fileAbort.current = true; }} style={bt(null, { fontSize: 11, padding: "3px 9px" })}>✕ Stop</button>}
            {files && !filesRunning && FILE_SOURCES.some(x => files[x.key]?.status !== "done" || files[x.key]?.complete === false) && <button onClick={() => startFiles(gen.current)} style={bt(null, { fontSize: 11, padding: "3px 9px" })}>↻ Re-run</button>}
            {fileTable.rows.length > 0 && !filesRunning && <>
              <button onClick={() => exportFiles("csv")} style={bt(C.cy, { fontSize: 11, padding: "3px 9px" })}><I.Download /> CSV</button>
              <button onClick={() => exportFiles("xlsx")} style={bt(C.cy, { fontSize: 11, padding: "3px 9px" })}><I.Download /> Excel</button>
            </>}
          </div>
          {files && FILE_SOURCES.map(src => {
            const st = files[src.key] || {};
            return (
              <div key={src.key} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11.5, color: C.txm, marginBottom: 4 }}>
                <span style={{ width: 150, flexShrink: 0 }}>{src.label}</span>
                {st.status === "pending" && <span style={{ color: C.txd }}>waiting</span>}
                {st.status === "running" && <><Spin s={11} /><div style={{ flex: 1, maxWidth: 260, height: 5, background: C.bg, borderRadius: 3, overflow: "hidden" }}><div style={{ height: 5, width: `${Math.round((st.progress || 0) * 100)}%`, background: C.cy }} /></div>{st.progress > 0 && st.progress < 1 && <span style={{ color: C.txd }}>large table: splitting by period</span>}</>}
                {st.status === "done" && <span style={{ color: st.complete === false ? C.yw : C.gn }}>{st.complete === false ? "⚠ partial (stopped or a period was too dense to aggregate)" : "✓"} {formatBytes((st.rows || []).reduce((a, r) => a + r.bytes, 0))}{st.grouped === false ? " · total only (per-table grouping refused by the server)" : ""}</span>}
                {st.status === "error" && <span style={{ color: C.rd }} title={st.error}>⚠ {String(st.error).substring(0, 140)}</span>}
                {st.status === "cancelled" && <span style={{ color: C.txd }}>stopped</span>}
              </div>
            );
          })}
          {fileTable.rows.length > 0 && (
            <div style={{ marginTop: 8, overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead><tr style={{ color: C.txd, fontSize: 11, textAlign: "left" }}>
                  <th style={{ padding: "5px 8px" }}>Table</th><th style={{ padding: "5px 8px", textAlign: "right" }}>Notes</th><th style={{ padding: "5px 8px", textAlign: "right" }}>File columns</th><th style={{ padding: "5px 8px", textAlign: "right" }}>Email att.</th><th style={{ padding: "5px 8px", textAlign: "right" }}>Total</th><th style={{ padding: "5px 8px", width: 140 }}></th>
                </tr></thead>
                <tbody>{fileTable.rows.slice(0, 200).map(r => (
                  <tr key={r.key} style={{ borderTop: `1px solid ${C.bd}33` }}>
                    <td style={{ padding: "5px 8px" }}>{tableLabel(r.key, r.label)} {r.key !== "_total" && <span style={{ ...mono, fontSize: 10.5, color: C.txd }}>{r.key}</span>}</td>
                    <td style={{ padding: "5px 8px", textAlign: "right", ...mono }}>{r.bySrc.notes ? formatBytes(r.bySrc.notes) : "—"}</td>
                    <td style={{ padding: "5px 8px", textAlign: "right", ...mono }}>{r.bySrc.filecols ? formatBytes(r.bySrc.filecols) : "—"}</td>
                    <td style={{ padding: "5px 8px", textAlign: "right", ...mono }}>{r.bySrc.emailatt ? formatBytes(r.bySrc.emailatt) : "—"}</td>
                    <td style={{ padding: "5px 8px", textAlign: "right", ...mono, fontWeight: 700 }}>{formatBytes(r.bytes)}</td>
                    <td style={{ padding: "5px 8px" }}><div style={{ height: 6, background: C.bg, borderRadius: 3 }}><div style={{ height: 6, width: `${fileTable.total ? Math.max(1, Math.round(r.bytes / fileTable.total * 100)) : 0}%`, background: C.cy, borderRadius: 3 }} /></div></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
          {files && !filesRunning && fileTable.rows.length === 0 && FILE_SOURCES.every(x => files[x.key]?.status === "done") && <div style={{ fontSize: 12, color: C.txd, marginTop: 6 }}>No file content found in these sources.</div>}
        </div>

        {/* Rows per table */}
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 13, fontWeight: 700 }}>Rows per table</span>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Filter tables…" style={inp({ fontSize: 12, maxWidth: 220, padding: "4px 8px" })} />
          <div style={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
            {[["all", "All"], ["custom", "Custom"], ["standard", "Standard"], ["growth", "System growth"], ["file", "File"], ["log", "Log"]].map(([k, lbl]) => (
              <button key={k} onClick={() => setChip(k)} style={{ padding: "3px 9px", fontSize: 11, border: `1px solid ${chip === k ? C.vi : C.bd}`, borderRadius: 3, cursor: "pointer", background: chip === k ? C.vi + "22" : "transparent", color: chip === k ? C.tx : C.txd }}>{lbl} ({chipCount(k).toLocaleString()})</button>
            ))}
          </div>
          <div style={{ flex: 1 }} />
          <button onClick={() => exportRows("csv")} disabled={!shown.length} style={bt(C.cy, { fontSize: 11, padding: "4px 10px", opacity: shown.length ? 1 : 0.5 })}><I.Download /> CSV</button>
          <button onClick={() => exportRows("xlsx")} disabled={!shown.length} style={bt(C.cy, { fontSize: 11, padding: "4px 10px", opacity: shown.length ? 1 : 0.5 })}><I.Download /> Excel</button>
        </div>
        <div style={{ ...crd({ padding: 0, overflow: "hidden" }) }}>
          <div style={{ display: "grid", gridTemplateColumns: "44px 1.6fr 90px 120px 1fr", padding: "8px 14px", background: C.sfh, fontSize: 11, fontWeight: 700, color: C.txd, borderBottom: `1px solid ${C.bd}` }}>
            <span>#</span><span>Table</span><span>Storage</span><span style={{ textAlign: "right" }}>Rows</span><span style={{ paddingLeft: 12 }}>Share of rows</span>
          </div>
          <div style={{ maxHeight: "calc(100vh - 360px)", minHeight: 160, overflow: "auto" }}>
            {shown.length === 0 && <div style={{ padding: 14, color: C.txd, fontSize: 12 }}>{search ? `No table matches “${search}”` : "No tables in this view"}</div>}
            {shown.slice(0, 500).map((r, i) => (
              <div key={r.l} style={{ display: "grid", gridTemplateColumns: "44px 1.6fr 90px 120px 1fr", padding: "5px 14px", fontSize: 12, borderBottom: `1px solid ${C.bd}22`, alignItems: "center" }}>
                <span style={{ color: C.txd, ...mono, fontSize: 11 }}>{i + 1}</span>
                <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={r.hog || r.l}>
                  {r.d} <span style={{ ...mono, fontSize: 10.5, color: C.txd }}>{r.l}</span>{r.hog && <span title={r.hog} style={{ marginLeft: 6, fontSize: 10, color: C.or, fontWeight: 700 }}>▲ grows</span>}
                </span>
                <span>{badge(r.cls)}</span>
                <span style={{ textAlign: "right", ...mono, fontWeight: 600 }}>{r.rows.toLocaleString()}</span>
                <span style={{ paddingLeft: 12, display: "flex", alignItems: "center", gap: 6 }}>
                  <div style={{ flex: 1, maxWidth: 220, height: 6, background: C.bg, borderRadius: 3 }}><div style={{ height: 6, width: `${r.rows ? Math.max(1, Math.round(r.share * 100)) : 0}%`, background: C[CLASS_META[r.cls].color], borderRadius: 3 }} /></div>
                  <span style={{ fontSize: 10.5, color: C.txd, ...mono, width: 46 }}>{(r.share * 100).toFixed(r.share >= 0.1 ? 0 : 1)}%</span>
                </span>
              </div>
            ))}
            {shown.length > 500 && <div style={{ padding: "8px 14px", fontSize: 11, color: C.yw }}>⚠ Showing the top 500 of {shown.length.toLocaleString()} — refine the filter. Exports cover all {shown.length.toLocaleString()}.</div>}
          </div>
        </div>
        <div style={{ fontSize: 11, color: C.txd, marginTop: 8, lineHeight: 1.6 }}>
          Rows are a proxy for Database storage: a table with wide rows or big text columns weighs more per row than a narrow one. Storage class follows Microsoft's split: notes, attachments, file/image columns and web resources use File storage (plus a little Database); audit, plug-in traces and elastic tables use Log storage; everything else is Database. Virtual tables are excluded — their data lives outside Dataverse.
        </div>
      </>}
    </div>
  );
}
