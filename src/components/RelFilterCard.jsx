import { C, mono, inp } from "../shared.jsx";
import ConditionRow from "./ConditionRow.jsx";

// One relational filter on the Builder's root rows — the Advanced-Find-style "condition on a
// related entity". Parent (N:1): conditions on the parent's fields filter which root rows return
// (nav/field op value). Child (1:N): existence filter — "has at least one / has none" matching
// children (nav/any(o: ...) / not nav/any(...)). Mirrors ExpandCard's condition rows so the two
// UIs feel identical; unlike ExpandCard this changes WHICH rows come back, not what's displayed.
export default function RelFilterCard({ rf, onUpdate, onRemove, bp }) {
  const isCollection = rf.type === "collection";
  const conditions = rf.conditions || [];
  const logic = rf.conditionLogic || "and";

  const setConds = (cs) => onUpdate(rf.navProperty, { conditions: cs });
  const updateCond = (ci, k, v) => {
    const cs = [...conditions];
    cs[ci] = { ...cs[ci], [k]: v };
    if (k === "field") { cs[ci].op = "eq"; cs[ci].value = ""; }
    setConds(cs);
  };
  const addCond = () => setConds([...conditions, { field: "", op: "eq", value: "" }]);
  const rmCond = (ci) => setConds(conditions.filter((_, i) => i !== ci));

  const hasActive = conditions.some(c => c.field && (c.value || c.op === "is_null" || c.op === "is_not_null"));

  return (
    <div style={{ background: C.bg, border: `1px solid ${C.gn}44`, borderRadius: 6, marginBottom: 4, overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 8px", background: C.gn + "11", flexWrap: "wrap", gap: 4 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap" }}>
          <span style={{ fontSize: 11, color: C.txd }}>{isCollection ? "↓ child" : "↑ parent"}</span>
          <span style={{ fontSize: 12, color: C.or, fontWeight: 600, ...mono }}>{rf.lookupField}</span>
          <span style={{ color: C.txd, fontSize: 11 }}>{isCollection ? "←" : "→"}</span>
          <span style={{ fontSize: 12, color: C.cy, fontWeight: 600 }}>{rf.targetEntity}</span>
          {isCollection && (
            <select value={rf.mode || "any"} onChange={e => onUpdate(rf.navProperty, { mode: e.target.value })} style={inp({ width: "auto", fontSize: 11, padding: "2px 6px", color: C.gn })}>
              <option value="any">has at least one{hasActive ? " matching" : ""}</option>
              <option value="none">has none{hasActive ? " matching" : ""}</option>
            </select>
          )}
        </div>
        <button onClick={() => onRemove(rf.navProperty)} style={{ background: "none", border: "none", color: C.txd, cursor: "pointer", padding: 2, fontSize: 12 }}>✕</button>
      </div>
      <div style={{ padding: "6px 8px" }}>
        {!isCollection && !hasActive && <div style={{ fontSize: 10.5, color: C.txd, marginBottom: 4 }}>Add a condition on the parent — without one, this filter does nothing.</div>}
        {isCollection && !hasActive && <div style={{ fontSize: 10.5, color: C.txd, marginBottom: 4 }}>No condition = pure existence test ({rf.mode === "none" ? "rows with NO" : "rows with at least one"} {rf.targetEntity}).</div>}
        {conditions.map((fil, ci) => <ConditionRow key={ci} fil={fil} fields={rf.allFields} bp={bp} logicLabel={ci > 0 ? logic.toUpperCase() : null} onChange={(k, v) => updateCond(ci, k, v)} onRemove={() => rmCond(ci)} />)}
        <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 2 }}>
          <button onClick={addCond} style={{ padding: "2px 8px", background: "transparent", border: `1px dashed ${C.bd}`, borderRadius: 3, color: C.txd, cursor: "pointer", fontSize: 11 }}>+ condition</button>
          {conditions.length > 1 && <select value={logic} onChange={e => onUpdate(rf.navProperty, { conditionLogic: e.target.value })} style={inp({ width: "auto", fontSize: 10, padding: "2px 5px", color: C.yw })}><option value="and">AND</option><option value="or">OR</option></select>}
        </div>
      </div>
    </div>
  );
}
