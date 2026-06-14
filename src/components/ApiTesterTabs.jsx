import { useState, useRef } from "react";
import ApiTester from "./ApiTester.jsx";
import { C, mono } from "../shared.jsx";

// Multi-tab wrapper around ApiTester (like Salesforce Inspector's multiple query tabs).
// Design: every tab keeps its own <ApiTester/> instance MOUNTED, with inactive ones
// hidden via display:none. This preserves each tab's full request/response state without
// touching ApiTester's internals — zero regression risk to the single-request component.
export default function ApiTesterTabs(props) {
  const seq = useRef(1);
  const [tabs, setTabs] = useState([{ id: 1, label: "Request 1" }]);
  const [active, setActive] = useState(1);
  const [editingId, setEditingId] = useState(null);  // tab being renamed inline
  const [draft, setDraft] = useState("");

  const startEdit = (tab) => { setEditingId(tab.id); setDraft(tab.label); };
  const commitEdit = () => { if (editingId != null) { renameTab(editingId, draft.trim()); setEditingId(null); } };

  const addTab = () => {
    seq.current += 1;
    const id = seq.current;
    setTabs(t => [...t, { id, label: `Request ${t.length + 1}` }]);
    setActive(id);
  };

  const closeTab = (id) => {
    setTabs(t => {
      if (t.length <= 1) return t; // always keep at least one tab
      const idx = t.findIndex(x => x.id === id);
      const next = t.filter(x => x.id !== id);
      if (active === id) {
        const fallback = next[Math.min(idx, next.length - 1)];
        setActive(fallback.id);
      }
      return next;
    });
  };

  const renameTab = (id, label) => {
    setTabs(t => t.map(x => x.id === id ? { ...x, label: label || x.label } : x));
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Tab bar */}
      <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "6px 8px 0", borderBottom: `1px solid ${C.bd}`, flexWrap: "wrap", flexShrink: 0 }}>
        {tabs.map(t => {
          const isActive = t.id === active;
          return (
            <div
              key={t.id}
              onClick={() => setActive(t.id)}
              onDoubleClick={() => startEdit(t)}
              title="Click to switch · double-click to rename"
              style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "5px 10px", cursor: "pointer",
                borderRadius: "6px 6px 0 0",
                background: isActive ? C.sfa : "transparent",
                border: `1px solid ${isActive ? C.bd : "transparent"}`,
                borderBottom: isActive ? `1px solid ${C.sfa}` : `1px solid transparent`,
                marginBottom: -1,
                color: isActive ? C.tx : C.txm,
                fontSize: 12, fontWeight: isActive ? 600 : 400,
                maxWidth: 200,
              }}
            >
              {editingId === t.id ? (
                <input
                  autoFocus
                  value={draft}
                  onChange={e => setDraft(e.target.value)}
                  onClick={e => e.stopPropagation()}
                  onBlur={commitEdit}
                  onKeyDown={e => { if (e.key === "Enter") commitEdit(); else if (e.key === "Escape") setEditingId(null); }}
                  onFocus={e => e.target.select()}
                  style={{ width: 120, fontSize: 12, padding: "1px 4px", border: `1px solid ${C.vi}`, borderRadius: 3, background: C.bg, color: C.tx, outline: "none" }}
                />
              ) : (
                <span onDoubleClick={() => startEdit(t)} style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.label}</span>
              )}
              {editingId !== t.id && tabs.length > 1 && (
                <span
                  onClick={(e) => { e.stopPropagation(); closeTab(t.id); }}
                  title="Close tab"
                  style={{ color: C.txd, fontSize: 13, lineHeight: 1, padding: "0 2px", borderRadius: 3 }}
                  onMouseEnter={e => { e.currentTarget.style.color = C.rd; }}
                  onMouseLeave={e => { e.currentTarget.style.color = C.txd; }}
                >✕</span>
              )}
            </div>
          );
        })}
        <button
          onClick={addTab}
          title="New request tab"
          style={{ padding: "4px 10px", marginLeft: 2, marginBottom: 2, background: "transparent", border: `1px dashed ${C.bd}`, borderRadius: 5, color: C.cy, cursor: "pointer", fontSize: 12, fontWeight: 600, ...mono }}
        >+ New</button>
      </div>

      {/* One ApiTester per tab — only the active one is visible, the rest keep their state alive */}
      <div style={{ flex: 1, overflow: "auto" }}>
        {tabs.map(t => (
          <div key={t.id} style={{ display: t.id === active ? "block" : "none" }}>
            <ApiTester {...props} />
          </div>
        ))}
      </div>
    </div>
  );
}
