import { useState, useEffect, useRef } from "react";
import { bridge } from "../d365-bridge.js";
import { C, Spin, mono, inp, bt, crd, ths, tds, dl, expName, confirmProd, FLDS } from "../shared.jsx";
import { readPairs, valuesToResolve, buildAssociationItems, summarizeAssociation, isGuid } from "../associationUtils.js";

// Loader › association mode — the target is a many-to-many (intersect) table: teammembership,
// systemuserroles, a custom N:N. Its rows are not created, the two records are ASSOCIATED (or
// disassociated). The file gives one column per end: a GUID, or a value resolved against a text
// column of that end's table (an email for systemuser, a name for team). Everything else is the
// Loader's usual contract: dry run, per-row log, retry of the errors, rollback of what was added.
export default function AssociationLoader({ target, csvData, entityList, isLive, orgInfo, bp, onBusy, onBack }) {
  const [rel, setRel] = useState(undefined); // undefined = loading, null = not a N:N table
  const [relErr, setRelErr] = useState("");
  const [fields, setFields] = useState({}); // entity → [{l,d,t}]
  const [ends, setEnds] = useState({ 1: { col: "", by: "guid" }, 2: { col: "", by: "guid" } });
  const [mode, setMode] = useState("add");
  const [phase, setPhase] = useState("idle"); // idle | resolving | running | done
  const [progress, setProgress] = useState({ done: 0, total: 0, note: "" });
  const [log, setLog] = useState([]); // [{ row (file), status, msg, id1, id2 }]
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [rollback, setRollback] = useState(null);
  const abortRef = useRef(false);
  const sentRef = useRef([]); // the pairs sent in the last live run (for retry / rollback)

  const entOf = (l) => (entityList || []).find(e => e.l === l) || null;
  const setOf = (l) => entOf(l)?.p || `${l}s`;
  const pkOf = (l) => entOf(l)?.pk || `${l}id`;
  const rows = csvData?.r || [];
  const fileRow = (i) => csvData?.ln?.[i] ?? (i + 2);
  const endEntity = (n) => (n === 1 ? rel?.entity1 : rel?.entity2);

  useEffect(() => { onBusy?.(phase === "resolving" || phase === "running"); }, [phase, onBusy]);

  // The relationship behind the table, then each end's text columns for the "match by" pickers.
  useEffect(() => {
    let alive = true;
    setRel(undefined); setRelErr(""); setResult(null); setLog([]); setError("");
    bridge.getIntersectRelationship(target).then(r => {
      if (!alive) return;
      setRel(r || null);
      if (!r) return;
      // pre-pair the file's columns: a header equal to the end's attribute (systemuserid) or
      // containing the table's name (team) — otherwise the user picks
      const h = csvData?.h || [];
      const near = (a, b) => a.includes(b) || (b.length >= 3 && b.includes(a)); // "user" ~ "systemuser", "team" ~ "teamid"
      const guess = (attr, ent) => h.find(x => x.toLowerCase() === attr.toLowerCase()) || h.find(x => near(x.toLowerCase(), ent.toLowerCase())) || "";
      const byOf = (col) => (col && rows[0] && !isGuid(rows[0][col]) ? "" : "guid"); // "" = pick a column to match by
      const c1 = guess(r.attr1, r.entity1), c2 = guess(r.attr2, r.entity2);
      setEnds({ 1: { col: c1, by: byOf(c1) }, 2: { col: c2, by: byOf(c2) } });
      for (const ent of [r.entity1, r.entity2]) {
        (isLive ? bridge.getFields(ent) : Promise.resolve(FLDS)).then(fl => {
          if (!alive) return;
          const text = (fl || []).map(f => ({ l: f.logical || f.l, d: f.display || f.d || f.logical || f.l, t: f.type || f.t })).filter(f => f.t === "String" || f.t === "Memo");
          setFields(prev => ({ ...prev, [ent]: text }));
        }).catch(() => { if (alive) setFields(prev => ({ ...prev, [ent]: [] })); });
      }
    }).catch(e => { if (alive) { setRel(null); setRelErr(e?.message || String(e)); } });
    return () => { alive = false; };
  }, [target, isLive]);

  const ready = rel && ends[1].col && ends[2].col && ends[1].by && ends[2].by;

  // value → guid for one end, through a text column: OR-chunks of 80, counting the records per
  // value so a value matching two records is reported ambiguous, never picked at random.
  const resolveEnd = async (n, values) => {
    const ent = endEntity(n), field = ends[n].by, pk = pkOf(ent), set = setOf(ent);
    const map = new Map();
    if (!values.length) return map;
    const counts = new Map();
    for (let i = 0; i < values.length; i += 80) {
      const slice = values.slice(i, i + 80);
      const filter = slice.map(v => `${field} eq '${String(v).replace(/'/g, "''")}'`).join(" or ");
      const data = isLive ? await bridge.query(set, { filter, select: `${field},${pk}`, top: "5000" }) : { records: [] };
      for (const rec of data?.records || []) {
        const kv = String(rec[field] ?? "").trim().toLowerCase(), id = rec[pk];
        if (!kv || !id) continue;
        counts.set(kv, (counts.get(kv) || 0) + 1);
        if (!map.has(kv)) map.set(kv, id);
      }
    }
    for (const [k, c] of counts) if (c > 1) map.set(k, { ambiguous: c });
    return map;
  };

  // The file → GUID pairs (resolving what needs it), the problems logged as the first entries.
  const prepare = async () => {
    const { pairs, blank } = readPairs(rows, ends[1].col, ends[2].col);
    setProgress({ done: 0, total: pairs.length, note: "Resolving the file's values…" });
    const r1 = ends[1].by === "guid" ? new Map() : await resolveEnd(1, valuesToResolve(pairs, 1, true));
    const r2 = ends[2].by === "guid" ? new Map() : await resolveEnd(2, valuesToResolve(pairs, 2, true));
    const { items, problems } = buildAssociationItems(pairs, r1, r2);
    const pre = [
      ...blank.map(b => ({ row: fileRow(b.row), status: "SKIPPED", msg: `Empty ${b.missing === "both" ? "both columns" : b.missing}` })),
      ...problems.map(p => ({ row: fileRow(p.row), status: p.duplicate ? "SKIPPED" : "ERROR", msg: p.msg })),
    ];
    return { items, pre };
  };

  const run = async (dry, retryItems = null) => {
    if (!ready || phase === "running" || phase === "resolving") return;
    setError(""); setResult(null); setRollback(null); abortRef.current = false;
    setPhase("resolving");
    try {
      const { items: fresh, pre } = retryItems ? { items: retryItems, pre: [] } : await prepare();
      const items = fresh;
      const base = [...pre];
      if (dry) {
        base.push(...items.map(it => ({ row: fileRow(it.row), status: mode === "remove" ? "WOULD DISASSOCIATE" : "WOULD ASSOCIATE", msg: `${it.id1} ⟷ ${it.id2}`, id1: it.id1, id2: it.id2 })));
        setLog(base.sort((a, b) => (a.row || 0) - (b.row || 0)));
        setResult({ dry: true, pairs: items.length, skipped: pre.length, done: 0, already: 0, errors: pre.filter(e => e.status === "ERROR").length });
        setPhase("done");
        return;
      }
      if (!items.length) { setLog(base); setResult({ pairs: 0, skipped: pre.length, done: 0, already: 0, errors: pre.filter(e => e.status === "ERROR").length }); setPhase("done"); return; }
      const label = `${mode === "remove" ? "Remove" : "Add"} ${items.length} association${items.length > 1 ? "s" : ""} in ${rel.intersect} (${rel.entity1} ⟷ ${rel.entity2})`;
      if (!confirmProd(orgInfo?.isProduction, label)) { setPhase("idle"); return; }
      setPhase("running");
      setProgress({ done: 0, total: items.length, note: "" });
      sentRef.current = items;
      const res = await bridge.batchAssociate({ set1: setOf(rel.entity1), nav1: rel.nav1, set2: setOf(rel.entity2) }, items.map(it => ({ id1: it.id1, id2: it.id2 })), mode,
        (p) => setProgress({ done: p.done, total: p.total, note: "" }), () => abortRef.current, { chunk: 100, concurrency: 4 });
      const entries = (res?.log || []).map(e => { const it = items[(e.row || 1) - 1]; return { row: it ? fileRow(it.row) : 0, status: e.status, msg: e.msg || e.note || "", already: !!e.already, id1: it?.id1, id2: it?.id2 }; });
      const all = [...base, ...entries].sort((a, b) => (a.row || 0) - (b.row || 0));
      setLog(all);
      const sum = summarizeAssociation(entries);
      setResult({ pairs: items.length, skipped: pre.length, done: sum.done, already: sum.already, errors: sum.errors + pre.filter(e => e.status === "ERROR").length, cancelled: !!res?.aborted });
      setPhase("done");
    } catch (e) {
      setError(e?.message || String(e));
      setPhase(log.length ? "done" : "idle");
    }
  };

  const retryErrors = () => {
    const failed = new Set(log.filter(e => e.status === "ERROR" && e.id1).map(e => `${e.id1}|${e.id2}`));
    const again = sentRef.current.filter(it => failed.has(`${it.id1}|${it.id2}`));
    if (again.length) run(false, again);
  };

  // Undo an "add" run: disassociate what THIS run associated (not what already was).
  const doRollback = async () => {
    const pairs = log.filter(e => e.status === "ASSOCIATED" && !e.already && e.id1).map(e => ({ id1: e.id1, id2: e.id2 }));
    if (!pairs.length) return;
    if (!window.confirm(`Remove the ${pairs.length} association${pairs.length > 1 ? "s" : ""} this run added?`)) return;
    if (!confirmProd(orgInfo?.isProduction, `Remove ${pairs.length} associations in ${rel.intersect}`)) return;
    setRollback({ running: true });
    try {
      const res = await bridge.batchAssociate({ set1: setOf(rel.entity1), nav1: rel.nav1, set2: setOf(rel.entity2) }, pairs, "remove", null, () => false, { chunk: 100, concurrency: 4 });
      const sum = summarizeAssociation(res?.log || []);
      setRollback({ done: true, removed: sum.done + sum.already, errors: sum.errors });
    } catch (e) { setRollback({ done: true, removed: 0, errors: pairs.length, msg: e?.message || String(e) }); }
  };

  const exportLog = () => {
    const esc = (v) => { let s = String(v ?? ""); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return `"${s.replace(/"/g, '""')}"`; };
    const lines = [["Row", "Status", "Detail", rel?.entity1 || "end1", rel?.entity2 || "end2", ...(csvData?.h || [])].map(esc).join(",")];
    for (const e of log) { const orig = e.row >= 2 ? rows[(csvData?.ln || []).indexOf(e.row) >= 0 ? (csvData.ln || []).indexOf(e.row) : e.row - 2] : null; lines.push([e.row, e.status, e.msg || "", e.id1 || "", e.id2 || "", ...(csvData?.h || []).map(h => orig?.[h] ?? "")].map(esc).join(",")); }
    dl("﻿" + lines.join("\n"), "text/csv;charset=utf-8", expName(`${target}_associations`, "csv"));
  };

  const EndPicker = ({ n }) => {
    const ent = endEntity(n);
    const e = ends[n];
    const fl = fields[ent];
    return (
      <div style={{ ...crd({ padding: 12 }), flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, color: C.txm, fontWeight: 600, marginBottom: 6 }}>End {n} — <span style={{ ...mono, color: C.cy }}>{ent}</span> <span style={{ color: C.txd, fontWeight: 400 }}>({entOf(ent)?.d || ent})</span></div>
        <label style={{ fontSize: 11, color: C.txd, display: "block", marginBottom: 2 }}>File column</label>
        <select value={e.col} onChange={ev => setEnds(p => ({ ...p, [n]: { ...p[n], col: ev.target.value } }))} style={inp({ fontSize: 12, marginBottom: 8 })}>
          <option value="">— pick a column —</option>
          {(csvData?.h || []).map(h => <option key={h} value={h}>{h}</option>)}
        </select>
        <label style={{ fontSize: 11, color: C.txd, display: "block", marginBottom: 2 }}>The column holds</label>
        <select value={e.by} onChange={ev => setEnds(p => ({ ...p, [n]: { ...p[n], by: ev.target.value } }))} style={inp({ fontSize: 12 })}>
          <option value="">— choose —</option>
          <option value="guid">the record's GUID</option>
          {fl === undefined && <option disabled>loading columns…</option>}
          {(fl || []).map(f => <option key={f.l} value={f.l}>a value of {f.d} ({f.l})</option>)}
        </select>
        {e.col && rows[0] && <div style={{ fontSize: 11, color: C.txd, marginTop: 6, ...mono, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>e.g. {rows[0][e.col] || "—"}</div>}
      </div>
    );
  };

  const busy = phase === "resolving" || phase === "running";
  if (rel === undefined) return <div style={{ padding: 20, color: C.txm, fontSize: 13, display: "flex", gap: 8, alignItems: "center" }}><Spin s={14} /> Reading the relationship behind {target}…</div>;
  if (!rel) return (
    <div style={{ ...crd({ padding: 14, borderColor: C.rd + "55" }), fontSize: 12.5, color: C.rd, lineHeight: 1.6 }}>
      {relErr ? `Couldn't read the relationship behind ${target}: ${relErr}` : `${target} is listed as an intersect table but no many-to-many relationship names it — it can't be loaded by association.`}
      <div style={{ marginTop: 8 }}><button onClick={onBack} style={bt()}>← Back</button></div>
    </div>
  );

  return (
    <div>
      <div style={{ ...crd({ padding: "10px 14px", background: C.vi + "0c", borderColor: C.vi + "44" }), marginBottom: 12, fontSize: 12.5, lineHeight: 1.6, color: C.txm }}>
        <b style={{ color: C.vi }}>N:N table</b> — <span style={mono}>{rel.intersect}</span> holds the links of <b>{rel.schemaName}</b> between <span style={mono}>{rel.entity1}</span> and <span style={mono}>{rel.entity2}</span>. Its rows aren't created: each file row <b>associates</b> (or disassociates) one record of each table. Give one column per end — a GUID, or a value Colvio resolves against a text column of that table (an email, a name). An association that already exists counts as "already", never as an error.
      </div>
      <div style={{ display: "flex", gap: 10, marginBottom: 12, flexDirection: bp?.mobile ? "column" : "row" }}>
        <EndPicker n={1} />
        <EndPicker n={2} />
        <div style={{ ...crd({ padding: 12 }), flex: "0 0 auto" }}>
          <div style={{ fontSize: 12, color: C.txm, fontWeight: 600, marginBottom: 6 }}>Action</div>
          <label style={{ fontSize: 12, color: mode === "add" ? C.gn : C.txd, cursor: "pointer", display: "flex", alignItems: "center", gap: 4, marginBottom: 4 }}><input type="radio" checked={mode === "add"} onChange={() => setMode("add")} style={{ accentColor: C.gn }} /> ASSOCIATE (add the link)</label>
          <label style={{ fontSize: 12, color: mode === "remove" ? C.rd : C.txd, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}><input type="radio" checked={mode === "remove"} onChange={() => setMode("remove")} style={{ accentColor: C.rd }} /> DISASSOCIATE (remove the link)</label>
          <div style={{ fontSize: 11, color: C.txd, marginTop: 8 }}>{rows.length.toLocaleString()} rows in the file</div>
        </div>
      </div>
      {error && <div style={{ fontSize: 12, color: C.rd, marginBottom: 8 }}>{error}</div>}
      <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
        <button onClick={onBack} style={bt()} disabled={busy}>← Back</button>
        <button onClick={() => run(true)} disabled={!ready || busy} style={bt(null, { opacity: !ready || busy ? .5 : 1 })} title="Resolve every value and list what would be done — nothing is written">🔍 Dry run</button>
        <button onClick={() => run(false)} disabled={!ready || busy} style={bt(mode === "remove" ? C.rd : `linear-gradient(135deg,${C.vi},${C.cy})`, { opacity: !ready || busy ? .5 : 1 })}>{busy ? <><Spin s={11} /> {phase === "resolving" ? "Resolving…" : `${progress.done.toLocaleString()} / ${progress.total.toLocaleString()}`}</> : mode === "remove" ? "🗑 Disassociate" : "🔗 Associate"}</button>
        {phase === "running" && <button onClick={() => { abortRef.current = true; }} style={bt(C.rd)}>■ Cancel</button>}
        {!ready && <span style={{ fontSize: 11, color: C.txd }}>pick a file column and what it holds for both ends</span>}
      </div>
      {result && (
        <div style={{ ...crd({ padding: 12 }), marginBottom: 12 }}>
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 12.5, alignItems: "center" }}>
            <span style={{ fontWeight: 600, color: result.dry ? C.cy : result.errors ? C.yw : C.gn }}>{result.dry ? "🔍 Dry run" : result.cancelled ? "⏹ Cancelled" : result.errors ? "⚠ Done with errors" : "✅ Done"}</span>
            <span>{result.dry ? "Would " + (mode === "remove" ? "disassociate" : "associate") : mode === "remove" ? "Disassociated" : "Associated"}: <b>{(result.dry ? result.pairs : result.done).toLocaleString()}</b></span>
            {!result.dry && <span>Already {mode === "remove" ? "absent" : "linked"}: <b>{result.already.toLocaleString()}</b></span>}
            <span>Skipped: <b>{result.skipped.toLocaleString()}</b></span>
            <span style={{ color: result.errors ? C.rd : C.txd }}>Errors: <b>{result.errors.toLocaleString()}</b></span>
            <span style={{ flex: 1 }} />
            {!result.dry && result.errors > 0 && <button onClick={retryErrors} style={bt(null, { fontSize: 11 })} disabled={busy}>↻ Retry the errors</button>}
            {!result.dry && mode === "add" && result.done > 0 && !rollback?.done && (rollback?.running ? <span style={{ fontSize: 11, color: C.txm }}><Spin s={10} /> Rolling back…</span> : <button onClick={doRollback} style={bt(C.rd, { fontSize: 11 })} disabled={busy}>↶ Rollback (remove what was added)</button>)}
            {rollback?.done && <span style={{ fontSize: 11, color: rollback.errors ? C.rd : C.gn }}>Rollback: {rollback.removed} removed{rollback.errors ? `, ${rollback.errors} failed` : ""}{rollback.msg ? ` — ${rollback.msg}` : ""}</span>}
            <button onClick={exportLog} style={bt(null, { fontSize: 11 })}>⬇ Log (CSV)</button>
          </div>
        </div>
      )}
      {log.length > 0 && (
        <div style={{ ...crd({ padding: 0 }), overflow: "auto", maxHeight: 360 }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr><th style={ths()}>Row</th><th style={ths()}>Status</th><th style={ths()}>{rel.entity1}</th><th style={ths()}>{rel.entity2}</th><th style={ths()}>Detail</th></tr></thead>
            <tbody>{log.slice(0, 2000).map((e, i) => (
              <tr key={i} style={{ borderBottom: `1px solid ${C.bd}` }}>
                <td style={{ ...tds, ...mono, color: C.txm }}>{e.row || ""}</td>
                <td style={{ ...tds, fontSize: 11, fontWeight: 600, color: e.status === "ERROR" ? C.rd : e.status === "SKIPPED" ? C.yw : e.status.startsWith("WOULD") ? C.cy : C.gn }}>{e.status}{e.already ? " (already)" : ""}</td>
                <td style={{ ...tds, ...mono, fontSize: 11, color: C.txd }}>{e.id1 || ""}</td>
                <td style={{ ...tds, ...mono, fontSize: 11, color: C.txd }}>{e.id2 || ""}</td>
                <td style={{ ...tds, fontSize: 12, color: e.status === "ERROR" ? C.rd : C.txm, whiteSpace: "normal" }}>{e.msg}</td>
              </tr>
            ))}</tbody>
          </table>
          {log.length > 2000 && <div style={{ padding: 8, fontSize: 11, color: C.txd }}>{log.length - 2000} more rows — in the CSV log</div>}
        </div>
      )}
    </div>
  );
}
