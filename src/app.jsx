import { useState, useEffect } from "react";
import { bridge, onSessionExpired, clearSessionExpired } from "./d365-bridge.js";
import { C, setThemeColors, I, DARK, LIGHT, useBP, useKeyboard, Spin, detectExtension, mono } from "./shared.jsx";
import { t, setLocale, getLocale } from "./i18n.js";

// ── Components ──
import ConnScreen from "./components/ConnScreen.jsx";
import ShowAllData from "./components/ShowAllData.jsx";
import MetadataBrowser from "./components/MetadataBrowser.jsx";
import Explorer from "./components/Explorer.jsx";
import LoginHistory from "./components/LoginHistory.jsx";
import Loader from "./components/Loader.jsx";
import RelationshipGraph from "./components/RelationshipGraph.jsx";
import SolutionExplorer from "./components/SolutionExplorer.jsx";
import TranslationManager from "./components/TranslationManager.jsx";
import { ErrorBoundary } from "./components/ErrorBoundary.jsx";
import ShortcutsPanel from "./components/ShortcutsPanel.jsx";
import OnboardingTour from "./components/OnboardingTour.jsx";
import HelpTab from "./components/HelpTab.jsx";
import UserLicenseMonitor from "./components/UserLicenseMonitor.jsx";
import SecurityAudit from "./components/SecurityAudit.jsx";
import SchemaViewer from "./components/SchemaViewer.jsx";

