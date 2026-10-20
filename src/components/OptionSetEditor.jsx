import { useState, useEffect, useRef } from "react";
import { bridge } from "../d365-bridge.js";
import { C, Spin, mono, inp, bt, confirmProd } from "../shared.jsx";
import { insertBody, updateBody, deleteBody, orderBody, validateNewOption, validateRename, moveValue, sameOrder, countRowsFetch, deleteConfirmText } from "../optionSetEdit.js";

// Metadata › Values › ✏️ Edit — add, rename, reorder, delete the options of a choice column through
// Dataverse's own actions, each confirmed (twice on production), then published. onChanged(options)
// keeps the panel's read-only list in step.
export default function OptionSetEditor({ entity, field, isProduction, onChanged }) {
  const [info, setInfo] = useState(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState("");
  const [note, setNote] = useState("");
  const [names, setNames] = useState({}); // value → label being typed
  const [order, setOrder] = useState([]);
  const [add, setAdd] = useState({ label: "", value: "" });
  const gen = useRef(0);

  const load = async () => {
    const my = ++gen.current;
    setErr("");
    try {
      const i = await bridge.getOptionSetInfo(entity, field.l);
      if (gen.current !== my) return;
      setInfo(i); setOrder(i.options.map(o => o.value)); setNames({});
      onChanged?.(i.options.map(o => ({ value: o.value, label: o.label, description: "", color: o.color })));
    } catch (e) { if (gen.current === my) setErr(e.message || String(e)); }
  };
  useEffect(() => { load(); return () => { gen.current++; }; }, [entity, field.l]);

  const target = info ? { isGlobal: info.isGlobal, name: info.name, entity, attribute: field.l } : null;
  const where = info?.isGlobal ? `the global choice ${info.name}` : `${entity}.${field.l}`;

  // One change: confirm, write, publish, re-read.
  const apply = async (label, op, body, confirmText) => {
    if (confirmText && !window.confirm(confirmText)) return;
    if (!confirmProd(isProduction, `${label} (${where})`)) return;
    setBusy(label); setNote(""); setErr("");
    let r;
    try { r = await bridge.optionSetChange(op, body); }
    catch (e) { setErr(`${label} failed: ${e.message || String(e)}`); setBusy(""); return; }
    // the change is in: a publish failure must not read as "the change failed" (a retry would double it)
    let pubErr = "";
    setBusy("Publishing…");
    try { if (info.isGlobal) await bridge.publishOptionSet(info.name); else await bridge.publishEntity(entity); }
    catch (e) { pubErr = e.message || String(e); }
    try { await load(); } catch { /* load() reports its own error */ }
    if (pubErr) setErr(`${label} done but NOT published (${pubErr}) — publish ${info.isGlobal ? "the choice" : "the table"} from the maker portal.`);
    else setNote(`✓ ${label}${op === "insert" && r?.NewOptionValue != null ? ` (value ${r.NewOptionValue})` : ""} — published.`);
    if (op === "insert") setAdd({ label: "", value: "" });
    setBusy("");
  };

  const doAdd = () => {
    const v = validateNewOption(add.label, add.value, info.options);
    if (v) { setErr(v); return; }
    apply(`Add “${add.label.trim()}”`, "insert", insertBody(target, add.label.trim(), add.value === "" ? null : Number(add.value), info.languageCode),
      `Add the option “${add.label.trim()}”${add.value !== "" ? ` with value ${add.value}` : " (Dataverse picks the value with your publisher's prefix)"} to ${where}?${info.isGlobal ? "\n\nIt's a global choice: every column using it gets the option." : ""}`);
  };
  const doRename = (o) => {
    const l = names[o.value];
    const v = validateRename(l, o, info.options);
    if (v === "unchanged") { setNames(n => { const x = { ...n }; delete x[o.value]; return x; }); return; }
    if (v) { setErr(v); return; }
    apply(`Rename ${o.value} to “${l.trim()}”`, "update", updateBody(target, o.value, l.trim(), info.languageCode),
      `Rename option ${o.value} from “${o.label}” to “${l.trim()}” in ${where}?\n\nRows keep their value; every view, form and export shows the new label. Labels in other languages are kept.`);
  };
  const doDelete = async (o) => {
    setBusy("Counting the rows that hold it…"); setErr("");
    let rows = null;
    try {
      const meta = await bridge.getEntityMetadata(entity);
      const r = await bridge.executeFetchXml(countRowsFetch(entity, meta.primaryId || `${entity}id`, field.l, o.value));
      rows = Number(r?.records?.[0]?.n) || 0;
    } catch (e) { rows = /AggregateQueryRecordLimit|maximum record limit|50000/i.test(e.message || "") ? "many" : null; }
    finally { setBusy(""); }
    apply(`Delete “${o.label}”`, "delete", deleteBody(target, o.value), deleteConfirmText({ option: o, rows, isGlobal: info.isGlobal, name: info.name, column: `${entity}.${field.l}` }));
  };
  const doOrder = () => apply("Save the order", "order", orderBody(target, order), `Save this order of the ${order.length} options of ${where}?\n\nThe order is how forms and filters list them; values don't change.`);

  if (err && !info) return <div style={{ padding: 16, color: C.rd, fontSize: 13 }}>Couldn't read the choice: {err} <button onClick={load} style={{ ...bt(null, { fontSize: 12 }), marginLeft: 8 }}>↻ Retry</button></div>;
  if (!info) return <div style={{ padding: 20, color: C.txd, fontSize: 13 }}><Spin s={12} /> Reading the choice…</div>;
  const byValue = new Map(info.options.map(o => [o.value, o]));
  const orderChanged = !sameOrder(order, info.options.map(o => o.value));
  const locked = info.managed && !info.customizable;

  return (
    <div style={{ padding: "10px 16px" }}>
      <div style={{ fontSize: 12, color: C.txm, marginBottom: 8, lineHeight: 1.5 }}>
        {info.isGlobal ? <>Global choice <b style={mono}>{info.name}</b> — a change here applies to every column that uses it.</> : <>Local choice of this column.</>}
        {info.managed && <> From a managed solution{locked ? " and not customizable — Dataverse will refuse changes." : " — the next import of that solution may overwrite your changes."}</>}
        {" "}Each change is published right away.
      </div>
      {busy && <div style={{ fontSize: 12.5, color: C.txm, marginBottom: 6 }}><Spin s={10} /> {busy}</div>}
      {err && <div style={{ fontSize: 12.5, color: C.rd, marginBottom: 6 }}>{err}</div>}
      {note && !busy && <div style={{ fontSize: 12.5, color: C.gn, marginBottom: 6 }}>{note}</div>}
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead><tr><th style={{ textAlign: "left", padding: "4px 6px", color: C.txd, fontSize: 11.5, width: 90 }}>Value</th><th style={{ textAlign: "left", padding: "4px 6px", color: C.txd, fontSize: 11.5 }}>Label</th><th style={{ width: 150 }}></th></tr></thead>
        <tbody>{order.map((v, i) => {
          const o = byValue.get(v);
          if (!o) return null;
          const editing = names[v] != null;
          return (
            <tr key={v} style={{ borderTop: `1px solid ${C.bd}55` }}>
              <td style={{ padding: "4px 6px", ...mono, color: C.vi }}>{v}</td>
              <td style={{ padding: "4px 6px" }}><input value={editing ? names[v] : o.label} onChange={e => setNames(n => ({ ...n, [v]: e.target.value }))} onKeyDown={e => { if (e.key === "Enter") doRename(o); }} disabled={!!busy || locked} style={inp({ fontSize: 12.5, padding: "3px 8px", borderColor: editing && names[v] !== o.label ? C.yw : undefined })} /></td>
              <td style={{ padding: "4px 6px", whiteSpace: "nowrap", textAlign: "right" }}>
                {editing && names[v] !== o.label && <button onClick={() => doRename(o)} disabled={!!busy} style={bt(C.vi, { fontSize: 11, padding: "2px 8px", marginRight: 4 })}>Rename</button>}
                <button onClick={() => setOrder(x => moveValue(x, i, -1))} disabled={!!busy || i === 0 || locked} title="Move up" style={bt(null, { fontSize: 11, padding: "2px 6px" })}>↑</button>
                <button onClick={() => setOrder(x => moveValue(x, i, 1))} disabled={!!busy || i === order.length - 1 || locked} title="Move down" style={bt(null, { fontSize: 11, padding: "2px 6px", marginLeft: 2 })}>↓</button>
                <button onClick={() => doDelete(o)} disabled={!!busy || locked} title="Delete this option" style={bt(null, { fontSize: 11, padding: "2px 7px", marginLeft: 4, color: C.rd })}>🗑</button>
              </td>
            </tr>
          );
        })}</tbody>
      </table>
      {orderChanged && <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 8, fontSize: 12.5 }}>
        <span style={{ color: C.yw, flex: 1 }}>The order changed.</span>
        <button onClick={() => setOrder(info.options.map(o => o.value))} disabled={!!busy} style={bt(null, { fontSize: 11.5 })}>Reset</button>
        <button onClick={doOrder} disabled={!!busy} style={bt(C.vi, { fontSize: 11.5 })}>Save order</button>
      </div>}
      <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 12, paddingTop: 10, borderTop: `1px solid ${C.bd}` }}>
        <input value={add.label} onChange={e => setAdd(a => ({ ...a, label: e.target.value }))} placeholder="New option label" disabled={!!busy || locked} style={inp({ fontSize: 12.5, flex: 1 })} onKeyDown={e => { if (e.key === "Enter") doAdd(); }} />
        <input value={add.value} onChange={e => setAdd(a => ({ ...a, value: e.target.value }))} placeholder="Value (optional)" disabled={!!busy || locked} style={inp({ fontSize: 12.5, width: 140, ...mono })} />
        <button onClick={doAdd} disabled={!!busy || locked || !add.label.trim()} style={bt(C.gn, { fontSize: 12, opacity: !add.label.trim() ? .5 : 1 })}>＋ Add</button>
      </div>
    </div>
  );
}
