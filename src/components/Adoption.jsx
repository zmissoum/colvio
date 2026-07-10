import { useState, useEffect, useRef, useMemo } from "react";
import { bridge } from "../d365-bridge.js";
import { C, I, Spin, mono, inp, bt, crd, exportTable } from "../shared.jsx";
import { t } from "../i18n.js";

// Adoption — turns user-login audit rows (action 64) into usage analytics: how many logins, how
// many distinct users, the daily trend, per-user activity, and who never signed in — over a
// configurable window, filterable by security role and business unit. Read-only. Needs "Audit user
// access" enabled; only sees rows still inside the org's audit retention.
const DAY = 86400000;
const isoDay = (d) => new Date(d).toISOString().slice(0, 10);
// Dataverse (CrmDateTime) rejects dates before 1753-01-01; login audit can't predate ~2000 anyway.
// A native <input type=date> will emit transient values like "0020-06-09" while the year is edited,
// so we validate before ever hitting the API.
const MIN_ISO = "2000-01-01";
const isValidDay = (s, todayISO) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(new Date(s + "T00:00:00Z").getTime()) && s >= MIN_ISO && s <= todayISO;

export default function Adoption({ bp, orgInfo, theme, orgFeatures }) {
  const isLive = orgInfo?.isExtension;
  const [preset, setPreset] = useState("30");        // 7 | 30 | 90 | custom
  const [customFrom, setCustomFrom] = useState(isoDay(Date.now() - 30 * DAY));
  const [customTo, setCustomTo] = useState(isoDay(Date.now()));
  const [stats, setStats] = useState(null);        // { users:[{id,name,total,last,byDay}], failedDays }
  const [scanProg, setScanProg] = useState(null);  // {done,total} while the per-day scan runs
  const [retryKey, setRetryKey] = useState(0);     // bump to re-run the scan (failed-days retry)
  const [users, setUsers] = useState([]);            // getAllUsers → BU + name + disabled map
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [roleFilter, setRoleFilter] = useState("");  // role NAME, "" = all
  const [buFilter, setBuFilter] = useState("");       // buId, "" = all
  const [roleMembers, setRoleMembers] = useState(null); // Set<userId> for the selected role, or null
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [userSearch, setUserSearch] = useState("");
  const [userSort, setUserSort] = useState("logins"); // logins | days | last
  const [chartMetric, setChartMetric] = useState("both"); // both | logins | users
  const roleMemberCache = useRef(new Map());
  const gen = useRef(0);
  const lastValidWin = useRef(null); // remembers the last well-formed window so a bad keystroke doesn't re-query
  const todayISO = isoDay(Date.now());
  // Whether the custom inputs currently hold a usable range (drives the inline hint + open the picker).
  const customValid = preset !== "custom" || (isValidDay(customFrom, todayISO) && isValidDay(customTo, todayISO) && customFrom <= customTo);
  const openPicker = (e) => { try { e.currentTarget.showPicker?.(); } catch { /* not user-activated / unsupported */ } };

  // Resolve the [from,to] ISO window from the preset (inclusive end of day for custom).
  // When a custom entry is incomplete or out of bounds we KEEP the last valid window rather than
  // querying Dataverse with an illegal date — that avoids the 400 (and a runaway bucket loop below).
  const windowRange = useMemo(() => {
    const now = Date.now();
    if (preset === "custom") {
      const valid = isValidDay(customFrom, todayISO) && isValidDay(customTo, todayISO) && customFrom <= customTo;
      if (valid) {
        const win = { from: `${customFrom}T00:00:00Z`, to: `${customTo}T23:59:59Z`, days: Math.max(1, Math.round((new Date(customTo) - new Date(customFrom)) / DAY) + 1), valid: true };
        lastValidWin.current = win;
        return win;
      }
      const base = lastValidWin.current || { from: new Date(now - 30 * DAY).toISOString(), to: new Date(now).toISOString(), days: 30 };
      return { ...base, valid: false };
    }
    const days = parseInt(preset, 10) || 30;
    const win = { from: new Date(now - days * DAY).toISOString(), to: new Date(now).toISOString(), days, valid: true };
    lastValidWin.current = win;
    return win;
    // eslint-disable-next-line
  }, [preset, customFrom, customTo]);

  // Load login stats whenever the WINDOW changes (role/BU filters are applied client-side, instant).
  // Server-side per-day aggregation: exact totals with no fetch cap, whatever the audit volume.
  useEffect(() => {
    const g = ++gen.current;
    setLoading(true); setError(""); setScanProg(null);
    Promise.all([
      bridge.getLoginStats(windowRange.from, windowRange.to, p => { if (gen.current === g) setScanProg(p); }),
      users.length ? Promise.resolve(null) : bridge.getAllUsers().catch(() => []),
      roles.length ? Promise.resolve(null) : bridge.getAllRoles().catch(() => []),
    ]).then(([st, us, rs]) => {
      if (gen.current !== g) return;
      setStats(st || { users: [], failedDays: [] });
      if (us) setUsers(us);
      if (rs) setRoles(rs);
      setLoading(false); setScanProg(null);
    }).catch(e => { if (gen.current === g) { setError(e.message || String(e)); setLoading(false); setScanProg(null); } });
    // eslint-disable-next-line
  }, [windowRange.from, windowRange.to, retryKey]);

  // Role filter → fetch (and cache) the role's members across every BU copy. Guarded by its OWN
  // generation counter: switching role (or back to "All") mid-fetch must DISCARD the stale result —
  // the window `gen` doesn't change on role switches, so it can't catch this race.
  const roleGen = useRef(0);
  useEffect(() => {
    const rg = ++roleGen.current;
    if (!roleFilter) { setRoleMembers(null); setLoadingMembers(false); return; }
    if (roleMemberCache.current.has(roleFilter)) { setRoleMembers(roleMemberCache.current.get(roleFilter)); setLoadingMembers(false); return; }
    setLoadingMembers(true);
    bridge.getRoleUsers(roleFilter).then(list => {
      const set = new Set((list || []).map(u => String(u.id).toLowerCase()));
      roleMemberCache.current.set(roleFilter, set); // cache even if stale — instant on next pick
      if (roleGen.current === rg) { setRoleMembers(set); setLoadingMembers(false); }
    }).catch(() => { if (roleGen.current === rg) { setRoleMembers(new Set()); setLoadingMembers(false); } });
  }, [roleFilter]);

  // Per-user metadata (BU + name + disabled), keyed by lowercase id.
  const userMeta = useMemo(() => {
    const m = new Map();
    users.forEach(u => m.set(String(u.id).toLowerCase(), { name: u.fullname || "", buId: u.buId || "", bu: u.buName || "", disabled: !!u.disabled }));
    return m;
  }, [users]);
  const buOptions = useMemo(() => {
    const m = new Map();
    users.forEach(u => { if (u.buId) m.set(u.buId, u.buName || u.buId); });
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [users]);
  const roleOptions = useMemo(() => [...new Set(roles.map(r => r.name))].sort((a, b) => a.localeCompare(b)), [roles]);

  const passUser = (id) => (!roleMembers || roleMembers.has(id)) && (!buFilter || userMeta.get(id)?.buId === buFilter);

  // HEAVY pass — runs ONCE per window (stats/window/userMeta), NOT on filter change. The server
  // already aggregated per user per day; here we just re-bucket days (weekly over 92d) and attach
  // user metadata, so filter changes only ever touch (users × days) rows.
  const prep = useMemo(() => {
    if (!stats) return null;
    const weekly = windowRange.days > 92;
    const bucketOf = (iso) => {
      if (!weekly) return iso.slice(0, 10);
      const d = new Date(iso), day = Math.floor(d.getTime() / DAY);
      return isoDay((day - ((d.getUTCDay() + 6) % 7)) * DAY); // Monday of that week
    };
    // Continuous bucket timeline over the window (so quiet days show as gaps, not disappear).
    const labels = [];
    const start = new Date(windowRange.from).getTime(), end = new Date(windowRange.to).getTime();
    for (let ms = start; ms <= end; ms += (weekly ? 7 : 1) * DAY) labels.push(bucketOf(new Date(ms).toISOString()));
    const bucketSet = new Set(labels);
    const byUser = new Map();
    for (const su of stats.users) {
      const id = String(su.id).toLowerCase();
      const byBucket = new Map();
      for (const [day, c] of Object.entries(su.byDay || {})) {
        const label = bucketOf(day);
        if (bucketSet.has(label)) byBucket.set(label, (byBucket.get(label) || 0) + c);
      }
      byUser.set(id, {
        id,
        name: su.name || userMeta.get(id)?.name || id,
        bu: userMeta.get(id)?.bu || "",
        logins: su.total || 0,
        days: new Set(Object.keys(su.byDay || {})),
        last: su.last || "",
        byBucket,
      });
    }
    return { weekly, labels, byUser };
    // eslint-disable-next-line
  }, [stats, windowRange.from, windowRange.to, windowRange.days, userMeta]);

  // LIGHT pass — reacts to role/BU filters. Reduces over USERS only (a few thousand at most),
  // re-summing their pre-computed per-bucket counts, instead of re-scanning every login event.
  const agg = useMemo(() => {
    if (!prep) return null;
    const idx = new Map(prep.labels.map((l, i) => [l, i]));
    const logins = new Array(prep.labels.length).fill(0);
    const distinct = new Array(prep.labels.length).fill(0);
    let total = 0;
    const perUser = [];
    for (const u of prep.byUser.values()) {
      if (!passUser(u.id)) continue;
      total += u.logins;
      perUser.push({ id: u.id, name: u.name, bu: u.bu, logins: u.logins, days: u.days.size, last: u.last });
      for (const [label, c] of u.byBucket) {
        const i = idx.get(label);
        if (i !== undefined) { logins[i] += c; distinct[i] += 1; } // one bucket entry per user ⇒ distinct users
      }
    }
    const series = prep.labels.map((label, i) => ({ label, logins: logins[i], users: distinct[i] }));
    // Never-signed-in = users in scope (role/BU) with zero logins in the window.
    const scopeUsers = users.filter(u => passUser(String(u.id).toLowerCase()));
    const activeIds = new Set(perUser.map(u => u.id));
    const neverIn = scopeUsers.filter(u => !activeIds.has(String(u.id).toLowerCase()) && !u.disabled);
    return {
      total,
      unique: perUser.length,
      avg: perUser.length ? total / perUser.length : 0,
      scopeCount: scopeUsers.length,
      never: neverIn,
      series, weekly: prep.weekly, perUser,
    };
    // eslint-disable-next-line
  }, [prep, roleMembers, buFilter, users, userMeta]);

  const shownUsers = useMemo(() => {
    if (!agg) return [];
    const s = userSearch.trim().toLowerCase();
    const list = agg.perUser.filter(u => !s || u.name.toLowerCase().includes(s) || u.bu.toLowerCase().includes(s));
    const cmp = { logins: (a, b) => b.logins - a.logins, days: (a, b) => b.days - a.days, last: (a, b) => (b.last || "").localeCompare(a.last || "") }[userSort];
    return list.sort(cmp);
  }, [agg, userSearch, userSort]);

  const exportUsers = (format = "csv") => {
    if (!agg) return;
    const rows = agg.perUser.map(u => [u.name, u.bu, u.logins, u.days, u.last ? new Date(u.last).toLocaleString() : ""]);
    exportTable(["user", "businessUnit", "logins", "activeDays", "lastLogin"], rows, `adoption_logins_${preset}`, format, "Adoption");
  };

  const KPI = ({ label, value, color, hint }) => (
    <div style={{ ...crd({ padding: "12px 16px" }), flex: 1, minWidth: 120 }}>
      <div style={{ fontSize: 22, fontWeight: 700, color: color || C.tx }}>{value}</div>
      <div style={{ fontSize: 11, color: C.txd, marginTop: 2 }}>{label}</div>
      {hint && <div style={{ fontSize: 10, color: C.txd, marginTop: 2 }}>{hint}</div>}
    </div>
  );

  // Inline trend chart. metric: "both" = login bars + distinct-user line; "logins" or "users" =
  // just that series as bars, scaled to its own max so it fills the height.
  const Chart = ({ series, metric }) => {
    const W = 900, H = 200, padL = 34, padB = 34, padT = 10, padR = 10;
    const n = series.length || 1;
    const maxL = Math.max(1, ...series.map(s => s.logins));
    const maxU = Math.max(1, ...series.map(s => s.users));
    const barVal = (s) => metric === "users" ? s.users : s.logins;
    const barMax = metric === "users" ? maxU : maxL;
    const barColor = metric === "users" ? C.cy : C.vi;
    const showLine = metric === "both";
    const bw = (W - padL - padR) / n;
    const x = (i) => padL + i * bw;
    const y = (v, max) => padT + (H - padT - padB) * (1 - v / max);
    const linePts = series.map((s, i) => `${x(i) + bw / 2},${y(s.users, maxL)}`).join(" ");
    const step = Math.ceil(n / 12);
    return (
      <div style={{ overflowX: "auto" }}>
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ minWidth: 520, display: "block" }} preserveAspectRatio="none">
          {[0, 0.5, 1].map(f => <line key={f} x1={padL} x2={W - padR} y1={y(barMax * f, barMax)} y2={y(barMax * f, barMax)} stroke={C.bd} strokeWidth="1" />)}
          {[0, 0.5, 1].map(f => <text key={"t" + f} x={padL - 4} y={y(barMax * f, barMax) + 3} fontSize="9" fill={C.txd} textAnchor="end">{Math.round(barMax * f)}</text>)}
          {series.map((s, i) => <rect key={i} x={x(i) + bw * 0.12} y={y(barVal(s), barMax)} width={bw * 0.76} height={Math.max(0, H - padB - y(barVal(s), barMax))} fill={barColor} opacity="0.7"><title>{`${s.label}: ${s.logins} logins · ${s.users} users`}</title></rect>)}
          {showLine && <polyline points={linePts} fill="none" stroke={C.cy} strokeWidth="1.5" />}
          {series.map((s, i) => (i % step === 0 ? <text key={"x" + i} x={x(i) + bw / 2} y={H - padB + 12} fontSize="8" fill={C.txd} textAnchor="middle">{s.label.slice(5)}</text> : null))}
        </svg>
        <div style={{ display: "flex", gap: 14, fontSize: 11, color: C.txm, marginTop: 4, paddingLeft: padL }}>
          {metric !== "users" && <span style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ width: 10, height: 10, background: C.vi, opacity: 0.7, borderRadius: 2 }} /> Logins</span>}
          {metric === "users" && <span style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ width: 10, height: 10, background: C.cy, opacity: 0.7, borderRadius: 2 }} /> Distinct users</span>}
          {metric === "both" && <span style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ width: 12, height: 2, background: C.cy }} /> Distinct users</span>}
        </div>
      </div>
    );
  };

  return (
    <div style={{ padding: bp.mobile ? 12 : 20, maxWidth: 1400, margin: "0 auto" }}>
      <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 4, display: "flex", alignItems: "center", gap: 8 }}>📈 {t("nav.adoption")}</h2>
      <p style={{ color: C.txm, fontSize: 14, marginBottom: 12 }}>{t("adoption.subtitle")}</p>

      {orgFeatures?.auditEnabled === false && <div style={{ padding: "10px 14px", background: C.yw + "14", border: `1px solid ${C.yw}44`, borderRadius: 8, color: C.yw, fontSize: 13, marginBottom: 14 }}>⚠ {t("featuregate.audit_off")}</div>}

      {/* Filters */}
      <div style={{ display: "flex", gap: 8, marginBottom: 14, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ display: "flex", border: `1px solid ${C.bd}`, borderRadius: 6, overflow: "hidden" }}>
          {[["7", "7 days"], ["30", "30 days"], ["90", "90 days"], ["custom", "Custom"]].map(([k, lbl]) => (
            <button key={k} onClick={() => setPreset(k)} style={{ padding: "5px 11px", fontSize: 12, border: "none", cursor: "pointer", background: preset === k ? C.vi + "22" : "transparent", color: preset === k ? C.vi : C.txm, fontWeight: preset === k ? 600 : 400 }}>{lbl}</button>
          ))}
        </div>
        {preset === "custom" && <>
          <input type="date" value={customFrom} min={MIN_ISO} max={customValid ? customTo : todayISO} onClick={openPicker} onFocus={openPicker} onChange={e => setCustomFrom(e.target.value)} style={inp({ width: "auto", fontSize: 12, padding: "5px 8px", ...(customValid ? {} : { borderColor: C.rd + "88" }) })} />
          <span style={{ color: C.txd }}>→</span>
          <input type="date" value={customTo} min={customValid ? customFrom : MIN_ISO} max={todayISO} onClick={openPicker} onFocus={openPicker} onChange={e => setCustomTo(e.target.value)} style={inp({ width: "auto", fontSize: 12, padding: "5px 8px", ...(customValid ? {} : { borderColor: C.rd + "88" }) })} />
          {!customValid && <span style={{ fontSize: 11, color: C.rd }}>Pick a valid range (from ≤ to, {MIN_ISO.slice(0, 4)}–today)</span>}
        </>}
        <select value={roleFilter} onChange={e => setRoleFilter(e.target.value)} style={inp({ width: "auto", maxWidth: 220, fontSize: 12, padding: "5px 8px" })}>
          <option value="">All security roles</option>
          {roleOptions.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
        <select value={buFilter} onChange={e => setBuFilter(e.target.value)} style={inp({ width: "auto", maxWidth: 220, fontSize: 12, padding: "5px 8px" })}>
          <option value="">All business units</option>
          {buOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        </select>
        {(loadingMembers || loading) && <Spin s={13} />}
        {loading && scanProg && scanProg.total > 1 && <span style={{ fontSize: 11, color: C.txd, ...mono }}>{scanProg.done}/{scanProg.total} days</span>}
        <div style={{ flex: 1 }} />
        <button onClick={() => exportUsers("csv")} disabled={!agg} style={bt(C.cy, { fontSize: 11, padding: "4px 10px", opacity: agg ? 1 : 0.5 })}><I.Download /> CSV</button>
        <button onClick={() => exportUsers("xlsx")} disabled={!agg} style={bt(C.cy, { fontSize: 11, padding: "4px 10px", opacity: agg ? 1 : 0.5 })}><I.Download /> Excel</button>
      </div>

      {error && <div style={{ ...crd({ padding: 14, borderColor: C.rd + "55" }), color: C.rd, fontSize: 13, marginBottom: 12 }}>{error}</div>}
      {loading && !agg && <div style={{ textAlign: "center", marginTop: 40 }}><Spin s={18} /> Aggregating login audit{scanProg && scanProg.total > 1 ? ` — day ${scanProg.done}/${scanProg.total}` : ""}…</div>}

      {agg && (<>
        {stats?.failedDays?.length > 0 && (
          <div style={{ ...crd({ padding: "8px 12px", background: C.rd + "0c", borderColor: C.rd + "55" }), marginBottom: 12, fontSize: 12, color: C.rd, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span>⚠ {stats.failedDays.length} day{stats.failedDays.length > 1 ? "s" : ""} failed to load ({stats.failedDays.slice(0, 4).join(", ")}{stats.failedDays.length > 4 ? "…" : ""}) — totals below EXCLUDE {stats.failedDays.length > 1 ? "them" : "it"}.</span>
            <button onClick={() => setRetryKey(k => k + 1)} disabled={loading} style={{ ...bt(C.rd, { fontSize: 11, padding: "3px 10px" }), opacity: loading ? 0.5 : 1 }}>Retry</button>
          </div>
        )}
        <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
          <KPI label="Total logins" value={agg.total.toLocaleString()} color={C.vi} />
          <KPI label="Distinct users signed in" value={agg.unique.toLocaleString()} color={C.cy} hint={agg.scopeCount ? `of ${agg.scopeCount.toLocaleString()} in scope` : undefined} />
          <KPI label="Avg logins / active user" value={agg.avg ? agg.avg.toFixed(1) : "0"} />
          <KPI label="Never signed in (window)" value={agg.never.length.toLocaleString()} color={agg.never.length ? C.rd : C.gn} hint="enabled users, 0 logins" />
        </div>

        <div style={{ ...crd({ padding: 14 }), marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>Per {agg.weekly ? "week" : "day"}{agg.weekly ? " (bucketed weekly — window over 92 days)" : ""}</span>
            <div style={{ flex: 1 }} />
            <div style={{ display: "flex", border: `1px solid ${C.bd}`, borderRadius: 5, overflow: "hidden" }}>
              {[["both", "Both"], ["logins", "Logins"], ["users", "Distinct users"]].map(([k, lbl]) => (
                <button key={k} onClick={() => setChartMetric(k)} style={{ padding: "3px 10px", fontSize: 11, border: "none", cursor: "pointer", background: chartMetric === k ? C.vi + "22" : "transparent", color: chartMetric === k ? C.vi : C.txm, fontWeight: chartMetric === k ? 600 : 400 }}>{lbl}</button>
              ))}
            </div>
          </div>
          {agg.series.some(s => s.logins > 0) ? <Chart series={agg.series} metric={chartMetric} /> : <div style={{ color: C.txd, fontSize: 12, padding: 10 }}>No logins in this window / filter.</div>}
        </div>

        <div style={{ display: "flex", gap: 8, marginBottom: 8, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>Per user</span>
          <input value={userSearch} onChange={e => setUserSearch(e.target.value)} placeholder="Filter users…" style={inp({ fontSize: 12, maxWidth: 200, padding: "4px 8px" })} />
          <div style={{ display: "flex", border: `1px solid ${C.bd}`, borderRadius: 5, overflow: "hidden" }}>
            {[["logins", "Most logins"], ["days", "Active days"], ["last", "Recent"]].map(([k, lbl]) => (
              <button key={k} onClick={() => setUserSort(k)} style={{ padding: "3px 9px", fontSize: 11, border: "none", cursor: "pointer", background: userSort === k ? C.cy + "22" : "transparent", color: userSort === k ? C.cy : C.txm }}>{lbl}</button>
            ))}
          </div>
          <span style={{ fontSize: 11, color: C.txd, ...mono }}>{shownUsers.length} users</span>
        </div>
        <div style={{ ...crd({ padding: 0, overflow: "hidden" }) }}>
          <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1.2fr 80px 90px 1fr", padding: "8px 14px", background: C.sfh, fontSize: 11, fontWeight: 700, color: C.txd, borderBottom: `1px solid ${C.bd}` }}>
            <span>User</span><span>Business Unit</span><span>Logins</span><span>Active days</span><span>Last login</span>
          </div>
          <div style={{ maxHeight: 460, overflow: "auto" }}>
            {shownUsers.length === 0 && <div style={{ padding: 14, color: C.txd, fontSize: 12 }}>No active users match.</div>}
            {shownUsers.map(u => (
              <div key={u.id} style={{ display: "grid", gridTemplateColumns: "1.6fr 1.2fr 80px 90px 1fr", padding: "5px 14px", fontSize: 12, borderBottom: `1px solid ${C.bd}22`, alignItems: "center" }}>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={u.name}>{u.name}</span>
                <span style={{ color: C.txm, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={u.bu}>{u.bu || "—"}</span>
                <span style={{ ...mono, color: C.vi }}>{u.logins.toLocaleString()}</span>
                <span style={{ ...mono, color: C.cy }}>{u.days}</span>
                <span style={{ color: C.txm, fontSize: 11 }}>{u.last ? new Date(u.last).toLocaleString() : "—"}</span>
              </div>
            ))}
          </div>
        </div>

        {agg.never.length > 0 && (
          <div style={{ ...crd({ padding: "10px 14px" }), marginTop: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.rd, marginBottom: 6 }}>Never signed in this window ({agg.never.length}) — enabled users, no login recorded</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 5, maxHeight: 140, overflow: "auto" }}>
              {agg.never.slice(0, 300).map(u => <span key={u.id} style={{ fontSize: 11, padding: "2px 8px", borderRadius: 4, background: C.sfh, color: C.txm }} title={u.buName}>{u.fullname || u.email || u.id}</span>)}
              {agg.never.length > 300 && <span style={{ fontSize: 11, color: C.txd }}>+{agg.never.length - 300} more (export for all)</span>}
            </div>
          </div>
        )}
      </>)}
    </div>
  );
}
