import { useState, useEffect, useMemo, useRef } from "react";
import { bridge } from "../d365-bridge.js";
import { C, I, Spin, mono, inp, bt, crd, exportTable } from "../shared.jsx";
import { permFromRow, tablesWithPermissions, buildFieldGrid, fieldExportRows, FIELD_EXPORT_HEADERS, RIGHTS, UNMASKED_LABEL } from "../fieldSecurity.js";

// Security › Field security: pick a table, see each SECURED column × the field security profiles
// that grant Read / Create / Update on it, and who holds each profile. Read-only.
// onTableRights(logical) opens the org-wide role view on that table (the table-level rights).
export default function FieldSecurity({ onTableRights }) {
  const [data, setData] = useState(null);            // { profiles, perms } — org-wide, one load
  const [err, setErr] = useState("");
  const [entities, setEntities] = useState(null);    // every table, for the picker
  const [table, setTable] = useState("");
  const [cols, setCols] = useState(null);            // secured columns of `table`
  const [colsErr, setColsErr] = useState("");
  const [members, setMembers] = useState({});        // profileId -> { loading } | { users, teams } | { error }
  const [feedback, setFeedback] = useState("");
  const gen = useRef(0);

  const load = () => {
    setErr(""); setData(null);
    bridge.getFieldSecurity()
      .then(d => setData({ profiles: d?.profiles || [], perms: (d?.perms || []).map(permFromRow) }))
      .catch(e => setErr(e.message || String(e)));
  };
  useEffect(() => {
    load();
    bridge.getEntities().then(list => setEntities((list || []).filter(e => !e.isIntersect).sort((a, b) => a.logical.localeCompare(b.logical)))).catch(() => setEntities([]));
  }, []);

  const withPerms = useMemo(() => tablesWithPermissions(data?.perms), [data]);
  // First table with permissions is opened by default.
  useEffect(() => { if (data && !table && withPerms[0]) setTable(withPerms[0].entity); }, [data, withPerms, table]);

  useEffect(() => {
    if (!table) return;
    const g = ++gen.current;
    setCols(null); setColsErr("");
    bridge.getSecuredColumns(table)
      .then(c => { if (gen.current === g) setCols(c || []); })
      .catch(e => { if (gen.current === g) setColsErr(e.message || String(e)); });
  }, [table]);

  const grid = useMemo(() => (data && cols ? buildFieldGrid(table, cols, data.perms, data.profiles) : null), [data, cols, table]);
  const display = (logical) => entities?.find(e => e.logical === logical)?.display || logical;

  const loadMembers = (id) => {
    setMembers(m => ({ ...m, [id]: { loading: true } }));
    bridge.getFieldProfileMembers(id)
      .then(r => setMembers(m => ({ ...m, [id]: { users: r?.users || [], teams: r?.teams || [] } })))
      .catch(e => setMembers(m => ({ ...m, [id]: { error: e.message || String(e) } })));
  };

  const doExport = (format) => {
    if (!grid) return;
    const rows = fieldExportRows(grid);
    if (!rows.length) return;
    exportTable(FIELD_EXPORT_HEADERS, rows, `field_security_${grid.entity}`, format, "FieldSecurity");
    setFeedback(`${format === "xlsx" ? "Excel" : "CSV"} downloaded (${rows.length} rows)`);
    setTimeout(() => setFeedback(""), 2000);
  };

  const Right = ({ on, label, title }) => (
    <span title={title} style={{ display: "inline-block", minWidth: 15, textAlign: "center", fontSize: 10.5, fontWeight: 700, borderRadius: 3, padding: "1px 3px", background: on ? C.gn + "26" : "transparent", color: on ? C.gn : C.txd + "88", border: `1px solid ${on ? C.gn + "55" : C.bd}`, ...mono }}>{label}</span>
  );

  const otherTables = useMemo(() => {
    const have = new Set(withPerms.map(w => w.entity));
    return (entities || []).filter(e => !have.has(e.logical));
  }, [entities, withPerms]);

  return (
    <div>
      <div style={{ ...crd({ padding: "14px 18px" }), marginBottom: 12 }}>
        <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 4 }}>🔐 Field security — who can read / create / update each column</div>
        <div style={{ fontSize: 12, color: C.txd, lineHeight: 1.55 }}>
          Security roles grant rights on <b>whole tables</b>. A column has its own access only once it is <b>secured</b>; it is then granted by
          <b> field security profiles</b>, given to users and teams (not to roles). A column that is not secured follows the table's rights.
          System Administrators always see every secured column.
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 10 }}>
          <select value={table} onChange={e => { setTable(e.target.value); }} disabled={!data} style={inp({ width: "auto", maxWidth: 360, fontSize: 12, padding: "5px 8px" })}>
            {!table && <option value="">Pick a table…</option>}
            {withPerms.length > 0 && (
              <optgroup label="Tables with field permissions">
                {withPerms.map(w => <option key={w.entity} value={w.entity}>{display(w.entity)} ({w.entity}) — {w.columns} column{w.columns > 1 ? "s" : ""}</option>)}
              </optgroup>
            )}
            {otherTables.length > 0 && (
              <optgroup label="Other tables">
                {otherTables.map(e => <option key={e.logical} value={e.logical}>{e.display} ({e.logical})</option>)}
              </optgroup>
            )}
          </select>
          {table && onTableRights && <button onClick={() => onTableRights(table)} title="Which roles can read / write this table — the org-wide view, by entity" style={bt(null, { fontSize: 11.5, padding: "4px 10px" })}>🌐 Table rights by role</button>}
          <span style={{ flex: 1 }} />
          <button onClick={() => doExport("csv")} disabled={!grid?.rows.length} style={bt(C.cy, { fontSize: 11, padding: "3px 9px", opacity: grid?.rows.length ? 1 : 0.5 })}><I.Download /> CSV</button>
          <button onClick={() => doExport("xlsx")} disabled={!grid?.rows.length} style={bt(C.cy, { fontSize: 11, padding: "3px 9px", opacity: grid?.rows.length ? 1 : 0.5 })}><I.Download /> Excel</button>
        </div>
        {feedback && <div style={{ fontSize: 11, color: C.gn, marginTop: 6 }}>{feedback}</div>}
      </div>

      {!data && !err && <div style={{ padding: 20, textAlign: "center", color: C.txd }}><Spin /> Reading field security profiles…</div>}
      {err && <div style={{ padding: 10, color: C.rd, fontSize: 12 }}>Couldn't read field security: {err} <button onClick={load} style={bt(C.rd, { fontSize: 11, padding: "2px 8px", marginLeft: 6 })}>↻ Retry</button></div>}
      {data && !withPerms.length && !table && <div style={{ padding: 10, color: C.txd, fontSize: 12 }}>No field security profile grants anything on this org yet. Pick a table to see its secured columns.</div>}

      {table && !cols && !colsErr && <div style={{ padding: 20, textAlign: "center", color: C.txd }}><Spin /> Reading the secured columns of {table}…</div>}
      {colsErr && <div style={{ padding: 10, color: C.rd, fontSize: 12 }}>Couldn't read the columns of {table}: {colsErr}</div>}

      {grid && grid.rows.length === 0 && (
        <div style={{ ...crd({ padding: "12px 16px" }), fontSize: 12.5, color: C.txm }}>
          <b>{display(table)}</b> has no secured column: every column follows the table's rights, given by the security roles.
          {onTableRights && <> <button onClick={() => onTableRights(table)} style={bt(null, { fontSize: 11.5, padding: "3px 9px", marginLeft: 6 })}>🌐 See which roles can read it</button></>}
        </div>
      )}

      {grid && grid.rows.length > 0 && (
        <div style={{ ...crd({ padding: 0 }), overflow: "auto", marginBottom: 14 }}>
          <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 12 }}>
            <thead>
              <tr style={{ background: C.sfa }}>
                <th style={{ textAlign: "left", padding: "7px 10px", borderBottom: `1px solid ${C.bd}`, position: "sticky", left: 0, background: C.sfa }}>Column</th>
                {grid.profiles.map(p => (
                  <th key={p.id} title={p.description || p.name} style={{ padding: "7px 10px", borderBottom: `1px solid ${C.bd}`, fontWeight: 600, whiteSpace: "nowrap" }}>{p.name}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {grid.rows.map(r => (
                <tr key={r.column} style={{ borderBottom: `1px solid ${C.bd}33` }}>
                  <td style={{ padding: "6px 10px", position: "sticky", left: 0, background: C.sf }}>
                    <div style={{ fontWeight: 600 }}>{r.display}</div>
                    <div style={{ fontSize: 10.5, color: C.txd, ...mono }}>{r.column}{r.type ? ` · ${r.type}` : ""}</div>
                    {r.nobody && <div style={{ fontSize: 10.5, color: C.yw, marginTop: 2 }} title="Secured, and no profile grants Read: only System Administrators see its values">⚠ no profile can read it</div>}
                    {!r.secured && <div style={{ fontSize: 10.5, color: C.txd, marginTop: 2 }} title="A profile still lists this column, but it is no longer secured: the permission is ignored and the table's rights apply">not secured anymore — permission ignored</div>}
                  </td>
                  {grid.profiles.map(p => {
                    const c = r.cells[String(p.id).toLowerCase()];
                    return (
                      <td key={p.id} style={{ padding: "6px 10px", textAlign: "center", whiteSpace: "nowrap" }}>
                        {c ? (
                          <span style={{ display: "inline-flex", gap: 3, alignItems: "center" }}>
                            {RIGHTS.map(([k, l, label]) => <Right key={k} on={c[k]} label={l} title={`${label}: ${c[k] ? "allowed" : "not allowed"}`} />)}
                            {c.unmasked ? <span title={`Read unmasked: ${UNMASKED_LABEL[c.unmasked] || c.unmasked}`} style={{ fontSize: 11, marginLeft: 2 }}>👁</span> : null}
                          </span>
                        ) : <span style={{ color: C.txd + "88" }} title="This profile grants nothing on this column">·</span>}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ padding: "7px 10px", fontSize: 11, color: C.txd, borderTop: `1px solid ${C.bd}` }}>
            R Read · C Create · U Update{grid.showUnmasked ? " · 👁 reads the unmasked value" : ""}. A user holding several profiles (directly or through a team) gets the union of their rights.
          </div>
        </div>
      )}

      {grid && grid.profiles.length > 0 && (
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, margin: "4px 0 8px" }}>Who holds these profiles</div>
          {grid.profiles.map(p => {
            const m = members[p.id];
            return (
              <div key={p.id} style={{ ...crd({ padding: "9px 12px" }), marginBottom: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontWeight: 600, fontSize: 12.5, flex: 1 }}>🔐 {p.name}</span>
                  {!m && <button onClick={() => loadMembers(p.id)} style={bt(null, { fontSize: 11, padding: "2px 9px" })}>👥 Show users & teams</button>}
                  {m?.loading && <Spin s={11} />}
                </div>
                {p.description && <div style={{ fontSize: 11, color: C.txd, marginTop: 2 }}>{p.description}</div>}
                {m?.error && <div style={{ fontSize: 11.5, color: C.rd, marginTop: 4 }}>Couldn't read the holders: {m.error} <button onClick={() => loadMembers(p.id)} style={bt(C.rd, { fontSize: 11, padding: "1px 7px", marginLeft: 4 })}>↻ Retry</button></div>}
                {m?.users && (
                  <div style={{ fontSize: 11.5, marginTop: 6, color: C.txm, lineHeight: 1.6 }}>
                    <div><b>{m.users.length}</b> user{m.users.length !== 1 ? "s" : ""}{m.users.length ? ": " : ""}{m.users.map((u, i) => <span key={u.id} title={u.upn} style={{ color: u.disabled ? C.txd : C.tx, textDecoration: u.disabled ? "line-through" : "none" }}>{u.name}{i < m.users.length - 1 ? ", " : ""}</span>)}</div>
                    <div><b>{m.teams.length}</b> team{m.teams.length !== 1 ? "s" : ""}{m.teams.length ? ": " : ""}{m.teams.map(tm => `${tm.name}${tm.type ? ` (${tm.type})` : ""}`).join(", ")}{m.teams.length ? " — every member gets the profile" : ""}</div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
