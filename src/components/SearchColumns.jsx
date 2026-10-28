import { useState, useEffect, useRef, useMemo } from "react";
import { bridge } from "../d365-bridge.js";
import { C, Spin, mono, inp, bt, exportTable } from "../shared.jsx";
import { parseSearchStatus, buildSearchTables, searchSummary, SEARCH_HEADERS, searchExportRows } from "../searchConfig.js";

// Metadata › 🔎 Search result columns: for every table, what the global search (Dataverse search)
// SHOWS in its results and SEARCHES — read from the table's Quick Find view — and what the search
// index holds, when the environment exposes its status. Read-only; the view is edited in the
// maker portal (Tables › Views › Quick Find).
export default function SearchColumns({ onClose }) {
  const [st, setSt] = useState({ phase: "loading" });
  const [q, setQ] = useState("");
  const [enabledOnly, setEnabledOnly] = useState(true);
  const [open, setOpen] = useState({});     // logical → true: the table's columns shown with their display names
  const [fields, setFields] = useState({}); // logical → { [logical]: { d, t } } | "loading" | "error"
  const gen = useRef(0);
  const load = async () => {
    const my = ++gen.current;
    setSt({ phase: "loading" });
    try {
      const raw = await bridge.getSearchConfig();
      if (gen.current !== my) return;
      const status = parseSearchStatus(raw?.status);
      const rows = buildSearchTables({ entities: raw?.entities, views: raw?.views, status });
      const statusError = raw?.statusError || (raw?.status && !status ? "unexpected answer from the search service" : "");
      setSt({ phase: "done", rows, status, statusError, summary: searchSummary(rows), views: (raw?.views || []).length });
    } catch (e) { if (gen.current === my) setSt({ phase: "error", error: e.message || String(e) }); }
  };
  useEffect(() => { load(); return () => { gen.current++; }; }, []);
  useEffect(() => { const h = e => { if (e.key === "Escape") onClose(); }; window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h); }, [onClose]);

  // a table opened: its columns' display names and types (one metadata read per opened table, cached)
  const toggle = async (logical) => {
    setOpen(o => ({ ...o, [logical]: !o[logical] }));
    if (fields[logical]) return;
    setFields(f => ({ ...f, [logical]: "loading" }));
    try {
      const list = await bridge.getFields(logical); // [{ logical, display, type, … }]
      const map = {};
      for (const f of list || []) { const l = f?.logical || f?.l; if (l) map[l] = { d: f.display || f.d || l, t: f.type || f.t || "" }; }
      setFields(f => ({ ...f, [logical]: map }));
    } catch { setFields(f => ({ ...f, [logical]: "error" })); }
  };
  const rows = useMemo(() => {
    if (st.phase !== "done") return [];
    const s = q.trim().toLowerCase();
    return st.rows.filter(r => (!enabledOnly || r.enabled) && (!s || r.logical.includes(s) || r.display.toLowerCase().includes(s)));
  }, [st, q, enabledOnly]);
  const exp = (fmt) => exportTable(SEARCH_HEADERS, searchExportRows(rows), "search_columns", fmt, "Search columns");
  const chip = (logical, col, strong) => {
    const f = fields[logical], meta = f && typeof f === "object" ? f[col] : null;
    return <span key={col} title={meta ? `${col} · ${meta.t}` : col} style={{ ...mono, fontSize: 11.5, padding: "2px 7px", borderRadius: 10, background: strong ? C.vi + "22" : C.sfa, color: strong ? C.tx : C.txm, border: `1px solid ${strong ? C.vi + "55" : C.bd}`, whiteSpace: "nowrap" }}>{meta ? meta.d : col}</span>;
  };
  const ago = (iso) => {
    const d = iso ? new Date(iso) : null;
    if (!d || Number.isNaN(d.getTime())) return "";
    const h = (Date.now() - d.getTime()) / 36e5;
    return h < 1 ? `${Math.max(1, Math.round(h * 60))} min ago` : h < 48 ? `${Math.round(h)} h ago` : `${Math.round(h / 24)} d ago`;
  };
  const sum = st.summary;

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,.55)" }} onClick={onClose}>
      <div style={{ width: 960, maxWidth: "95vw", maxHeight: "88vh", display: "flex", flexDirection: "column", background: C.sf, border: `1px solid ${C.bd}`, borderRadius: 10, boxShadow: "0 16px 48px rgba(0,0,0,.5)" }} onClick={e => e.stopPropagation()}>
        <div style={{ padding: "14px 18px 10px", borderBottom: `1px solid ${C.bd}`, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontWeight: 700, fontSize: 15, flex: 1, minWidth: 200 }}>🔎 Search result columns <span style={{ fontSize: 12, color: C.txd, fontWeight: 400 }}>· what the global search shows and searches, per table</span></span>
          {st.phase === "done" && <>
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Filter tables…" style={inp({ width: 180, fontSize: 12.5, padding: "5px 9px" })} />
            <label style={{ fontSize: 12, color: C.txm, display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}><input type="checkbox" checked={enabledOnly} onChange={e => setEnabledOnly(e.target.checked)} style={{ accentColor: C.vi }} /> enabled tables only</label>
            <button onClick={() => exp("csv")} style={bt(null, { fontSize: 12 })}>CSV</button><button onClick={() => exp("xlsx")} style={bt(null, { fontSize: 12 })}>Excel</button>
          </>}
          <button onClick={onClose} style={{ background: "none", border: "none", color: C.txd, cursor: "pointer", padding: 4, fontSize: 16 }}>✕</button>
        </div>
        <div style={{ flex: 1, overflow: "auto", padding: "12px 18px" }}>
          {st.phase === "loading" && <div style={{ display: "flex", alignItems: "center", gap: 8, color: C.txm, fontSize: 13 }}><Spin s={12} /> Reading the tables' search settings, every Quick Find view and the search index's status…</div>}
          {st.phase === "error" && <div style={{ color: C.rd, fontSize: 13 }}>Couldn't read the search configuration: {st.error} <button onClick={load} style={{ ...bt(null, { fontSize: 12 }), marginLeft: 8 }}>↻ Retry</button></div>}
          {st.phase === "done" && <>
            <div style={{ fontSize: 12.5, color: C.txm, marginBottom: 10, lineHeight: 1.6 }}>
              <b style={{ color: C.tx }}>{sum.enabled.toLocaleString()}</b> of {sum.tables.toLocaleString()} tables enabled for Dataverse search · <b style={{ color: C.tx }}>{sum.findColumns.toLocaleString()}</b> Find columns in use across them <span style={{ color: C.txd }}>(Dataverse's limit: 1,000 per environment)</span>
              {sum.noView > 0 && <> · <span style={{ color: C.yw }}>{sum.noView} enabled without a Quick Find view</span></>}
              {sum.noFind > 0 && <> · <span style={{ color: C.yw }}>{sum.noFind} enabled with no Find column</span></>}
              <br />
              {st.status ? <>Search index: <b style={{ color: C.tx }}>{st.status.status || "status unknown"}</b>{sum.indexed ? ` · ${sum.indexed} enabled tables reported` : ""}</> : <span style={{ color: C.txd }}>Index status not readable{st.statusError ? ` (${st.statusError})` : ""} — the columns below come from the Quick Find views alone.</span>}
            </div>
            {rows.length === 0 && <div style={{ color: C.txd, fontSize: 13 }}>No table matches.</div>}
            {rows.map(r => {
              const isOpen = !!open[r.logical], f = fields[r.logical];
              return (
                <div key={r.logical} style={{ borderLeft: `3px solid ${r.enabled ? (r.notes.some(n => n.level === "warn") ? C.yw : C.gn) : C.bd}`, background: C.bg, borderRadius: 4, padding: "8px 12px", marginBottom: 6 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", cursor: "pointer" }} onClick={() => toggle(r.logical)} title={isOpen ? "Hide display names" : "Show the columns' display names and types (one metadata read, cached)"}>
                    <span style={{ fontSize: 11, color: C.txd, width: 10 }}>{isOpen ? "▾" : "▸"}</span>
                    <b style={{ fontSize: 13 }}>{r.display}</b>
                    <span style={{ ...mono, fontSize: 11.5, color: C.txd }}>{r.logical}</span>
                    <span style={{ fontSize: 11, color: r.enabled ? C.gn : C.txd, background: (r.enabled ? C.gn : C.txd) + "1f", padding: "1px 6px", borderRadius: 3 }}>{r.enabled ? "search on" : r.canEnable === false ? "can't be enabled" : "search off"}</span>
                    {r.isCustom && <span style={{ fontSize: 11, color: C.cy, background: C.cy + "1f", padding: "1px 6px", borderRadius: 3 }}>custom</span>}
                    <span style={{ flex: 1 }} />
                    {r.index && <span style={{ fontSize: 11.5, color: C.txd }} title={r.index.status || ""}>{r.index.records != null ? `${r.index.records.toLocaleString()} rows indexed` : "indexed"}{r.index.lastSync ? ` · synced ${ago(r.index.lastSync)}` : ""}</span>}
                    {f === "loading" && <Spin s={10} />}
                  </div>
                  {r.view ? (
                    <div style={{ marginTop: 6, marginLeft: 18, display: "grid", gridTemplateColumns: "max-content 1fr", gap: "4px 10px", alignItems: "baseline", fontSize: 12 }}>
                      <span style={{ color: C.txm }}>Results show</span>
                      <span style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>{r.view.resultColumns.length ? r.view.resultColumns.map(c => chip(r.logical, c, true)) : <span style={{ color: C.yw }}>no column — the record's name only</span>}</span>
                      <span style={{ color: C.txm }}>Searched in</span>
                      <span style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>{r.view.findColumns.length ? r.view.findColumns.map(c => chip(r.logical, c, false)) : <span style={{ color: C.yw }}>no column</span>}</span>
                      {isOpen && f === "error" && <><span /><span style={{ color: C.txd }}>The columns' display names couldn't be read — logical names shown.</span></>}
                      <span style={{ color: C.txd, fontSize: 11.5 }}>Quick Find view</span>
                      <span style={{ fontSize: 11.5, color: C.txd }}>{r.view.name}{r.view.managed ? " · managed" : ""}</span>
                    </div>
                  ) : <div style={{ marginTop: 6, marginLeft: 18, fontSize: 12, color: r.enabled ? C.yw : C.txd }}>No Quick Find view.</div>}
                  {r.notes.length > 0 && <div style={{ marginTop: 5, marginLeft: 18, fontSize: 12, lineHeight: 1.5 }}>{r.notes.map((n, i) => <div key={i} style={{ color: n.level === "warn" ? C.yw : C.txd }}>{n.level === "warn" ? "⚠ " : "ℹ "}{n.text}</div>)}</div>}
                </div>
              );
            })}
          </>}
        </div>
        <div style={{ padding: "8px 18px", borderTop: `1px solid ${C.bd}`, fontSize: 11.5, color: C.txd, lineHeight: 1.5 }}>
          Read-only. A table's search results and filters show its Quick Find view's <b>View columns</b>; the typed text is matched in its <b>Find columns</b> — both edited in the maker portal (Tables › Views › Quick Find), applied at the next index sync. The index status comes from the search service when the environment exposes it; click a table for its columns' display names.
        </div>
      </div>
    </div>
  );
}
