import { useState, useEffect, useMemo, useRef } from "react";
import { bridge } from "../d365-bridge.js";
import { C, I, Spin, COMP_TYPES, mono, inp, bt, crd, exportTable, dl, expName } from "../shared.jsx";
import Tooltip from "./Tooltip.jsx";
import { t } from "../i18n.js";
import { compareComponents, compareComponentsCrossOrg, groupByType, compareExportRows, buildCompareFile, parseCompareFile } from "../solutionCompareUtils.js";

export default function SolutionExplorer({bp,orgInfo,theme}){
  const isLive=orgInfo?.isExtension;
  const[solutions,setSolutions]=useState([]);
  const[search,setSearch]=useState("");
  const[solFilter,setSolFilter]=useState("all"); // all | unmanaged | managed
  const[selSol,setSelSol]=useState(null);
  const[components,setComponents]=useState([]);
  const[loading,setLoading]=useState(true);
  const[loadingComp,setLoadingComp]=useState(false);
  const[collapsed,setCollapsed]=useState({});
  const[compCounts,setCompCounts]=useState({});
  // Compare mode: selSol = side A (its components are already loaded), cmpSol = side B.
  const[cmpSol,setCmpSol]=useState(null);
  const[cmpComponents,setCmpComponents]=useState(null);
  const[cmpLoading,setCmpLoading]=useState(false);
  const[cmpError,setCmpError]=useState("");
  const[crossOrg,setCrossOrg]=useState(null); // {org, exportedAt} when side B comes from a file
  const cmpGen=useRef(0);
  const fileInputRef=useRef(null);

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

  const selGen=useRef(0); // guards a slow component load from a previous solution overwriting the current one
  const handleSelect=async(sol)=>{
    const gen=++selGen.current;
    setSelSol(sol);setLoadingComp(true);setCollapsed({});
    setCmpSol(null);setCmpComponents(null);setCmpError("");setCrossOrg(null); // side B belonged to the previous side A
    try{const d=await bridge.getSolutionComponents(sol.id);if(selGen.current!==gen)return;setComponents(d||[]);}catch{if(selGen.current===gen)setComponents([]);}
    if(selGen.current===gen)setLoadingComp(false);
  };

  const startCompare=async(solB)=>{
    const gen=++cmpGen.current;
    setCmpSol(solB);setCmpComponents(null);setCmpError("");setCrossOrg(null);setCmpLoading(true);
    try{const d=await bridge.getSolutionComponents(solB.id);if(cmpGen.current!==gen)return;setCmpComponents(d||[]);}
    catch(e){if(cmpGen.current===gen)setCmpError(e.message||String(e));}
    if(cmpGen.current===gen)setCmpLoading(false);
  };
  const stopCompare=()=>{++cmpGen.current;setCmpSol(null);setCmpComponents(null);setCmpError("");setCrossOrg(null);setCmpLoading(false);};
  const diff=useMemo(()=>cmpSol&&cmpComponents?(crossOrg?compareComponentsCrossOrg(components,cmpComponents):compareComponents(components,cmpComponents)):null,[cmpSol,cmpComponents,components,crossOrg]);

  // Cross-org: export this solution's component list as a file, load it on another org.
  const exportCompareFile=()=>{
    const f=buildCompareFile(selSol,components,orgInfo?.orgUrl?new URL(orgInfo.orgUrl).hostname:orgInfo?.orgName||"");
    dl(JSON.stringify(f,null,1),"application/json",expName(`colvio_compare_${(selSol.uniqueName||"solution").replace(/[^A-Za-z0-9_-]+/g,"_")}`,"json"));
  };
  const loadCompareFile=(file)=>{
    if(!file)return;
    const gen=++cmpGen.current;
    setCmpError("");
    const reader=new FileReader();
    reader.onload=()=>{
      if(cmpGen.current!==gen)return;
      try{
        const parsed=parseCompareFile(JSON.parse(String(reader.result)));
        setCmpSol({id:"__file__",displayName:parsed.solution.displayName||parsed.solution.uniqueName,uniqueName:parsed.solution.uniqueName,version:parsed.solution.version||"?",isManaged:!!parsed.solution.isManaged});
        setCmpComponents(parsed.components);
        setCrossOrg({org:parsed.org,exportedAt:parsed.exportedAt});
        setCmpLoading(false);
      }catch(e){setCmpError(`Compare file: ${e.message}`);}
    };
    reader.onerror=()=>{if(cmpGen.current===gen)setCmpError("Could not read the file.");};
    reader.readAsText(file);
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

  const filtered=solutions.filter(s=>{
    if(solFilter==="managed"&&!s.isManaged)return false;
    if(solFilter==="unmanaged"&&s.isManaged)return false;
    return !search||s.displayName.toLowerCase().includes(search.toLowerCase())||s.uniqueName.toLowerCase().includes(search.toLowerCase());
  });
  const nUnmanaged=solutions.filter(s=>!s.isManaged).length;

  return(
    <div style={{display:"flex",height:"100%"}}>
      <div style={{width:bp.mobile?"100%":280,borderRight:`1px solid ${C.bd}`,display:"flex",flexDirection:"column",flexShrink:0}}>
        <div style={{padding:"12px 10px",borderBottom:`1px solid ${C.bd}`}}>
          <div style={{fontSize:16,fontWeight:700,marginBottom:8,display:"flex",alignItems:"center",gap:6}}>Solutions <Tooltip text={t("help.solution_explorer")}/></div>
          <input placeholder="Search..." value={search} onChange={e=>setSearch(e.target.value)} style={inp({fontSize:13})}/>
          <div style={{display:"flex",gap:2,marginTop:6,flexWrap:"wrap"}}>
            {[["all",`All (${solutions.length})`],["unmanaged",`Unmanaged (${nUnmanaged})`],["managed",`Managed (${solutions.length-nUnmanaged})`]].map(([k,lbl])=>(
              <button key={k} onClick={()=>setSolFilter(k)} style={{padding:"4px 10px",fontSize:11,border:`1px solid ${C.bd}`,borderRadius:3,cursor:"pointer",background:solFilter===k?C.vi:"transparent",color:solFilter===k?"white":C.txd}}>{lbl}</button>
            ))}
          </div>
          {solutions.length>0&&<div style={{fontSize:11,color:C.gn,marginTop:6}}>{filtered.length.toLocaleString()} solution{filtered.length===1?"":"s"}{search?" matching":solFilter!=="all"?` (${solFilter})`:""}</div>}
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
            <div style={{marginBottom:16,display:"flex",alignItems:"flex-start",gap:10,flexWrap:"wrap"}}>
              <div style={{flex:1,minWidth:220}}>
                <div style={{fontSize:18,fontWeight:700}}>{selSol.displayName}</div>
                <div style={{fontSize:13,color:C.txd,...mono}}>{selSol.uniqueName} · v{selSol.version} · {components.length} components</div>
                {selSol.description&&<div style={{fontSize:13,color:C.txm,marginTop:4}}>{selSol.description}</div>}
              </div>
              {components.length>0&&(()=>{
                // Flat export over every group: one row per component with its resolved type label
                // and name — the "what exactly is in this solution" deliverable for deployments.
                const doExport=(format)=>{
                  const rows=[];
                  for(const[,group] of grouped) for(const item of group.items) rows.push([group.l,item.name||"",item.objectId||""]);
                  exportTable(["componentType","name","objectId"],rows,`solution_${(selSol.uniqueName||"components").replace(/[^A-Za-z0-9_-]+/g,"_")}_components`,format,"Components");
                };
                return(<div style={{display:"flex",gap:6,flexShrink:0,alignItems:"center",flexWrap:"wrap"}}>
                  <select value={cmpSol?.id||""} title="Compare this solution's components with another solution of this org" onChange={e=>{const s=solutions.find(x=>x.id===e.target.value);if(s)startCompare(s);else stopCompare();}} style={inp({width:"auto",maxWidth:220,fontSize:11,padding:"4px 8px"})}>
                    <option value="">⇄ Compare with…</option>
                    {solutions.filter(s=>s.id!==selSol.id).map(s=><option key={s.id} value={s.id}>{s.displayName}{s.isManaged?" (managed)":""}</option>)}
                  </select>
                  {!cmpSol&&<>
                    <button onClick={()=>doExport("csv")} style={bt(C.cy,{fontSize:11,padding:"4px 10px"})}><I.Download/> CSV</button>
                    <button onClick={()=>doExport("xlsx")} style={bt(C.cy,{fontSize:11,padding:"4px 10px"})}><I.Download/> Excel</button>
                    <button onClick={exportCompareFile} title="Download a compare file (.json) — load it on ANOTHER org to diff this solution across environments (DEV vs PROD drift)" style={bt(null,{fontSize:11,padding:"4px 10px"})}><I.Download/> Compare file</button>
                    <button onClick={()=>fileInputRef.current?.click()} title="Load a compare file exported from another org — diffs it against THIS solution" style={bt(null,{fontSize:11,padding:"4px 10px"})}><I.Upload/> Load file</button>
                    <input ref={fileInputRef} type="file" accept=".json,application/json" style={{display:"none"}} onChange={e=>{loadCompareFile(e.target.files?.[0]);e.target.value="";}}/>
                  </>}
                </div>);
              })()}
            </div>
            {!cmpSol&&cmpError&&<div style={{color:C.rd,fontSize:13,marginBottom:10}}>{cmpError}</div>}
            {cmpSol&&(
              <div>
                {cmpLoading&&<div style={{textAlign:"center",padding:30}}><Spin s={18}/><div style={{fontSize:12,color:C.txd,marginTop:6}}>Loading {cmpSol.displayName}…</div></div>}
                {cmpError&&<div style={{color:C.rd,fontSize:13,marginBottom:10}}>{cmpError}</div>}
                {diff&&(()=>{
                  const SECTIONS=[
                    ["onlyA",`Only in ${selSol.displayName}${crossOrg?" (this org)":""}`,C.cy],
                    ["both","In both",C.yw],
                    ["onlyB",`Only in ${cmpSol.displayName}${crossOrg?` (${crossOrg.org||"file"})`:""}`,C.vi],
                  ];
                  const bothUnmanaged=!crossOrg&&!selSol.isManaged&&!cmpSol.isManaged;
                  const expName_=`solution_compare_${(selSol.uniqueName||"A").replace(/[^A-Za-z0-9_-]+/g,"_")}_vs_${(cmpSol.uniqueName||"B").replace(/[^A-Za-z0-9_-]+/g,"_")}${crossOrg?"_crossorg":""}`;
                  const CAP=200; // "both" on fat solutions can be thousands of rows — the export has everything
                  return(
                    <div>
                      {!crossOrg&&<div style={{fontSize:13,color:C.txm,marginBottom:10}}>⇄ Comparing with <b>{cmpSol.displayName}</b> <span style={{...mono,fontSize:11,color:C.txd}}>{cmpSol.uniqueName} · v{cmpSol.version}</span> — pick "⇄ Compare with…" again to change, or its first entry to close.</div>}
                      {crossOrg&&(
                        <div style={{marginBottom:10}}>
                          <div style={{fontSize:13,color:C.txm}}>⇄ Comparing with file: <b>{cmpSol.displayName}</b> <span style={{...mono,fontSize:11,color:C.txd}}>{cmpSol.uniqueName} · v{cmpSol.version}</span> exported from <b>{crossOrg.org||"(unknown org)"}</b>{crossOrg.exportedAt?` on ${new Date(crossOrg.exportedAt).toLocaleString()}`:""} — <span style={{cursor:"pointer",textDecoration:"underline"}} onClick={stopCompare}>close</span>.</div>
                          {selSol.uniqueName===cmpSol.uniqueName&&selSol.version!==cmpSol.version&&<div style={{fontSize:12,color:C.yw,marginTop:3}}>Same solution, different versions: v{selSol.version} here vs v{cmpSol.version} there.</div>}
                          <div style={{fontSize:11.5,color:C.txd,marginTop:3,lineHeight:1.5}}>
                            Cross-org matching: {diff.stats.idMatches.toLocaleString()} matched by GUID (solution-transported components keep their id), {diff.stats.nameMatches.toLocaleString()} by type+name (MetadataIds differ across orgs). Caveats: orgs in different base languages can show false differences on name-matched components{(diff.stats.unnamedA>0||diff.stats.unnamedB>0)?`; ${(diff.stats.unnamedA+diff.stats.unnamedB).toLocaleString()} unnamed components could not be matched and sit in the "only" buckets`:""}.
                          </div>
                        </div>
                      )}
                      <div style={{display:"flex",gap:8,marginBottom:10,flexWrap:"wrap",alignItems:"flex-start"}}>
                        {SECTIONS.map(([k,label,color])=>(
                          <div key={k} style={{...crd({padding:"8px 14px"}),borderColor:color+"55"}}>
                            <div style={{fontSize:20,fontWeight:700,color}}>{diff[k].length.toLocaleString()}</div>
                            <div style={{fontSize:11,color:C.txd,maxWidth:160,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}} title={label}>{label}</div>
                          </div>
                        ))}
                        <div style={{flex:1}}/>
                        <div style={{display:"flex",gap:6}}>
                          <button onClick={()=>exportTable(["presence","componentType","name","objectId"],compareExportRows(diff,COMP_TYPES),expName_,"csv","Compare")} style={bt(C.cy,{fontSize:11,padding:"4px 10px"})}><I.Download/> CSV</button>
                          <button onClick={()=>exportTable(["presence","componentType","name","objectId"],compareExportRows(diff,COMP_TYPES),expName_,"xlsx","Compare")} style={bt(C.cy,{fontSize:11,padding:"4px 10px"})}><I.Download/> Excel</button>
                        </div>
                      </div>
                      {bothUnmanaged&&diff.both.length>0&&(
                        <div style={{padding:"8px 12px",background:C.yw+"14",border:`1px solid ${C.yw}44`,borderRadius:8,color:C.yw,fontSize:12.5,marginBottom:10,lineHeight:1.5}}>
                          ⚠ {diff.both.length.toLocaleString()} component{diff.both.length>1?"s":""} live in BOTH unmanaged solutions — the classic source of layering conflicts: whoever publishes last wins, and "my change vanished" starts here.
                        </div>
                      )}
                      {SECTIONS.map(([k,label,color])=>(
                        <div key={k} style={{marginBottom:14}}>
                          <div style={{fontSize:12,fontWeight:700,color,margin:"6px 0",letterSpacing:".4px"}}>{label.toUpperCase()} ({diff[k].length.toLocaleString()})</div>
                          {diff[k].length===0&&<div style={{fontSize:12,color:C.txd,marginBottom:4}}>—</div>}
                          {groupByType(diff[k],COMP_TYPES).map(([tk,g])=>(
                            <div key={tk} style={{...crd({overflow:"hidden"}),marginBottom:4}}>
                              <div style={{display:"flex",alignItems:"center",gap:8,padding:"6px 12px",background:C.sfh,fontSize:13,fontWeight:600,color:C.tx}}>
                                <span>{g.i}</span><span>{g.l}</span><span style={{marginLeft:"auto",fontSize:11,color:C.txd,fontWeight:400}}>{g.items.length.toLocaleString()}</span>
                              </div>
                              <div style={{padding:"4px 12px 6px"}}>
                                {g.items.slice(0,CAP).map((it,i)=>(
                                  <div key={(it.objectId||i)+i} style={{fontSize:12,...mono,color:it.name?C.tx:C.txd,padding:"2px 0"}}>{it.name||it.objectId}</div>
                                ))}
                                {g.items.length>CAP&&<div style={{fontSize:11,color:C.txd,padding:"3px 0"}}>+{(g.items.length-CAP).toLocaleString()} more — the CSV/Excel export has every row.</div>}
                              </div>
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>
            )}
            {!cmpSol&&grouped.map(([typeKey,group])=>{
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
