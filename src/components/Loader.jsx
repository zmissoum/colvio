import { useState, useEffect, useRef } from "react";
import { bridge } from "../d365-bridge.js";
import * as XLSX from "xlsx";
import Tooltip from "./Tooltip.jsx";
import { C, I, Spin, ENTS, D365CF, mono, inp, bt, crd, ths, tds, dl, isTrulyCustom } from "../shared.jsx";

export default function Loader({bp,orgInfo,theme,permissions}){
  // Speed boosters require prvBypassCustomPlugins — granted by the System Administrator
  // role. Hidden entirely for non-admin users so they don't see a feature they can't use.
  // `permissions` may be null briefly during connect — boosters stay hidden until the
  // probe completes (safer than flashing them then hiding).
  const canShowSpeedBoosters = permissions?.canBypassPlugins === true;
  const[step,setStep]=useState(0);const[csvFile,setCsvFile]=useState(null);const[csvData,setCsvData]=useState({h:[],r:[]});const[target,setTarget]=useState("account");const[maps,setMaps]=useState([]);const[lookups,setLookups]=useState([]);const[uKey,setUKey]=useState({d:"",c:""});const[result,setResult]=useState(null);const[dragOn,setDragOn]=useState(false);const[pasteMode,setPasteMode]=useState(false);const[pasteText,setPasteText]=useState("");const fRef=useRef(null);
  // Searchable entity picker — replaces the old dropdown so users can find an entity by typing a few letters.
  const[entitySearch,setEntitySearch]=useState("");
  const[entityPickerOpen,setEntityPickerOpen]=useState(false);
  const entityPickerRef=useRef(null);

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
          const meta=findLookupMeta(h);
          if(meta){
            autoLookups.push({src:"",csv:h,entity:meta.targetEntity,nav:meta.navProperty,d365f:"",fb:"skip",mode:"direct"});
          }else{
            const entName=low.replace(/id$/,"").replace(/^_/,"").replace(/_value$/,"");
            const knownLookups={"parentaccountid":"account","parentcontactid":"contact","ownerid":"systemuser","owningbusinessunit":"businessunit","transactioncurrencyid":"transactioncurrency","primarycontactid":"contact"};
            const targetEnt=knownLookups[low]||entName;
            autoLookups.push({src:"",csv:h,entity:targetEnt,nav:low,d365f:"",fb:"skip",mode:"direct"});
          }
        }
      }
    });

    // Lookup-type field logical names (can only be set via @odata.bind, never direct).
    // We capture this here so parseData stays a single source of truth, even though the
    // retroactive useEffect will also catch fields that load asynchronously after parsing.
    const lookupTypeFields = new Set(
      targetFieldsMeta
        .filter(f => { const t = f.type || f.t; return t === "Lookup" || t === "Customer" || t === "Owner"; })
        .map(f => (f.logical || f.l || "").toLowerCase())
    );

    setMaps(headers.filter(h=>!h.includes(".")).map(h=>{
      const low=h.toLowerCase();
      if(SKIP_FIELDS.has(low)) return {csv:h,d365:"",transform:"",skip:true};
      if(low===primaryKey) return {csv:h,d365:"",transform:"",skip:true,isPK:true};
      if(lookupCols.has(h)) return {csv:h,d365:"",transform:"",skip:true,isLookup:true};
      if(lookupTypeFields.has(low)) return {csv:h,d365:"",transform:"",skip:true,isLookup:true};
      if(low==="statecode") return {csv:h,d365:"statecode",transform:"statecode"};
      if(low==="statuscode") return {csv:h,d365:"statuscode",transform:"int"};
      if(d365Set.has(low)) return {csv:h,d365:low,transform:""};
      if(d365Set.has(h)) return {csv:h,d365:h,transform:""};
      if(commonMapping[low]) return {csv:h,d365:commonMapping[low],transform:""};
      return {csv:h,d365:"",transform:""};
    }));

    const parents=new Set();const lks=[...autoLookups];
    headers.filter(h=>h.includes(".")).forEach(col=>{
      const p=col.split(".")[0];
      if(parents.has(p)) return;
      parents.add(p);
      const meta=findLookupMeta(col);
      if(meta){
        lks.push({src:p+"Id",csv:col,entity:meta.targetEntity,nav:meta.navProperty,d365f:"",fb:"skip",mode:"resolve"});
      }else{
        lks.push({src:p+"Id",csv:col,entity:p.toLowerCase(),nav:`parentcustomerid_${p.toLowerCase()}`,d365f:"",fb:"skip",mode:"resolve"});
      }
    });
    setLookups(lks);setStep(1);
  };

  const handleFile=(e)=>{e.preventDefault();setDragOn(false);const f=e.dataTransfer?.files?.[0]||e.target?.files?.[0];if(!f)return;setCsvFile(f);const reader=new FileReader();const isExcel=/\.(xlsx|xls)$/i.test(f.name);reader.onload=(ev)=>{if(isExcel){const wb=XLSX.read(ev.target.result,{type:"array"});const csv=XLSX.utils.sheet_to_csv(wb.Sheets[wb.SheetNames[0]]);parseData(csv);}else parseData(ev.target.result);};isExcel?reader.readAsArrayBuffer(f):reader.readAsText(f);};

  const handlePaste=()=>{if(pasteText.trim()){setCsvFile({name:"clipboard_data.csv"});parseData(pasteText,"auto");}};

  const isLive = orgInfo?.isExtension;
  const[loadProgress,setLoadProgress]=useState({done:0,total:0,current:""});
  const[startedAt,setStartedAt]=useState(null); // wall-clock time the import was launched (Date)
  // Live per-row log during import. Two-tier to avoid unbounded memory on huge imports:
  //  - liveLog.entries (state): bounded ring buffer of the most recent rows (newest first) for the DOM table.
  //  - fullLog (ref): lightweight record of EVERY processed row { csvRowNumber, status, msg } — no full csvRow copy,
  //    so 600k rows ≈ a few MB. Used by "Export current log" and to build the final result.log.
  //    The original column values are reconstructed from `rows` at export time via csvRowNumber.
  const LIVE_LOG_BUFFER=2000; // rows kept in React state for live display
  const[liveLog,setLiveLog]=useState({entries:[],counts:{CREATED:0,UPSERTED:0,ERROR:0}});
  const fullLog=useRef([]);
  const[cancelling,setCancelling]=useState(false);
  // Tunable performance knobs (à la Salesforce Inspector). Defaults match Inspector's UX.
  const[batchSize,setBatchSize]=useState(200);
  const[threads,setThreads]=useState(6);
  // MSCRM bypass headers — off by default. Require prvBypassCustomPlugins privilege (typically System Admin).
  // Trade speed for skipped server-side logic — use only when input data is already validated externally.
  const[bypassPlugins,setBypassPlugins]=useState(false);
  const[suppressDuplicates,setSuppressDuplicates]=useState(false);
  const[bypassSyncLogic,setBypassSyncLogic]=useState(false);
  const loadAbort=useRef(false);
  const[liveEntities,setLiveEntities]=useState([]);

  // Close the entity picker when clicking outside, pressing Escape, or losing focus.
  useEffect(()=>{
    if(!entityPickerOpen) return;
    const onClick=(e)=>{if(entityPickerRef.current&&!entityPickerRef.current.contains(e.target))setEntityPickerOpen(false);};
    const onKey=(e)=>{if(e.key==="Escape")setEntityPickerOpen(false);};
    document.addEventListener("mousedown",onClick);
    document.addEventListener("keydown",onKey);
    return()=>{document.removeEventListener("mousedown",onClick);document.removeEventListener("keydown",onKey);};
  },[entityPickerOpen]);

  useEffect(()=>{
    if(!isLive) return;
    bridge.getEntities().then(data=>{
      if(data&&Array.isArray(data)){
        setLiveEntities(data.map(e=>({l:e.logical,d:e.display,p:e.entitySet||e.logical+"s",i:(e.isCustom&&isTrulyCustom(e.logical,e.isManaged))?"⚙️":"📋"})).sort((a,b)=>a.d.localeCompare(b.d)));
      }
    }).catch(()=>{});
  },[isLive]);

  const entityList = liveEntities.length > 0 ? liveEntities : ENTS;
  const[targetFields,setTargetFields]=useState(D365CF);
  const[targetFieldsMeta,setTargetFieldsMeta]=useState([]); // full field objects with type info
  const[targetLookups,setTargetLookups]=useState([]);
  const[targetAltKeys,setTargetAltKeys]=useState([]); // alt-keys on the load target entity (single-attribute keys only)
  const[loadingFields,setLoadingFields]=useState(false);
  const fieldGen=useRef(0); // generation counter to discard stale field fetches

  useEffect(()=>{
    if(!isLive||!target){setTargetLookups([]);setTargetAltKeys([]);setTargetFieldsMeta([]);return;}
    const gen=++fieldGen.current;
    setLoadingFields(true);
    Promise.all([
      bridge.getFields(target).catch(()=>null),
      bridge.getLookups(target).catch(()=>null),
      bridge.getEntityKeys(target).catch(()=>null),
    ]).then(([fieldsData,lookupsData,keysData])=>{
      if(fieldGen.current!==gen)return; // stale: user switched entity
      if(fieldsData&&Array.isArray(fieldsData)){
        setTargetFields(fieldsData.map(f=>f.logical||f.l).sort());
        setTargetFieldsMeta(fieldsData);
      }
      setTargetLookups(Array.isArray(lookupsData)?lookupsData:[]);
      setTargetAltKeys(Array.isArray(keysData)?keysData.filter(k=>k.keyAttributes?.length===1).map(k=>k.keyAttributes[0]):[]);
    }).finally(()=>{if(fieldGen.current===gen)setLoadingFields(false);});
  },[isLive,target]);

  // Lookup-type field logical names — these can ONLY be set via @odata.bind, not direct mapping.
  // Auto-skipping them prevents Dataverse 400 errors when CSV columns happen to match lookup field names.
  const lookupFieldSet = (() => {
    const s = new Set();
    for (const f of targetFieldsMeta) {
      const t = f.type || f.t;
      if (t === "Lookup" || t === "Customer" || t === "Owner") {
        s.add((f.logical || f.l || "").toLowerCase());
      }
    }
    return s;
  })();

  // Retroactive: when metadata arrives after the CSV was parsed, demote any auto-mapped
  // entries that point to a lookup-type field. Their value belongs in the Parent Lookups
  // section via @odata.bind, not in the body.
  useEffect(() => {
    if (!lookupFieldSet.size) return;
    setMaps(prev => {
      let changed = false;
      const updated = prev.map(m => {
        if (m.skip) return m;
        const d365Low = (m.d365 || "").toLowerCase();
        if (d365Low && lookupFieldSet.has(d365Low)) {
          changed = true;
          return { ...m, d365: "", skip: true, isLookup: true };
        }
        return m;
      });
      return changed ? updated : prev;
    });
  }, [targetFieldsMeta]);

  // Find lookup metadata matching a CSV column. Handles dot-notation (e.g.
  // "fou_accountextension.fou_sapcustomernumber") and OData _logicalname_value
  // columns. Returns null if no match — caller falls back to heuristic.
  const findLookupMeta = (csvCol, meta=targetLookups) => {
    if (!csvCol || !meta.length) return null;
    const candidate = csvCol.includes(".")
      ? csvCol.split(".")[0].toLowerCase()
      : csvCol.toLowerCase().replace(/^_/,"").replace(/_value$/,"");
    return meta.find(m =>
      m.lookupField?.toLowerCase() === candidate ||
      m.navProperty?.toLowerCase() === candidate
    ) || null;
  };

  // Retroactive enrichment: when target lookup metadata arrives after a CSV
  // was already parsed (heuristic applied), upgrade lookups to use real
  // entity + nav property names from D365 metadata.
  useEffect(()=>{
    if(!targetLookups.length) return;
    setLookups(prev => prev.map(lk => {
      const meta = findLookupMeta(lk.csv, targetLookups);
      if (!meta) return lk;
      if (lk.entity === meta.targetEntity && lk.nav === meta.navProperty) return lk;
      return { ...lk, entity: meta.targetEntity, nav: meta.navProperty };
    }));
  },[targetLookups]);

  // Per-lookup-entity metadata cache: fields list + alt-keys.
  // Shape: { [entityLogicalName]: { fields: ["name", ...], altKeys: ["fou_sapcustomernumber", ...] } }
  const[lookupEntityMeta,setLookupEntityMeta]=useState({});

  useEffect(()=>{
    if(!isLive) return;
    const toFetch = [...new Set(lookups.map(lk=>lk.entity).filter(e=>e&&!lookupEntityMeta[e]))];
    if(!toFetch.length) return;
    Promise.all(toFetch.map(async (ent)=>{
      const [fields,keys] = await Promise.all([
        bridge.getFields(ent).catch(()=>[]),
        bridge.getEntityKeys(ent).catch(()=>[]),
      ]);
      return [ent, {
        fields: (fields||[]).map(f=>f.logical||f.l).sort(),
        altKeys: (keys||[]).filter(k=>k.keyAttributes?.length===1).map(k=>k.keyAttributes[0]),
      }];
    })).then(results=>{
      setLookupEntityMeta(prev=>{
        const updated={...prev};
        for(const[ent,meta] of results) updated[ent]=meta;
        return updated;
      });
    });
  },[isLive,lookups,lookupEntityMeta]);

  // Helper: is this lookup configured to use direct alt-key binding (skip resolve)?
  const isAltKeyBind = (lk) => {
    if (lk.mode !== "resolve" || !lk.d365f) return false;
    const meta = lookupEntityMeta[lk.entity];
    return !!(meta?.altKeys?.includes(lk.d365f));
  };

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
    loadAbort.current=false;setCancelling(false);
    setLiveLog({entries:[],counts:{CREATED:0,UPSERTED:0,ERROR:0}});
    fullLog.current=[];
    const launchedAt=new Date();setStartedAt(launchedAt);
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
      if(isAltKeyBind(lk)) continue; // alt-key path: bind directly via /entity(field='value'), skip pre-resolve
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
    // Parallel index maps: createRecords[k] / upsertItems[k] correspond to rows[createRowMap[k]] / rows[upsertRowMap[k]].
    // Used to look up the original CSV row when displaying the live log.
    const createRowMap=[];
    const upsertRowMap=[];

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
          } else if(isAltKeyBind(lk)){
            // Alt-key direct binding — Dataverse resolves server-side. Empty fb=skip/null already
            // short-circuited above; missing record on the server returns a per-row PATCH error.
            const escaped=String(val).replace(/'/g,"''");
            rec[`${lk.nav}@odata.bind`]=`/${lk.entity}s(${lk.d365f}='${escaped}')`;
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
          upsertRowMap.push(i);
        } else {
          createRecords.push(rec);
          createRowMap.push(i);
        }
      }catch(e){
        errors.push({row:i+1,msg:e.message?.substring(0,500)||"Error",payload:JSON.stringify(rec).substring(0,200)});
        logEntries.push({row:i+1,status:"ERROR",detail:e.message?.substring(0,200)||"Error",d365Id:""});
      }
    }


    if(createRecords.length>0){
      setLoadProgress({done:0,total:createRecords.length,current:`Sending ${createRecords.length} records (CREATE)...`});
      try{
        const res=await bridge.batchCreate(entitySet,createRecords,p=>{
          setLoadProgress({done:p.done,total:p.total,current:loadAbort.current?`Cancelling — ${p.done}/${p.total}...`:`Sending records (CREATE) ${p.done}/${p.total}...`});
          if(p.newLog?.length){
            // Enrich each log entry with the original CSV row data (lookup via parallel index map)
            const enriched=p.newLog.map(e=>{const csvIdx=createRowMap[(e.row||1)-1];return {...e,csvRow:csvIdx!=null?rows[csvIdx]:null,csvRowNumber:csvIdx!=null?csvIdx+2:0};});
            // Full log: lightweight (no csvRow copy) — every processed row, reconstructed from `rows` at export time.
            for(const e of enriched) fullLog.current.push({csvRowNumber:e.csvRowNumber,status:e.status,msg:e.msg});
            setLiveLog(prev=>{
              const newCounts={...prev.counts};
              for(const e of enriched) newCounts[e.status]=(newCounts[e.status]||0)+1;
              // Bounded ring buffer for the live DOM table (newest first); full history lives in fullLog ref.
              return {entries:[...enriched.slice().reverse(),...prev.entries].slice(0,LIVE_LOG_BUFFER),counts:newCounts};
            });
          }
        },()=>loadAbort.current,{chunk:batchSize,concurrency:threads,bypassPlugins:canShowSpeedBoosters&&bypassPlugins,suppressDuplicates:canShowSpeedBoosters&&suppressDuplicates,bypassSyncLogic:canShowSpeedBoosters&&bypassSyncLogic});
        created=res.created||0;
        if(res.errors){ res.errors.forEach(e=>{errors.push({...e,payload:""});}); }
        if(res.aborted){const remaining=createRecords.length-created;logEntries.push({row:0,status:"CANCELLED",detail:`Import cancelled — ${remaining} records not sent`,d365Id:""});}
      }catch(e){
        errors.push({row:0,msg:`Batch CREATE failed: ${e.message}`,payload:""});
      }
    }

    if(upsertItems.length>0 && !loadAbort.current){
      setLoadProgress({done:createRecords.length,total:total,current:`Sending ${upsertItems.length} records (UPSERT)...`});
      try{
        const isPK = uKey.d.toLowerCase() === target + "id";
        const res=await bridge.batchUpsert(entitySet,uKey.d,upsertItems,isPK,p=>{
          setLoadProgress({done:createRecords.length+p.done,total:total,current:loadAbort.current?`Cancelling — ${p.done}/${p.total}...`:`Sending records (UPSERT) ${p.done}/${p.total}...`});
          if(p.newLog?.length){
            const enriched=p.newLog.map(e=>{const csvIdx=upsertRowMap[(e.row||1)-1];return {...e,csvRow:csvIdx!=null?rows[csvIdx]:null,csvRowNumber:csvIdx!=null?csvIdx+2:0};});
            for(const e of enriched) fullLog.current.push({csvRowNumber:e.csvRowNumber,status:e.status,msg:e.msg});
            setLiveLog(prev=>{
              const newCounts={...prev.counts};
              for(const e of enriched) newCounts[e.status]=(newCounts[e.status]||0)+1;
              // Bounded ring buffer for the live DOM table (newest first); full history lives in fullLog ref.
              return {entries:[...enriched.slice().reverse(),...prev.entries].slice(0,LIVE_LOG_BUFFER),counts:newCounts};
            });
          }
        },()=>loadAbort.current,{chunk:batchSize,concurrency:threads,bypassPlugins:canShowSpeedBoosters&&bypassPlugins,suppressDuplicates:canShowSpeedBoosters&&suppressDuplicates,bypassSyncLogic:canShowSpeedBoosters&&bypassSyncLogic});
        updated=res.updated||0;
        if(res.errors){ res.errors.forEach(e=>{errors.push({...e,payload:""});}); }
        if(res.aborted){const remaining=upsertItems.length-updated;logEntries.push({row:0,status:"CANCELLED",detail:`Import cancelled — ${remaining} records not sent`,d365Id:""});}
      }catch(e){
        errors.push({row:0,msg:`Batch UPSERT failed: ${e.message}`,payload:""});
      }
    }

    const elapsed=((Date.now()-startTime)/1000).toFixed(1);
    const wasCancelled=loadAbort.current;
    // Final log = real per-row batch results (from fullLog ref) + prep-loop entries (skipped lookups, cancellations).
    // Capped to keep the result-panel table renderable; full data is available via "Export current log".
    const batchLog=fullLog.current.map(e=>({row:e.csvRowNumber,status:e.status,detail:e.status==="ERROR"?(e.msg||"Batch error"):"OK",d365Id:""}));
    const combinedLog=[...logEntries,...batchLog];
    const resultLog=combinedLog.length>5000?combinedLog.slice(0,5000):combinedLog;
    setResult({created,updated,errors,skipped,elapsed,log:resultLog,logTruncated:combinedLog.length>5000,logTotal:combinedLog.length,entity:target,totalRows:total,cancelled:wasCancelled,startedAt:launchedAt,finishedAt:new Date()});
    setLoadProgress({done:total,total,current:wasCancelled?"Cancelled":"Done"});
    setCancelling(false);
  };
  const steps=[{l:"Source",i:"📄"},{l:"Mapping",i:"🔗"},{l:"Lookups",i:"🔍"},{l:"Preview",i:"👁"},{l:"Run",i:"🚀"}];

  return(
    <div style={{padding:bp.mobile?12:20,maxWidth:1100,margin:"0 auto"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:0,marginBottom:bp.mobile?14:22,flexWrap:"wrap"}}>
        {steps.map((s,i)=>{
          const lookupsEmpty=i===2&&lookups.length===0&&csvData.h.length>0; // Lookups step with nothing to configure
          const clickable=i<=step&&!lookupsEmpty;
          return <div key={i} style={{display:"flex",alignItems:"center"}}><button onClick={()=>clickable&&setStep(i)} title={lookupsEmpty?"No parent lookups detected — step skipped":undefined} style={{display:"flex",alignItems:"center",gap:3,padding:bp.mobile?"4px 6px":"5px 10px",borderRadius:5,cursor:clickable?"pointer":"default",opacity:lookupsEmpty?0.45:1,background:i===step?C.sfa:"transparent",border:`1px solid ${i===step?C.vi:i<step?C.gnd:C.bd}`,fontSize:bp.mobile?10:11,color:i<=step?C.tx:C.txd,fontWeight:i===step?600:400}}><span style={{fontSize:bp.mobile?10:12}}>{i<step?"✅":s.i}</span>{(!bp.mobile||i===step)&&<span>{lookupsEmpty?`${s.l} (none)`:s.l}</span>}</button>{i<4&&<div style={{width:bp.mobile?6:14,height:1,background:i<step?C.gn:C.bd,margin:"0 2px"}}/>}</div>;
        })}
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
              <input ref={fRef} type="file" accept=".csv,.tsv,.txt,.xlsx,.xls" onChange={handleFile} style={{display:"none"}}/>
              <div style={{fontSize:36,marginBottom:10}}>📂</div>
              <h3 style={{color:C.tx,fontWeight:600,marginBottom:4,fontSize:15}}>Drop your file here</h3>
              <p style={{color:C.txm,fontSize:14}}>CSV, TSV, TXT, or Excel (XLSX/XLS)</p>
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
            <div style={{...crd({padding:12}),flex:1}}>
              <label style={{fontSize:12,color:C.txm,fontWeight:500,display:"block",marginBottom:4}}>Target D365 entity</label>
              {(()=>{
                const selectedEnt=entityList.find(e=>e.l===target);
                const filtered=(()=>{
                  const q=entitySearch.trim().toLowerCase();
                  if(!q) return entityList;
                  return entityList.filter(e=>(e.l||"").toLowerCase().includes(q)||(e.d||"").toLowerCase().includes(q));
                })();
                return (<div ref={entityPickerRef} style={{position:"relative"}}>
                  <input
                    value={entityPickerOpen?entitySearch:(selectedEnt?`${selectedEnt.i} ${selectedEnt.d} (${selectedEnt.l})`:target)}
                    onChange={e=>{setEntitySearch(e.target.value);if(!entityPickerOpen)setEntityPickerOpen(true);}}
                    onFocus={()=>{setEntityPickerOpen(true);setEntitySearch("");}}
                    placeholder="Type to search entities…"
                    style={inp({fontSize:14,...mono,paddingRight:30})}
                  />
                  <span style={{position:"absolute",right:10,top:"50%",transform:"translateY(-50%)",color:C.txd,fontSize:14,pointerEvents:"none"}}>{entityPickerOpen?"🔍":"▾"}</span>
                  {entityPickerOpen && (
                    <div style={{position:"absolute",top:"calc(100% + 4px)",left:0,right:0,maxHeight:280,overflow:"auto",background:C.sf,border:`1px solid ${C.bd}`,borderRadius:6,boxShadow:"0 8px 24px rgba(0,0,0,.3)",zIndex:50}}>
                      {filtered.length===0?(
                        <div style={{padding:"10px 12px",fontSize:12,color:C.txd,fontStyle:"italic"}}>No entity matches "{entitySearch}"</div>
                      ):filtered.slice(0,200).map(e=>(
                        <button
                          key={e.l}
                          onMouseDown={(ev)=>{ev.preventDefault();setTarget(e.l);setEntityPickerOpen(false);setEntitySearch("");}}
                          style={{display:"flex",alignItems:"center",gap:6,padding:"6px 10px",width:"100%",background:target===e.l?C.sfa:"transparent",border:"none",borderBottom:`1px solid ${C.bd}`,cursor:"pointer",color:C.tx,fontSize:13,textAlign:"left"}}
                        >
                          <span style={{fontSize:14}}>{e.i}</span>
                          <span style={{flex:1,fontWeight:target===e.l?600:400}}>{e.d}</span>
                          <span style={{...mono,fontSize:11,color:C.txd}}>{e.l}</span>
                        </button>
                      ))}
                      {filtered.length>200 && (
                        <div style={{padding:"6px 10px",fontSize:11,color:C.txd,textAlign:"center",fontStyle:"italic"}}>
                          {filtered.length-200} more matches — type more to narrow down
                        </div>
                      )}
                    </div>
                  )}
                </div>);
              })()}
            </div>
            <div style={{...crd({padding:12}),flex:1}}>
              <label style={{fontSize:12,color:C.txm,fontWeight:500,display:"block",marginBottom:4}}>Import mode</label>
              <div style={{display:"flex",gap:6,marginBottom:6}}>
                <label style={{fontSize:12,color:!uKey.d?C.gn:C.txd,cursor:"pointer",display:"flex",alignItems:"center",gap:3}}>
                  <input type="radio" checked={!uKey.d} onChange={()=>setUKey({d:"",c:""})} style={{accentColor:C.gn}}/> CREATE (new records)
                </label>
                <label style={{fontSize:12,color:uKey.d?C.cy:C.txd,cursor:"pointer",display:"flex",alignItems:"center",gap:3}}>
                  <input type="radio" checked={!!uKey.d} onChange={()=>{
                    // Prefer an alt-key over the PK as the default upsert key (PK only works if CSV has GUIDs)
                    const pk=target+"id";
                    const defaultKey=targetAltKeys[0]||pk;
                    const matchingCol=csvData.h.find(h=>h.toLowerCase()===defaultKey.toLowerCase());
                    setUKey({d:defaultKey,c:matchingCol||csvData.h[0]||""});
                  }} style={{accentColor:C.cy}}/> UPSERT (update or create)
                </label>
              </div>
              {uKey.d&&(()=>{
                const pk=target+"id";
                const isPK=uKey.d.toLowerCase()===pk;
                const isUsingAltKey=targetAltKeys.includes(uKey.d);
                // Warn if PK is selected but the CSV value doesn't look like a GUID — most likely a misconfig
                const sampleVal=uKey.c?csvData.r[0]?.[uKey.c]:"";
                const looksGuid=sampleVal&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sampleVal);
                const pkMisconfig=isPK&&sampleVal&&!looksGuid;
                return (<div>
                  <div style={{display:"flex",gap:6,alignItems:"center"}}>
                    {targetFields.length>0
                      ?<select value={uKey.d} onChange={e=>{const newKey=e.target.value;const matchingCol=csvData.h.find(h=>h.toLowerCase()===newKey.toLowerCase());setUKey({d:newKey,c:matchingCol||uKey.c});}} style={inp({flex:1,fontSize:13,...mono,color:isUsingAltKey?C.gn:isPK?C.cy:C.tx})}>
                        {targetAltKeys.length>0&&<optgroup label="🔑 Alternate keys (recommended for upsert)">
                          {targetAltKeys.map(f=><option key={f} value={f}>{f}</option>)}
                        </optgroup>}
                        <optgroup label="Primary key (only if CSV contains GUIDs)">
                          <option value={pk}>{pk}</option>
                        </optgroup>
                        <optgroup label="Other fields (must be unique to upsert reliably)">
                          {targetFields.filter(f=>!targetAltKeys.includes(f)&&f!==pk).map(f=><option key={f} value={f}>{f}</option>)}
                        </optgroup>
                      </select>
                      :<input value={uKey.d} onChange={e=>setUKey({...uKey,d:e.target.value})} placeholder="loading fields..." style={inp({flex:1,fontSize:13,...mono})}/>
                    }
                    <span style={{color:C.txd}}>←</span>
                    <select value={uKey.c} onChange={e=>setUKey({...uKey,c:e.target.value})} style={inp({flex:1,fontSize:13})}><option value="">—</option>{csvData.h.map(h=><option key={h}>{h}</option>)}</select>
                  </div>
                  {isUsingAltKey&&<div style={{fontSize:11,color:C.gn,marginTop:3,fontWeight:600}}>🔑 alt-key — direct upsert (no GUID resolve)</div>}
                  {pkMisconfig&&<div style={{fontSize:11,color:C.rd,marginTop:3,fontWeight:600}}>⚠ Primary key selected but CSV value &quot;{String(sampleVal).substring(0,30)}&quot; is not a GUID — pick an alt-key instead</div>}
                </div>);
              })()}
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
          <div style={{display:"flex",justifyContent:"flex-end",marginTop:12,gap:6}}><button onClick={()=>setStep(0)} style={bt()}>← Back</button><button onClick={()=>setStep(lookups.length>0?2:3)} style={bt(`linear-gradient(135deg,${C.vi},${C.vil})`)}>{lookups.length>0?"Lookups →":"Preview →"}</button></div>
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
                    {lk.mode==="resolve"&&(()=>{
                      const meta=lookupEntityMeta[lk.entity];
                      const fields=meta?.fields||[];
                      const altKeys=meta?.altKeys||[];
                      const isAK=isAltKeyBind(lk);
                      return (<div><label style={{fontSize:11,color:C.txm,fontWeight:500,display:"block",marginBottom:2}}>
                        D365 Column (lookup key)
                        {isAK&&<span style={{color:C.gn,marginLeft:6,fontWeight:600}}>🔑 alt-key — direct bind (no resolve)</span>}
                      </label>
                      {fields.length>0
                        ?<select value={lk.d365f} onChange={e=>{const u=[...lookups];u[i]={...lk,d365f:e.target.value};setLookups(u);}} style={inp({fontSize:13,...mono,color:isAK?C.gn:C.tx})}>
                          <option value="">— pick a field —</option>
                          {altKeys.length>0&&<optgroup label="🔑 Alternate keys (recommended — skips resolve query)">
                            {altKeys.map(f=><option key={f} value={f}>{f}</option>)}
                          </optgroup>}
                          <optgroup label={altKeys.length>0?"Other queryable fields":"Fields"}>
                            {fields.filter(f=>!altKeys.includes(f)).map(f=><option key={f} value={f}>{f}</option>)}
                          </optgroup>
                        </select>
                        :<input value={lk.d365f} onChange={e=>{const u=[...lookups];u[i]={...lk,d365f:e.target.value};setLookups(u);}} placeholder={lk.entity?"loading fields...":"set Target entity first"} style={inp({fontSize:13,...mono})}/>
                      }
                    </div>);})()}
                    <div><label style={{fontSize:11,color:C.txm,fontWeight:500,display:"block",marginBottom:2}}>Target entity</label>
                      <input value={lk.entity} onChange={e=>{const u=[...lookups];u[i]={...lk,entity:e.target.value};setLookups(u);}} placeholder="account" style={inp({fontSize:13,...mono})}/>
                    </div>
                    <div><label style={{fontSize:11,color:C.txm,fontWeight:500,display:"block",marginBottom:2}}>Nav. property</label>
                      {targetLookups.length>0
                        ?<select value={lk.nav} onChange={e=>{const u=[...lookups];const picked=targetLookups.find(m=>m.navProperty===e.target.value);u[i]={...lk,nav:e.target.value,...(picked?{entity:picked.targetEntity}:{})};setLookups(u);}} style={inp({fontSize:13,...mono})}>
                          <option value="">— pick a lookup field —</option>
                          {targetLookups.map(m=><option key={m.navProperty} value={m.navProperty}>{m.navProperty} → {m.targetEntity}</option>)}
                        </select>
                        :<input value={lk.nav} onChange={e=>{const u=[...lookups];u[i]={...lk,nav:e.target.value};setLookups(u);}} placeholder="parentcustomerid" style={inp({fontSize:13,...mono})}/>
                      }
                    </div>
                  </div>
                  <div style={{marginTop:6,display:"flex",alignItems:"center",gap:3,flexWrap:"wrap"}}>
                    <span style={{fontSize:11,color:C.txm}}>Fallback:</span>
                    {["skip","null","error"].map(fb=><label key={fb} style={{fontSize:12,color:lk.fb===fb?C.tx:C.txd,cursor:"pointer",display:"flex",alignItems:"center",gap:2,marginRight:6}}><input type="radio" name={`fb${i}`} checked={lk.fb===fb} onChange={()=>{const u=[...lookups];u[i]={...lk,fb};setLookups(u);}} style={{accentColor:C.vi}}/>{fb==="skip"?"Skip":fb==="null"?"Null":"Error"}</label>)}
                  </div>
                  <div style={{marginTop:6,padding:"4px 8px",background:C.sfh,borderRadius:3,fontSize:11,color:C.txd,...mono,overflowX:"auto",whiteSpace:"nowrap"}}>
                    {lk.mode==="direct"
                      ?<><span style={{color:C.cy}}>{lk.csv||"?"}</span> <span style={{color:C.gn}}>(Direct GUID)</span> → <span style={{color:C.yw}}>/{lk.entity||"?"}s(GUID)</span> → <span style={{color:C.yw}}>{lk.nav||"?"}@odata.bind</span></>
                      :isAltKeyBind(lk)
                      ?<><span style={{color:C.cy}}>{lk.csv||"?"}</span> → <span style={{color:C.gn}}>🔑</span> → <span style={{color:C.yw}}>/{lk.entity||"?"}s({lk.d365f||"?"}=&apos;value&apos;)</span> → <span style={{color:C.yw}}>{lk.nav||"?"}@odata.bind</span></>
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

          {/* Reassurance sentence — plain-language description of exactly what Load will do */}
          {(()=>{
            const entDisplay=entityList.find(e=>e.l===target)?.d||target;
            const n=csvData.r.length;
            const isUpsert=!!uKey.d;
            return (<div style={{...crd({padding:"10px 12px",background:C.cy+"0c",borderColor:C.cy+"44"}),marginBottom:12,fontSize:13,color:C.tx}}>
              {isUpsert
                ? <>Will <b style={{color:C.cy}}>UPSERT {n.toLocaleString()}</b> record{n>1?"s":""} into <b>{entDisplay}</b> — existing records matched on <code style={{...mono,fontSize:12,color:C.cy}}>{uKey.d}</code> are updated, the rest are created.</>
                : <>Will <b style={{color:C.gn}}>CREATE {n.toLocaleString()}</b> new record{n>1?"s":""} in <b>{entDisplay}</b>.</>}
              {canShowSpeedBoosters&&(bypassPlugins||suppressDuplicates||bypassSyncLogic)&&<span style={{color:C.or}}> · ⚠ server-side logic bypassed (boosters on)</span>}
            </div>);
          })()}

          {/* Pre-flight validation — non-blocking warnings, surfaced before Run instead of as mass errors */}
          {(()=>{
            const warnings=[];
            // Required D365 fields not mapped (exclude PK + system/auto-managed fields)
            const mappedSet=new Set(maps.filter(m=>m.d365&&!m.skip).map(m=>m.d365.toLowerCase()));
            const pk=(target+"id").toLowerCase();
            const autoManaged=new Set([pk,"ownerid","owningbusinessunit","owningteam","owninguser","statecode","statuscode","transactioncurrencyid","createdby","modifiedby","createdon","modifiedon"]);
            const reqMissing=targetFieldsMeta.filter(f=>{const ln=(f.logical||f.l||"").toLowerCase();return f.required&&!autoManaged.has(ln)&&!mappedSet.has(ln);}).map(f=>f.logical||f.l);
            if(reqMissing.length) warnings.push({k:"req",t:`${reqMissing.length} required field${reqMissing.length>1?"s":""} not mapped: ${reqMissing.slice(0,6).join(", ")}${reqMissing.length>6?` +${reqMissing.length-6} more`:""} — rows may fail unless D365 defaults them.`});
            // Lookups in resolve mode without a key field → every row's lookup silently skipped
            const badLookups=lookups.filter(lk=>lk.mode!=="direct"&&lk.csv&&lk.nav&&!lk.d365f&&!isAltKeyBind(lk));
            if(badLookups.length) warnings.push({k:"lk",t:`${badLookups.length} lookup${badLookups.length>1?"s":""} have no D365 key field set — those relationships won't resolve (rows skipped or unlinked).`});
            // Picklist/State/Status columns mapped without a transform chosen
            const picklistTypes=new Set(["Picklist","State","Status"]);
            const pickNoTransform=maps.filter(m=>{if(!m.d365||m.skip||m.transform)return false;const meta=targetFieldsMeta.find(f=>(f.logical||f.l)===m.d365);return meta&&picklistTypes.has(meta.type||meta.t);}).map(m=>m.d365);
            if(pickNoTransform.length) warnings.push({k:"pick",t:`${pickNoTransform.length} option-set field${pickNoTransform.length>1?"s":""} have no transform chosen: ${pickNoTransform.slice(0,5).join(", ")} — labels won't convert to option values.`});
            // UPSERT key set but no CSV column chosen
            if(uKey.d&&!uKey.c) warnings.push({k:"uk",t:`UPSERT key "${uKey.d}" has no CSV column selected — the import can't match existing records.`});
            if(!warnings.length) return null;
            return (<div style={{...crd({padding:"10px 12px",background:C.yw+"0c",borderColor:C.yw+"55"}),marginBottom:12}}>
              <div style={{fontSize:13,fontWeight:600,color:C.yw,marginBottom:6,display:"flex",alignItems:"center",gap:6}}>⚠ Pre-flight checks ({warnings.length}) — review before loading</div>
              <ul style={{margin:0,paddingLeft:18,display:"flex",flexDirection:"column",gap:4}}>
                {warnings.map(w=><li key={w.k} style={{fontSize:12,color:C.txm}}>{w.t}</li>)}
              </ul>
              <div style={{fontSize:11,color:C.txd,marginTop:6,fontStyle:"italic"}}>These are warnings, not blockers — you can still load if this is intentional.</div>
            </div>);
          })()}
          <div style={{...crd({padding:12}),marginBottom:12}}>
            <div style={{fontSize:14,fontWeight:600,marginBottom:6}}>D365 record example</div>
            <pre style={{...inp({...mono,color:C.cy,fontSize:12,padding:10,overflow:"auto",whiteSpace:"pre-wrap",wordBreak:"break-all"}),margin:0}}>
{JSON.stringify((() => {const row=csvData.r[0]||{};const rec={};maps.filter(m=>m.d365&&!m.skip).forEach(m=>{rec[m.d365]=row[m.csv]||"";});const isPK=uKey.d&&uKey.d.toLowerCase()===target+"id";if(uKey.d&&uKey.c&&!isPK)rec[uKey.d]=row[uKey.c]||"";lookups.forEach(lk=>{if(lk.nav&&lk.csv){const val=row[lk.csv];const ent=lk.entity||"?";if(lk.mode==="direct"&&val){rec[`${lk.nav}@odata.bind`]=`/${ent}s(${val})`;}else if(isAltKeyBind(lk)){const v=val?String(val).replace(/'/g,"''"):"value";rec[`${lk.nav}@odata.bind`]=`/${ent}s(${lk.d365f}='${v}')`;}else{rec[`${lk.nav}@odata.bind`]=`/${ent}s(<GUID>)`;}}});return rec;})(),null,2)}
            </pre>
          </div>
          <div style={{...crd({padding:12}),marginBottom:12}}>
            <div style={{fontSize:13,fontWeight:600,marginBottom:8,display:"flex",alignItems:"center",gap:6}}>
              <span>⚡ Performance</span>
              <span style={{fontSize:10,color:C.txd,fontWeight:400}}>(advanced — defaults work for most imports)</span>
            </div>
            <div style={{display:"flex",gap:14,alignItems:"center",flexWrap:"wrap"}}>
              <div style={{display:"flex",alignItems:"center",gap:6}}>
                <label style={{fontSize:12,color:C.txm,fontWeight:500}}>Batch size</label>
                <Tooltip text="Records per multipart $batch sent to Dataverse. Larger = fewer roundtrips & faster, but: longer cancel latency, higher memory per request, and a slow record blocks the whole batch. Sweet spot 100-300. Drop to 50 if you see HTTP 504 timeouts."/>
                <input type="number" min="1" max="1000" value={batchSize} onChange={e=>setBatchSize(Math.max(1,Math.min(1000,parseInt(e.target.value,10)||100)))} style={inp({width:80,fontSize:13,...mono,padding:"5px 8px"})}/>
                <span style={{fontSize:11,color:C.txd}}>records / HTTP $batch (1-1000)</span>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:6}}>
                <label style={{fontSize:12,color:C.txm,fontWeight:500}}>Threads</label>
                <Tooltip text="Number of concurrent $batch requests in flight. Linear speedup until Dataverse Service Protection throttles you (~10 concurrent calls per session). Drop to 3 if you see HTTP 429 errors in the live log."/>
                <input type="number" min="1" max="10" value={threads} onChange={e=>setThreads(Math.max(1,Math.min(10,parseInt(e.target.value,10)||5)))} style={inp({width:60,fontSize:13,...mono,padding:"5px 8px"})}/>
                <span style={{fontSize:11,color:C.txd}}>parallel batches (1-10)</span>
              </div>
              <div style={{fontSize:11,color:C.txd,fontStyle:"italic"}}>Theoretical throughput: ~{(batchSize*threads*3).toLocaleString()} rec/sec</div>
            </div>
          </div>

          {/* Speed boosters — server-side bypass via MSCRM headers. Hidden for non-admin users. */}
          {canShowSpeedBoosters && (
          <div style={{...crd({padding:12,borderColor:(bypassPlugins||suppressDuplicates||bypassSyncLogic)?C.or+"55":C.bd}),marginBottom:12}}>
            <div style={{fontSize:13,fontWeight:600,marginBottom:8,display:"flex",alignItems:"center",gap:6}}>
              <span>🚀 Speed boosters</span>
              <span style={{fontSize:10,color:C.txd,fontWeight:400}}>(advanced — bypass server-side processes per record)</span>
            </div>
            {(bypassPlugins||suppressDuplicates||bypassSyncLogic) && (
              <div style={{fontSize:11,color:C.or,marginBottom:8,padding:"6px 8px",background:C.or+"11",borderRadius:4,border:`1px solid ${C.or}33`}}>
                ⚠ One or more boosters enabled — server-side business logic will be skipped. Requires <code style={{...mono,fontSize:11}}>prvBypassCustomPlugins</code> privilege (typically System Administrator). Records with invalid data may bypass validation. Use only when input data is already validated externally.
              </div>
            )}
            <div style={{display:"flex",flexDirection:"column",gap:6}}>
              <label style={{display:"flex",alignItems:"center",gap:8,fontSize:12,color:C.tx,cursor:"pointer"}}>
                <input type="checkbox" checked={bypassPlugins} onChange={e=>setBypassPlugins(e.target.checked)} style={{accentColor:C.or}}/>
                <span style={{fontWeight:600}}>Bypass custom plugins</span>
                <Tooltip text="Sets MSCRM.BypassCustomPluginExecution: true on each request. Skips ALL custom plugins (sync + async) for the duration of the import. Typical gain: 100-500ms per record on orgs with active plugins. Warning: skips business logic that may include validation, defaulting, calculated fields, audit overrides."/>
                <code style={{...mono,fontSize:11,color:C.txd}}>MSCRM.BypassCustomPluginExecution</code>
              </label>
              <label style={{display:"flex",alignItems:"center",gap:8,fontSize:12,color:C.tx,cursor:"pointer"}}>
                <input type="checkbox" checked={suppressDuplicates} onChange={e=>setSuppressDuplicates(e.target.checked)} style={{accentColor:C.or}}/>
                <span style={{fontWeight:600}}>Suppress duplicate detection</span>
                <Tooltip text="Sets MSCRM.SuppressDuplicateDetection: true on each request. Skips duplicate detection rules for the entity. Typical gain: 50-200ms per record if rules are active. Warning: may create true duplicates if your CSV has them."/>
                <code style={{...mono,fontSize:11,color:C.txd}}>MSCRM.SuppressDuplicateDetection</code>
              </label>
              <label style={{display:"flex",alignItems:"center",gap:8,fontSize:12,color:C.tx,cursor:"pointer"}}>
                <input type="checkbox" checked={bypassSyncLogic} onChange={e=>setBypassSyncLogic(e.target.checked)} style={{accentColor:C.or}}/>
                <span style={{fontWeight:600}}>Bypass synchronous workflows</span>
                <Tooltip text="Sets MSCRM.BypassSynchronousLogic: true on each request. Broader than BypassCustomPluginExecution — also skips synchronous workflows. Use this when your org has heavy sync workflow chains."/>
                <code style={{...mono,fontSize:11,color:C.txd}}>MSCRM.BypassSynchronousLogic</code>
              </label>
            </div>
          </div>
          )}

          <div style={{display:"flex",justifyContent:"flex-end",gap:6,flexWrap:"wrap"}}><button onClick={()=>setStep(lookups.length>0?2:1)} style={bt()}>← Back</button><button onClick={()=>{const cfg={d365_entity:target,upsert_key:uKey.d,fields:Object.fromEntries(maps.filter(m=>m.d365).map(m=>[m.csv,m.d365])),lookups:lookups.map(lk=>({source_field:lk.src,d365_target_entity:lk.entity,d365_navigation_property:lk.nav,resolve_by:{csv_column:lk.csv,d365_field:lk.d365f},fallback:lk.fb}))};dl(JSON.stringify(cfg,null,2),"application/json",`load_${target}.json`);}} style={bt()}><I.Download/> YAML</button><button onClick={doLoad} style={bt(`linear-gradient(135deg,${C.gn},${C.cyd})`)}><I.Zap/> Load</button></div>
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
                    <div style={{width:`${loadProgress.total?Math.round(loadProgress.done/loadProgress.total*100):0}%`,height:"100%",background:`linear-gradient(90deg,${cancelling?C.rd:C.vi},${cancelling?C.or:C.cy})`,borderRadius:3,transition:"width .3s"}}/>
                  </div>
                  <div style={{fontSize:12,color:C.txd,marginTop:3,display:"flex",gap:12,flexWrap:"wrap"}}>
                    {startedAt&&<span>🕐 Started {startedAt.toLocaleString()}</span>}
                    <span>{loadProgress.done.toLocaleString()} / {loadProgress.total.toLocaleString()} records</span>
                    {liveLog.counts.CREATED>0&&<span style={{color:C.gn,fontWeight:600}}>● {liveLog.counts.CREATED.toLocaleString()} created</span>}
                    {liveLog.counts.UPSERTED>0&&<span style={{color:C.cy,fontWeight:600}}>● {liveLog.counts.UPSERTED.toLocaleString()} upserted</span>}
                    {liveLog.counts.ERROR>0&&<span style={{color:C.rd,fontWeight:600}}>● {liveLog.counts.ERROR.toLocaleString()} errors</span>}
                  </div>
                </div>
                <button
                  onClick={()=>{loadAbort.current=true;setCancelling(true);}}
                  disabled={cancelling}
                  style={{padding:"6px 14px",background:cancelling?C.bd:"transparent",border:`1px solid ${cancelling?C.bd:C.rd}`,borderRadius:5,color:cancelling?C.txd:C.rd,fontSize:13,fontWeight:600,cursor:cancelling?"default":"pointer"}}
                >
                  {cancelling?"Cancelling...":"✕ Cancel"}
                </button>
              </div>
              {cancelling&&<div style={{fontSize:11,color:C.txd,fontStyle:"italic",marginBottom:10}}>Waiting for in-flight batches (up to {(batchSize*threads).toLocaleString()} records) to complete before stopping. Records already sent will be kept.</div>}
              {liveLog.entries.length>0&&(()=>{
                // The DOM shows the bounded live buffer (newest first). The FULL log lives in fullLog.current
                // (lightweight) and is what "Export current log" writes — reconstructing columns from csvData.r.
                const totalProcessed=liveLog.counts.CREATED+liveLog.counts.UPSERTED+liveLog.counts.ERROR;
                const visibleEntries=liveLog.entries;
                const exportLiveLog=()=>{
                  const ts=new Date().toISOString().replace(/[:.]/g,"-").substring(0,19);
                  const esc=(v)=>{const s=String(v??"");return s.includes(",")||s.includes('"')||s.includes("\n")?`"${s.replace(/"/g,'""')}"`:s;};
                  const header=["CSV row","Status",...csvData.h,"Error detail"].map(esc).join(",");
                  // fullLog is in processing order; reconstruct columns from the original parsed rows (csvData.r)
                  const lines=fullLog.current.map(e=>{const orig=e.csvRowNumber>=2?csvData.r[e.csvRowNumber-2]:null;return [e.csvRowNumber||0,e.status,...csvData.h.map(h=>esc(orig?.[h]??"")),esc(e.status==="ERROR"?(e.msg||""):"")].join(",");});
                  dl("﻿"+[header,...lines].join("\n"),"text/csv;charset=utf-8",`live_log_${target}_${ts}.csv`);
                };
                return (<div style={{...crd({padding:0,overflow:"hidden"}),marginTop:8}}>
                  <div style={{padding:"6px 10px",borderBottom:`1px solid ${C.bd}`,display:"flex",alignItems:"center",justifyContent:"space-between",fontSize:12,fontWeight:600,flexWrap:"wrap",gap:6}}>
                    <span>
                      Live import log — showing latest {visibleEntries.length.toLocaleString()} of {totalProcessed.toLocaleString()} processed
                    </span>
                    <span style={{display:"flex",alignItems:"center",gap:10}}>
                      <span style={{fontSize:11,color:C.txd,fontWeight:400}}>(newest first · export for full log)</span>
                      <button onClick={exportLiveLog} style={{padding:"3px 9px",fontSize:11,background:"transparent",color:C.cy,border:`1px solid ${C.cy}55`,borderRadius:3,cursor:"pointer",fontWeight:600}} title="Download ALL processed rows so far as CSV">
                        <I.Download/> Export current log
                      </button>
                    </span>
                  </div>
                  <div style={{maxHeight:320,overflow:"auto"}}>
                    <table style={{borderCollapse:"collapse",fontSize:12,tableLayout:"auto"}}>
                      <thead><tr style={{background:C.bg,position:"sticky",top:0,zIndex:1}}>
                        <th style={ths()}>Line</th>
                        {csvData.h.map(h=><th key={h} style={ths()}>{h}</th>)}
                        <th style={{...ths(),textAlign:"center"}}>Status</th>
                        <th style={ths()}>Error detail</th>
                      </tr></thead>
                      <tbody>{visibleEntries.map((e,i)=>{
                        const isError=e.status==="ERROR";
                        const okColor=e.status==="CREATED"?C.gn:e.status==="UPSERTED"?C.cy:C.gn;
                        const sc=isError?C.rd:okColor;
                        const label=isError?"Failed":"Success";
                        return (
                          <tr key={`${e.row}-${i}`} style={{borderBottom:`1px solid ${C.bd}`,background:isError?C.rd+"08":"transparent"}}>
                            <td style={{...tds,fontWeight:600,...mono,color:C.txm}}>{(e.csvRowNumber||0).toLocaleString()}</td>
                            {csvData.h.map(h=>{
                              const val=e.csvRow?.[h]??"";
                              return <td key={h} style={{...tds,color:C.txd,fontSize:11,...mono}} title={String(val)}>{String(val)}</td>;
                            })}
                            <td style={{...tds,textAlign:"center"}}><span style={{fontSize:10,padding:"2px 8px",borderRadius:3,background:sc+"22",color:sc,fontWeight:700}}>{label}</span></td>
                            <td style={{...tds,color:C.rd,fontSize:11,...mono,whiteSpace:"normal",wordBreak:"break-word"}}>{isError?(e.msg||"").substring(0,300):""}</td>
                          </tr>
                        );
                      })}</tbody>
                    </table>
                  </div>
                </div>);
              })()}
            </div>
          ):(
            <div>
              <div style={{textAlign:"center",marginBottom:16}}>
                <div style={{fontSize:38,marginBottom:8}}>{result.cancelled?"⏹":result.errors.length===0?"✅":"⚠️"}</div>
                <h2 style={{color:C.tx,fontWeight:700,fontSize:18,marginBottom:4}}>{result.cancelled?`Cancelled after ${result.elapsed}s`:`Done in ${result.elapsed}s`}</h2>
                {result.cancelled&&<div style={{fontSize:13,color:C.txm,marginTop:4}}>{(result.created+result.updated)} records sent · {result.totalRows-(result.created+result.updated)} not processed</div>}
                {result.startedAt&&<div style={{fontSize:12,color:C.txd,marginTop:6,display:"flex",gap:14,justifyContent:"center",flexWrap:"wrap"}}>
                  <span>🕐 Started {result.startedAt.toLocaleString()}</span>
                  {result.finishedAt&&<span>🏁 Finished {result.finishedAt.toLocaleString()}</span>}
                </div>}
              </div>
              <div style={{display:"grid",gridTemplateColumns:bp.mobile?"1fr 1fr":"1fr 1fr 1fr 1fr",gap:8,maxWidth:500,margin:"0 auto 14px"}}>
                {[{l:"Created",v:result.created,c:C.gn},{l:"Updated",v:result.updated,c:C.cy},{l:"Skipped",v:result.skipped,c:C.yw},{l:"Errors",v:result.errors.length,c:C.rd}].map((m,i)=><div key={i} style={{...crd({padding:"8px 10px",textAlign:"center"})}}><div style={{fontSize:20,fontWeight:700,color:m.c}}>{m.v}</div><div style={{fontSize:11,color:C.txd}}>{m.l}</div></div>)}
              </div>

              {result.log&&result.log.length>0&&(
                <div style={{...crd({padding:12}),marginTop:12}}>
                  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
                    <span style={{fontSize:14,fontWeight:600}}>Import Log {result.logTruncated?`(showing ${result.log.length.toLocaleString()} of ${(result.logTotal||0).toLocaleString()} — use Download Log for all)`:`(${result.log.length.toLocaleString()} rows)`}</span>
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
                  const esc=(v)=>{const s=String(v??"");return s.includes(",")||s.includes('"')||s.includes("\n")?`"${s.replace(/"/g,'""')}"`:s;};
                  // Export the COMPLETE log from fullLog ref (every processed row + columns), not the
                  // capped result.log. Reconstruct original columns from csvData.r via csvRowNumber.
                  const full=fullLog.current||[];
                  let lines, header;
                  if(full.length){
                    header=["CSV row","Status",...csvData.h,"Detail"].map(esc).join(",");
                    lines=full.map(e=>{const orig=e.csvRowNumber>=2?csvData.r[e.csvRowNumber-2]:null;return [e.csvRowNumber||0,e.status,...csvData.h.map(h=>esc(orig?.[h]??"")),esc(e.status==="ERROR"?(e.msg||""):"OK")].join(",");});
                  }else{
                    header="Row,Status,Detail";
                    lines=(result.log||[]).map(e=>[e.row,e.status,esc(e.detail)].join(","));
                  }
                  const summary=[
                    "",
                    `# Summary`,
                    `# Entity: ${result.entity||target}`,
                    `# Started: ${result.startedAt?result.startedAt.toLocaleString():"—"}`,
                    `# Finished: ${result.finishedAt?result.finishedAt.toLocaleString():"—"}`,
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
