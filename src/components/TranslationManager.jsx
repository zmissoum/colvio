import { useState, useEffect, useRef } from "react";
import { bridge } from "../d365-bridge.js";
import { C, I, Spin, ENTS, mono, displayType, inp, bt, crd, ths, tds, dl, expName, confirmProd } from "../shared.jsx";
import { t } from "../i18n.js";

export default function TranslationManager({bp,orgInfo,theme,canPublish=true}){
  const isLive=orgInfo?.isExtension;
  // No publish privilege → read-only: browse + export stay, editing/saving/import are hidden.
  const readOnly=canPublish===false;
  const[entities,setEntities]=useState(ENTS);
  const[search,setSearch]=useState("");
  const[selEnt,setSelEnt]=useState(null);
  const[languages,setLanguages]=useState([]);
  const[selLangs,setSelLangs]=useState([]);
  const[attributes,setAttributes]=useState([]);
  const[edits,setEdits]=useState({});
  const[loading,setLoading]=useState(false);
  const[saving,setSaving]=useState(false);
  const[saveMsg,setSaveMsg]=useState(null);
  const[attrSearch,setAttrSearch]=useState("");
  const[confirmModal,setConfirmModal]=useState(null);
  const fRef=useRef(null);
  const selGen=useRef(0); // guards against a slow load from a previous entity overwriting the current one

  // ── Solution-wide translations via the OFFICIAL ExportTranslation / ImportTranslation actions ──
  // One zip covers everything Microsoft deems localizable: form tabs/sections/labels, views,
  // charts, dashboards, sitemap, option sets, custom ribbon LocLabels. Colvio never parses the
  // XML — it transports the file; Dataverse does the work (zero corruption risk).
  const[solutions,setSolutions]=useState([]);
  const[selSolName,setSelSolName]=useState("");
  const[solBusy,setSolBusy]=useState("");        // "export" | "import" | "publish" | ""
  const[solMsg,setSolMsg]=useState(null);        // {ok, text}
  const[importJob,setImportJob]=useState(null);  // {id, progress, done}
  const[autoPublish,setAutoPublish]=useState(true);
  const zipRef=useRef(null);
  const jobPollRef=useRef(null);
  useEffect(()=>{
    if(isLive) bridge.getSolutions().then(d=>setSolutions((d||[]).slice().sort((a,b)=>(a.isManaged?1:0)-(b.isManaged?1:0)||String(a.displayName).localeCompare(String(b.displayName))))).catch(()=>{});
    return ()=>{ if(jobPollRef.current) clearInterval(jobPollRef.current); };
  },[]);

  const doExportTranslations=async()=>{
    if(!selSolName) return;
    setSolBusy("export");setSolMsg(null);
    try{
      const r=await bridge.exportTranslations(selSolName);
      if(!r?.fileB64) throw new Error("Empty file returned");
      const bin=atob(r.fileB64);const bytes=new Uint8Array(bin.length);
      for(let i=0;i<bin.length;i++)bytes[i]=bin.charCodeAt(i);
      const url=URL.createObjectURL(new Blob([bytes],{type:"application/zip"}));
      const a=document.createElement("a");a.href=url;a.download=`CrmTranslations_${selSolName}.zip`;a.click();
      setTimeout(()=>URL.revokeObjectURL(url),5000);
      setSolMsg({ok:true,text:"Exported — edit CrmTranslations.xml inside the zip (Excel opens it), keep the structure, then import the zip back here."});
    }catch(e){setSolMsg({ok:false,text:`Export failed: ${e.message}`});}
    setSolBusy("");
  };

  const doImportTranslations=async(file)=>{
    if(!file) return;
    if(!confirmProd(orgInfo?.isProduction,`Import translations "${file.name}" — labels across forms, views, sitemap and option sets will be overwritten for the languages in the file.`)) return;
    setSolBusy("import");setSolMsg(null);setImportJob(null);
    try{
      const buf=await file.arrayBuffer();
      // base64-encode in 32k chunks — String.fromCharCode(...wholeArray) would blow the JS
      // argument limit on a multi-MB zip (the flushNeverSent lesson, applied preemptively).
      let s="";const bytes=new Uint8Array(buf);const CH=0x8000;
      for(let i=0;i<bytes.length;i+=CH) s+=String.fromCharCode.apply(null,bytes.subarray(i,i+CH));
      const jobId=crypto.randomUUID();
      await bridge.importTranslations(btoa(s),jobId);
      setSolBusy("");
      setImportJob({id:jobId,progress:0,done:false});
      jobPollRef.current=setInterval(async()=>{
        try{
          const d=await bridge.query("importjobs",{filter:`importjobid eq ${jobId}`,select:"progress,completedon"});
          const j=d?.records?.[0];
          if(!j) return;
          setImportJob(prev=>prev?{...prev,progress:Math.round(j.progress||0),done:!!j.completedon}:prev);
          if(j.completedon){
            clearInterval(jobPollRef.current);jobPollRef.current=null;
            if(autoPublish){
              setSolBusy("publish");
              try{ await bridge.publishAll(); setSolMsg({ok:true,text:"Translations imported and published — reload D365 forms to see the new labels."}); }
              catch(e2){ setSolMsg({ok:false,text:`Imported, but publish failed: ${e2.message} — publish customizations manually.`}); }
              setSolBusy("");
            } else setSolMsg({ok:true,text:"Translations imported — publish customizations to apply them."});
          }
        }catch{/* transient poll failure — next tick retries */}
      },5000);
    }catch(e){ setSolMsg({ok:false,text:`Import failed: ${e.message}`}); setSolBusy(""); }
  };

  useEffect(()=>{
    bridge.getOrgLanguages().then(d=>{if(d){setLanguages(d);setSelLangs(d.map(l=>l.code));}}).catch(()=>{});
    if(isLive)bridge.getEntities().then(d=>{if(d)setEntities(d.map(e=>({l:e.logical||e.l,d:e.display||e.d})))}).catch(()=>{});
  },[]);

  const doSelectEntity=async(e)=>{
    const gen=++selGen.current;
    setSelEnt(e);setLoading(true);setEdits({});setSaveMsg(null);
    try{const d=await bridge.getAttributeLabels(e.l);if(selGen.current!==gen)return;setAttributes(d||[]);}catch{if(selGen.current===gen)setAttributes([]);}
    if(selGen.current===gen)setLoading(false);
  };
  const handleSelect=async(e)=>{
    if(editCount>0){
      setConfirmModal({msg:`You have ${editCount} unsaved edit(s). Switch entity and discard changes?`,onOk:()=>{setConfirmModal(null);doSelectEntity(e);}});
      return;
    }
    doSelectEntity(e);
  };

  const handleEdit=(attrLogical,langCode,value)=>{
    setEdits(prev=>({...prev,[attrLogical]:{...(prev[attrLogical]||{}),[langCode]:value}}));
  };

  const editCount=Object.keys(edits).reduce((n,k)=>n+Object.keys(edits[k]).length,0);

  const handleSave=async()=>{
    if(!selEnt||editCount===0)return;
    if(!confirmProd(orgInfo?.isProduction,`Save ${editCount} label change${editCount>1?"s":""} and publish ${selEnt.l}.`))return;
    setSaving(true);setSaveMsg(null);
    let ok=0,fail=0;
    for(const[attrName,langEdits] of Object.entries(edits)){
      const attr=attributes.find(a=>a.logical===attrName);
      if(!attr)continue;
      const labelsMap={};
      attr.labels.forEach(l=>{labelsMap[l.languageCode]={Label:l.label,LanguageCode:l.languageCode};});
      Object.entries(langEdits).forEach(([code,val])=>{labelsMap[+code]={Label:val,LanguageCode:+code};});
      try{await bridge.updateAttributeLabel(selEnt.l,attrName,Object.values(labelsMap));ok++;}catch(err){fail++;setSaveMsg(`Error: ${err.message}`);}
    }
    if(ok>0){try{await bridge.publishEntity(selEnt.l);}catch{}}
    setSaveMsg(`${ok} updated${fail?`, ${fail} failed`:""}`);
    setEdits({});
    try{const d=await bridge.getAttributeLabels(selEnt.l);setAttributes(d||[]);}catch{}
    setSaving(false);
  };

  const exportCSV=()=>{
    if(!selEnt||!attributes.length)return;
    const codes=selLangs;
    const header=["logical_name","type",...codes.map(c=>`label_${c}`)].join(",");
    const rows=attributes.map(a=>{
      const vals=[a.logical,a.type];
      codes.forEach(c=>{const lbl=a.labels.find(l=>l.languageCode===c)?.label||"";vals.push(`"${lbl.replace(/"/g,'""')}"`)});
      return vals.join(",");
    });
    dl("\uFEFF"+header+"\n"+rows.join("\n"),"text/csv;charset=utf-8",expName(`${selEnt.l}_translations`,"csv"));
  };

  const handleImport=(text)=>{
    const lines=text.split("\n").filter(l=>l.trim());
    if(lines.length<2)return;
    const headers=lines[0].split(",").map(h=>h.trim().replace(/^"|"$/g,""));
    const langCols=headers.map((h,i)=>{const m=h.match(/^label_(\d+)$/);return m?{idx:i,code:+m[1]}:null;}).filter(Boolean);
    const logIdx=headers.indexOf("logical_name");
    if(logIdx===-1)return;
    const newEdits={};
    for(let i=1;i<lines.length;i++){
      const cells=lines[i].match(/(".*?"|[^,]*)/g)?.map(c=>c.replace(/^"|"$/g,"").replace(/""/g,'"'))||[];
      const logical=cells[logIdx]?.trim();
      if(!logical)continue;
      const attr=attributes.find(a=>a.logical===logical);
      if(!attr)continue;
      langCols.forEach(({idx,code})=>{
        const val=cells[idx]?.trim()||"";
        const existing=attr.labels.find(l=>l.languageCode===code)?.label||"";
        if(val&&val!==existing){if(!newEdits[logical])newEdits[logical]={};newEdits[logical][code]=val;}
      });
    }
    setEdits(newEdits);
    setSaveMsg(`Imported ${Object.keys(newEdits).length} changes from CSV`);
  };

  const filteredAttrs=attributes.filter(a=>!attrSearch||a.logical.includes(attrSearch.toLowerCase())||a.labels.some(l=>l.label.toLowerCase().includes(attrSearch.toLowerCase())));

  const filtered=entities.filter(e=>!search||e.l.includes(search.toLowerCase())||e.d?.toLowerCase().includes(search.toLowerCase()));

  return(
    <div style={{display:"flex",height:"100%"}}>
      <div style={{width:bp.mobile?"100%":260,borderRight:`1px solid ${C.bd}`,display:"flex",flexDirection:"column",flexShrink:0}}>
        <div style={{padding:8}}><input placeholder="Search entity..." value={search} onChange={e=>setSearch(e.target.value)} style={inp({fontSize:13})}/></div>
        <div style={{flex:1,overflow:"auto",padding:"0 6px"}}>
          {filtered.map(e=>(
            <button key={e.l} onClick={()=>handleSelect(e)} style={{width:"100%",textAlign:"left",padding:"6px 8px",border:"none",borderRadius:5,cursor:"pointer",marginBottom:1,background:selEnt?.l===e.l?C.sfa:"transparent",color:selEnt?.l===e.l?C.tx:C.txm,fontSize:13}}>
              <div style={{fontWeight:selEnt?.l===e.l?600:400}}>{e.d||e.l}</div>
              <div style={{fontSize:11,color:C.txd}}>{e.l}</div>
            </button>
          ))}
        </div>
      </div>
      <div style={{flex:1,overflow:"auto",padding:16}}>
        {/* Solution-wide translations — the official export/import zip, everything at once */}
        {isLive&&!readOnly&&(
          <div style={{...crd({padding:12}),marginBottom:14}}>
            <div style={{fontSize:13,fontWeight:700,marginBottom:6}}>🌐 Solution translations — forms (tabs, sections, labels), views, sitemap, option sets…</div>
            <div style={{fontSize:11.5,color:C.txm,marginBottom:8,lineHeight:1.5}}>The official Dataverse mechanism, in two clicks: export a solution's <span style={{...mono}}>CrmTranslations</span> zip, edit it in Excel, import it back. Colvio never touches the XML — Dataverse parses it, so nothing can be corrupted in transit.</div>
            <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
              <select value={selSolName} onChange={e=>setSelSolName(e.target.value)} style={inp({width:"auto",maxWidth:280,fontSize:12,padding:"5px 8px"})}>
                <option value="">— pick a solution —</option>
                {solutions.map(s=><option key={s.id} value={s.uniqueName}>{s.displayName}{s.isManaged?" (managed)":""}</option>)}
              </select>
              <button onClick={doExportTranslations} disabled={!selSolName||!!solBusy} style={bt(C.cy,{fontSize:12,padding:"5px 12px",opacity:(!selSolName||solBusy)?0.5:1})}>{solBusy==="export"?<Spin s={12}/>:<I.Download/>} Export translations (zip)</button>
              <button onClick={()=>zipRef.current?.click()} disabled={!!solBusy||!!importJob&&!importJob.done} style={bt(C.vi,{fontSize:12,padding:"5px 12px",opacity:(solBusy||(importJob&&!importJob.done))?0.5:1})}>{solBusy==="import"?<Spin s={12}/>:<I.Upload/>} Import translations (zip)</button>
              <input ref={zipRef} type="file" accept=".zip" style={{display:"none"}} onChange={e=>{const f=e.target.files?.[0];e.target.value="";doImportTranslations(f);}}/>
              <label style={{display:"flex",alignItems:"center",gap:5,fontSize:11.5,color:C.txm,cursor:"pointer"}}>
                <input type="checkbox" checked={autoPublish} onChange={e=>setAutoPublish(e.target.checked)} style={{accentColor:C.vi}}/>
                publish all after import
              </label>
            </div>
            {importJob&&!importJob.done&&(
              <div style={{marginTop:8,fontSize:12,color:C.txm,display:"flex",alignItems:"center",gap:8}}>
                <Spin s={12}/> Import job running — {importJob.progress}% <span style={{fontSize:10.5,color:C.txd}}>(also visible in System Ops · job {importJob.id.slice(0,8)}…)</span>
              </div>
            )}
            {solBusy==="publish"&&<div style={{marginTop:8,fontSize:12,color:C.txm,display:"flex",alignItems:"center",gap:8}}><Spin s={12}/> Publishing all customizations…</div>}
            {solMsg&&<div style={{marginTop:8,fontSize:12,color:solMsg.ok?C.gn:C.rd}}>{solMsg.ok?"✓":"⚠"} {solMsg.text}</div>}
          </div>
        )}
        {!selEnt&&<div style={{textAlign:"center",color:C.txd,marginTop:60}}>Select an entity to manage translations</div>}
        {selEnt&&loading&&<div style={{textAlign:"center",marginTop:60}}><Spin s={20}/></div>}
        {selEnt&&!loading&&(
          <div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12,flexWrap:"wrap",gap:8}}>
              <div>
                <span style={{fontSize:16,fontWeight:700}}>{selEnt.d||selEnt.l}</span>
                <span style={{color:C.txd,marginLeft:8,fontSize:13}}>{attributes.length} attributes · {languages.length} languages</span>
              </div>
              <div style={{display:"flex",gap:6,alignItems:"center"}}>
                {saveMsg&&<span style={{fontSize:12,color:C.gn}}>{saveMsg}</span>}
                <button onClick={exportCSV} style={bt(null,{fontSize:12})}><I.Download/> Export CSV</button>
                {!readOnly&&<>
                  <input ref={fRef} type="file" accept=".csv" style={{display:"none"}} onChange={e=>{const f=e.target.files?.[0];if(f){const r=new FileReader();r.onload=ev=>handleImport(ev.target.result);r.readAsText(f);}}}/>
                  <button onClick={()=>fRef.current?.click()} style={bt(null,{fontSize:12})}><I.Upload/> Import CSV</button>
                  <button onClick={handleSave} disabled={editCount===0||saving} style={bt(editCount>0?C.vi:C.sfh,{fontSize:12,opacity:editCount===0?.5:1})}>{saving?<Spin s={12}/>:null} Save {editCount>0?`(${editCount})`:""}</button>
                </>}
              </div>
            </div>
            {readOnly&&<div style={{fontSize:12,color:C.yw,background:C.yw+"14",border:`1px solid ${C.yw}44`,borderRadius:6,padding:"8px 12px",marginBottom:10}}>
              {t("translations.readonly")}
            </div>}
            <div style={{display:"flex",gap:6,marginBottom:10,flexWrap:"wrap"}}>
              {languages.map(lang=>(
                <label key={lang.code} style={{display:"flex",alignItems:"center",gap:4,fontSize:12,color:selLangs.includes(lang.code)?C.tx:C.txd,cursor:"pointer"}}>
                  <input type="checkbox" checked={selLangs.includes(lang.code)} onChange={e=>{if(e.target.checked)setSelLangs(p=>[...p,lang.code]);else setSelLangs(p=>p.filter(c=>c!==lang.code));}} style={{accentColor:C.vi}}/>
                  {lang.name} ({lang.code})
                </label>
              ))}
            </div>
            <input placeholder="Filter attributes..." value={attrSearch} onChange={e=>setAttrSearch(e.target.value)} style={inp({fontSize:12,marginBottom:8,maxWidth:300})}/>
            <div style={{overflowX:"auto",...crd()}}>
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
                <thead>
                  <tr>
                    <th style={ths()}>Logical Name</th>
                    <th style={ths()}>Type</th>
                    {selLangs.map(code=><th key={code} style={ths()}>{languages.find(l=>l.code===code)?.name||code}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {filteredAttrs.map((attr,ri)=>(
                    <tr key={attr.logical} style={{borderBottom:`1px solid ${C.bd}22`,background:ri%2===0?"transparent":C.sfh+"33",opacity:attr.canRename===false?.5:1}}>
                      <td style={{...tds,...mono,fontSize:12,color:C.vi,display:"flex",alignItems:"center",gap:4}}>
                        {attr.logical}
                        {attr.canRename===false&&<span title="This field's label cannot be renamed (locked by Microsoft)" style={{fontSize:10,color:C.txd}}>🔒</span>}
                      </td>
                      <td style={{...tds,fontSize:12,color:C.txd}}>{displayType(attr.type)}</td>
                      {selLangs.map(code=>{
                        const existing=attr.labels.find(l=>l.languageCode===code)?.label||"";
                        const edited=edits[attr.logical]?.[code];
                        const val=edited!==undefined?edited:existing;
                        const locked=attr.canRename===false||readOnly;
                        return(
                          <td key={code} style={{padding:"2px 4px"}}>
                            <input value={val} readOnly={locked} onChange={locked?undefined:e=>handleEdit(attr.logical,code,e.target.value)} style={inp({fontSize:12,padding:"3px 6px",borderColor:edited!==undefined?C.yw:C.bd,...mono,cursor:locked?"not-allowed":"text",background:locked?"transparent":C.sf})}/>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
      {confirmModal&&<div style={{position:"fixed",top:0,left:0,right:0,bottom:0,background:"rgba(0,0,0,.5)",zIndex:100,display:"flex",alignItems:"center",justifyContent:"center"}} onClick={()=>setConfirmModal(null)}>
        <div style={{background:C.sf,border:`1px solid ${C.bd}`,borderRadius:10,padding:20,minWidth:320,maxWidth:420,boxShadow:"0 8px 32px rgba(0,0,0,.5)"}} onClick={e=>e.stopPropagation()}>
          <div style={{fontSize:14,color:C.tx,whiteSpace:"pre-line",marginBottom:16,lineHeight:1.5}}>{confirmModal.msg}</div>
          <div style={{display:"flex",gap:6,justifyContent:"flex-end"}}>
            <button onClick={()=>setConfirmModal(null)} style={bt(null,{fontSize:12})}>{t("common.cancel")||"Cancel"}</button>
            <button onClick={confirmModal.onOk} style={bt(C.rd,{fontSize:12})}>{t("common.confirm")||"Confirm"}</button>
          </div>
        </div>
      </div>}
    </div>
  );
}
