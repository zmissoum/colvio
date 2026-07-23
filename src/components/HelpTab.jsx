import { useState } from "react";
import { C, I, crd, bt, inp } from "../shared.jsx";
import { t } from "../i18n.js";

const Section=({icon,titleKey,bodyKey})=>(
  // Masonry column item: never split across a column boundary; marginBottom is the vertical gap
  // between stacked cards (column-gap only spaces columns horizontally).
  <div style={{...crd({padding:"14px 18px",marginBottom:14}),boxSizing:"border-box",breakInside:"avoid",WebkitColumnBreakInside:"avoid",display:"inline-block",width:"100%",verticalAlign:"top"}}>
    <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
      <span style={{color:C.cy}}>{icon}</span>
      <span style={{fontWeight:700,fontSize:15}}>{t(titleKey)}</span>
    </div>
    <div style={{color:C.txm,fontSize:13,lineHeight:1.7,whiteSpace:"pre-line"}}>{t(bodyKey)}</div>
  </div>
);

// One entry per help card. `cat` groups it under a category tab (see CATS).
const SECTIONS=[
  {cat:"query",  icon:<I.Search/>,   titleKey:"help.getting_started_title", bodyKey:"help.getting_started_body"},
  {cat:"query",  icon:<I.Database/>, titleKey:"help.explorer_title",        bodyKey:"help.explorer_body"},
  {cat:"query",  icon:<I.Search/>,   titleKey:"help.sql_title",             bodyKey:"help.sql_body"},
  {cat:"query",  icon:<I.Zap/>,      titleKey:"help.apitester_title",       bodyKey:"help.apitester_body"},
  {cat:"query",  icon:<I.Eye/>,      titleKey:"help.show_title",            bodyKey:"help.show_body"},
  {cat:"query",  icon:<I.Grid/>,     titleKey:"help.metadata_title",        bodyKey:"help.metadata_body"},
  {cat:"loader", icon:<I.Upload/>,   titleKey:"help.loader_title",          bodyKey:"help.loader_body"},
  {cat:"loader", icon:<I.Upload/>,   titleKey:"help.loader_modes_title",    bodyKey:"help.loader_modes_body"},
  {cat:"loader", icon:<I.Upload/>,   titleKey:"help.transforms_title",      bodyKey:"help.transforms_body"},
  {cat:"loader", icon:<I.Upload/>,   titleKey:"help.dryrun_title",          bodyKey:"help.dryrun_body"},
  {cat:"loader", icon:<I.Upload/>,   titleKey:"help.delta_title",           bodyKey:"help.delta_body"},
  {cat:"loader", icon:<I.Zap/>,      titleKey:"help.performance_title",     bodyKey:"help.performance_body"},
  {cat:"admin",  icon:<I.Trash/>,    titleKey:"help.recyclebin_title",      bodyKey:"help.recyclebin_body"},
  {cat:"admin",  icon:<I.Clock/>,    titleKey:"help.audit_title",           bodyKey:"help.audit_body"},
  {cat:"admin",  icon:<I.Zap/>,      titleKey:"help.ops_title",             bodyKey:"help.ops_body"},
  {cat:"admin",  icon:<I.Shield/>,   titleKey:"help.security_title",        bodyKey:"help.security_body"},
  {cat:"admin",  icon:<I.Zap/>,      titleKey:"help.bpf_title",             bodyKey:"help.bpf_body"},
  {cat:"admin",  icon:<I.Users/>,    titleKey:"help.licenses_title",        bodyKey:"help.licenses_body"},
  {cat:"admin",  icon:<I.Link/>,     titleKey:"help.bu_title",              bodyKey:"help.bu_body"},
  {cat:"admin",  icon:<I.Clock/>,    titleKey:"help.logins_title",          bodyKey:"help.logins_body"},
  {cat:"admin",  icon:<I.Users/>,    titleKey:"help.adoption_title",        bodyKey:"help.adoption_body"},
  {cat:"schema", icon:<I.Zap/>,      titleKey:"help.automation_title",      bodyKey:"help.automation_body"},
  {cat:"schema", icon:<I.Grid/>,     titleKey:"help.apps_title",            bodyKey:"help.apps_body"},
  {cat:"schema", icon:<I.Database/>, titleKey:"help.solutions_title",       bodyKey:"help.solutions_body"},
  {cat:"schema", icon:<I.Zap/>,      titleKey:"help.envvars_title",         bodyKey:"help.envvars_body"},
  {cat:"schema", icon:<I.Clipboard/>,titleKey:"help.translations_title",    bodyKey:"help.translations_body"},
  {cat:"schema", icon:<I.Grid/>,     titleKey:"help.schemadiff_title",      bodyKey:"help.schemadiff_body"},
  {cat:"schema", icon:<I.Link/>,     titleKey:"help.graph_title",           bodyKey:"help.graph_body"},
  {cat:"schema", icon:<I.Grid/>,     titleKey:"help.schema_title",          bodyKey:"help.schema_body"},
  {cat:"general",icon:<I.Download/>, titleKey:"help.exports_title",         bodyKey:"help.exports_body"},
  {cat:"general",icon:<I.Eye/>,      titleKey:"help.permissions_title",     bodyKey:"help.permissions_body"},
  {cat:"general",icon:<I.Shield/>,   titleKey:"help.troubleshoot_title",    bodyKey:"help.troubleshoot_body"},
];

