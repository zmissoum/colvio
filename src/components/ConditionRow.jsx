import { C, inp } from "../shared.jsx";

// One condition row — field, operator (per field type), value — shared by the Builder's WHERE,
// ExpandCard's FILTER and RelFilterCard. The operator lists, labels and placeholders were
// triplicated and free to drift (review finding); the rendered markup is the one they all had.
const sT=new Set(["String","Memo"]);const nT=new Set(["Integer","Money","Decimal","Double","BigInt"]);
const dT=new Set(["DateTime"]);const pT=new Set(["Picklist","State","Status"]);
const OP_LABELS={"eq":"=","ne":"≠","gt":">","lt":"<","ge":"≥","le":"≤","contains":"contains","not_contains":"not contains","startswith":"starts with","not_startswith":"not starts with","endswith":"ends with","not_endswith":"not ends with","is_null":"is null","is_not_null":"is not null"};

export const opsFor=(fType)=>sT.has(fType)?["eq","ne","contains","not_contains","startswith","not_startswith","endswith","not_endswith","is_null","is_not_null"]
  :nT.has(fType)||dT.has(fType)?["eq","ne","gt","lt","ge","le","is_null","is_not_null"]
  :["eq","ne","is_null","is_not_null"];
export const placeholderFor=(fType)=>sT.has(fType)?"text":nT.has(fType)?"number":dT.has(fType)?"2025-01-15":fType==="Boolean"?"true / false":pT.has(fType)?"int":"value";
export const needsValue=(op)=>op!=="is_null"&&op!=="is_not_null";

// fields: [{ l, t }] of the table the condition is on. logicLabel: "AND"/"OR" shown before the
// row (null = none). onRemove null = no ✕ (the Builder keeps its last condition).
export default function ConditionRow({fil,fields,logicLabel,onChange,onRemove,bp}){
  const fType=fil.field?(fields.find(f=>f.l===fil.field)?.t||"String"):"";
  const ops=opsFor(fType);
  return (<div style={{display:"flex",alignItems:"center",gap:3,marginBottom:2}}>
    {logicLabel&&<span style={{fontSize:10,color:C.yw,minWidth:24,textAlign:"center"}}>{logicLabel}</span>}
    <select value={fil.field} onChange={e=>onChange("field",e.target.value)} style={inp({width:"auto",fontSize:12,padding:"3px 6px"})}><option value="">(none)</option>{fields.map(f=><option key={f.l} value={f.l}>{f.l}</option>)}</select>
    {fil.field&&<select value={ops.includes(fil.op)?fil.op:"eq"} onChange={e=>onChange("op",e.target.value)} style={inp({width:"auto",fontSize:11,padding:"3px 5px",color:C.cy})}>{ops.map(o=><option key={o} value={o}>{OP_LABELS[o]||o}</option>)}</select>}
    {fil.field&&needsValue(fil.op)&&<input value={fil.value} onChange={e=>onChange("value",e.target.value)} placeholder={placeholderFor(fType)} style={inp({width:bp.mobile?"100%":120,fontSize:12,padding:"3px 6px"})}/>}
    {onRemove&&<button onClick={onRemove} style={{background:"none",border:"none",color:C.txd,cursor:"pointer",padding:1,fontSize:11}}>✕</button>}
  </div>);
}
