import { useEffect } from "react";
import { C, mono } from "../shared.jsx";
import { t } from "../i18n.js";

const KEY=({children})=>(<span style={{display:"inline-block",padding:"2px 8px",background:C.bg,border:`1px solid ${C.bd}`,borderRadius:4,...mono,fontSize:12,fontWeight:600,color:C.tx}}>{children}</span>);

export default function ShortcutsPanel({onClose}){
  useEffect(()=>{const h=e=>{if(e.key==="Escape")onClose();};window.addEventListener("keydown",h);return()=>window.removeEventListener("keydown",h);},[onClose]);

  const shortcuts=[
    {keys:"Ctrl + Enter",desc:t("shortcuts.execute")},
    {keys:"Escape",desc:t("shortcuts.close_modal")},
    {keys:"Ctrl + /",desc:t("shortcuts.open_shortcuts")},
  ];

  return(
    <div style={{position:"fixed",inset:0,zIndex:150,display:"flex",alignItems:"center",justifyContent:"center"}} onClick={onClose}>
      <div style={{position:"absolute",inset:0,background:"rgba(0,0,0,0.6)",backdropFilter:"blur(3px)"}}/>
      <div style={{position:"relative",width:"90%",maxWidth:420,background:C.sf,border:`1px solid ${C.bd}`,borderRadius:12,boxShadow:"0 20px 60px rgba(0,0,0,.5)",padding:"20px 24px"}} onClick={e=>e.stopPropagation()}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
          <span style={{fontWeight:700,fontSize:16}}>{t("shortcuts.title")}</span>
          <button onClick={onClose} style={{background:"none",border:"none",color:C.txd,cursor:"pointer",fontSize:16}}>✕</button>
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          {shortcuts.map((s,i)=>(
            <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 0",borderBottom:i<shortcuts.length-1?`1px solid ${C.bd}`:""}}>
              <span style={{color:C.txm,fontSize:14}}>{s.desc}</span>
              <div style={{display:"flex",gap:4}}>{s.keys.split(" + ").map((k,j)=><KEY key={j}>{k}</KEY>)}</div>
            </div>
          ))}
        </div>
        <div style={{marginTop:14,fontSize:12,color:C.txd,textAlign:"center"}}>{t("shortcuts.description")}</div>
      </div>
    </div>
  );
}
