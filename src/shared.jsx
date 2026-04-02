import { useState, useEffect } from "react";

// ── Performance: debounced value hook ──
export function useDebounce(value, delay = 150) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

/* ═══════════════════════════════════════════════════════════════
   Colvio v1.9 — Data Explorer & Loader for Microsoft Dynamics 365
   ═══════════════════════════════════════════════════════════════ */

// ── ICONS ──────────────────────────────────────────────────────
export const I={Search:(p)=><svg width={p?.s||16} height={p?.s||16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>,Upload:()=><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>,Download:()=><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>,Database:()=><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>,Play:()=><svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21"/></svg>,X:()=><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,Link:()=><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>,Trash:()=><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>,Plus:()=><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,Zap:()=><svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10"/></svg>,Arrow:()=><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>,Menu:()=><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>,Back:()=><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>,Copy:()=><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>,Eye:()=><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>,Clock:()=><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,Clipboard:()=><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/></svg>,Grid:()=><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>,Help:()=><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>,Users:()=><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,Shield:()=><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>,};

// ── COLORS & STYLES ───────────────────────────────────────────
export const DARK={bg:"#0B0E14",sf:"#12151C",sfh:"#181C25",sfa:"#1E2230",bd:"#252A36",tx:"#E8EAF0",txm:"#8B92A8",txd:"#5C6380",vi:"#0066FF",vil:"#3388FF",vid:"#003380",cy:"#00B7C3",cyd:"#005B70",gn:"#34D399",gnd:"#065F46",rd:"#F87171",yw:"#FBBF24",lv:"#99CCFF",or:"#FB923C"};
export const LIGHT={bg:"#F5F6FA",sf:"#FFFFFF",sfh:"#EEF0F5",sfa:"#E2E5ED",bd:"#D0D4DE",tx:"#1A1D26",txm:"#4A5068",txd:"#8890A4",vi:"#0066FF",vil:"#2277FF",vid:"#D6E6FF",cy:"#0891B2",cyd:"#E0F7FA",gn:"#059669",gnd:"#D1FAE5",rd:"#DC2626",yw:"#D97706",lv:"#1E40AF",or:"#EA580C"};

// Mutable theme object — all importers share the same reference
export const C = { ...DARK };
export function setThemeColors(t) { Object.assign(C, t === "light" ? LIGHT : DARK); }

export const mono={fontFamily:"'DM Mono','Fira Code',monospace"};
export const displayType=(t)=>t==="Picklist"?"OptionSet":t;
export const inp=(x)=>({width:"100%",padding:"7px 11px",background:C.bg,border:`1px solid ${C.bd}`,borderRadius:6,color:C.tx,fontSize:14,outline:"none",boxSizing:"border-box",...x});
export const bt=(bg,x)=>({padding:"7px 14px",background:bg||C.sfh,border:bg?"none":`1px solid ${C.bd}`,borderRadius:6,color:bg?"white":C.tx,cursor:"pointer",fontSize:13,fontWeight:600,display:"inline-flex",alignItems:"center",gap:5,transition:"all .15s",whiteSpace:"nowrap",...x});
export const crd=(x)=>({background:C.sf,border:`1px solid ${C.bd}`,borderRadius:10,...x});
export const ths=()=>({padding:"6px 10px",textAlign:"left",borderBottom:`2px solid ${C.bd}`,color:C.txd,fontWeight:600,fontSize:12,position:"sticky",top:0,background:C.sf,whiteSpace:"nowrap"});
export const tds={padding:"5px 10px",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",fontSize:14};

// ── HOOKS ─────────────────────────────────────────────────────
export function useBP(){const[w,setW]=useState(typeof window!=="undefined"?window.innerWidth:1200);useEffect(()=>{const h=()=>setW(window.innerWidth);window.addEventListener("resize",h);return()=>window.removeEventListener("resize",h);},[]);return{mobile:w<640,tablet:w>=640&&w<1024,w};}

export function useKeyboard(key, handler, deps=[]){useEffect(()=>{const h=(e)=>{if(e.key===key&&(e.ctrlKey||e.metaKey))handler(e);};window.addEventListener("keydown",h);return()=>window.removeEventListener("keydown",h);},[key,...deps]);}

// ── DATA ──────────────────────────────────────────────────────
export const ENTS=[
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

export const FLDS=[
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

export const ROWS=[
  {accountid:"a1b2c3d4-e5f6-7890-abcd-ef1234567890",name:"ACME France",accountnumber:"ACC-001",new_sapid:"SAP-001",new_siretcode:"123 456 789 00012",revenue:15000000,numberofemployees:450,telephone1:"+33 1 42 68 53 00",emailaddress1:"info@acme.fr",address1_city:"Paris",address1_country:"France",industrycode:"Manufacturing",customertypecode:"Customer",statecode:"Active",createdon:"2022-03-15T10:30:00Z",modifiedon:"2025-12-01T09:15:00Z",_ownerid_value:"Jean Dupont"},
  {accountid:"b2c3d4e5-f6a7-8901-bcde-f12345678901",name:"Globex GmbH",accountnumber:"ACC-002",new_sapid:"SAP-002",new_siretcode:"",revenue:28000000,numberofemployees:1200,telephone1:"+49 30 1234567",emailaddress1:"contact@globex.de",address1_city:"Berlin",address1_country:"Germany",industrycode:"Technology",customertypecode:"Partner",statecode:"Active",createdon:"2021-11-08T14:15:00Z",modifiedon:"2026-01-15T16:45:00Z",_ownerid_value:"Marie Martin"},
  {accountid:"c3d4e5f6-a7b8-9012-cdef-123456789012",name:"Wayne Enterprises",accountnumber:"ACC-003",new_sapid:"SAP-003",new_siretcode:"",revenue:95000000,numberofemployees:5000,telephone1:"+1 415 555 1234",emailaddress1:"info@wayne.com",address1_city:"Gotham",address1_country:"United States",industrycode:"Consulting",customertypecode:"Customer",statecode:"Active",createdon:"2020-06-22T08:00:00Z",modifiedon:"2026-02-20T11:30:00Z",_ownerid_value:"Pierre Bernard"},
  {accountid:"d4e5f6a7-b8c9-0123-defa-234567890123",name:"Stark Industries",accountnumber:"ACC-004",new_sapid:"SAP-004",new_siretcode:"",revenue:120000000,numberofemployees:8500,telephone1:"+1 212 555 9876",emailaddress1:"hello@stark.com",address1_city:"New York",address1_country:"United States",industrycode:"Technology",customertypecode:"Customer",statecode:"Active",createdon:"2019-01-10T09:45:00Z",modifiedon:"2026-03-01T14:00:00Z",_ownerid_value:"Sophie Lefevre"},
  {accountid:"e5f6a7b8-c9d0-1234-efab-345678901234",name:"Initech Ltd",accountnumber:"ACC-005",new_sapid:"SAP-005",new_siretcode:"987 654 321 00015",revenue:5200000,numberofemployees:85,telephone1:"+44 207 123 456",emailaddress1:"info@initech.com",address1_city:"London",address1_country:"United Kingdom",industrycode:"Consulting",customertypecode:"Prospect",statecode:"Active",createdon:"2023-02-28T16:20:00Z",modifiedon:"2026-02-28T10:10:00Z",_ownerid_value:"Lucas Moreau"},
  {accountid:"f6a7b8c9-d0e1-2345-fabc-456789012345",name:"Umbrella Corp",accountnumber:"ACC-006",new_sapid:"SAP-006",new_siretcode:"",revenue:42000000,numberofemployees:3200,telephone1:"+81 3 1234 5678",emailaddress1:"contact@umbrella.co.jp",address1_city:"Tokyo",address1_country:"Japan",industrycode:"Pharma",customertypecode:"Vendor",statecode:"Inactive",createdon:"2021-07-04T11:00:00Z",modifiedon:"2025-06-15T08:30:00Z",_ownerid_value:"Emma Petit"},
];

export const D365CF=["firstname","lastname","emailaddress1","telephone1","jobtitle","address1_line1","address1_city","address1_postalcode","address1_country","new_externalid"];

export function dl(c,t,n){const b=new Blob([c],{type:t});const u=URL.createObjectURL(b);const a=document.createElement("a");a.href=u;a.download=n;a.click();URL.revokeObjectURL(u);}
export function Spin({s=14}){return <span style={{display:"inline-block",width:s,height:s,border:`2px solid ${C.txd}44`,borderTopColor:C.tx,borderRadius:"50%",animation:"spin .8s linear infinite"}}/>;}
export function copyText(t){navigator.clipboard?.writeText(String(t));}

// Distinguish truly custom fields/entities (created by integrators) from Microsoft solution fields
// msdyn_, mspp_, msfp_, msdynce_, msdynmkt_, adx_, cds_ etc. are Microsoft-created but IsCustom=true
const MS_PREFIXES = /^(msdyn|mspp|msfp|msdynce|msdynmkt|msdyncr|msevtmgt|msfsi|msind|adx|cds|mserp|mspcat|powerbots|virtualimage|componentlib|connectioninstance|datalake|fax|socialprofile|sla|importlog|rollup|annualfiscal|queue|calendar|asyncoperation|workflow|savedquery|userquery|systemuser|businessunit|organization|role|team|transactioncurrency)_/;
export function isTrulyCustom(logicalName){ return !MS_PREFIXES.test(logicalName); }

// ── Detect extension mode ──
export function detectExtension() {
  try {
    const params = new URLSearchParams(window.location.search);
    const orgUrl = params.get("orgUrl");
    const tabId = params.get("tabId");
    if (orgUrl && tabId) return { orgUrl, tabId: parseInt(tabId, 10), isExtension: true };
  } catch {}
  try {
    if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.id) {
      return { orgUrl: null, tabId: null, isExtension: true };
    }
  } catch {}
  return { orgUrl: null, tabId: null, isExtension: false };
}

// ── Solution component types (used by SolutionExplorer) ──
export const COMP_TYPES={1:{l:"Entity",i:"📋"},2:{l:"Attribute",i:"🔤"},9:{l:"OptionSet",i:"📊"},10:{l:"Relationship",i:"🔗"},26:{l:"View",i:"👁"},29:{l:"Message",i:"💬"},31:{l:"Message Filter",i:"🔍"},59:{l:"Chart",i:"📈"},60:{l:"Web Resource",i:"🌐"},61:{l:"Sitemap",i:"🗺"},62:{l:"Connection Role",i:"🔌"},63:{l:"Security Role",i:"🛡"},65:{l:"Field Security",i:"🔒"},66:{l:"Entity Key",i:"🔑"},91:{l:"Plugin Type",i:"⚙"},92:{l:"Plugin Assembly",i:"🔧"},95:{l:"SDK Step",i:"📍"},300:{l:"Canvas App",i:"🎨"},371:{l:"Connector",i:"🔌"}};
