import { C, I, bt, mono } from "../shared.jsx";
import { t } from "../i18n.js";

function dateStr(daysAgo){const d=new Date();d.setDate(d.getDate()-daysAgo);return d.toISOString().split("T")[0];}
function monthStart(){const d=new Date();d.setDate(1);return d.toISOString().split("T")[0];}

const TEMPLATES=[
  {
    icon:"🏢",name:()=>t("templates.active_accounts"),desc:()=>t("templates.active_accounts_desc"),
    entity:"account",fields:["name","modifiedon","statecode","emailaddress1","telephone1"],
    filters:[{logic:"and",conditions:[{field:"statecode",op:"eq",value:"0"},{field:"modifiedon",op:"ge",value:monthStart()}]}],
  },
  {
    icon:"👤",name:()=>t("templates.contacts_no_email"),desc:()=>t("templates.contacts_no_email_desc"),
    entity:"contact",fields:["fullname","emailaddress1","telephone1","createdon"],
    filters:[{logic:"and",conditions:[{field:"emailaddress1",op:"is_null",value:""},{field:"statecode",op:"eq",value:"0"}]}],
  },
  {
    icon:"💰",name:()=>t("templates.open_opportunities"),desc:()=>t("templates.open_opportunities_desc"),
    entity:"opportunity",fields:["name","estimatedvalue","closeprobability","estimatedclosedate","statecode"],
    filters:[{logic:"and",conditions:[{field:"statecode",op:"eq",value:"0"}]}],
  },
  {
    icon:"📋",name:()=>t("templates.cases_this_week"),desc:()=>t("templates.cases_this_week_desc"),
    entity:"incident",fields:["title","createdon","statecode","prioritycode"],
    filters:[{logic:"and",conditions:[{field:"createdon",op:"ge",value:dateStr(7)}]}],
  },
  {
    icon:"👥",name:()=>t("templates.active_users"),desc:()=>t("templates.active_users_desc"),
    entity:"systemuser",fields:["fullname","internalemailaddress","title","isdisabled"],
    filters:[{logic:"and",conditions:[{field:"isdisabled",op:"eq",value:"false"}]}],
  },
];

export default function QueryTemplates({entities,onSelect,onClose}){
  const apply=(tpl)=>{
    const ent=entities.find(e=>e.l===tpl.entity);
    if(!ent)return;
    onSelect(ent,tpl.fields,tpl.filters);
    onClose();
  };

  return(
    <div style={{position:"absolute",top:"100%",right:0,zIndex:20,background:C.sf,border:`1px solid ${C.bd}`,borderRadius:10,marginTop:4,padding:10,minWidth:320,maxHeight:400,overflow:"auto",boxShadow:"0 8px 24px rgba(0,0,0,.4)"}}>
      <div style={{fontSize:13,fontWeight:700,marginBottom:8,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <span>{t("templates.title")}</span>
        <button onClick={onClose} style={{background:"none",border:"none",color:C.txd,cursor:"pointer",fontSize:14}}>✕</button>
      </div>
      {TEMPLATES.map((tpl,i)=>(
        <button key={i} onClick={()=>apply(tpl)} style={{width:"100%",display:"flex",alignItems:"center",gap:10,padding:"8px 10px",border:"none",borderRadius:6,cursor:"pointer",background:"transparent",color:C.tx,textAlign:"left",marginBottom:2}} onMouseEnter={e=>e.currentTarget.style.background=C.sfh} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
          <span style={{fontSize:18,flexShrink:0}}>{tpl.icon}</span>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontSize:13,fontWeight:600}}>{tpl.name()}</div>
            <div style={{fontSize:11,color:C.txd}}>{tpl.desc()}</div>
          </div>
          <span style={{fontSize:11,color:C.txd,...mono}}>{tpl.entity}</span>
        </button>
      ))}
    </div>
  );
}
