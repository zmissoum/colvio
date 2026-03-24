import { useState, useEffect } from "react";
import { C, I, bt } from "../shared.jsx";
import { t } from "../i18n.js";

const STEPS=[
  {icon:<I.Search/>,color:C.cy,titleKey:"tour.step0_title",bodyKey:"tour.step0_body"},
  {icon:<I.Grid/>,color:C.gn,titleKey:"tour.step1_title",bodyKey:"tour.step1_body"},
  {icon:<I.Play/>,color:C.vi,titleKey:"tour.step2_title",bodyKey:"tour.step2_body"},
  {icon:<I.Download/>,color:C.or,titleKey:"tour.step3_title",bodyKey:"tour.step3_body"},
  {icon:<I.Eye/>,color:C.cy,titleKey:"tour.step4_title",bodyKey:"tour.step4_body"},
];

export default function OnboardingTour(){
  const[step,setStep]=useState(0);
  const[visible,setVisible]=useState(false);

  useEffect(()=>{
    try{if(!localStorage.getItem("colvio_tour_done"))setVisible(true);}catch{setVisible(true);}
  },[]);

  const finish=()=>{try{localStorage.setItem("colvio_tour_done","1");}catch{}setVisible(false);};
  const skip=finish;

  if(!visible)return null;
  const s=STEPS[step];
  const isLast=step===STEPS.length-1;

  return(
    <div style={{position:"fixed",inset:0,zIndex:250,display:"flex",alignItems:"center",justifyContent:"center"}}>
      <div style={{position:"absolute",inset:0,background:"rgba(0,0,0,0.7)",backdropFilter:"blur(4px)"}}/>
      <div style={{position:"relative",width:"90%",maxWidth:460,background:C.sf,border:`1px solid ${C.bd}`,borderRadius:16,boxShadow:"0 20px 60px rgba(0,0,0,.5)",overflow:"hidden",animation:"fadeIn .3s"}}>
        {/* Progress */}
        <div style={{height:4,background:C.bg}}>
          <div style={{height:4,background:`linear-gradient(90deg,${C.vi},${C.cy})`,width:`${((step+1)/STEPS.length)*100}%`,transition:"width .3s",borderRadius:2}}/>
        </div>
        {/* Content */}
        <div style={{padding:"28px 28px 20px",textAlign:"center"}}>
          <div style={{width:48,height:48,borderRadius:12,background:s.color+"22",display:"inline-flex",alignItems:"center",justifyContent:"center",color:s.color,marginBottom:12}}>
            <span style={{transform:"scale(1.8)"}}>{s.icon}</span>
          </div>
          <div style={{fontWeight:700,fontSize:18,marginBottom:8}}>{t(s.titleKey)}</div>
          <div style={{color:C.txm,fontSize:14,lineHeight:1.6,marginBottom:20}}>{t(s.bodyKey)}</div>
          {/* Step dots */}
          <div style={{display:"flex",justifyContent:"center",gap:6,marginBottom:18}}>
            {STEPS.map((_,i)=><div key={i} style={{width:8,height:8,borderRadius:"50%",background:i===step?C.vi:C.bd,transition:"background .2s"}}/>)}
          </div>
          {/* Buttons */}
          <div style={{display:"flex",justifyContent:"center",gap:10}}>
            <button onClick={skip} style={{...bt(null,{fontSize:13,padding:"8px 20px"})}}>{t("tour.skip")}</button>
            {isLast
              ?<button onClick={finish} style={{...bt(`linear-gradient(135deg,${C.vi},${C.cy})`,{fontSize:13,padding:"8px 24px"})}}>{t("tour.done")}</button>
              :<button onClick={()=>setStep(step+1)} style={{...bt(C.vi,{fontSize:13,padding:"8px 24px"})}}>{t("tour.next")} →</button>
            }
          </div>
        </div>
        {/* Step counter */}
        <div style={{padding:"8px 0",textAlign:"center",fontSize:12,color:C.txd,borderTop:`1px solid ${C.bd}`}}>{step+1} / {STEPS.length}</div>
      </div>
    </div>
  );
}
