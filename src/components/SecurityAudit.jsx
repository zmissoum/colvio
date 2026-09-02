import { useState, useEffect, useRef, useMemo } from "react";
import { bridge } from "../d365-bridge.js";
import { C, I, Spin, mono, inp, bt, crd, exportTable, confirmProd } from "../shared.jsx";
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
// Cap the member list fetch — a baseline role can be held by tens of thousands of users; paging all
// of them is slow and timeout-prone. We load the first N (the count badge still shows the true total).
const USERS_CAP = 10000;

// The 8 access rights, in the same column order the make.powerapps role editor uses.
const OPS = ["Create", "Read", "Write", "Delete", "Append", "AppendTo", "Assign", "Share"];
const DEPTH_LABEL = { 0: "None", 1: "User", 2: "Business Unit", 4: "Parent: Child BU", 8: "Organization" };
const DEPTH_FRAC = { 0: 0, 1: 0.25, 2: 0.5, 4: 0.75, 8: 1 };

// The make.powerapps depth circle: empty ring = None, then a pie filled ¼/½/¾/full for
// User/BU/Parent-Child/Org, coloured by depth (green→red) so breadth of access reads at a glance.
function DepthPie({ depth }) {
  const frac = DEPTH_FRAC[depth] ?? 0;
  const color = DEPTH_COLORS[depth] || C.txd;
  const r = 6, cx = 8, cy = 8;
  let slice = "";
  if (frac > 0 && frac < 1) {
    const a = 2 * Math.PI * frac - Math.PI / 2;
    const x = cx + r * Math.cos(a), y = cy + r * Math.sin(a);
    slice = `M ${cx} ${cy} L ${cx} ${cy - r} A ${r} ${r} 0 ${frac > 0.5 ? 1 : 0} 1 ${x} ${y} Z`;
  }
  return (
    <svg width="16" height="16" style={{ display: "block" }}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={depth ? color : C.bd} strokeWidth="1.5" />
      {frac >= 1 && <circle cx={cx} cy={cy} r={r} fill={color} />}
      {slice && <path d={slice} fill={color} />}
    </svg>
  );
}

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

