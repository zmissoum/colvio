import { useState, useEffect, useMemo } from "react";
import { bridge } from "../d365-bridge.js";
import { C, I, Spin, mono, inp, bt, crd, dl } from "../shared.jsx";

export default function LoginHistory({bp,orgInfo}){
  const[search,setSearch]=useState("");
  const[users,setUsers]=useState([]);
  const[selectedUser,setSelectedUser]=useState(null);
  const[history,setHistory]=useState([]);
  const[loading,setLoading]=useState(false);
  const[loadingHistory,setLoadingHistory]=useState(false);
  const[error,setError]=useState("");
  const[limit,setLimit]=useState(100);
  const[searchTimer,setSearchTimer]=useState(null);

  const doSearch=(term)=>{
    if(searchTimer) clearTimeout(searchTimer);
    if(!term||term.length<2){ setUsers([]); return; }
    const t=setTimeout(async()=>{
      setLoading(true);setError("");
      try{
        const results=await bridge.searchUsers(term);
        setUsers(results||[]);
      }catch(e){setError(e.message);}
      finally{setLoading(false);}
    },400);
    setSearchTimer(t);
  };
  useEffect(()=>()=>{if(searchTimer)clearTimeout(searchTimer);},[searchTimer]);

  const selectUser=async(user)=>{
    setSelectedUser(user);
    setLoadingHistory(true);setError("");setHistory([]);
    try{
      const data=await bridge.getLoginHistory(user.id,limit);
      if(!data?.length){
        setError("No audit records found for this user. Check that auditing is enabled: Settings > Administration > System Settings > Auditing tab > enable 'Start Auditing' AND 'Audit user access'.");
      } else if(data.length===1 && data[0].action==="__AUDIT_EXISTS_BUT_NO_LOGINS"){
        setError(`Auditing is active (${data[0].info}) but no login events were found. Enable 'Audit user access' in Settings > Administration > System Settings > Auditing tab.`);
        setHistory([]);
      } else {
        setHistory(data);
      }
    }catch(e){
      if(e.message?.includes("401")||e.message?.includes("SESSION_EXPIRED")){
        setError("Session expired — refresh D365 (F5)");
      } else if(e.message?.includes("404")||e.message?.includes("audits")){
        setError("The audit entity is not accessible. Auditing must be enabled: Settings > Administration > System Settings > Auditing.");
      } else {
        setError(e.message);
      }
    }
    finally{setLoadingHistory(false);}
  };

  const groupedByDay = useMemo(()=>{
    const groups={};
    for(const h of history){
      const day=new Date(h.date).toLocaleDateString("en-US",{weekday:"long",day:"numeric",month:"long",year:"numeric"});
      if(!groups[day]) groups[day]=[];
      groups[day].push(h);
    }
    return Object.entries(groups);
  },[history]);

  const stats = useMemo(()=>{
    if(!history.length) return null;
    const logins=history.filter(h=>h.action==="Login");
    const logouts=history.filter(h=>h.action==="Logout");
    const first=logins.length?new Date(logins[logins.length-1].date):null;
    const last=logins.length?new Date(logins[0].date):null;
    const uniqueDays=new Set(logins.map(h=>new Date(h.date).toDateString())).size;
    const accessTypes={};
    logins.forEach(h=>{const t=h.accessType||"Login";accessTypes[t]=(accessTypes[t]||0)+1;});
    return {total:logins.length,logouts:logouts.length,first,last,uniqueDays,accessTypes};
  },[history]);

  const sessionsWithDuration = useMemo(()=>{
    const sessions=[];
    const sorted=[...history].sort((a,b)=>new Date(a.date)-new Date(b.date));
    let lastLogin=null;
    for(const ev of sorted){
      if(ev.action==="Login"){
        if(lastLogin){sessions.push({...lastLogin,duration:null});}
        lastLogin=ev;
      } else if(ev.action==="Logout"&&lastLogin){
        const dur=Math.round((new Date(ev.date)-new Date(lastLogin.date))/60000);
        sessions.push({...lastLogin,duration:dur,logoutAt:ev.date});
        lastLogin=null;
      }
    }
    if(lastLogin) sessions.push({...lastLogin,duration:null});
    return sessions.reverse();
  },[history]);

  const copyAll=()=>{
    const esc=(v)=>{const s=String(v||"");return s.includes(",")||s.includes('"')||s.includes("\n")?`"${s.replace(/"/g,'""')}"`:s;};
    const csv=["Date,Time,Action,Access Type,Operation,Session Info,Additional Info",...history.map(h=>{
      const d=new Date(h.date);
      return [d.toLocaleDateString("en-US"),d.toLocaleTimeString("en-US"),h.action,h.accessType||"",h.operation||"",h.changedata||"",h.info||""].map(esc).join(",");
    })].join("\n");
    dl("\uFEFF"+csv,"text/csv;charset=utf-8",`login_history_${selectedUser?.fullname?.replace(/\s+/g,"_")||"export"}.csv`);
  };

  return(
    <div style={{padding:bp.mobile?12:20,maxWidth:900,margin:"0 auto"}}>
      <h2 style={{fontSize:16,fontWeight:700,marginBottom:4,display:"flex",alignItems:"center",gap:8}}><I.Clock/> Login History</h2>
      <p style={{color:C.txm,fontSize:14,marginBottom:16}}>Search for a user to view their D365 login history (via Audit).</p>

      <div style={{position:"relative",marginBottom:16}}>
        <div style={{display:"flex",gap:8,flexDirection:bp.mobile?"column":"row"}}>
          <div style={{flex:1,position:"relative"}}>
            <input value={search} onChange={e=>{setSearch(e.target.value);doSearch(e.target.value);}} placeholder="User name or email..." style={inp({fontSize:14,padding:"8px 12px 8px 32px"})}/>
            <span style={{position:"absolute",left:10,top:"50%",transform:"translateY(-50%)",color:C.txd}}><I.Search s={14}/></span>
            {loading&&<span style={{position:"absolute",right:10,top:"50%",transform:"translateY(-50%)"}}><Spin s={14}/></span>}
          </div>
          <select value={limit} onChange={e=>setLimit(+e.target.value)} style={inp({width:"auto",fontSize:13,padding:"6px 10px"})}>
            <option value={50}>Last 50</option>
            <option value={100}>Last 100</option>
            <option value={200}>Last 200</option>
            <option value={500}>Last 500</option>
          </select>
        </div>

        {users.length>0&&!selectedUser&&(
          <div style={{position:"absolute",top:"100%",left:0,right:0,zIndex:10,background:C.sf,border:`1px solid ${C.bd}`,borderRadius:6,marginTop:4,maxHeight:250,overflow:"auto",boxShadow:"0 8px 24px rgba(0,0,0,.4)"}}>
            {users.map(u=>(
              <button key={u.id} onClick={()=>{selectUser(u);setUsers([]);}} style={{width:"100%",display:"flex",alignItems:"center",gap:10,padding:"10px 14px",border:"none",borderBottom:`1px solid ${C.bd}`,cursor:"pointer",background:"transparent",color:C.tx,textAlign:"left"}}
                onMouseEnter={e=>e.currentTarget.style.background=C.sfh}
                onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                <div style={{width:32,height:32,borderRadius:"50%",background:u.disabled?C.rd+"33":`linear-gradient(135deg,${C.vi},${C.cy})`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,fontWeight:600,color:"white",flexShrink:0}}>
                  {u.fullname?.split(" ").map(n=>n[0]).join("").substring(0,2).toUpperCase()||"?"}
                </div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:15,fontWeight:500,display:"flex",alignItems:"center",gap:6}}>
                    {u.fullname}
                    {u.disabled&&<span style={{fontSize:11,color:C.rd,background:C.rd+"22",padding:"2px 6px",borderRadius:3}}>Disabled</span>}
                  </div>
                  <div style={{fontSize:13,color:C.txd,...mono}}>{u.email}</div>
                  {u.title&&<div style={{fontSize:12,color:C.txd}}>{u.title}</div>}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {error&&<div style={{padding:"8px 12px",background:"#991B1B33",borderRadius:8,color:C.rd,fontSize:13,marginBottom:12}}>⚠ {error}</div>}

      {selectedUser&&(
        <div style={{...crd({padding:14}),marginBottom:16}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:8}}>
            <div style={{display:"flex",alignItems:"center",gap:12}}>
              <div style={{width:40,height:40,borderRadius:"50%",background:`linear-gradient(135deg,${C.vi},${C.cy})`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,fontWeight:600,color:"white"}}>
                {selectedUser.fullname?.split(" ").map(n=>n[0]).join("").substring(0,2).toUpperCase()}
              </div>
              <div>
                <div style={{fontWeight:600,fontSize:14}}>{selectedUser.fullname}</div>
                <div style={{fontSize:13,color:C.txd,...mono}}>{selectedUser.email}</div>
              </div>
            </div>
            <div style={{display:"flex",gap:6}}>
              <button onClick={()=>{setSelectedUser(null);setHistory([]);setSearch("");setError("");}} style={{padding:"4px 10px",fontSize:12,border:`1px solid ${C.bd}`,borderRadius:4,cursor:"pointer",background:"transparent",color:C.txm}}>Change</button>
              <button onClick={()=>selectUser(selectedUser)} style={{padding:"4px 10px",fontSize:12,border:`1px solid ${C.bd}`,borderRadius:4,cursor:"pointer",background:"transparent",color:C.cy}}>Refresh</button>
              {history.length>0&&<button onClick={copyAll} style={{padding:"4px 10px",fontSize:12,border:`1px solid ${C.gn}44`,borderRadius:4,cursor:"pointer",background:C.gn+"22",color:C.gn,display:"flex",alignItems:"center",gap:4}}><I.Download/> Export CSV</button>}
            </div>
          </div>

          {stats&&(
            <div style={{display:"flex",flexDirection:"column",gap:8,marginTop:12}}>
              <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8}}>
                <div style={{background:C.bg,borderRadius:6,padding:"8px 10px",textAlign:"center"}}>
                  <div style={{fontSize:18,fontWeight:600,color:C.cy}}>{stats.total}</div>
                  <div style={{fontSize:11,color:C.txd}}>Logins</div>
                </div>
                <div style={{background:C.bg,borderRadius:6,padding:"8px 10px",textAlign:"center"}}>
                  <div style={{fontSize:18,fontWeight:600,color:C.gn}}>{stats.uniqueDays}</div>
                  <div style={{fontSize:11,color:C.txd}}>Active days</div>
                </div>
                <div style={{background:C.bg,borderRadius:6,padding:"8px 10px",textAlign:"center"}}>
                  <div style={{fontSize:13,fontWeight:500,color:C.gn}}>{stats.last?.toLocaleString("en-US",{month:"short",day:"2-digit",hour:"2-digit",minute:"2-digit"})}</div>
                  <div style={{fontSize:11,color:C.txd}}>Last login</div>
                </div>
                <div style={{background:C.bg,borderRadius:6,padding:"8px 10px",textAlign:"center"}}>
                  <div style={{fontSize:13,fontWeight:500,color:C.txm}}>{stats.first?.toLocaleString("en-US",{month:"short",day:"2-digit"})}</div>
                  <div style={{fontSize:11,color:C.txd}}>Oldest</div>
                </div>
              </div>
              {Object.keys(stats.accessTypes).length>1&&(
                <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                  {Object.entries(stats.accessTypes).map(([type,count])=>(
                    <span key={type} style={{fontSize:11,padding:"3px 10px",borderRadius:3,background:C.sfh,color:C.txm,border:`1px solid ${C.bd}`}}>{type}: <strong style={{color:C.cy}}>{count}</strong></span>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {loadingHistory&&<div style={{textAlign:"center",padding:30}}><Spin/><p style={{color:C.txd,fontSize:13,marginTop:8}}>Loading history...</p></div>}

      {!loadingHistory&&history.length>0&&(
        <div>
          {groupedByDay.map(([day,events])=>(
            <div key={day} style={{marginBottom:16}}>
              <div style={{fontSize:14,fontWeight:600,color:C.txm,marginBottom:6,padding:"4px 0",borderBottom:`1px solid ${C.bd}`,position:"sticky",top:0,background:C.bg,zIndex:1}}>{day} <span style={{fontWeight:400,color:C.txd}}>({events.length} events)</span></div>
              <div style={{paddingLeft:12,borderLeft:`2px solid ${C.bd}`}}>
                {events.map((ev,i)=>{
                  const d=new Date(ev.date);
                  const isLogin=ev.action==="Login";
                  const session=isLogin?sessionsWithDuration.find(s=>s.date===ev.date):null;
                  const durStr=session?.duration!=null?(session.duration<60?`${session.duration}min`:`${Math.floor(session.duration/60)}h${String(session.duration%60).padStart(2,"0")}`):null;
                  return(
                    <div key={i} style={{display:"flex",alignItems:"flex-start",gap:10,padding:"6px 0",position:"relative"}}>
                      <div style={{width:10,height:10,borderRadius:"50%",background:isLogin?C.gn:C.rd,flexShrink:0,marginTop:3,marginLeft:-17,border:`2px solid ${C.bg}`}}/>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                          <span style={{fontSize:14,fontWeight:500,...mono}}>{d.toLocaleTimeString("en-US",{hour:"2-digit",minute:"2-digit",second:"2-digit"})}</span>
                          <span style={{fontSize:12,padding:"2px 8px",borderRadius:3,fontWeight:600,background:isLogin?C.gn+"22":C.rd+"22",color:isLogin?C.gn:C.rd}}>{ev.action}</span>
                          {ev.accessType&&ev.accessType!=="Login"&&ev.accessType!=="Logout"&&(
                            <span style={{fontSize:11,padding:"2px 6px",borderRadius:3,background:C.sfh,color:C.txm,border:`1px solid ${C.bd}`}}>{ev.accessType}</span>
                          )}
                          {durStr&&<span style={{fontSize:11,padding:"2px 6px",borderRadius:3,background:C.cy+"22",color:C.cy,...mono}}>⏱ {durStr}</span>}
                        </div>
                        {ev.info&&<div style={{fontSize:12,color:C.txd,marginTop:2,...mono}}>{ev.info}</div>}
                        {ev.changedata&&<div style={{fontSize:11,color:C.txd,marginTop:1,...mono}}>prev: {ev.changedata}</div>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {!loadingHistory&&!selectedUser&&(
        <div style={{textAlign:"center",padding:40,color:C.txd}}>
          <div style={{fontSize:24,marginBottom:8}}>🔍</div>
          <div style={{fontSize:15}}>Search for a user to view their login history</div>
          <div style={{fontSize:13,marginTop:4}}>Auditing must be enabled in your D365 org</div>
        </div>
      )}
    </div>
  );
}
