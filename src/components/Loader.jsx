import { useState, useEffect, useRef } from "react";
import { bridge } from "../d365-bridge.js";
import * as XLSX from "xlsx";
import { C, I, Spin, ENTS, D365CF, mono, inp, bt, crd, ths, tds, dl } from "../shared.jsx";

export default function Loader({bp,orgInfo}){
  const[step,setStep]=useState(0);const[csvFile,setCsvFile]=useState(null);const[csvData,setCsvData]=useState({h:[],r:[]});const[target,setTarget]=useState("account");const[maps,setMaps]=useState([]);const[lookups,setLookups]=useState([]);const[uKey,setUKey]=useState({d:"",c:""});const[result,setResult]=useState(null);const[dragOn,setDragOn]=useState(false);const[pasteMode,setPasteMode]=useState(false);const[pasteText,setPasteText]=useState("");const fRef=useRef(null);

  const parseData=(text,delimiter=",")=>{
    const lines=text.split("\n").filter(l=>l.trim());
    if(lines.length<2)return;
    const sep=delimiter==="auto"?(lines[0].includes("\t")?"\t":","):delimiter;
    const headers=lines[0].split(sep).map(h=>h.trim().replace(/"/g,"").replace(/^\uFEFF/,""));
    const rows=lines.slice(1).map(line=>{const vals=line.split(sep).map(v=>v.trim().replace(/"/g,""));const obj={};headers.forEach((h,i)=>obj[h]=vals[i]||"");return obj;});
    setCsvData({h:headers,r:rows});

    const commonMapping={firstname:"firstname",lastname:"lastname",email:"emailaddress1",phone:"telephone1",title:"jobtitle",mailingstreet:"address1_line1",mailingcity:"address1_city",mailingpostalcode:"address1_postalcode",mailingcountry:"address1_country",name:"name",accountnumber:"accountnumber",description:"description",website:"websiteurl",fax:"fax"};
    const d365Set=new Set(targetFields);

    const SKIP_FIELDS=new Set(["createdon","modifiedon","createdby","modifiedby","owningbusinessunit","owningteam","owninguser","versionnumber","importsequencenumber","overriddencreatedon","timezoneruleversionnumber","utcconversiontimezonecode"]);

    const GUID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const primaryKey=(target+"id").toLowerCase();
    const lookupCols=new Set();
    const autoLookups=[];

    headers.filter(h=>!h.includes(".")).forEach(h=>{
      const low=h.toLowerCase();
      if(low===primaryKey) return;
      if(low.endsWith("id") && low!==primaryKey){
        const sample=rows[0]?.[h];
        if(sample && GUID_RE.test(sample)){
          lookupCols.add(h);
          const entName=low.replace(/id$/,"").replace(/^_/,"").replace(/_value$/,"");
          const knownLookups={"parentaccountid":"account","parentcontactid":"contact","ownerid":"systemuser","owningbusinessunit":"businessunit","transactioncurrencyid":"transactioncurrency","primarycontactid":"contact"};
          const targetEnt=knownLookups[low]||entName;
          autoLookups.push({src:"",csv:h,entity:targetEnt,nav:low,d365f:"",fb:"skip",mode:"direct"});
        }
      }
    });

    setMaps(headers.filter(h=>!h.includes(".")).map(h=>{
      const low=h.toLowerCase();
      if(SKIP_FIELDS.has(low)) return {csv:h,d365:"",transform:"",skip:true};
      if(low===primaryKey) return {csv:h,d365:"",transform:"",skip:true,isPK:true};
      if(lookupCols.has(h)) return {csv:h,d365:"",transform:"",skip:true,isLookup:true};
      if(low==="statecode") return {csv:h,d365:"statecode",transform:"statecode"};
      if(low==="statuscode") return {csv:h,d365:"statuscode",transform:"int"};
      if(d365Set.has(low)) return {csv:h,d365:low,transform:""};
      if(d365Set.has(h)) return {csv:h,d365:h,transform:""};
      if(commonMapping[low]) return {csv:h,d365:commonMapping[low],transform:""};
      return {csv:h,d365:"",transform:""};
    }));

    const parents=new Set();const lks=[...autoLookups];
    headers.filter(h=>h.includes(".")).forEach(col=>{const p=col.split(".")[0];if(!parents.has(p)){parents.add(p);lks.push({src:p+"Id",csv:col,entity:p.toLowerCase(),nav:`parentcustomerid_${p.toLowerCase()}`,d365f:"",fb:"skip",mode:"resolve"});}});
    setLookups(lks);setStep(1);
  };

  const handleFile=(e)=>{e.preventDefault();setDragOn(false);const f=e.dataTransfer?.files?.[0]||e.target?.files?.[0];if(!f)return;setCsvFile(f);const reader=new FileReader();reader.onload=(ev)=>parseData(ev.target.result);reader.readAsText(f);};

  const handlePaste=()=>{if(pasteText.trim()){setCsvFile({name:"clipboard_data.csv"});parseData(pasteText,"auto");}};

  const isLive = orgInfo?.isExtension;
  const[loadProgress,setLoadProgress]=useState({done:0,total:0,current:""});
  const[liveEntities,setLiveEntities]=useState([]);

  useEffect(()=>{
    if(!isLive) return;
    bridge.getEntities().then(data=>{
      if(data&&Array.isArray(data)){
        setLiveEntities(data.map(e=>({l:e.logical,d:e.display,p:e.entitySet||e.logical+"s",i:e.isCustom?"⚙️":"📋"})).sort((a,b)=>a.d.localeCompare(b.d)));
      }
    }).catch(()=>{});
  },[isLive]);

  const entityList = liveEntities.length > 0 ? liveEntities : ENTS;
  const[targetFields,setTargetFields]=useState(D365CF);

  useEffect(()=>{
    if(!isLive||!target) return;
    bridge.getFields(target).then(data=>{
      if(data&&Array.isArray(data)){
        setTargetFields(data.map(f=>f.logical||f.l).sort());
      }
    }).catch(()=>{});
  },[isLive,target]);

  const STATECODE_MAP={"active":0,"inactive":1,"actif":0,"inactif":1,"0":0,"1":1};
  const BOOLEAN_YESNO={"yes":true,"no":false,"oui":true,"non":false,"true":true,"false":false,"1":true,"0":false,"vrai":true,"faux":false};

  const applyTransform=(val,transform)=>{
    if(val===undefined||val===null||val==="") return null;
    const low=String(val).toLowerCase().trim();
    switch(transform){
      case "statecode": {
        if(STATECODE_MAP[low]!==undefined) return STATECODE_MAP[low];
        const n=parseInt(val,10);
        return isNaN(n)?null:n;
      }
      case "picklist": {
        const n=parseInt(val,10);
        return isNaN(n)?null:n;
      }
      case "boolean_yesno": {
        if(BOOLEAN_YESNO[low]!==undefined) return BOOLEAN_YESNO[low];
        return null;
      }
      case "boolean": return low==="true"||low==="1"||low==="oui"||low==="yes";
      case "int": { const n=parseInt(val,10); return isNaN(n)?null:n; }
      case "float": { const n=parseFloat(val); return isNaN(n)?null:n; }
      case "date_iso": { try{ return new Date(val).toISOString(); }catch{ return null; } }
      case "upper": return val.toUpperCase();
      case "lower": return val.toLowerCase();
      default: return val;
    }
  };

  const resolveLookup=async(lk, value)=>{
    if(!value||!lk.entity||!lk.d365f) return null;
    try{
      const escaped=value.replace(/'/g,"''");
      const data=await bridge.query(`${lk.entity}s`,{filter:`${lk.d365f} eq '${escaped}'`,top:"1",select:`${lk.entity}id`});
      if(data?.records?.length>0){
        const rec=data.records[0];
        const idKey=Object.keys(rec).find(k=>k.endsWith("id")&&!k.includes("@"))||`${lk.entity}id`;
        return rec[idKey];
      }
    }catch{}
    return null;
  };

  const doLoad=async()=>{
    setStep(4);setResult(null);
    const rows=csvData.r;
    const SYSTEM_FIELDS=new Set(["createdon","modifiedon","createdby","modifiedby","owningbusinessunit","owningteam","owninguser","versionnumber","importsequencenumber","overriddencreatedon","timezoneruleversionnumber","utcconversiontimezonecode"]);
    const activeMaps=maps.filter(m=>m.d365 && !m.skip && !SYSTEM_FIELDS.has(m.d365.toLowerCase()));
    const total=rows.length;
    let created=0,updated=0,skipped=0;
    const errors=[];
    const logEntries=[];

    if(!isLive){
      setTimeout(()=>setResult({created:total-1,updated:1,errors:[],skipped:0,elapsed:"2.1"}),2000);
      return;
    }

    const lookupCache={};
    for(const lk of lookups){
      if(lk.mode==="direct") continue;
      if(!lk.csv||!lk.entity||!lk.d365f) continue;
      const uniqueVals=[...new Set(rows.map(r=>r[lk.csv]).filter(Boolean))];
      setLoadProgress({done:0,total,current:`Resolving lookups ${lk.entity} (${uniqueVals.length} values)...`});
      for(const val of uniqueVals){
        const guid=await resolveLookup(lk,val);
        lookupCache[`${lk.entity}.${lk.d365f}.${val}`]=guid;
      }
    }

    const targetEnt = entityList.find(e => e.l === target);
    const entitySet = targetEnt?.p || target+"s";
    const startTime=Date.now();
    const createRecords=[];
    const upsertItems=[];

    setLoadProgress({done:0,total,current:"Preparing records..."});

    for(let i=0;i<rows.length;i++){
      const row=rows[i];
      const rec={};

      try{
        for(const m of activeMaps){
          if(!m.d365) continue;
          const rawVal = row[m.csv];
          if(rawVal === undefined || rawVal === null || rawVal === "") continue;
          const val=applyTransform(rawVal,m.transform);
          if(val!==null && val!==undefined && val!=="") rec[m.d365]=val;
        }

        let skipRow=false;
        for(const lk of lookups){
          if(!lk.csv||!lk.nav) continue;
          const val=row[lk.csv];
          if(!val){
            if(lk.fb==="error"){ errors.push({row:i+1,msg:`Empty lookup: ${lk.csv}`});logEntries.push({row:i+1,status:"ERROR",detail:`Empty lookup: ${lk.csv}`,d365Id:""});skipRow=true;break; }
            continue;
          }
          if(lk.mode==="direct"){
            rec[`${lk.nav}@odata.bind`]=`/${lk.entity}s(${val})`;
          } else {
            const guid=lookupCache[`${lk.entity}.${lk.d365f}.${val}`];
            if(guid){
              rec[`${lk.nav}@odata.bind`]=`/${lk.entity}s(${guid})`;
            } else {
              if(lk.fb==="error"){ errors.push({row:i+1,msg:`Lookup not found: ${lk.csv}="${val}"`});logEntries.push({row:i+1,status:"ERROR",detail:`Lookup not found: ${lk.csv}="${val}"`,d365Id:""});skipRow=true;break; }
              if(lk.fb==="skip"){ skipped++;logEntries.push({row:i+1,status:"SKIPPED",detail:`Lookup not resolved: ${lk.csv}="${val}"`,d365Id:""});skipRow=true;break; }
            }
          }
        }
        if(skipRow) continue;

        if(uKey.d && uKey.c && row[uKey.c]){
          rec[uKey.d]=row[uKey.c];
          upsertItems.push({keyValue:row[uKey.c],record:rec});
        } else {
          createRecords.push(rec);
        }
      }catch(e){
        errors.push({row:i+1,msg:e.message?.substring(0,500)||"Error",payload:JSON.stringify(rec).substring(0,200)});
        logEntries.push({row:i+1,status:"ERROR",detail:e.message?.substring(0,200)||"Error",d365Id:""});
      }
    }


    if(createRecords.length>0){
      setLoadProgress({done:0,total:createRecords.length,current:`Sending ${createRecords.length} records (CREATE)...`});
      try{
        const res=await bridge.batchCreate(entitySet,createRecords);
        created=res.created||0;
        for(let j=0;j<created;j++) logEntries.push({row:j+1,status:"CREATED",detail:"OK",d365Id:""});
        if(res.errors){ res.errors.forEach(e=>{errors.push({...e,payload:""});logEntries.push({row:e.row||0,status:"ERROR",detail:e.msg||"Batch error",d365Id:""});}); }
      }catch(e){
        errors.push({row:0,msg:`Batch CREATE failed: ${e.message}`,payload:""});
      }
    }

    if(upsertItems.length>0){
      setLoadProgress({done:createRecords.length,total:total,current:`Sending ${upsertItems.length} records (UPSERT)...`});
      try{
        const isPK = uKey.d.toLowerCase() === target + "id";
        const res=await bridge.batchUpsert(entitySet,uKey.d,upsertItems,isPK);
        updated=res.updated||0;
        for(let j=0;j<updated;j++) logEntries.push({row:createRecords.length+j+1,status:"UPSERTED",detail:"OK",d365Id:""});
        if(res.errors){ res.errors.forEach(e=>{errors.push({...e,payload:""});logEntries.push({row:e.row||0,status:"ERROR",detail:e.msg||"Batch error",d365Id:""});}); }
      }catch(e){
        errors.push({row:0,msg:`Batch UPSERT failed: ${e.message}`,payload:""});
      }
    }

    const elapsed=((Date.now()-startTime)/1000).toFixed(1);
    setResult({created,updated,errors,skipped,elapsed,log:logEntries,entity:target,totalRows:total});
    setLoadProgress({done:total,total,current:"Done"});
  };
  const steps=[{l:"Source",i:"📄"},{l:"Mapping",i:"🔗"},{l:"Lookups",i:"🔍"},{l:"Preview",i:"👁"},{l:"Run",i:"🚀"}];

  return(
    <div style={{padding:bp.mobile?12:20,maxWidth:1100,margin:"0 auto"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:0,marginBottom:bp.mobile?14:22,flexWrap:"wrap"}}>
        {steps.map((s,i)=><div key={i} style={{display:"flex",alignItems:"center"}}><button onClick={()=>i<=step&&setStep(i)} style={{display:"flex",alignItems:"center",gap:3,padding:bp.mobile?"4px 6px":"5px 10px",borderRadius:5,cursor:i<=step?"pointer":"default",background:i===step?C.sfa:"transparent",border:`1px solid ${i===step?C.vi:i<step?C.gnd:C.bd}`,fontSize:bp.mobile?10:11,color:i<=step?C.tx:C.txd,fontWeight:i===step?600:400}}><span style={{fontSize:bp.mobile?10:12}}>{i<step?"✅":s.i}</span>{(!bp.mobile||i===step)&&<span>{s.l}</span>}</button>{i<4&&<div style={{width:bp.mobile?6:14,height:1,background:i<step?C.gn:C.bd,margin:"0 2px"}}/>}</div>)}
      </div>

      {step===0&&(
        <div>
          <div style={{display:"flex",gap:0,marginBottom:14,background:C.sf,borderRadius:8,border:`1px solid ${C.bd}`,overflow:"hidden"}}>
            {[{id:false,label:"📂 CSV File",desc:"Drag & drop or select"},{id:true,label:"📋 Paste from Excel",desc:"Ctrl+V directly"}].map(m=>(
              <button key={String(m.id)} onClick={()=>setPasteMode(m.id)} style={{flex:1,padding:"12px 0",border:"none",cursor:"pointer",transition:"all .15s",background:pasteMode===m.id?C.sfa:"transparent",color:pasteMode===m.id?C.tx:C.txd}}>
                <div style={{fontSize:15,fontWeight:pasteMode===m.id?600:400}}>{m.label}</div>
                <div style={{fontSize:12,color:C.txd,marginTop:2}}>{m.desc}</div>
              </button>
            ))}
          </div>

          {!pasteMode?(
            <div onDragOver={e=>{e.preventDefault();setDragOn(true);}} onDragLeave={()=>setDragOn(false)} onDrop={handleFile} onClick={()=>fRef.current?.click()} style={{border:`2px dashed ${dragOn?C.vi:C.bd}`,borderRadius:12,padding:bp.mobile?"32px 16px":"48px 40px",textAlign:"center",cursor:"pointer",background:dragOn?C.sfa:C.sf}}>
              <input ref={fRef} type="file" accept=".csv,.tsv,.txt" onChange={handleFile} style={{display:"none"}}/>
              <div style={{fontSize:36,marginBottom:10}}>📂</div>
              <h3 style={{color:C.tx,fontWeight:600,marginBottom:4,fontSize:15}}>Drop your file here</h3>
              <p style={{color:C.txm,fontSize:14}}>CSV, TSV, or TXT</p>
              <p style={{color:C.txd,fontSize:13,marginTop:8}}>Dot-notation supported: <code style={{color:C.cy}}>account.new_externalid</code></p>
            </div>
          ):(
            <div>
              <p style={{color:C.txm,fontSize:14,marginBottom:8}}>Copy-paste directly from Excel, Google Sheets, or any spreadsheet — tabs are auto-detected.</p>
              <textarea value={pasteText} onChange={e=>setPasteText(e.target.value)} placeholder={"Id\tFirstName\tLastName\taccount.new_externalid\n003xx001\tJean\tDupont\tSAP-001\n003xx002\tMarie\tMartin\tSAP-002"} style={inp({height:180,...mono,fontSize:14,color:C.cy,resize:"vertical",whiteSpace:"pre"})}/>
              <div style={{display:"flex",justifyContent:"flex-end",marginTop:8}}>
                <button onClick={handlePaste} disabled={!pasteText.trim()} style={bt(pasteText.trim()?`linear-gradient(135deg,${C.vi},${C.vil})`:C.sfh)}><I.Clipboard/> Load data</button>
              </div>
            </div>
          )}
        </div>
      )}

      {step===1&&(
        <div>
          <div style={{display:"flex",gap:10,marginBottom:12,flexDirection:bp.mobile?"column":"row"}}>
            <div style={{...crd({padding:12}),flex:1}}><label style={{fontSize:12,color:C.txm,fontWeight:500,display:"block",marginBottom:4}}>Target D365 entity</label><select value={target} onChange={e=>setTarget(e.target.value)} style={inp({fontSize:14})}>{entityList.map(e=><option key={e.l} value={e.l}>{e.i} {e.d} ({e.l})</option>)}</select></div>
            <div style={{...crd({padding:12}),flex:1}}>
              <label style={{fontSize:12,color:C.txm,fontWeight:500,display:"block",marginBottom:4}}>Import mode</label>
              <div style={{display:"flex",gap:6,marginBottom:6}}>
                <label style={{fontSize:12,color:!uKey.d?C.gn:C.txd,cursor:"pointer",display:"flex",alignItems:"center",gap:3}}>
                  <input type="radio" checked={!uKey.d} onChange={()=>setUKey({d:"",c:""})} style={{accentColor:C.gn}}/> CREATE (new records)
                </label>
                <label style={{fontSize:12,color:uKey.d?C.cy:C.txd,cursor:"pointer",display:"flex",alignItems:"center",gap:3}}>
                  <input type="radio" checked={!!uKey.d} onChange={()=>{const pk=target+"id";const pkCol=csvData.h.find(h=>h.toLowerCase()===pk);setUKey({d:pk,c:pkCol||csvData.h[0]||""});}} style={{accentColor:C.cy}}/> UPSERT (update or create)
                </label>
              </div>
              {uKey.d&&<div style={{display:"flex",gap:6,alignItems:"center"}}>
                <input value={uKey.d} onChange={e=>setUKey({...uKey,d:e.target.value})} placeholder="D365 column (alternate key)" list="dl_ukey" style={inp({flex:1,fontSize:13,...mono})}/>
                <datalist id="dl_ukey">{targetFields.map(f=><option key={f} value={f}/>)}</datalist>
                <span style={{color:C.txd}}>←</span>
                <select value={uKey.c} onChange={e=>setUKey({...uKey,c:e.target.value})} style={inp({flex:1,fontSize:13})}><option value="">—</option>{csvData.h.map(h=><option key={h}>{h}</option>)}</select>
              </div>}
            </div>
          </div>
          <div style={{...crd({overflow:"hidden"})}}>
            <div style={{padding:"8px 12px",borderBottom:`1px solid ${C.bd}`,display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:4}}><span style={{fontWeight:600,fontSize:14}}>Mapping</span><span style={{fontSize:12,color:C.txd}}>{csvFile?.name} — {csvData.r.length} rows</span></div>
            <div style={{overflow:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",fontSize:13,minWidth:460}}>
              <thead><tr style={{background:C.bg}}><th style={ths()}>CSV</th><th style={{...ths(),width:24}}></th><th style={ths()}>D365</th><th style={ths()}>Transform</th><th style={ths()}>Preview</th><th style={{...ths(),width:24}}></th></tr></thead>
              <tbody>{maps.map((m,i)=>{
                const isSystem=m.skip||["createdon","modifiedon","createdby","modifiedby","versionnumber"].includes(m.d365?.toLowerCase());
                const isPicklist=["statecode","statuscode"].includes(m.d365?.toLowerCase()) || m.transform==="statecode"||m.transform==="picklist";
                const skipLabel=m.isPK?"🔑 primary key (UPSERT)":m.isLookup?"🔗 lookup (step 3)":"system (ignored)";
                const skipColor=m.isPK?C.cy:m.isLookup?C.lv:C.yw;
                return (<tr key={i} style={{borderBottom:`1px solid ${C.bd}`,opacity:isSystem?0.4:1}}>
                <td style={tds}><span style={{color:C.cy,...mono,fontSize:12}}>{m.csv}</span></td>
                <td style={{...tds,textAlign:"center",color:isSystem?skipColor:isPicklist?C.or:m.d365?C.gn:C.txd}}>{isSystem?"⚠":isPicklist?"⚙":m.d365?<I.Arrow/>:"—"}</td>
                <td style={tds}>{isSystem?<span style={{fontSize:11,color:skipColor,...mono}}>{skipLabel}</span>:<><input value={m.d365} onChange={e=>{const u=[...maps];u[i]={...m,d365:e.target.value};setMaps(u);}} placeholder="(skip)" list={`dl${i}`} style={inp({fontSize:12,...mono,padding:"4px 10px",color:m.d365?C.tx:C.txd})}/><datalist id={`dl${i}`}>{targetFields.map(f=><option key={f} value={f}/>)}</datalist></>}</td>
                <td style={tds}>{!isSystem&&<select value={m.transform} onChange={e=>{const u=[...maps];u[i]={...m,transform:e.target.value};setMaps(u);}} style={inp({width:"auto",fontSize:11,padding:"2px 4px",color:isPicklist&&!m.transform?C.or:C.tx})}>
                  <option value="">{isPicklist?"⚠ choose":"—"}</option>
                  <option value="statecode">statecode (Active→0, Inactive→1)</option>
                  <option value="picklist">picklist (label→int)</option>
                  <option value="boolean_yesno">boolean (Yes/No→true/false)</option>
                  <option value="boolean">boolean (true/false→true/false)</option>
                  <option value="int">int</option>
                  <option value="float">float</option>
                  <option value="date_iso">date ISO</option>
                  <option value="upper">UPPER</option>
                  <option value="lower">lower</option>
                </select>}</td>
                <td style={{...tds,color:C.txd,maxWidth:80,fontSize:12}}>{csvData.r[0]?.[m.csv]||"—"}</td>
                <td style={tds}><button onClick={()=>setMaps(maps.filter((_,j)=>j!==i))} style={{background:"none",border:"none",color:C.txd,cursor:"pointer",padding:2}}><I.Trash/></button></td>
              </tr>);})}</tbody>
            </table></div>
          </div>
          <div style={{display:"flex",justifyContent:"flex-end",marginTop:12,gap:6}}><button onClick={()=>setStep(0)} style={bt()}>← Back</button><button onClick={()=>setStep(2)} style={bt(`linear-gradient(135deg,${C.vi},${C.vil})`)}>Lookups →</button></div>
        </div>
      )}

      {step===2&&(
        <div>
          <div style={{...crd({padding:bp.mobile?12:14}),marginBottom:12}}>
            <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:10}}><I.Link/><span style={{fontWeight:600,fontSize:15}}>Parent Lookups</span></div>
            {lookups.length===0?<div style={{textAlign:"center",padding:"14px 0",color:C.txd}}><p style={{marginBottom:8}}>No parent columns detected.</p><button onClick={()=>setLookups([...lookups,{src:"",csv:"",entity:"",nav:"",d365f:"",fb:"skip",mode:"resolve"}])} style={bt(null,{fontSize:13})}><I.Plus/> Add</button></div>
            :<div style={{display:"flex",flexDirection:"column",gap:8}}>
              {lookups.map((lk,i)=>(
                <div key={i} style={{background:C.bg,border:`1px solid ${C.bd}`,borderRadius:7,padding:bp.mobile?10:12}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}><span style={{fontWeight:600,fontSize:13,color:C.cy}}>Lookup #{i+1}</span><button onClick={()=>setLookups(lookups.filter((_,j)=>j!==i))} style={{background:"none",border:"none",color:C.txd,cursor:"pointer"}}><I.Trash/></button></div>
                  <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:8}}>
                    <span style={{fontSize:11,color:C.txm}}>Mode:</span>
                    {[{id:"resolve",label:"Resolve (search for GUID)",desc:"CSV value is an identifier to search in D365"},{id:"direct",label:"Direct GUID",desc:"CSV value is already a D365 GUID"}].map(m=>(
                      <label key={m.id} style={{fontSize:12,color:lk.mode===m.id?C.tx:C.txd,cursor:"pointer",display:"flex",alignItems:"center",gap:2}}>
                        <input type="radio" name={`mode${i}`} checked={lk.mode===m.id} onChange={()=>{const u=[...lookups];u[i]={...lk,mode:m.id};setLookups(u);}} style={{accentColor:C.vi}}/>
                        <span>{m.label}</span>
                      </label>
                    ))}
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:bp.mobile?"1fr":"1fr 1fr",gap:8}}>
                    <div><label style={{fontSize:11,color:C.txm,fontWeight:500,display:"block",marginBottom:2}}>CSV Column</label>
                      <select value={lk.csv} onChange={e=>{const u=[...lookups];u[i]={...lk,csv:e.target.value};const sample=csvData.r[0]?.[e.target.value];if(sample&&/^[0-9a-f]{8}-[0-9a-f]{4}-/.test(sample)){u[i].mode="direct";}setLookups(u);}} style={inp({fontSize:13,...mono})}><option value="">—</option>{csvData.h.map(o=><option key={o}>{o}</option>)}</select>
                    </div>
                    {lk.mode==="resolve"&&<div><label style={{fontSize:11,color:C.txm,fontWeight:500,display:"block",marginBottom:2}}>D365 Column (lookup key)</label>
                      <input value={lk.d365f} onChange={e=>{const u=[...lookups];u[i]={...lk,d365f:e.target.value};setLookups(u);}} placeholder="accountnumber, new_externalid..." style={inp({fontSize:13,...mono})}/>
                    </div>}
                    <div><label style={{fontSize:11,color:C.txm,fontWeight:500,display:"block",marginBottom:2}}>Target entity</label>
                      <input value={lk.entity} onChange={e=>{const u=[...lookups];u[i]={...lk,entity:e.target.value};setLookups(u);}} placeholder="account" style={inp({fontSize:13,...mono})}/>
                    </div>
                    <div><label style={{fontSize:11,color:C.txm,fontWeight:500,display:"block",marginBottom:2}}>Nav. property</label>
                      <input value={lk.nav} onChange={e=>{const u=[...lookups];u[i]={...lk,nav:e.target.value};setLookups(u);}} placeholder="parentcustomerid" style={inp({fontSize:13,...mono})}/>
                    </div>
                  </div>
                  <div style={{marginTop:6,display:"flex",alignItems:"center",gap:3,flexWrap:"wrap"}}>
                    <span style={{fontSize:11,color:C.txm}}>Fallback:</span>
                    {["skip","null","error"].map(fb=><label key={fb} style={{fontSize:12,color:lk.fb===fb?C.tx:C.txd,cursor:"pointer",display:"flex",alignItems:"center",gap:2,marginRight:6}}><input type="radio" name={`fb${i}`} checked={lk.fb===fb} onChange={()=>{const u=[...lookups];u[i]={...lk,fb};setLookups(u);}} style={{accentColor:C.vi}}/>{fb==="skip"?"Skip":fb==="null"?"Null":"Error"}</label>)}
                  </div>
                  <div style={{marginTop:6,padding:"4px 8px",background:C.sfh,borderRadius:3,fontSize:11,color:C.txd,...mono,overflowX:"auto",whiteSpace:"nowrap"}}>
                    {lk.mode==="direct"
                      ?<><span style={{color:C.cy}}>{lk.csv||"?"}</span> <span style={{color:C.gn}}>(Direct GUID)</span> → <span style={{color:C.yw}}>/{lk.entity||"?"}s(GUID)</span> → <span style={{color:C.yw}}>{lk.nav||"?"}@odata.bind</span></>
                      :<><span style={{color:C.cy}}>{lk.csv||"?"}</span> → <span style={{color:C.lv}}>{lk.entity||"?"}s</span>.{lk.d365f||"?"} → <span style={{color:C.gn}}>GUID</span> → <span style={{color:C.yw}}>{lk.nav||"?"}@odata.bind</span></>
                    }
                  </div>
                </div>
              ))}
              <button onClick={()=>setLookups([...lookups,{src:"",csv:"",entity:"",nav:"",d365f:"",fb:"skip",mode:"resolve"}])} style={{...bt(null,{fontSize:12,width:"fit-content"}),borderStyle:"dashed"}}><I.Plus/> Add</button>
            </div>}
          </div>
          <div style={{display:"flex",justifyContent:"flex-end",gap:6}}><button onClick={()=>setStep(1)} style={bt()}>← Back</button><button onClick={()=>setStep(3)} style={bt(`linear-gradient(135deg,${C.vi},${C.vil})`)}>Preview →</button></div>
        </div>
      )}

      {step===3&&(
        <div>
          <div style={{display:"grid",gridTemplateColumns:bp.mobile?"1fr 1fr":"1fr 1fr 1fr 1fr",gap:8,marginBottom:14}}>
            {[{l:"Records",v:csvData.r.length,c:C.cy},{l:"Columns",v:maps.filter(m=>m.d365).length,c:C.gn},{l:"Lookups",v:lookups.length,c:C.yw},{l:"Mode",v:uKey.d?"UPSERT":"INSERT",c:C.vi}].map((m,i)=><div key={i} style={{...crd({padding:"10px 12px",textAlign:"center"})}}><div style={{fontSize:18,fontWeight:700,color:m.c}}>{m.v}</div><div style={{fontSize:11,color:C.txd,marginTop:1}}>{m.l}</div></div>)}
          </div>
          <div style={{...crd({padding:12}),marginBottom:12}}>
            <div style={{fontSize:14,fontWeight:600,marginBottom:6}}>D365 record example</div>
            <pre style={{...inp({...mono,color:C.cy,fontSize:12,padding:10,overflow:"auto",whiteSpace:"pre-wrap",wordBreak:"break-all"}),margin:0}}>
{JSON.stringify((() => {const row=csvData.r[0]||{};const rec={};maps.filter(m=>m.d365&&!m.skip).forEach(m=>{rec[m.d365]=row[m.csv]||"";});const isPK=uKey.d&&uKey.d.toLowerCase()===target+"id";if(uKey.d&&uKey.c&&!isPK)rec[uKey.d]=row[uKey.c]||"";lookups.forEach(lk=>{if(lk.nav&&lk.csv){const val=row[lk.csv];rec[`${lk.nav}@odata.bind`]=lk.mode==="direct"&&val?`/${lk.entity||"?"}s(${val})`:`/${lk.entity||"?"}s(<GUID>)`;}});return rec;})(),null,2)}
            </pre>
          </div>
          <div style={{display:"flex",justifyContent:"flex-end",gap:6,flexWrap:"wrap"}}><button onClick={()=>setStep(2)} style={bt()}>← Back</button><button onClick={()=>{const cfg={d365_entity:target,upsert_key:uKey.d,fields:Object.fromEntries(maps.filter(m=>m.d365).map(m=>[m.csv,m.d365])),lookups:lookups.map(lk=>({source_field:lk.src,d365_target_entity:lk.entity,d365_navigation_property:lk.nav,resolve_by:{csv_column:lk.csv,d365_field:lk.d365f},fallback:lk.fb}))};dl(JSON.stringify(cfg,null,2),"application/json",`load_${target}.json`);}} style={bt()}><I.Download/> YAML</button><button onClick={doLoad} style={bt(`linear-gradient(135deg,${C.gn},${C.cyd})`)}><I.Zap/> Load</button></div>
        </div>
      )}

      {step===4&&(
        <div style={{padding:"20px 0"}}>
          {!result?(
            <div>
              <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14}}>
                <Spin s={18}/>
                <div style={{flex:1}}>
                  <div style={{fontSize:15,fontWeight:600,color:C.tx,marginBottom:4}}>{loadProgress.current}</div>
                  <div style={{height:6,background:C.bd,borderRadius:3,overflow:"hidden"}}>
                    <div style={{width:`${loadProgress.total?Math.round(loadProgress.done/loadProgress.total*100):0}%`,height:"100%",background:`linear-gradient(90deg,${C.vi},${C.cy})`,borderRadius:3,transition:"width .3s"}}/>
                  </div>
                  <div style={{fontSize:12,color:C.txd,marginTop:3}}>{loadProgress.done} / {loadProgress.total} records</div>
                </div>
              </div>
            </div>
          ):(
            <div>
              <div style={{textAlign:"center",marginBottom:16}}>
                <div style={{fontSize:38,marginBottom:8}}>{result.errors.length===0?"✅":"⚠️"}</div>
                <h2 style={{color:C.tx,fontWeight:700,fontSize:18,marginBottom:4}}>Done in {result.elapsed}s</h2>
              </div>
              <div style={{display:"grid",gridTemplateColumns:bp.mobile?"1fr 1fr":"1fr 1fr 1fr 1fr",gap:8,maxWidth:500,margin:"0 auto 14px"}}>
                {[{l:"Created",v:result.created,c:C.gn},{l:"Updated",v:result.updated,c:C.cy},{l:"Skipped",v:result.skipped,c:C.yw},{l:"Errors",v:result.errors.length,c:C.rd}].map((m,i)=><div key={i} style={{...crd({padding:"8px 10px",textAlign:"center"})}}><div style={{fontSize:20,fontWeight:700,color:m.c}}>{m.v}</div><div style={{fontSize:11,color:C.txd}}>{m.l}</div></div>)}
              </div>

              {result.log&&result.log.length>0&&(
                <div style={{...crd({padding:12}),marginTop:12}}>
                  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
                    <span style={{fontSize:14,fontWeight:600}}>Import Log ({result.log.length} rows)</span>
                    <span style={{fontSize:11,color:C.txd}}>
                      <span style={{color:C.gn}}>● {result.log.filter(e=>e.status==="CREATED").length} created</span>
                      {" "}<span style={{color:C.cy}}>● {result.log.filter(e=>e.status==="UPSERTED").length} upserted</span>
                      {" "}<span style={{color:C.yw}}>● {result.log.filter(e=>e.status==="SKIPPED").length} skipped</span>
                      {" "}<span style={{color:C.rd}}>● {result.log.filter(e=>e.status==="ERROR").length} errors</span>
                    </span>
                  </div>
                  <div style={{maxHeight:300,overflow:"auto"}}>
                    <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
                      <thead><tr>
                        <th style={{...ths(),width:50}}>Row</th>
                        <th style={{...ths(),width:90}}>Status</th>
                        <th style={ths()}>Detail</th>
                      </tr></thead>
                      <tbody>{result.log.map((e,i)=>{
                        const sc=e.status==="CREATED"?C.gn:e.status==="UPSERTED"?C.cy:e.status==="SKIPPED"?C.yw:C.rd;
                        return(
                          <tr key={i} style={{borderBottom:`1px solid ${C.bd}`}} onMouseEnter={ev=>ev.currentTarget.style.background=C.sfh} onMouseLeave={ev=>ev.currentTarget.style.background="transparent"}>
                            <td style={{...tds,fontWeight:600,...mono,color:C.txm}}>{e.row}</td>
                            <td style={tds}><span style={{fontSize:11,padding:"2px 8px",borderRadius:3,background:sc+"22",color:sc,fontWeight:600}}>{e.status}</span></td>
                            <td style={{...tds,color:e.status==="ERROR"?C.rd:C.txm,fontSize:12,...mono}}>{e.detail}</td>
                          </tr>
                        );
                      })}</tbody>
                    </table>
                  </div>
                </div>
              )}

              <div style={{display:"flex",justifyContent:"center",gap:8,marginTop:16,flexWrap:"wrap"}}>
                <button onClick={()=>{setStep(0);setCsvFile(null);setCsvData({h:[],r:[]});setResult(null);setPasteText("");setLoadProgress({done:0,total:0,current:""});}} style={bt(null)}>New import</button>
                <button onClick={()=>{
                  const ts=new Date().toISOString().replace(/[:.]/g,"-").substring(0,19);
                  const esc=(v)=>{const s=String(v||"");return s.includes(",")||s.includes('"')||s.includes("\n")?`"${s.replace(/"/g,'""')}"`:s;};
                  const header="Row,Status,Detail";
                  const log=result.log||[];
                  const lines=log.map(e=>[e.row,e.status,esc(e.detail)].join(","));
                  const summary=[
                    "",
                    `# Summary`,
                    `# Entity: ${result.entity||target}`,
                    `# Total rows: ${result.totalRows||0}`,
                    `# Created: ${result.created}`,
                    `# Updated: ${result.updated}`,
                    `# Skipped: ${result.skipped}`,
                    `# Errors: ${result.errors.length}`,
                    `# Duration: ${result.elapsed}s`,
                    `# Timestamp: ${new Date().toISOString()}`,
                  ];
                  dl("\uFEFF"+[header,...lines,...summary].join("\n"),"text/csv;charset=utf-8",`colvio_load_${result.entity||target}_${ts}.csv`);
                }} style={bt(null,{color:C.gn})}><I.Download/> Download Log</button>
                {result.errors.length>0&&<button onClick={()=>{const csv=["Row,Error,Payload",...result.errors.map(e=>`${e.row},"${(e.msg||"").replace(/"/g,'""')}","${(e.payload||"").replace(/"/g,'""')}"`)].join("\n");dl("\uFEFF"+csv,"text/csv;charset=utf-8","load_errors.csv");}} style={bt(null,{color:C.rd})}>Export errors CSV</button>}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
