import { useState, useMemo, useEffect } from "react";
import { C, I, useDebounce, mono, displayType, inp } from "../shared.jsx";

export default function FieldPicker({ fields, selected, onToggle, onBulkAdd, onBulkRemove, onSelectAll, onSelectNone, bp, onClose }) {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [customOnly, setCustomOnly] = useState(false);

  // Escape key to close
  useEffect(() => {
    if (!onClose) return;
    const h = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  const debouncedSearch = useDebounce(search, 150);
  const types = useMemo(() => [...new Set(fields.map(f => f.t))].sort(), [fields]);

  const filtered = useMemo(() => {
    return fields.filter(f => {
      if (debouncedSearch) {
        const s = debouncedSearch.toLowerCase();
        if (!f.l.toLowerCase().includes(s) && !f.d.toLowerCase().includes(s)) return false;
      }
      if (typeFilter !== "all" && f.t !== typeFilter) return false;
      if (customOnly && !f.cust) return false;
      return true;
    });
  }, [fields, debouncedSearch, typeFilter, customOnly]);

  const selectedSet = new Set(selected);
  const filteredSelected = filtered.filter(f => selectedSet.has(f.l));
  const filteredUnselected = filtered.filter(f => !selectedSet.has(f.l));

  const selectFiltered = () => {
    const toAdd = filtered.filter(f => !selectedSet.has(f.l)).map(f => f.l);
    if (onBulkAdd && toAdd.length > 0) onBulkAdd(toAdd);
    else toAdd.forEach(f => onToggle(f));
  };

  const unselectFiltered = () => {
    const toRemove = filtered.filter(f => selectedSet.has(f.l)).map(f => f.l);
    if (onBulkRemove && toRemove.length > 0) onBulkRemove(toRemove);
    else toRemove.forEach(f => onToggle(f));
  };

  const typeColor = (t) => {
    if (t === "Lookup") return { bg: C.vid, fg: C.lv };
    if (t === "Picklist" || t === "State" || t === "Status") return { bg: C.gnd, fg: C.gn };
    if (t === "Money" || t === "Integer" || t === "Decimal") return { bg: "#92400E33", fg: C.yw };
    if (t === "DateTime") return { bg: "#0E749033", fg: C.cy };
    if (t === "Uniqueidentifier") return { bg: "#5C638033", fg: C.txm };
    return { bg: C.sfh, fg: C.txm };
  };

  return (
    <div style={{
      marginLeft: bp.mobile ? 0 : 50,
      background: C.bg, borderRadius: 8, border: `1px solid ${C.bd}`,
      overflow: "hidden", maxHeight: bp.mobile ? 280 : 350,
      display: "flex", flexDirection: "column",
    }}>
      <div style={{ padding: "8px 10px", borderBottom: `1px solid ${C.bd}`, background: C.sf }}>
        <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 6 }}>
          <div style={{ position: "relative", flex: 1 }}>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search column..."
              autoFocus
              style={inp({ fontSize: 13, padding: "5px 10px 5px 28px", background: C.bg })}
            />
            <span style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", color: C.txd }}><I.Search s={14} /></span>
          </div>
          <span style={{ fontSize: 13, color: C.txm, whiteSpace: "nowrap" }}>
            {selected.length}<span style={{ color: C.txd }}>/{fields.length}</span>
          </span>
        </div>
        <div style={{ display: "flex", gap: 3, alignItems: "center", flexWrap: "wrap" }}>
          <select
            value={typeFilter}
            onChange={e => setTypeFilter(e.target.value)}
            style={inp({ width: "auto", fontSize: 12, padding: "2px 6px", background: C.sfh, border: "none" })}
          >
            <option value="all">All types</option>
            {types.map(t => (
              <option key={t} value={t}>{t} ({fields.filter(f => f.t === t).length})</option>
            ))}
          </select>

          <label style={{ fontSize: 12, color: customOnly ? C.or : C.txd, cursor: "pointer", display: "flex", alignItems: "center", gap: 2 }}>
            <input type="checkbox" checked={customOnly} onChange={e => setCustomOnly(e.target.checked)} style={{ accentColor: C.or, width: 12, height: 12 }} />
            Custom
          </label>

          <div style={{ flex: 1 }} />

          <button onClick={selectFiltered} style={{ padding: "2px 6px", background: "transparent", border: `1px solid ${C.bd}`, borderRadius: 3, color: C.gn, cursor: "pointer", fontSize: 12 }}>
            + Select {filtered.length > 20 ? "visible" : "all"} ({filtered.length})
          </button>
          <button onClick={unselectFiltered} style={{ padding: "2px 6px", background: "transparent", border: `1px solid ${C.bd}`, borderRadius: 3, color: C.rd, cursor: "pointer", fontSize: 12 }}>
            − Deselect visible
          </button>
        </div>
      </div>

      <div style={{ flex: 1, overflow: "auto", padding: "4px 6px" }}>
        {filteredSelected.length > 0 && (
          <div style={{ marginBottom: 4 }}>
            <div style={{ fontSize: 12, color: C.gn, fontWeight: 600, padding: "4px 4px 2px", textTransform: "uppercase", letterSpacing: ".5px" }}>
              Selected ({filteredSelected.length})
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
              {filteredSelected.map(f => {
                const tc = typeColor(f.t);
                return (
                  <button
                    key={f.l}
                    onClick={() => onToggle(f.l)}
                    style={{
                      display: "flex", alignItems: "center", gap: 4,
                      padding: "4px 10px", background: C.vid, border: `1px solid ${C.vi}`,
                      borderRadius: 4, cursor: "pointer", color: C.lv, fontSize: 13,
                      transition: "all .1s",
                    }}
                    title={`${f.d} (${displayType(f.t)})${f.cust ? " — Custom" : ""}\nClick to remove`}
                  >
                    {f.cust && <span style={{ width: 6, height: 6, borderRadius: "50%", background: C.or, flexShrink: 0 }} />}
                    <span style={{ ...mono, fontSize: 13 }}>{f.l}</span>
                    <span style={{ ...tc, fontSize: 13, padding: "0 3px", borderRadius: 2, background: tc.bg, color: tc.fg }}>{displayType(f.t)}</span>
                    <span style={{ color: C.txd, fontSize: 13, lineHeight: 1 }}>✕</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {filteredUnselected.length > 0 && (
          <div>
            <div style={{ fontSize: 12, color: C.txd, fontWeight: 600, padding: "4px 4px 2px", textTransform: "uppercase", letterSpacing: ".5px" }}>
              Available ({filteredUnselected.length})
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
              {filteredUnselected.map(f => {
                const tc = typeColor(f.t);
                return (
                  <button
                    key={f.l}
                    onClick={() => onToggle(f.l)}
                    style={{
                      display: "flex", alignItems: "center", gap: 4,
                      padding: "4px 10px", background: C.sfh, border: `1px solid ${C.bd}`,
                      borderRadius: 4, cursor: "pointer", color: C.txm, fontSize: 13,
                      transition: "all .1s",
                    }}
                    title={`${f.d} (${displayType(f.t)})${f.cust ? " — Custom" : ""}\nClick to add`}
                  >
                    {f.cust && <span style={{ width: 6, height: 6, borderRadius: "50%", background: C.or, flexShrink: 0 }} />}
                    <span style={{ ...mono, fontSize: 13 }}>{f.l}</span>
                    <span style={{ fontSize: 13, padding: "0 3px", borderRadius: 2, background: tc.bg, color: tc.fg }}>{displayType(f.t)}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {filtered.length === 0 && (
          <div style={{ textAlign: "center", padding: 16, color: C.txd, fontSize: 13 }}>
            No columns match "{search}"
          </div>
        )}
      </div>
    </div>
  );
}
