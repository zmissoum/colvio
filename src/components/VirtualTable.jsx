import { useState, useEffect, useRef, useCallback } from "react";
import { C, I, mono } from "../shared.jsx";

export default function VirtualTable({ res, fields, data, scrollRef, selected, toggleSel, toggleAll, getRecordId, copy, cp, bestGet, rawGet, flatVal, fmt, ths, tds, onSort, sortField, sortDir, onInlineEdit, orgInfo, entityName }) {
  const ROW_H = 32;
  const [editing, setEditing] = useState(null);
  const [focusedRow, setFocusedRow] = useState(-1);
  const editRef = useRef(null);
  useEffect(() => { if (editing && editRef.current) editRef.current.focus(); }, [editing]);
  const OVERSCAN = 5;
  const containerRef = useRef(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [containerH, setContainerH] = useState(600);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new ResizeObserver(entries => { for (const e of entries) setContainerH(e.contentRect.height); });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const onScroll = useCallback((e) => setScrollTop(e.target.scrollTop), []);

  const onKeyDown = useCallback((e) => {
    if (editing) return; // Don't interfere with inline editing
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setFocusedRow(prev => Math.min(prev + 1, data.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setFocusedRow(prev => Math.max(prev - 1, 0));
    } else if (e.key === "Enter" && focusedRow >= 0 && focusedRow < data.length) {
      e.preventDefault();
      const r = data[focusedRow];
      const id = getRecordId(r);
      if (id) toggleSel(id);
    }
  }, [data, editing, focusedRow, getRecordId, toggleSel]);

  // Scroll focused row into view
  useEffect(() => {
    if (focusedRow < 0 || !containerRef.current) return;
    const el = containerRef.current;
    const rowTop = focusedRow * ROW_H;
    const rowBottom = rowTop + ROW_H;
    if (rowTop < el.scrollTop + ROW_H) {
      el.scrollTop = Math.max(0, rowTop - ROW_H);
    } else if (rowBottom > el.scrollTop + containerH) {
      el.scrollTop = rowBottom - containerH + ROW_H;
    }
  }, [focusedRow, containerH]);

  const totalH = data.length * ROW_H;
  const startIdx = Math.max(0, Math.floor(scrollTop / ROW_H) - OVERSCAN);
  const visibleCount = Math.ceil(containerH / ROW_H) + OVERSCAN * 2;
  const endIdx = Math.min(data.length, startIdx + visibleCount);
  const offsetY = startIdx * ROW_H;

  return (
    <div ref={containerRef} tabIndex={0} onScroll={onScroll} onKeyDown={onKeyDown} style={{overflowX:"auto",overflowY:"auto",maxHeight:"calc(100vh - 280px)",outline:"none"}}>
      <table style={{width:"100%",borderCollapse:"collapse",fontSize:13,minWidth:fields.length*130}}>
        <thead>
          <tr>
            <th style={{...ths(),position:"sticky",left:0,zIndex:2,background:C.sf,minWidth:52,display:"flex",alignItems:"center",gap:4,top:0}}>
              <input type="checkbox" checked={selected.size>0&&selected.size===data.length} onChange={toggleAll} style={{accentColor:C.vi,cursor:"pointer"}}/>
              <span>#</span>
            </th>
            {fields.map(f => (<th key={f} onClick={()=>onSort?.(f)} style={{...ths(),position:"sticky",top:0,zIndex:1,background:C.sf,cursor:"pointer",userSelect:"none"}}><span style={{display:"inline-flex",alignItems:"center",gap:3}}>{f}{sortField===f&&<span style={{fontSize:10,color:C.vi}}>{sortDir==="asc"?"\u25B2":"\u25BC"}</span>}</span></th>))}
          </tr>
        </thead>
        <tbody>
          {startIdx > 0 && <tr style={{height:offsetY}}><td colSpan={fields.length+1}/></tr>}
          {data.slice(startIdx, endIdx).map((r, vi) => {
            const i = startIdx + vi;
            const isFocused = i === focusedRow;
            return (
              <tr key={i} style={{height:ROW_H,borderBottom:`1px solid ${C.bd}`,background:isFocused?C.sfa:"transparent"}}
                onMouseEnter={e=>{if(!isFocused)e.currentTarget.style.background=C.sfh;}}
                onMouseLeave={e=>{if(!isFocused)e.currentTarget.style.background="transparent";}}>
                <td style={{...tds,color:C.txd,fontSize:12,position:"sticky",left:0,background:selected.has(getRecordId(r))?C.vid:isFocused?C.sfa:C.bg,zIndex:1,display:"flex",alignItems:"center",gap:4}}>
                  <input type="checkbox" checked={selected.has(getRecordId(r))} onChange={()=>toggleSel(getRecordId(r))} style={{accentColor:C.vi,cursor:"pointer"}}/>
                  <span>{i+1}</span>
                  {orgInfo?.orgUrl&&entityName&&getRecordId(r)&&<a href={`${orgInfo.orgUrl}/main.aspx?etn=${entityName}&id=${getRecordId(r)}&pagetype=entityrecord`} target="_blank" rel="noopener" onClick={e=>e.stopPropagation()} style={{color:C.vi,textDecoration:"none",fontSize:10,lineHeight:1}} title="Open in D365">&nearr;</a>}
                </td>
                {fields.map(f => {
                  const k=`${i}-${f}`;
                  const isEd=editing&&editing.row===i&&editing.field===f;
                  return (
                    <td key={f} style={{...tds,maxWidth:220,cursor:"pointer",background:isEd?C.sfa:undefined}}
                      onClick={()=>!isEd&&copy(bestGet(r,f),k)}
                      onDoubleClick={()=>{if(onInlineEdit&&!f.includes(".")){const raw=rawGet(r,f);setEditing({row:i,field:f,value:raw!=null?String(raw):"",record:r});}}}
                      title={isEd?"Enter=save | Esc=cancel":"Click=copy | Dbl-click=edit"}>
                      {isEd?(
                        <input ref={editRef} value={editing.value} onChange={e=>setEditing({...editing,value:e.target.value})}
                          onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();onInlineEdit(editing.record,f,editing.value);setEditing(null);}if(e.key==="Escape"){e.preventDefault();setEditing(null);}}}
                          onBlur={()=>setEditing(null)}
                          style={{width:"100%",background:C.bg,border:`1px solid ${C.vi}`,borderRadius:3,color:C.tx,padding:"1px 4px",fontSize:13,...mono,outline:"none",boxSizing:"border-box"}}/>
                      ):cp===k?<span style={{color:C.gn,fontSize:11}}>&#x2713; copied</span>:fmt(r,f)}
                    </td>
                  );
                })}
              </tr>
            );
          })}
          {endIdx < data.length && <tr style={{height:(data.length - endIdx) * ROW_H}}><td colSpan={fields.length+1}/></tr>}
        </tbody>
      </table>
    </div>
  );
}