const CATS=[
  {id:"all",     labelKey:"help.cat_all"},
  {id:"query",   labelKey:"help.cat_query"},
  {id:"loader",  labelKey:"help.cat_loader"},
  {id:"admin",   labelKey:"help.cat_admin"},
  {id:"schema",  labelKey:"help.cat_schema"},
  {id:"general", labelKey:"help.cat_general"},
];

export default function HelpTab({bp,onShowShortcuts,onRestartTour,theme}){
  const[q,setQ]=useState("");
  const[cat,setCat]=useState("all");
  const needle=q.toLowerCase().trim();
  // Search spans EVERY category (most intuitive); with no search term, show the active tab.
  const visible=needle
    ? SECTIONS.filter(s=>(t(s.titleKey)+" "+t(s.bodyKey)).toLowerCase().includes(needle))
    : (cat==="all"?SECTIONS:SECTIONS.filter(s=>s.cat===cat));
  return(
    <div style={{padding:bp.mobile?12:24,maxWidth:bp.mobile?"100%":"none",margin:"0 auto"}}>
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14}}>
        <div style={{width:36,height:36,borderRadius:10,background:`linear-gradient(135deg,${C.vi},${C.cy})`,display:"flex",alignItems:"center",justifyContent:"center",color:"white",fontSize:18}}>?</div>
        <div>
          <div style={{fontWeight:700,fontSize:18}}>{t("help.title")}</div>
          <div style={{fontSize:13,color:C.txd}}>{t("help.subtitle")}</div>
        </div>
      </div>

      <div style={{position:"relative",marginBottom:12,maxWidth:bp.mobile?"100%":460}}>
        <input value={q} onChange={e=>setQ(e.target.value)} placeholder={t("help.search_placeholder")} style={inp({fontSize:13,padding:"8px 12px 8px 32px"})}/>
        <span style={{position:"absolute",left:10,top:"50%",transform:"translateY(-50%)",color:C.txd}}><I.Search s={14}/></span>
      </div>

      {/* Category tabs — hidden while searching, since search spans all categories. */}
      {!needle&&<div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:14}}>
        {CATS.map(c=>{
          const active=cat===c.id;
          const n=c.id==="all"?SECTIONS.length:SECTIONS.filter(s=>s.cat===c.id).length;
          return <button key={c.id} onClick={()=>setCat(c.id)} style={{padding:"5px 13px",fontSize:12.5,borderRadius:14,cursor:"pointer",fontWeight:600,border:`1px solid ${active?C.cy:C.bd}`,background:active?C.cy+"22":"transparent",color:active?C.cy:C.txm}}>{t(c.labelKey)} <span style={{opacity:.55,fontWeight:400}}>{n}</span></button>;
        })}
      </div>}

      {/* Masonry (CSS columns): cards pack tightly with NO vertical gaps, filling the full width. */}
      <div style={{...(bp.mobile?{columnCount:1}:{columnWidth:340}),columnGap:14}}>
        {visible.map(s=><Section key={s.titleKey} icon={s.icon} titleKey={s.titleKey} bodyKey={s.bodyKey}/>)}
      </div>
      {visible.length===0&&<div style={{color:C.txd,fontSize:13,textAlign:"center",padding:20}}>{t("help.search_empty")}</div>}

      <div style={{display:"flex",gap:10,marginTop:16,flexWrap:"wrap"}}>
        <button onClick={onShowShortcuts} style={{...bt(null,{fontSize:13})}}>{t("help.shortcuts_link")}</button>
        <button onClick={onRestartTour} style={{...bt(null,{fontSize:13})}}>{t("help.restart_tour")}</button>
      </div>
    </div>
  );
}
