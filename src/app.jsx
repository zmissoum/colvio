import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { bridge } from "./d365-bridge.js";
import * as XLSX from "xlsx";

// ── Performance: debounced value hook ──
function useDebounce(value, delay = 150) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

/* ═══════════════════════════════════════════════════════════════
   Colvio v1.6 — Data Explorer & Loader for Microsoft Dynamics 365
   ═══════════════════════════════════════════════════════════════ */

// ── ICONS ──────────────────────────────────────────────────────
const I={Search:(p)=><svg width={p?.s||16} height={p?.s||16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>,Upload:()=><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>,Download:()=><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>,Database:()=><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>,Play:()=><svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21"/></svg>,X:()=><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,Link:()=><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>,Trash:()=><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>,Plus:()=><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,Zap:()=><svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10"/></svg>,Arrow:()=><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>,Menu:()=><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>,Back:()=><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>,Copy:()=><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>,Eye:()=><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>,Star:()=><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>,Clock:()=><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,Clipboard:()=><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/></svg>,Grid:()=><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>,Settings:()=><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>,};

// ── COLORS & STYLES ───────────────────────────────────────────
const DARK={bg:"#0B0E14",sf:"#12151C",sfh:"#181C25",sfa:"#1E2230",bd:"#252A36",tx:"#E8EAF0",txm:"#8B92A8",txd:"#5C6380",vi:"#0066FF",vil:"#3388FF",vid:"#003380",cy:"#00B7C3",cyd:"#005B70",gn:"#34D399",gnd:"#065F46",rd:"#F87171",yw:"#FBBF24",lv:"#99CCFF",or:"#FB923C"};
const LIGHT={bg:"#F5F6FA",sf:"#FFFFFF",sfh:"#EEF0F5",sfa:"#E2E5ED",bd:"#D0D4DE",tx:"#1A1D26",txm:"#4A5068",txd:"#8890A4",vi:"#0066FF",vil:"#2277FF",vid:"#D6E6FF",cy:"#0891B2",cyd:"#E0F7FA",gn:"#059669",gnd:"#D1FAE5",rd:"#DC2626",yw:"#D97706",lv:"#1E40AF",or:"#EA580C"};
let C=DARK;
const mono={fontFamily:"'DM Mono','Fira Code',monospace"};
const displayType=(t)=>t==="Picklist"?"OptionSet":t;
const inp=(x)=>({width:"100%",padding:"7px 11px",background:C.bg,border:`1px solid ${C.bd}`,borderRadius:6,color:C.tx,fontSize:14,outline:"none",boxSizing:"border-box",...x});
const bt=(bg,x)=>({padding:"7px 14px",background:bg||C.sfh,border:bg?"none":`1px solid ${C.bd}`,borderRadius:6,color:"white",cursor:"pointer",fontSize:13,fontWeight:600,display:"inline-flex",alignItems:"center",gap:5,transition:"all .15s",whiteSpace:"nowrap",...x});
const crd=(x)=>({background:C.sf,border:`1px solid ${C.bd}`,borderRadius:10,...x});
const ths=()=>({padding:"6px 10px",textAlign:"left",borderBottom:`2px solid ${C.bd}`,color:C.txd,fontWeight:600,fontSize:12,position:"sticky",top:0,background:C.sf,whiteSpace:"nowrap"});
const tds={padding:"5px 10px",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",fontSize:14};

// ── HOOKS ─────────────────────────────────────────────────────
function useBP(){const[w,setW]=useState(typeof window!=="undefined"?window.innerWidth:1200);useEffect(()=>{const h=()=>setW(window.innerWidth);window.addEventListener("resize",h);return()=>window.removeEventListener("resize",h);},[]);return{mobile:w<640,tablet:w>=640&&w<1024,w};}

function useKeyboard(key, handler, deps=[]){useEffect(()=>{const h=(e)=>{if(e.key===key&&(e.ctrlKey||e.metaKey))handler(e);};window.addEventListener("keydown",h);return()=>window.removeEventListener("keydown",h);},deps);}

// ── DATA ──────────────────────────────────────────────────────
const ENTS=[
  {l:"account",d:"Account",p:"accounts",i:"🏢",c:12450,cat:"Sales"},
  {l:"contact",d:"Contact",p:"contacts",i:"👤",c:34200,cat:"Sales"},
  {l:"opportunity",d:"Opportunity",p:"opportunities",i:"💰",c:8730,cat:"Sales"},
  {l:"lead",d:"Lead",p:"leads",i:"🎯",c:15600,cat:"Sales"},
  {l:"incident",d:"Case",p:"incidents",i:"📋",c:22100,cat:"Service"},
  {l:"task",d:"Task",p:"tasks",i:"✅",c:45000,cat:"Activity"},
  {l:"phonecall",d:"Phone Call",p:"phonecalls",i:"📞",c:12300,cat:"Activity"},
  {l:"email",d:"Email",p:"emails",i:"📧",c:89000,cat:"Activity"},
  {l:"appointment",d:"Appointment",p:"appointments",i:"📅",c:7600,cat:"Activity"},
  {l:"systemuser",d:"User",p:"systemusers",i:"👥",c:320,cat:"System"},
  {l:"team",d:"Team",p:"teams",i:"🏷️",c:45,cat:"System"},
  {l:"businessunit",d:"Business Unit",p:"businessunits",i:"🏗️",c:8,cat:"System"},
  {l:"product",d:"Product",p:"products",i:"📦",c:1280,cat:"Catalog"},
  {l:"salesorder",d:"Order",p:"salesorders",i:"🛒",c:5400,cat:"Sales"},
  {l:"contract",d:"Contract",p:"contracts",i:"📄",c:2100,cat:"Sales"},
  {l:"campaign",d:"Campaign",p:"campaigns",i:"📢",c:890,cat:"Marketing"},
  {l:"list",d:"Marketing List",p:"lists",i:"📋",c:340,cat:"Marketing"},
  {l:"quote",d:"Quote",p:"quotes",i:"📋",c:3200,cat:"Sales"},
  {l:"annotation",d:"Note",p:"annotations",i:"📝",c:67000,cat:"System"},
  {l:"pricelevel",d:"Price List",p:"pricelevels",i:"💲",c:45,cat:"Catalog"},
  {l:"transactioncurrency",d:"Currency",p:"transactioncurrencies",i:"💱",c:3,cat:"System"},
  {l:"knowledgearticle",d:"Knowledge Article",p:"knowledgearticles",i:"📚",c:560,cat:"Service"},
];

const FLDS=[
  {l:"accountid",d:"Account ID",t:"Uniqueidentifier",req:false,cust:false},
  {l:"name",d:"Account Name",t:"String",req:true,cust:false},
  {l:"accountnumber",d:"Account Number",t:"String",req:false,cust:false},
  {l:"new_sapid",d:"SAP ID",t:"String",req:false,cust:true},
  {l:"new_siretcode",d:"SIRET",t:"String",req:false,cust:true},
  {l:"revenue",d:"Annual Revenue",t:"Money",req:false,cust:false},
  {l:"numberofemployees",d:"Employees",t:"Integer",req:false,cust:false},
  {l:"telephone1",d:"Main Phone",t:"String",req:false,cust:false},
  {l:"telephone2",d:"Other Phone",t:"String",req:false,cust:false},
  {l:"fax",d:"Fax",t:"String",req:false,cust:false},
  {l:"websiteurl",d:"Website",t:"String",req:false,cust:false},
  {l:"emailaddress1",d:"Email",t:"String",req:false,cust:false},
  {l:"address1_line1",d:"Street 1",t:"String",req:false,cust:false},
  {l:"address1_line2",d:"Street 2",t:"String",req:false,cust:false},
  {l:"address1_city",d:"City",t:"String",req:false,cust:false},
  {l:"address1_stateorprovince",d:"State",t:"String",req:false,cust:false},
  {l:"address1_postalcode",d:"ZIP",t:"String",req:false,cust:false},
  {l:"address1_country",d:"Country",t:"String",req:false,cust:false},
  {l:"industrycode",d:"Industry",t:"Picklist",req:false,cust:false,opts:[{v:1,l:"Accounting"},{v:2,l:"Agriculture"},{v:3,l:"Construction"},{v:4,l:"Consulting"},{v:5,l:"Education"},{v:6,l:"Finance"},{v:7,l:"Government"},{v:8,l:"Healthcare"},{v:9,l:"Manufacturing"},{v:10,l:"Technology"},{v:11,l:"Retail"},{v:12,l:"Pharma"}]},
  {l:"customertypecode",d:"Relationship Type",t:"Picklist",req:false,cust:false,opts:[{v:1,l:"Competitor"},{v:2,l:"Consultant"},{v:3,l:"Customer"},{v:4,l:"Investor"},{v:5,l:"Partner"},{v:6,l:"Influencer"},{v:7,l:"Press"},{v:8,l:"Prospect"},{v:9,l:"Reseller"},{v:10,l:"Supplier"},{v:11,l:"Vendor"},{v:12,l:"Other"}]},
  {l:"statecode",d:"Status",t:"State",req:false,cust:false,opts:[{v:0,l:"Active"},{v:1,l:"Inactive"}]},
  {l:"statuscode",d:"Status Reason",t:"Status",req:false,cust:false},
  {l:"createdon",d:"Created On",t:"DateTime",req:false,cust:false},
  {l:"modifiedon",d:"Modified On",t:"DateTime",req:false,cust:false},
  {l:"_parentaccountid_value",d:"Parent Account",t:"Lookup",req:false,cust:false,target:"account"},
  {l:"_ownerid_value",d:"Owner",t:"Lookup",req:false,cust:false,target:"systemuser"},
  {l:"_transactioncurrencyid_value",d:"Currency",t:"Lookup",req:false,cust:false,target:"transactioncurrency"},
  {l:"_primarycontactid_value",d:"Primary Contact",t:"Lookup",req:false,cust:false,target:"contact"},
];

const ROWS=[
  {accountid:"a1b2c3d4-e5f6-7890-abcd-ef1234567890",name:"ACME France",accountnumber:"ACC-001",new_sapid:"SAP-001",new_siretcode:"123 456 789 00012",revenue:15000000,numberofemployees:450,telephone1:"+33 1 42 68 53 00",emailaddress1:"info@acme.fr",address1_city:"Paris",address1_country:"France",industrycode:"Manufacturing",customertypecode:"Customer",statecode:"Active",createdon:"2022-03-15T10:30:00Z",modifiedon:"2025-12-01T09:15:00Z",_ownerid_value:"Jean Dupont"},
  {accountid:"b2c3d4e5-f6a7-8901-bcde-f12345678901",name:"Globex GmbH",accountnumber:"ACC-002",new_sapid:"SAP-002",new_siretcode:"",revenue:28000000,numberofemployees:1200,telephone1:"+49 30 1234567",emailaddress1:"contact@globex.de",address1_city:"Berlin",address1_country:"Germany",industrycode:"Technology",customertypecode:"Partner",statecode:"Active",createdon:"2021-11-08T14:15:00Z",modifiedon:"2026-01-15T16:45:00Z",_ownerid_value:"Marie Martin"},
  {accountid:"c3d4e5f6-a7b8-9012-cdef-123456789012",name:"Wayne Enterprises",accountnumber:"ACC-003",new_sapid:"SAP-003",new_siretcode:"",revenue:95000000,numberofemployees:5000,telephone1:"+1 415 555 1234",emailaddress1:"info@wayne.com",address1_city:"Gotham",address1_country:"United States",industrycode:"Consulting",customertypecode:"Customer",statecode:"Active",createdon:"2020-06-22T08:00:00Z",modifiedon:"2026-02-20T11:30:00Z",_ownerid_value:"Pierre Bernard"},
  {accountid:"d4e5f6a7-b8c9-0123-defa-234567890123",name:"Stark Industries",accountnumber:"ACC-004",new_sapid:"SAP-004",new_siretcode:"",revenue:120000000,numberofemployees:8500,telephone1:"+1 212 555 9876",emailaddress1:"hello@stark.com",address1_city:"New York",address1_country:"United States",industrycode:"Technology",customertypecode:"Customer",statecode:"Active",createdon:"2019-01-10T09:45:00Z",modifiedon:"2026-03-01T14:00:00Z",_ownerid_value:"Sophie Lefevre"},
  {accountid:"e5f6a7b8-c9d0-1234-efab-345678901234",name:"Initech Ltd",accountnumber:"ACC-005",new_sapid:"SAP-005",new_siretcode:"987 654 321 00015",revenue:5200000,numberofemployees:85,telephone1:"+44 207 123 456",emailaddress1:"info@initech.com",address1_city:"London",address1_country:"United Kingdom",industrycode:"Consulting",customertypecode:"Prospect",statecode:"Active",createdon:"2023-02-28T16:20:00Z",modifiedon:"2026-02-28T10:10:00Z",_ownerid_value:"Lucas Moreau"},
  {accountid:"f6a7b8c9-d0e1-2345-fabc-456789012345",name:"Umbrella Corp",accountnumber:"ACC-006",new_sapid:"SAP-006",new_siretcode:"",revenue:42000000,numberofemployees:3200,telephone1:"+81 3 1234 5678",emailaddress1:"contact@umbrella.co.jp",address1_city:"Tokyo",address1_country:"Japan",industrycode:"Pharma",customertypecode:"Vendor",statecode:"Inactive",createdon:"2021-07-04T11:00:00Z",modifiedon:"2025-06-15T08:30:00Z",_ownerid_value:"Emma Petit"},
];

const D365CF=["firstname","lastname","emailaddress1","telephone1","jobtitle","address1_line1","address1_city","address1_postalcode","address1_country","new_externalid"];

function dl(c,t,n){const b=new Blob([c],{type:t});const u=URL.createObjectURL(b);const a=document.createElement("a");a.href=u;a.download=n;a.click();URL.revokeObjectURL(u);}
function Spin({s=14}){return <span style={{display:"inline-block",width:s,height:s,border:`2px solid rgba(255,255,255,.3)`,borderTopColor:"white",borderRadius:"50%",animation:"spin .8s linear infinite"}}/>;}
function copyText(t){navigator.clipboard?.writeText(String(t));}

// ── MAIN APP ──────────────────────────────────────────────────

// Detect extension mode : panel.html?orgUrl=...&tabId=...
function detectExtension() {
  try {
    const params = new URLSearchParams(window.location.search);
    const orgUrl = params.get("orgUrl");
    const tabId = params.get("tabId");
    if (orgUrl && tabId) return { orgUrl, tabId: parseInt(tabId, 10), isExtension: true };
  } catch {}
  // Also check if chrome.runtime is available (loaded as extension page)
  try {
    if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.id) {
      return { orgUrl: null, tabId: null, isExtension: true };
    }
  } catch {}
  return { orgUrl: null, tabId: null, isExtension: false };
}

export default function App(){
  const[tab,setTab]=useState("explorer");
  const[connected,setConnected]=useState(false);
  const[connecting,setConnecting]=useState(false);
  const[sideOpen,setSideOpen]=useState(false);
  const[theme,setTheme]=useState(()=>{try{const t=localStorage.getItem("colvio_theme");return t||"dark";}catch{return "dark";}});
  C=theme==="light"?LIGHT:DARK;
  const toggleTheme=()=>{const t=theme==="dark"?"light":"dark";setTheme(t);try{localStorage.setItem("colvio_theme",t);}catch{}};
  useEffect(()=>{document.body.style.background=C.bg;document.body.style.color=C.tx;},[theme]);
  const[queryHistory,setQueryHistory]=useState([]);
  const[orgInfo,setOrgInfo]=useState(null); // { orgUrl, orgName, isProduction }
  const bp=useBP();

  // ── Auto-connect if running as Chrome extension ──
  useEffect(() => {
    const ext = detectExtension();
    if (ext.isExtension && ext.orgUrl) {
      // We're in extension mode with an org URL → auto-connect
      const orgName = new URL(ext.orgUrl).hostname.split(".")[0];
      const region = new URL(ext.orgUrl).hostname.split(".")[1] || "crm";
      setOrgInfo({
        orgUrl: ext.orgUrl,
        orgName,
        region,
        isProduction: !ext.orgUrl.includes("sandbox") && !ext.orgUrl.includes("dev"),
        isExtension: true,
      });
      setConnected(true);
    }
  }, []);

  const addHistory=(q)=>setQueryHistory(h=>[{query:q,time:new Date().toLocaleTimeString(),id:Date.now()},...h.slice(0,19)]);

  const handleManualConnect = () => {
    setConnecting(true);
    setTimeout(() => {
      setConnecting(false);
      setOrgInfo({ orgUrl: "https://demo.crm4.dynamics.com", orgName: "demo", region: "crm4", isProduction: false, isExtension: false });
      setConnected(true);
    }, 1500);
  };

  if(!connected) return (<ConnScreen onConnect={handleManualConnect} connecting={connecting} bp={bp}/>);

  const tabs=[
    {id:"explorer",label:"Data Explorer",desc:"Query & export",icon:<I.Search/>},
    {id:"show",label:"Show All Data",desc:"Inspect a record",icon:<I.Eye/>},
    {id:"metadata",label:"Metadata",desc:"Entities, fields, OptionSets",icon:<I.Grid/>},
    {id:"logins",label:"Login History",desc:"Login timeline",icon:<I.Clock/>},
    {id:"loader",label:"Data Loader",desc:"Load data",icon:<I.Upload/>},
    {id:"graph",label:"Relationships",desc:"Entity graph",icon:<I.Link/>},
    {id:"solutions",label:"Solutions",desc:"Browse solutions",icon:<I.Database/>},
    {id:"translations",label:"Translations",desc:"Import/export labels",icon:<I.Clipboard/>},
  ];

  return(
    <div style={{display:"flex",height:"100vh",background:C.bg,color:C.tx,fontFamily:"'DM Sans','Segoe UI',system-ui,sans-serif",fontSize:15}}>
      {bp.mobile&&sideOpen&&<div onClick={()=>setSideOpen(false)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,.5)",zIndex:99}}/>}
      {/* Sidebar */}
      <div style={{width:bp.mobile?"85vw":200,background:C.sf,borderRight:`1px solid ${C.bd}`,display:"flex",flexDirection:"column",flexShrink:0,...(bp.mobile?{position:"fixed",top:0,left:0,bottom:0,zIndex:100,transform:sideOpen?"translateX(0)":"translateX(-100%)",transition:"transform .25s ease",maxWidth:280}:{})}}>
        <div style={{padding:"14px 12px",borderBottom:`1px solid ${C.bd}`,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <div style={{width:26,height:26,borderRadius:7,background:`linear-gradient(135deg,${C.vi},${C.cy})`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:14}}>⚡</div>
            <div><div style={{fontWeight:700,fontSize:15}}>Colvio</div><div style={{fontSize:11,color:C.txd}}>for Dataverse</div></div>
          </div>
          {bp.mobile&&<button onClick={()=>setSideOpen(false)} style={{background:"none",border:"none",color:C.txm,cursor:"pointer"}}><I.X/></button>}
        </div>
        <div style={{padding:"8px 6px",flex:1,overflow:"auto"}}>
          {tabs.map(t=>(
            <button key={t.id} onClick={()=>{setTab(t.id);setSideOpen(false);}} style={{width:"100%",display:"flex",alignItems:"center",gap:7,padding:"8px 9px",border:"none",borderRadius:6,cursor:"pointer",marginBottom:2,transition:"all .12s",background:tab===t.id?C.sfa:"transparent",color:tab===t.id?C.tx:C.txm}}>
              <span style={{color:tab===t.id?C.cy:C.txd,flexShrink:0}}>{t.icon}</span>
              <div style={{textAlign:"left",minWidth:0}}><div style={{fontSize:14,fontWeight:tab===t.id?600:400}}>{t.label}</div><div style={{fontSize:11,color:C.txd,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t.desc}</div></div>
            </button>
          ))}
          {/* Query history */}
          {queryHistory.length>0&&<div style={{marginTop:12,borderTop:`1px solid ${C.bd}`,paddingTop:8}}>
            <div style={{display:"flex",alignItems:"center",gap:4,padding:"0 8px",marginBottom:4}}><I.Clock/><span style={{fontSize:12,color:C.txd,fontWeight:600}}>History</span></div>
            {queryHistory.slice(0,5).map(h=>(
              <button key={h.id} onClick={()=>{setTab("explorer");}} style={{width:"100%",textAlign:"left",padding:"4px 8px",border:"none",borderRadius:4,cursor:"pointer",background:"transparent",color:C.txd,fontSize:12,...mono,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",marginBottom:1}} title={h.query}>{h.time} — {h.query.substring(0,30)}...</button>
            ))}
          </div>}
        </div>
        {/* Environment + API status */}
        <div style={{padding:"8px 12px",borderTop:`1px solid ${C.bd}`,fontSize:12}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:4}}>
            <div style={{display:"flex",alignItems:"center",gap:4}}><div style={{width:6,height:6,borderRadius:"50%",background:C.gn}}/>
              <span style={{color:C.txm}}>{orgInfo?.isExtension ? "Extension" : "Standalone"}</span>
            </div>
            {orgInfo?.isProduction
              ? <span style={{padding:"3px 10px",borderRadius:4,fontSize:13,fontWeight:700,background:"#991B1B44",color:C.rd,border:`1px solid ${C.rd}55`,letterSpacing:1}}>⚠ PROD</span>
              : <span style={{padding:"3px 10px",borderRadius:4,fontSize:13,fontWeight:700,background:"#065F4644",color:C.gn,border:`1px solid ${C.gn}55`,letterSpacing:1}}>SANDBOX</span>
            }
          </div>
          <div style={{color:C.txd,marginBottom:3,...mono,fontSize:11}}>{orgInfo?.orgName || "demo"}.{orgInfo?.region || "crm4"}.dynamics.com</div>
          <div style={{display:"flex",justifyContent:"space-between",color:C.txd}}>
            <span>API calls</span>
            <span style={{color:C.gn}}>— / 60,000</span>
          </div>
          <button onClick={async()=>{await bridge.clearCache();window.location.reload();}} style={{marginTop:6,width:"100%",padding:"3px 0",background:"transparent",border:`1px dashed ${C.bd}`,borderRadius:3,color:C.txd,cursor:"pointer",fontSize:10}}>🔄 Clear metadata cache</button>
        </div>
      </div>
      {/* Main */}
      <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden",minWidth:0}}>
        <div style={{height:42,borderBottom:`1px solid ${C.bd}`,display:"flex",alignItems:"center",padding:"0 12px",gap:8,flexShrink:0}}>
          {bp.mobile&&<button onClick={()=>setSideOpen(true)} style={{background:"none",border:"none",color:C.txm,cursor:"pointer",padding:4}}><I.Menu/></button>}
          {/* Global search */}
          <div style={{flex:1,maxWidth:400,position:"relative"}}>
            <input placeholder="Search entity, column, record..." style={inp({paddingLeft:30,fontSize:13,padding:"5px 10px 5px 30px",background:C.sfh,border:"none"})}/>
            <span style={{position:"absolute",left:9,top:"50%",transform:"translateY(-50%)",color:C.txd}}><I.Search s={13}/></span>
          </div>
          <div style={{flex:1}}/>
          <span style={{fontSize:12,color:C.txd,...mono}}>Ctrl+Enter = execute</span>
        </div>
        <div style={{flex:1,overflow:"auto"}}>
          {tab==="explorer"&&<Explorer bp={bp} addHistory={addHistory} orgInfo={orgInfo}/>}
          <button onClick={toggleTheme} style={{position:"fixed",bottom:12,right:12,zIndex:50,padding:"6px 12px",background:C.sf,border:`1px solid ${C.bd}`,borderRadius:8,color:C.txm,cursor:"pointer",fontSize:12,boxShadow:"0 2px 8px rgba(0,0,0,.3)",display:"flex",alignItems:"center",gap:4}} title="Toggle theme">{theme==="dark"?"☀️ Light":"🌙 Dark"}</button>
          {tab==="show"&&<ShowAllData bp={bp} orgInfo={orgInfo}/>}
          {tab==="metadata"&&<MetadataBrowser bp={bp} orgInfo={orgInfo}/>}
          {tab==="logins"&&<LoginHistory bp={bp} orgInfo={orgInfo}/>}
          {tab==="loader"&&<Loader bp={bp} orgInfo={orgInfo}/>}
          {tab==="graph"&&<RelationshipGraph bp={bp} orgInfo={orgInfo}/>}
          {tab==="solutions"&&<SolutionExplorer bp={bp} orgInfo={orgInfo}/>}
          {tab==="translations"&&<TranslationManager bp={bp} orgInfo={orgInfo}/>}
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

// ── CONNECTION SCREEN ─────────────────────────────────────────
function ConnScreen({onConnect,connecting,bp}){
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

// ═══════════════════════════════════════════════════════════════
// SHOW ALL DATA — THE KILLER FEATURE
// ═══════════════════════════════════════════════════════════════
function ShowAllData({bp,orgInfo}){
  const isLive = orgInfo?.isExtension;
  const[recordUrl,setRecordUrl]=useState("");
  const[record,setRecord]=useState(null);
  const[fieldSearch,setFieldSearch]=useState("");
  const[showEmpty,setShowEmpty]=useState(false);
  const[showCustomOnly,setShowCustomOnly]=useState(false);
  const[copied,setCopied]=useState("");
  const[loading,setLoading]=useState(false);
  const[error,setError]=useState("");
  const[autoDetected,setAutoDetected]=useState(null); // {entityType, recordId}

  // Auto-detect current record from the D365 tab
  useEffect(()=>{
    if(!isLive) return;
    bridge.getCurrentRecord().then(rec=>{
      if(rec && rec.entityType && rec.recordId){
        setAutoDetected(rec);
      }
    }).catch(()=>{});
  },[isLive]);

  // Load auto-detected record
  const loadDetected=()=>{
    if(!autoDetected) return;
    setRecordUrl(`${autoDetected.entityType}/${autoDetected.recordId}`);
    loadRecordDirect(autoDetected.entityType, autoDetected.recordId);
  };

  // Parse URL or GUID to extract entity/id
  const parseInput=(input)=>{
    const trimmed=input.trim();
    // GUID only → need entity from user or guess
    const guidMatch=trimmed.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    if(guidMatch) return {id:guidMatch[0],entity:null};
    // D365 URL → extract etn and id
    try {
      const url=new URL(trimmed);
      const params=new URLSearchParams(url.search);
      if(params.get("etn")&&params.get("id")) return {entity:params.get("etn"),id:params.get("id").replace(/[{}]/g,"")};
      // UCI hash format
      const hashMatch=url.hash.match(/\/(\w+)\/([0-9a-f-]{36})/i);
      if(hashMatch) return {entity:hashMatch[1],id:hashMatch[2]};
    }catch{}
    // entityname/guid format
    const slashMatch=trimmed.match(/^(\w+)\/([0-9a-f-]{36})$/i);
    if(slashMatch) return {entity:slashMatch[1],id:slashMatch[2]};
    return null;
  };

  // Core: load a record by entity + id
  const loadRecordDirect=async(entity, id)=>{
    setError("");setLoading(true);
    try{
      const [fieldsMeta, entitySet] = await Promise.all([
        bridge.getFields(entity),
        bridge.getEntitySet(entity),
      ]);
      const data=await bridge.query(`${entitySet}(${id})`,{});
      const rec = data?.records?.[0] || data;
      if(!rec || rec.error) throw new Error("Record not found");
      const allFields=(fieldsMeta||[]).map(f=>{
        const odataKey = f.odataName || f.logical;
        const rawVal = rec[odataKey];
        const dispKey = odataKey + "@OData.Community.Display.V1.FormattedValue";
        const displayVal = rec[dispKey];
        // For lookups: get target entity from annotation
        const lookupEntityKey = odataKey + "@Microsoft.Dynamics.CRM.lookuplogicalname";
        const lookupTarget = rec[lookupEntityKey] || null;
        return {
          l:f.logical, d:f.display||f.logical, t:f.type||"String",
          req:!!f.required, cust:!!f.isCustom,
          target: lookupTarget || ((f.type==="Lookup"||f.type==="Customer") ? f.logical.replace(/^_/,"").replace(/_value$/,"") : undefined),
          display: displayVal || null,
          value: displayVal || (rawVal!==undefined ? rawVal : null),
          rawValue: rawVal!==undefined ? rawVal : null,
        };
      }).sort((a,b)=>a.l.localeCompare(b.l));
      const name=rec.name||rec.fullname||rec.subject||rec.title||id;
      setRecord({entity,entityDisplay:entity,id,name,fields:allFields,loadedAt:new Date().toLocaleTimeString()});
    }catch(e){
      if(e.message?.includes("401")||e.message?.includes("SESSION_EXPIRED")){
        setError("Session expired — refresh D365 (F5) then click ⚡ again");
      } else { setError(e.message); }
    }
    finally{setLoading(false);}
  };

  const loadRecord=async()=>{
    if(isLive){
      const parsed=parseInput(recordUrl);
      if(!parsed||!parsed.id){setError("Unrecognized format. Enter a D365 URL or GUID.");return;}
      if(!parsed.entity){setError("Cannot detect entity. Use format: account/GUID or full D365 URL.");return;}
      await loadRecordDirect(parsed.entity, parsed.id);
    } else {
      const allFields=FLDS.map(f=>{const val=ROWS[0][f.l];return{...f,value:val!==undefined?val:null};});
      setRecord({entity:"account",entityDisplay:"Account",id:ROWS[0].accountid,name:ROWS[0].name,fields:allFields,loadedAt:new Date().toLocaleTimeString()});
    }
  };

  const cp=(text,key)=>{copyText(text);setCopied(key);setTimeout(()=>setCopied(""),1200);};

  const filteredFields=useMemo(()=>{
    if(!record)return[];
    return record.fields.filter(f=>{
      if(fieldSearch&&!f.l.toLowerCase().includes(fieldSearch.toLowerCase())&&!f.d.toLowerCase().includes(fieldSearch.toLowerCase()))return false;
      if(!showEmpty&&(f.value===null||f.value===undefined||f.value===""))return false;
      if(showCustomOnly&&!f.cust)return false;
      return true;
    });
  },[record,fieldSearch,showEmpty,showCustomOnly]);

  return(
    <div style={{padding:bp.mobile?12:20,maxWidth:900,margin:"0 auto"}}>
      <h2 style={{fontSize:16,fontWeight:700,marginBottom:4,display:"flex",alignItems:"center",gap:8}}><I.Eye/> Show All Data</h2>
      <p style={{color:C.txm,fontSize:14,marginBottom:12}}>Paste a D365 record URL or enter entity/GUID.</p>

      {/* Auto-detected record from the D365 tab */}
      {autoDetected&&!record&&(
        <div style={{display:"flex",alignItems:"center",gap:10,padding:"10px 14px",background:`linear-gradient(135deg,${C.vi}15,${C.cy}15)`,border:`1px solid ${C.vi}44`,borderRadius:8,marginBottom:12,cursor:"pointer"}} onClick={loadDetected}>
          <div style={{width:32,height:32,borderRadius:"50%",background:`linear-gradient(135deg,${C.vi},${C.cy})`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,flexShrink:0}}>⚡</div>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontSize:14,fontWeight:600,color:C.tx}}>Record detected from D365 tab</div>
            <div style={{fontSize:13,color:C.txd,...mono}}>{autoDetected.entityType} / {autoDetected.recordId.substring(0,20)}…</div>
          </div>
          <button style={{padding:"6px 14px",background:`linear-gradient(135deg,${C.vi},${C.cy})`,border:"none",borderRadius:6,color:"white",fontWeight:600,fontSize:13,cursor:"pointer",flexShrink:0}}>Inspect</button>
        </div>
      )}

      <div style={{display:"flex",gap:8,marginBottom:16,flexDirection:bp.mobile?"column":"row"}}>
        <input value={recordUrl} onChange={e=>setRecordUrl(e.target.value)} placeholder={isLive?"D365 URL or entity/GUID (e.g. account/a1b2c3d4-...)":"Anything (demo mode)"} style={inp({flex:1,...mono,fontSize:14})} onKeyDown={e=>{if(e.key==="Enter")loadRecord();}}/>
        <button onClick={loadRecord} disabled={loading} style={bt(`linear-gradient(135deg,${C.vi},${C.vil})`,{flexShrink:0})}>{loading?<><Spin s={12}/> Loading...</>:<><I.Eye/> Inspect</>}</button>
      </div>

      {error&&<div style={{padding:"8px 12px",background:"#991B1B33",borderRadius:8,color:C.rd,fontSize:13,marginBottom:12,display:"flex",alignItems:"center",gap:6}}>⚠ {error}</div>}

      {record&&(
        <div>
          {/* Record header */}
          <div style={{...crd({padding:14}),marginBottom:12,display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:8}}>
            <div>
              <div style={{display:"flex",alignItems:"center",gap:6}}>
                <span style={{fontSize:18}}>🏢</span>
                <span style={{fontWeight:700,fontSize:16}}>{record.name}</span>
                <span style={{fontSize:12,color:C.txd,background:C.bg,padding:"4px 10px",borderRadius:3,...mono}}>{record.entity}</span>
              </div>
              <div style={{fontSize:13,color:C.txd,...mono,marginTop:4,display:"flex",alignItems:"center",gap:6}}>
                <span>{record.id}</span>
                <button onClick={()=>cp(record.id,"id")} style={{background:"none",border:"none",color:copied==="id"?C.gn:C.txd,cursor:"pointer",padding:0}}>{copied==="id"?"✓":<I.Copy/>}</button>
              </div>
            </div>
            <div style={{display:"flex",gap:4}}>
              <button onClick={()=>{const json=JSON.stringify(Object.fromEntries(record.fields.map(f=>[f.l,f.value])),null,2);copyText(json);cp("","json");}} style={bt(null,{fontSize:12})}>{copied==="json"?"✓ Copied":"Copy JSON"}</button>
            </div>
          </div>

          {/* Filters */}
          <div style={{display:"flex",gap:8,marginBottom:10,alignItems:"center",flexWrap:"wrap"}}>
            <div style={{position:"relative",flex:1,maxWidth:300}}>
              <input value={fieldSearch} onChange={e=>setFieldSearch(e.target.value)} placeholder="Filter columns..." style={inp({paddingLeft:28,fontSize:13,padding:"5px 10px 5px 28px"})}/>
              <span style={{position:"absolute",left:8,top:"50%",transform:"translateY(-50%)",color:C.txd}}><I.Search s={14}/></span>
            </div>
            <label style={{fontSize:13,color:C.txm,cursor:"pointer",display:"flex",alignItems:"center",gap:4}}>
              <input type="checkbox" checked={showEmpty} onChange={e=>setShowEmpty(e.target.checked)} style={{accentColor:C.vi}}/> Empty columns
            </label>
            <label style={{fontSize:13,color:C.txm,cursor:"pointer",display:"flex",alignItems:"center",gap:4}}>
              <input type="checkbox" checked={showCustomOnly} onChange={e=>setShowCustomOnly(e.target.checked)} style={{accentColor:C.vi}}/> Custom only
            </label>
            <span style={{fontSize:12,color:C.txd}}>{filteredFields.length}/{record.fields.length} columns</span>
          </div>

          {/* Fields — card layout (no horizontal scroll) */}
          <div style={{...crd({overflow:"hidden"})}}>
            <div style={{display:"flex",flexDirection:"column"}}>
              {filteredFields.map((f,i)=>{
                const empty=f.value===null||f.value===undefined||f.value==="";
                const isLookup=f.t==="Lookup";
                const isPicklist=f.t==="Picklist"||f.t==="State"||f.t==="Status";
                const fmtVal=empty?"—"
                  :isLookup?null // handled below as clickable link
                  :f.value==="Active"?"● Active"
                  :f.value==="Inactive"?"● Inactive"
                  :typeof f.value==="number"?(f.l.includes("revenue")?`$${f.value.toLocaleString()}`:f.value.toLocaleString())
                  :typeof f.value==="string"&&f.value.match(/^\d{4}-\d{2}-\d{2}T/)?new Date(f.value).toLocaleString("en-US")
                  :String(f.value);
                const valColor=empty?C.txd:isLookup?C.vil:f.value==="Active"?C.gn:f.value==="Inactive"?C.rd:C.tx;
                // Build D365 link for lookups
                const d365Link=(isLookup&&!empty&&f.rawValue&&orgInfo?.orgUrl&&f.target)?`${orgInfo.orgUrl}/main.aspx?etn=${f.target}&id=${f.rawValue}&pagetype=entityrecord`:null;
                return(
                  <div key={f.l} style={{display:"flex",alignItems:"flex-start",gap:8,padding:"7px 12px",borderBottom:`1px solid ${C.bd}`,cursor:"pointer"}}
                    onMouseEnter={e=>e.currentTarget.style.background=C.sfh}
                    onMouseLeave={e=>e.currentTarget.style.background="transparent"}
                    onClick={()=>cp(String(f.value||""),`val-${i}`)}>
                    {/* Left: Logical Name + label + type */}
                    <div style={{width:bp.mobile?140:220,flexShrink:0}}>
                      <div style={{display:"flex",alignItems:"center",gap:4}}>
                        {f.cust&&<span style={{width:6,height:6,borderRadius:"50%",background:C.or,display:"inline-block",flexShrink:0}} title="Custom"/>}
                        <span style={{color:C.cy,...mono,fontSize:13}} title={f.l}>{f.l}</span>
                      </div>
                      <div style={{fontSize:12,color:C.txm,marginTop:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}} title={f.d}>{f.d}</div>
                      <div style={{display:"flex",alignItems:"center",gap:4,marginTop:2}}>
                        <span style={{fontSize:11,padding:"2px 6px",borderRadius:3,background:isLookup?C.vid:isPicklist?C.gnd:C.sfh,color:isLookup?C.lv:isPicklist?C.gn:C.txm}}>{displayType(f.t)}</span>
                        {isLookup&&f.target&&<span style={{fontSize:10,color:C.txd}}>→{f.target}</span>}
                      </div>
                    </div>
                    {/* Right: value (fills space, wraps) */}
                    <div style={{flex:1,minWidth:0,fontSize:14,color:valColor,wordBreak:"break-word",fontStyle:empty?"italic":"normal",...(isLookup||f.l.includes("id")?mono:{})}}>
                      {isLookup&&!empty?(
                        <span style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
                          <span style={{color:C.vil}}>{f.display||f.rawValue}</span>
                          {f.rawValue&&<span style={{fontSize:11,color:C.txd}}>{String(f.rawValue).substring(0,13)}…</span>}
                          {d365Link&&<a href={d365Link} target="_blank" rel="noopener" onClick={e=>e.stopPropagation()} style={{fontSize:11,padding:"2px 8px",borderRadius:3,background:C.vi+"22",color:C.vi,textDecoration:"none",border:`1px solid ${C.vi}44`}}>Open in D365 ↗</a>}
                        </span>
                      ):fmtVal}
                      {copied===`val-${i}`&&<span style={{color:C.gn,fontSize:11,marginLeft:6}}>✓ copied</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// METADATA BROWSER
// ═══════════════════════════════════════════════════════════════
function MetadataBrowser({bp,orgInfo}){
  const isLive = orgInfo?.isExtension;
  const[selEnt,setSelEnt]=useState(null);
  const[search,setSearch]=useState("");
  const[catFilter,setCatFilter]=useState("all");
  const[fieldSearch,setFieldSearch]=useState("");
  const[showPicklist,setShowPicklist]=useState(null);
  const[optionSetData,setOptionSetData]=useState({}); // {fieldName: [{value,label,...}]}
  useEffect(()=>{if(!showPicklist)return;const h=e=>{if(e.key==="Escape")setShowPicklist(null);};window.addEventListener("keydown",h);return()=>window.removeEventListener("keydown",h);},[showPicklist]);
  // Fetch OptionSet values when modal opens
  useEffect(()=>{
    if(!showPicklist||!selEnt||optionSetData[showPicklist]) return;
    const field=fields.find(f=>f.l===showPicklist);
    if(!field) return;
    let cancelled=false;
    bridge.getOptionSet(selEnt.l,field.l,field.t).then(vals=>{
      if(!cancelled) setOptionSetData(prev=>({...prev,[field.l]:vals||[]}));
    }).catch(()=>{
      if(!cancelled) setOptionSetData(prev=>({...prev,[field.l]:[]}));
    });
    return ()=>{cancelled=true;};
  },[showPicklist]);
  const[copied,setCopied]=useState("");
  const[entities,setEntities]=useState(ENTS);
  const[fields,setFields]=useState([]);
  const[loadingFields,setLoadingFields]=useState(false);

  useEffect(()=>{
    if(!isLive)return;
    bridge.getEntities().then(data=>{
      if(data&&Array.isArray(data)){
        setEntities(data.map(e=>({l:e.logical,d:e.display,p:e.entitySet||e.logical+"s",i:e.isCustom?"⚙️":"📋",c:0,cat:e.isCustom?"Custom":"Standard"})).sort((a,b)=>a.d.localeCompare(b.d)));
      }
    }).catch(()=>{});
  },[isLive]);

  const handleSelectEntity=(e)=>{
    setSelEnt(e);setFields([]);setShowPicklist(null);setOptionSetData({});setFieldSearch("");
    if(isLive){
      setLoadingFields(true);
      bridge.getFields(e.l).then(data=>{
        if(data&&Array.isArray(data)){
          setFields(data.map(f=>({l:f.logical,d:f.display||f.logical,t:f.type||"String",req:f.required==="ApplicationRequired"||f.required==="SystemRequired",cust:f.isCustom||false})).sort((a,b)=>a.l.localeCompare(b.l)));
        }
      }).catch(()=>{}).finally(()=>setLoadingFields(false));
    } else {
      setFields(FLDS);
    }
  };

  const cats=[...new Set(entities.map(e=>e.cat))];
  const filtered=entities.filter(e=>{
    if(catFilter!=="all"&&e.cat!==catFilter)return false;
    if(search&&!e.d.toLowerCase().includes(search.toLowerCase())&&!e.l.includes(search.toLowerCase()))return false;
    return true;
  });

  const filteredFields=fields.filter(f=>!fieldSearch||f.l.includes(fieldSearch.toLowerCase())||f.d.toLowerCase().includes(fieldSearch.toLowerCase()));

  const cp=(t,k)=>{copyText(t);setCopied(k);setTimeout(()=>setCopied(""),1000);};

  return(
    <div style={{display:"flex",height:"100%",flexDirection:bp.mobile?"column":"row"}}>
      {/* Entity list */}
      <div style={{width:bp.mobile?"100%":bp.tablet?200:260,borderRight:bp.mobile?"none":`1px solid ${C.bd}`,display:"flex",flexDirection:"column",flexShrink:0,...(bp.mobile&&selEnt?{display:"none"}:{})}}>
        <div style={{padding:"8px 8px 4px"}}>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search entity..." style={inp({fontSize:13,padding:"6px 10px"})}/>
          <div style={{display:"flex",gap:2,marginTop:6,flexWrap:"wrap"}}>
            <button onClick={()=>setCatFilter("all")} style={{padding:"4px 10px",fontSize:11,border:`1px solid ${C.bd}`,borderRadius:3,cursor:"pointer",background:catFilter==="all"?C.vi:"transparent",color:catFilter==="all"?"white":C.txd}}>All</button>
            {cats.map(c=><button key={c} onClick={()=>setCatFilter(c)} style={{padding:"4px 10px",fontSize:11,border:`1px solid ${C.bd}`,borderRadius:3,cursor:"pointer",background:catFilter===c?C.vi:"transparent",color:catFilter===c?"white":C.txd}}>{c}</button>)}
          </div>
        </div>
        <div style={{flex:1,overflow:"auto",padding:"4px 6px"}}>
          {filtered.map(e=>(
            <button key={e.l} onClick={()=>handleSelectEntity(e)} style={{width:"100%",display:"flex",alignItems:"center",gap:6,padding:"6px 8px",border:"none",borderRadius:5,cursor:"pointer",marginBottom:1,background:selEnt?.l===e.l?C.sfa:"transparent",color:selEnt?.l===e.l?C.tx:C.txm}}>
              <span style={{fontSize:15}}>{e.i}</span>
              <div style={{flex:1,textAlign:"left",minWidth:0}}><div style={{fontSize:13,fontWeight:selEnt?.l===e.l?600:400,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{e.d}</div><div style={{fontSize:11,color:C.txd,...mono}}>{e.l}</div></div>
              {e.c>0&&<span style={{fontSize:10,color:C.txd,background:C.bg,padding:"1px 5px",borderRadius:3,...mono}}>{e.c.toLocaleString()}</span>}
            </button>
          ))}
        </div>
      </div>
      {/* Detail */}
      <div style={{flex:1,overflow:"auto",minWidth:0}}>
        {!selEnt?(
          <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100%",color:C.txd,fontSize:15}}><I.Grid/><span style={{marginLeft:8}}>Select an entity</span></div>
        ):(
          <div style={{padding:bp.mobile?12:16}}>
            {bp.mobile&&<button onClick={()=>setSelEnt(null)} style={{background:"none",border:"none",color:C.txm,cursor:"pointer",marginBottom:8,display:"flex",alignItems:"center",gap:4}}><I.Back/> Back</button>}
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}>
              <span style={{fontSize:20}}>{selEnt.i}</span>
              <div>
                <div style={{fontWeight:700,fontSize:16}}>{selEnt.d}</div>
                <div style={{fontSize:13,color:C.txd,...mono,display:"flex",alignItems:"center",gap:4}}>{selEnt.l} <button onClick={()=>cp(selEnt.l,"ent")} style={{background:"none",border:"none",color:copied==="ent"?C.gn:C.txd,cursor:"pointer",padding:0}}>{copied==="ent"?"✓":<I.Copy/>}</button></div>
              </div>
              <span style={{fontSize:12,color:C.txd,background:C.bg,padding:"3px 10px",borderRadius:4}}>{selEnt.cat}</span>
              {loadingFields?<Spin s={12}/>:<span style={{fontSize:13,color:C.txm}}>{fields.length} columns</span>}
            </div>

            {/* Field search */}
            <div style={{marginBottom:10}}><input value={fieldSearch} onChange={e=>setFieldSearch(e.target.value)} placeholder="Filter columns..." style={inp({fontSize:13,maxWidth:300})}/></div>

            {/* Fields */}
            {loadingFields ? (
              <div style={{textAlign:"center",padding:30}}><Spin/><p style={{color:C.txd,fontSize:13,marginTop:8}}>Loading columns...</p></div>
            ) : (
            <div style={{...crd({overflow:"hidden"})}}>
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:14,minWidth:450}}>
                <thead><tr><th style={{...ths(),width:20}}></th><th style={ths()}>Logical Name</th><th style={ths()}>Label</th><th style={ths()}>Type</th><th style={ths()}>Required</th><th style={ths()}>Actions</th></tr></thead>
                <tbody>{filteredFields.map((f,i)=>(
                  <tr key={f.l} style={{borderBottom:`1px solid ${C.bd}`}} onMouseEnter={e=>e.currentTarget.style.background=C.sfh} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                    <td style={{...tds,textAlign:"center"}}>{f.cust&&<span style={{width:5,height:5,borderRadius:"50%",background:C.or,display:"inline-block"}}/>}</td>
                    <td style={tds}><span style={{color:C.cy,...mono,fontSize:13,cursor:"pointer"}} onClick={()=>cp(f.l,`m-${i}`)}>{f.l}</span>{copied===`m-${i}`&&<span style={{color:C.gn,fontSize:11,marginLeft:3}}>✓</span>}</td>
                    <td style={{...tds,color:C.txm}}>{f.d}</td>
                    <td style={tds}><span style={{fontSize:12,padding:"2px 6px",borderRadius:3,background:f.t==="Lookup"?C.vid:(f.t==="Picklist"||f.t==="State"||f.t==="Status")?C.gnd:C.sfh,color:f.t==="Lookup"?C.lv:(f.t==="Picklist"||f.t==="State"||f.t==="Status")?C.gn:C.txm}}>{displayType(f.t)}</span></td>
                    <td style={tds}>{f.req?<span style={{color:C.rd,fontSize:13}}>●</span>:<span style={{color:C.txd}}>—</span>}</td>
                    <td style={tds}>{(f.t==="Picklist"||f.t==="State"||f.t==="Status")&&<button onClick={()=>setShowPicklist(showPicklist===f.l?null:f.l)} style={{...bt(showPicklist===f.l?C.vi:null,{fontSize:12,padding:"3px 10px"})}}>{showPicklist===f.l?"Close":"Values"}{optionSetData[f.l]?` (${optionSetData[f.l].length})`:""}</button>}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
            )}

            {/* OptionSet modal popup */}
            {showPicklist&&(()=>{
              const field=fields.find(f=>f.l===showPicklist);
              if(!field)return null;
              const opts=optionSetData[field.l]||field.opts||[];
              // OptionSet data loaded via useEffect
              return(
                <div style={{position:"fixed",inset:0,zIndex:100,display:"flex",alignItems:"center",justifyContent:"center"}} onClick={()=>setShowPicklist(null)}>
                  {/* Backdrop */}
                  <div style={{position:"absolute",inset:0,background:"rgba(0,0,0,0.6)",backdropFilter:"blur(3px)"}}/>
                  {/* Modal */}
                  <div style={{position:"relative",width:"90%",maxWidth:650,maxHeight:"80vh",background:C.sf,border:`1px solid ${C.bd}`,borderRadius:12,boxShadow:"0 20px 60px rgba(0,0,0,.5)",display:"flex",flexDirection:"column",overflow:"hidden"}} onClick={e=>e.stopPropagation()}>
                    {/* Header */}
                    <div style={{padding:"14px 18px",borderBottom:`1px solid ${C.bd}`,display:"flex",alignItems:"center",justifyContent:"space-between",flexShrink:0,flexWrap:"wrap",gap:6}}>
                      <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                        <span style={{fontWeight:700,fontSize:16}}>{field.d}</span>
                        <span style={{fontSize:13,color:C.txd,...mono}}>{field.l}</span>
                        <span style={{fontSize:12,color:C.gn,padding:"2px 8px",background:C.gnd,borderRadius:4}}>{displayType(field.t)}</span>
                        {opts.length>0&&<span style={{fontSize:12,color:C.txm}}>{opts.length} values</span>}
                      </div>
                      <div style={{display:"flex",gap:6}}>
                        {opts.length>0&&<button onClick={()=>{const csv=opts.map(o=>`${o.value},"${(o.label||"").replace(/"/g,'""')}","${(o.description||"").replace(/"/g,'""')}"`).join("\n");dl("\uFEFF"+"Value,Label,Description\n"+csv,"text/csv;charset=utf-8",`${field.l}_optionset.csv`);cp("","opts");}} style={bt(null,{fontSize:12})}><I.Download/> {copied==="opts"?"✓ Downloaded":"Export CSV"}</button>}
                        <button onClick={()=>setShowPicklist(null)} style={{background:"none",border:"none",color:C.txd,cursor:"pointer",padding:4,fontSize:16}}>✕</button>
                      </div>
                    </div>
                    {/* Body — scrollable */}
                    <div style={{flex:1,overflow:"auto",padding:0}}>
                      {opts.length===0?(
                        <div style={{textAlign:"center",padding:30,color:C.txd,fontSize:14}}><Spin/> Loading values...</div>
                      ):(
                        <table style={{width:"100%",borderCollapse:"collapse",fontSize:14}}>
                          <thead><tr>
                            <th style={{...ths(),width:70,textAlign:"center"}}>Value</th>
                            <th style={ths()}>Label</th>
                            {opts.some(o=>o.description)&&<th style={ths()}>Description</th>}
                            {opts.some(o=>o.color)&&<th style={{...ths(),width:50,textAlign:"center"}}>Color</th>}
                          </tr></thead>
                          <tbody>{opts.map((o,oi)=>(
                            <tr key={o.value} style={{borderBottom:`1px solid ${C.bd}`}} onMouseEnter={e=>e.currentTarget.style.background=C.sfh} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                              <td style={{...tds,textAlign:"center"}}><span style={{color:C.vi,fontWeight:700,...mono,fontSize:15}}>{o.value}</span></td>
                              <td style={{...tds,fontSize:14}}>{o.label}{o.isDefault&&<span style={{fontSize:11,color:C.yw,marginLeft:8,padding:"1px 5px",background:C.yw+"22",borderRadius:3}}>★ default</span>}</td>
                              {opts.some(oo=>oo.description)&&<td style={{...tds,color:C.txm,fontSize:13}}>{o.description||"—"}</td>}
                              {opts.some(oo=>oo.color)&&<td style={{...tds,textAlign:"center"}}>{o.color?<span style={{display:"inline-block",width:16,height:16,borderRadius:4,background:o.color,border:`1px solid ${C.bd}`}}/>:"—"}</td>}
                            </tr>
                          ))}</tbody>
                        </table>
                      )}
                    </div>
                    {/* Footer */}
                    <div style={{padding:"8px 18px",borderTop:`1px solid ${C.bd}`,fontSize:12,color:C.txd,display:"flex",justifyContent:"space-between",flexShrink:0}}>
                      <span>Entity: {selEnt?.d||selEnt?.l}</span>
                      <span>Press Esc or click outside to close</span>
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// FIELD PICKER — Field selector with search, filters, bulk actions
// ═══════════════════════════════════════════════════════════════
function FieldPicker({ fields, selected, onToggle, onBulkAdd, onBulkRemove, onSelectAll, onSelectNone, bp, onClose }) {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [customOnly, setCustomOnly] = useState(false);

  const debouncedSearch = useDebounce(search, 150);
  const types = useMemo(() => [...new Set(fields.map(f => f.t))].sort(), [fields]);

  const filtered = useMemo(() => {
    return fields.filter(f => {
      if (debouncedSearch) {
        const s = debouncedSearch.toLowerCase();
        if (!f.l.toLowerCase().includes(s) && !f.d.toLowerCase().includes(s)) return false;
      }
      if (typeFilter !== "all" && f.t !== typeFilter) return false;
      if (customOnly && !f.cust) return false;
      return true;
    });
  }, [fields, debouncedSearch, typeFilter, customOnly]);

  const selectedSet = new Set(selected);
  const filteredSelected = filtered.filter(f => selectedSet.has(f.l));
  const filteredUnselected = filtered.filter(f => !selectedSet.has(f.l));

  const selectFiltered = () => {
    const toAdd = filtered.filter(f => !selectedSet.has(f.l)).map(f => f.l);
    if (onBulkAdd && toAdd.length > 0) onBulkAdd(toAdd);
    else toAdd.forEach(f => onToggle(f));
  };

  const unselectFiltered = () => {
    const toRemove = filtered.filter(f => selectedSet.has(f.l)).map(f => f.l);
    if (onBulkRemove && toRemove.length > 0) onBulkRemove(toRemove);
    else toRemove.forEach(f => onToggle(f));
  };

  const typeColor = (t) => {
    if (t === "Lookup") return { bg: C.vid, fg: C.lv };
    if (t === "Picklist" || t === "State" || t === "Status") return { bg: C.gnd, fg: C.gn };
    if (t === "Money" || t === "Integer" || t === "Decimal") return { bg: "#92400E33", fg: C.yw };
    if (t === "DateTime") return { bg: "#0E749033", fg: C.cy };
    if (t === "Uniqueidentifier") return { bg: "#5C638033", fg: C.txm };
    return { bg: C.sfh, fg: C.txm };
  };

  return (
    <div style={{
      marginLeft: bp.mobile ? 0 : 50,
      background: C.bg, borderRadius: 8, border: `1px solid ${C.bd}`,
      overflow: "hidden", maxHeight: bp.mobile ? 280 : 350,
      display: "flex", flexDirection: "column",
    }}>
      {/* Header : search + filters */}
      <div style={{ padding: "8px 10px", borderBottom: `1px solid ${C.bd}`, background: C.sf }}>
        <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 6 }}>
          <div style={{ position: "relative", flex: 1 }}>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search column..."
              autoFocus
              style={inp({ fontSize: 13, padding: "5px 10px 5px 28px", background: C.bg })}
            />
            <span style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", color: C.txd }}><I.Search s={14} /></span>
          </div>
          <span style={{ fontSize: 13, color: C.txm, whiteSpace: "nowrap" }}>
            {selected.length}<span style={{ color: C.txd }}>/{fields.length}</span>
          </span>
        </div>
        <div style={{ display: "flex", gap: 3, alignItems: "center", flexWrap: "wrap" }}>
          {/* Type filter */}
          <select
            value={typeFilter}
            onChange={e => setTypeFilter(e.target.value)}
            style={inp({ width: "auto", fontSize: 12, padding: "2px 6px", background: C.sfh, border: "none" })}
          >
            <option value="all">All types</option>
            {types.map(t => (
              <option key={t} value={t}>{t} ({fields.filter(f => f.t === t).length})</option>
            ))}
          </select>

          {/* Custom toggle */}
          <label style={{ fontSize: 12, color: customOnly ? C.or : C.txd, cursor: "pointer", display: "flex", alignItems: "center", gap: 2 }}>
            <input type="checkbox" checked={customOnly} onChange={e => setCustomOnly(e.target.checked)} style={{ accentColor: C.or, width: 12, height: 12 }} />
            Custom
          </label>

          <div style={{ flex: 1 }} />

          {/* Bulk actions */}
          <button onClick={selectFiltered} style={{ padding: "2px 6px", background: "transparent", border: `1px solid ${C.bd}`, borderRadius: 3, color: C.gn, cursor: "pointer", fontSize: 12 }}>
            + Select {filtered.length > 20 ? "visible" : "all"} ({filtered.length})
          </button>
          <button onClick={unselectFiltered} style={{ padding: "2px 6px", background: "transparent", border: `1px solid ${C.bd}`, borderRadius: 3, color: C.rd, cursor: "pointer", fontSize: 12 }}>
            − Deselect visible
          </button>
        </div>
      </div>

      {/* Field list */}
      <div style={{ flex: 1, overflow: "auto", padding: "4px 6px" }}>
        {/* Selected first */}
        {filteredSelected.length > 0 && (
          <div style={{ marginBottom: 4 }}>
            <div style={{ fontSize: 12, color: C.gn, fontWeight: 600, padding: "4px 4px 2px", textTransform: "uppercase", letterSpacing: ".5px" }}>
              Selected ({filteredSelected.length})
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
              {filteredSelected.map(f => {
                const tc = typeColor(f.t);
                return (
                  <button
                    key={f.l}
                    onClick={() => onToggle(f.l)}
                    style={{
                      display: "flex", alignItems: "center", gap: 4,
                      padding: "4px 10px", background: C.vid, border: `1px solid ${C.vi}`,
                      borderRadius: 4, cursor: "pointer", color: C.lv, fontSize: 13,
                      transition: "all .1s",
                    }}
                    title={`${f.d} (${displayType(f.t)})${f.cust ? " — Custom" : ""}\nClick to remove`}
                  >
                    {f.cust && <span style={{ width: 6, height: 6, borderRadius: "50%", background: C.or, flexShrink: 0 }} />}
                    <span style={{ ...mono, fontSize: 13 }}>{f.l}</span>
                    <span style={{ ...tc, fontSize: 13, padding: "0 3px", borderRadius: 2, background: tc.bg, color: tc.fg }}>{displayType(f.t)}</span>
                    <span style={{ color: C.txd, fontSize: 13, lineHeight: 1 }}>✕</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Available */}
        {filteredUnselected.length > 0 && (
          <div>
            <div style={{ fontSize: 12, color: C.txd, fontWeight: 600, padding: "4px 4px 2px", textTransform: "uppercase", letterSpacing: ".5px" }}>
              Available ({filteredUnselected.length})
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
              {filteredUnselected.map(f => {
                const tc = typeColor(f.t);
                return (
                  <button
                    key={f.l}
                    onClick={() => onToggle(f.l)}
                    style={{
                      display: "flex", alignItems: "center", gap: 4,
                      padding: "4px 10px", background: C.sfh, border: `1px solid ${C.bd}`,
                      borderRadius: 4, cursor: "pointer", color: C.txm, fontSize: 13,
                      transition: "all .1s",
                    }}
                    title={`${f.d} (${displayType(f.t)})${f.cust ? " — Custom" : ""}\nClick to add`}
                  >
                    {f.cust && <span style={{ width: 6, height: 6, borderRadius: "50%", background: C.or, flexShrink: 0 }} />}
                    <span style={{ ...mono, fontSize: 13 }}>{f.l}</span>
                    <span style={{ fontSize: 13, padding: "0 3px", borderRadius: 2, background: tc.bg, color: tc.fg }}>{displayType(f.t)}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {filtered.length === 0 && (
          <div style={{ textAlign: "center", padding: 16, color: C.txd, fontSize: 13 }}>
            No columns match "{search}"
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// DATA EXPLORER (with paste-from-clipboard + keyboard shortcuts)
// ═══════════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════
// EXPAND CARD — wraps FieldPicker for expanded entity fields
// Same UX as main SELECT: search, type filter, custom, bulk
// ═══════════════════════════════════════════════════════════════
function ExpandCard({ex, onToggle, onRemove, bp}){
  const[open,setOpen]=useState(true);
  return (
    <div style={{background:C.bg,border:`1px solid ${C.or}44`,borderRadius:6,marginBottom:4,overflow:"hidden"}}>
      {/* Header — always visible */}
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
      {/* FieldPicker — collapsible, reuses exact same component as SELECT */}
      {open && (
        <FieldPicker
          fields={ex.allFields}
          selected={ex.fields}
          onToggle={(f) => onToggle(ex.navProperty, f)}
          onSelectAll={() => { /* select all visible — handled inside FieldPicker */ }}
          onSelectNone={() => { /* deselect all — handled inside FieldPicker */ }}
          bp={bp}
          onClose={()=>setOpen(false)}
        />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// DATA EXPLORER
// ═══════════════════════════════════════════════════════════════
function Explorer({bp,addHistory,orgInfo}){
  const isLive = orgInfo?.isExtension;
  const[ent,setEnt]=useState(null);
  const[es,setEs]=useState("");
  const[sf,setSf]=useState([]);
  const[filterGroups,setFilterGroups]=useState([{logic:"and",conditions:[{field:"",op:"eq",value:""}]}]);
  const[groupLogic,setGroupLogic]=useState("and");
  const[res,setRes]=useState(null);
  const[picker,setPicker]=useState(false);
  const[queryCollapsed,setQueryCollapsed]=useState(false); // Collapse query builder to save space
  const[qm,setQm]=useState("builder");
  const[rq,setRq]=useState("");
  const[fxml,setFxml]=useState("");
  const[lim,setLim]=useState(50);
  const[showList,setShowList]=useState(true);
  const[savedQueries,setSavedQueries]=useState([]);
  const[queryHistory,setQueryHistory]=useState([]);
  const[showHistory,setShowHistory]=useState(false);
  const[showSaved,setShowSaved]=useState(false);

  // Load query history from chrome.storage
  useEffect(()=>{
    if(typeof chrome!=="undefined"&&chrome.storage?.local){
      chrome.storage.local.get(["d365_query_history"],r=>{
        if(r.d365_query_history) setQueryHistory(r.d365_query_history);
      });
    }
  },[]);
  const addToHistory=(entity,query,mode,fieldCount)=>{
    const entry={entity:entity?.l||"?",query:query?.substring(0,200),mode,fields:fieldCount,ts:Date.now()};
    setQueryHistory(prev=>{
      const updated=[entry,...prev.filter(h=>h.query!==entry.query)].slice(0,20);
      if(typeof chrome!=="undefined"&&chrome.storage?.local) chrome.storage.local.set({d365_query_history:updated});
      return updated;
    });
  };
  // Load saved queries from chrome.storage
  useEffect(()=>{
    if(typeof chrome!=="undefined"&&chrome.storage?.local){
      chrome.storage.local.get(["d365_saved_queries"],r=>{
        if(r.d365_saved_queries) setSavedQueries(r.d365_saved_queries);
      });
    }
  },[]);

  const saveCurrentQuery=()=>{
    if(!ent) return;
    const name=prompt("Query name:");
    if(!name) return;
    const q={name,entity:ent.l,entitySet:ent.p,fields:sf,filterGroups,groupLogic,expands:expands.map(ex=>({navProperty:ex.navProperty,targetEntity:ex.targetEntity,lookupField:ex.lookupField,fields:ex.fields})),limit:lim,qm,fxml,savedAt:new Date().toISOString()};
    const updated=[q,...savedQueries.filter(s=>s.name!==name)].slice(0,20);
    setSavedQueries(updated);
    if(typeof chrome!=="undefined"&&chrome.storage?.local) chrome.storage.local.set({d365_saved_queries:updated});
  };

  const loadSavedQuery=(q)=>{
    const match=entities.find(e=>e.l===q.entity);
    if(match){
      selEnt(match);
      setTimeout(()=>{
        setSf(q.fields||[]);
        setFilterGroups(q.filterGroups||[{logic:"and",conditions:[{field:"",op:"eq",value:""}]}]);
        setGroupLogic(q.groupLogic||"and");
        setLim(q.limit||50);
        if(q.qm){setQm(q.qm);}
        if(q.fxml){setFxml(q.fxml);}
      },500);
    }
    setShowSaved(false);
  };

  const deleteSavedQuery=(name)=>{
    const updated=savedQueries.filter(s=>s.name!==name);
    setSavedQueries(updated);
    if(typeof chrome!=="undefined"&&chrome.storage?.local) chrome.storage.local.set({d365_saved_queries:updated});
  };
  const[entities,setEntities]=useState(ENTS);
  const[fields,setFields]=useState(FLDS);
  const[loading,setLoading]=useState(false);
  const[loadingFields,setLoadingFields]=useState(false);
  const[error,setError]=useState("");

  // ── EXPAND state ──
  const[lookups,setLookups]=useState([]);        // Available nav properties [{lookupField, navProperty, targetEntity}]
  const[expands,setExpands]=useState([]);         // Active expansions [{navProperty, targetEntity, fields:[], allFields:[]}]
  const[showExpandPicker,setShowExpandPicker]=useState(false);
  const[expandSearch,setExpandSearch]=useState("");
  const[childRelsLoaded,setChildRelsLoaded]=useState(false);
  const debouncedExpandSearch = useDebounce(expandSearch, 150);
  const[loadingExpand,setLoadingExpand]=useState("");

  // Load real entities from D365
  useEffect(()=>{
    if(!isLive) return;
    setLoading(true);
    bridge.getEntities().then(data=>{
      if(data && Array.isArray(data)){
        const mapped = data.map(e=>({
          l:e.logical, d:e.display, p:e.entitySet||e.logical+"s",
          i:e.isCustom?"⚙️":"📋", c:0, cat:e.isCustom?"Custom":"Standard"
        })).sort((a,b)=>a.d.localeCompare(b.d));
        setEntities(mapped);
      }
    }).catch(e=>setError(e.message)).finally(()=>setLoading(false));
  },[isLive]);

  // Auto-detect current entity from D365 tab
  useEffect(()=>{
    if(!isLive || entities.length < 2) return;
    bridge.getCurrentRecord().then(rec=>{
      if(rec?.entityType && !ent){
        const match=entities.find(e=>e.l===rec.entityType);
        if(match) selEnt(match);
      }
    }).catch(()=>{});
  },[isLive, entities.length]);

  // Load real fields when entity selected
  const selEnt=(e)=>{
    fetchAbort.current = true; // Cancel any ongoing background fetch
    setEnt(e);setRes(null);setPicker(false);setError("");
    setFilterGroups([{logic:"and",conditions:[{field:"",op:"eq",value:""}]}]);
    setExpands([]);setLookups([]);setShowExpandPicker(false);setChildRelsLoaded(false);
    if(bp.mobile)setShowList(false);
    if(isLive){
      setLoadingFields(true);setSf([]);setFields([]);
      // Load fields + parent lookups in parallel (children loaded lazily when expand picker opens)
      Promise.all([
        bridge.getFields(e.l),
        bridge.getLookups(e.l),
      ]).then(([fieldsData, lookupsData]) => {
        const childRelsData = null; // Loaded on-demand
        // Fields
        if(fieldsData && Array.isArray(fieldsData) && fieldsData.length > 0){
          const mapped=fieldsData.map(f=>({
            l:f.logical, odata:f.odataName||f.logical, d:f.display||f.logical,
            t:f.type||"String", req:!!f.required, cust:!!f.isCustom
          })).sort((a,b)=>a.l.localeCompare(b.l));
          setFields(mapped);
          const common=mapped.filter(f=>["name","fullname","emailaddress1","telephone1","statecode","subject","title"].includes(f.l)).map(f=>f.l);
          setSf(common.length>0?common.slice(0,5):mapped.slice(0,5).map(f=>f.l));
        } else {
          setError(`No fields returned for ${e.l}`);
        }
        // Combine ManyToOne + OneToMany lookups, deduplicate by navProperty
        const allRels = [
          ...((lookupsData || []).map(l => ({ ...l, type: l.type || "single" }))),
          ...((childRelsData || []).map(l => ({ ...l, type: "collection" }))),
        ];
        const seen=new Set();
        const unique=allRels.filter(l=>{if(!l.navProperty||seen.has(l.navProperty))return false;seen.add(l.navProperty);return true;});
        setLookups(unique);
      }).catch(err=>setError(`${e.l}: ${err.message}`)).finally(()=>setLoadingFields(false));

      // Also fetch entity record count (separate call, fire-and-forget)
      bridge.getEntityCount(e.p).then(c=>{
        if(c>=0) setEnt(prev=>prev?.l===e.l?{...prev,c}:prev);
      }).catch(()=>{});
    } else {
      setFields(FLDS);
      setSf(["name","accountnumber","emailaddress1","address1_city","statecode"]);
    }
  };

  // ── EXPAND: add a lookup expansion ──
  const addExpand = async (lookup) => {
    if (expands.find(x => x.navProperty === lookup.navProperty)) return;
    setLoadingExpand(lookup.navProperty);
    try {
      const targetFields = isLive ? await bridge.getFields(lookup.targetEntity) : FLDS;
      // Map to same format as main FieldPicker: {l, d, t, cust, odata}
      const mapped = (targetFields || [])
        .map(f => ({
          l: f.logical || f.l,
          d: f.display || f.d || f.logical || f.l,
          t: f.type || f.t || "String",
          cust: !!(f.isCustom || f.cust),
          odata: f.odataName || f.logical || f.l,
        }))
        .sort((a, b) => a.l.localeCompare(b.l));
      // Auto-select: try common "name" fields across entity types
      const commonNames = ["name","fullname","title","subject","accountnumber","emailaddress1","internalemailaddress","telephone1","new_sapid","new_externalid"];
      const auto = mapped.filter(f => commonNames.includes(f.l)).map(f => f.l);
      setExpands(prev => [...prev, {
        navProperty: lookup.navProperty,
        targetEntity: lookup.targetEntity,
        lookupField: lookup.lookupField,
        type: lookup.type || "single",
        allFields: mapped,
        fields: auto.length > 0 ? auto.slice(0, 5) : mapped.slice(0, 5).map(f => f.l),
      }]);
    } catch (e) {
      setError(`Expand ${lookup.targetEntity}: ${e.message}`);
    }
    setLoadingExpand("");
  };

  const removeExpand = (navProperty) => {
    setExpands(prev => prev.filter(x => x.navProperty !== navProperty));
  };

  const toggleExpandField = (navProperty, fieldName) => {
    setExpands(prev => prev.map(ex => {
      if (ex.navProperty !== navProperty) return ex;
      const has = ex.fields.includes(fieldName);
      return { ...ex, fields: has ? ex.fields.filter(f => f !== fieldName) : [...ex.fields, fieldName] };
    }));
  };

  const debouncedEs = useDebounce(es, 150);
  const filtered=entities.filter(e=>e.d.toLowerCase().includes(debouncedEs.toLowerCase())||e.l.includes(debouncedEs.toLowerCase()));

  const oq=()=>{
    if(!ent)return"";
    let q=`GET /api/data/v9.2/${ent.p}`;
    const ps=[];
    if(sf.length)ps.push(`$select=${sf.map(f=>getOdataName(f)).join(",")}`);
    const exClauses=expands.filter(ex=>ex.fields.length>0).map(ex=>`${ex.navProperty}($select=${ex.fields.join(",")})`);
    if(exClauses.length)ps.push(`$expand=${exClauses.join(",")}`);
    const gf=buildGroupFilter();
    if(gf) ps.push(`$filter=${gf}`);
    if(lim>0)ps.push(`$top=${lim}`);
    return ps.length?q+"?"+ps.join("&"):q;
  };

  // Helper: get OData name for a field (Lookups need _xxx_value format)
  const getOdataName = (logicalName) => {
    const f = fields.find(x => x.l === logicalName);
    return f?.odata || logicalName;
  };

  // Helper: get field type
  const getFieldType = (logicalName) => {
    const f = fields.find(x => x.l === logicalName);
    return f?.t || "String";
  };

  // Helper: build OData $filter expression with correct quoting per type
  const buildFilter = (fieldName, op, val) => {
    if (!fieldName) return "";
    // Null checks don't need a value
    if (op === "is_null") return `${getOdataName(fieldName)} eq null`;
    if (op === "is_not_null") return `${getOdataName(fieldName)} ne null`;
    if (!val) return "";
    const odataField = getOdataName(fieldName);
    const fType = getFieldType(fieldName);
    const escaped = val.replace(/'/g, "''");
    const isStringType = fType === "String" || fType === "Memo";

    // Function-style operators for String/Memo
    if (op === "contains" || op === "startswith" || op === "endswith") {
      if (!isStringType) { op = "eq"; }
      else return `${op}(${odataField},'${escaped}')`;
    }
    if (op === "not_contains" || op === "not_startswith" || op === "not_endswith") {
      if (!isStringType) { op = "ne"; }
      else { const fn = op.replace("not_",""); return `not ${fn}(${odataField},'${escaped}')`; }
    }
    // Types that need NO quotes
    const noQuoteTypes = new Set(["Integer","Picklist","State","Status","Boolean","Money","Decimal","Double","BigInt"]);
    if (noQuoteTypes.has(fType)) return `${odataField} ${op} ${val}`;

    // Lookup GUIDs: no quotes
    if (fType === "Lookup" || fType === "Customer") return `${odataField} ${op} ${val}`;

    // Everything else (String, Memo, DateTime, etc.): single quotes
    return `${odataField} ${op} '${escaped}'`;
  };

  // Build $filter string from filter groups with parentheses
  const buildGroupFilter = () => {
    const groupParts = filterGroups.map(g => {
      const active = g.conditions.filter(c => c.field && (c.value || c.op === "is_null" || c.op === "is_not_null"));
      if (!active.length) return "";
      const parts = active.map(c => buildFilter(c.field, c.op, c.value));
      if (parts.length === 1) return parts[0];
      return `(${parts.join(` ${g.logic} `)})`;
    }).filter(Boolean);
    if (!groupParts.length) return "";
    return groupParts.join(` ${groupLogic} `);
  };

  // Cancel ref for stopping ongoing fetch-all
  const fetchAbort = useRef(false);

  // Helper: clean a raw D365 record
  const cleanRecord = (r) => {
    const clean = {};
    for (const [k, v] of Object.entries(r)) {
      if (k.startsWith("@odata") || k === "@odata.etag") continue;
      const fvMatch = k.match(/^(.+)@OData\.Community\.Display\.V1\.FormattedValue$/);
      if (fvMatch) { clean[fvMatch[1] + "__display"] = v; continue; }
      // Extract lookup target entity (zero cost — already in response)
      const lkMatch = k.match(/^(.+)@Microsoft\.Dynamics\.CRM\.lookuplogicalname$/);
      if (lkMatch) { clean[lkMatch[1] + "__entity"] = v; continue; }
      if (k.includes("@")) continue;
      const matchingExpand = expands.find(ex => ex.navProperty === k);
      if (matchingExpand && v && typeof v === "object") {
        if (Array.isArray(v)) {
          // OneToMany (collection): flatten array values as comma-separated
          for (const f of matchingExpand.fields) {
            const vals = v.map(item => {
              const fv = item[f + "@OData.Community.Display.V1.FormattedValue"] || item[f];
              return fv != null ? String(fv) : "";
            }).filter(Boolean);
            clean[`${matchingExpand.targetEntity}.${f}`] = vals.join(", ");
          }
          clean[`${matchingExpand.targetEntity}.__count`] = v.length;
        } else {
          // ManyToOne (single object): existing behavior
          for (const [ek, ev] of Object.entries(v)) {
            if (ek.startsWith("@") || ek.includes("@")) continue;
            clean[`${matchingExpand.targetEntity}.${ek}`] = ev;
          }
        }
      } else { clean[k] = v; }
    }
    return clean;
  };

  const run=async()=>{
    setError("");
    fetchAbort.current = false;
    const validFieldNames = new Set(fields.map(f => f.l));
    const validSf = sf.filter(f => validFieldNames.has(f));
    // Filters are built via buildGroupFilter which validates internally
    if(isLive && loadingFields){ setError("Wait for fields to load..."); return; }

    // Skip $select when ALL fields are selected — D365 returns all by default (faster, shorter URL)
    const allSelected = validSf.length >= fields.length;
    const odataSelect = allSelected ? [] : validSf.map(f => getOdataName(f));
    const expandClauses = expands.filter(ex => ex.fields.length > 0).map(ex => {
      const exFields = ex.allFields.filter(f => ex.fields.includes(f.l));
      const exSelect = exFields.map(f => f.odata || f.l).join(",");
      return exSelect ? `${ex.navProperty}($select=${exSelect})` : ex.navProperty;
    });
    const buildQ=()=>{
      if(!ent)return"";
      let q=`GET /api/data/v9.2/${ent.p}`;const ps=[];
      if(odataSelect.length)ps.push(`$select=${odataSelect.join(",")}`);
      if(expandClauses.length)ps.push(`$expand=${expandClauses.join(",")}`);
      const gf2=buildGroupFilter();
      if(gf2) ps.push(`$filter=${gf2}`);
      if(lim>0)ps.push(`$top=${lim}`);
      return ps.length?q+"?"+ps.join("&"):q;
    };
    const q=qm==="odata"?rq:qm==="fetchxml"?fxml:buildQ();
    addHistory(q);

    if(!isLive){
      setRes({entity:ent,fields:sf.length?sf:FLDS.map(f=>f.l),data:ROWS,count:ROWS.length,total:ROWS.length,query:q,elapsed:"mock",nextLink:null,fetching:false});
      return;
    }

    // ── FetchXML mode ──
    if(qm==="fetchxml"){
      if(!fxml.trim()){setError("FetchXML is empty");return;}
      setLoading(true);
      const t0=Date.now();
      try{
        const data=await bridge.executeFetchXml(fxml);
        const t1=((Date.now()-t0)/1000).toFixed(1);
        if(!data?.records){setError("No results");setLoading(false);return;}
        // FetchXML returns flat records with aliases
        const firstRec=data.records[0]||{};
        const headerFields=Object.keys(firstRec).filter(k=>!k.startsWith("@")&&!k.includes("@")&&k!=="__error");
        const odataFieldMap={};
        headerFields.forEach(f=>{odataFieldMap[f]=f;});
        let allRecords=[...data.records];

        setRes({entity:ent,fields:headerFields,odataFieldMap,data:allRecords,count:allRecords.length,total:allRecords.length,query:q,elapsed:`${t1}s`,nextLink:null,fetching:!!data.moreRecords});
        setLoading(false);

        // FetchXML pagination via paging cookie
        let page=1;
        let cookie=data.pagingCookie;
        while(cookie&&!fetchAbort.current){
          page++;
          // Inject paging cookie + page number into FetchXML
          let pagedXml=fxml.replace(/<fetch/,`<fetch page="${page}" paging-cookie="${cookie.replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}"`);
          if(!pagedXml.includes(`page="`))pagedXml=fxml.replace(/<fetch/,`<fetch page="${page}"`);
          try{
            const pageData=await bridge.executeFetchXml(pagedXml);
            if(!pageData?.records?.length)break;
            allRecords=[...allRecords,...pageData.records];
            cookie=pageData.pagingCookie;
            setRes(prev=>({...prev,data:allRecords,count:allRecords.length,total:allRecords.length,fetching:!!cookie,elapsed:`${((Date.now()-t0)/1000).toFixed(1)}s`}));
          }catch(e){
            setError(`Page ${page}: ${e.message}`);break;
          }
        }
        setRes(prev=>({...prev,fetching:false,elapsed:`${((Date.now()-t0)/1000).toFixed(1)}s`}));
      }catch(e){
        setError(e.message);setLoading(false);
      }
      return;
    }

    // ── Fetch ALL pages automatically ──
    setLoading(true);
    const t0 = Date.now();
    try {
      const opts={};
      if(odataSelect.length)opts.select=odataSelect.join(",");
      if(expandClauses.length)opts.expand=expandClauses.join(",");
      const gf3=buildGroupFilter();
      if(gf3) opts.filter=gf3;
      if(lim>0)opts.top=String(lim);
      const data=await bridge.query(ent.p,opts);
      if(!data?.records) return;
      const t1 = ((Date.now()-t0)/1000).toFixed(1);

      const firstClean = data.records.map(cleanRecord);
      const headerFields = [...(validSf.length > 0 && !allSelected ? validSf : (firstClean[0] ? Object.keys(firstClean[0]).filter(k=>!k.endsWith("__display")&&!k.endsWith("__entity")&&!k.includes(".")) : validSf))];
      for (const ex of expands) { for (const f of ex.fields) { headerFields.push(`${ex.targetEntity}.${f}`); } }
      const odataFieldMap = {};
      headerFields.forEach(f => { odataFieldMap[f] = f.includes(".") ? f : getOdataName(f); });

      let allRecords = [...firstClean];
      let nextLink = data.nextLink || null;
      setRes({entity:ent, fields:headerFields, odataFieldMap, data:allRecords, count:allRecords.length, total:allRecords.length, query:q, elapsed:`${t1}s`, nextLink, fetching:!!nextLink});
      addToHistory(ent,q,qm,headerFields.length);
      setLoading(false);

      // Background fetch remaining pages (sequential — OData nextLinks are chained cursors)
      let pageNum = 1;
      const hasExpand = expandClauses.length > 0;
      while (nextLink && !fetchAbort.current) {
        pageNum++;
        try {
          const pageData = await bridge.query(nextLink, {});
          if (!pageData?.records?.length) break;
          const pageClean = pageData.records.map(cleanRecord);
          allRecords = [...allRecords, ...pageClean];
          nextLink = pageData.nextLink || null;
          setRes(prev => ({...prev, data: allRecords, count: allRecords.length, total: allRecords.length, nextLink, fetching: !!nextLink, elapsed:`${((Date.now()-t0)/1000).toFixed(1)}s`}));
        } catch (pageErr) {
          if (pageErr.message?.includes("401") || pageErr.message?.includes("SESSION_EXPIRED")) {
            setError("Session expired — refresh D365 (F5) then click ⚡ again");
          } else { setError(`Page ${pageNum}: ${pageErr.message}`); }
          setRes(prev => ({...prev, nextLink: null, fetching: false}));
          break;
        }
      }
      // Warn if expand may have limited results
      if (hasExpand && ent.c && allRecords.length < ent.c * 0.9) {
        setError(`⚠ ${allRecords.length} records retrieved out of ${ent.c} — D365 limits results with $expand. Remove expand to get all records, then enrich in a second query.`);
      }
      setRes(prev => ({...prev, fetching: false, nextLink: null, elapsed:`${((Date.now()-t0)/1000).toFixed(1)}s`}));
    } catch(e) {
      if(e.message?.includes("401") || e.message?.includes("SESSION_EXPIRED")) {
        setError("Session expired — refresh D365 (F5) then click ⚡ again");
      } else { setError(e.message); }
      setLoading(false);
    }
  };

  const [entityCounts, setEntityCounts] = useState({});
  useEffect(() => {
    if (!isLive || entities.length === 0) return;
    let cancelled = false;
    const loadCounts = async () => {
      for (const e of entities.slice(0, 50)) {
        if (cancelled || entityCounts[e.l] !== undefined) continue;
        try {
          const c = await bridge.getEntityCount(e.p);
          if (!cancelled && c >= 0) setEntityCounts(prev => ({...prev, [e.l]: c}));
        } catch {}
      }
    };
    loadCounts();
    return () => { cancelled = true; };
  }, [entities.length, isLive]);

  const stopFetch = () => { fetchAbort.current = true; };

  useKeyboard("Enter",()=>{if(ent&&!loading&&!loadingFields)run();},[ent,sf,filterGroups,groupLogic,lim,qm,rq,fxml,loading,loadingFields]);

  return(
    <div style={{display:"flex",height:"100%",flexDirection:bp.mobile?"column":"row"}}>
      {(bp.mobile?showList:true)&&(
        <div style={{width:bp.mobile?"100%":bp.tablet?200:240,borderRight:bp.mobile?"none":`1px solid ${C.bd}`,display:"flex",flexDirection:"column",flexShrink:0,...(bp.mobile?{maxHeight:"50vh"}:{})}}>
          <div style={{padding:"8px 8px 4px"}}>
            <input value={es} onChange={e=>setEs(e.target.value)} placeholder="Search..." style={inp({fontSize:13,padding:"6px 10px"})}/>
            {isLive&&<div style={{fontSize:11,color:C.gn,padding:"4px 4px 0"}}>{entities.length} entities loaded</div>}
          </div>
          <div style={{flex:1,overflow:"auto",padding:"0 6px 6px"}}>
            {loading&&!ent ? <div style={{textAlign:"center",padding:20}}><Spin/><p style={{color:C.txd,fontSize:13,marginTop:8}}>Loading entities...</p></div>
            : filtered.map(e=>(
            <button key={e.l} onClick={()=>selEnt(e)} style={{width:"100%",display:"flex",alignItems:"center",gap:7,padding:"6px 8px",border:"none",borderRadius:5,cursor:"pointer",marginBottom:1,background:ent?.l===e.l?C.sfa:"transparent",color:ent?.l===e.l?C.tx:C.txm}}>
              <span style={{fontSize:15}}>{e.i}</span><div style={{flex:1,textAlign:"left",minWidth:0}}><div style={{fontSize:13,fontWeight:ent?.l===e.l?600:400,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{e.d}</div><div style={{fontSize:11,color:C.txd,...mono}}>{e.l}</div></div>{(e.c>0||entityCounts[e.l]>0)&&<span style={{fontSize:10,color:C.txd,background:C.bg,padding:"1px 5px",borderRadius:3,...mono}}>{(e.c||entityCounts[e.l]||0).toLocaleString()}</span>}
            </button>
          ))}</div>
        </div>
      )}
      <div style={{flex:1,overflow:"auto",minWidth:0}}>
        {error&&<div style={{padding:"8px 12px",background:"#991B1B33",borderBottom:`1px solid ${C.rd}33`,color:C.rd,fontSize:13,display:"flex",alignItems:"center",gap:6,position:"sticky",top:0,zIndex:3}}>⚠ {error}<button onClick={()=>setError("")} style={{background:"none",border:"none",color:C.rd,cursor:"pointer",marginLeft:"auto"}}><I.X/></button></div>}
        {!ent&&!bp.mobile?<div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",color:C.txd}}><I.Database/><span style={{marginLeft:8}}>Select an entity</span></div>
        :ent?<>
          <div style={{borderBottom:`1px solid ${C.bd}`,padding:bp.mobile?10:12,background:C.sf}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8,flexWrap:"wrap",gap:6}}>
              <div style={{display:"flex",alignItems:"center",gap:6}}>
                {bp.mobile&&<button onClick={()=>{setEnt(null);setShowList(true);setRes(null);}} style={{background:"none",border:"none",color:C.txm,cursor:"pointer",padding:2}}><I.Back/></button>}
                <span style={{fontSize:15}}>{ent.i}</span><span style={{fontWeight:600,fontSize:14}}>{ent.d}</span>
                {!bp.mobile&&<span style={{fontSize:12,color:C.txd,background:C.bg,padding:"4px 10px",borderRadius:3,...mono}}>{ent.l}</span>}
                {loadingFields&&<Spin s={12}/>}
                {!loadingFields&&fields.length>0&&<span style={{fontSize:12,color:C.txd}}>{fields.length} columns</span>}
                {ent.c>0&&<span style={{fontSize:12,color:C.txd,background:C.bg,padding:"2px 6px",borderRadius:3}}>{ent.c.toLocaleString()} records</span>}
              </div>
              <div style={{display:"flex",gap:3}}>{["builder","odata","fetchxml"].map(m=><button key={m} onClick={()=>setQm(m)} style={{padding:"4px 10px",fontSize:12,border:`1px solid ${C.bd}`,borderRadius:4,cursor:"pointer",background:qm===m?C.vi:"transparent",color:qm===m?"white":C.txm}}>{m==="builder"?"Builder":m==="odata"?"OData":"FetchXML"}</button>)}</div>
            </div>
            {qm==="fetchxml"?<div>
              <textarea value={fxml} onChange={e=>setFxml(e.target.value)} placeholder={`<fetch top="50">\n  <entity name="${ent.l}">\n    <attribute name="name"/>\n    <link-entity name="opportunity" from="customerid" to="${ent.l}id" link-type="inner">\n      <attribute name="name" alias="opp_name"/>\n    </link-entity>\n  </entity>\n</fetch>`} style={inp({height:120,...mono,color:C.cy,resize:"vertical",fontSize:13,whiteSpace:"pre"})}/>
              <div style={{display:"flex",gap:4,marginTop:4}}>
                <button onClick={()=>setFxml(`<fetch top="50">\n  <entity name="${ent.l}">\n    <all-attributes/>\n    <filter>\n      <condition attribute="statecode" operator="eq" value="0"/>\n    </filter>\n  </entity>\n</fetch>`)} style={{padding:"4px 10px",fontSize:11,border:`1px dashed ${C.bd}`,borderRadius:3,color:C.txd,cursor:"pointer",background:"transparent"}}>📋 Simple template</button>
                <button onClick={()=>setFxml(`<fetch top="50">\n  <entity name="${ent.l}">\n    <attribute name="name"/>\n    <link-entity name="opportunity" from="customerid" to="${ent.l}id" link-type="inner">\n      <attribute name="name" alias="opp_name"/>\n      <attribute name="estimatedvalue" alias="opp_value"/>\n    </link-entity>\n  </entity>\n</fetch>`)} style={{padding:"4px 10px",fontSize:11,border:`1px dashed ${C.bd}`,borderRadius:3,color:C.txd,cursor:"pointer",background:"transparent"}}>🔗 Inner join template</button>
                <button onClick={()=>setFxml(`<fetch aggregate="true">\n  <entity name="${ent.l}">\n    <attribute name="statecode" groupby="true" alias="status"/>\n    <attribute name="${ent.l}id" aggregate="count" alias="total"/>\n  </entity>\n</fetch>`)} style={{padding:"4px 10px",fontSize:11,border:`1px dashed ${C.bd}`,borderRadius:3,color:C.txd,cursor:"pointer",background:"transparent"}}>📊 Aggregation template</button>
              </div>
            </div>
            :qm==="odata"?<textarea value={rq} onChange={e=>setRq(e.target.value)} placeholder={`GET /api/data/v9.2/${ent.p}?$select=name&$top=50`} style={inp({height:50,...mono,color:C.cy,resize:"vertical",fontSize:13})}/>
            :<div style={{display:"flex",flexDirection:"column",gap:5}}>

              {/* ── SELECT — collapsible ── */}
              <div>
                <div style={{display:"flex",alignItems:"center",gap:5,cursor:"pointer"}} onClick={()=>{ if(sf.length>5) setQueryCollapsed(!queryCollapsed); }}>
                  <span style={{fontSize:12,color:C.vi,fontWeight:700,minWidth:44,...mono}}>SELECT</span>
                  {queryCollapsed ? (
                    <div style={{display:"flex",alignItems:"center",gap:6,flex:1,minWidth:0}}>
                      <span style={{fontSize:13,color:C.lv,fontWeight:500}}>{sf.length} columns</span>
                      <span style={{fontSize:11,color:C.txd,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",flex:1,...mono}}>{sf.slice(0,6).join(", ")}{sf.length>6?"…":""}</span>
                      <button onClick={(e)=>{e.stopPropagation();setQueryCollapsed(false);}} style={{padding:"3px 10px",background:C.vid,border:"none",borderRadius:3,color:C.lv,cursor:"pointer",fontSize:11,flexShrink:0}}>Expand ▼</button>
                      <button onClick={(e)=>{e.stopPropagation();setSf(fields.map(f=>f.l));}} style={{padding:"4px 10px",background:"transparent",border:"none",color:C.cy,cursor:"pointer",fontSize:11,textDecoration:"underline",flexShrink:0}}>All</button>
                      <button onClick={(e)=>{e.stopPropagation();setSf([]);}} style={{padding:"4px 10px",background:"transparent",border:"none",color:C.txd,cursor:"pointer",fontSize:11,textDecoration:"underline",flexShrink:0}}>Clear</button>
                      <button onClick={(e)=>{e.stopPropagation();setPicker(!picker);}} disabled={loadingFields} style={{padding:"3px 10px",background:picker?C.vi:"transparent",border:`1px ${picker?"solid":"dashed"} ${picker?C.vi:C.bd}`,borderRadius:3,color:picker?"white":C.txd,cursor:"pointer",fontSize:12,display:"flex",alignItems:"center",gap:3,flexShrink:0}}>
                        {picker?<I.X/>:<I.Plus/>}{picker?"Close":"Columns"}
                      </button>
                    </div>
                  ) : (
                    <div style={{display:"flex",flexWrap:"wrap",gap:3,flex:1,alignItems:"center"}}>
                      {sf.map(f=><span key={f} style={{display:"inline-flex",alignItems:"center",gap:2,padding:"4px 10px",background:C.vid,borderRadius:3,fontSize:12,color:C.lv}}>{f}<button onClick={(e)=>{e.stopPropagation();setSf(sf.filter(x=>x!==f));}} style={{background:"none",border:"none",color:C.txd,cursor:"pointer",padding:0,lineHeight:1}}><I.X/></button></span>)}
                      <button onClick={(e)=>{e.stopPropagation();setPicker(!picker);}} disabled={loadingFields} style={{padding:"3px 10px",background:picker?C.vi:"transparent",border:`1px ${picker?"solid":"dashed"} ${picker?C.vi:C.bd}`,borderRadius:3,color:picker?"white":C.txd,cursor:"pointer",fontSize:12,display:"flex",alignItems:"center",gap:3}}>
                        {loadingFields?<Spin s={10}/>:picker?<I.X/>:<I.Plus/>}{picker?"Close":`Columns (${sf.length}/${fields.length})`}
                      </button>
                      {sf.length>0&&<button onClick={(e)=>{e.stopPropagation();setSf([]);}} style={{padding:"4px 10px",background:"transparent",border:"none",color:C.txd,cursor:"pointer",fontSize:11,textDecoration:"underline"}}>Deselect all</button>}
                      {sf.length<fields.length&&<button onClick={(e)=>{e.stopPropagation();setSf(fields.map(f=>f.l));}} style={{padding:"4px 10px",background:"transparent",border:"none",color:C.cy,cursor:"pointer",fontSize:11,textDecoration:"underline"}}>Select all ({fields.length})</button>}
                      {sf.length>5&&<button onClick={(e)=>{e.stopPropagation();setQueryCollapsed(true);}} style={{padding:"4px 10px",background:"transparent",border:`1px solid ${C.bd}`,borderRadius:3,color:C.txd,cursor:"pointer",fontSize:11,flexShrink:0}}>Collapse ▲</button>}
                    </div>
                  )}
                </div>
              </div>

              {picker&&<FieldPicker fields={fields} selected={sf} onToggle={(f)=>sf.includes(f)?setSf(sf.filter(x=>x!==f)):setSf([...sf,f])} onBulkAdd={(arr)=>setSf(prev=>[...prev,...arr])} onBulkRemove={(arr)=>{const s=new Set(arr);setSf(prev=>prev.filter(f=>!s.has(f)));}} onSelectAll={()=>setSf(fields.map(f=>f.l))} onSelectNone={()=>setSf([])} bp={bp} onClose={()=>setPicker(false)} />}
              <div style={{display:"flex",flexDirection:"column",gap:4}}>
                <div style={{display:"flex",alignItems:"center",gap:5}}>
                  <span style={{fontSize:12,color:C.vi,fontWeight:700,minWidth:44,...mono}}>WHERE</span>
                  {filterGroups.length>1&&<select value={groupLogic} onChange={e=>setGroupLogic(e.target.value)} style={inp({width:"auto",fontSize:11,padding:"2px 5px",color:C.yw})}><option value="and">AND</option><option value="or">OR</option></select>}
                  <button onClick={()=>setFilterGroups([...filterGroups,{logic:"and",conditions:[{field:"",op:"eq",value:""}]}])} style={{padding:"2px 8px",background:"transparent",border:`1px dashed ${C.bd}`,borderRadius:3,color:C.txd,cursor:"pointer",fontSize:11}}>+ group</button>
                </div>
                {filterGroups.map((grp,gi)=>{
                  const updateGrp=(newGrp)=>{const u=[...filterGroups];u[gi]=newGrp;setFilterGroups(u);};
                  const addCond=()=>updateGrp({...grp,conditions:[...grp.conditions,{field:"",op:"eq",value:""}]});
                  const rmCond=(ci)=>updateGrp({...grp,conditions:grp.conditions.filter((_,j)=>j!==ci)});
                  const updateCond=(ci,k,v)=>{const cs=[...grp.conditions];cs[ci]={...cs[ci],[k]:v};if(k==="field"){cs[ci].op="eq";cs[ci].value="";}updateGrp({...grp,conditions:cs});};
                  const hasMultiple=grp.conditions.length>1;
                  return (<div key={gi} style={{marginLeft:50,padding:filterGroups.length>1?"6px 8px":"0",background:filterGroups.length>1?C.bg+"88":"transparent",border:filterGroups.length>1?`1px solid ${C.bd}`:"none",borderRadius:5,marginBottom:2}}>
                    {filterGroups.length>1&&<div style={{display:"flex",alignItems:"center",gap:4,marginBottom:4}}>
                      <span style={{fontSize:10,color:C.lv,fontWeight:600}}>Group {gi+1}</span>
                      {hasMultiple&&<select value={grp.logic} onChange={e=>updateGrp({...grp,logic:e.target.value})} style={inp({width:"auto",fontSize:10,padding:"2px 6px",color:C.yw})}><option value="and">AND</option><option value="or">OR</option></select>}
                      <button onClick={addCond} style={{padding:"0px 4px",background:"transparent",border:`1px dashed ${C.bd}`,borderRadius:2,color:C.txd,cursor:"pointer",fontSize:10}}>+</button>
                      {filterGroups.length>1&&<button onClick={()=>setFilterGroups(filterGroups.filter((_,j)=>j!==gi))} style={{background:"none",border:"none",color:C.txd,cursor:"pointer",padding:0,fontSize:11,marginLeft:"auto"}}>✕</button>}
                    </div>}
                    {grp.conditions.map((fil,ci)=>{
                      const fType=fil.field?getFieldType(fil.field):"";
                      const sT=new Set(["String","Memo"]);const nT=new Set(["Integer","Money","Decimal","Double","BigInt"]);
                      const dT=new Set(["DateTime"]);const pT=new Set(["Picklist","State","Status"]);
                      let ops=["eq","ne","is_null","is_not_null"];
                      if(sT.has(fType)) ops=["eq","ne","contains","not_contains","startswith","not_startswith","endswith","not_endswith","is_null","is_not_null"];
                      else if(nT.has(fType)||dT.has(fType)) ops=["eq","ne","gt","lt","ge","le","is_null","is_not_null"];
                      const needsValue=fil.op!=="is_null"&&fil.op!=="is_not_null";
                      const opLabels={"eq":"=","ne":"≠","gt":">","lt":"<","ge":"≥","le":"≤","contains":"contains","not_contains":"not contains","startswith":"starts with","not_startswith":"not starts with","endswith":"ends with","not_endswith":"not ends with","is_null":"is null","is_not_null":"is not null"};
                      const placeholder=sT.has(fType)?"text":nT.has(fType)?"number":dT.has(fType)?"2025-01-15":fType==="Boolean"?"true / false":pT.has(fType)?"int":"value";
                      return (<div key={ci} style={{display:"flex",alignItems:"center",gap:3,marginBottom:2}}>
                        {hasMultiple&&ci>0&&filterGroups.length===1&&<span style={{fontSize:10,color:C.yw,minWidth:24,textAlign:"center"}}>{grp.logic.toUpperCase()}</span>}
                        <select value={fil.field} onChange={e=>updateCond(ci,"field",e.target.value)} style={inp({width:"auto",fontSize:12,padding:"3px 6px"})}><option value="">(none)</option>{fields.map(f=><option key={f.l} value={f.l}>{f.l}</option>)}</select>
                        {fil.field&&<select value={ops.includes(fil.op)?fil.op:"eq"} onChange={e=>updateCond(ci,"op",e.target.value)} style={inp({width:"auto",fontSize:11,padding:"3px 5px",color:C.cy})}>{ops.map(o=><option key={o} value={o}>{opLabels[o]||o}</option>)}</select>}
                        {fil.field&&needsValue&&<input value={fil.value} onChange={e=>updateCond(ci,"value",e.target.value)} placeholder={placeholder} style={inp({width:bp.mobile?"100%":120,fontSize:12,padding:"3px 6px"})}/>}
                        {(grp.conditions.length>1||filterGroups.length>1)&&<button onClick={()=>rmCond(ci)} style={{background:"none",border:"none",color:C.txd,cursor:"pointer",padding:1,fontSize:11}}>✕</button>}
                      </div>);
                    })}
                    {filterGroups.length===1&&<button onClick={addCond} style={{padding:"2px 8px",background:"transparent",border:`1px dashed ${C.bd}`,borderRadius:3,color:C.txd,cursor:"pointer",fontSize:11,marginTop:2}}>+ condition</button>}
                    {filterGroups.length===1&&grp.conditions.length>1&&<select value={grp.logic} onChange={e=>updateGrp({...grp,logic:e.target.value})} style={inp({width:"auto",fontSize:10,padding:"2px 6px",color:C.yw,marginTop:2,marginLeft:4})}><option value="and">AND</option><option value="or">OR</option></select>}
                  </div>);
                })}
              </div>

              {/* ── EXPAND — join parent entities ── */}
              <div style={{display:"flex",alignItems:"flex-start",gap:5,flexDirection:"column"}}>
                <div style={{display:"flex",alignItems:"center",gap:5}}>
                  <span style={{fontSize:12,color:C.or,fontWeight:700,minWidth:44,...mono}}>EXPAND</span>
                  {expands.length>0&&!showExpandPicker&&(
                    <div style={{display:"flex",gap:3,flexWrap:"wrap",alignItems:"center"}}>
                      {expands.map(ex=>(
                        <span key={ex.navProperty} style={{display:"inline-flex",alignItems:"center",gap:3,padding:"2px 7px",background:ex.type==="collection"?C.cy+"22":C.or+"22",border:`1px solid ${ex.type==="collection"?C.cy:C.or}44`,borderRadius:3,fontSize:12,color:ex.type==="collection"?C.cy:C.or}}>
                          {ex.type==="collection"?`←${ex.targetEntity}`:`${ex.lookupField}→${ex.targetEntity}`} ({ex.fields.length})
                          <button onClick={()=>removeExpand(ex.navProperty)} style={{background:"none",border:"none",color:C.or,cursor:"pointer",padding:0,lineHeight:1,fontSize:12}}>✕</button>
                        </span>
                      ))}
                    </div>
                  )}
                  <button onClick={()=>{
                    const opening = !showExpandPicker;
                    setShowExpandPicker(opening);
                    setExpandSearch("");
                    // Lazy load child relationships on first open
                    if(opening && !childRelsLoaded && ent && isLive) {
                      setChildRelsLoaded(true);
                      bridge.getChildRelationships(ent.l).then(childRels => {
                        if(childRels && Array.isArray(childRels)) {
                          setLookups(prev => {
                            const seen = new Set(prev.map(l => l.navProperty));
                            const newRels = childRels.filter(l => l.navProperty && !seen.has(l.navProperty)).map(l => ({...l, type: "collection"}));
                            return [...prev, ...newRels];
                          });
                        }
                      }).catch(() => {});
                    }
                  }} disabled={lookups.length===0} style={{padding:"3px 10px",background:showExpandPicker?C.or+"33":"transparent",border:`1px ${showExpandPicker?"solid":"dashed"} ${showExpandPicker?C.or:C.bd}`,borderRadius:3,color:showExpandPicker?C.or:C.txd,cursor:lookups.length?"pointer":"default",fontSize:12,display:"flex",alignItems:"center",gap:3,flexShrink:0}}>
                    {showExpandPicker?<I.X/>:<I.Link/>} {showExpandPicker?"Close":"Relations"}
                  </button>
                </div>

                {showExpandPicker&&(
                  <div style={{marginLeft:bp.mobile?0:50,width:bp.mobile?"100%":"calc(100% - 50px)"}}>
                    {/* Relationship picker — ManyToOne (parents) + OneToMany (children) */}
                    {lookups.length>0&&(
                      <div style={{display:"flex",flexDirection:"column",gap:6,marginBottom:expands.length?8:0}}>
                        {/* Search bar */}
                        <input value={expandSearch} onChange={e=>setExpandSearch(e.target.value)} placeholder="🔍 Search relations (entity, field)..." style={inp({fontSize:12,padding:"5px 10px"})}/>
                        {(()=>{
                          const es=debouncedExpandSearch.toLowerCase();
                          const matchRel=l=>!es||l.lookupField?.toLowerCase().includes(es)||l.targetEntity?.toLowerCase().includes(es)||l.navProperty?.toLowerCase().includes(es);
                          const parents=lookups.filter(l=>l.type!=="collection"&&!expands.find(e=>e.navProperty===l.navProperty)&&matchRel(l));
                          const children=lookups.filter(l=>l.type==="collection"&&!expands.find(e=>e.navProperty===l.navProperty)&&matchRel(l));
                          return <>
                        {/* Parent relations (ManyToOne) */}
                        {parents.length>0&&(
                          <div>
                            <div style={{fontSize:10,color:C.txd,fontWeight:600,marginBottom:3,textTransform:"uppercase",letterSpacing:".5px"}}>↑ Parent (N→1) — {parents.length}</div>
                            <div style={{display:"flex",flexWrap:"wrap",gap:3,padding:8,background:C.bg,borderRadius:6,border:`1px solid ${C.bd}`,maxHeight:100,overflow:"auto"}}>
                              {parents.map(l=>(
                                <button key={l.navProperty} onClick={()=>addExpand(l)} disabled={loadingExpand===l.navProperty} style={{padding:"4px 10px",background:C.sfh,border:`1px solid ${C.bd}`,borderRadius:4,color:C.txm,cursor:"pointer",fontSize:12,display:"flex",alignItems:"center",gap:4}}>
                                  {loadingExpand===l.navProperty?<Spin s={10}/>:<I.Link/>}
                                  <span style={{color:C.or,...mono,fontSize:11}}>{l.lookupField}</span>
                                  <span style={{color:C.txd}}>→</span>
                                  <span style={{color:C.cy,fontSize:11}}>{l.targetEntity}</span>
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                        {/* Child relations (OneToMany) */}
                        {children.length>0&&(
                          <div>
                            <div style={{fontSize:10,color:C.txd,fontWeight:600,marginBottom:3,textTransform:"uppercase",letterSpacing:".5px"}}>↓ Children (1→N) — {children.length}</div>
                            <div style={{display:"flex",flexWrap:"wrap",gap:3,padding:8,background:C.bg,borderRadius:6,border:`1px solid ${C.cy}33`,maxHeight:100,overflow:"auto"}}>
                              {children.map(l=>(
                                <button key={l.navProperty} onClick={()=>addExpand(l)} disabled={loadingExpand===l.navProperty} style={{padding:"4px 10px",background:C.sfh,border:`1px solid ${C.cy}44`,borderRadius:4,color:C.txm,cursor:"pointer",fontSize:12,display:"flex",alignItems:"center",gap:4}}>
                                  {loadingExpand===l.navProperty?<Spin s={10}/>:<I.Link/>}
                                  <span style={{color:C.cy,...mono,fontSize:11}}>{l.targetEntity}</span>
                                  <span style={{color:C.txd}}>←</span>
                                  <span style={{color:C.or,fontSize:11}}>{l.lookupField}</span>
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                        {parents.length===0&&children.length===0&&(
                          <span style={{color:C.txd,fontSize:12,padding:4}}>{expandSearch?"No relations found":"All relations added"}</span>
                        )}
                          </>;
                        })()}
                      </div>
                    )}

                    {/* Active expansions — with search */}
                    {expands.map(ex=>(<ExpandCard key={ex.navProperty} ex={ex} onToggle={toggleExpandField} onRemove={removeExpand} bp={bp}/>))}
                  </div>
                )}
              </div>

              <div style={{display:"flex",alignItems:"center",gap:5}}>
                <span style={{fontSize:12,color:C.vi,fontWeight:700,minWidth:44,...mono}}>LIMIT</span>
                <select value={lim} onChange={e=>setLim(+e.target.value)} style={inp({width:"auto",fontSize:12,padding:"3px 6px"})}>{[10,25,50,100,200,500,1000,5000].map(n=><option key={n} value={n}>{n}</option>)}<option value={0}>All</option></select>
                {lim===0&&<span style={{fontSize:11,color:C.yw}}>⚠ may be slow</span>}
                {lim===0&&expands.length>0&&<span style={{fontSize:11,color:C.or}}>⚠ D365 limits results with $expand</span>}
              </div>
            </div>}
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginTop:8,gap:6,flexWrap:"wrap"}}>
              {qm==="builder"&&!bp.mobile&&<><code style={{fontSize:11,color:C.txd,...mono,flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{oq()}</code><button onClick={()=>{copyText(oq());}} style={{padding:"2px 6px",background:"transparent",border:`1px solid ${C.bd}`,borderRadius:3,color:C.txd,cursor:"pointer",fontSize:11,flexShrink:0}} title="Copy OData URL"><I.Copy/></button></>}
              {qm==="fetchxml"&&!bp.mobile&&<code style={{fontSize:11,color:C.cy,...mono,flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{fxml.replace(/\n/g," ").substring(0,100)}{fxml.length>100?"…":""}</code>}
              <div style={{display:"flex",gap:4,alignItems:"center",flexShrink:0}}>
                <button onClick={run} disabled={loading||loadingFields} style={bt(`linear-gradient(135deg,${C.vi},${C.vil})`)}>{loading?<><Spin s={12}/> Querying...</>:loadingFields?<><Spin s={12}/> Fields...</>:<><I.Play/> Execute <span style={{fontSize:11,opacity:.7}}>Ctrl+⏎</span></>}</button>
                <button onClick={saveCurrentQuery} disabled={!ent} title="Save this query" style={{padding:"4px 8px",background:"transparent",border:`1px solid ${C.yw}44`,borderRadius:4,color:C.yw,cursor:ent?"pointer":"default",fontSize:12}}>⭐</button>
                <div style={{position:"relative"}}>
                  <button onClick={()=>{setShowHistory(!showHistory);setShowSaved(false);}} style={{padding:"4px 8px",background:showHistory?C.vi+"33":"transparent",border:`1px solid ${C.bd}`,borderRadius:4,color:C.txm,cursor:"pointer",fontSize:12}} title="Query history">🕐{queryHistory.length>0?` ${queryHistory.length}`:""}</button>
                  {showHistory&&queryHistory.length>0&&(
                    <div style={{position:"absolute",top:"100%",right:0,zIndex:20,background:C.sf,border:`1px solid ${C.bd}`,borderRadius:6,marginTop:4,minWidth:260,maxHeight:250,overflow:"auto",boxShadow:"0 8px 24px rgba(0,0,0,.4)"}}>
                      <div style={{padding:"6px 10px",borderBottom:`1px solid ${C.bd}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}><span style={{fontSize:11,fontWeight:600,color:C.txm}}>Recent queries</span><button onClick={()=>{setQueryHistory([]);if(typeof chrome!=="undefined"&&chrome.storage?.local)chrome.storage.local.remove("d365_query_history");}} style={{fontSize:10,color:C.txd,background:"none",border:"none",cursor:"pointer"}}>Clear</button></div>
                      {queryHistory.map((h,i)=>(
                        <div key={i} style={{padding:"6px 10px",borderBottom:`1px solid ${C.bd}`,cursor:"pointer",fontSize:12}} onClick={()=>{if(h.mode==="odata")setRq(h.query);setShowHistory(false);}}
                          onMouseEnter={e=>e.currentTarget.style.background=C.sfh} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                          <div style={{fontWeight:500,color:C.tx}}>{h.entity}</div>
                          <div style={{fontSize:11,color:C.txd,...mono,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{h.query?.substring(0,80)}</div>
                          <div style={{fontSize:10,color:C.txd,marginTop:2}}>{h.fields} cols • {h.mode} • {new Date(h.ts).toLocaleString("en-US",{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"})}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div style={{position:"relative"}}>
                  <button onClick={()=>{setShowSaved(!showSaved);setShowHistory(false);}} style={{padding:"4px 8px",background:showSaved?C.vi+"33":"transparent",border:`1px solid ${C.bd}`,borderRadius:4,color:C.txm,cursor:"pointer",fontSize:12}}>{savedQueries.length>0?`📂 ${savedQueries.length}`:"📂"}</button>
                  {showSaved&&savedQueries.length>0&&(
                    <div style={{position:"absolute",top:"100%",right:0,zIndex:20,background:C.sf,border:`1px solid ${C.bd}`,borderRadius:6,marginTop:4,minWidth:220,maxHeight:200,overflow:"auto",boxShadow:"0 8px 24px rgba(0,0,0,.4)"}}>
                      {savedQueries.map(q=>(
                        <div key={q.name} style={{display:"flex",alignItems:"center",gap:6,padding:"6px 10px",borderBottom:`1px solid ${C.bd}`,cursor:"pointer"}} onClick={()=>loadSavedQuery(q)}
                          onMouseEnter={e=>e.currentTarget.style.background=C.sfh}
                          onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                          <div style={{flex:1,minWidth:0}}>
                            <div style={{fontSize:13,fontWeight:500,color:C.tx}}>{q.name}</div>
                            <div style={{fontSize:11,color:C.txd,...mono}}>{q.entity} • {q.fields?.length||0} columns</div>
                          </div>
                          <button onClick={(ev)=>{ev.stopPropagation();deleteSavedQuery(q.name);}} style={{background:"none",border:"none",color:C.txd,cursor:"pointer",padding:2,fontSize:11}}>✕</button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
          <div>{res?<Results res={res} bp={bp} orgInfo={orgInfo} onStop={stopFetch} onDeleteDone={(ids)=>setRes(prev=>({...prev,data:prev.data.filter(r=>{const id=Object.values(r).find(v=>typeof v==="string"&&/^[0-9a-f]{8}-/.test(v));return !ids.has(id);})}))} />:<div style={{display:"flex",alignItems:"center",justifyContent:"center",height:200,color:C.txd,fontSize:14}}>Ctrl+Enter to execute</div>}</div>
        </>:null}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// VIRTUAL TABLE — renders only visible rows for 60fps scrolling
// ═══════════════════════════════════════════════════════════════
function VirtualTable({ res, fields, data, scrollRef, selected, toggleSel, toggleAll, getRecordId, copy, cp, bestGet, rawGet, flatVal, fmt, ths, tds, onSort, sortField, sortDir, onInlineEdit, orgInfo, entityName }) {
  const ROW_H = 32; // row height in px
  const [editing, setEditing] = useState(null);
  const editRef = useRef(null);
  useEffect(() => { if (editing && editRef.current) editRef.current.focus(); }, [editing]);
  const OVERSCAN = 5; // extra rows above/below viewport
  const containerRef = useRef(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [containerH, setContainerH] = useState(600);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new ResizeObserver(entries => { for (const e of entries) setContainerH(e.contentRect.height); });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const onScroll = useCallback((e) => setScrollTop(e.target.scrollTop), []);

  const totalH = data.length * ROW_H;
  const startIdx = Math.max(0, Math.floor(scrollTop / ROW_H) - OVERSCAN);
  const visibleCount = Math.ceil(containerH / ROW_H) + OVERSCAN * 2;
  const endIdx = Math.min(data.length, startIdx + visibleCount);
  const offsetY = startIdx * ROW_H;

  return (
    <div ref={containerRef} onScroll={onScroll} style={{overflowX:"auto",overflowY:"auto",maxHeight:"calc(100vh - 280px)"}}>
      <table style={{width:"100%",borderCollapse:"collapse",fontSize:13,minWidth:fields.length*130}}>
        <thead>
          <tr>
            <th style={{...ths(),position:"sticky",left:0,zIndex:2,background:C.sf,minWidth:52,display:"flex",alignItems:"center",gap:4,top:0}}>
              <input type="checkbox" checked={selected.size>0&&selected.size===data.length} onChange={toggleAll} style={{accentColor:C.vi,cursor:"pointer"}}/>
              <span>#</span>
            </th>
            {fields.map(f => (<th key={f} onClick={()=>onSort?.(f)} style={{...ths(),position:"sticky",top:0,zIndex:1,background:C.sf,cursor:"pointer",userSelect:"none"}}><span style={{display:"inline-flex",alignItems:"center",gap:3}}>{f}{sortField===f&&<span style={{fontSize:10,color:C.vi}}>{sortDir==="asc"?"\u25B2":"\u25BC"}</span>}</span></th>))}
          </tr>
        </thead>
        <tbody>
          {/* Spacer top */}
          {startIdx > 0 && <tr style={{height:offsetY}}><td colSpan={fields.length+1}/></tr>}
          {data.slice(startIdx, endIdx).map((r, vi) => {
            const i = startIdx + vi;
            return (
              <tr key={i} style={{height:ROW_H,borderBottom:`1px solid ${C.bd}`}}
                onMouseEnter={e=>e.currentTarget.style.background=C.sfh}
                onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                <td style={{...tds,color:C.txd,fontSize:12,position:"sticky",left:0,background:selected.has(getRecordId(r))?C.vid:C.bg,zIndex:1,display:"flex",alignItems:"center",gap:4}}>
                  <input type="checkbox" checked={selected.has(getRecordId(r))} onChange={()=>toggleSel(getRecordId(r))} style={{accentColor:C.vi,cursor:"pointer"}}/>
                  <span>{i+1}</span>
                  {orgInfo?.orgUrl&&entityName&&getRecordId(r)&&<a href={`${orgInfo.orgUrl}/main.aspx?etn=${entityName}&id=${getRecordId(r)}&pagetype=entityrecord`} target="_blank" rel="noopener" onClick={e=>e.stopPropagation()} style={{color:C.vi,textDecoration:"none",fontSize:10,lineHeight:1}} title="Open in D365">↗</a>}
                </td>
                {fields.map(f => {
                  const k=`${i}-${f}`;
                  const isEd=editing&&editing.row===i&&editing.field===f;
                  return (
                    <td key={f} style={{...tds,maxWidth:220,cursor:"pointer",background:isEd?C.sfa:undefined}}
                      onClick={()=>!isEd&&copy(bestGet(r,f),k)}
                      onDoubleClick={()=>{if(onInlineEdit&&!f.includes(".")){const raw=rawGet(r,f);setEditing({row:i,field:f,value:raw!=null?String(raw):"",record:r});}}}
                      title={isEd?"Enter=save | Esc=cancel":"Click=copy | Dbl-click=edit"}>
                      {isEd?(
                        <input ref={editRef} value={editing.value} onChange={e=>setEditing({...editing,value:e.target.value})}
                          onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();onInlineEdit(editing.record,f,editing.value);setEditing(null);}if(e.key==="Escape"){e.preventDefault();setEditing(null);}}}
                          onBlur={()=>setEditing(null)}
                          style={{width:"100%",background:C.bg,border:`1px solid ${C.vi}`,borderRadius:3,color:C.tx,padding:"1px 4px",fontSize:13,...mono,outline:"none",boxSizing:"border-box"}}/>
                      ):cp===k?<span style={{color:C.gn,fontSize:11}}>✓ copied</span>:fmt(r,f)}
                    </td>
                  );
                })}
              </tr>
            );
          })}
          {/* Spacer bottom */}
          {endIdx < data.length && <tr style={{height:(data.length - endIdx) * ROW_H}}><td colSpan={fields.length+1}/></tr>}
        </tbody>
      </table>
    </div>
  );
}

function Results({res,bp,orgInfo,onStop,onDeleteDone}){
  const[sortField,setSortField]=useState(null);
  const[bulkUpdate,setBulkUpdate]=useState(null); // {field:"",value:""}
  const[bulkUpdating,setBulkUpdating]=useState(false);
  const[sortDir,setSortDir]=useState("asc");
  const doBulkUpdate=async()=>{
    if(!bulkUpdate?.field||!selected.size||!res.entity?.p) return;
    const ids=[...selected];
    setBulkUpdating(true);
    let ok=0,fail=0;
    const odataField=res.odataFieldMap?.[bulkUpdate.field]||bulkUpdate.field;
    let val=bulkUpdate.value;
    if(val===""||val==="null") val=null;
    else if(val==="true") val=true;
    else if(val==="false") val=false;
    else if(!isNaN(val)&&val.trim()!=="") val=Number(val);
    for(const id of ids){
      try{
        await bridge.update(res.entity.p, id, {[odataField]:val});
        ok++;
      }catch{fail++;}
    }
    setBulkUpdating(false);
    setBulkUpdate(null);
    showFeedback(`Bulk update: ${ok} updated${fail?`, ${fail} failed`:""}`);
  };
  const inlineEdit=async(record,field,newValue)=>{
    const id=getRecordId(record);
    if(!id||!res.entity?.p) return;
    try{
      const odataField=res.odataFieldMap?.[field]||field;
      let val=newValue;
      if(newValue===""||newValue==="null") val=null;
      else if(newValue==="true") val=true;
      else if(newValue==="false") val=false;
      else if(!isNaN(newValue)&&newValue.trim()!=="") val=Number(newValue);
      await bridge.update(res.entity.p, id, {[odataField]:val});
      record[odataField]=val;
      if(record[odataField+"__display"]) delete record[odataField+"__display"];
      showFeedback("\u2713 Saved");
    }catch(e){
      showFeedback("Edit failed: "+e.message);
    }
  };
  const toggleSort=(f)=>{if(sortField===f){setSortDir(d=>d==="asc"?"desc":"asc");}else{setSortField(f);setSortDir("asc");}};
  const sortedData=useMemo(()=>{
    if(!sortField) return res.data;
    const dk2=(f)=>res.odataFieldMap?.[f]||f;
    return [...res.data].sort((a,b)=>{
      let va=a[dk2(sortField)+"__display"]??a[dk2(sortField)]??"";
      let vb=b[dk2(sortField)+"__display"]??b[dk2(sortField)]??"";
      if(typeof va==="number"&&typeof vb==="number") return sortDir==="asc"?va-vb:vb-va;
      va=String(va).toLowerCase();vb=String(vb).toLowerCase();
      return sortDir==="asc"?va.localeCompare(vb):vb.localeCompare(va);
    });
  },[res.data,sortField,sortDir]);
  const[cp,setCp]=useState(null);
  const[copyFeedback,setCopyFeedback]=useState("");
  const[selected,setSelected]=useState(new Set());
  const[deleting,setDeleting]=useState(false);
  const scrollRef=useRef(null);

  // Get record ID (first GUID-like value, or entity-specific id field)
  const getRecordId=(r)=>{
    const idKey=`${res.entity.l}id`;
    if(r[idKey]) return r[idKey];
    for(const[k,v] of Object.entries(r)){
      if(typeof v==="string"&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)) return v;
    }
    return null;
  };
  const toggleSel=(id)=>setSelected(prev=>{const s=new Set(prev);s.has(id)?s.delete(id):s.add(id);return s;});
  const toggleAll=()=>{
    if(selected.size===res.data.length){setSelected(new Set());}
    else{setSelected(new Set(res.data.map(r=>getRecordId(r)).filter(Boolean)));}
  };
  const doDelete=async()=>{
    if(!selected.size) return;
    const count=selected.size;
    if(!confirm(`Delete ${count} record(s) from ${res.entity.l}? This action is irreversible.`)) return;
    setDeleting(true);
    try{
      const result=await bridge.batchDelete(res.entity.p,Array.from(selected));
      showFeedback(`${result.deleted} deleted${result.errors?.length?`, ${result.errors.length} error(s)`:""}`);
      if(onDeleteDone) onDeleteDone(selected);
      setSelected(new Set());
    }catch(e){
      showFeedback(`Error: ${e.message}`);
    }
    setDeleting(false);
  };

  // Resolve field name: logical -> odata key in data
  const dk = (f) => res.odataFieldMap?.[f] || f;
  const rawGet = (r, f) => r[dk(f)];
  const dispGet = (r, f) => r[dk(f) + "__display"];
  const bestGet = (r, f) => { const d = dispGet(r, f); return d !== undefined && d !== null ? d : rawGet(r, f); };
  const copy=(v,k)=>{copyText(String(v ?? ""));setCp(k);setTimeout(()=>setCp(null),1000);};

  const flatVal = (v) => {
    if (v === null || v === undefined) return "";
    if (typeof v === "boolean") return v ? "true" : "false";
    if (typeof v === "number") return String(v);
    if (typeof v === "object") return JSON.stringify(v);
    return String(v);
  };

  // Display: prefer D365 formatted value, fallback to raw
  // Get lookup target entity from annotations (zero-cost — extracted in cleanRecord)
  const entityGet = (r, f) => r[dk(f) + "__entity"];

  const fmt = (r, f) => {
    const disp = dispGet(r, f);
    const raw = rawGet(r, f);
    const targetEntity = entityGet(r, f);
    const orgUrl = orgInfo?.orgUrl;

    // Lookup with display value → show name + link
    if (disp !== undefined && disp !== null && targetEntity && raw && orgUrl) {
      const link = `${orgUrl}/main.aspx?etn=${targetEntity}&id=${raw}&pagetype=entityrecord`;
      return (<span style={{display:"inline-flex",alignItems:"center",gap:4}}>
        <span>{String(disp)}</span>
        <a href={link} target="_blank" rel="noopener" onClick={e=>e.stopPropagation()} style={{fontSize:10,color:C.vi,textDecoration:"none"}} title={`Open ${targetEntity} in D365`}>↗</a>
      </span>);
    }
    if (disp !== undefined && disp !== null) return (<span>{String(disp)}</span>);
    if (raw === null || raw === undefined) return (<span style={{color:C.txd,fontStyle:"italic"}}>null</span>);
    if (typeof raw === "boolean") return (<span style={{color:raw?C.gn:C.rd}}>{raw?"true":"false"}</span>);
    if (typeof raw === "number") return raw.toLocaleString();
    if (typeof raw === "object") return (<span style={{color:C.yw,...mono,fontSize:12}}>{JSON.stringify(raw).substring(0,60)}</span>);
    if (typeof raw === "string") {
      if (raw.match(/^\d{4}-\d{2}-\d{2}T/)) return new Date(raw).toLocaleDateString("en-US",{day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"});
      // GUID with entity annotation → clickable link
      if (raw.match(/^[0-9a-f]{8}-[0-9a-f]{4}/i) && targetEntity && orgUrl) {
        const link = `${orgUrl}/main.aspx?etn=${targetEntity}&id=${raw}&pagetype=entityrecord`;
        return (<span style={{display:"inline-flex",alignItems:"center",gap:4}}>
          <span style={{...mono,fontSize:12,color:C.txm}} title={raw}>{raw.substring(0,13)}…</span>
          <a href={link} target="_blank" rel="noopener" onClick={e=>e.stopPropagation()} style={{fontSize:10,color:C.vi,textDecoration:"none"}} title={`Open ${targetEntity} in D365`}>↗</a>
        </span>);
      }
      if (raw.match(/^[0-9a-f]{8}-[0-9a-f]{4}/i)) return (<span style={{...mono,fontSize:12,color:C.txm}} title={raw}>{raw.substring(0,13)}…</span>);
    }
    return String(raw);
  };

  // Export: prefer human-readable formatted value
  const expVal = (r, f) => { const d = dispGet(r, f); const raw = rawGet(r, f); return flatVal(d !== undefined && d !== null ? d : raw); };
  const escCSV=(v)=>{return v.includes(",")||v.includes('"')||v.includes("\n")?`"${v.replace(/"/g,'""')}"`:v;};
  const escTSV=(v)=>{return v.includes("\t")||v.includes("\n")?`"${v.replace(/"/g,'""')}"`:v;};
  const toCSV=()=>"\uFEFF"+[res.fields.join(","),...res.data.map(r=>res.fields.map(f=>escCSV(expVal(r,f))).join(","))].join("\n");
  const toTSV=()=>[res.fields.join("\t"),...res.data.map(r=>res.fields.map(f=>escTSV(expVal(r,f))).join("\t"))].join("\n");
  const toJSON=()=>JSON.stringify(res.data.map(r=>{const o={};res.fields.forEach(f=>{o[f]=bestGet(r,f)??null;});return o;}),null,2);

  const showFeedback=(msg)=>{setCopyFeedback(msg);setTimeout(()=>setCopyFeedback(""),2000);};
  const copyCSV=()=>{copyText(toCSV());showFeedback("CSV copied !");};
  const copyExcel=()=>{copyText(toTSV());showFeedback("Copied! Paste in Excel");};
  const copyJSON=()=>{copyText(toJSON());showFeedback("JSON copied !");};
  const dlCSV=()=>dl(toCSV(),"text/csv;charset=utf-8",`${res.entity.l}_export.csv`);
  const dlXLSX=()=>{
    try{
      const wsData=[res.fields,...res.data.map(r=>res.fields.map(f=>bestGet(r,f)))];
      const ws=XLSX.utils.aoa_to_sheet(wsData);
      ws["!cols"]=res.fields.map(f=>({wch:Math.max(f.length,12)}));
      const wb=XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb,ws,res.entity.l.substring(0,31));
      XLSX.writeFile(wb,`${res.entity.l}_export.xlsx`);
      showFeedback("XLSX downloaded!");
    }catch(e){showFeedback("XLSX error: "+e.message);}
  };
  const dlJSON=()=>dl(toJSON(),"application/json;charset=utf-8",`${res.entity.l}_export.json`);

  const btnCopy=(label,icon,onClick,accent)=>(<button onClick={onClick} style={{
    padding:"4px 8px",fontSize:12,fontWeight:500,cursor:"pointer",display:"flex",alignItems:"center",gap:4,
    background:accent||"transparent",border:`1px solid ${accent?accent:C.bd}`,borderRadius:4,
    color:accent?"white":C.tx,transition:"all .15s",whiteSpace:"nowrap",
  }}>{icon}{label}</button>);

  return (
    <div>
      {/* Toolbar */}
      <div style={{borderBottom:`1px solid ${C.bd}`,background:C.sf,padding:"6px 12px"}}>
        {/* Row 1: count + feedback */}
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:6,flexWrap:"wrap",gap:4}}>
          <div style={{display:"flex",alignItems:"center",gap:6}}>
            <span style={{fontSize:13,color:C.gn,fontWeight:600}}>{res.data.length} records</span>
            {res.fetching&&<span style={{fontSize:11,color:C.cy,background:C.cy+"22",padding:"2px 8px",borderRadius:3,display:"inline-flex",alignItems:"center",gap:4}}><Spin s={8}/> loading…</span>}
            {res.fetching&&<button onClick={onStop} style={{padding:"1px 8px",fontSize:11,border:`1px solid ${C.rd}44`,borderRadius:3,cursor:"pointer",background:C.rd+"22",color:C.rd,fontWeight:600}}>■ Stop</button>}
            <span style={{fontSize:11,color:C.txd}}>/ {res.total.toLocaleString()}</span>
            <span style={{fontSize:11,color:C.txd,background:C.bg,padding:"2px 6px",borderRadius:3}}>{res.elapsed}</span>
          </div>
          {copyFeedback && (
            <span style={{fontSize:13,color:C.gn,fontWeight:600,display:"flex",alignItems:"center",gap:4,animation:"fadeIn .2s"}}>
              ✓ {copyFeedback}
            </span>
          )}
        </div>
        {/* Row 2: action buttons */}
        <div style={{display:"flex",alignItems:"center",gap:4,flexWrap:"wrap"}}>
          {/* Copy group */}
          <span style={{fontSize:11,color:C.txd,fontWeight:600,textTransform:"uppercase",letterSpacing:".5px",marginRight:2}}>Copy</span>
          {btnCopy("Excel",<I.Clipboard/>,copyExcel,C.gnd)}
          {btnCopy("CSV",<I.Copy/>,copyCSV)}
          {btnCopy("JSON",<I.Copy/>,copyJSON)}

          <div style={{width:1,height:18,background:C.bd,margin:"0 6px"}}/>

          {/* Download group */}
          <span style={{fontSize:11,color:C.txd,fontWeight:600,textTransform:"uppercase",letterSpacing:".5px",marginRight:2}}>Download</span>
          {btnCopy("XLSX",<I.Download/>,dlXLSX,C.gnd)}
          {btnCopy("CSV",<I.Download/>,dlCSV)}
          {btnCopy("JSON",<I.Download/>,dlJSON)}

          {selected.size>0&&<>
            <div style={{width:1,height:18,background:C.rd+"44",margin:"0 6px"}}/>
            <div style={{position:"relative"}}>
              <button onClick={()=>setBulkUpdate(bulkUpdate?null:{field:res.fields[0]||"",value:""})} style={{padding:"4px 10px",fontSize:12,fontWeight:600,cursor:"pointer",display:"flex",alignItems:"center",gap:4,background:C.cy+"22",border:`1px solid ${C.cy}44`,borderRadius:4,color:C.cy}}>
                <I.Zap/> Update {selected.size}
              </button>
              {bulkUpdate&&(
                <div style={{position:"absolute",top:"100%",left:0,zIndex:20,background:C.sf,border:`1px solid ${C.bd}`,borderRadius:8,marginTop:4,padding:12,minWidth:280,boxShadow:"0 8px 24px rgba(0,0,0,.4)"}}>
                  <div style={{fontSize:13,fontWeight:600,marginBottom:8}}>Bulk Update — {selected.size} record(s)</div>
                  <div style={{marginBottom:6}}>
                    <label style={{fontSize:11,color:C.txm,display:"block",marginBottom:2}}>Column</label>
                    <select value={bulkUpdate.field} onChange={e=>setBulkUpdate({...bulkUpdate,field:e.target.value})} style={inp({fontSize:13})}>
                      {res.fields.filter(f=>!f.includes(".")).map(f=><option key={f} value={f}>{f}</option>)}
                    </select>
                  </div>
                  <div style={{marginBottom:8}}>
                    <label style={{fontSize:11,color:C.txm,display:"block",marginBottom:2}}>New value</label>
                    <input value={bulkUpdate.value} onChange={e=>setBulkUpdate({...bulkUpdate,value:e.target.value})} placeholder="null, true, false, or value..." style={inp({fontSize:13,...mono})} onKeyDown={e=>{if(e.key==="Enter")doBulkUpdate();}}/>
                  </div>
                  <div style={{display:"flex",gap:6}}>
                    <button onClick={doBulkUpdate} disabled={bulkUpdating} style={bt(`linear-gradient(135deg,${C.cy},${C.vi})`,{fontSize:12,flex:1,justifyContent:"center"})}>{bulkUpdating?<><Spin s={10}/> Updating...</>:<><I.Zap/> Update {selected.size}</>}</button>
                    <button onClick={()=>setBulkUpdate(null)} style={bt(null,{fontSize:12})}>Cancel</button>
                  </div>
                </div>
              )}
            </div>
            <button onClick={doDelete} disabled={deleting} style={{padding:"4px 10px",fontSize:12,fontWeight:600,cursor:"pointer",display:"flex",alignItems:"center",gap:4,background:C.rd+"22",border:`1px solid ${C.rd}44`,borderRadius:4,color:C.rd}}>
              {deleting?<Spin s={10}/>:<I.Trash/>} Delete {selected.size}
            </button>
          </>}
        </div>
      </div>

      {/* Table - virtual scrolling for performance */}
      <VirtualTable res={res} fields={res.fields} data={sortedData} scrollRef={scrollRef}
        selected={selected} toggleSel={toggleSel} toggleAll={toggleAll}
        getRecordId={getRecordId} copy={copy} cp={cp} bestGet={bestGet} rawGet={rawGet} flatVal={flatVal} fmt={fmt}
        ths={ths} tds={tds} onSort={toggleSort} sortField={sortField} sortDir={sortDir} onInlineEdit={inlineEdit} orgInfo={orgInfo} entityName={res.entity?.l} />

      {/* Fetching progress indicator */}
      {res.fetching && (
        <div style={{padding:"10px 16px",borderTop:`1px solid ${C.bd}`,background:C.sf,display:"flex",alignItems:"center",gap:10}}>
          <Spin s={12}/>
          <span style={{fontSize:13,color:C.cy,flex:1}}>Loading... {res.data.length} records</span>
          <button onClick={onStop} style={{padding:"3px 10px",fontSize:12,border:`1px solid ${C.rd}44`,borderRadius:4,cursor:"pointer",background:C.rd+"22",color:C.rd}}>Stop</button>
        </div>
      )}
      {!res.fetching && res.data.length > 0 && (
        <div style={{padding:"6px 16px",textAlign:"center",color:C.txd,fontSize:12,borderTop:`1px solid ${C.bd}`}}>
          {res.data.length} records — loading complete
        </div>
      )}

      <style>{`@keyframes fadeIn{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:translateY(0)}}`}</style>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// LOGIN HISTORY — User sign-in timeline from D365 Audit
// ═══════════════════════════════════════════════════════════════
function LoginHistory({bp,orgInfo}){
  const isLive = orgInfo?.isExtension;
  const[search,setSearch]=useState("");
  const[users,setUsers]=useState([]);
  const[selectedUser,setSelectedUser]=useState(null);
  const[history,setHistory]=useState([]);
  const[loading,setLoading]=useState(false);
  const[loadingHistory,setLoadingHistory]=useState(false);
  const[error,setError]=useState("");
  const[limit,setLimit]=useState(100);
  const searchTimeout=useRef(null);

  // Debounced user search
  const doSearch=(term)=>{
    if(searchTimeout.current) clearTimeout(searchTimeout.current);
    if(!term||term.length<2){ setUsers([]); return; }
    searchTimeout.current=setTimeout(async()=>{
      setLoading(true);setError("");
      try{
        const results=await bridge.searchUsers(term);
        setUsers(results||[]);
      }catch(e){setError(e.message);}
      finally{setLoading(false);}
    },400);
  };

  const selectUser=async(user)=>{
    setSelectedUser(user);
    setLoadingHistory(true);setError("");setHistory([]);
    try{
      const data=await bridge.getLoginHistory(user.id,limit);
      if(!data?.length){
        setError("No audit records found for this user. Check that auditing is enabled: Settings > Administration > System Settings > Auditing tab > enable 'Start Auditing' AND 'Audit user access'.");
      } else if(data.length===1 && data[0].action==="__AUDIT_EXISTS_BUT_NO_LOGINS"){
        // Audit works but no login events specifically
        setError(`Auditing is active (${data[0].info}) but no login events were found. Enable 'Audit user access' in Settings > Administration > System Settings > Auditing tab.`);
        setHistory([]);
      } else {
        setHistory(data);
      }
    }catch(e){
      if(e.message?.includes("401")||e.message?.includes("SESSION_EXPIRED")){
        setError("Session expired — refresh D365 (F5)");
      } else if(e.message?.includes("404")||e.message?.includes("audits")){
        setError("The audit entity is not accessible. Auditing must be enabled : Settings > Administration > System Settings > Auditing.");
      } else {
        setError(e.message);
      }
    }
    finally{setLoadingHistory(false);}
  };

  // Group history by day
  const groupedByDay = useMemo(()=>{
    const groups={};
    for(const h of history){
      const day=new Date(h.date).toLocaleDateString("en-US",{weekday:"long",day:"numeric",month:"long",year:"numeric"});
      if(!groups[day]) groups[day]=[];
      groups[day].push(h);
    }
    return Object.entries(groups);
  },[history]);

  // Stats
  const stats = useMemo(()=>{
    if(!history.length) return null;
    const logins=history.filter(h=>h.action==="Login");
    const logouts=history.filter(h=>h.action==="Logout");
    const first=logins.length?new Date(logins[logins.length-1].date):null;
    const last=logins.length?new Date(logins[0].date):null;
    const uniqueDays=new Set(logins.map(h=>new Date(h.date).toDateString())).size;
    // Access type breakdown
    const accessTypes={};
    logins.forEach(h=>{const t=h.accessType||"Login";accessTypes[t]=(accessTypes[t]||0)+1;});
    return {total:logins.length,logouts:logouts.length,first,last,uniqueDays,accessTypes};
  },[history]);

  // Calculate session durations (Login→next Logout = session)
  const sessionsWithDuration = useMemo(()=>{
    const sessions=[];
    const sorted=[...history].sort((a,b)=>new Date(a.date)-new Date(b.date));
    let lastLogin=null;
    for(const ev of sorted){
      if(ev.action==="Login"){
        if(lastLogin){sessions.push({...lastLogin,duration:null});}// Unclosed
        lastLogin=ev;
      } else if(ev.action==="Logout"&&lastLogin){
        const dur=Math.round((new Date(ev.date)-new Date(lastLogin.date))/60000);
        sessions.push({...lastLogin,duration:dur,logoutAt:ev.date});
        lastLogin=null;
      }
    }
    if(lastLogin) sessions.push({...lastLogin,duration:null});// Last unclosed
    return sessions.reverse();
  },[history]);

  const copyAll=()=>{
    const esc=(v)=>{const s=String(v||"");return s.includes(",")||s.includes('"')||s.includes("\n")?`"${s.replace(/"/g,'""')}"`:s;};
    const csv=["Date,Time,Action,Access Type,Operation,Session Info,Additional Info",...history.map(h=>{
      const d=new Date(h.date);
      return [d.toLocaleDateString("en-US"),d.toLocaleTimeString("en-US"),h.action,h.accessType||"",h.operation||"",h.changedata||"",h.info||""].map(esc).join(",");
    })].join("\n");
    dl("\uFEFF"+csv,"text/csv;charset=utf-8",`login_history_${selectedUser?.fullname?.replace(/\s+/g,"_")||"export"}.csv`);
  };

  return(
    <div style={{padding:bp.mobile?12:20,maxWidth:900,margin:"0 auto"}}>
      <h2 style={{fontSize:16,fontWeight:700,marginBottom:4,display:"flex",alignItems:"center",gap:8}}><I.Clock/> Login History</h2>
      <p style={{color:C.txm,fontSize:14,marginBottom:16}}>Search for a user to view their D365 login history (via Audit).</p>

      {/* User search */}
      <div style={{position:"relative",marginBottom:16}}>
        <div style={{display:"flex",gap:8,flexDirection:bp.mobile?"column":"row"}}>
          <div style={{flex:1,position:"relative"}}>
            <input value={search} onChange={e=>{setSearch(e.target.value);doSearch(e.target.value);}} placeholder="User name or email..." style={inp({fontSize:14,padding:"8px 12px 8px 32px"})}/>
            <span style={{position:"absolute",left:10,top:"50%",transform:"translateY(-50%)",color:C.txd}}><I.Search s={14}/></span>
            {loading&&<span style={{position:"absolute",right:10,top:"50%",transform:"translateY(-50%)"}}><Spin s={14}/></span>}
          </div>
          <select value={limit} onChange={e=>setLimit(+e.target.value)} style={inp({width:"auto",fontSize:13,padding:"6px 10px"})}>
            <option value={50}>Last 50</option>
            <option value={100}>Last 100</option>
            <option value={200}>Last 200</option>
            <option value={500}>Last 500</option>
          </select>
        </div>

        {/* Search results dropdown */}
        {users.length>0&&!selectedUser&&(
          <div style={{position:"absolute",top:"100%",left:0,right:0,zIndex:10,background:C.sf,border:`1px solid ${C.bd}`,borderRadius:6,marginTop:4,maxHeight:250,overflow:"auto",boxShadow:"0 8px 24px rgba(0,0,0,.4)"}}>
            {users.map(u=>(
              <button key={u.id} onClick={()=>{selectUser(u);setUsers([]);}} style={{width:"100%",display:"flex",alignItems:"center",gap:10,padding:"10px 14px",border:"none",borderBottom:`1px solid ${C.bd}`,cursor:"pointer",background:"transparent",color:C.tx,textAlign:"left"}}
                onMouseEnter={e=>e.currentTarget.style.background=C.sfh}
                onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                <div style={{width:32,height:32,borderRadius:"50%",background:u.disabled?C.rd+"33":`linear-gradient(135deg,${C.vi},${C.cy})`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,fontWeight:600,color:"white",flexShrink:0}}>
                  {u.fullname?.split(" ").map(n=>n[0]).join("").substring(0,2).toUpperCase()||"?"}
                </div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:15,fontWeight:500,display:"flex",alignItems:"center",gap:6}}>
                    {u.fullname}
                    {u.disabled&&<span style={{fontSize:11,color:C.rd,background:C.rd+"22",padding:"2px 6px",borderRadius:3}}>Disabled</span>}
                  </div>
                  <div style={{fontSize:13,color:C.txd,...mono}}>{u.email}</div>
                  {u.title&&<div style={{fontSize:12,color:C.txd}}>{u.title}</div>}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {error&&<div style={{padding:"8px 12px",background:"#991B1B33",borderRadius:8,color:C.rd,fontSize:13,marginBottom:12}}>⚠ {error}</div>}

      {/* Selected user + stats */}
      {selectedUser&&(
        <div style={{...crd({padding:14}),marginBottom:16}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:8}}>
            <div style={{display:"flex",alignItems:"center",gap:12}}>
              <div style={{width:40,height:40,borderRadius:"50%",background:`linear-gradient(135deg,${C.vi},${C.cy})`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,fontWeight:600,color:"white"}}>
                {selectedUser.fullname?.split(" ").map(n=>n[0]).join("").substring(0,2).toUpperCase()}
              </div>
              <div>
                <div style={{fontWeight:600,fontSize:14}}>{selectedUser.fullname}</div>
                <div style={{fontSize:13,color:C.txd,...mono}}>{selectedUser.email}</div>
              </div>
            </div>
            <div style={{display:"flex",gap:6}}>
              <button onClick={()=>{setSelectedUser(null);setHistory([]);setSearch("");setError("");}} style={{padding:"4px 10px",fontSize:12,border:`1px solid ${C.bd}`,borderRadius:4,cursor:"pointer",background:"transparent",color:C.txm}}>Change</button>
              <button onClick={()=>selectUser(selectedUser)} style={{padding:"4px 10px",fontSize:12,border:`1px solid ${C.bd}`,borderRadius:4,cursor:"pointer",background:"transparent",color:C.cy}}>Refresh</button>
              {history.length>0&&<button onClick={copyAll} style={{padding:"4px 10px",fontSize:12,border:`1px solid ${C.gn}44`,borderRadius:4,cursor:"pointer",background:C.gn+"22",color:C.gn,display:"flex",alignItems:"center",gap:4}}><I.Download/> Export CSV</button>}
            </div>
          </div>

          {/* Stats cards */}
          {stats&&(
            <div style={{display:"flex",flexDirection:"column",gap:8,marginTop:12}}>
              <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8}}>
                <div style={{background:C.bg,borderRadius:6,padding:"8px 10px",textAlign:"center"}}>
                  <div style={{fontSize:18,fontWeight:600,color:C.cy}}>{stats.total}</div>
                  <div style={{fontSize:11,color:C.txd}}>Logins</div>
                </div>
                <div style={{background:C.bg,borderRadius:6,padding:"8px 10px",textAlign:"center"}}>
                  <div style={{fontSize:18,fontWeight:600,color:C.gn}}>{stats.uniqueDays}</div>
                  <div style={{fontSize:11,color:C.txd}}>Active days</div>
                </div>
                <div style={{background:C.bg,borderRadius:6,padding:"8px 10px",textAlign:"center"}}>
                  <div style={{fontSize:13,fontWeight:500,color:C.gn}}>{stats.last?.toLocaleString("en-US",{month:"short",day:"2-digit",hour:"2-digit",minute:"2-digit"})}</div>
                  <div style={{fontSize:11,color:C.txd}}>Last login</div>
                </div>
                <div style={{background:C.bg,borderRadius:6,padding:"8px 10px",textAlign:"center"}}>
                  <div style={{fontSize:13,fontWeight:500,color:C.txm}}>{stats.first?.toLocaleString("en-US",{month:"short",day:"2-digit"})}</div>
                  <div style={{fontSize:11,color:C.txd}}>Oldest</div>
                </div>
              </div>
              {/* Access type breakdown */}
              {Object.keys(stats.accessTypes).length>1&&(
                <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                  {Object.entries(stats.accessTypes).map(([type,count])=>(
                    <span key={type} style={{fontSize:11,padding:"3px 10px",borderRadius:3,background:C.sfh,color:C.txm,border:`1px solid ${C.bd}`}}>{type}: <strong style={{color:C.cy}}>{count}</strong></span>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Loading */}
      {loadingHistory&&<div style={{textAlign:"center",padding:30}}><Spin/><p style={{color:C.txd,fontSize:13,marginTop:8}}>Loading history...</p></div>}

      {/* Timeline */}
      {!loadingHistory&&history.length>0&&(
        <div>
          {groupedByDay.map(([day,events])=>(
            <div key={day} style={{marginBottom:16}}>
              <div style={{fontSize:14,fontWeight:600,color:C.txm,marginBottom:6,padding:"4px 0",borderBottom:`1px solid ${C.bd}`,position:"sticky",top:0,background:C.bg,zIndex:1}}>{day} <span style={{fontWeight:400,color:C.txd}}>({events.length} events)</span></div>
              <div style={{paddingLeft:12,borderLeft:`2px solid ${C.bd}`}}>
                {events.map((ev,i)=>{
                  const d=new Date(ev.date);
                  const isLogin=ev.action==="Login";
                  // Find session duration for this login
                  const session=isLogin?sessionsWithDuration.find(s=>s.date===ev.date):null;
                  const durStr=session?.duration!=null?(session.duration<60?`${session.duration}min`:`${Math.floor(session.duration/60)}h${String(session.duration%60).padStart(2,"0")}`):null;
                  return(
                    <div key={i} style={{display:"flex",alignItems:"flex-start",gap:10,padding:"6px 0",position:"relative"}}>
                      {/* Timeline dot */}
                      <div style={{width:10,height:10,borderRadius:"50%",background:isLogin?C.gn:C.rd,flexShrink:0,marginTop:3,marginLeft:-17,border:`2px solid ${C.bg}`}}/>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                          <span style={{fontSize:14,fontWeight:500,...mono}}>{d.toLocaleTimeString("en-US",{hour:"2-digit",minute:"2-digit",second:"2-digit"})}</span>
                          <span style={{fontSize:12,padding:"2px 8px",borderRadius:3,fontWeight:600,background:isLogin?C.gn+"22":C.rd+"22",color:isLogin?C.gn:C.rd}}>{ev.action}</span>
                          {ev.accessType&&ev.accessType!=="Login"&&ev.accessType!=="Logout"&&(
                            <span style={{fontSize:11,padding:"2px 6px",borderRadius:3,background:C.sfh,color:C.txm,border:`1px solid ${C.bd}`}}>{ev.accessType}</span>
                          )}
                          {durStr&&<span style={{fontSize:11,padding:"2px 6px",borderRadius:3,background:C.cy+"22",color:C.cy,...mono}}>⏱ {durStr}</span>}
                        </div>
                        {ev.info&&<div style={{fontSize:12,color:C.txd,marginTop:2,...mono}}>{ev.info}</div>}
                        {ev.changedata&&<div style={{fontSize:11,color:C.txd,marginTop:1,...mono}}>prev: {ev.changedata}</div>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loadingHistory&&!selectedUser&&(
        <div style={{textAlign:"center",padding:40,color:C.txd}}>
          <div style={{fontSize:24,marginBottom:8}}>🔍</div>
          <div style={{fontSize:15}}>Search for a user to view their login history</div>
          <div style={{fontSize:13,marginTop:4}}>Auditing must be enabled in your D365 org</div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// RELATIONSHIP GRAPH
// ═══════════════════════════════════════════════════════════════
function RelationshipGraph({bp,orgInfo}){
  const isLive=orgInfo?.isExtension;
  const[entities,setEntities]=useState(ENTS);
  const[search,setSearch]=useState("");
  const[selEnt,setSelEnt]=useState(null);
  const[parents,setParents]=useState([]);
  const[children,setChildren]=useState([]);
  const[loading,setLoading]=useState(false);
  const[showAllP,setShowAllP]=useState(false);
  const[showAllC,setShowAllC]=useState(false);
  const containerRef=useRef(null);

  useEffect(()=>{if(isLive)bridge.getEntities().then(d=>{if(d)setEntities(d.map(e=>({l:e.logical||e.l,d:e.display||e.d,p:e.entitySet||e.p})))}).catch(()=>{});},[]);

  const handleSelect=async(e)=>{
    setSelEnt(e);setLoading(true);setShowAllP(false);setShowAllC(false);
    try{
      const[p,c]=await Promise.all([bridge.getLookups(e.l),bridge.getChildRelationships(e.l)]);
      // Deduplicate by targetEntity
      const pMap={};(p||[]).forEach(r=>{if(!pMap[r.targetEntity])pMap[r.targetEntity]={...r,count:1};else pMap[r.targetEntity].count++;});
      const cMap={};(c||[]).forEach(r=>{if(!cMap[r.targetEntity])cMap[r.targetEntity]={...r,count:1};else cMap[r.targetEntity].count++;});
      setParents(Object.values(pMap));
      setChildren(Object.values(cMap));
    }catch{}
    setLoading(false);
  };

  const filtered=entities.filter(e=>!search||e.l.includes(search.toLowerCase())||e.d?.toLowerCase().includes(search.toLowerCase()));
  const NODE_W=150,NODE_H=56,GAP=18;
  const maxP=showAllP?parents.length:Math.min(parents.length,12);
  const maxC=showAllC?children.length:Math.min(children.length,12);
  const visP=parents.slice(0,maxP);
  const visC=children.slice(0,maxC);
  const svgW=Math.max(600,Math.max(visP.length,visC.length)*(NODE_W+GAP)+GAP*2);
  const svgH=selEnt?420:0;
  const centerX=svgW/2,centerY=190;

  const renderNode=(x,y,label,sub,isCenter,onClick)=>(
    <g key={label+sub} onClick={onClick} style={{cursor:onClick?"pointer":"default"}}>
      <rect x={x-NODE_W/2} y={y} width={NODE_W} height={NODE_H} rx={8} fill={isCenter?C.vi:C.sf} stroke={isCenter?C.vi:C.bd} strokeWidth={1.5}/>
      <text x={x} y={y+22} textAnchor="middle" fill={isCenter?"white":C.tx} fontSize={12} fontWeight={600}>{label.length>18?label.substring(0,18)+"…":label}</text>
      <text x={x} y={y+38} textAnchor="middle" fill={isCenter?"rgba(255,255,255,0.6)":C.txd} fontSize={10}>{sub.length>20?sub.substring(0,20)+"…":sub}</text>
    </g>
  );

  return(
    <div style={{display:"flex",height:"100%"}}>
      {/* Entity list */}
      <div style={{width:bp.mobile?"100%":260,borderRight:`1px solid ${C.bd}`,display:"flex",flexDirection:"column",flexShrink:0}}>
        <div style={{padding:8}}><input placeholder="Search entity..." value={search} onChange={e=>setSearch(e.target.value)} style={inp({fontSize:13})}/></div>
        <div style={{flex:1,overflow:"auto",padding:"0 6px"}}>
          {filtered.slice(0,50).map(e=>(
            <button key={e.l} onClick={()=>handleSelect(e)} style={{width:"100%",textAlign:"left",padding:"6px 8px",border:"none",borderRadius:5,cursor:"pointer",marginBottom:1,background:selEnt?.l===e.l?C.sfa:"transparent",color:selEnt?.l===e.l?C.tx:C.txm,fontSize:13,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div><div style={{fontWeight:selEnt?.l===e.l?600:400}}>{e.d||e.l}</div><div style={{fontSize:11,color:C.txd}}>{e.l}</div></div>
            </button>
          ))}
        </div>
      </div>
      {/* Graph area */}
      <div ref={containerRef} style={{flex:1,overflow:"auto",padding:20}}>
        {!selEnt&&<div style={{textAlign:"center",color:C.txd,marginTop:60}}>Select an entity to view its relationships</div>}
        {selEnt&&loading&&<div style={{textAlign:"center",marginTop:60}}><Spin s={20}/></div>}
        {selEnt&&!loading&&(
          <div>
            <div style={{textAlign:"center",marginBottom:12}}>
              <span style={{fontSize:16,fontWeight:700}}>{selEnt.d||selEnt.l}</span>
              <span style={{color:C.txd,marginLeft:8,fontSize:13}}>{parents.length} parent{parents.length!==1?"s":""} · {children.length} child{children.length!==1?"ren":""}</span>
            </div>
            <div style={{overflowX:"auto"}}>
              <svg width={svgW} height={svgH} style={{display:"block",margin:"0 auto"}}>
                <defs>
                  <marker id="arrowDown" viewBox="0 0 10 10" refX="5" refY="10" markerWidth={8} markerHeight={8} orient="auto"><path d="M0,0 L5,10 L10,0" fill={C.cy}/></marker>
                  <marker id="arrowUp" viewBox="0 0 10 10" refX="5" refY="0" markerWidth={8} markerHeight={8} orient="auto"><path d="M0,10 L5,0 L10,10" fill={C.or}/></marker>
                </defs>
                {/* Arrows to parents */}
                {visP.map((p,i)=>{
                  const px=centerX-((visP.length-1)*(NODE_W+GAP))/2+i*(NODE_W+GAP);
                  return <line key={"lp"+i} x1={centerX} y1={centerY} x2={px} y2={40+NODE_H} stroke={C.or} strokeWidth={1.5} strokeDasharray="6,3" markerEnd="url(#arrowUp)"/>;
                })}
                {/* Arrows to children */}
                {visC.map((c,i)=>{
                  const cx=centerX-((visC.length-1)*(NODE_W+GAP))/2+i*(NODE_W+GAP);
                  return <line key={"lc"+i} x1={centerX} y1={centerY+NODE_H} x2={cx} y2={340} stroke={C.cy} strokeWidth={1.5} strokeDasharray="6,3" markerEnd="url(#arrowDown)"/>;
                })}
                {/* Parent nodes */}
                {visP.map((p,i)=>{
                  const px=centerX-((visP.length-1)*(NODE_W+GAP))/2+i*(NODE_W+GAP);
                  return renderNode(px,40,p.targetEntity,p.lookupField+(p.count>1?` (×${p.count})`:""),false,()=>handleSelect({l:p.targetEntity,d:p.targetEntity}));
                })}
                {/* Center node */}
                {renderNode(centerX,centerY,selEnt.d||selEnt.l,selEnt.l,true,null)}
                {/* Child nodes */}
                {visC.map((c,i)=>{
                  const cx=centerX-((visC.length-1)*(NODE_W+GAP))/2+i*(NODE_W+GAP);
                  return renderNode(cx,340,c.targetEntity,c.lookupField+(c.count>1?` (×${c.count})`:""),false,()=>handleSelect({l:c.targetEntity,d:c.targetEntity}));
                })}
                {/* Labels: N:1 / 1:N */}
                <text x={20} y={40+NODE_H/2} fill={C.or} fontSize={11} fontWeight={700}>N:1 Parents ↑</text>
                <text x={20} y={340+NODE_H/2} fill={C.cy} fontSize={11} fontWeight={700}>1:N Children ↓</text>
              </svg>
            </div>
            {parents.length>12&&!showAllP&&<button onClick={()=>setShowAllP(true)} style={bt(null,{margin:"8px auto",display:"block",fontSize:12})}>Show all {parents.length} parents</button>}
            {children.length>12&&!showAllC&&<button onClick={()=>setShowAllC(true)} style={bt(null,{margin:"8px auto",display:"block",fontSize:12})}>Show all {children.length} children</button>}
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// SOLUTION EXPLORER
// ═══════════════════════════════════════════════════════════════
const COMP_TYPES={1:{l:"Entity",i:"📋"},2:{l:"Attribute",i:"🔤"},9:{l:"OptionSet",i:"📊"},10:{l:"Relationship",i:"🔗"},26:{l:"View",i:"👁"},29:{l:"Message",i:"💬"},31:{l:"Message Filter",i:"🔍"},59:{l:"Chart",i:"📈"},60:{l:"Web Resource",i:"🌐"},61:{l:"Sitemap",i:"🗺"},62:{l:"Connection Role",i:"🔌"},63:{l:"Security Role",i:"🛡"},65:{l:"Field Security",i:"🔒"},66:{l:"Entity Key",i:"🔑"},91:{l:"Plugin Type",i:"⚙"},92:{l:"Plugin Assembly",i:"🔧"},95:{l:"SDK Step",i:"📍"},300:{l:"Canvas App",i:"🎨"},371:{l:"Connector",i:"🔌"}};

function SolutionExplorer({bp,orgInfo}){
  const isLive=orgInfo?.isExtension;
  const[solutions,setSolutions]=useState([]);
  const[search,setSearch]=useState("");
  const[selSol,setSelSol]=useState(null);
  const[components,setComponents]=useState([]);
  const[loading,setLoading]=useState(true);
  const[loadingComp,setLoadingComp]=useState(false);
  const[collapsed,setCollapsed]=useState({});

  useEffect(()=>{bridge.getSolutions().then(d=>{setSolutions(d||[]);setLoading(false);}).catch(()=>setLoading(false));},[]);

  const handleSelect=async(sol)=>{
    setSelSol(sol);setLoadingComp(true);setCollapsed({});
    try{const d=await bridge.getSolutionComponents(sol.id);setComponents(d||[]);}catch{setComponents([]);}
    setLoadingComp(false);
  };

  const grouped=useMemo(()=>{
    const map={};
    components.forEach(c=>{
      const t=c.type;
      const def=COMP_TYPES[t]||{l:`Type ${t}`,i:"?"};
      if(!map[t])map[t]={...def,items:[]};
      map[t].items.push(c);
    });
    return Object.entries(map).sort((a,b)=>a[1].l.localeCompare(b[1].l));
  },[components]);

  const filtered=solutions.filter(s=>!search||s.displayName.toLowerCase().includes(search.toLowerCase())||s.uniqueName.toLowerCase().includes(search.toLowerCase()));

  return(
    <div style={{display:"flex",height:"100%"}}>
      {/* Solution list */}
      <div style={{width:bp.mobile?"100%":280,borderRight:`1px solid ${C.bd}`,display:"flex",flexDirection:"column",flexShrink:0}}>
        <div style={{padding:"12px 10px",borderBottom:`1px solid ${C.bd}`}}>
          <div style={{fontSize:16,fontWeight:700,marginBottom:8}}>Solutions</div>
          <input placeholder="Search..." value={search} onChange={e=>setSearch(e.target.value)} style={inp({fontSize:13})}/>
        </div>
        <div style={{flex:1,overflow:"auto",padding:"4px 6px"}}>
          {loading&&<div style={{textAlign:"center",padding:20}}><Spin/></div>}
          {filtered.map(s=>(
            <button key={s.id} onClick={()=>handleSelect(s)} style={{width:"100%",textAlign:"left",padding:"8px 10px",border:"none",borderRadius:6,cursor:"pointer",marginBottom:2,background:selSol?.id===s.id?C.sfa:"transparent",color:selSol?.id===s.id?C.tx:C.txm}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <span style={{fontWeight:selSol?.id===s.id?600:400,fontSize:13}}>{s.displayName}</span>
                <span style={{fontSize:10,padding:"2px 6px",borderRadius:4,background:s.isManaged?C.vid:C.gnd,color:s.isManaged?C.vi:C.gn}}>{s.isManaged?"Managed":"Unmanaged"}</span>
              </div>
              <div style={{fontSize:11,color:C.txd,...mono}}>{s.uniqueName} · v{s.version}</div>
            </button>
          ))}
        </div>
      </div>
      {/* Components */}
      <div style={{flex:1,overflow:"auto",padding:20}}>
        {!selSol&&<div style={{textAlign:"center",color:C.txd,marginTop:60}}>Select a solution to browse its components</div>}
        {selSol&&loadingComp&&<div style={{textAlign:"center",marginTop:60}}><Spin s={20}/></div>}
        {selSol&&!loadingComp&&(
          <div>
            <div style={{marginBottom:16}}>
              <div style={{fontSize:18,fontWeight:700}}>{selSol.displayName}</div>
              <div style={{fontSize:13,color:C.txd,...mono}}>{selSol.uniqueName} · v{selSol.version} · {components.length} components</div>
              {selSol.description&&<div style={{fontSize:13,color:C.txm,marginTop:4}}>{selSol.description}</div>}
            </div>
            {grouped.map(([typeKey,group])=>{
              const isOpen=!collapsed[typeKey];
              return(
                <div key={typeKey} style={{marginBottom:6,...crd({overflow:"hidden"})}}>
                  <button onClick={()=>setCollapsed(p=>({...p,[typeKey]:!p[typeKey]}))} style={{width:"100%",display:"flex",alignItems:"center",gap:8,padding:"10px 14px",border:"none",background:C.sfh,cursor:"pointer",color:C.tx,fontSize:14,fontWeight:600}}>
                    <span>{group.i}</span>
                    <span>{group.l}</span>
                    <span style={{fontSize:12,color:C.txd,fontWeight:400,marginLeft:"auto"}}>{group.items.length}</span>
                    <span style={{color:C.txd,transform:isOpen?"rotate(90deg)":"rotate(0)",transition:"transform .15s"}}>▸</span>
                  </button>
                  {isOpen&&(
                    <div style={{padding:"4px 14px 8px"}}>
                      {group.items.map((item,i)=>(
                        <div key={item.id||i} style={{padding:"3px 0",fontSize:12,color:C.txm,...mono,borderBottom:i<group.items.length-1?`1px solid ${C.bd}22`:""}}>{item.objectId}</div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// TRANSLATION MANAGER
// ═══════════════════════════════════════════════════════════════
function TranslationManager({bp,orgInfo}){
  const isLive=orgInfo?.isExtension;
  const[entities,setEntities]=useState(ENTS);
  const[search,setSearch]=useState("");
  const[selEnt,setSelEnt]=useState(null);
  const[languages,setLanguages]=useState([]);
  const[selLangs,setSelLangs]=useState([]);
  const[attributes,setAttributes]=useState([]);
  const[edits,setEdits]=useState({});
  const[loading,setLoading]=useState(false);
  const[saving,setSaving]=useState(false);
  const[saveMsg,setSaveMsg]=useState(null);
  const[attrSearch,setAttrSearch]=useState("");
  const fRef=useRef(null);

  useEffect(()=>{
    bridge.getOrgLanguages().then(d=>{if(d){setLanguages(d);setSelLangs(d.map(l=>l.code));}}).catch(()=>{});
    if(isLive)bridge.getEntities().then(d=>{if(d)setEntities(d.map(e=>({l:e.logical||e.l,d:e.display||e.d})))}).catch(()=>{});
  },[]);

  const handleSelect=async(e)=>{
    setSelEnt(e);setLoading(true);setEdits({});setSaveMsg(null);
    try{const d=await bridge.getAttributeLabels(e.l);setAttributes(d||[]);}catch{setAttributes([]);}
    setLoading(false);
  };

  const handleEdit=(attrLogical,langCode,value)=>{
    setEdits(prev=>({...prev,[attrLogical]:{...(prev[attrLogical]||{}),[langCode]:value}}));
  };

  const editCount=Object.keys(edits).reduce((n,k)=>n+Object.keys(edits[k]).length,0);

  const handleSave=async()=>{
    if(!selEnt||editCount===0)return;
    setSaving(true);setSaveMsg(null);
    let ok=0,fail=0;
    for(const[attrName,langEdits] of Object.entries(edits)){
      const attr=attributes.find(a=>a.logical===attrName);
      if(!attr)continue;
      // Build full labels array: existing + edited
      const labelsMap={};
      attr.labels.forEach(l=>{labelsMap[l.languageCode]={Label:l.label,LanguageCode:l.languageCode};});
      Object.entries(langEdits).forEach(([code,val])=>{labelsMap[+code]={Label:val,LanguageCode:+code};});
      try{await bridge.updateAttributeLabel(selEnt.l,attrName,Object.values(labelsMap));ok++;}catch{fail++;}
    }
    if(ok>0){try{await bridge.publishEntity(selEnt.l);}catch{}}
    setSaveMsg(`${ok} updated${fail?`, ${fail} failed`:""}`);
    setEdits({});
    // Reload
    try{const d=await bridge.getAttributeLabels(selEnt.l);setAttributes(d||[]);}catch{}
    setSaving(false);
  };

  const exportCSV=()=>{
    if(!selEnt||!attributes.length)return;
    const codes=selLangs;
    const header=["logical_name","type",...codes.map(c=>`label_${c}`)].join(",");
    const rows=attributes.map(a=>{
      const vals=[a.logical,a.type];
      codes.forEach(c=>{const lbl=a.labels.find(l=>l.languageCode===c)?.label||"";vals.push(`"${lbl.replace(/"/g,'""')}"`)});
      return vals.join(",");
    });
    dl("\uFEFF"+header+"\n"+rows.join("\n"),"text/csv;charset=utf-8",`${selEnt.l}_translations.csv`);
  };

  const handleImport=(text)=>{
    const lines=text.split("\n").filter(l=>l.trim());
    if(lines.length<2)return;
    const headers=lines[0].split(",").map(h=>h.trim().replace(/^"|"$/g,""));
    const langCols=headers.map((h,i)=>{const m=h.match(/^label_(\d+)$/);return m?{idx:i,code:+m[1]}:null;}).filter(Boolean);
    const logIdx=headers.indexOf("logical_name");
    if(logIdx===-1)return;
    const newEdits={};
    for(let i=1;i<lines.length;i++){
      const cells=lines[i].match(/(".*?"|[^,]*)/g)?.map(c=>c.replace(/^"|"$/g,"").replace(/""/g,'"'))||[];
      const logical=cells[logIdx]?.trim();
      if(!logical)continue;
      const attr=attributes.find(a=>a.logical===logical);
      if(!attr)continue;
      langCols.forEach(({idx,code})=>{
        const val=cells[idx]?.trim()||"";
        const existing=attr.labels.find(l=>l.languageCode===code)?.label||"";
        if(val&&val!==existing){if(!newEdits[logical])newEdits[logical]={};newEdits[logical][code]=val;}
      });
    }
    setEdits(newEdits);
    setSaveMsg(`Imported ${Object.keys(newEdits).length} changes from CSV`);
  };

  const filteredAttrs=attributes.filter(a=>!attrSearch||a.logical.includes(attrSearch.toLowerCase())||a.labels.some(l=>l.label.toLowerCase().includes(attrSearch.toLowerCase())));

  const filtered=entities.filter(e=>!search||e.l.includes(search.toLowerCase())||e.d?.toLowerCase().includes(search.toLowerCase()));

  return(
    <div style={{display:"flex",height:"100%"}}>
      {/* Entity list */}
      <div style={{width:bp.mobile?"100%":260,borderRight:`1px solid ${C.bd}`,display:"flex",flexDirection:"column",flexShrink:0}}>
        <div style={{padding:8}}><input placeholder="Search entity..." value={search} onChange={e=>setSearch(e.target.value)} style={inp({fontSize:13})}/></div>
        <div style={{flex:1,overflow:"auto",padding:"0 6px"}}>
          {filtered.slice(0,50).map(e=>(
            <button key={e.l} onClick={()=>handleSelect(e)} style={{width:"100%",textAlign:"left",padding:"6px 8px",border:"none",borderRadius:5,cursor:"pointer",marginBottom:1,background:selEnt?.l===e.l?C.sfa:"transparent",color:selEnt?.l===e.l?C.tx:C.txm,fontSize:13}}>
              <div style={{fontWeight:selEnt?.l===e.l?600:400}}>{e.d||e.l}</div>
              <div style={{fontSize:11,color:C.txd}}>{e.l}</div>
            </button>
          ))}
        </div>
      </div>
      {/* Translation table */}
      <div style={{flex:1,overflow:"auto",padding:16}}>
        {!selEnt&&<div style={{textAlign:"center",color:C.txd,marginTop:60}}>Select an entity to manage translations</div>}
        {selEnt&&loading&&<div style={{textAlign:"center",marginTop:60}}><Spin s={20}/></div>}
        {selEnt&&!loading&&(
          <div>
            {/* Header */}
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12,flexWrap:"wrap",gap:8}}>
              <div>
                <span style={{fontSize:16,fontWeight:700}}>{selEnt.d||selEnt.l}</span>
                <span style={{color:C.txd,marginLeft:8,fontSize:13}}>{attributes.length} attributes · {languages.length} languages</span>
              </div>
              <div style={{display:"flex",gap:6,alignItems:"center"}}>
                {saveMsg&&<span style={{fontSize:12,color:C.gn}}>{saveMsg}</span>}
                <button onClick={exportCSV} style={bt(null,{fontSize:12})}><I.Download/> Export CSV</button>
                <input ref={fRef} type="file" accept=".csv" style={{display:"none"}} onChange={e=>{const f=e.target.files?.[0];if(f){const r=new FileReader();r.onload=ev=>handleImport(ev.target.result);r.readAsText(f);}}}/>
                <button onClick={()=>fRef.current?.click()} style={bt(null,{fontSize:12})}><I.Upload/> Import CSV</button>
                <button onClick={handleSave} disabled={editCount===0||saving} style={bt(editCount>0?C.vi:C.sfh,{fontSize:12,opacity:editCount===0?.5:1})}>{saving?<Spin s={12}/>:null} Save {editCount>0?`(${editCount})`:""}</button>
              </div>
            </div>
            {/* Language toggles */}
            <div style={{display:"flex",gap:6,marginBottom:10,flexWrap:"wrap"}}>
              {languages.map(lang=>(
                <label key={lang.code} style={{display:"flex",alignItems:"center",gap:4,fontSize:12,color:selLangs.includes(lang.code)?C.tx:C.txd,cursor:"pointer"}}>
                  <input type="checkbox" checked={selLangs.includes(lang.code)} onChange={e=>{if(e.target.checked)setSelLangs(p=>[...p,lang.code]);else setSelLangs(p=>p.filter(c=>c!==lang.code));}}/>
                  {lang.name} ({lang.code})
                </label>
              ))}
            </div>
            {/* Search */}
            <input placeholder="Filter attributes..." value={attrSearch} onChange={e=>setAttrSearch(e.target.value)} style={inp({fontSize:12,marginBottom:8,maxWidth:300})}/>
            {/* Table */}
            <div style={{overflowX:"auto",...crd()}}>
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
                <thead>
                  <tr>
                    <th style={ths()}>Logical Name</th>
                    <th style={ths()}>Type</th>
                    {selLangs.map(code=><th key={code} style={ths()}>{languages.find(l=>l.code===code)?.name||code}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {filteredAttrs.map((attr,ri)=>(
                    <tr key={attr.logical} style={{borderBottom:`1px solid ${C.bd}22`,background:ri%2===0?"transparent":C.sfh+"33"}}>
                      <td style={{...tds,...mono,fontSize:12,color:C.vi}}>{attr.logical}</td>
                      <td style={{...tds,fontSize:12,color:C.txd}}>{displayType(attr.type)}</td>
                      {selLangs.map(code=>{
                        const existing=attr.labels.find(l=>l.languageCode===code)?.label||"";
                        const edited=edits[attr.logical]?.[code];
                        const val=edited!==undefined?edited:existing;
                        return(
                          <td key={code} style={{padding:"2px 4px"}}>
                            <input value={val} onChange={e=>handleEdit(attr.logical,code,e.target.value)} style={inp({fontSize:12,padding:"3px 6px",borderColor:edited!==undefined?C.yw:C.bd,...mono})}/>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// DATA LOADER (with paste-from-Excel feature)
// ═══════════════════════════════════════════════════════════════
function Loader({bp,orgInfo}){
  const[step,setStep]=useState(0);const[csvFile,setCsvFile]=useState(null);const[csvData,setCsvData]=useState({h:[],r:[]});const[target,setTarget]=useState("account");const[maps,setMaps]=useState([]);const[lookups,setLookups]=useState([]);const[uKey,setUKey]=useState({d:"",c:""});const[result,setResult]=useState(null);const[dragOn,setDragOn]=useState(false);const[pasteMode,setPasteMode]=useState(false);const[pasteText,setPasteText]=useState("");const fRef=useRef(null);

  const parseData=(text,delimiter=",")=>{
    const lines=text.split("\n").filter(l=>l.trim());
    if(lines.length<2)return;
    const sep=delimiter==="auto"?(lines[0].includes("\t")?"\t":","):delimiter;
    const headers=lines[0].split(sep).map(h=>h.trim().replace(/"/g,"").replace(/^\uFEFF/,"")); // strip BOM
    const rows=lines.slice(1).map(line=>{const vals=line.split(sep).map(v=>v.trim().replace(/"/g,""));const obj={};headers.forEach((h,i)=>obj[h]=vals[i]||"");return obj;});
    setCsvData({h:headers,r:rows});

    // Auto-mapping: detect D365 native names + common CRM field names
    const commonMapping={firstname:"firstname",lastname:"lastname",email:"emailaddress1",phone:"telephone1",title:"jobtitle",mailingstreet:"address1_line1",mailingcity:"address1_city",mailingpostalcode:"address1_postalcode",mailingcountry:"address1_country",name:"name",accountnumber:"accountnumber",description:"description",website:"websiteurl",fax:"fax"};
    const d365Set=new Set(targetFields);

    // Read-only system fields: never send in CREATE/UPSERT (computed by D365)
    const SKIP_FIELDS=new Set(["createdon","modifiedon","createdby","modifiedby","owningbusinessunit","owningteam","owninguser","versionnumber","importsequencenumber","overriddencreatedon","timezoneruleversionnumber","utcconversiontimezonecode"]);

    // Auto-detect: columns ending with 'id' where values look like GUIDs → lookup candidates "id" where values look like GUIDs → lookup candidates
    const GUID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const primaryKey=(target+"id").toLowerCase(); // e.g. "accountid"
    const lookupCols=new Set();
    const autoLookups=[];

    headers.filter(h=>!h.includes(".")).forEach(h=>{
      const low=h.toLowerCase();
      // Primary key column: don't auto-map: don't auto-map (used for UPSERT key, not as a field)
      if(low===primaryKey) return;
      // Check if this looks like a lookup (ends with "id", values are GUIDs)
      if(low.endsWith("id") && low!==primaryKey){
        const sample=rows[0]?.[h];
        if(sample && GUID_RE.test(sample)){
          lookupCols.add(h);
          // Extract entity name from field (parentaccountid → account, ownerid → systemuser)
          const entName=low.replace(/id$/,"").replace(/^_/,"").replace(/_value$/,"");
          const knownLookups={"parentaccountid":"account","parentcontactid":"contact","ownerid":"systemuser","owningbusinessunit":"businessunit","transactioncurrencyid":"transactioncurrency","primarycontactid":"contact"};
          const targetEnt=knownLookups[low]||entName;
          autoLookups.push({src:"",csv:h,entity:targetEnt,nav:low,d365f:"",fb:"skip",mode:"direct"});
        }
      }
    });

    setMaps(headers.filter(h=>!h.includes(".")).map(h=>{
      const low=h.toLowerCase();
      // Skip system fields
      if(SKIP_FIELDS.has(low)) return {csv:h,d365:"",transform:"",skip:true};
      // Skip primary key (used for UPSERT key) (handled separately as UPSERT key)
      if(low===primaryKey) return {csv:h,d365:"",transform:"",skip:true,isPK:true};
      // Skip auto-detected lookup columns (handled in Lookups step)
      if(lookupCols.has(h)) return {csv:h,d365:"",transform:"",skip:true,isLookup:true};
      // Auto-detect statecode/statuscode
      if(low==="statecode") return {csv:h,d365:"statecode",transform:"statecode"};
      if(low==="statuscode") return {csv:h,d365:"statuscode",transform:"int"};
      // Direct match: CSV column IS a D365 field name
      if(d365Set.has(low)) return {csv:h,d365:low,transform:""};
      if(d365Set.has(h)) return {csv:h,d365:h,transform:""};
      if(commonMapping[low]) return {csv:h,d365:commonMapping[low],transform:""};
      return {csv:h,d365:"",transform:""};
    }));

    const parents=new Set();const lks=[...autoLookups];
    headers.filter(h=>h.includes(".")).forEach(col=>{const p=col.split(".")[0];if(!parents.has(p)){parents.add(p);lks.push({src:p+"Id",csv:col,entity:p.toLowerCase(),nav:`parentcustomerid_${p.toLowerCase()}`,d365f:"",fb:"skip",mode:"resolve"});}});
    setLookups(lks);setStep(1);
  };

  const handleFile=useCallback((e)=>{e.preventDefault();setDragOn(false);const f=e.dataTransfer?.files?.[0]||e.target?.files?.[0];if(!f)return;setCsvFile(f);const reader=new FileReader();reader.onload=(ev)=>parseData(ev.target.result);reader.readAsText(f);},[]);

  const handlePaste=()=>{if(pasteText.trim()){setCsvFile({name:"clipboard_data.csv"});parseData(pasteText,"auto");}};

  const isLive = orgInfo?.isExtension;
  const[loadProgress,setLoadProgress]=useState({done:0,total:0,current:""});
  const[liveEntities,setLiveEntities]=useState([]);

  // Load real entities for target selector
  useEffect(()=>{
    if(!isLive) return;
    bridge.getEntities().then(data=>{
      if(data&&Array.isArray(data)){
        setLiveEntities(data.map(e=>({l:e.logical,d:e.display,p:e.entitySet||e.logical+"s",i:e.isCustom?"⚙️":"📋"})).sort((a,b)=>a.d.localeCompare(b.d)));
      }
    }).catch(()=>{});
  },[isLive]);

  const entityList = liveEntities.length > 0 ? liveEntities : ENTS;
  const[targetFields,setTargetFields]=useState(D365CF);

  // Load fields when target entity changes
  useEffect(()=>{
    if(!isLive||!target) return;
    bridge.getFields(target).then(data=>{
      if(data&&Array.isArray(data)){
        setTargetFields(data.map(f=>f.logical||f.l).sort());
      }
    }).catch(()=>{});
  },[isLive,target]);

  // Transform a CSV value based on type
  // ── Transco maps for common D365 fields ──
  const STATECODE_MAP={"active":0,"inactive":1,"actif":0,"inactif":1,"0":0,"1":1};
  const BOOLEAN_YESNO={"yes":true,"no":false,"oui":true,"non":false,"true":true,"false":false,"1":true,"0":false,"vrai":true,"faux":false};

  const applyTransform=(val,transform)=>{
    if(val===undefined||val===null||val==="") return null;
    const low=String(val).toLowerCase().trim();
    switch(transform){
      case "statecode": {
        if(STATECODE_MAP[low]!==undefined) return STATECODE_MAP[low];
        const n=parseInt(val,10);
        return isNaN(n)?null:n; // If not a known label, try as int
      }
      case "picklist": {
        // Try as int first, if NaN return null (user needs to fix the CSV)
        const n=parseInt(val,10);
        return isNaN(n)?null:n;
      }
      case "boolean_yesno": {
        if(BOOLEAN_YESNO[low]!==undefined) return BOOLEAN_YESNO[low];
        return null;
      }
      case "boolean": return low==="true"||low==="1"||low==="oui"||low==="yes";
      case "int": { const n=parseInt(val,10); return isNaN(n)?null:n; }
      case "float": { const n=parseFloat(val); return isNaN(n)?null:n; }
      case "date_iso": { try{ return new Date(val).toISOString(); }catch{ return null; } }
      case "upper": return val.toUpperCase();
      case "lower": return val.toLowerCase();
      default: return val;
    }
  };

  // Resolve lookup: find GUID by querying D365
  const resolveLookup=async(lk, value)=>{
    if(!value||!lk.entity||!lk.d365f) return null;
    try{
      const escaped=value.replace(/'/g,"''");
      const data=await bridge.query(`${lk.entity}s`,{filter:`${lk.d365f} eq '${escaped}'`,top:"1",select:`${lk.entity}id`});
      if(data?.records?.length>0){
        const rec=data.records[0];
        const idKey=Object.keys(rec).find(k=>k.endsWith("id")&&!k.includes("@"))||`${lk.entity}id`;
        return rec[idKey];
      }
    }catch{}
    return null;
  };

  const doLoad=async()=>{
    setStep(4);setResult(null);
    const rows=csvData.r;
    const SYSTEM_FIELDS=new Set(["createdon","modifiedon","createdby","modifiedby","owningbusinessunit","owningteam","owninguser","versionnumber","importsequencenumber","overriddencreatedon","timezoneruleversionnumber","utcconversiontimezonecode"]);
    const activeMaps=maps.filter(m=>m.d365 && !m.skip && !SYSTEM_FIELDS.has(m.d365.toLowerCase()));
    const total=rows.length;
    let created=0,updated=0,skipped=0;
    const errors=[];
    const logEntries=[]; // Full log: {row, status, detail, d365Id}

    if(!isLive){
      // Mock mode
      setTimeout(()=>setResult({created:total-1,updated:1,errors:[],skipped:0,elapsed:"2.1"}),2000);
      return;
    }

    // 1. Pre-resolve lookups (batch: get all unique values per lookup)
    const lookupCache={};// key: "entity.field.value" → GUID
    for(const lk of lookups){
      if(lk.mode==="direct") continue; // Direct GUID: no resolution needed
      if(!lk.csv||!lk.entity||!lk.d365f) continue;
      const uniqueVals=[...new Set(rows.map(r=>r[lk.csv]).filter(Boolean))];
      setLoadProgress({done:0,total,current:`Resolving lookups ${lk.entity} (${uniqueVals.length} values)...`});
      for(const val of uniqueVals){
        const guid=await resolveLookup(lk,val);
        lookupCache[`${lk.entity}.${lk.d365f}.${val}`]=guid;
      }
    }

    // 2. Build all records first (client-side), then send as batch
    const targetEnt = entityList.find(e => e.l === target);
    const entitySet = targetEnt?.p || target+"s";
    const startTime=Date.now();
    const createRecords=[];
    const upsertItems=[];

    setLoadProgress({done:0,total,current:"Preparing records..."});

    for(let i=0;i<rows.length;i++){
      const row=rows[i];
      const rec={};

      try{
        // Map fields — skip empty values
        for(const m of activeMaps){
          if(!m.d365) continue;
          const rawVal = row[m.csv];
          if(rawVal === undefined || rawVal === null || rawVal === "") continue;
          const val=applyTransform(rawVal,m.transform);
          if(val!==null && val!==undefined && val!=="") rec[m.d365]=val;
        }

        // Resolve lookups → @odata.bind
        let skipRow=false;
        for(const lk of lookups){
          if(!lk.csv||!lk.nav) continue;
          const val=row[lk.csv];
          if(!val){
            if(lk.fb==="error"){ errors.push({row:i+1,msg:`Empty lookup: ${lk.csv}`});logEntries.push({row:i+1,status:"ERROR",detail:`Empty lookup: ${lk.csv}`,d365Id:""});skipRow=true;break; }
            continue;
          }
          if(lk.mode==="direct"){
            // Value is already a GUID — use directly
            rec[`${lk.nav}@odata.bind`]=`/${lk.entity}s(${val})`;
          } else {
            const guid=lookupCache[`${lk.entity}.${lk.d365f}.${val}`];
            if(guid){
              rec[`${lk.nav}@odata.bind`]=`/${lk.entity}s(${guid})`;
            } else {
              if(lk.fb==="error"){ errors.push({row:i+1,msg:`Lookup not found: ${lk.csv}="${val}"`});logEntries.push({row:i+1,status:"ERROR",detail:`Lookup not found: ${lk.csv}="${val}"`,d365Id:""});skipRow=true;break; }
              if(lk.fb==="skip"){ skipped++;logEntries.push({row:i+1,status:"SKIPPED",detail:`Lookup not resolved: ${lk.csv}="${val}"`,d365Id:""});skipRow=true;break; }
            }
          }
        }
        if(skipRow) continue;

        if(uKey.d && uKey.c && row[uKey.c]){
          rec[uKey.d]=row[uKey.c];
          upsertItems.push({keyValue:row[uKey.c],record:rec});
        } else {
          createRecords.push(rec);
        }
      }catch(e){
        errors.push({row:i+1,msg:e.message?.substring(0,500)||"Error",payload:JSON.stringify(rec).substring(0,200)});
        logEntries.push({row:i+1,status:"ERROR",detail:e.message?.substring(0,200)||"Error",d365Id:""});
      }
    }


    // 3. Send batch in ONE message (avoids Chrome message relay timeout)
    if(createRecords.length>0){
      setLoadProgress({done:0,total:createRecords.length,current:`Sending ${createRecords.length} records (CREATE)...`});
      try{
        const res=await bridge.batchCreate(entitySet,createRecords);
        created=res.created||0;
        for(let j=0;j<created;j++) logEntries.push({row:j+1,status:"CREATED",detail:"OK",d365Id:""});
        if(res.errors){ res.errors.forEach(e=>{errors.push({...e,payload:""});logEntries.push({row:e.row||0,status:"ERROR",detail:e.msg||"Batch error",d365Id:""});}); }
      }catch(e){
        errors.push({row:0,msg:`Batch CREATE failed: ${e.message}`,payload:""});
      }
    }

    if(upsertItems.length>0){
      setLoadProgress({done:createRecords.length,total:total,current:`Sending ${upsertItems.length} records (UPSERT)...`});
      try{
        const isPK = uKey.d.toLowerCase() === target + "id";
        const res=await bridge.batchUpsert(entitySet,uKey.d,upsertItems,isPK);
        updated=res.updated||0;
        for(let j=0;j<updated;j++) logEntries.push({row:createRecords.length+j+1,status:"UPSERTED",detail:"OK",d365Id:""});
        if(res.errors){ res.errors.forEach(e=>{errors.push({...e,payload:""});logEntries.push({row:e.row||0,status:"ERROR",detail:e.msg||"Batch error",d365Id:""});}); }
      }catch(e){
        errors.push({row:0,msg:`Batch UPSERT failed: ${e.message}`,payload:""});
      }
    }

    const elapsed=((Date.now()-startTime)/1000).toFixed(1);
    setResult({created,updated,errors,skipped,elapsed,log:logEntries,entity:target,totalRows:total});
    setLoadProgress({done:total,total,current:"Done"});
  };
  const steps=[{l:"Source",i:"📄"},{l:"Mapping",i:"🔗"},{l:"Lookups",i:"🔍"},{l:"Preview",i:"👁"},{l:"Run",i:"🚀"}];

  return(
    <div style={{padding:bp.mobile?12:20,maxWidth:1100,margin:"0 auto"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:0,marginBottom:bp.mobile?14:22,flexWrap:"wrap"}}>
        {steps.map((s,i)=><div key={i} style={{display:"flex",alignItems:"center"}}><button onClick={()=>i<=step&&setStep(i)} style={{display:"flex",alignItems:"center",gap:3,padding:bp.mobile?"4px 6px":"5px 10px",borderRadius:5,cursor:i<=step?"pointer":"default",background:i===step?C.sfa:"transparent",border:`1px solid ${i===step?C.vi:i<step?C.gnd:C.bd}`,fontSize:bp.mobile?10:11,color:i<=step?C.tx:C.txd,fontWeight:i===step?600:400}}><span style={{fontSize:bp.mobile?10:12}}>{i<step?"✅":s.i}</span>{(!bp.mobile||i===step)&&<span>{s.l}</span>}</button>{i<4&&<div style={{width:bp.mobile?6:14,height:1,background:i<step?C.gn:C.bd,margin:"0 2px"}}/>}</div>)}
      </div>

      {step===0&&(
        <div>
          {/* Toggle: File vs Paste */}
          <div style={{display:"flex",gap:0,marginBottom:14,background:C.sf,borderRadius:8,border:`1px solid ${C.bd}`,overflow:"hidden"}}>
            {[{id:false,label:"📂 CSV File",desc:"Drag & drop or select"},{id:true,label:"📋 Paste from Excel",desc:"Ctrl+V directly"}].map(m=>(
              <button key={String(m.id)} onClick={()=>setPasteMode(m.id)} style={{flex:1,padding:"12px 0",border:"none",cursor:"pointer",transition:"all .15s",background:pasteMode===m.id?C.sfa:"transparent",color:pasteMode===m.id?C.tx:C.txd}}>
                <div style={{fontSize:15,fontWeight:pasteMode===m.id?600:400}}>{m.label}</div>
                <div style={{fontSize:12,color:C.txd,marginTop:2}}>{m.desc}</div>
              </button>
            ))}
          </div>

          {!pasteMode?(
            <div onDragOver={e=>{e.preventDefault();setDragOn(true);}} onDragLeave={()=>setDragOn(false)} onDrop={handleFile} onClick={()=>fRef.current?.click()} style={{border:`2px dashed ${dragOn?C.vi:C.bd}`,borderRadius:12,padding:bp.mobile?"32px 16px":"48px 40px",textAlign:"center",cursor:"pointer",background:dragOn?C.sfa:C.sf}}>
              <input ref={fRef} type="file" accept=".csv,.tsv,.txt" onChange={handleFile} style={{display:"none"}}/>
              <div style={{fontSize:36,marginBottom:10}}>📂</div>
              <h3 style={{color:C.tx,fontWeight:600,marginBottom:4,fontSize:15}}>Drop your file here</h3>
              <p style={{color:C.txm,fontSize:14}}>CSV, TSV, or TXT</p>
              <p style={{color:C.txd,fontSize:13,marginTop:8}}>Dot-notation supported: <code style={{color:C.cy}}>account.new_externalid</code></p>
            </div>
          ):(
            <div>
              <p style={{color:C.txm,fontSize:14,marginBottom:8}}>Copy-paste directly from Excel, Google Sheets, or any spreadsheet — tabs are auto-detected.</p>
              <textarea value={pasteText} onChange={e=>setPasteText(e.target.value)} placeholder={"Id\tFirstName\tLastName\taccount.new_externalid\n003xx001\tJean\tDupont\tSAP-001\n003xx002\tMarie\tMartin\tSAP-002"} style={inp({height:180,...mono,fontSize:14,color:C.cy,resize:"vertical",whiteSpace:"pre"})}/>
              <div style={{display:"flex",justifyContent:"flex-end",marginTop:8}}>
                <button onClick={handlePaste} disabled={!pasteText.trim()} style={bt(pasteText.trim()?`linear-gradient(135deg,${C.vi},${C.vil})`:C.sfh)}><I.Clipboard/> Load data</button>
              </div>
            </div>
          )}
        </div>
      )}

      {step===1&&(
        <div>
          <div style={{display:"flex",gap:10,marginBottom:12,flexDirection:bp.mobile?"column":"row"}}>
            <div style={{...crd({padding:12}),flex:1}}><label style={{fontSize:12,color:C.txm,fontWeight:500,display:"block",marginBottom:4}}>Target D365 entity</label><select value={target} onChange={e=>setTarget(e.target.value)} style={inp({fontSize:14})}>{entityList.map(e=><option key={e.l} value={e.l}>{e.i} {e.d} ({e.l})</option>)}</select></div>
            <div style={{...crd({padding:12}),flex:1}}>
              <label style={{fontSize:12,color:C.txm,fontWeight:500,display:"block",marginBottom:4}}>Import mode</label>
              <div style={{display:"flex",gap:6,marginBottom:6}}>
                <label style={{fontSize:12,color:!uKey.d?C.gn:C.txd,cursor:"pointer",display:"flex",alignItems:"center",gap:3}}>
                  <input type="radio" checked={!uKey.d} onChange={()=>setUKey({d:"",c:""})} style={{accentColor:C.gn}}/> CREATE (new records)
                </label>
                <label style={{fontSize:12,color:uKey.d?C.cy:C.txd,cursor:"pointer",display:"flex",alignItems:"center",gap:3}}>
                  <input type="radio" checked={!!uKey.d} onChange={()=>{const pk=target+"id";const pkCol=csvData.h.find(h=>h.toLowerCase()===pk);setUKey({d:pk,c:pkCol||csvData.h[0]||""});}} style={{accentColor:C.cy}}/> UPSERT (update or create)
                </label>
              </div>
              {uKey.d&&<div style={{display:"flex",gap:6,alignItems:"center"}}>
                <input value={uKey.d} onChange={e=>setUKey({...uKey,d:e.target.value})} placeholder="D365 column (alternate key)" list="dl_ukey" style={inp({flex:1,fontSize:13,...mono})}/>
                <datalist id="dl_ukey">{targetFields.map(f=><option key={f} value={f}/>)}</datalist>
                <span style={{color:C.txd}}>←</span>
                <select value={uKey.c} onChange={e=>setUKey({...uKey,c:e.target.value})} style={inp({flex:1,fontSize:13})}><option value="">—</option>{csvData.h.map(h=><option key={h}>{h}</option>)}</select>
              </div>}
            </div>
          </div>
          <div style={{...crd({overflow:"hidden"})}}>
            <div style={{padding:"8px 12px",borderBottom:`1px solid ${C.bd}`,display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:4}}><span style={{fontWeight:600,fontSize:14}}>Mapping</span><span style={{fontSize:12,color:C.txd}}>{csvFile?.name} — {csvData.r.length} rows</span></div>
            <div style={{overflow:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",fontSize:13,minWidth:460}}>
              <thead><tr style={{background:C.bg}}><th style={ths()}>CSV</th><th style={{...ths(),width:24}}></th><th style={ths()}>D365</th><th style={ths()}>Transform</th><th style={ths()}>Preview</th><th style={{...ths(),width:24}}></th></tr></thead>
              <tbody>{maps.map((m,i)=>{
                const isSystem=m.skip||["createdon","modifiedon","createdby","modifiedby","versionnumber"].includes(m.d365?.toLowerCase());
                const isPicklist=["statecode","statuscode"].includes(m.d365?.toLowerCase()) || m.transform==="statecode"||m.transform==="picklist";
                const skipLabel=m.isPK?"🔑 primary key (UPSERT)":m.isLookup?"🔗 lookup (step 3)":"system (ignored)";
                const skipColor=m.isPK?C.cy:m.isLookup?C.lv:C.yw;
                return (<tr key={i} style={{borderBottom:`1px solid ${C.bd}`,opacity:isSystem?0.4:1}}>
                <td style={tds}><span style={{color:C.cy,...mono,fontSize:12}}>{m.csv}</span></td>
                <td style={{...tds,textAlign:"center",color:isSystem?skipColor:isPicklist?C.or:m.d365?C.gn:C.txd}}>{isSystem?"⚠":isPicklist?"⚙":m.d365?<I.Arrow/>:"—"}</td>
                <td style={tds}>{isSystem?<span style={{fontSize:11,color:skipColor,...mono}}>{skipLabel}</span>:<><input value={m.d365} onChange={e=>{const u=[...maps];u[i]={...m,d365:e.target.value};setMaps(u);}} placeholder="(skip)" list={`dl${i}`} style={inp({fontSize:12,...mono,padding:"4px 10px",color:m.d365?C.tx:C.txd})}/><datalist id={`dl${i}`}>{targetFields.map(f=><option key={f} value={f}/>)}</datalist></>}</td>
                <td style={tds}>{!isSystem&&<select value={m.transform} onChange={e=>{const u=[...maps];u[i]={...m,transform:e.target.value};setMaps(u);}} style={inp({width:"auto",fontSize:11,padding:"2px 4px",color:isPicklist&&!m.transform?C.or:C.tx})}>
                  <option value="">{isPicklist?"⚠ choose":"—"}</option>
                  <option value="statecode">statecode (Active→0, Inactive→1)</option>
                  <option value="picklist">picklist (label→int)</option>
                  <option value="boolean_yesno">boolean (Yes/No→true/false)</option>
                  <option value="boolean">boolean (true/false→true/false)</option>
                  <option value="int">int</option>
                  <option value="float">float</option>
                  <option value="date_iso">date ISO</option>
                  <option value="upper">UPPER</option>
                  <option value="lower">lower</option>
                </select>}</td>
                <td style={{...tds,color:C.txd,maxWidth:80,fontSize:12}}>{csvData.r[0]?.[m.csv]||"—"}</td>
                <td style={tds}><button onClick={()=>setMaps(maps.filter((_,j)=>j!==i))} style={{background:"none",border:"none",color:C.txd,cursor:"pointer",padding:2}}><I.Trash/></button></td>
              </tr>);})}</tbody>
            </table></div>
          </div>
          <div style={{display:"flex",justifyContent:"flex-end",marginTop:12,gap:6}}><button onClick={()=>setStep(0)} style={bt()}>← Back</button><button onClick={()=>setStep(2)} style={bt(`linear-gradient(135deg,${C.vi},${C.vil})`)}>Lookups →</button></div>
        </div>
      )}

      {step===2&&(
        <div>
          <div style={{...crd({padding:bp.mobile?12:14}),marginBottom:12}}>
            <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:10}}><I.Link/><span style={{fontWeight:600,fontSize:15}}>Parent Lookups</span></div>
            {lookups.length===0?<div style={{textAlign:"center",padding:"14px 0",color:C.txd}}><p style={{marginBottom:8}}>No parent columns detected.</p><button onClick={()=>setLookups([...lookups,{src:"",csv:"",entity:"",nav:"",d365f:"",fb:"skip",mode:"resolve"}])} style={bt(null,{fontSize:13})}><I.Plus/> Add</button></div>
            :<div style={{display:"flex",flexDirection:"column",gap:8}}>
              {lookups.map((lk,i)=>(
                <div key={i} style={{background:C.bg,border:`1px solid ${C.bd}`,borderRadius:7,padding:bp.mobile?10:12}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}><span style={{fontWeight:600,fontSize:13,color:C.cy}}>Lookup #{i+1}</span><button onClick={()=>setLookups(lookups.filter((_,j)=>j!==i))} style={{background:"none",border:"none",color:C.txd,cursor:"pointer"}}><I.Trash/></button></div>
                  {/* Mode toggle: resolve vs direct GUID */}
                  <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:8}}>
                    <span style={{fontSize:11,color:C.txm}}>Mode:</span>
                    {[{id:"resolve",label:"Resolve (search for GUID)",desc:"CSV value is an identifier to search in D365"},{id:"direct",label:"Direct GUID",desc:"CSV value is already a D365 GUID"}].map(m=>(
                      <label key={m.id} style={{fontSize:12,color:lk.mode===m.id?C.tx:C.txd,cursor:"pointer",display:"flex",alignItems:"center",gap:2}}>
                        <input type="radio" name={`mode${i}`} checked={lk.mode===m.id} onChange={()=>{const u=[...lookups];u[i]={...lk,mode:m.id};setLookups(u);}} style={{accentColor:C.vi}}/>
                        <span>{m.label}</span>
                      </label>
                    ))}
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:bp.mobile?"1fr":"1fr 1fr",gap:8}}>
                    <div><label style={{fontSize:11,color:C.txm,fontWeight:500,display:"block",marginBottom:2}}>CSV Column</label>
                      <select value={lk.csv} onChange={e=>{const u=[...lookups];u[i]={...lk,csv:e.target.value};/* Auto-detect GUID mode */const sample=csvData.r[0]?.[e.target.value];if(sample&&/^[0-9a-f]{8}-[0-9a-f]{4}-/.test(sample)){u[i].mode="direct";}setLookups(u);}} style={inp({fontSize:13,...mono})}><option value="">—</option>{csvData.h.map(o=><option key={o}>{o}</option>)}</select>
                    </div>
                    {lk.mode==="resolve"&&<div><label style={{fontSize:11,color:C.txm,fontWeight:500,display:"block",marginBottom:2}}>D365 Column (lookup key)</label>
                      <input value={lk.d365f} onChange={e=>{const u=[...lookups];u[i]={...lk,d365f:e.target.value};setLookups(u);}} placeholder="accountnumber, new_externalid..." style={inp({fontSize:13,...mono})}/>
                    </div>}
                    <div><label style={{fontSize:11,color:C.txm,fontWeight:500,display:"block",marginBottom:2}}>Target entity</label>
                      <input value={lk.entity} onChange={e=>{const u=[...lookups];u[i]={...lk,entity:e.target.value};setLookups(u);}} placeholder="account" style={inp({fontSize:13,...mono})}/>
                    </div>
                    <div><label style={{fontSize:11,color:C.txm,fontWeight:500,display:"block",marginBottom:2}}>Nav. property</label>
                      <input value={lk.nav} onChange={e=>{const u=[...lookups];u[i]={...lk,nav:e.target.value};setLookups(u);}} placeholder="parentcustomerid" style={inp({fontSize:13,...mono})}/>
                    </div>
                  </div>
                  <div style={{marginTop:6,display:"flex",alignItems:"center",gap:3,flexWrap:"wrap"}}>
                    <span style={{fontSize:11,color:C.txm}}>Fallback:</span>
                    {["skip","null","error"].map(fb=><label key={fb} style={{fontSize:12,color:lk.fb===fb?C.tx:C.txd,cursor:"pointer",display:"flex",alignItems:"center",gap:2,marginRight:6}}><input type="radio" name={`fb${i}`} checked={lk.fb===fb} onChange={()=>{const u=[...lookups];u[i]={...lk,fb};setLookups(u);}} style={{accentColor:C.vi}}/>{fb==="skip"?"Skip":fb==="null"?"Null":"Error"}</label>)}
                  </div>
                  <div style={{marginTop:6,padding:"4px 8px",background:C.sfh,borderRadius:3,fontSize:11,color:C.txd,...mono,overflowX:"auto",whiteSpace:"nowrap"}}>
                    {lk.mode==="direct"
                      ?<><span style={{color:C.cy}}>{lk.csv||"?"}</span> <span style={{color:C.gn}}>(Direct GUID)</span> → <span style={{color:C.yw}}>/{lk.entity||"?"}s(GUID)</span> → <span style={{color:C.yw}}>{lk.nav||"?"}@odata.bind</span></>
                      :<><span style={{color:C.cy}}>{lk.csv||"?"}</span> → <span style={{color:C.lv}}>{lk.entity||"?"}s</span>.{lk.d365f||"?"} → <span style={{color:C.gn}}>GUID</span> → <span style={{color:C.yw}}>{lk.nav||"?"}@odata.bind</span></>
                    }
                  </div>
                </div>
              ))}
              <button onClick={()=>setLookups([...lookups,{src:"",csv:"",entity:"",nav:"",d365f:"",fb:"skip",mode:"resolve"}])} style={{...bt(null,{fontSize:12,width:"fit-content"}),borderStyle:"dashed"}}><I.Plus/> Add</button>
            </div>}
          </div>
          <div style={{display:"flex",justifyContent:"flex-end",gap:6}}><button onClick={()=>setStep(1)} style={bt()}>← Back</button><button onClick={()=>setStep(3)} style={bt(`linear-gradient(135deg,${C.vi},${C.vil})`)}>Preview →</button></div>
        </div>
      )}

      {step===3&&(
        <div>
          <div style={{display:"grid",gridTemplateColumns:bp.mobile?"1fr 1fr":"1fr 1fr 1fr 1fr",gap:8,marginBottom:14}}>
            {[{l:"Records",v:csvData.r.length,c:C.cy},{l:"Columns",v:maps.filter(m=>m.d365).length,c:C.gn},{l:"Lookups",v:lookups.length,c:C.yw},{l:"Mode",v:uKey.d?"UPSERT":"INSERT",c:C.vi}].map((m,i)=><div key={i} style={{...crd({padding:"10px 12px",textAlign:"center"})}}><div style={{fontSize:18,fontWeight:700,color:m.c}}>{m.v}</div><div style={{fontSize:11,color:C.txd,marginTop:1}}>{m.l}</div></div>)}
          </div>
          <div style={{...crd({padding:12}),marginBottom:12}}>
            <div style={{fontSize:14,fontWeight:600,marginBottom:6}}>D365 record example</div>
            <pre style={{...inp({...mono,color:C.cy,fontSize:12,padding:10,overflow:"auto",whiteSpace:"pre-wrap",wordBreak:"break-all"}),margin:0}}>
{JSON.stringify((() => {const row=csvData.r[0]||{};const rec={};maps.filter(m=>m.d365&&!m.skip).forEach(m=>{rec[m.d365]=row[m.csv]||"";});const isPK=uKey.d&&uKey.d.toLowerCase()===target+"id";if(uKey.d&&uKey.c&&!isPK)rec[uKey.d]=row[uKey.c]||"";lookups.forEach(lk=>{if(lk.nav&&lk.csv){const val=row[lk.csv];rec[`${lk.nav}@odata.bind`]=lk.mode==="direct"&&val?`/${lk.entity||"?"}s(${val})`:`/${lk.entity||"?"}s(<GUID>)`;}});return rec;})(),null,2)}
            </pre>
          </div>
          <div style={{display:"flex",justifyContent:"flex-end",gap:6,flexWrap:"wrap"}}><button onClick={()=>setStep(2)} style={bt()}>← Back</button><button onClick={()=>{const cfg={d365_entity:target,upsert_key:uKey.d,fields:Object.fromEntries(maps.filter(m=>m.d365).map(m=>[m.csv,m.d365])),lookups:lookups.map(lk=>({source_field:lk.src,d365_target_entity:lk.entity,d365_navigation_property:lk.nav,resolve_by:{csv_column:lk.csv,d365_field:lk.d365f},fallback:lk.fb}))};dl(JSON.stringify(cfg,null,2),"application/json",`load_${target}.json`);}} style={bt()}><I.Download/> YAML</button><button onClick={doLoad} style={bt(`linear-gradient(135deg,${C.gn},${C.cyd})`)}><I.Zap/> Load</button></div>
        </div>
      )}

      {step===4&&(
        <div style={{padding:"20px 0"}}>
          {!result?(
            <div>
              <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14}}>
                <Spin s={18}/>
                <div style={{flex:1}}>
                  <div style={{fontSize:15,fontWeight:600,color:C.tx,marginBottom:4}}>{loadProgress.current}</div>
                  <div style={{height:6,background:C.bd,borderRadius:3,overflow:"hidden"}}>
                    <div style={{width:`${loadProgress.total?Math.round(loadProgress.done/loadProgress.total*100):0}%`,height:"100%",background:`linear-gradient(90deg,${C.vi},${C.cy})`,borderRadius:3,transition:"width .3s"}}/>
                  </div>
                  <div style={{fontSize:12,color:C.txd,marginTop:3}}>{loadProgress.done} / {loadProgress.total} records</div>
                </div>
              </div>
            </div>
          ):(
            <div>
              <div style={{textAlign:"center",marginBottom:16}}>
                <div style={{fontSize:38,marginBottom:8}}>{result.errors.length===0?"✅":"⚠️"}</div>
                <h2 style={{color:C.tx,fontWeight:700,fontSize:18,marginBottom:4}}>Done in {result.elapsed}s</h2>
              </div>
              <div style={{display:"grid",gridTemplateColumns:bp.mobile?"1fr 1fr":"1fr 1fr 1fr 1fr",gap:8,maxWidth:500,margin:"0 auto 14px"}}>
                {[{l:"Created",v:result.created,c:C.gn},{l:"Updated",v:result.updated,c:C.cy},{l:"Skipped",v:result.skipped,c:C.yw},{l:"Errors",v:result.errors.length,c:C.rd}].map((m,i)=><div key={i} style={{...crd({padding:"8px 10px",textAlign:"center"})}}><div style={{fontSize:20,fontWeight:700,color:m.c}}>{m.v}</div><div style={{fontSize:11,color:C.txd}}>{m.l}</div></div>)}
              </div>

              {/* Full log viewer */}
              {result.log&&result.log.length>0&&(
                <div style={{...crd({padding:12}),marginTop:12}}>
                  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
                    <span style={{fontSize:14,fontWeight:600}}>Import Log ({result.log.length} rows)</span>
                    <span style={{fontSize:11,color:C.txd}}>
                      <span style={{color:C.gn}}>● {result.log.filter(e=>e.status==="CREATED").length} created</span>
                      {" "}<span style={{color:C.cy}}>● {result.log.filter(e=>e.status==="UPSERTED").length} upserted</span>
                      {" "}<span style={{color:C.yw}}>● {result.log.filter(e=>e.status==="SKIPPED").length} skipped</span>
                      {" "}<span style={{color:C.rd}}>● {result.log.filter(e=>e.status==="ERROR").length} errors</span>
                    </span>
                  </div>
                  <div style={{maxHeight:300,overflow:"auto"}}>
                    <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
                      <thead><tr>
                        <th style={{...ths(),width:50}}>Row</th>
                        <th style={{...ths(),width:90}}>Status</th>
                        <th style={ths()}>Detail</th>
                      </tr></thead>
                      <tbody>{result.log.map((e,i)=>{
                        const sc=e.status==="CREATED"?C.gn:e.status==="UPSERTED"?C.cy:e.status==="SKIPPED"?C.yw:C.rd;
                        return(
                          <tr key={i} style={{borderBottom:`1px solid ${C.bd}`}} onMouseEnter={ev=>ev.currentTarget.style.background=C.sfh} onMouseLeave={ev=>ev.currentTarget.style.background="transparent"}>
                            <td style={{...tds,fontWeight:600,...mono,color:C.txm}}>{e.row}</td>
                            <td style={tds}><span style={{fontSize:11,padding:"2px 8px",borderRadius:3,background:sc+"22",color:sc,fontWeight:600}}>{e.status}</span></td>
                            <td style={{...tds,color:e.status==="ERROR"?C.rd:C.txm,fontSize:12,...mono}}>{e.detail}</td>
                          </tr>
                        );
                      })}</tbody>
                    </table>
                  </div>
                </div>
              )}

              <div style={{display:"flex",justifyContent:"center",gap:8,marginTop:16,flexWrap:"wrap"}}>
                <button onClick={()=>{setStep(0);setCsvFile(null);setCsvData({h:[],r:[]});setResult(null);setPasteText("");setLoadProgress({done:0,total:0,current:""});}} style={bt(null)}>New import</button>
                <button onClick={()=>{
                  const ts=new Date().toISOString().replace(/[:.]/g,"-").substring(0,19);
                  const esc=(v)=>{const s=String(v||"");return s.includes(",")||s.includes('"')||s.includes("\n")?`"${s.replace(/"/g,'""')}"`:s;};
                  const header="Row,Status,Detail";
                  const log=result.log||[];
                  const lines=log.map(e=>[e.row,e.status,esc(e.detail)].join(","));
                  const summary=[
                    "",
                    `# Summary`,
                    `# Entity: ${result.entity||target}`,
                    `# Total rows: ${result.totalRows||0}`,
                    `# Created: ${result.created}`,
                    `# Updated: ${result.updated}`,
                    `# Skipped: ${result.skipped}`,
                    `# Errors: ${result.errors.length}`,
                    `# Duration: ${result.elapsed}s`,
                    `# Timestamp: ${new Date().toISOString()}`,
                  ];
                  dl("\uFEFF"+[header,...lines,...summary].join("\n"),"text/csv;charset=utf-8",`colvio_load_${result.entity||target}_${ts}.csv`);
                }} style={bt(null,{color:C.gn})}><I.Download/> Download Log</button>
                {result.errors.length>0&&<button onClick={()=>{const csv=["Row,Error,Payload",...result.errors.map(e=>`${e.row},"${(e.msg||"").replace(/"/g,'""')}","${(e.payload||"").replace(/"/g,'""')}"`)].join("\n");dl("\uFEFF"+csv,"text/csv;charset=utf-8","load_errors.csv");}} style={bt(null,{color:C.rd})}>Export errors CSV</button>}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
