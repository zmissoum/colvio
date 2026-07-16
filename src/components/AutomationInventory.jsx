import { useState, useEffect, useMemo } from "react";
import { bridge } from "../d365-bridge.js";
import { C, I, Spin, mono, inp, bt, crd, ths, tds, exportTable } from "../shared.jsx";
import { t } from "../i18n.js";

// Automation — the STATIC inventory of everything registered to run in the org: plug-in steps
// (sdkmessageprocessingstep) and every process definition from the workflow table (classic
// workflows, business rules, actions, BPFs, cloud/desktop flows, dialogs). The design-time view —
// System Ops shows the runtime jobs; this shows what CAN fire and where. Read-only.
const CATEGORIES = [
  { key: "steps",    label: "Plug-in steps" },
  { key: "0",        label: "Workflows" },
  { key: "5",        label: "Cloud flows" },
  { key: "2",        label: "Business rules" },
  { key: "3",        label: "Actions" },
  { key: "4",        label: "BPFs" },
  { key: "1",        label: "Dialogs" },
  { key: "6",        label: "Desktop flows" },
];
const STAGE_LABEL = { 10: "Pre-validation", 20: "Pre-operation", 40: "Post-operation" };

export default function AutomationInventory({ bp, orgInfo }) {
  const [steps, setSteps] = useState(null);
  const [procs, setProcs] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [cat, setCat] = useState("steps");
  const [search, setSearch] = useState("");
  const [stateFilter, setStateFilter] = useState("all");   // all | active | inactive
  const [managedFilter, setManagedFilter] = useState("all"); // all | custom | managed

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError("");
    Promise.all([bridge.getPluginSteps(), bridge.getProcesses()]).then(([st, pr]) => {
      if (cancelled) return;
      setSteps(st || []); setProcs(pr || []); setLoading(false);
    }).catch(e => { if (!cancelled) { setError(e.message || String(e)); setLoading(false); } });
    return () => { cancelled = true; };
  }, []);

  const counts = useMemo(() => {
    const m = { steps: steps?.length || 0 };
    for (const p of (procs || [])) { const k = String(p.category); m[k] = (m[k] || 0) + 1; }
    return m;
  }, [steps, procs]);

  // "Active" = Enabled for steps (statecode 0), Activated for processes (statecode 1) — the two
  // tables use OPPOSITE meanings for statecode 0, hence the per-kind mapping.
  const isActive = (row, isStep) => isStep ? row.state === 0 : row.state === 1;

  const rows = useMemo(() => {
    const isStep = cat === "steps";
    const base = isStep ? (steps || []) : (procs || []).filter(p => String(p.category) === cat);
    const s = search.trim().toLowerCase();
    return base.filter(r => {
      if (stateFilter === "active" && !isActive(r, isStep)) return false;
      if (stateFilter === "inactive" && isActive(r, isStep)) return false;
      if (managedFilter === "custom" && r.managed) return false;
      if (managedFilter === "managed" && !r.managed) return false;
      if (!s) return true;
      return [r.name, r.entity, r.message, r.assembly, r.pluginType, r.owner].some(v => (v || "").toLowerCase().includes(s));
    });
  }, [cat, steps, procs, search, stateFilter, managedFilter]);

  const catLabel = CATEGORIES.find(c => c.key === cat)?.label || cat;
  const isStep = cat === "steps";

  const triggersOf = (p) => {
    const parts = [];
    if (p.triggerCreate) parts.push("Create");
    if (p.triggerUpdate) parts.push(`Update(${p.triggerUpdate.split(",").length})`);
    if (p.triggerDelete) parts.push("Delete");
    return parts.join(" · ");
  };

  const exportRows = (format = "csv") => {
    if (isStep) {
      exportTable(
        ["name", "assembly", "pluginType", "message", "entity", "stage", "mode", "state", "rank", "filteringAttributes", "managed", "modifiedOn"],
        rows.map(r => [r.name, r.assembly, r.pluginType, r.message, r.entity, STAGE_LABEL[r.stage] || r.stage, r.mode === 1 ? "Async" : "Sync", r.state === 0 ? "Enabled" : "Disabled", r.rank, r.filteringAttributes, r.managed ? "Managed" : "Custom", r.modifiedon]),
        "automation_plugin_steps", format, "PluginSteps");
    } else {
      exportTable(
        ["name", "entity", "state", "mode", "triggers", "owner", "managed", "modifiedOn"],
        rows.map(r => [r.name, r.entity, r.state === 1 ? "Activated" : "Draft", cat === "0" ? (r.mode === 1 ? "Real-time" : "Background") : "", triggersOf(r), r.owner, r.managed ? "Managed" : "Custom", r.modifiedon]),
        `automation_${catLabel.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`, format, "Automation");
    }
  };

  const Badge = ({ on, yes, no, colorYes, colorNo }) => (
    <span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 4, fontWeight: 600, background: (on ? colorYes : colorNo) + "22", color: on ? colorYes : colorNo }}>{on ? yes : no}</span>
  );

  return (
    <div style={{ padding: bp.mobile ? 12 : 20, maxWidth: 1500, margin: "0 auto" }}>
      <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>⚙️ {t("nav.automation")}</h2>
      <p style={{ color: C.txm, fontSize: 14, marginBottom: 12 }}>{t("automation.subtitle")}</p>

      {error && <div style={{ ...crd({ padding: 14, borderColor: C.rd + "55" }), color: C.rd, fontSize: 13, marginBottom: 12 }}>{error}</div>}
      {loading && <div style={{ textAlign: "center", marginTop: 40 }}><Spin s={18} /> Loading automation inventory…</div>}

      {!loading && !error && (<>
        {/* Category tabs with counts — empty categories stay visible but muted, so the inventory
            also answers "we have ZERO desktop flows" at a glance. */}
        <div style={{ display: "flex", gap: 3, marginBottom: 12, flexWrap: "wrap" }}>
          {CATEGORIES.map(c => (
            <button key={c.key} onClick={() => setCat(c.key)} style={{ padding: "5px 11px", fontSize: 12, border: `1px solid ${cat === c.key ? C.vi : C.bd}`, borderRadius: 5, cursor: "pointer", background: cat === c.key ? C.vi + "22" : "transparent", color: cat === c.key ? C.vi : (counts[c.key] ? C.txm : C.txd), fontWeight: cat === c.key ? 600 : 400 }}>
              {c.label} <span style={{ ...mono, fontSize: 11 }}>({(counts[c.key] || 0).toLocaleString()})</span>
            </button>
          ))}
        </div>

        <div style={{ display: "flex", gap: 8, marginBottom: 10, alignItems: "center", flexWrap: "wrap" }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 Filter by name, entity, message, assembly…" style={inp({ fontSize: 12, maxWidth: 320, padding: "6px 10px" })} />
          <select value={stateFilter} onChange={e => setStateFilter(e.target.value)} style={inp({ width: "auto", fontSize: 12, padding: "5px 8px" })}>
            <option value="all">All states</option>
            <option value="active">{isStep ? "Enabled" : "Activated"} only</option>
            <option value="inactive">{isStep ? "Disabled" : "Draft"} only</option>
          </select>
          <select value={managedFilter} onChange={e => setManagedFilter(e.target.value)} style={inp({ width: "auto", fontSize: 12, padding: "5px 8px" })}>
            <option value="all">Custom + managed</option>
            <option value="custom">Custom only</option>
            <option value="managed">Managed only</option>
          </select>
          <span style={{ fontSize: 11, color: C.txd, ...mono }}>{rows.length.toLocaleString()} shown</span>
          <div style={{ flex: 1 }} />
          <button onClick={() => exportRows("csv")} disabled={!rows.length} style={bt(C.cy, { fontSize: 11, padding: "4px 10px", opacity: rows.length ? 1 : 0.5 })}><I.Download /> CSV</button>
          <button onClick={() => exportRows("xlsx")} disabled={!rows.length} style={bt(C.cy, { fontSize: 11, padding: "4px 10px", opacity: rows.length ? 1 : 0.5 })}><I.Download /> Excel</button>
        </div>

        <div style={{ ...crd({ padding: 0, overflow: "hidden" }) }}>
          <div style={{ overflow: "auto", maxHeight: "calc(100vh - 320px)" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 700 }}>
              {isStep ? (
                <>
                  <thead><tr><th style={ths()}>Plug-in type</th><th style={ths()}>Assembly</th><th style={ths()}>Message</th><th style={ths()}>Entity</th><th style={ths()}>Stage</th><th style={ths()}>Mode</th><th style={ths()}>State</th><th style={ths()}>Source</th></tr></thead>
                  <tbody>
                    {rows.map(r => (
                      <tr key={r.id} title={r.filteringAttributes ? `Filtering attributes: ${r.filteringAttributes}` : r.name} style={{ borderBottom: `1px solid ${C.bd}22` }}>
                        <td style={{ ...tds, maxWidth: 320 }}>{r.pluginType || r.name}</td>
                        <td style={{ ...tds, color: C.txm, maxWidth: 180 }}>{r.assembly}</td>
                        <td style={{ ...tds, ...mono, fontSize: 12, color: C.cy }}>{r.message}</td>
                        <td style={{ ...tds, ...mono, fontSize: 12 }}>{r.entity || <span style={{ color: C.txd }}>(global)</span>}</td>
                        <td style={tds}>{STAGE_LABEL[r.stage] || r.stage}</td>
                        <td style={tds}><Badge on={r.mode === 0} yes="Sync" no="Async" colorYes={C.or} colorNo={C.cy} /></td>
                        <td style={tds}><Badge on={r.state === 0} yes="Enabled" no="Disabled" colorYes={C.gn} colorNo={C.rd} /></td>
                        <td style={tds}><Badge on={!r.managed} yes="Custom" no="Managed" colorYes={C.gn} colorNo={C.txd} /></td>
                      </tr>
                    ))}
                  </tbody>
                </>
              ) : (
                <>
                  <thead><tr><th style={ths()}>Name</th><th style={ths()}>Entity</th><th style={ths()}>State</th>{cat === "0" && <th style={ths()}>Mode</th>}{(cat === "0") && <th style={ths()}>Triggers</th>}<th style={ths()}>Owner</th><th style={ths()}>Source</th><th style={ths()}>Modified</th></tr></thead>
                  <tbody>
                    {rows.map(r => (
                      <tr key={r.id} style={{ borderBottom: `1px solid ${C.bd}22` }}>
                        <td style={{ ...tds, maxWidth: 340 }} title={r.name}>{r.name}</td>
                        <td style={{ ...tds, ...mono, fontSize: 12 }}>{r.entity || <span style={{ color: C.txd }}>—</span>}</td>
                        <td style={tds}><Badge on={r.state === 1} yes="Activated" no="Draft" colorYes={C.gn} colorNo={C.yw} /></td>
                        {cat === "0" && <td style={tds}><Badge on={r.mode === 1} yes="Real-time" no="Background" colorYes={C.or} colorNo={C.cy} /></td>}
                        {cat === "0" && <td style={{ ...tds, fontSize: 12, color: C.txm }}>{triggersOf(r) || "—"}</td>}
                        <td style={{ ...tds, color: C.txm, maxWidth: 160 }}>{r.owner}</td>
                        <td style={tds}><Badge on={!r.managed} yes="Custom" no="Managed" colorYes={C.gn} colorNo={C.txd} /></td>
                        <td style={{ ...tds, fontSize: 11, color: C.txd }}>{r.modifiedon ? new Date(r.modifiedon).toLocaleDateString() : ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </>
              )}
            </table>
            {rows.length === 0 && <div style={{ padding: 16, color: C.txd, fontSize: 13 }}>No {catLabel.toLowerCase()} match{search || stateFilter !== "all" || managedFilter !== "all" ? " the current filters" : ""}.</div>}
          </div>
        </div>
      </>)}
    </div>
  );
}
