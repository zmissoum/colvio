import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { bridge } from "../d365-bridge.js";
import { C, I, Spin, ENTS, useDebounce, isTrulyCustom, mono, inp, bt, crd } from "../shared.jsx";
import Tooltip from "./Tooltip.jsx";
import { t } from "../i18n.js";

const CARD_W=300, HEADER_H=50, ROW_H=24, MAX_FIELDS=15, GAP_X=380, GAP_Y=450;

const typeIcon=(t)=>{
  if(t==="Uniqueidentifier")return{icon:"🔑",color:C.yw,label:"id"};
  if(t==="Lookup"||t==="Customer"||t==="Owner")return{icon:"🔗",color:C.vi,label:"reference"};
  if(t==="Picklist"||t==="State"||t==="Status")return{icon:"■",color:C.gn,label:"picklist"};
  if(t==="Money"||t==="Decimal"||t==="Double")return{icon:"●",color:C.yw,label:"decimal"};
  if(t==="Integer"||t==="BigInt")return{icon:"●",color:C.yw,label:"integer"};
  if(t==="DateTime")return{icon:"●",color:C.cy,label:"datetime"};
  if(t==="Boolean")return{icon:"●",color:C.or,label:"boolean"};
  if(t==="Memo")return{icon:"●",color:C.txm,label:"memo"};
  return{icon:"●",color:C.txm,label:"string"};
};

const cardH=(fLen,isExpanded,isCollapsed)=>{if(isCollapsed)return HEADER_H+8;const shown=isExpanded?fLen:Math.min(fLen,MAX_FIELDS);return HEADER_H+shown*ROW_H+(!isExpanded&&fLen>MAX_FIELDS?ROW_H:0)+8;};

