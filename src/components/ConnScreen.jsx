import { useState } from "react";
import { C, I, Spin, inp, bt, crd } from "../shared.jsx";

export default function ConnScreen({onConnect,connecting,bp}){
  const[cfg,setCfg]=useState({url:"",tenant:"",client:"",secret:""});
  return(
    <div style={{minHeight:"100vh",background:C.bg,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'DM Sans','Segoe UI',system-ui,sans-serif",padding:bp.mobile?16:40}}>
      <div style={{width:"100%",maxWidth:440}}>
        <div style={{textAlign:"center",marginBottom:28}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:10,marginBottom:6}}>
            <div style={{width:30,height:30,borderRadius:8,background:`linear-gradient(135deg,${C.vi},${C.cy})`,display:"flex",alignItems:"center",justifyContent:"center"}}><I.Database/></div>
            <span style={{fontSize:bp.mobile?20:22,fontWeight:700,color:C.tx}}>Colvio</span>
          </div>
          <p style={{color:C.txm,fontSize:15,margin:0}}>for Dataverse</p>
        </div>
        <div style={{...crd({padding:bp.mobile?16:22})}}>
          {[{k:"url",l:"URL Dataverse",ph:"https://org.crm4.dynamics.com",ic:"🌐"},{k:"tenant",l:"Tenant ID",ph:"xxxxxxxx-xxxx-...",ic:"🏛️"},{k:"client",l:"Client ID",ph:"xxxxxxxx-xxxx-...",ic:"🔑"},{k:"secret",l:"Client Secret",ph:"•••••",ic:"🔒",tp:"password"}].map((f,i)=>(
            <div key={f.k} style={{marginBottom:i<3?12:18}}><label style={{display:"block",fontSize:13,color:C.txm,marginBottom:4,fontWeight:500}}>{f.ic} {f.l}</label><input type={f.tp||"text"} placeholder={f.ph} value={cfg[f.k]} onChange={e=>setCfg({...cfg,[f.k]:e.target.value})} style={inp()} onFocus={e=>e.target.style.borderColor=C.vi} onBlur={e=>e.target.style.borderColor=C.bd}/></div>
          ))}
          <button onClick={onConnect} disabled={connecting} style={bt(connecting?C.vid:`linear-gradient(135deg,${C.vi},${C.vil})`,{width:"100%",justifyContent:"center",padding:"10px 0",fontSize:15})}>{connecting?<><Spin/> Connecting...</>:<><I.Zap/> Connect</>}</button>
          <p style={{textAlign:"center",fontSize:12,color:C.txd,marginTop:10}}>Chrome extension: connect to D365, click the ⚡ icon</p>
        </div>
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
