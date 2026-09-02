import { useState, useEffect, useMemo } from "react";
import { bridge } from "../d365-bridge.js";
import AuditHistory from "./AuditHistory.jsx";
import BpfManager from "./BpfManager.jsx";
import { C, I, Spin, FLDS, ROWS, mono, displayType, inp, bt, crd, copyText, isTrulyCustom, confirmProd } from "../shared.jsx";
import { coerceScalarForEdit, prepareUpdate } from "../updateUtils.js";

export default function ShowAllData({bp,orgInfo,theme,orgFeatures,permissions}){
  const isLive = orgInfo?.isExtension;
  const[recordUrl,setRecordUrl]=useState("");
  const[record,setRecord]=useState(null);
  const[fieldSearch,setFieldSearch]=useState("");
  const[showEmpty,setShowEmpty]=useState(false);
  const[showCustomOnly,setShowCustomOnly]=useState(false);
  const[copied,setCopied]=useState("");
  const[loading,setLoading]=useState(false);
  const[error,setError]=useState("");
  const[autoDetected,setAutoDetected]=useState(null);
  // Inline field editing — write a value straight via the Web API, even for fields the form marks
  // read-only (the server still enforces field-level security + the write privilege).
  const[editing,setEditing]=useState(null);   // { l, t, value, target? } of the field being edited
  const[lookupNavs,setLookupNavs]=useState([]); // ManyToOne relationships of the loaded record's table — fuels lookup editing
  const[savingField,setSavingField]=useState(false);
  const[editMsg,setEditMsg]=useState("");
  const[optionsCache,setOptionsCache]=useState({}); // { fieldLogical: [{value,label}] }

  useEffect(()=>{
    if(!isLive) return;
    bridge.getCurrentRecord().then(rec=>{
      if(rec && rec.entityType && rec.recordId){
        setAutoDetected(rec);
      }
    }).catch(()=>{});
  },[isLive]);

  const loadDetected=()=>{
    if(!autoDetected) return;
    setRecordUrl(`${autoDetected.entityType}/${autoDetected.recordId}`);
    loadRecordDirect(autoDetected.entityType, autoDetected.recordId);
  };

  const parseInput=(input)=>{
    const trimmed=input.trim();
    const guidMatch=trimmed.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    if(guidMatch) return {id:guidMatch[0],entity:null};
    const GUID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    try {
      const url=new URL(trimmed);
      const params=new URLSearchParams(url.search);
      if(params.get("etn")&&params.get("id")){
        // Validate the id is a real GUID — like the bare-GUID and slash branches do — so a
        // garbled URL fails fast with a clear message instead of interpolating junk into the OData path.
        const id=params.get("id").replace(/[{}]/g,"");
        if(GUID_RE.test(id)) return {entity:params.get("etn"),id};
      }
      const hashMatch=url.hash.match(/\/(\w+)\/([0-9a-f-]{36})/i);
      if(hashMatch) return {entity:hashMatch[1],id:hashMatch[2]};
    }catch{}
    const slashMatch=trimmed.match(/^(\w+)\/([0-9a-f-]{36})$/i);
    if(slashMatch) return {entity:slashMatch[1],id:slashMatch[2]};
    return null;
  };

  const loadRecordDirect=async(entity, id)=>{
    // A pending edit belongs to the PREVIOUS record — leaving it open would save the old
    // record's text into the new one (audit finding). Options cache cleared too: it's keyed
    // by field name, and "statuscode" on account is not "statuscode" on contact.
    setEditing(null);setEditMsg("");setOptionsCache({});
    setError("");setLoading(true);
    try{
      const [fieldsMeta, entitySet, navMeta] = await Promise.all([
        bridge.getFields(entity),
        bridge.getEntitySet(entity),
        bridge.getLookups(entity).catch(() => []), // relationship metadata → lookup editing (nav property + target); [] = lookups stay read-only
      ]);
      setLookupNavs(navMeta || []);
      const data=await bridge.query(`${entitySet}(${id})`,{});
      const rec = data?.records?.[0] || data;
      if(!rec || rec.error) throw new Error("Record not found");
      const allFields=(fieldsMeta||[]).map(f=>{
        const odataKey = f.odataName || f.logical;
        const rawVal = rec[odataKey];
        const dispKey = odataKey + "@OData.Community.Display.V1.FormattedValue";
        const displayVal = rec[dispKey];
        const lookupEntityKey = odataKey + "@Microsoft.Dynamics.CRM.lookuplogicalname";
        const lookupTarget = rec[lookupEntityKey] || null;
        return {
          l:f.logical, d:f.display||f.logical, t:f.type||"String",
          req:!!f.required, cust:!!f.isCustom,
          vfu:f.validForUpdate!==false, // writable via the Web API (may still be read-only on the form)
          target: lookupTarget || ((f.type==="Lookup"||f.type==="Customer") ? f.logical.replace(/^_/,"").replace(/_value$/,"") : undefined),
          display: displayVal || null,
          value: displayVal || (rawVal!==undefined ? rawVal : null),
          rawValue: rawVal!==undefined ? rawVal : null,
        };
      }).sort((a,b)=>a.l.localeCompare(b.l));
      const name=rec.name||rec.fullname||rec.subject||rec.title||id;
      setRecord({entity,entitySet,entityDisplay:entity,id,name,fields:allFields,loadedAt:new Date().toLocaleTimeString()});
    }catch(e){
      if(e.message?.includes("401")||e.message?.includes("SESSION_EXPIRED")){
        setError("Session expired — refresh D365 (F5) then click ⚡ again");
      } else { setError(e.message); }
    }
    finally{setLoading(false);}
  };

  const loadRecord=async()=>{
    if(isLive){
      const parsed=parseInput(recordUrl);
      if(!parsed||!parsed.id){setError("Unrecognized format. Enter a D365 URL or GUID.");return;}
      if(!parsed.entity){setError("Cannot detect entity. Use format: account/GUID or full D365 URL.");return;}
      await loadRecordDirect(parsed.entity, parsed.id);
    } else {
      const allFields=FLDS.map(f=>{const val=ROWS[0][f.l];return{...f,value:val!==undefined?val:null};});
      setRecord({entity:"account",entityDisplay:"Account",id:ROWS[0].accountid,name:ROWS[0].name,fields:allFields,loadedAt:new Date().toLocaleTimeString()});
    }
  };

  const cp=(text,key)=>{copyText(text);setCopied(key);setTimeout(()=>setCopied(""),1200);};

  // ── Inline field editing ─────────────────────────────────────
  // Types we can edit safely as a single value. Lookups (incl. Customer/Owner) edit via
  // nav@odata.bind: paste the target record's GUID, empty clears — same machinery as the
  // Explorer's typed edits (prepareUpdate). Only the PK stays read-only.
  const OPTIONSET_TYPES=new Set(["Picklist","State","Status"]);
  const NUMERIC_INT=new Set(["Integer","BigInt"]);
  const NUMERIC_FLOAT=new Set(["Decimal","Double","Money"]);
  const LOOKUP_TYPES=new Set(["Lookup","Customer","Owner"]);
  const EDITABLE_TYPES=new Set(["String","Memo","Boolean","DateTime",...NUMERIC_INT,...NUMERIC_FLOAT,...OPTIONSET_TYPES,...LOOKUP_TYPES]);
  const navsFor=(logical)=>lookupNavs.filter(n=>n.lookupField===logical); // a Customer/Owner field yields several navs (one per target)
  const isEditable=(f)=> isLive && f.vfu && EDITABLE_TYPES.has(f.t) && f.l!==`${record?.entity}id`
    && (!LOOKUP_TYPES.has(f.t) || navsFor(f.l).length>0); // no relationship metadata → lookup stays read-only

  // Shared typed coercion (updateUtils, tested). The old local version silently turned a
  // MISTYPED number into null — one typo would have CLEARED the field instead of refusing.

  const startEdit=(f)=>{
    setEditMsg("");
    const navs=LOOKUP_TYPES.has(f.t)?navsFor(f.l):[];
    // Lookup target preselect: single target → itself; polymorphic → the CURRENT value's target
    // when known (lookuplogicalname annotation), else the user picks.
    const target=navs.length===1?navs[0].targetEntity:(navs.some(n=>n.targetEntity===f.target)?f.target:"");
    setEditing({l:f.l,t:f.t,value:f.rawValue!=null?String(f.rawValue):"",target});
    // Lazy-load option-set values the first time an option-set field is edited.
    if(OPTIONSET_TYPES.has(f.t)&&!optionsCache[f.l]){
      bridge.getOptionSet(record.entity,f.l,f.t).then(opts=>setOptionsCache(c=>({...c,[f.l]:opts||[]}))).catch(()=>setOptionsCache(c=>({...c,[f.l]:[]})));
    }
  };

  const saveField=async(f)=>{
    if(!editing)return;
    // Lookup path: resolve the target's entity set, then reuse the SAME typed preparation as the
    // Explorer (GUID validated, empty = clear via {nav:null}, readable refusals — updateUtils).
    if(LOOKUP_TYPES.has(f.t)){
      const navs=navsFor(f.l);
      const b=navs.length===1?navs[0]:navs.find(n=>n.targetEntity===editing.target);
      if(!b){setEditMsg(`✗ ${f.l}: pick the target table first — this lookup can point to ${navs.map(n=>n.targetEntity).join(" or ")}`);return;}
      setSavingField(true);setEditMsg("");
      try{
        const set=await bridge.getEntitySet(b.targetEntity); // cached resolution (irregular plurals)
        const prep=prepareUpdate(
          {fieldTypes:{[f.l]:f.t},lookupBinds:{[f.l]:[{nav:b.navProperty,target:b.targetEntity,set}]},odataFieldMap:{}},
          f.l,String(editing.value??"").trim(),b.targetEntity);
        if(!prep.ok){setEditMsg(`✗ ${prep.reason}`);setSavingField(false);return;}
        if(!confirmProd(orgInfo?.isProduction,`Set "${f.l}" on this ${record.entity} record (direct API write — bypasses the form).`)){setSavingField(false);return;}
        await bridge.update(record.entitySet,record.id,prep.body);
        setEditing(null);
        await loadRecordDirect(record.entity,record.id); // reload to show the fresh formatted value
        setEditMsg(`✓ ${f.l} updated`);
      }catch(e){
        setEditMsg(`✗ ${f.l}: ${e.message||e}`);
      }
      setSavingField(false);
      return;
    }
    if(!confirmProd(orgInfo?.isProduction,`Set "${f.l}" on this ${record.entity} record (direct API write — bypasses the form).`))return;
    const s=String(editing.value??"").trim();
    let val=null; // empty = deliberate clear
    if(s!==""){
      const c=coerceScalarForEdit(s,f.t);
      if(!c.ok){setEditMsg(`✗ ${f.l}: ${c.reason}`);return;} // refused BEFORE sending — never a silent clear
      val=c.value;
    }
    setSavingField(true);setEditMsg("");
    try{
      await bridge.update(record.entitySet,record.id,{[f.l]:val});
      setEditing(null);
      await loadRecordDirect(record.entity,record.id); // reload to show the fresh formatted value
      setEditMsg(`✓ ${f.l} updated`);
    }catch(e){
      setEditMsg(`✗ ${f.l}: ${e.message||e}`);
    }
    setSavingField(false);
  };

  const filteredFields=useMemo(()=>{
    if(!record)return[];
    return record.fields.filter(f=>{
      if(fieldSearch&&!f.l.toLowerCase().includes(fieldSearch.toLowerCase())&&!f.d.toLowerCase().includes(fieldSearch.toLowerCase()))return false;
      if(!showEmpty&&(f.value===null||f.value===undefined||f.value===""))return false;
      if(showCustomOnly&&!(f.cust&&isTrulyCustom(f.l)))return false;
      return true;
    });
  },[record,fieldSearch,showEmpty,showCustomOnly]);

  return(
    <div style={{padding:bp.mobile?12:20,maxWidth:bp.mobile?"100%":1600,margin:"0 auto"}}>
      <h2 style={{fontSize:16,fontWeight:700,marginBottom:4,display:"flex",alignItems:"center",gap:8}}><I.Eye/> Show All Data</h2>
      <p style={{color:C.txm,fontSize:14,marginBottom:12}}>Paste a D365 record URL or enter entity/GUID.</p>

      {autoDetected&&!record&&(
        <div style={{display:"flex",alignItems:"center",gap:10,padding:"10px 14px",background:`linear-gradient(135deg,${C.vi}15,${C.cy}15)`,border:`1px solid ${C.vi}44`,borderRadius:8,marginBottom:12,cursor:"pointer"}} onClick={loadDetected}>
          <div style={{width:32,height:32,borderRadius:"50%",background:`linear-gradient(135deg,${C.vi},${C.cy})`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,flexShrink:0}}>⚡</div>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontSize:14,fontWeight:600,color:C.tx}}>Record detected from D365 tab</div>
            <div style={{fontSize:13,color:C.txd,...mono}}>{autoDetected.entityType} / {autoDetected.recordId.substring(0,20)}…</div>
          </div>
          <button style={{padding:"6px 14px",background:`linear-gradient(135deg,${C.vi},${C.cy})`,border:"none",borderRadius:6,color:"white",fontWeight:600,fontSize:13,cursor:"pointer",flexShrink:0}}>Inspect</button>
        </div>
      )}

      <div style={{display:"flex",gap:8,marginBottom:16,flexDirection:bp.mobile?"column":"row"}}>
        <input value={recordUrl} onChange={e=>setRecordUrl(e.target.value)} placeholder={isLive?"D365 URL or entity/GUID (e.g. account/a1b2c3d4-...)":"Anything (demo mode)"} style={inp({flex:1,...mono,fontSize:14})} onKeyDown={e=>{if(e.key==="Enter")loadRecord();}}/>
        <button onClick={loadRecord} disabled={loading} style={bt(`linear-gradient(135deg,${C.vi},${C.vil})`,{flexShrink:0})}>{loading?<><Spin s={12}/> Loading...</>:<><I.Eye/> Inspect</>}</button>
      </div>

      {error&&<div style={{padding:"8px 12px",background:C.rd+"22",borderRadius:8,color:C.rd,fontSize:13,marginBottom:12,display:"flex",alignItems:"center",gap:6}}>⚠ {error}</div>}

      {record&&(
        <div>
          <div style={{...crd({padding:14}),marginBottom:12,display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:8}}>
            <div>
              <div style={{display:"flex",alignItems:"center",gap:6}}>
                <span style={{fontSize:18}}>🏢</span>
                <span style={{fontWeight:700,fontSize:16}}>{record.name}</span>
                <span style={{fontSize:12,color:C.txd,background:C.bg,padding:"4px 10px",borderRadius:3,...mono}}>{record.entity}</span>
              </div>
              <div style={{fontSize:13,color:C.txd,...mono,marginTop:4,display:"flex",alignItems:"center",gap:6}}>
                <span>{record.id}</span>
                <button onClick={()=>cp(record.id,"id")} style={{background:"none",border:"none",color:copied==="id"?C.gn:C.txd,cursor:"pointer",padding:0}}>{copied==="id"?"✓":<I.Copy/>}</button>
              </div>
            </div>
            <div style={{display:"flex",gap:4}}>
              <button onClick={()=>{const json=JSON.stringify(Object.fromEntries(record.fields.map(f=>[f.l,f.value])),null,2);copyText(json);cp("","json");}} style={bt(null,{fontSize:12})}>{copied==="json"?"✓ Copied":"Copy JSON"}</button>
            </div>
          </div>

          {editMsg&&<div style={{...crd({padding:"8px 12px"}),marginBottom:12,fontSize:13,color:editMsg.startsWith("✓")?C.gn:C.rd}}>{editMsg}</div>}

          {/* key: a record switch REMOUNTS the panel — otherwise record B displays record A's
              cached audit timeline until manually closed/reopened (audit finding). */}
          {orgInfo?.isExtension&&<AuditHistory key={record.id} recordId={record.id} orgFeatures={orgFeatures}/>}

          {/* BPF manager — System-Administrator only (canBypassPlugins == the sysadmin role check).
              Lets an admin reopen/re-stage a record's BPF that the form UI locks once finished. */}
          {orgInfo?.isExtension&&permissions?.canBypassPlugins===true&&record.entity&&
            <BpfManager entity={record.entity} recordId={record.id} orgInfo={orgInfo}/>}

          <div style={{display:"flex",gap:8,marginBottom:10,alignItems:"center",flexWrap:"wrap"}}>
            <div style={{position:"relative",flex:1,maxWidth:300}}>
              <input value={fieldSearch} onChange={e=>setFieldSearch(e.target.value)} placeholder="Filter columns..." style={inp({paddingLeft:28,fontSize:13,padding:"5px 10px 5px 28px"})}/>
              <span style={{position:"absolute",left:8,top:"50%",transform:"translateY(-50%)",color:C.txd}}><I.Search s={14}/></span>
            </div>
            <label style={{fontSize:13,color:C.txm,cursor:"pointer",display:"flex",alignItems:"center",gap:4}}>
              <input type="checkbox" checked={showEmpty} onChange={e=>setShowEmpty(e.target.checked)} style={{accentColor:C.vi}}/> Empty columns
            </label>
            <label style={{fontSize:13,color:C.txm,cursor:"pointer",display:"flex",alignItems:"center",gap:4}}>
              <input type="checkbox" checked={showCustomOnly} onChange={e=>setShowCustomOnly(e.target.checked)} style={{accentColor:C.vi}}/> Custom only
            </label>
            <span style={{fontSize:12,color:C.txd}}>{filteredFields.length}/{record.fields.length} columns</span>
          </div>

          <div style={{...crd({overflow:"hidden"})}}>
            {/* Responsive field grid: 1 column on narrow screens, auto-fills 2+ on wider ones
                (each column ≥440px) so a 400-field record needs far less vertical scrolling.
                The 1px grid gap over a border-colored background draws clean separators. */}
            <div style={{display:"grid",gridTemplateColumns:bp.mobile?"1fr":"repeat(auto-fill,minmax(440px,1fr))",gap:1,background:C.bd}}>
              {filteredFields.map((f,i)=>{
                const empty=f.value===null||f.value===undefined||f.value==="";
                const isLookup=f.t==="Lookup";
                const isPicklist=f.t==="Picklist"||f.t==="State"||f.t==="Status";
                const editable=isEditable(f);
                const isEd=!!editing&&editing.l===f.l;
                const fmtVal=empty?"—"
                  :isLookup?null
                  :f.value==="Active"?"● Active"
                  :f.value==="Inactive"?"● Inactive"
                  :typeof f.value==="number"?(f.l.includes("revenue")?`$${f.value.toLocaleString()}`:f.value.toLocaleString())
                  :typeof f.value==="string"&&f.value.match(/^\d{4}-\d{2}-\d{2}T/)?new Date(f.value).toLocaleString("en-US")
                  :String(f.value);
                const valColor=empty?C.txd:isLookup?C.vil:f.value==="Active"?C.gn:f.value==="Inactive"?C.rd:C.tx;
                const d365Link=(isLookup&&!empty&&f.rawValue&&orgInfo?.orgUrl&&f.target)?`${orgInfo.orgUrl}/main.aspx?etn=${f.target}&id=${f.rawValue}&pagetype=entityrecord`:null;
                return(
                  <div key={f.l} style={{display:"flex",alignItems:"flex-start",gap:8,padding:"7px 12px",background:C.sf,cursor:"pointer"}}
                    onMouseEnter={e=>e.currentTarget.style.background=C.sfh}
                    onMouseLeave={e=>e.currentTarget.style.background=C.sf}
                    onClick={()=>cp(String(f.value||""),`val-${i}`)}>
                    <div style={{width:bp.mobile?140:220,flexShrink:0}}>
                      <div style={{display:"flex",alignItems:"center",gap:4}}>
                        {f.cust&&<span style={{width:6,height:6,borderRadius:"50%",background:C.or,display:"inline-block",flexShrink:0}} title="Custom"/>}
                        <span style={{color:C.cy,...mono,fontSize:13}} title={f.l}>{f.l}</span>
                      </div>
                      <div style={{fontSize:12,color:C.txm,marginTop:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}} title={f.d}>{f.d}</div>
                      <div style={{display:"flex",alignItems:"center",gap:4,marginTop:2}}>
                        <span style={{fontSize:11,padding:"2px 6px",borderRadius:3,background:isLookup?C.vid:isPicklist?C.gnd:C.sfh,color:isLookup?C.lv:isPicklist?C.gn:C.txm}}>{displayType(f.t)}</span>
                        {isLookup&&f.target&&<span style={{fontSize:10,color:C.txd}}>→{f.target}</span>}
                      </div>
                    </div>
                    <div style={{flex:1,minWidth:0,fontSize:14,color:valColor,wordBreak:"break-word",fontStyle:empty?"italic":"normal",...(isLookup||f.l.includes("id")?mono:{})}}>
                      {isEd?(
                        <span onClick={e=>e.stopPropagation()} style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
                          {f.t==="Boolean"?(
                            <select autoFocus value={editing.value} onChange={e=>setEditing({...editing,value:e.target.value})} style={inp({width:"auto",fontSize:13,padding:"4px 8px"})}>
                              <option value="">(empty)</option><option value="true">true</option><option value="false">false</option>
                            </select>
                          ):OPTIONSET_TYPES.has(f.t)?(
                            <select autoFocus value={editing.value} onChange={e=>setEditing({...editing,value:e.target.value})} style={inp({width:"auto",maxWidth:280,fontSize:13,padding:"4px 8px"})}>
                              <option value="">(empty)</option>
                              {(optionsCache[f.l]||[]).map(o=><option key={o.value} value={o.value}>{o.label} ({o.value})</option>)}
                            </select>
                          ):LOOKUP_TYPES.has(f.t)?(
                            <span style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
                              {navsFor(f.l).length>1&&(
                                <select value={editing.target||""} onChange={e=>setEditing({...editing,target:e.target.value})} title="This lookup is polymorphic — pick the table the GUID belongs to" style={inp({width:"auto",fontSize:12,padding:"4px 8px"})}>
                                  <option value="">— target table —</option>
                                  {navsFor(f.l).map(n=><option key={n.navProperty} value={n.targetEntity}>{n.targetEntity}</option>)}
                                </select>
                              )}
                              <input autoFocus value={editing.value} onChange={e=>setEditing({...editing,value:e.target.value})}
                                onKeyDown={e=>{if(e.key==="Enter")saveField(f);if(e.key==="Escape")setEditing(null);}}
                                placeholder="GUID of the target record — empty clears the lookup"
                                style={inp({...mono,fontSize:12,padding:"4px 8px",width:300})}/>
                            </span>
                          ):(
                            <input autoFocus value={editing.value} onChange={e=>setEditing({...editing,value:e.target.value})}
                              onKeyDown={e=>{if(e.key==="Enter")saveField(f);if(e.key==="Escape")setEditing(null);}}
                              placeholder={f.t==="DateTime"?"YYYY-MM-DDTHH:mm:ssZ":undefined}
                              style={inp({...mono,fontSize:13,padding:"4px 8px",maxWidth:340})}/>
                          )}
                          <button onClick={()=>saveField(f)} disabled={savingField} style={bt(C.gn,{fontSize:12,padding:"4px 10px"})}>{savingField?<Spin s={11}/>:"Save"}</button>
                          <button onClick={()=>setEditing(null)} disabled={savingField} style={bt(null,{fontSize:12,padding:"4px 10px"})}>Cancel</button>
                        </span>
                      ):isLookup&&!empty?(
                        <span style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
                          <span style={{color:C.vil}}>{f.display||f.rawValue}</span>
                          {f.rawValue&&<span style={{fontSize:11,color:C.txd}}>{String(f.rawValue).substring(0,13)}…</span>}
                          {d365Link&&<a href={d365Link} target="_blank" rel="noopener" onClick={e=>e.stopPropagation()} style={{fontSize:11,padding:"2px 8px",borderRadius:3,background:C.vi+"22",color:C.vi,textDecoration:"none",border:`1px solid ${C.vi}44`}}>Open in D365 ↗</a>}
                          {editable&&<button onClick={e=>{e.stopPropagation();startEdit(f);}} title="Relink this lookup — paste the target record's GUID (direct API write, empty clears)" style={{background:"none",border:"none",color:C.txd,cursor:"pointer",padding:0,fontSize:13,flexShrink:0,lineHeight:1}}>✎</button>}
                        </span>
                      ):(
                        <span style={{display:"flex",alignItems:"center",gap:6}}>
                          <span>{fmtVal}</span>
                          {editable&&<button onClick={e=>{e.stopPropagation();startEdit(f);}} title="Edit this field (direct API write — bypasses the form)" style={{background:"none",border:"none",color:C.txd,cursor:"pointer",padding:0,fontSize:13,flexShrink:0,lineHeight:1}}>✎</button>}
                        </span>
                      )}
                      {copied===`val-${i}`&&<span style={{color:C.gn,fontSize:11,marginLeft:6}}>✓ copied</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
