import { useState, useEffect, useRef, useMemo } from "react";
import { bridge } from "../d365-bridge.js";
import { C, I, Spin, mono, inp, bt, crd, dl } from "../shared.jsx";
import Tooltip from "./Tooltip.jsx";
import { t } from "../i18n.js";

// Privileges considered sensitive for security review
const SENSITIVE_PRIVS = new Set([
  "prvdeleteaccount","prvdeletecontact","prvdeletelead","prvdeleteopportunity","prvdeleteincident",
  "prvwritesystemuser","prvdeletesystemuser","prvcreatesystemuser",
  "prvassignrole","prvwriterole","prvdeleterole","prvcreaterole",
  "prvreadaudit","prvdeleteaudit","prvdeleteauditdata",
  "prvexporttoexcel","prvbulkdelete",
  "prvpublishall","prvpublishentity",
  "prvimportcustomization","prvexportcustomization",
  "prvwriteentity","prvdeleteentity","prvcreateentity",
  "prvwriteattribute","prvdeleteattribute",
  "prvwriterelationship","prvdeleterelationship",
  "prvactondataexport","prvdataexport",
]);

const DEPTH_COLORS = { 1: C.gn, 2: C.cy, 4: C.yw, 8: C.rd };

// Parse privilege name into readable label
// prvAppendToCustomerGroup -> Append To · CustomerGroup
// prvDeleteAccount -> Delete · Account
// prvReadAudit -> Read · Audit
function formatPrivName(name) {
  if (!name || !name.startsWith("prv")) return name || "";
  const raw = name.substring(3); // strip "prv"
  // Split on camelCase boundaries: "AppendToCustomerGroup" -> ["Append", "To", "Customer", "Group"]
  const parts = raw.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2").split(" ");
  if (parts.length <= 1) return raw;
  // Known action words
  const actions = new Set(["Read","Write","Create","Delete","Append","Assign","Share","Import","Export","Publish","Bulk","Execute","Act"]);
  // Find where the action ends and the entity begins
  let actionEnd = 1;
  for (let i = 1; i < parts.length; i++) {
    if (actions.has(parts[i]) || parts[i] === "To" || parts[i] === "On" || parts[i] === "All") {
      actionEnd = i + 1;
    } else break;
  }
  const action = parts.slice(0, actionEnd).join(" ");
  const entity = parts.slice(actionEnd).join("");
  if (!entity) return action;
  return action + " · " + entity;
}

