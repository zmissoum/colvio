import { useState, useEffect } from "react";
import { bridge } from "../d365-bridge.js";
import { C, I, Spin, ENTS, mono, inp, bt, crd, ths, tds } from "../shared.jsx";
import { t } from "../i18n.js";

// Recycle Bin — list & restore deleted records via Dataverse "keep deleted records".
// Querying the bin is only possible through FetchXML with datasource='bin';
// restore is the unbound Restore action by PRIMARY KEY (platform limitation).
// Docs: learn.microsoft.com/power-platform/admin/restore-deleted-table-records

// Maps the documented Restore error codes to actionable guidance.
function friendlyRestoreError(msg) {
  const m = msg || "";
  if (m.includes("RefCannotBeRestored") || m.includes("cannot restore the reference"))
    return "A related record this one references was also deleted (cascade). Restore the parent/original record first, then retry.";
  if (m.includes("Duplicate entity key"))
    return "A live record now uses the same alternate key values. Delete that record first, then retry the restore.";
  if (m.includes("conflicting record") || m.includes("DuplicateExceptionRestore"))
    return "A live record now uses the same primary key. Delete that record first, then retry the restore.";
  if (m.includes("Picklist value not valid"))
    return "This record used an option-set value that has since been removed. Re-add the option to the choice, then retry.";
  return m;
}

