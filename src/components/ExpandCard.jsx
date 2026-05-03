import { useState } from "react";
import { C, mono, inp } from "../shared.jsx";
import FieldPicker from "./FieldPicker.jsx";

export default function ExpandCard({ex, onToggle, onRemove, onSetConditions, onSetLogic, bp}){
  const[open,setOpen]=useState(true);
  const isCollection = ex.type === "collection";
  const conditions = ex.conditions || [];
  const logic = ex.conditionLogic || "and";

  const getType = (logicalName) => ex.allFields.find(f => f.l === logicalName)?.t || "String";

  const updateCond = (ci, k, v) => {
    const cs = [...conditions];
    cs[ci] = {...cs[ci], [k]: v};
    if (k === "field") { cs[ci].op = "eq"; cs[ci].value = ""; }
    onSetConditions(ex.navProperty, cs);
  };
  const addCond = () => onSetConditions(ex.navProperty, [...conditions, {field:"", op:"eq", value:""}]);
  const rmCond = (ci) => onSetConditions(ex.navProperty, conditions.filter((_,i)=>i!==ci));

  return (
    <div style={{background:C.bg,border:`1px solid ${C.or}44`,borderRadius:6,marginBottom:4,overflow:"hidden"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"6px 8px",background:C.or+"11",cursor:"pointer"}} onClick={()=>setOpen(!open)}>
        <div style={{display:"flex",alignItems:"center",gap:5}}>
          <span style={{fontSize:12,color:C.or,fontWeight:600,...mono}}>{ex.lookupField}</span>
          <span style={{color:C.txd,fontSize:11}}>→</span>
          <span style={{fontSize:12,color:C.cy,fontWeight:600}}>{ex.targetEntity}</span>
          <span style={{fontSize:11,color:C.txd}}>({ex.fields.length}/{ex.allFields.length} columns{isCollection&&conditions.length?`, ${conditions.length} filter${conditions.length>1?"s":""}`:""})</span>
          <span style={{fontSize:11,color:C.txd}}>{open?"▲":"▼"}</span>
        </div>
        <button onClick={(e)=>{e.stopPropagation();onRemove(ex.navProperty);}} style={{background:"none",border:"none",color:C.txd,cursor:"pointer",padding:2,fontSize:12}}>✕</button>
      </div>
      {open && (
        <>
          <FieldPicker
            fields={ex.allFields}
            selected={ex.fields}
            onToggle={(f) => onToggle(ex.navProperty, f)}
            onSelectAll={() => {}}
            onSelectNone={() => {}}
            bp={bp}
            onClose={()=>setOpen(false)}
          />
          {isCollection && (
            <div style={{padding:"6px 8px",borderTop:`1px solid ${C.bd}`,background:C.bg}}>
              <div style={{display:"flex",alignItems:"center",gap:5,marginBottom:4}}>
                <span style={{fontSize:11,color:C.or,fontWeight:600,...mono}}>FILTER</span>
                {conditions.length>1&&<select value={logic} onChange={e=>onSetLogic(ex.navProperty,e.target.value)} style={inp({width:"auto",fontSize:10,padding:"2px 5px",color:C.yw})}><option value="and">AND</option><option value="or">OR</option></select>}
                {conditions.length===0&&<span style={{fontSize:10,color:C.txd}}>(no filter — all related records returned)</span>}
              </div>
              {conditions.map((fil,ci)=>{
                const fType=fil.field?getType(fil.field):"";
                const sT=new Set(["String","Memo"]);const nT=new Set(["Integer","Money","Decimal","Double","BigInt"]);
                const dT=new Set(["DateTime"]);const pT=new Set(["Picklist","State","Status"]);
                let ops=["eq","ne","is_null","is_not_null"];
                if(sT.has(fType)) ops=["eq","ne","contains","not_contains","startswith","not_startswith","endswith","not_endswith","is_null","is_not_null"];
                else if(nT.has(fType)||dT.has(fType)) ops=["eq","ne","gt","lt","ge","le","is_null","is_not_null"];
                const needsValue=fil.op!=="is_null"&&fil.op!=="is_not_null";
                const opLabels={"eq":"=","ne":"≠","gt":">","lt":"<","ge":"≥","le":"≤","contains":"contains","not_contains":"not contains","startswith":"starts with","not_startswith":"not starts with","endswith":"ends with","not_endswith":"not ends with","is_null":"is null","is_not_null":"is not null"};
                const placeholder=sT.has(fType)?"text":nT.has(fType)?"number":dT.has(fType)?"2025-01-15":fType==="Boolean"?"true / false":pT.has(fType)?"int":"value";
                return (<div key={ci} style={{display:"flex",alignItems:"center",gap:3,marginBottom:2}}>
                  {ci>0&&<span style={{fontSize:10,color:C.yw,minWidth:24,textAlign:"center"}}>{logic.toUpperCase()}</span>}
                  <select value={fil.field} onChange={e=>updateCond(ci,"field",e.target.value)} style={inp({width:"auto",fontSize:12,padding:"3px 6px"})}><option value="">(none)</option>{ex.allFields.map(f=><option key={f.l} value={f.l}>{f.l}</option>)}</select>
                  {fil.field&&<select value={ops.includes(fil.op)?fil.op:"eq"} onChange={e=>updateCond(ci,"op",e.target.value)} style={inp({width:"auto",fontSize:11,padding:"3px 5px",color:C.cy})}>{ops.map(o=><option key={o} value={o}>{opLabels[o]||o}</option>)}</select>}
                  {fil.field&&needsValue&&<input value={fil.value} onChange={e=>updateCond(ci,"value",e.target.value)} placeholder={placeholder} style={inp({width:bp.mobile?"100%":120,fontSize:12,padding:"3px 6px"})}/>}
                  <button onClick={()=>rmCond(ci)} style={{background:"none",border:"none",color:C.txd,cursor:"pointer",padding:1,fontSize:11}}>✕</button>
                </div>);
              })}
              <button onClick={addCond} style={{padding:"2px 8px",background:"transparent",border:`1px dashed ${C.bd}`,borderRadius:3,color:C.txd,cursor:"pointer",fontSize:11,marginTop:2}}>+ condition</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