export default function App(){
  const[tab,setTab]=useState("explorer");
  const[connected,setConnected]=useState(false);
  const[connecting,setConnecting]=useState(false);
  const[sideOpen,setSideOpen]=useState(false);
  const[theme,setTheme]=useState(()=>{
    let t="dark";
    try{const saved=localStorage.getItem("colvio_theme");if(saved)t=saved;}catch{}
    setThemeColors(t);
    // Set body styles immediately to prevent flash
    document.body.style.background=t==="dark"?DARK.bg:LIGHT.bg;
    document.body.style.color=t==="dark"?DARK.tx:LIGHT.tx;
    return t;
  });
  const toggleTheme=()=>{
    const t=theme==="dark"?"light":"dark";
    setThemeColors(t);
    document.body.style.background=C.bg;
    document.body.style.color=C.tx;
    setTheme(t);
    try{localStorage.setItem("colvio_theme",t);}catch{}
  };
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    if (!mq) return;
    const handler = (e) => {
      if (!localStorage.getItem("colvio_theme")) setTheme(e.matches ? "dark" : "light");
    };
    mq.addEventListener?.('change', handler);
    return () => mq.removeEventListener?.('change', handler);
  }, []);
  const[queryHistory,setQueryHistory]=useState([]);
  const[orgInfo,setOrgInfo]=useState(null);
  const[permissions,setPermissions]=useState(null);
  const[expired,setExpired]=useState(false);
  const[,setLocaleState]=useState(getLocale());// value unused, setter triggers re-render on locale change
  const[showShortcuts,setShowShortcuts]=useState(false);
  const bp=useBP();
  useKeyboard("/",()=>setShowShortcuts(s=>!s),[]);

  useEffect(() => onSessionExpired(() => setExpired(true)), []);

  // ── Auto-connect if running as Chrome extension ──
  useEffect(() => {
    const ext = detectExtension();
    if (ext.isExtension && ext.orgUrl) {
      const orgName = new URL(ext.orgUrl).hostname.split(".")[0];
      const region = new URL(ext.orgUrl).hostname.split(".")[1] || "crm";
      const info = {
        orgUrl: ext.orgUrl,
        orgName,
        region,
        isProduction: !ext.orgUrl.includes("sandbox") && !ext.orgUrl.includes("dev"),
        isExtension: true,
      };
      setOrgInfo(info);
      // Probe permissions BEFORE showing tabs — no flash of restricted content
      bridge.checkPermissions().then(perms => {
        setPermissions(perms);
        setConnected(true);
      }).catch(() => {
        // If probes fail entirely, show all tabs (fail-open, D365 will still enforce server-side)
        setPermissions({ canReadAudit: true, canReadSolutions: true, canReadAllUsers: true });
        setConnected(true);
      });
    }
  }, []);

  const addHistory=(q,mode)=>setQueryHistory(h=>[{query:q,mode:mode||"builder",time:new Date().toLocaleTimeString(),id:Date.now()},...h.slice(0,19)]);

  const handleManualConnect = () => {
    setConnecting(true);
    setTimeout(() => {
      setConnecting(false);
      setOrgInfo({ orgUrl: "https://demo.crm4.dynamics.com", orgName: "demo", region: "crm4", isProduction: false, isExtension: false });
      setPermissions({ canReadAudit: true, canReadSolutions: true, canReadAllUsers: true });
      setConnected(true);
    }, 1500);
  };

  if(!connected) return (<ConnScreen onConnect={handleManualConnect} connecting={connecting} bp={bp}/>);

  const allTabs=[
    {id:"explorer",label:t("nav.explorer"),desc:t("nav.explorer.desc"),icon:<I.Search/>},
    {id:"show",label:t("nav.show"),desc:t("nav.show.desc"),icon:<I.Eye/>},
    {id:"metadata",label:t("nav.metadata"),desc:t("nav.metadata.desc"),icon:<I.Grid/>},
    {id:"logins",label:t("nav.logins"),desc:t("nav.logins.desc"),icon:<I.Clock/>,requires:"canReadAudit"},
    {id:"loader",label:t("nav.loader"),desc:t("nav.loader.desc"),icon:<I.Upload/>},
    {id:"graph",label:t("nav.graph"),desc:t("nav.graph.desc"),icon:<I.Link/>},
    {id:"schema",label:t("nav.schema"),desc:t("nav.schema.desc"),icon:<I.Grid/>},
    {id:"solutions",label:t("nav.solutions"),desc:t("nav.solutions.desc"),icon:<I.Database/>,requires:"canReadSolutions"},
    {id:"translations",label:t("nav.translations"),desc:t("nav.translations.desc"),icon:<I.Clipboard/>,requires:"canReadSolutions"},
    {id:"licenses",label:t("nav.licenses"),desc:t("nav.licenses.desc"),icon:<I.Users/>,requires:"canReadAllUsers"},
    {id:"security",label:t("nav.security"),desc:t("nav.security.desc"),icon:<I.Shield/>,requires:"canReadAllUsers"},
    {id:"help",label:t("nav.help"),desc:t("nav.help.desc"),icon:<I.Help/>},
  ];
  const tabs=allTabs.filter(t=>!t.requires||permissions?.[t.requires]);

  return(
    <div style={{display:"flex",height:"100vh",background:C.bg,color:C.tx,fontFamily:"'DM Sans','Segoe UI',system-ui,sans-serif",fontSize:15}}>
      {expired && (
        <div style={{position:"fixed",top:0,left:0,right:0,zIndex:200,background:C.rd,color:"white",padding:"10px 20px",display:"flex",justifyContent:"space-between",alignItems:"center",fontSize:14}}>
          <span>{t("session.expired")}</span>
          <button onClick={()=>{window.open(orgInfo?.orgUrl||"https://dynamics.com","_blank");clearSessionExpired();setExpired(false);}} style={{background:C.sf,color:C.rd,border:"none",borderRadius:4,padding:"4px 12px",cursor:"pointer",fontWeight:600}}>{t("session.reconnect")}</button>
        </div>
      )}
      {bp.mobile&&sideOpen&&<div onClick={()=>setSideOpen(false)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,.5)",zIndex:99}}/>}
      {/* Sidebar */}
      <div style={{width:bp.mobile?"85vw":200,background:C.sf,borderRight:`1px solid ${C.bd}`,display:"flex",flexDirection:"column",flexShrink:0,...(bp.mobile?{position:"fixed",top:0,left:0,bottom:0,zIndex:100,transform:sideOpen?"translateX(0)":"translateX(-100%)",transition:"transform .25s ease",maxWidth:280}:{})}}>
        <div style={{padding:"14px 12px",borderBottom:`1px solid ${C.bd}`,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <img src="icons/icon128.png" alt="Colvio" style={{width:26,height:26,borderRadius:7}}/>
            <div><div style={{fontWeight:700,fontSize:15}}>Colvio</div><div style={{fontSize:11,color:C.txd}}>for Dataverse</div></div>
          </div>
          {bp.mobile&&<button onClick={()=>setSideOpen(false)} style={{background:"none",border:"none",color:C.txm,cursor:"pointer"}}><I.X/></button>}
        </div>
        <div style={{padding:"8px 6px",flex:1,overflow:"auto"}}>
          {tabs.map(tb=>(
            <button key={tb.id} onClick={()=>{setTab(tb.id);setSideOpen(false);}} style={{width:"100%",display:"flex",alignItems:"center",gap:7,padding:"8px 9px",border:"none",borderRadius:6,cursor:"pointer",marginBottom:2,transition:"all .12s",background:tab===tb.id?C.sfa:"transparent",color:tab===tb.id?C.tx:C.txm}}>
              <span style={{color:tab===tb.id?C.cy:C.txd,flexShrink:0}}>{tb.icon}</span>
              <div style={{textAlign:"left",minWidth:0}}><div style={{fontSize:14,fontWeight:tab===tb.id?600:400}}>{tb.label}</div><div style={{fontSize:11,color:C.txd,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{tb.desc}</div></div>
            </button>
          ))}
          {/* Query history */}
          {queryHistory.length>0&&<div style={{marginTop:12,borderTop:`1px solid ${C.bd}`,paddingTop:8}}>
            <div style={{display:"flex",alignItems:"center",gap:4,padding:"0 8px",marginBottom:4}}><I.Clock/><span style={{fontSize:12,color:C.txd,fontWeight:600}}>{t("sidebar.history")}</span></div>
            {queryHistory.slice(0,5).map(h=>(
              <button key={h.id} onClick={()=>{setTab("explorer");}} style={{width:"100%",textAlign:"left",padding:"4px 8px",border:"none",borderRadius:4,cursor:"pointer",background:"transparent",color:C.txd,fontSize:12,...mono,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",marginBottom:1}} title={h.query}>{h.time} — {h.query.substring(0,30)}...</button>
            ))}
          </div>}
        </div>
        {/* Environment + API status */}
        <div style={{padding:"8px 12px",borderTop:`1px solid ${C.bd}`,fontSize:12}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:4}}>
            <div style={{display:"flex",alignItems:"center",gap:4}}><div style={{width:6,height:6,borderRadius:"50%",background:C.gn}}/>
              <span style={{color:C.txm}}>{orgInfo?.isExtension ? t("sidebar.extension") : t("sidebar.standalone")}</span>
            </div>
            {orgInfo?.isProduction
              ? <span style={{padding:"3px 10px",borderRadius:4,fontSize:13,fontWeight:700,background:C.rd+"22",color:C.rd,border:`1px solid ${C.rd}55`,letterSpacing:1}}>⚠ PROD</span>
              : <span style={{padding:"3px 10px",borderRadius:4,fontSize:13,fontWeight:700,background:C.gn+"22",color:C.gn,border:`1px solid ${C.gn}55`,letterSpacing:1}}>SANDBOX</span>
            }
          </div>
          <div style={{color:C.txd,marginBottom:3,...mono,fontSize:11}}>{orgInfo?.orgName || "demo"}.{orgInfo?.region || "crm4"}.dynamics.com</div>
          <div style={{display:"flex",justifyContent:"space-between",color:C.txd}}>
            <span>{t("footer.api_calls")}</span>
            <span style={{color:C.gn}}>— / 60,000</span>
          </div>
          <button onClick={async()=>{await bridge.clearCache();window.location.reload();}} style={{marginTop:6,width:"100%",padding:"3px 0",background:"transparent",border:`1px dashed ${C.bd}`,borderRadius:3,color:C.txd,cursor:"pointer",fontSize:10}}>🔄 {t("footer.clear_cache")}</button>
        </div>
      </div>
      {/* Main */}
      <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden",minWidth:0}}>
        <div style={{height:42,borderBottom:`1px solid ${C.bd}`,display:"flex",alignItems:"center",padding:"0 12px",gap:8,flexShrink:0}}>
          {bp.mobile&&<button onClick={()=>setSideOpen(true)} style={{background:"none",border:"none",color:C.txm,cursor:"pointer",padding:4}}><I.Menu/></button>}
          {/* Global search */}
          <div style={{flex:1,maxWidth:400,position:"relative"}}>
            <input placeholder={t("sidebar.search_placeholder")} style={{width:"100%",padding:"5px 10px 5px 30px",background:C.sfh,border:"none",borderRadius:6,color:C.tx,fontSize:13,outline:"none",boxSizing:"border-box"}}/>
            <span style={{position:"absolute",left:9,top:"50%",transform:"translateY(-50%)",color:C.txd}}><I.Search s={13}/></span>
          </div>
          <div style={{flex:1}}/>
          <span style={{fontSize:12,color:C.txd,...mono}}>{t("explorer.execute_hint")}</span>
        </div>
        <div style={{flex:1,overflow:"auto"}}>
          {tab==="explorer"&&<ErrorBoundary><Explorer bp={bp} addHistory={addHistory} orgInfo={orgInfo} theme={theme}/></ErrorBoundary>}
          <div style={{position:"fixed",bottom:12,right:12,zIndex:50,display:"flex",gap:6}}>
            <button onClick={()=>setShowShortcuts(true)} style={{padding:"6px 10px",background:C.sf,border:`1px solid ${C.bd}`,borderRadius:8,color:C.txd,cursor:"pointer",fontSize:12,boxShadow:"0 2px 8px rgba(0,0,0,.3)",fontWeight:700}} title="Ctrl+/">?</button>
            <button onClick={()=>{const next=getLocale()==="en"?"fr":"en";setLocale(next);setLocaleState(next);}} style={{padding:"6px 12px",background:C.sf,border:`1px solid ${C.bd}`,borderRadius:8,color:C.txm,cursor:"pointer",fontSize:12,boxShadow:"0 2px 8px rgba(0,0,0,.3)",fontWeight:600}}>{getLocale()==="en"?"FR":"EN"}</button>
            <button onClick={toggleTheme} style={{padding:"6px 12px",background:C.sf,border:`1px solid ${C.bd}`,borderRadius:8,color:C.txm,cursor:"pointer",fontSize:12,boxShadow:"0 2px 8px rgba(0,0,0,.3)",display:"flex",alignItems:"center",gap:4}} title="Toggle theme">{theme==="dark"?"\u2600\uFE0F "+t("theme.light"):"\uD83C\uDF19 "+t("theme.dark")}</button>
          </div>
          {showShortcuts&&<ShortcutsPanel onClose={()=>setShowShortcuts(false)}/>}
          <OnboardingTour/>
          {tab==="show"&&<ErrorBoundary><ShowAllData bp={bp} orgInfo={orgInfo} theme={theme}/></ErrorBoundary>}
          {tab==="metadata"&&<ErrorBoundary><MetadataBrowser bp={bp} orgInfo={orgInfo} theme={theme}/></ErrorBoundary>}
          {tab==="logins"&&<ErrorBoundary><LoginHistory bp={bp} orgInfo={orgInfo} theme={theme}/></ErrorBoundary>}
          {tab==="loader"&&<ErrorBoundary><Loader bp={bp} orgInfo={orgInfo} theme={theme}/></ErrorBoundary>}
          {tab==="graph"&&<ErrorBoundary><RelationshipGraph bp={bp} orgInfo={orgInfo} theme={theme}/></ErrorBoundary>}
          {tab==="schema"&&<ErrorBoundary><SchemaViewer bp={bp} orgInfo={orgInfo} theme={theme}/></ErrorBoundary>}
          {tab==="solutions"&&<ErrorBoundary><SolutionExplorer bp={bp} orgInfo={orgInfo} theme={theme}/></ErrorBoundary>}
          {tab==="translations"&&<ErrorBoundary><TranslationManager bp={bp} orgInfo={orgInfo} theme={theme}/></ErrorBoundary>}
          {tab==="licenses"&&<ErrorBoundary><UserLicenseMonitor bp={bp} orgInfo={orgInfo} theme={theme}/></ErrorBoundary>}
          {tab==="security"&&<ErrorBoundary><SecurityAudit bp={bp} orgInfo={orgInfo} theme={theme}/></ErrorBoundary>}
          {tab==="help"&&<HelpTab bp={bp} theme={theme} onShowShortcuts={()=>setShowShortcuts(true)} onRestartTour={()=>{try{localStorage.removeItem("colvio_tour_done");}catch{}window.location.reload();}}/>}
        </div>
      </div>
      <style>{`
        @keyframes spin{to{transform:rotate(360deg)}}
        ::placeholder{color:${C.txd}}
        *{scrollbar-width:auto;scrollbar-color:${C.txm}55 ${C.bg}}
        ::-webkit-scrollbar{width:10px;height:10px}
        ::-webkit-scrollbar-track{background:${C.bg}}
        ::-webkit-scrollbar-thumb{background:${C.txm}44;border-radius:5px;border:2px solid ${C.bg}}
        ::-webkit-scrollbar-thumb:hover{background:${C.txm}88}
        ::-webkit-scrollbar-corner{background:${C.bg}}
      `}</style>
    </div>
  );
}
