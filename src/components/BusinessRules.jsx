import { useState, useEffect, useMemo, Fragment } from "react";
import { bridge } from "../d365-bridge.js";
import { C, I, Spin, mono, inp, bt, crd, ths, tds, exportTable } from "../shared.jsx";
import { businessRuleScope, scopeWarning, hasFormOnlyActions, condText, actionText, ruleLines } from "../businessRules.js";

// Automation › Business rules — every business rule with what it does: its scope (where it runs),
// the columns it reads and acts on, and on a click its logic as IF / ELSE IF / ELSE with the
// actions, read from its definition (businessRules.js). The definitions and the form names come
// from the parent's paged read (AutomationInventory), started when this tab opens.
const lcId = (v) => String(v || "").toLowerCase();
const Chip = ({ color, title, children }) => <span title={title} style={{ fontSize: 10.5, padding: "2px 7px", borderRadius: 4, fontWeight: 600, whiteSpace: "nowrap", background: color + "22", color, cursor: title ? "help" : "default" }}>{children}</span>;
const SCOPE_COLOR = { entity: () => C.gn, allforms: () => C.cy, form: () => C.vi, unknown: () => C.txd };
const ACTION_ICON = { show: "👁", hide: "🙈", lock: "🔒", unlock: "🔓", required: "✱", error: "⛔", set: "✎", default: "↺", other: "•" };
const KEYWORD = { if: "IF", elseif: "ELSE IF", else: "ELSE" };
const SCOPE_HINT = "Where a rule runs. Entity: every form, and the server on each save — imports, API writes and flows included. All forms / one form: on forms only. Show / hide, lock and business required only exist on forms: the server ignores them.";

// the rule's logic, nested: IF … then its actions (or a nested IF), ELSE IF …, ELSE …
function RuleTree({ steps, label, options }) {
  return <div>{steps.map((s, i) => s.type === "if"
    ? <div key={i} style={{ margin: "2px 0" }}>{s.branches.map((b, j) => (
      <div key={j} style={{ marginBottom: 4 }}>
        <div style={{ fontSize: 12.5, lineHeight: 1.5 }}>
          <b style={{ color: b.kind === "else" ? C.yw : C.vi, ...mono, fontSize: 11.5, marginRight: 6 }}>{KEYWORD[b.kind]}</b>
          {b.when && <span>{condText(b.when, label, options)}</span>}
          {b.description && <span style={{ color: C.txd, fontSize: 11.5, marginLeft: 8 }}>— {b.description}</span>}
        </div>
        <div style={{ borderLeft: `2px solid ${C.bd}`, marginLeft: 6, paddingLeft: 12 }}>
          {b.then.length ? <RuleTree steps={b.then} label={label} options={options} /> : <div style={{ fontSize: 12, color: C.txd }}>no action</div>}
        </div>
      </div>))}</div>
    : <div key={i} style={{ fontSize: 12.5, lineHeight: 1.6, color: s.action === "error" ? C.rd : s.action === "other" ? C.txm : C.tx }} title={s.label ? `In the designer: ${s.label}` : undefined}>
      <span style={{ display: "inline-block", width: 20 }}>{ACTION_ICON[s.action] || "•"}</span>{actionText(s, label, options)}
    </div>)}</div>;
}

