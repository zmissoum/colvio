import { useState, useEffect, useMemo, useRef } from "react";
import { bridge } from "../d365-bridge.js";
import { C, Spin, mono, inp, bt, confirmProd, dl } from "../shared.jsx";
import { t } from "../i18n.js";
import { parseDelimited, detectSep } from "../loaderUtils.js";
import { parseSpecSheet, validateSpecs, buildCreateBody, KIND_LABEL, TEMPLATE_HEADERS, TEMPLATE_ROWS, summarizeResults } from "../columnSpec.js";

const csvCell = (v) => { const s = String(v ?? ""); return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

// Metadata › ➕ Columns from file — a sheet describes the columns, every row is checked against the
// table and the org, then the valid ones are created one by one (Dataverse's own metadata bodies,
// one request per column — that IS the write), the table published once at the end.
export default function ColumnsFromFile({ entity, fields, entities, isProduction, onClose, onDone }) {
  const [targets, setTargets] = useState(null); // { languageCode, solutions }
  const [solution, setSolution] = useState("");
  const [file, setFile] = useState(null);        // { name, aoa, error }
  const [run, setRun] = useState(null);          // { phase: running|publishing|done, results, done, total, error }
  const stop = useRef(false);

  useEffect(() => {
    let alive = true;
    bridge.getPublishingTargets().then(tg => { if (!alive) return; setTargets(tg); const first = (tg.solutions || []).find(s => s.uniqueName !== "Default") || tg.solutions?.[0]; if (first) setSolution(first.uniqueName); })
      .catch(e => { if (alive) setTargets({ error: e.message || String(e), solutions: [] }); });
    return () => { alive = false; };
  }, []);
  useEffect(() => { const h = e => { if (e.key === "Escape" && run?.phase !== "running") onClose(); }; window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h); }, [onClose, run]);

  const sol = useMemo(() => (targets?.solutions || []).find(s => s.uniqueName === solution) || null, [targets, solution]);
  const parsed = useMemo(() => (file?.aoa ? parseSpecSheet(file.aoa) : null), [file]);
  const checked = useMemo(() => (parsed && !parsed.error && sol ? validateSpecs(parsed.specs, { prefix: sol.prefix, existingFields: (fields || []).map(f => ({ logical: f.l })), entities: (entities || []).map(e => ({ logical: e.l })), valuePrefix: sol.valuePrefix }) : []), [parsed, sol, fields, entities]);
  const valid = checked.filter(s => !s.errors.length);

  const onFile = (f) => {
    if (!f) return;
    const isExcel = /\.xlsx?$/i.test(f.name);
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        let aoa;
        if (isExcel) {
          const m = await import("xlsx"); const XLSX = m.read ? m : (m.default || m);
          const wb = XLSX.read(ev.target.result, { type: "array" });
          aoa = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: "", blankrows: false, raw: false });
        } else { const text = String(ev.target.result || "").replace(/^﻿/, ""); aoa = parseDelimited(text, detectSep(text)); }
        setFile({ name: f.name, aoa }); setRun(null);
      } catch (e) { setFile({ name: f.name, error: e.message || String(e) }); }
    };
    isExcel ? reader.readAsArrayBuffer(f) : reader.readAsText(f);
  };
  const template = () => dl("﻿" + [TEMPLATE_HEADERS, ...TEMPLATE_ROWS].map(r => r.map(csvCell).join(",")).join("\n"), "text/csv;charset=utf-8", `columns_template_${entity.l}.csv`);

  const create = async () => {
    if (!valid.length || !sol) return;
    const lines = [`Create ${valid.length} column${valid.length === 1 ? "" : "s"} on ${entity.d} (${entity.l})?`, ""];
    for (const s of valid.slice(0, 10)) lines.push(`• ${s.schema} — ${KIND_LABEL[s.kind]}${s.kind === "lookup" ? ` → ${s.target}` : ""}`);
    if (valid.length > 10) lines.push(`• … and ${valid.length - 10} more`);
    lines.push("", `In solution ${sol.name} (prefix ${sol.prefix}_). One request per column, then the table is published.`, "A column can't be undone from here — delete it in the maker portal if needed.");
    if (checked.length > valid.length) lines.push(`${checked.length - valid.length} row${checked.length - valid.length === 1 ? "" : "s"} with errors are skipped.`);
    if (!window.confirm(lines.join("\n"))) return;
    if (!confirmProd(isProduction, `Create ${valid.length} column(s) on ${entity.l}`)) return;
    stop.current = false;
    const results = checked.map(s => ({ row: s.row, schema: s.schema, kind: s.kind, ok: s.errors.length ? null : undefined, msg: s.errors.length ? "skipped: " + s.errors[0] : "" }));
    setRun({ phase: "running", results: [...results], done: 0, total: valid.length });
    let n = 0;
    for (const s of valid) {
      if (stop.current) { for (const r of results) if (r.ok === undefined) { r.ok = null; r.msg = "not sent (stopped)"; } break; }
      const r = results.find(x => x.row === s.row);
      try { const { kind, body } = buildCreateBody(s, { entity: entity.l, languageCode: targets?.languageCode || 1033 }); await bridge.createColumn({ entity: entity.l, kind, body, solution: sol.uniqueName }); r.ok = true; r.msg = "created"; }
      catch (e) { r.ok = false; r.msg = e.message || String(e); }
      n++;
      setRun(x => ({ ...x, results: [...results], done: n }));
    }
    const made = results.filter(r => r.ok).length;
    let error = "";
    if (made) {
      setRun(x => ({ ...x, phase: "publishing" }));
      try { await bridge.publishEntity(entity.l); } catch (e) { error = `Created but not published: ${e.message || String(e)} — publish the table from the maker portal.`; }
      try { await bridge.clearCache(); } catch { /* cache */ }
      onDone?.();
    }
    setRun(x => ({ ...x, phase: "done", results: [...results], error }));
  };
  const exportResults = () => dl("﻿" + [["Row", "Schema name", "Kind", "Result", "Detail"], ...run.results.map(r => [r.row, r.schema, KIND_LABEL[r.kind] || r.kind || "", r.ok ? "Created" : r.ok === false ? "Failed" : "Skipped", r.msg])].map(r => r.map(csvCell).join(",")).join("\n"), "text/csv;charset=utf-8", `columns_created_${entity.l}.csv`);

  const sum = run ? summarizeResults(run.results) : null;
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,.55)" }} onClick={() => run?.phase !== "running" && onClose()}>
      <div style={{ width: 860, maxWidth: "95vw", maxHeight: "88vh", display: "flex", flexDirection: "column", background: C.sf, border: `1px solid ${C.bd}`, borderRadius: 10, boxShadow: "0 16px 48px rgba(0,0,0,.5)", overflow: "hidden" }} onClick={e => e.stopPropagation()}>
        <div style={{ padding: "14px 18px 10px", borderBottom: `1px solid ${C.bd}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontWeight: 700, fontSize: 15, flex: 1 }}>➕ Columns from file · {entity.d} <span style={{ ...mono, fontSize: 12, color: C.txd, fontWeight: 400 }}>{entity.l}</span></span>
            <button onClick={template} style={bt(null, { fontSize: 12 })}>⬇ Template CSV</button>
            <button onClick={onClose} disabled={run?.phase === "running"} style={{ background: "none", border: "none", color: C.txd, cursor: "pointer", padding: 4, fontSize: 16 }}>✕</button>
          </div>
          <div style={{ fontSize: 12, color: C.txd, marginTop: 4, lineHeight: 1.55 }}>One row per column: Display name, Type (text, multiline, whole number, decimal, float, currency, yes/no, date, datetime, choice, multiselect, lookup), Required (optional / recommended / required), Max length, Precision, Min, Max, Options (“Low;Medium;High” or “1:A;2:B”), Target (lookup table), Format (email, url, phone…), Description. Schema name optional — derived from the display name with the solution's prefix.</div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 10, flexWrap: "wrap" }}>
            <label style={{ fontSize: 12.5, color: C.txm }}>Solution</label>
            {targets === null ? <Spin s={11} /> : targets.error ? <span style={{ fontSize: 12, color: C.rd }}>{targets.error}</span> : (
              <select value={solution} onChange={e => setSolution(e.target.value)} disabled={run?.phase === "running"} style={inp({ width: "auto", fontSize: 12.5, padding: "4px 8px" })}>
                {targets.solutions.map(s => <option key={s.uniqueName} value={s.uniqueName}>{s.name} — prefix {s.prefix}_</option>)}
              </select>)}
            {targets && !targets.error && !targets.solutions.length && <span style={{ fontSize: 12, color: C.rd }}>No unmanaged solution with a publisher prefix — create one in the maker portal first.</span>}
            <span style={{ flex: 1 }} />
            <label style={{ ...bt(C.cy, { fontSize: 12 }), cursor: run?.phase === "running" ? "default" : "pointer" }}>📄 Choose a CSV / Excel file<input type="file" accept=".csv,.txt,.tsv,.xlsx,.xls" disabled={run?.phase === "running"} onChange={e => { onFile(e.target.files?.[0]); e.target.value = ""; }} style={{ display: "none" }} /></label>
          </div>
        </div>

        <div style={{ flex: 1, overflow: "auto", padding: "10px 18px" }}>
          {!file && <div style={{ color: C.txd, fontSize: 13, padding: "20px 0", textAlign: "center" }}>Pick a file — or download the template, fill it in Excel, and come back.</div>}
          {file?.error && <div style={{ color: C.rd, fontSize: 13 }}>Couldn't read {file.name}: {file.error}</div>}
          {parsed?.error && <div style={{ color: C.rd, fontSize: 13 }}>{file.name}: {parsed.error}</div>}
          {parsed && !parsed.error && <>
            <div style={{ fontSize: 12.5, color: C.txm, marginBottom: 8, display: "flex", gap: 10, flexWrap: "wrap" }}>
              <span><b style={{ color: C.tx }}>{file.name}</b> · {checked.length} row{checked.length === 1 ? "" : "s"}</span>
              <span style={{ color: C.gn }}>{valid.length} ready</span>
              {checked.length - valid.length > 0 && <span style={{ color: C.rd }}>{checked.length - valid.length} with errors</span>}
              {parsed.unknownHeaders.length > 0 && <span style={{ color: C.yw }} title={parsed.unknownHeaders.join(", ")}>{parsed.unknownHeaders.length} header{parsed.unknownHeaders.length === 1 ? "" : "s"} ignored</span>}
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
              <thead><tr>{["Row", "Schema name", "Display name", "Kind", "Required", "Details", run ? "Result" : "Check"].map(h => <th key={h} style={{ textAlign: "left", padding: "4px 6px", color: C.txd, fontSize: 11, fontWeight: 600, borderBottom: `1px solid ${C.bd}` }}>{h}</th>)}</tr></thead>
              <tbody>{checked.map(s => {
                const r = run?.results.find(x => x.row === s.row);
                const detail = [s.kind === "lookup" && s.target ? `→ ${s.target}` : "", s.maxLength != null ? `max ${s.maxLength}` : "", s.precision != null ? `precision ${s.precision}` : "", s.options?.length ? `${s.options.length} option${s.options.length === 1 ? "" : "s"}` : "", s.format || ""].filter(Boolean).join(" · ");
                return (
                  <tr key={s.row} style={{ borderBottom: `1px solid ${C.bd}44`, opacity: s.errors.length && run ? .6 : 1 }}>
                    <td style={{ padding: "4px 6px", color: C.txd, ...mono }}>{s.row}</td>
                    <td style={{ padding: "4px 6px", ...mono, color: C.cy }}>{s.schema}</td>
                    <td style={{ padding: "4px 6px" }}>{s.label}</td>
                    <td style={{ padding: "4px 6px", color: C.txm }}>{s.kind ? KIND_LABEL[s.kind] : <span style={{ color: C.rd }}>{s.typeWord || "—"}</span>}</td>
                    <td style={{ padding: "4px 6px", color: C.txm }}>{s.required === "ApplicationRequired" ? "Required" : s.required === "Recommended" ? "Recommended" : "Optional"}</td>
                    <td style={{ padding: "4px 6px", color: C.txd, fontSize: 11.5 }}>{detail}</td>
                    <td style={{ padding: "4px 6px", fontSize: 12 }}>
                      {run && r ? (r.ok ? <span style={{ color: C.gn }}>✓ created</span> : r.ok === false ? <span style={{ color: C.rd }} title={r.msg}>✗ {r.msg}</span> : r.ok === null ? <span style={{ color: C.txd }}>{r.msg}</span> : <Spin s={10} />)
                        : s.errors.length ? <span style={{ color: C.rd }}>{s.errors.join(" ")}</span> : <span style={{ color: C.gn }}>✓{s.warnings.length ? <span style={{ color: C.yw }}> {s.warnings.join(" ")}</span> : ""}</span>}
                    </td>
                  </tr>
                );
              })}</tbody>
            </table>
          </>}
        </div>

        <div style={{ padding: "10px 18px", borderTop: `1px solid ${C.bd}`, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", fontSize: 12.5 }}>
          {run?.phase === "running" && <><Spin s={11} /><span style={{ flex: 1, color: C.txm }}>Creating {run.done} / {run.total}…</span><button onClick={() => { stop.current = true; }} style={bt(C.rd, { fontSize: 12 })}>Stop</button></>}
          {run?.phase === "publishing" && <><Spin s={11} /><span style={{ flex: 1, color: C.txm }}>Publishing {entity.l}…</span></>}
          {run?.phase === "done" && <><span style={{ flex: 1, color: sum.failed ? C.yw : C.gn }}>{sum.ok} created{sum.failed ? `, ${sum.failed} failed` : ""}{sum.skipped ? `, ${sum.skipped} skipped` : ""}{sum.ok ? " — table published, columns reloaded." : "."}{run.error ? ` ${run.error}` : ""}</span><button onClick={exportResults} style={bt(null, { fontSize: 12 })}>Export results</button><button onClick={onClose} style={bt(null, { fontSize: 12 })}>Close</button></>}
          {!run && <><span style={{ flex: 1, color: C.txd }}>{valid.length ? `${valid.length} column${valid.length === 1 ? "" : "s"} will be created in ${sol?.name || "…"}; every write is confirmed.` : "Nothing to create yet."}</span><button onClick={onClose} style={bt(null, { fontSize: 12 })}>{t("common.cancel")}</button><button onClick={create} disabled={!valid.length || !sol} style={bt(C.gn, { fontSize: 12, opacity: valid.length && sol ? 1 : .5 })}>Create {valid.length || ""} column{valid.length === 1 ? "" : "s"}</button></>}
        </div>
      </div>
    </div>
  );
}
