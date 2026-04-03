import { useState, useEffect, useMemo } from "react";
import { bridge } from "../d365-bridge.js";
import { C, I, Spin, ENTS, FLDS, mono, displayType, inp, bt, crd, ths, tds, dl, copyText, isTrulyCustom } from "../shared.jsx";
import Tooltip from "./Tooltip.jsx";
import { t } from "../i18n.js";

export default function MetadataBrowser({bp,orgInfo,theme}){
  const isLive = orgInfo?.isExtension;
  const[selEnt,setSelEnt]=useState(null);
  const[search,setSearch]=useState("");
  const[catFilter,setCatFilter]=useState("all");
  const[fieldSearch,setFieldSearch]=useState("");
  const[showPicklist,setShowPicklist]=useState(null);
  const[optionSetData,setOptionSetData]=useState({});
  const[exportingOS,setExportingOS]=useState(false);

  // Export ALL OptionSet values for the selected entity as a single CSV
  const exportAllOptionSets=async()=>{
    if(!selEnt||!fields.length||exportingOS)return;
    setExportingOS(true);
    try{
      const osFields=fields.filter(f=>f.t==="Picklist"||f.t==="State"||f.t==="Status");
      if(!osFields.length){setExportingOS(false);return;}
      const rows=["\uFEFFField Logical Name,Field Label,Field Type,Value,Label,Description"];
      for(const f of osFields){
        let vals=optionSetData[f.l];
        if(!vals){
          try{vals=await bridge.getOptionSet(selEnt.l,f.l,f.t);setOptionSetData(prev=>({...prev,[f.l]:vals||[]}));}catch{vals=[];}
        }
        if(vals&&vals.length){
          for(const o of vals){
            const esc=v=>`"${String(v||"").replace(/"/g,'""')}"`;
            rows.push(`${esc(f.l)},${esc(f.d)},${esc(displayType(f.t))},${o.value},${esc(o.label)},${esc(o.description)}`);
          }
        }
      }
      if(rows.length>1) dl(rows.join("\n"),"text/csv;charset=utf-8",`${selEnt.l}_all_optionsets.csv`);
    }catch{}finally{setExportingOS(false);}
  };
  useEffect(()=>{if(!showPicklist)return;const h=e=>{if(e.key==="Escape")setShowPicklist(null);};window.addEventListener("keydown",h);return()=>window.removeEventListener("keydown",h);},[showPicklist]);
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
  const[fields,setFields]=useState([]);
  const[loadingFields,setLoadingFields]=useState(false);

  useEffect(()=>{
    if(!isLive)return;
    bridge.getEntities().then(data=>{
      if(data&&Array.isArray(data)){
        setEntities(data.map(e=>({l:e.logical,d:e.display,p:e.entitySet||e.logical+"s",i:(e.isCustom&&isTrulyCustom(e.logical,e.isManaged))?"⚙️":"📋",c:0,cat:(e.isCustom&&isTrulyCustom(e.logical,e.isManaged))?"Custom":"Standard"})).sort((a,b)=>a.d.localeCompare(b.d)));
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
              {!loadingFields&&fields.some(f=>f.t==="Picklist"||f.t==="State"||f.t==="Status")&&<><button onClick={exportAllOptionSets} disabled={exportingOS} style={{...bt(C.gn,{fontSize:12,padding:"4px 12px",opacity:exportingOS?.6:1})}}>{exportingOS?<><Spin s={10}/> Exporting...</>:<><I.Download/> Export All OptionSets</>}</button><Tooltip text={t("help.optionset_export")}/></>}
            </div>

            <div style={{marginBottom:10}}><input value={fieldSearch} onChange={e=>setFieldSearch(e.target.value)} placeholder="Filter columns..." style={inp({fontSize:13,maxWidth:300})}/></div>

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

            {showPicklist&&(()=>{
              const field=fields.find(f=>f.l===showPicklist);
              if(!field)return null;
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
                        {opts.length>0&&<button onClick={()=>{const csv=opts.map(o=>`${o.value},"${(o.label||"").replace(/"/g,'""')}","${(o.description||"").replace(/"/g,'""')}"`).join("\n");dl("\uFEFF"+"Value,Label,Description\n"+csv,"text/csv;charset=utf-8",`${field.l}_optionset.csv`);cp("","opts");}} style={bt(null,{fontSize:12})}><I.Download/> {copied==="opts"?"✓ Downloaded":"Export CSV"}</button>}
                        <button onClick={()=>setShowPicklist(null)} style={{background:"none",border:"none",color:C.txd,cursor:"pointer",padding:4,fontSize:16}}>✕</button>
                      </div>
                    </div>
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
