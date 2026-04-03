import { useState, useEffect, useRef } from "react";
import Tooltip from "./Tooltip.jsx";
import QueryTemplates from "./QueryTemplates.jsx";
import { t } from "../i18n.js";
import { bridge } from "../d365-bridge.js";
import { C, I, Spin, ENTS, FLDS, ROWS, useDebounce, useKeyboard, mono, inp, bt, copyText, isTrulyCustom } from "../shared.jsx";
import { sqlToFetchXml } from "../sqlToFetchXml.js";
import FieldPicker from "./FieldPicker.jsx";
import ExpandCard from "./ExpandCard.jsx";
import Results from "./Results.jsx";

export default function Explorer({bp,addHistory,orgInfo}){
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
  const[lim,setLim]=useState(50);
  const[showList,setShowList]=useState(true);
  const[savedQueries,setSavedQueries]=useState([]);
  const[queryHistory,setQueryHistory]=useState([]);
  const[showHistory,setShowHistory]=useState(false);
  const[showSaved,setShowSaved]=useState(false);
  const[showTemplates,setShowTemplates]=useState(false);
  const selGen=useRef(0); // generation counter: incremented on every entity selection to cancel stale fetches
  const onFieldsReady=useRef(null); // callback invoked after fields are loaded (used by loadSavedQuery/templates)

  useEffect(()=>{
    if(typeof chrome!=="undefined"&&chrome.storage?.local){
      chrome.storage.local.get(["d365_query_history"],r=>{
        if(r.d365_query_history) setQueryHistory(r.d365_query_history);
      });
    }
  },[]);
  const addToHistory=(entity,query,mode,fieldCount)=>{
    // Strip $filter values from stored query to avoid persisting PII (emails, names, etc.)
    const safeQuery=(query||"").replace(/\$filter=[^&]*/,"$filter=...").substring(0,200);
    const entry={entity:entity?.l||"?",query:safeQuery,mode,fields:fieldCount,ts:Date.now()};
    setQueryHistory(prev=>{
      const updated=[entry,...prev.filter(h=>h.query!==entry.query)].slice(0,20);
      if(typeof chrome!=="undefined"&&chrome.storage?.local) chrome.storage.local.set({d365_query_history:updated});
      return updated;
    });
  };
  useEffect(()=>{
    if(typeof chrome!=="undefined"&&chrome.storage?.local){
      chrome.storage.local.get(["d365_saved_queries"],r=>{
        if(r.d365_saved_queries) setSavedQueries(r.d365_saved_queries);
      });
    }
  },[]);

  const saveCurrentQuery=()=>{
    if(!ent) return;
    const name=prompt("Query name:");
    if(!name) return;
    const q={name,entity:ent.l,entitySet:ent.p,fields:sf,filterGroups,groupLogic,expands:expands.map(ex=>({navProperty:ex.navProperty,targetEntity:ex.targetEntity,lookupField:ex.lookupField,fields:ex.fields})),limit:lim,qm,fxml,savedAt:new Date().toISOString()};
    const updated=[q,...savedQueries.filter(s=>s.name!==name)].slice(0,20);
    setSavedQueries(updated);
    if(typeof chrome!=="undefined"&&chrome.storage?.local) chrome.storage.local.set({d365_saved_queries:updated});
  };

  const loadSavedQuery=(q)=>{
    const match=entities.find(e=>e.l===q.entity);
    if(match){
      onFieldsReady.current=()=>{
        setSf(q.fields||[]);
        setFilterGroups(q.filterGroups||[{logic:"and",conditions:[{field:"",op:"eq",value:""}]}]);
        setGroupLogic(q.groupLogic||"and");
        setLim(q.limit||50);
        if(q.qm){setQm(q.qm);if(q.qm==="odata"&&q.query)setRq(q.query);}
        if(q.fxml){setFxml(q.fxml);}
      };
      selEnt(match);
    }
    setShowSaved(false);
  };

  const deleteSavedQuery=(name)=>{
    const updated=savedQueries.filter(s=>s.name!==name);
    setSavedQueries(updated);
    if(typeof chrome!=="undefined"&&chrome.storage?.local) chrome.storage.local.set({d365_saved_queries:updated});
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

  useEffect(()=>{
    if(!isLive) return;
    setLoading(true);
    bridge.getEntities().then(data=>{
      if(data && Array.isArray(data)){
        const mapped = data.map(e=>({
          l:e.logical, d:e.display, p:e.entitySet||e.logical+"s",
          i:(e.isCustom&&isTrulyCustom(e.logical))?"⚙️":"📋", c:0, cat:(e.isCustom&&isTrulyCustom(e.logical))?"Custom":"Standard"
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
    setEnt(e);setRes(null);setPicker(false);setError("");
    setFilterGroups([{logic:"and",conditions:[{field:"",op:"eq",value:""}]}]);
    setExpands([]);setLookups([]);setShowExpandPicker(false);setChildRelsLoaded(false);
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
            t:f.type||"String", req:!!f.required, cust:!!(f.isCustom&&isTrulyCustom(f.logical))
          })).sort((a,b)=>a.l.localeCompare(b.l));
          setFields(mapped);
          const common=mapped.filter(f=>["name","fullname","emailaddress1","telephone1","statecode","subject","title"].includes(f.l)).map(f=>f.l);
          setSf(common.length>0?common.slice(0,5):mapped.slice(0,5).map(f=>f.l));
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

  const addExpand = async (lookup) => {
    if (expands.find(x => x.navProperty === lookup.navProperty)) return;
    setLoadingExpand(lookup.navProperty);
    try {
      const targetFields = isLive ? await bridge.getFields(lookup.targetEntity) : FLDS;
      const mapped = (targetFields || [])
        .map(f => ({
          l: f.logical || f.l,
          d: f.display || f.d || f.logical || f.l,
          t: f.type || f.t || "String",
          cust: !!((f.isCustom || f.cust) && isTrulyCustom(f.logical || f.l)),
          odata: f.odataName || f.logical || f.l,
        }))
        .sort((a, b) => a.l.localeCompare(b.l));
      const commonNames = ["name","fullname","title","subject","accountnumber","emailaddress1","internalemailaddress","telephone1","new_sapid","new_externalid"];
      const auto = mapped.filter(f => commonNames.includes(f.l)).map(f => f.l);
      setExpands(prev => [...prev, {
        navProperty: lookup.navProperty,
        targetEntity: lookup.targetEntity,
        lookupField: lookup.lookupField,
        type: lookup.type || "single",
        allFields: mapped,
        fields: auto.length > 0 ? auto.slice(0, 5) : mapped.slice(0, 5).map(f => f.l),
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

  const debouncedEs = useDebounce(es, 150);
  const filtered=entities.filter(e=>e.d.toLowerCase().includes(debouncedEs.toLowerCase())||e.l.includes(debouncedEs.toLowerCase()));

  const oq=()=>{
    if(!ent)return"";
    let q=`GET /api/data/v9.2/${ent.p}`;
    const ps=[];
    if(sf.length)ps.push(`$select=${sf.map(f=>getOdataName(f)).join(",")}`);
    const exClauses=expands.filter(ex=>ex.fields.length>0).map(ex=>`${ex.navProperty}($select=${ex.fields.join(",")})`);
    if(exClauses.length)ps.push(`$expand=${exClauses.join(",")}`);
    const gf=buildGroupFilter();
    if(gf) ps.push(`$filter=${gf}`);
    if(lim>0)ps.push(`$top=${lim}`);
    return ps.length?q+"?"+ps.join("&"):q;
  };

  const getOdataName = (logicalName) => {
    const f = fields.find(x => x.l === logicalName);
    return f?.odata || logicalName;
  };

  const getFieldType = (logicalName) => {
    const f = fields.find(x => x.l === logicalName);
    return f?.t || "String";
  };

  const buildFilter = (fieldName, op, val) => {
    if (!fieldName) return "";
    if (op === "is_null") return `${getOdataName(fieldName)} eq null`;
    if (op === "is_not_null") return `${getOdataName(fieldName)} ne null`;
    if (!val) return "";
    const odataField = getOdataName(fieldName);
    const fType = getFieldType(fieldName);
    const escaped = val.replace(/'/g, "''");
    const isStringType = fType === "String" || fType === "Memo";

    if (op === "contains" || op === "startswith" || op === "endswith") {
      if (!isStringType) { op = "eq"; }
      else return `${op}(${odataField},'${escaped}')`;
    }
    if (op === "not_contains" || op === "not_startswith" || op === "not_endswith") {
      if (!isStringType) { op = "ne"; }
      else { const fn = op.replace("not_",""); return `not ${fn}(${odataField},'${escaped}')`; }
    }
    const noQuoteTypes = new Set(["Integer","Picklist","State","Status","Boolean","Money","Decimal","Double","BigInt"]);
    if (noQuoteTypes.has(fType)) {
      // Security: validate numeric value to prevent OData injection (e.g. "1 or 1 eq 1")
      const sanitized = val.trim();
      if (fType === "Boolean" && (sanitized === "true" || sanitized === "false")) return `${odataField} ${op} ${sanitized}`;
      if (/^-?\d+(\.\d+)?$/.test(sanitized)) return `${odataField} ${op} ${sanitized}`;
      return `${odataField} ${op} '${escaped}'`; // fallback to quoted string if not a valid number
    }

    if (fType === "Lookup" || fType === "Customer") {
      // Security: validate GUID format to prevent OData injection
      if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val.trim())) return `${odataField} ${op} ${val.trim()}`;
      return `${odataField} ${op} '${escaped}'`; // fallback
    }

    return `${odataField} ${op} '${escaped}'`;
  };

  const buildGroupFilter = () => {
    const groupParts = filterGroups.map(g => {
      const active = g.conditions.filter(c => c.field && (c.value || c.op === "is_null" || c.op === "is_not_null"));
      if (!active.length) return "";
      const parts = active.map(c => buildFilter(c.field, c.op, c.value));
      if (parts.length === 1) return parts[0];
      return `(${parts.join(` ${g.logic} `)})`;
    }).filter(Boolean);
    if (!groupParts.length) return "";
    return groupParts.join(` ${groupLogic} `);
  };

  const fetchAbort = useRef(false);

  const cleanRecord = (r) => {
    const clean = {};
    for (const [k, v] of Object.entries(r)) {
      if (k.startsWith("@odata") || k === "@odata.etag") continue;
      const fvMatch = k.match(/^(.+)@OData\.Community\.Display\.V1\.FormattedValue$/);
      if (fvMatch) { clean[fvMatch[1] + "__display"] = v; continue; }
      const lkMatch = k.match(/^(.+)@Microsoft\.Dynamics\.CRM\.lookuplogicalname$/);
      if (lkMatch) { clean[lkMatch[1] + "__entity"] = v; continue; }
      if (k.includes("@")) continue;
      const matchingExpand = expands.find(ex => ex.navProperty === k);
      if (matchingExpand && v && typeof v === "object") {
        if (Array.isArray(v)) {
          for (const f of matchingExpand.fields) {
            const vals = v.map(item => {
              const fv = item[f + "@OData.Community.Display.V1.FormattedValue"] || item[f];
              return fv != null ? String(fv) : "";
            }).filter(Boolean);
            clean[`${matchingExpand.targetEntity}.${f}`] = vals.join(", ");
          }
          clean[`${matchingExpand.targetEntity}.__count`] = v.length;
        } else {
          for (const [ek, ev] of Object.entries(v)) {
            if (ek.startsWith("@") || ek.includes("@")) continue;
            clean[`${matchingExpand.targetEntity}.${ek}`] = ev;
          }
        }
      } else { clean[k] = v; }
    }
    return clean;
  };

  const run=async()=>{
    setError("");
    fetchAbort.current = false;
    const runGen=selGen.current; // capture to detect entity change mid-run
    const validFieldNames = new Set(fields.map(f => f.l));
    const validSf = sf.filter(f => validFieldNames.has(f));
    if(isLive && loadingFields){ setError("Wait for fields to load..."); return; }

    const allSelected = validSf.length >= fields.length;
    const odataSelect = allSelected ? [] : validSf.map(f => getOdataName(f));
    const expandClauses = expands.filter(ex => ex.fields.length > 0).map(ex => {
      const exFields = ex.allFields.filter(f => ex.fields.includes(f.l));
      const exSelect = exFields.map(f => f.odata || f.l).join(",");
      return exSelect ? `${ex.navProperty}($select=${exSelect})` : ex.navProperty;
    });
    const buildQ=()=>{
      if(!ent)return"";
      let q=`GET /api/data/v9.2/${ent.p}`;const ps=[];
      if(odataSelect.length)ps.push(`$select=${odataSelect.join(",")}`);
      if(expandClauses.length)ps.push(`$expand=${expandClauses.join(",")}`);
      const gf2=buildGroupFilter();
      if(gf2) ps.push(`$filter=${gf2}`);
      if(lim>0)ps.push(`$top=${lim}`);
      return ps.length?q+"?"+ps.join("&"):q;
    };
    let sqlGenFxml="";
    if(qm==="sql"){
      if(!sqlQ.trim()){setError("SQL query is empty");return;}
      const r=sqlToFetchXml(sqlQ);
      if(r.error){setError(r.error);return;}
      sqlGenFxml=r.fetchXml;
      setSqlFx(sqlGenFxml);
    }
    const q=qm==="odata"?rq:qm==="fetchxml"?fxml:qm==="sql"?sqlQ:buildQ();
    addHistory(q,qm);

    if(!isLive){
      setRes({entity:ent,fields:sf.length?sf:FLDS.map(f=>f.l),data:ROWS,count:ROWS.length,total:ROWS.length,query:q,elapsed:"mock",nextLink:null,fetching:false});
      return;
    }

    if(qm==="fetchxml"||qm==="sql"){
      const activeFxml=qm==="sql"?sqlGenFxml:fxml;
      if(!activeFxml.trim()){setError("FetchXML is empty");return;}
      setLoading(true);
      const t0=Date.now();
      try{
        const data=await bridge.executeFetchXml(activeFxml);
        const t1=((Date.now()-t0)/1000).toFixed(1);
        if(!data?.records){setError("No results");setLoading(false);return;}
        const firstRec=data.records[0]||{};
        const headerFields=Object.keys(firstRec).filter(k=>!k.startsWith("@")&&!k.includes("@")&&k!=="__error");
        const odataFieldMap={};
        headerFields.forEach(f=>{odataFieldMap[f]=f;});
        let allRecords=[...data.records];

        setRes({entity:ent,fields:headerFields,odataFieldMap,data:allRecords,count:allRecords.length,total:allRecords.length,query:q,elapsed:`${t1}s`,nextLink:null,fetching:!!data.moreRecords});
        setLoading(false);

        let page=1;
        let cookie=data.pagingCookie;
        let hasMore=!!cookie;
        let useCookie=true;
        while(hasMore&&!fetchAbort.current){
          page++;
          let pagedXml;
          if(useCookie){
            pagedXml=activeFxml.replace(/<fetch/,`<fetch page="${page}" paging-cookie="${cookie.replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}"`);
            if(!pagedXml.includes(`page="`))pagedXml=activeFxml.replace(/<fetch/,`<fetch page="${page}"`);
          }else{
            // Fallback: page number only (no cookie) — works for entities like systemuser where the paging cookie is broken
            pagedXml=activeFxml.replace(/<fetch/,`<fetch page="${page}"`);
          }
          try{
            const pageData=await bridge.executeFetchXml(pagedXml);
            if(!pageData?.records?.length)break;
            allRecords=[...allRecords,...pageData.records];
            cookie=pageData.pagingCookie||cookie;
            hasMore=useCookie?!!pageData.pagingCookie:pageData.records.length>=5000;
            setRes(prev=>({...prev,data:allRecords,count:allRecords.length,total:allRecords.length,fetching:hasMore,elapsed:`${((Date.now()-t0)/1000).toFixed(1)}s`}));
          }catch(e){
            if(useCookie&&page===2&&e.message.includes("0x80041129")){
              // Paging cookie mismatch (known D365 bug on systemuser etc.) — retry without cookie
              useCookie=false;
              page--;
              continue;
            }
            setError(`Page ${page}: ${e.message}`);break;
          }
        }
        setRes(prev=>({...prev,fetching:false,elapsed:`${((Date.now()-t0)/1000).toFixed(1)}s`}));
      }catch(e){
        setError(e.message);setLoading(false);
      }
      return;
    }

    // ── OData raw mode: execute the user-typed OData URL directly ──
    if(qm==="odata"){
      if(!rq.trim()){setError("OData query is empty");return;}
      setLoading(true);
      const t0=Date.now();
      try{
        // Parse: "entitySet?$select=...&$filter=..." or just "entitySet"
        const raw=rq.trim().replace(/^GET\s+\/api\/data\/v\d+\.\d+\//i,"");
        const qIdx=raw.indexOf("?");
        const entitySet=qIdx>-1?raw.substring(0,qIdx):raw;
        const queryStr=qIdx>-1?raw.substring(qIdx+1):"";
        const urlParams=new URLSearchParams(queryStr);
        const opts={};
        if(urlParams.get("$select"))opts.select=urlParams.get("$select");
        if(urlParams.get("$filter"))opts.filter=urlParams.get("$filter");
        if(urlParams.get("$top"))opts.top=urlParams.get("$top");
        if(urlParams.get("$orderby"))opts.orderby=urlParams.get("$orderby");
        if(urlParams.get("$expand"))opts.expand=urlParams.get("$expand");
        const data=await bridge.query(entitySet,opts);
        if(!data?.records){setError("No results");setLoading(false);return;}
        const t1=((Date.now()-t0)/1000).toFixed(1);
        const firstClean=data.records.map(cleanRecord);
        // Derive columns from actual returned data, not builder selection
        const headerFields=firstClean[0]?Object.keys(firstClean[0]).filter(k=>!k.startsWith("@")&&!k.includes("@")&&!k.endsWith("__display")&&!k.endsWith("__entity")):[];
        const odataFieldMap={};
        headerFields.forEach(f=>{odataFieldMap[f]=f;});
        let allRecords=[...firstClean];
        let nextLink=data.nextLink||null;
        setRes({entity:ent||{l:"?",p:entitySet},fields:headerFields,odataFieldMap,data:allRecords,count:allRecords.length,total:allRecords.length,query:q,elapsed:`${t1}s`,nextLink,fetching:!!nextLink});
        addToHistory(ent||{l:entitySet},q,qm,headerFields.length);
        setLoading(false);
        // Paginate
        let pageNum=1;
        while(nextLink&&!fetchAbort.current){
          pageNum++;
          try{
            const pageData=await bridge.query(nextLink,{});
            if(!pageData?.records?.length)break;
            const pageClean=pageData.records.map(cleanRecord);
            allRecords=[...allRecords,...pageClean];
            nextLink=pageData.nextLink||null;
            setRes(prev=>({...prev,data:allRecords,count:allRecords.length,total:allRecords.length,nextLink,fetching:!!nextLink,elapsed:`${((Date.now()-t0)/1000).toFixed(1)}s`}));
          }catch(pageErr){
            setError(`Page ${pageNum}: ${pageErr.message}`);break;
          }
        }
        setRes(prev=>({...prev,fetching:false,nextLink:null,elapsed:`${((Date.now()-t0)/1000).toFixed(1)}s`}));
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
      if(lim>0)opts.top=String(lim);
      const data=await bridge.query(ent.p,opts);
      if(!data?.records) return;
      const t1 = ((Date.now()-t0)/1000).toFixed(1);

      const firstClean = data.records.map(cleanRecord);
      const headerFields = [...(validSf.length > 0 && !allSelected ? validSf : (firstClean[0] ? Object.keys(firstClean[0]).filter(k=>!k.endsWith("__display")&&!k.endsWith("__entity")&&!k.includes(".")) : validSf))];
      for (const ex of expands) { for (const f of ex.fields) { headerFields.push(`${ex.targetEntity}.${f}`); } }
      const odataFieldMap = {};
      headerFields.forEach(f => { odataFieldMap[f] = f.includes(".") ? f : getOdataName(f); });

      let allRecords = [...firstClean];
      let nextLink = data.nextLink || null;
      setRes({entity:ent, fields:headerFields, odataFieldMap, data:allRecords, count:allRecords.length, total:allRecords.length, query:q, elapsed:`${t1}s`, nextLink, fetching:!!nextLink});
      addToHistory(ent,q,qm,headerFields.length);
      setLoading(false);

      let pageNum = 1;
      const hasExpand = expandClauses.length > 0;
      while (nextLink && !fetchAbort.current) {
        pageNum++;
        try {
          const pageData = await bridge.query(nextLink, {});
          if (!pageData?.records?.length) break;
          const pageClean = pageData.records.map(cleanRecord);
          allRecords = [...allRecords, ...pageClean];
          nextLink = pageData.nextLink || null;
          setRes(prev => ({...prev, data: allRecords, count: allRecords.length, total: allRecords.length, nextLink, fetching: !!nextLink, elapsed:`${((Date.now()-t0)/1000).toFixed(1)}s`}));
        } catch (pageErr) {
          if (pageErr.message?.includes("401") || pageErr.message?.includes("SESSION_EXPIRED")) {
            setError("Session expired — refresh D365 (F5) then click ⚡ again");
          } else { setError(`Page ${pageNum}: ${pageErr.message}`); }
          setRes(prev => ({...prev, nextLink: null, fetching: false}));
          break;
        }
      }
      if (hasExpand && ent.c && allRecords.length < ent.c * 0.9) {
        setError(`⚠ ${allRecords.length} records retrieved out of ${ent.c} — D365 limits results with $expand. Remove expand to get all records, then enrich in a second query.`);
      }
      setRes(prev => ({...prev, fetching: false, nextLink: null, elapsed:`${((Date.now()-t0)/1000).toFixed(1)}s`}));
    } catch(e) {
      if(e.message?.includes("401") || e.message?.includes("SESSION_EXPIRED")) {
        setError("Session expired — refresh D365 (F5) then click ⚡ again");
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

  useKeyboard("Enter",()=>{if(ent&&!loading&&!loadingFields)run();},[ent,sf,filterGroups,groupLogic,lim,qm,rq,fxml,sqlQ,loading,loadingFields]);

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
            <button key={e.l} onClick={()=>selEnt(e)} style={{width:"100%",display:"flex",alignItems:"center",gap:7,padding:"6px 8px",border:"none",borderRadius:5,cursor:"pointer",marginBottom:1,background:ent?.l===e.l?C.sfa:"transparent",color:ent?.l===e.l?C.tx:C.txm}}>
              <span style={{fontSize:15}}>{e.i}</span><div style={{flex:1,textAlign:"left",minWidth:0}}><div style={{fontSize:13,fontWeight:ent?.l===e.l?600:400,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{e.d}</div><div style={{fontSize:11,color:C.txd,...mono}}>{e.l}</div></div>{(e.c>0||entityCounts[e.l]>0)&&<span style={{fontSize:10,color:C.txd,background:C.bg,padding:"1px 5px",borderRadius:3,...mono}}>{(e.c||entityCounts[e.l]||0).toLocaleString()}</span>}
            </button>
          ))}</div>
        </div>
      )}
      <div style={{flex:1,overflow:"auto",minWidth:0}}>
        {error&&<div style={{padding:"8px 12px",background:C.rd+"22",borderBottom:`1px solid ${C.rd}33`,color:C.rd,fontSize:13,display:"flex",alignItems:"center",gap:6,position:"sticky",top:0,zIndex:3}}>⚠ {error}<button onClick={()=>setError("")} style={{background:"none",border:"none",color:C.rd,cursor:"pointer",marginLeft:"auto"}}><I.X/></button></div>}
        {!ent&&!bp.mobile?<div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",color:C.txd}}><I.Database/><span style={{marginLeft:8}}>Select an entity</span></div>
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
                <button onClick={()=>{setSqlQ(`SELECT name, createdon FROM ${ent.l} WHERE statecode = 0 ORDER BY name ASC TOP 100`);setShowSqlFx(false);}} style={{padding:"4px 10px",fontSize:11,border:`1px dashed ${C.bd}`,borderRadius:3,color:C.txd,cursor:"pointer",background:"transparent"}}>📋 Simple</button>
                <button onClick={()=>{setSqlQ(`SELECT c.fullname, c.emailaddress1, a.name\nFROM contact AS c\nJOIN account AS a ON c.parentcustomerid = a.accountid\nWHERE c.statecode = 0`);setShowSqlFx(false);}} style={{padding:"4px 10px",fontSize:11,border:`1px dashed ${C.bd}`,borderRadius:3,color:C.txd,cursor:"pointer",background:"transparent"}}>🔗 Join</button>
                <button onClick={()=>{setSqlQ(`SELECT statecode, COUNT(*) FROM ${ent.l} GROUP BY statecode`);setShowSqlFx(false);}} style={{padding:"4px 10px",fontSize:11,border:`1px dashed ${C.bd}`,borderRadius:3,color:C.txd,cursor:"pointer",background:"transparent"}}>📊 Aggregate</button>
                <button onClick={()=>{if(!sqlQ.trim())return;const r=sqlToFetchXml(sqlQ);if(r.error){setError(r.error);setSqlFx("");}else{setSqlFx(r.fetchXml);setShowSqlFx(true);setError("");}}} style={{padding:"4px 10px",fontSize:11,border:`1px solid ${C.cy}66`,borderRadius:3,color:C.cy,cursor:"pointer",background:"transparent"}}>{showSqlFx?"Hide FetchXML":t("view_fetchxml")||"View FetchXML"}</button>
              </div>
              {showSqlFx&&sqlFx&&<pre style={{marginTop:6,padding:8,background:C.bg,border:`1px solid ${C.bd}`,borderRadius:6,fontSize:12,color:C.gn,overflow:"auto",maxHeight:160,...mono,whiteSpace:"pre-wrap"}}>{sqlFx}</pre>}
            </div>
            :qm==="odata"?<textarea value={rq} onChange={e=>setRq(e.target.value)} placeholder={`GET /api/data/v9.2/${ent.p}?$select=name&$top=50`} style={inp({height:50,...mono,color:C.cy,resize:"vertical",fontSize:13})}/>
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
                      {sf.length>0&&<button onClick={(e)=>{e.stopPropagation();setSf([]);}} style={{padding:"4px 10px",background:"transparent",border:"none",color:C.txd,cursor:"pointer",fontSize:11,textDecoration:"underline"}}>Deselect all</button>}
                      {sf.length<fields.length&&<button onClick={(e)=>{e.stopPropagation();setSf(fields.map(f=>f.l));}} style={{padding:"4px 10px",background:"transparent",border:"none",color:C.cy,cursor:"pointer",fontSize:11,textDecoration:"underline"}}>Select all ({fields.length})</button>}
                      {sf.length>5&&<button onClick={(e)=>{e.stopPropagation();setQueryCollapsed(true);}} style={{padding:"4px 10px",background:"transparent",border:`1px solid ${C.bd}`,borderRadius:3,color:C.txd,cursor:"pointer",fontSize:11,flexShrink:0}}>Collapse ▲</button>}
                    </div>
                  )}
                </div>
              </div>

              {picker&&<FieldPicker fields={fields} selected={sf} onToggle={(f)=>sf.includes(f)?setSf(sf.filter(x=>x!==f)):setSf([...sf,f])} onBulkAdd={(arr)=>setSf(prev=>[...prev,...arr])} onBulkRemove={(arr)=>{const s=new Set(arr);setSf(prev=>prev.filter(f=>!s.has(f)));}} onSelectAll={()=>setSf(fields.map(f=>f.l))} onSelectNone={()=>setSf([])} bp={bp} onClose={()=>setPicker(false)} />}
              <div style={{display:"flex",flexDirection:"column",gap:4}}>
                <div style={{display:"flex",alignItems:"center",gap:5}}>
                  <span style={{fontSize:12,color:C.vi,fontWeight:700,minWidth:44,...mono}}>WHERE</span>
                  {filterGroups.length>1&&<select value={groupLogic} onChange={e=>setGroupLogic(e.target.value)} style={inp({width:"auto",fontSize:11,padding:"2px 5px",color:C.yw})}><option value="and">AND</option><option value="or">OR</option></select>}
                  <button onClick={()=>setFilterGroups([...filterGroups,{logic:"and",conditions:[{field:"",op:"eq",value:""}]}])} style={{padding:"2px 8px",background:"transparent",border:`1px dashed ${C.bd}`,borderRadius:3,color:C.txd,cursor:"pointer",fontSize:11}}>+ group</button>
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
                    {filterGroups.length===1&&<button onClick={addCond} style={{padding:"2px 8px",background:"transparent",border:`1px dashed ${C.bd}`,borderRadius:3,color:C.txd,cursor:"pointer",fontSize:11,marginTop:2}}>+ condition</button>}
                    {filterGroups.length===1&&grp.conditions.length>1&&<select value={grp.logic} onChange={e=>updateGrp({...grp,logic:e.target.value})} style={inp({width:"auto",fontSize:10,padding:"2px 6px",color:C.yw,marginTop:2,marginLeft:4})}><option value="and">AND</option><option value="or">OR</option></select>}
                  </div>);
                })}
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
                    if(opening && !childRelsLoaded && ent && isLive) {
                      setChildRelsLoaded(true);
                      bridge.getChildRelationships(ent.l).then(childRels => {
                        if(childRels && Array.isArray(childRels)) {
                          setLookups(prev => {
                            const seen = new Set(prev.map(l => l.navProperty));
                            const newRels = childRels.filter(l => l.navProperty && !seen.has(l.navProperty)).map(l => ({...l, type: "collection"}));
                            return [...prev, ...newRels];
                          });
                        }
                      }).catch(() => {});
                    }
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

                    {expands.map(ex=>(<ExpandCard key={ex.navProperty} ex={ex} onToggle={toggleExpandField} onRemove={removeExpand} bp={bp}/>))}
                  </div>
                )}
              </div>

              <div style={{display:"flex",alignItems:"center",gap:5}}>
                <span style={{fontSize:12,color:C.vi,fontWeight:700,minWidth:44,...mono}}>LIMIT</span>
                <select value={lim} onChange={e=>setLim(+e.target.value)} style={inp({width:"auto",fontSize:12,padding:"3px 6px"})}>{[10,25,50,100,200,500,1000,5000].map(n=><option key={n} value={n}>{n}</option>)}<option value={0}>All</option></select>
                {lim===0&&<span style={{fontSize:11,color:C.yw}}>⚠ may be slow</span>}
                {lim===0&&expands.length>0&&<span style={{fontSize:11,color:C.or}}>⚠ D365 limits results with $expand</span>}
              </div>
            </div>}
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginTop:8,gap:6,flexWrap:"wrap"}}>
              {qm==="builder"&&!bp.mobile&&<><code style={{fontSize:11,color:C.txd,...mono,flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{oq()}</code><button onClick={()=>{copyText(oq());}} style={{padding:"2px 6px",background:"transparent",border:`1px solid ${C.bd}`,borderRadius:3,color:C.txd,cursor:"pointer",fontSize:11,flexShrink:0}} title="Copy OData URL"><I.Copy/></button></>}
              {qm==="fetchxml"&&!bp.mobile&&<code style={{fontSize:11,color:C.cy,...mono,flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{fxml.replace(/\n/g," ").substring(0,100)}{fxml.length>100?"…":""}</code>}
              {qm==="sql"&&!bp.mobile&&<code style={{fontSize:11,color:C.cy,...mono,flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{sqlQ.replace(/\n/g," ").substring(0,100)}{sqlQ.length>100?"…":""}</code>}
              <div style={{display:"flex",gap:4,alignItems:"center",flexShrink:0}}>
                <button onClick={run} disabled={loading||loadingFields} style={bt(`linear-gradient(135deg,${C.vi},${C.vil})`)}>{loading?<><Spin s={12}/> Querying...</>:loadingFields?<><Spin s={12}/> Fields...</>:<><I.Play/> Execute <span style={{fontSize:11,opacity:.7}}>Ctrl+⏎</span></>}</button>
                <button onClick={saveCurrentQuery} disabled={!ent} title="Save this query" style={{padding:"4px 8px",background:"transparent",border:`1px solid ${C.yw}44`,borderRadius:4,color:C.yw,cursor:ent?"pointer":"default",fontSize:12}}>⭐</button>
                <div style={{position:"relative"}}>
                  <button onClick={()=>{setShowTemplates(!showTemplates);setShowHistory(false);setShowSaved(false);}} style={{padding:"4px 8px",background:showTemplates?C.gn+"33":"transparent",border:`1px solid ${showTemplates?C.gn+"44":C.bd}`,borderRadius:4,color:showTemplates?C.gn:C.txm,cursor:"pointer",fontSize:12}} title="Query templates">📝 Templates</button>
                  {showTemplates&&<QueryTemplates entities={entities} onSelect={(ent,fields,filters)=>{onFieldsReady.current=()=>{setSf(fields);setFilterGroups(filters);};selEnt(ent);}} onClose={()=>setShowTemplates(false)}/>}
                </div>
                <div style={{position:"relative"}}>
                  <button onClick={()=>{setShowHistory(!showHistory);setShowSaved(false);}} style={{padding:"4px 8px",background:showHistory?C.vi+"33":"transparent",border:`1px solid ${C.bd}`,borderRadius:4,color:C.txm,cursor:"pointer",fontSize:12}} title="Query history">🕐{queryHistory.length>0?` ${queryHistory.length}`:""}</button>
                  {showHistory&&queryHistory.length>0&&(
                    <div style={{position:"absolute",top:"100%",right:0,zIndex:20,background:C.sf,border:`1px solid ${C.bd}`,borderRadius:6,marginTop:4,minWidth:260,maxHeight:250,overflow:"auto",boxShadow:"0 8px 24px rgba(0,0,0,.4)"}}>
                      <div style={{padding:"6px 10px",borderBottom:`1px solid ${C.bd}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}><span style={{fontSize:11,fontWeight:600,color:C.txm}}>Recent queries</span><button onClick={()=>{setQueryHistory([]);if(typeof chrome!=="undefined"&&chrome.storage?.local)chrome.storage.local.remove("d365_query_history");}} style={{fontSize:10,color:C.txd,background:"none",border:"none",cursor:"pointer"}}>Clear</button></div>
                      {queryHistory.map((h,i)=>(
                        <div key={i} style={{padding:"6px 10px",borderBottom:`1px solid ${C.bd}`,cursor:"pointer",fontSize:12}} onClick={()=>{if(h.mode)setQm(h.mode);if(h.mode==="odata"&&h.query)setRq(h.query);if(h.mode==="fetchxml"&&h.query)setFxml(h.query);setShowHistory(false);}}
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
                  {showSaved&&savedQueries.length>0&&(
                    <div style={{position:"absolute",top:"100%",right:0,zIndex:20,background:C.sf,border:`1px solid ${C.bd}`,borderRadius:6,marginTop:4,minWidth:220,maxHeight:200,overflow:"auto",boxShadow:"0 8px 24px rgba(0,0,0,.4)"}}>
                      {savedQueries.map(q=>(
                        <div key={q.name} style={{display:"flex",alignItems:"center",gap:6,padding:"6px 10px",borderBottom:`1px solid ${C.bd}`,cursor:"pointer"}} onClick={()=>loadSavedQuery(q)}
                          onMouseEnter={e=>e.currentTarget.style.background=C.sfh}
                          onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                          <div style={{flex:1,minWidth:0}}>
                            <div style={{fontSize:13,fontWeight:500,color:C.tx}}>{q.name}</div>
                            <div style={{fontSize:11,color:C.txd,...mono}}>{q.entity} • {q.fields?.length||0} columns</div>
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
          <div>{res?<Results res={res} bp={bp} orgInfo={orgInfo} onStop={stopFetch} onDeleteDone={(ids)=>setRes(prev=>({...prev,data:prev.data.filter(r=>{const id=Object.values(r).find(v=>typeof v==="string"&&/^[0-9a-f]{8}-/.test(v));return !ids.has(id);})}))} onUpdateRecord={(updated,old)=>setRes(prev=>({...prev,data:prev.data.map(r=>r===old?updated:r)}))} />:<div style={{display:"flex",alignItems:"center",justifyContent:"center",height:200,color:C.txd,fontSize:14}}>Ctrl+Enter to execute</div>}</div>
        </>:null}
      </div>
    </div>
  );
}
