import { useState, useEffect, useMemo, useRef } from "react";
import { bridge } from "../d365-bridge.js";
import { C, Spin, mono, inp, bt, crd, confirmProd } from "../shared.jsx";
import { t } from "../i18n.js";
import { WR_TYPES, isTextType, isImageType, typeLabel, decodeContent, encodeContent, contentBytes, byteSize, filterResources, searchContents, offsetOfLine, changedSince, changedMessage } from "../webResources.js";

const PACKET = 25;
const fmtBytes = (n) => (n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(2)} MB`);

// Web Resources — list, edit text resources (save, publish), preview images, download anything,
// and search a text inside every script / page (what Dataverse's dependency tracking can't see).
export default function WebResources({ bp, orgInfo }) {
  const [list, setList] = useState(null);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [type, setType] = useState("all");
  const [showSystem, setShowSystem] = useState(false);
  const [tick, setTick] = useState(0);
  // the open resource: { id, name, type, managed, b64, text, bom, saved (text at load/save), loading, busy, msg }
  const [open, setOpen] = useState(null);
  // content search: { query, caseSensitive, wholeWord, phase: idle|reading|done, done, total, hits, cache: Map id→text }
  const [cs, setCs] = useState({ query: "", caseSensitive: false, wholeWord: false, phase: "idle", done: 0, total: 0, hits: null });
  const cache = useRef(new Map());
  const stop = useRef(false);
  const ta = useRef(null);
  const openGen = useRef(0);

  useEffect(() => {
    let alive = true;
    setError("");
    bridge.getWebResources().then(l => { if (alive) setList(l || []); }).catch(e => { if (alive) { setError(e.message || String(e)); setList([]); } });
    return () => { alive = false; };
  }, [tick]);

  const shown = useMemo(() => filterResources(list, { search, type, showSystem }), [list, search, type, showSystem]);
  const counts = useMemo(() => { const m = {}; for (const r of filterResources(list, { showSystem })) m[r.type] = (m[r.type] || 0) + 1; return m; }, [list, showSystem]);

  const openRes = async (r, line) => {
    const my = ++openGen.current;
    if (open && open.text !== open.saved && !window.confirm(`Discard the unsaved changes to ${open.name}?`)) return;
    setOpen({ ...r, loading: true, b64: "", text: "", saved: "", bom: false, busy: "", msg: null });
    try {
      const [c] = await bridge.getWebResourceContents([r.id]);
      if (openGen.current !== my) return;
      if (!c) throw new Error("The web resource couldn't be read.");
      const { text, bom, encoding } = isTextType(r.type) ? decodeContent(c.content) : { text: "", bom: false, encoding: "utf-8" };
      cache.current.set(r.id, text);
      // the stamp of the copy actually opened (the list's may be minutes old) — what a save is checked against
      setOpen({ ...r, modifiedOn: c.modifiedOn || r.modifiedOn, loading: false, b64: c.content, text, saved: text, bom, readOnly: encoding !== "utf-8", busy: "", msg: null, description: c.description });
      if (line) setTimeout(() => goToLine(text, line), 50);
    } catch (e) { if (openGen.current === my) setOpen(o => (o ? { ...o, loading: false, failed: true, msg: { ok: false, text: e.message || String(e) } } : o)); }
  };
  const goToLine = (text, line) => {
    const el = ta.current; if (!el) return;
    const start = offsetOfLine(text, line), end = text.indexOf("\n", start);
    el.focus(); el.setSelectionRange(start, end < 0 ? text.length : end);
    el.scrollTop = Math.max(0, (line - 4) * 18);
  };

  // The server's current stamp of a resource — one tiny read, no content. The demo org doesn't
  // serve the query action: there the contents read (which carries modifiedOn) stands in.
  const serverStamp = async (id) => {
    const x = (await bridge.query(`webresourceset(${id})`, { select: "modifiedon,_modifiedby_value" }))?.records?.[0];
    if (x) return { modifiedOn: x.modifiedon || "", modifiedBy: x["_modifiedby_value@OData.Community.Display.V1.FormattedValue"] || "" };
    const [c] = (await bridge.getWebResourceContents([id])) || [];
    return c ? { modifiedOn: c.modifiedOn || "", modifiedBy: "" } : null;
  };

  const save = async (publish) => {
    if (!open || open.busy) return;
    const { id } = open, my = openGen.current;
    const upd = (f) => setOpen(o => (o && o.id === id ? f(o) : o)); // the user may open another resource while a request runs
    const dirty = open.text !== open.saved;
    if (!dirty && !publish) return;
    const b64 = encodeContent(open.text, open.bom);
    const what = dirty ? (publish ? "Save and publish" : "Save") : "Publish";
    // The update is an unconditional PATCH (If-Match: *): without this check, two people editing
    // the same script means the second save silently erases the first — refuse unless told to.
    if (dirty) {
      upd(o => ({ ...o, busy: "Checking…", msg: null }));
      let stamp = null;
      try { stamp = await serverStamp(id); } catch { /* unreadable stamp: can't tell, save as before */ }
      if (openGen.current !== my) return; // switched to another resource meanwhile
      if (stamp && changedSince(open.modifiedOn, stamp.modifiedOn)) {
        const text = changedMessage(open.name, stamp);
        if (!window.confirm(`${text}\n\nOK = overwrite the server's version with yours anyway.\nCancel = keep your edits here, unsaved.`)) { upd(o => ({ ...o, busy: "", msg: { ok: false, text: `Not saved: ${text}`, reload: true } })); return; }
      }
      upd(o => ({ ...o, busy: "" }));
    }
    const lines = [`${what} ${open.name}?`, "", dirty ? `${fmtBytes(byteSize(b64))} (was ${fmtBytes(byteSize(open.b64))}).` : "No change in the content — the current version is published."];
    if (publish) lines.push("Every form and page that loads it gets this version at once, for every user."); else if (dirty) lines.push("Saved but not published: users keep the published version until a publish.");
    if (open.managed) lines.push("It comes from a managed solution: the next import of that solution may overwrite this change.");
    if (!window.confirm(lines.join("\n"))) return;
    if (!confirmProd(orgInfo?.isProduction, `${what} web resource ${open.name}`)) return;
    upd(o => ({ ...o, busy: dirty ? "Saving…" : "Publishing…", msg: null }));
    try {
      if (dirty) await bridge.updateWebResource(id, b64);
      if (publish) { upd(o => ({ ...o, busy: "Publishing…" })); await bridge.publishWebResources([id]); }
      cache.current.set(id, open.text);
      // the server's stamp of what was just written — the next save is checked against it
      const after = dirty ? await serverStamp(id).catch(() => null) : null;
      const stamp = dirty ? { modifiedOn: after?.modifiedOn || new Date().toISOString(), modifiedBy: after?.modifiedBy || "you" } : {};
      setList(l => (l || []).map(r => (r.id === id && dirty ? { ...r, ...stamp } : r)));
      // what was WRITTEN is what's saved — not whatever was typed while the request ran
      upd(o => ({ ...o, b64: dirty ? b64 : o.b64, saved: open.text, ...stamp, busy: "", msg: { ok: true, text: `✓ ${dirty ? "Saved" : ""}${dirty && publish ? " and " : ""}${publish ? "published" : ""}.` } }));
    } catch (e) { upd(o => ({ ...o, busy: "", msg: { ok: false, text: `${what} failed: ${e.message || String(e)}` } })); }
  };
  // Ctrl+S: one listener, reading the latest save() through a ref (no re-registration per keystroke)
  const saveRef = useRef(null);
  saveRef.current = () => { if (open && !open.loading && !open.failed && !open.readOnly && isTextType(open.type)) save(true); };
  useEffect(() => {
    const h = (e) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") { e.preventDefault(); saveRef.current?.(); } };
    window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h);
  }, []);

  const download = () => {
    if (!open) return;
    const bytes = isTextType(open.type) ? new TextEncoder().encode(open.text) : contentBytes(open.b64);
    const url = URL.createObjectURL(new Blob([bytes], { type: WR_TYPES[open.type]?.mime || "application/octet-stream" }));
    const a = document.createElement("a"); a.href = url; a.download = open.name.split("/").pop() || "webresource"; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  // ── search in contents: text resources (as filtered), 25 per read, hits recomputed from the cache ──
  const runSearch = async () => {
    const q = cs.query.trim();
    if (!q) return;
    const targets = filterResources(list, { showSystem }).filter(r => isTextType(r.type));
    const missing = targets.filter(r => !cache.current.has(r.id)).map(r => r.id);
    stop.current = false;
    setCs(x => ({ ...x, phase: "reading", done: targets.length - missing.length, total: targets.length, hits: null }));
    try {
      for (let i = 0; i < missing.length; i += PACKET) {
        if (stop.current) break;
        const got = await bridge.getWebResourceContents(missing.slice(i, i + PACKET));
        for (const c of got || []) cache.current.set(c.id, decodeContent(c.content).text);
        setCs(x => ({ ...x, done: Math.min(x.total, x.done + Math.min(PACKET, missing.length - i)) }));
      }
      const items = targets.filter(r => cache.current.has(r.id)).map(r => ({ id: r.id, name: r.name, text: cache.current.get(r.id) }));
      const hits = searchContents(items, q, { caseSensitive: cs.caseSensitive, wholeWord: cs.wholeWord });
      setCs(x => ({ ...x, phase: "done", hits, stopped: stop.current, scanned: items.length }));
    } catch (e) { setCs(x => ({ ...x, phase: "done", hits: [], scanned: 0, error: e.message || String(e) })); }
  };
  const byId = useMemo(() => new Map((list || []).map(r => [r.id, r])), [list]);
  const dirty = !!open && open.text !== open.saved;
  const typeOptions = Object.entries(WR_TYPES).filter(([k]) => counts[k]);

  return (
    <div style={{ display: "flex", height: "100%", flexDirection: bp.mobile ? "column" : "row" }}>
      <div style={{ width: bp.mobile ? "100%" : bp.tablet ? 290 : 340, borderRight: bp.mobile ? "none" : `1px solid ${C.bd}`, display: "flex", flexDirection: "column", flexShrink: 0, ...(bp.mobile && open ? { display: "none" } : {}) }}>
        <div style={{ padding: "10px 10px 6px" }}>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 6 }}>📜 {t("nav.webres")}</div>
          <div style={{ display: "flex", gap: 6 }}>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Filter by name…" style={{ ...inp({ fontSize: 12.5, padding: "5px 9px" }), flex: 1 }} />
            <button onClick={() => setTick(x => x + 1)} title="Reload the list" style={bt(null, { fontSize: 11, padding: "3px 8px" })}>↻</button>
          </div>
          <div style={{ display: "flex", gap: 6, marginTop: 6, alignItems: "center", flexWrap: "wrap" }}>
            <select value={type} onChange={e => setType(e.target.value)} style={inp({ width: "auto", fontSize: 11.5, padding: "3px 6px" })}>
              <option value="all">All kinds</option>
              {typeOptions.map(([k, v]) => <option key={k} value={k}>{v.label} ({counts[k]})</option>)}
            </select>
            <label style={{ fontSize: 11.5, color: C.txm, display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}><input type="checkbox" checked={showSystem} onChange={e => setShowSystem(e.target.checked)} style={{ accentColor: C.vi }} /> Microsoft & hidden</label>
            <span style={{ fontSize: 11, color: C.txd, ...mono }}>{shown.length.toLocaleString()}</span>
          </div>
          <div style={{ marginTop: 8, borderTop: `1px solid ${C.bd}`, paddingTop: 8 }}>
            <div style={{ display: "flex", gap: 6 }}>
              <input value={cs.query} onChange={e => setCs(x => ({ ...x, query: e.target.value }))} onKeyDown={e => { if (e.key === "Enter") runSearch(); }} placeholder="🔎 Search in contents (a column name, a URL…)" style={{ ...inp({ fontSize: 12.5, padding: "5px 9px" }), flex: 1 }} />
              {cs.phase === "reading" ? <button onClick={() => { stop.current = true; }} style={bt(C.rd, { fontSize: 11, padding: "3px 8px" })}>Stop</button> : <button onClick={runSearch} disabled={!cs.query.trim() || !list} style={bt(C.vi, { fontSize: 11, padding: "3px 10px", opacity: cs.query.trim() ? 1 : .5 })}>Search</button>}
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 4, fontSize: 11.5, color: C.txm }}>
              <label style={{ display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}><input type="checkbox" checked={cs.caseSensitive} onChange={e => setCs(x => ({ ...x, caseSensitive: e.target.checked }))} style={{ accentColor: C.vi }} /> match case</label>
              <label style={{ display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}><input type="checkbox" checked={cs.wholeWord} onChange={e => setCs(x => ({ ...x, wholeWord: e.target.checked }))} style={{ accentColor: C.vi }} /> whole word</label>
              {cs.phase === "reading" && <span><Spin s={9} /> {cs.done} / {cs.total} read</span>}
            </div>
          </div>
        </div>
        <div style={{ flex: 1, overflow: "auto", padding: "0 6px 6px" }}>
          {cs.phase === "done" && cs.hits && <div style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 11.5, color: C.txd, padding: "4px 4px 2px", display: "flex", gap: 6 }}><span style={{ flex: 1 }}>{cs.hits.length} line{cs.hits.length === 1 ? "" : "s"} in {new Set(cs.hits.map(h => h.id)).size} resource{new Set(cs.hits.map(h => h.id)).size === 1 ? "" : "s"} · {cs.scanned} text resources read{cs.total - cs.scanned > 0 ? ` · ${cs.total - cs.scanned} couldn't be read` : ""}{cs.stopped ? " (stopped)" : ""}{cs.error ? ` · ${cs.error}` : ""}</span><button onClick={() => setCs(x => ({ ...x, phase: "idle", hits: null }))} style={{ background: "none", border: "none", color: C.txd, cursor: "pointer" }}>✕</button></div>
            {cs.hits.slice(0, 500).map((h, i) => (
              <div key={i} onClick={() => byId.get(h.id) && openRes(byId.get(h.id), h.line)} style={{ padding: "4px 8px", cursor: "pointer", borderRadius: 4, fontSize: 12 }} onMouseEnter={e => e.currentTarget.style.background = C.sfh} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                <div style={{ color: C.cy, ...mono, fontSize: 11.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{h.name}<span style={{ color: C.txd }}> :{h.line}</span></div>
                <div style={{ color: C.txm, ...mono, fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{h.preview}</div>
              </div>
            ))}
            {cs.hits.length > 500 && <div style={{ fontSize: 11, color: C.txd, padding: 4 }}>first 500 shown</div>}
          </div>}
          {list === null && <div style={{ padding: 14, color: C.txd, fontSize: 13 }}><Spin s={12} /> Loading…</div>}
          {error && <div style={{ padding: 14, color: C.rd, fontSize: 12.5 }}>{error}</div>}
          {list && !shown.length && <div style={{ padding: 14, color: C.txd, fontSize: 12.5 }}>No web resource matches.</div>}
          {shown.map(r => (
            <button key={r.id} onClick={() => openRes(r)} title={r.displayName || r.name} style={{ width: "100%", display: "flex", alignItems: "center", gap: 6, padding: "5px 8px", border: "none", borderRadius: 5, cursor: "pointer", background: open?.id === r.id ? C.sfa : "transparent", color: open?.id === r.id ? C.tx : C.txm, textAlign: "left" }}>
              <span style={{ fontSize: 10, padding: "1px 5px", borderRadius: 3, background: C.bg, color: C.txd, ...mono, flexShrink: 0 }}>{WR_TYPES[r.type]?.ext || r.type}</span>
              <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, ...mono, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name}</span>
              {r.managed && <span title="From a managed solution" style={{ fontSize: 10, color: C.vi }}>M</span>}
            </button>
          ))}
        </div>
      </div>

      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
        {!open ? <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: C.txd, fontSize: 14, padding: 20, textAlign: "center", lineHeight: 1.6 }}>Select a web resource to view or edit it.<br /><span style={{ fontSize: 12.5 }}>Search in contents finds a column name, a URL or a function inside every script — what Dataverse's dependency tracking can't see.</span></div> : (
          <>
            <div style={{ padding: "10px 14px", borderBottom: `1px solid ${C.bd}`, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              {bp.mobile && <button onClick={() => setOpen(null)} style={bt(null, { fontSize: 11 })}>← Back</button>}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 14, ...mono, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{open.name}{dirty && <span style={{ color: C.yw }}> ●</span>}</div>
                <div style={{ fontSize: 11.5, color: C.txd, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{typeLabel(open.type)}{open.displayName ? ` · ${open.displayName}` : ""}{open.b64 ? ` · ${fmtBytes(byteSize(open.b64))}` : ""}{open.modifiedOn ? ` · modified ${new Date(open.modifiedOn).toLocaleString()}${open.modifiedBy ? ` by ${open.modifiedBy}` : ""}` : ""}{open.managed ? " · managed" : ""}</div>
              </div>
              {orgInfo?.orgUrl && <a href={`${orgInfo.orgUrl}/WebResources/${open.name}`} target="_blank" rel="noreferrer" title="Open the published version in Dynamics 365" style={{ ...bt(null, { fontSize: 11.5 }), textDecoration: "none" }}>Open ↗</a>}
              <button onClick={download} disabled={open.loading} style={bt(null, { fontSize: 11.5 })}>⬇ Download</button>
              {isTextType(open.type) && <>
                <button onClick={() => setOpen(o => ({ ...o, text: o.saved }))} disabled={!dirty || !!open.busy} style={bt(null, { fontSize: 11.5, opacity: dirty ? 1 : .5 })}>Revert</button>
                <button onClick={() => save(false)} disabled={!dirty || !!open.busy} style={bt(null, { fontSize: 11.5, opacity: dirty ? 1 : .5 })}>Save</button>
                <button onClick={() => save(true)} disabled={!!open.busy || open.loading || open.failed || open.readOnly} title="Ctrl+S" style={bt(C.vi, { fontSize: 11.5 })}>{open.busy ? <><Spin s={10} /> {open.busy}</> : "Save & publish"}</button>
              </>}
            </div>
            {open.msg && <div style={{ padding: "6px 14px", fontSize: 12.5, color: open.msg.ok ? C.gn : C.rd, borderBottom: `1px solid ${C.bd}`, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}><span style={{ flex: 1 }}>{open.msg.text}</span>{open.msg.reload && <button onClick={() => openRes(open)} title="Discard your edits and open the server's current version" style={bt(null, { fontSize: 11.5, padding: "3px 9px" })}>↻ Reload</button>}</div>}
            {open.managed && isTextType(open.type) && <div style={{ padding: "5px 14px", fontSize: 12, color: C.yw, borderBottom: `1px solid ${C.bd}` }}>From a managed solution — a change here is an unmanaged layer that the solution's next import may overwrite.</div>}
            {open.readOnly && <div style={{ padding: "5px 14px", fontSize: 12, color: C.yw, borderBottom: `1px solid ${C.bd}` }}>UTF-16 content — shown read-only: Colvio edits UTF-8 web resources only (download it to change it elsewhere).</div>}
            <div style={{ flex: 1, minHeight: 0, display: "flex" }}>
              {open.loading ? <div style={{ padding: 20, color: C.txd, fontSize: 13 }}><Spin s={12} /> Reading…</div>
                : open.failed ? <div style={{ padding: 20, color: C.rd, fontSize: 13 }}>Couldn't read {open.name}: {open.msg?.text} <button onClick={() => openRes(open)} style={{ ...bt(null, { fontSize: 12 }), marginLeft: 8 }}>↻ Retry</button></div>
                : isTextType(open.type) ? <textarea ref={ta} value={open.text} onChange={e => setOpen(o => ({ ...o, text: e.target.value }))} disabled={!!open.busy || open.readOnly} spellCheck={false} wrap="off" style={{ flex: 1, width: "100%", resize: "none", border: "none", outline: "none", padding: "10px 14px", background: C.bg, color: C.tx, ...mono, fontSize: 12.5, lineHeight: "18px", tabSize: 2 }} />
                : isImageType(open.type) ? <div style={{ padding: 20, display: "flex", alignItems: "center", justifyContent: "center", flex: 1, background: `repeating-conic-gradient(${C.bd} 0 25%, transparent 0 50%) 0 0 / 20px 20px` }}><img alt={open.name} src={`data:${WR_TYPES[open.type]?.mime};base64,${open.b64}`} style={{ maxWidth: "100%", maxHeight: "80vh" }} /></div>
                : <div style={{ padding: 20, color: C.txd, fontSize: 13 }}>Binary content — download it to look inside.</div>}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
