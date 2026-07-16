import { useState, useEffect, useRef, useMemo, Fragment } from "react";
import { bridge } from "../d365-bridge.js";
import Tooltip from "./Tooltip.jsx";
import { parseDelimited, detectSep, applyTransform, resolveEntitySet, deltaEqual, defaultMatchKey, migrationOverridePair, isTransientError, isNullToken, stripHtml } from "../loaderUtils.js";
import { C, I, Spin, ENTS, D365CF, mono, inp, bt, crd, ths, tds, dl, expName, isTrulyCustom, TableTypeBadge } from "../shared.jsx";

// System / audit fields the loader never writes by default (platform-managed or write-protected).
// Migration mode re-enables a small allowlist so a data migration can preserve original audit values.
const SYS_FIELDS=["createdon","modifiedon","createdby","modifiedby","owningbusinessunit","owningteam","owninguser","versionnumber","importsequencenumber","overriddencreatedon","timezoneruleversionnumber","utcconversiontimezonecode"];
const MIGRATION_FIELDS=["createdon","overriddencreatedon","modifiedon","createdby","modifiedby"];

export default function Loader({bp,orgInfo,theme,permissions,onBusyChange}){
  // Speed boosters require prvBypassCustomPlugins — granted by the System Administrator
  // role. Hidden entirely for non-admin users so they don't see a feature they can't use.
  // `permissions` may be null briefly during connect — boosters stay hidden until the
  // probe completes (safer than flashing them then hiding).
  const canShowSpeedBoosters = permissions?.canBypassPlugins === true;
  const[step,setStep]=useState(0);const[csvFile,setCsvFile]=useState(null);const[csvData,setCsvData]=useState({h:[],r:[]});const[target,setTarget]=useState("account");const[maps,setMaps]=useState([]);const[lookups,setLookups]=useState([]);const[uKey,setUKey]=useState({d:"",c:""});const[updateOnly,setUpdateOnly]=useState(false);const[verifyExists,setVerifyExists]=useState(false);const[deltaMode,setDeltaMode]=useState(false);const[deleteMode,setDeleteMode]=useState(false);const[deleteConfirm,setDeleteConfirm]=useState("");const[result,setResult]=useState(null);const[dragOn,setDragOn]=useState(false);const[pasteMode,setPasteMode]=useState(false);const[pasteText,setPasteText]=useState("");const fRef=useRef(null);
  // Searchable entity picker — replaces the old dropdown so users can find an entity by typing a few letters.
  const[entitySearch,setEntitySearch]=useState("");
  const[entityPickerOpen,setEntityPickerOpen]=useState(false);
  const entityPickerRef=useRef(null);
  const[lkEntOpen,setLkEntOpen]=useState(null); // index of the lookup row whose Target-entity autocomplete is open

  // ── Migration mode (opt-in) — preserve original created-on/by audit fields on CREATE ──────────
  const[migrationMode,setMigrationMode]=useState(false);
  const[dateMD,setDateMD]=useState(false); // false = EU day/month (default), true = US month/day — applies to the date_iso transform
  const[parseInfo,setParseInfo]=useState(null); // CSV-only parse diagnostics: {rawLines, maxNl, maxNlRow} — explains "200k lines → 14k records"
  // Override of created-on/by only works at create time. Pure create = no upsert key, not delete.
  const isPureCreate=!deleteMode&&!uKey.d;
  const migrationActive=migrationMode&&isPureCreate;
  // A field is a stripped system/audit field UNLESS migration mode is active and it's allowlisted.
  const isSystemField=(logical)=>{const ln=String(logical||"").toLowerCase();if(migrationActive&&MIGRATION_FIELDS.includes(ln))return false;return SYS_FIELDS.includes(ln);};
  // createdby/modifiedby are systemuser lookups → @odata.bind; createdon → overriddencreatedon (the
  // only writable created-date field); modifiedon is written directly.
  const emitMigrationField=(rec,logical,val)=>{const p=migrationOverridePair(logical,val);rec[p.key]=p.value;};
  // Turning migration mode ON auto-maps any still-unmapped CSV column whose header matches an
  // override field, so the user doesn't have to retype it.
  useEffect(()=>{if(!migrationMode)return;setMaps(prev=>prev.map(m=>{if(m.d365||m.skip)return m;const lc=String(m.csv||"").toLowerCase();return MIGRATION_FIELDS.includes(lc)?{...m,d365:lc}:m;}));},[migrationMode]);

  const parseData=(text)=>{
    const sep=detectSep(text);
    const aoa=parseDelimited(text,sep);
    // Parse diagnostics: a big gap between file LINES and parsed RECORDS is either legit quoted
    // line breaks inside cells (multiline / HTML content) or an UNCLOSED QUOTE that swallowed the
    // rest of the file into one giant field. Detect both so "my 200k-line file imported 14k rows"
    // is answered on screen instead of looking like a silent truncation.
    const rawLines=(text.match(/\n/g)||[]).length+1;
    let maxNl=0,maxNlRow=0;
    aoa.forEach((arr,i)=>arr.forEach(f=>{const n=(String(f??"").match(/\n/g)||[]).length;if(n>maxNl){maxNl=n;maxNlRow=i;}}));
    // A file that parses to <2 rows (header only, or ONE giant row when an unclosed quote in the
    // header swallowed everything) is silently ignored by ingestAoa — flag it so the user isn't
    // left staring at the previous file's data under the new file's name.
    if(!ingestAoa(aoa)){setParseInfo({rawLines,maxNl,maxNlRow,badParse:true,parsedRecords:Math.max(0,aoa.length-1)});return;}
    setParseInfo({rawLines,maxNl,maxNlRow});
  };

  // Build the working dataset + auto-mapping from a parsed array-of-arrays (CSV text or an XLSX sheet).
  // Returns false when there's nothing to ingest (<2 rows) — callers surface that instead of silence.
  const ingestAoa=(aoa)=>{
    if(!aoa||aoa.length<2)return false;
    const headers=(aoa[0]||[]).map(h=>String(h==null?"":h).trim().replace(/^\uFEFF/,""));
    // .trim() every value: stray spaces around delimiters ("a, b") would otherwise leak into
    // upsert keys (' A001' → no match → duplicate created), lookup GUIDs and field values; a
    // whitespace-only cell must read as empty (skipped), not overwrite a field with " ".
    const rows=aoa.slice(1).filter(arr=>arr.some(v=>String(v??"").trim()!=="")).map(arr=>{const obj={};headers.forEach((h,i)=>{const v=arr[i];obj[h]=v==null?"":String(v).trim();});return obj;});
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

    // Dot in a header (e.g. "primarycontactid.emailaddress1") means "resolve this lookup by an
    // alternate key". But a plain data column can legitimately contain a dot (e.g. "Q1.Revenue")
    // and must NOT be hijacked into a bogus lookup against a non-existent entity. When target
    // metadata is loaded we treat a dotted header as a lookup ONLY if its prefix matches a real
    // lookup field/nav; otherwise it's a normal, mappable column. Before metadata arrives we can't
    // tell, so we keep the heuristic (the retroactive effect enriches genuine ones once it loads).
    const metaKnown=targetLookups.length>0;
    const dotHeaders=headers.filter(h=>h.includes("."));
    const dotLookupCols=new Set(dotHeaders.filter(col=>!metaKnown||findLookupMeta(col)));

    setMaps(headers.filter(h=>!dotLookupCols.has(h)).map(h=>{
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
    dotHeaders.filter(col=>dotLookupCols.has(col)).forEach(col=>{
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
    setLookups(lks);setTemplateNote("");setShowTemplates(false);setDeleteConfirm("");setStep(1);
    return true;
  };

  const handleFile=(e)=>{
    e.preventDefault();setDragOn(false);
    const f=e.dataTransfer?.files?.[0]||e.target?.files?.[0];if(!f)return;
    setCsvFile(f);
    const reader=new FileReader();
    const isExcel=/\.(xlsx|xls)$/i.test(f.name);
    reader.onload=async(ev)=>{
      if(isExcel){
        // Lazy-load the heavy xlsx lib only when an Excel file is actually dropped.
        // Read the sheet straight to rows (header:1) — no CSV round-trip, so quoted/comma cells
        // can't be mangled. raw:false keeps the cell's displayed text (preserves formatting).
        try{
          const m=await import("xlsx"); const XLSX=m.read?m:(m.default||m);
          const wb=XLSX.read(ev.target.result,{type:"array"});
          const ws=wb.Sheets[wb.SheetNames[0]];
          const aoa=XLSX.utils.sheet_to_json(ws,{header:1,defval:"",blankrows:false,raw:false});
          if(!ingestAoa(aoa)){setParseInfo({rawLines:0,maxNl:0,maxNlRow:0,badParse:true,parsedRecords:Math.max(0,(aoa?.length||0)-1)});return;}
          setParseInfo(null); // line-count diagnostics are CSV-only (no "lines" in a sheet)
        }catch(err){ setCsvData({h:[],r:[]}); setCsvFile(null); }
      } else parseData(ev.target.result);
    };
    isExcel?reader.readAsArrayBuffer(f):reader.readAsText(f);
  };

  const handlePaste=()=>{if(pasteText.trim()){setCsvFile({name:"clipboard_data.csv"});parseData(pasteText);}};

  const isLive = orgInfo?.isExtension;
  const[loadProgress,setLoadProgress]=useState({done:0,total:0,current:""});
  const[startedAt,setStartedAt]=useState(null); // wall-clock time the import was launched (Date)
  const[expandedLog,setExpandedLog]=useState(null); // csvRowNumber of the live-log row expanded to show its request
  // Mapping templates — save/restore a column mapping + lookup config per entity (chrome.storage.local).
  const[templates,setTemplates]=useState([]);
  const[showTemplates,setShowTemplates]=useState(false);
  const[saveTplName,setSaveTplName]=useState("");
  const[templateNote,setTemplateNote]=useState(""); // transient note after applying a template (orphan fields/cols)
  // Live per-row log during import. Two-tier to avoid unbounded memory on huge imports:
  //  - liveLog.entries (state): bounded ring buffer of the most recent rows (newest first) for the DOM table.
  //  - fullLog (ref): lightweight record of EVERY processed row { csvRowNumber, status, msg } — no full csvRow copy,
  //    so 600k rows ≈ a few MB. Used by "Export current log" and to build the final result.log.
  //    The original column values are reconstructed from `rows` at export time via csvRowNumber.
  const LIVE_LOG_BUFFER=2000; // rows kept in React state for live display
  const[liveLog,setLiveLog]=useState({entries:[],counts:{CREATED:0,UPSERTED:0,ERROR:0}});
  const fullLog=useRef([]);
  // Prep-loop log entries (skipped lookups, prep errors, cancellations) of the last full run — kept so
  // a retry pass (which only re-runs batch rows) can still show them in the result.
  const prepLogRef=useRef([]);
  // GUIDs of records created by the last real run (from OData-EntityId) — enables Rollback.
  const createdIdsRef=useRef([]);
  const createdMissingIdRef=useRef(0); // CREATED rows whose GUID wasn't captured → not rollback-able
  // Rollback run state: null | {running, done, total, deleted, errors}
  const[rollback,setRollback]=useState(null);
  // Set when a run dies with an uncaught error (outside the batch try/catch) — shows the exact
  // message on screen instead of a silent stop. null | {message, stack, when}
  const[loadError,setLoadError]=useState(null);
  const[rollbackConfirm,setRollbackConfirm]=useState("");
  // Option-set label→value maps from the last run — buildRequestForRow needs them so the per-row
  // request details and the log export reconstruct the SAME body doLoad actually sent.
  const optionMapsRef=useRef({});
  const[cancelling,setCancelling]=useState(false);
  // Tunable performance knobs (à la Salesforce Inspector). Defaults match Inspector's UX.
  const[batchSize,setBatchSize]=useState(200);
  const[threads,setThreads]=useState(6);
  // MSCRM bypass headers — off by default. Require prvBypassCustomPlugins privilege (typically System Admin).
  // Trade speed for skipped server-side logic — use only when input data is already validated externally.
  const[bypassPlugins,setBypassPlugins]=useState(false);
  const[suppressDuplicates,setSuppressDuplicates]=useState(false);
  const[bypassAsyncLogic,setBypassAsyncLogic]=useState(false);
  const loadAbort=useRef(false);
  const runningRef=useRef(false);   // true while a real/dry run is executing (step 4, no result yet)
  const[liveEntities,setLiveEntities]=useState([]);

  // ── Mapping templates ────────────────────────────────────────────────
  useEffect(()=>{
    if(typeof chrome==="undefined"||!chrome.storage?.local) return;
    chrome.storage.local.get(["colvio_loader_templates"],(r)=>{
      if(Array.isArray(r?.colvio_loader_templates)) setTemplates(r.colvio_loader_templates.filter(t=>t&&typeof t==="object"));
    });
  },[]);

  const persistTemplates=(arr)=>{ try{chrome.storage?.local?.set({colvio_loader_templates:arr});}catch{} };

  const saveTemplate=(name)=>{
    const clean=(name||"").trim(); if(!clean) return;
    const tpl={id:Date.now(),name:clean,entity:target,maps,lookups,uKey,updateOnly,batchSize,threads,savedAt:new Date().toISOString()};
    setTemplates(prev=>{const updated=[tpl,...prev.filter(t=>!(t.name===clean&&t.entity===target))].slice(0,50);persistTemplates(updated);return updated;});
    setSaveTplName("");
  };

  const deleteTemplate=(id)=>{
    setTemplates(prev=>{const updated=prev.filter(t=>t.id!==id);persistTemplates(updated);return updated;});
  };

  // Apply a template against the CURRENT CSV. Same entity only (no metadata reload → no race).
  // Maps are matched by CSV column name; columns/fields that no longer exist are reported, not applied.
  const applyTemplate=(tpl)=>{
    const headerSet=new Set(csvData.h);
    const validFieldSet=new Set(targetFields.map(f=>String(f).toLowerCase()));
    const tmplByCsv=new Map((tpl.maps||[]).map(m=>[m.csv,m]));
    // Rebuild maps from the current headers, overlaying the template where the column matches.
    let appliedCols=0; const droppedFields=[];
    setMaps(prev=>prev.map(m=>{
      const t=tmplByCsv.get(m.csv);
      if(!t) return m;
      // If the template's target field no longer exists on the entity, skip the d365 part but keep the column.
      if(t.d365 && validFieldSet.size>0 && !validFieldSet.has(t.d365.toLowerCase())){ droppedFields.push(t.d365); return {...m,d365:"",transform:t.transform||""}; }
      appliedCols++;
      return {...m,d365:t.d365||"",transform:t.transform||"",skip:!!t.skip,isPK:!!t.isPK,isLookup:!!t.isLookup};
    }));
    // Lookups: keep only those whose source CSV column still exists.
    const tplLookups=(tpl.lookups||[]).filter(lk=>!lk.csv||headerSet.has(lk.csv));
    setLookups(tplLookups);
    // Upsert key: restore D365 side; CSV side only if the column still exists.
    if(tpl.uKey) setUKey({d:tpl.uKey.d||"",c:headerSet.has(tpl.uKey.c)?tpl.uKey.c:""});
    setUpdateOnly(!!tpl.updateOnly);
    if(tpl.batchSize) setBatchSize(Math.max(1,Math.min(1000,tpl.batchSize)));
    if(tpl.threads) setThreads(Math.max(1,Math.min(10,tpl.threads)));
    // Report mismatches so the user knows the template wasn't a perfect fit.
    const missingCols=(tpl.maps||[]).filter(m=>m.d365&&!headerSet.has(m.csv)).map(m=>m.csv);
    const notes=[];
    if(missingCols.length) notes.push(`${missingCols.length} mapped column${missingCols.length>1?"s":""} from the template not in this file (${missingCols.slice(0,4).join(", ")}${missingCols.length>4?"…":""})`);
    if(droppedFields.length) notes.push(`${droppedFields.length} field${droppedFields.length>1?"s":""} no longer on the entity (${[...new Set(droppedFields)].slice(0,4).join(", ")})`);
    setTemplateNote(notes.length?`Template "${tpl.name}" applied to ${appliedCols} column${appliedCols>1?"s":""}. Heads up: ${notes.join("; ")}.`:`Template "${tpl.name}" applied to ${appliedCols} column${appliedCols>1?"s":""}.`);
    setShowTemplates(false);
  };

  const entityTemplates=useMemo(()=>templates.filter(t=>t.entity===target),[templates,target]);

  // Escape closes the templates dropdown.
  useEffect(()=>{
    if(!showTemplates) return;
    const onKey=(e)=>{if(e.key==="Escape")setShowTemplates(false);};
    document.addEventListener("keydown",onKey);
    return()=>document.removeEventListener("keydown",onKey);
  },[showTemplates]);

  // Warn before the panel is closed/reloaded mid-import (browser "Leave site?" prompt). The driving
  // loop lives in this page, so reloading it would abandon a run with no result and no rollback.
  // step===4 (Run) with no result yet = a run is in flight; the result step clears it.
  // Report "busy" up to the app so page-reloading actions (e.g. Restart onboarding tour) can guard.
  useEffect(()=>{ const busy=(step===4 && !result && !loadError); runningRef.current=busy; onBusyChange?.(busy); },[step,result,loadError,onBusyChange]);
  useEffect(()=>{
    const h=(e)=>{ if(runningRef.current){ e.preventDefault(); e.returnValue=""; } };
    window.addEventListener("beforeunload",h);
    return()=>window.removeEventListener("beforeunload",h);
  },[]);

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
        setLiveEntities(data.map(e=>({l:e.logical,d:e.display,p:e.entitySet||e.logical+"s",i:(e.isCustom&&isTrulyCustom(e.logical,e.isManaged))?"⚙️":"📋",tt:e.tableType||"Standard"})).sort((a,b)=>a.d.localeCompare(b.d)));
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
  const prevTargetRef=useRef(target);  // detect a REAL entity switch (vs initial mount / same value)
  const remapPendingRef=useRef(false); // re-validate field mappings once the new entity's metadata loads

  // Pre-flight length check — flag mapped text fields whose CSV values exceed the column MaxLength
  // (the classic failure when migrating HTML / rich text). Memoized so the row scan only re-runs when
  // the data, mapping or field metadata change — not on every render.
  const lengthWarnings=useMemo(()=>{
    if(deleteMode||!csvData.r.length||!targetFieldsMeta.length) return [];
    const checks=[];
    for(const m of maps){
      if(!m.d365||m.skip) continue;
      const meta=targetFieldsMeta.find(f=>(f.logical||f.l)===m.d365);
      const max=meta&&typeof meta.maxLength==="number"?meta.maxLength:null;
      if(max) checks.push({field:m.d365,col:m.csv,transform:m.transform,max,count:0,maxFound:0});
    }
    if(!checks.length) return [];
    for(const row of csvData.r){
      for(const c of checks){
        const v=row[c.col];
        if(v==null) continue;
        // Measure what will actually be SENT: with strip_html the markup is removed first, so
        // checking the raw HTML length would massively over-warn.
        const len=(c.transform==="strip_html"?stripHtml(String(v)):String(v)).length;
        if(len>c.max){ c.count++; if(len>c.maxFound) c.maxFound=len; }
      }
    }
    return checks.filter(c=>c.count>0);
  },[csvData.r,maps,targetFieldsMeta,deleteMode]);

  // Pre-flight key health: empty key cells (UPSERT silently CREATES them as new keyless records;
  // UPDATE-only errors them) and duplicate key values (multiple rows hit the same record → last wins).
  const keyWarnings=useMemo(()=>{
    const out=[];
    if(deleteMode||!uKey.d||!uKey.c||!csvData.r.length) return out;
    const col=uKey.c;let empty=0;let dup=0;const seen=new Set();const dupd=new Set();
    for(const r of csvData.r){
      const v=r[col];
      if(v===undefined||v===null||String(v).trim()===""){ empty++; continue; }
      const k=String(v).trim().toLowerCase();
      if(seen.has(k)){ if(!dupd.has(k)){dupd.add(k);dup++;} } else seen.add(k);
    }
    if(empty>0) out.push(updateOnly
      ? `${empty.toLocaleString()} row${empty>1?"s have":" has"} an empty key ("${col}") — errored (UPDATE only, nothing to match).`
      : `${empty.toLocaleString()} row${empty>1?"s have":" has"} an empty key ("${col}") — in UPSERT these are CREATED as new records, NOT matched. Check the key column.`);
    if(dup>0) out.push(`${dup.toLocaleString()} key value${dup>1?"s appear":" appears"} on more than one row ("${col}") — those rows ${updateOnly?"update":"upsert"} the SAME record (last row wins).`);
    return out;
  },[csvData.r,uKey.d,uKey.c,updateOnly,deleteMode]);

  // Pre-flight Salesforce-ID detection. A 15/18-char alphanumeric value (e.g. "001Hs00003abcDEF") is
  // almost certainly a Salesforce record id, NOT a Dataverse GUID. Binding one straight to a lookup
  // (direct mode) or to a migration owner/created-by field fails (400/404) — the user needs resolve
  // mode against an external-id column, or to convert the id to the matching D365 GUID first.
  const sfIdWarnings=useMemo(()=>{
    if(deleteMode||!csvData.r.length) return [];
    const looksSF=(v)=>{const s=String(v).trim();return (s.length===15||s.length===18)&&/^[A-Za-z0-9]+$/.test(s)&&/[A-Za-z]/.test(s)&&/[0-9]/.test(s);};
    const majoritySF=(col)=>{ // sample up to 200 non-empty cells; flag if ≥60% look like SF ids
      if(!col) return false;
      let seen=0,hit=0;
      for(const r of csvData.r){const v=r[col];if(v==null||String(v).trim()==="")continue;seen++;if(looksSF(v))hit++;if(seen>=200)break;}
      return seen>0 && hit/seen>=0.6;
    };
    const out=[];
    for(const lk of lookups){ // lookups bound directly as a GUID
      if(lk.mode!=="direct"||!lk.csv) continue;
      if(majoritySF(lk.csv)) out.push(`Lookup column "${lk.csv}" looks like Salesforce IDs — a direct bind needs a Dataverse GUID. Switch this lookup to "resolve" mode and match on an external-id field instead.`);
    }
    if(migrationMode){ // owner / created-by / modified-by override must be systemuser GUIDs
      for(const m of maps){
        if(m.skip||!m.d365) continue;
        const ln=String(m.d365).toLowerCase();
        if((ln==="createdby"||ln==="modifiedby"||ln==="ownerid")&&majoritySF(m.csv))
          out.push(`"${m.csv}" (→ ${ln}) looks like Salesforce user IDs — these must be Dataverse systemuser GUIDs, not SF IDs.`);
      }
    }
    return out;
  },[csvData.r,lookups,maps,migrationMode,deleteMode]);

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

  // Switching the target entity must NOT carry over the previous entity's match key / mode — a stale
  // alternate key (e.g. another entity's fou_sapcustomernumber) would otherwise drive every row to a
  // "no existing record" 404. Reset the key + mode flags on a real entity change, and flag the field
  // mappings for re-validation against the new entity's metadata (handled once it loads, below).
  useEffect(()=>{
    if(prevTargetRef.current===target) return; // initial mount / re-selecting the same entity
    prevTargetRef.current=target;
    setUKey({d:"",c:""});setUpdateOnly(false);setDeltaMode(false);setDeleteMode(false);setDeleteConfirm("");setVerifyExists(false);
    setLookups([]); // lookups (nav property + resolve config) belonged to the OLD entity — clear them so they can't bind wrongly on the new one
    remapPendingRef.current=true;
  },[target]);

  // Lookup-type field logical names — these can ONLY be set via @odata.bind, not direct mapping.
  // Auto-skipping them prevents Dataverse 400 errors when CSV columns happen to match lookup field names.
  const lookupFieldSet = useMemo(() => {
    const s = new Set();
    for (const f of targetFieldsMeta) {
      const t = f.type || f.t;
      if (t === "Lookup" || t === "Customer" || t === "Owner") {
        s.add((f.logical || f.l || "").toLowerCase());
      }
    }
    return s;
  }, [targetFieldsMeta]);

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

  // After an entity switch, drop any field mapping whose target doesn't exist on the new entity (it
  // belonged to the old one and would 400 per row). Valid mappings (e.g. name→name) survive; the
  // statecode/statuscode transforms are kept. Runs once, when the new entity's metadata has loaded.
  useEffect(()=>{
    if(!remapPendingRef.current||!targetFieldsMeta.length) return;
    remapPendingRef.current=false;
    const valid=new Set(targetFieldsMeta.map(f=>(f.logical||f.l||"").toLowerCase()));
    setMaps(prev=>{
      let changed=false;
      const updated=prev.map(m=>{
        if(!m.d365||m.skip) return m;
        const low=m.d365.toLowerCase();
        if(low==="statecode"||low==="statuscode"||valid.has(low)) return m;
        changed=true;
        return {...m,d365:""};
      });
      return changed?updated:prev;
    });
  },[targetFieldsMeta]);

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

  // OData navigation-property names are CASE-SENSITIVE, and for CUSTOM lookups the nav property is
  // the attribute SchemaName (e.g. fou_BlockedReasonId) — NOT the lowercase logical name. OOB
  // lookups happen to match their logical name, which is why a lowercased nav works for ownerid/
  // primarycontactid but 400s ("property does not exist") on a custom field. Canonicalize the
  // configured nav against the relationship metadata; fall back unchanged when unknown.
  const canonNav = (nav) => {
    if (!nav) return nav;
    const low = String(nav).toLowerCase();
    const meta = (targetLookups || []).find(m => (m.navProperty || "").toLowerCase() === low || (m.lookupField || "").toLowerCase() === low);
    return meta?.navProperty || nav;
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

  // Real EntitySetName for @odata.bind (resolveEntitySet handles irregular plurals + abstract
  // owner/customer targets). MEMOIZED: this is called per lookup per row (×400k rows in the
  // prep loop and again when exporting the log) — the raw linear entityList.find() would cost
  // hundreds of millions of comparisons on big loads. Cache resets when entityList changes.
  const entitySetCache = useRef({ list: null, map: new Map() });
  const entitySetFor = (logical) => {
    const c = entitySetCache.current;
    if (c.list !== entityList) { c.list = entityList; c.map.clear(); }
    if (!c.map.has(logical)) c.map.set(logical, resolveEntitySet(logical, entityList));
    return c.map.get(logical);
  };

  // STATECODE_MAP, BOOLEAN_YESNO, applyTransform are imported from ../loaderUtils.js (pure, tested).

  // Returns the GUID string, or null for a GENUINE not-found (0 records).
  // THROWS on a transient failure (network / 403 / 500) so the caller can distinguish a real
  // "no such record" from "couldn't check" — instead of silently treating both as not-found.
  const resolveLookup=async(lk, value)=>{
    if(!value||!lk.entity||!lk.d365f) return null;
    const escaped=value.replace(/'/g,"''");
    // $select the filter field itself — guaranteed to exist, unlike `${entity}id` (activities'
    // PK is activityid, abstract owners' isn't ownerid → permanent 400). Dataverse always
    // includes the primary key attribute in the response regardless of $select.
    const data=await bridge.query(entitySetFor(lk.entity),{filter:`${lk.d365f} eq '${escaped}'`,top:"1",select:lk.d365f});
    if(data?.records?.length>0){
      const rec=data.records[0];
      const fkey=lk.d365f.toLowerCase();
      const idKey=Object.keys(rec).find(k=>k.endsWith("id")&&!k.includes("@")&&k.toLowerCase()!==fkey)||`${lk.entity}id`;
      return rec[idKey];
    }
    return null;
  };

  // Batched lookup resolver — mirrors resolveExistingKeys: resolve many key values at once via
  // OR-filter chunks of 80 (concurrency 6), instead of one sequential query PER unique value (the old
  // N+1 that fired ~50k requests before the first write on a high-cardinality migration). Returns
  // { found: Map<normValue, guid>, errored: Set<normValue> } so the caller keeps the
  // resolved / genuine-not-found / query-failed distinction the fallback handling relies on.
  const resolveLookupBatch = async (lk, values) => {
    const found = new Map();
    const errored = new Set();
    if (!lk.entity || !lk.d365f || !values.length) return { found, errored };
    const set = entitySetFor(lk.entity);
    const fkey = lk.d365f;
    const fkeyLow = fkey.toLowerCase();
    const norm = (v) => String(v).trim().toLowerCase();
    const pkOf = (rec) => {
      const idKey = Object.keys(rec).find(k => k.endsWith("id") && !k.includes("@") && k.toLowerCase() !== fkeyLow) || `${lk.entity}id`;
      return rec[idKey];
    };
    const CHUNK = 80;
    const chunks = [];
    for (let i = 0; i < values.length; i += CHUNK) chunks.push(values.slice(i, i + CHUNK));
    let nextIdx = 0, done = 0;
    const queryChunk = async (slice) => {
      const filter = slice.map(v => `${fkey} eq '${String(v).replace(/'/g, "''")}'`).join(" or ");
      const data = await bridge.query(set, { filter, select: fkey, top: String(slice.length) });
      for (const rec of (data?.records || [])) {
        const kv = rec[fkey]; const g = pkOf(rec);
        if (kv != null && g) found.set(norm(kv), g);
      }
    };
    const CONC = Math.min(6, chunks.length || 1);
    const worker = async () => {
      while (true) {
        if (loadAbort.current) return;
        const idx = nextIdx++;
        if (idx >= chunks.length) return;
        const slice = chunks[idx];
        try { await queryChunk(slice); }
        catch {
          // One malformed value poisons the OR-filter → per-value fallback for this chunk only.
          for (const v of slice) {
            if (loadAbort.current) return;
            try { const g = await resolveLookup(lk, v); if (g) found.set(norm(v), g); }
            catch { errored.add(norm(v)); }
          }
        }
        done += slice.length;
        setLoadProgress({ done: Math.min(done, values.length), total: values.length, current: `Resolving lookups ${lk.entity} (${Math.min(done, values.length).toLocaleString()}/${values.length.toLocaleString()})...` });
      }
    };
    await Promise.all(Array.from({ length: CONC }, () => worker()));
    return { found, errored };
  };

  // UPDATE-only hard guarantee: query which key values actually EXIST before writing, so a
  // non-existent key is never PATCHed (no create can happen, regardless of whether Dataverse
  // honors If-Match: * for the target key). Returns {existing, unverified, norm}:
  //  - norm() canonicalizes a key for Set matching (GUIDs: hex only, lowercased — handles {braces},
  //    case, stray separators; strings: trimmed + lowercased to mirror Dataverse's case-insensitive
  //    filters). Both the query results AND the CSV row values go through it, so they can't drift.
  //  - keyIsNumeric: integer/decimal alternate keys must NOT be quoted in the OData filter.
  //  - A chunk that 400s (one malformed value poisons the whole OR-filter) falls back to per-value
  //    queries; values that still fail land in `unverified` → per-row error, never a full abort.
  // selectFields (optional): also fetch these columns for the matched records — fuels delta mode
  // (records map keyed by norm(key) so rows can be diffed against current org values).
  const resolveExistingKeys=async(entitySet,keyField,isPK,values,keyIsNumeric,selectFields)=>{
    const existing=new Set();
    const unverified=new Set();
    const records=selectFields?new Map():null;
    const norm=(v)=>isPK?String(v).replace(/[^0-9a-fA-F]/g,"").toLowerCase():String(v).trim().toLowerCase();
    const lit=(v)=>isPK?String(v).replace(/[^0-9a-fA-F-]/g,""):(keyIsNumeric?String(v).trim():`'${String(v).trim().replace(/'/g,"''")}'`);
    const CHUNK=80; // OR-filters of ~80 values keep the URL within Dataverse limits
    const chunks=[];
    for(let i=0;i<values.length;i+=CHUNK) chunks.push(values.slice(i,i+CHUNK));
    let nextIdx=0,done=0;
    const selectCols=selectFields?[...new Set([keyField,...selectFields])].join(","):keyField;
    const queryChunk=async(slice)=>{
      const filter=slice.map(v=>`${keyField} eq ${lit(v)}`).join(" or ");
      const data=await bridge.query(entitySet,{filter,select:selectCols,top:String(slice.length)});
      for(const rec of (data?.records||[])){ const kv=rec[keyField]; if(kv!=null){ existing.add(norm(kv)); if(records) records.set(norm(kv),rec); } }
    };
    const CONC=Math.min(6,chunks.length||1); // run several existence queries in parallel
    const worker=async()=>{
      while(true){
        if(loadAbort.current) return; // user cancelled — stop checking
        const idx=nextIdx++;
        if(idx>=chunks.length) return;
        const slice=chunks[idx];
        try{ await queryChunk(slice); }
        catch{
          for(const v of slice){
            if(loadAbort.current) return;
            try{ await queryChunk([v]); }catch{ unverified.add(norm(v)); }
          }
        }
        done+=slice.length;
        setLoadProgress({done:Math.min(done,values.length),total:values.length,current:`Checking which records exist (${Math.min(done,values.length).toLocaleString()}/${values.length.toLocaleString()})...`});
      }
    };
    await Promise.all(Array.from({length:CONC},()=>worker()));
    return {existing,unverified,norm,records};
  };

  // Reconstruct the exact Dataverse request for a CSV row (method, URL path, body attributes) —
  // used to enrich the post-import log. Mirrors doLoad's record-building so what's shown matches
  // what was sent. Resolve-mode lookup GUIDs aren't retained after the run, so those bind values
  // show a placeholder. Reconstructed on demand (not stored per row) to stay memory-safe on big loads.
  // Shared live-log writer for all batch modes — enriches each result with its CSV row, appends to
  // the full-log ref, and updates the bounded display buffer + counts. (Was copy-pasted ×3.)
  const pushBatchLog=(newLog,rowMap,rows)=>{
    if(!newLog?.length) return;
    const enriched=newLog.map(e=>{const csvIdx=rowMap[(e.row||1)-1];return {...e,csvRow:csvIdx!=null?rows[csvIdx]:null,csvRowNumber:csvIdx!=null?csvIdx+2:0};});
    for(const e of enriched){
      fullLog.current.push({csvRowNumber:e.csvRowNumber,status:e.status,msg:e.msg,id:e.id});
      if(e.status==="CREATED"){
        if(e.id) createdIdsRef.current.push(e.id);            // fuels post-import Rollback
        else createdMissingIdRef.current++;                   // created but GUID not captured (rare) — Rollback can't reach it
      }
    }
    setLiveLog(prev=>{const newCounts={...prev.counts};for(const e of enriched) newCounts[e.status]=(newCounts[e.status]||0)+1;return {entries:[...enriched.slice().reverse(),...prev.entries].slice(0,LIVE_LOG_BUFFER),counts:newCounts};});
  };

  const buildRequestForRow=(row)=>{
    if(!row) return null;
    const entitySet=entitySetFor(target);
    // DELETE mode: no body, key-identified path.
    if(deleteMode&&uKey.d&&uKey.c&&row[uKey.c]){
      const isPK=uKey.d.toLowerCase()===target+"id";
      const keyVal=String(row[uKey.c]);
      const path=isPK?`${entitySet}(${keyVal})`:`${entitySet}(${uKey.d}='${keyVal.replace(/'/g,"''")}')`;
      return {method:"DELETE",path,body:null,headers:{}};
    }
    const rec={};
    for(const m of maps){
      if(!m.d365||m.skip) continue;
      if(isSystemField(m.d365)) continue;
      const rawVal=row[m.csv];
      if(rawVal===undefined||rawVal===null||rawVal==="") continue;
      if(isNullToken(rawVal)){
        if(!(migrationActive&&MIGRATION_FIELDS.includes(m.d365.toLowerCase()))) rec[m.d365]=null;
        continue;
      }
      const val=applyTransform(rawVal,m.transform,optionMapsRef.current[m.d365],dateMD);
      if(val!==null&&val!==undefined&&val!==""){
        const lc=m.d365.toLowerCase();
        if(migrationActive&&MIGRATION_FIELDS.includes(lc)) emitMigrationField(rec,lc,val);
        else rec[m.d365]=val;
      }
    }
    for(const lk of lookups){
      if(!lk.csv||!lk.nav) continue;
      const nav=canonNav(lk.nav); // custom lookups need the SchemaName-cased nav property
      const val=row[lk.csv];
      if(!val) continue;
      if(isNullToken(val)){ rec[nav]=null; continue; } // explicit clear — mirrors doLoad
      if(lk.mode==="direct") rec[`${nav}@odata.bind`]=`/${entitySetFor(lk.entity)}(${val})`;
      else if(isAltKeyBind(lk)){const e=String(val).replace(/'/g,"''");rec[`${nav}@odata.bind`]=`/${entitySetFor(lk.entity)}(${lk.d365f}='${e}')`;}
      else rec[`${nav}@odata.bind`]=`/${entitySetFor(lk.entity)}(<resolved at runtime>)`;
    }
    if(uKey.d&&uKey.c&&row[uKey.c]){
      const isPK=uKey.d.toLowerCase()===target+"id";
      const keyVal=String(row[uKey.c]);
      // The key addresses the record in the URL; Dataverse applies it from there — no need in the body.
      const path=isPK?`${entitySet}(${keyVal})`:`${entitySet}(${uKey.d}='${keyVal.replace(/'/g,"''")}')`;
      const method="PATCH";
      const headers={};
      if(updateOnly) headers["If-Match"]="*";
      return {method,path,body:rec,headers};
    }
    return {method:"POST",path:entitySet,body:rec,headers:{}};
  };

  // dry=true → full simulation: parse, transforms, lookup resolution, existence classification —
  // ZERO writes. Reports what WOULD happen (create/update/fail/delete) row by row.
  const doLoad=async(dry=false,opts={})=>{
    const retrySet=opts.retrySet||null;        // Set of original row indices (csvRowNumber-2) to re-run
    const isRetry=!!retrySet;
    const prevResult=opts.prevResult||null;
    setStep(4);setResult(null);
    loadAbort.current=false;setCancelling(false);
    setLiveLog({entries:[],counts:{CREATED:0,UPSERTED:0,ERROR:0}});
    if(!isRetry){
      // A retry keeps the prior log + created-IDs (rollback must still cover the first pass);
      // retryFailed() has already stripped the old error entries for the rows being retried.
      fullLog.current=[];
      createdIdsRef.current=[];createdMissingIdRef.current=0;setRollback(null);setRollbackConfirm("");
    }
    const launchedAt=new Date();setStartedAt(launchedAt);setExpandedLog(null);
    const rows=csvData.r;
    const activeMaps=maps.filter(m=>m.d365 && !m.skip && !isSystemField(m.d365));
    const total=rows.length;
    let created=0,updated=0,skipped=0;
    const errors=[];
    const logEntries=[];

    if(!isLive){
      setTimeout(()=>setResult({created:total-1,updated:1,errors:[],skipped:0,elapsed:"2.1"}),2000);
      return;
    }

    // ── DELETE mode ── (no lookups, no body — just key-identified deletions)
    if(deleteMode && uKey.d && uKey.c){
      const entitySetD=entitySetFor(target);
      const isPKD=uKey.d.toLowerCase()===target+"id";
      const startTimeD=Date.now();
      const deleteItems=[];const deleteRowMap=[];
      for(let i=0;i<rows.length;i++){
        if(retrySet&&!retrySet.has(i)) continue; // retry pass: only re-run the previously-failed rows
        const v=rows[i][uKey.c];
        if(v===undefined||v===null||v===""){ skipped++; logEntries.push({row:i+1,status:"SKIPPED",detail:`Empty key: ${uKey.c}`,d365Id:""}); continue; }
        deleteItems.push({keyValue:v});deleteRowMap.push(i);
      }
      // Dry run: classify by existence instead of deleting.
      if(dry){
        const keyMetaD=targetFieldsMeta.find(f=>(f.logical||f.l)===uKey.d);
        const NUM_D=new Set(["Integer","BigInt","Decimal","Double","Money"]);
        const uniqD=[...new Set(deleteItems.map(it=>it.keyValue))];
        const chk=await resolveExistingKeys(entitySetD,uKey.d,isPKD,uniqD,NUM_D.has(keyMetaD?.type||keyMetaD?.t));
        let wouldDelete=0,notFound=0;
        deleteItems.forEach((it,k)=>{
          const ok=chk.existing.has(chk.norm(it.keyValue));
          if(ok) wouldDelete++; else notFound++;
          logEntries.push({row:deleteRowMap[k]+2,status:ok?"WOULD DELETE":"NOT FOUND",detail:ok?`${uKey.d}="${it.keyValue}"`:`No record for ${uKey.d}="${it.keyValue}" — nothing to delete`,d365Id:""});
        });
        const logD2=logEntries.length>5000?logEntries.slice(0,5000):logEntries;
        setResult({dryRun:true,mode:"delete",deleted:0,wouldDelete,notFound,created:0,updated:0,errors,skipped,elapsed:((Date.now()-startTimeD)/1000).toFixed(1),log:logD2,logTruncated:logEntries.length>5000,logTotal:logEntries.length,entity:target,totalRows:total,cancelled:false,startedAt:launchedAt,finishedAt:new Date()});
        setLoadProgress({done:total,total,current:"Dry run done"});setCancelling(false);
        return;
      }
      let deleted=0;
      if(deleteItems.length){
        // Retry passes run gentler — same policy as create/upsert: half the threads, smaller chunks
        // (a throttled or cascade-heavy org is exactly why the first pass timed out).
        const effThreadsD=isRetry?Math.max(1,Math.floor(threads/2)):threads;
        const effChunkD=isRetry?Math.min(batchSize,50):batchSize;
        setLoadProgress({done:0,total:deleteItems.length,current:`Deleting ${deleteItems.length} records...`});
        try{
          const res=await bridge.batchDeleteKeyed(entitySetD,uKey.d,deleteItems,isPKD,p=>{
            setLoadProgress({done:p.done,total:p.total,current:loadAbort.current?`Cancelling — ${p.done}/${p.total}...`:`Deleting records ${p.done}/${p.total}...`});
            pushBatchLog(p.newLog,deleteRowMap,rows);
          },()=>loadAbort.current,{chunk:effChunkD,concurrency:effThreadsD,bypassPlugins:canShowSpeedBoosters&&bypassPlugins,bypassAsyncLogic:canShowSpeedBoosters&&bypassAsyncLogic});
          deleted=res.deleted||0;
          if(res.errors){ res.errors.forEach(e=>{errors.push({...e,payload:""});}); }
          if(res.aborted){const remaining=deleteItems.length-deleted;logEntries.push({row:0,status:"CANCELLED",detail:`Cancelled — ${remaining} records not processed`,d365Id:""});}
        }catch(e){ errors.push({row:0,msg:`Batch DELETE failed: ${e.message}`,payload:""}); }
      }
      const elapsedD=((Date.now()-startTimeD)/1000).toFixed(1);
      const wasCancelledD=loadAbort.current;
      // Preserve the first pass's prep entries (SKIPPED rows) across retry passes, like create/upsert.
      if(!isRetry) prepLogRef.current=logEntries.slice();
      const batchLogD=fullLog.current.map(e=>({row:e.csvRowNumber,status:e.status,detail:e.status==="ERROR"?(e.msg||"Batch error"):"OK",d365Id:""}));
      const combinedLogD=[...(isRetry?prepLogRef.current:[]),...logEntries,...batchLogD];
      const resultLogD=combinedLogD.length>5000?combinedLogD.slice(0,5000):combinedLogD;
      // Retry candidates — same derivation as create/upsert: ERROR rows in the authoritative fullLog
      // (which carries the correct CSV row numbers via deleteRowMap, unlike the raw batch errors).
      const seenIdxD=new Set();const retryAllD=[];const retryTransientD=[];
      for(const e of fullLog.current){
        if(e.status!=="ERROR"||!(e.csvRowNumber>=2)) continue;
        const idx=e.csvRowNumber-2; if(seenIdxD.has(idx)) continue; seenIdxD.add(idx);
        retryAllD.push(idx); if(isTransientError(e.msg)) retryTransientD.push(idx);
      }
      // Cumulative accounting on a retry pass — errors re-derived from fullLog (correct rows) plus
      // batch-level (row 0) catastrophic failures from THIS pass.
      const fDeleted=isRetry?(prevResult?.deleted||0)+deleted:deleted;
      const fSkippedD=isRetry?(prevResult?.skipped||0):skipped;
      const fErrorsD=isRetry
        ? [...fullLog.current.filter(e=>e.status==="ERROR"&&e.csvRowNumber>=2).map(e=>({row:e.csvRowNumber,msg:e.msg,payload:""})),
           ...errors.filter(e=>e.row===0)]
        : errors;
      const retryInfoD=isRetry?{attempted:retrySet.size,succeeded:deleted,stillFailing:Math.max(0,retrySet.size-deleted),transientOnly:!!opts.transientOnly}:null;
      setResult({created:0,updated:0,deleted:fDeleted,errors:fErrorsD,skipped:fSkippedD,elapsed:elapsedD,log:resultLogD,logTruncated:combinedLogD.length>5000,logTotal:combinedLogD.length,entity:target,totalRows:total,cancelled:wasCancelledD,startedAt:launchedAt,finishedAt:new Date(),mode:"delete",retryAll:retryAllD,retryTransient:retryTransientD,retryInfo:retryInfoD});
      setLoadProgress({done:total,total,current:wasCancelledD?"Cancelled":"Done"});
      setCancelling(false);
      return;
    }

    // Polymorphic owner lookups in DIRECT mode: a GUID may be a USER or a TEAM. Probe each
    // unique GUID (systemusers first, then teams) so the bind targets the right entity set —
    // previously team GUIDs were always bound to /systemusers and failed per row.
    const ownerSetCache={}; // guid -> "systemusers" | "teams"
    const ownerErrored=new Set(); // guids whose type couldn't be probed (transient error, not a clean 404)
    const isOwnerLk=(lk)=>lk.entity==="owner"||lk.entity==="principal"||(lk.nav||"").toLowerCase()==="ownerid";
    const isNotFound=(e)=>/404|does not exist|0x80040217/i.test((e&&e.message)||"");
    {
      const ownerDirect=lookups.filter(lk=>lk.mode==="direct"&&lk.csv&&isOwnerLk(lk));
      if(ownerDirect.length){
        const guids=[...new Set(rows.flatMap(r=>ownerDirect.map(lk=>r[lk.csv])).filter(v=>v&&/^[0-9a-f-]{36}$/i.test(String(v).trim())).map(v=>String(v).trim().toLowerCase()))];
        if(guids.length){
          setLoadProgress({done:0,total:guids.length,current:`Resolving owner type (user vs team) for ${guids.length} unique ids...`});
          let doneO=0,nextO=0;
          const probeOne=async(g)=>{
            try{ await bridge.query(`systemusers(${g})`,{select:"systemuserid"}); ownerSetCache[g]="systemusers"; }
            catch(e1){
              // Only a definitive 404 means "not a user, try team". A transient error (429/5xx/
              // network) must NOT make us guess — otherwise a throttled team GUID gets bound to
              // /systemusers and silently fails per row.
              if(!isNotFound(e1)){ ownerErrored.add(g); }
              else{ try{ await bridge.query(`teams(${g})`,{select:"teamid"}); ownerSetCache[g]="teams"; }
                    catch(e2){ if(!isNotFound(e2)) ownerErrored.add(g); /* else: neither user nor team — leave unresolved */ } }
            }
            doneO++; if(doneO%20===0) setLoadProgress({done:doneO,total:guids.length,current:`Resolving owner type ${doneO}/${guids.length}...`});
          };
          // 5-way pool: owner probes are independent reads, well under the 30 req/s budget.
          const workerO=async()=>{ while(nextO<guids.length){ if(loadAbort.current) return; const g=guids[nextO++]; await probeOne(g); } };
          await Promise.all(Array.from({length:Math.min(5,guids.length)},()=>workerO()));
        }
      }
    }

    const lookupCache={};
    for(const lk of lookups){
      if(lk.mode==="direct") continue;
      if(isAltKeyBind(lk)) continue; // alt-key path: bind directly via /entity(field='value'), skip pre-resolve
      if(!lk.csv||!lk.entity||!lk.d365f) continue;
      const uniqueVals=[...new Set(rows.map(r=>r[lk.csv]).filter(v=>v&&!isNullToken(v)))]; // NULL tokens clear the lookup — nothing to resolve
      setLoadProgress({done:0,total:uniqueVals.length,current:`Resolving lookups ${lk.entity} (${uniqueVals.length.toLocaleString()} values)...`});
      const {found,errored}=await resolveLookupBatch(lk,uniqueVals);
      const nrm=(v)=>String(v).trim().toLowerCase();
      for(const val of uniqueVals){
        const key=`${lk.entity}.${lk.d365f}.${val}`;
        const nv=nrm(val);
        if(found.has(nv)) lookupCache[key]=found.get(nv);                 // string GUID = resolved
        else if(errored.has(nv)) lookupCache[key]={__resolveError:"lookup query failed"}; // query failed (not mislabelled "not found")
        else lookupCache[key]=null;                                       // genuine not-found
      }
    }

    // Pre-load OptionSet metadata for picklist/statecode columns so a CSV holding option *labels*
    // (e.g. "Chaud", "En cours") converts to the option value instead of being silently dropped.
    const optionMaps={}; // { [d365field]: { "<label lowercased>": value } }
    const unmatchedOpts={}; // { [d365field]: Set(labels) } — option-set labels that matched no value
    const pickFields=activeMaps.filter(m=>m.d365 && (m.transform==="picklist"||m.transform==="statecode"));
    await Promise.all(pickFields.map(async(m)=>{
      const meta=targetFieldsMeta.find(f=>(f.logical||f.l)===m.d365);
      const attrType=meta?.type||meta?.t||"Picklist";
      try{
        const opts=await bridge.getOptionSet(target,m.d365,attrType);
        if(Array.isArray(opts)){
          const map={};
          for(const o of opts){ if(o&&o.label!=null&&o.value!=null) map[String(o.label).toLowerCase().trim()]=o.value; }
          optionMaps[m.d365]=map;
        }
      }catch{}
    }));
    optionMapsRef.current=optionMaps; // keep for buildRequestForRow (request details / log export)

    const entitySet = entitySetFor(target);
    const startTime=Date.now();
    // Retry passes use gentler concurrency/chunk so a re-run after a throttle/timeout doesn't
    // immediately re-trip the same limit.
    const effThreads=isRetry?Math.max(1,Math.floor(threads/2)):threads;
    const effChunk=isRetry?Math.min(batchSize,50):batchSize;
    const createRecords=[];
    const upsertItems=[];
    // Parallel index maps: createRecords[k] / upsertItems[k] correspond to rows[createRowMap[k]] / rows[upsertRowMap[k]].
    // Used to look up the original CSV row when displaying the live log.
    const createRowMap=[];
    const upsertRowMap=[];

    // UPDATE-only: resolve which keys exist up front. Rows whose key isn't found (or couldn't be
    // verified) are errored per-row and never PATCHed — so no create can occur even if the org
    // doesn't honor If-Match on the key. Query failures degrade to per-row errors, not an abort.
    let existCheck=null;
    // Dry run always resolves existence when a key is set (that's how it classifies
    // would-update vs would-create vs would-fail); real runs only when the user opted in.
    const wantDelta=deltaMode && uKey.d && uKey.c && !deleteMode;
    if(((updateOnly && verifyExists) || (dry && uKey.d) || wantDelta) && uKey.d && uKey.c){
      const isPKupd=uKey.d.toLowerCase()===target+"id";
      const keyMeta=targetFieldsMeta.find(f=>(f.logical||f.l)===uKey.d);
      const NUMERIC_TYPES=new Set(["Integer","BigInt","Decimal","Double","Money"]);
      const keyIsNumeric=NUMERIC_TYPES.has(keyMeta?.type||keyMeta?.t);
      const uniqueKeyVals=[...new Set(rows.map(r=>r[uKey.c]).filter(v=>v!==undefined&&v!==null&&v!==""))];
      // Delta mode needs the current org values of the mapped columns (OData names for lookups).
      const deltaSelect=wantDelta?activeMaps.map(m=>{const meta=targetFieldsMeta.find(f=>(f.logical||f.l)===m.d365);return meta&&meta.odataName?meta.odataName:m.d365;}).filter(Boolean):null;
      existCheck=await resolveExistingKeys(entitySet,uKey.d,isPKupd,uniqueKeyVals,keyIsNumeric,deltaSelect);
    }

    // Build phase: this loop is SYNCHRONOUS, so without yielding the "Preparing…" message never
    // paints and the user sees a frozen "0" before the first batch. Show the count and yield to the
    // browser up front, then refresh it every 25k rows. done stays 0 — the progress BAR represents
    // writes, and nothing is written yet during preparation.
    setLoadProgress({done:0,total,current:`Preparing ${(total||rows.length).toLocaleString()} records — no writes yet…`});
    await new Promise(r=>setTimeout(r,0));

    for(let i=0;i<rows.length;i++){
      if(loadAbort.current) break; // allow Cancel to interrupt the (potentially long) prep phase, not just the batch
      if(retrySet&&!retrySet.has(i)) continue; // retry pass: only re-run the previously-failed rows
      const row=rows[i];
      if(i && i%25000===0){
        setLoadProgress({done:0,total,current:`Preparing ${i.toLocaleString()} / ${total.toLocaleString()} records…`});
        await new Promise(r=>setTimeout(r,0));
      }
      const rec={};

      try{
        for(const m of activeMaps){
          if(!m.d365) continue;
          const rawVal = row[m.csv];
          if(rawVal === undefined || rawVal === null || rawVal === "") continue;
          // Explicit NULL token → clear the field (empty cells still mean "leave untouched").
          // Meaningless on migration-override audit fields, so those are just skipped.
          if(isNullToken(rawVal)){
            if(!(migrationActive&&MIGRATION_FIELDS.includes(m.d365.toLowerCase()))) rec[m.d365]=null;
            continue;
          }
          const val=applyTransform(rawVal,m.transform,optionMaps[m.d365],dateMD);
          if(val!==null && val!==undefined && val!==""){
            const lc=m.d365.toLowerCase();
            if(migrationActive&&MIGRATION_FIELDS.includes(lc)) emitMigrationField(rec,lc,val);
            else rec[m.d365]=val;
          }
          else if((m.transform==="picklist"||m.transform==="statecode") && optionMaps[m.d365]){
            // Transform returned null with a loaded option map → unmatched label (numeric values
            // and known labels never return null). Track it instead of dropping silently.
            (unmatchedOpts[m.d365]||(unmatchedOpts[m.d365]=new Set())).add(String(rawVal));
          }
        }

        let skipRow=false;
        for(const lk of lookups){
          if(!lk.csv||!lk.nav) continue;
          const nav=canonNav(lk.nav); // custom lookups need the SchemaName-cased nav property
          const val=row[lk.csv];
          if(!val){
            if(lk.fb==="error"){ errors.push({row:i+1,msg:`Empty lookup: ${lk.csv}`});logEntries.push({row:i+1,status:"ERROR",detail:`Empty lookup: ${lk.csv}`,d365Id:""});skipRow=true;break; }
            continue;
          }
          // Explicit NULL token → CLEAR the lookup: bare single-valued nav property set to null
          // (the documented Web API disassociate). No @odata.bind, no resolve needed.
          if(isNullToken(val)){ rec[nav]=null; continue; }
          if(lk.mode==="direct"){
            const gkey=isOwnerLk(lk)?String(val).trim().toLowerCase():null;
            // Owner type couldn't be probed (transient throttling) — error the row rather than
            // guess /systemusers and silently mis-own a team-owned record.
            if(gkey&&ownerErrored.has(gkey)){
              const msg=`Owner type unresolved for ${lk.csv}="${val}" (org was throttling) — re-run to retry`;
              errors.push({row:i+1,msg});logEntries.push({row:i+1,status:"ERROR",detail:msg,d365Id:""});skipRow=true;break;
            }
            const ownerSet=gkey?ownerSetCache[gkey]:null;
            rec[`${nav}@odata.bind`]=`/${ownerSet||entitySetFor(lk.entity)}(${val})`;
          } else if(isAltKeyBind(lk)){
            // Alt-key direct binding — Dataverse resolves server-side. Empty fb=skip/null already
            // short-circuited above; missing record on the server returns a per-row PATCH error.
            const escaped=String(val).replace(/'/g,"''");
            rec[`${nav}@odata.bind`]=`/${entitySetFor(lk.entity)}(${lk.d365f}='${escaped}')`;
          } else {
            const cached=lookupCache[`${lk.entity}.${lk.d365f}.${val}`];
            if(cached&&typeof cached==="object"&&cached.__resolveError){
              // Couldn't verify (query failed) — honor the user's fallback choice, but keep the
              // transparent "check failed" message so it's never mistaken for a real not-found.
              const msg=`Lookup check failed: ${lk.csv}="${val}" (${cached.__resolveError})`;
              if(lk.fb==="skip"){ skipped++;logEntries.push({row:i+1,status:"SKIPPED",detail:msg,d365Id:""});skipRow=true;break; }
              if(lk.fb!=="null"){ errors.push({row:i+1,msg});logEntries.push({row:i+1,status:"ERROR",detail:msg,d365Id:""});skipRow=true;break; }
              // fb==="null": load the row without this lookup
            }else if(cached){
              rec[`${nav}@odata.bind`]=`/${entitySetFor(lk.entity)}(${cached})`;
            } else {
              if(lk.fb==="error"){ errors.push({row:i+1,msg:`Lookup not found: ${lk.csv}="${val}"`});logEntries.push({row:i+1,status:"ERROR",detail:`Lookup not found: ${lk.csv}="${val}"`,d365Id:""});skipRow=true;break; }
              if(lk.fb==="skip"){ skipped++;logEntries.push({row:i+1,status:"SKIPPED",detail:`Lookup not resolved: ${lk.csv}="${val}"`,d365Id:""});skipRow=true;break; }
            }
          }
        }
        if(skipRow) continue;

        if(uKey.d && uKey.c && row[uKey.c]){
          // UPDATE-only: skip (error) any key that doesn't already exist — guarantees no create.
          // norm() canonicalizes both sides ({braces}, case, spaces) so formatting can't mismatch.
          const nk=existCheck?existCheck.norm(row[uKey.c]):null;
          // The hard "never create" gates only apply to REAL UPDATE-only runs: in dry runs
          // (any mode) rows flow to upsertItems so the dry classifier reports WOULD FAIL/CREATE,
          // and in UPSERT+delta a missing key legitimately means "create".
          if(updateOnly && !dry && existCheck && existCheck.unverified.has(nk)){
            const msg=`Existence check failed for ${uKey.d}="${row[uKey.c]}" — row not sent (UPDATE only)`;
            errors.push({row:i+1,msg});
            logEntries.push({row:i+1,status:"ERROR",detail:msg,d365Id:""});
          } else if(updateOnly && !dry && existCheck && !existCheck.existing.has(nk)){
            errors.push({row:i+1,msg:`No existing record for ${uKey.d}="${row[uKey.c]}" — not created (UPDATE only)`});
            logEntries.push({row:i+1,status:"ERROR",detail:`No existing record for ${uKey.d}="${row[uKey.c]}" — not created (UPDATE only)`,d365Id:""});
          } else {
            // Delta mode: against the fetched org record, drop fields whose value is already
            // identical; if nothing differs (and no lookup binds), skip the row entirely.
            let recToSend=rec;
            if(!dry && wantDelta && existCheck?.records && existCheck.existing.has(nk)){
              const cur=existCheck.records.get(nk);
              if(cur){
                const slim={};let kept=0,binds=0;
                for(const [k,v] of Object.entries(rec)){
                  if(k.includes("@odata.bind")){ slim[k]=v;binds++;continue; } // binds kept (cheap compare impossible)
                  if(v===null){ slim[k]=v;kept++;continue; } // explicit NULL-token clear — always send (the org column may not even be in the delta fetch)
                  const metaF=targetFieldsMeta.find(f=>(f.logical||f.l)===k);
                  const curV=cur[metaF&&metaF.odataName?metaF.odataName:k];
                  if(deltaEqual(curV,v)) continue;
                  slim[k]=v;kept++;
                }
                if(kept===0&&binds===0){
                  skipped++;logEntries.push({row:i+1,status:"UNCHANGED",detail:"Delta: every mapped field already matches — row skipped",d365Id:""});
                  continue;
                }
                recToSend=slim;
              }
            }
            // Key goes in the URL only (keyValue) — not the body. Dataverse applies it from the URL.
            upsertItems.push({keyValue:row[uKey.c],record:recToSend});
            upsertRowMap.push(i);
          }
        } else if(uKey.d && updateOnly){
          // UPDATE-only: a row with no key value can't target a record — error, never create.
          errors.push({row:i+1,msg:`Cannot UPDATE: empty key in column "${uKey.c}"`});
          logEntries.push({row:i+1,status:"ERROR",detail:`Cannot UPDATE: empty key in column "${uKey.c}"`,d365Id:""});
        } else {
          createRecords.push(rec);
          createRowMap.push(i);
        }
      }catch(e){
        errors.push({row:i+1,msg:e.message?.substring(0,500)||"Error",payload:JSON.stringify(rec).substring(0,200)});
        logEntries.push({row:i+1,status:"ERROR",detail:e.message?.substring(0,200)||"Error",d365Id:""});
      }
    }

    // ── Dry run: classify what WOULD happen, write nothing, report. ──
    if(dry){
      let wouldCreate=0,wouldUpdate=0,wouldFail=0;
      upsertItems.forEach((it,k)=>{
        const exists=existCheck?existCheck.existing.has(existCheck.norm(it.keyValue)):null;
        let st,detail;
        if(exists===true){ st="WOULD UPDATE";detail=`${uKey.d}="${it.keyValue}"`;wouldUpdate++; }
        else if(updateOnly){ st="WOULD FAIL";detail=`No existing record for ${uKey.d}="${it.keyValue}" — UPDATE only → 404`;wouldFail++; }
        else if(exists===false){ st="WOULD CREATE";detail=`No record for ${uKey.d}="${it.keyValue}" — upsert would create it`;wouldCreate++; }
        else { st="WOULD UPSERT";detail=`${uKey.d}="${it.keyValue}" (existence not verified)`;wouldUpdate++; }
        logEntries.push({row:upsertRowMap[k]+2,status:st,detail,d365Id:""});
      });
      createRowMap.forEach(idx=>{ wouldCreate++; logEntries.push({row:idx+2,status:"WOULD CREATE",detail:"New record (POST)",d365Id:""}); });
      const optionWarnings=Object.entries(unmatchedOpts).map(([field,set])=>({field,labels:[...set].slice(0,10)})).filter(w=>w.labels.length);
      const lg=logEntries.length>5000?logEntries.slice(0,5000):logEntries;
      setResult({dryRun:true,created:0,updated:0,wouldCreate,wouldUpdate,wouldFail,errors,skipped,elapsed:((Date.now()-startTime)/1000).toFixed(1),log:lg,logTruncated:logEntries.length>5000,logTotal:logEntries.length,entity:target,totalRows:total,cancelled:false,startedAt:launchedAt,finishedAt:new Date(),optionWarnings});
      setLoadProgress({done:total,total,current:"Dry run done"});
      setCancelling(false);
      return;
    }

    // Rows the prep step filtered out (no matching record / empty key / unchanged in delta) never
    // reach a batch. The progress bar tracks SENT rows, so its denominator is what's actually sent —
    // otherwise a 91k-row update matching only 5k records looks like it "stopped at 5k".
    const sendTotal=createRecords.length+upsertItems.length;
    const notSent=isRetry?0:Math.max(0,total-sendTotal);

    if(createRecords.length>0){
      setLoadProgress({done:0,total:sendTotal,current:`Sending ${createRecords.length.toLocaleString()} records (CREATE)...`});
      try{
        const res=await bridge.batchCreate(entitySet,createRecords,p=>{
          setLoadProgress({done:p.done,total:sendTotal,current:loadAbort.current?`Cancelling — ${p.done}/${p.total}...`:`Sending records (CREATE) ${p.done}/${p.total}...`});
          pushBatchLog(p.newLog,createRowMap,rows);
        },()=>loadAbort.current,{chunk:effChunk,concurrency:effThreads,bypassPlugins:canShowSpeedBoosters&&bypassPlugins,suppressDuplicates:canShowSpeedBoosters&&suppressDuplicates,bypassAsyncLogic:canShowSpeedBoosters&&bypassAsyncLogic});
        created=res.created||0;
        if(res.errors){ res.errors.forEach(e=>{errors.push({...e,payload:""});}); }
        if(res.aborted){const remaining=createRecords.length-created;logEntries.push({row:0,status:"CANCELLED",detail:`Import cancelled — ${remaining} records not sent`,d365Id:""});}
      }catch(e){
        errors.push({row:0,msg:`Batch CREATE failed: ${e.message}`,payload:""});
      }
    }

    if(upsertItems.length>0 && !loadAbort.current){
      setLoadProgress({done:createRecords.length,total:sendTotal,current:`Sending ${upsertItems.length.toLocaleString()}${notSent>0?` of ${total.toLocaleString()}`:""} records (${updateOnly?"UPDATE":"UPSERT"})${notSent>0?` — ${notSent.toLocaleString()} not eligible`:""}...`});
      try{
        const isPK = uKey.d.toLowerCase() === target + "id";
        const res=await bridge.batchUpsert(entitySet,uKey.d,upsertItems,isPK,p=>{
          setLoadProgress({done:createRecords.length+p.done,total:sendTotal,current:loadAbort.current?`Cancelling — ${p.done}/${p.total}...`:`Sending records (${updateOnly?"UPDATE":"UPSERT"}) ${p.done}/${p.total}...`});
          pushBatchLog(p.newLog,upsertRowMap,rows);
        },()=>loadAbort.current,{chunk:effChunk,concurrency:effThreads,bypassPlugins:canShowSpeedBoosters&&bypassPlugins,suppressDuplicates:canShowSpeedBoosters&&suppressDuplicates,bypassAsyncLogic:canShowSpeedBoosters&&bypassAsyncLogic,updateOnly});
        updated=res.updated||0;
        created+=res.created||0; // upsert that created (201) → count toward Created, matching the log + rollback set
        if(res.errors){ res.errors.forEach(e=>{errors.push({...e,payload:""});}); }
        if(res.aborted){const remaining=upsertItems.length-(updated+(res.created||0));logEntries.push({row:0,status:"CANCELLED",detail:`Import cancelled — ${remaining} records not sent`,d365Id:""});}
      }catch(e){
        errors.push({row:0,msg:`Batch UPSERT failed: ${e.message}`,payload:""});
      }
    }

    const elapsed=((Date.now()-startTime)/1000).toFixed(1);
    const wasCancelled=loadAbort.current;
    // Prep-loop entries (skipped lookups, prep errors, cancellations) live outside fullLog. Keep the
    // ORIGINAL run's prep entries so a later retry pass (which only re-runs batch rows) still shows them.
    if(!isRetry) prepLogRef.current=logEntries.slice();
    const prepLog=isRetry?prepLogRef.current:logEntries;
    // Final log = prep entries + real per-row batch results (from fullLog ref). Capped for rendering.
    const batchLog=fullLog.current.map(e=>({row:e.csvRowNumber,status:e.status,detail:e.status==="ERROR"?(e.msg||"Batch error"):"OK",d365Id:""}));
    const combinedLog=[...prepLog,...batchLog];
    const resultLog=combinedLog.length>5000?combinedLog.slice(0,5000):combinedLog;
    const optionWarnings=Object.entries(unmatchedOpts).map(([field,set])=>({field,labels:[...set].slice(0,10)})).filter(w=>w.labels.length);
    // Retry candidates — derived from the (updated) fullLog: every ERROR row that maps to a CSV line.
    // Transient ones (timeouts/throttle/5xx/deadlock) are the safe default; the rest are data/
    // permission errors a blind retry won't fix.
    const seenIdx=new Set();const retryAll=[];const retryTransient=[];
    for(const e of fullLog.current){
      if(e.status!=="ERROR"||!(e.csvRowNumber>=2)) continue;
      const idx=e.csvRowNumber-2; if(seenIdx.has(idx)) continue; seenIdx.add(idx);
      retryAll.push(idx); if(isTransientError(e.msg)) retryTransient.push(idx);
    }
    // Cumulative counts/errors when this was a retry pass (the retried rows were previously errors, so
    // adding this pass's successes can't double-count). Errors are re-derived from the authoritative
    // fullLog + preserved prep entries + this pass's batch-level (row 0) failures.
    const fCreated=isRetry?(prevResult?.created||0)+created:created;
    const fUpdated=isRetry?(prevResult?.updated||0)+updated:updated;
    const fSkipped=isRetry?(prevResult?.skipped||0):skipped;
    const fErrors=isRetry
      ? [...fullLog.current.filter(e=>e.status==="ERROR"&&e.csvRowNumber>=2).map(e=>({row:e.csvRowNumber,msg:e.msg,payload:""})),
         ...prepLog.filter(e=>e.status==="ERROR").map(e=>({row:e.row,msg:e.detail,payload:""})),
         ...errors.filter(e=>!(e.row>=2))]
      : errors;
    const retryInfo=isRetry?{attempted:retrySet.size,succeeded:created+updated,stillFailing:Math.max(0,retrySet.size-(created+updated)),transientOnly:!!opts.transientOnly}:null;
    setResult({created:fCreated,updated:fUpdated,errors:fErrors,skipped:fSkipped,elapsed,log:resultLog,logTruncated:combinedLog.length>5000,logTotal:combinedLog.length,entity:target,totalRows:total,cancelled:wasCancelled,startedAt:launchedAt,finishedAt:new Date(),optionWarnings,retryAll,retryTransient,retryInfo});
    setLoadProgress({done:sendTotal,total:sendTotal,current:wasCancelled?"Cancelled":(notSent>0?`Done — ${sendTotal.toLocaleString()} sent, ${notSent.toLocaleString()} not eligible (no matching record / empty key / unchanged — see the log)`:"Done")});
    setCancelling(false);
  };

  // Single entry point for every run (dry / real / retry). Wraps doLoad so an uncaught failure ANYWHERE
  // in it (prep loop, existence pre-pass, metadata fetch) surfaces the EXACT error on screen instead of
  // dying as a silent unhandled rejection. The batch try/catch blocks still handle per-batch failures
  // as logged row errors — this only catches the catastrophic, run-killing ones.
  const runLoad=(dry=false,opts={})=>{
    setLoadError(null);
    Promise.resolve().then(()=>doLoad(dry,opts)).catch(e=>{
      setLoadError({message:e?.message||String(e),stack:e?.stack||"",when:new Date().toLocaleString()});
      setCancelling(false);
    });
  };

  // Re-run only the previously-failed rows. transientOnly=true (default) limits to timeouts / throttle /
  // 5xx / deadlocks — the errors a retry can actually fix; false re-runs every failed row (use after you
  // fixed something org-side, e.g. granted a privilege or raised a field length).
  const retryFailed=(transientOnly=true)=>{
    if(!result||result.dryRun) return;
    const idxs=transientOnly?(result.retryTransient||[]):(result.retryAll||[]);
    if(!idxs.length) return;
    const retrySet=new Set(idxs);
    // Drop the old error entries for these rows so the fresh pass replaces them.
    fullLog.current=fullLog.current.filter(e=>!(e.csvRowNumber>=2&&retrySet.has(e.csvRowNumber-2)));
    runLoad(false,{retrySet,prevResult:result,transientOnly});
  };
  const steps=[{l:"Source",i:"📄"},{l:"Mapping",i:"🔗"},{l:"Lookups",i:"🔍"},{l:"Preview",i:"👁"},{l:"Run",i:"🚀"}];

  return(
    <div style={{padding:bp.mobile?12:20,maxWidth:bp.mobile?"100%":1400,margin:"0 auto"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:0,marginBottom:bp.mobile?14:22,flexWrap:"wrap"}}>
        {steps.map((s,i)=>{
          const lookupsEmpty=i===2&&lookups.length===0&&csvData.h.length>0; // Lookups step: nothing auto-detected
          const clickable=i<=step; // Lookups stays reachable even when empty — add lookups manually (non-GUID / Salesforce IDs)
          return <div key={i} style={{display:"flex",alignItems:"center"}}><button onClick={()=>clickable&&setStep(i)} title={lookupsEmpty?"No lookups auto-detected — click to add one manually (e.g. non-GUID / Salesforce IDs)":undefined} style={{display:"flex",alignItems:"center",gap:3,padding:bp.mobile?"4px 6px":"5px 10px",borderRadius:5,cursor:clickable?"pointer":"default",opacity:(lookupsEmpty&&i!==step)?0.55:1,background:i===step?C.sfa:"transparent",border:`1px solid ${i===step?C.vi:i<step?C.gnd:C.bd}`,fontSize:bp.mobile?10:11,color:i<=step?C.tx:C.txd,fontWeight:i===step?600:400}}><span style={{fontSize:bp.mobile?10:12}}>{i<step?"✅":s.i}</span>{(!bp.mobile||i===step)&&<span>{lookupsEmpty?`${s.l} (none)`:s.l}</span>}</button>{i<4&&<div style={{width:bp.mobile?6:14,height:1,background:i<step?C.gn:C.bd,margin:"0 2px"}}/>}</div>;
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
          {parseInfo?.badParse&&(
            <div style={{...crd({padding:"10px 14px",background:C.rd+"0c",borderColor:C.rd+"55"}),marginBottom:12,fontSize:12.5,lineHeight:1.6,color:C.rd}}>
              ⚠ <b>{csvFile?.name||"The file"}</b> parsed into {parseInfo.parsedRecords} data row{parseInfo.parsedRecords===1?"":"s"} — <b>nothing was loaded from it</b>.
              {parseInfo.rawLines>2&&<> The file has {parseInfo.rawLines.toLocaleString()} lines, so a stray <b>unclosed quote (")</b> in the header or first line probably swallowed the rest into one giant cell — fix it in the source file and reload.</>}
              {csvData.r.length>0&&<> The mapping below still shows your <b>previous</b> file's data.</>}
            </div>
          )}
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
                          <TableTypeBadge tt={e.tt}/>
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
              {(()=>{const se=entityList.find(e=>e.l===target);return se?.tt==="Virtual"&&(
                <div style={{marginTop:6,fontSize:11.5,lineHeight:1.5,color:C.or,padding:"6px 8px",background:C.or+"11",borderRadius:4,border:`1px solid ${C.or}33`}}>
                  ⚠ <b>Virtual table</b> — its data lives in an external source behind a data provider. Writes (create/update/delete) only work if the provider implements them; most virtual tables are <b>read-only</b> and every row will fail with the provider's error.
                </div>
              );})()}
            </div>
            <div style={{...crd({padding:12}),flex:1}}>
              <label style={{fontSize:12,color:C.txm,fontWeight:500,display:"block",marginBottom:4}}>Import mode</label>
              <div style={{display:"flex",gap:10,marginBottom:6,flexWrap:"wrap"}}>
                {(()=>{
                  // Default key picker — pure, unit-tested (loaderUtils.defaultMatchKey): prefers an
                  // alt-key over the PK and only auto-pairs a CSV column when one matches the key
                  // name. It never falls back to the first column (the v1.10.13→1.11.32 trap that
                  // silently matched on the wrong column); an unmatched key leaves c:"" so the UI warns.
                  const ensureKey=()=>{ if(uKey.d) return; setUKey(defaultMatchKey(targetAltKeys,target+"id",csvData.h)); };
                  return (<>
                    <label style={{fontSize:12,color:!uKey.d?C.gn:C.txd,cursor:"pointer",display:"flex",alignItems:"center",gap:3}}>
                      <input type="radio" checked={!uKey.d} onChange={()=>{setUKey({d:"",c:""});setUpdateOnly(false);setDeleteMode(false);}} style={{accentColor:C.gn}}/> CREATE (new records)
                    </label>
                    <label style={{fontSize:12,color:uKey.d&&!updateOnly&&!deleteMode?C.cy:C.txd,cursor:"pointer",display:"flex",alignItems:"center",gap:3}}>
                      <input type="radio" checked={!!uKey.d&&!updateOnly&&!deleteMode} onChange={()=>{ensureKey();setUpdateOnly(false);setDeleteMode(false);}} style={{accentColor:C.cy}}/> UPSERT (update or create)
                    </label>
                    <label style={{fontSize:12,color:uKey.d&&updateOnly&&!deleteMode?C.or:C.txd,cursor:"pointer",display:"flex",alignItems:"center",gap:3}}>
                      <input type="radio" checked={!!uKey.d&&updateOnly&&!deleteMode} onChange={()=>{ensureKey();setUpdateOnly(true);setDeleteMode(false);}} style={{accentColor:C.or}}/> UPDATE (existing only)
                    </label>
                    <label style={{fontSize:12,color:uKey.d&&deleteMode?C.rd:C.txd,cursor:"pointer",display:"flex",alignItems:"center",gap:3}}>
                      <input type="radio" checked={!!uKey.d&&deleteMode} onChange={()=>{ensureKey();setDeleteMode(true);setUpdateOnly(false);setDeleteConfirm("");}} style={{accentColor:C.rd}}/> <span style={{color:uKey.d&&deleteMode?C.rd:C.txd}}>🗑 DELETE (remove records)</span>
                    </label>
                  </>);
                })()}
              </div>
              {uKey.d&&updateOnly&&!deleteMode&&<div style={{marginBottom:6}}>
                <div style={{fontSize:11,color:C.or,marginBottom:4}}>Update-only: rows with no matching record <b>fail</b> (not created) — enforced natively by the <code style={{...mono,fontSize:11}}>If-Match: *</code> header on every PATCH. This is the documented Dataverse mechanism; no extra queries.</div>
                <label style={{display:"flex",alignItems:"flex-start",gap:6,fontSize:11,color:C.txd,cursor:"pointer"}}>
                  <input type="checkbox" checked={verifyExists} onChange={e=>setVerifyExists(e.target.checked)} style={{accentColor:C.or,marginTop:1}}/>
                  <span>Also pre-verify existence (safety net) — adds a parallelized existence-check pass before writing. Only needed for the rare org that doesn't honor <code style={{...mono,fontSize:11}}>If-Match</code>. Slower on large updates; leave off unless you've actually seen creates.</span>
                </label>
              </div>}
              {uKey.d&&uKey.c&&!deleteMode&&<label style={{display:"flex",alignItems:"flex-start",gap:6,fontSize:11,color:C.txd,cursor:"pointer",marginBottom:6}}>
                <input type="checkbox" checked={deltaMode} onChange={e=>setDeltaMode(e.target.checked)} style={{accentColor:C.cy,marginTop:1}}/>
                <span><b style={{color:C.cy}}>Δ Delta mode</b> — fetch the current org values first and <b>send only the fields that actually changed</b>; rows where nothing differs are skipped entirely. Cuts API writes massively on recurring syncs. (Adds a read pass before writing; lookup bindings are always sent.)</span>
              </label>}
              {uKey.d&&deleteMode&&<div style={{fontSize:11,color:C.rd,marginBottom:6,padding:"6px 8px",background:C.rd+"11",borderRadius:4,border:`1px solid ${C.rd}44`}}>⚠ <b>Permanent deletion.</b> Each row's key value identifies a record to <b>delete</b>. This cannot be undone. Rows with no matching record fail (404). A typed confirmation is required on the Preview step.</div>}
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
            <div style={{padding:"8px 12px",borderBottom:`1px solid ${C.bd}`,display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:6}}>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <span style={{fontWeight:600,fontSize:14}}>Mapping</span>
                <div style={{position:"relative"}}>
                  <button onClick={()=>setShowTemplates(v=>!v)} style={{padding:"3px 9px",fontSize:11,background:showTemplates?C.vi:"transparent",color:showTemplates?"white":C.cy,border:`1px solid ${showTemplates?C.vi:C.cy+"55"}`,borderRadius:4,cursor:"pointer",fontWeight:600}} title="Load a saved mapping template for this entity">📋 Templates{entityTemplates.length>0?` (${entityTemplates.length})`:""}</button>
                  {showTemplates&&(
                    <div style={{position:"absolute",top:"calc(100% + 4px)",left:0,minWidth:280,maxWidth:380,maxHeight:300,overflow:"auto",background:C.sf,border:`1px solid ${C.bd}`,borderRadius:6,boxShadow:"0 8px 24px rgba(0,0,0,.3)",zIndex:50,padding:6}}>
                      {entityTemplates.length===0?(
                        <div style={{padding:"8px 10px",fontSize:12,color:C.txd,fontStyle:"italic"}}>No saved templates for {target}. Save one from the Preview step.</div>
                      ):entityTemplates.map(t=>(
                        <div key={t.id} style={{display:"flex",alignItems:"center",gap:6,padding:"5px 6px",borderRadius:4}} onMouseEnter={e=>e.currentTarget.style.background=C.sfh} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                          <button onClick={()=>applyTemplate(t)} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"flex-start",gap:1,background:"transparent",border:"none",cursor:"pointer",textAlign:"left",color:C.tx}}>
                            <span style={{fontSize:13,fontWeight:600}}>{t.name}</span>
                            <span style={{fontSize:10,color:C.txd}}>{(t.maps||[]).filter(m=>m.d365).length} cols · {(t.lookups||[]).length} lookups · {t.uKey?.d?"UPSERT":"CREATE"} · {String(t.savedAt||"").substring(0,10)}</span>
                          </button>
                          <button onClick={()=>deleteTemplate(t.id)} title="Delete template" style={{background:"none",border:"none",color:C.txd,cursor:"pointer",padding:2,fontSize:12}}>🗑</button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <span style={{fontSize:12,color:C.txd}}>{csvFile?.name} — {csvData.r.length} rows</span>
            </div>
            {/* Parse transparency: when the file has far more LINES than parsed RECORDS, say so —
                quoted line breaks inside cells (multiline/HTML) are the usual, legitimate reason.
                A single field holding hundreds of line breaks is the unclosed-quote signature:
                everything after it was swallowed into one cell, i.e. the file tail wasn't imported. */}
            {parseInfo&&!parseInfo.badParse&&csvData.r.length>0&&parseInfo.rawLines>csvData.r.length*1.3+10&&(
              <div style={{padding:"8px 12px",fontSize:11.5,lineHeight:1.6,color:C.txm,background:(parseInfo.maxNl>200?C.rd:C.yw)+"0c",borderBottom:`1px solid ${(parseInfo.maxNl>200?C.rd:C.yw)}44`}}>
                {parseInfo.maxNl>200
                  ?<span style={{color:C.rd}}>⚠ Your file has <b>{parseInfo.rawLines.toLocaleString()}</b> lines but parsed into only <b>{csvData.r.length.toLocaleString()}</b> records — and one field around record <b>{parseInfo.maxNlRow.toLocaleString()}</b> contains {parseInfo.maxNl.toLocaleString()} line breaks. That is the signature of an <b>unclosed quote (")</b>: everything after it was swallowed into a single cell and will NOT be imported. Fix the stray quote near that row in the source file, then reload.</span>
                  :<span>ℹ Your file has <b>{parseInfo.rawLines.toLocaleString()}</b> lines but parsed into <b>{csvData.r.length.toLocaleString()}</b> records — cells containing quoted line breaks (multiline / HTML content) span several file lines each, which is normal. If you expected ~{parseInfo.rawLines.toLocaleString()} records, check the source export instead.</span>}
              </div>
            )}
            {templateNote&&<div style={{padding:"6px 12px",fontSize:11,color:C.cy,background:C.cy+"0c",borderBottom:`1px solid ${C.bd}`,display:"flex",justifyContent:"space-between",gap:8}}><span>✓ {templateNote}</span><button onClick={()=>setTemplateNote("")} style={{background:"none",border:"none",color:C.txd,cursor:"pointer",fontSize:11}}>✕</button></div>}
            <div style={{overflow:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",fontSize:13,minWidth:460}}>
              <thead><tr style={{background:C.bg}}><th style={ths()}>CSV</th><th style={{...ths(),width:24}}></th><th style={ths()}>D365</th><th style={ths()}>Transform</th><th style={ths()}>Preview</th><th style={{...ths(),width:24}}></th></tr></thead>
              <tbody>{maps.map((m,i)=>{
                const isSystem=m.skip||(["createdon","modifiedon","createdby","modifiedby","versionnumber","overriddencreatedon"].includes(m.d365?.toLowerCase())&&!(migrationActive&&MIGRATION_FIELDS.includes(m.d365?.toLowerCase())));
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
                  <option value="strip_html">strip HTML → plain text</option>
                  <option value="upper">UPPER</option>
                  <option value="lower">lower</option>
                </select>}</td>
                <td style={{...tds,color:C.txd,maxWidth:80,fontSize:12}}>{csvData.r[0]?.[m.csv]||"—"}</td>
                <td style={tds}><button onClick={()=>setMaps(maps.filter((_,j)=>j!==i))} style={{background:"none",border:"none",color:C.txd,cursor:"pointer",padding:2}}><I.Trash/></button></td>
              </tr>);})}</tbody>
            </table></div>
          </div>
          <div style={{display:"flex",justifyContent:"flex-end",marginTop:12,gap:6}}><button onClick={()=>setStep(0)} style={bt()}>← Back</button>{lookups.length===0&&<button onClick={()=>setStep(2)} style={bt(null)} title="Add a lookup manually — e.g. for non-GUID / Salesforce IDs that weren't auto-detected">🔍 Lookups (add) →</button>}<button onClick={()=>setStep(lookups.length>0?2:3)} style={bt(`linear-gradient(135deg,${C.vi},${C.vil})`)}>{lookups.length>0?"Lookups →":"Preview →"}</button></div>
        </div>
      )}

      {step===2&&(
        <div>
          <div style={{...crd({padding:bp.mobile?12:14}),marginBottom:12}}>
            <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:10}}><I.Link/><span style={{fontWeight:600,fontSize:15}}>Parent Lookups</span></div>
            {lookups.length===0?<div style={{textAlign:"center",padding:"14px 0",color:C.txd}}><p style={{marginBottom:4,fontWeight:600,color:C.txm}}>No lookup columns were auto-detected.</p><p style={{marginBottom:10,fontSize:12,maxWidth:560,marginLeft:"auto",marginRight:"auto",lineHeight:1.6}}>Auto-detect only flags columns whose values are Dataverse <b>GUIDs</b>. If your lookup values are non-GUID IDs (e.g. Salesforce IDs like <code style={{...mono,fontSize:11,color:C.cy}}>005To000002TH5xIAG</code>), add the lookup here and <b>resolve</b> it — match that ID against a field on the target record (an alternate key, or a custom "original ID" field you migrated). A raw Salesforce ID cannot bind a Dataverse lookup directly.</p><button onClick={()=>setLookups([...lookups,{src:"",csv:"",entity:"",nav:"",d365f:"",fb:"skip",mode:"resolve"}])} style={bt(null,{fontSize:13})}><I.Plus/> Add a lookup</button></div>
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
                    <div style={{position:"relative"}}><label style={{fontSize:11,color:C.txm,fontWeight:500,display:"block",marginBottom:2}}>Target entity</label>
                      <input value={lk.entity}
                        onChange={e=>{const u=[...lookups];u[i]={...lk,entity:e.target.value};setLookups(u);setLkEntOpen(i);}}
                        onFocus={()=>setLkEntOpen(i)}
                        onBlur={()=>setTimeout(()=>setLkEntOpen(o=>o===i?null:o),120)}
                        onKeyDown={e=>{if(e.key==="Escape")setLkEntOpen(null);}}
                        placeholder="search a table (account, contact…)" style={inp({fontSize:13,...mono})}/>
                      {lkEntOpen===i&&(()=>{
                        const q=(lk.entity||"").trim().toLowerCase();
                        const matches=(q?entityList.filter(e=>(e.l||"").toLowerCase().includes(q)||(e.d||"").toLowerCase().includes(q)):entityList).slice(0,50);
                        if(!matches.length) return null;
                        return <div style={{position:"absolute",top:"100%",left:0,right:0,zIndex:20,background:C.sf,border:`1px solid ${C.bd}`,borderRadius:6,marginTop:2,maxHeight:240,overflow:"auto",boxShadow:"0 8px 24px rgba(0,0,0,.4)"}}>
                          {matches.map(e=>(
                            <button key={e.l} onMouseDown={ev=>ev.preventDefault()}
                              onClick={()=>{const u=[...lookups];u[i]={...lk,entity:e.l};setLookups(u);setLkEntOpen(null);}}
                              style={{width:"100%",textAlign:"left",padding:"6px 10px",border:"none",cursor:"pointer",background:lk.entity===e.l?C.sfa:"transparent",color:C.tx,fontSize:13}}
                              onMouseEnter={ev=>ev.currentTarget.style.background=C.sfh} onMouseLeave={ev=>ev.currentTarget.style.background=lk.entity===e.l?C.sfa:"transparent"}>
                              {e.d||e.l} <span style={{color:C.txd,...mono,fontSize:11}}>({e.l})</span>
                            </button>
                          ))}
                        </div>;
                      })()}
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
            {[{l:"Records",v:csvData.r.length,c:C.cy},{l:"Columns",v:maps.filter(m=>m.d365).length,c:C.gn},{l:"Lookups",v:lookups.length,c:C.yw},{l:"Mode",v:uKey.d?(deleteMode?"DELETE":updateOnly?"UPDATE":"UPSERT"):"CREATE",c:deleteMode?C.rd:C.vi}].map((m,i)=><div key={i} style={{...crd({padding:"10px 12px",textAlign:"center"})}}><div style={{fontSize:18,fontWeight:700,color:m.c}}>{m.v}</div><div style={{fontSize:11,color:C.txd,marginTop:1}}>{m.l}</div></div>)}
          </div>

          {/* Reassurance sentence — plain-language description of exactly what Load will do */}
          {(()=>{
            const entDisplay=entityList.find(e=>e.l===target)?.d||target;
            const n=csvData.r.length;
            const mode=uKey.d?(deleteMode?"delete":updateOnly?"update":"upsert"):"create";
            const accent=mode==="delete"?C.rd:mode==="update"?C.or:mode==="upsert"?C.cy:C.gn;
            return (<div style={{...crd({padding:"10px 12px",background:accent+"0c",borderColor:accent+(mode==="delete"?"66":"44")}),marginBottom:12,fontSize:13,color:C.tx}}>
              {mode==="delete"
                ? <>🗑 Will <b style={{color:C.rd}}>permanently DELETE {n.toLocaleString()}</b> record{n>1?"s":""} from <b>{entDisplay}</b> matched on <code style={{...mono,fontSize:12,color:C.rd}}>{uKey.d}</code>. <b style={{color:C.rd}}>This cannot be undone.</b> Rows with no matching record fail (404).</>
                : mode==="upsert"
                ? <>Will <b style={{color:C.cy}}>UPSERT {n.toLocaleString()}</b> record{n>1?"s":""} into <b>{entDisplay}</b> — existing records matched on <code style={{...mono,fontSize:12,color:C.cy}}>{uKey.d}</code> are updated, the rest are created.</>
                : mode==="update"
                ? <>Will <b style={{color:C.or}}>UPDATE {n.toLocaleString()}</b> existing record{n>1?"s":""} in <b>{entDisplay}</b> matched on <code style={{...mono,fontSize:12,color:C.or}}>{uKey.d}</code> — rows with <b>no matching record fail</b> (nothing is created).</>
                : <>Will <b style={{color:C.gn}}>CREATE {n.toLocaleString()}</b> new record{n>1?"s":""} in <b>{entDisplay}</b>.</>}
              {canShowSpeedBoosters&&(bypassPlugins||suppressDuplicates||bypassAsyncLogic)&&<span style={{color:C.or}}> · ⚠ server-side logic bypassed (boosters on)</span>}
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
            keyWarnings.forEach((w,wi)=>warnings.push({k:"key"+wi,t:w}));
            sfIdWarnings.forEach((w,wi)=>warnings.push({k:"sfid"+wi,t:w}));
            // Non-writable fields mapped for the chosen mode (calculated/rollup/read-only → 400 per row)
            if(!deleteMode){
              const isUpdateMode=uKey.d&&updateOnly;
              const nonWritable=maps.filter(m=>{if(!m.d365||m.skip)return false;if(migrationActive&&MIGRATION_FIELDS.includes(m.d365.toLowerCase()))return false;const meta=targetFieldsMeta.find(f=>(f.logical||f.l)===m.d365);if(!meta)return false;return isUpdateMode?(meta.validForUpdate===false):(meta.validForCreate===false);}).map(m=>m.d365);
              if(nonWritable.length) warnings.push({k:"ro",t:`${nonWritable.length} field${nonWritable.length>1?"s":""} not writable in ${isUpdateMode?"UPDATE":"CREATE/UPSERT"}: ${nonWritable.slice(0,5).join(", ")}${nonWritable.length>5?` +${nonWritable.length-5}`:""} — calculated/rollup/read-only fields will fail per row. Unmap them.`});
            }
            // Mapped text values longer than the target field MaxLength → 400 per row (the classic
            // failure when migrating HTML into a rich-text field). Pre-computed over the whole file.
            for(const lw of lengthWarnings){
              warnings.push({k:"len_"+lw.field,t:`"${lw.field}" max length is ${lw.max.toLocaleString()}, but ${lw.count.toLocaleString()} row${lw.count>1?"s":""} exceed it (longest: ${lw.maxFound.toLocaleString()} chars) — those rows will fail with a 400. Increase the field length, or trim/clean the value (common when migrating HTML / rich text).`});
            }
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
{JSON.stringify((() => {const row=csvData.r[0]||{};const rec={};maps.forEach(m=>{if(!m.d365||m.skip)return;
  // Mirror the RUN exactly (same rules as buildRequestForRow/doLoad): system fields dropped, EMPTY
  // cells OMITTED (empty ≠ clear — only the NULL token clears), the column's transform applied
  // (a "No" with the boolean transform must preview as false), migration fields remapped like the
  // run. Option-set labels can't resolve before the run loads the option maps — annotate instead.
  if(isSystemField(m.d365))return;
  const rawVal=row[m.csv];
  if(rawVal===undefined||rawVal===null||rawVal==="")return;
  const lc=m.d365.toLowerCase();
  if(isNullToken(rawVal)){if(!(migrationActive&&MIGRATION_FIELDS.includes(lc)))rec[m.d365]=null;return;}
  const val=m.transform?applyTransform(rawVal,m.transform,optionMapsRef.current?.[m.d365],dateMD):rawVal;
  const shown=(val===null&&String(rawVal).trim()!==""&&(m.transform==="picklist"||m.transform==="statecode"))?`${rawVal} → (option value resolved at run time)`:val;
  if(shown===null||shown===undefined||shown==="")return;
  if(migrationActive&&MIGRATION_FIELDS.includes(lc))emitMigrationField(rec,lc,shown);
  else rec[m.d365]=shown;
});lookups.forEach(lk=>{if(!lk.csv||!lk.nav)return;const nav=canonNav(lk.nav);const val=row[lk.csv];const es=entitySetFor(lk.entity)||"?";
  if(!val)return; // empty lookup cell → the run skips the binding entirely
  if(isNullToken(val)){rec[nav]=null;return;}
  if(lk.mode==="direct"){rec[`${nav}@odata.bind`]=`/${es}(${val})`;}
  else if(isAltKeyBind(lk)){rec[`${nav}@odata.bind`]=`/${es}(${lk.d365f}='${String(val).replace(/'/g,"''")}')`;}
  else{rec[`${nav}@odata.bind`]=`/${es}(<resolved at run time>)`;}
});return rec;})(),null,2)}
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
                <Tooltip text="Records per multipart $batch sent to Dataverse in ONE roundtrip. Larger = fewer roundtrips & faster, but a slow record blocks the whole batch and cancel waits for the in-flight batch to finish (so larger = slower to cancel). Sweet spot 100-300. Drop to 50 if you see HTTP 504 timeouts or want a snappier cancel."/>
                <input type="number" min="1" max="500" value={batchSize} onChange={e=>setBatchSize(Math.max(1,Math.min(500,parseInt(e.target.value,10)||100)))} style={inp({width:80,fontSize:13,...mono,padding:"5px 8px"})}/>
                <span style={{fontSize:11,color:C.txd}}>records / HTTP $batch (1-500)</span>
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
          <div style={{...crd({padding:12,borderColor:(bypassPlugins||suppressDuplicates||bypassAsyncLogic)?C.or+"55":C.bd}),marginBottom:12}}>
            <div style={{fontSize:13,fontWeight:600,marginBottom:8,display:"flex",alignItems:"center",gap:6}}>
              <span>🚀 Speed boosters</span>
              <span style={{fontSize:10,color:C.txd,fontWeight:400}}>(advanced — bypass server-side processes per record)</span>
            </div>
            {(bypassPlugins||suppressDuplicates||bypassAsyncLogic) && (
              <div style={{fontSize:11,color:C.or,marginBottom:8,padding:"6px 8px",background:C.or+"11",borderRadius:4,border:`1px solid ${C.or}33`}}>
                ⚠ One or more boosters enabled — server-side business logic will be skipped. Requires <code style={{...mono,fontSize:11}}>prvBypassCustomPlugins</code> privilege (typically System Administrator). Records with invalid data may bypass validation. Use only when input data is already validated externally.
              </div>
            )}
            <div style={{display:"flex",flexDirection:"column",gap:6}}>
              <label style={{display:"flex",alignItems:"center",gap:8,fontSize:12,color:C.tx,cursor:"pointer"}}>
                <input type="checkbox" checked={bypassPlugins} onChange={e=>setBypassPlugins(e.target.checked)} style={{accentColor:C.or}}/>
                <span style={{fontWeight:600}}>Bypass custom synchronous logic</span>
                <Tooltip text="Sets MSCRM.BypassCustomPluginExecution: true on each request. Skips ALL custom SYNCHRONOUS logic — synchronous plug-ins AND real-time (synchronous) workflows — for the duration of the import. Microsoft plug-ins/workflows and other publishers' solutions are NOT bypassed. Requires the prvBypassCustomPlugins privilege (System Administrator by default). Typical gain: 100-500ms per record. Warning: skips business logic that may include validation, defaulting, calculated fields, audit overrides."/>
                <code style={{...mono,fontSize:11,color:C.txd}}>MSCRM.BypassCustomPluginExecution</code>
              </label>
              <label style={{display:"flex",alignItems:"center",gap:8,fontSize:12,color:C.tx,cursor:"pointer"}}>
                <input type="checkbox" checked={suppressDuplicates} onChange={e=>setSuppressDuplicates(e.target.checked)} style={{accentColor:C.or}}/>
                <span style={{fontWeight:600}}>Suppress duplicate detection</span>
                <Tooltip text="Sets MSCRM.SuppressDuplicateDetection: true on each request. Skips duplicate detection rules for the entity. Typical gain: 50-200ms per record if rules are active. Warning: may create true duplicates if your CSV has them."/>
                <code style={{...mono,fontSize:11,color:C.txd}}>MSCRM.SuppressDuplicateDetection</code>
              </label>
              <label style={{display:"flex",alignItems:"center",gap:8,fontSize:12,color:C.tx,cursor:"pointer"}}>
                <input type="checkbox" checked={bypassAsyncLogic} onChange={e=>setBypassAsyncLogic(e.target.checked)} style={{accentColor:C.or}}/>
                <span style={{fontWeight:600}}>Bypass custom asynchronous logic</span>
                <Tooltip text="Adds CustomAsync to MSCRM.BypassBusinessLogicExecution (Microsoft's current bypass parameter — combined with the sync box it sends CustomSync,CustomAsync in one header). Skips ASYNCHRONOUS custom plug-ins and background workflows so they don't queue up as a flood of system jobs during a bulk load. Requires the prvBypassCustomBusinessLogic privilege (System Administrator by default). Note: Power Automate flows are a separate mechanism and are NOT bypassed by this."/>
                <code style={{...mono,fontSize:11,color:C.txd}}>MSCRM.BypassBusinessLogicExecution</code>
              </label>
            </div>
          </div>
          )}

          {/* Migration mode — override created-on/by at CREATE time (preserve original audit values) */}
          <div style={{...crd({padding:12,borderColor:migrationMode?C.vi+"55":C.bd}),marginBottom:12}}>
            <label style={{display:"flex",alignItems:"center",gap:8,fontSize:13,fontWeight:600,cursor:"pointer"}}>
              <input type="checkbox" checked={migrationMode} onChange={e=>setMigrationMode(e.target.checked)} style={{accentColor:C.vi}}/>
              <span>🕰️ Migration mode — keep original created/modified audit fields</span>
              <Tooltip text="Lets you map createdon (→ overriddencreatedon), modifiedon, createdby and modifiedby so migrated records keep their original audit values. Works ONLY on create (no upsert/update key, not delete). Requires the prvOverrideCreatedOnCreatedBy privilege ('Override Created On or Created By during Data Import') — without it Dataverse ignores or rejects these values."/>
            </label>
            {migrationMode&&(
              <div style={{fontSize:11,marginTop:8,padding:"6px 8px",borderRadius:4,lineHeight:1.6,...(migrationActive?{color:C.vi,background:C.vi+"11",border:`1px solid ${C.vi}33`}:{color:C.yw,background:C.yw+"11",border:`1px solid ${C.yw}33`})}}>
                {migrationActive
                  ?<>✓ Active. Map <code style={{...mono,fontSize:11}}>createdon</code> (→ overriddencreatedon), <code style={{...mono,fontSize:11}}>modifiedon</code>, <code style={{...mono,fontSize:11}}>createdby</code>, <code style={{...mono,fontSize:11}}>modifiedby</code>. createdby/modifiedby take a systemuser GUID (bound automatically). Requires the <code style={{...mono,fontSize:11}}>prvOverrideCreatedOnCreatedBy</code> privilege.</>
                  :<>⚠ Applies to pure CREATE only. Remove the UPSERT/UPDATE key and turn off Delete — with a key set, these audit fields are stripped as usual.</>}
              </div>
            )}
          </div>

          {/* Date format — only relevant when a column uses the date transform. d/m/Y is ambiguous
              (03/04/2024 = 4 Mar in EU, 3 Apr in US); let the user pick rather than silently corrupt. */}
          {maps.some(m=>m.transform==="date_iso")&&(
            <div style={{...crd({padding:12}),marginBottom:12}}>
              <div style={{fontSize:13,fontWeight:600,marginBottom:6,display:"flex",alignItems:"center",gap:6}}>
                <span>📅 Date format for ambiguous dates</span>
                <Tooltip text="Applies to columns using the 'date_iso' transform when the source is d/m/Y or m/d/Y (e.g. 03/04/2024). ISO dates (2024-03-04) and unambiguous ones (day part > 12) are detected automatically and ignore this setting. Salesforce/US exports are usually month-first."/>
              </div>
              <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                <label style={{display:"flex",alignItems:"center",gap:6,fontSize:12,cursor:"pointer",padding:"5px 10px",borderRadius:6,border:`1px solid ${!dateMD?C.vi:C.bd}`,background:!dateMD?C.vi+"11":"transparent",color:!dateMD?C.vi:C.txm,fontWeight:!dateMD?600:400}}>
                  <input type="radio" name="dateMD" checked={!dateMD} onChange={()=>setDateMD(false)} style={{accentColor:C.vi}}/>
                  <span>Day first — d/m/Y (EU)</span>
                </label>
                <label style={{display:"flex",alignItems:"center",gap:6,fontSize:12,cursor:"pointer",padding:"5px 10px",borderRadius:6,border:`1px solid ${dateMD?C.vi:C.bd}`,background:dateMD?C.vi+"11":"transparent",color:dateMD?C.vi:C.txm,fontWeight:dateMD?600:400}}>
                  <input type="radio" name="dateMD" checked={dateMD} onChange={()=>setDateMD(true)} style={{accentColor:C.vi}}/>
                  <span>Month first — m/d/Y (US / Salesforce)</span>
                </label>
              </div>
            </div>
          )}

          {/* Save the current mapping + lookups + key as a reusable template for this entity */}
          <div style={{...crd({padding:"8px 12px"}),marginBottom:12,display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
            <span style={{fontSize:12,color:C.txm,fontWeight:500}}>💾 Save this mapping as a template</span>
            <input value={saveTplName} onChange={e=>setSaveTplName(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")saveTemplate(saveTplName);}} placeholder={`e.g. ${target} SAP import`} style={inp({flex:1,minWidth:160,fontSize:13,padding:"5px 8px"})}/>
            <button onClick={()=>saveTemplate(saveTplName)} disabled={!saveTplName.trim()} style={bt(saveTplName.trim()?`linear-gradient(135deg,${C.vi},${C.vil})`:null,{fontSize:12,opacity:saveTplName.trim()?1:0.5})}>Save template</button>
            <span style={{fontSize:11,color:C.txd}}>Reusable next time from the Mapping step (📋 Templates).</span>
          </div>
          {/* DELETE requires a typed confirmation before the action is enabled */}
          {deleteMode&&(()=>{
            const confirmOk=deleteConfirm.trim().toLowerCase()===target.toLowerCase();
            return (<div style={{...crd({padding:"10px 12px",background:C.rd+"0c",borderColor:C.rd+"66"}),marginBottom:12}}>
              <div style={{fontSize:12,color:C.rd,fontWeight:600,marginBottom:6}}>🗑 Permanent deletion — type the entity name <code style={{...mono,fontSize:12,background:C.rd+"22",padding:"1px 5px",borderRadius:3}}>{target}</code> to confirm</div>
              <input value={deleteConfirm} onChange={e=>setDeleteConfirm(e.target.value)} placeholder={`type "${target}" to enable Delete`} style={inp({fontSize:13,...mono,maxWidth:300,borderColor:confirmOk?C.gn:C.rd})}/>
              {confirmOk&&<span style={{color:C.gn,fontSize:12,marginLeft:8}}>✓ confirmed</span>}
            </div>);
          })()}
          <div style={{display:"flex",justifyContent:"flex-end",gap:6,flexWrap:"wrap"}}><button onClick={()=>setStep(lookups.length>0?2:1)} style={bt()}>← Back</button><button onClick={()=>{const cfg={d365_entity:target,upsert_key:uKey.d,fields:Object.fromEntries(maps.filter(m=>m.d365).map(m=>[m.csv,m.d365])),lookups:lookups.map(lk=>({source_field:lk.src,d365_target_entity:lk.entity,d365_navigation_property:lk.nav,resolve_by:{csv_column:lk.csv,d365_field:lk.d365f},fallback:lk.fb}))};dl(JSON.stringify(cfg,null,2),"application/json",expName(`load_${target}`,"json"));}} style={bt()}><I.Download/> YAML</button>
            {/* Dry run: full simulation, zero writes — available in every mode (DELETE included,
                without the typed confirmation since nothing is deleted). */}
            <button onClick={()=>runLoad(true)} style={bt(null,{borderColor:C.cy,color:C.cy})} title="Simulate the whole run — parsing, transforms, lookups, existence checks — without writing anything">🔍 Dry run</button>
            {deleteMode
              ? <button onClick={()=>runLoad(false)} disabled={deleteConfirm.trim().toLowerCase()!==target.toLowerCase()} style={bt(deleteConfirm.trim().toLowerCase()===target.toLowerCase()?`linear-gradient(135deg,${C.rd},${C.rd}cc)`:null,{opacity:deleteConfirm.trim().toLowerCase()===target.toLowerCase()?1:0.5})}>🗑 Delete records</button>
              : <button onClick={()=>runLoad(false)} style={bt(`linear-gradient(135deg,${C.gn},${C.cyd})`)}><I.Zap/> Load</button>}
          </div>
        </div>
      )}

      {step===4&&(
        <div style={{padding:"20px 0"}}>
          {loadError&&!result?(
            <div style={{...crd({padding:"16px 18px",background:C.rd+"0c",borderColor:C.rd+"66"}),maxWidth:700,margin:"0 auto"}}>
              <div style={{fontSize:15,fontWeight:700,color:C.rd,marginBottom:8,display:"flex",alignItems:"center",gap:8}}>⛔ The import failed — exact error below</div>
              <div style={{fontSize:13,color:C.tx,marginBottom:10,lineHeight:1.5,...mono,whiteSpace:"pre-wrap",wordBreak:"break-word",background:C.bg,border:`1px solid ${C.bd}`,borderRadius:6,padding:"8px 10px"}}>{loadError.message}</div>
              {loadError.stack&&<details style={{marginBottom:10}}><summary style={{fontSize:12,color:C.txd,cursor:"pointer"}}>Technical details (stack trace)</summary><pre style={{margin:"6px 0 0",padding:8,background:C.bg,border:`1px solid ${C.bd}`,borderRadius:6,fontSize:11,...mono,color:C.txm,maxHeight:200,overflow:"auto",whiteSpace:"pre-wrap",wordBreak:"break-word"}}>{loadError.stack}</pre></details>}
              <div style={{fontSize:11,color:C.txd,marginBottom:12,lineHeight:1.6}}>Any records sent before the failure were kept; nothing else was changed.{createdIdsRef.current.length?` ${createdIdsRef.current.length.toLocaleString()} record(s) were created.`:""}{loadError.when?` · ${loadError.when}`:""}</div>
              <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                <button onClick={()=>{setLoadError(null);setStep(lookups.length>0?2:1);}} style={bt(`linear-gradient(135deg,${C.vi},${C.vil})`,{fontSize:13})}>← Back to mapping</button>
                <button onClick={()=>dl(`Error:\n${loadError.message}\n\nStack:\n${loadError.stack||""}`,"text/plain;charset=utf-8",expName("import_error","txt",true))} style={bt(null,{fontSize:12})}><I.Download/> Save error</button>
              </div>
            </div>
          ):!result?(
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
                    {liveLog.counts.UPSERTED>0&&<span style={{color:C.cy,fontWeight:600}}>● {liveLog.counts.UPSERTED.toLocaleString()} {updateOnly?"updated":"upserted"}</span>}
                    {liveLog.counts.DELETED>0&&<span style={{color:C.rd,fontWeight:600}}>● {liveLog.counts.DELETED.toLocaleString()} deleted</span>}
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
                const totalProcessed=liveLog.counts.CREATED+liveLog.counts.UPSERTED+(liveLog.counts.DELETED||0)+liveLog.counts.ERROR;
                const visibleEntries=liveLog.entries;
                const exportLiveLog=()=>{
                  const esc=(v)=>{let s=String(v??"");if(/^[=+\-@\t\r]/.test(s))s="'"+s;return s.includes(",")||s.includes('"')||s.includes("\n")?`"${s.replace(/"/g,'""')}"`:s;};
                  // Each row now also carries the exact request that was sent: Method, Request URL, and Payload (JSON).
                  const header=["CSV row","Status","Method","Request URL","Payload",...csvData.h,"Error detail"].map(esc).join(",");
                  const lines=fullLog.current.map(e=>{const orig=e.csvRowNumber>=2?csvData.r[e.csvRowNumber-2]:null;const req=buildRequestForRow(orig);return [e.csvRowNumber||0,e.status,req?req.method:"",req?esc(`/api/data/v9.2/${req.path}`):"",req&&req.body?esc(JSON.stringify(req.body)):"",...csvData.h.map(h=>esc(orig?.[h]??"")),esc(e.status==="ERROR"?(e.msg||""):"")].join(",");});
                  dl("﻿"+[header,...lines].join("\n"),"text/csv;charset=utf-8",expName(`live_log_${target}`,"csv",true));
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
                        const isExpanded=expandedLog===e.csvRowNumber;
                        const totalCols=2+csvData.h.length+1; // line + columns + status + detail
                        const req=isExpanded?buildRequestForRow(e.csvRow):null;
                        return (
                          <Fragment key={`${e.row}-${i}`}>
                          <tr onClick={()=>setExpandedLog(isExpanded?null:e.csvRowNumber)} title="Click to see the request sent for this row" style={{borderBottom:`1px solid ${C.bd}`,background:isExpanded?C.vi+"11":isError?C.rd+"08":"transparent",cursor:"pointer"}}>
                            <td style={{...tds,fontWeight:600,...mono,color:C.txm}}>{isExpanded?"▾ ":"▸ "}{(e.csvRowNumber||0).toLocaleString()}</td>
                            {csvData.h.map(h=>{
                              const val=e.csvRow?.[h]??"";
                              return <td key={h} style={{...tds,color:C.txd,fontSize:11,...mono}} title={String(val)}>{String(val)}</td>;
                            })}
                            <td style={{...tds,textAlign:"center"}}><span style={{fontSize:10,padding:"2px 8px",borderRadius:3,background:sc+"22",color:sc,fontWeight:700}}>{label}</span></td>
                            <td style={{...tds,color:C.rd,fontSize:11,...mono,whiteSpace:"normal",wordBreak:"break-word"}}>{isError?(e.msg||"").substring(0,300):""}</td>
                          </tr>
                          {isExpanded&&req&&(
                            <tr style={{background:C.bg}}>
                              <td colSpan={totalCols} style={{padding:"8px 12px",borderBottom:`1px solid ${C.bd}`}}>
                                <div style={{fontSize:11,...mono,color:C.txm,marginBottom:4}}><span style={{color:req.method==="POST"?C.gn:req.method==="DELETE"?C.rd:C.or,fontWeight:700}}>{req.method}</span> <span style={{color:C.cy}}>/api/data/v9.2/{req.path}</span>{req.headers&&req.headers["If-Match"]?<span style={{color:C.or}}>  ·  If-Match: *</span>:null}</div>
                                <pre style={{margin:0,padding:8,background:C.sf,border:`1px solid ${C.bd}`,borderRadius:4,fontSize:11,...mono,color:C.tx,maxHeight:200,overflow:"auto",whiteSpace:"pre-wrap",wordBreak:"break-word"}}>{req.body?JSON.stringify(req.body,null,2):"(no request body — DELETE)"}</pre>
                                {isError&&<div style={{fontSize:11,color:C.rd,marginTop:4,...mono}}>↳ {e.msg}</div>}
                              </td>
                            </tr>
                          )}
                          </Fragment>
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
                <div style={{fontSize:38,marginBottom:8}}>{result.dryRun?"🔍":result.cancelled?"⏹":result.errors.length===0?"✅":"⚠️"}</div>
                <h2 style={{color:C.tx,fontWeight:700,fontSize:18,marginBottom:4}}>{result.dryRun?`Dry run done in ${result.elapsed}s`:result.cancelled?`Cancelled after ${result.elapsed}s`:`Done in ${result.elapsed}s`}</h2>
                {result.dryRun&&<div style={{fontSize:13,color:C.cy,fontWeight:600,marginTop:4}}>Simulation only — nothing was written to Dataverse. Numbers below show what a real run WOULD do.</div>}
                {result.cancelled&&<div style={{fontSize:13,color:C.txm,marginTop:4}}>{(result.created+result.updated)} records sent · {result.totalRows-(result.created+result.updated)} not processed</div>}
                {result.startedAt&&<div style={{fontSize:12,color:C.txd,marginTop:6,display:"flex",gap:14,justifyContent:"center",flexWrap:"wrap"}}>
                  <span>🕐 Started {result.startedAt.toLocaleString()}</span>
                  {result.finishedAt&&<span>🏁 Finished {result.finishedAt.toLocaleString()}</span>}
                </div>}
              </div>
              <div style={{display:"grid",gridTemplateColumns:bp.mobile?"1fr 1fr":"1fr 1fr 1fr 1fr",gap:8,maxWidth:500,margin:"0 auto 14px"}}>
                {(result.dryRun
                  ? (result.mode==="delete"
                    ? [{l:"Would delete",v:result.wouldDelete||0,c:C.rd},{l:"Not found",v:result.notFound||0,c:C.yw},{l:"Skipped",v:result.skipped,c:C.yw},{l:"Errors",v:result.errors.length,c:C.rd}]
                    : [{l:"Would create",v:result.wouldCreate||0,c:C.gn},{l:"Would update",v:result.wouldUpdate||0,c:C.cy},{l:"Would fail",v:result.wouldFail||0,c:C.rd},{l:"Errors/skips",v:result.errors.length+result.skipped,c:C.yw}])
                  : (result.mode==="delete"
                    ? [{l:"Deleted",v:result.deleted||0,c:C.rd},{l:"Skipped",v:result.skipped,c:C.yw},{l:"Errors",v:result.errors.length,c:C.rd}]
                    : [{l:"Created",v:result.created,c:C.gn},{l:"Updated",v:result.updated,c:C.cy},{l:"Skipped",v:result.skipped,c:C.yw},{l:"Errors",v:result.errors.length,c:C.rd}])
                ).map((m,i)=><div key={i} style={{...crd({padding:"8px 10px",textAlign:"center"})}}><div style={{fontSize:20,fontWeight:700,color:m.c}}>{m.v}</div><div style={{fontSize:11,color:C.txd}}>{m.l}</div></div>)}
              </div>

              {/* Rollback: delete the records this run just created (GUIDs captured from the batch
                  responses). Typed confirmation, same worker pool as DELETE mode. */}
              {!result.dryRun&&(createdIdsRef.current.length>0||createdMissingIdRef.current>0)&&!rollback?.done&&(
                <div style={{...crd({padding:"10px 12px",background:C.or+"0c",borderColor:C.or+"55"}),maxWidth:560,margin:"0 auto 14px"}}>
                  {rollback?.running?(
                    <div style={{fontSize:13,color:C.or,fontWeight:600}}>↩ Rolling back… {rollback.doneCount.toLocaleString()} / {rollback.total.toLocaleString()}</div>
                  ):(
                    <>
                      {createdIdsRef.current.length>0&&<div style={{fontSize:12,fontWeight:600,color:C.or,marginBottom:6}}>↩ Rollback — permanently delete the {createdIdsRef.current.length.toLocaleString()} records created by this run. Type <code style={{...mono,fontSize:12,background:C.or+"22",padding:"1px 5px",borderRadius:3}}>ROLLBACK</code> to confirm.</div>}
                      {createdMissingIdRef.current>0&&<div style={{fontSize:11,color:C.rd,marginBottom:6}}>⚠ {createdMissingIdRef.current.toLocaleString()} created record(s) had no GUID returned (e.g. via the serial fallback) and <b>cannot be rolled back here</b> — delete them manually if needed.</div>}
                      {createdIdsRef.current.length>0&&<div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
                        <input value={rollbackConfirm} onChange={e=>setRollbackConfirm(e.target.value)} placeholder='type "ROLLBACK"' style={inp({fontSize:13,...mono,maxWidth:220,borderColor:rollbackConfirm.trim()==="ROLLBACK"?C.gn:C.or})}/>
                        <button onClick={async()=>{
                          if(rollbackConfirm.trim()!=="ROLLBACK")return;
                          const ids=createdIdsRef.current;
                          const es=entitySetFor(result.entity||target);
                          setRollback({running:true,doneCount:0,total:ids.length});
                          try{
                            const res=await bridge.batchDeleteKeyed(es,(result.entity||target)+"id",ids.map(id=>({keyValue:id})),true,
                              p=>setRollback({running:true,doneCount:p.done,total:p.total}),()=>false,{chunk:batchSize,concurrency:threads});
                            setRollback({running:false,done:true,deleted:res.deleted||0,failed:(res.errors||[]).length,total:ids.length});
                          }catch(e){ setRollback({running:false,done:true,deleted:0,failed:ids.length,total:ids.length,error:e.message}); }
                        }} disabled={rollbackConfirm.trim()!=="ROLLBACK"} style={bt(rollbackConfirm.trim()==="ROLLBACK"?`linear-gradient(135deg,${C.or},${C.rd})`:null,{fontSize:12,opacity:rollbackConfirm.trim()==="ROLLBACK"?1:0.5})}>↩ Rollback created records</button>
                      </div>}
                    </>
                  )}
                </div>
              )}
              {rollback?.done&&(
                <div style={{...crd({padding:"10px 12px",background:(rollback.failed?C.rd:C.gn)+"0c",borderColor:(rollback.failed?C.rd:C.gn)+"55"}),maxWidth:560,margin:"0 auto 14px",fontSize:13,color:rollback.failed?C.rd:C.gn,fontWeight:600}}>
                  {rollback.error?`Rollback failed: ${rollback.error}`:`↩ Rollback finished — ${rollback.deleted.toLocaleString()} deleted${rollback.failed?`, ${rollback.failed} failed`:""} (of ${rollback.total.toLocaleString()}).`}
                </div>
              )}

              {!result.dryRun&&(result.retryAll?.length>0)&&(()=>{
                const tCount=result.retryTransient?.length||0;
                const aCount=result.retryAll.length;
                const hasTransient=tCount>0;
                const accent=hasTransient?C.cy:C.yw; // cyan = retry-friendly; amber = deterministic, retry won't help
                return (
                <div style={{...crd({padding:"12px 14px",background:accent+"0c",borderColor:accent+"55"}),maxWidth:560,margin:"0 auto 14px"}}>
                  {result.retryInfo&&(
                    <div style={{fontSize:12.5,color:result.retryInfo.stillFailing?C.yw:C.gn,fontWeight:600,marginBottom:8}}>
                      🔁 Retry: {result.retryInfo.succeeded.toLocaleString()} of {result.retryInfo.attempted.toLocaleString()} succeeded{result.retryInfo.stillFailing?` · ${result.retryInfo.stillFailing.toLocaleString()} still failing`:" 🎉"}.
                    </div>
                  )}
                  <div style={{fontSize:13,fontWeight:600,marginBottom:8}}>
                    {hasTransient
                      ? `${aCount.toLocaleString()} row${aCount>1?"s":""} failed — retry the ${tCount.toLocaleString()} that look transient?`
                      : `${aCount.toLocaleString()} row${aCount>1?"s":""} failed — these look like data/permission errors, not transient ones.`}
                  </div>
                  <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
                    {hasTransient&&(
                      <button onClick={()=>retryFailed(true)} style={bt(`linear-gradient(135deg,${C.cy},${C.vi})`,{fontSize:13})}>🔁 Retry {tCount.toLocaleString()} transient error{tCount>1?"s":""}</button>
                    )}
                    {aCount>tCount&&(
                      <button onClick={()=>retryFailed(false)} style={bt(null,{fontSize:12})}>{hasTransient?`Retry all ${aCount.toLocaleString()} failed`:`Retry all ${aCount.toLocaleString()} anyway`}</button>
                    )}
                  </div>
                  <div style={{fontSize:11,color:C.txd,marginTop:8,lineHeight:1.6}}>
                    {hasTransient
                      ? <><b style={{color:C.cy}}>Transient</b> = timeouts, throttling (429), 5xx, deadlocks — safe to retry as-is (gentler concurrency, rollback still covers everything). The rest are usually data/permission errors (400/403/404) where a retry fails the same way — fix the data or re-import for those.</>
                      : <>A retry sends the same data, so these will fail the same way — <b style={{color:C.yw}}>unless you already fixed something org-side</b> (a missing record, a privilege, a field length). Otherwise check the error log below: most are likely <i>"no matching record"</i> (wrong / format-mismatched key) or a validation error — fix the data and re-import.</>}
                  </div>
                </div>
                );
              })()}

              {result.optionWarnings&&result.optionWarnings.length>0&&(
                <div style={{...crd({padding:"10px 12px",background:C.yw+"0c",borderColor:C.yw+"55"}),marginBottom:12}}>
                  <div style={{fontSize:12,fontWeight:600,color:C.yw,marginBottom:5}}>⚠ Option-set labels that matched no value (these cells were left empty)</div>
                  <ul style={{margin:0,paddingLeft:18,display:"flex",flexDirection:"column",gap:3}}>
                    {result.optionWarnings.map(w=><li key={w.field} style={{fontSize:12,color:C.txm,...mono}}>{w.field}: {w.labels.map(l=>`"${l}"`).join(", ")}</li>)}
                  </ul>
                  <div style={{fontSize:11,color:C.txd,marginTop:5,fontStyle:"italic"}}>Check the option-set's exact labels in Metadata Browser, or use numeric option values in the CSV.</div>
                </div>
              )}

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
                  <div style={{fontSize:11,color:C.txd,marginBottom:4,fontStyle:"italic"}}>Click a row to see the exact request that was sent.</div>
                  <div style={{maxHeight:300,overflow:"auto"}}>
                    <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
                      <thead><tr>
                        <th style={{...ths(),width:60}}>Row</th>
                        <th style={{...ths(),width:90}}>Status</th>
                        <th style={ths()}>Detail</th>
                      </tr></thead>
                      <tbody>{result.log.map((e,i)=>{
                        const sc=e.status==="CREATED"||e.status==="WOULD CREATE"?C.gn
                          :e.status==="UPSERTED"||e.status==="WOULD UPDATE"||e.status==="WOULD UPSERT"?C.cy
                          :e.status==="SKIPPED"||e.status==="NOT FOUND"||e.status==="UNCHANGED"?C.yw
                          :e.status==="WOULD DELETE"?C.or:C.rd;
                        const canExpand=e.row>=2; // has a CSV row to reconstruct (skip synthetic row 0 entries)
                        const isExpanded=canExpand&&expandedLog===e.row;
                        const req=isExpanded?buildRequestForRow(csvData.r[e.row-2]):null;
                        return(
                          <Fragment key={i}>
                          <tr onClick={()=>canExpand&&setExpandedLog(isExpanded?null:e.row)} style={{borderBottom:`1px solid ${C.bd}`,cursor:canExpand?"pointer":"default",background:isExpanded?C.vi+"11":"transparent"}} onMouseEnter={ev=>{if(!isExpanded)ev.currentTarget.style.background=C.sfh;}} onMouseLeave={ev=>{if(!isExpanded)ev.currentTarget.style.background="transparent";}}>
                            <td style={{...tds,fontWeight:600,...mono,color:C.txm}}>{canExpand?(isExpanded?"▾ ":"▸ "):""}{e.row}</td>
                            <td style={tds}><span style={{fontSize:11,padding:"2px 8px",borderRadius:3,background:sc+"22",color:sc,fontWeight:600}}>{e.status}</span></td>
                            <td style={{...tds,color:e.status==="ERROR"?C.rd:C.txm,fontSize:12,...mono}}>{e.detail}</td>
                          </tr>
                          {isExpanded&&req&&(
                            <tr style={{background:C.bg}}>
                              <td colSpan={3} style={{padding:"8px 12px",borderBottom:`1px solid ${C.bd}`}}>
                                <div style={{fontSize:11,...mono,color:C.txm,marginBottom:4}}><span style={{color:req.method==="POST"?C.gn:req.method==="DELETE"?C.rd:C.or,fontWeight:700}}>{req.method}</span> <span style={{color:C.cy}}>/api/data/v9.2/{req.path}</span>{req.headers&&req.headers["If-Match"]?<span style={{color:C.or}}>  ·  If-Match: *</span>:null}</div>
                                <pre style={{margin:0,padding:8,background:C.sf,border:`1px solid ${C.bd}`,borderRadius:4,fontSize:11,...mono,color:C.tx,maxHeight:220,overflow:"auto",whiteSpace:"pre-wrap",wordBreak:"break-word"}}>{req.body?JSON.stringify(req.body,null,2):"(no request body — DELETE)"}</pre>
                              </td>
                            </tr>
                          )}
                          </Fragment>
                        );
                      })}</tbody>
                    </table>
                  </div>
                </div>
              )}

              <div style={{display:"flex",justifyContent:"center",gap:8,marginTop:16,flexWrap:"wrap"}}>
                <button onClick={()=>{setStep(0);setCsvFile(null);setCsvData({h:[],r:[]});setResult(null);setPasteText("");setLoadProgress({done:0,total:0,current:""});setDeleteMode(false);setDeleteConfirm("");setUpdateOnly(false);}} style={bt(null)}>New import</button>
                <button onClick={()=>{
                  const esc=(v)=>{let s=String(v??"");if(/^[=+\-@\t\r]/.test(s))s="'"+s;return s.includes(",")||s.includes('"')||s.includes("\n")?`"${s.replace(/"/g,'""')}"`:s;};
                  // Export the COMPLETE log from fullLog ref (every processed row + columns), not the
                  // capped result.log. Reconstruct original columns from csvData.r via csvRowNumber.
                  const full=fullLog.current||[];
                  let lines, header;
                  if(full.length){
                    header=["CSV row","Status","Method","Request URL","Payload",...csvData.h,"Detail"].map(esc).join(",");
                    lines=full.map(e=>{const orig=e.csvRowNumber>=2?csvData.r[e.csvRowNumber-2]:null;const req=buildRequestForRow(orig);return [e.csvRowNumber||0,e.status,req?req.method:"",req?esc(`/api/data/v9.2/${req.path}`):"",req&&req.body?esc(JSON.stringify(req.body)):"",...csvData.h.map(h=>esc(orig?.[h]??"")),esc(e.status==="ERROR"?(e.msg||""):"OK")].join(",");});
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
                  dl("\uFEFF"+[header,...lines,...summary].join("\n"),"text/csv;charset=utf-8",expName(`colvio_load_${result.entity||target}`,"csv",true));
                }} style={bt(null,{color:C.gn})}><I.Download/> Download Log</button>
                {result.errors.length>0&&<button onClick={()=>{const csv=["Row,Error,Payload",...result.errors.map(e=>`${e.row},"${(e.msg||"").replace(/"/g,'""')}","${(e.payload||"").replace(/"/g,'""')}"`)].join("\n");dl("\uFEFF"+csv,"text/csv;charset=utf-8",expName(`load_errors_${result.entity||target}`,"csv",true));}} style={bt(null,{color:C.rd})}>Export errors CSV</button>}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
