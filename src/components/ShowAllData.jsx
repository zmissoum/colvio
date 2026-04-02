import { useState, useEffect, useMemo } from "react";
import { bridge } from "../d365-bridge.js";
import { C, I, Spin, FLDS, ROWS, mono, displayType, inp, bt, crd, copyText, isTrulyCustom } from "../shared.jsx";

export default function ShowAllData({bp,orgInfo}){
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
    try {
      const url=new URL(trimmed);
      const params=new URLSearchParams(url.search);
      if(params.get("etn")&&params.get("id")) return {entity:params.get("etn"),id:params.get("id").replace(/[{}]/g,"")};
      const hashMatch=url.hash.match(/\/(\w+)\/([0-9a-f-]{36})/i);
      if(hashMatch) return {entity:hashMatch[1],id:hashMatch[2]};
    }catch{}
    const slashMatch=trimmed.match(/^(\w+)\/([0-9a-f-]{36})$/i);
    if(slashMatch) return {entity:slashMatch[1],id:slashMatch[2]};
    return null;
  };

  const loadRecordDirect=async(entity, id)=>{
    setError("");setLoading(true);
    try{
      const [fieldsMeta, entitySet] = await Promise.all([
        bridge.getFields(entity),
        bridge.getEntitySet(entity),
      ]);
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
          target: lookupTarget || ((f.type==="Lookup"||f.type==="Customer") ? f.logical.replace(/^_/,"").replace(/_value$/,"") : undefined),
          display: displayVal || null,
          value: displayVal || (rawVal!==undefined ? rawVal : null),
          rawValue: rawVal!==undefined ? rawVal : null,
        };
      }).sort((a,b)=>a.l.localeCompare(b.l));
      const name=rec.name||rec.fullname||rec.subject||rec.title||id;
      setRecord({entity,entityDisplay:entity,id,name,fields:allFields,loadedAt:new Date().toLocaleTimeString()});
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
    <div style={{padding:bp.mobile?12:20,maxWidth:900,margin:"0 auto"}}>
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

      {error&&<div style={{padding:"8px 12px",background:"#991B1B33",borderRadius:8,color:C.rd,fontSize:13,marginBottom:12,display:"flex",alignItems:"center",gap:6}}>⚠ {error}</div>}

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
            <div style={{display:"flex",flexDirection:"column"}}>
              {filteredFields.map((f,i)=>{
                const empty=f.value===null||f.value===undefined||f.value==="";
                const isLookup=f.t==="Lookup";
                const isPicklist=f.t==="Picklist"||f.t==="State"||f.t==="Status";
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
                  <div key={f.l} style={{display:"flex",alignItems:"flex-start",gap:8,padding:"7px 12px",borderBottom:`1px solid ${C.bd}`,cursor:"pointer"}}
                    onMouseEnter={e=>e.currentTarget.style.background=C.sfh}
                    onMouseLeave={e=>e.currentTarget.style.background="transparent"}
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
                      {isLookup&&!empty?(
                        <span style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
                          <span style={{color:C.vil}}>{f.display||f.rawValue}</span>
                          {f.rawValue&&<span style={{fontSize:11,color:C.txd}}>{String(f.rawValue).substring(0,13)}…</span>}
                          {d365Link&&<a href={d365Link} target="_blank" rel="noopener" onClick={e=>e.stopPropagation()} style={{fontSize:11,padding:"2px 8px",borderRadius:3,background:C.vi+"22",color:C.vi,textDecoration:"none",border:`1px solid ${C.vi}44`}}>Open in D365 ↗</a>}
                        </span>
                      ):fmtVal}
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
