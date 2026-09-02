import { useState, Fragment } from "react";
import { bridge } from "../d365-bridge.js";
import { C, I, Spin, mono, bt, crd, ths, tds, exportTable } from "../shared.jsx";
import { t } from "../i18n.js";

// Field-level change history for one record, from the Dataverse audit log.
// Approach (per Microsoft docs): the Web API RetrieveRecordChangeHistory response
// omits AuditRecord (who/when) — so we list the `audits` table for the record
// (who/when/action via formatted-value annotations) and call RetrieveAuditDetails
// per audit row on expand for the old→new attribute diff.
// Requires auditing enabled (org + table) and audit-read privileges.

const FMT = "@OData.Community.Display.V1.FormattedValue";

// Old/NewValue are entity-shaped objects: real attributes + annotation keys.
// Build {field: {old, new}} preferring formatted values, skipping annotations/PK noise.
function diffRows(detail) {
  const oldV = detail?.OldValue || {}, newV = detail?.NewValue || {};
  const keys = new Set([...Object.keys(oldV), ...Object.keys(newV)].filter(k => !k.includes("@") && k !== "@odata.type"));
  const get = (obj, k) => {
    const f = obj[k + FMT];
    if (f !== undefined && f !== null) return String(f);
    const v = obj[k];
    if (v === undefined || v === null) return "";
    return typeof v === "object" ? JSON.stringify(v) : String(v);
  };
  return [...keys].map(k => ({ field: k, oldVal: get(oldV, k), newVal: get(newV, k) }))
    .filter(r => r.oldVal !== r.newVal)
    .sort((a, b) => a.field.localeCompare(b.field));
}

