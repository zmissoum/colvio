import { useState, useEffect, useMemo, useRef } from "react";
import { bridge } from "../d365-bridge.js";
import { C, Spin, mono, inp, bt, crd, ths, tds, exportTable } from "../shared.jsx";
import { buildWhoRunsWhat, parseFlowConnections, kindCounts, KIND, IDENTITY_HEADERS, identityExportRows, CONNECTION_HEADERS, connectionExportRows } from "../identities.js";

const KIND_COLOR = { app: () => C.vi, msapp: () => C.txd, builtin: () => C.txd, noninteractive: () => C.cy, service: () => C.cy, person: () => C.yw, support: () => C.txd, delegated: () => C.or, team: () => C.gn, external: () => C.or, unknown: () => C.txd };
const Kind = ({ k, label, hint }) => <span title={hint || KIND[k]?.hint} style={{ fontSize: 10.5, padding: "2px 7px", borderRadius: 4, fontWeight: 600, whiteSpace: "nowrap", cursor: "help", background: (KIND_COLOR[k] || KIND_COLOR.unknown)() + "22", color: (KIND_COLOR[k] || KIND_COLOR.unknown)() }}>{label || KIND[k]?.label || k}</span>;

// "owns|Cloud flow" ×3 → "owns 3 cloud flows"
function useSummary(uses) {
  const m = new Map();
  for (const u of uses) { const k = `${u.what}|${u.kind}`; m.set(k, (m.get(k) || 0) + 1); }
  return [...m.entries()].map(([k, n]) => { const [what, kind] = k.split("|"); return `${what} ${n} ${kind.toLowerCase()}${n > 1 && !/\)$/.test(kind) ? "s" : ""}`; });
}

