import { useState, useEffect, useMemo } from "react";
import { bridge } from "../d365-bridge.js";
import { C, Spin, mono, inp, bt, crd, ths, tds, exportTable } from "../shared.jsx";
import { buildTriggerIndex, firesOn, watchedColumns, triggerText, KIND_LABEL, TIMING_LABEL, STAGE_LABEL, FIRES_HEADERS, firesExportRows } from "../triggerIndex.js";

const TIMING_COLOR = { sync: () => C.or, realtime: () => C.or, async: () => C.cy, background: () => C.cy };
const Chip = ({ color, title, children, dim }) => <span title={title} style={{ fontSize: 10.5, padding: "2px 7px", borderRadius: 4, fontWeight: 600, whiteSpace: "nowrap", background: color + (dim ? "11" : "22"), color, cursor: title ? "help" : "default" }}>{children}</span>;
const EVERY_HINT = "No column list on this Update trigger: it runs on every update of the table, whatever changed — the cost (and the surprise) an audit is after.";

// Automation › 🎯 Fires on — pick a table, then a column: every plug-in step, classic workflow and
// cloud flow that runs when it changes, from what the org stores (triggerIndex.js). The flow
// definitions come from the parent's paged read, shared with the Cloud flows tab and Who runs it.
export default function FiresOn({ steps, procs, flowDefs, flowRead, onStop, bp }) {
  const [entity, setEntity] = useState("");
  const [column, setColumn] = useState("");
  const [showInactive, setShowInactive] = useState(true);
  const [fields, setFields] = useState({ entity: "", phase: "idle", list: [], error: "" });
  const index = useMemo(() => buildTriggerIndex({ steps, procs, flowDefs }), [steps, procs, flowDefs]);
  const tables = useMemo(() => [...index.byEntity.entries()].map(([e, rows]) => ({ e, n: rows.length })).sort((a, b) => a.e.localeCompare(b.e)), [index]);
  const ent = entity.trim().toLowerCase(), col = column.trim().toLowerCase();
  const known = index.byEntity.has(ent);
  const res = useMemo(() => (ent ? firesOn(index, ent, col) : null), [index, ent, col]);
  const watched = useMemo(() => (ent ? watchedColumns(index, ent) : null), [index, ent]);

  // the table's columns for the picker — one read, cached by the bridge; a failed read leaves the typed name usable
  useEffect(() => {
    if (!ent || !known) { setFields({ entity: ent, phase: "idle", list: [], error: "" }); return undefined; }
    let alive = true;
    setFields({ entity: ent, phase: "reading", list: [], error: "" });
    bridge.getFields(ent)
      .then(f => { if (alive) setFields({ entity: ent, phase: Array.isArray(f) && f.length ? "ok" : "failed", list: Array.isArray(f) ? f : [], error: Array.isArray(f) && f.length ? "" : "no columns came back" }); })
      .catch(e => { if (alive) setFields({ entity: ent, phase: "failed", list: [], error: e?.message || String(e) }); });
    return () => { alive = false; };
  }, [ent, known]);

  // the column picker: the table's columns, the watched ones first (with how many registrations list them)
  const columnOptions = useMemo(() => {
    if (!watched) return [];
    const seen = new Set(), out = [];
    for (const f of fields.list) { const l = String(f.logical || f.l || "").toLowerCase(); if (!l || seen.has(l)) continue; seen.add(l); out.push({ l, d: f.display || f.d || "", n: watched.columns.get(l) || 0 }); }
    for (const [l, n] of watched.columns) if (!seen.has(l)) { seen.add(l); out.push({ l, d: "", n }); }
    return out.sort((a, b) => (b.n - a.n) || a.l.localeCompare(b.l));
  }, [fields.list, watched]);

  const shown = (rows) => (showInactive ? rows : rows.filter(r => r.active || r.pending));
  const exportRows = (format) => res && exportTable(FIRES_HEADERS, firesExportRows(res), `automation_fires_on_${ent}${col ? "_" + col : ""}`, format, "FiresOn");
  const n = (v) => Number(v || 0).toLocaleString();
  const plural = (v, w) => `${n(v)} ${w}${Number(v) === 1 ? "" : "s"}`;

  const TriggerCell = ({ r }) => {
    if (r.pending) return <span style={{ color: C.txd }} title="This flow's definition hasn't been read yet (the read is still running, was stopped, or failed)">definition not read yet</span>;
    const parts = [];
    if (r.on.create) parts.push(<Chip key="c" color={C.txm}>Create</Chip>);
    if (r.on.update) {
      parts.push(<Chip key="u" color={C.txm}>Update</Chip>);
      if (r.everyColumn) parts.push(<Chip key="e" color={C.yw} title={EVERY_HINT}>every column</Chip>);
      else r.columns.forEach(c => parts.push(<Chip key={c} color={c === col ? C.gn : C.txd} dim={c !== col} title={c === col ? "The column you asked about" : undefined}>{c}</Chip>));
    }
    if (r.on.delete) parts.push(<Chip key="d" color={C.txm}>Delete</Chip>);
    if (!parts.length) return <span style={{ color: C.txm }}>{r.on.other || "—"}</span>;
    return <span style={{ display: "inline-flex", gap: 4, flexWrap: "wrap" }}>{parts}</span>;
  };
  const Group = ({ kind, rows }) => rows.length === 0 ? null : (
    <div style={{ ...crd({ padding: 0, overflow: "hidden" }), marginBottom: 12 }}>
      <div style={{ padding: "8px 12px", borderBottom: `1px solid ${C.bd}`, fontWeight: 700, fontSize: 13 }}>{KIND_LABEL[kind]}s <span style={{ ...mono, fontSize: 11, color: C.txm }}>({n(rows.length)})</span></div>
      <div style={{ overflow: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 640 }}>
          <thead><tr><th style={ths()}>Name</th><th style={ths()}>Fires on</th><th style={ths()} title="Sync steps and real-time workflows run inside the save and can block it; async steps, background workflows and cloud flows run after it">When</th>{kind === "flow" && <th style={ths()}>Scope · row filter</th>}<th style={ths()}>State</th><th style={ths()}>{kind === "step" ? "Runs as" : "Owner"}</th></tr></thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id} style={{ borderBottom: `1px solid ${C.bd}22`, opacity: r.active || r.pending ? 1 : 0.55 }}>
                <td style={{ ...tds, maxWidth: 320 }} title={r.detail || r.name}><div>{r.name}</div>{r.detail && <div style={{ fontSize: 11, color: C.txd }}>{r.detail}</div>}</td>
                <td style={{ ...tds, whiteSpace: "normal" }}><TriggerCell r={r} /></td>
                <td style={tds}><Chip color={TIMING_COLOR[r.timing]()} title={r.stage ? STAGE_LABEL[r.stage] || `stage ${r.stage}` : undefined}>{TIMING_LABEL[r.timing]}{r.stage ? ` · ${STAGE_LABEL[r.stage] || r.stage}` : ""}</Chip></td>
                {kind === "flow" && <td style={{ ...tds, fontSize: 12, color: C.txm, whiteSpace: "normal", maxWidth: 240 }}>{[r.scope, r.rowFilter ? `rows: ${r.rowFilter}` : ""].filter(Boolean).join(" · ") || "—"}</td>}
                <td style={tds}>{r.pending ? <span style={{ color: C.txd }}>—</span> : <Chip color={r.active ? C.gn : C.rd}>{r.active ? (kind === "step" ? "Enabled" : "Activated") : (kind === "step" ? "Disabled" : "Draft")}</Chip>}</td>
                <td style={{ ...tds, color: C.txm, fontSize: 12, maxWidth: 180 }}>{r.owner || (kind === "step" ? <span style={{ color: C.txd }}>calling user</span> : "—")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  const total = res ? Object.values(res.groups).reduce((a, g) => a + shown(g).length, 0) : 0;
  return (
    <div>
      <div style={{ ...crd({ padding: bp?.mobile ? 12 : 14 }), marginBottom: 12 }}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div style={{ flex: 1, minWidth: 220 }}>
            <label style={{ fontSize: 12, color: C.txm, fontWeight: 500, display: "block", marginBottom: 4 }}>Table</label>
            <input list="fires-tables" value={entity} onChange={e => { setEntity(e.target.value); setColumn(""); }} placeholder="account, contact… (the tables something is registered on)" style={inp({ fontSize: 13, ...mono })} />
            <datalist id="fires-tables">{tables.map(t => <option key={t.e} value={t.e} label={`${t.n} registration${t.n === 1 ? "" : "s"}`} />)}</datalist>
          </div>
          <div style={{ flex: 1, minWidth: 220 }}>
            <label style={{ fontSize: 12, color: C.txm, fontWeight: 500, display: "block", marginBottom: 4 }}>Column <span style={{ color: C.txd, fontWeight: 400 }}>(optional — leave empty for everything on the table)</span></label>
            <input list="fires-columns" value={column} onChange={e => setColumn(e.target.value)} disabled={!known} placeholder={known ? (fields.phase === "reading" ? "reading the table's columns…" : "logical name, e.g. telephone1") : "pick a table first"} style={inp({ fontSize: 13, ...mono })} />
            <datalist id="fires-columns">{columnOptions.map(c => <option key={c.l} value={c.l} label={`${c.d ? c.d + " · " : ""}${c.n ? `listed by ${c.n}` : "listed by none"}`} />)}</datalist>
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11.5, color: C.txm, cursor: "pointer", paddingBottom: 8 }}>
            <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} style={{ accentColor: C.vi }} /> include disabled / draft
          </label>
          <button onClick={() => exportRows("csv")} disabled={!res || !res.total} style={bt(C.cy, { fontSize: 11, padding: "4px 10px", opacity: res && res.total ? 1 : 0.5 })}>CSV</button>
          <button onClick={() => exportRows("xlsx")} disabled={!res || !res.total} style={bt(C.cy, { fontSize: 11, padding: "4px 10px", opacity: res && res.total ? 1 : 0.5 })}>Excel</button>
        </div>
        {fields.phase === "failed" && known && <div style={{ fontSize: 11.5, color: C.yw, marginTop: 6 }}>The table's columns couldn't be read ({fields.error}) — type the column's logical name; the columns something lists are still offered.</div>}
        {flowRead?.phase === "reading" && <div style={{ fontSize: 11.5, color: C.txm, marginTop: 6 }}><Spin s={9} /> reading the flow definitions · {n(flowRead.done)} <button onClick={onStop} style={bt(null, { fontSize: 10.5, padding: "1px 7px", marginLeft: 4 })}>Stop</button> — flows whose definition isn't read yet are listed as such</div>}
        {(flowRead?.phase === "stopped" || flowRead?.phase === "failed") && <div style={{ fontSize: 11.5, color: flowRead.phase === "failed" ? C.rd : C.yw, marginTop: 6 }}>flow definitions {flowRead.phase === "failed" ? `couldn't all be read${flowRead.error ? `: ${flowRead.error}` : ""}` : `stopped after ${n(flowRead.done)}`} — {n(index.pendingFlows)} flow{index.pendingFlows === 1 ? "" : "s"} not read: their triggers are unknown</div>}
      </div>

      {!ent && <div style={{ ...crd({ padding: 16 }), color: C.txm, fontSize: 13, lineHeight: 1.6 }}>Pick a table to see everything registered to run on it — plug-in steps, classic workflows, cloud flows — then a column to keep only what runs when that column changes. An Update trigger with no column list runs on <b>every</b> column: those are flagged. <span style={{ color: C.txd }}>{n(index.rows.length)} registrations indexed on {n(tables.length)} tables.</span></div>}
      {ent && !known && <div style={{ ...crd({ padding: 16 }), color: C.txm, fontSize: 13 }}>Nothing is registered on <code style={{ ...mono, color: C.cy }}>{ent}</code>{index.pendingFlows ? ` — ${n(index.pendingFlows)} flow definitions aren't read yet, one of them may be.` : "."}</div>}
      {res && known && (<>
        <div style={{ fontSize: 13, color: C.txm, marginBottom: 10, lineHeight: 1.6 }}>
          {col
            ? <>When <code style={{ ...mono, color: C.cy }}>{col}</code> of <code style={{ ...mono, color: C.cy }}>{ent}</code> changes: <b style={{ color: C.tx }}>{plural(res.total, "registration")}</b> run{res.total === 1 ? "s" : ""}{res.blocking ? <>, <b style={{ color: C.or }}>{res.blocking}</b> inside the save (sync / real-time)</> : ""}{res.everyColumn ? <> — <b style={{ color: C.yw }}>{res.everyColumn}</b> of them because they run on every column</> : ""}.{(res.alsoCreate || res.alsoDelete) ? <span style={{ color: C.txd }}> Not about this column, so not listed: {[res.alsoCreate ? `${n(res.alsoCreate)} on create` : "", res.alsoDelete ? `${n(res.alsoDelete)} on delete` : ""].filter(Boolean).join(", ")} of {ent}.</span> : ""}</>
            : <>On <code style={{ ...mono, color: C.cy }}>{ent}</code>: <b style={{ color: C.tx }}>{plural(res.total, "registration")}</b> — {plural(res.groups.step.length, "plug-in step")}, {plural(res.groups.workflow.length, "workflow")}, {plural(res.groups.flow.length, "cloud flow")}{res.blocking ? <>; <b style={{ color: C.or }}>{res.blocking}</b> run{res.blocking === 1 ? "s" : ""} inside the save</> : ""}{res.everyColumn ? <>; <b style={{ color: C.yw }}>{res.everyColumn}</b> run on every update</> : ""}.</>}
          {res.pending ? <span style={{ color: C.yw }}> {n(res.pending)} flow definition{res.pending === 1 ? "" : "s"} not read yet.</span> : null}
        </div>
        {total === 0 && <div style={{ ...crd({ padding: 16 }), color: C.txm, fontSize: 13 }}>{col ? <>Nothing runs when <code style={{ ...mono, color: C.cy }}>{col}</code> changes — no registration lists it, and none on this table runs on every column.</> : "Nothing registered on this table."}{!showInactive && res.total ? " (disabled / draft ones hidden)" : ""}</div>}
        <Group kind="step" rows={shown(res.groups.step)} />
        <Group kind="workflow" rows={shown(res.groups.workflow)} />
        <Group kind="flow" rows={shown(res.groups.flow)} />
      </>)}
      <div style={{ fontSize: 11.5, color: C.txd, lineHeight: 1.6, marginTop: 4 }}>Read from the registrations themselves: a step's filtering attributes, a workflow's "Record fields change" list (status change = statecode, assignment = ownerid), a cloud flow's Dataverse trigger (change type, Select columns, scope, row filter). Not here: business rules (form logic, client-side), actions and BPFs (called, not triggered), flows started by a schedule, a button or another connector, calculated and rollup columns (not automations). A flow's row filter narrows the rows, not the columns.</div>
    </div>
  );
}
