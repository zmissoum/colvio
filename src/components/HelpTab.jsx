import { C, I, crd, bt } from "../shared.jsx";
import { t } from "../i18n.js";

const Section=({icon,titleKey,bodyKey})=>(
  <div style={{...crd({padding:"14px 18px",marginBottom:10})}}>
    <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
      <span style={{color:C.cy}}>{icon}</span>
      <span style={{fontWeight:700,fontSize:15}}>{t(titleKey)}</span>
    </div>
    <div style={{color:C.txm,fontSize:13,lineHeight:1.7,whiteSpace:"pre-line"}}>{t(bodyKey)}</div>
  </div>
);

export default function HelpTab({bp,onShowShortcuts,onRestartTour}){
  return(
    <div style={{padding:bp.mobile?12:24,maxWidth:700,margin:"0 auto"}}>
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:20}}>
        <div style={{width:36,height:36,borderRadius:10,background:`linear-gradient(135deg,${C.vi},${C.cy})`,display:"flex",alignItems:"center",justifyContent:"center",color:"white",fontSize:18}}>?</div>
        <div>
          <div style={{fontWeight:700,fontSize:18}}>{t("help.title")}</div>
          <div style={{fontSize:13,color:C.txd}}>{t("help.subtitle")}</div>
        </div>
      </div>

      <Section icon={<I.Search/>} titleKey="help.getting_started_title" bodyKey="help.getting_started_body"/>
      <Section icon={<I.Database/>} titleKey="help.explorer_title" bodyKey="help.explorer_body"/>
      <Section icon={<I.Eye/>} titleKey="help.show_title" bodyKey="help.show_body"/>
      <Section icon={<I.Grid/>} titleKey="help.metadata_title" bodyKey="help.metadata_body"/>
      <Section icon={<I.Upload/>} titleKey="help.loader_title" bodyKey="help.loader_body"/>
      <Section icon={<I.Link/>} titleKey="help.graph_title" bodyKey="help.graph_body"/>
      <Section icon={<I.Database/>} titleKey="help.solutions_title" bodyKey="help.solutions_body"/>
      <Section icon={<I.Clipboard/>} titleKey="help.translations_title" bodyKey="help.translations_body"/>

      <div style={{display:"flex",gap:10,marginTop:16,flexWrap:"wrap"}}>
        <button onClick={onShowShortcuts} style={{...bt(null,{fontSize:13})}}>{t("help.shortcuts_link")}</button>
        <button onClick={onRestartTour} style={{...bt(null,{fontSize:13})}}>{t("help.restart_tour")}</button>
      </div>
    </div>
  );
}