export default function RecycleBin({ bp, orgInfo, theme }) {
  const isLive = orgInfo?.isExtension;
  const [status, setStatus] = useState(null);          // {enabled, retentionDays, unknown}
  const [entities, setEntities] = useState(ENTS);
  const [search, setSearch] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [entity, setEntity] = useState(null);          // {l, d}
  const [top, setTop] = useState(100);
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState(null);              // deleted records
  const [meta, setMeta] = useState(null);              // {primaryName, primaryId, entitySet, displayName}
  const [selected, setSelected] = useState(new Set());
  const [restoring, setRestoring] = useState(null);    // {done, total}
  const [results, setResults] = useState(null);        // [{id, name, ok, error}]
  const [error, setError] = useState("");
  const [supported, setSupported] = useState(null);    // Set of restore-enabled logical names, or null (= show all)
  const [recordSearch, setRecordSearch] = useState(""); // server-side name filter for the deleted list

  useEffect(() => {
    bridge.recycleBinStatus().then(setStatus);
    // getEntities returns {logical, display, entitySet} — map to the {l, d, p} shape this UI uses
    // (same mapping MetadataBrowser applies). Without it, e.l/e.d are undefined → "()" in the
    // picker and "Invalid logicalName: undefined" on query.
    bridge.getEntities().then(list => {
      if (list?.length) setEntities(list.map(e => ({ l: e.logical, d: e.display, p: e.entitySet || e.logical + "s" })).sort((a, b) => (a.d || "").localeCompare(b.d || "")));
    }).catch(() => {});
    // Restrict the picker to tables actually enabled for restore. null (no privilege / older org)
    // → keep all tables (fail-open) so the user is never locked out.
    bridge.recycleBinTables().then(list => { if (Array.isArray(list) && list.length) setSupported(new Set(list)); }).catch(() => {});
  }, []);

  const loadDeleted = async (ent, topVal = top, searchVal = recordSearch) => {
    setLoading(true); setError(""); setRows(null); setSelected(new Set()); setResults(null);
    try {
      const m = await bridge.getEntityMetadata(ent.l);
      setMeta(m);
      // Server-side name filter: lets you find a specific deleted record by name even when there
      // are more than the page cap — the `like` runs in Dataverse, not on the loaded rows.
      let filterXml = "";
      const term = (searchVal || "").trim();
      if (term) {
        const esc = term.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/'/g, "&#39;").replace(/"/g, "&quot;");
        filterXml = `<filter><condition attribute='${m.primaryName}' operator='like' value='%${esc}%' /></filter>`;
      }
      // datasource='bin' is the documented (and only) Web API way to read the recycle bin.
      const xml = `<fetch top='${topVal}' datasource='bin'><entity name='${ent.l}'>` +
        `<attribute name='${m.primaryId}' /><attribute name='${m.primaryName}' />` +
        `<attribute name='createdon' /><attribute name='modifiedon' />` +
        filterXml +
        `<order attribute='modifiedon' descending='true' /></entity></fetch>`;
      const data = await bridge.executeFetchXml(xml);
      setRows(data?.records || []);
    } catch (e) {
      setError(e.message || String(e));
    }
    setLoading(false);
  };

  const doRestore = async () => {
    if (!selected.size || !meta) return;
    const ids = [...selected];
    setRestoring({ done: 0, total: ids.length });
    const out = [];
    for (const id of ids) {
      const rec = rows.find(r => r[meta.primaryId] === id);
      try {
        await bridge.restoreRecord(meta.entitySet, id);
        out.push({ id, name: rec?.[meta.primaryName] || id, ok: true });
      } catch (e) {
        out.push({ id, name: rec?.[meta.primaryName] || id, ok: false, error: friendlyRestoreError(e.message) });
      }
      setRestoring({ done: out.length, total: ids.length });
    }
    setResults(out);
    setRestoring(null);
    // Refresh: restored records leave the bin.
    if (out.some(r => r.ok)) loadDeleted(entity);
  };

  const filtered = entities
    .filter(e => !supported || supported.has(e.l))   // only restore-enabled tables (when known)
    .filter(e => !search || e.l.includes(search.toLowerCase()) || e.d?.toLowerCase().includes(search.toLowerCase()));
  const fmtDate = (v) => v ? new Date(v).toLocaleString() : "";

  return (
    <div style={{ padding: bp.mobile ? 12 : 20, maxWidth: 1000, margin: "0 auto" }}>
      <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 4, display: "flex", alignItems: "center", gap: 8 }}><I.Trash /> {t("recyclebin.title")}</h2>
      <p style={{ color: C.txm, fontSize: 14, marginBottom: 14 }}>{t("recyclebin.subtitle")}</p>

      {status === null && <div style={{ textAlign: "center", marginTop: 40 }}><Spin s={20} /></div>}

      {status && !status.enabled && (
        <div style={{ ...crd({ padding: 16 }) }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.yw, marginBottom: 8 }}>⚠ {t("recyclebin.disabled_title")}</div>
          <div style={{ fontSize: 13, color: C.txm, lineHeight: 1.7, whiteSpace: "pre-line" }}>{t("recyclebin.disabled_body")}</div>
        </div>
      )}

      {status?.enabled && (
        <>
          <div style={{ fontSize: 12, color: C.gn, marginBottom: supported ? 4 : 12 }}>
            ● {t("recyclebin.enabled_label")}{status.retentionDays != null ? ` — ${t("recyclebin.retention")} ${status.retentionDays} ${t("recyclebin.days")}` : ""}
          </div>
          {supported && <div style={{ fontSize: 11, color: C.txd, marginBottom: 12 }}>{t("recyclebin.supported_only").replace("{n}", supported.size)}</div>}

          <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
            <div style={{ position: "relative", minWidth: 260 }}>
              <input value={entity ? `${entity.d || entity.l} (${entity.l})` : search} placeholder={t("recyclebin.pick_entity")}
                onChange={e => { setEntity(null); setSearch(e.target.value); setPickerOpen(true); }}
                onFocus={() => setPickerOpen(true)} style={inp({ fontSize: 13 })} />
              {pickerOpen && !entity && (
                <div style={{ position: "absolute", top: "100%", left: 0, right: 0, zIndex: 10, background: C.sf, border: `1px solid ${C.bd}`, borderRadius: 6, marginTop: 4, maxHeight: 240, overflow: "auto", boxShadow: "0 8px 24px rgba(0,0,0,.4)" }}>
                  {filtered.slice(0, 50).map(e => (
                    <button key={e.l} onClick={() => { setEntity(e); setSearch(""); setRecordSearch(""); setPickerOpen(false); loadDeleted(e, top, ""); }}
                      style={{ width: "100%", textAlign: "left", padding: "7px 10px", border: "none", cursor: "pointer", background: "transparent", color: C.tx, fontSize: 13 }}
                      onMouseEnter={ev => ev.currentTarget.style.background = C.sfh} onMouseLeave={ev => ev.currentTarget.style.background = "transparent"}>
                      {e.d || e.l} <span style={{ color: C.txd, ...mono, fontSize: 11 }}>({e.l})</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            {entity && <input value={recordSearch} onChange={e => setRecordSearch(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") loadDeleted(entity); }}
              placeholder={t("recyclebin.search_records")} style={inp({ fontSize: 13, maxWidth: 200 })} />}
            <select value={top} onChange={e => { const v = +e.target.value; setTop(v); if (entity) loadDeleted(entity, v); }} style={inp({ width: "auto", fontSize: 13, padding: "6px 10px" })}>
              <option value={100}>Top 100</option><option value={500}>Top 500</option><option value={1000}>Top 1000</option><option value={2000}>Top 2000</option>
            </select>
            {entity && <button onClick={() => loadDeleted(entity)} style={bt(null, { fontSize: 12 })}>↻ {t("recyclebin.refresh")}</button>}
            {selected.size > 0 && !restoring && (
              <button onClick={doRestore} style={bt(`linear-gradient(135deg,${C.gn},${C.cyd})`, { fontSize: 13, fontWeight: 700 })}>
                ♻ {t("recyclebin.restore")} ({selected.size})
              </button>
            )}
            {restoring && <span style={{ fontSize: 13, color: C.cy, fontWeight: 600 }}><Spin s={12} /> {t("recyclebin.restoring")} {restoring.done}/{restoring.total}…</span>}
          </div>

          {error && <div style={{ ...crd({ padding: 12, borderColor: C.rd + "66" }), color: C.rd, fontSize: 13, marginBottom: 12 }}>
            {error.includes("datasource") || error.includes("bin")
              ? `${error} — ${t("recyclebin.not_supported_hint")}` : error}
          </div>}

          {results && (
            <div style={{ ...crd({ padding: 12 }), marginBottom: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>
                ♻ {results.filter(r => r.ok).length}/{results.length} {t("recyclebin.restored")}
              </div>
              {results.filter(r => !r.ok).map((r, i) => (
                <div key={i} style={{ fontSize: 12, color: C.rd, marginBottom: 3 }}>✗ <b>{r.name}</b> — {r.error}</div>
              ))}
            </div>
          )}

          {loading && <div style={{ textAlign: "center", marginTop: 30 }}><Spin s={20} /></div>}

          {rows && !loading && (
            rows.length === 0
              ? <div style={{ textAlign: "center", color: C.txd, marginTop: 30, fontSize: 13 }}>{t("recyclebin.empty")}</div>
              : <div style={{ ...crd({ padding: 0, overflow: "hidden" }) }}>
                <div style={{ maxHeight: 460, overflow: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                    <thead><tr style={{ background: C.bg, position: "sticky", top: 0, zIndex: 1 }}>
                      <th style={{ ...ths(), width: 30 }}>
                        <input type="checkbox" checked={selected.size === rows.length && rows.length > 0}
                          onChange={() => setSelected(selected.size === rows.length ? new Set() : new Set(rows.map(r => r[meta.primaryId])))} style={{ accentColor: C.vi }} />
                      </th>
                      <th style={ths()}>{t("recyclebin.col_name")}</th>
                      <th style={ths()}>{t("recyclebin.col_created")}</th>
                      <th style={ths()}>{t("recyclebin.col_modified")}</th>
                      <th style={ths()}>Id</th>
                    </tr></thead>
                    <tbody>{rows.map((r, i) => {
                      const id = r[meta.primaryId];
                      return (
                        <tr key={id || i} style={{ borderBottom: `1px solid ${C.bd}33`, background: selected.has(id) ? C.vi + "11" : i % 2 ? C.sfh + "22" : "transparent" }}>
                          <td style={{ ...tds, width: 30 }}>
                            <input type="checkbox" checked={selected.has(id)}
                              onChange={() => setSelected(p => { const s = new Set(p); s.has(id) ? s.delete(id) : s.add(id); return s; })} style={{ accentColor: C.vi }} />
                          </td>
                          <td style={{ ...tds, fontWeight: 600 }}>{r[meta.primaryName] || <span style={{ color: C.txd, fontStyle: "italic" }}>(no name)</span>}</td>
                          <td style={{ ...tds, fontSize: 12, color: C.txm }}>{fmtDate(r.createdon)}</td>
                          <td style={{ ...tds, fontSize: 12, color: C.txm }}>{fmtDate(r.modifiedon)}</td>
                          <td style={{ ...tds, ...mono, fontSize: 11, color: C.txd }}>{id}</td>
                        </tr>
                      );
                    })}</tbody>
                  </table>
                </div>
                <div style={{ padding: "6px 10px", borderTop: `1px solid ${C.bd}`, fontSize: 11, color: C.txd }}>
                  {rows.length} {t("recyclebin.deleted_records")} · {t("recyclebin.footer_hint")}
                </div>
              </div>
          )}

          <div style={{ marginTop: 14, fontSize: 11.5, color: C.txd, lineHeight: 1.7, whiteSpace: "pre-line" }}>
            {t("recyclebin.limitations")}
          </div>
        </>
      )}
    </div>
  );
}
