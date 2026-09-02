import { useState, useEffect, useMemo, useRef } from "react";
import { bridge } from "../d365-bridge.js";
import { C, I, Spin, mono, inp, bt, crd, exportTable, confirmProd } from "../shared.jsx";
import { layoutBuTree, visibleBuList, extractEmails, matchUsersByEmails } from "../buTreeUtils.js";

// Business Units — the org's BU hierarchy with the users assigned to each. Users are grouped by
// their _businessunitid_value (every user sits in exactly one BU). Read-only.

const DEMO_BUS = [
  { businessunitid: "b1", name: "Contoso", _parentbusinessunitid_value: null, isdisabled: false },
  { businessunitid: "b2", name: "Sales EU", _parentbusinessunitid_value: "b1", isdisabled: false },
  { businessunitid: "b3", name: "Sales US", _parentbusinessunitid_value: "b1", isdisabled: false },
  { businessunitid: "b4", name: "Sales France", _parentbusinessunitid_value: "b2", isdisabled: false },
];

export default function BusinessUnits({ bp, orgInfo, theme, permissions, orgFeatures }) {
  const isLive = orgInfo?.isExtension;
  const isAdmin = permissions?.canBypassPlugins === true; // moving users needs write on systemuser — sysadmin proxy
  const [bus, setBus] = useState(null);            // [{id,name,parentId,disabled}]
  const [countsByBu, setCountsByBu] = useState({});// { buId: count } — cheap, drives the tree badges
  const [usersByBu, setUsersByBu] = useState({});  // { buId: [user,...] } — lazy cache, loaded on select
  const [loading, setLoading] = useState(true);    // initial tree + counts load
  const [countsFailed, setCountsFailed] = useState(false); // count query failed → badges show "–", not a fake 0
  const [loadingUsers, setLoadingUsers] = useState(false); // members of the selected BU
  const [userErr, setUserErr] = useState("");
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [sel, setSel] = useState(null);            // selected BU id
  const [userSearch, setUserSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all"); // all | enabled | disabled
  const [showChart, setShowChart] = useState(false);       // full-screen org-chart overlay
  const [chartZoom, setChartZoom] = useState(1);
  const [chartExpanded, setChartExpanded] = useState(() => new Set()); // nodes whose children are shown
  const [chartHideDisabled, setChartHideDisabled] = useState(false);
  const chartSvgRef = useRef(null);
  const chartBoxRef = useRef(null);
  // Bulk move-to-BU (admin): checkbox selection over the member list + a confirm modal that
  // tells the ROLES truth before anything is written.
  const [checkedUsers, setCheckedUsers] = useState(() => new Set());
  const [moveModal, setMoveModal] = useState(false);
  const [moveTarget, setMoveTarget] = useState("");
  const [moving, setMoving] = useState(false);
  const [moveResults, setMoveResults] = useState(null);
  // Paste-a-list selection (admin): paste emails/UPNs, every match gets checked for the move.
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");   // kept across BU switches — re-run the same list on another BU
  const [pasteResult, setPasteResult] = useState(null); // {none:true} | {matched, missing:[…]}
  // Move-INTO-this-BU by pasted list (admin): org-wide search by email/UPN, then move the matches
  // TO the displayed BU wherever they currently sit — the natural "go to the target, paste, go"
  // flow (the checkbox flow above works the other way: select in the SOURCE BU, pick a target).
  const [inOpen, setInOpen] = useState(false);
  const [inText, setInText] = useState("");
  const [inBusy, setInBusy] = useState(false);
  const [inFound, setInFound] = useState(null);     // {movable:[user…], already:[user…], missing:[token…], failed:[token…]}
  const [inResults, setInResults] = useState(null); // per-user move outcome
  useEffect(() => { setCheckedUsers(new Set()); setMoveResults(null); setPasteResult(null); setInOpen(false); setInFound(null); setInResults(null); }, [sel]);
  const rootIdsOf = (list) => { const ids = new Set(list.map(b => b.id)); return list.filter(b => !b.parentId || !ids.has(b.parentId)).map(b => b.id); };

  // Mount: load only the BU hierarchy + per-BU counts (one cheap aggregate query). Member rows are
  // fetched lazily per BU when one is opened — so the module stays snappy on orgs with 50k+ users.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true); setError(""); setUsersByBu({});
      try {
        const [buData, counts] = await Promise.all([
          isLive
            ? bridge.query("businessunits", { select: "businessunitid,name,_parentbusinessunitid_value,isdisabled", orderby: "name asc" })
            : Promise.resolve({ records: DEMO_BUS }),
          bridge.getUserCountsByBu().catch(() => null),   // null = counts unavailable — shown as "–", never as a fake 0 (audit finding)
        ]);
        if (cancelled) return;
        const buList = (buData?.records || []).map(b => ({
          id: b.businessunitid,
          name: b.name || "(unnamed)",
          parentId: b._parentbusinessunitid_value || null,
          disabled: !!b.isdisabled,
        }));
        setBus(buList); setCountsByBu(counts || {}); setCountsFailed(!counts);
        if (buList.length) setSel(buList.find(b => !b.parentId)?.id || buList[0].id);
      } catch (e) { if (!cancelled) setError(e.message || String(e)); }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [isLive]);

  // Lazy-load the selected BU's direct members the first time it's opened (cached thereafter).
  useEffect(() => {
    if (!sel) return;
    if (usersByBu[sel] !== undefined) { setLoadingUsers(false); setUserErr(""); return; } // already cached
    let cancelled = false;
    setLoadingUsers(true); setUserErr("");
    bridge.getUsersByBu(sel).then(list => {
      if (cancelled) return;
      setUsersByBu(prev => ({ ...prev, [sel]: list || [] }));
      setLoadingUsers(false);
    }).catch(e => {
      if (cancelled) return;
      setUserErr(e.message || String(e)); setLoadingUsers(false);
    });
    return () => { cancelled = true; };
  }, [sel, usersByBu]);

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

  // BU on/off filter — like search, it breaks the parent-child chain (a matching child may have
  // a filtered-out parent), so any active filter switches the list to flat rendering.
  const [buStatus, setBuStatus] = useState("all"); // all | on | off
  const filteredTree = useMemo(() => {
    const s = search.trim().toLowerCase();
    return tree.filter(b =>
      (buStatus === "all" || (buStatus === "off" ? b.disabled : !b.disabled)) &&
      (!s || b.name.toLowerCase().includes(s)));
  }, [tree, search, buStatus]);
  const flatList = !!search.trim() || buStatus !== "all";

  const selBu = bus?.find(b => b.id === sel);
  const selUsers = usersByBu[sel] || [];
  const selLoaded = usersByBu[sel] !== undefined; // distinguishes "not fetched yet" from "fetched, empty"
  const passStatus = (u) => statusFilter === "all" || (statusFilter === "enabled" ? !u.disabled : !!u.disabled);
  const shownUsers = useMemo(() => {
    const s = userSearch.trim().toLowerCase();
    return selUsers.filter(u => passStatus(u) && (!s || [u.fullname, u.email, u.title].some(v => (v || "").toLowerCase().includes(s))));
     
  }, [selUsers, userSearch, statusFilter]);

  // Counts come from the cheap aggregate (true totals even before any member rows are loaded);
  // fall back to the loaded length if the aggregate was unavailable for that BU.
  const cnt = (id) => countsByBu[id] ?? (usersByBu[id]?.length || 0);
  // Display variant: when the count query FAILED and this BU's members aren't loaded, the truth
  // is "unknown" — render "–" instead of the misleading 0 the math fallback produces.
  const cntLabel = (id) => (countsFailed && countsByBu[id] === undefined && usersByBu[id] === undefined) ? "–" : cnt(id);
  const totalUsers = useMemo(() => {
    const vals = Object.values(countsByBu);
    if (vals.length) return vals.reduce((a, n) => a + (n || 0), 0);
    return Object.values(usersByBu).reduce((a, arr) => a + arr.length, 0);
  }, [countsByBu, usersByBu]);

  // Subtree = the selected BU + every BU beneath it. Used for the "incl. sub-BUs" count/export.
  const childMap = useMemo(() => {
    const m = {};
    (bus || []).forEach(b => { if (b.parentId) (m[b.parentId] = m[b.parentId] || []).push(b.id); });
    return m;
  }, [bus]);
  const subtreeBuIds = useMemo(() => {
    if (!sel) return [];
    const stack = [sel], seen = new Set(), ids = [];
    while (stack.length) { const x = stack.pop(); if (seen.has(x)) continue; seen.add(x); ids.push(x); (childMap[x] || []).forEach(c => stack.push(c)); }
    return ids;
  }, [sel, childMap]);
  // Subtree member count from the aggregate — accurate without fetching every sub-BU's rows.
  const subCount = useMemo(() => subtreeBuIds.reduce((a, id) => a + cnt(id), 0), [subtreeBuIds, countsByBu, usersByBu]);  
  const selDirectCount = cnt(sel);
  const hasSub = subtreeBuIds.length > 1 && subCount > selDirectCount;

  // Build the deduplicated subtree member list from a cache map (used by export once rows are loaded).
  const buildSubtreeUsers = (cache) => {
    const nameOf = (bid) => (bus || []).find(b => b.id === bid)?.name || "";
    const seenU = new Set(), arr = [];
    subtreeBuIds.forEach(bid => (cache[bid] || []).forEach(u => { if (!seenU.has(u.id)) { seenU.add(u.id); arr.push({ ...u, _bu: nameOf(bid) }); } }));
    return arr;
  };

  // scope: "this" = direct members of the selected BU; "subtree" = it + all sub-BUs (BU column kept).
  // Subtree members are loaded lazily, so for a subtree export we first fetch any sub-BUs not yet cached.
  const exportUsers = async (scope, format = "csv") => {
    if (!selBu) return;
    let base;
    if (scope === "subtree") {
      const missing = subtreeBuIds.filter(id => usersByBu[id] === undefined);
      let cache = usersByBu;
      if (missing.length) {
        setExporting(true);
        try {
          const fetched = await Promise.all(missing.map(id => bridge.getUsersByBu(id).then(l => [id, l || []]).catch(() => [id, null])));
          // null = fetch FAILED: never cached as "empty BU", and the export says it's incomplete —
          // the old catch silently exported the BU as memberless AND poisoned the cache (audit finding).
          const failed = fetched.filter(([, l]) => l === null).map(([id]) => id);
          cache = { ...usersByBu };
          fetched.forEach(([id, l]) => { if (l) cache[id] = l; });
          setUsersByBu(cache);
          if (failed.length) {
            const names = failed.map(id => (bus || []).find(b => b.id === id)?.name || id).slice(0, 3).join(", ");
            setError(`Export INCOMPLETE — ${failed.length} sub-BU${failed.length > 1 ? "s" : ""} failed to load (${names}${failed.length > 3 ? "…" : ""}): their members are missing from the file. Retry the export.`);
          }
        } finally { setExporting(false); }
      }
      base = buildSubtreeUsers(cache);
    } else {
      base = selUsers.map(u => ({ ...u, _bu: selBu.name }));
    }
    const list = base.filter(passStatus);   // export respects the Enabled/Disabled filter
    if (!list.length) return;
    const headers = ["name", "email", "title", "manager", "phone", "mobile", "accessMode", "calType", "status", "businessUnit"];
    const rows = list.map(u => [u.fullname, u.email, u.title, u.manager, u.phone, u.mobile, u.accessModeLabel || u.accessMode, u.calTypeLabel || u.calType, u.disabled ? "Disabled" : "Enabled", u._bu || selBu.name]);
    exportTable(headers, rows, `bu_${selBu.name.replace(/\s+/g, "_")}${scope === "subtree" ? "_subtree" : ""}_users`, format, "Users");
  };

  // The member list is cached after first open — drop the selected BU's cache (the lazy loader
  // refetches) and refresh the count badges, so users provisioned AFTER the module was opened
  // become visible without leaving the module.
  const refreshBu = () => {
    if (!sel) return;
    setUserErr("");
    setUsersByBu(prev => { const n = { ...prev }; delete n[sel]; return n; });
    bridge.getUserCountsByBu().then(c => setCountsByBu(c || {})).catch(() => {});
  };

  // Org-wide find for the move-INTO flow: chunked $filter on email OR UPN (the Security Audit
  // bulk-assign pattern). Users already in the displayed BU are shown but excluded from the move;
  // a failed chunk marks its tokens "couldn't check" — never silently "missing" (audit rule).
  const doInFind = async () => {
    const tokens = extractEmails(inText);
    if (!tokens.length) { setInFound({ movable: [], already: [], missing: [], failed: [], none: true }); return; }
    setInBusy(true); setInFound(null); setInResults(null);
    const byToken = new Map(); const failed = [];
    for (let i = 0; i < tokens.length; i += 15) {
      const chunk = tokens.slice(i, i + 15);
      const f = chunk.map(t => { const e = t.replace(/'/g, "''"); return `(internalemailaddress eq '${e}' or domainname eq '${e}')`; }).join(" or ");
      try {
        const d = await bridge.query("systemusers", { select: "systemuserid,fullname,internalemailaddress,domainname,isdisabled,_businessunitid_value", filter: f });
        (d?.records || []).forEach(u => {
          const rec = { id: u.systemuserid, name: u.fullname || "", email: u.internalemailaddress || "", upn: u.domainname || "", disabled: !!u.isdisabled, buId: u._businessunitid_value || "", buName: u["_businessunitid_value@OData.Community.Display.V1.FormattedValue"] || "" };
          [rec.email, rec.upn].forEach(k => { const kk = (k || "").toLowerCase(); if (kk && !byToken.has(kk)) byToken.set(kk, rec); });
        });
      } catch { failed.push(...chunk); }
    }
    const failedSet = new Set(failed);
    const seen = new Set(); const movable = []; const already = []; const missing = [];
    for (const t of tokens) {
      if (failedSet.has(t)) continue;
      const u = byToken.get(t);
      if (!u) { missing.push(t); continue; }
      if (seen.has(u.id)) continue; seen.add(u.id);
      (u.buId === sel ? already : movable).push(u);
    }
    setInFound({ movable, already, missing, failed });
    setInBusy(false);
  };

  const doInMove = async () => {
    if (!inFound?.movable?.length || moving) return;
    const n = inFound.movable.length;
    if (!confirmProd(orgInfo?.isProduction, `Move ${n} user${n > 1 ? "s" : ""} INTO "${selBu?.name}" (from their current business units)`)) return;
    setMoving(true); setInResults(null);
    try {
      const res = await bridge.moveUsersToBu(sel, inFound.movable.map(u => u.id)) || [];
      const okIds = new Set(res.filter(r => r.ok).map(r => String(r.id).toLowerCase()));
      // Local truth: moved users leave their SOURCE BUs' cached lists; the displayed BU's cache is
      // dropped so the lazy loader refetches and the newcomers appear; counts follow per source.
      setUsersByBu(prev => {
        const nx = { ...prev };
        for (const u of inFound.movable) { if (okIds.has(String(u.id).toLowerCase()) && nx[u.buId]) nx[u.buId] = nx[u.buId].filter(x => String(x.id).toLowerCase() !== String(u.id).toLowerCase()); }
        delete nx[sel];
        return nx;
      });
      setCountsByBu(prev => {
        const nx = { ...prev };
        let gained = 0;
        for (const u of inFound.movable) { if (okIds.has(String(u.id).toLowerCase())) { gained++; if (nx[u.buId] != null) nx[u.buId] = Math.max(0, nx[u.buId] - 1); } }
        if (nx[sel] != null) nx[sel] = nx[sel] + gained;
        return nx;
      });
      setInResults(res.map(r => ({ ...r, name: inFound.movable.find(u => String(u.id).toLowerCase() === String(r.id).toLowerCase())?.name || r.id })));
      setInFound(f => f ? { ...f, movable: f.movable.filter(u => !okIds.has(String(u.id).toLowerCase())) } : f); // failures stay listed for a retry
    } catch (e) { setInResults([{ id: "", ok: false, name: "", error: e.message || String(e) }]); }
    setMoving(false);
  };

  const doPasteMatch = () => {
    const tokens = extractEmails(pasteText);
    if (!tokens.length) { setPasteResult({ none: true }); return; }
    const { matchedIds, missing } = matchUsersByEmails(selUsers, tokens);
    setCheckedUsers(prev => { const n = new Set(prev); matchedIds.forEach(id => n.add(id)); return n; });
    setPasteResult({ matched: matchedIds.length, missing });
  };

  const Badge = ({ label, color }) => (
    <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 4, background: (color || C.txd) + "22", color: color || C.txd, fontWeight: 600 }}>{label}</span>
  );

  return (
    <div style={{ display: "flex", height: "100%" }}>
      {/* Left — BU hierarchy */}
      <div style={{ width: bp.mobile ? "100%" : 320, borderRight: `1px solid ${C.bd}`, display: "flex", flexDirection: "column", flexShrink: 0 }}>
        <div style={{ padding: "12px 10px", borderBottom: `1px solid ${C.bd}` }}>
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
            <I.Link /> Business Units
            <button onClick={() => { setShowChart(true); setChartZoom(1); setChartExpanded(new Set(rootIdsOf(bus || []))); }} disabled={!bus?.length} title="Full-screen org chart of the BU hierarchy — starts folded to two levels, click the +N chips to expand branches" style={{ ...bt(null, { fontSize: 11, padding: "3px 10px" }), marginLeft: "auto" }}>🌳 Org chart</button>
          </div>
          <input placeholder="Search a business unit…" value={search} onChange={e => setSearch(e.target.value)} style={inp({ fontSize: 13 })} />
          <div style={{ display: "flex", gap: 2, marginTop: 6 }}>
            {[["all", `All (${bus?.length || 0})`], ["on", `Active (${(bus || []).filter(b => !b.disabled).length})`], ["off", `Off (${(bus || []).filter(b => b.disabled).length})`]].map(([k, lbl]) => (
              <button key={k} onClick={() => setBuStatus(k)} style={{ padding: "3px 9px", fontSize: 11, border: `1px solid ${C.bd}`, borderRadius: 3, cursor: "pointer", background: buStatus === k ? C.vi : "transparent", color: buStatus === k ? "white" : C.txd }}>{lbl}</button>
            ))}
          </div>
          {!loading && bus && <div style={{ fontSize: 11, color: C.txd, marginTop: 6, ...mono }}>{filteredTree.length} of {bus.length} BUs{countsFailed ? "" : ` · ${totalUsers} users`}</div>}
          {countsFailed && !loading && <div style={{ fontSize: 11, color: C.yw, marginTop: 4 }}>⚠ Per-BU user counts couldn't be loaded — badges show "–" until a BU is opened.</div>}
        </div>
        <div style={{ flex: 1, overflow: "auto", padding: "4px 6px" }}>
          {loading && <div style={{ textAlign: "center", padding: 20 }}><Spin /> Loading…</div>}
          {error && !loading && <div style={{ padding: 10, color: C.rd, fontSize: 12 }}>{error}</div>}
          {filteredTree.map(b => (
            <button key={b.id} onClick={() => { setSel(b.id); setUserSearch(""); }}
              style={{ width: "100%", textAlign: "left", padding: "6px 8px", paddingLeft: 8 + (flatList ? 0 : b.depth * 16), border: "none", borderRadius: 6, cursor: "pointer", marginBottom: 1, background: sel === b.id ? C.sfa : "transparent", color: sel === b.id ? C.tx : C.txm, fontSize: 13 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6 }}>
                <span style={{ fontWeight: sel === b.id ? 600 : 400, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {!flatList && b.depth > 0 && <span style={{ color: C.txd }}>└ </span>}{b.name}
                </span>
                {b.disabled && <Badge label="off" color={C.rd} />}
                <span style={{ fontSize: 11, color: cnt(b.id) ? C.cy : C.txd, ...mono, flexShrink: 0 }}>{cntLabel(b.id)}</span>
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
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <div style={{ fontSize: 18, fontWeight: 700, flex: 1, minWidth: 160 }}>{selBu.name}</div>
                {isAdmin && <button onClick={() => { setInOpen(o => !o); }} title="Paste a list of emails/UPNs — Colvio finds them ANYWHERE in the org and moves them INTO this business unit" style={bt(inOpen ? C.vi : null, { fontSize: 11, padding: "4px 10px" })}>📥 Move users INTO this BU</button>}
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 6, alignItems: "center", flexWrap: "wrap" }}>
                <Badge label={`${selDirectCount.toLocaleString()} direct`} color={C.vi} />
                {hasSub && <Badge label={`${subCount.toLocaleString()} incl. sub-BUs`} color={C.cy} />}
                {selBu.disabled && <Badge label="Disabled" color={C.rd} />}
                {selBu.parentId && bus && <span style={{ fontSize: 12, color: C.txd }}>parent: {bus.find(p => p.id === selBu.parentId)?.name || "—"}</span>}
              </div>
            </div>

            {isAdmin && inOpen && (() => {
              const retain = orgFeatures?.retainRolesOnBuChange;
              return (
                <div style={{ ...crd({ padding: 12 }), marginBottom: 14 }}>
                  <div style={{ fontSize: 12, color: C.txm, marginBottom: 6, lineHeight: 1.5 }}>
                    Paste email addresses or UPNs — Colvio searches the <b>whole org</b> and moves every match <b>into “{selBu.name}”</b>, wherever they currently sit. Any separator works (one per line, commas, Outlook's <span style={mono}>Name &lt;email&gt;</span>).
                  </div>
                  <textarea value={inText} onChange={e => { setInText(e.target.value); setInFound(null); setInResults(null); }} rows={5}
                    placeholder={"jane.doe@contoso.com\njohn.smith@contoso.com"}
                    style={{ ...inp({ fontSize: 12 }), ...mono, width: "100%", resize: "vertical", boxSizing: "border-box" }} />
                  <div style={{ display: "flex", gap: 8, marginTop: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <button onClick={doInFind} disabled={!inText.trim() || inBusy} style={bt(C.cy, { fontSize: 12, opacity: inText.trim() && !inBusy ? 1 : 0.5 })}>{inBusy ? <Spin s={12} /> : "🔎 Find users"}</button>
                    {inFound?.movable?.length > 0 && <button onClick={doInMove} disabled={moving} style={bt(C.vi, { fontSize: 12 })}>{moving ? <Spin s={12} /> : `➡ Move ${inFound.movable.length} into ${selBu.name}`}</button>}
                    <button onClick={() => { setInText(""); setInFound(null); setInResults(null); }} style={bt(null, { fontSize: 12 })}>Clear</button>
                  </div>
                  {inFound && !inFound.none && (
                    <div style={{ marginTop: 10, fontSize: 12.5, lineHeight: 1.6 }}>
                      {inFound.movable.length > 0 && <>
                        <div style={{ color: C.gn, fontWeight: 600 }}>✅ {inFound.movable.length} user{inFound.movable.length > 1 ? "s" : ""} found — will move into “{selBu.name}”:</div>
                        <div style={{ maxHeight: 150, overflow: "auto", ...mono, fontSize: 11, color: C.txm }}>
                          {inFound.movable.map(u => <div key={u.id}>{u.name} · {u.email || u.upn} · currently in <b>{u.buName || u.buId}</b>{u.disabled ? " · DISABLED" : ""}</div>)}
                        </div>
                      </>}
                      {inFound.already.length > 0 && <div style={{ color: C.txd }}>ℹ {inFound.already.length} already in this BU (skipped): {inFound.already.map(u => u.name).slice(0, 5).join(", ")}{inFound.already.length > 5 ? "…" : ""}</div>}
                      {inFound.missing.length > 0 && <>
                        <div style={{ color: C.yw }}>⚠ {inFound.missing.length} not found anywhere in the org (typo, or not provisioned/synced yet):</div>
                        <div style={{ maxHeight: 90, overflow: "auto", whiteSpace: "pre-wrap", ...mono, fontSize: 11, color: C.yw }}>{inFound.missing.join("\n")}</div>
                      </>}
                      {inFound.failed.length > 0 && <div style={{ color: C.rd }}>✗ {inFound.failed.length} could NOT be checked (query failed) — retry Find: {inFound.failed.slice(0, 4).join(", ")}{inFound.failed.length > 4 ? "…" : ""}</div>}
                      {inFound.movable.length > 0 && (
                        <div style={{ marginTop: 6, padding: "6px 10px", borderRadius: 6, fontSize: 12, background: (retain === true ? C.gn : retain === false ? C.rd : C.yw) + "14", border: `1px solid ${(retain === true ? C.gn : retain === false ? C.rd : C.yw)}44`, color: retain === true ? C.gn : retain === false ? C.rd : C.yw }}>
                          {retain === true && <>✅ This org KEEPS security roles on a BU change.</>}
                          {retain === false && <>⚠ This org REMOVES ALL security roles on a BU change — re-assign via Security Audit after the move.</>}
                          {retain == null && <>ℹ Couldn't read the org's "retain roles on BU change" setting — on LEGACY behavior every role is removed. Verify on one user first.</>}
                        </div>
                      )}
                    </div>
                  )}
                  {inFound?.none && <div style={{ marginTop: 8, fontSize: 12, color: C.yw }}>No email addresses found in the pasted text.</div>}
                  {inResults && (() => {
                    const ok = inResults.filter(r => r.ok).length, ko = inResults.filter(r => !r.ok);
                    return (
                      <div style={{ marginTop: 10, fontSize: 12.5 }}>
                        <span style={{ color: ok ? C.gn : C.txm }}>✅ {ok} moved into {selBu.name}.</span>
                        {ko.length > 0 && <div style={{ marginTop: 4, color: C.rd, maxHeight: 120, overflow: "auto" }}>⚠ {ko.length} failed (kept in the list above — fix and retry):{ko.map((r, i) => <div key={i} style={{ marginTop: 2 }}>{r.name}: <i>{r.error}</i></div>)}</div>}
                      </div>
                    );
                  })()}
                </div>
              );
            })()}

            {(loadingUsers || !selLoaded) && !userErr
              ? <div style={{ ...crd({ padding: 16 }), color: C.txm, fontSize: 13, display: "flex", alignItems: "center", gap: 8 }}><Spin s={14} /> Loading members…</div>
              : userErr
              ? <div style={{ ...crd({ padding: 14, borderColor: C.rd + "66" }), color: C.rd, fontSize: 13 }}>
                  Couldn't load the members: {userErr}
                  <button onClick={() => { setUserErr(""); setUsersByBu(prev => ({ ...prev })); }} style={{ ...bt(null, { fontSize: 12, marginLeft: 10 }) }}>↻ Retry</button>
                </div>
              : selUsers.length === 0
              ? <div style={{ ...crd({ padding: 16 }), color: C.txd, fontSize: 13 }}>
                  No users are directly assigned to this business unit.
                  <button onClick={refreshBu} title="Reload from the server — users provisioned after this BU was opened don't appear until refreshed" style={bt(null, { fontSize: 12, marginLeft: 10 })}>↻ Refresh</button>
                  {hasSub && <div style={{ marginTop: 10, display: "flex", gap: 6, flexWrap: "wrap" }}><button onClick={() => exportUsers("subtree", "csv")} disabled={exporting} style={bt(C.cy, { fontSize: 12, opacity: exporting ? 0.5 : 1 })}><I.Download /> {exporting ? "Loading sub-BUs…" : `Export ${subCount.toLocaleString()} users from sub-BUs (CSV)`}</button><button onClick={() => exportUsers("subtree", "xlsx")} disabled={exporting} style={bt(C.cy, { fontSize: 12, opacity: exporting ? 0.5 : 1 })}><I.Download /> Excel</button></div>}
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
                  <button onClick={refreshBu} title="Reload this BU's members from the server — the list is cached after first open, so users provisioned since then don't appear until refreshed" style={bt(null, { fontSize: 12, padding: "4px 9px" })}>↻</button>
                  {isAdmin && (
                    <button onClick={() => setPasteOpen(o => !o)} title="Paste a list of email addresses or UPNs and select every matching user — then use ➡ Move to BU" style={bt(pasteOpen ? C.vi : null, { fontSize: 11, padding: "4px 10px" })}>📋 Paste emails</button>
                  )}
                  {isAdmin && checkedUsers.size > 0 && (
                    <button onClick={() => { setMoveTarget(""); setMoveResults(null); setMoveModal(true); }} style={bt(C.vi, { fontSize: 11, padding: "4px 10px" })}>➡ Move to BU ({checkedUsers.size})</button>
                  )}
                  <button onClick={() => exportUsers("this", "csv")} title="Export the direct members of this BU" style={bt(C.cy, { fontSize: 11, padding: "4px 10px" })}><I.Download /> CSV (this BU)</button>
                  <button onClick={() => exportUsers("this", "xlsx")} title="Export the direct members of this BU to Excel" style={bt(C.cy, { fontSize: 11, padding: "4px 10px" })}><I.Download /> Excel (this BU)</button>
                  {hasSub && <button onClick={() => exportUsers("subtree", "csv")} disabled={exporting} title="Export this BU plus every sub-BU beneath it (with a Business Unit column)" style={bt(null, { fontSize: 11, padding: "4px 10px", opacity: exporting ? 0.5 : 1 })}><I.Download /> {exporting ? "Loading sub-BUs…" : `+ sub-BUs (${subCount.toLocaleString()})`}</button>}
                  {hasSub && <button onClick={() => exportUsers("subtree", "xlsx")} disabled={exporting} title="Export this BU plus every sub-BU beneath it to Excel" style={bt(null, { fontSize: 11, padding: "4px 10px", opacity: exporting ? 0.5 : 1 })}><I.Download /> Excel + sub-BUs</button>}
                </div>
                {isAdmin && pasteOpen && (
                  <div style={{ ...crd({ padding: 12 }), marginBottom: 10 }}>
                    <div style={{ fontSize: 12, color: C.txm, marginBottom: 6, lineHeight: 1.5 }}>
                      Paste email addresses or UPNs — one per line, or separated by commas/semicolons/spaces (Outlook's <span style={mono}>Name &lt;email&gt;</span> format works too). Every match in this BU gets selected, ready for ➡ Move to BU.
                    </div>
                    <textarea value={pasteText} onChange={e => setPasteText(e.target.value)} rows={5}
                      placeholder={"jane.doe@contoso.com\njohn.smith@contoso.com"}
                      style={{ ...inp({ fontSize: 12 }), ...mono, width: "100%", resize: "vertical", boxSizing: "border-box" }} />
                    <div style={{ display: "flex", gap: 8, marginTop: 8, alignItems: "center" }}>
                      <button onClick={doPasteMatch} disabled={!pasteText.trim()} style={bt(C.vi, { fontSize: 12, opacity: pasteText.trim() ? 1 : 0.5 })}>Match & select</button>
                      <button onClick={() => { setPasteText(""); setPasteResult(null); }} style={bt(null, { fontSize: 12 })}>Clear</button>
                    </div>
                    {pasteResult && (pasteResult.none
                      ? <div style={{ marginTop: 8, fontSize: 12, color: C.yw }}>No email addresses found in the pasted text.</div>
                      : <div style={{ marginTop: 8, fontSize: 12.5 }}>
                          <span style={{ color: pasteResult.matched ? C.gn : C.txm }}>✅ {pasteResult.matched} user{pasteResult.matched === 1 ? "" : "s"} matched &amp; selected</span>
                          {pasteResult.missing.length > 0 && <>
                            <span style={{ color: C.yw }}> · ⚠ {pasteResult.missing.length} not found in this BU:</span>
                            <div style={{ marginTop: 4, maxHeight: 110, overflow: "auto", whiteSpace: "pre-wrap", ...mono, fontSize: 11, color: C.yw, lineHeight: 1.6 }}>{pasteResult.missing.join("\n")}</div>
                            <div style={{ fontSize: 11, color: C.txd, marginTop: 4 }}>Not found = not a direct member of THIS BU (freshly provisioned users land in the root BU), not synced into the environment yet (↻ refresh if they were just added), or a typo. Matching checks both email and UPN.</div>
                          </>}
                        </div>)}
                  </div>
                )}
                <div style={{ ...crd({ padding: 0, overflow: "hidden" }) }}>
                  <div style={{ display: "grid", gridTemplateColumns: isAdmin ? "26px 1.4fr 1.7fr 1fr 90px" : "1.4fr 1.7fr 1fr 90px", padding: "8px 14px", background: C.sfh, fontSize: 11, fontWeight: 700, color: C.txd, borderBottom: `1px solid ${C.bd}` }}>
                    {isAdmin && <input type="checkbox" checked={shownUsers.length > 0 && shownUsers.every(u => checkedUsers.has(u.id))} onChange={e => { const n = new Set(checkedUsers); shownUsers.forEach(u => e.target.checked ? n.add(u.id) : n.delete(u.id)); setCheckedUsers(n); }} title="Select all visible users" style={{ accentColor: C.vi }} />}
                    <span>Name</span><span>Email</span><span>Access / CAL</span><span>Status</span>
                  </div>
                  <div style={{ maxHeight: "calc(100vh - 320px)", minHeight: 200, overflow: "auto" }}>
                    {shownUsers.length === 0 && <div style={{ padding: 14, color: C.txd, fontSize: 12 }}>No users match this filter</div>}
                    {shownUsers.map((u, i) => (
                      <div key={u.id || i} style={{ display: "grid", gridTemplateColumns: isAdmin ? "26px 1.4fr 1.7fr 1fr 90px" : "1.4fr 1.7fr 1fr 90px", padding: "6px 14px", fontSize: 12, borderBottom: `1px solid ${C.bd}22`, alignItems: "center", opacity: u.disabled ? 0.5 : 1 }}>
                        {isAdmin && <input type="checkbox" checked={checkedUsers.has(u.id)} onChange={e => { const n = new Set(checkedUsers); e.target.checked ? n.add(u.id) : n.delete(u.id); setCheckedUsers(n); }} style={{ accentColor: C.vi }} />}
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

      {/* Move-to-BU modal — the ROLES truth is stated BEFORE anything is written: legacy orgs
          strip every security role on a BU change; modern orgs can retain them (org setting). */}
      {moveModal && (() => {
        const retain = orgFeatures?.retainRolesOnBuChange; // true kept | false removed | null unknown
        const targetBu = bus?.find(b => b.id === moveTarget);
        const doMove = async () => {
          if (!moveTarget || moving) return;
          if (!confirmProd(orgInfo?.isProduction, `Move ${checkedUsers.size} user${checkedUsers.size > 1 ? "s" : ""} to "${targetBu?.name}"`)) return;
          setMoving(true); setMoveResults(null);
          try {
            const res = await bridge.moveUsersToBu(moveTarget, [...checkedUsers]) || [];
            const okIds = new Set(res.filter(r => r.ok).map(r => String(r.id).toLowerCase()));
            // Local truth update: moved users leave this BU's cached list; the target's cache is
            // invalidated (lazy reload); count badges follow.
            setUsersByBu(prev => { const n = { ...prev }; if (n[sel]) n[sel] = n[sel].filter(u => !okIds.has(String(u.id).toLowerCase())); delete n[moveTarget]; return n; });
            setCountsByBu(prev => ({ ...prev, [sel]: Math.max(0, (prev[sel] || 0) - okIds.size), [moveTarget]: (prev[moveTarget] || 0) + okIds.size }));
            setMoveResults(res);
            setCheckedUsers(new Set(res.filter(r => !r.ok).map(r => r.id))); // failures stay selected for a retry
            setPasteResult(null); // its counts describe a selection that just left this BU
          } catch (e) { setMoveResults([{ id: "", ok: false, error: e.message || String(e) }]); }
          setMoving(false);
        };
        const nameOf = (id) => (selUsers.find(u => String(u.id).toLowerCase() === String(id).toLowerCase())?.fullname) || id;
        return (
          <div onClick={() => !moving && setMoveModal(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", zIndex: 265, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div onClick={e => e.stopPropagation()} style={{ width: 520, maxWidth: "92vw", background: C.sf, border: `1px solid ${C.bd}`, borderRadius: 12, padding: 18 }}>
              <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 10 }}>➡ Move {checkedUsers.size} user{checkedUsers.size > 1 ? "s" : ""} to another business unit</div>
              {!moveResults && <>
                <select value={moveTarget} onChange={e => setMoveTarget(e.target.value)} style={inp({ fontSize: 13 })}>
                  <option value="">— pick the target business unit —</option>
                  {(bus || []).filter(b => b.id !== sel).sort((a, b) => a.name.localeCompare(b.name)).map(b => <option key={b.id} value={b.id}>{b.name}{b.disabled ? " (disabled)" : ""}</option>)}
                </select>
                <div style={{ marginTop: 10, padding: "8px 12px", borderRadius: 8, fontSize: 12.5, lineHeight: 1.6,
                  background: (retain === true ? C.gn : retain === false ? C.rd : C.yw) + "14",
                  border: `1px solid ${(retain === true ? C.gn : retain === false ? C.rd : C.yw)}44`,
                  color: retain === true ? C.gn : retain === false ? C.rd : C.yw }}>
                  {retain === true && <>✅ This org KEEPS security roles when a user changes business unit — access is preserved.</>}
                  {retain === false && <>⚠ This org REMOVES ALL security roles when a user changes business unit — the moved users will lose access until roles are re-assigned (Security Audit → role → "Assign users" does it in bulk).</>}
                  {retain == null && <>ℹ Couldn't read this org's "retain roles on BU change" setting — on LEGACY behavior every security role is removed by the move. Verify on one user first, or check Power Platform admin center → feature settings.</>}
                </div>
                <div style={{ fontSize: 11.5, color: C.txd, marginTop: 8, lineHeight: 1.5 }}>Records owned by the moved users get their owning business unit recalculated server-side — users owning many records take longer (low-concurrency, one result per user).</div>
                <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 14 }}>
                  <button onClick={() => setMoveModal(false)} disabled={moving} style={bt(null, { fontSize: 12 })}>Cancel</button>
                  <button onClick={doMove} disabled={!moveTarget || moving} style={bt(C.vi, { fontSize: 12, opacity: moveTarget ? 1 : 0.5 })}>{moving ? <Spin s={12} /> : `Move ${checkedUsers.size}`}</button>
                </div>
              </>}
              {moveResults && (() => {
                const ok = moveResults.filter(r => r.ok).length, ko = moveResults.filter(r => !r.ok);
                return (<>
                  <div style={{ fontSize: 13, color: ok ? C.gn : C.txm }}>✅ {ok} moved to {targetBu?.name || "target BU"}.</div>
                  {ko.length > 0 && <div style={{ marginTop: 8, fontSize: 12, color: C.rd, maxHeight: 160, overflow: "auto" }}>
                    ⚠ {ko.length} failed (still selected — fix and retry):
                    {ko.map((r, i) => <div key={i} style={{ marginTop: 3 }}>{nameOf(r.id)}: <i>{r.error}</i></div>)}
                  </div>}
                  {retain === false && ok > 0 && <div style={{ marginTop: 8, fontSize: 12, color: C.rd }}>Reminder: their security roles were removed by the move — re-assign via Security Audit.</div>}
                  <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 14 }}>
                    <button onClick={() => setMoveModal(false)} style={bt(C.vi, { fontSize: 12 })}>Close</button>
                  </div>
                </>);
              })()}
            </div>
          </div>
        );
      })()}

      {/* Org-chart overlay — the hierarchy as an actual organigram (boxes + connectors), not an
          indented list. Click a box to select that BU; PNG export for docs and slide decks. */}
      {showChart && bus && (() => {
        // Fold-first: 1000+-BU orgs laid flat are hundreds of thousands of pixels wide. Only
        // expanded branches are laid out; collapsed nodes badge how many children they hide.
        const source = chartHideDisabled ? bus.filter(b => !b.disabled) : bus;
        const vis = visibleBuList(source, chartExpanded);
        const lay = layoutBuTree(vis.list);
        const PAD = 20;
        const w = lay.width + PAD * 2, h = lay.height + PAD * 2;
        const toggleNode = (id) => setChartExpanded(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
        const fit = () => {
          const boxW = chartBoxRef.current?.clientWidth || window.innerWidth;
          setChartZoom(Math.min(2, Math.max(0.2, +((boxW - 30) / w).toFixed(2))));
        };
        const exportPng = () => {
          const svg = chartSvgRef.current;
          if (!svg) return;
          const str = new XMLSerializer().serializeToString(svg);
          const scale = 2;
          const canvas = document.createElement("canvas");
          canvas.width = Math.round(w * scale); canvas.height = Math.round(h * scale);
          const ctx = canvas.getContext("2d");
          const img = new Image();
          img.onload = () => {
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            const a = document.createElement("a");
            a.href = canvas.toDataURL("image/png"); a.download = "colvio_bu_orgchart.png"; a.click();
          };
          img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(str);
        };
        return (
          <div style={{ position: "fixed", inset: 0, background: C.bg, zIndex: 270, display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 16px", borderBottom: `1px solid ${C.bd}`, flexWrap: "wrap" }}>
              <span style={{ fontSize: 15, fontWeight: 700 }}>🌳 Business unit org chart</span>
              <span style={{ fontSize: 11.5, color: C.txd }}>showing {vis.list.length} of {bus.length} BUs · ±N chips fold/unfold a branch · click a box to open it · counts are direct members</span>
              <div style={{ marginLeft: "auto", display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                <label title="Disabled BUs (and everything beneath them) are removed from the chart" style={{ fontSize: 11.5, color: C.txm, display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}>
                  <input type="checkbox" checked={chartHideDisabled} onChange={e => setChartHideDisabled(e.target.checked)} style={{ accentColor: C.vi }} />
                  hide disabled
                </label>
                <button onClick={() => setChartExpanded(new Set(vis.childCount.keys()))} title="Expand every branch — can get VERY wide on large orgs" style={bt(null, { fontSize: 11, padding: "3px 10px" })}>Expand all</button>
                <button onClick={() => setChartExpanded(new Set(rootIdsOf(source)))} style={bt(null, { fontSize: 11, padding: "3px 10px" })}>Collapse all</button>
                <button onClick={fit} title="Zoom so the whole chart fits the window width" style={bt(null, { fontSize: 11, padding: "3px 10px" })}>Fit</button>
                <button onClick={() => setChartZoom(z => Math.max(0.2, +(z - 0.2).toFixed(2)))} style={bt(null, { fontSize: 13, padding: "3px 10px" })}>−</button>
                <span style={{ fontSize: 11.5, color: C.txm, ...mono, minWidth: 40, textAlign: "center" }}>{Math.round(chartZoom * 100)}%</span>
                <button onClick={() => setChartZoom(z => Math.min(2, +(z + 0.2).toFixed(2)))} style={bt(null, { fontSize: 13, padding: "3px 10px" })}>+</button>
                <button onClick={exportPng} title="Exports what's currently unfolded" style={bt(C.cy, { fontSize: 11, padding: "4px 10px" })}><I.Download /> PNG</button>
                <button onClick={() => setShowChart(false)} style={bt(null, { fontSize: 12, padding: "4px 12px" })}>✕ Close</button>
              </div>
            </div>
            <div ref={chartBoxRef} style={{ flex: 1, overflow: "auto", padding: 10 }}>
              <svg ref={chartSvgRef} width={w * chartZoom} height={h * chartZoom} viewBox={`0 0 ${w} ${h}`} xmlns="http://www.w3.org/2000/svg" style={{ display: "block", margin: "0 auto" }}>
                <rect x="0" y="0" width={w} height={h} fill={C.bg} />
                {lay.edges.map((e, i) => {
                  const midY = (e.y1 + e.y2) / 2;
                  return <path key={i} d={`M ${e.x1 + PAD} ${e.y1 + PAD} V ${midY + PAD} H ${e.x2 + PAD} V ${e.y2 + PAD}`} fill="none" stroke={C.bd} strokeWidth="1.5" />;
                })}
                {lay.nodes.map(n => {
                  const isSel = n.id === sel;
                  const name = n.name.length > 22 ? n.name.slice(0, 21) + "…" : n.name;
                  const kids = vis.childCount.get(n.id) || 0;
                  const open = chartExpanded.has(n.id);
                  const cx = n.x + PAD + lay.nodeW / 2, chipY = n.y + PAD + lay.nodeH;
                  return (
                    <g key={n.id}>
                      <g onClick={() => { setSel(n.id); setUserSearch(""); setShowChart(false); }} style={{ cursor: "pointer" }}>
                        <rect x={n.x + PAD} y={n.y + PAD} width={lay.nodeW} height={lay.nodeH} rx="8"
                          fill={isSel ? C.sfa : C.sf} stroke={isSel ? C.vi : n.disabled ? C.rd + "66" : C.bd} strokeWidth={isSel ? 2 : 1}
                          strokeDasharray={n.disabled ? "4 3" : "none"} />
                        <text x={cx} y={n.y + PAD + 22} textAnchor="middle" fontSize="12.5" fontWeight="600" fill={n.disabled ? C.txd : C.tx} fontFamily="'Segoe UI',sans-serif">{name}{n.name.length > 22 ? <title>{n.name}</title> : null}</text>
                        <text x={cx} y={n.y + PAD + 41} textAnchor="middle" fontSize="10.5" fill={cnt(n.id) ? C.cy : C.txd} fontFamily="'DM Mono',monospace">{cntLabel(n.id)} user{cnt(n.id) === 1 ? "" : "s"}{n.disabled ? " · off" : ""}</text>
                      </g>
                      {kids > 0 && (
                        <g onClick={e => { e.stopPropagation(); toggleNode(n.id); }} style={{ cursor: "pointer" }}>
                          <title>{open ? "Collapse this branch" : `Expand ${kids} child BU${kids > 1 ? "s" : ""}`}</title>
                          <rect x={cx - 15} y={chipY - 8} width="30" height="16" rx="8" fill={open ? C.sfh : C.vi} stroke={C.bd} strokeWidth="1" />
                          <text x={cx} y={chipY + 4} textAnchor="middle" fontSize="10" fontWeight="700" fill={open ? C.txm : "#fff"} fontFamily="'DM Mono',monospace">{open ? "−" : `+${kids}`}</text>
                        </g>
                      )}
                    </g>
                  );
                })}
              </svg>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
