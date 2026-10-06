import { useState, useEffect, useMemo, useRef } from "react";
import { bridge } from "../d365-bridge.js";
import { C, I, Spin, mono, inp, bt, crd, exportTable, confirmProd } from "../shared.jsx";
import Tooltip from "./Tooltip.jsx";
import { t } from "../i18n.js";
import { isServiceAccount } from "../adoptionUtils.js";
import {
  SETTINGS_TABLES, settingsFor, findSetting, optionsFor, formatValue, buildPatchBody, indexRows, planChange,
  filterUsers, buOptions, exportRows, runPool, normalizeTimeZones, normalizeCurrencies,
} from "../userSettingsCatalog.js";

const DEFAULT_SETTING = { usersettings: "incomingemailfilteringmethod", mailbox: "incomingemaildeliverymethod" };
const CONCURRENCY = 4;
const RENDER_CAP = 500;
const TABLE_NOTES = {
  usersettings: "Each user's personal-settings row (usersettings) is PATCHed — writing other users' settings needs Write on User Settings (System Administrator has it). A user may need to refresh the app to see the change.",
  mailbox: "Each user's mailbox record is PATCHed — Read and Write on the Mailbox table are required. Changing a delivery method doesn't test the mailbox: run Test & Enable Mailbox afterwards from Power Platform admin center › Settings › Email › Mailboxes (an admin action, not a column — Colvio doesn't run it). Queue mailboxes aren't listed.",
};
const SOURCE_NAMES = { timezones: "Time zones", languages: "Provisioned languages", currencies: "Currencies" };

