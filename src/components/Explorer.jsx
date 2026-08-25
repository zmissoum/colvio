import { useState, useEffect, useRef } from "react";
import Tooltip from "./Tooltip.jsx";
import QueryTemplates from "./QueryTemplates.jsx";
import { t } from "../i18n.js";
import { bridge } from "../d365-bridge.js";
import { C, I, Spin, ENTS, FLDS, ROWS, useDebounce, useKeyboard, mono, inp, bt, copyText, isTrulyCustom, dl, expName, recordId, TableTypeBadge } from "../shared.jsx";
import { sqlToFetchXml } from "../sqlToFetchXml.js";
import FieldPicker from "./FieldPicker.jsx";
import ExpandCard from "./ExpandCard.jsx";
import RelFilterCard from "./RelFilterCard.jsx";
import Results from "./Results.jsx";

// A 401 / lost session looks the same whatever the query mode (Builder, OData, FetchXML, SQL) — one
// detector + one message so every path reports it identically (and can't drift over time).
const SESSION_EXPIRED_MSG = "Session expired — refresh D365 (F5) then click ⚡ again";
const isSessionExpired = (msg) => { const s = String(msg || ""); return s.includes("401") || s.includes("SESSION_EXPIRED"); };

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
  const[lim,setLim]=useState(0);   // 0 = All (no $top) — an export tool should return everything by default; lower it for a quick preview
  const[orderBy,setOrderBy]=useState({f:"",dir:"asc"}); // server-side $orderby for the Builder (field + direction)
  const[showList,setShowList]=useState(true);
  const[savedQueries,setSavedQueries]=useState([]);
  const qImportRef=useRef(null);
  const[queryHistory,setQueryHistory]=useState([]);
  const[showHistory,setShowHistory]=useState(false);
  const[showSaved,setShowSaved]=useState(false);
  const[showTemplates,setShowTemplates]=useState(false);
  const[saveModal,setSaveModal]=useState(false);
  const[saveName,setSaveName]=useState("");
  const selGen=useRef(0); // generation counter: incremented on every entity selection to cancel stale fetches
  const onFieldsReady=useRef(null); // callback invoked after fields are loaded (used by loadSavedQuery/templates)
  const[bookmarks,setBookmarks]=useState([]);

  useEffect(()=>{
    if(typeof chrome!=="undefined"&&chrome.storage?.local){
      chrome.storage.local.get(["d365_query_history","d365_bookmarks"],r=>{
        if(r.d365_query_history) setQueryHistory(r.d365_query_history);
        if(r.d365_bookmarks) setBookmarks(r.d365_bookmarks);
      });
    }
  },[]);

  const toggleBookmark=(entityLogical)=>{
    setBookmarks(prev=>{
      const next=prev.includes(entityLogical)?prev.filter(b=>b!==entityLogical):[...prev,entityLogical];
      if(typeof chrome!=="undefined"&&chrome.storage?.local)chrome.storage.local.set({d365_bookmarks:next});
      return next;
    });
  };
  const addToHistory=(entity,query,mode,fieldCount)=>{
    // Strip $filter values from stored query to avoid persisting PII (emails, names, etc.)
    // 1000 (was 200): the old cap could chop a long $select mid-token, so a restored entry was
    // broken for a SECOND reason besides the redacted filter. Display still truncates at 80.
    const safeQuery=(query||"").replace(/\$filter=[^&]*/,"$filter=...").substring(0,1000);
    const entry={entity:entity?.l||"?",query:safeQuery,mode,fields:fieldCount,ts:Date.now()};
    // Builder entries also keep the query's STRUCTURE (columns, condition fields+operators, sort,
    // limit) so a history click can reopen the Builder instead of dumping the raw OData string.
    // Condition VALUES are blanked — same privacy rule as the string redaction above. REL/EXPAND
    // clauses are not kept (their metadata is refetch-heavy) — flagged so the restore says so.
    if(mode==="builder"){
      let redacted=0;
      entry.builder={
        fields:sf,
        filterGroups:filterGroups.map(g=>({logic:g.logic,conditions:(g.conditions||[]).map(c=>{if(c.value)redacted++;return{field:c.field,op:c.op,value:""};})})),
        groupLogic,limit:lim,orderBy,
        redacted,hadRel:relFilters.length>0,hadExpand:expands.some(ex=>ex.fields.length>0),
      };
    }
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
    setSaveName("");setSaveModal(true);
  };
  const doSaveQuery=(name)=>{
    if(!name||!ent) return;
    const q={name,entity:ent.l,entitySet:ent.p,fields:sf,filterGroups,groupLogic,expands:expands.map(ex=>({navProperty:ex.navProperty,targetEntity:ex.targetEntity,lookupField:ex.lookupField,fields:ex.fields,conditions:ex.conditions||[],conditionLogic:ex.conditionLogic||"and"})),relFilters:relFilters.map(rf=>({navProperty:rf.navProperty,targetEntity:rf.targetEntity,lookupField:rf.lookupField,type:rf.type,mode:rf.mode||"any",conditions:rf.conditions||[],conditionLogic:rf.conditionLogic||"and"})),limit:lim,orderBy,qm,fxml,rq,sqlQ,savedAt:new Date().toISOString()};
    const updated=[q,...savedQueries.filter(s=>s.name!==name)].slice(0,20);
    setSavedQueries(updated);
    if(typeof chrome!=="undefined"&&chrome.storage?.local) chrome.storage.local.set({d365_saved_queries:updated});
    setSaveModal(false);
  };

  const loadSavedQuery=(q)=>{
    const match=entities.find(e=>e.l===q.entity);
    if(match){
      // selEnt FIRST — it clears any pending onFieldsReady from a previous selection. The old
      // ordering (set callback, then selEnt) let "load query A, click entity B before A's fields
      // resolve" apply A's whole config — including rel filters — onto entity B.
      selEnt(match);
      onFieldsReady.current=()=>{
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
        // Relational filters need the target entity's field metadata back (types drive the
        // operator lists and OData quoting) — refetch it per saved filter, drop the ones whose
        // target no longer resolves. Guarded by selGen: switching entity while these getFields
        // are in flight must DISCARD the restore, not repaint the old query's filters.
        if(q.relFilters?.length){
          const g=selGen.current;
          Promise.all(q.relFilters.map(async rf=>{
            try{
              const tf=isLive?await bridge.getFields(rf.targetEntity):FLDS;
              return {...rf, mode:rf.mode||"any", conditionLogic:rf.conditionLogic||"and", allFields:mapTargetFields(tf)};
            }catch{return null;}
          })).then(list=>{if(selGen.current===g)setRelFilters(list.filter(Boolean));});
        }
      };
    } else {
      setError(`The saved query's table "${q.entity}" no longer exists on this org.`);
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
          l:e.logical, d:e.display, p:e.entitySet||e.logical+"s",
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
    if(isLive) onFieldsReady.current=apply; else apply(); // demo: selEnt sets fields synchronously, the callback never fires
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
    bridge.getChildRelationships(ent.l).then(childRels => {
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
    try {
      const targetFields = isLive ? await bridge.getFields(lookup.targetEntity) : FLDS;
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
    try {
      const targetFields = isLive ? await bridge.getFields(lookup.targetEntity) : FLDS;
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
  const buildUpdateMeta = () => {
    const fieldTypes = {}, lookupBinds = {};
    for (const f of fields) {
      fieldTypes[f.l] = f.t; if (f.odata) fieldTypes[f.odata] = f.t;
      if (f.t === "Lookup" || f.t === "Owner" || f.t === "Customer") {
        let navs = lookups.filter(lk => lk.type !== "collection" && lk.lookupField === f.l)
          .map(n => ({ nav: n.navProperty, target: n.targetEntity, set: entities.find(e2 => e2.l === n.targetEntity)?.p || null }));
        if (!navs.length && f.target) { // demo fields carry a plain target instead of relationship rows
          const base = f.l.replace(/^_/, "").replace(/_value$/, "");
          navs = [{ nav: base, target: f.target, set: entities.find(e2 => e2.l === f.target)?.p || f.target + "s" }];
        }
        if (navs.length) { lookupBinds[f.l] = navs; if (f.odata) lookupBinds[f.odata] = navs; }
      }
    }
    return { fieldTypes, lookupBinds };
  };

  const buildFilter = (fieldName, op, val, fl=fields) => {
    if (!fieldName) return "";
    if (op === "is_null") return `${getOdataName(fieldName, fl)} eq null`;
    if (op === "is_not_null") return `${getOdataName(fieldName, fl)} ne null`;
    if (!val) return "";
    const odataField = getOdataName(fieldName, fl);
    const fType = getFieldType(fieldName, fl);
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

    // Lookup / Customer / Owner (polymorphic principal) and the Uniqueidentifier primary key are all
    // compared by GUID — unquoted in OData. Owner/Uniqueidentifier were missing → "incompatible types"
    // 400 (e.g. ownerid eq 'guid'). getOdataName already maps these to the _value column.
    if (fType === "Lookup" || fType === "Customer" || fType === "Owner" || fType === "Uniqueidentifier") {
      // Security: validate GUID format to prevent OData injection
      if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val.trim())) return `${odataField} ${op} ${val.trim()}`;
      return `${odataField} ${op} '${escaped}'`; // fallback
    }

    return `${odataField} ${op} '${escaped}'`;
  };

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

  const run=async()=>{
    setError("");
    fetchAbort.current = false;
    const runGen=selGen.current; // capture to detect entity change mid-run
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
      setRes({entity:ent,fields:sf.length?sf:FLDS.map(f=>f.l),data:ROWS,count:ROWS.length,total:ROWS.length,query:q,elapsed:"mock",nextLink:null,fetching:false,...buildUpdateMeta()});
      addToHistory(ent,q,qm,(sf.length?sf:FLDS.map(f=>f.l)).length); // demo parity: history (and its builder-restore) works in demo too
      return;
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
        let allRecords=applyHaving([...data.records]);

        // Resolve the entity from the FetchXML/SQL <entity name="…">, not the stale Builder selection,
        // so the export filename matches the queried table.
        const fxEntName=(activeFxml.match(/<entity\s+name\s*=\s*"([^"]*)"/i)||[])[1]||"";
        const fxEnt=(fxEntName&&entities.find(e=>e.l===fxEntName))||(fxEntName?{l:fxEntName,p:fxEntName+"s"}:ent);
        setRes({entity:fxEnt,fields:headerFields,odataFieldMap,data:allRecords,count:allRecords.length,total:allRecords.length,query:q,elapsed:`${t1}s`,nextLink:null,fetching:!!data.moreRecords});
        setLoading(false);

        let page=1;
        // Page by page NUMBER only. We deliberately never echo the paging cookie back into the
        // fetchXml: re-encoding the Web API cookie is brittle and triggers the documented 400
        // "Paging Cookie And Query Do Not Match. The counts are not equal." Paging by number is
        // the reliable approach — the cookie's PRESENCE in each response still tells us when to
        // stop (Dataverse returns it only while more records remain).
        let hasMore=!!data.pagingCookie;
        while(hasMore&&!fetchAbort.current){
          page++;
          const pagedXml=activeFxml.replace(/<fetch/,`<fetch page="${page}"`);
          try{
            const pageData=await bridge.executeFetchXml(pagedXml);
            if(!pageData?.records?.length)break;
            allRecords=[...allRecords,...applyHaving(pageData.records)];
            hasMore=!!pageData.pagingCookie;
            // Throttle the data re-render (every 5 pages) so the Results memos don't recompute over the
            // whole accumulating set on every page; count/progress still update each page.
            const paint=!hasMore||page%5===0;
            setRes(prev=>({...prev,...(paint?{data:allRecords}:{}),count:allRecords.length,total:allRecords.length,fetching:hasMore,elapsed:`${((Date.now()-t0)/1000).toFixed(1)}s`}));
          }catch(e){
            setError(`Page ${page}: ${e.message}`);break;
          }
        }
        setRes(prev=>({...prev,data:allRecords,fetching:false,elapsed:`${((Date.now()-t0)/1000).toFixed(1)}s`}));
      }catch(e){
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
            // Rebuild clean flat XML
            const filterMatch=flatXml.match(/<filter>[\s\S]*?<\/filter>/i);
            const filterBlock=filterMatch?filterMatch[0]:"";
            const orderField=groupByFields.length?groupByFields[0].name:neededFields[0];
            const cleanFlatXml=`<fetch><entity name="${entName}">${neededFields.map(f=>`<attribute name="${f}"/>`).join("")}${filterBlock}<order attribute="${orderField}"/></entity></fetch>`;
            // Entity from the parsed FetchXML, not the stale Builder selection (so exports are named right).
            const aggEnt=(entName&&entities.find(e=>e.l===entName))||(entName?{l:entName,p:entName+"s"}:ent);

            setRes({entity:aggEnt,fields:[],data:[],count:0,total:0,query:q,elapsed:"loading...",fetching:true});
            setLoading(false);

            // Use count="5000" in fetch for smaller pages = faster transfer
            const pagedFlatXml=cleanFlatXml.replace("<fetch",`<fetch count="5000"`);

            // Paginate all records
            let allRaw=[];
            let pg=1;
            let more=true;
            const t0b=Date.now();
            while(more&&!fetchAbort.current){
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
      if(/\$filter=\.\.\.(&|$)/.test(rq)){setError('This query came from the history, where filter VALUES are never stored (privacy). Replace "$filter=..." with your condition — or delete that clause to run unfiltered. Use Saved Queries (💾) to keep complete filters.');return;}
      setLoading(true);
      const t0=Date.now();
      try{
        // Send the raw OData path directly — no parsing/reconstruction needed
        const raw=rq.trim().replace(/^GET\s+\/api\/data\/v\d+\.\d+\//i,"").replace(/[\r\n]+/g,"");
        const qIdx=raw.indexOf("?");
        const entitySet=qIdx>-1?raw.substring(0,qIdx):raw;
        const data=await bridge.queryRaw(raw);
        if(!data?.records){setError("No results");setLoading(false);return;}
        const t1=((Date.now()-t0)/1000).toFixed(1);
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
        setRes({entity:odataEnt,fields:headerFields,odataFieldMap,data:allRecords,count:allRecords.length,total:allRecords.length,query:q,elapsed:`${t1}s`,nextLink,fetching:!!nextLink,
          ...(odataEnt?.l===ent?.l?buildUpdateMeta():{})}); // raw query may hit ANOTHER table — the loaded metadata would then describe the wrong fields
        addToHistory(odataEnt,q,qm,headerFields.length);
        setLoading(false);
        // Paginate
        let pageNum=1;
        while(nextLink&&!fetchAbort.current){
          pageNum++;
          try{
            const pageData=await bridge.query(nextLink,{});
            if(!pageData?.records?.length)break;
            const pageClean=cleanAndFlatten(pageData.records);
            allRecords=[...allRecords,...pageClean];
            // Discover new columns from this page (expand data may appear in later pages)
            let newCols=false;
            for(const row of pageClean)for(const k of Object.keys(row)){if(!colSet.has(k)){colSet.add(k);newCols=true;}}
            if(newCols){const updatedFields=[...colSet].filter(k=>!k.startsWith("@")&&!k.includes("@")&&!k.endsWith("__display")&&!k.endsWith("__entity"));headerFields.length=0;headerFields.push(...updatedFields);updatedFields.forEach(f=>{odataFieldMap[f]=f;});}
            nextLink=pageData.nextLink||null;
            const paint=!nextLink||pageNum%5===0||newCols; // throttle data re-render; force a paint when columns change
            setRes(prev=>({...prev,fields:headerFields,odataFieldMap,...(paint?{data:allRecords}:{}),count:allRecords.length,total:allRecords.length,nextLink,fetching:!!nextLink,elapsed:`${((Date.now()-t0)/1000).toFixed(1)}s`}));
          }catch(pageErr){
            setError(`Page ${pageNum}: ${pageErr.message}`);break;
          }
        }
        setRes(prev=>({...prev,data:allRecords,fetching:false,nextLink:null,elapsed:`${((Date.now()-t0)/1000).toFixed(1)}s`}));
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
      if(!data?.records) return;
      const t1 = ((Date.now()-t0)/1000).toFixed(1);

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
      while (nextLink && !fetchAbort.current) {
        pageNum++;
        try {
          const pageData = await bridge.query(nextLink, {});
          if (!pageData?.records?.length) break;
          const pageClean = pageData.records.map(cleanRecord);
          allRecords = [...allRecords, ...pageClean];
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
          setRes(prev => ({...prev, fields: headerFields, odataFieldMap, ...(paint?{data:allRecords}:{}), count: allRecords.length, total: allRecords.length, nextLink, fetching: !!nextLink, elapsed:`${((Date.now()-t0)/1000).toFixed(1)}s`}));
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
      setRes(prev => ({...prev, data: allRecords, fetching: false, nextLink: null, elapsed:`${((Date.now()-t0)/1000).toFixed(1)}s`}));
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
                <button onClick={run} disabled={loading||loadingFields} style={bt(`linear-gradient(135deg,${C.vi},${C.vil})`)}>{loading?<><Spin s={12}/> Querying...</>:loadingFields?<><Spin s={12}/> Fields...</>:<><I.Play/> Execute <span style={{fontSize:11,opacity:.7}}>Ctrl+⏎</span></>}</button>
                <button onClick={saveCurrentQuery} disabled={!ent} title="Save this query" style={{padding:"4px 8px",background:"transparent",border:`1px solid ${C.yw}44`,borderRadius:4,color:C.yw,cursor:ent?"pointer":"default",fontSize:12}}>⭐</button>
                <div style={{position:"relative"}}>
                  <button onClick={()=>{setShowTemplates(!showTemplates);setShowHistory(false);setShowSaved(false);}} style={{padding:"4px 8px",background:showTemplates?C.gn+"33":"transparent",border:`1px solid ${showTemplates?C.gn+"44":C.bd}`,borderRadius:4,color:showTemplates?C.gn:C.txm,cursor:"pointer",fontSize:12}} title="Query templates">📝 Templates</button>
                  {showTemplates&&<QueryTemplates entities={entities} onSelect={(ent,fields,filters)=>{selEnt(ent);onFieldsReady.current=()=>{setSf(fields);setFilterGroups(filters);};}} onClose={()=>setShowTemplates(false)}/>}
                </div>
                <div style={{position:"relative"}}>
                  <button onClick={()=>{setShowHistory(!showHistory);setShowSaved(false);}} style={{padding:"4px 8px",background:showHistory?C.vi+"33":"transparent",border:`1px solid ${C.bd}`,borderRadius:4,color:C.txm,cursor:"pointer",fontSize:12}} title="Query history">🕐{queryHistory.length>0?` ${queryHistory.length}`:""}</button>
                  {showHistory&&queryHistory.length>0&&(
                    <div style={{position:"absolute",top:"100%",right:0,zIndex:20,background:C.sf,border:`1px solid ${C.bd}`,borderRadius:6,marginTop:4,minWidth:260,maxHeight:250,overflow:"auto",boxShadow:"0 8px 24px rgba(0,0,0,.4)"}}>
                      <div style={{padding:"6px 10px",borderBottom:`1px solid ${C.bd}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}><span style={{fontSize:11,fontWeight:600,color:C.txm}}>Recent queries</span><button onClick={()=>{setQueryHistory([]);if(typeof chrome!=="undefined"&&chrome.storage?.local)chrome.storage.local.remove("d365_query_history");}} style={{fontSize:10,color:C.txd,background:"none",border:"none",cursor:"pointer"}}>Clear</button></div>
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
                              const notes=[];
                              if(b.redacted) notes.push(`refill the ${b.redacted} condition value${b.redacted>1?"s":""} — values are never stored in the history (privacy)`);
                              if(b.hadRel||b.hadExpand) notes.push(`the query's ${[b.hadRel?"REL":null,b.hadExpand?"EXPAND":null].filter(Boolean).join(" and ")} clause${b.hadRel&&b.hadExpand?"s are":" is"} not kept in history`);
                              if(notes.length) setError(`ℹ Restored into the Builder: ${notes.join("; ")}. Use Saved Queries (💾) to keep everything.`);
                              return;
                            }
                            if(h.mode==="fetchxml"){setQm("fetchxml");setFxml(h.query||"");}
                            else if(h.mode==="sql"){setQm("sql");setSqlQ(h.query||"");}
                            else {setQm("odata");setRq(h.query||"");}
                            // Say it up front, not via a cryptic 400 later: the "..." isn't
                            // truncation, it's the privacy redaction of filter values.
                            if(/\$filter=\.\.\./.test(h.query||"")) setError('ℹ Restored from history: filter VALUES are never stored there (privacy) — "$filter=..." is a placeholder, not truncation. Replace "..." with your condition, or delete the clause to run unfiltered. Use Saved Queries (💾) to keep complete filters.');
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
                        <input ref={qImportRef} type="file" accept=".json" style={{display:"none"}} onChange={e=>{const f=e.target.files?.[0];if(!f)return;const r=new FileReader();r.onload=ev=>{try{const d=JSON.parse(ev.target.result);const qs=d.colvioQueries===1?d.queries:null;if(!Array.isArray(qs))throw 0;const merged=[...qs.filter(q=>q&&q.name),...savedQueries.filter(s2=>!qs.some(q=>q.name===s2.name))].slice(0,20);setSavedQueries(merged);if(typeof chrome!=="undefined"&&chrome.storage?.local)chrome.storage.local.set({d365_saved_queries:merged});}catch{alert(t("explorer.import_queries_bad"));}};r.readAsText(f);e.target.value="";}}/>
                      </div>
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
          <div>{res?<Results res={res} bp={bp} orgInfo={orgInfo} onStop={stopFetch} onDeleteDone={(ids)=>setRes(prev=>({...prev,data:prev.data.filter(r=>!ids.has(recordId(r,prev.entity?.l)))}))} onUpdateRecord={(updated,old)=>setRes(prev=>({...prev,data:prev.data.map(r=>r===old?updated:r)}))} />:<div style={{display:"flex",alignItems:"center",justifyContent:"center",height:200,color:C.txd,fontSize:14}}>{t("explorer.ctrl_enter")}</div>}</div>
        </>:null}
      </div>
      {saveModal&&<div style={{position:"fixed",top:0,left:0,right:0,bottom:0,background:"rgba(0,0,0,.5)",zIndex:100,display:"flex",alignItems:"center",justifyContent:"center"}} onClick={()=>setSaveModal(false)}>
        <div style={{background:C.sf,border:`1px solid ${C.bd}`,borderRadius:10,padding:20,minWidth:300,boxShadow:"0 8px 32px rgba(0,0,0,.5)"}} onClick={e=>e.stopPropagation()}>
          <div style={{fontSize:15,fontWeight:700,marginBottom:12,color:C.tx}}>{t("explorer.query_name")}</div>
          <input value={saveName} onChange={e=>setSaveName(e.target.value)} placeholder={t("explorer.query_name_placeholder")} autoFocus style={inp({fontSize:13,marginBottom:12,width:"100%",boxSizing:"border-box"})} onKeyDown={e=>{if(e.key==="Enter"&&saveName.trim())doSaveQuery(saveName.trim());if(e.key==="Escape")setSaveModal(false);}}/>
          <div style={{display:"flex",gap:6,justifyContent:"flex-end"}}>
            <button onClick={()=>setSaveModal(false)} style={bt(null,{fontSize:12})}>{t("common.cancel")}</button>
            <button onClick={()=>doSaveQuery(saveName.trim())} disabled={!saveName.trim()} style={bt(saveName.trim()?C.vi:C.sfh,{fontSize:12,opacity:saveName.trim()?1:.5})}>{t("common.save")}</button>
          </div>
        </div>
      </div>}
    </div>
  );
}
