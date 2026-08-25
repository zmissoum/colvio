import { useState, useEffect, useMemo, useRef, useDeferredValue } from "react";
import { bridge } from "../d365-bridge.js";
import { C, I, Spin, mono, bt, dl, expName, copyText, ths, tds, recordId } from "../shared.jsx";
import VirtualTable from "./VirtualTable.jsx";
import { t } from "../i18n.js";
import { findDuplicateGroups } from "../dupUtils.js";
import { prepareUpdate as prepareUpdateForMeta } from "../updateUtils.js";

export default function Results({res,bp,orgInfo,onStop,onDeleteDone,onUpdateRecord}){
  const[sortField,setSortField]=useState(null);
  const[bulkUpdate,setBulkUpdate]=useState(null);
  const[bulkUpdating,setBulkUpdating]=useState(false);
  const[confirmModal,setConfirmModal]=useState(null); // {msg,onOk}
  const[sortDir,setSortDir]=useState("asc");
  const[search,setSearch]=useState("");          // client-side filter over the already-loaded rows
  const deferredSearch=useDeferredValue(search);  // keeps typing smooth on large result sets
  // Duplicate finder — pick the columns that define a duplicate, groups computed client-side
  // over ALL loaded rows (raw values: lookups by GUID), excess rows feed the normal selection.
  const[dupPanel,setDupPanel]=useState(false);
  const[dupKeys,setDupKeys]=useState(new Set());
  const[dupDayDates,setDupDayDates]=useState(true);
  const[dupResult,setDupResult]=useState(null);
  // Reset sort/selection/filter when query changes (different entity or query string)
  const prevQuery=useRef(null);
  useEffect(()=>{
    const qKey=res?.query;
    if(qKey!==prevQuery.current){
      prevQuery.current=qKey;
      setSortField(null);setSortDir("asc");setSelected(new Set());setBulkUpdate(null);setSearch("");
      setDupPanel(false);setDupKeys(new Set());setDupResult(null);
    }
  },[res?.query]);
  // Escape closes the confirm modal / bulk-update popover (destructive actions shouldn't be mouse-only).
  useEffect(()=>{
    if(!confirmModal&&!bulkUpdate&&!dupPanel) return;
    const onKey=(e)=>{ if(e.key==="Escape"){ setConfirmModal(null); setBulkUpdate(null); setDupPanel(false); } };
    window.addEventListener("keydown",onKey);
    return ()=>window.removeEventListener("keydown",onKey);
  },[confirmModal,bulkUpdate,dupPanel]);
  // Typed PATCH-body preparation lives in updateUtils.js (pure, tested) — shared with the
  // Show-All-Data editor so every user-typed write goes through the same refusals.
  const prepareUpdate=(field,rawStr,lookupTarget)=>prepareUpdateForMeta({fieldTypes:res.fieldTypes,lookupBinds:res.lookupBinds,odataFieldMap:res.odataFieldMap},field,rawStr,lookupTarget);

  const doBulkUpdate=()=>{
    if(!bulkUpdate?.field||!selected.size||!res.entity?.p) return;
    const prep=prepareUpdate(bulkUpdate.field,bulkUpdate.value,bulkUpdate.target);
    if(!prep.ok){setBulkUpdate({...bulkUpdate,err:prep.reason});return;} // refused BEFORE anything is sent — the popover shows why
    setConfirmModal({msg:`Update ${selected.size} record(s)?\n\nField: ${bulkUpdate.field}\nNew value: ${bulkUpdate.value||"null"}`,onOk:()=>{setConfirmModal(null);executeBulkUpdate(prep);}});
  };
  const executeBulkUpdate=async(prep)=>{
    const ids=[...selected];
    setBulkUpdating(true);abortRef.current=false;setUpdProg({done:0,total:ids.length});
    let ok=0,fail=0,cancelled=false;
    for(const id of ids){
      if(abortRef.current){cancelled=true;break;} // ✕ Cancel — already-written PATCHes stay written
      try{
        await bridge.update(res.entity.p, id, prep.body);
        ok++;
      }catch{fail++;}
      setUpdProg({done:ok+fail,total:ids.length});
    }
    setBulkUpdating(false);setUpdProg(null);
    setBulkUpdate(null);
    showFeedback(`${cancelled?"Cancelled — ":""}${t("results.bulk_update")} ${ok} ${t("results.updated")}${fail?`, ${fail} ${t("results.failed")}`:""}${cancelled?`, ${ids.length-ok-fail} untouched`:""}`);
  };
  // Pre-check WRITE access before entering inline-edit, so the user learns they can't edit
  // BEFORE typing a value (instead of a 403 on commit). One RetrievePrincipalAccess call per
  // entity, cached for the session. Approximation: row-level security can vary per record —
  // we probe the first-clicked record; a per-record mismatch still fails cleanly on PATCH.
  const writeAccessCache=useRef(new Map());
  const canEditRecord=async(record)=>{
    const set=res.entity?.p;
    if(!set) return true;
    if(writeAccessCache.current.has(set)) return writeAccessCache.current.get(set);
    const id=getRecordId(record);
    if(!id) return true;
    let rights=null;
    try{ rights=await bridge.getRecordAccess(set,id); }catch{ return true; } // probe failed → fail-open (D365 still enforces on PATCH)
    const ok=rights==null?true:rights.includes("WriteAccess"); // null = undetermined → fail-open
    writeAccessCache.current.set(set,ok);
    if(!ok) showFeedback("Read-only: your security roles don't grant write access on this table");
    return ok;
  };

  const inlineEdit=async(record,field,newValue)=>{
    const id=getRecordId(record);
    if(!id||!res.entity?.p) return;
    const prep=prepareUpdate(field,newValue);
    if(!prep.ok){showFeedback(prep.needsTarget?`"${field}" can target several tables \u2014 use bulk Update (checkbox \u2192 Update) to pick the target`:prep.reason);return;}
    try{
      const odataField=res.odataFieldMap?.[field]||field;
      await bridge.update(res.entity.p, id, prep.body);
      if(onUpdateRecord){const updated={...record,[odataField]:prep.localValue};delete updated[odataField+"__display"];onUpdateRecord(updated,record);}
      showFeedback("\u2713 Saved");
    }catch(e){
      showFeedback("Edit failed: "+e.message);
    }
  };
  const toggleSort=(f)=>{if(sortField===f){setSortDir(d=>d==="asc"?"desc":"asc");}else{setSortField(f);setSortDir("asc");}};
  // Client-side filter over the already-loaded rows — no re-query. Matches the displayed value
  // (label for lookups/option-sets, else raw) of ANY selected column, case-insensitive.
  const filteredData=useMemo(()=>{
    const q=deferredSearch.trim().toLowerCase();
    if(!q) return res.data;
    const dk2=(f)=>res.odataFieldMap?.[f]||f;
    return res.data.filter(r=>res.fields.some(f=>{
      const k=dk2(f);const v=r[k+"__display"]??r[k];
      if(v==null) return false;
      return String(typeof v==="object"?JSON.stringify(v):v).toLowerCase().includes(q);
    }));
  },[res.data,res.fields,res.odataFieldMap,deferredSearch]);
  const sortedData=useMemo(()=>{
    if(!sortField) return filteredData;
    const dk2=(f)=>res.odataFieldMap?.[f]||f;
    return [...filteredData].sort((a,b)=>{
      let va=a[dk2(sortField)+"__display"]??a[dk2(sortField)]??"";
      let vb=b[dk2(sortField)+"__display"]??b[dk2(sortField)]??"";
      if(typeof va==="number"&&typeof vb==="number") return sortDir==="asc"?va-vb:vb-va;
      va=String(va).toLowerCase();vb=String(vb).toLowerCase();
      return sortDir==="asc"?va.localeCompare(vb):vb.localeCompare(va);
    });
  },[filteredData,sortField,sortDir,res.odataFieldMap]);
  const[cp,setCp]=useState(null);
  const[copyFeedback,setCopyFeedback]=useState("");
  const[selected,setSelected]=useState(new Set());
  const[deleting,setDeleting]=useState(false);
  const[delProg,setDelProg]=useState(null); // {done,total} while the batched delete runs
  const[updProg,setUpdProg]=useState(null); // {done,total} while the bulk update runs
  const abortRef=useRef(false);             // one cancel flag serving BOTH bulk operations

  // Canonical id resolver (shared with the parent's post-delete row removal so they can't disagree).
  const getRecordId=(r)=>recordId(r,res.entity?.l);
  const toggleSel=(id)=>setSelected(prev=>{const s=new Set(prev);s.has(id)?s.delete(id):s.add(id);return s;});
  const toggleAll=()=>{
    // Additive over the VISIBLE (filtered) rows only — never silently drop rows selected then hidden
    // by the filter. Toggling selects/deselects what's shown while preserving any hidden selection.
    const visibleIds=sortedData.map(r=>getRecordId(r)).filter(Boolean);
    const allVisibleSelected=visibleIds.length>0&&visibleIds.every(id=>selected.has(id));
    setSelected(prev=>{const s=new Set(prev);visibleIds.forEach(id=>allVisibleSelected?s.delete(id):s.add(id));return s;});
  };
  const executeDelete=async()=>{
    setDeleting(true);abortRef.current=false;setDelProg({done:0,total:selected.size});
    try{
      // Same $batch machinery as the Loader's DELETE mode (chunks of 100 × 4 parallel workers,
      // per-record changesets, 429 retry) — the old path issued ONE sequential DELETE per record,
      // which took tens of minutes on a few thousand rows (user-reported). shouldAbort is checked
      // between chunks: ✕ Cancel lets in-flight chunks finish, nothing else is sent.
      const ids=Array.from(selected);
      const result=await bridge.batchDeleteKeyed(res.entity.p,`${res.entity.l}id`,ids.map(id=>({keyValue:id})),true,
        p=>setDelProg({done:p.done,total:p.total}),()=>abortRef.current,{chunk:100,concurrency:4});
      showFeedback(`${result.aborted?"Cancelled — ":""}${result.deleted} deleted${result.errors?.length?`, ${result.errors.length} error(s)`:""}${result.aborted?`, ${ids.length-(result.deleted||0)} untouched`:""}`);
      if(onDeleteDone) onDeleteDone(selected);
      setSelected(new Set());
      setDupResult(null); // groups described rows that may just have been deleted — re-analyze
    }catch(e){
      showFeedback(`Error: ${e.message}`);
    }
    setDeleting(false);setDelProg(null);
  };
  const doDelete=async()=>{
    if(!selected.size) return;
    const count=selected.size;
    const entityName=res.entity?.l;
    try{
      const meta=await bridge.getEntityMetadata(entityName,true);
      if(!meta.canBeDeleted){
        alert(`Entity "${meta.displayName}" does not allow deletion. The CanBeDeleted property is set to false.`);
        return;
      }
      setConfirmModal({msg:`You are about to permanently delete ${count} record(s) from "${meta.displayName}" (${entityName}).\n\nThis action is irreversible and cannot be undone.\n\nProceed?`,onOk:()=>{setConfirmModal(null);executeDelete();}});
    }catch{
      setConfirmModal({msg:`Delete ${count} record(s) from ${entityName}? This action is irreversible.`,onOk:()=>{setConfirmModal(null);executeDelete();}});
    }
  };

  const dk = (f) => res.odataFieldMap?.[f] || f;
  const rawGet = (r, f) => r[dk(f)];
  const dispGet = (r, f) => r[dk(f) + "__display"];
  const bestGet = (r, f) => { const d = dispGet(r, f); return d !== undefined && d !== null ? d : rawGet(r, f); };
  const copy=(v,k)=>{copyText(String(v ?? ""));setCp(k);setTimeout(()=>setCp(null),1000);};

  const flatVal = (v) => {
    if (v === null || v === undefined) return "";
    if (typeof v === "boolean") return v ? "true" : "false";
    if (typeof v === "number") return String(v);
    if (typeof v === "object") return JSON.stringify(v);
    return String(v);
  };

  const entityGet = (r, f) => r[dk(f) + "__entity"];

  const fmt = (r, f) => {
    const disp = dispGet(r, f);
    const raw = rawGet(r, f);
    const targetEntity = entityGet(r, f);
    const orgUrl = orgInfo?.orgUrl;

    // Only build a record link when raw is a real GUID (mirrors the string branch below) — a
    // non-GUID lookup value (alias projection, virtual entity) would otherwise yield a broken link.
    const isGuid = (v) => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
    if (disp !== undefined && disp !== null && targetEntity && isGuid(raw) && orgUrl) {
      const link = `${orgUrl}/main.aspx?etn=${encodeURIComponent(targetEntity)}&id=${raw}&pagetype=entityrecord`;
      return (<span style={{display:"inline-flex",alignItems:"center",gap:4}}>
        <span>{String(disp)}</span>
        <a href={link} target="_blank" rel="noopener" onClick={e=>e.stopPropagation()} style={{fontSize:10,color:C.vi,textDecoration:"none"}} title={`Open ${targetEntity} in D365`}>↗</a>
      </span>);
    }
    if (disp !== undefined && disp !== null) return (<span>{String(disp)}</span>);
    if (raw === null || raw === undefined) return (<span style={{color:C.txd,fontStyle:"italic"}}>null</span>);
    if (typeof raw === "boolean") return (<span style={{color:raw?C.gn:C.rd}}>{raw?"true":"false"}</span>);
    if (typeof raw === "number") return raw.toLocaleString();
    if (typeof raw === "object") return (<span style={{color:C.yw,...mono,fontSize:12}}>{JSON.stringify(raw).substring(0,60)}</span>);
    if (typeof raw === "string") {
      if (raw.match(/^\d{4}-\d{2}-\d{2}T/)) return new Date(raw).toLocaleDateString("en-US",{day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"});
      if (raw.match(/^[0-9a-f]{8}-[0-9a-f]{4}/i) && targetEntity && orgUrl) {
        const link = `${orgUrl}/main.aspx?etn=${targetEntity}&id=${raw}&pagetype=entityrecord`;
        return (<span style={{display:"inline-flex",alignItems:"center",gap:4}}>
          <span style={{...mono,fontSize:12,color:C.txm}} title={raw}>{raw.substring(0,13)}…</span>
          <a href={link} target="_blank" rel="noopener" onClick={e=>e.stopPropagation()} style={{fontSize:10,color:C.vi,textDecoration:"none"}} title={`Open ${targetEntity} in D365`}>↗</a>
        </span>);
      }
      if (raw.match(/^[0-9a-f]{8}-[0-9a-f]{4}/i)) return (<span style={{...mono,fontSize:12,color:C.txm}} title={raw}>{raw.substring(0,13)}…</span>);
    }
    return String(raw);
  };

  const expVal = (r, f) => { const d = dispGet(r, f); const raw = rawGet(r, f); return flatVal(d !== undefined && d !== null ? d : raw); };
  // Security: prefix formula-triggering characters to prevent CSV injection in spreadsheets
  const safeVal=(v)=>/^[=+\-@\t\r]/.test(v)?"'"+v:v;
  const escCSV=(v)=>{const s=safeVal(v);return s.includes(",")||s.includes('"')||s.includes("\n")?`"${s.replace(/"/g,'""')}"`:s;};
  const escTSV=(v)=>{const s=safeVal(v);return s.includes("\t")||s.includes("\n")?`"${s.replace(/"/g,'""')}"`:s;};
  // Exports honour the active filter + sort: they emit exactly the rows currently shown (sortedData).
  const toCSV=()=>"\uFEFF"+[res.fields.join(","),...sortedData.map(r=>res.fields.map(f=>escCSV(expVal(r,f))).join(","))].join("\n");
  const toTSV=()=>[res.fields.join("\t"),...sortedData.map(r=>res.fields.map(f=>escTSV(expVal(r,f))).join("\t"))].join("\n");
  const toJSON=()=>JSON.stringify(sortedData.map(r=>{const o={};res.fields.forEach(f=>{o[f]=bestGet(r,f)??null;});return o;}),null,2);

  const showFeedback=(msg)=>{setCopyFeedback(msg);setTimeout(()=>setCopyFeedback(""),2000);};
  const n=sortedData.length;
  const copyCSV=()=>{copyText(toCSV());showFeedback(`${t("results.csv_copied")} (${n} rows)`);};
  const copyExcel=()=>{copyText(toTSV());showFeedback(`Copied for Excel (${n} rows)`);};
  const copyJSON=()=>{copyText(toJSON());showFeedback(`${t("results.json_copied")} (${n} rows)`);};
  const dlCSV=()=>{dl(toCSV(),"text/csv;charset=utf-8",expName(res.entity.l,"csv"));showFeedback(`CSV downloaded (${n} rows)`);};
  const dlXLSX=async()=>{
    try{
      // Lazy-load xlsx only when the user actually exports to .xlsx.
      const m=await import("xlsx"); const XLSX=m.utils?m:(m.default||m);
      // Raw values on purpose: .xlsx cells carry explicit types, so a string cell holding "=..."
      // stays inert text (unlike CSV) — no formula-injection guard needed. Wrapping in
      // safeVal(String(...)) turned every number into a text cell (SUM()=0) and put a visible
      // apostrophe on negatives.
      const wsData=[res.fields,...sortedData.map(r=>res.fields.map(f=>{const v=bestGet(r,f);return v==null?"":(typeof v==="object"?JSON.stringify(v):v);}))];
      const ws=XLSX.utils.aoa_to_sheet(wsData);
      ws["!cols"]=res.fields.map(f=>({wch:Math.max(f.length,12)}));
      const wb=XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb,ws,res.entity.l.substring(0,31));
      XLSX.writeFile(wb,expName(res.entity.l,"xlsx"));
      showFeedback(`XLSX downloaded (${n} rows)`);
    }catch(e){showFeedback("XLSX error: "+e.message);}
  };
  const dlJSON=()=>{dl(toJSON(),"application/json;charset=utf-8",expName(res.entity.l,"json"));showFeedback(`JSON downloaded (${n} rows)`);};

  // ── Duplicate finder ──
  // Analysis runs over res.data (ALL loaded rows, not the filtered view) on RAW values via rawGet:
  // lookups compare by GUID (two records sharing a display name never merge), money by number.
  const runDupAnalysis=()=>setDupResult(findDuplicateGroups(res.data,[...dupKeys],rawGet,{dayDates:dupDayDates}));
  const selectDupExcess=()=>{
    if(!dupResult) return;
    const ids=[];
    for(const g of dupResult.groups) g.rows.slice(1).forEach(r=>{const id=getRecordId(r);if(id)ids.push(id);});
    setSelected(prev=>{const s=new Set(prev);ids.forEach(id=>s.add(id));return s;});
    setDupPanel(false);
    showFeedback(`${ids.length.toLocaleString()} duplicate rows selected — review, then Update/Delete`);
  };
  // Review file: every duplicated row with its group number and KEEP/DELETE verdict, all columns.
  const dupCSV=()=>{
    if(!dupResult) return;
    const lines=[["group","rowsInGroup","action",...res.fields].join(",")];
    dupResult.groups.forEach((g,gi)=>g.rows.forEach((r,ri)=>{
      lines.push([gi+1,g.rows.length,ri===0?"KEEP":"DELETE",...res.fields.map(f=>escCSV(expVal(r,f)))].join(","));
    }));
    dl("\uFEFF"+lines.join("\n"),"text/csv;charset=utf-8",expName(`${res.entity.l}_duplicates`,"csv"));
    showFeedback(`Duplicate groups exported (${dupResult.groups.length.toLocaleString()} groups)`);
  };

  const btnCopy=(label,icon,onClick,accent)=>(<button onClick={onClick} style={{
    padding:"4px 8px",fontSize:12,fontWeight:500,cursor:"pointer",display:"flex",alignItems:"center",gap:4,
    background:accent||"transparent",border:`1px solid ${accent?accent:C.bd}`,borderRadius:4,
    color:accent?"white":C.tx,transition:"all .15s",whiteSpace:"nowrap",
  }}>{icon}{label}</button>);

  return (
    <div>
      <div style={{borderBottom:`1px solid ${C.bd}`,background:C.sf,padding:"6px 12px"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:6,flexWrap:"wrap",gap:4}}>
          <div style={{display:"flex",alignItems:"center",gap:6}}>
            <span style={{fontSize:13,color:C.gn,fontWeight:600}}>{search.trim()&&filteredData.length!==res.data.length?`${filteredData.length.toLocaleString()} of ${res.data.length.toLocaleString()}`:res.data.length.toLocaleString()} records</span>
            {res.fetching&&<span style={{fontSize:11,color:C.cy,background:C.cy+"22",padding:"2px 8px",borderRadius:3,display:"inline-flex",alignItems:"center",gap:4}}><Spin s={8}/> {res.data.length>=5000?`page ${Math.ceil(res.data.length/5000)+1}...`:"loading..."}</span>}
            {res.fetching&&<button onClick={onStop} style={{padding:"1px 8px",fontSize:11,border:`1px solid ${C.rd}44`,borderRadius:3,cursor:"pointer",background:C.rd+"22",color:C.rd,fontWeight:600}}>■ Stop</button>}
            {!res.fetching&&<span style={{fontSize:11,color:C.txd}}>· {res.elapsed}</span>}
            {res.fetching&&<span style={{fontSize:11,color:C.txd}}>{res.elapsed}</span>}
          </div>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            {copyFeedback && (
              <span style={{fontSize:13,color:C.gn,fontWeight:600,display:"flex",alignItems:"center",gap:4,animation:"fadeIn .2s"}}>
                ✓ {copyFeedback}
              </span>
            )}
            <div style={{position:"relative",width:bp.mobile?150:220}}>
              <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Filter results…" title="Filter the loaded rows (no re-query). Export honours the filter." style={{width:"100%",boxSizing:"border-box",padding:"4px 24px 4px 26px",fontSize:12,background:C.bg,border:`1px solid ${search?C.cy:C.bd}`,borderRadius:4,color:C.tx,outline:"none"}}/>
              <span style={{position:"absolute",left:7,top:"50%",transform:"translateY(-50%)",color:C.txd,pointerEvents:"none",display:"flex"}}><I.Search s={12}/></span>
              {search&&<button onClick={()=>setSearch("")} title="Clear filter" style={{position:"absolute",right:5,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",color:C.txd,cursor:"pointer",padding:0,fontSize:15,lineHeight:1}}>×</button>}
            </div>
          </div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:4,flexWrap:"wrap"}}>
          <span style={{fontSize:11,color:C.txd,fontWeight:600,textTransform:"uppercase",letterSpacing:".5px",marginRight:2}}>Copy</span>
          {btnCopy("Excel",<I.Clipboard/>,copyExcel,C.gnd)}
          {btnCopy("CSV",<I.Copy/>,copyCSV)}
          {btnCopy("JSON",<I.Copy/>,copyJSON)}

          <div style={{width:1,height:18,background:C.bd,margin:"0 6px"}}/>

          <span style={{fontSize:11,color:C.txd,fontWeight:600,textTransform:"uppercase",letterSpacing:".5px",marginRight:2}}>Download</span>
          {btnCopy("XLSX",<I.Download/>,dlXLSX,C.gnd)}
          {btnCopy("CSV",<I.Download/>,dlCSV)}
          {btnCopy("JSON",<I.Download/>,dlJSON)}

          {res.data.length>1&&!res.fetching&&<>
            <div style={{width:1,height:18,background:C.bd,margin:"0 6px"}}/>
            {btnCopy("⧉ Duplicates",null,()=>setDupPanel(true))}
          </>}

          {selected.size>0&&<>
            <div style={{width:1,height:18,background:C.rd+"44",margin:"0 6px"}}/>
            <div style={{position:"relative"}}>
              <button onClick={()=>setBulkUpdate(bulkUpdate?null:{field:res.fields[0]||"",value:""})} style={{padding:"4px 10px",fontSize:12,fontWeight:600,cursor:"pointer",display:"flex",alignItems:"center",gap:4,background:C.cy+"22",border:`1px solid ${C.cy}44`,borderRadius:4,color:C.cy}}>
                <I.Zap/> Update {selected.size}
              </button>
              {bulkUpdate&&(
                <div style={{position:"absolute",top:"100%",left:0,zIndex:20,background:C.sf,border:`1px solid ${C.bd}`,borderRadius:8,marginTop:4,padding:12,minWidth:280,boxShadow:"0 8px 24px rgba(0,0,0,.4)"}}>
                  <div style={{fontSize:13,fontWeight:600,marginBottom:8}}>Bulk Update — {selected.size} record(s)</div>
                  <div style={{marginBottom:6}}>
                    <label style={{fontSize:11,color:C.txm,display:"block",marginBottom:2}}>Column</label>
                    <select value={bulkUpdate.field} onChange={e=>setBulkUpdate({...bulkUpdate,field:e.target.value,target:"",err:""})} style={{width:"100%",padding:"7px 11px",background:C.bg,border:`1px solid ${C.bd}`,borderRadius:6,color:C.tx,fontSize:13,outline:"none",boxSizing:"border-box"}}>
                      {res.fields.filter(f=>!f.includes(".")).map(f=><option key={f} value={f}>{f}</option>)}
                    </select>
                  </div>
                  {(res.lookupBinds?.[bulkUpdate.field]?.length>1)&&(
                    <div style={{marginBottom:6}}>
                      <label style={{fontSize:11,color:C.txm,display:"block",marginBottom:2}}>Target table (this lookup is polymorphic)</label>
                      <select value={bulkUpdate.target||""} onChange={e=>setBulkUpdate({...bulkUpdate,target:e.target.value,err:""})} style={{width:"100%",padding:"7px 11px",background:C.bg,border:`1px solid ${C.bd}`,borderRadius:6,color:C.tx,fontSize:13,outline:"none",boxSizing:"border-box"}}>
                        <option value="">— pick the table the GUID belongs to —</option>
                        {res.lookupBinds[bulkUpdate.field].map(b=><option key={b.target} value={b.target}>{b.target}</option>)}
                      </select>
                    </div>
                  )}
                  <div style={{marginBottom:8}}>
                    <label style={{fontSize:11,color:C.txm,display:"block",marginBottom:2}}>New value</label>
                    <input value={bulkUpdate.value} onChange={e=>setBulkUpdate({...bulkUpdate,value:e.target.value,err:""})} placeholder="null, true, false, or value..." style={{width:"100%",padding:"7px 11px",background:C.bg,border:`1px solid ${C.bd}`,borderRadius:6,color:C.tx,fontSize:13,...mono,outline:"none",boxSizing:"border-box"}} onKeyDown={e=>{if(e.key==="Enter")doBulkUpdate();}}/>
                    {(()=>{const t=res.fieldTypes?.[bulkUpdate.field];
                      const hint=t==="Lookup"||t==="Owner"||t==="Customer"?"Lookup — paste the target record's GUID · empty = clear"
                        :t==="Uniqueidentifier"?"GUID (36 characters)"
                        :["Integer","BigInt","Decimal","Money","Double"].includes(t)?"Number — dot decimal (1234.56)"
                        :t==="Boolean"?"true / false"
                        :["Picklist","State","Status"].includes(t)?"Numeric OPTION VALUE, not the label"
                        :t==="DateTime"?"Date — 2026-08-26 or 2026-08-26T14:30:00Z"
                        :null;
                      return hint?<div style={{fontSize:10.5,color:C.txd,marginTop:3}}>{hint}</div>:null;})()}
                    {bulkUpdate.err&&<div style={{fontSize:11.5,color:C.rd,marginTop:4,lineHeight:1.5}}>⚠ {bulkUpdate.err}</div>}
                  </div>
                  <div style={{display:"flex",gap:6}}>
                    <button onClick={doBulkUpdate} disabled={bulkUpdating} style={bt(`linear-gradient(135deg,${C.cy},${C.vi})`,{fontSize:12,flex:1,justifyContent:"center"})}>{bulkUpdating?<><Spin s={10}/> {updProg?`Updating ${updProg.done.toLocaleString()}/${updProg.total.toLocaleString()}…`:"Updating..."}</>:<><I.Zap/> Update {selected.size}</>}</button>
                    <button onClick={()=>setBulkUpdate(null)} style={bt(null,{fontSize:12})}>Cancel</button>
                  </div>
                </div>
              )}
            </div>
            <button onClick={doDelete} disabled={deleting} style={{padding:"4px 10px",fontSize:12,fontWeight:600,cursor:"pointer",display:"flex",alignItems:"center",gap:4,background:C.rd+"22",border:`1px solid ${C.rd}44`,borderRadius:4,color:C.rd}}>
              {deleting?<Spin s={10}/>:<I.Trash/>} {deleting&&delProg?`Deleting ${delProg.done.toLocaleString()}/${delProg.total.toLocaleString()}…`:`Delete ${selected.size}`}
            </button>
            {/* One cancel for BOTH bulk operations — updates stop before the next record, deletes
                stop between chunks (in-flight chunk completes); everything already written stays. */}
            {(deleting||bulkUpdating)&&(
              <button onClick={()=>{abortRef.current=true;}} title="Stop after the current record/chunk — everything already written stays written" style={{padding:"4px 10px",fontSize:12,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",gap:4,background:C.rd,border:"none",borderRadius:4,color:"#fff"}}>
                ✕ Cancel
              </button>
            )}
            {search.trim()&&(()=>{const hid=selected.size-sortedData.filter(r=>selected.has(getRecordId(r))).length;return hid>0?<span style={{fontSize:11,color:C.yw,fontWeight:600}} title="Bulk actions apply to your whole selection, including rows hidden by the active filter.">⚠ {hid} of {selected.size} selected are hidden by the filter</span>:null;})()}
          </>}
        </div>
      </div>

      <VirtualTable res={res} fields={res.fields} data={sortedData}
        selected={selected} toggleSel={toggleSel} toggleAll={toggleAll}
        getRecordId={getRecordId} copy={copy} cp={cp} bestGet={bestGet} rawGet={rawGet} flatVal={flatVal} fmt={fmt}
        ths={ths} tds={tds} onSort={toggleSort} sortField={sortField} sortDir={sortDir} onInlineEdit={inlineEdit} onBeforeEdit={canEditRecord} orgInfo={orgInfo} entityName={res.entity?.l} />

      {res.fetching && (
        <div style={{padding:"10px 16px",borderTop:`1px solid ${C.bd}`,background:C.sf,display:"flex",alignItems:"center",gap:10}}>
          <Spin s={12}/>
          <span style={{fontSize:13,color:C.cy,flex:1}}>Loading... {res.data.length} records</span>
          <button onClick={onStop} style={{padding:"3px 10px",fontSize:12,border:`1px solid ${C.rd}44`,borderRadius:4,cursor:"pointer",background:C.rd+"22",color:C.rd}}>Stop</button>
        </div>
      )}
      {!res.fetching && res.data.length>0 && sortedData.length===0 && (
        <div style={{padding:"14px 16px",textAlign:"center",color:C.txd,fontSize:13,borderTop:`1px solid ${C.bd}`}}>
          No results match "{search}" — <button onClick={()=>setSearch("")} style={{background:"none",border:"none",color:C.cy,cursor:"pointer",fontSize:13,textDecoration:"underline",padding:0}}>clear filter</button>
        </div>
      )}
      {!res.fetching && res.data.length > 0 && sortedData.length>0 && (
        <div style={{padding:"6px 16px",textAlign:"center",color:C.txd,fontSize:12,borderTop:`1px solid ${C.bd}`}}>
          {search.trim()&&filteredData.length!==res.data.length?`${filteredData.length.toLocaleString()} of ${res.data.length.toLocaleString()} records shown (filtered)`:`${res.data.length.toLocaleString()} records — loading complete`}
        </div>
      )}

      {dupPanel&&<div style={{position:"fixed",top:0,left:0,right:0,bottom:0,background:"rgba(0,0,0,.5)",zIndex:90,display:"flex",alignItems:"center",justifyContent:"center"}} onClick={()=>setDupPanel(false)}>
        <div style={{background:C.sf,border:`1px solid ${C.bd}`,borderRadius:10,padding:18,width:640,maxWidth:"92vw",maxHeight:"84vh",overflow:"auto",boxShadow:"0 8px 32px rgba(0,0,0,.5)"}} onClick={e=>e.stopPropagation()}>
          <div style={{fontSize:15,fontWeight:700,marginBottom:6}}>⧉ Find duplicates</div>
          <div style={{fontSize:12,color:C.txm,marginBottom:8,lineHeight:1.5}}>
            Pick the columns that define a duplicate — rows sharing the same values on ALL of them form a group. Comparison uses raw values (lookups by GUID, never the display name) over the {res.data.length.toLocaleString()} loaded rows{(res.nextLink||res.fetching)?<span style={{color:C.yw}}> — ⚠ more rows exist on the server; load everything first for a complete analysis</span>:""}. Don't include the primary key — it's unique by definition.
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(180px,1fr))",gap:2,marginBottom:8,maxHeight:160,overflow:"auto",border:`1px solid ${C.bd}`,borderRadius:6,padding:8}}>
            {res.fields.map(f=>(
              <label key={f} style={{display:"flex",alignItems:"center",gap:5,fontSize:12,cursor:"pointer",color:dupKeys.has(f)?C.tx:C.txm,overflow:"hidden"}}>
                <input type="checkbox" checked={dupKeys.has(f)} onChange={e=>{const s=new Set(dupKeys);e.target.checked?s.add(f):s.delete(f);setDupKeys(s);setDupResult(null);}} style={{accentColor:C.vi,flexShrink:0}}/>
                <span style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}} title={f}>{f}</span>
              </label>
            ))}
          </div>
          <div style={{display:"flex",gap:10,alignItems:"center",marginBottom:10,flexWrap:"wrap"}}>
            <label style={{fontSize:12,color:C.txm,display:"flex",alignItems:"center",gap:5,cursor:"pointer"}} title="09:12 and 15:40 on the same date count as equal — the usual business rule">
              <input type="checkbox" checked={dupDayDates} onChange={e=>{setDupDayDates(e.target.checked);setDupResult(null);}} style={{accentColor:C.vi}}/>
              Compare dates by day (ignore time)
            </label>
            <button onClick={runDupAnalysis} disabled={dupKeys.size===0} style={bt(C.vi,{fontSize:12,opacity:dupKeys.size?1:0.5})}>Analyze{dupKeys.size?` (${dupKeys.size} column${dupKeys.size>1?"s":""})`:""}</button>
          </div>
          {dupResult&&(dupResult.groups.length===0
            ?<div style={{fontSize:13,color:C.gn,padding:"8px 0"}}>✅ No duplicates — every loaded row is unique on the selected columns.{dupResult.blankSkipped?` (${dupResult.blankSkipped.toLocaleString()} rows with all key columns empty were skipped.)`:""}</div>
            :<>
              <div style={{fontSize:13,marginBottom:8}}>
                <span style={{color:C.yw,fontWeight:700}}>{dupResult.groups.length.toLocaleString()} duplicate group{dupResult.groups.length>1?"s":""}</span>
                <span style={{color:C.txm}}> · {dupResult.excess.toLocaleString()} excess row{dupResult.excess>1?"s":""} beyond the first of each group, out of {dupResult.analyzed.toLocaleString()} analyzed{dupResult.blankSkipped?` · ${dupResult.blankSkipped.toLocaleString()} all-empty keys skipped`:""}</span>
              </div>
              <div style={{display:"flex",gap:6,marginBottom:10,flexWrap:"wrap"}}>
                <button onClick={selectDupExcess} style={bt(C.rd,{fontSize:12})}>Select {dupResult.excess.toLocaleString()} duplicates (keep first per group)</button>
                <button onClick={dupCSV} style={bt(C.cy,{fontSize:12})}><I.Download/> Export groups (CSV)</button>
              </div>
              <div style={{border:`1px solid ${C.bd}`,borderRadius:6,overflow:"hidden"}}>
                {dupResult.groups.slice(0,100).map((g,gi)=>(
                  <div key={gi} style={{borderBottom:`1px solid ${C.bd}33`,padding:"6px 10px"}}>
                    <div style={{fontSize:12,fontWeight:600,color:C.yw,marginBottom:2}}>×{g.rows.length} — {[...dupKeys].map(f=>flatVal(bestGet(g.rows[0],f))||"(empty)").join(" · ")}</div>
                    {g.rows.slice(0,6).map((r,ri)=>(
                      <div key={ri} style={{fontSize:11,...mono,display:"flex",gap:8,alignItems:"center"}}>
                        <span style={{fontWeight:700,minWidth:46,color:ri===0?C.gn:C.rd}}>{ri===0?"KEEP":"DELETE"}</span>
                        <span style={{color:C.txm}}>{String(getRecordId(r)||"?")}</span>
                      </div>
                    ))}
                    {g.rows.length>6&&<div style={{fontSize:11,color:C.txd}}>… {g.rows.length-6} more rows in this group</div>}
                  </div>
                ))}
                {dupResult.groups.length>100&&<div style={{padding:"6px 10px",fontSize:11,color:C.txd}}>Showing the 100 biggest of {dupResult.groups.length.toLocaleString()} groups — selection and the CSV export cover ALL of them.</div>}
              </div>
              <div style={{fontSize:11,color:C.txd,marginTop:8,lineHeight:1.5}}>"Keep first" keeps each group's first row in loaded order — review the groups (or the CSV) before deleting, and export the doomed rows first as your undo file. Rows sharing these values can still be legitimate twins: when in doubt, add a source-reference column to the key.</div>
            </>)}
          <div style={{display:"flex",justifyContent:"flex-end",marginTop:12}}>
            <button onClick={()=>setDupPanel(false)} style={bt(null,{fontSize:12})}>Close</button>
          </div>
        </div>
      </div>}

      {confirmModal&&<div style={{position:"fixed",top:0,left:0,right:0,bottom:0,background:"rgba(0,0,0,.5)",zIndex:100,display:"flex",alignItems:"center",justifyContent:"center"}} onClick={()=>setConfirmModal(null)}>
        <div style={{background:C.sf,border:`1px solid ${C.bd}`,borderRadius:10,padding:20,minWidth:320,maxWidth:420,boxShadow:"0 8px 32px rgba(0,0,0,.5)"}} onClick={e=>e.stopPropagation()}>
          <div style={{fontSize:14,color:C.tx,whiteSpace:"pre-line",marginBottom:16,lineHeight:1.5}}>{confirmModal.msg}</div>
          <div style={{display:"flex",gap:6,justifyContent:"flex-end"}}>
            <button onClick={()=>setConfirmModal(null)} style={bt(null,{fontSize:12})}>Cancel</button>
            <button onClick={confirmModal.onOk} style={bt(C.rd,{fontSize:12})}>Confirm</button>
          </div>
        </div>
      </div>}
      <style>{`@keyframes fadeIn{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:translateY(0)}}`}</style>
    </div>
  );
}
