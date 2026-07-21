import { useState, useEffect, useMemo, useRef } from "react";
import { bridge } from "../d365-bridge.js";
import { C, I, Spin, mono, inp, bt, crd, exportTable } from "../shared.jsx";
import { t } from "../i18n.js";
import { buildAppInventory, buildReverseIndex, deriveAppDependencies } from "../appInventoryUtils.js";

// Apps — what each model-driven app actually EXPOSES: tables (with the include-all forms/views
// status the maker portal never shows), forms and views (explicit vs implicit), modern command-bar
// buttons (3 scopes), and — on demand — the attributes/option sets surfaced via the dependency
// graph. Plus the reverse lens: which apps expose a given component. Read-only.
const Badge = ({ label, color, title }) => (
  <span title={title} style={{ fontSize: 9.5, fontWeight: 700, padding: "1px 6px", borderRadius: 3, background: color + "22", color, border: `1px solid ${color}44`, letterSpacing: ".4px", flexShrink: 0, cursor: title ? "help" : "default" }}>{label}</span>
);

export default function AppInventory({ bp, orgInfo }) {
  const [inv, setInv] = useState(null);          // {apps, byApp, rows}
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selUid, setSelUid] = useState("");
  const [search, setSearch] = useState("");       // reverse-lens search across the flat rows
  const [tblFilter, setTblFilter] = useState(""); // filter inside the selected app
  const [collapsed, setCollapsed] = useState({});
  const [deps, setDeps] = useState(null);         // {attributes, optionSets, relationships, truncated} for selUid
  const [depsBusy, setDepsBusy] = useState(false);
  const depsCache = useRef({});                    // uid -> deps (edges are org-wide; re-derive per app)
  const edgesCache = useRef(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError("");
    Promise.all([
      bridge.getAppModules(), bridge.getAppComponents(), bridge.getAllForms(),
      bridge.getAllViews(), bridge.getAppActions(), bridge.getEntities(),
    ]).then(([apps, components, forms, views, actions, ents]) => {
      if (cancelled) return;
      // getEntities returns null in demo mode — supply the entity the demo components reference.
      const entities = ents ? ents.map(e => ({ metadataId: e.metadataId, logical: e.logical, display: e.display }))
        : [{ metadataId: "meta-account", logical: "account", display: "Account" }];
      setInv(buildAppInventory({ apps: apps || [], components: components || [], forms: forms || [], views: views || [], entities, actions: actions || [] }));
      setLoading(false);
    }).catch(e => { if (!cancelled) { setError(e.message || String(e)); setLoading(false); } });
    return () => { cancelled = true; };
  }, []);

  const appList = useMemo(() => (inv?.apps || []).map(a => {
    const entry = inv.byApp[a.uid];
    return { ...a, nTables: entry.tables.length, nActions: entry.actions.length };
  }), [inv]);

  const selEntry = selUid && inv ? inv.byApp[selUid] : null;

  const reverseHits = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s || !inv) return [];
    const idx = buildReverseIndex(inv.rows);
    return [...idx.values()].filter(e => (e.name || "").toLowerCase().includes(s)).slice(0, 50);
  }, [search, inv]);

  const shownTables = useMemo(() => {
    if (!selEntry) return [];
    const s = tblFilter.trim().toLowerCase();
    if (!s) return selEntry.tables;
    return selEntry.tables.map(tb => ({
      ...tb,
      forms: tb.forms.filter(f => f.name.toLowerCase().includes(s)),
      views: tb.views.filter(v => v.name.toLowerCase().includes(s)),
    })).filter(tb => tb.entity.includes(s) || tb.forms.length || tb.views.length);
  }, [selEntry, tblFilter]);

  const loadDeps = async () => {
    if (!selUid || depsBusy) return;
    if (depsCache.current[selUid]) { setDeps(depsCache.current[selUid]); return; }
    setDepsBusy(true);
    try {
      if (!edgesCache.current) edgesCache.current = await bridge.getFormViewDependencies();
      // Resolve attribute names for the app's entities only (getFields is cached org-side).
      const attrMap = new Map();
      for (const tb of selEntry.tables) {
        try {
          const fs = await bridge.getFields(tb.entity);
          for (const f of (fs || [])) if (f.metadataId) attrMap.set(f.metadataId, { logical: f.logical, entity: tb.entity });
        } catch { /* one entity failing must not kill the analysis */ }
      }
      const d = { ...deriveAppDependencies(edgesCache.current.edges || [], selEntry, attrMap), truncated: !!edgesCache.current.truncated };
      depsCache.current[selUid] = d;
      setDeps(d);
    } catch (e) { setError(`Dependency analysis: ${e.message}`); }
    setDepsBusy(false);
  };

  const exportApp = (format = "csv") => {
    if (!inv) return;
    const rows = (selUid ? inv.rows.filter(r => r.appUid === selUid) : inv.rows)
      .map(r => [r.appName, r.componentType, r.name, r.entity, r.inclusion, r.objectId]);
    const scope = selUid ? (selEntry.app.uniqueName || "app") : "all_apps";
    exportTable(["app", "componentType", "name", "entity", "inclusion", "objectId"], rows, `app_inventory_${scope.replace(/[^A-Za-z0-9_-]+/g, "_")}`, format, "AppInventory");
  };

  return (
    <div style={{ display: "flex", height: "100%", flexDirection: bp.mobile ? "column" : "row" }}>
      {/* App list */}
      <div style={{ width: bp.mobile ? "100%" : 280, borderRight: bp.mobile ? "none" : `1px solid ${C.bd}`, display: "flex", flexDirection: "column", flexShrink: 0 }}>
        <div style={{ padding: "10px 10px 6px" }}>
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>📱 {t("nav.apps")}</div>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔎 Reverse: find a form / view / button…" style={inp({ fontSize: 12, padding: "6px 9px" })} />
          {inv && <div style={{ fontSize: 11, color: C.gn, marginTop: 5 }}>{appList.length} app{appList.length > 1 ? "s" : ""} · {inv.rows.length.toLocaleString()} inventory rows</div>}
        </div>
        <div style={{ flex: 1, overflow: "auto", padding: "0 6px 6px" }}>
          {loading && <div style={{ textAlign: "center", padding: 20 }}><Spin /><p style={{ color: C.txd, fontSize: 12, marginTop: 6 }}>Building inventory…</p></div>}
          {!loading && appList.map(a => (
            <button key={a.uid} onClick={() => { setSelUid(a.uid); setDeps(depsCache.current[a.uid] || null); setCollapsed({}); }} style={{ width: "100%", textAlign: "left", padding: "8px 10px", border: "none", borderRadius: 6, cursor: "pointer", marginBottom: 2, background: selUid === a.uid ? C.sfa : "transparent", color: selUid === a.uid ? C.tx : C.txm }}>
              <div style={{ fontSize: 13, fontWeight: selUid === a.uid ? 600 : 400 }}>{a.name}</div>
              <div style={{ fontSize: 11, color: C.txd, ...mono }}>{a.uniqueName}</div>
              <div style={{ fontSize: 10.5, color: C.txd }}>{a.nTables} table{a.nTables > 1 ? "s" : ""} · {a.nActions} command{a.nActions > 1 ? "s" : ""}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Detail */}
      <div style={{ flex: 1, overflow: "auto", padding: 16, minWidth: 0 }}>
        {error && <div style={{ ...crd({ padding: 12, borderColor: C.rd + "55" }), color: C.rd, fontSize: 13, marginBottom: 12 }}>{error}</div>}

        {/* Reverse lens results take over while searching */}
        {search.trim() && inv && (
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>Which apps expose “{search.trim()}”?</div>
            {reverseHits.length === 0 && <div style={{ color: C.txd, fontSize: 12 }}>No component matches.</div>}
            {reverseHits.map(h => (
              <div key={h.objectId} style={{ ...crd({ padding: "8px 12px" }), marginBottom: 6 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ fontWeight: 600, fontSize: 13 }}>{h.name}</span>
                  <Badge label={h.componentType} color={C.cy} />
                  {h.entity && <span style={{ ...mono, fontSize: 11, color: C.txd }}>{h.entity}</span>}
                </div>
                <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginTop: 5 }}>
                  {h.apps.map((ap, i) => <span key={i} style={{ fontSize: 11, padding: "2px 8px", borderRadius: 4, background: C.sfh, color: C.txm }}>{ap.appName} <span style={{ color: ap.inclusion === "EXPLICIT" ? C.gn : C.cy }}>({ap.inclusion.toLowerCase()})</span></span>)}
                </div>
              </div>
            ))}
          </div>
        )}

        {!search.trim() && !selEntry && !loading && <div style={{ textAlign: "center", color: C.txd, marginTop: 60, maxWidth: 560, marginLeft: "auto", marginRight: "auto", lineHeight: 1.5 }}>{t("apps.subtitle")}</div>}

        {!search.trim() && selEntry && (
          <div>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: 220 }}>
                <div style={{ fontSize: 17, fontWeight: 700 }}>{selEntry.app.name}</div>
                <div style={{ fontSize: 12, color: C.txd, ...mono }}>{selEntry.app.uniqueName} · {selEntry.tables.length} tables · {selEntry.tables.reduce((n, tb) => n + tb.forms.length, 0)} forms · {selEntry.tables.reduce((n, tb) => n + tb.views.length, 0)} views · {selEntry.actions.length} commands</div>
              </div>
              <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                <button onClick={() => exportApp("csv")} style={bt(C.cy, { fontSize: 11, padding: "4px 10px" })}><I.Download /> CSV</button>
                <button onClick={() => exportApp("xlsx")} style={bt(C.cy, { fontSize: 11, padding: "4px 10px" })}><I.Download /> Excel</button>
              </div>
            </div>

            <input value={tblFilter} onChange={e => setTblFilter(e.target.value)} placeholder="Filter tables / forms / views…" style={inp({ fontSize: 12, maxWidth: 300, padding: "5px 9px", marginBottom: 10 })} />

            {shownTables.map(tb => {
              const open = !collapsed[tb.entity];
              return (
                <div key={tb.entity} style={{ ...crd({ overflow: "hidden" }), marginBottom: 6 }}>
                  <button onClick={() => setCollapsed(p => ({ ...p, [tb.entity]: !p[tb.entity] }))} style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "9px 12px", border: "none", background: C.sfh, cursor: "pointer", color: C.tx, fontSize: 13, fontWeight: 600 }}>
                    <span style={{ ...mono }}>{tb.entity}</span>
                    <Badge label={tb.includeAllForms ? "ALL FORMS" : `${tb.forms.length} FORM${tb.forms.length > 1 ? "S" : ""} PICKED`} color={tb.includeAllForms ? C.cy : C.gn}
                      title={tb.includeAllForms ? "Include-all: no explicit form component — every form of this table (current AND future) surfaces in the app. Dataverse exposes no flag for this; it is inferred from the absence of explicit registrations." : "This app hand-picked specific forms — new forms will NOT appear automatically."} />
                    <Badge label={tb.includeAllViews ? "ALL VIEWS" : `${tb.views.length} VIEW${tb.views.length > 1 ? "S" : ""} PICKED`} color={tb.includeAllViews ? C.cy : C.gn}
                      title={tb.includeAllViews ? "Include-all: no explicit view component — every view (current and future) surfaces in the app." : "This app hand-picked specific views — new views will NOT appear automatically."} />
                    <span style={{ marginLeft: "auto", color: C.txd, transform: open ? "rotate(90deg)" : "none", transition: "transform .15s" }}>▸</span>
                  </button>
                  {open && (
                    <div style={{ padding: "6px 12px 10px", display: "flex", gap: 18, flexWrap: "wrap" }}>
                      <div style={{ minWidth: 220, flex: 1 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: C.txd, margin: "4px 0" }}>FORMS ({tb.forms.length})</div>
                        {tb.forms.map(f => (
                          <div key={f.id} style={{ fontSize: 12, padding: "2px 0", display: "flex", gap: 6, alignItems: "center" }}>
                            <span style={{ color: C.tx }}>{f.name}</span>
                            {f.typeLabel && <span style={{ fontSize: 10, color: C.txd }}>{f.typeLabel}</span>}
                            <Badge label={f.inclusion} color={f.inclusion === "EXPLICIT" ? C.gn : C.cy} />
                          </div>
                        ))}
                      </div>
                      <div style={{ minWidth: 220, flex: 1 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: C.txd, margin: "4px 0" }}>VIEWS ({tb.views.length})</div>
                        {tb.views.map(v => (
                          <div key={v.id} style={{ fontSize: 12, padding: "2px 0", display: "flex", gap: 6, alignItems: "center" }}>
                            <span style={{ color: C.tx }}>{v.name}</span>
                            <Badge label={v.inclusion} color={v.inclusion === "EXPLICIT" ? C.gn : C.cy} />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            {/* Modern commands */}
            {selEntry.actions.length > 0 && (
              <div style={{ ...crd({ padding: 12 }), marginTop: 10 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: C.txd, marginBottom: 6 }}>MODERN COMMANDS ({selEntry.actions.length}) <span style={{ fontWeight: 400 }}>— classic ribbon buttons are not appactions and aren't listed</span></div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                  {selEntry.actions.map((a, i) => (
                    <span key={a.id + i} title={a.inclusion === "EXPLICIT" ? "Bound to this app only" : a.contextValue ? `Entity-global — surfaces in every app exposing ${a.contextValue}` : "Table-generic template — surfaces in every app"} style={{ fontSize: 11.5, padding: "3px 9px", borderRadius: 4, background: C.sfh, color: C.txm, display: "inline-flex", alignItems: "center", gap: 5 }}>
                      {a.label}{a.contextValue && <span style={{ ...mono, fontSize: 10, color: C.txd }}>{a.contextValue}</span>}
                      <Badge label={a.inclusion} color={a.inclusion === "EXPLICIT" ? C.gn : C.cy} />
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Dependency-derived (lazy) */}
            <div style={{ ...crd({ padding: 12 }), marginTop: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: C.txd }}>SURFACED ATTRIBUTES & OPTION SETS</span>
                <span style={{ fontSize: 11, color: C.txd }}>— what the app's forms/views drag in via the dependency graph</span>
                {!deps && <button onClick={loadDeps} disabled={depsBusy} style={bt(C.vi, { fontSize: 11, padding: "3px 10px" })}>{depsBusy ? <Spin s={11} /> : "Analyze"}</button>}
              </div>
              {deps && (
                <div style={{ marginTop: 8, fontSize: 12 }}>
                  {deps.truncated && <div style={{ color: C.yw, marginBottom: 6 }}>⚠ Dependency graph truncated at 200k edges — counts below are a floor, not an exact total.</div>}
                  <div style={{ color: C.txm, marginBottom: 6 }}>{deps.attributes.length.toLocaleString()} attributes · {deps.optionSets.length.toLocaleString()} option sets · {deps.relationships.length.toLocaleString()} relationships</div>
                  <div style={{ maxHeight: 260, overflow: "auto" }}>
                    {deps.attributes.slice(0, 500).map(a => (
                      <div key={a.id} style={{ padding: "2px 0", display: "flex", gap: 8, alignItems: "baseline" }} title={`Via: ${a.via.join(", ")}`}>
                        <span style={{ ...mono, fontSize: 11.5, color: C.tx }}>{a.entity ? `${a.entity}.` : ""}{a.logical || a.id}</span>
                        <span style={{ fontSize: 10.5, color: C.txd }}>via {a.via.length} form/view{a.via.length > 1 ? "s" : ""}</span>
                      </div>
                    ))}
                    {deps.attributes.length > 500 && <div style={{ fontSize: 11, color: C.txd, marginTop: 4 }}>+{(deps.attributes.length - 500).toLocaleString()} more — use the export.</div>}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
