import { useState, useEffect, useRef } from "react";
import { bridge } from "../d365-bridge.js";
import { C, Spin, mono, bt, exportTable } from "../shared.jsx";
import { normalizeLayers, layerSummary, overriddenKeys } from "../solutionLayers.js";

// Metadata › 📑 Layers of a column or a table: the solution stack, top first, what each layer
// changes, and whether an unmanaged "Active" layer hides a managed solution. Read-only.
export default function LayersModal({ target, onClose }) {
  const [st, setSt] = useState({ phase: "loading" });
  const [open, setOpen] = useState({});
  const gen = useRef(0);
  const load = async () => {
    const my = ++gen.current;
    setSt({ phase: "loading" });
    try {
      const rows = await bridge.getComponentLayers({ componentName: target.componentName, componentId: target.id, logicalName: target.name || target.logical });
      if (gen.current !== my) return;
      const layers = normalizeLayers(rows);
      setSt({ phase: "done", layers, summary: layerSummary(layers), over: overriddenKeys(layers) });
      setOpen(layers.length ? { 0: true } : {});
    } catch (e) { if (gen.current === my) setSt({ phase: "error", error: e.message || String(e) }); }
  };
  useEffect(() => { load(); return () => { gen.current++; }; }, [target.id, target.componentName]);
  useEffect(() => { const h = e => { if (e.key === "Escape") onClose(); }; window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h); }, [onClose]);

  const exp = (fmt) => {
    const rows = [];
    for (const l of st.layers) for (const c of (l.changes.length ? l.changes : [{ key: "", value: "" }])) rows.push([l.order, l.solution, l.publisher, l.at ? new Date(l.at).toISOString() : "", l.active ? "Unmanaged" : l.system ? "System" : "Managed", c.key, c.value]);
    exportTable(["Order", "Solution", "Publisher", "Overwrite time", "Kind", "Property", "Value"], rows, `layers_${String(target.logical).replace(/\W+/g, "_")}`, fmt, "Layers");
  };
  const tone = { warn: C.yw, ok: C.gn, info: C.txm };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,.55)" }} onClick={onClose}>
      <div style={{ width: 720, maxWidth: "94vw", maxHeight: "86vh", display: "flex", flexDirection: "column", background: C.sf, border: `1px solid ${C.bd}`, borderRadius: 10, boxShadow: "0 16px 48px rgba(0,0,0,.5)", overflow: "hidden" }} onClick={e => e.stopPropagation()}>
        <div style={{ padding: "14px 18px 10px", borderBottom: `1px solid ${C.bd}`, display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontWeight: 700, fontSize: 15, flex: 1, minWidth: 0 }}>📑 Solution layers · {target.label} <span style={{ ...mono, fontSize: 12, color: C.txd, fontWeight: 400 }}>{target.logical}</span></span>
          {st.phase === "done" && st.layers.length > 0 && <><button onClick={() => exp("csv")} style={bt(null, { fontSize: 12 })}>CSV</button><button onClick={() => exp("xlsx")} style={bt(null, { fontSize: 12 })}>Excel</button></>}
          <button onClick={onClose} style={{ background: "none", border: "none", color: C.txd, cursor: "pointer", padding: 4, fontSize: 16 }}>✕</button>
        </div>
        <div style={{ flex: 1, overflow: "auto", padding: "12px 18px" }}>
          {st.phase === "loading" && <div style={{ display: "flex", alignItems: "center", gap: 8, color: C.txm, fontSize: 13 }}><Spin s={12} /> Reading the solution layers…</div>}
          {st.phase === "error" && <div style={{ color: C.rd, fontSize: 13 }}>Couldn't read the layers: {st.error} <button onClick={load} style={{ ...bt(null, { fontSize: 12 }), marginLeft: 8 }}>↻ Retry</button></div>}
          {st.phase === "done" && <>
            <div style={{ fontSize: 13, color: tone[st.summary.level], marginBottom: 12, lineHeight: 1.5 }}>{st.summary.level === "warn" ? "⚠ " : st.summary.level === "ok" ? "✓ " : ""}{st.summary.text}</div>
            {st.layers.map((l, i) => {
              const over = st.over.get(l) || [];
              const color = l.active ? C.or : l.system ? C.txd : C.cy;
              return (
                <div key={i} style={{ borderLeft: `3px solid ${color}`, background: C.bg, borderRadius: 4, padding: "7px 10px", marginBottom: 6 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", cursor: l.changes.length ? "pointer" : "default" }} onClick={() => l.changes.length && setOpen(o => ({ ...o, [i]: !o[i] }))}>
                    <span style={{ ...mono, fontSize: 11.5, color: C.txd, width: 22 }}>#{l.order}</span>
                    <b style={{ fontSize: 13 }}>{l.active ? "Active (unmanaged)" : l.solution}</b>
                    <span style={{ fontSize: 11, color, background: color + "1f", padding: "1px 6px", borderRadius: 3 }}>{l.active ? "unmanaged" : l.system ? "system" : "managed"}</span>
                    {l.publisher && <span style={{ fontSize: 12, color: C.txd }}>{l.publisher}</span>}
                    <span style={{ flex: 1 }} />
                    {l.at && <span style={{ fontSize: 11.5, color: C.txd }}>{new Date(l.at).toLocaleString()}</span>}
                    {l.changes.length > 0 && <span style={{ fontSize: 11, color: C.txd }}>{l.changes.length} change{l.changes.length === 1 ? "" : "s"}{over.length ? ` · ${over.length} overridden above` : ""} {open[i] ? "▲" : "▼"}</span>}
                  </div>
                  {open[i] && l.changes.length > 0 && <div style={{ marginTop: 5, marginLeft: 30 }}>
                    {l.changes.map((c, j) => (
                      <div key={j} style={{ display: "flex", gap: 8, fontSize: 12, padding: "1px 0", opacity: over.includes(c.key) ? .55 : 1 }} title={over.includes(c.key) ? "A higher layer sets this property again — this value doesn't win" : ""}>
                        <span style={{ ...mono, color: C.cy, minWidth: 150 }}>{c.key}</span>
                        <span style={{ color: C.txm, wordBreak: "break-word", textDecoration: over.includes(c.key) ? "line-through" : "none" }}>{c.value}</span>
                      </div>
                    ))}
                  </div>}
                </div>
              );
            })}
          </>}
        </div>
        <div style={{ padding: "8px 18px", borderTop: `1px solid ${C.bd}`, fontSize: 11.5, color: C.txd, lineHeight: 1.5 }}>Read-only, from Dataverse's component layers (the maker portal's "See solution layers"). The top layer wins for every property it sets; struck-through values are set again higher up. To drop an unmanaged layer, use the maker portal's "Remove active customizations" — it can't be undone, Colvio doesn't do it for you.</div>
      </div>
    </div>
  );
}
