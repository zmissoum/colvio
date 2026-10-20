import { useState, useEffect, useMemo, useRef } from "react";
import { bridge } from "../d365-bridge.js";
import { C, I, Spin, ENTS, FLDS, mono, displayType, inp, bt, crd, ths, tds, exportTable, copyText, isTrulyCustom, TableTypeBadge } from "../shared.jsx";
import Tooltip from "./Tooltip.jsx";
import { t } from "../i18n.js";
import SchemaDiff from "./SchemaDiff.jsx";
import { scanFillRate, percent, fillSummary, localAggregateRunner } from "../fillRate.js";
import { dictRows, chunks as dictChunks, DICT_HEADERS } from "../dataDictionary.js";
import { createSink, openOutput } from "../streamExport.js";
import { ROWS } from "../shared.jsx";
import { impactRows, groupRows, IMPACT_HEADERS, impactExportRows } from "../deleteImpact.js";
import LayersModal from "./LayersModal.jsx";
import OptionSetEditor from "./OptionSetEditor.jsx";

export default function MetadataBrowser({bp,orgInfo,theme}){
  const isLive = orgInfo?.isExtension;
  const[selEnt,setSelEnt]=useState(null);
  const[search,setSearch]=useState("");
  const[catFilter,setCatFilter]=useState("all");
  const[fieldSearch,setFieldSearch]=useState("");
  const[showPicklist,setShowPicklist]=useState(null);
  const[osEdit,setOsEdit]=useState(false); // the Values window in edit mode (choice columns)
  useEffect(()=>{setOsEdit(false);},[showPicklist]);
  const[optionSetData,setOptionSetData]=useState({});
  const[exportingOS,setExportingOS]=useState(false);
  // Fill rate of the selected table: { entity, phase: running|done|error|stopped, requests, slices, result, error }
  const[fill,setFill]=useState(null);
  const fillStop=useRef(false);
  // Data dictionary export: { scope, format, phase, done, total, rows, name, error }
  const[dict,setDict]=useState(null);
  const dictStop=useRef(false);
  // Dependency check of a column or the table: { target: column|table, mode: delete|used, item, phase, rows, error }
  const[impact,setImpact]=useState(null);
  const impactGen=useRef(0);
  // Solution layers window: { componentName: Entity|Attribute, id, logical, label }
  const[layers,setLayers]=useState(null);

  // Export ALL field metadata for the selected entity as a single CSV.
  // Includes logical/display names, OData column name (for $select), type, required/custom flags.
  const exportAllFields=(format="csv")=>{
    if(!selEnt||!fields.length)return;
    const fr=fill?.phase==="done"&&fill.entity===selEnt.l?fill.result:null;
    const headers=["Logical Name","Display Name","OData Name","Type","Required","Custom",...(fr?["Filled rows","Filled %"]:[])];
    const rows=fields.map(f=>[f.l,f.d,f.o||f.l,displayType(f.t),f.req?"Yes":"No",f.cust?"Yes":"No",
      ...(fr?(f.l in fr.filled?[fr.filled[f.l],fr.total?Math.round(fr.filled[f.l]/fr.total*1000)/10:""]:[fr.errors[f.l]?"error":"not countable",""]):[])]);
    exportTable(headers,rows,`${selEnt.l}_fields`,format,"Fields");
  };

  // Export ALL OptionSet values for the selected entity as a single CSV
  const exportAllOptionSets=async(format="csv")=>{
    if(!selEnt||!fields.length||exportingOS)return;
    setExportingOS(true);
    try{
      const osFields=fields.filter(f=>f.t==="Picklist"||f.t==="State"||f.t==="Status");
      if(!osFields.length){setExportingOS(false);return;}
      const headers=["Field Logical Name","Field Label","Field Type","Value","Label","Description"];
      const rows=[];
      // every choice column of the table in four reads (one per choice type), not one per column
      const all=await bridge.getAllOptionSets(selEnt.l);
      setOptionSetData(prev=>({...prev,...all}));
      for(const f of osFields){
        for(const o of all[f.l]||[]) rows.push([f.l,f.d,displayType(f.t),o.value,o.label,o.description]);
      }
      if(rows.length) exportTable(headers,rows,`${selEnt.l}_all_optionsets`,format,"OptionSets");
    }catch{}finally{setExportingOS(false);}
  };
  useEffect(()=>{if(!showPicklist)return;const h=e=>{if(e.key==="Escape")setShowPicklist(null);};window.addEventListener("keydown",h);return()=>window.removeEventListener("keydown",h);},[showPicklist]);
  const impactOpen=!!impact;
  useEffect(()=>{if(!impactOpen)return;const h=e=>{if(e.key==="Escape"){impactGen.current++;setImpact(null);}};window.addEventListener("keydown",h);return()=>window.removeEventListener("keydown",h);},[impactOpen]);
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
  },[showPicklist,selEnt?.l]);
  const[copied,setCopied]=useState("");
  const[entities,setEntities]=useState(ENTS);
  const[mbPanel,setMbPanel]=useState("browser"); // "browser" | "diff"
  const[fields,setFields]=useState([]);
  const[loadingFields,setLoadingFields]=useState(false);

  // tick > 0 = user-requested refresh (↻). getEntities caches for 2h — clear first, or a table
  // created since the panel opened stays invisible for the rest of the session.
  const[tick,setTick]=useState(0);
  useEffect(()=>{
    if(!isLive)return;
    bridge.getEntities().then(data=>{
      if(data&&Array.isArray(data)){
        setEntities(data.map(e=>({l:e.logical,d:e.display,p:e.entitySet||e.logical+"s",i:(e.isCustom&&isTrulyCustom(e.logical,e.isManaged))?"⚙️":"📋",c:0,cat:(e.isCustom&&isTrulyCustom(e.logical,e.isManaged))?"Custom":"Standard",tt:e.tableType||"Standard",mid:e.metadataId||null,cust:!!e.isCustom})).sort((a,b)=>a.d.localeCompare(b.d)));
      }
    }).catch(()=>{});
  },[isLive,tick]);
  const doRefresh=async()=>{try{await bridge.clearCache();}catch{}setTick(t2=>t2+1);};

  const selGen=useRef(0); // guards a slow getFields from a previous entity overwriting the current one
  const handleSelectEntity=(e)=>{
    const gen=++selGen.current;
    setSelEnt(e);setFields([]);setShowPicklist(null);setOptionSetData({});setFieldSearch("");
    impactGen.current++;setImpact(null);setLayers(null);
    fillStop.current=true;setFill(null);
    if(isLive){
      setLoadingFields(true);
      bridge.getFields(e.l).then(data=>{
        if(selGen.current!==gen)return; // user switched entity while this was loading
        if(data&&Array.isArray(data)){
          setFields(data.map(f=>({l:f.logical,d:f.display||f.logical,o:f.odataName||f.logical,t:f.type||"String",req:f.required==="ApplicationRequired"||f.required==="SystemRequired",cust:f.isCustom||false,mid:f.metadataId||null})).sort((a,b)=>a.l.localeCompare(b.l)));
        }
      }).catch(()=>{}).finally(()=>{if(selGen.current===gen)setLoadingFields(false);});
    } else {
      setFields(FLDS);
    }
  };

  const cats=[...new Set(entities.map(e=>e.cat))];
  // Table-TYPE chips (Virtual / Elastic) — orthogonal to the Custom/Standard category: a virtual
  // table is usually also "Custom". Only non-Standard types present in the org get a chip.
  const tableTypes=[...new Set(entities.map(e=>e.tt).filter(t2=>t2&&t2!=="Standard"))].sort();
  const filtered=entities.filter(e=>{
    if(tableTypes.includes(catFilter)){if(e.tt!==catFilter)return false;} // type chip active — search still applies below
    else if(catFilter!=="all"&&e.cat!==catFilter)return false;
    if(search&&!e.d.toLowerCase().includes(search.toLowerCase())&&!e.l.includes(search.toLowerCase()))return false;
    return true;
  });

  const filteredFields=fields.filter(f=>!fieldSearch||f.l.includes(fieldSearch.toLowerCase())||f.d.toLowerCase().includes(fieldSearch.toLowerCase()));

  const cp=(t,k)=>{copyText(t);setCopied(k);setTimeout(()=>setCopied(""),1000);};

  // ── Fill rate: exact non-empty counts per column (aggregates, date-sliced past 50k rows) ──
  const runFill=async()=>{
    if(!selEnt||!fields.length) return;
    const ent=selEnt;
    fillStop.current=false;
    setFill({entity:ent.l,phase:"running",requests:0,slices:0});
    try{
      let pk=`${ent.l}id`, oldestMs=null, run;
      if(isLive){
        const meta=await bridge.getEntityMetadata(ent.l); pk=meta.primaryId||pk;
        try{ const r=await bridge.query(ent.p,{select:"createdon",orderby:"createdon asc",top:"1"}); oldestMs=Date.parse(r?.records?.[0]?.createdon); }catch{ /* no createdon: bisection starts in 2000 */ }
        run=async(xml)=>(await bridge.executeFetchXml(xml))?.records||[];
      } else run=localAggregateRunner(ROWS);
      const result=await scanFillRate({entity:ent.l,pk,fields:fields.map(f=>({l:f.l,t:f.t})),oldestMs,run,shouldStop:()=>fillStop.current,
        onProgress:p=>setFill(x=>x&&x.entity===ent.l&&x.phase==="running"?{...x,...p}:x)});
      setFill(x=>x&&x.entity===ent.l?{...x,phase:"done",result}:x);
    }catch(e){
      setFill(x=>x&&x.entity===ent.l?(e.message==="stopped"?{...x,phase:"stopped"}:{...x,phase:"error",error:e.message||String(e)}):x);
    }
  };

  // ── Dependency check: what blocks deleting a column / the table, or everything that uses it ──
  // Dataverse's own answer (RetrieveDependenciesForDelete / RetrieveDependentComponents), one read +
  // grouped name reads. Read-only: nothing is deleted.
  const runImpact=async(target,item,mode)=>{
    if(!selEnt||!item) return;
    const gen=++impactGen.current;
    const m=mode||(target==="table"?(selEnt.cust||!isLive?"delete":"used"):(item.cust?"delete":"used"));
    const base={target,mode:m,item,table:selEnt.l};
    setImpact({...base,phase:"loading"});
    try{
      const r=await bridge.getComponentDependencies({componentType:target==="table"?1:2,objectId:item.mid,mode:m,logicalName:item.l});
      if(impactGen.current!==gen) return;
      setImpact({...base,phase:"done",rows:impactRows(r.deps,r.names,target,r.targetId)});
    }catch(e){ if(impactGen.current===gen) setImpact({...base,phase:"error",error:e.message||String(e)}); }
  };
  const closeImpact=()=>{impactGen.current++;setImpact(null);};

  // ── Data dictionary: every column of the chosen tables, streamed to a file ──
  const dictScopes={custom:entities.filter(e=>e.cat==="Custom"),shown:filtered,all:entities};
  const runDict=async(scope,format)=>{
    const list=dictScopes[scope]||[];
    if(!list.length) return;
    let out;
    try{ out=await openOutput(`data_dictionary_${scope}_${new Date().toISOString().slice(0,10).replace(/-/g,"")}.${format}`,format); }
    catch(e){ setDict(d=>({...d,phase:"error",error:e.message})); return; }
    if(!out) return;
    dictStop.current=false;
    const packets=dictChunks(list.map(e=>e.l));
    setDict({scope,format,phase:"running",done:0,total:list.length,rows:0,name:out.name});
    let sink=null;
    try{
      sink=await createSink(out,format,{headers:DICT_HEADERS,sheetBase:"Data dictionary"});
      let done=0;
      for(const names of packets){
        if(dictStop.current) throw new Error("stopped");
        const defs=await bridge.getDictionaryChunk(names);
        await sink.add(dictRows(defs));
        done+=names.length;
        setDict(d=>d&&d.phase==="running"?{...d,done,rows:sink.rows}:d);
      }
      await sink.close();
      setDict(d=>({...d,phase:"done",rows:sink.rows}));
    }catch(e){
      try{ if(sink) await sink.abort(); else await out.abort?.(); }catch{ /* closed */ }
      setDict(d=>({...d,phase:e.message==="stopped"?"stopped":"error",error:e.message}));
    }
  };

  if(mbPanel==="diff") return(
    <div style={{padding:bp.mobile?12:20,maxWidth:bp.mobile?"100%":1500,margin:"0 auto"}}>
      <div style={{display:"flex",gap:6,marginBottom:14,alignItems:"center"}}>
        <button onClick={()=>setMbPanel("browser")} style={bt(null,{fontSize:12})}>← {t("schemadiff.back")}</button>
        <h2 style={{fontSize:16,fontWeight:700,margin:0}}>⇄ {t("schemadiff.title")}</h2>
      </div>
      <SchemaDiff bp={bp} orgInfo={orgInfo} entities={entities}/>
    </div>
  );

  return(
    <div style={{display:"flex",height:"100%",flexDirection:bp.mobile?"column":"row"}}>
      <div style={{width:bp.mobile?"100%":bp.tablet?200:260,borderRight:bp.mobile?"none":`1px solid ${C.bd}`,display:"flex",flexDirection:"column",flexShrink:0,...(bp.mobile&&selEnt?{display:"none"}:{})}}>
        <div style={{padding:"8px 8px 4px"}}>
          <div style={{display:"flex",gap:6}}>
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search entity..." style={{...inp({fontSize:13,padding:"6px 10px"}),flex:1}}/>
            <button onClick={doRefresh} title="Reload the table list from the environment (cached 2h — a table created since the panel opened doesn't show up otherwise)" style={bt(null,{fontSize:11,padding:"3px 8px"})}>↻</button>
          </div>
          <button onClick={()=>setDict({phase:"pick"})} title="Every column of the tables you choose — type, required, custom, description — streamed to a CSV or Excel file" style={{width:"100%",marginTop:6,padding:"5px 10px",fontSize:11.5,border:`1px solid ${C.vi}55`,borderRadius:4,cursor:"pointer",background:"transparent",color:C.vi,fontWeight:600}}>📚 Data dictionary</button>
          <button onClick={()=>setMbPanel("diff")} title={t("schemadiff.title")} style={{width:"100%",marginTop:6,padding:"5px 10px",fontSize:11.5,border:`1px solid ${C.cy}55`,borderRadius:4,cursor:"pointer",background:"transparent",color:C.cy,fontWeight:600}}>⇄ {t("schemadiff.title")}</button>
          <div style={{display:"flex",gap:2,marginTop:6,flexWrap:"wrap"}}>
            <button onClick={()=>setCatFilter("all")} style={{padding:"4px 10px",fontSize:11,border:`1px solid ${C.bd}`,borderRadius:3,cursor:"pointer",background:catFilter==="all"?C.vi:"transparent",color:catFilter==="all"?"white":C.txd}}>All ({entities.length.toLocaleString()})</button>
            {cats.map(c=><button key={c} onClick={()=>setCatFilter(c)} style={{padding:"4px 10px",fontSize:11,border:`1px solid ${C.bd}`,borderRadius:3,cursor:"pointer",background:catFilter===c?C.vi:"transparent",color:catFilter===c?"white":C.txd}}>{c} ({entities.filter(e=>e.cat===c).length.toLocaleString()})</button>)}
            {tableTypes.map(t2=><button key={t2} onClick={()=>setCatFilter(t2)} title={t2==="Virtual"?"Virtual tables — data lives in an external system, proxied live by a data provider":"Elastic tables — Cosmos-backed, built for very high volumes"} style={{padding:"4px 10px",fontSize:11,border:`1px solid ${catFilter===t2?C.cy:C.cy+"55"}`,borderRadius:3,cursor:"pointer",background:catFilter===t2?C.cy:"transparent",color:catFilter===t2?"white":C.cy}}>{t2} ({entities.filter(e=>e.tt===t2).length.toLocaleString()})</button>)}
          </div>
          {entities.length>0&&<div style={{fontSize:11,color:C.gn,padding:"6px 2px 0"}}>{filtered.length.toLocaleString()} entit{filtered.length===1?"y":"ies"}{search?" matching":catFilter!=="all"?` (${catFilter})`:""}</div>}
        </div>
        <div style={{flex:1,overflow:"auto",padding:"4px 6px"}}>
          {filtered.length===0&&<div style={{padding:14,color:C.txd,fontSize:12,textAlign:"center"}}>{search?`No table matches “${search}”`:"No tables in this category"}{search&&<div style={{marginTop:4,fontSize:11}}>Search checks display and logical names. Just created the table? ↻ reloads the list.</div>}</div>}
          {filtered.map(e=>(
            <button key={e.l} onClick={()=>handleSelectEntity(e)} style={{width:"100%",display:"flex",alignItems:"center",gap:6,padding:"6px 8px",border:"none",borderRadius:5,cursor:"pointer",marginBottom:1,background:selEnt?.l===e.l?C.sfa:"transparent",color:selEnt?.l===e.l?C.tx:C.txm}}>
              <span style={{fontSize:15}}>{e.i}</span>
              <div style={{flex:1,textAlign:"left",minWidth:0}}><div style={{fontSize:13,fontWeight:selEnt?.l===e.l?600:400,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{e.d}</div><div style={{fontSize:11,color:C.txd,...mono}}>{e.l}</div></div>
              <TableTypeBadge tt={e.tt}/>
              {e.c>0&&<span style={{fontSize:10,color:C.txd,background:C.bg,padding:"1px 5px",borderRadius:3,...mono}}>{e.c.toLocaleString()}</span>}
            </button>
          ))}
        </div>
      </div>
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
              {!loadingFields&&fields.length>0&&<><button onClick={()=>exportAllFields("csv")} style={{...bt(C.cy,{fontSize:12,padding:"4px 12px"})}}><I.Download/> Export All Fields</button><button onClick={()=>exportAllFields("xlsx")} style={{...bt(C.cy,{fontSize:12,padding:"4px 12px"})}}><I.Download/> Excel</button><Tooltip text={t("help.fields_export")}/></>}
              {!loadingFields&&fields.length>0&&<button onClick={runFill} disabled={fill?.phase==="running"} title="How many rows have a value in each column — exact counts (aggregates; a big table is counted in date slices, never row by row)" style={{...bt(C.vi,{fontSize:12,padding:"4px 12px",opacity:fill?.phase==="running"?.6:1})}}>📊 Fill rate</button>}
              <button onClick={()=>runImpact("table",selEnt)} title="What would block deleting this table, or everything that uses it — Dataverse's own dependency check, read-only (nothing is deleted)" style={{...bt(C.or,{fontSize:12,padding:"4px 12px"})}}>🧨 Dependencies</button>
              <button onClick={()=>setLayers({componentName:"Entity",id:selEnt.mid,name:selEnt.l,logical:selEnt.l,label:selEnt.d})} title="The solution layers of this table — which solutions change it, in which order, and whether an unmanaged layer hides a managed one (read-only)" style={{...bt(C.cy,{fontSize:12,padding:"4px 12px"})}}>📑 Layers</button>
              {!loadingFields&&fields.some(f=>f.t==="Picklist"||f.t==="State"||f.t==="Status")&&<><button onClick={()=>exportAllOptionSets("csv")} disabled={exportingOS} style={{...bt(C.gn,{fontSize:12,padding:"4px 12px",opacity:exportingOS?.6:1})}}>{exportingOS?<><Spin s={10}/> Exporting...</>:<><I.Download/> Export All OptionSets</>}</button><button onClick={()=>exportAllOptionSets("xlsx")} disabled={exportingOS} style={{...bt(C.gn,{fontSize:12,padding:"4px 12px",opacity:exportingOS?.6:1})}}>{exportingOS?<><Spin s={10}/> Exporting...</>:<><I.Download/> Excel</>}</button><Tooltip text={t("help.optionset_export")}/></>}
            </div>

            {fill&&fill.entity===selEnt.l&&(()=>{
              const box=(color)=>({...crd({padding:"8px 12px",borderColor:color+"55"}),marginBottom:10,fontSize:12.5,display:"flex",alignItems:"center",gap:10,flexWrap:"wrap",color:C.txm});
              if(fill.phase==="running") return <div style={box(C.vi)}><Spin s={11}/><span style={{flex:1}}>Counting values in every column{fill.slices>1?` — ${fill.slices} date slices (the table is past the 50,000-row aggregate limit)`:""} · {fill.requests} request{fill.requests===1?"":"s"}</span><button onClick={()=>{fillStop.current=true;}} style={bt(null,{fontSize:11,padding:"2px 9px"})}>Stop</button></div>;
              if(fill.phase==="stopped") return <div style={box(C.yw)}><span style={{flex:1}}>Stopped — no fill rate shown (a partial count would mislead).</span><button onClick={()=>setFill(null)} style={bt(null,{fontSize:11,padding:"2px 9px"})}>Close</button></div>;
              if(fill.phase==="error") return <div style={box(C.rd)}><span style={{flex:1,color:C.rd}}>Couldn't count: {fill.error}</span><button onClick={runFill} style={bt(null,{fontSize:11,padding:"2px 9px"})}>↻ Retry</button></div>;
              const r=fill.result, sm=fillSummary(r), nErr=Object.keys(r.errors).length;
              return <div style={box(C.gn)}><span style={{flex:1}}><b style={{color:C.tx}}>{r.total.toLocaleString()} rows</b> · {sm.empty.length} column{sm.empty.length===1?"":"s"} never filled · {sm.under5.length} under 5 %{r.skipped.length?` · ${r.skipped.length} not countable (images, files, virtual…)`:""}{nErr?` · ${nErr} the server couldn't count`:""} · {r.requests} request{r.requests===1?"":"s"}{r.slices>1?` over ${r.slices} date slices`:""}</span><button onClick={()=>setFill(null)} style={bt(null,{fontSize:11,padding:"2px 9px"})}>Hide</button></div>;
            })()}
            <div style={{marginBottom:10}}><input value={fieldSearch} onChange={e=>setFieldSearch(e.target.value)} placeholder="Filter columns..." style={inp({fontSize:13,maxWidth:300})}/></div>

            {loadingFields ? (
              <div style={{textAlign:"center",padding:30}}><Spin/><p style={{color:C.txd,fontSize:13,marginTop:8}}>Loading columns...</p></div>
            ) : (
            <div style={{...crd({overflow:"hidden"})}}>
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:14,minWidth:450}}>
                <thead><tr><th style={{...ths(),width:20}}></th><th style={ths()}>Logical Name</th><th style={ths()}>Label</th><th style={ths()}>Type</th><th style={ths()}>Required</th>{fill?.phase==="done"&&fill.entity===selEnt.l&&<th style={{...ths(),width:130}}>Filled</th>}<th style={ths()}>Actions</th></tr></thead>
                <tbody>{filteredFields.map((f,i)=>(
                  <tr key={f.l} style={{borderBottom:`1px solid ${C.bd}`}} onMouseEnter={e=>e.currentTarget.style.background=C.sfh} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                    <td style={{...tds,textAlign:"center"}}>{f.cust&&<span style={{width:5,height:5,borderRadius:"50%",background:C.or,display:"inline-block"}}/>}</td>
                    <td style={tds}><span style={{color:C.cy,...mono,fontSize:13,cursor:"pointer"}} onClick={()=>cp(f.l,`m-${i}`)}>{f.l}</span>{copied===`m-${i}`&&<span style={{color:C.gn,fontSize:11,marginLeft:3}}>✓</span>}</td>
                    <td style={{...tds,color:C.txm}}>{f.d}</td>
                    <td style={tds}><span style={{fontSize:12,padding:"2px 6px",borderRadius:3,background:f.t==="Lookup"?C.vid:(f.t==="Picklist"||f.t==="State"||f.t==="Status")?C.gnd:C.sfh,color:f.t==="Lookup"?C.lv:(f.t==="Picklist"||f.t==="State"||f.t==="Status")?C.gn:C.txm}}>{displayType(f.t)}</span></td>
                    <td style={tds}>{f.req?<span style={{color:C.rd,fontSize:13}}>●</span>:<span style={{color:C.txd}}>—</span>}</td>
                    {fill?.phase==="done"&&fill.entity===selEnt.l&&(()=>{
                      const r=fill.result;
                      if(r.errors[f.l]) return <td style={{...tds,color:C.yw,fontSize:12}} title={r.errors[f.l]}>⚠ can't count</td>;
                      if(!(f.l in r.filled)) return <td style={{...tds,color:C.txd,fontSize:12}} title="Images, files, virtual and multi-select columns can't be counted by an aggregate">—</td>;
                      const n=r.filled[f.l], ratio=r.total?n/r.total:0;
                      return <td style={tds} title={`${n.toLocaleString()} of ${r.total.toLocaleString()} rows have a value`}><div style={{display:"flex",alignItems:"center",gap:6}}><div style={{width:50,height:6,background:C.bd,borderRadius:3}}><div style={{width:`${Math.round(ratio*100)}%`,height:6,background:n===0?C.rd:ratio<0.05?C.yw:C.gn,borderRadius:3}}/></div><span style={{...mono,fontSize:12,color:n===0?C.rd:C.txm}}>{percent(n,r.total)}</span></div></td>;
                    })()}
                    <td style={{...tds,whiteSpace:"nowrap"}}>{(f.t==="Picklist"||f.t==="State"||f.t==="Status")&&<button onClick={()=>setShowPicklist(showPicklist===f.l?null:f.l)} style={{...bt(showPicklist===f.l?C.vi:null,{fontSize:12,padding:"3px 10px"}),marginRight:4}}>{showPicklist===f.l?"Close":"Values"}{optionSetData[f.l]?` (${optionSetData[f.l].length})`:""}</button>}<button onClick={()=>runImpact("column",f)} title={f.cust?"What would block deleting this column, or everything that uses it (read-only)":"Everything that uses this column — forms, views, processes, plug-in steps… (read-only)"} style={bt(null,{fontSize:12,padding:"3px 8px"})}>🧨</button><button onClick={()=>setLayers({componentName:"Attribute",id:f.mid,name:f.l,logical:`${selEnt.l}.${f.l}`,label:f.d})} title="Solution layers of this column (read-only)" style={{...bt(null,{fontSize:12,padding:"3px 8px"}),marginLeft:4}}>📑</button></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
            )}

            {showPicklist&&(()=>{
              const field=fields.find(f=>f.l===showPicklist);
              if(!field)return null;
              const optsLoaded=optionSetData[field.l]!==undefined||!!field.opts; // [] = fetched-but-empty/failed, undefined = still loading
              const opts=optionSetData[field.l]||field.opts||[];
              return(
                <div style={{position:"fixed",inset:0,zIndex:100,display:"flex",alignItems:"center",justifyContent:"center"}} onClick={()=>setShowPicklist(null)}>
                  <div style={{position:"absolute",inset:0,background:"rgba(0,0,0,0.6)",backdropFilter:"blur(3px)"}}/>
                  <div style={{position:"relative",width:"90%",maxWidth:650,maxHeight:"80vh",background:C.sf,border:`1px solid ${C.bd}`,borderRadius:12,boxShadow:"0 20px 60px rgba(0,0,0,.5)",display:"flex",flexDirection:"column",overflow:"hidden"}} onClick={e=>e.stopPropagation()}>
                    <div style={{padding:"14px 18px",borderBottom:`1px solid ${C.bd}`,display:"flex",alignItems:"center",justifyContent:"space-between",flexShrink:0,flexWrap:"wrap",gap:6}}>
                      <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                        <span style={{fontWeight:700,fontSize:16}}>{field.d}</span>
                        <span style={{fontSize:13,color:C.txd,...mono}}>{field.l}</span>
                        <span style={{fontSize:12,color:C.gn,padding:"2px 8px",background:C.gnd,borderRadius:4}}>{displayType(field.t)}</span>
                        {opts.length>0&&<span style={{fontSize:12,color:C.txm}}>{opts.length} values</span>}
                      </div>
                      <div style={{display:"flex",gap:6}}>
                        {field.t==="Picklist"&&<button onClick={()=>setOsEdit(e=>!e)} title="Add, rename, reorder or delete options — Dataverse's own actions, confirmed, then published" style={bt(osEdit?C.vi:null,{fontSize:12})}>{osEdit?"✓ Done":"✏️ Edit values"}</button>}
                        {opts.length>0&&<button onClick={()=>{exportTable(["Value","Label","Description"],opts.map(o=>[o.value,o.label,o.description]),`${field.l}_optionset`,"csv","OptionSet");cp("","opts");}} style={bt(null,{fontSize:12})}><I.Download/> {copied==="opts"?"✓ Downloaded":"Export CSV"}</button>}
                        {opts.length>0&&<button onClick={()=>{exportTable(["Value","Label","Description"],opts.map(o=>[o.value,o.label,o.description]),`${field.l}_optionset`,"xlsx","OptionSet");cp("","opts");}} style={bt(null,{fontSize:12})}><I.Download/> {copied==="opts"?"✓ Downloaded":"Excel"}</button>}
                        <button onClick={()=>setShowPicklist(null)} style={{background:"none",border:"none",color:C.txd,cursor:"pointer",padding:4,fontSize:16}}>✕</button>
                      </div>
                    </div>
                    <div style={{flex:1,overflow:"auto",padding:0}}>
                      {osEdit?<OptionSetEditor entity={selEnt.l} field={field} isProduction={orgInfo?.isProduction} onChanged={o2=>setOptionSetData(prev=>({...prev,[field.l]:o2}))}/>:opts.length===0?(
                        // A fetch failure used to cache [] and render THIS spinner forever with no
                        // retry (audit finding) — an empty-but-loaded set now says so, with a Retry
                        // that drops the cached [] so the effect refetches.
                        optsLoaded?(
                          <div style={{textAlign:"center",padding:30,color:C.txd,fontSize:14}}>
                            No values returned — the option set is empty, or its fetch failed.
                            <button onClick={()=>setOptionSetData(prev=>{const n={...prev};delete n[field.l];return n;})} style={{...bt(null,{fontSize:12}),marginLeft:10}}>↻ Retry</button>
                          </div>
                        ):(
                          <div style={{textAlign:"center",padding:30,color:C.txd,fontSize:14}}><Spin/> Loading values...</div>
                        )
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
      {impact&&(()=>{
        const isTable=impact.target==="table", it=impact.item;
        const groups=impact.phase==="done"?groupRows(impact.rows):[];
        const ext=impact.phase==="done"?impact.rows.filter(r=>!r.internal):[], own=impact.phase==="done"?impact.rows.filter(r=>r.internal):[];
        const what=isTable?"the table":"the column";
        const fname=`${impact.mode==="delete"?"delete_impact":"used_by"}_${isTable?impact.table:`${impact.table}_${it.l}`}`;
        const tab=(m,l)=><button onClick={()=>impact.mode!==m&&runImpact(impact.target,it,m)} style={{padding:"4px 10px",fontSize:12,border:`1px solid ${C.bd}`,borderRadius:4,cursor:"pointer",background:impact.mode===m?C.or:"transparent",color:impact.mode===m?"white":C.txm,fontWeight:impact.mode===m?600:400}}>{l}</button>;
        return <div style={{position:"fixed",inset:0,zIndex:100,display:"flex",alignItems:"center",justifyContent:"center",background:"rgba(0,0,0,.55)"}} onClick={closeImpact}>
          <div style={{width:760,maxWidth:"94vw",maxHeight:"86vh",display:"flex",flexDirection:"column",background:C.sf,border:`1px solid ${C.bd}`,borderRadius:10,boxShadow:"0 16px 48px rgba(0,0,0,.5)",overflow:"hidden"}} onClick={e=>e.stopPropagation()}>
            <div style={{padding:"14px 18px 10px",borderBottom:`1px solid ${C.bd}`}}>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <span style={{fontWeight:700,fontSize:15,flex:1,minWidth:0}}>🧨 {it.d} <span style={{...mono,fontSize:12,color:C.txd,fontWeight:400}}>{isTable?it.l:`${impact.table}.${it.l}`}</span></span>
                {impact.phase==="done"&&impact.rows.length>0&&<><button onClick={()=>exportTable(IMPACT_HEADERS,impactExportRows(impact.rows),fname,"csv","Dependencies")} style={bt(null,{fontSize:12})}><I.Download/> CSV</button><button onClick={()=>exportTable(IMPACT_HEADERS,impactExportRows(impact.rows),fname,"xlsx","Dependencies")} style={bt(null,{fontSize:12})}><I.Download/> Excel</button></>}
                <button onClick={closeImpact} style={{background:"none",border:"none",color:C.txd,cursor:"pointer",padding:4,fontSize:16}}>✕</button>
              </div>
              <div style={{display:"flex",gap:4,marginTop:8}}>{tab("delete","What blocks deleting it")}{tab("used","Everything that uses it")}</div>
            </div>
            <div style={{flex:1,overflow:"auto",padding:"12px 18px"}}>
              {impact.phase==="loading"&&<div style={{display:"flex",alignItems:"center",gap:8,color:C.txm,fontSize:13}}><Spin s={12}/> Asking Dataverse what depends on {what}…</div>}
              {impact.phase==="error"&&<div style={{color:C.rd,fontSize:13}}>Couldn't read the dependencies: {impact.error} <button onClick={()=>runImpact(impact.target,it,impact.mode)} style={{...bt(null,{fontSize:12}),marginLeft:8}}>↻ Retry</button></div>}
              {impact.phase==="done"&&impact.mode==="delete"&&!isTable&&!it.cust&&isLive&&<div style={{fontSize:12,color:C.yw,marginBottom:8}}>A standard column can't be deleted at all — "Everything that uses it" is the useful question here.</div>}
              {impact.phase==="done"&&!ext.length&&<div style={{color:C.gn,fontSize:13.5,marginBottom:own.length?10:0}}>✓ {impact.mode==="delete"?`Nothing in Dataverse blocks deleting ${what}.`:`No other component uses ${what}.`}</div>}
              {impact.phase==="done"&&ext.length>0&&<div style={{fontSize:13,marginBottom:10,color:C.txm}}>{impact.mode==="delete"?<><b style={{color:C.rd}}>{ext.length} component{ext.length===1?"":"s"}</b> must stop using {what} before Dataverse lets you delete it:</>:<><b style={{color:C.tx}}>{ext.length} component{ext.length===1?"":"s"}</b> use{ext.length===1?"s":""} {what}:</>}</div>}
              {groups.map((g,gi)=>(
                <div key={`${g.kind}-${g.internal}-${gi}`} style={{marginBottom:12}}>
                  <div style={{fontSize:11.5,fontWeight:700,color:C.txd,textTransform:"uppercase",letterSpacing:.4,marginBottom:4}}>{g.kind} · {g.rows.length}{g.internal?` · ${isTable?"its own part — deleted with it":"part of it"}`:""}</div>
                  {g.rows.map(r=>(
                    <div key={r.key} style={{padding:"6px 9px",borderLeft:`2px solid ${g.internal?C.bd:impact.mode==="delete"?C.or:C.cy}`,background:C.bg,borderRadius:4,marginBottom:4}}>
                      <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap",fontSize:13}}>
                        <b>{r.name||<span style={{...mono,color:C.txd,fontWeight:400}}>{r.id}</span>}</b>
                        {r.table&&<span style={{fontSize:11,...mono,color:C.cy,background:C.cy+"18",padding:"1px 6px",borderRadius:3}}>{r.table}</span>}
                        {r.detail&&<span style={{fontSize:11.5,color:C.txd}}>{r.detail}</span>}
                        {r.unpublished&&<span title="The dependency comes from an unpublished customization" style={{fontSize:10.5,color:C.yw,background:C.yw+"22",padding:"1px 5px",borderRadius:3}}>unpublished</span>}
                      </div>
                      {r.through.length>0&&<div style={{fontSize:11.5,color:C.txm,marginTop:1}}>through {r.through.join(", ")}</div>}
                      {!g.internal&&<div style={{fontSize:12,color:C.txd,marginTop:2}}>→ {r.hint}</div>}
                    </div>
                  ))}
                </div>
              ))}
            </div>
            <div style={{padding:"8px 18px",borderTop:`1px solid ${C.bd}`,fontSize:11.5,color:C.txd,lineHeight:1.5}}>Read-only — nothing is deleted. This is Dataverse's own dependency tracking: forms, views, charts, processes, plug-in step filters and images, mappings, keys, field security, apps, site maps… It does not see a name typed inside JavaScript, plug-in code, flow expressions or report queries — search those as well before deleting.</div>
          </div>
        </div>;
      })()}
      {layers&&<LayersModal target={layers} onClose={()=>setLayers(null)}/>}
      {dict&&<div style={{position:"fixed",inset:0,zIndex:100,display:"flex",alignItems:"center",justifyContent:"center",background:"rgba(0,0,0,.55)"}} onClick={()=>dict.phase!=="running"&&setDict(null)}>
        <div style={{width:460,maxWidth:"92vw",background:C.sf,border:`1px solid ${C.bd}`,borderRadius:10,padding:18,boxShadow:"0 16px 48px rgba(0,0,0,.5)"}} onClick={e=>e.stopPropagation()}>
          <div style={{fontSize:15,fontWeight:700,marginBottom:4}}>📚 Data dictionary</div>
          <div style={{fontSize:12,color:C.txd,lineHeight:1.6,marginBottom:12}}>Every column of the tables you choose — type, required level, custom or not, primary key / name, create / update, descriptions — one row per column, streamed to the file (tables are read {20} at a time). Choice values are in each table's "Export All OptionSets".</div>
          {dict.phase==="pick"&&<>
            {[["custom","Custom tables"],["shown","Tables shown in the list"],["all","All tables"]].map(([k,l])=>(
              <div key={k} style={{display:"flex",alignItems:"center",gap:8,padding:"6px 0",borderTop:`1px solid ${C.bd}55`}}>
                <span style={{flex:1,fontSize:13}}>{l} <span style={{color:C.txd,fontSize:12}}>· {(dictScopes[k]||[]).length.toLocaleString()}</span></span>
                <button onClick={()=>runDict(k,"csv")} disabled={!(dictScopes[k]||[]).length} style={bt(C.cy,{fontSize:11.5,padding:"3px 10px"})}>CSV</button>
                <button onClick={()=>runDict(k,"xlsx")} disabled={!(dictScopes[k]||[]).length} style={bt(C.cy,{fontSize:11.5,padding:"3px 10px"})}>Excel</button>
              </div>
            ))}
            <div style={{display:"flex",justifyContent:"flex-end",marginTop:10}}><button onClick={()=>setDict(null)} style={bt(null,{fontSize:12})}>{t("common.cancel")}</button></div>
          </>}
          {dict.phase==="running"&&<div style={{display:"flex",alignItems:"center",gap:10,fontSize:13,color:C.txm}}><Spin s={12}/><span style={{flex:1}}>{dict.done.toLocaleString()} / {dict.total.toLocaleString()} tables · {dict.rows.toLocaleString()} columns written to {dict.name}</span><button onClick={()=>{dictStop.current=true;}} style={bt(C.rd,{fontSize:12})}>Stop</button></div>}
          {dict.phase==="done"&&<div style={{fontSize:13}}><span style={{color:C.gn}}>✓ {dict.rows.toLocaleString()} columns of {dict.total.toLocaleString()} tables written to {dict.name}.</span><div style={{display:"flex",justifyContent:"flex-end",marginTop:10}}><button onClick={()=>setDict(null)} style={bt(null,{fontSize:12})}>Close</button></div></div>}
          {(dict.phase==="stopped"||dict.phase==="error")&&<div style={{fontSize:13}}><span style={{color:dict.phase==="error"?C.rd:C.yw}}>{dict.phase==="error"?`Failed — the file wasn't written: ${dict.error}`:"Stopped — the file wasn't written (a partial dictionary would look complete)."}</span><div style={{display:"flex",justifyContent:"flex-end",marginTop:10}}><button onClick={()=>setDict(null)} style={bt(null,{fontSize:12})}>Close</button></div></div>}
        </div>
      </div>}
    </div>
  );
}