// Automation › 👤 Who runs it — every identity that makes something run, what kind it is, what it runs.
export default function WhoRunsIt({ steps, procs }) {
  const [base, setBase] = useState(null);     // { refs, instances, instancesMissing }
  const [users, setUsers] = useState([]);
  const [error, setError] = useState("");
  const [flowConns, setFlowConns] = useState({});
  const [flowRead, setFlowRead] = useState({ phase: "idle", done: 0 });
  const [view, setView] = useState("identities");
  const [kind, setKind] = useState("all");
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState({});
  const stop = useRef(false);

  useEffect(() => {
    let alive = true;
    stop.current = false;
    (async () => {
      try {
        const b = await bridge.getWhoRunsData();
        if (!alive) return;
        setBase(b);
        const ids = new Set();
        for (const p of procs || []) if (p.ownerId && p.ownerType !== "team") ids.add(p.ownerId);
        for (const s of steps || []) if (s.runAsId) ids.add(s.runAsId);
        for (const r of b.refs || []) if (r.ownerId && r.ownerType !== "team") ids.add(r.ownerId);
        const accounts = [...new Set((b.instances || []).map(i => i.accountName).filter(Boolean))];
        const us = await bridge.getIdentityUsers([...ids], accounts);
        if (!alive) return;
        setUsers(us || []);
        // every cloud flow definition, page by page, for the connections it uses
        setFlowRead({ phase: "reading", done: 0 });
        let next = null, done = 0;
        const acc = {};
        do {
          if (stop.current || !alive) break;
          const page = await bridge.getFlowDefinitionsPage(next);
          for (const row of page.rows || []) acc[String(row.id).toLowerCase()] = parseFlowConnections(row.clientdata);
          done += (page.rows || []).length;
          next = page.next;
          if (alive) { setFlowConns({ ...acc }); setFlowRead({ phase: "reading", done }); }
        } while (next);
        if (alive) setFlowRead({ phase: stop.current ? "stopped" : "done", done });
      } catch (e) { if (alive) { setError(e.message || String(e)); setFlowRead(f => (f.phase === "reading" ? { ...f, phase: "failed" } : f)); } }
    })();
    return () => { alive = false; stop.current = true; };
  }, [steps, procs]);

  const result = useMemo(() => {
    if (!base) return null;
    const byId = {}, byAcc = {};
    for (const u of users) {
      byId[String(u.systemuserid).toLowerCase()] = u;
      for (const a of [u.domainname, u.internalemailaddress]) if (a) byAcc[String(a).toLowerCase()] = u;
    }
    return buildWhoRunsWhat({ procs, steps, refs: base.refs, instances: base.instances, flowConns, users: byId, usersByAccount: byAcc, integrationUsers: users });
  }, [base, users, flowConns, procs, steps]);

  if (error && !result) return <div style={{ ...crd({ padding: 14, borderColor: C.rd + "55" }), color: C.rd, fontSize: 13 }}>Couldn't read who runs what: {error}</div>;
  if (!result) return <div style={{ textAlign: "center", marginTop: 30, color: C.txm, fontSize: 13 }}><Spin s={14} /> Reading connection references, connections and the identities behind them…</div>;

  const counts = kindCounts(result.identities);
  const s = search.trim().toLowerCase();
  const idents = result.identities.filter(i => (kind === "all" || i.kind === kind) && (!s || [i.name, i.email, ...i.uses.map(u => u.name)].some(v => String(v || "").toLowerCase().includes(s))));
  const conns = result.connections.filter(c => !s || [c.name, c.logicalName, c.connector, c.account, c.owner, ...c.flows.map(f => f.name)].some(v => String(v || "").toLowerCase().includes(s)));
  const exp = (fmt) => view === "identities"
    ? exportTable(IDENTITY_HEADERS, identityExportRows(idents), "who_runs_it_identities", fmt, "Identities")
    : exportTable(CONNECTION_HEADERS, connectionExportRows(conns), "who_runs_it_connections", fmt, "Connections");

  return (
    <div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 8 }}>
        {[["identities", `Identities (${result.identities.length})`], ["connections", `Connections (${result.connections.length})`]].map(([k, l]) => (
          <button key={k} onClick={() => setView(k)} style={{ padding: "4px 11px", fontSize: 12, border: `1px solid ${view === k ? C.vi : C.bd}`, borderRadius: 5, cursor: "pointer", background: view === k ? C.vi + "22" : "transparent", color: view === k ? C.vi : C.txm, fontWeight: view === k ? 600 : 400 }}>{l}</button>
        ))}
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 Filter by name, email, flow, connector…" style={inp({ fontSize: 12, maxWidth: 300, padding: "5px 9px" })} />
        <span style={{ flex: 1 }} />
        {flowRead.phase === "reading" && <span style={{ fontSize: 11.5, color: C.txm }}><Spin s={9} /> reading flow definitions · {flowRead.done} <button onClick={() => { stop.current = true; }} style={bt(null, { fontSize: 10.5, padding: "1px 7px", marginLeft: 4 })}>Stop</button></span>}
        {flowRead.phase === "stopped" && <span style={{ fontSize: 11.5, color: C.yw }}>flow definitions: stopped after {flowRead.done} — the flows-per-connection counts are partial</span>}
        {flowRead.phase === "failed" && <span style={{ fontSize: 11.5, color: C.rd }}>flow definitions couldn't all be read{error ? `: ${error}` : ""} — the flows-per-connection counts are partial</span>}
        <button onClick={() => exp("csv")} style={bt(C.cy, { fontSize: 11, padding: "4px 10px" })}>CSV</button>
        <button onClick={() => exp("xlsx")} style={bt(C.cy, { fontSize: 11, padding: "4px 10px" })}>Excel</button>
      </div>

      {view === "identities" && <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 10 }}>
        <button onClick={() => setKind("all")} style={{ padding: "3px 9px", fontSize: 11.5, border: `1px solid ${C.bd}`, borderRadius: 4, cursor: "pointer", background: kind === "all" ? C.vi : "transparent", color: kind === "all" ? "white" : C.txm }}>All ({result.identities.length})</button>
        {Object.entries(counts).map(([k, n]) => <button key={k} onClick={() => setKind(k)} title={KIND[k]?.hint} style={{ padding: "3px 9px", fontSize: 11.5, border: `1px solid ${kind === k ? (KIND_COLOR[k] || KIND_COLOR.unknown)() : C.bd}`, borderRadius: 4, cursor: "pointer", background: kind === k ? (KIND_COLOR[k] || KIND_COLOR.unknown)() + "22" : "transparent", color: (KIND_COLOR[k] || KIND_COLOR.unknown)() }}>{KIND[k]?.label || k} ({n})</button>)}
      </div>}

      {base.instancesMissing && <div style={{ fontSize: 12, color: C.yw, marginBottom: 8 }}>This environment has no connection instances in Dataverse: the account a connection is signed in with isn't visible here (it is in Power Automate › Connections).</div>}

      <div style={{ ...crd({ padding: 0, overflow: "hidden" }) }}>
        <div style={{ overflow: "auto", maxHeight: "calc(100vh - 360px)" }}>
          {view === "identities" ? (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 760 }}>
              <thead><tr><th style={ths()}>Identity</th><th style={ths()}>Kind</th><th style={ths()}>Status</th><th style={ths()}>Runs</th><th style={ths()}>Flags</th></tr></thead>
              <tbody>{idents.map(i => (
                <IdentityRow key={i.key} i={i} open={!!open[i.key]} toggle={() => setOpen(o => ({ ...o, [i.key]: !o[i.key] }))} />
              ))}</tbody>
            </table>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 760 }}>
              <thead><tr><th style={ths()}>Connection reference</th><th style={ths()}>Connector</th><th style={ths()}>Signed in as</th><th style={ths()}>Owner</th><th style={ths()}>Flows using it</th></tr></thead>
              <tbody>{conns.map(c => (
                <tr key={c.id} style={{ borderBottom: `1px solid ${C.bd}22`, verticalAlign: "top" }}>
                  <td style={tds}><div>{c.name}</div><div style={{ ...mono, fontSize: 11, color: C.txd }}>{c.logicalName}</div></td>
                  <td style={{ ...tds, ...mono, fontSize: 12, color: C.cy }}>{c.connector}</td>
                  <td style={tds}>{!c.connected ? <span style={{ color: C.rd, fontSize: 12 }}>no connection — flows using it can't run</span>
                    : c.account ? <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}><span style={{ ...mono, fontSize: 12 }}>{c.account}</span>{c.accountKind && <Kind k={c.accountKind.kind} label={c.accountKind.label} hint={c.accountKind.hint} />}</div>
                    : <span style={{ color: C.txd, fontSize: 12 }}>connected — account not stored in Dataverse</span>}</td>
                  <td style={{ ...tds, color: C.txm }}>{c.owner}</td>
                  <td style={{ ...tds, fontSize: 12 }}>{c.flows.length ? c.flows.map((f, k) => <div key={k} style={{ color: f.active === false ? C.txd : C.txm }}>{f.name}{f.active === false ? " (off)" : ""}</div>) : <span style={{ color: C.txd }}>{flowRead.phase === "reading" ? "…" : "none found"}</span>}</td>
                </tr>
              ))}</tbody>
            </table>
          )}
          {(view === "identities" ? idents : conns).length === 0 && <div style={{ padding: 16, color: C.txd, fontSize: 13 }}>Nothing matches.</div>}
        </div>
      </div>
      {result.invokerFlows.length > 0 && <div style={{ fontSize: 12, color: C.txm, marginTop: 8 }}>{result.invokerFlows.length} flow{result.invokerFlows.length === 1 ? " uses" : "s use"} the connection of whoever runs {result.invokerFlows.length === 1 ? "it" : "them"} (run-only users): {result.invokerFlows.slice(0, 5).map(f => f.name).join(", ")}{result.invokerFlows.length > 5 ? "…" : ""}</div>}
      <div style={{ fontSize: 11.5, color: C.txd, marginTop: 8, lineHeight: 1.5 }}>Read-only, from Dataverse: process owners, real-time workflows running as their owner, plug-in steps' run-as user, connection references and — when Dataverse stores the connection — the account it is signed in with. The kind comes from the user record (application user, access mode); "Service account?" is a guess from the name or address. Connections made outside solutions and run-only user settings live in Power Automate.</div>
    </div>
  );
}

