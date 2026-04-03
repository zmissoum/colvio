import { useState, useEffect, useMemo } from "react";
import { bridge } from "../d365-bridge.js";
import { C, I, Spin, COMP_TYPES, mono, inp, bt, crd } from "../shared.jsx";
import Tooltip from "./Tooltip.jsx";
import { t } from "../i18n.js";

export default function SolutionExplorer({bp,orgInfo,theme}){
  const isLive=orgInfo?.isExtension;
  const[solutions,setSolutions]=useState([]);
  const[search,setSearch]=useState("");
  const[selSol,setSelSol]=useState(null);
  const[components,setComponents]=useState([]);
  const[loading,setLoading]=useState(true);
  const[loadingComp,setLoadingComp]=useState(false);
  const[collapsed,setCollapsed]=useState({});
  const[compCounts,setCompCounts]=useState({});

  useEffect(()=>{bridge.getSolutions().then(d=>{setSolutions(d||[]);setLoading(false);}).catch(()=>setLoading(false));},[]);

  // Load component counts lazily (first 20 solutions only)
  useEffect(()=>{
    if(solutions.length===0)return;
    let cancelled=false;
    const loadCounts=async()=>{
      const counts={};
      for(const sol of solutions.slice(0,20)){
        if(cancelled)break;
        try{
          const comps=await bridge.getSolutionComponents(sol.id);
          counts[sol.id]=(comps||[]).length;
          if(!cancelled)setCompCounts(prev=>({...prev,...counts}));
        }catch{
          counts[sol.id]=0;
        }
      }
    };
    loadCounts();
    return()=>{cancelled=true;};
  },[solutions]);

  const resolveName=(item)=>{
    if(item.name)return item.name;
    return item.objectId?.substring(0,13)+"…";
  };

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
      <div style={{width:bp.mobile?"100%":280,borderRight:`1px solid ${C.bd}`,display:"flex",flexDirection:"column",flexShrink:0}}>
        <div style={{padding:"12px 10px",borderBottom:`1px solid ${C.bd}`}}>
          <div style={{fontSize:16,fontWeight:700,marginBottom:8,display:"flex",alignItems:"center",gap:6}}>Solutions <Tooltip text={t("help.solution_explorer")}/></div>
          <input placeholder="Search..." value={search} onChange={e=>setSearch(e.target.value)} style={inp({fontSize:13})}/>
        </div>
        <div style={{flex:1,overflow:"auto",padding:"4px 6px"}}>
          {loading&&<div style={{textAlign:"center",padding:20}}><Spin/></div>}
          {filtered.map(s=>(
            <button key={s.id} onClick={()=>handleSelect(s)} style={{width:"100%",textAlign:"left",padding:"8px 10px",border:"none",borderRadius:6,cursor:"pointer",marginBottom:2,background:selSol?.id===s.id?C.sfa:"transparent",color:selSol?.id===s.id?C.tx:C.txm}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <span style={{fontWeight:selSol?.id===s.id?600:400,fontSize:13,flex:1,minWidth:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{s.displayName}</span>
                <div style={{display:"flex",alignItems:"center",gap:4,flexShrink:0}}>
                  {compCounts[s.id]!=null&&<span style={{fontSize:10,padding:"1px 5px",borderRadius:8,background:C.sfh,color:C.txd,fontWeight:600,...mono}}>{compCounts[s.id]}</span>}
                  <span style={{fontSize:10,padding:"2px 6px",borderRadius:4,background:s.isManaged?C.vid:C.gnd,color:s.isManaged?C.vi:C.gn}}>{s.isManaged?"Managed":"Unmanaged"}</span>
                </div>
              </div>
              <div style={{fontSize:11,color:C.txd,...mono}}>{s.uniqueName} · v{s.version}</div>
            </button>
          ))}
        </div>
      </div>
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
                    <span style={{color:C.txd,transform:isOpen?"rotate(90deg)":"rotate(0)",transition:"transform .15s"}}>&#x25b8;</span>
                  </button>
                  {isOpen&&(
                    <div style={{padding:"4px 14px 8px"}}>
                      {group.items.map((item,i)=>(
                        <div key={item.id||i} style={{padding:"3px 0",fontSize:12,color:C.txm,...mono,borderBottom:i<group.items.length-1?`1px solid ${C.bd}22`:"",display:"flex",alignItems:"center",gap:6}}>
                          <span style={{color:item.name?C.tx:C.txd}}>{resolveName(item)}</span>
                          {item.name&&<span style={{fontSize:10,color:C.txd}}>{item.objectId?.substring(0,8)}…</span>}
                        </div>
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
