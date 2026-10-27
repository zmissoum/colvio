import { useState } from "react";
import { C, mono, inp } from "../shared.jsx";
import FieldPicker from "./FieldPicker.jsx";
import ConditionRow from "./ConditionRow.jsx";

export default function ExpandCard({ex, onToggle, onRemove, onSetConditions, onSetLogic, bp}){
  const[open,setOpen]=useState(true);
  const isCollection = ex.type === "collection";
  const conditions = ex.conditions || [];
  const logic = ex.conditionLogic || "and";

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
            key={ex.navProperty}
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
              {conditions.map((fil,ci)=><ConditionRow key={ci} fil={fil} fields={ex.allFields} bp={bp} logicLabel={ci>0?logic.toUpperCase():null} onChange={(k,v)=>updateCond(ci,k,v)} onRemove={()=>rmCond(ci)}/>)}
              <button onClick={addCond} style={{padding:"2px 8px",background:"transparent",border:`1px dashed ${C.bd}`,borderRadius:3,color:C.txd,cursor:"pointer",fontSize:11,marginTop:2}}>+ condition</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
