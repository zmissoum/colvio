import { useState, useEffect, useRef } from "react";
import { bridge } from "../d365-bridge.js";
import { C, Spin, inp, bt, crd, confirmProd } from "../shared.jsx";

// Business Process Flow manager — System-Administrator only (gated by the caller). Lists every BPF
// instance running on the current record and lets an admin do what the form UI won't: move a
// finished/locked BPF to any stage, or reopen / finish / abort it. A BPF instance is a row in its own
// entity (statecode/statuscode live there, NOT on the record), patched directly via the Web API.
// NOTE: switching a record to a DIFFERENT process is intentionally absent — the SetProcess message is
// no longer supported through the Web API.
export default function BpfManager({ entity, recordId, orgInfo }) {
  const [instances, setInstances] = useState(null); // null = loading, [] = none, [...] = loaded
  const [err, setErr] = useState("");
  const [stages, setStages] = useState({});         // { processId: [stage,...] }
  const [pick, setPick] = useState({});             // { instanceId: stageId chosen in the dropdown }
  const [busy, setBusy] = useState("");             // instanceId currently being mutated
  const [msg, setMsg] = useState("");
  const gen = useRef(0);                            // guards a slow load from a previous record

  const load = () => {
    const g = ++gen.current;
    setInstances(null); setErr(""); setMsg(""); setPick({});
    bridge.getProcessInstances(entity, recordId).then(list => {
      if (gen.current !== g) return;
      setInstances(list || []);
      [...new Set((list || []).map(i => i.processId).filter(Boolean))].forEach(pid => {
        if (stages[pid]) return;
        bridge.getProcessStages(pid).then(st => { if (gen.current === g) setStages(prev => ({ ...prev, [pid]: st || [] })); }).catch(() => {});
      });
    }).catch(e => { if (gen.current === g) { setErr(e.message || String(e)); setInstances([]); } });
  };

  useEffect(() => { if (entity && recordId) load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [entity, recordId]);

  const statusOf = (inst) => inst.stateCode === 0 ? "active" : (inst.statusCode === 3 ? "aborted" : "finished");
  const colorOf = (st) => st === "active" ? C.gn : st === "aborted" ? C.rd : C.cy;

  const patch = async (inst, body, label) => {
    if (!inst.bpfEntitySet || !inst.id) { setMsg(`✗ Can't resolve the BPF instance to update.`); return; }
    if (!confirmProd(orgInfo?.isProduction, `${label} — "${inst.processName || inst.name || "BPF"}" on this ${entity}.`)) return;
    setBusy(inst.id); setMsg("");
    try {
      await bridge.update(inst.bpfEntitySet, inst.id, body);
      setMsg(`✓ ${label} done.`);
      load();
    } catch (e) {
      setMsg(`✗ ${label} failed (${inst.bpfEntitySet || "?"}): ${e.message || e}`);
    } finally { setBusy(""); }
  };

  const reopen = (inst) => patch(inst, { statecode: 0, statuscode: 1 }, "Reopen");
  const finish = (inst) => patch(inst, { statecode: 1, statuscode: 2 }, "Finish");
  const abort  = (inst) => patch(inst, { statecode: 1, statuscode: 3 }, "Abort");
  const applyStage = (inst) => {
    const stageId = pick[inst.id];
    if (!stageId || stageId === inst.activeStageId) return;
    // Per Microsoft docs, activestageid and traversedpath must move together — and the path must END
    // at the active stage. Forward: append the target. Backward: truncate everything after it
    // (keeping later stages would show an inconsistent progress bar on the form).
    const parts = (inst.traversedPath || "").split(",").map(s => s.trim()).filter(Boolean);
    const idx = parts.indexOf(stageId);
    const path = idx >= 0 ? parts.slice(0, idx + 1) : [...parts, stageId];
    patch(inst, { "activestageid@odata.bind": `/processstages(${stageId})`, traversedpath: path.join(",") }, "Move stage");
  };

  if (instances === null) return (<div style={{ ...crd({ padding: 12 }), marginBottom: 12, fontSize: 13, color: C.txm, display: "flex", alignItems: "center", gap: 8 }}><Spin s={14} /> Loading process flows…</div>);
  if (err) return (<div style={{ ...crd({ padding: 12, borderColor: C.rd + "55" }), marginBottom: 12, fontSize: 13, color: C.rd }}>BPF: {err} <button onClick={load} style={bt(null, { fontSize: 12, marginLeft: 8 })}>↻ Retry</button></div>);
  if (!instances.length) return (<div style={{ ...crd({ padding: "10px 12px" }), marginBottom: 12, fontSize: 12.5, color: C.txd }}>⚙ No business process flow instance on this record.</div>);

  return (
    <div style={{ ...crd({ padding: 12 }), marginBottom: 12 }}>
      <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4, display: "flex", alignItems: "center", gap: 6 }}>
        ⚙ Business Process Flows
        <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 4, background: C.vi + "22", color: C.vi, fontWeight: 700 }}>ADMIN</span>
      </div>
      <div style={{ fontSize: 11, color: C.yw, marginBottom: 10, lineHeight: 1.5 }}>⚠ Direct API edit — bypasses the form's stage rules and required-field gating. Use deliberately.</div>
      {msg && <div style={{ fontSize: 12, marginBottom: 8, color: msg.startsWith("✓") ? C.gn : C.rd }}>{msg}</div>}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {instances.map(inst => {
          const st = statusOf(inst);
          const color = colorOf(st);
          const procStages = stages[inst.processId] || [];
          const isBusy = busy === inst.id;
          const active = inst.stateCode === 0;
          const chosen = pick[inst.id] ?? inst.activeStageId ?? "";
          return (
            <div key={inst.id || inst.processId} style={{ ...crd({ padding: 10, background: C.bg }), display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span style={{ fontWeight: 600, fontSize: 13 }}>{inst.processName || inst.name || "(process)"}</span>
                <span style={{ fontSize: 10, padding: "1px 7px", borderRadius: 4, background: color + "22", color, fontWeight: 700 }}>{inst.statusLabel || st}</span>
                {inst.activeStageName && <span style={{ fontSize: 12, color: C.txm }}>stage: <b style={{ color: C.tx }}>{inst.activeStageName}</b></span>}
                {isBusy && <Spin s={12} />}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                <select value={chosen} onChange={e => setPick(p => ({ ...p, [inst.id]: e.target.value }))} disabled={!active || isBusy || !procStages.length}
                  title={active ? "Pick the stage to move this record to" : "Reopen the flow first to change its stage"}
                  style={inp({ width: "auto", minWidth: 160, fontSize: 12, padding: "5px 8px", opacity: active ? 1 : 0.5 })}>
                  {!procStages.length && <option value="">{inst.activeStageName || "stages…"}</option>}
                  {procStages.map(s => <option key={s.id} value={s.id}>{s.name}{s.category && s.category !== s.name ? ` (${s.category})` : ""}</option>)}
                </select>
                <button onClick={() => applyStage(inst)} disabled={!active || isBusy || !chosen || chosen === inst.activeStageId}
                  style={bt(C.vi, { fontSize: 12, opacity: (!active || !chosen || chosen === inst.activeStageId) ? 0.5 : 1 })}>Move to stage</button>
                {!active && <button onClick={() => reopen(inst)} disabled={isBusy} style={bt(C.gn, { fontSize: 12 })}>↺ Reopen</button>}
                {active && <button onClick={() => finish(inst)} disabled={isBusy} style={bt(null, { fontSize: 12 })}>✓ Finish</button>}
                {active && <button onClick={() => abort(inst)} disabled={isBusy} style={bt(null, { fontSize: 12, color: C.rd, borderColor: C.rd + "55" })}>⊘ Abort</button>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