function IdentityRow({ i, open, toggle }) {
  const summary = useSummary(i.uses);
  return (
    <>
      <tr onClick={toggle} style={{ borderBottom: `1px solid ${C.bd}22`, cursor: "pointer", verticalAlign: "top", opacity: i.disabled && !i.active ? .6 : 1 }}>
        <td style={tds}>
          <div style={{ fontWeight: 600 }}>{i.name}</div>
          {i.email && <div style={{ ...mono, fontSize: 11, color: C.txd }}>{i.email}</div>}
          {i.appId && <div style={{ fontSize: 11, color: C.txd }}>app id <span style={mono}>{i.appId}</span> <a href={`https://entra.microsoft.com/#view/Microsoft_AAD_RegisteredApps/ApplicationMenuBlade/~/Overview/appId/${i.appId}`} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} style={{ color: C.cy, textDecoration: "none" }}>Entra ↗</a></div>}
        </td>
        <td style={tds}><Kind k={i.kind} /></td>
        <td style={{ ...tds, fontSize: 12, color: i.disabled ? C.rd : C.gn }}>{i.type === "team" ? "—" : i.type === "account" ? "" : i.disabled ? "Disabled" : "Enabled"}</td>
        <td style={{ ...tds, fontSize: 12, color: C.txm }}>{summary.length ? summary.join(" · ") : <span style={{ color: C.txd }}>nothing visible here</span>}</td>
        <td style={{ ...tds, fontSize: 12 }}>{i.flags.map((f, k) => <div key={k} style={{ color: f.level === "error" ? C.rd : f.level === "warn" ? C.yw : C.txd }}>{f.level === "info" ? "ℹ" : "⚠"} {f.text}</div>)}</td>
      </tr>
      {open && i.uses.length > 0 && <tr><td colSpan={5} style={{ padding: "4px 12px 10px 24px", background: C.bg }}>
        {i.uses.map((u, k) => <div key={k} style={{ fontSize: 12, color: u.active === false ? C.txd : C.txm, padding: "1px 0" }}><span style={{ color: C.txd }}>{u.what}</span> · {u.kind} · <b style={{ color: u.active === false ? C.txd : C.tx }}>{u.name}</b>{u.active === false ? " (off)" : ""}{u.flows != null ? ` · used by ${u.flows} flow${u.flows === 1 ? "" : "s"}` : ""}</div>)}
      </td></tr>}
    </>
  );
}