// Users & Licenses › Bulk settings — personal options and server-side-sync mailbox options for
// many users at once, with readable values (never raw codes or GUIDs). Users already at the
// chosen value are skipped; every write reports per user.
export default function BulkUserSettings({ bp, orgInfo, users, usersLoading, usersError, viewToggle }) {
  const [table, setTable] = useState("usersettings");
  const [settingKey, setSettingKey] = useState(DEFAULT_SETTING);
  const [data, setData] = useState({});              // table → { rows, more, loading, error }
  const [ctx, setCtx] = useState({ timezones: [], languages: [], currencies: [] });
  const [ctxErr, setCtxErr] = useState({});
  const [search, setSearch] = useState("");
  const [buId, setBuId] = useState("");
  const [status, setStatus] = useState("enabled");
  const [kind, setKind] = useState("people");
  const [roles, setRoles] = useState([]);
  const [role, setRole] = useState("");
  const [roleIds, setRoleIds] = useState(null);
  const [roleState, setRoleState] = useState({ loading: false, error: "" });
  const [checked, setChecked] = useState(() => new Set());
  const [newVal, setNewVal] = useState("");
  const [modal, setModal] = useState(null);         // { phase: confirm|running|done, … }
  const [lastRun, setLastRun] = useState(null);
  const [feedback, setFeedback] = useState("");
  const cancelRef = useRef(false);
  const loadGen = useRef({});
  const roleGen = useRef(0);
  const roleCache = useRef(new Map());

  const loadRows = (tb) => {
    const g = (loadGen.current[tb] || 0) + 1;
    loadGen.current[tb] = g;
    setData(d => ({ ...d, [tb]: { ...(d[tb] || {}), loading: true, error: "" } }));
    bridge.getSettingsRows(tb)
      .then(r => { if (loadGen.current[tb] === g) setData(d => ({ ...d, [tb]: { rows: r?.rows || [], more: !!r?.more, loading: false, error: "" } })); })
      // keep the previous rows on a failed RE-load, but never present them as fresh
      .catch(e => { if (loadGen.current[tb] === g) setData(d => ({ ...d, [tb]: { ...(d[tb] || {}), loading: false, error: e.message || String(e) } })); });
  };
  useEffect(() => { if (!data[table]) loadRows(table); }, [table]);

  useEffect(() => {
    let off = false;
    const grab = (key, p, norm) => p
      .then(v => { if (!off) setCtx(c => ({ ...c, [key]: norm(v) })); })
      .catch(e => { if (!off) setCtxErr(x => ({ ...x, [key]: e.message || String(e) })); });
    grab("timezones", bridge.getTimeZones(), normalizeTimeZones);
    grab("languages", bridge.getOrgLanguages(), v => (v || []).map(l => ({ code: Number(l.code), name: l.name })));
    grab("currencies", bridge.getCurrencies(), normalizeCurrencies);
    bridge.getAllRoles()
      .then(rs => { if (!off) setRoles([...new Set((rs || []).map(r => r.name).filter(Boolean))].sort((a, b) => a.localeCompare(b))); })
      .catch(e => { if (!off) setRoleState({ loading: false, error: "Roles: " + (e.message || String(e)) }); });
    return () => { off = true; };
  }, []);

  useEffect(() => {
    if (!modal) return;
    const onKey = (e) => { if (e.key === "Escape" && modal.phase !== "running") setModal(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [modal]);

  const pickRole = (name) => {
    const g = ++roleGen.current;
    setRole(name);
    if (!name) { setRoleIds(null); setRoleState({ loading: false, error: "" }); return; }
    if (roleCache.current.has(name)) { setRoleIds(roleCache.current.get(name)); setRoleState({ loading: false, error: "" }); return; }
    setRoleIds(new Set()); // nobody listed until the members are known — never the unfiltered list under a role label
    setRoleState({ loading: true, error: "" });
    bridge.getRoleMemberIds(name)
      .then(set => { roleCache.current.set(name, set); if (roleGen.current === g) { setRoleIds(set); setRoleState({ loading: false, error: "" }); } })
      .catch(e => { if (roleGen.current === g) { setRoleIds(new Set()); setRoleState({ loading: false, error: e.message || String(e) }); } });
  };

  const setting = findSetting(settingKey[table]);
  const cur = data[table];
  const index = useMemo(() => indexRows(table, cur?.rows, users), [table, cur?.rows, users]);
  const shown = useMemo(() => filterUsers(users, { search, buId, status, kind, roleIds }), [users, search, buId, status, kind, roleIds]);
  const bus = useMemo(() => buOptions(users), [users]);
  const writeOpts = useMemo(() => optionsFor(setting, ctx, { forWrite: true }), [setting, ctx]);
  const newOpt = writeOpts.find(o => String(o.value) === newVal) || null;
  const selIds = useMemo(() => shown.filter(u => checked.has(u.id)).map(u => u.id), [shown, checked]);
  const plan = useMemo(() => (newOpt && cur?.rows) ? planChange(selIds, index.byUser, setting, newOpt.value) : null, [newOpt, cur?.rows, selIds, index, setting]);
  const planSets = useMemo(() => plan ? { write: new Set(plan.write.map(w => w.userId)), same: new Set(plan.same) } : null, [plan]);
  const userById = useMemo(() => new Map((users || []).map(u => [String(u.id).toLowerCase(), u])), [users]);
  const runShown = lastRun && lastRun.table === table && lastRun.settingKey === setting.key ? lastRun : null;
  const allShownChecked = shown.length > 0 && shown.every(u => checked.has(u.id));
  const missingLabel = table === "mailbox" ? "no mailbox" : "no settings row";

  const switchTable = (tb) => { setTable(tb); setNewVal(""); };
  const switchSetting = (k) => { setSettingKey(s => ({ ...s, [table]: k })); setNewVal(""); };
  const toggleAll = () => setChecked(prev => { const n = new Set(prev); if (allShownChecked) shown.forEach(u => n.delete(u.id)); else shown.forEach(u => n.add(u.id)); return n; });
  const toggleOne = (id) => setChecked(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const doExport = (format) => {
    const { headers, rows } = exportRows(table, shown, index.byUser, ctx);
    exportTable(headers, rows, table === "mailbox" ? "user_mailboxes" : "user_settings", format, SETTINGS_TABLES[table].label);
    setFeedback(`${format === "xlsx" ? "Excel" : "CSV"} downloaded (${rows.length} user${rows.length === 1 ? "" : "s"})`);
    setTimeout(() => setFeedback(""), 2500);
  };

  const openConfirm = () => {
    if (!plan?.write.length || !newOpt) return;
    try { setModal({ phase: "confirm", table, setting, opt: newOpt, plan, body: buildPatchBody(setting, newOpt.value) }); }
    catch (e) { setFeedback("⚠ " + (e.message || String(e))); setTimeout(() => setFeedback(""), 4000); }
  };

  const run = async () => {
    const m = modal;
    if (!m || m.phase !== "confirm") return;
    const n = m.plan.write.length;
    if (!confirmProd(orgInfo?.isProduction, `Set "${m.setting.label}" to "${m.opt.label}" for ${n} user${n > 1 ? "s" : ""} (${SETTINGS_TABLES[m.table].label.toLowerCase()}).`)) return;
    cancelRef.current = false;
    setModal({ ...m, phase: "running", progress: { done: 0, failed: 0, total: n } });
    const out = await runPool(m.plan.write, w => bridge.updateSettingsRow(m.table, w.recordId, m.body), {
      concurrency: CONCURRENCY,
      shouldStop: () => cancelRef.current,
      isFatal: e => /SESSION_EXPIRED/.test(e),
      onProgress: p => setModal(x => (x && x.phase === "running") ? { ...x, progress: p } : x),
    });
    const byUser = new Map();
    m.plan.same.forEach(id => byUser.set(String(id).toLowerCase(), { ok: "same", error: "" }));
    out.results.forEach(r => byUser.set(String(r.item.userId).toLowerCase(), { ok: r.ok, error: r.error || "" }));
    out.notSent.forEach(w => byUser.set(String(w.userId).toLowerCase(), { ok: null, error: "Not sent — the run was stopped before this user" }));
    setLastRun({ table: m.table, settingKey: m.setting.key, label: m.opt.label, byUser });
    setModal({ ...m, phase: "done", out, cancelled: cancelRef.current });
    loadRows(m.table); // the current values come back from the server, not from our own bookkeeping
  };

  const keepOnlyRetry = () => {
    const out = modal?.out;
    if (!out) return;
    setChecked(new Set([...out.results.filter(r => !r.ok).map(r => r.item.userId), ...out.notSent.map(w => w.userId)]));
    setModal(null);
  };

  const chip = (on, color = C.cy) => ({ padding: "2px 8px", borderRadius: 4, fontSize: 11, border: `1px solid ${on ? color : C.bd}`, background: on ? color + "22" : "transparent", color: on ? color : C.txd, cursor: "pointer" });
  const stepLbl = { fontSize: 10, fontWeight: 700, letterSpacing: ".6px", color: C.txd, textTransform: "uppercase", minWidth: 96, display: "inline-flex", alignItems: "center", gap: 5 };
  const Step = ({ n, label }) => <span style={stepLbl}><span style={{ width: 16, height: 16, borderRadius: "50%", background: C.vi + "33", color: C.vil, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 10, letterSpacing: 0 }}>{n}</span>{label}</span>;
  const Badge = ({ label, color }) => <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 4, background: (color || C.txd) + "22", color: color || C.txd, fontWeight: 600, whiteSpace: "nowrap" }}>{label}</span>;
  const cols = bp?.mobile ? "26px 1.4fr 1.6fr" : `26px minmax(150px,1.2fr) minmax(170px,1.3fr) minmax(90px,.8fr) 120px minmax(200px,1.8fr)${runShown ? " minmax(110px,1fr)" : ""}`;
  const srcErr = setting.source && ctxErr[setting.source];
  const srcLoading = setting.source && SOURCE_NAMES[setting.source] && !srcErr && writeOpts.length === 0;

  let planText = "";
  if (!newOpt) planText = "Pick the new value";
  else if (!selIds.length) planText = "Tick the users to update";
  else if (!cur?.rows) planText = "Loading current values…";
  else if (plan) planText = [`${plan.write.length} will change`, plan.same.length && `${plan.same.length} already at this value`, plan.missing.length && `${plan.missing.length} with ${missingLabel}`].filter(Boolean).join(" · ");

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minWidth: 0 }}>
      <div style={{ padding: "12px 16px 10px", borderBottom: `1px solid ${C.bd}`, display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          {viewToggle}
          <span style={{ fontSize: 16, fontWeight: 700 }}>{t("licenses.view_bulk")}</span>
          <Tooltip text="Set personal options (email tracking, time zone, languages, currency, records per page…) or server-side synchronization mailbox options for many users at once — readable values instead of codes and GUIDs. Users already at the value are skipped; each write is reported per user." />
          <span style={{ marginLeft: "auto", display: "flex", gap: 6, alignItems: "center" }}>
            {feedback && <span style={{ fontSize: 11, color: feedback.startsWith("⚠") ? C.yw : C.gn }}>{feedback}</span>}
            <button onClick={() => loadRows(table)} disabled={cur?.loading} title="Reload the current values from the server" style={bt(null, { fontSize: 11, padding: "4px 10px" })}>{cur?.loading ? <Spin s={11} /> : "↻"} Values</button>
            <button onClick={() => doExport("csv")} disabled={!shown.length} style={bt(C.cy, { fontSize: 11, padding: "4px 10px" })}><I.Download /> CSV</button>
            <button onClick={() => doExport("xlsx")} disabled={!shown.length} style={bt(C.cy, { fontSize: 11, padding: "4px 10px" })}><I.Download /> Excel</button>
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <Step n={1} label="Setting" />
          <div style={{ display: "inline-flex", border: `1px solid ${C.bd}`, borderRadius: 6, overflow: "hidden" }}>
            {Object.values(SETTINGS_TABLES).map(tb => (
              <button key={tb.key} onClick={() => switchTable(tb.key)} style={{ padding: "4px 12px", fontSize: 12, border: "none", cursor: "pointer", background: table === tb.key ? C.vi + "33" : "transparent", color: table === tb.key ? C.tx : C.txd, fontWeight: table === tb.key ? 600 : 400 }}>{tb.label}</button>
            ))}
          </div>
          <select value={setting.key} onChange={e => switchSetting(e.target.value)} style={inp({ width: "auto", minWidth: 260, fontSize: 12, padding: "5px 8px" })}>
            {settingsFor(table).map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
          <span style={{ fontSize: 11, color: C.txd, ...mono }}>{setting.key}</span>
        </div>
        <div style={{ fontSize: 11.5, color: C.txm, lineHeight: 1.5, paddingLeft: 104 }}>{setting.help}</div>

        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <Step n={2} label="Users" />
          <input placeholder="Search name or email…" value={search} onChange={e => setSearch(e.target.value)} style={inp({ width: 200, fontSize: 12, padding: "5px 8px" })} />
          <select value={buId} onChange={e => setBuId(e.target.value)} style={inp({ width: "auto", maxWidth: 190, fontSize: 12, padding: "5px 8px" })}>
            <option value="">All business units</option>
            {bus.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
          <select value={role} onChange={e => pickRole(e.target.value)} title="Direct holders of the role, across every business-unit copy (a role inherited through a team doesn't count)" style={inp({ width: "auto", maxWidth: 190, fontSize: 12, padding: "5px 8px" })}>
            <option value="">All security roles</option>
            {roles.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
          {roleState.loading && <Spin s={11} />}
          {[["enabled", "Enabled"], ["disabled", "Disabled"], ["all", "All"]].map(([k, l]) => <button key={k} onClick={() => setStatus(k)} style={chip(status === k)}>{l}</button>)}
          <span style={{ width: 1, height: 16, background: C.bd, margin: "0 2px" }} />
          {[["people", "People"], ["service", "Service & app accounts"], ["all", "All"]].map(([k, l]) => <button key={k} onClick={() => setKind(k)} title={k === "people" ? "Non-interactive, support, delegated-admin and application users are left out — they never sign in" : undefined} style={chip(kind === k, C.vi)}>{l}</button>)}
        </div>
        {roleState.error && <div style={{ fontSize: 11.5, color: C.rd, paddingLeft: 104 }}>⚠ Role members couldn't be loaded — nobody is listed under that role: {roleState.error}</div>}

        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <Step n={3} label="New value" />
          <select value={newVal} onChange={e => setNewVal(e.target.value)} disabled={!writeOpts.length} style={inp({ width: "auto", minWidth: 260, maxWidth: 420, fontSize: 12, padding: "5px 8px" })}>
            <option value="">{srcLoading ? `Loading ${SOURCE_NAMES[setting.source].toLowerCase()}…` : "— pick the new value —"}</option>
            {writeOpts.map(o => <option key={String(o.value)} value={String(o.value)}>{o.label}</option>)}
          </select>
          {srcErr && <span style={{ fontSize: 11.5, color: C.rd }}>⚠ {SOURCE_NAMES[setting.source]} couldn't be loaded: {srcErr}</span>}
          <span style={{ fontSize: 12, color: plan?.write.length ? C.txm : C.txd }}>{planText}</span>
          <button onClick={openConfirm} disabled={!plan?.write.length || cur?.loading} style={bt(C.vi, { fontSize: 12, padding: "5px 14px", marginLeft: "auto", opacity: plan?.write.length && !cur?.loading ? 1 : 0.45 })}>
            Apply to {plan?.write.length || 0} user{plan?.write.length === 1 ? "" : "s"}
          </button>
        </div>
      </div>

      {usersError && <div style={{ padding: "8px 16px", color: C.rd, fontSize: 12 }}>⚠ Users couldn't be loaded: {usersError}</div>}
      {cur?.error && (
        <div style={{ padding: "8px 16px", color: C.rd, fontSize: 12, borderBottom: `1px solid ${C.bd}` }}>
          ⚠ Current {SETTINGS_TABLES[table].label.toLowerCase()} couldn't be loaded{cur.rows ? " — the values shown are from the previous load" : ""}: {cur.error}
          <button onClick={() => loadRows(table)} style={{ ...bt(null, { fontSize: 11, padding: "2px 8px" }), marginLeft: 8 }}>↻ Retry</button>
        </div>
      )}
      {cur?.more && <div style={{ padding: "6px 16px", color: C.yw, fontSize: 11.5 }}>⚠ The server had more rows than Colvio pages through (250,000) — users past that point show "{missingLabel}".</div>}
      {table === "mailbox" && index.duplicates > 0 && <div style={{ padding: "6px 16px", color: C.txd, fontSize: 11.5 }}>ℹ {index.duplicates} extra mailbox{index.duplicates > 1 ? "es" : ""} regarding the same users — the non-forward mailbox is the one shown and written.</div>}

      <div style={{ flex: 1, overflow: "auto", minHeight: 0 }}>
        <div style={{ display: "grid", gridTemplateColumns: cols, gap: 8, padding: "6px 16px", position: "sticky", top: 0, background: C.sf, borderBottom: `2px solid ${C.bd}`, fontSize: 11, fontWeight: 600, color: C.txd, zIndex: 1, alignItems: "center" }}>
          <input type="checkbox" checked={allShownChecked} onChange={toggleAll} disabled={!shown.length} title={`Select all ${shown.length} listed users (beyond the ${RENDER_CAP} rendered too)`} style={{ accentColor: C.vi }} />
          <span>Name</span><span>Email</span>
          {!bp?.mobile && <><span>Business unit</span><span>Status</span><span>Current: {setting.label}</span>{runShown && <span>Last run</span>}</>}
        </div>
        {usersLoading && <div style={{ textAlign: "center", padding: 24 }}><Spin /> {t("licenses.loading")}</div>}
        {!usersLoading && shown.length === 0 && <div style={{ textAlign: "center", padding: 24, color: C.txd, fontSize: 13 }}>{roleState.loading ? "Loading the role's members…" : "No user matches these filters."}</div>}
        {shown.slice(0, RENDER_CAP).map(u => {
          const k = String(u.id).toLowerCase();
          const hit = index.byUser.get(k);
          const isChecked = checked.has(u.id);
          const rr = runShown?.byUser.get(k);
          return (
            <div key={u.id} onClick={() => toggleOne(u.id)} style={{ display: "grid", gridTemplateColumns: cols, gap: 8, padding: "5px 16px", alignItems: "center", fontSize: 12.5, borderBottom: `1px solid ${C.bd}44`, cursor: "pointer", background: isChecked ? C.vi + "10" : "transparent" }}>
              <input type="checkbox" checked={isChecked} onChange={() => toggleOne(u.id)} onClick={e => e.stopPropagation()} style={{ accentColor: C.vi }} />
              <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={u.title ? `${u.fullname} — ${u.title}` : u.fullname}>{u.fullname || "(no name)"}</span>
              <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: C.txm, ...mono, fontSize: 11 }}>{u.email || "—"}</span>
              {!bp?.mobile && <>
                <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: C.txm, fontSize: 11.5 }}>{u.buName || "—"}</span>
                <span style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
                  <Badge label={u.disabled ? "Disabled" : "Enabled"} color={u.disabled ? C.rd : C.gn} />
                  {isServiceAccount(u) && <Badge label="Service" color={C.or} />}
                </span>
                <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {!cur?.rows ? (cur?.loading ? <Spin s={10} /> : "—")
                    : !hit ? <i style={{ color: C.txd }}>({missingLabel})</i>
                    : <>
                      <span title={formatValue(setting, hit.row, ctx)}>{formatValue(setting, hit.row, ctx)}</span>
                      {isChecked && planSets?.write.has(u.id) && <span style={{ color: C.vil, fontWeight: 600 }}> → {newOpt.label}</span>}
                      {isChecked && planSets?.same.has(u.id) && <span style={{ color: C.txd }}> · unchanged</span>}
                    </>}
                </span>
                {runShown && <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 11.5, color: !rr || rr.ok === "same" ? C.txd : rr.ok ? C.gn : rr.ok === null ? C.yw : C.rd }} title={rr?.error || ""}>
                  {!rr ? "" : rr.ok === "same" ? "= already set" : rr.ok ? "✓ written" : rr.ok === null ? "⏸ not sent" : `✗ ${rr.error}`}
                </span>}
              </>}
            </div>
          );
        })}
        {shown.length > RENDER_CAP && <div style={{ padding: "8px 16px", fontSize: 11, color: C.yw }}>⚠ Showing the first {RENDER_CAP} of {shown.length.toLocaleString()} users — refine the filters. Select-all, apply and export cover all {shown.length.toLocaleString()}.</div>}
      </div>

      <div style={{ padding: "8px 16px", borderTop: `1px solid ${C.bd}`, fontSize: 11, color: C.txd, lineHeight: 1.5, display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
        <span style={{ ...mono, color: C.txm }}>{shown.length} listed · {selIds.length} selected</span>
        <span style={{ flex: 1, minWidth: 260 }}>{TABLE_NOTES[table]}</span>
      </div>

      {modal && (() => {
        const m = modal;
        const n = m.plan.write.length;
        const nameOf = (id) => userById.get(String(id).toLowerCase())?.fullname || id;
        const out = m.out;
        const ok = out ? out.results.filter(r => r.ok).length : 0;
        const ko = out ? out.results.filter(r => !r.ok) : [];
        const pct = m.progress ? Math.round((m.progress.done / Math.max(1, m.progress.total)) * 100) : 0;
        return (
          <div onClick={() => m.phase !== "running" && setModal(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", zIndex: 265, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div onClick={e => e.stopPropagation()} style={{ ...crd({ padding: 18, borderRadius: 12 }), width: 560, maxWidth: "92vw", maxHeight: "86vh", display: "flex", flexDirection: "column" }}>
              <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 10 }}>
                {m.phase === "done" ? "Result" : `Apply to ${n} user${n > 1 ? "s" : ""}`} — {m.setting.label}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "150px 1fr", gap: "4px 10px", fontSize: 12.5, marginBottom: 10 }}>
                <span style={{ color: C.txd }}>Table</span><span>{SETTINGS_TABLES[m.table].label} <span style={{ color: C.txd, ...mono, fontSize: 11 }}>({SETTINGS_TABLES[m.table].entitySet})</span></span>
                <span style={{ color: C.txd }}>New value</span><span style={{ fontWeight: 600 }}>{m.opt.label}</span>
                <span style={{ color: C.txd }}>{m.phase === "done" ? "Writes planned" : "Will be written"}</span><span style={{ fontWeight: 600 }}>{n} user{n > 1 ? "s" : ""}</span>
                {m.plan.same.length > 0 && <><span style={{ color: C.txd }}>Skipped (unchanged)</span><span>{m.plan.same.length} already at this value</span></>}
                {m.plan.missing.length > 0 && <><span style={{ color: C.txd }}>Skipped ({missingLabel})</span><span>{m.plan.missing.length}</span></>}
              </div>

              {m.phase === "confirm" && <>
                <div style={{ fontSize: 12, color: C.txm, lineHeight: 1.55, padding: "8px 12px", borderRadius: 8, background: C.bg, border: `1px solid ${C.bd}` }}>
                  {m.setting.help}
                  <div style={{ marginTop: 6, color: C.txd }}>{TABLE_NOTES[m.table]}</div>
                  <div style={{ marginTop: 6, color: C.txd }}>Writes run {CONCURRENCY} at a time. Cancel stops the writes not yet sent — those already written stay written.</div>
                </div>
                {orgInfo?.isProduction && <div style={{ marginTop: 8, fontSize: 12, color: C.rd, fontWeight: 600 }}>⚠ PRODUCTION environment — you'll be asked to confirm.</div>}
                <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 14 }}>
                  <button onClick={() => setModal(null)} style={bt(null, { fontSize: 12 })}>Cancel</button>
                  <button onClick={run} style={bt(C.vi, { fontSize: 12 })}>Apply to {n} user{n > 1 ? "s" : ""}</button>
                </div>
              </>}

              {m.phase === "running" && m.progress && <>
                <div style={{ height: 8, borderRadius: 4, background: C.bg, border: `1px solid ${C.bd}`, overflow: "hidden" }}>
                  <div style={{ width: `${pct}%`, height: "100%", background: C.vi, transition: "width .2s" }} />
                </div>
                <div style={{ fontSize: 12, color: C.txm, marginTop: 6, ...mono }}>{m.progress.done} / {m.progress.total} done{m.progress.failed ? ` · ${m.progress.failed} failed` : ""}</div>
                <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 14 }}>
                  <button onClick={() => { cancelRef.current = true; setModal(x => x ? { ...x, stopping: true } : x); }} disabled={m.stopping} style={bt(null, { fontSize: 12 })}>
                    {m.stopping ? <><Spin s={11} /> Stopping after the writes in flight…</> : "✕ Cancel the remaining writes"}
                  </button>
                </div>
              </>}

              {m.phase === "done" && out && <>
                <div style={{ fontSize: 13, marginBottom: 6 }}>
                  <span style={{ color: C.gn }}>✓ {ok} written</span>
                  {ko.length > 0 && <span style={{ color: C.rd }}> · ✗ {ko.length} failed</span>}
                  {out.notSent.length > 0 && <span style={{ color: C.yw }}> · ⏸ {out.notSent.length} not sent</span>}
                </div>
                {m.cancelled && <div style={{ fontSize: 12, color: C.yw, marginBottom: 6 }}>Cancelled: the {ok + ko.length} write{ok + ko.length === 1 ? "" : "s"} already sent ran to the end — the successful ones stay written. The {out.notSent.length} not sent are untouched.</div>}
                {!m.cancelled && out.stopped && <div style={{ fontSize: 12, color: C.rd, marginBottom: 6 }}>Stopped: the session expired — refresh Dynamics 365 and retry the users not sent.</div>}
                <div style={{ flex: 1, overflow: "auto", border: `1px solid ${C.bd}`, borderRadius: 8, maxHeight: 280 }}>
                  {[...ko.map(r => ({ id: r.item.userId, st: "ko", error: r.error })), ...out.notSent.map(w => ({ id: w.userId, st: "ns" })), ...out.results.filter(r => r.ok).map(r => ({ id: r.item.userId, st: "ok" }))].map(r => (
                    <div key={r.id} style={{ padding: "5px 10px", borderBottom: `1px solid ${C.bd}44`, fontSize: 12, display: "flex", gap: 8 }}>
                      <span style={{ color: r.st === "ok" ? C.gn : r.st === "ko" ? C.rd : C.yw, width: 14, flexShrink: 0 }}>{r.st === "ok" ? "✓" : r.st === "ko" ? "✗" : "⏸"}</span>
                      <span style={{ minWidth: 0 }}>
                        <span style={{ fontWeight: 500 }}>{nameOf(r.id)}</span>
                        {r.st === "ko" && <div style={{ color: C.rd, fontSize: 11.5, wordBreak: "break-word" }}>{r.error}</div>}
                        {r.st === "ns" && <span style={{ color: C.txd }}> — not sent</span>}
                      </span>
                    </div>
                  ))}
                </div>
                <div style={{ fontSize: 11.5, color: C.txd, marginTop: 6 }}>The current values were reloaded from the server.</div>
                <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
                  {(ko.length > 0 || out.notSent.length > 0) && <button onClick={keepOnlyRetry} style={bt(null, { fontSize: 12 })}>Select only the {ko.length + out.notSent.length} to retry</button>}
                  <button onClick={() => setModal(null)} style={bt(C.vi, { fontSize: 12 })}>Close</button>
                </div>
              </>}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
