import { useState, useEffect, useRef, useMemo } from "react";
import { bridge } from "../d365-bridge.js";
import { C, I, Spin, mono, inp, bt, crd, dl, copyText } from "../shared.jsx";
import Tooltip from "./Tooltip.jsx";
import { t } from "../i18n.js";

const ACCESS_COLORS = { 0: C.gn, 1: C.vi, 2: C.cy, 3: C.yw, 4: C.txd, 5: C.or };

export default function UserLicenseMonitor({ bp, orgInfo }) {
  const isLive = orgInfo?.isExtension;
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("name");
  const [selUser, setSelUser] = useState(null);
  const [roles, setRoles] = useState([]);
  const [lastLogin, setLastLogin] = useState(undefined);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [feedback, setFeedback] = useState("");
  const selectGen = useRef(0);

  // Load all users on mount
  useEffect(() => {
    let cancelled = false;
    bridge.getAllUsers().then(data => {
      if (cancelled) return;
      setUsers(data || []);
      setLoading(false);
    }).catch(e => { if (!cancelled) { setError(e.message); setLoading(false); } });
    return () => { cancelled = true; };
  }, []);

  // Load details when user is selected
  const handleSelect = async (user) => {
    const gen = ++selectGen.current;
    setSelUser(user);
    setLoadingDetail(true);
    setRoles([]);
    setLastLogin(undefined);
    try {
      const [r, ll] = await Promise.all([
        bridge.getUserRoles(user.id),
        bridge.getUserLastLogin(user.id),
      ]);
      if (selectGen.current !== gen) return;
      setRoles(r || []);
      setLastLogin(ll);
    } catch (e) {
      if (selectGen.current === gen) setError(e.message);
    } finally {
      if (selectGen.current === gen) setLoadingDetail(false);
    }
  };

  // Stats
  const stats = useMemo(() => {
    const active = users.filter(u => !u.disabled).length;
    const disabled = users.filter(u => u.disabled).length;
    const byAccess = {};
    const byCal = {};
    users.forEach(u => {
      byAccess[u.accessModeLabel] = (byAccess[u.accessModeLabel] || 0) + 1;
      byCal[u.calTypeLabel] = (byCal[u.calTypeLabel] || 0) + 1;
    });
    return { total: users.length, active, disabled, byAccess, byCal };
  }, [users]);

  // Filter + search + sort
  const filtered = useMemo(() => {
    let list = users;
    if (filter === "active") list = list.filter(u => !u.disabled);
    if (filter === "disabled") list = list.filter(u => u.disabled);
    if (filter === "non-interactive") list = list.filter(u => u.accessMode === 4);
    if (search) {
      const s = search.toLowerCase();
      list = list.filter(u => u.fullname.toLowerCase().includes(s) || u.email.toLowerCase().includes(s) || u.buName.toLowerCase().includes(s));
    }
    list = [...list].sort((a, b) => {
      if (sortBy === "name") return a.fullname.localeCompare(b.fullname);
      if (sortBy === "status") return (a.disabled ? 1 : 0) - (b.disabled ? 1 : 0);
      if (sortBy === "cal") return a.calTypeLabel.localeCompare(b.calTypeLabel);
      if (sortBy === "access") return a.accessModeLabel.localeCompare(b.accessModeLabel);
      return 0;
    });
    return list;
  }, [users, filter, search, sortBy]);

  const daysAgo = (dateStr) => {
    if (!dateStr) return null;
    return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
  };

  const exportCSV = () => {
    const safe = (v) => /^[=+\-@\t\r]/.test(v) ? "'" + v : v;
    const esc = (v) => { const s = safe(String(v || "")); return s.includes(",") || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s; };
    const headers = ["fullname", "email", "disabled", "accessMode", "calType", "businessUnit", "title", "createdOn"];
    const rows = users.map(u => [u.fullname, u.email, u.disabled ? "Yes" : "No", u.accessModeLabel, u.calTypeLabel, u.buName, u.title, u.createdOn].map(esc).join(","));
    const csv = "\uFEFF" + headers.join(",") + "\n" + rows.join("\n");
    dl(csv, "text/csv;charset=utf-8", "d365_users_licenses.csv");
    setFeedback(`CSV downloaded (${users.length} users)`);
    setTimeout(() => setFeedback(""), 2000);
  };

  const Badge = ({ label, color }) => (
    <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 4, background: (color || C.txd) + "22", color: color || C.txd, fontWeight: 600 }}>{label}</span>
  );

  return (
    <div style={{ display: "flex", height: "100%" }}>
      {/* Left panel */}
      <div style={{ width: bp.mobile ? "100%" : 320, borderRight: `1px solid ${C.bd}`, display: "flex", flexDirection: "column", flexShrink: 0 }}>
        <div style={{ padding: "12px 10px", borderBottom: `1px solid ${C.bd}` }}>
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
            {t("nav.licenses")} <Tooltip text="Monitor all D365 users, their access modes, CAL types, security roles, and last login dates. Identify unused licenses." />
          </div>
          <input placeholder="Search users..." value={search} onChange={e => setSearch(e.target.value)} style={inp({ fontSize: 13, marginBottom: 6 })} />
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 6 }}>
            {[["all", t("licenses.all")], ["active", t("licenses.active")], ["disabled", t("licenses.disabled")], ["non-interactive", "Non-Interactive"]].map(([k, label]) => (
              <button key={k} onClick={() => setFilter(k)} style={{ padding: "2px 8px", borderRadius: 4, fontSize: 11, border: `1px solid ${filter === k ? C.cy : C.bd}`, background: filter === k ? C.cy + "22" : "transparent", color: filter === k ? C.cy : C.txd, cursor: "pointer" }}>{label}</button>
            ))}
          </div>
          <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
            <span style={{ fontSize: 11, color: C.txd }}>Sort:</span>
            {[["name", "Name"], ["status", "Status"], ["cal", "CAL"], ["access", "Access"]].map(([k, label]) => (
              <button key={k} onClick={() => setSortBy(k)} style={{ padding: "1px 6px", borderRadius: 3, fontSize: 10, border: "none", background: sortBy === k ? C.vi + "33" : "transparent", color: sortBy === k ? C.vi : C.txd, cursor: "pointer" }}>{label}</button>
            ))}
          </div>
          {!loading && <div style={{ fontSize: 11, color: C.txd, marginTop: 6, ...mono }}>{stats.active} active · {stats.disabled} disabled · {filtered.length} shown</div>}
        </div>
        <div style={{ flex: 1, overflow: "auto", padding: "4px 6px" }}>
          {loading && <div style={{ textAlign: "center", padding: 20 }}><Spin /> {t("licenses.loading")}</div>}
          {error && <div style={{ padding: 10, color: C.rd, fontSize: 12 }}>{error}</div>}
          {filtered.map(u => (
            <button key={u.id} onClick={() => handleSelect(u)} style={{ width: "100%", textAlign: "left", padding: "6px 8px", border: "none", borderRadius: 6, cursor: "pointer", marginBottom: 1, background: selUser?.id === u.id ? C.sfa : "transparent", color: selUser?.id === u.id ? C.tx : C.txm, fontSize: 13 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 4 }}>
                <span style={{ fontWeight: selUser?.id === u.id ? 600 : 400, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.fullname}</span>
                <div style={{ display: "flex", gap: 3, flexShrink: 0 }}>
                  <Badge label={u.calTypeLabel} color={C.cy} />
                  {u.disabled && <Badge label="Disabled" color={C.rd} />}
                </div>
              </div>
              <div style={{ fontSize: 11, color: C.txd, ...mono, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.email}</div>
            </button>
          ))}
        </div>
        <div style={{ padding: "8px 10px", borderTop: `1px solid ${C.bd}`, display: "flex", gap: 6, alignItems: "center" }}>
          <button onClick={exportCSV} style={bt(C.cy, { fontSize: 11, padding: "4px 10px" })}><I.Download /> {t("licenses.export_csv")}</button>
          {feedback && <span style={{ fontSize: 11, color: C.gn }}>{feedback}</span>}
        </div>
      </div>

      {/* Right panel */}
      <div style={{ flex: 1, overflow: "auto", padding: 20 }}>
        {!selUser && <div style={{ textAlign: "center", color: C.txd, marginTop: 60 }}>{t("licenses.select_user")}</div>}
        {selUser && (
          <div>
            {/* User card */}
            <div style={{ ...crd({ padding: "16px 20px", marginBottom: 16 }) }}>
              <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>{selUser.fullname}</div>
              <div style={{ fontSize: 13, color: C.txd, ...mono, marginBottom: 8 }}>{selUser.email}</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
                <Badge label={selUser.disabled ? "Disabled" : "Active"} color={selUser.disabled ? C.rd : C.gn} />
                <Badge label={selUser.accessModeLabel} color={ACCESS_COLORS[selUser.accessMode] || C.txd} />
                <Badge label={selUser.calTypeLabel} color={C.cy} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 16px", fontSize: 13 }}>
                <div><span style={{ color: C.txd }}>{t("licenses.bu")}:</span> <span style={{ fontWeight: 500 }}>{selUser.buName || "—"}</span></div>
                <div><span style={{ color: C.txd }}>Title:</span> <span style={{ fontWeight: 500 }}>{selUser.title || "—"}</span></div>
                <div><span style={{ color: C.txd }}>{t("licenses.access_mode")}:</span> <span style={{ fontWeight: 500 }}>{selUser.accessModeLabel}</span></div>
                <div><span style={{ color: C.txd }}>{t("licenses.cal_type")}:</span> <span style={{ fontWeight: 500 }}>{selUser.calTypeLabel}</span></div>
                <div><span style={{ color: C.txd }}>{t("licenses.created")}:</span> <span style={{ fontWeight: 500, ...mono }}>{selUser.createdOn ? new Date(selUser.createdOn).toLocaleDateString() : "—"}</span></div>
                <div>
                  <span style={{ color: C.txd }}>{t("licenses.last_login")}:</span>{" "}
                  {loadingDetail ? <Spin s={10} /> :
                    lastLogin?.date ? (
                      <span style={{ fontWeight: 500, ...mono }}>
                        {new Date(lastLogin.date).toLocaleDateString()} <span style={{ color: C.txd }}>({daysAgo(lastLogin.date)} {t("licenses.days_ago")})</span>
                      </span>
                    ) : <span style={{ color: C.rd, fontWeight: 500 }}>{t("licenses.never")}</span>
                  }
                </div>
              </div>
            </div>

            {/* Security Roles */}
            <div style={{ ...crd({ padding: "12px 16px", marginBottom: 16 }) }}>
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
                <span>🛡</span> {t("licenses.roles")} {!loadingDetail && <span style={{ fontSize: 12, color: C.txd, fontWeight: 400 }}>({roles.length})</span>}
              </div>
              {loadingDetail && <Spin s={14} />}
              {!loadingDetail && roles.length === 0 && <div style={{ fontSize: 12, color: C.txd }}>No security roles assigned</div>}
              {!loadingDetail && roles.map(r => (
                <div key={r.id} style={{ padding: "3px 0", fontSize: 12, color: C.txm, borderBottom: `1px solid ${C.bd}22`, ...mono }}>{r.name}</div>
              ))}
            </div>

            {/* Stats breakdown */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div style={{ ...crd({ padding: "12px 16px" }) }}>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>{t("licenses.access_mode")} Breakdown</div>
                {Object.entries(stats.byAccess).sort((a, b) => b[1] - a[1]).map(([label, count]) => (
                  <div key={label} style={{ display: "flex", justifyContent: "space-between", padding: "2px 0", fontSize: 12 }}>
                    <span style={{ color: C.txm }}>{label}</span>
                    <span style={{ fontWeight: 600, ...mono }}>{count}</span>
                  </div>
                ))}
              </div>
              <div style={{ ...crd({ padding: "12px 16px" }) }}>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>{t("licenses.cal_type")} Breakdown</div>
                {Object.entries(stats.byCal).sort((a, b) => b[1] - a[1]).map(([label, count]) => (
                  <div key={label} style={{ display: "flex", justifyContent: "space-between", padding: "2px 0", fontSize: 12 }}>
                    <span style={{ color: C.txm }}>{label}</span>
                    <span style={{ fontWeight: 600, ...mono }}>{count}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