export default function SecurityAudit({ bp, orgInfo }) {
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all"); // all, custom, managed, sensitive
  const [selRole, setSelRole] = useState(null);
  const [privileges, setPrivileges] = useState([]);
  const [userCount, setUserCount] = useState(null);
  const [loadingPriv, setLoadingPriv] = useState(false);
  const [loadingCount, setLoadingCount] = useState(false);
  const [privFilter, setPrivFilter] = useState("all"); // all, org, sensitive
  const [feedback, setFeedback] = useState("");
  const selectGen = useRef(0);

  // Load all roles on mount
  useEffect(() => {
    let cancelled = false;
    bridge.getAllRoles().then(data => {
      if (cancelled) return;
      setRoles(data || []);
      setLoading(false);
    }).catch(e => { if (!cancelled) { setError(e.message); setLoading(false); } });
    return () => { cancelled = true; };
  }, []);

  // Load privileges when role is selected — progressive (privileges first, user count in parallel)
  const handleSelect = async (role) => {
    const gen = ++selectGen.current;
    setSelRole(role);
    setLoadingPriv(true);
    setLoadingCount(true);
    setPrivileges([]);
    setUserCount(null);
    setPrivFilter("all");
    setError("");

    // Load privileges (usually the slower one)
    bridge.getRolePrivileges(role.id).then(privs => {
      if (selectGen.current !== gen) return;
      setPrivileges(privs || []);
      setLoadingPriv(false);
    }).catch(e => {
      if (selectGen.current === gen) { setError(e.message); setLoadingPriv(false); }
    });

    // Load user count in parallel (independent)
    bridge.getRoleUserCount(role.id).then(uc => {
      if (selectGen.current !== gen) return;
      setUserCount(uc?.count ?? 0);
      setLoadingCount(false);
    }).catch(() => {
      if (selectGen.current === gen) { setUserCount(null); setLoadingCount(false); }
    });
  };

  // Stats for selected role
  const privStats = useMemo(() => {
    const org = privileges.filter(p => p.isOrg).length;
    const sensitive = privileges.filter(p => SENSITIVE_PRIVS.has(p.name?.toLowerCase())).length;
    const sensOrg = privileges.filter(p => p.isOrg && SENSITIVE_PRIVS.has(p.name?.toLowerCase())).length;
    return { total: privileges.length, org, sensitive, sensOrg };
  }, [privileges]);

  // Filtered privileges
  const filteredPrivs = useMemo(() => {
    let list = privileges;
    if (privFilter === "org") list = list.filter(p => p.isOrg);
    if (privFilter === "sensitive") list = list.filter(p => SENSITIVE_PRIVS.has(p.name?.toLowerCase()));
    return list;
  }, [privileges, privFilter]);

  // Filtered roles
  const filteredRoles = useMemo(() => {
    let list = roles;
    if (filter === "custom") list = list.filter(r => r.isCustom);
    if (filter === "managed") list = list.filter(r => r.isManaged);
    if (search) {
      const s = search.toLowerCase();
      list = list.filter(r => r.name.toLowerCase().includes(s));
    }
    return list;
  }, [roles, filter, search]);

  const isSensitive = (name) => SENSITIVE_PRIVS.has(name?.toLowerCase());

  const exportCSV = () => {
    if (!selRole || !privileges.length) return;
    const safe = (v) => /^[=+\-@\t\r]/.test(v) ? "'" + v : v;
    const esc = (v) => { const s = safe(String(v || "")); return s.includes(",") || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s; };
    const headers = ["privilege", "label", "depth", "depthLabel", "isOrg", "isSensitive"];
    const rows = privileges.map(p => [p.name, formatPrivName(p.name), p.depth, p.depthLabel, p.isOrg ? "Yes" : "No", isSensitive(p.name) ? "Yes" : "No"].map(esc).join(","));
    const csv = "\uFEFF" + headers.join(",") + "\n" + rows.join("\n");
    dl(csv, "text/csv;charset=utf-8", `security_role_${selRole.name.replace(/\s+/g, "_")}.csv`);
    setFeedback(`CSV downloaded (${privileges.length} privileges)`);
    setTimeout(() => setFeedback(""), 2000);
  };

  const Badge = ({ label, color }) => (
    <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 4, background: (color || C.txd) + "22", color: color || C.txd, fontWeight: 600 }}>{label}</span>
  );

  return (
    <div style={{ display: "flex", height: "100%" }}>
      {/* Left panel — role list */}
      <div style={{ width: bp.mobile ? "100%" : 300, borderRight: `1px solid ${C.bd}`, display: "flex", flexDirection: "column", flexShrink: 0 }}>
        <div style={{ padding: "12px 10px", borderBottom: `1px solid ${C.bd}` }}>
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
            {t("nav.security")} <Tooltip text={t("security.tooltip")} />
          </div>
          <input placeholder={t("security.search")} value={search} onChange={e => setSearch(e.target.value)} style={inp({ fontSize: 13, marginBottom: 6 })} />
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {[["all", t("licenses.all")], ["custom", "Custom"], ["managed", "Managed"]].map(([k, label]) => (
              <button key={k} onClick={() => setFilter(k)} style={{ padding: "2px 8px", borderRadius: 4, fontSize: 11, border: `1px solid ${filter === k ? C.cy : C.bd}`, background: filter === k ? C.cy + "22" : "transparent", color: filter === k ? C.cy : C.txd, cursor: "pointer" }}>{label}</button>
            ))}
          </div>
          {!loading && <div style={{ fontSize: 11, color: C.txd, marginTop: 6, ...mono }}>{filteredRoles.length} roles ({roles.filter(r => r.isCustom).length} custom)</div>}
        </div>
        <div style={{ flex: 1, overflow: "auto", padding: "4px 6px" }}>
          {loading && <div style={{ textAlign: "center", padding: 20 }}><Spin /> Loading roles...</div>}
          {error && !loading && !selRole && <div style={{ padding: 10, color: C.rd, fontSize: 12 }}>{error}</div>}
          {filteredRoles.map(r => (
            <button key={r.id} onClick={() => handleSelect(r)} style={{ width: "100%", textAlign: "left", padding: "6px 8px", border: "none", borderRadius: 6, cursor: "pointer", marginBottom: 1, background: selRole?.id === r.id ? C.sfa : "transparent", color: selRole?.id === r.id ? C.tx : C.txm, fontSize: 13 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 4 }}>
                <span style={{ fontWeight: selRole?.id === r.id ? 600 : 400, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name}</span>
                <Badge label={r.isCustom ? "Custom" : "Managed"} color={r.isCustom ? C.or : C.txd} />
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Right panel — role detail */}
      <div style={{ flex: 1, overflow: "auto", padding: 20 }}>
        {!selRole && <div style={{ textAlign: "center", color: C.txd, marginTop: 60 }}>{t("security.select_role")}</div>}
        {selRole && (
          <div>
            {/* Role header */}
            <div style={{ ...crd({ padding: "16px 20px", marginBottom: 16 }) }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>{selRole.name}</div>
                  <div style={{ display: "flex", gap: 8, marginBottom: 8, alignItems: "center" }}>
                    <Badge label={selRole.isCustom ? "Custom" : "Managed"} color={selRole.isCustom ? C.or : C.txd} />
                    {loadingCount ? <Spin s={10} /> : userCount != null && <Badge label={`${userCount} user${userCount !== 1 ? "s" : ""}`} color={C.vi} />}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button onClick={exportCSV} disabled={loadingPriv} style={bt(C.cy, { fontSize: 11, padding: "4px 10px", opacity: loadingPriv ? 0.5 : 1 })}><I.Download /> CSV</button>
                </div>
              </div>
              {feedback && <span style={{ fontSize: 11, color: C.gn }}>{feedback}</span>}
              {error && selRole && <div style={{ fontSize: 11, color: C.rd, marginTop: 4 }}>{error}</div>}

              {/* Stats — show as soon as privileges arrive */}
              {privileges.length > 0 && (
                <div style={{ display: "flex", gap: 16, marginTop: 8, fontSize: 12, flexWrap: "wrap" }}>
                  <span style={{ color: C.txm }}>{privStats.total} privileges {loadingPriv && <Spin s={10} />}</span>
                  <span style={{ color: C.rd, fontWeight: 600 }}>{privStats.org} Org-level</span>
                  <span style={{ color: C.yw, fontWeight: 600 }}>{privStats.sensitive} sensitive</span>
                  {privStats.sensOrg > 0 && <span style={{ color: C.rd, fontWeight: 700, background: C.rd + "22", padding: "1px 8px", borderRadius: 4 }}>⚠ {privStats.sensOrg} sensitive at Org level</span>}
                </div>
              )}
            </div>

            {/* Privilege filters */}
            <div style={{ display: "flex", gap: 4, marginBottom: 12, flexWrap: "wrap" }}>
              {[["all", `All (${privStats.total})`], ["org", `Org-level (${privStats.org})`], ["sensitive", `Sensitive (${privStats.sensitive})`]].map(([k, label]) => (
                <button key={k} onClick={() => setPrivFilter(k)} style={{ padding: "3px 10px", borderRadius: 4, fontSize: 11, border: `1px solid ${privFilter === k ? (k === "org" ? C.rd : k === "sensitive" ? C.yw : C.cy) : C.bd}`, background: privFilter === k ? (k === "org" ? C.rd : k === "sensitive" ? C.yw : C.cy) + "22" : "transparent", color: privFilter === k ? (k === "org" ? C.rd : k === "sensitive" ? C.yw : C.cy) : C.txd, cursor: "pointer", fontWeight: privFilter === k ? 600 : 400 }}>{label}</button>
              ))}
            </div>

            {/* Privileges list — progressive: show as data arrives */}
            {loadingPriv && privileges.length === 0 && <div style={{ textAlign: "center", marginTop: 20 }}><Spin s={16} /> Loading privileges...</div>}
            {privileges.length > 0 && (
              <div style={{ ...crd({ padding: 0, overflow: "hidden" }) }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 130px 80px", padding: "8px 14px", background: C.sfh, fontSize: 11, fontWeight: 700, color: C.txd, borderBottom: `1px solid ${C.bd}` }}>
                  <span>Privilege</span>
                  <span>Label</span>
                  <span>Depth</span>
                  <span>Flags</span>
                </div>
                <div style={{ maxHeight: 500, overflow: "auto" }}>
                  {filteredPrivs.length === 0 && <div style={{ padding: 14, color: C.txd, fontSize: 12 }}>No privileges match this filter</div>}
                  {filteredPrivs.map((p, i) => {
                    const sens = isSensitive(p.name);
                    return (
                      <div key={p.id || i} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 130px 80px", padding: "5px 14px", fontSize: 12, borderBottom: `1px solid ${C.bd}22`, background: sens && p.isOrg ? C.rd + "08" : "transparent", alignItems: "center" }}>
                        <span style={{ ...mono, color: C.txd, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 10 }}>{p.name}</span>
                        <span style={{ color: sens ? C.yw : C.txm, fontWeight: sens ? 600 : 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{formatPrivName(p.name)}</span>
                        <span><Badge label={p.depthLabel} color={DEPTH_COLORS[p.depth]} /></span>
                        <div style={{ display: "flex", gap: 3 }}>
                          {p.isOrg && <span style={{ fontSize: 9, padding: "1px 4px", borderRadius: 3, background: C.rd + "33", color: C.rd, fontWeight: 700 }}>ORG</span>}
                          {sens && <span style={{ fontSize: 9, padding: "1px 4px", borderRadius: 3, background: C.yw + "33", color: C.yw, fontWeight: 700 }}>⚠</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
