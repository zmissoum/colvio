import { useState, useEffect, useMemo } from "react";
import { bridge } from "../d365-bridge.js";
import { C, I, Spin, mono, inp, bt, crd, exportTable } from "../shared.jsx";

// Business Units — the org's BU hierarchy with the users assigned to each. Users are grouped by
// their _businessunitid_value (every user sits in exactly one BU). Read-only.

const DEMO_BUS = [
  { businessunitid: "b1", name: "Contoso", _parentbusinessunitid_value: null, isdisabled: false },
  { businessunitid: "b2", name: "Sales EU", _parentbusinessunitid_value: "b1", isdisabled: false },
  { businessunitid: "b3", name: "Sales US", _parentbusinessunitid_value: "b1", isdisabled: false },
  { businessunitid: "b4", name: "Sales France", _parentbusinessunitid_value: "b2", isdisabled: false },
];

export default function BusinessUnits({ bp, orgInfo, theme }) {
  const isLive = orgInfo?.isExtension;
  const [bus, setBus] = useState(null);            // [{id,name,parentId,disabled}]
  const [usersByBu, setUsersByBu] = useState({});  // { buId: [user,...] }
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [sel, setSel] = useState(null);            // selected BU id
  const [userSearch, setUserSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all"); // all | enabled | disabled

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true); setError("");
      try {
        const [buData, users] = await Promise.all([
          isLive
            ? bridge.query("businessunits", { select: "businessunitid,name,_parentbusinessunitid_value,isdisabled", orderby: "name asc" })
            : Promise.resolve({ records: DEMO_BUS }),
          bridge.getAllUsers(),
        ]);
        if (cancelled) return;
        const buList = (buData?.records || []).map(b => ({
          id: b.businessunitid,
          name: b.name || "(unnamed)",
          parentId: b._parentbusinessunitid_value || null,
          disabled: !!b.isdisabled,
        }));
        const grouped = {};
        (users || []).forEach(u => { const k = u.buId || ""; (grouped[k] = grouped[k] || []).push(u); });
        setBus(buList); setUsersByBu(grouped);
        if (buList.length) setSel(buList.find(b => !b.parentId)?.id || buList[0].id);
      } catch (e) { if (!cancelled) setError(e.message || String(e)); }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [isLive]);

  // Flatten the BU hierarchy into a depth-ordered list (parent → children). Orphans (parent not in
  // the list) and root BUs are top-level. A visited guard protects against any malformed cycle.
  const tree = useMemo(() => {
    if (!bus) return [];
    const childrenOf = {};
    bus.forEach(b => { if (b.parentId) (childrenOf[b.parentId] = childrenOf[b.parentId] || []).push(b); });
    const ids = new Set(bus.map(b => b.id));
    const out = [], seen = new Set();
    const walk = (b, depth) => {
      if (seen.has(b.id)) return; seen.add(b.id);
      out.push({ ...b, depth });
      (childrenOf[b.id] || []).sort((a, c) => a.name.localeCompare(c.name)).forEach(ch => walk(ch, depth + 1));
    };
    bus.filter(b => !b.parentId || !ids.has(b.parentId)).sort((a, c) => a.name.localeCompare(c.name)).forEach(r => walk(r, 0));
    return out;
  }, [bus]);

  const filteredTree = useMemo(() => {
    const s = search.trim().toLowerCase();
    return s ? tree.filter(b => b.name.toLowerCase().includes(s)) : tree;
  }, [tree, search]);

  const selBu = bus?.find(b => b.id === sel);
  const selUsers = usersByBu[sel] || [];
  const passStatus = (u) => statusFilter === "all" || (statusFilter === "enabled" ? !u.disabled : !!u.disabled);
  const shownUsers = useMemo(() => {
    const s = userSearch.trim().toLowerCase();
    return selUsers.filter(u => passStatus(u) && (!s || [u.fullname, u.email, u.title].some(v => (v || "").toLowerCase().includes(s))));
    // eslint-disable-next-line
  }, [selUsers, userSearch, statusFilter]);

  const totalUsers = useMemo(() => Object.values(usersByBu).reduce((a, arr) => a + arr.length, 0), [usersByBu]);
  const cnt = (id) => (usersByBu[id] || []).length;

  // Subtree = the selected BU + every BU beneath it. Used for the "incl. sub-BUs" count/export.
  const childMap = useMemo(() => {
    const m = {};
    (bus || []).forEach(b => { if (b.parentId) (m[b.parentId] = m[b.parentId] || []).push(b.id); });
    return m;
  }, [bus]);
  const subUsers = useMemo(() => {
    if (!sel) return [];
    const nameOf = (bid) => (bus || []).find(b => b.id === bid)?.name || "";
    const stack = [sel], seenBu = new Set(), seenU = new Set(), arr = [];
    while (stack.length) {
      const x = stack.pop(); if (seenBu.has(x)) continue; seenBu.add(x);
      (usersByBu[x] || []).forEach(u => { if (!seenU.has(u.id)) { seenU.add(u.id); arr.push({ ...u, _bu: nameOf(x) }); } });
      (childMap[x] || []).forEach(c => stack.push(c));
    }
    return arr;
  }, [sel, childMap, usersByBu, bus]);
  const hasSub = subUsers.length > selUsers.length;

  // scope: "this" = direct members of the selected BU; "subtree" = it + all sub-BUs (BU column kept).
  const exportUsers = (scope, format = "csv") => {
    if (!selBu) return;
    const base = scope === "subtree" ? subUsers : selUsers.map(u => ({ ...u, _bu: selBu.name }));
    const list = base.filter(passStatus);   // export respects the Enabled/Disabled filter
    if (!list.length) return;
    const headers = ["name", "email", "title", "manager", "phone", "mobile", "accessMode", "calType", "status", "businessUnit"];
    const rows = list.map(u => [u.fullname, u.email, u.title, u.manager, u.phone, u.mobile, u.accessModeLabel || u.accessMode, u.calTypeLabel || u.calType, u.disabled ? "Disabled" : "Enabled", u._bu || selBu.name]);
    exportTable(headers, rows, `bu_${selBu.name.replace(/\s+/g, "_")}${scope === "subtree" ? "_subtree" : ""}_users`, format, "Users");
  };

  const Badge = ({ label, color }) => (
    <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 4, background: (color || C.txd) + "22", color: color || C.txd, fontWeight: 600 }}>{label}</span>
  );

  return (
    <div style={{ display: "flex", height: "100%" }}>
      {/* Left — BU hierarchy */}
      <div style={{ width: bp.mobile ? "100%" : 320, borderRight: `1px solid ${C.bd}`, display: "flex", flexDirection: "column", flexShrink: 0 }}>
        <div style={{ padding: "12px 10px", borderBottom: `1px solid ${C.bd}` }}>
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}><I.Link /> Business Units</div>
          <input placeholder="Search a business unit…" value={search} onChange={e => setSearch(e.target.value)} style={inp({ fontSize: 13 })} />
          {!loading && bus && <div style={{ fontSize: 11, color: C.txd, marginTop: 6, ...mono }}>{bus.length} BUs · {totalUsers} users</div>}
        </div>
        <div style={{ flex: 1, overflow: "auto", padding: "4px 6px" }}>
          {loading && <div style={{ textAlign: "center", padding: 20 }}><Spin /> Loading…</div>}
          {error && !loading && <div style={{ padding: 10, color: C.rd, fontSize: 12 }}>{error}</div>}
          {filteredTree.map(b => (
            <button key={b.id} onClick={() => { setSel(b.id); setUserSearch(""); }}
              style={{ width: "100%", textAlign: "left", padding: "6px 8px", paddingLeft: 8 + (search.trim() ? 0 : b.depth * 16), border: "none", borderRadius: 6, cursor: "pointer", marginBottom: 1, background: sel === b.id ? C.sfa : "transparent", color: sel === b.id ? C.tx : C.txm, fontSize: 13 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6 }}>
                <span style={{ fontWeight: sel === b.id ? 600 : 400, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {!search.trim() && b.depth > 0 && <span style={{ color: C.txd }}>└ </span>}{b.name}
                </span>
                {b.disabled && <Badge label="off" color={C.rd} />}
                <span style={{ fontSize: 11, color: cnt(b.id) ? C.cy : C.txd, ...mono, flexShrink: 0 }}>{cnt(b.id)}</span>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Right — selected BU's users */}
      <div style={{ flex: 1, overflow: "auto", padding: 20 }}>
        {!selBu && !loading && <div style={{ textAlign: "center", color: C.txd, marginTop: 60 }}>Select a business unit.</div>}
        {selBu && (
          <div>
            <div style={{ ...crd({ padding: "16px 20px" }), marginBottom: 14 }}>
              <div style={{ fontSize: 18, fontWeight: 700 }}>{selBu.name}</div>
              <div style={{ display: "flex", gap: 8, marginTop: 6, alignItems: "center", flexWrap: "wrap" }}>
                <Badge label={`${selUsers.length} direct`} color={C.vi} />
                {hasSub && <Badge label={`${subUsers.length} incl. sub-BUs`} color={C.cy} />}
                {selBu.disabled && <Badge label="Disabled" color={C.rd} />}
                {selBu.parentId && bus && <span style={{ fontSize: 12, color: C.txd }}>parent: {bus.find(p => p.id === selBu.parentId)?.name || "—"}</span>}
              </div>
            </div>

            {selUsers.length === 0
              ? <div style={{ ...crd({ padding: 16 }), color: C.txd, fontSize: 13 }}>
                  No users are directly assigned to this business unit.
                  {hasSub && <div style={{ marginTop: 10, display: "flex", gap: 6, flexWrap: "wrap" }}><button onClick={() => exportUsers("subtree", "csv")} style={bt(C.cy, { fontSize: 12 })}><I.Download /> Export {subUsers.length.toLocaleString()} users from sub-BUs (CSV)</button><button onClick={() => exportUsers("subtree", "xlsx")} style={bt(C.cy, { fontSize: 12 })}><I.Download /> Excel</button></div>}
                </div>
              : <>
                <div style={{ display: "flex", gap: 8, marginBottom: 10, alignItems: "center", flexWrap: "wrap" }}>
                  <input value={userSearch} onChange={e => setUserSearch(e.target.value)} placeholder="Filter users…" style={inp({ fontSize: 13, maxWidth: 220 })} />
                  <div style={{ display: "flex", border: `1px solid ${C.bd}`, borderRadius: 5, overflow: "hidden" }}>
                    {[["all", "All"], ["enabled", "Enabled"], ["disabled", "Disabled"]].map(([k, lbl]) => (
                      <button key={k} onClick={() => setStatusFilter(k)} style={{ padding: "4px 9px", fontSize: 11, border: "none", cursor: "pointer", background: statusFilter === k ? C.cy + "22" : "transparent", color: statusFilter === k ? C.cy : C.txm, fontWeight: statusFilter === k ? 600 : 400 }}>{lbl}</button>
                    ))}
                  </div>
                  <span style={{ fontSize: 12, color: C.txd, ...mono }}>{shownUsers.length}/{selUsers.length}</span>
                  <button onClick={() => exportUsers("this", "csv")} title="Export the direct members of this BU" style={bt(C.cy, { fontSize: 11, padding: "4px 10px" })}><I.Download /> CSV (this BU)</button>
                  <button onClick={() => exportUsers("this", "xlsx")} title="Export the direct members of this BU to Excel" style={bt(C.cy, { fontSize: 11, padding: "4px 10px" })}><I.Download /> Excel (this BU)</button>
                  {hasSub && <button onClick={() => exportUsers("subtree", "csv")} title="Export this BU plus every sub-BU beneath it (with a Business Unit column)" style={bt(null, { fontSize: 11, padding: "4px 10px" })}><I.Download /> + sub-BUs ({subUsers.length.toLocaleString()})</button>}
                  {hasSub && <button onClick={() => exportUsers("subtree", "xlsx")} title="Export this BU plus every sub-BU beneath it to Excel" style={bt(null, { fontSize: 11, padding: "4px 10px" })}><I.Download /> Excel + sub-BUs</button>}
                </div>
                <div style={{ ...crd({ padding: 0, overflow: "hidden" }) }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1.7fr 1fr 90px", padding: "8px 14px", background: C.sfh, fontSize: 11, fontWeight: 700, color: C.txd, borderBottom: `1px solid ${C.bd}` }}>
                    <span>Name</span><span>Email</span><span>Access / CAL</span><span>Status</span>
                  </div>
                  <div style={{ maxHeight: "calc(100vh - 320px)", minHeight: 200, overflow: "auto" }}>
                    {shownUsers.length === 0 && <div style={{ padding: 14, color: C.txd, fontSize: 12 }}>No users match this filter</div>}
                    {shownUsers.map((u, i) => (
                      <div key={u.id || i} style={{ display: "grid", gridTemplateColumns: "1.4fr 1.7fr 1fr 90px", padding: "6px 14px", fontSize: 12, borderBottom: `1px solid ${C.bd}22`, alignItems: "center", opacity: u.disabled ? 0.5 : 1 }}>
                        <span style={{ minWidth: 0, overflow: "hidden" }} title={u.title ? `${u.fullname} — ${u.title}` : u.fullname}>
                          <span style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.fullname || "(no name)"}</span>
                          {u.title && <span style={{ display: "block", fontSize: 10, color: C.txd, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.title}</span>}
                        </span>
                        <span style={{ color: C.txm, ...mono, fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={u.phone || u.mobile ? `${u.email}${u.phone ? " · ☎ " + u.phone : ""}${u.mobile ? " · 📱 " + u.mobile : ""}` : u.email}>{u.email || "—"}</span>
                        <span style={{ color: C.txm, fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.accessModeLabel || u.accessMode}{u.calTypeLabel ? ` · ${u.calTypeLabel}` : ""}</span>
                        <span>{u.disabled ? <Badge label="Disabled" color={C.rd} /> : <Badge label="Enabled" color={C.gn} />}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div style={{ fontSize: 11, color: C.txd, marginTop: 8 }}>Direct members of this business unit (sub-BUs have their own counts in the tree).</div>
              </>}
          </div>
        )}
      </div>
    </div>
  );
}
