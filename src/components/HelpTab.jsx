import { useState } from "react";
import { C, I, crd, bt, inp } from "../shared.jsx";
import { t } from "../i18n.js";

const Section=({icon,titleKey,bodyKey})=>(
  <div style={{...crd({padding:"14px 18px"}),boxSizing:"border-box"}}>
    <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
      <span style={{color:C.cy}}>{icon}</span>
      <span style={{fontWeight:700,fontSize:15}}>{t(titleKey)}</span>
    </div>
    <div style={{color:C.txm,fontSize:13,lineHeight:1.7,whiteSpace:"pre-line"}}>{t(bodyKey)}</div>
  </div>
);

// One entry per help card. Grouped so the Loader deep-dives sit together under the module list.
const SECTIONS=[
  {icon:<I.Search/>,  titleKey:"help.getting_started_title", bodyKey:"help.getting_started_body"},
  {icon:<I.Database/>,titleKey:"help.explorer_title",        bodyKey:"help.explorer_body"},
  {icon:<I.Search/>,  titleKey:"help.sql_title",             bodyKey:"help.sql_body"},
  {icon:<I.Zap/>,     titleKey:"help.apitester_title",       bodyKey:"help.apitester_body"},
  {icon:<I.Eye/>,     titleKey:"help.show_title",            bodyKey:"help.show_body"},
  {icon:<I.Grid/>,    titleKey:"help.metadata_title",        bodyKey:"help.metadata_body"},
  {icon:<I.Upload/>,  titleKey:"help.loader_title",          bodyKey:"help.loader_body"},
  {icon:<I.Upload/>,  titleKey:"help.loader_modes_title",    bodyKey:"help.loader_modes_body"},
  {icon:<I.Upload/>,  titleKey:"help.transforms_title",      bodyKey:"help.transforms_body"},
  {icon:<I.Upload/>,  titleKey:"help.dryrun_title",          bodyKey:"help.dryrun_body"},
  {icon:<I.Upload/>,  titleKey:"help.delta_title",           bodyKey:"help.delta_body"},
  {icon:<I.Trash/>,   titleKey:"help.recyclebin_title",      bodyKey:"help.recyclebin_body"},
  {icon:<I.Clock/>,   titleKey:"help.audit_title",           bodyKey:"help.audit_body"},
  {icon:<I.Zap/>,     titleKey:"help.ops_title",             bodyKey:"help.ops_body"},
  {icon:<I.Grid/>,    titleKey:"help.schemadiff_title",      bodyKey:"help.schemadiff_body"},
  {icon:<I.Zap/>,     titleKey:"help.performance_title",     bodyKey:"help.performance_body"},
  {icon:<I.Link/>,    titleKey:"help.graph_title",           bodyKey:"help.graph_body"},
  {icon:<I.Grid/>,    titleKey:"help.schema_title",          bodyKey:"help.schema_body"},
  {icon:<I.Database/>,titleKey:"help.solutions_title",       bodyKey:"help.solutions_body"},
  {icon:<I.Clipboard/>,titleKey:"help.translations_title",   bodyKey:"help.translations_body"},
  {icon:<I.Clock/>,   titleKey:"help.logins_title",          bodyKey:"help.logins_body"},
  {icon:<I.Users/>,   titleKey:"help.licenses_title",        bodyKey:"help.licenses_body"},
  {icon:<I.Shield/>,  titleKey:"help.security_title",        bodyKey:"help.security_body"},
  {icon:<I.Download/>,titleKey:"help.exports_title",         bodyKey:"help.exports_body"},
  {icon:<I.Eye/>,     titleKey:"help.permissions_title",     bodyKey:"help.permissions_body"},
  {icon:<I.Shield/>,  titleKey:"help.troubleshoot_title",    bodyKey:"help.troubleshoot_body"},
];

export default function HelpTab({bp,onShowShortcuts,onRestartTour,theme}){
  const[q,setQ]=useState("");
  const needle=q.toLowerCase().trim();
  // Filter on translated title + body so the search works in both locales.
  const visible=needle?SECTIONS.filter(s=>(t(s.titleKey)+" "+t(s.bodyKey)).toLowerCase().includes(needle)):SECTIONS;
  return(
    <div style={{padding:bp.mobile?12:24,maxWidth:bp.mobile?"100%":"none",margin:"0 auto"}}>
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14}}>
        <div style={{width:36,height:36,borderRadius:10,background:`linear-gradient(135deg,${C.vi},${C.cy})`,display:"flex",alignItems:"center",justifyContent:"center",color:"white",fontSize:18}}>?</div>
        <div>
          <div style={{fontWeight:700,fontSize:18}}>{t("help.title")}</div>
          <div style={{fontSize:13,color:C.txd}}>{t("help.subtitle")}</div>
        </div>
      </div>

      <div style={{position:"relative",marginBottom:14,maxWidth:bp.mobile?"100%":460}}>
        <input value={q} onChange={e=>setQ(e.target.value)} placeholder={t("help.search_placeholder")} style={inp({fontSize:13,padding:"8px 12px 8px 32px"})}/>
        <span style={{position:"absolute",left:10,top:"50%",transform:"translateY(-50%)",color:C.txd}}><I.Search s={14}/></span>
      </div>

      {/* Card grid — fills the full width row by row, auto-fitting as many ~340px columns as the
          screen allows (2 on a narrow panel, 4-5 on a wide monitor). alignItems:start keeps each
          card at its natural height instead of stretching to the tallest in the row. */}
      <div style={{display:"grid",gridTemplateColumns:bp.mobile?"1fr":"repeat(auto-fill,minmax(340px,1fr))",gap:14,alignItems:"start"}}>
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
