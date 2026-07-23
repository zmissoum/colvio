import { useState, useEffect } from "react";
import { bridge, onSessionExpired, clearSessionExpired } from "./d365-bridge.js";
import { C, setThemeColors, I, DARK, LIGHT, useBP, useKeyboard, Spin, detectExtension, mono } from "./shared.jsx";
import { t, setLocale, getLocale } from "./i18n.js";

// ── Components ──
import ConnScreen from "./components/ConnScreen.jsx";
import ShowAllData from "./components/ShowAllData.jsx";
import MetadataBrowser from "./components/MetadataBrowser.jsx";
import ExplorerTabs from "./components/ExplorerTabs.jsx";
import ApiTesterTabs from "./components/ApiTesterTabs.jsx";
import LoginHistory from "./components/LoginHistory.jsx";
import Adoption from "./components/Adoption.jsx";
import AutomationInventory from "./components/AutomationInventory.jsx";
import AppInventory from "./components/AppInventory.jsx";
import EnvVariables from "./components/EnvVariables.jsx";
import Loader from "./components/Loader.jsx";
import RecycleBin from "./components/RecycleBin.jsx";
import SystemOps from "./components/SystemOps.jsx";
import CommandPalette from "./components/CommandPalette.jsx";
import WhatsNew from "./components/WhatsNew.jsx";
import RelationshipGraph from "./components/RelationshipGraph.jsx";
import SolutionExplorer from "./components/SolutionExplorer.jsx";
import TranslationManager from "./components/TranslationManager.jsx";
import { ErrorBoundary } from "./components/ErrorBoundary.jsx";
import ShortcutsPanel from "./components/ShortcutsPanel.jsx";
import OnboardingTour from "./components/OnboardingTour.jsx";
import HelpTab from "./components/HelpTab.jsx";
import UserLicenseMonitor from "./components/UserLicenseMonitor.jsx";
import BusinessUnits from "./components/BusinessUnits.jsx";
import SecurityAudit from "./components/SecurityAudit.jsx";
import SchemaViewer from "./components/SchemaViewer.jsx";

// Microsoft's authoritative OrganizationType enum (returned by RetrieveCurrentOrganization).
// We map it to user-facing labels + an isProduction flag. This is the SOURCE OF TRUTH
// when available — far more reliable than URL guessing.
const ORG_TYPE_MAP = {
  "Production":   { label: "PROD",     isProduction: true  },
  "Sandbox":      { label: "SANDBOX",  isProduction: false },
  "CustomerTest": { label: "UAT",      isProduction: false },
  "Trial":        { label: "TRIAL",    isProduction: false },
  "Preview":      { label: "PREVIEW",  isProduction: false },
  "Support":      { label: "SUPPORT",  isProduction: false },
  "Developer":    { label: "DEV",      isProduction: false },
  "Default":      { label: "DEFAULT",  isProduction: false },
  "BCS":          { label: "BCS",      isProduction: false },
};

// Fallback: detect the environment type from the D365 URL hostname.
// Used only when RetrieveCurrentOrganization isn't available (older versions, restricted perms).
// Matches common non-prod indicators surrounded by - or . word-boundaries.
function detectEnvFromUrl(url) {
  if (!url) return { isProduction: true, label: "PROD" };
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    const patterns = [
      { re: /(?:^|[-.])(sandbox)(?:[-.]|$)/, label: "SANDBOX" },
      { re: /(?:^|[-.])(dev|develop|development)(?:[-.]|$)/, label: "DEV" },
      { re: /(?:^|[-.])(test|tst)(?:[-.]|$)/, label: "TEST" },
      { re: /(?:^|[-.])(uat)(?:[-.]|$)/, label: "UAT" },
      { re: /(?:^|[-.])(qa|qual|quality)(?:[-.]|$)/, label: "QA" },
      { re: /(?:^|[-.])(staging|stg|stage)(?:[-.]|$)/, label: "STAGING" },
      { re: /(?:^|[-.])(preprod|pre-prod|preproduction)(?:[-.]|$)/, label: "PREPROD" },
      { re: /(?:^|[-.])(recette|rec)(?:[-.]|$)/, label: "RECETTE" },
      { re: /(?:^|[-.])(demo)(?:[-.]|$)/, label: "DEMO" },
      { re: /(?:^|[-.])(training|train|formation)(?:[-.]|$)/, label: "TRAINING" },
      { re: /(?:^|[-.])(sit)(?:[-.]|$)/, label: "SIT" },
      { re: /(?:^|[-.])(trial)(?:[-.]|$)/, label: "TRIAL" },
      { re: /(?:^|[-.])(preview)(?:[-.]|$)/, label: "PREVIEW" },
      { re: /(?:^|[-.])(hotfix|patch)(?:[-.]|$)/, label: "HOTFIX" },
    ];
    for (const p of patterns) {
      if (p.re.test(hostname)) return { isProduction: false, label: p.label };
    }
    return { isProduction: true, label: "PROD" };
  } catch {
    return { isProduction: true, label: "PROD" };
  }
}

