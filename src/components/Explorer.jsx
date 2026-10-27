import { useState, useEffect, useRef } from "react";
import { normalizeODataInput, entityForSet, displayODataPath, looksLikeOData } from "../odataPaste.js";
import { createSink, cellValue, openOutput } from "../streamExport.js";
import { cookieFrom, pagedFetchXml, isCookieMismatch, fetchXmlColumns, streamColumns, uncoveredKey } from "../fetchPaging.js";
import { parseSqlWrite, previewSelect, describeSets, rawForPrepare, updateMetaFor } from "../sqlWrite.js";
import { prepareUpdate as prepareTypedUpdate } from "../updateUtils.js";
import { builderToFetchXml, viewFetchXml, layoutColumns, layoutXml } from "../viewSave.js";
import Tooltip from "./Tooltip.jsx";
import QueryTemplates from "./QueryTemplates.jsx";
import { t } from "../i18n.js";
import { bridge } from "../d365-bridge.js";
import { C, I, Spin, ENTS, FLDS, ROWS, useDebounce, useKeyboard, mono, inp, bt, copyText, isTrulyCustom, dl, expName, recordId, TableTypeBadge, persistList, confirmProd } from "../shared.jsx";
import { sqlToFetchXml } from "../sqlToFetchXml.js";
import { extractBaseTable, isSqlOptionUnsupported } from "../sqlNative.js";
import { buildFilterClause } from "../filterUtils.js";
import { buildHistoryEntry, scrubStoredHistory } from "../historyUtils.js";
import FieldPicker from "./FieldPicker.jsx";
import ExpandCard from "./ExpandCard.jsx";
import RelFilterCard from "./RelFilterCard.jsx";
import Results from "./Results.jsx";

// A 401 / lost session looks the same whatever the query mode (Builder, OData, FetchXML, SQL) — one
// detector + one message so every path reports it identically (and can't drift over time).
const SESSION_EXPIRED_MSG = "Session expired — refresh D365 (F5) then click ⚡ again";
const isSessionExpired = (msg) => { const s = String(msg || ""); return s.includes("401") || s.includes("SESSION_EXPIRED"); };

