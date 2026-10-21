import { useState, useEffect, useRef, useMemo } from "react";
import { bridge } from "../d365-bridge.js";
import { C, Spin, mono, inp, bt, crd, confirmProd, dl, expName, exportTable } from "../shared.jsx";
import { t } from "../i18n.js";
import { createRuntime, runRollback, summarize, rollbackStats, scriptLine } from "../scriptRuntime.js";
import { SCRIPT_TEMPLATES } from "../scriptTemplates.js";
import { parseDelimited, detectSep } from "../loaderUtils.js";

const SCRIPTS_KEY = "colvio_scripts";
const journalKey = (orgInfo) => `colvio_script_journal:${orgInfo?.orgUrl || "demo"}`;
const hasChrome = () => typeof chrome !== "undefined" && !!chrome.storage?.local;
const storeGet = (key) => new Promise(res => {
  if (hasChrome()) chrome.storage.local.get([key], r => { void chrome.runtime.lastError; res(r?.[key] ?? null); });
  else { try { res(JSON.parse(localStorage.getItem(key) || "null")); } catch { res(null); } }
});
// Resolves to null when saved, or the error message (quota…) — a journal that didn't persist must say so.
const storeSet = (key, value) => new Promise(res => {
  if (hasChrome()) chrome.storage.local.set({ [key]: value }, () => res(chrome.runtime.lastError?.message || null));
  else { try { localStorage.setItem(key, JSON.stringify(value)); res(null); } catch (e) { res(e.message || "storage error"); } }
});
const DEMO_ORG = "https://demo.crm4.dynamics.com";
const SAVE_EVERY_MS = 2000; // journal saved while a live run writes (a closed panel keeps what was done)
const newId = () => `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const MAX_SHOWN = 2000;      // console lines / list rows rendered (all kept for export)
const TABLE_SHOWN = 500;

// Script Console — run JavaScript against the Web API: every dv.* call goes through the runtime
// (dry run, rollback journal, 429 retries) and the content script's host-locked request. The code
// itself runs in the sandbox page (sandbox.js), a fresh iframe per run.
export default function ScriptConsole({ bp, orgInfo }) {
  const [scripts, setScripts] = useState([]);
  const [cur, setCur] = useState(() => ({ id: null, name: t(`script.tpl.${SCRIPT_TEMPLATES[0].id}`), code: SCRIPT_TEMPLATES[0].code, saved: null }));
  const [input, setInput] = useState(null); // { name, rows }
  const [journalOn, setJournalOn] = useState(true);
  const [phase, setPhase] = useState("idle"); // idle | running | rollback
  const [mode, setMode] = useState("dry");
  const [tab, setTab] = useState("console");
  const [showApi, setShowApi] = useState(false);
  const [result, setResult] = useState(null); // { ok, mode, ms, value?, error?, line?, stopped? }
  const [journal, setJournal] = useState(null); // { at, script, entries, rolledBack, rollback? }
  const [lastDry, setLastDry] = useState(null); // { sig, plan }
  const [saveError, setSaveError] = useState(null); // the journal couldn't be stored
  const [, setTick] = useState(0);
  const buf = useRef({ logs: [], tables: [], plan: [], entries: [], progress: null });
  const run = useRef(null);
  const host = useRef(null);
  const ta = useRef(null);
  const gutter = useRef(null);
  const fileRef = useRef(null);
  const scriptFileRef = useRef(null);
  const journalFileRef = useRef(null);

  useEffect(() => {
    storeGet(SCRIPTS_KEY).then(l => setScripts(Array.isArray(l) ? l : []));
    storeGet(journalKey(orgInfo)).then(j => { if (j && Array.isArray(j.entries)) setJournal(j); });
  }, [orgInfo?.orgUrl]);
  // While running, the buffers fill from the sandbox: re-render 5 times a second, not per message.
  useEffect(() => {
    if (phase === "idle") return undefined;
    const id = setInterval(() => setTick(x => x + 1), 200);
    return () => clearInterval(id);
  }, [phase]);
  // Leaving Colvio mid-run: stop the script and keep the journal of what was already written.
  useEffect(() => () => {
    const rn = run.current;
    if (!rn) return;
    rn.stopped = true; rn.closing = true;
    if (rn.onMsg) window.removeEventListener("message", rn.onMsg);
    rn.frame?.remove();
    if (rn.mode === "live" && rn.buf?.entries.length) storeSet(journalKey(orgInfo), journalOf(rn, true));
  }, []);

  const dirty = cur.saved !== cur.code;
  const sig = `${cur.code}\u0000${input ? `${input.name}:${input.rows.length}` : ""}`;
  const lines = useMemo(() => cur.code.split("\n").length, [cur.code]);
  const b = buf.current;

  // ── Scripts ──
  const persistScripts = (list) => { setScripts(list); storeSet(SCRIPTS_KEY, list); };
  const save = () => {
    const name = (cur.name || "").trim() || t("script.untitled");
    const id = cur.id || newId();
    const item = { id, name, code: cur.code, updated: new Date().toISOString() };
    persistScripts([item, ...scripts.filter(s => s.id !== id)]);
    setCur(c => ({ ...c, id, name, saved: c.code }));
  };
  const openScript = (s) => {
    if (dirty && !window.confirm(t("script.discard"))) return;
    setCur({ id: s.id, name: s.name, code: s.code, saved: s.code });
  };
  const fromTemplate = (id) => {
    const tpl = SCRIPT_TEMPLATES.find(x => x.id === id);
    if (!tpl || (dirty && !window.confirm(t("script.discard")))) return;
    setCur({ id: null, name: t(`script.tpl.${tpl.id}`), code: tpl.code, saved: null });
    if (!orgInfo?.isExtension && tpl.sampleInput) setInput({ name: "sample.csv", rows: tpl.sampleInput });
  };
  const removeScript = () => {
    if (!cur.id || !window.confirm(t("script.delete_confirm").replace("{name}", cur.name))) return;
    persistScripts(scripts.filter(s => s.id !== cur.id));
    setCur(c => ({ ...c, id: null, saved: null }));
  };
  const loadScriptFile = (e) => {
    const f = e.target.files?.[0]; e.target.value = "";
    if (!f || (dirty && !window.confirm(t("script.discard")))) return;
    f.text().then(code => setCur({ id: null, name: f.name.replace(/\.(js|txt)$/i, ""), code, saved: null }));
  };

  // ── Input file ──
  const loadInput = async (e) => {
    const f = e.target.files?.[0]; e.target.value = "";
    if (!f) return;
    try {
      let rows;
      if (/\.(xlsx|xls)$/i.test(f.name)) {
        const m = await import("xlsx"); const XLSX = m.read ? m : (m.default || m);
        const wb = XLSX.read(await f.arrayBuffer(), { type: "array", cellDates: true });
        rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: "", raw: true })
          .map(r => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v instanceof Date ? v.toISOString() : v])));
      } else {
        const text = (await f.text()).replace(/^﻿/, "");
        const aoa = parseDelimited(text, detectSep(text)).filter(r => r.some(c => c !== ""));
        const h = aoa[0] || [];
        rows = aoa.slice(1).map(r => Object.fromEntries(h.map((k, i) => [k, r[i] ?? ""])));
      }
      setInput({ name: f.name, rows });
    } catch (err) { window.alert(`${t("script.input_error")}: ${err.message || err}`); }
  };

  // ── Run ──
  const orgUrl = orgInfo?.orgUrl || DEMO_ORG;
  const journalOf = (rn, inProgress) => ({ at: new Date(rn.t0).toISOString(), script: rn.script, orgUrl, entries: [...rn.buf.entries], rolledBack: false, inProgress });
  const saveJournal = async (j) => {
    const err = await storeSet(journalKey(orgInfo), j);
    setSaveError(err);
  };

  // End of a run (script returned, failed, or Stop). The run is over only when no dv call is still
  // executing: a script that didn't await its calls (forEach(async …)) returns before its writes —
  // they are let through to the end (and journaled) unless Stop was pressed.
  const end = async (r, rn) => {
    if (rn.ending) return; rn.ending = true;
    if (r.stopped) { rn.stopped = true; rn.frame?.remove(); }
    else if (rn.inflight.size) rn.lateAfterDone = true; // the script returned with calls still running
    rn.finishing = true;
    let late = 0;
    for (;;) {
      while (rn.inflight.size) await Promise.allSettled([...rn.inflight]);
      if (rn.stopped) break;
      const before = rn.calls;
      await new Promise(res => setTimeout(res, 300));
      if (rn.calls === before && !rn.inflight.size) break;
      late += rn.calls - before;
    }
    if (rn.stopped && !r.stopped) return; // Stop arrived while this end was waiting: it finishes the run
    if (rn.finalized) return;
    rn.finalized = true;
    rn.closing = true;
    window.removeEventListener("message", rn.onMsg);
    rn.frame?.remove();
    if (run.current === rn) run.current = null;
    if (late || rn.lateAfterDone) rn.buf.logs.push({ level: "warn", text: t("script.late_calls"), at: Date.now() - rn.t0 });
    setResult({ ...r, mode: rn.mode, ms: Date.now() - rn.t0 });
    if (rn.mode === "live" && rn.buf.entries.length) { const j = journalOf(rn, false); setJournal(j); saveJournal(j); }
    if (rn.mode === "dry" && r.ok) setLastDry({ sig: rn.sig, plan: summarize(rn.buf.plan), count: rn.buf.plan.length });
    setTab(r.ok && rn.mode === "dry" && rn.buf.plan.length ? "writes" : "console");
    setPhase("idle");
  };

  const start = (m) => {
    if (phase !== "idle" || !cur.code.trim()) return;
    if (m === "live") {
      const dryOk = lastDry && lastDry.sig === sig;
      const msg = dryOk
        ? `${t("script.live_confirm_planned").replace("{n}", lastDry.count)}\n\n${lastDry.plan.slice(0, 12).map(p => `  ${p.count} × ${p.label}`).join("\n")}${lastDry.plan.length > 12 ? "\n  …" : ""}\n\n${journalOn ? t("script.live_confirm_journal") : t("script.live_confirm_nojournal")}`
        : `${t("script.live_confirm_nodry")}\n\n${journalOn ? t("script.live_confirm_journal") : t("script.live_confirm_nojournal")}`;
      if (!window.confirm(msg)) return;
      if (!confirmProd(orgInfo?.isProduction, `${t("script.run_live")}: ${cur.name}${dryOk ? ` — ${lastDry.count} ${t("script.writes_planned")}` : ""}`)) return;
      if (journal?.entries?.length && !journal.rolledBack && !window.confirm(t("script.replace_journal"))) return;
    }
    // Each run owns its buffers: a call finishing after Stop can never land in the next run's output.
    const rn = { id: newId(), mode: m, stopped: false, closing: false, t0: Date.now(), sig, frame: null, script: cur.name, inflight: new Set(), calls: 0, lastSave: 0,
      buf: { logs: [], tables: [], plan: [], entries: [], progress: null } };
    buf.current = rn.buf;
    setResult(null); setMode(m); setPhase("running"); setTab("console"); setSaveError(null);
    run.current = rn;
    const rt = createRuntime({
      send: (r) => bridge.scriptRequest(r),
      orgUrl, mode: m, journal: journalOn,
      isStopped: () => rn.stopped,
      onPlan: (e) => rn.buf.plan.push(e),
      onJournal: (e) => {
        rn.buf.entries.push(e);
        if (Date.now() - rn.lastSave > SAVE_EVERY_MS) { rn.lastSave = Date.now(); saveJournal(journalOf(rn, true)); }
      },
    });
    const frame = document.createElement("iframe");
    frame.setAttribute("sandbox", "allow-scripts");
    frame.src = "sandbox.html";
    frame.style.display = "none";
    rn.frame = frame;
    const toFrame = (msg) => frame.contentWindow?.postMessage({ __colvioScript: true, ...msg }, "*");
    const onMsg = (ev) => {
      // only our sandbox frame (opaque origin "null"), only this run
      if (ev.source !== frame.contentWindow || ev.origin !== "null" || !ev.data?.__colvioScript || rn.closing) return;
      const d = ev.data, B = rn.buf;
      switch (d.type) {
        case "ready":
          toFrame({ type: "run", runId: rn.id, code: cur.code, input: input?.rows || [], methods: rt.methods, dryRun: m === "dry" });
          break;
        case "call": {
          if (rn.stopped) { toFrame({ type: "result", id: d.id, error: { message: t("script.stopped") } }); break; }
          rn.calls++;
          if (rn.ending) rn.lateAfterDone = true;
          const p = rt.invoke(d.method, d.args, d.headers)
            .then(value => { if (!rn.stopped) toFrame({ type: "result", id: d.id, value: value === undefined ? null : value }); })
            .catch(e => { if (!rn.stopped) toFrame({ type: "result", id: d.id, error: { message: e.message || String(e), status: e.status, code: e.code, results: e.results } }); });
          rn.inflight.add(p);
          p.finally(() => rn.inflight.delete(p));
          break;
        }
        case "log": B.logs.push({ level: d.level, text: d.text, at: Date.now() - rn.t0 }); break;
        case "table": B.tables.push({ title: d.title, rows: d.rows || [] }); break;
        case "progress": B.progress = { done: d.done, total: d.total, label: d.label }; break;
        case "done":
          end(d.ok ? { ok: true, value: d.value } : { ok: false, error: d.error?.message, line: scriptLine(d.error?.stack), status: d.error?.status }, rn);
          break;
        default:
      }
    };
    rn.onMsg = onMsg;
    window.addEventListener("message", onMsg);
    host.current.appendChild(frame);
  };
  const stopRun = () => {
    const rn = run.current; if (!rn) return;
    rn.ending = false; // Stop wins over a finish already waiting for its last calls
    end({ ok: false, stopped: true, error: t("script.stopped") }, rn);
  };

  // ── Rollback ──
  const doRollback = async () => {
    if (!journal?.entries?.length || journal.rolledBack || phase !== "idle") return;
    if (journal.orgUrl !== orgUrl) { window.alert(t("script.journal_other_org").replace("{org}", journal.orgUrl || "?")); return; }
    const s = rollbackStats(journal.entries);
    const msg = t("script.rollback_confirm").replace("{n}", journal.entries.length).replace("{full}", s.full).replace("{partial}", s.partial).replace("{none}", s.none).replace("{ops}", s.ops);
    if (!window.confirm(msg)) return;
    if (!confirmProd(orgInfo?.isProduction, `${t("script.rollback")}: ${journal.script} (${s.ops} ops)`)) return;
    const rn = { stopped: false, lastSave: 0 };
    run.current = rn; setPhase("rollback"); buf.current.progress = { done: 0, total: journal.entries.length, label: t("script.rollback") };
    const out = await runRollback(journal.entries, {
      send: (r) => bridge.scriptRequest(r), isStopped: () => rn.stopped,
      onProgress: (done, total, entries) => {
        buf.current.progress = { done, total, label: t("script.rollback") };
        // progress (undoneOps) is saved as it goes: a rollback resumed later never replays
        if (Date.now() - rn.lastSave > SAVE_EVERY_MS) { rn.lastSave = Date.now(); saveJournal({ ...journal, entries }); }
      },
    });
    run.current = null;
    const { entries, ...counts } = out;
    const j = { ...journal, entries, rolledBack: !out.stopped && out.failed.length === 0, rollback: { at: new Date().toISOString(), ...counts } };
    setJournal(j); saveJournal(j);
    setPhase("idle"); setTab("writes");
  };
  const exportJournal = () => journal && dl(JSON.stringify(journal, null, 2), "application/json", expName("colvio_script_journal", "json", true));
  const importJournal = (e) => {
    const f = e.target.files?.[0]; e.target.value = "";
    if (!f) return;
    f.text().then(txt => {
      const j = JSON.parse(txt);
      const okOp = (o) => o && ["POST", "PATCH", "PUT", "DELETE"].includes(o.method) && typeof o.path === "string" && /^\/api\/data\/v\d/.test(o.path);
      if (!Array.isArray(j?.entries) || !j.entries.every(x => Array.isArray(x.inverse) && x.inverse.every(okOp))) throw new Error(t("script.journal_invalid"));
      // GUIDs are shared between a production org and its copies: a journal only undoes where it was written
      if (j.orgUrl !== orgUrl) throw new Error(t("script.journal_other_org").replace("{org}", j.orgUrl || "?"));
      setJournal(j); setTab("writes");
    }).catch(err => window.alert(err.message || String(err)));
  };

  // ── Editor ──
  const onKey = (e) => {
    if (e.key === "Tab" && !e.shiftKey) {
      e.preventDefault();
      const el = e.target, s = el.selectionStart, en = el.selectionEnd;
      const code = cur.code.slice(0, s) + "  " + cur.code.slice(en);
      setCur(c => ({ ...c, code }));
      requestAnimationFrame(() => { el.selectionStart = el.selectionEnd = s + 2; });
    } else if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); start("dry"); }
    else if (e.key === "s" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); save(); }
  };
  const goLine = (line) => {
    const el = ta.current; if (!el || !line) return;
    const parts = cur.code.split("\n");
    const s = parts.slice(0, line - 1).reduce((a, l) => a + l.length + 1, 0);
    el.focus(); el.setSelectionRange(s, s + (parts[line - 1] || "").length);
    el.scrollTop = Math.max(0, (line - 5) * 19);
  };

  const busy = phase !== "idle";
  const prog = b.progress;
  const writesList = mode === "dry" && (result || phase === "running") ? b.plan : null;
  // during a live run the writes stream in; afterwards the saved journal (with its rollback)
  const liveJournal = phase === "running" && mode === "live" ? { script: run.current?.script || cur.name, at: new Date(run.current?.t0 || Date.now()).toISOString(), orgUrl, entries: b.entries } : journal;
  const jStats = liveJournal ? rollbackStats(liveJournal.entries) : null;
  const tabBtn = (id, label, n) => <button onClick={() => setTab(id)} style={{ padding: "6px 12px", background: "none", border: "none", borderBottom: `2px solid ${tab === id ? C.vi : "transparent"}`, color: tab === id ? C.tx : C.txm, cursor: "pointer", fontSize: 13, fontWeight: tab === id ? 600 : 400 }}>{label}{n ? <span style={{ marginLeft: 5, fontSize: 11, color: C.txd, ...mono }}>{n.toLocaleString()}</span> : null}</button>;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      <div ref={host} style={{ display: "none" }} />
      {/* Toolbar */}
      <div style={{ padding: "10px 14px", borderBottom: `1px solid ${C.bd}`, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ fontWeight: 700, fontSize: 15, marginRight: 4 }}>⌨ {t("nav.script")}</div>
        <input value={cur.name} onChange={e => setCur(c => ({ ...c, name: e.target.value }))} style={inp({ width: bp.mobile ? "100%" : 220, fontSize: 13, padding: "5px 9px" })} aria-label={t("script.name")} />
        <select value="" onChange={e => { const s = scripts.find(x => x.id === e.target.value); if (s) openScript(s); }} style={inp({ width: "auto", fontSize: 12.5, padding: "5px 6px" })}>
          <option value="">{t("script.saved")} ({scripts.length})</option>
          {scripts.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select value="" onChange={e => { fromTemplate(e.target.value); e.target.value = ""; }} style={inp({ width: "auto", fontSize: 12.5, padding: "5px 6px" })}>
          <option value="">{t("script.templates")}</option>
          {SCRIPT_TEMPLATES.map(x => <option key={x.id} value={x.id}>{t(`script.tpl.${x.id}`)}</option>)}
        </select>
        <button onClick={save} disabled={busy} title="Ctrl+S" style={bt(null, { fontSize: 12, padding: "5px 10px" })}>💾 {t("script.save")}{dirty ? " •" : ""}</button>
        {cur.id && <button onClick={removeScript} disabled={busy} style={bt(null, { fontSize: 12, padding: "5px 10px", color: C.rd })}>{t("script.delete")}</button>}
        <button onClick={() => scriptFileRef.current?.click()} disabled={busy} style={bt(null, { fontSize: 12, padding: "5px 10px" })}>{t("script.open_file")}</button>
        <button onClick={() => dl(cur.code, "text/javascript", `${(cur.name || "script").replace(/[^\w.-]+/g, "_")}.js`)} style={bt(null, { fontSize: 12, padding: "5px 10px" })}>{t("script.download")}</button>
        <input ref={scriptFileRef} type="file" accept=".js,.txt" onChange={loadScriptFile} style={{ display: "none" }} />
        <div style={{ flex: 1 }} />
        <button onClick={() => setShowApi(s => !s)} style={bt(showApi ? C.sfa : null, { fontSize: 12, padding: "5px 10px", color: C.tx })}>{t("script.api")}</button>
      </div>

      <div style={{ flex: 1, display: "flex", flexDirection: bp.mobile ? "column" : "row", minHeight: 0 }}>
        {/* Editor + run controls */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, minHeight: bp.mobile ? 320 : 0, borderRight: bp.mobile ? "none" : `1px solid ${C.bd}` }}>
          <div style={{ flex: 1, display: "flex", minHeight: 0, background: C.bg }}>
            <div ref={gutter} aria-hidden style={{ width: 44, overflow: "hidden", padding: "10px 6px 10px 0", textAlign: "right", color: C.txd, fontSize: 12.5, lineHeight: "19px", userSelect: "none", ...mono, borderRight: `1px solid ${C.bd}` }}>
              {Array.from({ length: lines }, (_, i) => <div key={i} style={{ color: result?.line === i + 1 ? C.rd : undefined, fontWeight: result?.line === i + 1 ? 700 : 400 }}>{i + 1}</div>)}
            </div>
            <textarea ref={ta} value={cur.code} onChange={e => setCur(c => ({ ...c, code: e.target.value }))} onKeyDown={onKey} onScroll={e => { if (gutter.current) gutter.current.scrollTop = e.target.scrollTop; }}
              spellCheck={false} disabled={busy} wrap="off"
              style={{ flex: 1, resize: "none", border: "none", outline: "none", background: C.bg, color: C.tx, fontSize: 12.5, lineHeight: "19px", padding: "10px 12px", whiteSpace: "pre", overflow: "auto", tabSize: 2, ...mono }} />
          </div>
          <div style={{ padding: "8px 12px", borderTop: `1px solid ${C.bd}`, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <button onClick={() => fileRef.current?.click()} disabled={busy} style={bt(null, { fontSize: 12, padding: "5px 10px" })} title={t("script.input_hint")}>📄 {input ? `${input.name} · ${input.rows.length.toLocaleString()} ${t("script.rows")}` : t("script.input")}</button>
            {input && <button onClick={() => setInput(null)} disabled={busy} style={bt(null, { fontSize: 11, padding: "4px 7px" })}>✕</button>}
            <input ref={fileRef} type="file" accept=".csv,.tsv,.txt,.xlsx,.xls" onChange={loadInput} style={{ display: "none" }} />
            <label title={t("script.journal_hint")} style={{ fontSize: 12, color: C.txm, display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}><input type="checkbox" checked={journalOn} disabled={busy} onChange={e => setJournalOn(e.target.checked)} style={{ accentColor: C.vi }} /> {t("script.journal")}</label>
            <div style={{ flex: 1 }} />
            {busy
              ? <button onClick={phase === "running" ? stopRun : () => { if (run.current) run.current.stopped = true; }} style={bt(C.rd, { fontSize: 13 })}>■ {t("script.stop")}</button>
              : <>
                <button onClick={() => start("dry")} title="Ctrl+Enter" style={bt(C.vi, { fontSize: 13 })}>▶ {t("script.dry_run")}</button>
                <button onClick={() => start("live")} style={bt(orgInfo?.isProduction ? C.rd : C.or, { fontSize: 13 })}>⚡ {t("script.run_live")}</button>
              </>}
          </div>
        </div>

        {/* Output */}
        <div style={{ width: bp.mobile ? "100%" : bp.tablet ? "45%" : "48%", display: "flex", flexDirection: "column", minHeight: bp.mobile ? 300 : 0, minWidth: 0 }}>
          {showApi
            ? <div style={{ flex: 1, overflow: "auto", padding: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}><b>{t("script.api_title")}</b><button onClick={() => setShowApi(false)} style={bt(null, { fontSize: 11, padding: "3px 8px" })}>✕</button></div>
              <pre style={{ whiteSpace: "pre-wrap", fontSize: 12, lineHeight: 1.55, color: C.tx, ...mono, margin: 0 }}>{t("script.api_body")}</pre>
            </div>
            : <>
              <div style={{ display: "flex", borderBottom: `1px solid ${C.bd}`, padding: "0 6px", alignItems: "center" }}>
                {tabBtn("console", t("script.console"), b.logs.length)}
                {tabBtn("tables", t("script.tables"), b.tables.length)}
                {tabBtn("writes", writesList ? t("script.plan") : t("script.writes"), writesList ? writesList.length : liveJournal?.entries?.length || 0)}
                <div style={{ flex: 1 }} />
                {busy && <span style={{ fontSize: 12, color: C.txm, display: "flex", alignItems: "center", gap: 6, paddingRight: 6 }}><Spin s={11} />{phase === "rollback" ? t("script.rolling_back") : run.current?.finishing ? t("script.finishing") : mode === "dry" ? t("script.dry_running") : t("script.live_running")}</span>}
              </div>
              {prog && busy && prog.total > 0 && <div style={{ padding: "6px 12px", borderBottom: `1px solid ${C.bd}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, color: C.txm, marginBottom: 3 }}><span>{prog.label}</span><span style={mono}>{prog.done.toLocaleString()} / {prog.total.toLocaleString()}</span></div>
                <div style={{ height: 4, background: C.sfa, borderRadius: 2 }}><div style={{ height: 4, width: `${Math.min(100, (prog.done / prog.total) * 100)}%`, background: C.vi, borderRadius: 2, transition: "width .2s" }} /></div>
              </div>}
              <div style={{ flex: 1, overflow: "auto", padding: 10, minHeight: 0 }}>
                {tab === "console" && <ConsoleView b={b} result={result} goLine={goLine} busy={busy} />}
                {tab === "tables" && <TablesView tables={b.tables} />}
                {tab === "writes" && (writesList
                  ? <PlanView plan={writesList} result={result} />
                  : <JournalView journal={liveJournal} stats={jStats} saveError={saveError} busy={busy} onRollback={doRollback} onExport={exportJournal} onImport={() => journalFileRef.current?.click()} />)}
                <input ref={journalFileRef} type="file" accept=".json" onChange={importJournal} style={{ display: "none" }} />
              </div>
            </>}
        </div>
      </div>
    </div>
  );
}

