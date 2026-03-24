import { useState } from "react";
import { C, mono } from "../shared.jsx";
import FieldPicker from "./FieldPicker.jsx";

export default function ExpandCard({ex, onToggle, onRemove, bp}){
  const[open,setOpen]=useState(true);
  return (
    <div style={{background:C.bg,border:`1px solid ${C.or}44`,borderRadius:6,marginBottom:4,overflow:"hidden"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"6px 8px",background:C.or+"11",cursor:"pointer"}} onClick={()=>setOpen(!open)}>
        <div style={{display:"flex",alignItems:"center",gap:5}}>
          <span style={{fontSize:12,color:C.or,fontWeight:600,...mono}}>{ex.lookupField}</span>
          <span style={{color:C.txd,fontSize:11}}>→</span>
          <span style={{fontSize:12,color:C.cy,fontWeight:600}}>{ex.targetEntity}</span>
          <span style={{fontSize:11,color:C.txd}}>({ex.fields.length}/{ex.allFields.length} columns)</span>
          <span style={{fontSize:11,color:C.txd}}>{open?"▲":"▼"}</span>
        </div>
        <button onClick={(e)=>{e.stopPropagation();onRemove(ex.navProperty);}} style={{background:"none",border:"none",color:C.txd,cursor:"pointer",padding:2,fontSize:12}}>✕</button>
      </div>
      {open && (
        <FieldPicker
          fields={ex.allFields}
          selected={ex.fields}
          onToggle={(f) => onToggle(ex.navProperty, f)}
          onSelectAll={() => {}}
          onSelectNone={() => {}}
          bp={bp}
          onClose={()=>setOpen(false)}
        />
      )}
    </div>
  );
}