function StreamCard({st,onStop,onClose}){
  const secs=Math.max(1,Math.round(((st.phase==="running"?Date.now():st.ended||Date.now())-(st.started||Date.now()))/1000));
  const rate=st.rows&&secs?Math.round(st.rows/secs):0;
  const box=(color)=>({margin:12,padding:"14px 16px",borderRadius:8,border:`1px solid ${color}55`,background:color+"10",fontSize:13,lineHeight:1.6,display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"});
  if(st.phase==="running") return <div style={box(C.cy)}><Spin s={14}/><span style={{flex:1,color:C.txm}}>Streaming to <b>{st.name}</b> — <b>{(st.rows||0).toLocaleString()}</b> rows written · page {st.pages||0}{rate?` · ~${rate.toLocaleString()} rows/s`:""}</span><button onClick={onStop} style={bt(C.rd,{fontSize:12})}>Stop</button></div>;
  if(st.phase==="done") return <div style={box(C.gn)}><span style={{flex:1,color:C.txm}}>✓ <b>{(st.rows||0).toLocaleString()}</b> rows written to <b>{st.name}</b>{st.format==="xlsx"&&st.sheets>1?` — ${st.sheets} sheets (Excel holds 1,048,576 rows per sheet)`:""}{st.truncated?` — ${st.truncated.toLocaleString()} cell${st.truncated>1?"s":""} longer than Excel's 32,767 characters were cut (the CSV keeps them whole)`:""}.</span><button onClick={onClose} style={bt(null,{fontSize:12})}>Close</button></div>;
  if(st.phase==="stopped") return <div style={box(C.yw)}><span style={{flex:1,color:C.txm}}>Stopped — the file wasn't written (a partial file would look complete).</span><button onClick={onClose} style={bt(null,{fontSize:12})}>Close</button></div>;
  return <div style={box(C.rd)}><span style={{flex:1,color:C.rd}}>Streaming failed — the file wasn't written: {st.error}</span><button onClick={onClose} style={bt(null,{fontSize:12})}>Close</button></div>;
}

export default function Explorer({bp,addHistory,orgInfo,theme,active=true}){
  const isLive = orgInfo?.isExtension;
  const[ent,setEnt]=useState(null);
  const[es,setEs]=useState("");
  const[sf,setSf]=useState([]);
  const[filterGroups,setFilterGroups]=useState([{logic:"and",conditions:[{field:"",op:"eq",value:""}]}]);
  const[groupLogic,setGroupLogic]=useState("and");
  const[res,setRes]=useState(null);
  const[picker,setPicker]=useState(false);
  const[queryCollapsed,setQueryCollapsed]=useState(false);
  const[qm,setQm]=useState("builder");
  const[rq,setRq]=useState("");
  const[fxml,setFxml]=useState("");
  const[sqlQ,setSqlQ]=useState("");
  const[sqlFx,setSqlFx]=useState("");
  const[showSqlFx,setShowSqlFx]=useState(false);
  // SQL engine: "native" sends the SQL to Dataverse via the ?sql= query option (server-parsed:
  // real joins w/ aliases, DISTINCT, GROUP BY, DATEADD/GETUTCDATE — no HAVING/TOP); "fetchxml"
  // keeps the client-side transpiler (supports HAVING and TOP). Native is the default; when the
  // org does not have the ?sql= option yet, the first run flips nativeSqlDown and falls back.
  const[sqlEngine,setSqlEngine]=useState("native");
  const[nativeSqlDown,setNativeSqlDown]=useState(false);
  const[lim,setLim]=useState(0);   // 0 = All (no $top) — an export tool should return everything by default; lower it for a quick preview
  const[orderBy,setOrderBy]=useState({f:"",dir:"asc"}); // server-side $orderby for the Builder (field + direction)
  const[showList,setShowList]=useState(true);
  const[savedQueries,setSavedQueries]=useState([]);
  const[importErr,setImportErr]=useState(""); // bad saved-queries file — shown inline in the dropdown (was a jarring alert())
  const qImportRef=useRef(null);
  const[queryHistory,setQueryHistory]=useState([]);
  const[showHistory,setShowHistory]=useState(false);
  const[showSaved,setShowSaved]=useState(false);
  const[showTemplates,setShowTemplates]=useState(false);
  const[saveModal,setSaveModal]=useState(false);
  const[saveName,setSaveName]=useState("");
  // The saved query currently loaded (its name shows next to ⭐, with a one-click Update).
  const[activeSaved,setActiveSaved]=useState(null);
  const[savedFlash,setSavedFlash]=useState("");
  const[runNote,setRunNote]=useState("");   // info under the toolbar (e.g. a pasted URL from another environment)
  const[pasteQ,setPasteQ]=useState("");     // "paste an OData query" box shown before any table is picked
  const[pasteErr,setPasteErr]=useState("");
  // Results bigger than the browser can hold: nothing is shown (never a partial list) and the
  // query can be streamed to a file instead — every row, straight to disk, nothing kept in memory.
  const[tooBig,setTooBig]=useState(null);      // { rows } read when memory ran short
  const[streamState,setStreamState]=useState(null); // { phase: running|done|stopped|error, name, format, rows, pages, started, error, sheets, truncated }
  const[showStreamMenu,setShowStreamMenu]=useState(false);
  const streamRef=useRef(null);
  const partialRef=useRef(false); // a paging loop broke on a page error — the result shown is incomplete                 // the stream run() writes to instead of the grid
  const[viewModal,setViewModal]=useState(null);  // "Save as view": { name, saving, error, done }
  const selGen=useRef(0); // generation counter: incremented on every entity selection to cancel stale fetches
  const onFieldsReady=useRef(null); // callback invoked after fields are loaded (used by loadSavedQuery/templates)
  const[bookmarks,setBookmarks]=useState([]);

  useEffect(()=>{
    if(typeof chrome!=="undefined"&&chrome.storage?.local){
      chrome.storage.local.get(["d365_query_history","d365_bookmarks"],r=>{
        if(r.d365_query_history){
          // Upgrade scrub: SQL/FetchXML entries saved before their redactions existed still carry
          // WHERE literals — re-redact once and write back (review finding, privacy class).
          const{list,changed}=scrubStoredHistory(r.d365_query_history);
          setQueryHistory(list);
          if(changed)persistList("d365_query_history",cur=>scrubStoredHistory(cur).list); // against what storage holds now (another panel may have written)
        }
        if(r.d365_bookmarks) setBookmarks(r.d365_bookmarks);
      });
    }
  },[]);

  const toggleBookmark=(entityLogical)=>{
    setBookmarks(prev=>prev.includes(entityLogical)?prev.filter(b=>b!==entityLogical):[...prev,entityLogical]);
    persistList("d365_bookmarks",cur=>cur.includes(entityLogical)?cur.filter(b=>b!==entityLogical):[...cur,entityLogical]);
  };
  const addToHistory=(entity,query,mode,fieldCount)=>{
    // Strip $filter values from stored query to avoid persisting PII (emails, names, etc.)
    // 1000 (was 200): the old cap could chop a long $select mid-token, so a restored entry was
    // broken for a SECOND reason besides the redacted filter. Display still truncates at 80.
    // Entry construction (redaction + builder structure snapshot) lives in historyUtils.js —
    // pure and tested, since both its invariants were user-hit while they lived inline here.
    const entry=buildHistoryEntry({entityLogical:entity?.l,query,mode,fieldCount,ts:Date.now(),
      builderState:mode==="builder"?{fields:sf,filterGroups,groupLogic,limit:lim,orderBy,expands,relFilters}:null});
    setQueryHistory(prev=>[entry,...prev.filter(h=>h.query!==entry.query)].slice(0,20));
    persistList("d365_query_history",cur=>[entry,...cur.filter(h=>h.query!==entry.query)].slice(0,20));
  };
  useEffect(()=>{
    if(typeof chrome==="undefined"||!chrome.storage?.local) return undefined;
    chrome.storage.local.get(["d365_saved_queries"],r=>{
      if(r.d365_saved_queries) setSavedQueries(r.d365_saved_queries);
    });
    // saved queries are shared by every Colvio panel (one per environment): one saved in another
    // panel shows up here too
    if(!chrome.storage.onChanged) return undefined;
    const onChange=(ch,area)=>{ if(area==="local"&&ch.d365_saved_queries) setSavedQueries(Array.isArray(ch.d365_saved_queries.newValue)?ch.d365_saved_queries.newValue:[]); };
    chrome.storage.onChanged.addListener(onChange);
    return()=>chrome.storage.onChanged.removeListener(onChange);
  },[]);

  const saveCurrentQuery=()=>{
    if(!ent) return;
    setSaveName(activeSaved||"");setSaveModal(true);
  };
  const doSaveQuery=(name)=>{
    if(!name||!ent) return;
    const q={name,entity:ent.l,entitySet:ent.p,fields:sf,filterGroups,groupLogic,expands:expands.map(ex=>({navProperty:ex.navProperty,targetEntity:ex.targetEntity,lookupField:ex.lookupField,type:ex.type||"single",fields:ex.fields,conditions:ex.conditions||[],conditionLogic:ex.conditionLogic||"and"})),relFilters:relFilters.map(rf=>({navProperty:rf.navProperty,targetEntity:rf.targetEntity,lookupField:rf.lookupField,type:rf.type,mode:rf.mode||"any",conditions:rf.conditions||[],conditionLogic:rf.conditionLogic||"and"})),limit:lim,orderBy,qm,fxml,rq,sqlQ,savedAt:new Date().toISOString()};
    setSavedQueries([q,...savedQueries.filter(s=>s.name!==name)].slice(0,20));
    persistList("d365_saved_queries",cur=>[q,...cur.filter(s=>s.name!==name)].slice(0,20));
    setSaveModal(false);
    setActiveSaved(name);setSavedFlash(name);setTimeout(()=>setSavedFlash(""),1600);
  };

  const loadSavedQuery=(q)=>{
    const match=entities.find(e=>e.l===q.entity);
    if(match){
      // selEnt FIRST — it clears any pending onFieldsReady from a previous selection. The old
      // ordering (set callback, then selEnt) let "load query A, click entity B before A's fields
      // resolve" apply A's whole config — including rel filters — onto entity B.
      selEnt(match);
      afterFields(()=>{
        setActiveSaved(q.name);
        setSf(q.fields||[]);
        setFilterGroups(q.filterGroups||[{logic:"and",conditions:[{field:"",op:"eq",value:""}]}]);
        setGroupLogic(q.groupLogic||"and");
        setLim(q.limit ?? 0);   // ?? not || so a saved "All" (0) survives restore instead of snapping back to a number
        setOrderBy(q.orderBy&&q.orderBy.f?{f:q.orderBy.f,dir:q.orderBy.dir==="desc"?"desc":"asc"}:{f:"",dir:"asc"});
        // Restore the raw query text for every mode (selEnt cleared them) — OData & SQL were not
        // persisted before, so a saved OData/SQL query came back blank.
        if(q.qm) setQm(q.qm);
        if(q.rq) setRq(q.rq);
        if(q.fxml) setFxml(q.fxml);
        if(q.sqlQ) setSqlQ(q.sqlQ);
        restoreRelated(q);
      });
    } else {
      setError(`The saved query's table "${q.entity}" no longer exists on this org.`);
    }
    setShowSaved(false);
  };

  // REL filters and EXPANDS of a saved query or a history entry, back in the Builder. They need
  // the target entity's field metadata (types drive the operator lists and OData quoting) —
  // refetched per clause, the ones whose target no longer resolves dropped. Guarded by selGen:
  // switching entity while these getFields are in flight must DISCARD the restore, not repaint
  // the old query's clauses onto the new table. (EXPANDS were once saved but never restored — a
  // reloaded query silently ran without its joins; audit finding.)
  const restoreRelated=(q)=>{
    const g=selGen.current;
    if(q.relFilters?.length){
      Promise.all(q.relFilters.map(async rf=>{
        try{
          const tf=isLive?await bridge.getFields(rf.targetEntity):FLDS;
          return {...rf, type:rf.type||"single", mode:rf.mode||"any", conditions:rf.conditions||[], conditionLogic:rf.conditionLogic||"and", allFields:mapTargetFields(tf)};
        }catch{return null;}
      })).then(list=>{if(selGen.current===g)setRelFilters(list.filter(Boolean));});
    }
    if(q.expands?.length){
      Promise.all(q.expands.map(async ex=>{
        try{
          const tf=isLive?await bridge.getFields(ex.targetEntity):FLDS;
          return {navProperty:ex.navProperty,targetEntity:ex.targetEntity,lookupField:ex.lookupField,type:ex.type||"single",allFields:mapTargetFields(tf),fields:ex.fields||[],conditions:ex.conditions||[],conditionLogic:ex.conditionLogic||"and"};
        }catch{return null;}
      })).then(list=>{if(selGen.current===g)setExpands(list.filter(Boolean));});
    }
  };

  const deleteSavedQuery=(name)=>{
    if(name===activeSaved) setActiveSaved(null);
    setSavedQueries(savedQueries.filter(s=>s.name!==name));
    persistList("d365_saved_queries",cur=>cur.filter(s=>s.name!==name));
  };
  const[entities,setEntities]=useState(ENTS);
  const[fields,setFields]=useState(FLDS);
  const[loading,setLoading]=useState(false);
  const[loadingFields,setLoadingFields]=useState(false);
  const[error,setError]=useState("");

  const[lookups,setLookups]=useState([]);
  const[expands,setExpands]=useState([]);
  const[showExpandPicker,setShowExpandPicker]=useState(false);
  const[expandSearch,setExpandSearch]=useState("");
  const[childRelsLoaded,setChildRelsLoaded]=useState(false);
  const debouncedExpandSearch = useDebounce(expandSearch, 150);
  const[loadingExpand,setLoadingExpand]=useState("");
  // Relational filters — Advanced-Find-style conditions on RELATED records that filter the ROOT
  // rows (unlike $expand filters, which only filter what's displayed). Parent (N:1) → nav-property
  // path filter; child (1:N) → any()/not any() lambda.
  const[relFilters,setRelFilters]=useState([]);
  const[showRelPicker,setShowRelPicker]=useState(false);
  const[relSearch,setRelSearch]=useState("");
  const debouncedRelSearch = useDebounce(relSearch, 150);
  const[loadingRel,setLoadingRel]=useState("");

  useEffect(()=>{
    if(!isLive) return;
    setLoading(true);
    bridge.getEntities().then(data=>{
      if(data && Array.isArray(data)){
        const mapped = data.map(e=>({
          l:e.logical, d:e.display, p:e.entitySet||e.logical+"s", pk:e.primaryId||null,
          i:(e.isCustom&&isTrulyCustom(e.logical,e.isManaged))?"⚙️":"📋", c:0, cat:(e.isCustom&&isTrulyCustom(e.logical,e.isManaged))?"Custom":"Standard",
          tt:e.tableType||"Standard"
        })).sort((a,b)=>a.d.localeCompare(b.d));
        setEntities(mapped);
      }
    }).catch(e=>setError(e.message)).finally(()=>setLoading(false));
  },[isLive]);

  useEffect(()=>{
    if(!isLive || entities.length < 2) return;
    bridge.getCurrentRecord().then(rec=>{
      if(rec?.entityType && !ent){
        const match=entities.find(e=>e.l===rec.entityType);
        if(match) selEnt(match);
      }
    }).catch(()=>{});
  },[isLive, entities.length]);

  const selEnt=(e)=>{
    fetchAbort.current = true;
    const gen=++selGen.current; // capture generation for staleness check
    onFieldsReady.current=null; // a pending saved-query/template callback belongs to a PREVIOUS selection — never replay it on this entity
    setEnt(e);setRes(null);setPicker(false);setError("");
    setFilterGroups([{logic:"and",conditions:[{field:"",op:"eq",value:""}]}]);
    setExpands([]);setLookups([]);setShowExpandPicker(false);setChildRelsLoaded(false);
    setRelFilters([]);setShowRelPicker(false);setRelSearch(""); // relational filters belonged to the OLD entity
    setRq("");setFxml("");setSqlQ(""); // raw query text belonged to the previous entity — clear it so a switch can't run against the wrong table
    setActiveSaved(null);setRunNote(""); // a saved query / pasted URL belonged to the previous selection
    if(bp.mobile)setShowList(false);
    if(isLive){
      setLoadingFields(true);setSf([]);setFields([]);
      Promise.all([
        bridge.getFields(e.l),
        bridge.getLookups(e.l),
      ]).then(([fieldsData, lookupsData]) => {
        if(selGen.current!==gen)return; // stale: user selected a different entity
        const childRelsData = null;
        if(fieldsData && Array.isArray(fieldsData) && fieldsData.length > 0){
          const mapped=fieldsData.map(f=>({
            l:f.logical, odata:f.odataName||f.logical, d:f.display||f.logical,
            t:f.type||"String", req:!!f.required, cust:!!(f.isCustom&&isTrulyCustom(f.logical)),
            pk:!!f.isPrimaryId
          })).sort((a,b)=>a.l.localeCompare(b.l));
          setFields(mapped);
          // Default SELECT: the PRIMARY KEY first (IsPrimaryId from metadata — falls back to the
          // <entity>id heuristic on a stale field cache), then the usual identifying columns.
          const pkField=mapped.find(f=>f.pk)?.l||(mapped.some(f=>f.l===e.l+"id")?e.l+"id":null);
          const common=mapped.filter(f=>["name","fullname","subject","title","emailaddress1","telephone1"].includes(f.l)).map(f=>f.l);
          const defaults=[...(pkField?[pkField]:[]),...common].slice(0,5);
          setSf(defaults.length>0?defaults:mapped.slice(0,5).map(f=>f.l));
        } else {
          setError(`No fields returned for ${e.l}`);
        }
        const allRels = [
          ...((lookupsData || []).map(l => ({ ...l, type: l.type || "single" }))),
          ...((childRelsData || []).map(l => ({ ...l, type: "collection" }))),
        ];
        const seen=new Set();
        const unique=allRels.filter(l=>{if(!l.navProperty||seen.has(l.navProperty))return false;seen.add(l.navProperty);return true;});
        setLookups(unique);
        // Invoke onFieldsReady callback (for loadSavedQuery / templates)
        if(onFieldsReady.current){const cb=onFieldsReady.current;onFieldsReady.current=null;cb();}
      }).catch(err=>{if(selGen.current===gen)setError(`${e.l}: ${err.message}`);}).finally(()=>{if(selGen.current===gen)setLoadingFields(false);});

      bridge.getEntityCount(e.p).then(c=>{
        if(selGen.current===gen&&c>=0) setEnt(prev=>prev?.l===e.l?{...prev,c}:prev);
      }).catch(()=>{});
    } else {
      setFields(FLDS);
      setSf(["name","accountnumber","emailaddress1","address1_city","statecode"]);
    }
  };

  // The browser's heap is nearly full (Chrome reports it): the grid stops, shows nothing, and offers
  // the streamed export — a partial list presented as the result would be wrong.
  const memTight=()=>{try{const m=performance.memory;return !!(m&&m.jsHeapSizeLimit&&m.usedJSHeapSize>0.7*m.jsHeapSizeLimit);}catch{return false;}};

  // ── Streamed export: run() writes each page to the file, then forgets it ──
  const streamBegin=async(st,declared,complete,firstRows,sheetBase)=>{
    // Columns the query names = exactly the grid's columns; otherwise the first page tells.
    st.cols=complete&&declared.length?declared.map(c=>({name:c.name,keys:[...c.keys]})):streamColumns(declared,firstRows);
    st.complete=complete;
    st.sink=await createSink(st.out,st.format,{headers:st.cols.map(c=>c.name),sheetBase});
  };
  const streamAdd=async(st,rows)=>{
    // Columns the query didn't declare are discovered from the first page; one that shows up
    // later can't join a file whose header is written — stop rather than write an incomplete file.
    if(!st.complete) for(const r of rows){const k=uncoveredKey(st.cols,r);if(k) throw new Error(`Column "${k}" first appears after the first page (its earlier rows are empty), so the file's header can't include it. Name the columns in the query ($select / <attribute>) and stream again.`);}
    await st.sink.add(rows.map(r=>st.cols.map(c=>cellValue(r,c.keys,st.format))));
    st.pages++;
    setStreamState(x=>x&&x.phase==="running"?{...x,rows:st.sink.rows,pages:st.pages}:x);
  };
  const streamEnd=async(st)=>{
    if(streamRef.current===st) streamRef.current=null;
    if(fetchAbort.current){ await st.sink?.abort?.(); if(!st.sink) await st.out.abort?.(); setStreamState(x=>({...x,phase:"stopped"})); return; }
    await st.sink.close();
    setStreamState(x=>({...x,phase:"done",rows:st.sink.rows,pages:st.pages,sheets:st.sink.sheets,truncated:st.sink.truncatedCells}));
  };
  const streamFail=async(st,msg)=>{
    if(streamRef.current===st) streamRef.current=null;
    try{ if(st.sink) await st.sink.abort(); else await st.out.abort?.(); }catch{ /* already closed */ }
    setStreamState(x=>({...x,phase:"error",error:msg}));
  };
  // A paged source (nextLink, FetchXML pages) → the file. getPage(cursor) → { rows, next }.
  const streamRun=async(st,{declared,complete,first,sheetBase,next,getPage,mapRows})=>{
    const map=mapRows||(x=>x);
    try{
      const firstRows=map(first||[]);
      await streamBegin(st,declared,complete,firstRows,sheetBase);
      await streamAdd(st,firstRows);
      let cur=next;
      while(cur&&!fetchAbort.current){
        const pg=await getPage(cur);
        const rows=map(pg.rows||[]);
        if(!rows.length) break;
        await streamAdd(st,rows);
        cur=pg.next;
      }
      await streamEnd(st);
    }catch(e){ await streamFail(st,e.message||String(e)); }
  };
  // Click → save dialog (needs the click's user gesture: nothing awaited before it) → run().
  const startStream=async(format)=>{
    setShowStreamMenu(false);
    const base=(qm==="builder"?ent?.l:null)||ent?.l||"query";
    let out;
    try{ out=await openOutput(expName(base,format==="xlsx"?"xlsx":"csv"),format); }
    catch(e){ setError(`Couldn't open the file: ${e.message}`); return; }
    if(!out) return; // dialog cancelled
    setTooBig(null);setRes(null);
    const st={format,out,sink:null,cols:null,complete:false,pages:0};
    streamRef.current=st;
    setStreamState({phase:"running",name:out.name,format,rows:0,pages:0,started:Date.now()});
    await run();
    if(streamRef.current===st){ await streamFail(st,"The query didn't run — check it in the grid first."); }
  };
  const stopStream=()=>{ fetchAbort.current=true; };
  const sqlWritePeek=qm==="sql"?parseSqlWrite(sqlQ):null; // the Execute button says what it will do

  // ── Save as view: the query becomes a personal view (userquery) of its table ──
  const viewDefinition=()=>{
    if(qm==="odata") return {error:"An OData query can't become a view — save it from the Builder, FetchXML or SQL mode."};
    if(qm==="fetchxml") return fxml.trim()?{fetchxml:fxml}:{error:"The FetchXML is empty."};
    if(qm==="sql"){
      if(parseSqlWrite(sqlQ)) return {error:"An UPDATE / DELETE can't be a view."};
      const r=sqlToFetchXml(sqlQ);
      return r.error?{error:`This SQL can't be written as FetchXML for a view: ${r.error}`}:{fetchxml:r.fetchXml};
    }
    const ft={};fields.forEach(f=>{ft[f.l]=f.t;});
    // related tables ride along as link-entities: each needs its key (from the entity list's
    // metadata; <table>id when unknown) — the root's too, for child (1:N) joins
    const pkOfEntity=(l)=>entities.find(e=>e.l===l)?.pk||null;
    const withPk=(x)=>({...x,targetPk:pkOfEntity(x.targetEntity)});
    return builderToFetchXml({entity:ent?.l,attrs:sf,groups:filterGroups,groupLogic,orderBy,fieldTypes:ft,expands:expands.map(withPk),relFilters:relFilters.map(withPk),primaryId:ent?.pk||fields.find(f=>f.pk)?.l||null});
  };
  const openSaveView=()=>{const def=viewDefinition();setViewModal({name:activeSaved||`${ent?.d||ent?.l||"Query"} (Colvio)`,error:def.error||"",saving:false,done:null});};
  const saveView=async()=>{
    const def=viewDefinition();
    if(def.error){setViewModal(v=>({...v,error:def.error}));return;}
    const name=(viewModal?.name||"").trim();
    if(!name){setViewModal(v=>({...v,error:"Give the view a name."}));return;}
    setViewModal(v=>({...v,saving:true,error:""}));
    try{
      const entityName=(def.fetchxml.match(/<entity\b[^>]*name\s*=\s*"([^"]+)"/i)||[])[1];
      const meta=await bridge.getEntityMetadata(entityName);
      const vf=viewFetchXml(def.fetchxml,meta.primaryId);
      if(vf.error) throw new Error(vf.error);
      const cols=layoutColumns(vf.fetchxml,meta.primaryId);
      const layout=layoutXml({objectTypeCode:meta.objectTypeCode,primaryId:meta.primaryId,primaryName:meta.primaryName,columns:cols.length?cols:[meta.primaryName]});
      if(!confirmProd(orgInfo?.isProduction,`Create the personal view "${name}" on ${vf.entity}`)){ setViewModal(v=>({...v,saving:false})); return; }
      const r=await bridge.createUserQuery({entity:vf.entity,name,fetchxml:vf.fetchxml,layoutxml:layout});
      setViewModal(v=>({...v,saving:false,done:{id:r?.id,name,table:meta.displayName||vf.entity,columns:cols}}));
    }catch(e){ setViewModal(v=>({...v,saving:false,error:e.message||String(e)})); }
  };

  // ── SQL UPDATE / DELETE: preview first ──
  // The statement's values are typed (and refused) before anything runs, then its WHERE runs as a
  // SELECT through the same SQL engine; the grid shows every row it would touch, and Results'
  // "Apply" writes exactly those rows (update-only PATCH / batched DELETE).
  const previewSqlWrite=async(w)=>{
    setLoading(true);setRes(null);
    try{
      const meta=isLive?await bridge.getEntityMetadata(w.table,w.kind==="delete")
        :{primaryId:`${w.table}id`,primaryName:"name",entitySet:entities.find(e=>e.l===w.table)?.p||`${w.table}s`,displayName:w.table,canBeDeleted:true};
      if(w.kind==="delete"&&meta.canBeDeleted===false) throw new Error(`"${meta.displayName}" doesn't allow deletion (CanBeDeleted = false).`);
      let body=null;
      if(w.kind==="update"){
        let um;
        if(isLive){
          const [fl,lk]=await Promise.all([bridge.getFields(w.table),bridge.getLookups(w.table).catch(()=>[])]);
          um=updateMetaFor((fl||[]).map(f=>({l:f.logical,odata:f.odataName||f.logical,t:f.type||"String"})),lk,entities);
        } else um=updateMetaFor(FLDS,[],entities);
        body={};
        for(const st of w.sets){
          if(isLive&&um.fieldTypes[st.col]===undefined) throw new Error(`"${st.col}" isn't a column of ${w.table}.`);
          const prep=prepareTypedUpdate({...um,odataFieldMap:{}},st.col,rawForPrepare(st));
          if(!prep.ok) throw new Error(prep.reason);
          Object.assign(body,prep.body);
        }
      }
      const plan={kind:w.kind,table:w.table,entitySet:meta.entitySet,pk:meta.primaryId,displayName:meta.displayName,setsText:w.kind==="update"?describeSets(w.sets):"",body,statement:sqlQ.trim()};
      setLoading(false);
      partialRef.current=false;
      await run({sql:previewSelect(w,meta.primaryId,meta.primaryName)});
      // a preview cut short by a page error must not get an Apply button: the rows shown aren't the WHERE
      if(partialRef.current){ setError("Preview incomplete — not every row of the WHERE could be read, nothing can be applied. Run it again."); return; }
      setRes(prev=>prev?{...prev,writePlan:plan,entity:{...prev.entity,pk:meta.primaryId,p:meta.entitySet}}:prev);
    }catch(e){ setError(e.message||String(e)); setLoading(false); }
  };

  // Run cb once the selected table's fields are loaded. Live: after the async metadata fetch
  // (onFieldsReady). Demo: selEnt fills the fields synchronously and never fires the callback — so
  // run it now (saved queries and templates used to do nothing in demo mode).
  const afterFields=(cb)=>{ if(isLive) onFieldsReady.current=cb; else cb(); };

  // A pasted OData query / URL → OData mode on ITS table (switching table when needed).
  const openODataPath=(n)=>{
    const match=entityForSet(entities,n.entitySet);
    const apply=()=>{setQm("odata");setRq(displayODataPath(n.path));setRunNote(n.foreignHost?`This URL came from ${n.host} — it runs on this environment.`:"");};
    if(match&&match.l!==ent?.l){selEnt(match);afterFields(apply);}
    else apply(); // same table — or a set Colvio doesn't list, which still runs as typed
  };
  const openPasted=()=>{
    const n=normalizeODataInput(pasteQ,orgInfo?.orgUrl);
    if(n.error){setPasteErr(n.error);return;}
    if(!entityForSet(entities,n.entitySet)){setPasteErr(`No table with the entity set "${n.entitySet}" on this org.`);return;}
    setPasteErr("");setPasteQ("");openODataPath(n);
  };

  // Consume a view's FetchXML handed off by the Apps module ("Open in Explorer"). Ref-held
  // handler so the mount-once listener always sees current entities/selEnt; only the ACTIVE
  // query tab consumes the one-shot slot (every tab instance stays mounted and hears the event).
  const openHandoffRef=useRef(null);
  openHandoffRef.current=()=>{
    const d=window.__colvioPendingQuery;
    if(!d||!active) return;
    const match=entities.find(x=>x.l===d.entity);
    if(!match){window.__colvioPendingQuery=null;setError(`Table "${d.entity}" was not found on this org.`);return;}
    window.__colvioPendingQuery=null;
    selEnt(match);
    const apply=()=>{setQm("fetchxml");setFxml(d.fetchxml);};
    afterFields(apply);
  };
  useEffect(()=>{
    const h=()=>openHandoffRef.current&&openHandoffRef.current();
    window.addEventListener("colvio:open-fetchxml",h);
    return()=>window.removeEventListener("colvio:open-fetchxml",h);
  },[]);

  // Map a getFields() payload to the internal field shape — shared by expands and relational filters.
  const mapTargetFields = (targetFields) => (targetFields || [])
    .map(f => ({
      l: f.logical || f.l,
      d: f.display || f.d || f.logical || f.l,
      t: f.type || f.t || "String",
      cust: !!((f.isCustom || f.cust) && isTrulyCustom(f.logical || f.l)),
      odata: f.odataName || f.logical || f.l,
    }))
    .sort((a, b) => a.l.localeCompare(b.l));

  // Child (1:N) relations are lazy-loaded on first open of either picker (Relations or Rel filter).
  const ensureChildRels = () => {
    if (childRelsLoaded || !ent || !isLive) return;
    setChildRelsLoaded(true);
    const g = selGen.current; // entity A's child relations must never append into entity B's lookups (audit finding)
    bridge.getChildRelationships(ent.l).then(childRels => {
      if (selGen.current !== g) return;
      if (childRels && Array.isArray(childRels)) {
        setLookups(prev => {
          const seen = new Set(prev.map(l => l.navProperty));
          const newRels = childRels.filter(l => l.navProperty && !seen.has(l.navProperty)).map(l => ({ ...l, type: "collection" }));
          return [...prev, ...newRels];
        });
      }
    }).catch(() => {});
  };

  const addExpand = async (lookup) => {
    if (loadingExpand || expands.find(x => x.navProperty === lookup.navProperty)) return;
    setLoadingExpand(lookup.navProperty);
    const g = selGen.current; // switching entity while target fields load must DROP this add (audit finding)
    try {
      const targetFields = isLive ? await bridge.getFields(lookup.targetEntity) : FLDS;
      if (selGen.current !== g) { setLoadingExpand(""); return; }
      const mapped = mapTargetFields(targetFields);
      const commonNames = ["name","fullname","title","subject","accountnumber","emailaddress1","internalemailaddress","telephone1","new_sapid","new_externalid"];
      const auto = mapped.filter(f => commonNames.includes(f.l)).map(f => f.l);
      setExpands(prev => prev.find(x => x.navProperty === lookup.navProperty) ? prev : [...prev, {
        navProperty: lookup.navProperty,
        targetEntity: lookup.targetEntity,
        lookupField: lookup.lookupField,
        type: lookup.type || "single",
        allFields: mapped,
        fields: auto.length > 0 ? auto.slice(0, 5) : mapped.slice(0, 5).map(f => f.l),
        conditions: [],
        conditionLogic: "and",
      }]);
    } catch (e) {
      setError(`Expand ${lookup.targetEntity}: ${e.message}`);
    }
    setLoadingExpand("");
  };

  const removeExpand = (navProperty) => {
    setExpands(prev => prev.filter(x => x.navProperty !== navProperty));
  };

  const toggleExpandField = (navProperty, fieldName) => {
    setExpands(prev => prev.map(ex => {
      if (ex.navProperty !== navProperty) return ex;
      const has = ex.fields.includes(fieldName);
      return { ...ex, fields: has ? ex.fields.filter(f => f !== fieldName) : [...ex.fields, fieldName] };
    }));
  };

  const setExpandConditions = (navProperty, conditions) => {
    setExpands(prev => prev.map(ex => ex.navProperty === navProperty ? { ...ex, conditions } : ex));
  };

  const setExpandLogic = (navProperty, conditionLogic) => {
    setExpands(prev => prev.map(ex => ex.navProperty === navProperty ? { ...ex, conditionLogic } : ex));
  };

  const addRelFilter = async (lookup) => {
    if (loadingRel || relFilters.find(x => x.navProperty === lookup.navProperty)) return;
    setLoadingRel(lookup.navProperty);
    const g = selGen.current; // same stale-add guard as addExpand (audit finding)
    try {
      const targetFields = isLive ? await bridge.getFields(lookup.targetEntity) : FLDS;
      if (selGen.current !== g) { setLoadingRel(""); return; }
      // Functional + re-checked: a double-click racing the disabled repaint must not add twice.
      setRelFilters(prev => prev.find(x => x.navProperty === lookup.navProperty) ? prev : [...prev, {
        navProperty: lookup.navProperty,
        targetEntity: lookup.targetEntity,
        lookupField: lookup.lookupField,
        type: lookup.type === "collection" ? "collection" : "single",
        mode: "any",             // collection only: any = "has at least one", none = "has none"
        conditions: [{ field: "", op: "eq", value: "" }],
        conditionLogic: "and",
        allFields: mapTargetFields(targetFields),
      }]);
      setShowRelPicker(false);
    } catch (e) {
      setError(`Relation filter ${lookup.targetEntity}: ${e.message}`);
    }
    setLoadingRel("");
  };
  const removeRelFilter = (navProperty) => setRelFilters(prev => prev.filter(x => x.navProperty !== navProperty));
  const updateRelFilter = (navProperty, patch) => setRelFilters(prev => prev.map(rf => rf.navProperty === navProperty ? { ...rf, ...patch } : rf));

  const debouncedEs = useDebounce(es, 150);
  const filtered=entities.filter(e=>e.d.toLowerCase().includes(debouncedEs.toLowerCase())||e.l.includes(debouncedEs.toLowerCase())).sort((a,b)=>{const aB=bookmarks.includes(a.l)?0:1;const bB=bookmarks.includes(b.l)?0:1;return aB-bB||a.d.localeCompare(b.d);});

  const oq=()=>{
    if(!ent)return"";
    let q=`GET /api/data/v9.2/${ent.p}`;
    const ps=[];
    if(sf.length)ps.push(`$select=${sf.map(f=>getOdataName(f)).join(",")}`);
    const exClauses=buildExpandClauses(false);
    if(exClauses.length)ps.push(`$expand=${exClauses.join(",")}`);
    const gf=buildGroupFilter();
    if(gf) ps.push(`$filter=${gf}`);
    if(orderBy.f)ps.push(`$orderby=${getOdataName(orderBy.f)} ${orderBy.dir}`);
    if(lim>0)ps.push(`$top=${lim}`);
    return ps.length?q+"?"+ps.join("&"):q;
  };

  const getOdataName = (logicalName, fl=fields) => {
    const f = fl.find(x => x.l === logicalName);
    return f?.odata || logicalName;
  };

  const getFieldType = (logicalName, fl=fields) => {
    const f = fl.find(x => x.l === logicalName);
    return f?.t || "String";
  };

  // Typed-update metadata handed to the results view (bulk update + inline edit): field → type,
  // and for lookups the nav-property binds. Same defense the Loader got in v1.11.138 — the server
  // 400s raw strings on numeric/GUID fields with a cryptic message, and a lookup can't be written
  // through its _value column at all (it needs nav@odata.bind with the target's entity set).
  // Keyed by BOTH logical and odata names so builder columns and raw-mode columns both resolve.
  const buildUpdateMeta = () => updateMetaFor(fields, lookups, entities); // shared with SQL UPDATE (sqlWrite.js)

  // Extracted to filterUtils.js (pure, tested) — the type-driven quoting is the injection
  // defense, so its guarantees are pinned by tests instead of living inline here.
  const buildFilter = (fieldName, op, val, fl=fields) => buildFilterClause(fieldName, op, val, fl);

  // Build $expand clauses including optional per-expand $filter (collection-typed expands only)
  const buildExpandClauses = (useOdataNames=false) => {
    return expands.filter(ex=>ex.fields.length>0).map(ex=>{
      const selectFields = useOdataNames
        ? ex.fields.map(f=>{const meta=ex.allFields.find(x=>x.l===f);return meta?.odata||f;}).join(",")
        : ex.fields.join(",");
      const segs = [`$select=${selectFields}`];
      if (ex.type === "collection" && ex.conditions?.length) {
        const active = ex.conditions.filter(c=>c.field && (c.value || c.op==="is_null" || c.op==="is_not_null"));
        if (active.length) {
          const parts = active.map(c=>buildFilter(c.field, c.op, c.value, ex.allFields));
          segs.push(`$filter=${parts.join(` ${ex.conditionLogic||"and"} `)}`);
        }
      }
      return `${ex.navProperty}(${segs.join(";")})`;
    });
  };

  // Relational filters → OData clauses that filter ROOT rows by related records.
  // Parent (N:1): nav/field op value (Dataverse supports single-valued nav paths one level deep —
  // buildFilter is reused with the field's odata name prefixed by the nav property, so contains()/
  // GUID/type quoting rules all apply unchanged). Child (1:N): nav/any(o: conds) lambda, or a pure
  // existence test nav/any() when no condition is set; mode "none" negates with not.
  const buildRelFilterClauses = () => {
    const parts = [];
    for (const rf of relFilters) {
      const defined = (rf.conditions || []).filter(c => c.field && (c.value || c.op === "is_null" || c.op === "is_not_null"));
      // Schema-drift guard: a condition whose field no longer exists in the target's metadata must
      // be DROPPED, not emitted — getOdataName would fall back to the bare logical name, losing the
      // nav prefix and silently filtering the ROOT entity's same-named column (statecode, name…).
      const active = defined.filter(c => rf.allFields.some(f => f.l === c.field));
      if (rf.type === "collection") {
        // If every condition was dropped, skip the whole filter — a bare any() would CHANGE the
        // meaning from "has a matching child" to "has any child".
        if (defined.length && !active.length) continue;
        const neg = rf.mode === "none" ? "not " : "";
        if (active.length) {
          const lambdaFields = rf.allFields.map(f => ({ ...f, odata: `o/${f.odata}` }));
          const conds = active.map(c => buildFilter(c.field, c.op, c.value, lambdaFields));
          const inner = conds.length === 1 ? conds[0] : conds.join(` ${rf.conditionLogic || "and"} `);
          parts.push(`${neg}${rf.navProperty}/any(o:${inner})`);
        } else {
          parts.push(`${neg}${rf.navProperty}/any()`); // existence only: has children / has none
        }
      } else {
        if (!active.length) continue; // a parent filter with no condition filters nothing
        const navFields = rf.allFields.map(f => ({ ...f, odata: `${rf.navProperty}/${f.odata}` }));
        const conds = active.map(c => buildFilter(c.field, c.op, c.value, navFields));
        parts.push(conds.length === 1 ? conds[0] : `(${conds.join(` ${rf.conditionLogic || "and"} `)})`);
      }
    }
    return parts;
  };

  const buildGroupFilter = () => {
    const groupParts = filterGroups.map(g => {
      const active = g.conditions.filter(c => c.field && (c.value || c.op === "is_null" || c.op === "is_not_null"));
      if (!active.length) return "";
      const parts = active.map(c => buildFilter(c.field, c.op, c.value));
      if (parts.length === 1) return parts[0];
      return `(${parts.join(` ${g.logic} `)})`;
    }).filter(Boolean);
    const gf = groupParts.length ? groupParts.join(` ${groupLogic} `) : "";
    const rel = buildRelFilterClauses();
    if (!rel.length) return gf;
    if (!gf) return rel.join(" and ");
    // Relational clauses are ANDed with the WHERE groups. Parenthesize the group side when several
    // groups are OR-joined — OData's "and" binds tighter than "or", so "A or B and rel" would
    // silently become "A or (B and rel)".
    return `${groupParts.length > 1 ? `(${gf})` : gf} and ${rel.join(" and ")}`;
  };

  const fetchAbort = useRef(false);
  // Stop the paging loop if this tab is closed/unmounted mid-fetch — otherwise it keeps issuing
  // bridge.query(nextLink) + setRes on a torn-down component (orphaned network + warnings).
  useEffect(() => () => { fetchAbort.current = true; }, []);

  // Flatten a single object's properties into a clean record, resolving formatted values
  const flattenObj=(obj,prefix)=>{
    const clean={};
    if(!obj||typeof obj!=="object")return clean;
    for(const[k,v] of Object.entries(obj)){
      if(k.startsWith("@odata")||k==="@odata.etag")continue;
      const fvMatch=k.match(/^(.+)@OData\.Community\.Display\.V1\.FormattedValue$/);
      if(fvMatch){const key=prefix?`${prefix}.${fvMatch[1]}`:fvMatch[1];clean[key+"__display"]=v;continue;}
      const lkMatch=k.match(/^(.+)@Microsoft\.Dynamics\.CRM\.lookuplogicalname$/);
      if(lkMatch){const key=prefix?`${prefix}.${lkMatch[1]}`:lkMatch[1];clean[key+"__entity"]=v;continue;}
      if(k.includes("@"))continue;
      const key=prefix?`${prefix}.${k}`:k;
      if(v&&typeof v==="object"&&!Array.isArray(v)){
        // Single nested object (1:1 expand or single record) — flatten recursively
        Object.assign(clean,flattenObj(v,key));
      }else if(!Array.isArray(v)){
        clean[key]=v;
      }
      // Arrays are handled by flattenRecord
    }
    return clean;
  };

  // Flatten a record: for each collection expand (array), create multiple rows
  const flattenRecord=(r)=>{
    const base=flattenObj(r,"");
    // Find all array properties (collection expands)
    const arrays=[];
    for(const[k,v] of Object.entries(r)){
      if(k.startsWith("@")||k.includes("@"))continue;
      if(Array.isArray(v)&&v.length>0&&typeof v[0]==="object")arrays.push({key:k,items:v});
    }
    if(arrays.length===0)return[base];
    // Flatten: cartesian product of all arrays (usually just 1)
    let rows=[base];
    for(const arr of arrays){
      const newRows=[];
      for(const row of rows){
        if(arr.items.length===0){
          newRows.push(row);
        }else{
          for(const item of arr.items){
            const flatItem=flattenObj(item,arr.key);
            // Check for nested arrays inside the expand item
            const subArrays=[];
            for(const[sk,sv] of Object.entries(item)){
              if(sk.startsWith("@")||sk.includes("@"))continue;
              if(Array.isArray(sv)&&sv.length>0&&typeof sv[0]==="object")subArrays.push({key:`${arr.key}.${sk}`,items:sv});
            }
            if(subArrays.length===0){
              newRows.push({...row,...flatItem});
            }else{
              // Nested collection expand (2 levels deep)
              for(const subArr of subArrays){
                for(const subItem of subArr.items){
                  newRows.push({...row,...flatItem,...flattenObj(subItem,subArr.key)});
                }
              }
            }
          }
        }
      }
      rows=newRows;
    }
    return rows;
  };

  const cleanRecord=(r)=>{
    // For builder mode with expands, use the old logic for field mapping
    const matchingExpands=expands.filter(ex=>r[ex.navProperty]&&typeof r[ex.navProperty]==="object");
    if(matchingExpands.length>0&&qm==="builder"){
      // Builder mode: use expand field names
      const clean={};
      for(const[k,v] of Object.entries(r)){
        if(k.startsWith("@odata")||k==="@odata.etag")continue;
        const fvMatch=k.match(/^(.+)@OData\.Community\.Display\.V1\.FormattedValue$/);
        if(fvMatch){clean[fvMatch[1]+"__display"]=v;continue;}
        const lkMatch=k.match(/^(.+)@Microsoft\.Dynamics\.CRM\.lookuplogicalname$/);
        if(lkMatch){clean[lkMatch[1]+"__entity"]=v;continue;}
        if(k.includes("@"))continue;
        const me=expands.find(ex=>ex.navProperty===k);
        if(me&&v&&typeof v==="object"){
          if(Array.isArray(v)){
            for(const f of me.fields){
              const vals=v.map(item=>{const fv=item[f+"@OData.Community.Display.V1.FormattedValue"]||item[f];return fv!=null?String(fv):"";}).filter(Boolean);
              clean[`${me.targetEntity}.${f}`]=vals.join(", ");
            }
            clean[`${me.targetEntity}.__count`]=v.length;
          }else{
            for(const[ek,ev] of Object.entries(v)){if(ek.startsWith("@")||ek.includes("@"))continue;clean[`${me.targetEntity}.${ek}`]=ev;}
          }
        }else{clean[k]=v;}
      }
      return clean;
    }
    // OData/FetchXML/SQL mode: auto-flatten all nested objects and arrays
    return flattenObj(r,"");
  };

  // For OData mode with nested expands, flatten records into multiple rows
  const cleanAndFlatten=(records)=>{
    // Check if any record has array properties (collection expands)
    const hasArrays=records.some(r=>Object.values(r).some(v=>Array.isArray(v)&&v.length>0&&typeof v[0]==="object"));
    if(!hasArrays)return records.map(cleanRecord);
    // Flatten: each record may produce multiple rows
    const flat=[];
    for(const r of records){flat.push(...flattenRecord(r));}
    return flat;
  };

  const run=async(runOpts)=>{
    setError("");
    fetchAbort.current = false;
    const stream=streamRef.current; // a streamed export: pages go to the file, not to the grid
    // run({ sql }) = run THIS SQL instead of the editor's (the preview of an UPDATE / DELETE).
    // (A click passes an event — only a plain { sql } object counts.)
    const ro=runOpts&&typeof runOpts==="object"&&typeof runOpts.sql==="string"?runOpts:null;
    const sqlText=ro?ro.sql:sqlQ;
    if(!ro&&qm==="sql"){
      const w=parseSqlWrite(sqlQ);
      if(w){
        if(w.error){setError(w.error);return;}
        if(stream){await streamFail(stream,"UPDATE and DELETE aren't streamed to a file — run the preview, then apply it.");return;}
        await previewSqlWrite(w);
        return;
      }
    }
    if(!stream){ setTooBig(null); setStreamState(null); }
    // Grid: a page is appended IN PLACE (the old [...all, ...page] copied the whole set on every
    // page — quadratic on big results) and repaints are signalled with dataVersion.
    let ver=0;
    const addRows=(arr,page)=>{for(let i=0;i<page.length;i++)arr.push(page[i]);};
    const overMemory=(arr)=>{
      if(!memTight()) return false;
      const n=arr.length; arr.length=0; fetchAbort.current=true;
      setRes(null); setTooBig({rows:n}); setLoading(false);
      return true;
    };
    const runGen=selGen.current; // capture to detect entity change mid-run
    // stale() guards every setRes AFTER an await: switching entity mid-run used to paint the OLD
    // entity's rows under the NEW entity's header (fetchAbort only stopped pages 2+ — audit finding).
    const stale=()=>selGen.current!==runGen;
    const validFieldNames = new Set(fields.map(f => f.l));
    const validSf = sf.filter(f => validFieldNames.has(f));
    if(isLive && loadingFields){ setError("Wait for fields to load..."); return; }

    const allSelected = validSf.length >= fields.length;
    const odataSelect = allSelected ? [] : validSf.map(f => getOdataName(f));
    const expandClauses = buildExpandClauses(true);
    const buildQ=()=>{
      if(!ent)return"";
      let q=`GET /api/data/v9.2/${ent.p}`;const ps=[];
      if(odataSelect.length)ps.push(`$select=${odataSelect.join(",")}`);
      if(expandClauses.length)ps.push(`$expand=${expandClauses.join(",")}`);
      const gf2=buildGroupFilter();
      if(gf2) ps.push(`$filter=${gf2}`);
      if(orderBy.f)ps.push(`$orderby=${getOdataName(orderBy.f)} ${orderBy.dir}`);
      if(lim>0)ps.push(`$top=${lim}`);
      return ps.length?q+"?"+ps.join("&"):q;
    };
    let sqlGenFxml="";
    const useNativeSql=qm==="sql"&&sqlEngine==="native"&&!nativeSqlDown;
    if(qm==="sql"){
      if(!sqlText.trim()){setError("SQL query is empty");return;}
      if(!useNativeSql){
        const r=sqlToFetchXml(sqlText);
        if(r.error){setError(r.error);return;}
        sqlGenFxml=r.fetchXml;
        setSqlFx(sqlGenFxml);
      }
    }
    const q=qm==="odata"?rq:qm==="fetchxml"?fxml:qm==="sql"?sqlQ:buildQ();
    addHistory(q,qm);

    if(!isLive){
      if(stream){
        const cols=(sf.length?sf:FLDS.map(f=>f.l)).map(f=>({name:f,keys:[f]}));
        await streamRun(stream,{declared:cols,complete:true,first:ROWS,sheetBase:ent?.l||"demo",next:null});
        return;
      }
      setRes({entity:ent,fields:sf.length?sf:FLDS.map(f=>f.l),data:ROWS,count:ROWS.length,total:ROWS.length,query:q,elapsed:"mock",nextLink:null,fetching:false,...buildUpdateMeta()});
      addToHistory(ent,q,qm,(sf.length?sf:FLDS.map(f=>f.l)).length); // demo parity: history (and its builder-restore) works in demo too
      return;
    }

    // ── Native Dataverse SQL (?sql= query option) ─────────────────────────────
    // The server parses and executes the SELECT itself; the response is plain OData
    // (value[], @odata.nextLink), so pagination just follows nextLink. On the ONE error
    // that means "this org doesn't have the option yet", we flip to the transpiler for
    // the session; every other server error is shown verbatim — it is the diagnosis.
    if(qm==="sql"&&useNativeSql){
      const base=extractBaseTable(sqlText);
      if(!base){setError("Couldn't find the base table after FROM — check the query.");return;}
      const baseEnt=entities.find(x=>x.l===base);
      setLoading(true);
      // Irregular plurals (opportunity -> opportunities) make base+"s" a wrong guess: when the
      // entities list misses the table, ask the metadata (cached) before falling back (review finding).
      let entitySet=baseEnt?.p;
      if(!entitySet){ try{ entitySet=await bridge.getEntitySet(base); }catch{ /* resolved below */ } }
      if(!entitySet)entitySet=base+"s";
      const sqlEnt=baseEnt||{l:base,p:entitySet};
      const t0=Date.now();
      let fellBack=false;
      try{
        const first=await bridge.queryRaw(`${entitySet}?sql=${encodeURIComponent(sqlText)}`);
        if(stale())return;
        if(stream){
          setLoading(false);addToHistory(sqlEnt,q,qm,0);
          await streamRun(stream,{declared:[],complete:false,first:first?.records||[],sheetBase:sqlEnt.l,next:first?.nextLink||null,
            getPage:async(nlk)=>{const pd=await bridge.query(nlk,{});return {rows:pd?.records||[],next:pd?.nextLink||null};}});
          return;
        }
        let allRecords=[...(first?.records||[])];
        // Column discovery must UNION across rows — with a LEFT JOIN, row 1 can miss the
        // joined columns entirely (they're absent, not null, in the OData payload).
        const fieldSet=new Set();
        const collect=(recs,cap)=>recs.slice(0,cap).forEach(r2=>Object.keys(r2).forEach(k=>{if(!k.startsWith("@")&&!k.includes("@")&&k!=="__error")fieldSet.add(k);}));
        collect(allRecords,200);
        const odataFieldMap={};[...fieldSet].forEach(f=>{odataFieldMap[f]=f;});
        setRes({entity:sqlEnt,fields:[...fieldSet],odataFieldMap,data:allRecords,count:allRecords.length,total:allRecords.length,query:q,elapsed:`${((Date.now()-t0)/1000).toFixed(1)}s`,nextLink:null,fetching:!!first?.nextLink});
        addToHistory(sqlEnt,q,qm,fieldSet.size);
        setLoading(false);
        let nl=first?.nextLink,page=1;
        while(nl&&!fetchAbort.current&&!stale()){
          page++;
          try{
            const pd=await bridge.query(nl,{}); // absolute nextLink rides the generic query action (http passthrough + org-host guard)
            if(stale())return;
            if(!pd?.records?.length)break;
            addRows(allRecords,pd.records);
            if(overMemory(allRecords))return;
            collect(pd.records,50);
            nl=pd.nextLink;
            const paint=!nl||page%5===0;
            setRes(prev=>({...prev,...(paint?{data:allRecords,dataVersion:++ver,fields:[...fieldSet]}:{}),count:allRecords.length,total:allRecords.length,fetching:!!nl,elapsed:`${((Date.now()-t0)/1000).toFixed(1)}s`}));
          }catch(e2){setError(`Page ${page}: ${e2.message}`);partialRef.current=true;setRes(prev=>prev?{...prev,partial:true}:prev);break;}
        }
        if(!stale())setRes(prev=>({...prev,data:allRecords,dataVersion:++ver,fields:[...fieldSet],fetching:false,elapsed:`${((Date.now()-t0)/1000).toFixed(1)}s`}));
        return;
      }catch(e){
        if(stale())return;
        if(isSqlOptionUnsupported(e.message||"")){
          setNativeSqlDown(true);fellBack=true; // engine toggle shows why; this session stays on the transpiler
        }else{
          setError(`Native SQL: ${e.message}`);
          setLoading(false);
          return;
        }
      }
      if(fellBack){
        const r=sqlToFetchXml(sqlText);
        if(r.error){setLoading(false);setError(`Native SQL isn't available on this environment, and the FetchXML fallback couldn't parse the query: ${r.error}`);return;}
        sqlGenFxml=r.fetchXml;setSqlFx(sqlGenFxml);
      }
    }

    if(qm==="fetchxml"||qm==="sql"){
      const activeFxml=qm==="sql"?sqlGenFxml:fxml;
      if(!activeFxml.trim()){setError("FetchXML is empty");return;}
      // Strip <having> before sending to server — always apply client-side
      const havingBlock=activeFxml.match(/<having>([\s\S]*?)<\/having>/i);
      const serverFxml=activeFxml.replace(/<having>[\s\S]*?<\/having>/gi,"");
      setLoading(true);
      const t0=Date.now();
      try{
        const data=await bridge.executeFetchXml(serverFxml);
        const t1=((Date.now()-t0)/1000).toFixed(1);
        if(!data?.records){setError("No results");setLoading(false);return;}
        // Page N+1: with the server's paging cookie (every page as cheap as the first); a query the
        // cookie doesn't fit ("Paging Cookie And Query Do Not Match") goes on by page number.
        let useCookie=true;
        const fetchPage=async(pg,cookie)=>{
          try{ return await bridge.executeFetchXml(pagedFetchXml(serverFxml,pg,useCookie?cookie:null)); }
          catch(e){ if(useCookie&&cookie&&isCookieMismatch(e.message)){ useCookie=false; return await bridge.executeFetchXml(pagedFetchXml(serverFxml,pg,null)); } throw e; }
        };
        const firstRec=data.records[0]||{};
        const headerFields=Object.keys(firstRec).filter(k=>!k.startsWith("@")&&!k.includes("@")&&k!=="__error");
        const odataFieldMap={};
        headerFields.forEach(f=>{odataFieldMap[f]=f;});
        // HAVING is a client-side post-aggregation filter (FetchXML can't express it server-side).
        // Apply it to EVERY page, not just the first — a grouped query that pages would otherwise leak
        // unfiltered rows from page 2 onward.
        const applyHaving=(recs)=>{
          if(!havingBlock) return recs;
          let out=recs;
          const havingRegex=/<condition\s+attribute\s*=\s*"([^"]*)"\s+operator\s*=\s*"([^"]*)"\s+value\s*=\s*"([^"]*)"/gi;
          let hm;
          while((hm=havingRegex.exec(havingBlock[1]))!==null){
            const[,alias,op,val]=hm;const nv=Number(val);
            out=out.filter(r=>{const v=Number(r[alias])||0;
              if(op==="ge")return v>=nv;if(op==="gt")return v>nv;if(op==="le")return v<=nv;if(op==="lt")return v<nv;if(op==="eq")return v===nv;if(op==="ne")return v!==nv;return true;
            });
          }
          return out;
        };
        if(stream){
          const fxName=(activeFxml.match(/<entity\s+name\s*=\s*"([^"]*)"/i)||[])[1]||"query";
          const decl=fetchXmlColumns(serverFxml);
          setLoading(false);
          await streamRun(stream,{declared:decl.cols,complete:decl.complete,first:data.records,sheetBase:fxName,mapRows:applyHaving,
            next:data.moreRecords?{page:2,cookie:cookieFrom(data.pagingCookie)}:null,
            getPage:async(cur)=>{const pd=await fetchPage(cur.page,cur.cookie);return {rows:pd?.records||[],next:pd?.moreRecords?{page:cur.page+1,cookie:cookieFrom(pd.pagingCookie)}:null};}});
          return;
        }
        let allRecords=applyHaving([...data.records]);

        // Resolve the entity from the FetchXML/SQL <entity name="…">, not the stale Builder selection,
        // so the export filename matches the queried table.
        const fxEntName=(activeFxml.match(/<entity\s+name\s*=\s*"([^"]*)"/i)||[])[1]||"";
        const fxEnt=(fxEntName&&entities.find(e=>e.l===fxEntName))||(fxEntName?{l:fxEntName,p:fxEntName+"s"}:ent);
        if(stale())return;
        setRes({entity:fxEnt,fields:headerFields,odataFieldMap,data:allRecords,count:allRecords.length,total:allRecords.length,query:q,elapsed:`${t1}s`,nextLink:null,fetching:!!data.moreRecords});
        addToHistory(fxEnt,q,qm,headerFields.length); // FetchXML/SQL runs were never recorded (audit finding)
        setLoading(false);

        let page=1;
        // Page by page NUMBER only. We deliberately never echo the paging cookie back into the
        // fetchXml: re-encoding the Web API cookie is brittle and triggers the documented 400
        // "Paging Cookie And Query Do Not Match. The counts are not equal." Paging by number is
        // the reliable approach — the cookie's PRESENCE in each response still tells us when to
        // stop (Dataverse returns it only while more records remain).
        // (pages go to serverFxml: the HAVING block is client-side — page 2+ used to send it to the server)
        let hasMore=!!data.moreRecords;
        let cookie=cookieFrom(data.pagingCookie);
        while(hasMore&&!fetchAbort.current&&!stale()){
          page++;
          try{
            const pageData=await fetchPage(page,cookie);
            if(stale())return;
            if(!pageData?.records?.length)break;
            addRows(allRecords,applyHaving(pageData.records));
            if(overMemory(allRecords))return;
            hasMore=!!pageData.moreRecords;
            cookie=cookieFrom(pageData.pagingCookie);
            // Throttle the data re-render (every 5 pages) so the Results memos don't recompute over the
            // whole accumulating set on every page; count/progress still update each page.
            const paint=!hasMore||page%5===0;
            setRes(prev=>({...prev,...(paint?{data:allRecords,dataVersion:++ver}:{}),count:allRecords.length,total:allRecords.length,fetching:hasMore,elapsed:`${((Date.now()-t0)/1000).toFixed(1)}s`}));
          }catch(e){
            setError(`Page ${page}: ${e.message}`);partialRef.current=true;setRes(prev=>prev?{...prev,partial:true}:prev);break;
          }
        }
        if(!stale()) setRes(prev=>({...prev,data:allRecords,dataVersion:++ver,fetching:false,elapsed:`${((Date.now()-t0)/1000).toFixed(1)}s`}));
      }catch(e){
        if(stream){ await streamFail(stream,e.message||String(e)); setLoading(false); return; }
        // ── Client-side aggregation fallback (50k limit) ──
        if(e.message&&(e.message.includes("50000")||e.message.includes("having")||e.message.includes("Having"))&&activeFxml.includes("aggregate")){
          try{
            setError("");
            setLoading(true);
            // Strip aggregate attributes and rebuild as a flat query
            let flatXml=activeFxml
              .replace(/\s*aggregate\s*=\s*"true"/gi,"")
              .replace(/\s*groupby\s*=\s*"true"/gi,"")
              .replace(/\s*aggregate\s*=\s*"count"/gi,"")
              .replace(/\s*aggregate\s*=\s*"sum"/gi,"")
              .replace(/\s*aggregate\s*=\s*"avg"/gi,"")
              .replace(/\s*aggregate\s*=\s*"min"/gi,"")
              .replace(/\s*aggregate\s*=\s*"max"/gi,"")
              .replace(/\s*alias\s*=\s*"[^"]*"/gi,"");
            // Remove <having> block entirely
            flatXml=flatXml.replace(/<having>[\s\S]*?<\/having>/gi,"");
            // Extract groupby fields and aggregate fields from original XML
            const groupByFields=[];
            const aggFields=[];
            const attrRegex=/<attribute\s+([^/>]*)\/?>/gi;
            let attrMatch;
            while((attrMatch=attrRegex.exec(activeFxml))!==null){
              const attrStr=attrMatch[1];
              const nameMatch=attrStr.match(/name\s*=\s*"([^"]*)"/);
              const aliasMatch=attrStr.match(/alias\s*=\s*"([^"]*)"/);
              const aggMatch=attrStr.match(/aggregate\s*=\s*"([^"]*)"/);
              const gbMatch=attrStr.match(/groupby\s*=\s*"true"/i);
              if(nameMatch){
                if(gbMatch)groupByFields.push({name:nameMatch[1],alias:aliasMatch?aliasMatch[1]:nameMatch[1]});
                else if(aggMatch)aggFields.push({name:nameMatch[1],alias:aliasMatch?aliasMatch[1]:nameMatch[1],fn:aggMatch[1].toLowerCase()});
              }
            }
            // Parse having conditions
            const havingConditions=[];
            const havingRegex=/<condition\s+attribute\s*=\s*"([^"]*)"\s+operator\s*=\s*"([^"]*)"\s+value\s*=\s*"([^"]*)"/gi;
            const havingBlock=activeFxml.match(/<having>([\s\S]*?)<\/having>/i);
            if(havingBlock){
              let hm;
              while((hm=havingRegex.exec(havingBlock[1]))!==null){
                havingConditions.push({alias:hm[1],op:hm[2],value:Number(hm[3])});
              }
            }
            // Ensure flat XML only selects the fields we need
            const neededFields=[...groupByFields.map(f=>f.name),...aggFields.map(f=>f.name)];
            const entityMatch=flatXml.match(/<entity\s+name\s*=\s*"([^"]*)"/);
            const entName=entityMatch?entityMatch[1]:"";
            // Rebuild clean flat XML. Filter extraction is depth-aware: `<filter type="and">` (any
            // attribute) must match, and nested groups must be carried WHOLE — the old first-match
            // regex dropped attributed filters entirely, silently aggregating the WHOLE table (audit finding).
            const extractFilterBlock=(xml)=>{
              const lower=xml.toLowerCase();
              const start=lower.indexOf("<filter");
              if(start<0) return "";
              let depth=0,pos=start;
              while(pos<lower.length){
                const open=lower.indexOf("<filter",pos);
                const close=lower.indexOf("</filter>",pos);
                if(close<0) return "";
                if(open>=0&&open<close){depth++;pos=open+7;}
                else{depth--;pos=close+9;if(depth===0)return xml.slice(start,close+9);}
              }
              return "";
            };
            const filterBlock=extractFilterBlock(flatXml);
            if(!filterBlock&&/<filter/i.test(flatXml)) setError("⚠ Aggregation fallback couldn't carry the query's WHERE filter — the totals below cover ALL rows of the table.");
            const orderField=groupByFields.length?groupByFields[0].name:neededFields[0];
            const cleanFlatXml=`<fetch><entity name="${entName}">${neededFields.map(f=>`<attribute name="${f}"/>`).join("")}${filterBlock}<order attribute="${orderField}"/></entity></fetch>`;
            // Entity from the parsed FetchXML, not the stale Builder selection (so exports are named right).
            const aggEnt=(entName&&entities.find(e=>e.l===entName))||(entName?{l:entName,p:entName+"s"}:ent);

            if(stale())return;
            setRes({entity:aggEnt,fields:[],data:[],count:0,total:0,query:q,elapsed:"loading...",fetching:true});
            setLoading(false);

            // Use count="5000" in fetch for smaller pages = faster transfer
            const pagedFlatXml=cleanFlatXml.replace("<fetch",`<fetch count="5000"`);

            // Paginate all records
            let allRaw=[];
            let pg=1;
            let more=true;
            const t0b=Date.now();
            while(more&&!fetchAbort.current&&!stale()){
              const pgXml=pg===1?pagedFlatXml:pagedFlatXml.replace(`count="5000"`,`count="5000" page="${pg}"`);
              try{
                const pgData=await bridge.executeFetchXml(pgXml);
                if(!pgData?.records?.length)break;
                allRaw=[...allRaw,...pgData.records];
                more=pgData.records.length>=5000;
                pg++;
                const elapsed=((Date.now()-t0b)/1000).toFixed(1);
                const speed=allRaw.length/((Date.now()-t0b)/1000);
                const estRemain=more&&speed>0?` · ~${Math.ceil((allRaw.length*0.5)/speed)}s remaining`:"";
                setRes(prev=>({...prev,count:allRaw.length,total:allRaw.length,elapsed:`${elapsed}s — loading ${allRaw.length.toLocaleString()} records (page ${pg-1})${estRemain}`}));
              }catch(pgErr){
                if(pg===2&&pgErr.message.includes("0x80041129")){pg--;more=true;continue;}
                break;
              }
            }

            // Client-side aggregation
            const groups={};
            allRaw.forEach(r=>{
              const key=groupByFields.map(f=>r[f.name]??r[f.name+"@OData.Community.Display.V1.FormattedValue"]??"(null)").join("|||");
              if(!groups[key])groups[key]={_key:key,_records:[],...Object.fromEntries(groupByFields.map(f=>[f.alias,r[f.name+"@OData.Community.Display.V1.FormattedValue"]||r[f.name]]))};
              groups[key]._records.push(r);
            });
            // Compute aggregates
            let results=Object.values(groups).map(g=>{
              const row={...g};
              aggFields.forEach(af=>{
                const vals=g._records.map(r=>r[af.name]).filter(v=>v!=null);
                if(af.fn==="count")row[af.alias]=g._records.length;
                else if(af.fn==="sum")row[af.alias]=vals.reduce((a,b)=>a+(Number(b)||0),0);
                else if(af.fn==="avg")row[af.alias]=vals.length?vals.reduce((a,b)=>a+(Number(b)||0),0)/vals.length:0;
                else if(af.fn==="min")row[af.alias]=vals.length?vals.reduce((m,v)=>Math.min(m,Number(v)),Infinity):null;   // reduce, not Math.min(...vals): argument spread throws RangeError past ~100k values
                else if(af.fn==="max")row[af.alias]=vals.length?vals.reduce((m,v)=>Math.max(m,Number(v)),-Infinity):null;
              });
              delete row._key;delete row._records;
              return row;
            });
            // Apply HAVING
            havingConditions.forEach(h=>{
              results=results.filter(r=>{
                const v=r[h.alias];
                if(h.op==="ge")return v>=h.value;
                if(h.op==="gt")return v>h.value;
                if(h.op==="le")return v<=h.value;
                if(h.op==="lt")return v<h.value;
                if(h.op==="eq")return v===h.value;
                if(h.op==="ne")return v!==h.value;
                return true;
              });
            });
            results.sort((a,b)=>{const ak=aggFields[0]?.alias;return ak?(b[ak]||0)-(a[ak]||0):0;});
            const headerFields=Object.keys(results[0]||{});
            const odataFieldMap={};headerFields.forEach(f=>{odataFieldMap[f]=f;});
            const elapsed=`${((Date.now()-t0b)/1000).toFixed(1)}s`;
            if(stale())return;
            setRes({entity:aggEnt,fields:headerFields,odataFieldMap,data:results,count:results.length,total:results.length,query:q,elapsed:`${elapsed} (client-side aggregation on ${allRaw.length} records)`,fetching:false});
          }catch(fallbackErr){
            setError(`Client-side aggregation failed: ${fallbackErr.message}`);setLoading(false);
          }
        }else{
          setError(e.message);setLoading(false);
        }
      }
      return;
    }

    // ── OData raw mode: execute the user-typed OData URL directly ──
    if(qm==="odata"){
      if(!rq.trim()){setError("OData query is empty");return;}
      // The history redacts filter VALUES to "$filter=..." (they're never persisted — privacy).
      // Executing the placeholder verbatim gets Dataverse's cryptic "Expression expected at
      // position 0 in '…'" — explain it here instead of letting the 400 do the talking.
      if(/\$filter=\.\.\.(&|$)/.test(rq)){setError('This query came from the history, where filter VALUES are never stored (privacy). Replace "$filter=..." with your condition — or delete that clause to run unfiltered. Use Saved Queries (⭐) to keep complete filters.');return;}
      setLoading(true);
      const t0=Date.now();
      try{
        // Send the raw OData path directly — no parsing/reconstruction needed
        // Any form: "GET /api/data/v9.2/…", a full URL (this org or another), "/api/data/…", "accounts?…".
        const norm=normalizeODataInput(rq,orgInfo?.orgUrl);
        if(norm.error){setError(norm.error);setLoading(false);return;}
        const raw=norm.path;
        setRunNote(norm.foreignHost?`This URL came from ${norm.host} — it ran on this environment.`:"");
        const qIdx=raw.indexOf("?");
        const entitySet=qIdx>-1?raw.substring(0,qIdx):raw;
        const data=await bridge.queryRaw(raw);
        if(!data?.records){setError("No results");setLoading(false);return;}
        const t1=((Date.now()-t0)/1000).toFixed(1);
        if(stream){
          // $select names the columns (a lookup lands in _x_value); without it, or with $expand,
          // the columns come from the rows.
          const sel=((raw.match(/[?&]\$select=([^&]*)/i)||[])[1]||"");
          const declared=decodeURIComponent(sel).split(",").map(x=>x.trim()).filter(Boolean).map(n=>({name:n,keys:[n,`_${n}_value`]}));
          const complete=declared.length>0&&!/[?&]\$(expand|apply)=/i.test(raw);
          const set0=raw.split(/[?(/]/)[0];
          setLoading(false);
          await streamRun(stream,{declared,complete,first:data.records,sheetBase:(entities.find(e=>e.p===set0)||{l:set0}).l,mapRows:cleanAndFlatten,next:data.nextLink||null,
            getPage:async(nlk)=>{const pd=await bridge.query(nlk,{});return {rows:pd?.records||[],next:pd?.nextLink||null};}});
          return;
        }
        const firstClean=cleanAndFlatten(data.records);
        // Derive columns from ALL returned rows (not just first — first row may lack expand data)
        const colSet=new Set();
        for(const row of firstClean)for(const k of Object.keys(row))colSet.add(k);
        const headerFields=[...colSet].filter(k=>!k.startsWith("@")&&!k.includes("@")&&!k.endsWith("__display")&&!k.endsWith("__entity"));
        const odataFieldMap={};
        headerFields.forEach(f=>{odataFieldMap[f]=f;});
        let allRecords=[...firstClean];
        let nextLink=data.nextLink||null;
        // Resolve the entity from the OData path (segment before "?"), NOT the stale Builder selection —
        // otherwise the export filename uses the previously-selected entity (e.g. a query on contacts
        // saved as "fou_salesareateam"). Map the entity-set name back to its logical name when known.
        const baseSet=entitySet.split(/[(/]/)[0];
        const odataEnt=entities.find(e=>e.p===baseSet)||{l:baseSet,p:baseSet};
        if(stale())return;
        setRes({entity:odataEnt,fields:headerFields,odataFieldMap,data:allRecords,count:allRecords.length,total:allRecords.length,query:q,elapsed:`${t1}s`,nextLink,fetching:!!nextLink,
          ...(odataEnt?.l===ent?.l?buildUpdateMeta():{})}); // raw query may hit ANOTHER table — the loaded metadata would then describe the wrong fields
        addToHistory(odataEnt,q,qm,headerFields.length);
        setLoading(false);
        // Paginate
        let pageNum=1;
        while(nextLink&&!fetchAbort.current&&!stale()){
          pageNum++;
          try{
            const pageData=await bridge.query(nextLink,{});
            if(!pageData?.records?.length)break;
            const pageClean=cleanAndFlatten(pageData.records);
            addRows(allRecords,pageClean);
            if(overMemory(allRecords))return;
            // Discover new columns from this page (expand data may appear in later pages)
            let newCols=false;
            for(const row of pageClean)for(const k of Object.keys(row)){if(!colSet.has(k)){colSet.add(k);newCols=true;}}
            if(newCols){const updatedFields=[...colSet].filter(k=>!k.startsWith("@")&&!k.includes("@")&&!k.endsWith("__display")&&!k.endsWith("__entity"));headerFields.length=0;headerFields.push(...updatedFields);updatedFields.forEach(f=>{odataFieldMap[f]=f;});}
            nextLink=pageData.nextLink||null;
            const paint=!nextLink||pageNum%5===0||newCols; // throttle data re-render; force a paint when columns change
            setRes(prev=>({...prev,fields:headerFields,odataFieldMap,...(paint?{data:allRecords,dataVersion:++ver}:{}),count:allRecords.length,total:allRecords.length,nextLink,fetching:!!nextLink,elapsed:`${((Date.now()-t0)/1000).toFixed(1)}s`}));
          }catch(pageErr){
            setError(`Page ${pageNum}: ${pageErr.message}`);partialRef.current=true;setRes(prev=>prev?{...prev,partial:true}:prev);break;
          }
        }
        if(!stale()) setRes(prev=>({...prev,data:allRecords,dataVersion:++ver,fetching:false,nextLink:null,elapsed:`${((Date.now()-t0)/1000).toFixed(1)}s`}));
      }catch(e){
        setError(e.message);setLoading(false);
      }
      return;
    }

    // ── Builder mode ──
    setLoading(true);
    const t0 = Date.now();
    try {
      const opts={};
      if(odataSelect.length)opts.select=odataSelect.join(",");
      if(expandClauses.length)opts.expand=expandClauses.join(",");
      const gf3=buildGroupFilter();
      if(gf3) opts.filter=gf3;
      if(orderBy.f)opts.orderby=`${getOdataName(orderBy.f)} ${orderBy.dir}`;
      if(lim>0)opts.top=String(lim);
      const data=await bridge.query(ent.p,opts);
      if(stale())return;
      if(!data?.records){setError("No results returned");setLoading(false);return;} // used to leave the button stuck on "Querying…" forever (audit finding)
      const t1 = ((Date.now()-t0)/1000).toFixed(1);
      if(stream){
        const explicit=validSf.length>0&&!allSelected;
        const declared=explicit?[...validSf.map(f=>({name:f,keys:[getOdataName(f)]})),...expands.flatMap(ex=>ex.fields.map(f=>({name:`${ex.targetEntity}.${f}`,keys:[`${ex.targetEntity}.${f}`]})))]:[];
        setLoading(false);addToHistory(ent,q,qm,declared.length);
        await streamRun(stream,{declared,complete:explicit,first:data.records,sheetBase:ent.l,mapRows:recs=>recs.map(cleanRecord),next:data.nextLink||null,
          getPage:async(nlk)=>{const pd=await bridge.query(nlk,{});return {rows:pd?.records||[],next:pd?.nextLink||null};}});
        return;
      }

      const firstClean = data.records.map(cleanRecord);
      // When falling back to record keys (allSelected), scan ALL records not just the first
      const builderColSet = new Set();
      if (!(validSf.length > 0 && !allSelected)) {
        for (const row of firstClean) for (const k of Object.keys(row)) builderColSet.add(k);
      }
      const headerFields = [...(validSf.length > 0 && !allSelected ? validSf : (builderColSet.size > 0 ? [...builderColSet].filter(k=>!k.endsWith("__display")&&!k.endsWith("__entity")&&!k.includes(".")) : validSf))];
      for (const ex of expands) { for (const f of ex.fields) { headerFields.push(`${ex.targetEntity}.${f}`); } }
      const odataFieldMap = {};
      headerFields.forEach(f => { odataFieldMap[f] = f.includes(".") ? f : getOdataName(f); });

      let allRecords = [...firstClean];
      let nextLink = data.nextLink || null;
      setRes({entity:ent, fields:headerFields, odataFieldMap, data:allRecords, count:allRecords.length, total:allRecords.length, query:q, elapsed:`${t1}s`, nextLink, fetching:!!nextLink, ...buildUpdateMeta()});
      addToHistory(ent,q,qm,headerFields.length);
      setLoading(false);

      let pageNum = 1;
      const hasExpand = expandClauses.length > 0;
      while (nextLink && !fetchAbort.current && !stale()) {
        pageNum++;
        try {
          const pageData = await bridge.query(nextLink, {});
          if (!pageData?.records?.length) break;
          const pageClean = pageData.records.map(cleanRecord);
          addRows(allRecords, pageClean);
          if (overMemory(allRecords)) return;
          // Discover new columns when using auto-detect (allSelected fallback path)
          let newCols = false;
          if (!(validSf.length > 0 && !allSelected)) {
            for (const row of pageClean) for (const k of Object.keys(row)) { if (!builderColSet.has(k)) { builderColSet.add(k); newCols = true; } }
            if (newCols) {
              const updated = [...builderColSet].filter(k=>!k.endsWith("__display")&&!k.endsWith("__entity")&&!k.includes("."));
              const expandCols = [];
              for (const ex of expands) for (const f of ex.fields) expandCols.push(`${ex.targetEntity}.${f}`);
              headerFields.length = 0;
              headerFields.push(...updated, ...expandCols);
              headerFields.forEach(f => { odataFieldMap[f] = f.includes(".") ? f : getOdataName(f); });
            }
          }
          nextLink = pageData.nextLink || null;
          const paint = !nextLink || pageNum%5===0 || newCols; // throttle data re-render; force a paint when columns change
          setRes(prev => ({...prev, fields: headerFields, odataFieldMap, ...(paint?{data:allRecords,dataVersion:++ver}:{}), count: allRecords.length, total: allRecords.length, nextLink, fetching: !!nextLink, elapsed:`${((Date.now()-t0)/1000).toFixed(1)}s`}));
        } catch (pageErr) {
          if (isSessionExpired(pageErr.message)) {
            setError(SESSION_EXPIRED_MSG);
          } else { setError(`Page ${pageNum}: ${pageErr.message}`); }
          setRes(prev => ({...prev, nextLink: null, fetching: false}));
          break;
        }
      }
      if (hasExpand && ent.c && allRecords.length < ent.c * 0.9) {
        setError(`⚠ ${allRecords.length} records retrieved out of ${ent.c} — D365 limits results with $expand. Remove expand to get all records, then enrich in a second query.`);
      }
      if(!stale()) setRes(prev => ({...prev, data: allRecords, dataVersion: ++ver, fetching: false, nextLink: null, elapsed:`${((Date.now()-t0)/1000).toFixed(1)}s`}));
    } catch(e) {
      if(isSessionExpired(e.message)) {
        setError(SESSION_EXPIRED_MSG);
      } else { setError(e.message); }
      setLoading(false);
    }
  };

  const [entityCounts, setEntityCounts] = useState({});
  useEffect(() => {
    if (!isLive || entities.length === 0) return;
    let cancelled = false;
    const loadCounts = async () => {
      const loaded = new Set();
      for (const e of entities.slice(0, 50)) {
        if (cancelled || loaded.has(e.l)) continue;
        loaded.add(e.l);
        try {
          const c = await bridge.getEntityCount(e.p);
          if (!cancelled && c >= 0) setEntityCounts(prev => ({...prev, [e.l]: c}));
        } catch {}
      }
    };
    loadCounts();
    return () => { cancelled = true; };
  }, [entities.length, isLive]);

  const stopFetch = () => { fetchAbort.current = true; };

  // Gate on `active`: every query tab keeps its Explorer mounted, so without this guard Ctrl+Enter
  // would fire run() on every hidden tab at once. Only the visible tab should execute.
  useKeyboard("Enter",()=>{if(active&&ent&&!loading&&!loadingFields)run();},[active,ent,sf,filterGroups,groupLogic,lim,qm,rq,fxml,sqlQ,loading,loadingFields]);

  return(
    <div style={{display:"flex",height:"100%",flexDirection:bp.mobile?"column":"row"}}>
      {(bp.mobile?showList:true)&&(
        <div style={{width:bp.mobile?"100%":bp.tablet?200:240,borderRight:bp.mobile?"none":`1px solid ${C.bd}`,display:"flex",flexDirection:"column",flexShrink:0,...(bp.mobile?{maxHeight:"50vh"}:{})}}>
          <div style={{padding:"8px 8px 4px"}}>
            <input value={es} onChange={e=>setEs(e.target.value)} placeholder="Search..." style={inp({fontSize:13,padding:"6px 10px"})}/>
            {isLive&&<div style={{fontSize:11,color:C.gn,padding:"4px 4px 0"}}>{entities.length} entities loaded</div>}
          </div>
          <div style={{flex:1,overflow:"auto",padding:"0 6px 6px"}}>
            {loading&&!ent ? <div style={{textAlign:"center",padding:20}}><Spin/><p style={{color:C.txd,fontSize:13,marginTop:8}}>Loading entities...</p></div>
            : filtered.map(e=>(
            <div key={e.l} style={{display:"flex",alignItems:"center",marginBottom:1}}>
              <button onClick={()=>selEnt(e)} style={{flex:1,display:"flex",alignItems:"center",gap:7,padding:"6px 8px",border:"none",borderRadius:5,cursor:"pointer",background:ent?.l===e.l?C.sfa:"transparent",color:ent?.l===e.l?C.tx:C.txm}}>
                <span style={{fontSize:15}}>{e.i}</span><div style={{flex:1,textAlign:"left",minWidth:0}}><div style={{fontSize:13,fontWeight:ent?.l===e.l?600:400,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{e.d}</div><div style={{fontSize:11,color:C.txd,...mono}}>{e.l}</div></div><TableTypeBadge tt={e.tt}/>{(e.c>0||entityCounts[e.l]>0)&&<span style={{fontSize:10,color:C.txd,background:C.bg,padding:"1px 5px",borderRadius:3,...mono}}>{(e.c||entityCounts[e.l]||0).toLocaleString()}</span>}
              </button>
              <span onClick={(ev)=>{ev.stopPropagation();toggleBookmark(e.l);}} style={{cursor:"pointer",fontSize:13,padding:"2px 4px",color:bookmarks.includes(e.l)?C.yw:C.txd+"44",flexShrink:0}} title={bookmarks.includes(e.l)?"Remove bookmark":"Bookmark"}>★</span>
            </div>
          ))}</div>
        </div>
      )}
      <div style={{flex:1,overflow:"auto",minWidth:0}}>
        {error&&<div style={{padding:"8px 12px",background:C.rd+"22",borderBottom:`1px solid ${C.rd}33`,color:C.rd,fontSize:13,display:"flex",alignItems:"center",gap:6,position:"sticky",top:0,zIndex:3}}>⚠ {error}<button onClick={()=>setError("")} style={{background:"none",border:"none",color:C.rd,cursor:"pointer",marginLeft:"auto"}}><I.X/></button></div>}
        {runNote&&<div style={{padding:"6px 12px",background:C.cy+"14",borderBottom:`1px solid ${C.cy}33`,color:C.cy,fontSize:12.5,display:"flex",alignItems:"center",gap:6}}>ℹ {runNote}<button onClick={()=>setRunNote("")} style={{background:"none",border:"none",color:C.cy,cursor:"pointer",marginLeft:"auto"}}><I.X/></button></div>}
        {!ent&&!bp.mobile?<div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:16,padding:"70px 20px",color:C.txd}}>
          <div style={{display:"flex",alignItems:"center"}}><I.Database/><span style={{marginLeft:8}}>Select an entity</span></div>
          <div style={{width:"100%",maxWidth:580}}>
            <div style={{fontSize:12.5,marginBottom:5}}>…or paste an OData query or a Web API URL — Colvio opens its table in OData mode:</div>
            <textarea value={pasteQ} onChange={e=>{setPasteQ(e.target.value);setPasteErr("");}} onKeyDown={e=>{if(e.key==="Enter"&&(e.ctrlKey||e.metaKey)){e.preventDefault();openPasted();}}}
              placeholder={"https://yourorg.crm.dynamics.com/api/data/v9.2/accounts?$select=name&$top=50"} style={inp({height:56,...mono,fontSize:12.5,resize:"vertical"})}/>
            <div style={{display:"flex",alignItems:"center",gap:10,marginTop:6,flexWrap:"wrap"}}>
              <button onClick={openPasted} disabled={!pasteQ.trim()} style={bt(C.vi,{fontSize:12,opacity:pasteQ.trim()?1:.5})}>Open in OData mode</button>
              {pasteErr&&<span style={{fontSize:12,color:C.rd}}>{pasteErr}</span>}
            </div>
          </div>
        </div>
        :ent?<>
          <div style={{borderBottom:`1px solid ${C.bd}`,padding:bp.mobile?10:12,background:C.sf}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8,flexWrap:"wrap",gap:6}}>
              <div style={{display:"flex",alignItems:"center",gap:6}}>
                {bp.mobile&&<button onClick={()=>{setEnt(null);setShowList(true);setRes(null);}} style={{background:"none",border:"none",color:C.txm,cursor:"pointer",padding:2}}><I.Back/></button>}
                <span style={{fontSize:15}}>{ent.i}</span><span style={{fontWeight:600,fontSize:14}}>{ent.d}</span>
                {!bp.mobile&&<span style={{fontSize:12,color:C.txd,background:C.bg,padding:"4px 10px",borderRadius:3,...mono}}>{ent.l}</span>}
                {loadingFields&&<Spin s={12}/>}
                {!loadingFields&&fields.length>0&&<span style={{fontSize:12,color:C.txd}}>{fields.length} columns</span>}
                {ent.c>0&&<span style={{fontSize:12,color:C.txd,background:C.bg,padding:"2px 6px",borderRadius:3}}>{ent.c.toLocaleString()} records</span>}
              </div>
              <div style={{display:"flex",gap:3,alignItems:"center"}}>{["builder","odata","fetchxml","sql"].map(m=><button key={m} onClick={()=>setQm(m)} style={{padding:"4px 10px",fontSize:12,border:`1px solid ${C.bd}`,borderRadius:4,cursor:"pointer",background:qm===m?C.vi:"transparent",color:qm===m?"white":C.txm}}>{m==="builder"?"Builder":m==="odata"?"OData":m==="fetchxml"?"FetchXML":"SQL"}</button>)}<Tooltip text={t("help.query_modes")}/></div>
            </div>
            {qm==="fetchxml"?<div>
              <textarea value={fxml} onChange={e=>setFxml(e.target.value)} placeholder={`<fetch top="50">\n  <entity name="${ent.l}">\n    <attribute name="name"/>\n    <link-entity name="opportunity" from="customerid" to="${ent.l}id" link-type="inner">\n      <attribute name="name" alias="opp_name"/>\n    </link-entity>\n  </entity>\n</fetch>`} style={inp({height:120,...mono,color:C.cy,resize:"vertical",fontSize:13,whiteSpace:"pre"})}/>
              <div style={{display:"flex",gap:4,marginTop:4}}>
                <button onClick={()=>setFxml(`<fetch top="50">\n  <entity name="${ent.l}">\n    <all-attributes/>\n    <filter>\n      <condition attribute="statecode" operator="eq" value="0"/>\n    </filter>\n  </entity>\n</fetch>`)} style={{padding:"4px 10px",fontSize:11,border:`1px dashed ${C.bd}`,borderRadius:3,color:C.txd,cursor:"pointer",background:"transparent"}}>📋 Simple template</button>
                <button onClick={()=>setFxml(`<fetch top="50">\n  <entity name="${ent.l}">\n    <attribute name="name"/>\n    <link-entity name="opportunity" from="customerid" to="${ent.l}id" link-type="inner">\n      <attribute name="name" alias="opp_name"/>\n      <attribute name="estimatedvalue" alias="opp_value"/>\n    </link-entity>\n  </entity>\n</fetch>`)} style={{padding:"4px 10px",fontSize:11,border:`1px dashed ${C.bd}`,borderRadius:3,color:C.txd,cursor:"pointer",background:"transparent"}}>🔗 Inner join template</button>
                <button onClick={()=>setFxml(`<fetch aggregate="true">\n  <entity name="${ent.l}">\n    <attribute name="statecode" groupby="true" alias="status"/>\n    <attribute name="${ent.l}id" aggregate="count" alias="total"/>\n  </entity>\n</fetch>`)} style={{padding:"4px 10px",fontSize:11,border:`1px dashed ${C.bd}`,borderRadius:3,color:C.txd,cursor:"pointer",background:"transparent"}}>📊 Aggregation template</button>
              </div>
            </div>
            :qm==="sql"?<div>
              <textarea value={sqlQ} onChange={e=>{setSqlQ(e.target.value);setShowSqlFx(false);setSqlFx("");}} placeholder={t("sql_placeholder")||`SELECT name, createdon FROM ${ent.l} WHERE statecode = 0 ORDER BY name TOP 100`} style={inp({height:120,...mono,color:C.cy,resize:"vertical",fontSize:13,whiteSpace:"pre"})}/>
              <div style={{display:"flex",gap:4,marginTop:4,flexWrap:"wrap",alignItems:"center"}}>
                <div style={{display:"flex",border:`1px solid ${C.bd}`,borderRadius:4,overflow:"hidden"}} title={nativeSqlDown?"Native ?sql= isn't available on this environment — queries run through the FetchXML transpiler.":"Engine — Native: Dataverse executes the SQL server-side (multi-table joins with aliases, DISTINCT, GROUP BY, DATEADD/GETUTCDATE; no HAVING/TOP/SELECT *). Transpiled: Colvio converts to FetchXML client-side (supports HAVING and TOP)."}>
                  {[["native",nativeSqlDown?"⚡ Native (n/a)":"⚡ Native"],["fetchxml","⇄ Transpiled"]].map(([k,lbl])=>(<button key={k} onClick={()=>setSqlEngine(k)} disabled={k==="native"&&nativeSqlDown} style={{padding:"3px 9px",fontSize:11,border:"none",cursor:k==="native"&&nativeSqlDown?"not-allowed":"pointer",background:sqlEngine===k?C.cy+"22":"transparent",color:k==="native"&&nativeSqlDown?C.txd:sqlEngine===k?C.cy:C.txd,fontWeight:sqlEngine===k?600:400,opacity:k==="native"&&nativeSqlDown?0.6:1}}>{lbl}</button>))}
                </div>
                <button onClick={()=>{setSqlQ(sqlEngine==="native"&&!nativeSqlDown?`SELECT name, createdon FROM ${ent.l} WHERE statecode = 0 ORDER BY name ASC`:`SELECT name, createdon FROM ${ent.l} WHERE statecode = 0 ORDER BY name ASC TOP 100`);setShowSqlFx(false);}} style={{padding:"4px 10px",fontSize:11,border:`1px dashed ${C.bd}`,borderRadius:3,color:C.txd,cursor:"pointer",background:"transparent"}}>📋 Simple</button>
                <button onClick={()=>{setSqlQ(`SELECT c.fullname, c.emailaddress1, a.name\nFROM contact AS c\nJOIN account AS a ON c.parentcustomerid = a.accountid\nWHERE c.statecode = 0`);setShowSqlFx(false);}} style={{padding:"4px 10px",fontSize:11,border:`1px dashed ${C.bd}`,borderRadius:3,color:C.txd,cursor:"pointer",background:"transparent"}}>🔗 Join</button>
                <button onClick={()=>{setSqlQ(`SELECT statecode, COUNT(*) FROM ${ent.l} GROUP BY statecode`);setShowSqlFx(false);}} style={{padding:"4px 10px",fontSize:11,border:`1px dashed ${C.bd}`,borderRadius:3,color:C.txd,cursor:"pointer",background:"transparent"}}>📊 Aggregate</button>
                <button onClick={()=>{if(!sqlQ.trim())return;const r=sqlToFetchXml(sqlQ);if(r.error){setError(r.error);setSqlFx("");}else{setSqlFx(r.fetchXml);setShowSqlFx(true);setError("");}}} style={{padding:"4px 10px",fontSize:11,border:`1px solid ${C.cy}66`,borderRadius:3,color:C.cy,cursor:"pointer",background:"transparent"}}>{showSqlFx?"Hide FetchXML":t("view_fetchxml")||"View FetchXML"}</button>
              </div>
              {showSqlFx&&sqlFx&&<pre style={{marginTop:6,padding:8,background:C.bg,border:`1px solid ${C.bd}`,borderRadius:6,fontSize:12,color:C.gn,overflow:"auto",maxHeight:160,...mono,whiteSpace:"pre-wrap"}}>{sqlFx}</pre>}
            </div>
            :qm==="odata"?<textarea value={rq} onChange={e=>setRq(e.target.value)}
              onPaste={e=>{const txt=e.clipboardData?.getData("text")||"";if(!looksLikeOData(txt))return;const n=normalizeODataInput(txt,orgInfo?.orgUrl);if(n.error)return;e.preventDefault();openODataPath(n);}}
              placeholder={`GET /api/data/v9.2/${ent.p}?$select=name&$top=50 — or paste a full Web API URL`} style={inp({height:50,...mono,color:C.cy,resize:"vertical",fontSize:13})}/>
            :<div style={{display:"flex",flexDirection:"column",gap:5}}>

              {/* ── SELECT — collapsible ── */}
              <div>
                <div style={{display:"flex",alignItems:"center",gap:5,cursor:"pointer"}} onClick={()=>{ if(sf.length>5) setQueryCollapsed(!queryCollapsed); }}>
                  <span style={{fontSize:12,color:C.vi,fontWeight:700,minWidth:44,...mono}}>SELECT</span>
                  {queryCollapsed ? (
                    <div style={{display:"flex",alignItems:"center",gap:6,flex:1,minWidth:0}}>
                      <span style={{fontSize:13,color:C.lv,fontWeight:500}}>{sf.length} columns</span>
                      <span style={{fontSize:11,color:C.txd,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",flex:1,...mono}}>{sf.slice(0,6).join(", ")}{sf.length>6?"…":""}</span>
                      <button onClick={(e)=>{e.stopPropagation();setQueryCollapsed(false);}} style={{padding:"3px 10px",background:C.vid,border:"none",borderRadius:3,color:C.lv,cursor:"pointer",fontSize:11,flexShrink:0}}>Expand ▼</button>
                      <button onClick={(e)=>{e.stopPropagation();setSf(fields.map(f=>f.l));}} style={{padding:"4px 10px",background:"transparent",border:"none",color:C.cy,cursor:"pointer",fontSize:11,textDecoration:"underline",flexShrink:0}}>All</button>
                      <button onClick={(e)=>{e.stopPropagation();setSf([]);}} style={{padding:"4px 10px",background:"transparent",border:"none",color:C.txd,cursor:"pointer",fontSize:11,textDecoration:"underline",flexShrink:0}}>Clear</button>
                      <button onClick={(e)=>{e.stopPropagation();setPicker(!picker);}} disabled={loadingFields} style={{padding:"3px 10px",background:picker?C.vi:"transparent",border:`1px ${picker?"solid":"dashed"} ${picker?C.vi:C.bd}`,borderRadius:3,color:picker?"white":C.txd,cursor:"pointer",fontSize:12,display:"flex",alignItems:"center",gap:3,flexShrink:0}}>
                        {picker?<I.X/>:<I.Plus/>}{picker?"Close":"Columns"}
                      </button>
                    </div>
                  ) : (
                    <div style={{display:"flex",flexWrap:"wrap",gap:3,flex:1,alignItems:"center"}}>
                      {sf.map(f=><span key={f} style={{display:"inline-flex",alignItems:"center",gap:2,padding:"4px 10px",background:C.vid,borderRadius:3,fontSize:12,color:C.lv}}>{f}<button onClick={(e)=>{e.stopPropagation();setSf(sf.filter(x=>x!==f));}} style={{background:"none",border:"none",color:C.txd,cursor:"pointer",padding:0,lineHeight:1}}><I.X/></button></span>)}
                      <button onClick={(e)=>{e.stopPropagation();setPicker(!picker);}} disabled={loadingFields} style={{padding:"3px 10px",background:picker?C.vi:"transparent",border:`1px ${picker?"solid":"dashed"} ${picker?C.vi:C.bd}`,borderRadius:3,color:picker?"white":C.txd,cursor:"pointer",fontSize:12,display:"flex",alignItems:"center",gap:3}}>
                        {loadingFields?<Spin s={10}/>:picker?<I.X/>:<I.Plus/>}{picker?"Close":`Columns (${sf.length}/${fields.length})`}
                      </button>
                      {sf.length>0&&<button onClick={(e)=>{e.stopPropagation();setSf([]);}} style={{padding:"4px 10px",background:"transparent",border:"none",color:C.txd,cursor:"pointer",fontSize:11,textDecoration:"underline"}}>{t("explorer.deselect_all")}</button>}
                      {sf.length<fields.length&&<button onClick={(e)=>{e.stopPropagation();setSf(fields.map(f=>f.l));}} style={{padding:"4px 10px",background:"transparent",border:"none",color:C.cy,cursor:"pointer",fontSize:11,textDecoration:"underline"}}>{t("explorer.select_all")} ({fields.length})</button>}
                      {sf.length>5&&<button onClick={(e)=>{e.stopPropagation();setQueryCollapsed(true);}} style={{padding:"4px 10px",background:"transparent",border:`1px solid ${C.bd}`,borderRadius:3,color:C.txd,cursor:"pointer",fontSize:11,flexShrink:0}}>Collapse ▲</button>}
                    </div>
                  )}
                </div>
              </div>

              {picker&&<FieldPicker key={ent?.l||"none"} fields={fields} selected={sf} onToggle={(f)=>sf.includes(f)?setSf(sf.filter(x=>x!==f)):setSf([...sf,f])} onBulkAdd={(arr)=>setSf(prev=>[...prev,...arr])} onBulkRemove={(arr)=>{const s=new Set(arr);setSf(prev=>prev.filter(f=>!s.has(f)));}} onSelectAll={()=>setSf(fields.map(f=>f.l))} onSelectNone={()=>setSf([])} bp={bp} onClose={()=>setPicker(false)} />}
              <div style={{display:"flex",flexDirection:"column",gap:4}}>
                <div style={{display:"flex",alignItems:"center",gap:5}}>
                  <span style={{fontSize:12,color:C.vi,fontWeight:700,minWidth:44,...mono}}>WHERE</span>
                  {filterGroups.length>1&&<select value={groupLogic} onChange={e=>setGroupLogic(e.target.value)} style={inp({width:"auto",fontSize:11,padding:"2px 5px",color:C.yw})}><option value="and">AND</option><option value="or">OR</option></select>}
                  <button onClick={()=>setFilterGroups([...filterGroups,{logic:"and",conditions:[{field:"",op:"eq",value:""}]}])} style={{padding:"2px 8px",background:"transparent",border:`1px dashed ${C.bd}`,borderRadius:3,color:C.txd,cursor:"pointer",fontSize:11}}>{t("explorer.add_group")}</button>
                </div>
                {filterGroups.map((grp,gi)=>{
                  const updateGrp=(newGrp)=>{const u=[...filterGroups];u[gi]=newGrp;setFilterGroups(u);};
                  const addCond=()=>updateGrp({...grp,conditions:[...grp.conditions,{field:"",op:"eq",value:""}]});
                  const rmCond=(ci)=>updateGrp({...grp,conditions:grp.conditions.filter((_,j)=>j!==ci)});
                  const updateCond=(ci,k,v)=>{const cs=[...grp.conditions];cs[ci]={...cs[ci],[k]:v};if(k==="field"){cs[ci].op="eq";cs[ci].value="";}updateGrp({...grp,conditions:cs});};
                  const hasMultiple=grp.conditions.length>1;
                  return (<div key={gi} style={{marginLeft:50,padding:filterGroups.length>1?"6px 8px":"0",background:filterGroups.length>1?C.bg+"88":"transparent",border:filterGroups.length>1?`1px solid ${C.bd}`:"none",borderRadius:5,marginBottom:2}}>
                    {filterGroups.length>1&&<div style={{display:"flex",alignItems:"center",gap:4,marginBottom:4}}>
                      <span style={{fontSize:10,color:C.lv,fontWeight:600}}>Group {gi+1}</span>
                      {hasMultiple&&<select value={grp.logic} onChange={e=>updateGrp({...grp,logic:e.target.value})} style={inp({width:"auto",fontSize:10,padding:"2px 6px",color:C.yw})}><option value="and">AND</option><option value="or">OR</option></select>}
                      <button onClick={addCond} style={{padding:"0px 4px",background:"transparent",border:`1px dashed ${C.bd}`,borderRadius:2,color:C.txd,cursor:"pointer",fontSize:10}}>+</button>
                      {filterGroups.length>1&&<button onClick={()=>setFilterGroups(filterGroups.filter((_,j)=>j!==gi))} style={{background:"none",border:"none",color:C.txd,cursor:"pointer",padding:0,fontSize:11,marginLeft:"auto"}}>✕</button>}
                    </div>}
                    {grp.conditions.map((fil,ci)=>{
                      const fType=fil.field?getFieldType(fil.field):"";
                      const sT=new Set(["String","Memo"]);const nT=new Set(["Integer","Money","Decimal","Double","BigInt"]);
                      const dT=new Set(["DateTime"]);const pT=new Set(["Picklist","State","Status"]);
                      let ops=["eq","ne","is_null","is_not_null"];
                      if(sT.has(fType)) ops=["eq","ne","contains","not_contains","startswith","not_startswith","endswith","not_endswith","is_null","is_not_null"];
                      else if(nT.has(fType)||dT.has(fType)) ops=["eq","ne","gt","lt","ge","le","is_null","is_not_null"];
                      const needsValue=fil.op!=="is_null"&&fil.op!=="is_not_null";
                      const opLabels={"eq":"=","ne":"≠","gt":">","lt":"<","ge":"≥","le":"≤","contains":"contains","not_contains":"not contains","startswith":"starts with","not_startswith":"not starts with","endswith":"ends with","not_endswith":"not ends with","is_null":"is null","is_not_null":"is not null"};
                      const placeholder=sT.has(fType)?"text":nT.has(fType)?"number":dT.has(fType)?"2025-01-15":fType==="Boolean"?"true / false":pT.has(fType)?"int":"value";
                      return (<div key={ci} style={{display:"flex",alignItems:"center",gap:3,marginBottom:2}}>
                        {hasMultiple&&ci>0&&filterGroups.length===1&&<span style={{fontSize:10,color:C.yw,minWidth:24,textAlign:"center"}}>{grp.logic.toUpperCase()}</span>}
                        <select value={fil.field} onChange={e=>updateCond(ci,"field",e.target.value)} style={inp({width:"auto",fontSize:12,padding:"3px 6px"})}><option value="">(none)</option>{fields.map(f=><option key={f.l} value={f.l}>{f.l}</option>)}</select>
                        {fil.field&&<select value={ops.includes(fil.op)?fil.op:"eq"} onChange={e=>updateCond(ci,"op",e.target.value)} style={inp({width:"auto",fontSize:11,padding:"3px 5px",color:C.cy})}>{ops.map(o=><option key={o} value={o}>{opLabels[o]||o}</option>)}</select>}
                        {fil.field&&needsValue&&<input value={fil.value} onChange={e=>updateCond(ci,"value",e.target.value)} placeholder={placeholder} style={inp({width:bp.mobile?"100%":120,fontSize:12,padding:"3px 6px"})}/>}
                        {(grp.conditions.length>1||filterGroups.length>1)&&<button onClick={()=>rmCond(ci)} style={{background:"none",border:"none",color:C.txd,cursor:"pointer",padding:1,fontSize:11}}>✕</button>}
                      </div>);
                    })}
                    {filterGroups.length===1&&<button onClick={addCond} style={{padding:"2px 8px",background:"transparent",border:`1px dashed ${C.bd}`,borderRadius:3,color:C.txd,cursor:"pointer",fontSize:11,marginTop:2}}>{t("explorer.add_condition")}</button>}
                    {filterGroups.length===1&&grp.conditions.length>1&&<select value={grp.logic} onChange={e=>updateGrp({...grp,logic:e.target.value})} style={inp({width:"auto",fontSize:10,padding:"2px 6px",color:C.yw,marginTop:2,marginLeft:4})}><option value="and">AND</option><option value="or">OR</option></select>}
                  </div>);
                })}
              </div>

              {/* ── REL — filter root rows by RELATED records (Advanced-Find-style) ── */}
              <div style={{display:"flex",alignItems:"flex-start",gap:5,flexDirection:"column"}}>
                <div style={{display:"flex",alignItems:"center",gap:5}}>
                  <span style={{fontSize:12,color:C.gn,fontWeight:700,minWidth:44,...mono}}>REL</span>
                  {relFilters.length>0&&!showRelPicker&&(
                    <div style={{display:"flex",gap:3,flexWrap:"wrap",alignItems:"center"}}>
                      {relFilters.map(rf=>(
                        <span key={rf.navProperty} style={{display:"inline-flex",alignItems:"center",gap:3,padding:"2px 7px",background:C.gn+"22",border:`1px solid ${C.gn}44`,borderRadius:3,fontSize:12,color:C.gn}}>
                          {rf.type==="collection"?`${rf.mode==="none"?"∄":"∃"} ${rf.targetEntity}`:`${rf.lookupField}→${rf.targetEntity}`}
                          <button onClick={()=>removeRelFilter(rf.navProperty)} style={{background:"none",border:"none",color:C.gn,cursor:"pointer",padding:0,lineHeight:1,fontSize:12}}>✕</button>
                        </span>
                      ))}
                    </div>
                  )}
                  <button onClick={()=>{const opening=!showRelPicker;setShowRelPicker(opening);setRelSearch("");if(opening)ensureChildRels();}} disabled={lookups.length===0&&!showRelPicker} style={{padding:"3px 10px",background:showRelPicker?C.gn+"33":"transparent",border:`1px ${showRelPicker?"solid":"dashed"} ${showRelPicker?C.gn:C.bd}`,borderRadius:3,color:showRelPicker?C.gn:C.txd,cursor:lookups.length||showRelPicker?"pointer":"default",fontSize:12,display:"flex",alignItems:"center",gap:3,flexShrink:0}}>
                    {showRelPicker?<I.X/>:<I.Link/>} {showRelPicker?"Close":"+ Relation filter"}
                  </button>
                  {relFilters.length===0&&!showRelPicker&&<span style={{fontSize:11,color:C.txd}}>filter rows by parent / child records — "accounts with no open opportunity"</span>}
                </div>

                {showRelPicker&&(
                  <div style={{marginLeft:bp.mobile?0:50,width:bp.mobile?"100%":"calc(100% - 50px)"}}>
                    <div style={{display:"flex",flexDirection:"column",gap:6,marginBottom:relFilters.length?8:0}}>
                      <input value={relSearch} onChange={e=>setRelSearch(e.target.value)} placeholder="🔍 Search relations (entity, field)..." style={inp({fontSize:12,padding:"5px 10px"})}/>
                      {(()=>{
                        const rs=debouncedRelSearch.toLowerCase();
                        const matchRel=l=>!rs||l.lookupField?.toLowerCase().includes(rs)||l.targetEntity?.toLowerCase().includes(rs)||l.navProperty?.toLowerCase().includes(rs);
                        const parentRels=lookups.filter(l=>l.type!=="collection"&&!relFilters.find(r2=>r2.navProperty===l.navProperty)&&matchRel(l));
                        const childRels=lookups.filter(l=>l.type==="collection"&&!relFilters.find(r2=>r2.navProperty===l.navProperty)&&matchRel(l));
                        return <>
                          {parentRels.length>0&&(
                            <div>
                              <div style={{fontSize:10,color:C.txd,fontWeight:600,marginBottom:3,textTransform:"uppercase",letterSpacing:".5px"}}>↑ Condition on the parent (N→1) — {parentRels.length}</div>
                              <div style={{display:"flex",flexWrap:"wrap",gap:3,padding:8,background:C.bg,borderRadius:6,border:`1px solid ${C.bd}`,maxHeight:100,overflow:"auto"}}>
                                {parentRels.map(l=>(
                                  <button key={l.navProperty} onClick={()=>addRelFilter(l)} disabled={loadingRel===l.navProperty} style={{padding:"4px 10px",background:C.sfh,border:`1px solid ${C.bd}`,borderRadius:4,color:C.txm,cursor:"pointer",fontSize:12,display:"flex",alignItems:"center",gap:4}}>
                                    {loadingRel===l.navProperty?<Spin s={10}/>:<I.Link/>}
                                    <span style={{color:C.or,...mono,fontSize:11}}>{l.lookupField}</span>
                                    <span style={{color:C.txd}}>→</span>
                                    <span style={{color:C.cy,fontSize:11}}>{l.targetEntity}</span>
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                          {childRels.length>0&&(
                            <div>
                              <div style={{fontSize:10,color:C.txd,fontWeight:600,marginBottom:3,textTransform:"uppercase",letterSpacing:".5px"}}>↓ Has / has no children (1→N) — {childRels.length}</div>
                              <div style={{display:"flex",flexWrap:"wrap",gap:3,padding:8,background:C.bg,borderRadius:6,border:`1px solid ${C.gn}33`,maxHeight:100,overflow:"auto"}}>
                                {childRels.map(l=>(
                                  <button key={l.navProperty} onClick={()=>addRelFilter(l)} disabled={loadingRel===l.navProperty} style={{padding:"4px 10px",background:C.sfh,border:`1px solid ${C.gn}44`,borderRadius:4,color:C.txm,cursor:"pointer",fontSize:12,display:"flex",alignItems:"center",gap:4}}>
                                    {loadingRel===l.navProperty?<Spin s={10}/>:<I.Link/>}
                                    <span style={{color:C.cy,...mono,fontSize:11}}>{l.targetEntity}</span>
                                    <span style={{color:C.txd}}>←</span>
                                    <span style={{color:C.or,fontSize:11}}>{l.lookupField}</span>
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                          {parentRels.length===0&&childRels.length===0&&(
                            <span style={{color:C.txd,fontSize:12,padding:4}}>{relSearch?"No relations found":"All relations added"}</span>
                          )}
                        </>;
                      })()}
                    </div>
                  </div>
                )}

                {relFilters.length>0&&(
                  <div style={{marginLeft:bp.mobile?0:50,width:bp.mobile?"100%":"calc(100% - 50px)"}}>
                    {relFilters.map(rf=>(<RelFilterCard key={rf.navProperty} rf={rf} onUpdate={updateRelFilter} onRemove={removeRelFilter} bp={bp}/>))}
                  </div>
                )}
              </div>

              {/* ── EXPAND — join parent entities ── */}
              <div style={{display:"flex",alignItems:"flex-start",gap:5,flexDirection:"column"}}>
                <div style={{display:"flex",alignItems:"center",gap:5}}>
                  <span style={{fontSize:12,color:C.or,fontWeight:700,minWidth:44,...mono}}>EXPAND</span>
                  {expands.length>0&&!showExpandPicker&&(
                    <div style={{display:"flex",gap:3,flexWrap:"wrap",alignItems:"center"}}>
                      {expands.map(ex=>(
                        <span key={ex.navProperty} style={{display:"inline-flex",alignItems:"center",gap:3,padding:"2px 7px",background:ex.type==="collection"?C.cy+"22":C.or+"22",border:`1px solid ${ex.type==="collection"?C.cy:C.or}44`,borderRadius:3,fontSize:12,color:ex.type==="collection"?C.cy:C.or}}>
                          {ex.type==="collection"?`←${ex.targetEntity}`:`${ex.lookupField}→${ex.targetEntity}`} ({ex.fields.length})
                          <button onClick={()=>removeExpand(ex.navProperty)} style={{background:"none",border:"none",color:C.or,cursor:"pointer",padding:0,lineHeight:1,fontSize:12}}>✕</button>
                        </span>
                      ))}
                    </div>
                  )}
                  <button onClick={()=>{
                    const opening = !showExpandPicker;
                    setShowExpandPicker(opening);
                    setExpandSearch("");
                    if(opening) ensureChildRels();
                  }} disabled={lookups.length===0} style={{padding:"3px 10px",background:showExpandPicker?C.or+"33":"transparent",border:`1px ${showExpandPicker?"solid":"dashed"} ${showExpandPicker?C.or:C.bd}`,borderRadius:3,color:showExpandPicker?C.or:C.txd,cursor:lookups.length?"pointer":"default",fontSize:12,display:"flex",alignItems:"center",gap:3,flexShrink:0}}>
                    {showExpandPicker?<I.X/>:<I.Link/>} {showExpandPicker?"Close":"Relations"}
                  </button>
                </div>

                {showExpandPicker&&(
                  <div style={{marginLeft:bp.mobile?0:50,width:bp.mobile?"100%":"calc(100% - 50px)"}}>
                    {lookups.length>0&&(
                      <div style={{display:"flex",flexDirection:"column",gap:6,marginBottom:expands.length?8:0}}>
                        <input value={expandSearch} onChange={e=>setExpandSearch(e.target.value)} placeholder="🔍 Search relations (entity, field)..." style={inp({fontSize:12,padding:"5px 10px"})}/>
                        {(()=>{
                          const es2=debouncedExpandSearch.toLowerCase();
                          const matchRel=l=>!es2||l.lookupField?.toLowerCase().includes(es2)||l.targetEntity?.toLowerCase().includes(es2)||l.navProperty?.toLowerCase().includes(es2);
                          const parentRels=lookups.filter(l=>l.type!=="collection"&&!expands.find(e2=>e2.navProperty===l.navProperty)&&matchRel(l));
                          const childRels=lookups.filter(l=>l.type==="collection"&&!expands.find(e2=>e2.navProperty===l.navProperty)&&matchRel(l));
                          return <>
                        {parentRels.length>0&&(
                          <div>
                            <div style={{fontSize:10,color:C.txd,fontWeight:600,marginBottom:3,textTransform:"uppercase",letterSpacing:".5px"}}>↑ Parent (N→1) — {parentRels.length}</div>
                            <div style={{display:"flex",flexWrap:"wrap",gap:3,padding:8,background:C.bg,borderRadius:6,border:`1px solid ${C.bd}`,maxHeight:100,overflow:"auto"}}>
                              {parentRels.map(l=>(
                                <button key={l.navProperty} onClick={()=>addExpand(l)} disabled={loadingExpand===l.navProperty} style={{padding:"4px 10px",background:C.sfh,border:`1px solid ${C.bd}`,borderRadius:4,color:C.txm,cursor:"pointer",fontSize:12,display:"flex",alignItems:"center",gap:4}}>
                                  {loadingExpand===l.navProperty?<Spin s={10}/>:<I.Link/>}
                                  <span style={{color:C.or,...mono,fontSize:11}}>{l.lookupField}</span>
                                  <span style={{color:C.txd}}>→</span>
                                  <span style={{color:C.cy,fontSize:11}}>{l.targetEntity}</span>
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                        {childRels.length>0&&(
                          <div>
                            <div style={{fontSize:10,color:C.txd,fontWeight:600,marginBottom:3,textTransform:"uppercase",letterSpacing:".5px"}}>↓ Children (1→N) — {childRels.length}</div>
                            <div style={{display:"flex",flexWrap:"wrap",gap:3,padding:8,background:C.bg,borderRadius:6,border:`1px solid ${C.cy}33`,maxHeight:100,overflow:"auto"}}>
                              {childRels.map(l=>(
                                <button key={l.navProperty} onClick={()=>addExpand(l)} disabled={loadingExpand===l.navProperty} style={{padding:"4px 10px",background:C.sfh,border:`1px solid ${C.cy}44`,borderRadius:4,color:C.txm,cursor:"pointer",fontSize:12,display:"flex",alignItems:"center",gap:4}}>
                                  {loadingExpand===l.navProperty?<Spin s={10}/>:<I.Link/>}
                                  <span style={{color:C.cy,...mono,fontSize:11}}>{l.targetEntity}</span>
                                  <span style={{color:C.txd}}>←</span>
                                  <span style={{color:C.or,fontSize:11}}>{l.lookupField}</span>
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                        {parentRels.length===0&&childRels.length===0&&(
                          <span style={{color:C.txd,fontSize:12,padding:4}}>{expandSearch?"No relations found":"All relations added"}</span>
                        )}
                          </>;
                        })()}
                      </div>
                    )}

                    {expands.map(ex=>(<ExpandCard key={ex.navProperty} ex={ex} onToggle={toggleExpandField} onRemove={removeExpand} onSetConditions={setExpandConditions} onSetLogic={setExpandLogic} bp={bp}/>))}
                  </div>
                )}
              </div>

              <div style={{display:"flex",alignItems:"center",gap:5}}>
                <span style={{fontSize:12,color:C.vi,fontWeight:700,minWidth:44,...mono}}>LIMIT</span>
                <select value={lim} onChange={e=>setLim(+e.target.value)} style={inp({width:"auto",fontSize:12,padding:"3px 6px"})}>{[10,25,50,100,200,500,1000,5000].map(n=><option key={n} value={n}>{n}</option>)}<option value={0}>All</option></select>
                {lim===0&&<span style={{fontSize:11,color:C.yw}}>⚠ may be slow</span>}
                {lim===0&&expands.length>0&&<span style={{fontSize:11,color:C.or}}>⚠ D365 limits results with $expand</span>}
              </div>

              {/* Server-side ORDER BY ($orderby) — sorts the whole result/export, not just the loaded page. */}
              <div style={{display:"flex",alignItems:"center",gap:5,flexWrap:"wrap"}}>
                <span style={{fontSize:12,color:C.vi,fontWeight:700,minWidth:44,...mono}}>ORDER</span>
                <select value={orderBy.f} onChange={e=>setOrderBy({...orderBy,f:e.target.value})} style={inp({width:"auto",fontSize:12,padding:"3px 6px"})}>
                  <option value="">(none)</option>
                  {fields.map(f=><option key={f.l} value={f.l}>{f.l}</option>)}
                </select>
                {orderBy.f&&<select value={orderBy.dir} onChange={e=>setOrderBy({...orderBy,dir:e.target.value})} style={inp({width:"auto",fontSize:12,padding:"3px 6px",color:C.cy})}>
                  <option value="asc">ASC ↑</option><option value="desc">DESC ↓</option>
                </select>}
              </div>
            </div>}
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginTop:8,gap:6,flexWrap:"wrap"}}>
              {qm==="builder"&&!bp.mobile&&<><code style={{fontSize:11,color:C.txd,...mono,flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{oq()}</code><button onClick={()=>{copyText(oq());}} style={{padding:"2px 6px",background:"transparent",border:`1px solid ${C.bd}`,borderRadius:3,color:C.txd,cursor:"pointer",fontSize:11,flexShrink:0}} title="Copy OData URL"><I.Copy/></button></>}
              {qm==="fetchxml"&&!bp.mobile&&<code style={{fontSize:11,color:C.cy,...mono,flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{fxml.replace(/\n/g," ").substring(0,100)}{fxml.length>100?"…":""}</code>}
              {qm==="sql"&&!bp.mobile&&<code style={{fontSize:11,color:C.cy,...mono,flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{sqlQ.replace(/\n/g," ").substring(0,100)}{sqlQ.length>100?"…":""}</code>}
              <div style={{display:"flex",gap:4,alignItems:"center",flexShrink:0}}>
                <button onClick={run} disabled={loading||loadingFields||streamState?.phase==="running"} style={bt(`linear-gradient(135deg,${C.vi},${C.vil})`)}>{loading?<><Spin s={12}/> Querying...</>:loadingFields?<><Spin s={12}/> Fields...</>:<><I.Play/> {sqlWritePeek&&!sqlWritePeek.error?`Preview ${sqlWritePeek.kind.toUpperCase()}`:"Execute"} <span style={{fontSize:11,opacity:.7}}>Ctrl+⏎</span></>}</button>
                <div style={{position:"relative"}}>
                  <button onClick={()=>setShowStreamMenu(v=>!v)} disabled={loading||loadingFields||streamState?.phase==="running"} title="Run this query and write EVERY row straight to a file — nothing kept in the browser, any size" style={{padding:"4px 8px",background:showStreamMenu?C.cy+"22":"transparent",border:`1px solid ${C.cy}55`,borderRadius:4,color:C.cy,cursor:"pointer",fontSize:12,whiteSpace:"nowrap"}}>⬇ To file</button>
                  {showStreamMenu&&<div style={{position:"absolute",top:"100%",left:0,zIndex:30,marginTop:4,background:C.sf,border:`1px solid ${C.bd}`,borderRadius:6,minWidth:250,boxShadow:"0 8px 24px rgba(0,0,0,.4)"}}>
                    <div style={{padding:"7px 10px",fontSize:11,color:C.txd,borderBottom:`1px solid ${C.bd}`,lineHeight:1.5}}>Runs the query and streams every row to the file you pick — page after page, nothing kept in the browser.</div>
                    <button onClick={()=>startStream("csv")} style={{display:"block",width:"100%",textAlign:"left",padding:"7px 10px",border:"none",background:"transparent",color:C.tx,cursor:"pointer",fontSize:12.5}}>CSV <span style={{color:C.txd,fontSize:11}}>— any number of rows</span></button>
                    <button onClick={()=>startStream("xlsx")} style={{display:"block",width:"100%",textAlign:"left",padding:"7px 10px",border:"none",borderTop:`1px solid ${C.bd}`,background:"transparent",color:C.tx,cursor:"pointer",fontSize:12.5}}>Excel <span style={{color:C.txd,fontSize:11}}>— a new sheet every 1,048,576 rows</span></button>
                  </div>}
                </div>
                <button onClick={openSaveView} disabled={!ent} title="Save as a personal view of this table — it appears in the app's view selector (Builder, FetchXML or SQL)" style={{padding:"4px 8px",background:"transparent",border:`1px solid ${C.vi}55`,borderRadius:4,color:C.vi,cursor:ent?"pointer":"default",fontSize:12,whiteSpace:"nowrap"}}>👁 Save as view</button>
                <button onClick={saveCurrentQuery} disabled={!ent} title={activeSaved?"Save as… (a new name, or overwrite one)":"Save this query"} style={{padding:"4px 8px",background:"transparent",border:`1px solid ${C.yw}44`,borderRadius:4,color:C.yw,cursor:ent?"pointer":"default",fontSize:12}}>⭐</button>
                {activeSaved&&<span title={`Loaded from the saved query “${activeSaved}”`} style={{display:"flex",alignItems:"center",gap:4,fontSize:11.5,color:C.txm,border:`1px solid ${C.yw}44`,borderRadius:4,padding:"1px 2px 1px 8px",maxWidth:260}}>
                  <span style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>📂 {activeSaved}</span>
                  <button onClick={()=>doSaveQuery(activeSaved)} title={`Overwrite “${activeSaved}” with the current query`} style={{padding:"2px 7px",background:savedFlash===activeSaved?C.gn+"22":"transparent",border:`1px solid ${savedFlash===activeSaved?C.gn+"66":C.yw+"66"}`,borderRadius:3,color:savedFlash===activeSaved?C.gn:C.yw,cursor:"pointer",fontSize:11,whiteSpace:"nowrap"}}>{savedFlash===activeSaved?"✓ Saved":"💾 Update"}</button>
                </span>}
                <div style={{position:"relative"}}>
                  <button onClick={()=>{setShowTemplates(!showTemplates);setShowHistory(false);setShowSaved(false);}} style={{padding:"4px 8px",background:showTemplates?C.gn+"33":"transparent",border:`1px solid ${showTemplates?C.gn+"44":C.bd}`,borderRadius:4,color:showTemplates?C.gn:C.txm,cursor:"pointer",fontSize:12}} title="Query templates">📝 Templates</button>
                  {showTemplates&&<QueryTemplates entities={entities} onSelect={(ent,fields,filters)=>{selEnt(ent);afterFields(()=>{setSf(fields);setFilterGroups(filters);});}} onClose={()=>setShowTemplates(false)}/>}
                </div>
                <div style={{position:"relative"}}>
                  <button onClick={()=>{setShowHistory(!showHistory);setShowSaved(false);}} style={{padding:"4px 8px",background:showHistory?C.vi+"33":"transparent",border:`1px solid ${C.bd}`,borderRadius:4,color:C.txm,cursor:"pointer",fontSize:12}} title="Query history">🕐{queryHistory.length>0?` ${queryHistory.length}`:""}</button>
                  {showHistory&&queryHistory.length>0&&(
                    <div style={{position:"absolute",top:"100%",right:0,zIndex:20,background:C.sf,border:`1px solid ${C.bd}`,borderRadius:6,marginTop:4,minWidth:260,maxHeight:250,overflow:"auto",boxShadow:"0 8px 24px rgba(0,0,0,.4)"}}>
                      <div style={{padding:"6px 10px",borderBottom:`1px solid ${C.bd}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}><span style={{fontSize:11,fontWeight:600,color:C.txm}}>Recent queries</span><button onClick={()=>{setQueryHistory([]);if(typeof chrome!=="undefined"&&chrome.storage?.local)chrome.storage.local.remove("d365_query_history",()=>{void chrome.runtime.lastError;});}} style={{fontSize:10,color:C.txd,background:"none",border:"none",cursor:"pointer"}}>Clear</button></div>
                      {queryHistory.map((h,i)=>(
                        <div key={i} style={{padding:"6px 10px",borderBottom:`1px solid ${C.bd}`,cursor:"pointer",fontSize:12}} onClick={()=>{
                          // Restore = select the entry's entity, then reopen the recorded query in the
                          // right editor. Builder entries carry a structure snapshot (values blanked —
                          // PII) and reopen in the BUILDER; pre-snapshot entries and raw modes reopen
                          // as the recorded string, with $filter VALUES redacted to "$filter=...".
                          setShowHistory(false);
                          const restore=()=>{
                            if(h.mode==="builder"&&h.builder){
                              // Entries recorded since the structure snapshot exists reopen in the
                              // BUILDER (user request: a builder query restored as raw OData read as
                              // "incomplete"). Values stay blank — privacy — the message says so.
                              const b=h.builder;
                              setQm("builder");
                              setSf(b.fields||[]);
                              setFilterGroups(b.filterGroups?.length?b.filterGroups:[{logic:"and",conditions:[{field:"",op:"eq",value:""}]}]);
                              setGroupLogic(b.groupLogic||"and");
                              setLim(b.limit??0);
                              setOrderBy(b.orderBy&&b.orderBy.f?{f:b.orderBy.f,dir:b.orderBy.dir==="desc"?"desc":"asc"}:{f:"",dir:"asc"});
                              // REL / EXPAND come back too (structure; their condition values are
                              // among the blanked ones). Entries older than that snapshot only know
                              // the clauses existed: say so.
                              setExpands([]);setRelFilters([]); // same table, no entity switch: the entry's clauses replace the current ones
                              restoreRelated(b);
                              const lostRel=b.hadRel&&!b.relFilters?.length, lostExpand=b.hadExpand&&!b.expands?.length;
                              const notes=[];
                              if(b.redacted) notes.push(`refill the ${b.redacted} condition value${b.redacted>1?"s":""} — values are never stored in the history (privacy)`);
                              if(lostRel||lostExpand) notes.push(`the query's ${[lostRel?"REL":null,lostExpand?"EXPAND":null].filter(Boolean).join(" and ")} clause${lostRel&&lostExpand?"s were":" was"} recorded before the history kept them`);
                              if(notes.length) setError(`ℹ Restored into the Builder: ${notes.join("; ")}. Use Saved Queries (💾) to keep everything.`);
                              return;
                            }
                            if(h.mode==="fetchxml"){setQm("fetchxml");setFxml(h.query||"");}
                            else if(h.mode==="sql"){setQm("sql");setSqlQ(h.query||"");}
                            else {setQm("odata");setRq(h.query||"");}
                            // Say it up front, not via a cryptic 400 later: the "..." isn't
                            // truncation, it's the privacy redaction of filter values.
                            if(/\$filter=\.\.\./.test(h.query||"")) setError('ℹ Restored from history: filter VALUES are never stored there (privacy) — "$filter=..." is a placeholder, not truncation. Replace "..." with your condition, or delete the clause to run unfiltered. Use Saved Queries (⭐) to keep complete filters.');
                          };
                          const match=h.entity&&h.entity!=="?"?entities.find(e2=>e2.l===h.entity):null;
                          if(match&&ent?.l!==match.l){
                            selEnt(match);
                            if(isLive) onFieldsReady.current=restore; // after the entity's fields load (selEnt cleared rq/fxml/sqlQ)
                            else restore();                            // demo: selEnt is synchronous, no fields callback fires
                          }
                          else if(match||ent) restore();
                          else setError(`The history entry's table "${h.entity}" no longer exists on this org.`);
                        }}
                          onMouseEnter={e=>e.currentTarget.style.background=C.sfh} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                          <div style={{fontWeight:500,color:C.tx}}>{h.entity}</div>
                          <div style={{fontSize:11,color:C.txd,...mono,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{h.query?.substring(0,80)}</div>
                          <div style={{fontSize:10,color:C.txd,marginTop:2}}>{h.fields} cols • {h.mode} • {new Date(h.ts).toLocaleString("en-US",{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"})}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div style={{position:"relative"}}>
                  <button onClick={()=>{setShowSaved(!showSaved);setShowHistory(false);}} style={{padding:"4px 8px",background:showSaved?C.vi+"33":"transparent",border:`1px solid ${C.bd}`,borderRadius:4,color:C.txm,cursor:"pointer",fontSize:12}}>{savedQueries.length>0?`📂 ${savedQueries.length}`:"📂"}</button>
                  {showSaved&&(
                    <div style={{position:"absolute",top:"100%",right:0,zIndex:20,background:C.sf,border:`1px solid ${C.bd}`,borderRadius:6,marginTop:4,minWidth:240,maxHeight:240,overflow:"auto",boxShadow:"0 8px 24px rgba(0,0,0,.4)"}}>
                      {/* Share saved queries between colleagues: plain JSON export/import (merge by name). */}
                      <div style={{display:"flex",gap:6,padding:"6px 10px",borderBottom:`1px solid ${C.bd}`}}>
                        <button onClick={()=>{dl(JSON.stringify({colvioQueries:1,queries:savedQueries},null,1),"application/json",expName("colvio_queries","json"));}} style={{flex:1,padding:"3px 8px",fontSize:11,background:"transparent",border:`1px solid ${C.cy}55`,borderRadius:3,color:C.cy,cursor:"pointer",fontWeight:600}}>⬇ {t("explorer.export_queries")}</button>
                        <button onClick={()=>qImportRef.current?.click()} style={{flex:1,padding:"3px 8px",fontSize:11,background:"transparent",border:`1px solid ${C.cy}55`,borderRadius:3,color:C.cy,cursor:"pointer",fontWeight:600}}>⬆ {t("explorer.import_queries")}</button>
                        <input ref={qImportRef} type="file" accept=".json" style={{display:"none"}} onChange={e=>{const f=e.target.files?.[0];if(!f)return;const r=new FileReader();r.onload=ev=>{try{const d=JSON.parse(ev.target.result);const qs=d.colvioQueries===1?d.queries:null;if(!Array.isArray(qs))throw 0;const mergeIn=(list)=>[...qs.filter(q=>q&&q.name),...list.filter(s2=>!qs.some(q=>q.name===s2.name))].slice(0,20);setSavedQueries(mergeIn(savedQueries));setImportErr("");persistList("d365_saved_queries",mergeIn);}catch{setImportErr(t("explorer.import_queries_bad"));}};r.readAsText(f);e.target.value="";}}/>
                      </div>
                      {importErr&&<div style={{padding:"6px 10px",fontSize:11,color:C.rd,borderBottom:`1px solid ${C.bd}`,display:"flex",alignItems:"center",gap:6}}>⚠ {importErr}<button onClick={()=>setImportErr("")} style={{marginLeft:"auto",background:"none",border:"none",color:C.txd,cursor:"pointer",padding:0,fontSize:11}}>✕</button></div>}
                      {savedQueries.map(q=>(
                        <div key={q.name} style={{display:"flex",alignItems:"center",gap:6,padding:"6px 10px",borderBottom:`1px solid ${C.bd}`,borderLeft:`3px solid ${q.name===activeSaved?C.yw:"transparent"}`,cursor:"pointer"}} onClick={()=>loadSavedQuery(q)}
                          onMouseEnter={e=>e.currentTarget.style.background=C.sfh}
                          onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                          <div style={{flex:1,minWidth:0}}>
                            <div style={{fontSize:13,fontWeight:500,color:C.tx}}>{q.name}</div>
                            <div style={{fontSize:11,color:C.txd,...mono}}>{q.entity} • {q.qm==="odata"?"OData":q.qm==="fetchxml"?"FetchXML":q.qm==="sql"?"SQL":`${q.fields?.length||0} columns`}{q.savedAt?` • ${new Date(q.savedAt).toLocaleDateString()}`:""}{q.name===activeSaved?" • loaded":""}</div>
                          </div>
                          <button onClick={(ev)=>{ev.stopPropagation();deleteSavedQuery(q.name);}} style={{background:"none",border:"none",color:C.txd,cursor:"pointer",padding:2,fontSize:11}}>✕</button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
          {streamState&&<StreamCard st={streamState} onStop={stopStream} onClose={()=>setStreamState(null)}/>}
          {!streamState&&tooBig&&<div style={{margin:12,padding:"14px 16px",borderRadius:8,border:`1px solid ${C.yw}55`,background:C.yw+"10",fontSize:13,lineHeight:1.6}}>
            <div style={{fontWeight:700,color:C.yw,marginBottom:4}}>This result doesn't fit in the browser's memory</div>
            <div style={{color:C.txm}}>{tooBig.rows.toLocaleString()} rows were read when memory ran short, and there are more. Colvio shows nothing rather than an incomplete list. Stream it to a file instead — every row, straight to disk:</div>
            <div style={{display:"flex",gap:8,marginTop:10}}>
              <button onClick={()=>startStream("csv")} style={bt(C.cy,{fontSize:12})}>⬇ Stream to CSV</button>
              <button onClick={()=>startStream("xlsx")} style={bt(C.cy,{fontSize:12})}>⬇ Stream to Excel</button>
            </div>
          </div>}
          <div>{res?<Results res={res} bp={bp} orgInfo={orgInfo} onStop={stopFetch} onDeleteDone={(ids)=>setRes(prev=>({...prev,data:prev.data.filter(r=>!ids.has(recordId(r,prev.entity?.l,prev.entity?.pk)))}))} onUpdateRecord={(updated,old)=>setRes(prev=>({...prev,data:prev.data.map(r=>r===old?updated:r)}))} onUpdateRecords={(updates)=>setRes(prev=>({...prev,data:prev.data.map(r=>updates.get(r)||r)}))} />:<div style={{display:"flex",alignItems:"center",justifyContent:"center",height:200,color:C.txd,fontSize:14}}>{t("explorer.ctrl_enter")}</div>}</div>
        </>:null}
      </div>
      {viewModal&&<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.5)",zIndex:100,display:"flex",alignItems:"center",justifyContent:"center"}} onClick={()=>!viewModal.saving&&setViewModal(null)}>
        <div style={{background:C.sf,border:`1px solid ${C.bd}`,borderRadius:10,padding:20,width:440,maxWidth:"92vw",boxShadow:"0 8px 32px rgba(0,0,0,.5)"}} onClick={e=>e.stopPropagation()}>
          <div style={{fontSize:15,fontWeight:700,marginBottom:6,color:C.tx}}>👁 Save as a personal view</div>
          {viewModal.done?(<>
            <div style={{fontSize:13,color:C.gn,marginBottom:8}}>✓ “{viewModal.done.name}” is a personal view of {viewModal.done.table}{viewModal.done.columns?.length?` with ${viewModal.done.columns.length} column${viewModal.done.columns.length>1?"s":""}`:""}.</div>
            <div style={{fontSize:12,color:C.txm,lineHeight:1.6,marginBottom:12}}>Refresh the Dynamics 365 tab: it's in the view selector of {viewModal.done.table}, under My views. Only you see it — share it from there if others need it.</div>
            <div style={{display:"flex",justifyContent:"flex-end"}}><button onClick={()=>setViewModal(null)} style={bt(null,{fontSize:12})}>Close</button></div>
          </>):(<>
            <div style={{fontSize:12,color:C.txd,lineHeight:1.6,marginBottom:10}}>The query's columns, filters and sort become a view of its table that only you see. Paging and row limits don't apply to views.</div>
            <input value={viewModal.name} onChange={e=>setViewModal(v=>({...v,name:e.target.value,error:""}))} autoFocus onKeyDown={e=>{if(e.key==="Enter")saveView();if(e.key==="Escape"&&!viewModal.saving)setViewModal(null);}} placeholder="View name" style={inp({fontSize:13,marginBottom:10,width:"100%",boxSizing:"border-box"})}/>
            {viewModal.error&&<div style={{fontSize:12,color:C.rd,marginBottom:10,lineHeight:1.5}}>{viewModal.error}</div>}
            <div style={{display:"flex",gap:6,justifyContent:"flex-end"}}>
              <button onClick={()=>setViewModal(null)} disabled={viewModal.saving} style={bt(null,{fontSize:12})}>{t("common.cancel")}</button>
              <button onClick={saveView} disabled={viewModal.saving||!viewModal.name.trim()} style={bt(C.vi,{fontSize:12,opacity:viewModal.saving||!viewModal.name.trim()?.5:1})}>{viewModal.saving?<><Spin s={11}/> Saving…</>:"Save view"}</button>
            </div>
          </>)}
        </div>
      </div>}
      {saveModal&&<div style={{position:"fixed",top:0,left:0,right:0,bottom:0,background:"rgba(0,0,0,.5)",zIndex:100,display:"flex",alignItems:"center",justifyContent:"center"}} onClick={()=>setSaveModal(false)}>
        <div style={{background:C.sf,border:`1px solid ${C.bd}`,borderRadius:10,padding:20,minWidth:300,boxShadow:"0 8px 32px rgba(0,0,0,.5)"}} onClick={e=>e.stopPropagation()}>
          <div style={{fontSize:15,fontWeight:700,marginBottom:12,color:C.tx}}>{t("explorer.query_name")}</div>
          <input value={saveName} onChange={e=>setSaveName(e.target.value)} placeholder={t("explorer.query_name_placeholder")} autoFocus style={inp({fontSize:13,marginBottom:12,width:"100%",boxSizing:"border-box"})} onKeyDown={e=>{if(e.key==="Enter"&&saveName.trim())doSaveQuery(saveName.trim());if(e.key==="Escape")setSaveModal(false);}}/>
          {savedQueries.some(s=>s.name===saveName.trim())&&<div style={{fontSize:12,color:C.yw,marginTop:-6,marginBottom:12}}>A saved query already has this name — saving replaces it.</div>}
          <div style={{display:"flex",gap:6,justifyContent:"flex-end"}}>
            <button onClick={()=>setSaveModal(false)} style={bt(null,{fontSize:12})}>{t("common.cancel")}</button>
            <button onClick={()=>doSaveQuery(saveName.trim())} disabled={!saveName.trim()} style={bt(saveName.trim()?(savedQueries.some(s=>s.name===saveName.trim())?C.yw:C.vi):C.sfh,{fontSize:12,opacity:saveName.trim()?1:.5})}>{savedQueries.some(s=>s.name===saveName.trim())?"Overwrite":t("common.save")}</button>
          </div>
        </div>
      </div>}
    </div>
  );
}