export default function AuditHistory({ recordId, orgFeatures }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [trail, setTrail] = useState(null);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState(null);      // auditid
  const [details, setDetails] = useState({});          // auditid -> {loading, rows, error}

  const load = async () => {
    setOpen(true);
    if (orgFeatures?.auditEnabled === false) { setError(t("featuregate.audit_off")); setTrail([]); return; }
    setLoading(true); setError("");
    try { setTrail(await bridge.getRecordAuditTrail(recordId, 100)); }
    catch (e) {
      const m = e.message || "";
      setError(m.includes("does not exist") || m.includes("not enabled") || m.includes("audit")
        ? `${m} — ${t("audit.not_enabled_hint")}` : m);
    }
    setLoading(false);
  };

  // Exports the loaded trail (when/who/action). Field-level old→new diffs are fetched lazily per
  // expanded row, so they're not in the file — the honest scope is stated in the button title.
  const exportTrail = (format = "csv") => {
    if (!trail?.length) return;
    exportTable(["when", "who", "action"],
      trail.map(a => [a.createdon && !isNaN(new Date(a.createdon).getTime()) ? new Date(a.createdon).toISOString() : "", a["_userid_value" + FMT] || a["_userid_value"] || "", a["action" + FMT] || String(a.action ?? "")]),
      "audit_trail", format, "Audit trail");
  };

  const toggleRow = async (auditId) => {
    if (expanded === auditId) { setExpanded(null); return; }
    setExpanded(auditId);
    if (details[auditId]) return;
    setDetails(p => ({ ...p, [auditId]: { loading: true } }));
    try {
      const d = await bridge.getAuditDetails(auditId);
      setDetails(p => ({ ...p, [auditId]: { rows: diffRows(d?.AuditDetail) } }));
    } catch (e) {
      setDetails(p => ({ ...p, [auditId]: { error: e.message } }));
    }
  };

  return (
    <div style={{ ...crd({ padding: 0, overflow: "hidden" }), marginBottom: 12 }}>
      <button onClick={() => open ? setOpen(false) : load()}
        style={{ width: "100%", textAlign: "left", padding: "10px 14px", background: "transparent", border: "none", cursor: "pointer", color: C.tx, fontSize: 13, fontWeight: 700, display: "flex", alignItems: "center", gap: 8 }}>
        <span>{open ? "▾" : "▸"}</span> 📜 {t("audit.title")}
        <span style={{ fontWeight: 400, fontSize: 11.5, color: C.txd }}>{t("audit.subtitle")}</span>
      </button>

      {open && (
        <div style={{ borderTop: `1px solid ${C.bd}`, padding: loading || error || !trail?.length ? 14 : 0 }}>
          {loading && <div style={{ textAlign: "center" }}><Spin s={16} /></div>}
          {error && <div style={{ color: C.rd, fontSize: 12.5 }}>⚠ {error}</div>}
          {!loading && !error && trail && trail.length === 0 && (
            <div style={{ color: C.txd, fontSize: 12.5 }}>{t("audit.empty")}</div>
          )}
          {!loading && !error && trail && trail.length > 0 && (
            <div style={{ display: "flex", gap: 6, justifyContent: "flex-end", padding: "6px 10px", borderBottom: `1px solid ${C.bd}33` }}>
              <button onClick={() => exportTrail("csv")} title="Export the loaded audit trail (when / who / action)" style={bt(null, { fontSize: 11, padding: "3px 9px" })}><I.Download /> CSV</button>
              <button onClick={() => exportTrail("xlsx")} title="Export the loaded audit trail (when / who / action)" style={bt(null, { fontSize: 11, padding: "3px 9px" })}><I.Download /> Excel</button>
            </div>
          )}
          {!loading && !error && trail && trail.length > 0 && (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
              <thead><tr style={{ background: C.bg }}>
                <th style={ths()}>{t("audit.when")}</th>
                <th style={ths()}>{t("audit.who")}</th>
                <th style={ths()}>{t("audit.action")}</th>
              </tr></thead>
              <tbody>{trail.map(a => {
                const isEx = expanded === a.auditid;
                const det = details[a.auditid];
                const who = a["_userid_value" + FMT] || a["_userid_value"] || "";
                const action = a["action" + FMT] || a.action;
                return (
                  <Fragment key={a.auditid}>
                    <tr onClick={() => toggleRow(a.auditid)}
                      style={{ borderBottom: `1px solid ${C.bd}33`, cursor: "pointer", background: isEx ? C.vi + "11" : "transparent" }}
                      onMouseEnter={e => { if (!isEx) e.currentTarget.style.background = C.sfh; }}
                      onMouseLeave={e => { if (!isEx) e.currentTarget.style.background = "transparent"; }}>
                      <td style={{ ...tds, whiteSpace: "nowrap" }}>{isEx ? "▾" : "▸"} {a.createdon && !isNaN(new Date(a.createdon).getTime()) ? new Date(a.createdon).toLocaleString() : "—"}</td>
                      <td style={tds}>{who}</td>
                      <td style={tds}><span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 3, background: C.cy + "22", color: C.cy, fontWeight: 600 }}>{action}</span></td>
                    </tr>
                    {isEx && (
                      <tr style={{ background: C.bg }}>
                        <td colSpan={3} style={{ padding: "8px 14px", borderBottom: `1px solid ${C.bd}` }}>
                          {det?.loading && <Spin s={13} />}
                          {det?.error && <span style={{ color: C.rd, fontSize: 12 }}>{det.error}</span>}
                          {det?.rows && det.rows.length === 0 && <span style={{ color: C.txd, fontSize: 12 }}>{t("audit.no_field_changes")}</span>}
                          {det?.rows && det.rows.length > 0 && (
                            <table style={{ borderCollapse: "collapse", fontSize: 12 }}>
                              <thead><tr>
                                <th style={{ ...ths(), fontSize: 11 }}>{t("audit.field")}</th>
                                <th style={{ ...ths(), fontSize: 11 }}>{t("audit.old")}</th>
                                <th style={{ ...ths(), fontSize: 11 }}>{t("audit.new")}</th>
                              </tr></thead>
                              <tbody>{det.rows.map(r => (
                                <tr key={r.field} style={{ borderBottom: `1px solid ${C.bd}22` }}>
                                  <td style={{ ...tds, ...mono, fontSize: 11.5, color: C.vi }}>{r.field}</td>
                                  <td style={{ ...tds, color: C.rd, maxWidth: 260, overflowWrap: "anywhere" }}>{r.oldVal || <i style={{ color: C.txd }}>(empty)</i>}</td>
                                  <td style={{ ...tds, color: C.gn, maxWidth: 260, overflowWrap: "anywhere" }}>{r.newVal || <i style={{ color: C.txd }}>(empty)</i>}</td>
                                </tr>
                              ))}</tbody>
                            </table>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}</tbody>
            </table>
          )}
          {!loading && !error && trail && trail.length === 100 && (
            <div style={{ padding: "8px 14px", fontSize: 11.5, color: C.txd }}>Showing the latest 100 changes — this record has more audit history than displayed.</div>
          )}
        </div>
      )}
    </div>
  );
}
