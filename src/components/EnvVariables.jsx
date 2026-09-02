import { useState, useEffect, useMemo } from "react";
import { bridge } from "../d365-bridge.js";
import { C, I, Spin, mono, inp, bt, crd, exportTable, confirmProd, copyText } from "../shared.jsx";
import { t } from "../i18n.js";
import { envTypeLabel, effectiveValue, validateEnvValue } from "../envVarUtils.js";

// Environment Variables — definition (default) + per-environment override, with the classic
// post-deployment trap surfaced first: a variable with NO value anywhere. Read + write of the
// override only (definitions belong to solutions); Secret values are Key Vault REFERENCES.
const TYPE_COLOR = (ty) => ty === 100000005 ? C.rd : ty === 100000003 || ty === 100000004 ? C.vi : ty === 100000002 ? C.yw : ty === 100000001 ? C.cy : C.txm;
const short = (s, n = 60) => { const v = String(s ?? ""); return v.length > n ? v.slice(0, n) + "…" : v; };

export default function EnvVariables({ bp, orgInfo }) {
  const [vars, setVars] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [chip, setChip] = useState("all"); // all | novalue | overridden | secrets
  const [edit, setEdit] = useState(null);  // {v, draft, err, busy}
  const [busyId, setBusyId] = useState(""); // clear-override in flight

  const load = () => {
    setLoading(true); setError("");
    bridge.getEnvVars().then(d => { setVars(d || []); setLoading(false); })
      .catch(e => { setError(e.message || String(e)); setVars([]); setLoading(false); });
  };
  useEffect(load, []);

  // Escape closes the edit modal (unless a save is in flight) — modals shouldn't be mouse-only (a11y audit).
  useEffect(() => {
    if (!edit) return;
    const onKey = (e) => { if (e.key === "Escape" && !edit.busy) setEdit(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [edit]);

  const counts = useMemo(() => {
    const c = { all: vars?.length || 0, novalue: 0, overridden: 0, secrets: 0 };
    for (const v of (vars || [])) {
      if (effectiveValue(v).source === "none") c.novalue++;
      if (v.valueId) c.overridden++;
      if (v.type === 100000005) c.secrets++;
    }
    return c;
  }, [vars]);

  const shown = useMemo(() => {
    const s = search.trim().toLowerCase();
    return (vars || []).filter(v => {
      if (chip === "novalue" && effectiveValue(v).source !== "none") return false;
      if (chip === "overridden" && !v.valueId) return false;
      if (chip === "secrets" && v.type !== 100000005) return false;
      return !s || v.displayName.toLowerCase().includes(s) || v.schemaName.toLowerCase().includes(s);
    });
  }, [vars, search, chip]);

  const doExport = (format = "csv") => {
    const rows = shown.map(v => {
      const eff = effectiveValue(v);
      return [v.displayName, v.schemaName, envTypeLabel(v.type, v.typeLabel), v.isManaged ? "managed" : "unmanaged", v.defaultValue ?? "", v.value ?? "", eff.source];
    });
    exportTable(["displayName", "schemaName", "type", "managed", "defaultValue", "currentValue", "effectiveSource"], rows, "environment_variables", format, "Env Variables");
  };

  const saveEdit = async () => {
    const { v, draft } = edit;
    const check = validateEnvValue(v.type, draft);
    if (!check.ok) { setEdit(p => ({ ...p, err: check.error })); return; }
    if (!confirmProd(orgInfo?.isProduction, `set environment variable "${v.displayName}"`)) return;
    setEdit(p => ({ ...p, busy: true, err: "" }));
    try {
      const r = await bridge.setEnvVarValue(v.id, v.valueId, draft.trim());
      setVars(list => list.map(x => x.id === v.id ? { ...x, valueId: r?.valueId || x.valueId || "new", value: draft.trim() } : x));
      setEdit(null);
    } catch (e) { setEdit(p => ({ ...p, busy: false, err: e.message || String(e) })); }
  };

  const clearOverride = async (v) => {
    if (!confirmProd(orgInfo?.isProduction, `clear the override of "${v.displayName}" (falls back to ${v.defaultValue != null && v.defaultValue !== "" ? "its default" : "NO value at all"})`)) return;
    setBusyId(v.id);
    try {
      await bridge.deleteEnvVarValue(v.valueId);
      setVars(list => list.map(x => x.id === v.id ? { ...x, valueId: null, value: null } : x));
    } catch (e) { setError(e.message || String(e)); }
    setBusyId("");
  };

  return (
    <div style={{ padding: bp.mobile ? 12 : 20, maxWidth: 1250, margin: "0 auto" }}>
      <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 4, display: "flex", alignItems: "center", gap: 8 }}>🧩 {t("nav.envvars")}</h2>
      <p style={{ color: C.txm, fontSize: 14, marginBottom: 12 }}>{t("envvars.subtitle")}</p>

      <div style={{ display: "flex", gap: 8, marginBottom: 12, alignItems: "center", flexWrap: "wrap" }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name or schema name…" style={inp({ fontSize: 13, maxWidth: 260 })} />
        <div style={{ display: "flex", border: `1px solid ${C.bd}`, borderRadius: 6, overflow: "hidden" }}>
          {[["all", `All (${counts.all})`], ["novalue", `⚠ No value (${counts.novalue})`], ["overridden", `Overridden (${counts.overridden})`], ["secrets", `Secrets (${counts.secrets})`]].map(([k, lbl]) => (
            <button key={k} onClick={() => setChip(k)} style={{ padding: "5px 11px", fontSize: 12, border: "none", cursor: "pointer", background: chip === k ? C.vi + "22" : "transparent", color: chip === k ? C.vi : k === "novalue" && counts.novalue ? C.yw : C.txm, fontWeight: chip === k ? 600 : 400 }}>{lbl}</button>
          ))}
        </div>
        <button onClick={load} disabled={loading} style={bt(null, { fontSize: 12, padding: "5px 10px" })}>{loading ? <Spin s={12} /> : "↻"}</button>
        <div style={{ flex: 1 }} />
        <button onClick={() => doExport("csv")} disabled={!shown.length} style={bt(C.cy, { fontSize: 11, padding: "4px 10px", opacity: shown.length ? 1 : 0.5 })}><I.Download /> CSV</button>
        <button onClick={() => doExport("xlsx")} disabled={!shown.length} style={bt(C.cy, { fontSize: 11, padding: "4px 10px", opacity: shown.length ? 1 : 0.5 })}><I.Download /> Excel</button>
      </div>

      {counts.novalue > 0 && chip !== "novalue" && (
        <div style={{ padding: "8px 12px", background: C.yw + "14", border: `1px solid ${C.yw}44`, borderRadius: 8, color: C.yw, fontSize: 12.5, marginBottom: 10 }}>
          ⚠ {counts.novalue} variable{counts.novalue > 1 ? "s have" : " has"} NO value at all (no override, no default) — flows and plug-ins reading {counts.novalue > 1 ? "them" : "it"} get an empty string and fail somewhere else. The classic post-deployment trap.
        </div>
      )}
      {error && <div style={{ ...crd({ padding: 12, borderColor: C.rd + "55" }), color: C.rd, fontSize: 13, marginBottom: 10 }}>{error}</div>}
      {loading && !vars && <div style={{ textAlign: "center", marginTop: 40 }}><Spin s={18} /></div>}

      {vars && shown.map(v => {
        const eff = effectiveValue(v);
        const noVal = eff.source === "none";
        const isSecret = v.type === 100000005;
        return (
          <div key={v.id} style={{ ...crd({ padding: "10px 14px", ...(noVal ? { borderColor: C.yw + "66" } : {}) }), marginBottom: 6 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span style={{ fontSize: 13.5, fontWeight: 600 }} title={v.description}>{v.displayName}</span>
              <span style={{ ...mono, fontSize: 11, color: C.txd }}>{v.schemaName}</span>
              <span style={{ fontSize: 9.5, fontWeight: 700, padding: "1px 6px", borderRadius: 3, background: TYPE_COLOR(v.type) + "22", color: TYPE_COLOR(v.type) }}>{envTypeLabel(v.type, v.typeLabel).toUpperCase()}</span>
              <span style={{ fontSize: 9.5, padding: "1px 6px", borderRadius: 3, background: v.isManaged ? C.vid : C.gnd, color: v.isManaged ? C.vi : C.gn }}>{v.isManaged ? "Managed" : "Unmanaged"}</span>
              {noVal && <span style={{ fontSize: 9.5, fontWeight: 700, padding: "1px 6px", borderRadius: 3, background: C.yw + "22", color: C.yw }}>NO VALUE</span>}
              <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
                <button onClick={() => setEdit({ v, draft: v.value ?? v.defaultValue ?? (v.type === 100000002 ? "yes" : ""), err: "" })} style={bt(null, { fontSize: 11, padding: "3px 10px" })}>✎ {v.valueId ? "Edit value" : "Set value"}</button>
                {v.valueId && <button onClick={() => clearOverride(v)} disabled={busyId === v.id} title="Delete the override — the variable falls back to its definition default" style={bt(null, { fontSize: 11, padding: "3px 10px", color: C.rd })}>{busyId === v.id ? <Spin s={11} /> : "Clear override"}</button>}
              </div>
            </div>
            <div style={{ display: "flex", gap: 18, marginTop: 6, flexWrap: "wrap", fontSize: 12 }}>
              <span><span style={{ color: C.txd, fontSize: 11 }}>Default: </span><span style={{ ...mono, fontSize: 11.5, color: v.defaultValue ? C.txm : C.txd }} title={v.defaultValue ?? ""}>{v.defaultValue != null && v.defaultValue !== "" ? short(v.defaultValue) : "—"}</span></span>
              <span>
                <span style={{ color: C.txd, fontSize: 11 }}>Current: </span>
                <span style={{ ...mono, fontSize: 11.5, color: v.value != null && v.value !== "" ? (eff.source === "override" ? C.gn : C.txm) : C.txd }} title={v.value ?? ""}>{v.value != null && v.value !== "" ? short(v.value) : "— (falls back to default)"}</span>
                {v.value != null && v.value !== "" && <button onClick={() => copyText(v.value)} title="Copy current value" style={{ marginLeft: 6, background: "transparent", border: "none", color: C.txd, cursor: "pointer", fontSize: 11 }}><I.Copy /></button>}
              </span>
              {isSecret && <span style={{ fontSize: 11, color: C.rd }}>Key Vault REFERENCE — the secret itself never leaves the vault</span>}
            </div>
          </div>
        );
      })}
      {vars && shown.length === 0 && <div style={{ textAlign: "center", color: C.txd, fontSize: 13, marginTop: 30 }}>No environment variable matches.</div>}

      {/* Edit modal */}
      {edit && (
        <div onClick={() => !edit.busy && setEdit(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", zIndex: 260, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div onClick={e => e.stopPropagation()} style={{ width: 520, maxWidth: "92vw", background: C.sf, border: `1px solid ${C.bd}`, borderRadius: 12, padding: 18 }}>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 2 }}>✎ {edit.v.displayName}</div>
            <div style={{ ...mono, fontSize: 11, color: C.txd, marginBottom: 10 }}>{edit.v.schemaName} · {envTypeLabel(edit.v.type, edit.v.typeLabel)}{edit.v.valueId ? " · editing the override" : " · creating the override"}</div>
            {edit.v.type === 100000002 ? (
              <select value={/^yes$/i.test(edit.draft) ? "yes" : "no"} onChange={e => setEdit(p => ({ ...p, draft: e.target.value }))} style={inp({ fontSize: 13 })}>
                <option value="yes">yes</option><option value="no">no</option>
              </select>
            ) : (
              <textarea value={edit.draft} onChange={e => setEdit(p => ({ ...p, draft: e.target.value }))} rows={edit.v.type === 100000003 || edit.v.type === 100000004 ? 8 : 3} spellCheck={false} style={inp({ fontSize: 12.5, ...mono, resize: "vertical" })} />
            )}
            {edit.v.type === 100000005 && <div style={{ fontSize: 11.5, color: C.rd, marginTop: 6 }}>This edits the Key Vault REFERENCE path, not the secret. The secret's value is managed in Azure Key Vault.</div>}
            {edit.v.isManaged && <div style={{ fontSize: 11.5, color: C.yw, marginTop: 6 }}>Managed definition — your override lives in the unmanaged layer of this environment (that's the normal way to set per-environment values).</div>}
            {edit.err && <div style={{ fontSize: 12, color: C.rd, marginTop: 6 }}>{edit.err}</div>}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 14 }}>
              <button onClick={() => setEdit(null)} disabled={edit.busy} style={bt(null, { fontSize: 12 })}>Cancel</button>
              <button onClick={saveEdit} disabled={edit.busy} style={bt(C.vi, { fontSize: 12 })}>{edit.busy ? <Spin s={12} /> : "Save"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