// Resolve env using the most reliable signal available:
// 1. Microsoft's OrganizationType (authoritative, from RetrieveCurrentOrganization)
// 2. URL heuristic (fallback for older D365 / restricted perms)
function detectEnv(orgUrl, organizationType) {
  if (organizationType && ORG_TYPE_MAP[organizationType]) {
    const m = ORG_TYPE_MAP[organizationType];
    return { ...m, source: "api", rawType: organizationType };
  }
  if (organizationType) {
    // Unknown enum value — surface it so we know about new MS env types
    return { label: organizationType.toUpperCase(), isProduction: organizationType === "Production", source: "api", rawType: organizationType };
  }
  return { ...detectEnvFromUrl(orgUrl), source: "url-heuristic" };
}

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
      // localStorage can throw in private/blocked contexts — fail open to following the OS theme.
      let saved=null; try{saved=localStorage.getItem("colvio_theme");}catch{}
      if (!saved) setTheme(e.matches ? "dark" : "light");
    };
    mq.addEventListener?.('change', handler);
    return () => mq.removeEventListener?.('change', handler);
  }, []);
  const[queryHistory,setQueryHistory]=useState([]);
  const[orgInfo,setOrgInfo]=useState(null);
  const[permissions,setPermissions]=useState(null);
  // false while permissions are still provisional (we connected fail-open on a slow-probe timeout).
  // Restricted ("requires") tabs stay hidden until this flips true, so they never flash-then-vanish
  // for non-admins. The common path (probe wins the race) sets it true immediately = no delay.
  const[permsConfirmed,setPermsConfirmed]=useState(false);
  const[expired,setExpired]=useState(false);
  const[,setLocaleState]=useState(getLocale());// value unused, setter triggers re-render on locale change
  const[showShortcuts,setShowShortcuts]=useState(false);
  const[showPalette,setShowPalette]=useState(false);
  const[orgFeatures,setOrgFeatures]=useState(null); // org-level switches: audit, traces, recycle bin
  const[loaderBusy,setLoaderBusy]=useState(false);  // true while a Data Loader import is running
  const bp=useBP();
  useKeyboard("/",()=>setShowShortcuts(s=>!s),[]);
  useKeyboard("k",()=>setShowPalette(s=>!s),[]);

  useEffect(() => onSessionExpired(() => setExpired(true)), []);

  // Apps module "Open in Explorer": switch to the Explorer tab — the active query tab
  // (kept mounted) consumes window.__colvioPendingQuery and applies the view's FetchXML.
  useEffect(()=>{
    const h=()=>setTab("explorer");
    window.addEventListener("colvio:open-fetchxml",h);
    return()=>window.removeEventListener("colvio:open-fetchxml",h);
  },[]);

  // ── Auto-connect if running as Chrome extension ──
  useEffect(() => {
    const ext = detectExtension();
    if (ext.isExtension && ext.orgUrl) {
      const orgName = new URL(ext.orgUrl).hostname.split(".")[0];
      const region = new URL(ext.orgUrl).hostname.split(".")[1] || "crm";
      const env = detectEnv(ext.orgUrl, ext.organizationType);
      const info = {
        orgUrl: ext.orgUrl,
        orgName,
        region,
        isProduction: env.isProduction,
        envLabel: env.label,
        envSource: env.source,
        organizationType: ext.organizationType,
        environmentId: ext.environmentId,
        organizationFriendlyName: ext.organizationFriendlyName,
        organizationVersion: ext.organizationVersion,
        isExtension: true,
      };
      setOrgInfo(info);
      setConnecting(true); // show "Connecting to <org>…" (not the manual/Demo connect screen) while probing

      // First paint normally waits on checkPermissions() so restricted tabs never flash. But a
      // cold tab / slow org can make that probe take several seconds, leaving the user staring at
      // the connect screen. So we race it against a short timeout: if the probe wins we get exact
      // permissions (no flash); if the timeout wins we connect fail-open NOW and tighten the
      // permissions as soon as the probe lands. Admins (the common case) hold every probed
      // privilege, so fail-open === real perms and nothing flashes regardless.
      const FAIL_OPEN = { canReadAudit: true, canReadSolutions: true, canReadAllUsers: true, canPublish: true };
      let settled = false;
      const go = (perms, confirmed) => {
        if (settled) return;
        settled = true;
        setPermissions(perms);
        setPermsConfirmed(confirmed); // provisional fail-open (timeout) stays false → restricted tabs hidden until probe lands
        setConnecting(false);
        setConnected(true);
        // Deferred, cached, non-blocking: publish privilege (3 chained calls) and the
        // org-feature switches must never delay the first paint of the tab bar.
        bridge.checkPublishPrivilege().then(canPublish => setPermissions(p => ({ ...p, canPublish }))).catch(() => {});
        bridge.getOrgFeatures().then(setOrgFeatures).catch(() => {});
      };
      const timer = setTimeout(() => go(FAIL_OPEN, false), 2500);
      bridge.checkPermissions().then(perms => {
        clearTimeout(timer);
        if (settled) {
          // Probe landed after we already connected fail-open → tighten the read gates, but
          // preserve the deferred canPublish (checkPublishPrivilege may have refined it already).
          setPermissions(p => ({ ...p, canReadAudit: perms.canReadAudit, canReadSolutions: perms.canReadSolutions, canReadAllUsers: perms.canReadAllUsers, canBypassPlugins: perms.canBypassPlugins }));
          setPermsConfirmed(true); // exact perms known now → reveal the tabs the user is actually allowed
        } else go(perms, true);
      }).catch(() => {
        clearTimeout(timer);
        // Probes failed entirely → we genuinely can't tell, so fail open (D365 still enforces server-side).
        if (settled) setPermsConfirmed(true); else go(FAIL_OPEN, true);
      });
    }
  }, []);

  const addHistory=(q,mode)=>setQueryHistory(h=>[{query:q,mode:mode||"builder",time:new Date().toLocaleTimeString(),id:Date.now()},...h.slice(0,19)]);

  const handleManualConnect = () => {
    setConnecting(true);
    setTimeout(() => {
      setConnecting(false);
      setOrgInfo({ orgUrl: "https://demo.crm4.dynamics.com", orgName: "demo", region: "crm4", isProduction: false, isExtension: false });
      setPermissions({ canReadAudit: true, canReadSolutions: true, canReadAllUsers: true, canBypassPlugins: true, canPublish: true });
      setPermsConfirmed(true); // demo permissions are final — without this, every "requires" tab stays hidden in demo mode
      setConnected(true);
    }, 1500);
  };

  // Tabs are grouped into three mental buckets — daily DATA work, DEVELOP & model, ADMIN &
  // governance — in decreasing frequency of use. The sidebar renders a small caption when the
  // section changes; a caption disappears with its tabs when permissions hide the whole group.
  const allTabs=[
    {id:"explorer",section:"data",label:t("nav.explorer"),desc:t("nav.explorer.desc"),icon:<I.Search/>},
    {id:"loader",section:"data",label:t("nav.loader"),desc:t("nav.loader.desc"),icon:<I.Upload/>},
    {id:"recyclebin",section:"data",label:t("nav.recyclebin"),desc:t("nav.recyclebin.desc"),icon:<I.Trash/>,featureOff:!!(orgFeatures&&orgFeatures.recycleBin&&!orgFeatures.recycleBin.enabled&&!orgFeatures.recycleBin.unknown)},
    {id:"show",section:"data",label:t("nav.show"),desc:t("nav.show.desc"),icon:<I.Eye/>},
    {id:"apitester",section:"develop",label:t("nav.apitester"),desc:t("nav.apitester.desc"),icon:<I.Zap/>},
    {id:"metadata",section:"develop",label:t("nav.metadata"),desc:t("nav.metadata.desc"),icon:<I.Grid/>},
    {id:"automation",section:"develop",label:t("nav.automation"),desc:t("nav.automation.desc"),icon:<I.Zap/>,requires:"canReadSolutions"},
    {id:"apps",section:"develop",label:t("nav.apps"),desc:t("nav.apps.desc"),icon:<I.Grid/>},
    {id:"graph",section:"develop",label:t("nav.graph"),desc:t("nav.graph.desc"),icon:<I.Link/>},
    {id:"schema",section:"develop",label:t("nav.schema"),desc:t("nav.schema.desc"),icon:<I.Grid/>},
    {id:"solutions",section:"develop",label:t("nav.solutions"),desc:t("nav.solutions.desc"),icon:<I.Database/>,requires:"canReadSolutions"},
    {id:"envvars",section:"develop",label:t("nav.envvars"),desc:t("nav.envvars.desc"),icon:<I.Zap/>,requires:"canReadSolutions"},
    {id:"translations",section:"develop",label:t("nav.translations"),desc:t("nav.translations.desc"),icon:<I.Clipboard/>,requires:"canReadSolutions"},
    {id:"licenses",section:"admin",label:t("nav.licenses"),desc:t("nav.licenses.desc"),icon:<I.Users/>,requires:"canReadAllUsers"},
    {id:"bu",section:"admin",label:t("nav.bu"),desc:t("nav.bu.desc"),icon:<I.Link/>,requires:"canReadAllUsers"},
    {id:"security",section:"admin",label:t("nav.security"),desc:t("nav.security.desc"),icon:<I.Shield/>,requires:"canReadAllUsers"},
    {id:"adoption",section:"admin",label:t("nav.adoption"),desc:t("nav.adoption.desc"),icon:<I.Users/>,requires:"canReadAudit",featureOff:orgFeatures?orgFeatures.auditEnabled===false:false},
    {id:"logins",section:"admin",label:t("nav.logins"),desc:t("nav.logins.desc"),icon:<I.Clock/>,requires:"canReadAudit",featureOff:orgFeatures?orgFeatures.auditEnabled===false:false},
    {id:"ops",section:"admin",label:t("nav.ops"),desc:t("nav.ops.desc"),icon:<I.Zap/>,requires:"canReadAllUsers"},
    {id:"help",label:t("nav.help"),desc:t("nav.help.desc"),icon:<I.Help/>},
  ];
  // Restricted tabs appear only once permissions are CONFIRMED — during the provisional fail-open
  // window (slow-probe timeout) they stay hidden, so a non-admin never sees them flash then vanish
  // (and so can never click into a tab that's about to 403).
  const tabs=allTabs.filter(t=>!t.requires||(permsConfirmed&&permissions?.[t.requires]));
  // If the active tab is no longer permitted (e.g. permissions tightened after a provisional connect),
  // bounce to the first allowed tab instead of leaving its content mounted to throw a raw 403.
  useEffect(()=>{
    if(connected&&tab&&!tabs.some(tb=>tb.id===tab)) setTab(tabs[0]?.id||"explorer");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[connected,permsConfirmed,permissions,orgFeatures,tab]);
  const paletteActions=[
    {label:t("palette.a_theme"),hint:"dark / light",icon:"🌓",run:toggleTheme},
    {label:t("palette.a_lang"),hint:"EN ⇄ FR",icon:"🌐",run:()=>{const next=getLocale()==="en"?"fr":"en";setLocale(next);setLocaleState(next);}},
    {label:t("palette.a_shortcuts"),hint:"Ctrl+/",icon:"⌨",run:()=>setShowShortcuts(true)},
  ];

  if(!connected) return (<ConnScreen onConnect={handleManualConnect} connecting={connecting} bp={bp} orgName={orgInfo?.orgName}/>);

  return(
    <div style={{display:"flex",height:"100vh",background:C.bg,color:C.tx,fontFamily:"'DM Sans','Segoe UI',system-ui,sans-serif",fontSize:15}}>
      <CommandPalette open={showPalette} onClose={()=>setShowPalette(false)} tabs={tabs} onNavigate={setTab} actions={paletteActions}/>
      <WhatsNew/>
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
          {(()=>{
            // Section captions appear when the (visible) section changes — permission filtering
            // already happened in `tabs`, so a fully hidden group takes its caption with it.
            const out=[];let last=null;
            for(const tb of tabs){
              if(tb.section&&tb.section!==last) out.push(
                <div key={"sec-"+tb.section} style={{padding:out.length?"12px 9px 3px":"2px 9px 3px",fontSize:10,fontWeight:700,letterSpacing:"1.2px",color:C.txd,textTransform:"uppercase"}}>{t("nav.section."+tb.section)}</div>
              );
              if(tb.section) last=tb.section;
              out.push(
                <button key={tb.id} onClick={()=>{setTab(tb.id);setSideOpen(false);}} title={tb.featureOff?t("featuregate.tab_tooltip"):undefined} style={{width:"100%",display:"flex",alignItems:"center",gap:7,padding:"8px 9px",border:"none",borderRadius:6,cursor:"pointer",marginBottom:2,transition:"all .12s",background:tab===tb.id?C.sfa:"transparent",color:tab===tb.id?C.tx:C.txm,opacity:tb.featureOff?0.55:1}}>
                  <span style={{color:tab===tb.id?C.cy:C.txd,flexShrink:0}}>{tb.icon}</span>
                  <div style={{textAlign:"left",minWidth:0}}><div style={{fontSize:14,fontWeight:tab===tb.id?600:400}}>{tb.label}{tb.featureOff&&<span style={{marginLeft:6,fontSize:9,verticalAlign:"middle",color:C.yw}}>●</span>}</div><div style={{fontSize:11,color:C.txd,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{tb.featureOff?t("featuregate.tab_desc"):tb.desc}</div></div>
                </button>
              );
            }
            return out;
          })()}
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
              ? <span title={`Detected via ${orgInfo?.envSource==="api"?"Microsoft API (OrganizationType="+orgInfo?.organizationType+")":"URL pattern matching"}`} style={{padding:"3px 10px",borderRadius:4,fontSize:13,fontWeight:700,background:C.rd+"22",color:C.rd,border:`1px solid ${C.rd}55`,letterSpacing:1,cursor:"help"}}>⚠ {orgInfo?.envLabel||"PROD"}</span>
              : <span title={`Detected via ${orgInfo?.envSource==="api"?"Microsoft API (OrganizationType="+orgInfo?.organizationType+")":"URL pattern matching"}`} style={{padding:"3px 10px",borderRadius:4,fontSize:13,fontWeight:700,background:C.gn+"22",color:C.gn,border:`1px solid ${C.gn}55`,letterSpacing:1,cursor:"help"}}>{orgInfo?.envLabel||"SANDBOX"}</span>
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
            <input readOnly placeholder={t("sidebar.search_placeholder")} onFocus={()=>setShowPalette(true)} onClick={()=>setShowPalette(true)} title="Open the command palette (Ctrl+K)" style={{width:"100%",padding:"5px 10px 5px 30px",background:C.sfh,border:"none",borderRadius:6,color:C.tx,fontSize:13,outline:"none",boxSizing:"border-box",cursor:"pointer"}}/>
            <span style={{position:"absolute",left:9,top:"50%",transform:"translateY(-50%)",color:C.txd}}><I.Search s={13}/></span>
          </div>
          <div style={{flex:1}}/>
          <span style={{fontSize:12,color:C.txd,...mono}}>{t("explorer.execute_hint")}</span>
        </div>
        <div style={{flex:1,overflow:"auto"}}>
          {/* Explorer stays mounted (never unmounts) so queries persist across tab switches.
              ExplorerTabs adds browser-style query tabs — several queries open at once, run one at a time to compare. */}
          <div style={{display:tab==="explorer"?"block":"none",height:"100%"}}><ErrorBoundary><ExplorerTabs bp={bp} addHistory={addHistory} orgInfo={orgInfo} theme={theme}/></ErrorBoundary></div>
          <div style={{position:"fixed",bottom:12,right:12,zIndex:50,display:"flex",gap:6}}>
            <button onClick={()=>setShowShortcuts(true)} style={{padding:"6px 10px",background:C.sf,border:`1px solid ${C.bd}`,borderRadius:8,color:C.txd,cursor:"pointer",fontSize:12,boxShadow:"0 2px 8px rgba(0,0,0,.3)",fontWeight:700}} title="Ctrl+/">?</button>
            <button onClick={()=>{const next=getLocale()==="en"?"fr":"en";setLocale(next);setLocaleState(next);}} style={{padding:"6px 12px",background:C.sf,border:`1px solid ${C.bd}`,borderRadius:8,color:C.txm,cursor:"pointer",fontSize:12,boxShadow:"0 2px 8px rgba(0,0,0,.3)",fontWeight:600}}>{getLocale()==="en"?"FR":"EN"}</button>
            <button onClick={toggleTheme} style={{padding:"6px 12px",background:C.sf,border:`1px solid ${C.bd}`,borderRadius:8,color:C.txm,cursor:"pointer",fontSize:12,boxShadow:"0 2px 8px rgba(0,0,0,.3)",display:"flex",alignItems:"center",gap:4}} title="Toggle theme">{theme==="dark"?"\u2600\uFE0F "+t("theme.light"):"\uD83C\uDF19 "+t("theme.dark")}</button>
          </div>
          {showShortcuts&&<ShortcutsPanel onClose={()=>setShowShortcuts(false)}/>}
          <OnboardingTour/>
          {tab==="apitester"&&<ErrorBoundary><ApiTesterTabs bp={bp} orgInfo={orgInfo} theme={theme}/></ErrorBoundary>}
          {tab==="show"&&<ErrorBoundary><ShowAllData bp={bp} orgInfo={orgInfo} theme={theme} orgFeatures={orgFeatures} permissions={permissions}/></ErrorBoundary>}
          {tab==="metadata"&&<ErrorBoundary><MetadataBrowser bp={bp} orgInfo={orgInfo} theme={theme}/></ErrorBoundary>}
          {tab==="automation"&&<ErrorBoundary><AutomationInventory bp={bp} orgInfo={orgInfo}/></ErrorBoundary>}
          {tab==="apps"&&<ErrorBoundary><AppInventory bp={bp} orgInfo={orgInfo}/></ErrorBoundary>}
          {tab==="envvars"&&<ErrorBoundary><EnvVariables bp={bp} orgInfo={orgInfo}/></ErrorBoundary>}
          {tab==="logins"&&<ErrorBoundary><LoginHistory bp={bp} orgInfo={orgInfo} theme={theme} orgFeatures={orgFeatures}/></ErrorBoundary>}
          {tab==="adoption"&&<ErrorBoundary><Adoption bp={bp} orgInfo={orgInfo} theme={theme} orgFeatures={orgFeatures}/></ErrorBoundary>}
          {/* Loader stays MOUNTED (display toggle, like Explorer) so switching nav tabs during an
              import never unmounts it — the run keeps its progress, log and result, and you can
              come back to Cancel or Rollback. Conditional rendering would lose all of that. */}
          <div style={{display:tab==="loader"?"block":"none",height:"100%"}}><ErrorBoundary><Loader bp={bp} orgInfo={orgInfo} theme={theme} permissions={permissions} onBusyChange={setLoaderBusy}/></ErrorBoundary></div>
          {tab==="recyclebin"&&<ErrorBoundary><RecycleBin bp={bp} orgInfo={orgInfo} theme={theme}/></ErrorBoundary>}
          {tab==="ops"&&<ErrorBoundary><SystemOps bp={bp} orgInfo={orgInfo} theme={theme} permissions={permissions} orgFeatures={orgFeatures}/></ErrorBoundary>}
          {tab==="graph"&&<ErrorBoundary><RelationshipGraph bp={bp} orgInfo={orgInfo} theme={theme}/></ErrorBoundary>}
          {tab==="schema"&&<ErrorBoundary><SchemaViewer bp={bp} orgInfo={orgInfo} theme={theme}/></ErrorBoundary>}
          {tab==="solutions"&&<ErrorBoundary><SolutionExplorer bp={bp} orgInfo={orgInfo} theme={theme}/></ErrorBoundary>}
          {tab==="translations"&&<ErrorBoundary><TranslationManager bp={bp} orgInfo={orgInfo} theme={theme} canPublish={permissions?.canPublish!==false}/></ErrorBoundary>}
          {tab==="licenses"&&<ErrorBoundary><UserLicenseMonitor bp={bp} orgInfo={orgInfo} theme={theme}/></ErrorBoundary>}
          {tab==="bu"&&<ErrorBoundary><BusinessUnits bp={bp} orgInfo={orgInfo} theme={theme}/></ErrorBoundary>}
          {tab==="security"&&<ErrorBoundary><SecurityAudit bp={bp} orgInfo={orgInfo} theme={theme}/></ErrorBoundary>}
          {tab==="help"&&<HelpTab bp={bp} theme={theme} onShowShortcuts={()=>setShowShortcuts(true)} onRestartTour={()=>{if(loaderBusy&&!window.confirm("A Data Loader import is still running. Restarting the tour reloads Colvio and abandons the import (no result, no rollback). Continue?"))return;try{localStorage.removeItem("colvio_tour_done");}catch{}window.location.reload();}}/>}
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
