import { useState, useRef } from "react";
import { bridge } from "../d365-bridge.js";
import { C, I, Spin, mono, inp, bt, crd, ths, tds, dl, expName, isTrulyCustom } from "../shared.jsx";
import { t } from "../i18n.js";

// Schema snapshot & diff — export the org's schema as JSON, then compare a snapshot
// against the CURRENT org (or another snapshot) to prepare deployments:
// missing entities, missing fields, type / required-level mismatches.
// Snapshot format: { colvioSchema:1, org, takenAt, entities:{ logical:{ d, fields:{ logical:{t,r,c} } } } }

async function buildSnapshot(entities, onProgress) {
  const out = {};
  for (let i = 0; i < entities.length; i++) {
    const e = entities[i];
    onProgress(i + 1, entities.length, e.l);
    try {
      const fields = await bridge.getFields(e.l);
      const f = {};
      for (const fl of fields || []) f[fl.logical] = { t: fl.type, r: !!fl.required, c: !!fl.isCustom };
      out[e.l] = { d: e.d || e.l, fields: f };
    } catch { out[e.l] = { d: e.d || e.l, fields: {}, error: true }; }
  }
  return out;
}

function diffSchemas(a, b) {
  // Returns rows {sev, entity, field, what, a, b} — A = reference, B = compared.
  const rows = [];
  for (const [ent, ea] of Object.entries(a.entities)) {
    const eb = b.entities[ent];
    if (!eb) { rows.push({ sev: "high", entity: ent, field: "", what: "entity_missing", a: "present", b: "—" }); continue; }
    for (const [fl, fa] of Object.entries(ea.fields)) {
      const fb = eb.fields[fl];
      if (!fb) { rows.push({ sev: "high", entity: ent, field: fl, what: "field_missing", a: fa.t, b: "—" }); continue; }
      if (fa.t !== fb.t) rows.push({ sev: "high", entity: ent, field: fl, what: "type_mismatch", a: fa.t, b: fb.t });
      else if (fa.r !== fb.r) rows.push({ sev: "med", entity: ent, field: fl, what: "required_mismatch", a: fa.r ? "required" : "optional", b: fb.r ? "required" : "optional" });
    }
    for (const fl of Object.keys(eb.fields)) {
      if (!ea.fields[fl]) rows.push({ sev: "low", entity: ent, field: fl, what: "field_extra", a: "—", b: eb.fields[fl].t });
    }
  }
  for (const ent of Object.keys(b.entities)) {
    if (!a.entities[ent]) rows.push({ sev: "low", entity: ent, field: "", what: "entity_extra", a: "—", b: "present" });
  }
  const order = { high: 0, med: 1, low: 2 };
  return rows.sort((x, y) => order[x.sev] - order[y.sev] || x.entity.localeCompare(y.entity) || x.field.localeCompare(y.field));
}

