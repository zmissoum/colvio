import { useState, useEffect, useRef } from "react";
import { bridge } from "../d365-bridge.js";
import { C, I, Spin, ENTS, mono, displayType, inp, bt, crd, ths, tds, dl } from "../shared.jsx";

export default function TranslationManager({bp,orgInfo}){
  const isLive=orgInfo?.isExtension;
  const[entities,setEntities]=useState(ENTS);
  const[search,setSearch]=useState("");
  const[selEnt,setSelEnt]=useState(null);
  const[languages,setLanguages]=useState([]);
  const[selLangs,setSelLangs]=useState([]);
  const[attributes,setAttributes]=useState([]);
  const[edits,setEdits]=useState({});
  const[loading,setLoading]=useState(false);
  const[saving,setSaving]=useState(false);
  const[saveMsg,setSaveMsg]=useState(null);
  const[attrSearch,setAttrSearch]=useState("");
  const fRef=useRef(null);

  useEffect(()=>{
    bridge.getOrgLanguages().then(d=>{if(d){setLanguages(d);setSelLangs(d.map(l=>l.code));}}).catch(()=>{});
    if(isLive)bridge.getEntities().then(d=>{if(d)setEntities(d.map(e=>({l:e.logical||e.l,d:e.display||e.d})))}).catch(()=>{});
  },[]);

  const handleSelect=async(e)=>{
    if(editCount>0&&!window.confirm(`You have ${editCount} unsaved edit(s). Switch entity and discard changes?`))return;
    setSelEnt(e);setLoading(true);setEdits({});setSaveMsg(null);
    try{const d=await bridge.getAttributeLabels(e.l);setAttributes(d||[]);}catch{setAttributes([]);}
    setLoading(false);
  };

  const handleEdit=(attrLogical,langCode,value)=>{
    setEdits(prev=>({...prev,[attrLogical]:{...(prev[attrLogical]||{}),[langCode]:value}}));
  };

  const editCount=Object.keys(edits).reduce((n,k)=>n+Object.keys(edits[k]).length,0);

  const handleSave=async()=>{
    if(!selEnt||editCount===0)return;
    setSaving(true);setSaveMsg(null);
    let ok=0,fail=0;
    for(const[attrName,langEdits] of Object.entries(edits)){
      const attr=attributes.find(a=>a.logical===attrName);
      if(!attr)continue;
      const labelsMap={};
      attr.labels.forEach(l=>{labelsMap[l.languageCode]={Label:l.label,LanguageCode:l.languageCode};});
      Object.entries(langEdits).forEach(([code,val])=>{labelsMap[+code]={Label:val,LanguageCode:+code};});
      try{await bridge.updateAttributeLabel(selEnt.l,attrName,Object.values(labelsMap));ok++;}catch(err){fail++;setSaveMsg(`Error: ${err.message}`);}
    }
    if(ok>0){try{await bridge.publishEntity(selEnt.l);}catch{}}
    setSaveMsg(`${ok} updated${fail?`, ${fail} failed`:""}`);
    setEdits({});
    try{const d=await bridge.getAttributeLabels(selEnt.l);setAttributes(d||[]);}catch{}
    setSaving(false);
  };

  const exportCSV=()=>{
    if(!selEnt||!attributes.length)return;
    const codes=selLangs;
    const header=["logical_name","type",...codes.map(c=>`label_${c}`)].join(",");
    const rows=attributes.map(a=>{
      const vals=[a.logical,a.type];
      codes.forEach(c=>{const lbl=a.labels.find(l=>l.languageCode===c)?.label||"";vals.push(`"${lbl.replace(/"/g,'""')}"`)});
      return vals.join(",");
    });
    dl("\uFEFF"+header+"\n"+rows.join("\n"),"text/csv;charset=utf-8",`${selEnt.l}_translations.csv`);
  };

  const handleImport=(text)=>{
    const lines=text.split("\n").filter(l=>l.trim());
    if(lines.length<2)return;
    const headers=lines[0].split(",").map(h=>h.trim().replace(/^"|"$/g,""));
    const langCols=headers.map((h,i)=>{const m=h.match(/^label_(\d+)$/);return m?{idx:i,code:+m[1]}:null;}).filter(Boolean);
    const logIdx=headers.indexOf("logical_name");
    if(logIdx===-1)return;
    const newEdits={};
    for(let i=1;i<lines.length;i++){
      const cells=lines[i].match(/(".*?"|[^,]*)/g)?.map(c=>c.replace(/^"|"$/g,"").replace(/""/g,'"'))||[];
      const logical=cells[logIdx]?.trim();
      if(!logical)continue;
      const attr=attributes.find(a=>a.logical===logical);
      if(!attr)continue;
      langCols.forEach(({idx,code})=>{
        const val=cells[idx]?.trim()||"";
        const existing=attr.labels.find(l=>l.languageCode===code)?.label||"";
        if(val&&val!==existing){if(!newEdits[logical])newEdits[logical]={};newEdits[logical][code]=val;}
      });
    }
    setEdits(newEdits);
    setSaveMsg(`Imported ${Object.keys(newEdits).length} changes from CSV`);
  };

  const filteredAttrs=attributes.filter(a=>!attrSearch||a.logical.includes(attrSearch.toLowerCase())||a.labels.some(l=>l.label.toLowerCase().includes(attrSearch.toLowerCase())));

  const filtered=entities.filter(e=>!search||e.l.includes(search.toLowerCase())||e.d?.toLowerCase().includes(search.toLowerCase()));

  return(
    <div style={{display:"flex",height:"100%"}}>
      <div style={{width:bp.mobile?"100%":260,borderRight:`1px solid ${C.bd}`,display:"flex",flexDirection:"column",flexShrink:0}}>
        <div style={{padding:8}}><input placeholder="Search entity..." value={search} onChange={e=>setSearch(e.target.value)} style={inp({fontSize:13})}/></div>
        <div style={{flex:1,overflow:"auto",padding:"0 6px"}}>
          {filtered.map(e=>(
            <button key={e.l} onClick={()=>handleSelect(e)} style={{width:"100%",textAlign:"left",padding:"6px 8px",border:"none",borderRadius:5,cursor:"pointer",marginBottom:1,background:selEnt?.l===e.l?C.sfa:"transparent",color:selEnt?.l===e.l?C.tx:C.txm,fontSize:13}}>
              <div style={{fontWeight:selEnt?.l===e.l?600:400}}>{e.d||e.l}</div>
              <div style={{fontSize:11,color:C.txd}}>{e.l}</div>
            </button>
          ))}
        </div>
      </div>
      <div style={{flex:1,overflow:"auto",padding:16}}>
        {!selEnt&&<div style={{textAlign:"center",color:C.txd,marginTop:60}}>Select an entity to manage translations</div>}
        {selEnt&&loading&&<div style={{textAlign:"center",marginTop:60}}><Spin s={20}/></div>}
        {selEnt&&!loading&&(
          <div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12,flexWrap:"wrap",gap:8}}>
              <div>
                <span style={{fontSize:16,fontWeight:700}}>{selEnt.d||selEnt.l}</span>
                <span style={{color:C.txd,marginLeft:8,fontSize:13}}>{attributes.length} attributes · {languages.length} languages</span>
              </div>
              <div style={{display:"flex",gap:6,alignItems:"center"}}>
                {saveMsg&&<span style={{fontSize:12,color:C.gn}}>{saveMsg}</span>}
                <button onClick={exportCSV} style={bt(null,{fontSize:12})}><I.Download/> Export CSV</button>
                <input ref={fRef} type="file" accept=".csv" style={{display:"none"}} onChange={e=>{const f=e.target.files?.[0];if(f){const r=new FileReader();r.onload=ev=>handleImport(ev.target.result);r.readAsText(f);}}}/>
                <button onClick={()=>fRef.current?.click()} style={bt(null,{fontSize:12})}><I.Upload/> Import CSV</button>
                <button onClick={handleSave} disabled={editCount===0||saving} style={bt(editCount>0?C.vi:C.sfh,{fontSize:12,opacity:editCount===0?.5:1})}>{saving?<Spin s={12}/>:null} Save {editCount>0?`(${editCount})`:""}</button>
              </div>
            </div>
            <div style={{display:"flex",gap:6,marginBottom:10,flexWrap:"wrap"}}>
              {languages.map(lang=>(
                <label key={lang.code} style={{display:"flex",alignItems:"center",gap:4,fontSize:12,color:selLangs.includes(lang.code)?C.tx:C.txd,cursor:"pointer"}}>
                  <input type="checkbox" checked={selLangs.includes(lang.code)} onChange={e=>{if(e.target.checked)setSelLangs(p=>[...p,lang.code]);else setSelLangs(p=>p.filter(c=>c!==lang.code));}}/>
                  {lang.name} ({lang.code})
                </label>
              ))}
            </div>
            <input placeholder="Filter attributes..." value={attrSearch} onChange={e=>setAttrSearch(e.target.value)} style={inp({fontSize:12,marginBottom:8,maxWidth:300})}/>
            <div style={{overflowX:"auto",...crd()}}>
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
                <thead>
                  <tr>
                    <th style={ths()}>Logical Name</th>
                    <th style={ths()}>Type</th>
                    {selLangs.map(code=><th key={code} style={ths()}>{languages.find(l=>l.code===code)?.name||code}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {filteredAttrs.map((attr,ri)=>(
                    <tr key={attr.logical} style={{borderBottom:`1px solid ${C.bd}22`,background:ri%2===0?"transparent":C.sfh+"33",opacity:attr.canRename===false?.5:1}}>
                      <td style={{...tds,...mono,fontSize:12,color:C.vi,display:"flex",alignItems:"center",gap:4}}>
                        {attr.logical}
                        {attr.canRename===false&&<span title="This field's label cannot be renamed (locked by Microsoft)" style={{fontSize:10,color:C.txd}}>🔒</span>}
                      </td>
                      <td style={{...tds,fontSize:12,color:C.txd}}>{displayType(attr.type)}</td>
                      {selLangs.map(code=>{
                        const existing=attr.labels.find(l=>l.languageCode===code)?.label||"";
                        const edited=edits[attr.logical]?.[code];
                        const val=edited!==undefined?edited:existing;
                        const locked=attr.canRename===false;
                        return(
                          <td key={code} style={{padding:"2px 4px"}}>
                            <input value={val} readOnly={locked} onChange={locked?undefined:e=>handleEdit(attr.logical,code,e.target.value)} style={inp({fontSize:12,padding:"3px 6px",borderColor:edited!==undefined?C.yw:C.bd,...mono,cursor:locked?"not-allowed":"text",background:locked?"transparent":C.sf})}/>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