export default function SecurityAudit({ bp, orgInfo, theme }) {
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
  const [detailTab, setDetailTab] = useState("privileges"); // privileges | users
  const [users, setUsers] = useState(null);          // lazy — loaded when the Users tab opens
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [usersErr, setUsersErr] = useState("");      // distinct from "genuinely empty"
  const [userSearch, setUserSearch] = useState("");
  const [userStatus, setUserStatus] = useState("all"); // all | enabled | disabled
  const [selUsers, setSelUsers] = useState(new Set()); // members ticked for role removal
  const [assignOpen, setAssignOpen] = useState(false); // "assign users" paste panel
  const [assignText, setAssignText] = useState("");
  const [assignBusy, setAssignBusy] = useState(false);
  const [assignReport, setAssignReport] = useState(null); // [{label, ok, msg}]
  const [teams, setTeams] = useState(null);            // lazy — loaded when the Teams tab opens
  const [loadingTeams, setLoadingTeams] = useState(false);
  const [teamsErr, setTeamsErr] = useState("");
  const [teamCount, setTeamCount] = useState(null);
  // Org-wide cross-role view: "which roles can <operation> which entities, at which depth?" —
  // answered across EVERY role at once instead of opening them one by one.
  const [orgView, setOrgView] = useState(false);
  const [orgOp, setOrgOp] = useState("Delete");        // audited operation (Delete is the classic ask)
  const [orgDepthMin, setOrgDepthMin] = useState(8);   // 8 = Organization only (default) … 1 = any granted
  const [orgSearch, setOrgSearch] = useState("");
  const [orgGroup, setOrgGroup] = useState("role");    // role | entity
  const [orgScan, setOrgScan] = useState(null);        // {done,total} while scanning
  const [orgFailed, setOrgFailed] = useState([]);      // role names whose privilege fetch failed — view is incomplete
  const [, setOrgScanned] = useState(0);               // bump-only: re-render as the cache fills
  const orgCache = useRef(new Map());                  // roleId -> entities[] from getRolePrivilegeMatrix
  const orgGen = useRef(0);
  // Stop an in-flight org scan when the module unmounts (tab switch) — otherwise the orphaned
  // workers keep hammering the API to completion into a dead cache, and coming back starts a
  // SECOND full scan alongside them (doubling the intended concurrency).
  useEffect(() => () => { orgGen.current++; }, []);
  const [privView, setPrivView] = useState("list");   // list | matrix (make.powerapps-style grid)
  const [matrix, setMatrix] = useState(null);          // { entities:[{entity,ops}], misc:[{name,depth}] }
  const [loadingMatrix, setLoadingMatrix] = useState(false);
  const [matrixErr, setMatrixErr] = useState("");
  const [matrixSearch, setMatrixSearch] = useState("");
  const [showAllTables, setShowAllTables] = useState(false); // include tables the role can't touch
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
    orgGen.current++; setOrgScan(null); setOrgView(false); // picking a role leaves the org-wide view (and stops its scan)
    setSelRole(role);
    setLoadingPriv(true);
    setLoadingCount(true);
    setPrivileges([]);
    setUserCount(null);
    setPrivFilter("all");
    setDetailTab("privileges");
    setUsers(null);
    setUsersErr("");
    setUserSearch("");
    setSelUsers(new Set());
    setAssignOpen(false);
    setAssignText("");
    setAssignReport(null);
    setTeams(null);
    setTeamsErr("");
    setTeamCount(null);
    setPrivView("list");
    setMatrix(null);
    setMatrixErr("");
    setMatrixSearch("");
    setError("");

    // Load privileges (usually the slower one)
    bridge.getRolePrivileges(role.id).then(privs => {
      if (selectGen.current !== gen) return;
      setPrivileges(privs || []);
      setLoadingPriv(false);
    }).catch(e => {
      if (selectGen.current === gen) { setError(e.message); setLoadingPriv(false); }
    });

    // Load user count in parallel (independent). By role NAME — one any() lambda query over
    // systemusers spans every business-unit copy of the role (they all share the name).
    bridge.getRoleUserCount(role.name).then(uc => {
      if (selectGen.current !== gen) return;
      setUserCount(uc?.count ?? 0);
      setLoadingCount(false);
    }).catch(() => {
      if (selectGen.current === gen) { setUserCount(null); setLoadingCount(false); }
    });

    // Team count in parallel too — a role can be held by teams only (users inherit via membership),
    // in which case Users shows 0 and THIS badge is the real signal.
    bridge.getRoleTeamCount(role.name).then(tc => {
      if (selectGen.current === gen) setTeamCount(tc?.count ?? 0);
    }).catch(() => {
      if (selectGen.current === gen) setTeamCount(null);
    });
  };

  // The full CRUD matrix is loaded lazily — only when the Matrix view is first opened for a role.
  const openMatrix = () => {
    setPrivView("matrix");
    if (matrix !== null || loadingMatrix || !selRole) return;
    const gen = selectGen.current;
    setLoadingMatrix(true); setMatrixErr("");
    bridge.getRolePrivilegeMatrix(selRole.id).then(m => {
      if (selectGen.current !== gen) return;
      setMatrix(m || { entities: [], misc: [] }); setLoadingMatrix(false);
    }).catch(e => {
      if (selectGen.current === gen) { setMatrixErr(e.message || String(e)); setLoadingMatrix(false); }
    });
  };

  const anyGrant = (ops) => OPS.some(op => (ops?.[op] || 0) > 0);
  const matrixRows = useMemo(() => {
    if (!matrix) return [];
    const s = matrixSearch.trim().toLowerCase();
    return matrix.entities.filter(r =>
      (showAllTables || anyGrant(r.ops)) && (!s || r.entity.toLowerCase().includes(s))
    );
  }, [matrix, matrixSearch, showAllTables]);

  // Export the FULL grid (every table × the 8 rights, as depth labels) + a Miscellaneous section —
  // the complete picture you'd otherwise read cell-by-cell in the make.powerapps role editor.
  const exportMatrix = (format = "csv") => {
    if (!matrix || !selRole) return;
    const headers = ["table", ...OPS];
    const rows = matrix.entities.map(r => [r.entity, ...OPS.map(op => DEPTH_LABEL[r.ops[op] || 0])]);
    // Append the task-based (miscellaneous) privileges below, one per row, with their granted depth.
    const grantedMisc = (matrix.misc || []).filter(m => m.depth > 0);
    if (grantedMisc.length) {
      rows.push(Array(headers.length).fill(""));
      rows.push(["— Miscellaneous privileges —", ...Array(OPS.length).fill("")]);
      grantedMisc.forEach(m => rows.push([m.name, DEPTH_LABEL[m.depth] || `Depth ${m.depth}`, ...Array(OPS.length - 1).fill("")]));
    }
    exportTable(headers, rows, `security_role_${selRole.name.replace(/\s+/g, "_")}_matrix`, format, "Matrix");
    setFeedback(`${format === "xlsx" ? "Excel" : "CSV"} downloaded (${matrix.entities.length} tables)`);
    setTimeout(() => setFeedback(""), 2000);
  };

  // Teams holding the role — lazy, loaded the first time the Teams tab opens.
  const openTeamsTab = () => {
    setDetailTab("teams");
    if (teams !== null || loadingTeams || !selRole) return;
    const gen = selectGen.current;
    setLoadingTeams(true); setTeamsErr("");
    bridge.getRoleTeams(selRole.name).then(list => {
      if (selectGen.current !== gen) return;
      setTeams(list || []); setLoadingTeams(false);
    }).catch(e => {
      if (selectGen.current === gen) { setTeamsErr(e.message || "Failed to load teams"); setTeams(null); setLoadingTeams(false); }
    });
  };

  const exportTeamsCSV = (format = "csv") => {
    if (!selRole || !teams?.length) return;
    const headers = ["name", "type", "businessUnit", "administrator", "members", "description"];
    const rows = teams.map(tm => [tm.name, tm.type, tm.bu, tm.admin, tm.memberCount ?? "", tm.description]);
    exportTable(headers, rows, `security_role_${selRole.name.replace(/\s+/g, "_")}_teams`, format, "Teams");
    setFeedback(`${format === "xlsx" ? "Excel" : "CSV"} downloaded (${teams.length} teams)`);
    setTimeout(() => setFeedback(""), 2000);
  };

  // Re-fetch the member list + count after an assign/remove so the tab reflects reality.
  const reloadMembers = () => {
    if (!selRole) return;
    const gen = selectGen.current;
    setLoadingUsers(true); setUsersErr(""); setSelUsers(new Set());
    bridge.getRoleUsers(selRole.name, USERS_CAP).then(list => {
      if (selectGen.current === gen) { setUsers(list || []); setLoadingUsers(false); }
    }).catch(e => { if (selectGen.current === gen) { setUsersErr(e.message || "Failed to load users"); setLoadingUsers(false); } });
    bridge.getRoleUserCount(selRole.name).then(uc => { if (selectGen.current === gen) setUserCount(uc?.count ?? 0); }).catch(() => {});
  };

  // Bulk-ASSIGN the selected role: paste emails (or domain logins), Colvio resolves them to users,
  // then associates each user with the role copy from THEIR business unit (done in the content
  // script — associating another BU's copy is the classic failure of naive bulk scripts).
  const runAssign = async () => {
    const tokens = [...new Set(assignText.split(/[\s,;]+/).map(t => t.trim()).filter(Boolean))];
    if (!tokens.length || !selRole) return;
    const gen = selectGen.current; // captured at START — if the user switches role mid-flight, don't touch the new role's view
    setAssignBusy(true); setAssignReport(null);
    try {
      const byToken = new Map(); // lower(email|domain) -> user
      for (let i = 0; i < tokens.length; i += 15) {
        const chunk = tokens.slice(i, i + 15);
        const f = chunk.map(t => { const e = t.replace(/'/g, "''"); return `(internalemailaddress eq '${e}' or domainname eq '${e}')`; }).join(" or ");
        const d = await bridge.query("systemusers", { select: "systemuserid,fullname,internalemailaddress,domainname", filter: f });
        (d?.records || []).forEach(u => {
          if (u.internalemailaddress) byToken.set(String(u.internalemailaddress).toLowerCase(), u);
          if (u.domainname) byToken.set(String(u.domainname).toLowerCase(), u);
        });
      }
      const report = []; const matched = []; const seen = new Set();
      for (const t of tokens) {
        const u = byToken.get(t.toLowerCase());
        if (!u) { report.push({ label: t, ok: false, msg: "no user found with this email / login" }); continue; }
        if (!seen.has(u.systemuserid)) { seen.add(u.systemuserid); matched.push(u); }
      }
      if (matched.length && confirmProd(orgInfo?.isProduction, `Assign the role "${selRole.name}" to ${matched.length} user${matched.length > 1 ? "s" : ""}.`)) {
        const res = await bridge.assignRoleUsers(selRole.name, matched.map(u => u.systemuserid), "assign");
        (res || []).forEach(r => {
          const u = matched.find(m => String(m.systemuserid).toLowerCase() === String(r.id).toLowerCase());
          report.push({ label: u?.fullname || r.id, ok: !!r.ok, msg: r.error || r.note || "assigned" });
        });
        if (selectGen.current === gen) reloadMembers();
      }
      if (selectGen.current === gen) setAssignReport(report);
    } catch (e) { if (selectGen.current === gen) setAssignReport([{ label: "Error", ok: false, msg: e.message || String(e) }]); }
    setAssignBusy(false);
  };

  // Bulk-REMOVE the role from the ticked members. Direct assignments only — a role inherited
  // through a team is managed on the team, not here.
  const runRemove = async () => {
    if (!selUsers.size || !selRole) return;
    if (!confirmProd(orgInfo?.isProduction, `Remove the role "${selRole.name}" from ${selUsers.size} user${selUsers.size > 1 ? "s" : ""}.`)) return;
    const gen = selectGen.current; // captured at START — a mid-flight role switch must not repaint the new role's view
    setAssignBusy(true);
    try {
      const res = await bridge.assignRoleUsers(selRole.name, [...selUsers], "remove");
      if (selectGen.current === gen) {
        setAssignReport((res || []).map(r => {
          const u = (users || []).find(x => String(x.id).toLowerCase() === String(r.id).toLowerCase());
          return { label: u?.name || r.id, ok: !!r.ok, msg: r.error || r.note || "removed" };
        }));
        reloadMembers();
      }
    } catch (e) { if (selectGen.current === gen) setAssignReport([{ label: "Error", ok: false, msg: e.message || String(e) }]); }
    setAssignBusy(false);
  };

  // The full user list is loaded lazily — only when the Users tab is first opened — so clicking
  // through roles stays snappy (we already have the count for the badge).
  const openUsersTab = () => {
    setDetailTab("users");
    if (users !== null || loadingUsers || !selRole) return;
    const gen = selectGen.current;
    setLoadingUsers(true);
    setUsersErr("");
    bridge.getRoleUsers(selRole.name, USERS_CAP).then(list => {
      if (selectGen.current !== gen) return;
      setUsers(list || []); setLoadingUsers(false);
    }).catch(e => {
      // Leave users null (not []) so a Retry re-fetches; show the error instead of "no members".
      if (selectGen.current === gen) { setUsersErr(e.message || "Failed to load users"); setUsers(null); setLoadingUsers(false); }
    });
  };

  const passStatus = (u) => userStatus === "all" || (userStatus === "enabled" ? !u.disabled : !!u.disabled);
  const shownUsers = useMemo(() => {
    if (!users) return [];
    const s = userSearch.trim().toLowerCase();
    return users.filter(u => passStatus(u) && (!s || [u.name, u.email, u.bu, u.domain].some(v => (v || "").toLowerCase().includes(s))));
     
  }, [users, userSearch, userStatus]);

  const exportUsersCSV = (format = "csv") => {
    if (!selRole || !users?.length) return;
    const list = users.filter(passStatus);   // export respects the Enabled/Disabled filter
    const headers = ["name", "email", "title", "manager", "phone", "mobile", "businessUnit", "accessMode", "status", "domain"];
    const rows = list.map(u => [u.name, u.email, u.title, u.manager, u.phone, u.mobile, u.bu, u.accessMode, u.disabled ? "Disabled" : "Enabled", u.domain]);
    exportTable(headers, rows, `security_role_${selRole.name.replace(/\s+/g, "_")}_users`, format, "Users");
    setFeedback(`${format === "xlsx" ? "Excel" : "CSV"} downloaded (${list.length} users)`);
    setTimeout(() => setFeedback(""), 2000);
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

  const exportCSV = (format = "csv") => {
    if (!selRole || !privileges.length) return;
    const headers = ["privilege", "label", "depth", "depthLabel", "isOrg", "isSensitive"];
    const rows = filteredPrivs.map(p => [p.name, formatPrivName(p.name), p.depth, p.depthLabel, p.isOrg ? "Yes" : "No", isSensitive(p.name) ? "Yes" : "No"]); // export the FILTERED view, not all privileges
    exportTable(headers, rows, `security_role_${selRole.name.replace(/\s+/g, "_")}`, format, "Privileges");
    setFeedback(`${format === "xlsx" ? "Excel" : "CSV"} downloaded (${filteredPrivs.length} privileges)`);
    setTimeout(() => setFeedback(""), 2000);
  };

  // ── Org-wide cross-role view ────────────────────────────────
  // Scans every role's privilege matrix (one RetrieveRolePrivilegesRole each — the privilege
  // catalog itself is fetched once and cached in the page), concurrency 3 to stay org-friendly.
  // Results are cached per role, so changing operation/depth/search afterwards is instant.
  const scanAllRoles = async () => {
    const gen = ++orgGen.current;
    const todo = roles.filter(r => !orgCache.current.has(r.id));
    setOrgFailed([]);
    if (!todo.length) return;
    setOrgScan({ done: roles.length - todo.length, total: roles.length });
    let idx = 0, completed = 0;
    const failed = [];
    const worker = async () => {
      while (idx < todo.length) {
        if (orgGen.current !== gen) return; // view closed / role selected / unmounted — stop scanning
        const role = todo[idx++];
        try { const m = await bridge.getRolePrivilegeMatrix(role.id); orgCache.current.set(role.id, m?.entities || []); }
        catch { failed.push(role.name); } // left uncached — surfaced below + "Retry failed" re-scans them
        completed++; // progress counts COMPLETED fetches, not claimed ones
        if (orgGen.current === gen) { setOrgScan({ done: Math.min(roles.length, roles.length - todo.length + completed), total: roles.length }); setOrgScanned(n => n + 1); }
      }
    };
    await Promise.all(Array.from({ length: Math.min(3, todo.length) }, worker));
    if (orgGen.current === gen) { setOrgScan(null); setOrgFailed(failed); }
  };
  const openOrgView = () => { setOrgView(true); scanAllRoles(); };
  const closeOrgView = () => { orgGen.current++; setOrgScan(null); setOrgFailed([]); setOrgView(false); };

  // Role-grouped rows for the current op/depth/search — entity-grouped view derives from these.
  const orgRows = useMemo(() => {
    if (!orgView) return [];
    const s = orgSearch.trim().toLowerCase();
    const out = [];
    for (const r of roles) {
      const ents = orgCache.current.get(r.id);
      if (!ents) continue;
      const roleMatch = s && r.name.toLowerCase().includes(s);
      const hits = ents.filter(e => (e.ops[orgOp] || 0) >= orgDepthMin && (!s || roleMatch || e.entity.toLowerCase().includes(s)));
      if (hits.length) out.push({ role: r, ents: hits });
    }
    return out;
     
  }, [orgView, roles, orgOp, orgDepthMin, orgSearch, orgScan]);
  const orgRowsByEntity = useMemo(() => {
    if (orgGroup !== "entity") return [];
    const map = new Map();
    for (const g of orgRows) for (const e of g.ents) {
      if (!map.has(e.entity)) map.set(e.entity, []);
      map.get(e.entity).push({ role: g.role, depth: e.ops[orgOp] || 0 });
    }
    return [...map.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
  }, [orgRows, orgGroup, orgOp]);

  const exportOrgCSV = (format = "csv") => {
    const rows = [];
    for (const g of orgRows) for (const e of g.ents) rows.push([g.role.name, e.entity, orgOp, DEPTH_LABEL[e.ops[orgOp] || 0]]);
    if (!rows.length) return;
    exportTable(["role", "entity", "operation", "depth"], rows, `security_orgwide_${orgOp.toLowerCase()}`, format, "OrgWide");
    setFeedback(`${format === "xlsx" ? "Excel" : "CSV"} downloaded (${rows.length} role×entity grants)`);
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
          <button onClick={() => orgView ? closeOrgView() : openOrgView()} disabled={loading} style={bt(orgView ? C.cy : null, { fontSize: 12, width: "100%", justifyContent: "center", marginTop: 8, opacity: loading ? 0.5 : 1 })}>🌐 Org-wide view — who can do what</button>
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

      {/* Right panel — role detail OR the org-wide cross-role view */}
      <div style={{ flex: 1, overflow: "auto", padding: 20 }}>
        {orgView && (
          <div>
            <div style={{ ...crd({ padding: "14px 18px" }), marginBottom: 12 }}>
              <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 2 }}>🌐 Org-wide privilege view</div>
              <div style={{ fontSize: 12, color: C.txd, marginBottom: 10 }}>Every security role × the entities it can <b>{orgOp}</b> — pick the operation and minimum depth. Root roles only (business-unit copies inherit the same privileges).</div>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <select value={orgOp} onChange={e => setOrgOp(e.target.value)} style={inp({ width: "auto", fontSize: 12, padding: "5px 8px" })}>
                  {OPS.map(op => <option key={op} value={op}>{op}</option>)}
                </select>
                <select value={orgDepthMin} onChange={e => setOrgDepthMin(+e.target.value)} style={inp({ width: "auto", fontSize: 12, padding: "5px 8px" })}>
                  <option value={8}>Organization only</option>
                  <option value={4}>Parent: Child BU and wider</option>
                  <option value={2}>Business Unit and wider</option>
                  <option value={1}>Any depth granted</option>
                </select>
                <input value={orgSearch} onChange={e => setOrgSearch(e.target.value)} placeholder="Filter by role or entity…" style={inp({ fontSize: 12, maxWidth: 220 })} />
                <div style={{ display: "flex", border: `1px solid ${C.bd}`, borderRadius: 5, overflow: "hidden" }}>
                  {[["role", "By role"], ["entity", "By entity"]].map(([k, lbl]) => (
                    <button key={k} onClick={() => setOrgGroup(k)} style={{ padding: "4px 10px", fontSize: 11, border: "none", cursor: "pointer", background: orgGroup === k ? C.cy + "22" : "transparent", color: orgGroup === k ? C.cy : C.txm, fontWeight: orgGroup === k ? 600 : 400 }}>{lbl}</button>
                  ))}
                </div>
                <div style={{ flex: 1 }} />
                <button onClick={() => exportOrgCSV("csv")} disabled={!!orgScan} title={orgScan ? "Scan in progress — the export would be partial" : undefined} style={bt(C.cy, { fontSize: 11, padding: "4px 10px", opacity: orgScan ? 0.5 : 1 })}><I.Download /> CSV</button>
                <button onClick={() => exportOrgCSV("xlsx")} disabled={!!orgScan} title={orgScan ? "Scan in progress — the export would be partial" : undefined} style={bt(C.cy, { fontSize: 11, padding: "4px 10px", opacity: orgScan ? 0.5 : 1 })}><I.Download /> Excel</button>
              </div>
              {orgScan && (
                <div style={{ marginTop: 10 }}>
                  <div style={{ fontSize: 11, color: C.txm, marginBottom: 4 }}><Spin s={11} /> Scanning role privileges… {orgScan.done}/{orgScan.total} (results appear as they load)</div>
                  <div style={{ height: 4, background: C.bd, borderRadius: 2 }}><div style={{ height: 4, width: `${Math.round(orgScan.done / Math.max(1, orgScan.total) * 100)}%`, background: C.cy, borderRadius: 2, transition: "width .3s" }} /></div>
                </div>
              )}
              {!orgScan && orgFailed.length > 0 && (
                <div style={{ marginTop: 8, fontSize: 11.5, color: C.rd, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span>⚠ {orgFailed.length} role{orgFailed.length > 1 ? "s" : ""} failed to load and {orgFailed.length > 1 ? "are" : "is"} missing from this view{orgFailed.length <= 5 ? ` (${orgFailed.join(", ")})` : ""} — results and exports below are INCOMPLETE.</span>
                  <button onClick={scanAllRoles} style={bt(C.rd, { fontSize: 11, padding: "3px 10px" })}>Retry failed</button>
                </div>
              )}
              {feedback && <div style={{ fontSize: 11, color: C.gn, marginTop: 6 }}>{feedback}</div>}
            </div>
            {!orgScan && orgRows.length === 0 && orgFailed.length === 0 && <div style={{ ...crd({ padding: 16 }), color: C.txd, fontSize: 13 }}>No role grants "{orgOp}" at this depth{orgSearch ? " matching your filter" : ""}.</div>}
            {orgGroup === "role" && orgRows.map(g => (
              <div key={g.role.id} style={{ ...crd({ padding: "10px 14px" }), marginBottom: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
                  <span style={{ fontWeight: 700, fontSize: 13, cursor: "pointer" }} onClick={() => handleSelect(g.role)} title="Open this role's detail">{g.role.name}</span>
                  <Badge label={g.role.isCustom ? "Custom" : "Managed"} color={g.role.isCustom ? C.or : C.txd} />
                  <span style={{ fontSize: 11, color: C.txd, ...mono }}>{g.ents.length} entit{g.ents.length > 1 ? "ies" : "y"}</span>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                  {g.ents.map(e => (
                    <span key={e.entity} title={`${orgOp}: ${DEPTH_LABEL[e.ops[orgOp] || 0]}`} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, ...mono, padding: "2px 8px", borderRadius: 4, background: C.sfh }}>
                      <DepthPie depth={e.ops[orgOp] || 0} /> {e.entity}
                    </span>
                  ))}
                </div>
              </div>
            ))}
            {orgGroup === "entity" && orgRowsByEntity.map(([entity, grants]) => (
              <div key={entity} style={{ ...crd({ padding: "10px 14px" }), marginBottom: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <span style={{ fontWeight: 700, fontSize: 13, ...mono }}>{entity}</span>
                  <span style={{ fontSize: 11, color: C.txd, ...mono }}>{grants.length} role{grants.length > 1 ? "s" : ""} can {orgOp}</span>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                  {grants.map(gr => (
                    <span key={gr.role.id} title={`${orgOp}: ${DEPTH_LABEL[gr.depth]} — click to open the role`} onClick={() => handleSelect(gr.role)} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, padding: "2px 8px", borderRadius: 4, background: C.sfh, cursor: "pointer" }}>
                      <DepthPie depth={gr.depth} /> {gr.role.name}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
        {!orgView && !selRole && <div style={{ textAlign: "center", color: C.txd, marginTop: 60 }}>{t("security.select_role")}</div>}
        {!orgView && selRole && (
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
                  <button onClick={() => exportCSV("csv")} disabled={loadingPriv} style={bt(C.cy, { fontSize: 11, padding: "4px 10px", opacity: loadingPriv ? 0.5 : 1 })}><I.Download /> CSV</button>
                  <button onClick={() => exportCSV("xlsx")} disabled={loadingPriv} style={bt(C.cy, { fontSize: 11, padding: "4px 10px", opacity: loadingPriv ? 0.5 : 1 })}><I.Download /> Excel</button>
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

            {/* Sub-tabs: Privileges | Users */}
            <div style={{ display: "flex", gap: 4, marginBottom: 12, borderBottom: `1px solid ${C.bd}` }}>
              {[["privileges", `Privileges${privStats.total ? ` (${privStats.total})` : ""}`], ["users", `Users${userCount != null ? ` (${userCount})` : ""}`], ["teams", `Teams${teamCount != null ? ` (${teamCount})` : ""}`]].map(([k, label]) => (
                <button key={k} onClick={() => k === "users" ? openUsersTab() : k === "teams" ? openTeamsTab() : setDetailTab("privileges")} style={{ padding: "6px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer", border: "none", background: "transparent", borderBottom: `2px solid ${detailTab === k ? C.cy : "transparent"}`, color: detailTab === k ? C.tx : C.txm, marginBottom: -1 }}>{label}</button>
              ))}
            </div>

            {detailTab === "privileges" && (<>
            {/* View switch: flat List of granted privileges | make.powerapps-style CRUD Matrix */}
            <div style={{ display: "flex", gap: 4, marginBottom: 12 }}>
              {[["list", "List"], ["matrix", "Matrix (by table)"]].map(([k, label]) => (
                <button key={k} onClick={() => k === "matrix" ? openMatrix() : setPrivView("list")} style={{ padding: "4px 12px", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer", border: `1px solid ${privView === k ? C.cy : C.bd}`, background: privView === k ? C.cy + "22" : "transparent", color: privView === k ? C.cy : C.txm }}>{label}</button>
              ))}
            </div>

            {privView === "list" && (<>
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
            </>)}

            {privView === "matrix" && (<>
              {matrixErr && <div style={{ ...crd({ padding: 12, borderColor: C.rd + "66" }), color: C.rd, fontSize: 13, marginBottom: 10 }}>{matrixErr} <button onClick={openMatrix} style={bt(null, { fontSize: 12, marginLeft: 8 })}>↻ Retry</button></div>}
              {loadingMatrix && <div style={{ textAlign: "center", marginTop: 20 }}><Spin s={16} /> Building the privilege matrix…</div>}
              {matrix && !loadingMatrix && (<>
                <div style={{ display: "flex", gap: 8, marginBottom: 10, alignItems: "center", flexWrap: "wrap" }}>
                  <input value={matrixSearch} onChange={e => setMatrixSearch(e.target.value)} placeholder="Filter tables…" style={inp({ fontSize: 13, maxWidth: 220 })} />
                  <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: C.txm, cursor: "pointer" }}>
                    <input type="checkbox" checked={showAllTables} onChange={e => setShowAllTables(e.target.checked)} style={{ accentColor: C.cy }} /> Show tables with no access
                  </label>
                  <span style={{ fontSize: 12, color: C.txd, ...mono }}>{matrixRows.length} tables</span>
                  <div style={{ flex: 1 }} />
                  <button onClick={() => exportMatrix("csv")} style={bt(C.cy, { fontSize: 11, padding: "4px 10px" })}><I.Download /> CSV</button>
                  <button onClick={() => exportMatrix("xlsx")} style={bt(C.cy, { fontSize: 11, padding: "4px 10px" })}><I.Download /> Excel</button>
                </div>
                <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 8, fontSize: 11, color: C.txm }}>
                  {[0, 1, 2, 4, 8].map(d => <span key={d} style={{ display: "flex", alignItems: "center", gap: 4 }}><DepthPie depth={d} /> {DEPTH_LABEL[d]}</span>)}
                </div>
                <div style={{ ...crd({ padding: 0, overflow: "hidden" }) }}>
                  <div style={{ display: "grid", gridTemplateColumns: `minmax(140px,1.4fr) repeat(${OPS.length}, 1fr)`, padding: "8px 12px", background: C.sfh, fontSize: 10.5, fontWeight: 700, color: C.txd, borderBottom: `1px solid ${C.bd}` }}>
                    <span>Table</span>
                    {OPS.map(op => <span key={op} style={{ textAlign: "center" }}>{op}</span>)}
                  </div>
                  <div style={{ maxHeight: 520, overflow: "auto" }}>
                    {matrixRows.length === 0 && <div style={{ padding: 14, color: C.txd, fontSize: 12 }}>No tables match{!showAllTables ? " — tick \"Show tables with no access\" to see the rest" : ""}.</div>}
                    {matrixRows.map(r => (
                      <div key={r.entity} style={{ display: "grid", gridTemplateColumns: `minmax(140px,1.4fr) repeat(${OPS.length}, 1fr)`, padding: "4px 12px", fontSize: 12, borderBottom: `1px solid ${C.bd}22`, alignItems: "center" }}>
                        <span style={{ ...mono, fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={r.entity}>{r.entity}</span>
                        {OPS.map(op => <span key={op} title={`${op}: ${DEPTH_LABEL[r.ops[op] || 0]}`} style={{ display: "flex", justifyContent: "center" }}><DepthPie depth={r.ops[op] || 0} /></span>)}
                      </div>
                    ))}
                  </div>
                </div>
                {matrix.misc && matrix.misc.some(m => m.depth > 0) && (
                  <div style={{ ...crd({ padding: "10px 12px" }), marginTop: 10 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: C.txd, marginBottom: 6 }}>Miscellaneous privileges (granted)</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {matrix.misc.filter(m => m.depth > 0).map(m => (
                        <span key={m.id || m.name} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, ...mono, padding: "2px 8px", borderRadius: 4, background: C.sfh }} title={`${m.name} — ${DEPTH_LABEL[m.depth]}`}>
                          <DepthPie depth={m.depth} /> {formatPrivName(m.name)}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </>)}
            </>)}
            </>)}

            {detailTab === "users" && (
              <div>
                {loadingUsers && <div style={{ textAlign: "center", marginTop: 20 }}><Spin s={16} /> Loading users… (large roles span every business unit, this can take a moment)</div>}
                {!loadingUsers && usersErr && <div style={{ ...crd({ padding: 14, borderColor: C.rd + "66" }), color: C.rd, fontSize: 13 }}>
                  Couldn't load the members: {usersErr.includes("Timeout") ? "the request timed out — this role exists in many business units." : usersErr}
                  <button onClick={() => { setUsersErr(""); openUsersTab(); }} style={{ ...bt(null, { fontSize: 12, marginLeft: 10 }) }}>↻ Retry</button>
                </div>}
                {!loadingUsers && !usersErr && users && users.length === 0 && (
                  <div style={{ ...crd({ padding: 16 }), color: C.txd, fontSize: 13, marginBottom: 10, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                    <span>No users hold this role directly{teamCount ? " (check the Teams tab — it may be team-inherited)" : ""}.</span>
                    <button onClick={() => setAssignOpen(o => !o)} style={bt(C.gn, { fontSize: 12 })}>➕ Assign users</button>
                  </div>
                )}
                {!loadingUsers && !usersErr && users && assignOpen && (
                  <div style={{ ...crd({ padding: 12, borderColor: C.gn + "55" }), marginBottom: 10 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>➕ Assign "{selRole?.name}" to users</div>
                    <div style={{ fontSize: 11, color: C.txd, marginBottom: 8, lineHeight: 1.5 }}>
                      Paste one <b>email</b> (or domain login) per line — commas/semicolons work too. Colvio matches each user and assigns the role copy from <b>their own business unit</b> automatically (the classic failure of manual bulk scripts).
                    </div>
                    <textarea value={assignText} onChange={e => setAssignText(e.target.value)} rows={5} placeholder={"alice@contoso.com\nbob@contoso.com\n…"} style={inp({ fontSize: 12, ...mono, resize: "vertical", marginBottom: 8 })} />
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <button onClick={runAssign} disabled={assignBusy || !assignText.trim()} style={bt(C.gn, { fontSize: 12, opacity: assignBusy || !assignText.trim() ? 0.5 : 1 })}>{assignBusy ? <><Spin s={12} /> Assigning…</> : "Assign role"}</button>
                      <button onClick={() => { setAssignOpen(false); setAssignReport(null); }} disabled={assignBusy} style={bt(null, { fontSize: 12 })}>Close</button>
                    </div>
                  </div>
                )}
                {!loadingUsers && !usersErr && users && assignReport && (
                  <div style={{ ...crd({ padding: "10px 12px" }), marginBottom: 10, maxHeight: 220, overflow: "auto" }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: C.txd, marginBottom: 6 }}>
                      Result — {assignReport.filter(r => r.ok).length} OK · {assignReport.filter(r => !r.ok).length} failed
                      <button onClick={() => setAssignReport(null)} style={{ background: "none", border: "none", color: C.txd, cursor: "pointer", float: "right", fontSize: 12 }}>✕</button>
                    </div>
                    {assignReport.map((r, i) => (
                      <div key={i} style={{ fontSize: 12, display: "flex", gap: 6, alignItems: "baseline", padding: "1px 0" }}>
                        <span style={{ color: r.ok ? C.gn : C.rd, flexShrink: 0 }}>{r.ok ? "✓" : "✗"}</span>
                        <span style={{ fontWeight: 600 }}>{r.label}</span>
                        <span style={{ color: C.txd }}>{r.msg}</span>
                      </div>
                    ))}
                  </div>
                )}
                {!loadingUsers && !usersErr && users && users.length > 0 && (
                  <>
                    <div style={{ display: "flex", gap: 8, marginBottom: 10, alignItems: "center", flexWrap: "wrap" }}>
                      <input value={userSearch} onChange={e => setUserSearch(e.target.value)} placeholder="Filter users (name, email, BU)…" style={inp({ fontSize: 13, maxWidth: 240 })} />
                      <div style={{ display: "flex", border: `1px solid ${C.bd}`, borderRadius: 5, overflow: "hidden" }}>
                        {[["all", "All"], ["enabled", "Enabled"], ["disabled", "Disabled"]].map(([k, lbl]) => (
                          <button key={k} onClick={() => setUserStatus(k)} style={{ padding: "4px 9px", fontSize: 11, border: "none", cursor: "pointer", background: userStatus === k ? C.cy + "22" : "transparent", color: userStatus === k ? C.cy : C.txm, fontWeight: userStatus === k ? 600 : 400 }}>{lbl}</button>
                        ))}
                      </div>
                      <span style={{ fontSize: 12, color: C.txd, ...mono }}>{shownUsers.length}/{users.length}</span>
                      <button onClick={() => exportUsersCSV("csv")} style={bt(C.cy, { fontSize: 11, padding: "4px 10px" })}><I.Download /> CSV</button>
                      <button onClick={() => exportUsersCSV("xlsx")} style={bt(C.cy, { fontSize: 11, padding: "4px 10px" })}><I.Download /> Excel</button>
                      <button onClick={() => setAssignOpen(o => !o)} style={bt(C.gn, { fontSize: 11, padding: "4px 10px" })}>➕ Assign users</button>
                      {selUsers.size > 0 && <button onClick={runRemove} disabled={assignBusy} style={bt(null, { fontSize: 11, padding: "4px 10px", color: C.rd, borderColor: C.rd + "66", opacity: assignBusy ? 0.5 : 1 })}>{assignBusy ? <Spin s={11} /> : "🗑"} Remove role ({selUsers.size})</button>}
                      {selUsers.size > 0 && (() => { const shownIds = new Set(shownUsers.map(u => u.id)); const hid = [...selUsers].filter(id => !shownIds.has(id)).length; return hid > 0 ? <span style={{ fontSize: 11, color: C.yw, fontWeight: 600 }} title="Removal applies to your whole selection, including members hidden by the active filter.">⚠ {hid} selected hidden by filter</span> : null; })()}
                    </div>
                    {/* Also fires when the COUNT query failed (userCount null) but the list hit the
                        cap — that case used to present the first 10,000 as the full membership (audit finding). */}
                    {((userCount != null && userCount > users.length) || users.length >= USERS_CAP) && (
                      <div style={{ ...crd({ padding: "8px 12px", background: C.yw + "0c", borderColor: C.yw + "55" }), marginBottom: 10, fontSize: 12, color: C.txm }}>
                        ⚠ Showing the first <b>{users.length.toLocaleString()}</b> of <b>{userCount != null ? userCount.toLocaleString() : "at least " + users.length.toLocaleString()}</b> members (capped for performance{userCount == null ? "; the exact count couldn't be loaded" : ""}). Use the filter to find a specific user — export covers the loaded {users.length.toLocaleString()} only.
                      </div>
                    )}
                    <div style={{ ...crd({ padding: 0, overflow: "hidden" }) }}>
                      <div style={{ display: "grid", gridTemplateColumns: "24px 1.4fr 1.7fr 1fr 92px", padding: "8px 14px", background: C.sfh, fontSize: 11, fontWeight: 700, color: C.txd, borderBottom: `1px solid ${C.bd}` }}>
                        <input type="checkbox" title="Select the visible users (for role removal)" checked={shownUsers.length > 0 && shownUsers.every(u => selUsers.has(u.id))} onChange={() => { const all = shownUsers.length > 0 && shownUsers.every(u => selUsers.has(u.id)); setSelUsers(prev => { const s = new Set(prev); shownUsers.forEach(u => all ? s.delete(u.id) : s.add(u.id)); return s; }); }} style={{ accentColor: C.cy, cursor: "pointer" }} />
                        <span>Name</span><span>Email</span><span>Business Unit</span><span>Status</span>
                      </div>
                      <div style={{ maxHeight: 500, overflow: "auto" }}>
                        {shownUsers.length === 0 && <div style={{ padding: 14, color: C.txd, fontSize: 12 }}>No users match this filter</div>}
                        {/* Render cap: with up to 10k loaded members, painting every row froze the
                            tab for seconds per keystroke (perf audit). Filter/selection/export still
                            cover the full loaded list — only the DOM is capped. */}
                        {shownUsers.slice(0, 500).map((u, i) => (
                          <div key={u.id || i} style={{ display: "grid", gridTemplateColumns: "24px 1.4fr 1.7fr 1fr 92px", padding: "6px 14px", fontSize: 12, borderBottom: `1px solid ${C.bd}22`, alignItems: "center", opacity: u.disabled ? 0.5 : 1 }}>
                            <input type="checkbox" checked={selUsers.has(u.id)} onChange={() => setSelUsers(prev => { const s = new Set(prev); s.has(u.id) ? s.delete(u.id) : s.add(u.id); return s; })} style={{ accentColor: C.cy, cursor: "pointer" }} />
                            <span style={{ minWidth: 0, overflow: "hidden" }} title={u.title ? `${u.name} — ${u.title}` : u.name}>
                              <span style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {u.name}
                                {u.accessModeCode !== 0 && u.accessMode && <span style={{ fontSize: 9, padding: "1px 5px", borderRadius: 3, background: C.vi + "22", color: C.vi, fontWeight: 700, marginLeft: 6 }}>{u.accessMode}</span>}
                              </span>
                              {u.title && <span style={{ display: "block", fontSize: 10, color: C.txd, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.title}</span>}
                            </span>
                            <span style={{ color: C.txm, ...mono, fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={u.phone || u.mobile ? `${u.email || u.domain || ""}${u.phone ? " · ☎ " + u.phone : ""}${u.mobile ? " · 📱 " + u.mobile : ""}` : (u.email || u.domain)}>{u.email || u.domain || "—"}</span>
                            <span style={{ color: C.txm, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={u.bu}>{u.bu || "—"}</span>
                            <span>{u.disabled ? <Badge label="Disabled" color={C.rd} /> : <Badge label="Enabled" color={C.gn} />}</span>
                          </div>
                        ))}
                        {shownUsers.length > 500 && <div style={{ padding: "8px 14px", fontSize: 11, color: C.yw }}>⚠ Showing the first 500 of {shownUsers.length.toLocaleString()} matching members — refine the filter to narrow down. Select-all and export still cover all {shownUsers.length.toLocaleString()}.</div>}
                      </div>
                    </div>
                    <div style={{ fontSize: 11, color: C.txd, marginTop: 8, lineHeight: 1.6 }}>
                      Members across every business-unit copy of this role (deduplicated by user). The "Business Unit" column shows where each user sits. Removal affects DIRECT assignments only — a role inherited through a team is managed on the team.
                    </div>
                  </>
                )}
              </div>
            )}

            {detailTab === "teams" && (
              <div>
                {loadingTeams && <div style={{ textAlign: "center", marginTop: 20 }}><Spin s={16} /> Loading teams…</div>}
                {!loadingTeams && teamsErr && <div style={{ ...crd({ padding: 14, borderColor: C.rd + "66" }), color: C.rd, fontSize: 13 }}>
                  Couldn't load the teams: {teamsErr}
                  <button onClick={() => { setTeamsErr(""); openTeamsTab(); }} style={{ ...bt(null, { fontSize: 12, marginLeft: 10 }) }}>↻ Retry</button>
                </div>}
                {!loadingTeams && !teamsErr && teams && teams.length === 0 && <div style={{ ...crd({ padding: 16 }), color: C.txd, fontSize: 13 }}>No teams hold this role.</div>}
                {!loadingTeams && !teamsErr && teams && teams.length > 0 && (
                  <>
                    <div style={{ display: "flex", gap: 8, marginBottom: 10, alignItems: "center", flexWrap: "wrap" }}>
                      <span style={{ fontSize: 12, color: C.txd, ...mono }}>{teams.length} team{teams.length > 1 ? "s" : ""}</span>
                      <div style={{ flex: 1 }} />
                      <button onClick={() => exportTeamsCSV("csv")} style={bt(C.cy, { fontSize: 11, padding: "4px 10px" })}><I.Download /> CSV</button>
                      <button onClick={() => exportTeamsCSV("xlsx")} style={bt(C.cy, { fontSize: 11, padding: "4px 10px" })}><I.Download /> Excel</button>
                    </div>
                    <div style={{ ...crd({ padding: 0, overflow: "hidden" }) }}>
                      <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr 1fr 1fr 80px", padding: "8px 14px", background: C.sfh, fontSize: 11, fontWeight: 700, color: C.txd, borderBottom: `1px solid ${C.bd}` }}>
                        <span>Team</span><span>Type</span><span>Business Unit</span><span>Administrator</span><span>Members</span>
                      </div>
                      <div style={{ maxHeight: 500, overflow: "auto" }}>
                        {teams.map(tm => (
                          <div key={tm.id} style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr 1fr 1fr 80px", padding: "6px 14px", fontSize: 12, borderBottom: `1px solid ${C.bd}22`, alignItems: "center" }}>
                            <span style={{ minWidth: 0, overflow: "hidden" }} title={tm.description ? `${tm.name} — ${tm.description}` : tm.name}>
                              <span style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: 600 }}>{tm.name}</span>
                              {tm.description && <span style={{ display: "block", fontSize: 10, color: C.txd, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{tm.description}</span>}
                            </span>
                            <span><Badge label={tm.type || "—"} color={tm.typeCode === 0 ? C.cy : C.vi} /></span>
                            <span style={{ color: C.txm, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={tm.bu}>{tm.bu || "—"}</span>
                            <span style={{ color: C.txm, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={tm.admin}>{tm.admin || "—"}</span>
                            <span style={{ ...mono, color: tm.memberCount ? C.tx : C.txd }}>{tm.memberCount != null ? tm.memberCount.toLocaleString() : "—"}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div style={{ fontSize: 11, color: C.txd, marginTop: 8, lineHeight: 1.6 }}>
                      Teams holding this role, across every business-unit copy. Users in these teams inherit the role through membership — they do NOT appear in the Users tab (direct assignments only).
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
