import { useState, useEffect, useRef } from "react";
import { C, mono } from "../shared.jsx";
import { t } from "../i18n.js";

// Ctrl/Cmd+K command palette — jump to any module or run a quick action.
// Items: the visible tabs (permission-filtered upstream) + global actions.
export default function CommandPalette({ open, onClose, tabs, onNavigate, actions }) {
  const [q, setQ] = useState("");
  const [idx, setIdx] = useState(0);
  const inputRef = useRef(null);

  const items = [
    ...tabs.map(tb => ({ kind: "tab", id: tb.id, label: tb.label, hint: tb.desc, icon: tb.icon })),
    ...actions.map(a => ({ kind: "action", ...a })),
  ];
  const needle = q.toLowerCase().trim();
  const visible = needle ? items.filter(i => (i.label + " " + (i.hint || "")).toLowerCase().includes(needle)) : items;

  useEffect(() => { if (open) { setQ(""); setIdx(0); setTimeout(() => inputRef.current?.focus(), 30); } }, [open]);
  useEffect(() => { setIdx(0); }, [q]);

  if (!open) return null;

  const run = (item) => {
    onClose();
    if (item.kind === "tab") onNavigate(item.id);
    else item.run();
  };

  const onKey = (e) => {
    if (e.key === "Escape") { e.preventDefault(); onClose(); }
    if (e.key === "ArrowDown") { e.preventDefault(); setIdx(i => Math.min(i + 1, visible.length - 1)); }
    if (e.key === "ArrowUp") { e.preventDefault(); setIdx(i => Math.max(i - 1, 0)); }
    if (e.key === "Enter" && visible[idx]) { e.preventDefault(); run(visible[idx]); }
  };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 300, display: "flex", justifyContent: "center", paddingTop: "12vh" }}>
      <div onClick={e => e.stopPropagation()} style={{ width: 480, maxWidth: "92vw", height: "fit-content", background: C.sf, border: `1px solid ${C.bd}`, borderRadius: 10, boxShadow: "0 16px 48px rgba(0,0,0,.55)", overflow: "hidden" }}>
        <input ref={inputRef} value={q} onChange={e => setQ(e.target.value)} onKeyDown={onKey}
          placeholder={t("palette.placeholder")}
          style={{ width: "100%", boxSizing: "border-box", padding: "12px 16px", background: "transparent", border: "none", borderBottom: `1px solid ${C.bd}`, color: C.tx, fontSize: 15, outline: "none" }} />
        <div style={{ maxHeight: 320, overflow: "auto" }}>
          {visible.length === 0 && <div style={{ padding: 14, fontSize: 13, color: C.txd, textAlign: "center" }}>{t("palette.empty")}</div>}
          {visible.map((item, i) => (
            <button key={item.kind + (item.id || item.label)} onClick={() => run(item)} onMouseEnter={() => setIdx(i)}
              style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "9px 16px", border: "none", cursor: "pointer", textAlign: "left", background: i === idx ? C.vi + "22" : "transparent", color: C.tx }}>
              <span style={{ color: C.cy, display: "flex", width: 18 }}>{item.icon || "⚡"}</span>
              <span style={{ flex: 1, fontSize: 13.5, fontWeight: i === idx ? 600 : 400 }}>{item.label}</span>
              {item.hint && <span style={{ fontSize: 11, color: C.txd }}>{item.hint}</span>}
              <span style={{ fontSize: 10, color: C.txd, ...mono }}>{item.kind === "tab" ? t("palette.kind_tab") : t("palette.kind_action")}</span>
            </button>
          ))}
        </div>
        <div style={{ padding: "6px 16px", borderTop: `1px solid ${C.bd}`, fontSize: 10.5, color: C.txd }}>↑↓ {t("palette.nav")} · ⏎ {t("palette.open")} · Esc</div>
      </div>
    </div>
  );
}