export default function SchemaViewer({bp,orgInfo,theme}){
  const isLive=orgInfo?.isExtension;
  const svgRef=useRef(null);
  const[entities,setEntities]=useState(ENTS);
  const[search,setSearch]=useState("");
  const debouncedSearch=useDebounce(search,150);
  const[selected,setSelected]=useState({});// {logicalName:{entity,fields[],lookups[]}}
  const[positions,setPositions]=useState({});// {logicalName:{x,y}}
  const[vb,setVb]=useState({x:-50,y:-50,w:1200,h:800});
  const[dragging,setDragging]=useState(null);
  const[panning,setPanning]=useState(null);
  const[hoveredLine,setHoveredLine]=useState(null);
  const[expanded,setExpanded]=useState({});// {logicalName: true} for cards showing all fields
  const[collapseAll,setCollapseAll]=useState(false);// true = headers only (no fields)
  const[loadingEntity,setLoadingEntity]=useState(null);
  const[confirmModal,setConfirmModal]=useState(null);

  useEffect(()=>{
    if(isLive)bridge.getEntities().then(d=>{if(d)setEntities(d.map(e=>({l:e.logical||e.l,d:e.display||e.d,p:e.entitySet||e.p,cust:e.isCustom&&isTrulyCustom(e.logical||e.l,e.isManaged)})))}).catch(()=>{});
  },[]);

  const filtered=useMemo(()=>{
    if(!debouncedSearch)return entities;
    const s=debouncedSearch.toLowerCase();
    return entities.filter(e=>e.l.includes(s)||e.d?.toLowerCase().includes(s));
  },[entities,debouncedSearch]);

  const entityCount=Object.keys(selected).length;

  const doAddEntity=useCallback(async(e)=>{
    setLoadingEntity(e.l);
    try{
      const[fieldsData,lookupsData]=await Promise.all([
        bridge.getFields(e.l).catch(()=>[]),
        bridge.getLookups(e.l).catch(()=>[]),
      ]);
      const fields=(fieldsData||[]).map(f=>({l:f.logical,d:f.display||f.logical,t:f.type||"String",cust:f.isCustom})).sort((a,b)=>a.l.localeCompare(b.l));
      const lookups=(lookupsData||[]).map(lk=>({field:lk.lookupField,target:lk.targetEntity,nav:lk.navProperty}));
      // Sort: lookups first, then by name
      const lkSet=new Set(lookups.map(lk=>lk.field));
      fields.sort((a,b)=>{const aLk=lkSet.has(a.l)||lkSet.has("_"+a.l+"_value")?0:1;const bLk=lkSet.has(b.l)||lkSet.has("_"+b.l+"_value")?0:1;return aLk-bLk||a.l.localeCompare(b.l);});

      setSelected(prev=>({...prev,[e.l]:{entity:e,fields,lookups}}));
      // Grid position
      const idx=Object.keys(selected).length;
      const cols=Math.max(2,Math.ceil(Math.sqrt(idx+1)));
      const col=idx%cols,row=Math.floor(idx/cols);
      setPositions(prev=>({...prev,[e.l]:{x:col*GAP_X,y:row*GAP_Y}}));
    }catch{}
    setLoadingEntity(null);
  },[selected]);

  const addEntity=useCallback(async(e)=>{
    if(selected[e.l]){// toggle off
      setSelected(prev=>{const n={...prev};delete n[e.l];return n;});
      setPositions(prev=>{const n={...prev};delete n[e.l];return n;});
      return;
    }
    if(entityCount>=30){
      setConfirmModal({msg:`You already have ${entityCount} entities on canvas. Adding more may slow down the viewer. Continue?`,onOk:()=>{setConfirmModal(null);doAddEntity(e);}});
      return;
    }
    doAddEntity(e);
  },[selected,entityCount,doAddEntity]);

  const addRelated=useCallback((entityLogical)=>{
    const ent=selected[entityLogical];
    if(!ent)return;
    ent.lookups.forEach(lk=>{
      if(!selected[lk.target]){
        const match=entities.find(e=>e.l===lk.target);
        if(match)addEntity(match);
      }
    });
  },[selected,entities,addEntity]);

  const removeEntity=useCallback((logicalName)=>{
    setSelected(prev=>{const n={...prev};delete n[logicalName];return n;});
    setPositions(prev=>{const n={...prev};delete n[logicalName];return n;});
  },[]);

  // Lines
  const lines=useMemo(()=>{
    const result=[];
    Object.entries(selected).forEach(([srcName,srcData])=>{
      srcData.lookups.forEach(lk=>{
        if(!selected[lk.target]||!positions[srcName]||!positions[lk.target])return;
        const srcPos=positions[srcName];
        const tgtPos=positions[lk.target];
        let sy,ty;
        if(collapseAll){
          // When collapsed, connect from center of headers
          sy=srcPos.y+HEADER_H/2;
          ty=tgtPos.y+HEADER_H/2;
        }else{
          // Find field index in visible fields
          const isExp=!!expanded[srcName];
          const visFields=isExp?srcData.fields:srcData.fields.slice(0,MAX_FIELDS);
          const fIdx=visFields.findIndex(f=>f.l===lk.field||f.l==="_"+lk.field+"_value"||lk.field==="_"+f.l+"_value");
          if(fIdx===-1)return;
          sy=srcPos.y+HEADER_H+fIdx*ROW_H+ROW_H/2;
          const tgtH=cardH(selected[lk.target].fields.length,!!expanded[lk.target],false);
          ty=tgtPos.y+tgtH/2;
        }
        // Smart side: connect from closest sides
        const srcCx=srcPos.x+CARD_W/2,tgtCx=tgtPos.x+CARD_W/2;
        let sx,tx,dir;
        if(srcCx<tgtCx){sx=srcPos.x+CARD_W;tx=tgtPos.x;dir=1;}
        else{sx=srcPos.x;tx=tgtPos.x+CARD_W;dir=-1;}
        result.push({key:`${srcName}-${lk.field}-${lk.target}`,sx,sy,tx,ty,dir,src:srcName,tgt:lk.target,field:lk.field});
      });
    });
    return result;
  },[selected,positions,expanded,collapseAll]);

  // Mouse handlers
  const getScale=useCallback(()=>{
    if(!svgRef.current)return 1;
    return vb.w/svgRef.current.getBoundingClientRect().width;
  },[vb.w]);

  const handleMouseDown=useCallback((e)=>{
    if(e.target===svgRef.current||e.target.tagName==="svg"){
      setPanning({startX:e.clientX,startY:e.clientY,origX:vb.x,origY:vb.y});
    }
  },[vb.x,vb.y]);

  const handleMouseMove=useCallback((e)=>{
    const scale=getScale();
    if(dragging){
      const dx=(e.clientX-dragging.startX)*scale;
      const dy=(e.clientY-dragging.startY)*scale;
      setPositions(prev=>({...prev,[dragging.entity]:{x:dragging.origX+dx,y:dragging.origY+dy}}));
    }else if(panning){
      const dx=(e.clientX-panning.startX)*scale;
      const dy=(e.clientY-panning.startY)*scale;
      setVb(prev=>({...prev,x:panning.origX-dx,y:panning.origY-dy}));
    }
  },[dragging,panning,getScale]);

  const handleMouseUp=useCallback(()=>{setDragging(null);setPanning(null);},[]);

  const handleWheel=useCallback((e)=>{
    e.preventDefault();
    const factor=e.deltaY>0?1.1:0.9;
    const rect=svgRef.current?.getBoundingClientRect();
    if(!rect)return;
    const mx=vb.x+(e.clientX-rect.left)/rect.width*vb.w;
    const my=vb.y+(e.clientY-rect.top)/rect.height*vb.h;
    setVb(prev=>{
      const nw=Math.max(400,Math.min(6000,prev.w*factor));
      const nh=Math.max(300,Math.min(5000,prev.h*factor));
      const ratio=nw/prev.w;
      return{x:mx-(mx-prev.x)*ratio,y:my-(my-prev.y)*ratio,w:nw,h:nh};
    });
  },[vb]);

  useEffect(()=>{
    const el=svgRef.current;
    if(!el)return;
    el.addEventListener("wheel",handleWheel,{passive:false});
    return()=>el.removeEventListener("wheel",handleWheel);
  },[handleWheel]);

  const fitAll=useCallback(()=>{
    const keys=Object.keys(positions);
    if(!keys.length)return;
    let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
    keys.forEach(k=>{const p=positions[k];const h=cardH(selected[k]?.fields?.length||5,!!expanded[k],collapseAll);minX=Math.min(minX,p.x);minY=Math.min(minY,p.y);maxX=Math.max(maxX,p.x+CARD_W);maxY=Math.max(maxY,p.y+h);});
    setVb({x:minX-60,y:minY-60,w:maxX-minX+120,h:maxY-minY+120});
  },[positions,selected]);

  const autoLayout=useCallback(()=>{
    const keys=Object.keys(selected);
    const cols=Math.max(2,Math.ceil(Math.sqrt(keys.length)));
    const newPos={};
    keys.forEach((k,i)=>{newPos[k]={x:(i%cols)*GAP_X,y:Math.floor(i/cols)*GAP_Y};});
    setPositions(newPos);
  },[selected]);

  const clearAll=useCallback(()=>{setSelected({});setPositions({});},[]);

  // ── Export helpers ──
  const getExportBounds=useCallback(()=>{
    const keys=Object.keys(positions);
    if(!keys.length)return{x:0,y:0,w:800,h:600};
    let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
    keys.forEach(k=>{const p=positions[k];const h=cardH(selected[k]?.fields?.length||5,!!expanded[k],collapseAll);minX=Math.min(minX,p.x);minY=Math.min(minY,p.y);maxX=Math.max(maxX,p.x+CARD_W);maxY=Math.max(maxY,p.y+h);});
    const pad=80;
    return{x:minX-pad,y:minY-pad,w:maxX-minX+pad*2,h:maxY-minY+pad*2};
  },[positions,selected]);

  const buildExportSvg=useCallback(()=>{
    if(!svgRef.current)return null;
    const bounds=getExportBounds();
    const clone=svgRef.current.cloneNode(true);
    clone.setAttribute("xmlns","http://www.w3.org/2000/svg");
    clone.setAttribute("viewBox",`${bounds.x} ${bounds.y} ${bounds.w} ${bounds.h}`);
    clone.setAttribute("width",String(bounds.w));
    clone.setAttribute("height",String(bounds.h));
    // Add background rect inside SVG for proper export
    const bgRect=document.createElementNS("http://www.w3.org/2000/svg","rect");
    bgRect.setAttribute("x",String(bounds.x));bgRect.setAttribute("y",String(bounds.y));
    bgRect.setAttribute("width",String(bounds.w));bgRect.setAttribute("height",String(bounds.h));
    bgRect.setAttribute("fill",C.bg);
    clone.insertBefore(bgRect,clone.firstChild);
    // Add font style for text rendering
    const style=document.createElementNS("http://www.w3.org/2000/svg","style");
    style.textContent=`text{font-family:'DM Mono','Fira Code','Segoe UI',system-ui,monospace}`;
    clone.insertBefore(style,clone.firstChild);
    return{clone,bounds};
  },[getExportBounds]);

  const exportSVG=useCallback(()=>{
    if(!entityCount)return;
    const result=buildExportSvg();
    if(!result)return;
    const svgStr=new XMLSerializer().serializeToString(result.clone);
    const blob=new Blob([svgStr],{type:"image/svg+xml;charset=utf-8"});
    const url=URL.createObjectURL(blob);
    const a=document.createElement("a");a.href=url;a.download="colvio-schema.svg";a.click();
    URL.revokeObjectURL(url);
  },[entityCount,buildExportSvg]);

  const exportPNG=useCallback(()=>{
    if(!entityCount)return;
    const result=buildExportSvg();
    if(!result)return;
    const{bounds}=result;
    const svgStr=new XMLSerializer().serializeToString(result.clone);
    const scale=2;
    const canvas=document.createElement("canvas");
    canvas.width=Math.round(bounds.w*scale);canvas.height=Math.round(bounds.h*scale);
    const ctx=canvas.getContext("2d");
    const img=new Image();
    img.onload=()=>{
      ctx.drawImage(img,0,0,canvas.width,canvas.height);
      const a=document.createElement("a");
      a.href=canvas.toDataURL("image/png");a.download="colvio-schema.png";a.click();
    };
    img.src="data:image/svg+xml;charset=utf-8,"+encodeURIComponent(svgStr);
  },[entityCount,buildExportSvg]);

  const exportMermaid=useCallback(()=>{
    if(!entityCount)return;
    let md="erDiagram\n";
    Object.entries(selected).forEach(([name,data])=>{
      md+=`    ${name} {\n`;
      data.fields.slice(0,30).forEach(f=>{
        md+=`        ${f.t} ${f.l}\n`;
      });
      md+=`    }\n`;
    });
    // Relationships
    Object.entries(selected).forEach(([name,data])=>{
      data.lookups.forEach(lk=>{
        if(selected[lk.target]){
          md+=`    ${lk.target} ||--o{ ${name} : "${lk.field}"\n`;
        }
      });
    });
    const blob=new Blob([md],{type:"text/plain;charset=utf-8"});
    const url=URL.createObjectURL(blob);
    const a=document.createElement("a");a.href=url;a.download="colvio-schema.mmd";a.click();
    URL.revokeObjectURL(url);
  },[selected,entityCount]);

  // Render card
  const renderCard=(logicalName)=>{
    const data=selected[logicalName];
    if(!data||!positions[logicalName])return null;
    const{x,y}=positions[logicalName];
    const{entity,fields,lookups}=data;
    const isExp=!!expanded[logicalName];
    const visFields=isExp?fields:fields.slice(0,MAX_FIELDS);
    const overflow=fields.length-MAX_FIELDS;
    const h=cardH(fields.length,isExp,collapseAll);
    const lkFields=new Set(lookups.map(lk=>lk.field));
    const isLookup=(fl)=>lkFields.has(fl)||lkFields.has("_"+fl+"_value");
    const rtCount=lookups.length;
    const displayName=(entity.d||logicalName);
    const truncName=displayName.length>24?displayName.substring(0,24)+"…":displayName;

    return(
      <g key={logicalName} transform={`translate(${x},${y})`}>
        {/* Card shadow */}
        <rect x={2} y={2} width={CARD_W} height={h} rx={10} fill="rgba(0,0,0,0.15)"/>
        {/* Card background */}
        <rect width={CARD_W} height={h} rx={10} fill={C.sf} stroke={C.bd} strokeWidth={1}/>
        {/* Header gradient bar */}
        <rect width={CARD_W} height={HEADER_H} rx={10} fill={C.vi}/>
        <rect y={HEADER_H-10} width={CARD_W} height={10} fill={C.vi}/>
        {/* Header: entity display name */}
        <text x={14} y={24} fill="white" fontWeight="700" fontSize={14} style={{pointerEvents:"none"}}>{truncName}</text>
        {/* Header: entity logical name (subtitle) */}
        <text x={14} y={40} fill="rgba(255,255,255,0.5)" fontSize={10} {...mono} style={{pointerEvents:"none"}}>{logicalName}</text>
        {/* RT badge */}
        <rect x={CARD_W-56} y={8} width={42} height={20} rx={6} fill="rgba(255,255,255,0.2)"/>
        <text x={CARD_W-35} y={22} textAnchor="middle" fill="white" fontSize={10} fontWeight="700" style={{pointerEvents:"none"}}>{rtCount} RT</text>
        {/* Drag handle — full header area */}
        <rect width={CARD_W-60} height={HEADER_H} fill="transparent" style={{cursor:"grab"}}
          onMouseDown={(e)=>{e.stopPropagation();setDragging({entity:logicalName,startX:e.clientX,startY:e.clientY,origX:x,origY:y});}}/>
        {/* Add related button */}
        <g onClick={(e)=>{e.stopPropagation();addRelated(logicalName);}} style={{cursor:"pointer"}}>
          <circle cx={CARD_W-12} cy={HEADER_H/2} r={10} fill="rgba(255,255,255,0.15)"/>
          <text x={CARD_W-12} y={HEADER_H/2+4} textAnchor="middle" fill="white" fontSize={14} fontWeight="700" style={{pointerEvents:"none"}}>+</text>
        </g>
        {/* Close button */}
        <g onClick={(e)=>{e.stopPropagation();removeEntity(logicalName);}} style={{cursor:"pointer"}}>
          <circle cx={CARD_W-8} cy={6} r={7} fill="rgba(0,0,0,0.25)"/>
          <text x={CARD_W-8} y={10} textAnchor="middle" fill="white" fontSize={9} style={{pointerEvents:"none"}}>✕</text>
        </g>
        {/* Field rows — hidden when collapseAll */}
        {!collapseAll&&visFields.map((f,i)=>{
          const fy=HEADER_H+i*ROW_H;
          const isLk=isLookup(f.l);
          const ti=typeIcon(f.t);
          const isHov=hoveredLine&&((hoveredLine.src===logicalName&&hoveredLine.field===f.l)||(hoveredLine.tgt===logicalName));
          const isPK=f.t==="Uniqueidentifier"&&f.l.endsWith("id")&&f.l===logicalName+"id";
          return(
            <g key={f.l} transform={`translate(0,${fy})`}
              onMouseEnter={()=>{if(isLk)setHoveredLine({src:logicalName,field:f.l,tgt:lookups.find(lk=>lk.field===f.l||lk.field==="_"+f.l+"_value")?.target});}}
              onMouseLeave={()=>setHoveredLine(null)}>
              <rect width={CARD_W} height={ROW_H} fill={isHov?C.vi+"15":"transparent"}/>
              {/* Type icon */}
              <text x={10} y={ROW_H/2+4} fontSize={isPK?11:9} fill={ti.color} style={{pointerEvents:"none"}}>{isPK?"🔑":ti.icon}</text>
              {/* Field display name */}
              <text x={26} y={ROW_H/2+4} fill={C.tx} fontSize={11} style={{pointerEvents:"none"}}>
                {(f.d||f.l).length>22?(f.d||f.l).substring(0,22)+"…":(f.d||f.l)}
              </text>
              {/* Type label badge */}
              <text x={CARD_W-12} y={ROW_H/2+3} textAnchor="end" fill={isLk?C.vi:C.txd} fontSize={9} fontWeight={isLk?"700":"400"} {...mono} style={{pointerEvents:"none"}}>
                {isLk?"reference":ti.label}
              </text>
              <line x1={8} y1={ROW_H} x2={CARD_W-8} y2={ROW_H} stroke={C.bd} strokeWidth={0.3} strokeOpacity={0.5}/>
            </g>
          );
        })}
        {!collapseAll&&overflow>0&&(
          <g onClick={(e)=>{e.stopPropagation();setExpanded(prev=>({...prev,[logicalName]:!isExp}));}} style={{cursor:"pointer"}}>
            <rect x={0} y={HEADER_H+visFields.length*ROW_H} width={CARD_W} height={ROW_H} fill="transparent"/>
            <text x={CARD_W/2} y={HEADER_H+visFields.length*ROW_H+ROW_H/2+3} textAnchor="middle" fill={C.vi} fontSize={11} fontWeight="600">
              {isExp?`▴ Show less`:`▾ + ${overflow} more`}
            </text>
          </g>
        )}
      </g>
    );
  };

  return(
    <div style={{display:"flex",height:"100%"}}>
      {/* Sidebar */}
      <div style={{width:bp.mobile?"100%":260,borderRight:`1px solid ${C.bd}`,display:"flex",flexDirection:"column",flexShrink:0}}>
        <div style={{padding:8}}>
          <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:6}}>
            <span style={{fontWeight:700,fontSize:15}}>{t("nav.schema")}</span>
            <Tooltip text={t("help.schema_body")}/>
          </div>
          <input placeholder={t("common.search")} value={search} onChange={e=>setSearch(e.target.value)} style={inp({fontSize:13})}/>
        </div>
        <div style={{flex:1,overflow:"auto",padding:"0 6px"}}>
          {filtered.map(e=>{
            const onCanvas=!!selected[e.l];
            return(
              <button key={e.l} onClick={()=>addEntity(e)} style={{width:"100%",textAlign:"left",padding:"5px 8px",border:"none",borderRadius:5,cursor:"pointer",marginBottom:1,background:onCanvas?C.sfa:"transparent",color:onCanvas?C.tx:C.txm,fontSize:13,display:"flex",alignItems:"center",gap:6}}>
                {onCanvas&&<span style={{color:C.gn,fontSize:12}}>✓</span>}
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontWeight:onCanvas?600:400,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{e.d||e.l}</div>
                  <div style={{fontSize:11,color:C.txd,...mono}}>{e.l}</div>
                </div>
                {e.cust&&<span style={{fontSize:9,padding:"1px 5px",borderRadius:4,background:C.or+"22",color:C.or}}>Custom</span>}
                {loadingEntity===e.l&&<Spin s={12}/>}
              </button>
            );
          })}
        </div>
        <div style={{padding:"6px 10px",borderTop:`1px solid ${C.bd}`,fontSize:11,color:C.txd}}>
          {entityCount} on canvas
        </div>
      </div>

      {/* Canvas */}
      <div style={{flex:1,position:"relative",overflow:"hidden"}}>
        {/* Toolbar */}
        <div style={{position:"absolute",top:8,right:8,zIndex:10,display:"flex",gap:4}}>
          <button onClick={()=>setVb(prev=>({...prev,w:prev.w*0.8,h:prev.h*0.8}))} style={bt(null,{padding:"4px 8px",fontSize:12})}>+</button>
          <button onClick={()=>setVb(prev=>({...prev,w:prev.w*1.2,h:prev.h*1.2}))} style={bt(null,{padding:"4px 8px",fontSize:12})}>-</button>
          <button onClick={fitAll} style={bt(null,{padding:"4px 8px",fontSize:12})}>Fit</button>
          <button onClick={autoLayout} style={bt(null,{padding:"4px 8px",fontSize:12})}>Layout</button>
          <button onClick={()=>setCollapseAll(prev=>!prev)} style={bt(collapseAll?C.vi:null,{padding:"4px 8px",fontSize:12})}>{collapseAll?"Fields":"Tables"}</button>
          {entityCount>0&&<>
            <span style={{width:1,height:20,background:C.bd,margin:"0 2px"}}/>
            <button onClick={exportPNG} style={bt(null,{padding:"4px 8px",fontSize:12})}>PNG</button>
            <button onClick={exportSVG} style={bt(null,{padding:"4px 8px",fontSize:12})}>SVG</button>
            <button onClick={exportMermaid} style={bt(null,{padding:"4px 8px",fontSize:12})}>Mermaid</button>
            <span style={{width:1,height:20,background:C.bd,margin:"0 2px"}}/>
            <button onClick={clearAll} style={bt(null,{padding:"4px 8px",fontSize:12,color:C.rd})}>Clear</button>
          </>}
        </div>

        {entityCount===0&&(
          <div style={{position:"absolute",top:"50%",left:"50%",transform:"translate(-50%,-50%)",textAlign:"center",color:C.txd}}>
            <div style={{fontSize:48,marginBottom:12}}>🗂</div>
            <div style={{fontSize:15}}>Click entities in the sidebar to build your schema</div>
            <div style={{fontSize:12,marginTop:6}}>Drag cards to arrange, scroll to zoom</div>
          </div>
        )}

        <svg ref={svgRef} width="100%" height="100%" viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
          style={{background:C.bg,cursor:panning?"grabbing":"grab",display:"block"}}
          onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp}>
          <defs>
            <marker id="erd-arrow" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
              <polygon points="0 0, 8 3, 0 6" fill={C.cy}/>
            </marker>
          </defs>
          {/* Lines first (behind cards) */}
          {lines.map(l=>{
            const isHov=hoveredLine&&hoveredLine.src===l.src&&hoveredLine.field===l.field;
            const cp=Math.min(100,Math.abs(l.tx-l.sx)*0.35);
            const midX=(l.sx+l.tx)/2;
            const midY=(l.sy+l.ty)/2;
            // Clean field name for label
            const label=l.field.replace(/^_/,"").replace(/_value$/,"");
            return(
              <g key={l.key}>
                <path
                  d={`M ${l.sx} ${l.sy} C ${l.sx+cp*l.dir} ${l.sy}, ${l.tx-cp*l.dir} ${l.ty}, ${l.tx} ${l.ty}`}
                  stroke={isHov?C.cy:C.cy+"44"} strokeWidth={isHov?2.5:1.2} fill="none"
                  markerEnd="url(#erd-arrow)" style={{transition:"stroke .15s, stroke-width .15s"}}/>
                {/* Relationship label on line */}
                {isHov&&<text x={midX} y={midY-6} textAnchor="middle" fill={C.cy} fontSize={9} {...mono} style={{pointerEvents:"none"}}>
                  {label.length>20?label.substring(0,20)+"…":label}
                </text>}
                {/* Subtle label when not hovered for lines that are not too short */}
                {!isHov&&Math.abs(l.tx-l.sx)>200&&<text x={midX} y={midY-5} textAnchor="middle" fill={C.txd+"66"} fontSize={8} {...mono} style={{pointerEvents:"none"}}>
                  {label.length>18?label.substring(0,18)+"…":label}
                </text>}
              </g>
            );
          })}
          {/* Cards on top */}
          {Object.keys(selected).map(renderCard)}
        </svg>
      </div>
      {confirmModal&&<div style={{position:"fixed",top:0,left:0,right:0,bottom:0,background:"rgba(0,0,0,.5)",zIndex:100,display:"flex",alignItems:"center",justifyContent:"center"}} onClick={()=>setConfirmModal(null)}>
        <div style={{background:C.sf,border:`1px solid ${C.bd}`,borderRadius:10,padding:20,minWidth:320,maxWidth:420,boxShadow:"0 8px 32px rgba(0,0,0,.5)"}} onClick={e=>e.stopPropagation()}>
          <div style={{fontSize:14,color:C.tx,whiteSpace:"pre-line",marginBottom:16,lineHeight:1.5}}>{confirmModal.msg}</div>
          <div style={{display:"flex",gap:6,justifyContent:"flex-end"}}>
            <button onClick={()=>setConfirmModal(null)} style={bt(null,{fontSize:12})}>{t("common.cancel")}</button>
            <button onClick={confirmModal.onOk} style={bt(C.vi,{fontSize:12})}>{t("common.confirm")||"Confirm"}</button>
          </div>
        </div>
      </div>}
    </div>
  );
}
