import { useState, useEffect, useRef } from "react";
import { bridge } from "../d365-bridge.js";
import { C, I, Spin, mono, inp, bt, crd, copyText, exportTable } from "../shared.jsx";
import { normalizeTeam, normalizeMember, filterTeams, sortTeams } from "../teamUtils.js";
import { t } from "../i18n.js";

// Teams — the SECOND channel of privilege in Dataverse (after direct roles): a role carried by a
// team is inherited by every member and never shows on the user. This module answers "why does
// this user have that right?" and "who is actually in this Entra group team?". Read-only v1:
// Entra-team membership is managed in Entra ID, owner-team membership editing is a later slice.
export default function Teams({ bp, orgInfo }) {
  const [teams, setTeams] = useState(null);          // normalized non-access teams
  const [accessTeams, setAccessTeams] = useState(null); // lazy, capped 500 — null = not loaded yet
  const [loading, setLoading] = useState(true);
  const [accessLoading, setAccessLoading] = useState(false);
  const [error, setError] = useState("");
  const [chip, setChip] = useState("all");
  const [search, setSearch] = useState("");
  const [sel, setSel] = useState(null);
  const [members, setMembers] = useState(null);      // {rows, more} once loaded
  const [membersLoading, setMembersLoading] = useState(false);
  const [membersErr, setMembersErr] = useState("");
  const [roles, setRoles] = useState(null);
  const [memberFilter, setMemberFilter] = useState("");
  const [copied, setCopied] = useState("");
  const selGen = useRef(0); // a slow member/role response for a PREVIOUS team must never land on the current one

  const load = () => {
    setLoading(true); setError(""); setSel(null); setMembers(null); setRoles(null);
    bridge.getTeams(false)
      .then(rows => { setTeams(sortTeams((rows || []).map(normalizeTeam))); setLoading(false); })
      .catch(e => { setError(e.message || String(e)); setTeams([]); setLoading(false); });
  };
  useEffect(load, []);

  const pickChip = (k) => {
    setChip(k);
    if (k === "access" && accessTeams === null && !accessLoading) {
      setAccessLoading(true);
      bridge.getTeams(true)
        .then(rows => { setAccessTeams(sortTeams((rows || []).map(normalizeTeam))); setAccessLoading(false); })
        .catch(() => { setAccessTeams([]); setAccessLoading(false); });
    }
  };

  const selectTeam = (tm) => {
    const gen = ++selGen.current;
    setSel(tm); setMembers(null); setRoles(null); setMemberFilter(""); setMembersErr(""); setMembersLoading(true);
    bridge.getTeamMembers(tm.id)
      .then(r => { if (selGen.current !== gen) return; setMembers({ rows: (r?.rows || []).map(normalizeMember).sort((a, b) => a.fullname.localeCompare(b.fullname)), more: !!r?.more }); setMembersLoading(false); })
      .catch(e => { if (selGen.current !== gen) return; setMembersErr(e.message || String(e)); setMembers({ rows: [], more: false }); setMembersLoading(false); });
    bridge.getTeamRoles(tm.id)
      .then(r => { if (selGen.current === gen) setRoles((r || []).sort((a, b) => (a.name || "").localeCompare(b.name || ""))); })
      .catch(() => { if (selGen.current === gen) setRoles([]); });
  };

  const allLoaded = [...(teams || []), ...(accessTeams || [])];
  const shown = filterTeams(allLoaded, { search, chip });
  const nOwner = (teams || []).filter(x => x.typeKey === "owner").length;
  const nEntra = (teams || []).filter(x => x.typeKey === "entra").length;

  const shownMembers = (members?.rows || []).filter(m => {
    const s = memberFilter.trim().toLowerCase();
    return !s || m.fullname.toLowerCase().includes(s) || m.email.toLowerCase().includes(s);
  });

  const exportMembers = (format) => {
    if (!sel || !shownMembers.length) return;
    exportTable(["name", "email", "title", "accessMode", "calType", "status"],
      shownMembers.map(m => [m.fullname, m.email, m.title, m.accessModeLabel, m.calTypeLabel, m.disabled ? "Disabled" : "Enabled"]),
      `team_${sel.name.replace(/[^\w-]+/g, "_")}_members`, format, "Team members");
  };

  const cp = (v, k) => { copyText(v); setCopied(k); setTimeout(() => setCopied(""), 1500); };

  const typeHint = (tm) =>
    tm.typeKey === "owner" ? "Owner team — can own records and carry security roles; members inherit them."
    : tm.typeKey === "entra" ? "Membership is managed in ENTRA ID and materializes lazily: a user added to the group appears here only after their next access to this environment."
    : tm.typeKey === "access" ? "Access team — created per record for sharing; carries no security roles."
    : "";

  const badge = (tm, small) => (
    <span style={{ fontSize: small ? 9.5 : 10.5, padding: small ? "1px 6px" : "2px 8px", borderRadius: 3, background: C[tm.typeColor] + "22", color: C[tm.typeColor], fontWeight: 700, letterSpacing: ".3px", flexShrink: 0 }}>{tm.typeLabel.toUpperCase()}</span>
  );

  return (
    <div style={{ display: "flex", height: "100%", flexDirection: bp.mobile ? "column" : "row" }}>
      {/* Left: team list */}
      <div style={{ width: bp.mobile ? "100%" : 300, borderRight: bp.mobile ? "none" : `1px solid ${C.bd}`, display: "flex", flexDirection: "column", flexShrink: 0, ...(bp.mobile && sel ? { display: "none" } : {}) }}>
        <div style={{ padding: "10px 10px 6px" }}>
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 6, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span>👥 {t("nav.teams")}</span>
            <button onClick={load} disabled={loading} title="Reload the team list from the environment" style={bt(null, { fontSize: 11, padding: "3px 8px", opacity: loading ? 0.5 : 1 })}>↻</button>
          </div>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name, BU, administrator…" style={inp({ fontSize: 12, padding: "6px 9px" })} />
          <div style={{ display: "flex", gap: 2, marginTop: 6, flexWrap: "wrap" }}>
            {[["all", `All (${(teams || []).length})`], ["owner", `Owner (${nOwner})`], ["entra", `Entra (${nEntra})`], ["access", accessTeams === null ? "Access…" : `Access (${accessTeams.length}${accessTeams.length >= 500 ? "+" : ""})`]].map(([k, lbl]) => (
              <button key={k} onClick={() => pickChip(k)} style={{ padding: "3px 9px", fontSize: 11, border: `1px solid ${chip === k ? C.vi : C.bd}`, borderRadius: 3, cursor: "pointer", background: chip === k ? C.vi + "22" : "transparent", color: chip === k ? C.tx : C.txd }}>{lbl}</button>
            ))}
          </div>
          {chip === "access" && accessTeams !== null && accessTeams.length >= 500 && (
            <div style={{ fontSize: 10.5, color: C.yw, marginTop: 5, lineHeight: 1.4 }}>⚠ Access teams are created per record — showing the first 500 by name. Use the search to narrow down.</div>
          )}
        </div>
        <div style={{ flex: 1, overflow: "auto", padding: "0 6px 6px" }}>
          {(loading || (chip === "access" && accessLoading)) && <div style={{ textAlign: "center", padding: 20 }}><Spin /></div>}
          {error && <div style={{ padding: 10, color: C.rd, fontSize: 12 }}>{error}</div>}
          {!loading && !error && shown.length === 0 && !(chip === "access" && accessLoading) && (
            <div style={{ padding: 14, color: C.txd, fontSize: 12, textAlign: "center" }}>{search ? `No team matches “${search}”` : "No teams here"}</div>
          )}
          {shown.slice(0, 500).map(tm => (
            <button key={tm.id} onClick={() => selectTeam(tm)} style={{ width: "100%", textAlign: "left", padding: "7px 9px", border: "none", borderRadius: 6, cursor: "pointer", marginBottom: 2, background: sel?.id === tm.id ? C.sfa : "transparent", color: sel?.id === tm.id ? C.tx : C.txm }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: sel?.id === tm.id ? 600 : 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{tm.name}</span>
                {badge(tm, true)}
              </div>
              <div style={{ fontSize: 10.5, color: C.txd, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{tm.buName}{tm.isDefault ? " · BU default team" : ""}</div>
            </button>
          ))}
          {shown.length > 500 && <div style={{ padding: "8px 10px", fontSize: 11, color: C.yw }}>⚠ Showing the first 500 of {shown.length.toLocaleString()} — refine the search.</div>}
        </div>
      </div>

      {/* Right: team detail */}
      <div style={{ flex: 1, overflow: "auto", padding: bp.mobile ? 12 : 20, minWidth: 0 }}>
        {!sel && <div style={{ textAlign: "center", color: C.txd, marginTop: 60, fontSize: 14 }}>Select a team to see its members and security roles</div>}
        {sel && (
          <div>
            {bp.mobile && <button onClick={() => setSel(null)} style={{ background: "none", border: "none", color: C.txm, cursor: "pointer", marginBottom: 8, display: "flex", alignItems: "center", gap: 4 }}><I.Back /> Back</button>}
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 4 }}>
              <span style={{ fontSize: 18, fontWeight: 700 }}>{sel.name}</span>
              {badge(sel)}
              {orgInfo?.orgUrl && <a href={`${orgInfo.orgUrl}/main.aspx?etn=team&id=${sel.id}&pagetype=entityrecord`} target="_blank" rel="noopener" title="Open this team in D365 (manage members and roles there)" style={{ color: C.vil, textDecoration: "none", fontSize: 14, lineHeight: 1 }}>{"↗"}</a>}
              {sel.isDefault && <span style={{ fontSize: 10.5, padding: "2px 8px", borderRadius: 3, background: C.sfh, color: C.txd, fontWeight: 600 }}>BU DEFAULT</span>}
            </div>
            <div style={{ fontSize: 12, color: C.txm, marginBottom: 12, lineHeight: 1.5, maxWidth: 720 }}>{typeHint(sel)}</div>

            <div style={{ ...crd({ padding: "10px 14px" }), marginBottom: 12, display: "grid", gridTemplateColumns: bp.mobile ? "1fr" : "repeat(auto-fit, minmax(210px, 1fr))", gap: "8px 18px", fontSize: 12.5 }}>
              <div><div style={{ fontSize: 10.5, color: C.txd, fontWeight: 700, letterSpacing: ".4px" }}>BUSINESS UNIT</div>{sel.buName || "—"}</div>
              <div><div style={{ fontSize: 10.5, color: C.txd, fontWeight: 700, letterSpacing: ".4px" }}>ADMINISTRATOR</div>{sel.adminName || "—"}</div>
              <div><div style={{ fontSize: 10.5, color: C.txd, fontWeight: 700, letterSpacing: ".4px" }}>CREATED</div>{sel.createdon ? new Date(sel.createdon).toLocaleDateString() : "—"}</div>
              {sel.aadId && (
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 10.5, color: C.txd, fontWeight: 700, letterSpacing: ".4px" }}>ENTRA GROUP OBJECT ID</div>
                  <span style={{ ...mono, fontSize: 11.5, display: "inline-flex", alignItems: "center", gap: 5, maxWidth: "100%" }}>
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sel.aadId}</span>
                    <button onClick={() => cp(sel.aadId, "aad")} title="Copy the group's object id (to look it up in the Entra admin center)" style={{ background: "none", border: "none", color: copied === "aad" ? C.gn : C.txd, cursor: "pointer", padding: 0 }}>{copied === "aad" ? "✓" : <I.Copy />}</button>
                  </span>
                </div>
              )}
            </div>
            {sel.description && <div style={{ fontSize: 12.5, color: C.txm, marginBottom: 12, whiteSpace: "pre-wrap" }}>{sel.description}</div>}

            {/* Security roles — the whole point of the module */}
            <div style={{ ...crd({ padding: "10px 14px" }), marginBottom: 12 }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 6, display: "flex", alignItems: "center", gap: 6 }}><I.Shield /> Security roles on this team {roles !== null && <span style={{ color: C.txd, fontWeight: 400 }}>({roles.length})</span>}</div>
              {roles === null && <Spin s={13} />}
              {roles !== null && roles.length === 0 && <div style={{ fontSize: 12, color: C.txd }}>No security roles assigned to this team.</div>}
              {roles !== null && roles.length > 0 && (
                <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                  {roles.map(r => <span key={r.roleid} style={{ fontSize: 11.5, padding: "3px 10px", borderRadius: 12, background: C.vi + "18", color: C.vil, fontWeight: 600 }}>{r.name}</span>)}
                </div>
              )}
              {roles !== null && roles.length > 0 && (
                <div style={{ fontSize: 11, color: C.txd, marginTop: 8, lineHeight: 1.5 }}>Every member inherits these roles while in the team — an inherited role never appears in the user's own role list. To change them, edit the team (or use Security Audit's role view).</div>
              )}
            </div>

            {/* Members */}
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8, flexWrap: "wrap" }}>
              <span style={{ fontSize: 12.5, fontWeight: 700 }}>Members {members !== null && <span style={{ color: C.txd, fontWeight: 400 }}>({members.rows.length}{members.more ? "+" : ""})</span>}</span>
              <input value={memberFilter} onChange={e => setMemberFilter(e.target.value)} placeholder="Filter members…" style={inp({ fontSize: 12, maxWidth: 200, padding: "4px 8px" })} />
              <div style={{ flex: 1 }} />
              <button onClick={() => exportMembers("csv")} disabled={!shownMembers.length} style={bt(C.cy, { fontSize: 11, padding: "4px 10px", opacity: shownMembers.length ? 1 : 0.5 })}><I.Download /> CSV</button>
              <button onClick={() => exportMembers("xlsx")} disabled={!shownMembers.length} style={bt(C.cy, { fontSize: 11, padding: "4px 10px", opacity: shownMembers.length ? 1 : 0.5 })}><I.Download /> Excel</button>
            </div>
            {members?.more && <div style={{ ...crd({ padding: "8px 12px", background: C.yw + "0c", borderColor: C.yw + "55" }), marginBottom: 8, fontSize: 12, color: C.txm }}>⚠ This team has more members than one page (5,000) — the list and exports cover the first page only.</div>}
            {membersErr && <div style={{ padding: 10, color: C.rd, fontSize: 12 }}>{membersErr}</div>}
            <div style={{ ...crd({ padding: 0, overflow: "hidden" }) }}>
              <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1.7fr 1fr 90px", padding: "8px 14px", background: C.sfh, fontSize: 11, fontWeight: 700, color: C.txd, borderBottom: `1px solid ${C.bd}` }}>
                <span>Name</span><span>Email</span><span>Access / CAL</span><span>Status</span>
              </div>
              <div style={{ maxHeight: "calc(100vh - 460px)", minHeight: 140, overflow: "auto" }}>
                {membersLoading && <div style={{ textAlign: "center", padding: 16 }}><Spin /></div>}
                {!membersLoading && members !== null && shownMembers.length === 0 && (
                  <div style={{ padding: 14, color: C.txd, fontSize: 12 }}>
                    {memberFilter ? "No members match this filter"
                      : sel.typeKey === "entra" ? "No members materialized yet — Entra group members appear here after their first access to this environment."
                      : "No members in this team"}
                  </div>
                )}
                {shownMembers.slice(0, 500).map((m, i) => (
                  <div key={m.id || i} style={{ display: "grid", gridTemplateColumns: "1.4fr 1.7fr 1fr 90px", padding: "6px 14px", fontSize: 12, borderBottom: `1px solid ${C.bd}22`, alignItems: "center", opacity: m.disabled ? 0.5 : 1 }}>
                    <span style={{ minWidth: 0, overflow: "hidden" }} title={m.title ? `${m.fullname} — ${m.title}` : m.fullname}>
                      <span style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.fullname}</span>
                      {m.title && <span style={{ display: "block", fontSize: 10, color: C.txd, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.title}</span>}
                    </span>
                    <span style={{ color: C.txm, ...mono, fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={m.email}>{m.email || "—"}</span>
                    <span style={{ color: C.txm, fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.accessModeLabel}{m.calTypeLabel ? ` · ${m.calTypeLabel}` : ""}</span>
                    <span style={{ fontSize: 10.5, fontWeight: 700, color: m.disabled ? C.rd : C.gn }}>{m.disabled ? "Disabled" : "Enabled"}</span>
                  </div>
                ))}
                {shownMembers.length > 500 && <div style={{ padding: "8px 14px", fontSize: 11, color: C.yw }}>⚠ Showing the first 500 of {shownMembers.length.toLocaleString()} — refine the filter. Exports cover the filtered list.</div>}
              </div>
            </div>
            {sel.typeKey === "entra" && (
              <div style={{ fontSize: 11, color: C.txd, marginTop: 8, lineHeight: 1.6 }}>Members of this team are managed in <b>Entra ID</b> (the group above), not in Dataverse — adding or removing people here isn't possible by design.</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