function ConsoleView({ b, result, goLine, busy }) {
  const logs = b.logs.length > MAX_SHOWN ? b.logs.slice(-MAX_SHOWN) : b.logs;
  if (!logs.length && !result && !busy) return <div style={{ color: C.txd, fontSize: 13, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{t("script.empty")}</div>;
  const col = { info: C.tx, warn: C.yw, error: C.rd };
  return (
    <div style={{ ...mono, fontSize: 12, lineHeight: 1.5 }}>
      {b.logs.length > MAX_SHOWN && <div style={{ color: C.txd, marginBottom: 6 }}>… {(b.logs.length - MAX_SHOWN).toLocaleString()} {t("script.earlier_lines")}</div>}
      {logs.map((l, i) => <div key={i} style={{ color: col[l.level] || C.tx, whiteSpace: "pre-wrap", wordBreak: "break-word", borderBottom: `1px solid ${C.bd}55`, padding: "2px 0" }}><span style={{ color: C.txd, marginRight: 8 }}>{(l.at / 1000).toFixed(1)}s</span>{l.text}</div>)}
      {result && <div style={{ marginTop: 10, padding: "8px 10px", borderRadius: 6, background: (result.ok ? C.gn : result.stopped ? C.yw : C.rd) + "18", border: `1px solid ${(result.ok ? C.gn : result.stopped ? C.yw : C.rd)}55`, color: result.ok ? C.gn : result.stopped ? C.yw : C.rd, fontFamily: "inherit" }}>
        <b>{result.ok ? "✓ " + (result.mode === "dry" ? t("script.done_dry") : t("script.done_live")) : result.stopped ? "■ " + t("script.stopped") : "✕ " + t("script.failed")}</b>
        <span style={{ color: C.txm }}> · {(result.ms / 1000).toFixed(1)} s</span>
        {result.error && !result.stopped && <div style={{ whiteSpace: "pre-wrap", marginTop: 4, color: C.tx }}>{result.error}</div>}
        {result.line && <button onClick={() => goLine(result.line)} style={bt(null, { fontSize: 11, padding: "2px 8px", marginTop: 6 })}>{t("script.go_line")} {result.line}</button>}
        {result.ok && result.value !== null && result.value !== undefined && <div style={{ whiteSpace: "pre-wrap", marginTop: 4, color: C.tx }}>↩ {typeof result.value === "string" ? result.value : JSON.stringify(result.value, null, 2)}</div>}
      </div>}
    </div>
  );
}

function TablesView({ tables }) {
  if (!tables.length) return <div style={{ color: C.txd, fontSize: 13 }}>{t("script.no_tables")}</div>;
  return tables.map((tb, i) => {
    const cols = [...new Set(tb.rows.slice(0, 1000).flatMap(r => (r && typeof r === "object" ? Object.keys(r) : ["value"])))];
    const cell = (r, c) => { const v = r && typeof r === "object" ? r[c] : r; return v === null || v === undefined ? "" : typeof v === "object" ? JSON.stringify(v) : String(v); };
    const exp = (fmt) => exportTable(cols, tb.rows.map(r => cols.map(c => cell(r, c))), (tb.title || "script_table").replace(/[^\w-]+/g, "_"), fmt, tb.title || "Sheet1", true);
    return (
      <div key={i} style={{ ...crd({ marginBottom: 12, overflow: "hidden" }) }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", borderBottom: `1px solid ${C.bd}` }}>
          <b style={{ fontSize: 13 }}>{tb.title || `${t("script.table")} ${i + 1}`}</b>
          <span style={{ fontSize: 11.5, color: C.txd, ...mono }}>{tb.rows.length.toLocaleString()} {t("script.rows")}</span>
          <div style={{ flex: 1 }} />
          <button onClick={() => exp("csv")} style={bt(null, { fontSize: 11, padding: "3px 8px" })}>CSV</button>
          <button onClick={() => exp("xlsx")} style={bt(null, { fontSize: 11, padding: "3px 8px" })}>Excel</button>
        </div>
        <div style={{ overflow: "auto", maxHeight: 360 }}>
          <table style={{ borderCollapse: "collapse", fontSize: 12, width: "100%" }}>
            <thead><tr>{cols.map(c => <th key={c} style={{ textAlign: "left", padding: "5px 8px", borderBottom: `1px solid ${C.bd}`, color: C.txd, position: "sticky", top: 0, background: C.sf, whiteSpace: "nowrap" }}>{c}</th>)}</tr></thead>
            <tbody>{tb.rows.slice(0, TABLE_SHOWN).map((r, ri) => <tr key={ri}>{cols.map(c => <td key={c} style={{ padding: "4px 8px", borderBottom: `1px solid ${C.bd}55`, whiteSpace: "nowrap", maxWidth: 320, overflow: "hidden", textOverflow: "ellipsis", ...mono }} title={cell(r, c)}>{cell(r, c)}</td>)}</tr>)}</tbody>
          </table>
          {tb.rows.length > TABLE_SHOWN && <div style={{ padding: 8, fontSize: 11.5, color: C.txd }}>{t("script.table_more").replace("{n}", TABLE_SHOWN)}</div>}
        </div>
      </div>
    );
  });
}

function OpRow({ e }) {
  const color = { POST: C.gn, PATCH: C.cy, PUT: C.cy, DELETE: C.rd }[e.method] || C.txm;
  return (
    <div style={{ display: "flex", gap: 8, padding: "3px 0", borderBottom: `1px solid ${C.bd}55`, fontSize: 12, ...mono, alignItems: "baseline" }}>
      <span style={{ color: C.txd, width: 42, textAlign: "right", flexShrink: 0 }}>{e.seq}</span>
      <span style={{ color, width: 52, flexShrink: 0, fontWeight: 600 }}>{e.method}</span>
      <span style={{ flex: 1, wordBreak: "break-all" }} title={e.body || e.note || ""}>{e.path}{e.body && <span style={{ color: C.txd }}> {e.body.length > 140 ? e.body.slice(0, 140) + "…" : e.body}</span>}</span>
      {e.reversible && <span title={e.note} style={{ flexShrink: 0, fontSize: 11, color: e.reversible === "full" ? C.gn : e.reversible === "partial" ? C.yw : C.rd }}>{e.reversible === "full" ? "↶" : e.reversible === "partial" ? "↶ ~" : "✕"}</span>}
    </div>
  );
}

function PlanView({ plan, result }) {
  const sum = summarize(plan);
  return (
    <div>
      <div style={{ fontSize: 13, marginBottom: 8, color: C.txm }}>{plan.length ? t("script.plan_intro").replace("{n}", plan.length.toLocaleString()) : (result ? t("script.plan_none") : "")}</div>
      {sum.length > 0 && <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>{sum.map(s => <span key={s.label} style={{ padding: "3px 9px", borderRadius: 12, background: C.sfa, fontSize: 12, ...mono }}>{s.count.toLocaleString()} × {s.label}</span>)}</div>}
      {plan.slice(0, MAX_SHOWN).map(e => <OpRow key={e.seq} e={e} />)}
      {plan.length > MAX_SHOWN && <div style={{ color: C.txd, fontSize: 12, marginTop: 6 }}>… {(plan.length - MAX_SHOWN).toLocaleString()} {t("script.more_ops")}</div>}
    </div>
  );
}

function JournalView({ journal, stats, saveError, busy, onRollback, onExport, onImport }) {
  if (!journal?.entries?.length) return (
    <div style={{ color: C.txd, fontSize: 13, lineHeight: 1.6 }}>
      {t("script.no_journal")}
      <div style={{ marginTop: 10 }}><button onClick={onImport} style={bt(null, { fontSize: 12, padding: "4px 10px" })}>{t("script.import_journal")}</button></div>
    </div>
  );
  const rb = journal.rollback;
  return (
    <div>
      <div style={{ ...crd({ padding: 10, marginBottom: 10 }) }}>
        <div style={{ fontSize: 13, marginBottom: 6 }}><b>{journal.script}</b> <span style={{ color: C.txd }}>· {new Date(journal.at).toLocaleString()}</span></div>
        <div style={{ fontSize: 12.5, color: C.txm, marginBottom: 8 }}>
          {journal.entries.length.toLocaleString()} {t("script.writes_done")} — <span style={{ color: C.gn }}>{stats.full} {t("script.rev_full")}</span> · <span style={{ color: C.yw }}>{stats.partial} {t("script.rev_partial")}</span> · <span style={{ color: C.rd }}>{stats.none} {t("script.rev_none")}</span>
        </div>
        {saveError && <div style={{ fontSize: 12.5, marginBottom: 8, color: C.rd }}>⚠ {t("script.journal_save_failed")} ({saveError})</div>}
        {journal.inProgress && !busy && <div style={{ fontSize: 12.5, marginBottom: 8, color: C.yw }}>⚠ {t("script.journal_in_progress")}</div>}
        {rb && <div style={{ fontSize: 12.5, marginBottom: 8, color: rb.failed.length || rb.stopped ? C.yw : C.gn }}>
          {t("script.rollback_result").replace("{undone}", rb.undone).replace("{failed}", rb.failed.length).replace("{skipped}", rb.skipped)}{rb.already ? ` · ${t("script.rollback_already").replace("{n}", rb.already)}` : ""}{rb.stopped ? ` — ${t("script.stopped")}` : ""}
          {rb.failed.slice(0, 20).map(f => <div key={f.seq} style={{ color: C.rd, ...mono, fontSize: 11.5 }}>#{f.seq} {f.method} {f.path}: {f.error}</div>)}
        </div>}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <button onClick={onRollback} disabled={busy || journal.rolledBack || !stats.ops} style={bt(journal.rolledBack || !stats.ops ? null : C.or, { fontSize: 12, padding: "5px 11px", opacity: journal.rolledBack || !stats.ops ? 0.55 : 1 })}>↶ {journal.rolledBack ? t("script.rolled_back") : rb ? t("script.rollback_resume") : t("script.rollback")}</button>
          <button onClick={onExport} style={bt(null, { fontSize: 12, padding: "5px 10px" })}>{t("script.export_journal")}</button>
          <button onClick={onImport} disabled={busy} style={bt(null, { fontSize: 12, padding: "5px 10px" })}>{t("script.import_journal")}</button>
        </div>
        {stats.partial + stats.none > 0 && <div style={{ fontSize: 11.5, color: C.txd, marginTop: 8 }}>{t("script.rev_note")}</div>}
      </div>
      {journal.entries.slice(0, MAX_SHOWN).map(e => <OpRow key={e.seq} e={e} />)}
      {journal.entries.length > MAX_SHOWN && <div style={{ color: C.txd, fontSize: 12, marginTop: 6 }}>… {(journal.entries.length - MAX_SHOWN).toLocaleString()} {t("script.more_ops")}</div>}
    </div>
  );
}
