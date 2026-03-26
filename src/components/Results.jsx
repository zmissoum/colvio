import { useState, useEffect, useMemo, useRef } from "react";
import { bridge } from "../d365-bridge.js";
import * as XLSX from "xlsx";
import { C, I, Spin, mono, bt, dl, copyText, ths, tds } from "../shared.jsx";
import VirtualTable from "./VirtualTable.jsx";

export default function Results({res,bp,orgInfo,onStop,onDeleteDone}){
  const[sortField,setSortField]=useState(null);
  const[bulkUpdate,setBulkUpdate]=useState(null);
  const[bulkUpdating,setBulkUpdating]=useState(false);
  const[sortDir,setSortDir]=useState("asc");
  // Reset sort/selection when query changes (different entity or query string)
  const prevQuery=useRef(null);
  useEffect(()=>{
    const qKey=res?.query;
    if(qKey!==prevQuery.current){
      prevQuery.current=qKey;
      setSortField(null);setSortDir("asc");setSelected(new Set());setBulkUpdate(null);
    }
  },[res?.query]);
  const doBulkUpdate=async()=>{
    if(!bulkUpdate?.field||!selected.size||!res.entity?.p) return;
    if(!window.confirm(`Update ${selected.size} record(s)?\n\nField: ${bulkUpdate.field}\nNew value: ${bulkUpdate.value||"null"}`)) return;
    const ids=[...selected];
    setBulkUpdating(true);
    let ok=0,fail=0;
    const odataField=res.odataFieldMap?.[bulkUpdate.field]||bulkUpdate.field;
    let val=bulkUpdate.value;
    if(val===""||val==="null") val=null;
    else if(val==="true") val=true;
    else if(val==="false") val=false;
    else if(!isNaN(val)&&val.trim()!=="") val=Number(val);
    for(const id of ids){
      try{
        await bridge.update(res.entity.p, id, {[odataField]:val});
        ok++;
      }catch{fail++;}
    }
    setBulkUpdating(false);
    setBulkUpdate(null);
    showFeedback(`Bulk update: ${ok} updated${fail?`, ${fail} failed`:""}`);
  };
  const inlineEdit=async(record,field,newValue)=>{
    const id=getRecordId(record);
    if(!id||!res.entity?.p) return;
    try{
      const odataField=res.odataFieldMap?.[field]||field;
      let val=newValue;
      if(newValue===""||newValue==="null") val=null;
      else if(newValue==="true") val=true;
      else if(newValue==="false") val=false;
      else if(!isNaN(newValue)&&newValue.trim()!=="") val=Number(newValue);
      await bridge.update(res.entity.p, id, {[odataField]:val});
      const idx=res.data.indexOf(record);
      if(idx>=0){const updated={...record,[odataField]:val};delete updated[odataField+"__display"];res.data[idx]=updated;}
      showFeedback("\u2713 Saved");
    }catch(e){
      showFeedback("Edit failed: "+e.message);
    }
  };
  const toggleSort=(f)=>{if(sortField===f){setSortDir(d=>d==="asc"?"desc":"asc");}else{setSortField(f);setSortDir("asc");}};
  const sortedData=useMemo(()=>{
    if(!sortField) return res.data;
    const dk2=(f)=>res.odataFieldMap?.[f]||f;
    return [...res.data].sort((a,b)=>{
      let va=a[dk2(sortField)+"__display"]??a[dk2(sortField)]??"";
      let vb=b[dk2(sortField)+"__display"]??b[dk2(sortField)]??"";
      if(typeof va==="number"&&typeof vb==="number") return sortDir==="asc"?va-vb:vb-va;
      va=String(va).toLowerCase();vb=String(vb).toLowerCase();
      return sortDir==="asc"?va.localeCompare(vb):vb.localeCompare(va);
    });
  },[res.data,sortField,sortDir]);
  const[cp,setCp]=useState(null);
  const[copyFeedback,setCopyFeedback]=useState("");
  const[selected,setSelected]=useState(new Set());
  const[deleting,setDeleting]=useState(false);

  const getRecordId=(r)=>{
    const idKey=`${res.entity.l}id`;
    if(r[idKey]) return r[idKey];
    for(const[k,v] of Object.entries(r)){
      if(typeof v==="string"&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)) return v;
    }
    return null;
  };
  const toggleSel=(id)=>setSelected(prev=>{const s=new Set(prev);s.has(id)?s.delete(id):s.add(id);return s;});
  const toggleAll=()=>{
    if(selected.size===res.data.length){setSelected(new Set());}
    else{setSelected(new Set(res.data.map(r=>getRecordId(r)).filter(Boolean)));}
  };
  const doDelete=async()=>{
    if(!selected.size) return;
    const count=selected.size;
    const entityName=res.entity?.l;
    try{
      const meta=await bridge.getEntityMetadata(entityName);
      if(!meta.canBeDeleted){
        alert(`Entity "${meta.displayName}" does not allow deletion. The CanBeDeleted property is set to false.`);
        return;
      }
      if(!confirm(`You are about to permanently delete ${count} record(s) from "${meta.displayName}" (${entityName}).\n\nThis action is irreversible and cannot be undone.\n\nProceed?`)) return;
    }catch{
      if(!confirm(`Delete ${count} record(s) from ${entityName}? This action is irreversible.`)) return;
    }
    setDeleting(true);
    try{
      const result=await bridge.batchDelete(res.entity.p,Array.from(selected));
      showFeedback(`${result.deleted} deleted${result.errors?.length?`, ${result.errors.length} error(s)`:""}`);
      if(onDeleteDone) onDeleteDone(selected);
      setSelected(new Set());
    }catch(e){
      showFeedback(`Error: ${e.message}`);
    }
    setDeleting(false);
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

    if (disp !== undefined && disp !== null && targetEntity && raw && orgUrl) {
      const link = `${orgUrl}/main.aspx?etn=${targetEntity}&id=${raw}&pagetype=entityrecord`;
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
  const toCSV=()=>"\uFEFF"+[res.fields.join(","),...res.data.map(r=>res.fields.map(f=>escCSV(expVal(r,f))).join(","))].join("\n");
  const toTSV=()=>[res.fields.join("\t"),...res.data.map(r=>res.fields.map(f=>escTSV(expVal(r,f))).join("\t"))].join("\n");
  const toJSON=()=>JSON.stringify(res.data.map(r=>{const o={};res.fields.forEach(f=>{o[f]=bestGet(r,f)??null;});return o;}),null,2);

  const showFeedback=(msg)=>{setCopyFeedback(msg);setTimeout(()=>setCopyFeedback(""),2000);};
  const n=res.data.length;
  const copyCSV=()=>{copyText(toCSV());showFeedback(`CSV copied (${n} rows)`);};
  const copyExcel=()=>{copyText(toTSV());showFeedback(`Copied for Excel (${n} rows)`);};
  const copyJSON=()=>{copyText(toJSON());showFeedback(`JSON copied (${n} rows)`);};
  const dlCSV=()=>{dl(toCSV(),"text/csv;charset=utf-8",`${res.entity.l}_export.csv`);showFeedback(`CSV downloaded (${n} rows)`);};
  const dlXLSX=()=>{
    try{
      const wsData=[res.fields,...res.data.map(r=>res.fields.map(f=>bestGet(r,f)))];
      const ws=XLSX.utils.aoa_to_sheet(wsData);
      ws["!cols"]=res.fields.map(f=>({wch:Math.max(f.length,12)}));
      const wb=XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb,ws,res.entity.l.substring(0,31));
      XLSX.writeFile(wb,`${res.entity.l}_export.xlsx`);
      showFeedback(`XLSX downloaded (${n} rows)`);
    }catch(e){showFeedback("XLSX error: "+e.message);}
  };
  const dlJSON=()=>{dl(toJSON(),"application/json;charset=utf-8",`${res.entity.l}_export.json`);showFeedback(`JSON downloaded (${n} rows)`);};

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
            <span style={{fontSize:13,color:C.gn,fontWeight:600}}>{res.data.length} records</span>
            {res.fetching&&<span style={{fontSize:11,color:C.cy,background:C.cy+"22",padding:"2px 8px",borderRadius:3,display:"inline-flex",alignItems:"center",gap:4}}><Spin s={8}/> loading…</span>}
            {res.fetching&&<button onClick={onStop} style={{padding:"1px 8px",fontSize:11,border:`1px solid ${C.rd}44`,borderRadius:3,cursor:"pointer",background:C.rd+"22",color:C.rd,fontWeight:600}}>■ Stop</button>}
            <span style={{fontSize:11,color:C.txd}}>/ {res.total.toLocaleString()}</span>
            <span style={{fontSize:11,color:C.txd,background:C.bg,padding:"2px 6px",borderRadius:3}}>{res.elapsed}</span>
          </div>
          {copyFeedback && (
            <span style={{fontSize:13,color:C.gn,fontWeight:600,display:"flex",alignItems:"center",gap:4,animation:"fadeIn .2s"}}>
              ✓ {copyFeedback}
            </span>
          )}
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
                    <select value={bulkUpdate.field} onChange={e=>setBulkUpdate({...bulkUpdate,field:e.target.value})} style={{width:"100%",padding:"7px 11px",background:C.bg,border:`1px solid ${C.bd}`,borderRadius:6,color:C.tx,fontSize:13,outline:"none",boxSizing:"border-box"}}>
                      {res.fields.filter(f=>!f.includes(".")).map(f=><option key={f} value={f}>{f}</option>)}
                    </select>
                  </div>
                  <div style={{marginBottom:8}}>
                    <label style={{fontSize:11,color:C.txm,display:"block",marginBottom:2}}>New value</label>
                    <input value={bulkUpdate.value} onChange={e=>setBulkUpdate({...bulkUpdate,value:e.target.value})} placeholder="null, true, false, or value..." style={{width:"100%",padding:"7px 11px",background:C.bg,border:`1px solid ${C.bd}`,borderRadius:6,color:C.tx,fontSize:13,...mono,outline:"none",boxSizing:"border-box"}} onKeyDown={e=>{if(e.key==="Enter")doBulkUpdate();}}/>
                  </div>
                  <div style={{display:"flex",gap:6}}>
                    <button onClick={doBulkUpdate} disabled={bulkUpdating} style={bt(`linear-gradient(135deg,${C.cy},${C.vi})`,{fontSize:12,flex:1,justifyContent:"center"})}>{bulkUpdating?<><Spin s={10}/> Updating...</>:<><I.Zap/> Update {selected.size}</>}</button>
                    <button onClick={()=>setBulkUpdate(null)} style={bt(null,{fontSize:12})}>Cancel</button>
                  </div>
                </div>
              )}
            </div>
            <button onClick={doDelete} disabled={deleting} style={{padding:"4px 10px",fontSize:12,fontWeight:600,cursor:"pointer",display:"flex",alignItems:"center",gap:4,background:C.rd+"22",border:`1px solid ${C.rd}44`,borderRadius:4,color:C.rd}}>
              {deleting?<Spin s={10}/>:<I.Trash/>} Delete {selected.size}
            </button>
          </>}
        </div>
      </div>

      <VirtualTable res={res} fields={res.fields} data={sortedData}
        selected={selected} toggleSel={toggleSel} toggleAll={toggleAll}
        getRecordId={getRecordId} copy={copy} cp={cp} bestGet={bestGet} rawGet={rawGet} flatVal={flatVal} fmt={fmt}
        ths={ths} tds={tds} onSort={toggleSort} sortField={sortField} sortDir={sortDir} onInlineEdit={inlineEdit} orgInfo={orgInfo} entityName={res.entity?.l} />

      {res.fetching && (
        <div style={{padding:"10px 16px",borderTop:`1px solid ${C.bd}`,background:C.sf,display:"flex",alignItems:"center",gap:10}}>
          <Spin s={12}/>
          <span style={{fontSize:13,color:C.cy,flex:1}}>Loading... {res.data.length} records</span>
          <button onClick={onStop} style={{padding:"3px 10px",fontSize:12,border:`1px solid ${C.rd}44`,borderRadius:4,cursor:"pointer",background:C.rd+"22",color:C.rd}}>Stop</button>
        </div>
      )}
      {!res.fetching && res.data.length > 0 && (
        <div style={{padding:"6px 16px",textAlign:"center",color:C.txd,fontSize:12,borderTop:`1px solid ${C.bd}`}}>
          {res.data.length} records — loading complete
        </div>
      )}

      <style>{`@keyframes fadeIn{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:translateY(0)}}`}</style>
    </div>
  );
}
