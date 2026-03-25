import { useState, useEffect, useRef } from "react";
import { bridge } from "../d365-bridge.js";
import { C, I, Spin, ENTS, inp, bt } from "../shared.jsx";
import Tooltip from "./Tooltip.jsx";
import { t } from "../i18n.js";

export default function RelationshipGraph({bp,orgInfo}){
  const isLive=orgInfo?.isExtension;
  const[entities,setEntities]=useState(ENTS);
  const[search,setSearch]=useState("");
  const[selEnt,setSelEnt]=useState(null);
  const[parents,setParents]=useState([]);
  const[children,setChildren]=useState([]);
  const[m2m,setM2m]=useState([]);
  const[depth,setDepth]=useState(1);
  const[loading,setLoading]=useState(false);
  const[showAllP,setShowAllP]=useState(false);
  const[showAllC,setShowAllC]=useState(false);
  const[showAllM,setShowAllM]=useState(false);
  const containerRef=useRef(null);

  useEffect(()=>{if(isLive)bridge.getEntities().then(d=>{if(d)setEntities(d.map(e=>({l:e.logical||e.l,d:e.display||e.d,p:e.entitySet||e.p})))}).catch(()=>{});},[]);

  const handleSelect=async(e)=>{
    setSelEnt(e);setLoading(true);setShowAllP(false);setShowAllC(false);setShowAllM(false);
    try{
      const[p,c,mm]=await Promise.all([bridge.getLookups(e.l),bridge.getChildRelationships(e.l),bridge.getManyToManyRelationships(e.l)]);
      const pMap={};(p||[]).forEach(r=>{if(!pMap[r.targetEntity])pMap[r.targetEntity]={...r,count:1};else pMap[r.targetEntity].count++;});
      const cMap={};(c||[]).forEach(r=>{if(!cMap[r.targetEntity])cMap[r.targetEntity]={...r,count:1};else cMap[r.targetEntity].count++;});
      // Deduplicate M2M by the "other" entity
      const mMap={};(mm||[]).forEach(r=>{
        const other=r.entity1===e.l?r.entity2:r.entity1;
        if(!mMap[other])mMap[other]={...r,otherEntity:other,count:1};else mMap[other].count++;
      });
      setParents(Object.values(pMap));
      setChildren(Object.values(cMap));
      setM2m(Object.values(mMap));

      // Depth 2: fetch relationships for each related entity (cap at 30 total)
      if(depth===2){
        const allRelated=new Set();
        Object.values(pMap).forEach(r=>allRelated.add(r.targetEntity));
        Object.values(cMap).forEach(r=>allRelated.add(r.targetEntity));
        Object.values(mMap).forEach(r=>allRelated.add(r.otherEntity));
        const relatedArr=[...allRelated].slice(0,10); // fetch max 10 to keep cap at ~30
        const extraP={...pMap};const extraC={...cMap};const extraM={...mMap};
        let totalEntities=Object.keys(pMap).length+Object.keys(cMap).length+Object.keys(mMap).length;
        for(const rel of relatedArr){
          if(totalEntities>=30)break;
          try{
            const[rp,rc,rm]=await Promise.all([bridge.getLookups(rel),bridge.getChildRelationships(rel),bridge.getManyToManyRelationships(rel)]);
            (rp||[]).forEach(r=>{if(!extraP[r.targetEntity]&&r.targetEntity!==e.l&&totalEntities<30){extraP[r.targetEntity]={...r,count:1,depth2:true};totalEntities++;}});
            (rc||[]).forEach(r=>{if(!extraC[r.targetEntity]&&r.targetEntity!==e.l&&totalEntities<30){extraC[r.targetEntity]={...r,count:1,depth2:true};totalEntities++;}});
            (rm||[]).forEach(r=>{const other=r.entity1===rel?r.entity2:r.entity1;if(!extraM[other]&&other!==e.l&&totalEntities<30){extraM[other]={...r,otherEntity:other,count:1,depth2:true};totalEntities++;}});
          }catch{}
        }
        setParents(Object.values(extraP));
        setChildren(Object.values(extraC));
        setM2m(Object.values(extraM));
      }
    }catch{}
    setLoading(false);
  };

  const filtered=entities.filter(e=>!search||e.l.includes(search.toLowerCase())||e.d?.toLowerCase().includes(search.toLowerCase()));
  const NODE_W=150,NODE_H=56,GAP=18;
  const maxP=showAllP?parents.length:Math.min(parents.length,12);
  const maxC=showAllC?children.length:Math.min(children.length,12);
  const maxM=showAllM?m2m.length:Math.min(m2m.length,12);
  const visP=parents.slice(0,maxP);
  const visC=children.slice(0,maxC);
  const visM=m2m.slice(0,maxM);
  const svgW=Math.max(600,Math.max(visP.length,visC.length,visM.length)*(NODE_W+GAP)+GAP*2);
  const svgH=selEnt?(m2m.length>0?560:420):0;
  const centerX=svgW/2;
  const parentY=40;
  const m2mY=m2m.length>0?parentY+NODE_H+80:0;
  const centerY=m2m.length>0?m2mY+NODE_H+80:190;
  const childY=centerY+NODE_H+80;

  const renderNode=(x,y,label,sub,isCenter,onClick,colorOverride)=>(
    <g key={label+sub+y} onClick={onClick} style={{cursor:onClick?"pointer":"default"}}>
      <rect x={x-NODE_W/2} y={y} width={NODE_W} height={NODE_H} rx={8} fill={isCenter?C.vi:colorOverride||C.sf} stroke={isCenter?C.vi:colorOverride||C.bd} strokeWidth={1.5}/>
      <text x={x} y={y+22} textAnchor="middle" fill={isCenter?"white":C.tx} fontSize={12} fontWeight={600}>{label.length>18?label.substring(0,18)+"\u2026":label}</text>
      <text x={x} y={y+38} textAnchor="middle" fill={isCenter?"rgba(255,255,255,0.6)":C.txd} fontSize={10}>{sub.length>20?sub.substring(0,20)+"\u2026":sub}</text>
    </g>
  );

  return(
    <div style={{display:"flex",height:"100%"}}>
      <div style={{width:bp.mobile?"100%":260,borderRight:`1px solid ${C.bd}`,display:"flex",flexDirection:"column",flexShrink:0}}>
        <div style={{padding:8}}><input placeholder="Search entity..." value={search} onChange={e=>setSearch(e.target.value)} style={inp({fontSize:13})}/></div>
        <div style={{flex:1,overflow:"auto",padding:"0 6px"}}>
          {filtered.map(e=>(
            <button key={e.l} onClick={()=>handleSelect(e)} style={{width:"100%",textAlign:"left",padding:"6px 8px",border:"none",borderRadius:5,cursor:"pointer",marginBottom:1,background:selEnt?.l===e.l?C.sfa:"transparent",color:selEnt?.l===e.l?C.tx:C.txm,fontSize:13,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div><div style={{fontWeight:selEnt?.l===e.l?600:400}}>{e.d||e.l}</div><div style={{fontSize:11,color:C.txd}}>{e.l}</div></div>
            </button>
          ))}
        </div>
      </div>
      <div ref={containerRef} style={{flex:1,overflow:"auto",padding:20}}>
        {!selEnt&&<div style={{textAlign:"center",color:C.txd,marginTop:60}}>Select an entity to view its relationships</div>}
        {selEnt&&loading&&<div style={{textAlign:"center",marginTop:60}}><Spin s={20}/></div>}
        {selEnt&&!loading&&(
          <div>
            <div style={{textAlign:"center",marginBottom:12,display:"flex",alignItems:"center",justifyContent:"center",gap:12,flexWrap:"wrap"}}>
              <span style={{fontSize:16,fontWeight:700}}>{selEnt.d||selEnt.l}</span>
              <span style={{color:C.txd,fontSize:13}}>{parents.length} parent{parents.length!==1?"s":""} · {m2m.length} N:N · {children.length} child{children.length!==1?"ren":""}</span>
              <button onClick={()=>{const next=depth===1?2:1;setDepth(next);handleSelect(selEnt);}} style={bt(depth===2?C.vi:null,{padding:"4px 10px",fontSize:12,borderRadius:4})}>
                Depth {depth}
              </button>
              <Tooltip text={t("help.relationship_depth")}/>
            </div>
            <div style={{overflowX:"auto"}}>
              <svg width={svgW} height={svgH} style={{display:"block",margin:"0 auto"}}>
                <defs>
                  <marker id="arrowDown" viewBox="0 0 10 10" refX="5" refY="10" markerWidth={8} markerHeight={8} orient="auto"><path d="M0,0 L5,10 L10,0" fill={C.cy}/></marker>
                  <marker id="arrowUp" viewBox="0 0 10 10" refX="5" refY="0" markerWidth={8} markerHeight={8} orient="auto"><path d="M0,10 L5,0 L10,10" fill={C.or}/></marker>
                  <marker id="arrowM2m" viewBox="0 0 10 10" refX="5" refY="5" markerWidth={8} markerHeight={8} orient="auto"><circle cx="5" cy="5" r="3" fill={C.lv}/></marker>
                </defs>
                {/* Lines: parents to center */}
                {visP.map((p,i)=>{
                  const px=centerX-((visP.length-1)*(NODE_W+GAP))/2+i*(NODE_W+GAP);
                  return <line key={"lp"+i} x1={centerX} y1={centerY} x2={px} y2={parentY+NODE_H} stroke={C.or} strokeWidth={1.5} strokeDasharray="6,3" markerEnd="url(#arrowUp)"/>;
                })}
                {/* Lines: M2M to center */}
                {visM.map((m,i)=>{
                  const mx=centerX-((visM.length-1)*(NODE_W+GAP))/2+i*(NODE_W+GAP);
                  return <line key={"lm"+i} x1={centerX} y1={centerY} x2={mx} y2={m2mY+NODE_H} stroke={C.lv} strokeWidth={1.5} strokeDasharray="4,4" markerEnd="url(#arrowM2m)"/>;
                })}
                {/* Lines: center to children */}
                {visC.map((c,i)=>{
                  const cx=centerX-((visC.length-1)*(NODE_W+GAP))/2+i*(NODE_W+GAP);
                  return <line key={"lc"+i} x1={centerX} y1={centerY+NODE_H} x2={cx} y2={childY} stroke={C.cy} strokeWidth={1.5} strokeDasharray="6,3" markerEnd="url(#arrowDown)"/>;
                })}
                {/* Parent nodes */}
                {visP.map((p,i)=>{
                  const px=centerX-((visP.length-1)*(NODE_W+GAP))/2+i*(NODE_W+GAP);
                  return renderNode(px,parentY,p.targetEntity,p.lookupField+(p.count>1?` (\u00d7${p.count})`:"")+( p.depth2?" (d2)":""),false,()=>handleSelect({l:p.targetEntity,d:p.targetEntity}));
                })}
                {/* M2M nodes */}
                {m2m.length>0&&visM.map((m,i)=>{
                  const mx=centerX-((visM.length-1)*(NODE_W+GAP))/2+i*(NODE_W+GAP);
                  return renderNode(mx,m2mY,m.otherEntity,m.schemaName+(m.count>1?` (\u00d7${m.count})`:"")+( m.depth2?" (d2)":""),false,()=>handleSelect({l:m.otherEntity,d:m.otherEntity}),C.lv+"22");
                })}
                {/* Center node */}
                {renderNode(centerX,centerY,selEnt.d||selEnt.l,selEnt.l,true,null)}
                {/* Child nodes */}
                {visC.map((c,i)=>{
                  const cx=centerX-((visC.length-1)*(NODE_W+GAP))/2+i*(NODE_W+GAP);
                  return renderNode(cx,childY,c.targetEntity,c.lookupField+(c.count>1?` (\u00d7${c.count})`:"")+( c.depth2?" (d2)":""),false,()=>handleSelect({l:c.targetEntity,d:c.targetEntity}));
                })}
                {/* Labels */}
                <text x={20} y={parentY+NODE_H/2} fill={C.or} fontSize={11} fontWeight={700}>N:1 Parents</text>
                {m2m.length>0&&<text x={20} y={m2mY+NODE_H/2} fill={C.lv} fontSize={11} fontWeight={700}>N:N</text>}
                <text x={20} y={childY+NODE_H/2} fill={C.cy} fontSize={11} fontWeight={700}>1:N Children</text>
              </svg>
            </div>
            {parents.length>12&&!showAllP&&<button onClick={()=>setShowAllP(true)} style={bt(null,{margin:"8px auto",display:"block",fontSize:12})}>Show all {parents.length} parents</button>}
            {m2m.length>12&&!showAllM&&<button onClick={()=>setShowAllM(true)} style={bt(null,{margin:"8px auto",display:"block",fontSize:12})}>Show all {m2m.length} N:N</button>}
            {children.length>12&&!showAllC&&<button onClick={()=>setShowAllC(true)} style={bt(null,{margin:"8px auto",display:"block",fontSize:12})}>Show all {children.length} children</button>}
          </div>
        )}
      </div>
    </div>
  );
}
