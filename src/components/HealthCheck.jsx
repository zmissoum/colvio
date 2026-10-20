import { useState, useRef, useEffect } from "react";
import { bridge } from "../d365-bridge.js";
import { C, Spin, bt, crd, exportTable, copyText } from "../shared.jsx";
import { CHECKS, runChecks, tally, sortedChecks, fetchAllPages, reportRows, reportText, REPORT_HEADERS, LEVEL_LABEL } from "../healthCheck.js";
import { demoHealthApi } from "../healthCheckDemo.js";

const LOOK = {
  error: { icon: "⛔", color: () => C.rd }, failed: { icon: "⚠", color: () => C.rd }, warn: { icon: "⚠", color: () => C.yw },
  info: { icon: "ℹ", color: () => C.cy }, ok: { icon: "✓", color: () => C.gn }, skip: { icon: "–", color: () => C.txd },
};
const nextPath = (nl) => (nl ? nl.replace(/^.*\/api\/data\/v[\d.]+\//, "") : null);

// 🩺 Health check — one report on what silently hurts the environment (healthCheck.js), each check
// a handful of reads, run one after the other. Read-only.
export default function HealthCheck({ bp, orgInfo }) {
  const live = !!orgInfo?.isExtension;
  const [results, setResults] = useState({});
  const [phase, setPhase] = useState("idle"); // idle | running | done | stopped
  const [current, setCurrent] = useState(null);
  const [requests, setRequests] = useState(0);
  const [open, setOpen] = useState({});
  const [at, setAt] = useState(null);
  const [copied, setCopied] = useState(false);
  const stop = useRef(false);
  // leaving the module stops the run — no reads against the quota for a screen that's gone
  useEffect(() => () => { stop.current = true; }, []);

  const buildApi = async (count) => {
    if (!live) return demoHealthApi();
    const q = async (fn) => { count(); return fn(); };
    let org = {};
    try { org = (await q(() => bridge.query("organizations", { select: "plugintracelogsetting,isauditenabled,auditretentionperiodv2", top: "1" })))?.records?.[0] || {}; }
    catch { try { org = (await q(() => bridge.query("organizations", { select: "plugintracelogsetting,isauditenabled", top: "1" })))?.records?.[0] || {}; } catch { /* org settings unreadable */ } }
    return {
      isProd: !!orgInfo?.isProduction, org,
      fetchAggregate: async (xml) => (await q(() => bridge.executeFetchXml(xml)))?.records || [],
      fetchAll: (xml) => fetchAllPages((x) => q(() => bridge.executeFetchXml(x)), xml, { shouldStop: () => stop.current }),
      odataAll: async (path) => {
        const out = [];
        let p = path;
        while (p) {
          if (stop.current) throw new Error("stopped");
          const r = await q(() => bridge.queryRaw(p));
          out.push(...(r?.records || []));
          p = nextPath(r?.nextLink);
        }
        return out;
      },
      counts: (names) => q(() => bridge.getRecordCounts(names)),
    };
  };

  const run = async () => {
    stop.current = false;
    setResults({}); setOpen({}); setRequests(0); setPhase("running"); setAt(new Date());
    let reqs = 0;
    const count = () => { reqs++; setRequests(reqs); };
    try {
      const api = await buildApi(count);
      let i = 0;
      setCurrent(CHECKS[0].id);
      await runChecks(api, {
        shouldStop: () => stop.current,
        onResult: (id, r) => { setResults(x => ({ ...x, [id]: r })); i++; setCurrent(CHECKS[i]?.id || null); },
      });
      setPhase(stop.current ? "stopped" : "done");
    } catch (e) {
      setResults(x => ({ ...x, __error: { level: "failed", summary: e.message || String(e) } }));
      setPhase("done");
    } finally { setCurrent(null); }
  };

  const t = tally(results);
  const done = phase === "done" || phase === "stopped";
  const list = done ? sortedChecks(results) : CHECKS;
  const orgName = orgInfo?.orgName || orgInfo?.orgUrl || "";
  const exp = (fmt) => exportTable(REPORT_HEADERS, reportRows(results), `health_check_${(orgInfo?.orgName || "org").replace(/\W+/g, "_")}_${new Date().toISOString().slice(0, 10).replace(/-/g, "")}`, fmt, "Health check");
  const copy = () => { copyText(reportText(results, { org: orgName, at: at || new Date() })); setCopied(true); setTimeout(() => setCopied(false), 1200); };

  return (
    <div style={{ padding: bp.mobile ? 12 : 20, maxWidth: bp.mobile ? "100%" : 1100, margin: "0 auto" }}>
      <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>🩺 Health check</h2>
      <p style={{ color: C.txm, fontSize: 13.5, marginBottom: 12, lineHeight: 1.55 }}>One report on what silently hurts this environment — failing and suspended jobs, flows owned by people who left, plug-ins firing on every update, connection references and environment variables left empty, users without a role, unmanaged solutions in production, log tables growing. {CHECKS.length} checks, each a few reads (aggregates, or full lists page by page), one after the other. Read-only.</p>

      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        {phase === "running"
          ? <><button onClick={() => { stop.current = true; }} style={bt(C.rd, { fontSize: 13 })}>Stop</button><Spin s={12} /><span style={{ fontSize: 12.5, color: C.txm }}>{Object.keys(results).length} / {CHECKS.length} checks · {requests} request{requests === 1 ? "" : "s"}{current ? ` · ${CHECKS.find(c => c.id === current)?.title || ""}…` : ""}</span></>
          : <button onClick={run} style={bt(`linear-gradient(135deg,${C.vi},${C.vil})`, { fontSize: 13 })}>{done ? "↻ Run again" : "▶ Run the health check"}</button>}
        {done && <>
          <span style={{ fontSize: 12.5, color: C.txm }}>{live ? `${requests} request${requests === 1 ? "" : "s"}` : "demo data"} · {at ? at.toLocaleTimeString() : ""}{phase === "stopped" ? " · stopped" : ""}</span>
          <span style={{ flex: 1 }} />
          <button onClick={copy} style={bt(null, { fontSize: 12 })}>{copied ? "✓ Copied" : "📋 Copy report"}</button>
          <button onClick={() => exp("csv")} style={bt(null, { fontSize: 12 })}>CSV</button>
          <button onClick={() => exp("xlsx")} style={bt(null, { fontSize: 12 })}>Excel</button>
        </>}
      </div>

      {(done || Object.keys(results).length > 0) && <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
        {[["error", "problem"], ["failed", "couldn't run"], ["warn", "warning"], ["info", "note"], ["ok", "OK"], ["skip", "not applicable"]].filter(([k]) => t[k]).map(([k, w]) => (
          <span key={k} style={{ fontSize: 12, padding: "3px 10px", borderRadius: 12, background: LOOK[k].color() + "22", color: LOOK[k].color(), fontWeight: 600 }}>{LOOK[k].icon} {t[k]} {w}{t[k] > 1 && k !== "ok" && k !== "failed" && k !== "skip" ? "s" : ""}</span>
        ))}
      </div>}

      {results.__error && <div style={{ ...crd({ padding: "10px 14px" }), color: C.rd, fontSize: 13, marginBottom: 10 }}>Couldn't start: {results.__error.summary}</div>}

      {phase !== "idle" && list.map(c => {
        const r = results[c.id];
        const look = r ? LOOK[r.level] || LOOK.info : null;
        const items = r?.rows || [];
        return (
          <div key={c.id} style={{ ...crd({ padding: "10px 14px" }), marginBottom: 8, borderLeft: `3px solid ${look ? look.color() : C.bd}`, opacity: r?.level === "skip" ? .65 : 1 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
              <span style={{ width: 18, color: look ? look.color() : C.txd, fontWeight: 700 }}>{r ? look.icon : current === c.id ? <Spin s={10} /> : "·"}</span>
              <span style={{ fontWeight: 600, fontSize: 13.5 }}>{c.title}</span>
              <span style={{ fontSize: 11, color: C.txd, background: C.bg, padding: "1px 7px", borderRadius: 3 }}>{c.area}</span>
              {r && r.level !== "ok" && r.level !== "skip" && <span style={{ fontSize: 11, color: look.color() }}>{LEVEL_LABEL[r.level]}</span>}
              <span style={{ flex: 1 }} />
              {items.length > 0 && r.level !== "ok" && <button onClick={() => setOpen(o => ({ ...o, [c.id]: !o[c.id] }))} style={bt(null, { fontSize: 11, padding: "2px 9px" })}>{open[c.id] ? "Hide" : `${items.length.toLocaleString()} item${items.length === 1 ? "" : "s"}`}</button>}
            </div>
            {r && <div style={{ fontSize: 13, color: C.txm, margin: "4px 0 0 26px", lineHeight: 1.5 }}>{r.summary}</div>}
            {r?.fix && r.level !== "ok" && r.level !== "skip" && <div style={{ fontSize: 12.5, color: C.txd, margin: "3px 0 0 26px" }}>→ {r.fix}</div>}
            {open[c.id] && items.length > 0 && <div style={{ margin: "8px 0 0 26px", maxHeight: 320, overflow: "auto", border: `1px solid ${C.bd}`, borderRadius: 4 }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
                <thead><tr>{(r.columns || []).map(h => <th key={h} style={{ textAlign: "left", padding: "5px 8px", background: C.bg, color: C.txd, fontWeight: 600, position: "sticky", top: 0 }}>{h}</th>)}</tr></thead>
                <tbody>{items.map((row, i) => <tr key={i} style={{ borderTop: `1px solid ${C.bd}55` }}>{row.map((v, j) => <td key={j} style={{ padding: "4px 8px", color: j ? C.txm : C.tx }}>{typeof v === "number" ? v.toLocaleString() : String(v ?? "")}</td>)}</tr>)}</tbody>
              </table>
            </div>}
          </div>
        );
      })}
    </div>
  );
}