export default function BusinessRules({ rules, defs, read, forms, onStop, onRefresh, loading, srcBadge, srcLabel, sourceOf }) {
  const [search, setSearch] = useState("");
  const [stateFilter, setStateFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [scopeFilter, setScopeFilter] = useState("all");
  const [open, setOpen] = useState(() => new Set());
  // per table: display names and choice labels, read when a rule of the table is opened (cached)
  const [meta, setMeta] = useState({});

  const scopeOf = (r) => {
    const d = defs[lcId(r.id)];
    if (!d) return null;
    return businessRuleScope(d.scope, d.formId, d.formId ? forms.names?.[d.formId] : "");
  };
  const rows = useMemo(() => {
    const s = search.trim().toLowerCase();
    return (rules || []).filter(r => {
      if (stateFilter === "active" && r.state !== 1) return false;
      if (stateFilter === "inactive" && r.state === 1) return false;
      if (sourceFilter !== "all" && sourceOf(r) !== sourceFilter) return false;
      const d = defs[lcId(r.id)];
      if (scopeFilter !== "all") {
        const sc = d ? businessRuleScope(d.scope, d.formId, "") : null;
        if (!sc || sc.kind !== scopeFilter) return false;
      }
      if (!s) return true;
      const cols = d?.parsed && !d.parsed.error ? [...d.parsed.reads, ...d.parsed.acts] : [];
      return [r.name, r.entity, r.owner, ...cols].some(v => String(v || "").toLowerCase().includes(s));
    });
  }, [rules, defs, search, stateFilter, sourceFilter, scopeFilter, sourceOf]);

  const toggle = (r) => {
    setOpen(o => { const n = new Set(o); if (n.has(r.id)) n.delete(r.id); else n.add(r.id); return n; });
    const ent = r.entity;
    if (!ent || meta[ent]) return;
    setMeta(m => ({ ...m, [ent]: { phase: "reading", names: {}, options: {}, error: "" } }));
    Promise.allSettled([bridge.getFields(ent), bridge.getAllOptionSets(ent)]).then(([f, o]) => {
      const names = {};
      if (f.status === "fulfilled" && Array.isArray(f.value)) for (const x of f.value) { const l = lcId(x.logical || x.l); if (l) names[l] = x.display || x.d || ""; }
      const options = o.status === "fulfilled" && o.value ? o.value : {};
      const err = [f, o].filter(p => p.status === "rejected").map(p => p.reason?.message || String(p.reason)).join(" · ");
      setMeta(m => ({ ...m, [ent]: { phase: "done", names, options, error: err } }));
    });
  };
  // Escape closes the opened rules
  useEffect(() => { if (!open.size) return undefined; const h = e => { if (e.key === "Escape") setOpen(new Set()); }; window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h); }, [open]);

  const labelFor = (ent) => (c) => meta[ent]?.names?.[c] || c;
  const optionsFor = (ent) => (c) => meta[ent]?.options?.[c] || null;
  const reading = read.phase === "idle" || read.phase === "reading";

  const colCell = (r, which) => {
    const d = defs[lcId(r.id)];
    if (!d) return <span style={{ color: C.txd }} title={reading ? "reading the definitions…" : "This definition wasn't read (the read stopped or failed)"}>{reading ? "…" : "not read"}</span>;
    if (!d.parsed) return <span style={{ color: C.txd }}>no definition</span>;
    if (d.parsed.error) return <span style={{ color: C.yw }} title={d.parsed.error}>unreadable</span>;
    const cols = d.parsed[which];
    return cols.length ? <span style={{ ...mono, fontSize: 11.5, color: which === "acts" ? C.tx : C.txm, whiteSpace: "normal" }}>{cols.join(", ")}</span> : <span style={{ color: C.txd }}>—</span>;
  };

  const exportRows = (format) => {
    exportTable(
      ["name", "entity", "state", "scope", "reads", "actsOn", "logic", "owner", "source", "managedFlag", "modifiedOn"],
      rows.map(r => {
        const d = defs[lcId(r.id)], sc = scopeOf(r);
        const p = d?.parsed;
        return [r.name, r.entity, r.state === 1 ? "Activated" : "Draft", sc ? sc.label : "not read",
          p && !p.error ? p.reads.join(", ") : "", p && !p.error ? p.acts.join(", ") : "",
          d ? (p ? ruleLines(p, labelFor(r.entity), optionsFor(r.entity)).map(l => l.trim()).join(" | ") : "no definition") : "not read",
          r.owner, srcLabel(r), r.managed ? "Managed" : "Unmanaged", r.modifiedon];
      }),
      "automation_business_rules", format, "BusinessRules");
  };

  const COLS = 10;
  return (<>
    <div style={{ display: "flex", gap: 8, marginBottom: 6, alignItems: "center", flexWrap: "wrap" }}>
      <input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 Filter by name, table or column…" title="Matches the rule's name, its table, its owner and the columns it reads or acts on" style={inp({ fontSize: 12, maxWidth: 320, padding: "6px 10px" })} />
      <select value={stateFilter} onChange={e => setStateFilter(e.target.value)} style={inp({ width: "auto", fontSize: 12, padding: "5px 8px" })}>
        <option value="all">All states</option>
        <option value="active">Activated only</option>
        <option value="inactive">Draft only</option>
      </select>
      <select value={scopeFilter} onChange={e => setScopeFilter(e.target.value)} title={SCOPE_HINT} style={inp({ width: "auto", fontSize: 12, padding: "5px 8px" })}>
        <option value="all">All scopes</option>
        <option value="entity">Entity (forms + server)</option>
        <option value="allforms">All forms</option>
        <option value="form">One form</option>
        <option value="unknown">Scope unknown</option>
      </select>
      <select value={sourceFilter} onChange={e => setSourceFilter(e.target.value)} title="Dataverse doesn't stamp authorship — source = publisher-prefix heuristic + the ismanaged flag" style={inp({ width: "auto", fontSize: 12, padding: "5px 8px" })}>
        <option value="all">All sources</option>
        <option value="custom">Custom (unmanaged)</option>
        <option value="isv">Managed (ISV / your solutions)</option>
        <option value="microsoft">Microsoft</option>
      </select>
      <span style={{ fontSize: 11, color: C.txd, ...mono }}>{rows.length.toLocaleString()} shown</span>
      {read.phase === "reading" && <span style={{ fontSize: 11.5, color: C.txm }}><Spin s={9} /> reading definitions · {read.done} <button onClick={onStop} style={bt(null, { fontSize: 10.5, padding: "1px 7px", marginLeft: 4 })}>Stop</button></span>}
      {read.phase === "stopped" && <span style={{ fontSize: 11.5, color: C.yw }}>definitions: stopped after {read.done} — the rules not read say so</span>}
      {read.phase === "failed" && <span style={{ fontSize: 11.5, color: C.rd }}>the definitions couldn't all be read{read.error ? `: ${read.error}` : ""}</span>}
      {read.scoped === false && <span style={{ fontSize: 11.5, color: C.yw }} title="This org refused the processtriggerscope / processtriggerformid columns">the scope columns couldn't be read — scope unknown</span>}
      {forms.phase === "failed" && <span style={{ fontSize: 11.5, color: C.yw }} title={forms.error}>the form names couldn't be read — "One form" without its name</span>}
      <div style={{ flex: 1 }} />
      <button onClick={onRefresh} disabled={loading} title="Reload the rules and their definitions from the environment" style={bt(null, { fontSize: 11, padding: "4px 10px", opacity: loading ? 0.5 : 1 })}>↻ Refresh</button>
      <button onClick={() => exportRows("csv")} disabled={!rows.length} style={bt(C.cy, { fontSize: 11, padding: "4px 10px", opacity: rows.length ? 1 : 0.5 })}><I.Download /> CSV</button>
      <button onClick={() => exportRows("xlsx")} disabled={!rows.length} style={bt(C.cy, { fontSize: 11, padding: "4px 10px", opacity: rows.length ? 1 : 0.5 })}><I.Download /> Excel</button>
    </div>
    <div style={{ fontSize: 11.5, color: C.txd, lineHeight: 1.6, marginBottom: 10 }}>{SCOPE_HINT} Click a rule to read its conditions and actions.</div>

    <div style={{ ...crd({ padding: 0, overflow: "hidden" }) }}>
      <div style={{ overflow: "auto", maxHeight: "calc(100vh - 340px)" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 900 }}>
          <thead><tr>
            <th style={{ ...ths(), width: 22 }} />
            <th style={ths()}>Name</th><th style={ths()}>Entity</th><th style={ths()}>State</th>
            <th style={ths()} title={SCOPE_HINT}>Scope</th>
            <th style={ths()} title="The columns its conditions test, and the columns whose values it copies">Reads</th>
            <th style={ths()} title="The columns its actions show / hide, lock, make required, set, default or put an error on">Acts on</th>
            <th style={ths()}>Owner</th><th style={ths()}>Source</th><th style={ths()}>Modified</th>
          </tr></thead>
          <tbody>
            {rows.map(r => {
              const d = defs[lcId(r.id)], sc = scopeOf(r), isOpen = open.has(r.id);
              const warn = sc && d?.parsed ? scopeWarning(sc, d.parsed) : "";
              const m = meta[r.entity];
              const formOnly = sc?.kind === "entity" && hasFormOnlyActions(d?.parsed);
              return (<Fragment key={r.id}>
                <tr onClick={() => toggle(r)} style={{ borderBottom: `1px solid ${C.bd}22`, cursor: "pointer", background: isOpen ? C.vi + "0d" : "transparent" }}>
                  <td style={{ ...tds, color: C.txd, fontSize: 11 }}>{isOpen ? "▾" : "▸"}</td>
                  <td style={{ ...tds, maxWidth: 300 }} title={r.name}>{r.name}</td>
                  <td style={{ ...tds, ...mono, fontSize: 12 }}>{r.entity || <span style={{ color: C.txd }}>—</span>}</td>
                  <td style={tds}><Chip color={r.state === 1 ? C.gn : C.yw}>{r.state === 1 ? "Activated" : "Draft"}</Chip></td>
                  <td style={{ ...tds, maxWidth: 220 }}>{sc ? <><Chip color={(SCOPE_COLOR[sc.kind] || (() => C.txd))()} title={sc.detail}>{sc.label}</Chip>{warn && <span title={warn} style={{ marginLeft: 5, color: C.yw, cursor: "help" }}>⚠</span>}</> : <span style={{ color: C.txd }}>{reading ? "…" : "not read"}</span>}</td>
                  <td style={{ ...tds, maxWidth: 220, whiteSpace: "normal" }}>{colCell(r, "reads")}</td>
                  <td style={{ ...tds, maxWidth: 240, whiteSpace: "normal" }}>{colCell(r, "acts")}</td>
                  <td style={{ ...tds, color: C.txm, maxWidth: 160 }}>{r.owner}</td>
                  <td style={tds}>{srcBadge(r)}</td>
                  <td style={{ ...tds, fontSize: 11, color: C.txd }}>{r.modifiedon ? new Date(r.modifiedon).toLocaleDateString() : ""}</td>
                </tr>
                {isOpen && <tr style={{ borderBottom: `1px solid ${C.bd}44`, background: C.vi + "08" }}><td colSpan={COLS} style={{ padding: "10px 16px 12px 34px" }}>
                  {/* stays in view and wraps inside the visible width when the table scrolls sideways */}
                  <div style={{ position: "sticky", left: 34, maxWidth: "min(820px, calc(100vw - 260px))", whiteSpace: "normal" }}>
                  {sc && <div style={{ fontSize: 12.5, marginBottom: 6 }}>Scope: <b>{sc.label}</b> <span style={{ color: C.txm }}>— {sc.detail}</span></div>}
                  {warn && <div style={{ fontSize: 12.5, color: C.yw, marginBottom: 6 }}>⚠ {warn}</div>}
                  {formOnly && <div style={{ fontSize: 12, color: C.txm, marginBottom: 6 }}>Its show / hide, lock and business-required actions act on forms only — the server runs the rest.</div>}
                  {!d ? <div style={{ fontSize: 12.5, color: C.txd }}>{reading ? <><Spin s={10} /> reading the definition…</> : "The definition wasn't read (the read stopped or failed)."}</div>
                    : !d.parsed ? <div style={{ fontSize: 12.5, color: C.txd }}>This rule has no definition (its XAML is empty).</div>
                    : d.parsed.error ? <div style={{ fontSize: 12.5, color: C.yw }}>{d.parsed.error}</div>
                    : <>
                      {m?.phase === "reading" && <div style={{ fontSize: 11.5, color: C.txd, marginBottom: 4 }}><Spin s={9} /> reading the column names…</div>}
                      {m?.error && <div style={{ fontSize: 11.5, color: C.yw, marginBottom: 4 }}>Column names or choice labels not read ({m.error}) — logical names shown.</div>}
                      {d.parsed.steps.length ? <RuleTree steps={d.parsed.steps} label={labelFor(r.entity)} options={optionsFor(r.entity)} /> : <div style={{ fontSize: 12.5, color: C.txd }}>No condition or action in this definition.</div>}
                      {d.parsed.others.length > 0 && <div style={{ fontSize: 11.5, color: C.txm, marginTop: 6 }}>Shown by their own name — steps Colvio doesn't describe: {d.parsed.others.join(", ")}.</div>}
                      <div style={{ fontSize: 11.5, color: C.txd, marginTop: 8, lineHeight: 1.6 }}>
                        Reads: <span style={mono}>{d.parsed.reads.map(c => (m?.names?.[c] ? `${m.names[c]} (${c})` : c)).join(", ") || "—"}</span><br />
                        Acts on: <span style={mono}>{d.parsed.acts.map(c => (m?.names?.[c] ? `${m.names[c]} (${c})` : c)).join(", ") || "—"}</span>
                      </div>
                    </>}
                  </div>
                </td></tr>}
              </Fragment>);
            })}
          </tbody>
        </table>
        {rows.length === 0 && <div style={{ padding: 16, color: C.txd, fontSize: 13 }}>No business rules match{search || stateFilter !== "all" || sourceFilter !== "all" || scopeFilter !== "all" ? " the current filters" : ""}.</div>}
      </div>
    </div>
  </>);
}