export default function SchemaDiff({ bp, orgInfo, entities }) {
  const [customOnly, setCustomOnly] = useState(true);
  const [progress, setProgress] = useState(null);     // {done,total,current}
  const [snapA, setSnapA] = useState(null);            // loaded reference snapshot (file)
  const [diff, setDiff] = useState(null);
  const [error, setError] = useState("");
  const fileRef = useRef(null);

  const scope = () => (entities || []).filter(e => !customOnly || isTrulyCustom(e.l));

  const exportSnapshot = async () => {
    const list = scope();
    if (!list.length) { setError(t("schemadiff.no_entities")); return; }
    setError(""); setProgress({ done: 0, total: list.length, current: "" });
    const ents = await buildSnapshot(list, (done, total, current) => setProgress({ done, total, current }));
    setProgress(null);
    const snap = { colvioSchema: 1, org: orgInfo?.orgName || "", takenAt: new Date().toISOString(), entityCount: list.length, entities: ents };
    dl(JSON.stringify(snap, null, 1), "application/json", expName(`schema_${orgInfo?.orgName || "org"}`, "json"));
  };

  const loadSnapshot = (text) => {
    try {
      const s = JSON.parse(text);
      if (s.colvioSchema !== 1 || !s.entities) throw new Error("bad format");
      setSnapA(s); setDiff(null); setError("");
    } catch { setError(t("schemadiff.bad_file")); }
  };

  const compareToCurrentOrg = async () => {
    if (!snapA) return;
    setError("");
    const names = Object.keys(snapA.entities);
    const list = (entities || []).filter(e => names.includes(e.l));
    setProgress({ done: 0, total: list.length, current: "" });
    const ents = await buildSnapshot(list, (done, total, current) => setProgress({ done, total, current }));
    // Entities present in the snapshot but absent from this org still need to be reported:
    // diffSchemas handles that via entity_missing (they simply won't be in `ents`).
    setProgress(null);
    setDiff(diffSchemas(snapA, { entities: ents }));
  };

  const exportDiff = () => {
    const esc = (v) => { let s = String(v ?? ""); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g, '""')}"` : s; };
    const head = ["severity", "entity", "field", "difference", "snapshot", "current_org"].join(",");
    const lines = diff.map(r => [r.sev, r.entity, r.field, r.what, r.a, r.b].map(esc).join(","));
    dl("﻿" + [head, ...lines].join("\n"), "text/csv;charset=utf-8", expName("schema_diff", "csv"));
  };

  const sevColor = { high: C.rd, med: C.or, low: C.txd };
  const whatLabel = (w) => t("schemadiff." + w);

  return (
    <div>
      <div style={{ fontSize: 12.5, color: C.txm, marginBottom: 12, lineHeight: 1.6 }}>{t("schemadiff.intro")}</div>

      <div style={{ ...crd({ padding: 12 }), marginBottom: 10 }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>1. {t("schemadiff.step1")}</div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <label style={{ fontSize: 12.5, color: C.txm, display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}>
            <input type="checkbox" checked={customOnly} onChange={e => setCustomOnly(e.target.checked)} style={{ accentColor: C.vi }} />
            {t("schemadiff.custom_only")} ({scope().length} {t("schemadiff.tables")})
          </label>
          <button onClick={exportSnapshot} disabled={!!progress} style={bt(`linear-gradient(135deg,${C.vi},${C.vil})`, { fontSize: 12.5 })}>
            <I.Download /> {t("schemadiff.export_btn")}
          </button>
        </div>
      </div>

      <div style={{ ...crd({ padding: 12 }), marginBottom: 10 }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>2. {t("schemadiff.step2")}</div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <input ref={fileRef} type="file" accept=".json" style={{ display: "none" }}
            onChange={e => { const f = e.target.files?.[0]; if (f) { const r = new FileReader(); r.onload = ev => loadSnapshot(ev.target.result); r.readAsText(f); } e.target.value = ""; }} />
          <button onClick={() => fileRef.current?.click()} style={bt(null, { fontSize: 12.5 })}><I.Upload /> {t("schemadiff.load_btn")}</button>
          {snapA && <span style={{ fontSize: 12, color: C.gn }}>✓ {snapA.org || "snapshot"} · {new Date(snapA.takenAt).toLocaleString()} · {snapA.entityCount} {t("schemadiff.tables")}</span>}
          {snapA && <button onClick={compareToCurrentOrg} disabled={!!progress} style={bt(`linear-gradient(135deg,${C.gn},${C.cyd})`, { fontSize: 12.5, fontWeight: 700 })}>⇄ {t("schemadiff.compare_btn")}</button>}
        </div>
      </div>

      {progress && (
        <div style={{ ...crd({ padding: 12 }), marginBottom: 10, fontSize: 13, color: C.cy }}>
          <Spin s={13} /> {progress.done}/{progress.total} — <span style={{ ...mono, fontSize: 12 }}>{progress.current}</span>
        </div>
      )}
      {error && <div style={{ color: C.rd, fontSize: 13, marginBottom: 10 }}>⚠ {error}</div>}

      {diff && (
        <div style={{ ...crd({ padding: 0, overflow: "hidden" }) }}>
          <div style={{ padding: "8px 12px", borderBottom: `1px solid ${C.bd}`, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 700 }}>
              {diff.length === 0 ? `✅ ${t("schemadiff.identical")}` : `${diff.length} ${t("schemadiff.differences")} — ${diff.filter(r => r.sev === "high").length} high · ${diff.filter(r => r.sev === "med").length} med · ${diff.filter(r => r.sev === "low").length} low`}
            </span>
            {diff.length > 0 && <button onClick={exportDiff} style={bt(null, { fontSize: 12 })}><I.Download /> CSV</button>}
          </div>
          {diff.length > 0 && (
            <div style={{ maxHeight: 420, overflow: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
                <thead><tr style={{ background: C.bg, position: "sticky", top: 0 }}>
                  <th style={ths()}></th><th style={ths()}>{t("schemadiff.col_entity")}</th><th style={ths()}>{t("schemadiff.col_field")}</th>
                  <th style={ths()}>{t("schemadiff.col_diff")}</th><th style={ths()}>{t("schemadiff.col_snapshot")}</th><th style={ths()}>{t("schemadiff.col_org")}</th>
                </tr></thead>
                <tbody>{diff.map((r, i) => (
                  <tr key={i} style={{ borderBottom: `1px solid ${C.bd}22` }}>
                    <td style={{ ...tds, width: 40 }}><span style={{ fontSize: 10, padding: "1px 7px", borderRadius: 3, background: sevColor[r.sev] + "22", color: sevColor[r.sev], fontWeight: 700 }}>{r.sev.toUpperCase()}</span></td>
                    <td style={{ ...tds, ...mono, fontSize: 11.5, color: C.vi }}>{r.entity}</td>
                    <td style={{ ...tds, ...mono, fontSize: 11.5 }}>{r.field}</td>
                    <td style={tds}>{whatLabel(r.what)}</td>
                    <td style={{ ...tds, fontSize: 11.5, color: C.txm }}>{r.a}</td>
                    <td style={{ ...tds, fontSize: 11.5, color: C.txm }}>{r.b}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
