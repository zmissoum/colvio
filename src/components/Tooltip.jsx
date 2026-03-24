import { useState, useEffect, useRef } from "react";
import { C } from "../shared.jsx";

export default function Tooltip({text}){
  const[open,setOpen]=useState(false);
  const[pos,setPos]=useState({top:0,left:0});
  const btnRef=useRef(null);
  const tipRef=useRef(null);

  useEffect(()=>{
    if(!open)return;
    const h=e=>{if(e.key==="Escape")setOpen(false);};
    const click=e=>{if(tipRef.current&&!tipRef.current.contains(e.target)&&btnRef.current&&!btnRef.current.contains(e.target))setOpen(false);};
    window.addEventListener("keydown",h);
    document.addEventListener("mousedown",click);
    return()=>{window.removeEventListener("keydown",h);document.removeEventListener("mousedown",click);};
  },[open]);

  const toggle=()=>{
    if(!open&&btnRef.current){
      const r=btnRef.current.getBoundingClientRect();
      setPos({top:r.bottom+6,left:Math.max(8,Math.min(r.left,window.innerWidth-290))});
    }
    setOpen(!open);
  };

  return(
    <span style={{position:"relative",display:"inline-flex"}}>
      <button ref={btnRef} onClick={toggle} style={{width:18,height:18,borderRadius:"50%",background:open?C.vi:C.bg,border:`1px solid ${open?C.vi:C.bd}`,color:open?"white":C.txd,cursor:"pointer",fontSize:10,fontWeight:700,display:"inline-flex",alignItems:"center",justifyContent:"center",padding:0,lineHeight:1}}>?</button>
      {open&&<div ref={tipRef} style={{position:"fixed",top:pos.top,left:pos.left,zIndex:60,background:C.sf,border:`1px solid ${C.bd}`,borderRadius:8,padding:"10px 14px",fontSize:13,color:C.txm,boxShadow:"0 8px 24px rgba(0,0,0,.4)",maxWidth:280,lineHeight:1.5,animation:"fadeIn .15s"}}>{text}</div>}
    </span>
  );
}
