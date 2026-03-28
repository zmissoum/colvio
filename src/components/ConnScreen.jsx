import { C, I, Spin, crd, bt } from "../shared.jsx";

export default function ConnScreen({onConnect,connecting,bp}){
  return(
    <div style={{minHeight:"100vh",background:C.bg,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'DM Sans','Segoe UI',system-ui,sans-serif",padding:bp.mobile?16:40}}>
      <div style={{width:"100%",maxWidth:440,textAlign:"center"}}>
        <div style={{marginBottom:28}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:10,marginBottom:6}}>
            <div style={{width:30,height:30,borderRadius:8,background:`linear-gradient(135deg,${C.vi},${C.cy})`,display:"flex",alignItems:"center",justifyContent:"center"}}><I.Database/></div>
            <span style={{fontSize:bp.mobile?20:22,fontWeight:700,color:C.tx}}>Colvio</span>
          </div>
          <p style={{color:C.txm,fontSize:15,margin:0}}>Data Explorer for Dynamics 365</p>
        </div>
        <div style={{...crd({padding:bp.mobile?16:22})}}>
          {connecting?(
            <div style={{padding:20}}>
              <Spin s={24}/>
              <p style={{color:C.txm,fontSize:14,marginTop:12}}>Connecting to Dataverse...</p>
            </div>
          ):(
            <div>
              <p style={{color:C.txm,fontSize:14,marginBottom:16,lineHeight:1.6}}>Open any Dynamics 365 page in this browser, then click the Colvio icon in the toolbar to connect.</p>
              <button onClick={onConnect} style={bt(`linear-gradient(135deg,${C.vi},${C.vil})`,{width:"100%",justifyContent:"center",padding:"10px 0",fontSize:15})}><I.Zap/> Demo Mode</button>
              <p style={{fontSize:12,color:C.txd,marginTop:10}}>Demo mode uses mock data for testing</p>
            </div>
          )}
        </div>
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
