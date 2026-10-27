import { useState, useEffect, useRef } from "react";
import { bridge } from "../d365-bridge.js";
import { C, Spin, mono, inp, bt, crd, exportTable } from "../shared.jsx";
import { diagnoseAccess, rowVerdict, pathText, RIGHT_LABEL, DEPTH_LABEL, ACCESS_MODE, ACCESS_HEADERS, accessExportRows, parseAccessRights } from "../accessDiagnosis.js";
import { DEMO_ACCESS_USERS } from "../accessDemo.js";

const TEAM_TYPE = { 0: "owner team", 1: "access team", 2: "Entra security group", 3: "Microsoft 365 group" };

// Show All Data › 🔐 Record access — why can (can't) a user see or edit this record. Dataverse's own
// answer per right (RetrievePrincipalAccess), explained from roles, teams, business units and
// shares, with what would grant a missing right. Read-only.
export default function RecordAccess({ record, orgInfo }) {
  const live = !!orgInfo?.isExtension;
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [found, setFound] = useState([]);
  const [searching, setSearching] = useState(false);
  const [user, setUser] = useState(null);
  const [state, setState] = useState(null); // { phase: loading|done|error, ctx, diag, error }
  const [expanded, setExpanded] = useState({});
  const gen = useRef(0);
  const searchGen = useRef(0);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { setFound([]); return undefined; }
    const my = ++searchGen.current;
    const h = setTimeout(async () => {
      setSearching(true);
      try {
        const list = live
          ? (await bridge.searchUsers(term) || []).map(u => ({ id: u.id, name: u.fullname || "", email: u.email || "", disabled: !!u.disabled }))
          : DEMO_ACCESS_USERS.filter(u => `${u.name} ${u.email}`.toLowerCase().includes(term.toLowerCase()));
        if (searchGen.current === my) setFound(list);
      } catch { if (searchGen.current === my) setFound([]); }
      finally { if (searchGen.current === my) setSearching(false); }
    }, 300);
    return () => clearTimeout(h);
  }, [q, live]);

  const check = async (u) => {
    const my = ++gen.current;
    setUser(u); setFound([]); setQ(""); setExpanded({});
    setState({ phase: "loading" });
    try {
      const ctx = await bridge.getAccessContext({ entity: record.entity, entitySet: record.entitySet, recordId: record.id, userId: u.id, record });
      if (gen.current !== my) return;
      setState({ phase: "done", ctx, diag: diagnoseAccess(ctx) });
    } catch (e) { if (gen.current === my) setState({ phase: "error", error: e.message || String(e) }); }
  };
  const checkMe = async () => {
    if (!live) { check(DEMO_ACCESS_USERS[0]); return; }
    try {
      const r = await bridge.queryRaw("WhoAmI()");
      const id = r?.records?.[0]?.UserId;
      if (id) check({ id, name: "You" });
    } catch (e) { setState({ phase: "error", error: e.message || String(e) }); }
  };

  const ctx = state?.ctx, diag = state?.diag;
  const truthOk = (r) => r.granted ?? r.model;
  const exportIt = (fmt) => exportTable(ACCESS_HEADERS, accessExportRows(diag.rows), `access_${record.entity}_${(ctx.user?.name || "user").replace(/\W+/g, "_")}`, fmt, "Access");

  return (
    <div style={{ ...crd({ padding: "12px 16px" }), marginBottom: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span onClick={() => setOpen(o => !o)} style={{ fontWeight: 700, fontSize: 14, cursor: "pointer" }}>🔐 Record access {open ? "▲" : "▼"}</span>
        <span style={{ fontSize: 12, color: C.txd }}>why a user can — or can't — see or edit this record</span>
      </div>
      {open && <div style={{ marginTop: 10 }}>
        <div style={{ display: "flex", gap: 6, alignItems: "center", position: "relative", maxWidth: 520 }}>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search a user by name or email…" style={inp({ fontSize: 13, flex: 1 })} />
          {searching && <Spin s={11} />}
          <button onClick={checkMe} title="Check your own access" style={bt(null, { fontSize: 12, padding: "4px 10px" })}>Me</button>
          {found.length > 0 && <div style={{ position: "absolute", top: "100%", left: 0, right: 60, zIndex: 20, background: C.sf, border: `1px solid ${C.bd}`, borderRadius: 6, marginTop: 2, maxHeight: 260, overflow: "auto", boxShadow: "0 8px 24px rgba(0,0,0,.35)" }}>
            {found.map(u => (
              <div key={u.id} onClick={() => check(u)} style={{ padding: "6px 10px", cursor: "pointer", fontSize: 13, borderBottom: `1px solid ${C.bd}55` }} onMouseEnter={e => e.currentTarget.style.background = C.sfh} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                <b>{u.name}</b> <span style={{ color: C.txd, fontSize: 12 }}>{u.email}</span>{u.disabled && <span style={{ color: C.rd, fontSize: 11, marginLeft: 6 }}>disabled</span>}
              </div>
            ))}
          </div>}
        </div>

        {state?.phase === "loading" && <div style={{ display: "flex", alignItems: "center", gap: 8, color: C.txm, fontSize: 13, marginTop: 10 }}><Spin s={12} /> Reading {user?.name || "the user"}'s roles, teams, the record's owner and shares, and asking Dataverse…</div>}
        {state?.phase === "error" && <div style={{ color: C.rd, fontSize: 13, marginTop: 10 }}>Couldn't check the access: {state.error}{user && <button onClick={() => check(user)} style={{ ...bt(null, { fontSize: 12 }), marginLeft: 8 }}>↻ Retry</button>}</div>}

        {state?.phase === "done" && <div style={{ marginTop: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
            <span style={{ fontWeight: 700, fontSize: 14 }}>{ctx.user.name || user?.name}</span>
            <span style={{ fontSize: 12, color: C.txd }}>business unit {diag.tree.nameOf(ctx.user.buId) || ctx.user.buName || "?"} · {ctx.user.roles.length} role{ctx.user.roles.length === 1 ? "" : "s"} · {ctx.teams.length} team{ctx.teams.length === 1 ? "" : "s"}</span>
            <span style={{ flex: 1 }} />
            <button onClick={() => exportIt("csv")} style={bt(null, { fontSize: 11.5, padding: "3px 9px" })}>CSV</button>
            <button onClick={() => exportIt("xlsx")} style={bt(null, { fontSize: 11.5, padding: "3px 9px" })}>Excel</button>
          </div>
          {diag.facts.map((f, i) => <div key={i} style={{ fontSize: 12.5, color: f.level === "error" ? C.rd : f.level === "warn" ? C.yw : C.txd, marginBottom: 3 }}>{f.level === "info" ? "ℹ" : "⚠"} {f.text}</div>)}
          <div style={{ fontSize: 12.5, color: C.txm, marginBottom: 4 }}>📍 {diag.position}</div>
          {ctx.origin && <div style={{ fontSize: 12.5, color: C.txm, marginBottom: 8 }}>Dataverse: <i>“{ctx.origin}”</i></div>}
          {!ctx.origin && ctx.originError && <div style={{ fontSize: 12, color: C.txd, marginBottom: 8 }}>Dataverse's own sentence (RetrieveAccessOrigin) isn't available here: {ctx.originError}</div>}
          {ctx.effectiveError && <div style={{ fontSize: 12, color: C.yw, marginBottom: 8 }}>Dataverse's own answer couldn't be read ({ctx.effectiveError}) — the rights below are Colvio's reading of roles, teams and shares only.</div>}

          <div style={{ border: `1px solid ${C.bd}`, borderRadius: 6, overflow: "hidden" }}>
            {diag.rows.map(r => {
              const ok = truthOk(r);
              const color = !r.applicable ? C.txd : ok ? C.gn : C.rd;
              return (
                <div key={r.right} style={{ borderBottom: `1px solid ${C.bd}`, padding: "7px 10px", background: C.bg }}>
                  <div style={{ display: "flex", gap: 10, alignItems: "baseline", cursor: r.paths.length ? "pointer" : "default" }} onClick={() => r.paths.length && setExpanded(x => ({ ...x, [r.right]: !x[r.right] }))}>
                    <span style={{ width: 18, color, fontWeight: 700 }}>{!r.applicable ? "–" : ok ? "✓" : "✗"}</span>
                    <span style={{ width: 82, fontWeight: 600, fontSize: 13 }}>{RIGHT_LABEL[r.right]}</span>
                    <span style={{ flex: 1, fontSize: 12.5, color: C.txm }}>{rowVerdict(r)}</span>
                    {r.paths.length > 0 && <span style={{ fontSize: 11, color: C.txd }}>{expanded[r.right] ? "▲" : `${r.paths.length} path${r.paths.length === 1 ? "" : "s"}${r.fixes && r.fixes.length > 1 ? ` · ${r.fixes.length - 1} more fix${r.fixes.length > 2 ? "es" : ""}` : ""} ▼`}</span>}
                  </div>
                  {r.mismatch && <div style={{ fontSize: 12, color: C.yw, margin: "3px 0 0 28px" }}>⚠ {r.mismatch}</div>}
                  {r.fixes && r.fixes.length > 0 && <div style={{ margin: "3px 0 0 28px" }}>{(expanded[r.right] ? r.fixes : r.fixes.slice(0, 1)).map((f, i) => <div key={i} style={{ fontSize: 12, color: C.txd }}>→ {f}</div>)}</div>}
                  {expanded[r.right] && <div style={{ margin: "4px 0 0 28px" }}>{r.paths.map((p, i) => <div key={i} style={{ fontSize: 12, color: p.ok ? C.gn : C.txd, ...mono }}>{p.ok ? "✓" : "✗"} {pathText(p)}</div>)}</div>}
                </div>
              );
            })}
          </div>

          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 10, fontSize: 12.5 }}>
            <div style={{ flex: "1 1 260px" }}>
              <div style={{ fontWeight: 700, fontSize: 12, color: C.txd, textTransform: "uppercase", letterSpacing: .4, marginBottom: 4 }}>Roles and teams</div>
              {ctx.user.roles.map(r => <div key={r.id} style={{ color: C.txm }}>role <b>{r.name}</b>{r.buId && ctx.user.buId && r.buId.toLowerCase() !== ctx.user.buId.toLowerCase() ? ` — assigned in ${diag.tree.nameOf(r.buId) || "another BU"}` : ""}</div>)}
              {ctx.teams.map(t => <div key={t.id} style={{ color: C.txm }}>{TEAM_TYPE[t.type] || "team"} <b>{t.name}</b> ({diag.tree.nameOf(t.buId) || "?"}){t.roles.length ? ` › ${t.roles.map(r => r.name).join(", ")}` : " — no role"}</div>)}
              {!ctx.user.roles.length && !ctx.teams.length && <div style={{ color: C.txd }}>none</div>}
            </div>
            <div style={{ flex: "1 1 260px" }}>
              <div style={{ fontWeight: 700, fontSize: 12, color: C.txd, textTransform: "uppercase", letterSpacing: .4, marginBottom: 4 }}>Shared with</div>
              {ctx.sharesError && <div style={{ color: C.yw }}>Couldn't read the shares: {ctx.sharesError}</div>}
              {(ctx.shares || []).map((s, i) => {
                const mine = s.principalId.toLowerCase() === ctx.user.id.toLowerCase();
                const myTeam = ctx.teams.some(t => t.id.toLowerCase() === s.principalId.toLowerCase());
                return <div key={i} style={{ color: mine || myTeam ? C.gn : C.txm }}>{s.principalType === "team" ? "team " : ""}<b>{s.name || s.principalId}</b> — {[...parseAccessRights(s.mask)].map(x => RIGHT_LABEL[x] || x).join(", ") || "no right"}{mine ? " ← this user" : myTeam ? " ← a team of this user" : ""}</div>;
              })}
              {ctx.shares && !ctx.shares.length && <div style={{ color: C.txd }}>not shared</div>}
            </div>
          </div>
          <div style={{ fontSize: 11.5, color: C.txd, marginTop: 10, lineHeight: 1.5 }}>Read-only. The ✓ / ✗ are Dataverse's own answer (RetrievePrincipalAccess); the explanation is rebuilt from the user's roles and teams ({[1, 2, 4, 8].map(d => DEPTH_LABEL[d]).join(" / ")} depths), business units, owner and shares. Not modeled: hierarchy security, access inherited from a related record, and column-level (field) security. Access mode: {ACCESS_MODE[ctx.user.accessMode] || ctx.user.accessMode}.</div>
        </div>}
      </div>}
    </div>
  );
}
