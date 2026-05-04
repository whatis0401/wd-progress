import { useState, useEffect, useRef, useCallback } from "react";

// ─── Apps Script API 設定 ────────────────────────────────────
const GAS_URL = "https://script.google.com/macros/s/AKfycbwsiomxJ5rB8dVRciy8OGmU6b0R6dunX8mnXWDwgzhVgwytTu6mOu6DbeBVYC7CRc2tTw/exec";

// 讀取工作表
async function sheetGet(sheetName) {
  const res = await fetch(`${GAS_URL}?sheet=${encodeURIComponent(sheetName)}`);
  if (!res.ok) throw new Error(`Read error: ${res.status}`);
  return res.json();
}

// 寫入工作表
async function sheetPut(sheetName, values) {
  const res = await fetch(GAS_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: JSON.stringify({ sheet: sheetName, values }),
  });
  if (!res.ok) throw new Error(`Write error: ${res.status}`);
  return res.json();
}

// ─── 資料轉換 ─────────────────────────────────────────────────
function rowsToProjects(pRows, tRows, rRows) {
  const tasks   = rowsToTasks(tRows);
  const repairs = rowsToRepairs(rRows);
  return pRows.slice(1).filter(r => r[0]).map(r => ({
    id:       r[0] || "",
    name:     r[1] || "",
    type:     r[2] || "室內",
    status:   r[3] || "規劃中",
    client:   r[4] || "",
    start:    r[5] ? r[5].toString().slice(0,10) : "",
    end:      r[6] ? r[6].toString().slice(0,10) : "",
    members:  r[7] ? r[7].split(",").map(s=>s.trim()) : [],
    archived: r[8] === "TRUE" || r[8] === true,
    tasks:    tasks.filter(t => t.projectId === r[0]),
    repairs:  repairs.filter(rep => rep.projectId === r[0]),
  }));
}

function rowsToTasks(rows) {
  return rows.slice(1).filter(r => r[0]).map(r => ({
    id:        Number(r[0]),
    projectId: r[1] || "",
    name:      r[2] || "",
    owner:     r[3] || "",
    due:       r[4] ? r[4].toString().slice(0,10) : "",
    done:      r[5] === "TRUE" || r[5] === true,
    note:      r[6] || "",
  }));
}

function rowsToRepairs(rows) {
  return rows.slice(1).filter(r => r[0]).map(r => ({
    id:        Number(r[0]),
    projectId: r[1] || "",
    desc:      r[2] || "",
    status:    r[3] || "待安排",
    note:      r[4] || "",
  }));
}

function rowsToMembers(rows) {
  return rows.slice(1).filter(r => r[0] && (r[1] === "TRUE" || r[1] === true)).map(r => r[0]);
}

// 把所有任務攤平成 rows（含 header）
function tasksToRows(projects) {
  const header = ["id","projectId","name","owner","due","done","note"];
  const rows = projects.flatMap(p =>
    p.tasks.map(t => [t.id, p.id, t.name, t.owner, t.due, t.done?"TRUE":"FALSE", t.note||""])
  );
  return [header, ...rows];
}

function repairsToRows(projects) {
  const header = ["id","projectId","desc","status","note"];
  const rows = projects.flatMap(p =>
    (p.repairs||[]).map(r => [r.id, p.id, r.desc, r.status, r.note||""])
  );
  return [header, ...rows];
}

function projectsToRows(projects) {
  const header = ["id","name","type","status","client","start","end","members","archived"];
  const rows = projects.map(p => [
    p.id, p.name, p.type, p.status, p.client||"",
    p.start, p.end, (p.members||[]).join(","), p.archived?"TRUE":"FALSE"
  ]);
  return [header, ...rows];
}

function membersToRows(members) {
  return [["name","active"], ...members.map(m => [m, "TRUE"])];
}

// ─── 色彩系統 ─────────────────────────────────────────────────
function buildColors(hex) {
  let r=parseInt(hex.slice(1,3),16)/255,g=parseInt(hex.slice(3,5),16)/255,b=parseInt(hex.slice(5,7),16)/255;
  const max=Math.max(r,g,b),min=Math.min(r,g,b);
  let h,s,l=(max+min)/2;
  if(max===min){h=s=0;}else{const d=max-min;s=l>0.5?d/(2-max-min):d/(max+min);switch(max){case r:h=(g-b)/d+(g<b?6:0);break;case g:h=(b-r)/d+2;break;default:h=(r-g)/d+4;}h/=6;}
  const hDeg=Math.round(h*360);
  const hsl=(hh,ss,ll)=>{const h2=hh/360,s2=ss/100,l2=ll/100;if(s2===0){const v=Math.round(l2*255);return`#${v.toString(16).padStart(2,'0').repeat(3)}`;}const hue2rgb=(p,q,t)=>{if(t<0)t+=1;if(t>1)t-=1;if(t<1/6)return p+(q-p)*6*t;if(t<1/2)return q;if(t<2/3)return p+(q-p)*(2/3-t)*6;return p;};const q=l2<0.5?l2*(1+s2):l2+s2-l2*s2,p=2*l2-q;const rr=hue2rgb(p,q,h2+1/3),gg=hue2rgb(p,q,h2),bb=hue2rgb(p,q,h2-1/3);return`#${Math.round(rr*255).toString(16).padStart(2,'0')}${Math.round(gg*255).toString(16).padStart(2,'0')}${Math.round(bb*255).toString(16).padStart(2,'0')}`;};
  const sl=Math.round(s*100),ll2=Math.round(l*100);
  return{bg:hsl(hDeg,Math.max(sl-10,5),Math.min(ll2+8,88)),bgSunk:hsl(hDeg,Math.max(sl-12,5),Math.max(ll2-5,30)),bgRaised:hsl(hDeg,Math.max(sl-8,5),Math.min(ll2+14,92)),bgHover:hsl(hDeg,Math.max(sl-6,5),Math.min(ll2+18,95)),border:hsl(hDeg,Math.max(sl-15,5),Math.max(ll2-12,30)),borderLight:hsl(hDeg,Math.max(sl-12,5),Math.max(ll2-4,40)),ink:hsl(hDeg,Math.min(sl+10,40),Math.max(ll2-55,8)),inkMid:hsl(hDeg,Math.min(sl+5,30),Math.max(ll2-42,18)),inkSoft:hsl(hDeg,Math.max(sl-5,10),Math.max(ll2-28,30)),inkFaint:hsl(hDeg,Math.max(sl-10,5),Math.max(ll2-18,40)),accent:hsl(hDeg,Math.min(sl+15,55),Math.max(ll2-40,12)),accentHov:hsl(hDeg,Math.min(sl+12,50),Math.max(ll2-33,18)),accentMid:hsl(hDeg,Math.min(sl+10,45),Math.max(ll2-28,22)),accentText:hsl(hDeg,Math.max(sl-15,5),Math.min(ll2+30,88)),ok:hsl(140,40,Math.max(ll2-35,18)),warn:hsl(20,55,Math.max(ll2-30,25)),today:hsl(30,45,Math.max(ll2-32,20))};
}

const DEFAULT_HEX="#BDC0BA";
let C=buildColors(DEFAULT_HEX);

// ─── 常數 ─────────────────────────────────────────────────────
const STATUS_LIST   = ["規劃中","進行中","暫停","完成"];
const REPAIR_STATUS = ["待安排","已安排","處理中","已完成"];
const SHORT = n => n.slice(1);
const INIT  = n => n[0];

// ─── 工具 ─────────────────────────────────────────────────────
const pct      = t => !t.length?0:Math.round(t.filter(x=>x.done).length/t.length*100);
const daysLeft = e => Math.ceil((new Date(e)-new Date())/86400000);
const typeTag  = t => t==="建築"?"A":"I";
const fmt      = s => { if(!s) return "—"; const d = s.toString().slice(0,10); return d.replace(/-/g,"/"); };
const isPayment= n => n.includes("請款");

function hexToRgb(h){return{r:parseInt(h.slice(1,3),16),g:parseInt(h.slice(3,5),16),b:parseInt(h.slice(5,7),16)};}
function rgbToHex(r,g,b){return`#${Math.round(r).toString(16).padStart(2,'0')}${Math.round(g).toString(16).padStart(2,'0')}${Math.round(b).toString(16).padStart(2,'0')}`;}
function rgbToCmyk(r,g,b){r/=255;g/=255;b/=255;const k=1-Math.max(r,g,b);if(k===1)return{c:0,m:0,y:0,k:100};return{c:Math.round((1-r-k)/(1-k)*100),m:Math.round((1-g-k)/(1-k)*100),y:Math.round((1-b-k)/(1-k)*100),k:Math.round(k*100)};}
function cmykToHex(c,m,y,k){return rgbToHex(255*(1-c/100)*(1-k/100),255*(1-m/100)*(1-k/100),255*(1-y/100)*(1-k/100));}

function ganttRange(items,ks="start",ke="end"){const ds=items.flatMap(p=>[new Date(p[ks]),new Date(p[ke])]);const mn=new Date(Math.min(...ds));mn.setDate(1);const mx=new Date(Math.max(...ds));mx.setMonth(mx.getMonth()+1,1);return{min:mn,max:mx,days:(mx-mn)/86400000};}
function months(s,e){const r=[],c=new Date(s.getFullYear(),s.getMonth(),1);while(c<e){r.push(new Date(c));c.setMonth(c.getMonth()+1);}return r;}

// ─── UI 元件 ──────────────────────────────────────────────────
function Avatar({name,size=20,members}){
  const idx=members?members.indexOf(name):0;
  const hues=[200,140,30,280,340,60];
  const bg=`hsl(${hues[Math.max(idx,0)%hues.length]},30%,35%)`;
  return(<span style={{display:"inline-flex",alignItems:"center",justifyContent:"center",width:size,height:size,borderRadius:"50%",background:bg,fontSize:size*0.44,color:"#e8e8e8",flexShrink:0,fontFamily:"'微軟正黑體','Microsoft JhengHei',sans-serif"}}>{INIT(name)}</span>);
}

function StatusBadge({status}){
  const s={"進行中":{bg:C.accent,color:C.accentText,bd:C.accent},"規劃中":{bg:"transparent",color:C.inkSoft,bd:C.border},"暫停":{bg:"transparent",color:C.inkFaint,bd:C.borderLight},"完成":{bg:C.ok,color:"#e8e8e8",bd:C.ok}}[status]||{bg:"transparent",color:C.inkFaint,bd:C.borderLight};
  return(<span style={{fontSize:10,color:s.color,background:s.bg,border:`1px solid ${s.bd}`,padding:"2px 8px",borderRadius:2,letterSpacing:"0.07em",whiteSpace:"nowrap"}}>{status}</span>);
}

function TabBar({tabs,active,onChange}){
  return(<div style={{display:"flex",borderBottom:`1px solid ${C.border}`}}>{tabs.map(([k,label])=>(<button key={k} onClick={()=>onChange(k)} style={{background:"none",border:"none",borderBottom:`2px solid ${active===k?C.accent:"transparent"}`,color:active===k?C.ink:C.inkFaint,fontSize:12,padding:"7px 16px 10px",cursor:"pointer",letterSpacing:"0.06em",marginBottom:-1,fontFamily:"'微軟正黑體','Microsoft JhengHei',sans-serif",transition:"color 0.15s"}}>{label}</button>))}</div>);
}

function Field({label,children}){return(<div><div style={{fontSize:9,color:C.inkFaint,letterSpacing:"0.14em",marginBottom:6}}>{label}</div>{children}</div>);}

function Modal({title,onClose,children}){
  return(<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.35)",zIndex:100,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}><div style={{background:C.bgRaised,border:`1px solid ${C.border}`,borderRadius:8,width:"100%",maxWidth:480,maxHeight:"85vh",overflow:"auto",boxShadow:"0 8px 32px rgba(0,0,0,0.18)"}}><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"16px 20px",borderBottom:`1px solid ${C.border}`}}><span style={{fontSize:13,color:C.ink,fontWeight:500}}>{title}</span><button onClick={onClose} style={{background:"none",border:"none",color:C.inkFaint,cursor:"pointer",fontSize:18,padding:"2px 6px"}}>×</button></div><div style={{padding:"20px"}}>{children}</div></div></div>);
}

// ─── Saving indicator ─────────────────────────────────────────
function SavingBadge({saving,error}){
  if(!saving&&!error)return null;
  return(<div style={{position:"fixed",bottom:16,right:16,padding:"8px 14px",background:error?C.warn:C.accent,color:error?C.bg:C.accentText,borderRadius:4,fontSize:11,zIndex:50,boxShadow:"0 2px 8px rgba(0,0,0,0.2)"}}>{error?"儲存失敗，請檢查網路":"儲存中…"}</div>);
}

// ─── GanttChart ───────────────────────────────────────────────
function GanttChart({projects,members}){
  const valid=projects.filter(p=>p.start&&p.end);
  if(!valid.length)return null;
  const{min,max,days:td}=ganttRange(valid);
  const ms=months(min,max);
  const today=new Date();
  const tp=Math.max(0,Math.min(100,(today-min)/86400000/td*100));
  const bL=d=>Math.max(0,(new Date(d)-min)/86400000/td*100);
  const bW=(s,e)=>Math.max(0.5,bL(e)-bL(s));
  return(<div style={{background:C.bgRaised,border:`1px solid ${C.border}`,borderRadius:6,overflow:"auto"}}><div style={{minWidth:520}}><div style={{display:"flex",borderBottom:`1px solid ${C.border}`}}><div style={{width:200,flexShrink:0,borderRight:`1px solid ${C.border}`,padding:"9px 14px",fontSize:10,color:C.inkSoft}}>專案</div><div style={{flex:1,display:"flex",position:"relative"}}>{ms.map((m,i)=>(<div key={i} style={{flex:1,padding:"9px 0 9px 6px",fontSize:10,color:C.inkSoft,borderRight:`1px solid ${C.borderLight}`}}>{m.getFullYear()===today.getFullYear()?`${m.getMonth()+1}月`:`${String(m.getFullYear()).slice(2)}/${m.getMonth()+1}`}</div>))}<div style={{position:"absolute",top:0,bottom:0,left:`${tp}%`,width:1,background:C.today,opacity:0.6}}/></div></div>{valid.map((p,pi)=>{const pc=pct(p.tasks);return(<div key={p.id} style={{display:"flex",alignItems:"center",borderBottom:pi<valid.length-1?`1px solid ${C.borderLight}`:"none",minHeight:50}}><div style={{width:200,flexShrink:0,padding:"8px 14px",borderRight:`1px solid ${C.border}`,display:"flex",flexDirection:"column",gap:3}}><div style={{display:"flex",alignItems:"center",gap:6}}><span style={{width:15,height:15,borderRadius:2,background:C.accent,display:"flex",alignItems:"center",justifyContent:"center",fontSize:8,color:C.accentText,flexShrink:0}}>{typeTag(p.type)}</span><span style={{fontSize:12,color:C.ink,fontWeight:500}}>{p.name}</span></div><div style={{fontSize:9,color:C.inkFaint,paddingLeft:21}}>{p.id}</div></div><div style={{flex:1,position:"relative",height:50,display:"flex",alignItems:"center"}}>{ms.map((_,i)=><div key={i} style={{position:"absolute",top:0,bottom:0,left:`${i/ms.length*100}%`,width:1,background:C.borderLight,opacity:0.5}}/>)}<div style={{position:"absolute",top:0,bottom:0,left:`${tp}%`,width:1,background:C.today,opacity:0.3}}/><div style={{position:"absolute",left:`${bL(p.start)}%`,width:`${bW(p.start,p.end)}%`,height:20,borderRadius:3,background:C.bgSunk,border:`1px solid ${C.border}`,overflow:"hidden"}}><div style={{width:`${pc}%`,height:"100%",background:C.accentMid,transition:"width 0.8s"}}/></div>{p.tasks.map(t=>(<div key={t.id} title={`${t.name}·${t.owner}`} style={{position:"absolute",left:`calc(${bL(t.due)}% - 3px)`,width:7,height:7,borderRadius:"50%",background:t.done?C.ok:C.inkSoft,border:`1px solid ${t.done?C.ok:C.border}`,top:"50%",transform:"translateY(-50%)",zIndex:1,cursor:"default"}}/>))}{pc>6&&<span style={{position:"absolute",left:`calc(${bL(p.start)}% + 7px)`,fontSize:9,color:C.accentText,zIndex:2}}>{pc}%</span>}</div></div>);})} <div style={{display:"flex",borderTop:`1px solid ${C.borderLight}`,padding:"5px 0 5px 200px",fontSize:9,color:C.today}}><div style={{flex:1,position:"relative"}}><span style={{position:"absolute",left:`${tp}%`,transform:"translateX(-50%)"}}>TODAY</span></div></div></div></div>);
}

function ProjectGantt({project,members}){
  const tasks=project.tasks;
  if(!tasks.length||!project.start||!project.end)return<div style={{padding:"32px",textAlign:"center",color:C.inkFaint,fontSize:12}}>尚無任務</div>;
  const all=[new Date(project.start),new Date(project.end),...tasks.map(t=>new Date(t.due))];
  let mn=new Date(Math.min(...all));mn.setDate(1);let mx=new Date(Math.max(...all));mx.setMonth(mx.getMonth()+1,1);
  const td=(mx-mn)/86400000,ms=months(mn,mx),today=new Date();
  const tp=Math.max(0,Math.min(100,(today-mn)/86400000/td*100));
  const pOf=d=>Math.max(0,Math.min(100,(new Date(d)-mn)/86400000/td*100));
  return(<div style={{background:C.bgRaised,border:`1px solid ${C.border}`,borderRadius:6,overflow:"auto"}}><div style={{minWidth:460}}><div style={{display:"flex",borderBottom:`1px solid ${C.border}`}}><div style={{width:160,flexShrink:0,borderRight:`1px solid ${C.border}`,padding:"9px 14px",fontSize:10,color:C.inkSoft}}>任務</div><div style={{flex:1,display:"flex",position:"relative"}}>{ms.map((m,i)=><div key={i} style={{flex:1,padding:"9px 0 9px 5px",fontSize:10,color:C.inkSoft,borderRight:`1px solid ${C.borderLight}`}}>{m.getMonth()+1}月</div>)}<div style={{position:"absolute",top:0,bottom:0,left:`${tp}%`,width:1,background:C.today,opacity:0.5}}/></div></div>{tasks.map((t,i)=>{const overdue=!t.done&&new Date(t.due)<today;const dp=pOf(t.due);return(<div key={t.id} style={{display:"flex",alignItems:"center",minHeight:38,borderBottom:i<tasks.length-1?`1px solid ${C.borderLight}`:"none"}}><div style={{width:160,flexShrink:0,padding:"6px 14px",borderRight:`1px solid ${C.border}`,display:"flex",alignItems:"center",gap:8}}><div style={{width:13,height:13,border:`1px solid ${t.done?C.ok:C.border}`,borderRadius:2,background:t.done?C.ok:"transparent",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>{t.done&&<span style={{fontSize:8,color:"#e8e8e8"}}>✓</span>}</div><span style={{fontSize:11,color:t.done?C.inkFaint:C.inkMid,textDecoration:t.done?"line-through":"none",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t.name}</span></div><div style={{flex:1,position:"relative",height:38,display:"flex",alignItems:"center"}}>{ms.map((_,mi)=><div key={mi} style={{position:"absolute",top:0,bottom:0,left:`${mi/ms.length*100}%`,width:1,background:C.borderLight,opacity:0.4}}/>)}<div style={{position:"absolute",top:0,bottom:0,left:`${tp}%`,width:1,background:C.today,opacity:0.3}}/><div title={`期限：${t.due}`} style={{position:"absolute",left:`calc(${dp}% - 5px)`,width:10,height:10,borderRadius:"50%",zIndex:1,background:t.done?C.ok:overdue?C.warn:C.inkSoft,border:`1px solid ${t.done?C.ok:overdue?C.warn:C.border}`}}/><div style={{position:"absolute",left:`calc(${dp}% + 10px)`}}><Avatar name={t.owner} size={16} members={members}/></div><span style={{position:"absolute",left:`calc(${dp}% + 30px)`,fontSize:9,color:C.inkFaint}}>{fmt(t.due)}</span></div></div>);})}</div></div>);
}

function EditTaskRow({task,onSave,onCancel,members}){
  const[f,setF]=useState({name:task.name,owner:task.owner,due:task.due,note:task.note||""});
  return(<div style={{padding:"10px 14px",background:C.bgHover,border:`1px solid ${C.border}`,borderRadius:5,display:"flex",flexDirection:"column",gap:8}}><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}><Field label="任務名稱"><input value={f.name} onChange={e=>setF({...f,name:e.target.value})} style={{...iSt(),padding:"6px 8px"}}/></Field><Field label="負責人"><select value={f.owner} onChange={e=>setF({...f,owner:e.target.value})} style={{...iSt(),padding:"6px 8px"}}>{members.map(m=><option key={m}>{m}</option>)}</select></Field><Field label="期限"><input type="date" value={f.due} onChange={e=>setF({...f,due:e.target.value})} style={{...iSt(),padding:"6px 8px"}}/></Field><Field label="備註"><input value={f.note} onChange={e=>setF({...f,note:e.target.value})} placeholder="選填" style={{...iSt(),padding:"6px 8px"}}/></Field></div><div style={{display:"flex",gap:6,justifyContent:"flex-end"}}><button onClick={()=>onSave(f)} style={{...bSt(C.accent,C.accent,C.accentText),padding:"5px 14px",fontSize:11}}>儲存</button><button onClick={onCancel} style={{...bSt(),padding:"5px 14px",fontSize:11}}>取消</button></div></div>);
}

function bSt(bg,bd,color){bg=bg||C.bgSunk;bd=bd||C.border;color=color||C.inkMid;return{background:bg,border:`1px solid ${bd}`,color,padding:"6px 14px",borderRadius:4,cursor:"pointer",fontSize:12,letterSpacing:"0.04em",fontFamily:"'微軟正黑體','Microsoft JhengHei',sans-serif"};}
function iSt(){return{background:C.bgHover,border:`1px solid ${C.border}`,color:C.ink,padding:"8px 10px",borderRadius:4,fontSize:12,outline:"none",width:"100%",boxSizing:"border-box",fontFamily:"'微軟正黑體','Microsoft JhengHei',sans-serif"};}

// ─── ColorPanel ───────────────────────────────────────────────
function ColorPanel({onClose,onApply,currentHex}){
  const[mode,setMode]=useState("hex");
  const[hex,setHex]=useState(currentHex);
  const[rgb,setRgb]=useState(hexToRgb(currentHex));
  const[cmyk,setCmyk]=useState(()=>{const r=hexToRgb(currentHex);return rgbToCmyk(r.r,r.g,r.b);});
  function syncFromHex(h){if(!/^#[0-9a-fA-F]{6}$/.test(h))return;const r=hexToRgb(h);setRgb(r);setCmyk(rgbToCmyk(r.r,r.g,r.b));setHex(h);}
  function syncFromRgb(r){const h=rgbToHex(r.r,r.g,r.b);setHex(h);setCmyk(rgbToCmyk(r.r,r.g,r.b));setRgb(r);}
  function syncFromCmyk(cm){const h=cmykToHex(cm.c,cm.m,cm.y,cm.k);setHex(h);const r=hexToRgb(h);setRgb(r);setCmyk(cm);}
  const preview=buildColors(hex);
  const presets=["#BDC0BA","#C4B9A8","#A8BAC4","#B8C4A8","#C4A8B8","#C4C4A8","#A8A8A8"];
  return(<Modal title="調整主色調" onClose={onClose}><div style={{marginBottom:16}}><div style={{fontSize:9,color:C.inkFaint,letterSpacing:"0.14em",marginBottom:8}}>預設色票</div><div style={{display:"flex",gap:8,flexWrap:"wrap"}}>{presets.map(c=>(<div key={c} onClick={()=>syncFromHex(c)} style={{width:28,height:28,borderRadius:4,background:c,border:`2px solid ${hex===c?C.accent:C.border}`,cursor:"pointer"}}/>))}</div></div><div style={{display:"flex",alignItems:"center",gap:8,marginBottom:16}}><input type="color" value={hex} onChange={e=>syncFromHex(e.target.value)} style={{width:44,height:44,border:`1px solid ${C.border}`,borderRadius:4,cursor:"pointer",padding:2,background:"none"}}/><span style={{fontSize:11,color:C.inkSoft}}>直接點選顏色</span></div><div style={{display:"flex",gap:4,marginBottom:12}}>{["hex","rgb","cmyk"].map(m=>(<button key={m} onClick={()=>setMode(m)} style={{...bSt(mode===m?C.accent:"transparent",mode===m?C.accent:C.border,mode===m?C.accentText:C.inkSoft),padding:"4px 12px",fontSize:11,textTransform:"uppercase"}}>{m}</button>))}</div>{mode==="hex"&&<Field label="HEX"><input value={hex} onChange={e=>syncFromHex(e.target.value)} placeholder="#BDC0BA" style={iSt()}/></Field>}{mode==="rgb"&&<div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>{["r","g","b"].map(k=>(<Field key={k} label={k.toUpperCase()}><input type="number" min={0} max={255} value={rgb[k]} onChange={e=>syncFromRgb({...rgb,[k]:Number(e.target.value)})} style={iSt()}/></Field>))}</div>}{mode==="cmyk"&&<div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:8}}>{["c","m","y","k"].map(k=>(<Field key={k} label={k.toUpperCase()}><input type="number" min={0} max={100} value={cmyk[k]} onChange={e=>syncFromCmyk({...cmyk,[k]:Number(e.target.value)})} style={iSt()}/></Field>))}</div>}<div style={{marginTop:16,padding:"12px 14px",borderRadius:6,background:preview.bg,border:`1px solid ${preview.border}`}}><div style={{fontSize:10,color:preview.inkFaint,marginBottom:6}}>預覽效果</div><div style={{display:"flex",gap:8,alignItems:"center"}}><span style={{background:preview.accent,color:preview.accentText,fontSize:11,padding:"4px 12px",borderRadius:3}}>按鈕</span><span style={{background:preview.bgRaised,border:`1px solid ${preview.border}`,color:preview.ink,fontSize:11,padding:"4px 12px",borderRadius:3}}>卡片</span><span style={{fontSize:12,color:preview.ink}}>文字色</span></div></div><div style={{display:"flex",gap:8,marginTop:16,justifyContent:"flex-end"}}><button onClick={onClose} style={bSt()}>取消</button><button onClick={()=>onApply(hex)} style={bSt(C.accent,C.accent,C.accentText)}>套用</button></div></Modal>);
}

function MemberPanel({members,onClose,onSave}){
  const[list,setList]=useState([...members]);
  const[newName,setNewName]=useState("");
  return(<Modal title="人員管理" onClose={onClose}><div style={{display:"flex",flexDirection:"column",gap:6,marginBottom:16}}>{list.map((m,i)=>(<div key={i} style={{display:"flex",alignItems:"center",gap:8,padding:"8px 12px",background:C.bg,border:`1px solid ${C.border}`,borderRadius:4}}><Avatar name={m} size={24} members={list}/><span style={{flex:1,fontSize:13,color:C.ink}}>{m}</span><button onClick={()=>setList(list.filter((_,j)=>j!==i))} style={{background:"none",border:"none",color:C.inkFaint,cursor:"pointer",fontSize:15}}>×</button></div>))}</div><div style={{display:"flex",gap:8}}><input value={newName} onChange={e=>setNewName(e.target.value)} placeholder="新增人員姓名" style={{...iSt(),flex:1}} onKeyDown={e=>{if(e.key==="Enter"&&newName.trim()){setList([...list,newName.trim()]);setNewName("");}}} /><button onClick={()=>{if(newName.trim()){setList([...list,newName.trim()]);setNewName("");}}} style={bSt(C.accent,C.accent,C.accentText)}>新增</button></div><div style={{display:"flex",gap:8,marginTop:16,justifyContent:"flex-end"}}><button onClick={onClose} style={bSt()}>取消</button><button onClick={()=>onSave(list)} style={bSt(C.accent,C.accent,C.accentText)}>儲存</button></div></Modal>);
}

function OverdueModal({projects,onClose}){
  const items=projects.flatMap(p=>p.tasks.filter(t=>!t.done&&new Date(t.due)<new Date()).map(t=>({proj:p.name,projId:p.id,task:t.name,owner:t.owner,due:t.due})));
  return(<Modal title={`逾期任務（${items.length}）`} onClose={onClose}>{items.length===0?<div style={{color:C.inkFaint,fontSize:12,textAlign:"center",padding:"20px"}}>目前沒有逾期任務</div>:<div style={{display:"flex",flexDirection:"column",gap:6}}>{items.map((it,i)=>(<div key={i} style={{padding:"10px 14px",background:C.bg,border:`1px solid ${C.border}`,borderRadius:5}}><div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}><span style={{fontSize:12,color:C.ink,fontWeight:500}}>{it.task}</span><span style={{fontSize:10,color:C.warn}}>逾期 {Math.abs(daysLeft(it.due))} 天</span></div><div style={{display:"flex",gap:10,fontSize:11,color:C.inkSoft,flexWrap:"wrap"}}><span>{it.projId} · {it.proj}</span><span>負責：{it.owner}</span><span>期限：{fmt(it.due)}</span></div></div>))}</div>}</Modal>);
}

function PaymentModal({projects,onClose}){
  const items=projects.flatMap(p=>p.tasks.filter(t=>isPayment(t.name)).map(t=>({proj:p.name,projId:p.id,task:t.name,owner:t.owner,due:t.due,done:t.done})));
  return(<Modal title={`工程請款（${items.filter(i=>!i.done).length} 待處理）`} onClose={onClose}>{items.length===0?<div style={{color:C.inkFaint,fontSize:12,textAlign:"center",padding:"20px"}}>目前無請款任務</div>:<div style={{display:"flex",flexDirection:"column",gap:6}}>{items.map((it,i)=>(<div key={i} style={{padding:"10px 14px",background:C.bg,border:`1px solid ${it.done?C.borderLight:C.border}`,borderRadius:5,opacity:it.done?0.55:1}}><div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}><span style={{fontSize:12,color:C.ink,fontWeight:500,textDecoration:it.done?"line-through":"none"}}>{it.task}</span><span style={{fontSize:10,color:it.done?C.ok:daysLeft(it.due)<0?C.warn:C.inkSoft}}>{it.done?"已完成":daysLeft(it.due)<0?`逾期 ${Math.abs(daysLeft(it.due))}天`:`剩 ${daysLeft(it.due)}天`}</span></div><div style={{display:"flex",gap:10,fontSize:11,color:C.inkSoft,flexWrap:"wrap"}}><span>{it.projId} · {it.proj}</span><span>負責：{it.owner}</span><span>期限：{fmt(it.due)}</span></div></div>))}</div>}</Modal>);
}

function RepairModal({projects,onClose,onUpdate}){
  const items=projects.flatMap(p=>(p.repairs||[]).map(r=>({...r,proj:p.name,projId:p.id})));
  return(<Modal title={`修繕案件（${items.filter(i=>i.status!=="已完成").length} 進行中）`} onClose={onClose}>{items.length===0?<div style={{color:C.inkFaint,fontSize:12,textAlign:"center",padding:"20px"}}>目前無修繕記錄</div>:<div style={{display:"flex",flexDirection:"column",gap:6}}>{items.map((it,i)=>(<div key={i} style={{padding:"10px 14px",background:C.bg,border:`1px solid ${C.border}`,borderRadius:5}}><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:it.note?6:0}}><div><div style={{fontSize:12,color:C.ink,fontWeight:500,marginBottom:2}}>{it.desc}</div><div style={{fontSize:11,color:C.inkSoft}}>{it.projId} · {it.proj}</div></div><select value={it.status} onChange={e=>onUpdate(it.projId,it.id,e.target.value)} style={{...iSt(),width:"auto",padding:"4px 8px",fontSize:11}}>{REPAIR_STATUS.map(s=><option key={s}>{s}</option>)}</select></div>{it.note&&<div style={{fontSize:11,color:C.inkFaint,padding:"6px 8px",background:C.bgSunk,borderRadius:3}}>{it.note}</div>}</div>))}</div>}</Modal>);
}

// ─── 主元件 ──────────────────────────────────────────────────
export default function App(){
  const[colorHex,setColorHex]=useState(DEFAULT_HEX);
  const[members,setMembers]=useState([]);
  const[projects,setProjects]=useState([]);
  const[loading,setLoading]=useState(true);
  const[saving,setSaving]=useState(false);
  const[saveError,setSaveError]=useState(false);
  const[view,setView]=useState("overview");
  const[selected,setSelected]=useState(null);
  const[detailTab,setDetailTab]=useState("tasks");
  const[oTab,setOTab]=useState("list");
  const[showAdd,setShowAdd]=useState(false);
  const[editTask,setEditTask]=useState(null);
  const[newTask,setNewTask]=useState({name:"",owner:"",due:"",note:""});
  const[newProj,setNewProj]=useState({name:"",type:"室內",client:"",start:"",end:"",members:[]});
  const[customId,setCustomId]=useState("");
  const[editingId,setEditingId]=useState(false);
  const[mounted,setMounted]=useState(false);
  const[confirmDel,setConfirmDel]=useState(null);
  const[modal,setModal]=useState(null);
  const[showFuncMenu,setShowFuncMenu]=useState(false);
  const[showArchive,setShowArchive]=useState(false);
  const[newRepair,setNewRepair]=useState({desc:"",note:""});
  const[showAddRepair,setShowAddRepair]=useState(false);
  const funcRef=useRef(null);
  const saveTimer=useRef(null);

  useEffect(()=>{setTimeout(()=>setMounted(true),60);},[]);
  useEffect(()=>{C=buildColors(colorHex);},[colorHex]);
  useEffect(()=>{
    function handler(e){if(funcRef.current&&!funcRef.current.contains(e.target))setShowFuncMenu(false);}
    document.addEventListener("mousedown",handler);
    return()=>document.removeEventListener("mousedown",handler);
  },[]);

  // ── 初始載入 ──
  useEffect(()=>{loadAll();},[]);

  async function loadAll(){
    setLoading(true);
    try{
      const[pRows,tRows,rRows,mRows]=await Promise.all([
        sheetGet("Projects"),
        sheetGet("Tasks"),
        sheetGet("Repairs"),
        sheetGet("Members"),
      ]);
      setMembers(rowsToMembers(mRows));
      setProjects(rowsToProjects(pRows,tRows,rRows));
    }catch(e){
      console.error(e);
      setSaveError(true);
      setTimeout(()=>setSaveError(false),4000);
    }finally{setLoading(false);}
  }

  // ── 儲存（debounce 1.5 秒）──
  const scheduleSave=useCallback((updatedProjects,updatedMembers)=>{
    if(saveTimer.current)clearTimeout(saveTimer.current);
    saveTimer.current=setTimeout(async()=>{
      setSaving(true);setSaveError(false);
      try{
        await Promise.all([
          sheetPut("Projects",projectsToRows(updatedProjects||projects)),
          sheetPut("Tasks",tasksToRows(updatedProjects||projects)),
          sheetPut("Repairs",repairsToRows(updatedProjects||projects)),
          ...(updatedMembers?[sheetPut("Members",membersToRows(updatedMembers))]:[] ),
        ]);
      }catch(e){console.error(e);setSaveError(true);setTimeout(()=>setSaveError(false),4000);}
      finally{setSaving(false);}
    },1500);
  },[projects]);

  const proj=selected?projects.find(p=>p.id===selected):null;

  function updateProjects(next){setProjects(next);scheduleSave(next,null);}
  function applyColor(hex){C=buildColors(hex);setColorHex(hex);setModal(null);}
  function saveMembers(list){setMembers(list);scheduleSave(null,list);setModal(null);}

  function updateRepair(pid,rid,status){
    const next=projects.map(p=>p.id===pid?{...p,repairs:(p.repairs||[]).map(r=>r.id===rid?{...r,status}:r)}:p);
    updateProjects(next);
  }

  function addProject(){
    if(!newProj.name||!newProj.start||!newProj.end)return;
    const yr=new Date().getFullYear().toString().slice(2);
    const n=String(projects.filter(p=>p.type===newProj.type).length+1).padStart(2,"0");
    const autoId=`${newProj.type==="建築"?"A":"I"}_${yr}${n}`;
    const finalId=editingId&&customId?customId:autoId;
    const next=[...projects,{...newProj,id:`WD_${finalId}`,status:"規劃中",tasks:[],repairs:[],archived:false}];
    updateProjects(next);
    setNewProj({name:"",type:"室內",client:"",start:"",end:"",members:[]});
    setCustomId("");setEditingId(false);setView("overview");
  }

  function addTask(pid){
    if(!newTask.name||!newTask.due)return;
    const next=projects.map(p=>p.id===pid?{...p,tasks:[...p.tasks,{id:Date.now(),...newTask,done:false}]}:p);
    updateProjects(next);
    setNewTask({name:"",owner:members[0]||"",due:"",note:""});setShowAdd(false);
  }

  function toggle(pid,tid){
    updateProjects(projects.map(p=>p.id===pid?{...p,tasks:p.tasks.map(t=>t.id===tid?{...t,done:!t.done}:t)}:p));
  }

  function delTask(pid,tid){
    updateProjects(projects.map(p=>p.id===pid?{...p,tasks:p.tasks.filter(t=>t.id!==tid)}:p));
    setConfirmDel(null);
  }

  function saveEdit(pid,tid,u){
    updateProjects(projects.map(p=>p.id===pid?{...p,tasks:p.tasks.map(t=>t.id===tid?{...t,...u}:t)}:p));
    setEditTask(null);
  }

  function addRepair(pid){
    if(!newRepair.desc)return;
    updateProjects(projects.map(p=>p.id===pid?{...p,repairs:[...(p.repairs||[]),{id:Date.now(),desc:newRepair.desc,note:newRepair.note,status:"待安排"}]}:p));
    setNewRepair({desc:"",note:""});setShowAddRepair(false);
  }

  function archiveProject(pid){
    updateProjects(projects.map(p=>p.id===pid?{...p,archived:true,status:"完成"}:p));
    goBack();
  }

  function goBack(){setView("overview");setSelected(null);setShowAdd(false);setEditTask(null);setConfirmDel(null);}

  const activeProjects=projects.filter(p=>!p.archived);
  const archivedProjects=projects.filter(p=>p.archived);
  const totalT=activeProjects.reduce((a,p)=>a+p.tasks.length,0);
  const doneT=activeProjects.reduce((a,p)=>a+p.tasks.filter(t=>t.done).length,0);
  const overdueT=activeProjects.reduce((a,p)=>a+p.tasks.filter(t=>!t.done&&new Date(t.due)<new Date()).length,0);
  const repairT=activeProjects.reduce((a,p)=>a+(p.repairs||[]).filter(r=>r.status!=="已完成").length,0);
  const payT=activeProjects.reduce((a,p)=>a+p.tasks.filter(t=>isPayment(t.name)&&!t.done).length,0);

  const yr=new Date().getFullYear().toString().slice(2);
  const n=String(projects.filter(p=>p.type===newProj.type).length+1).padStart(2,"0");
  const autoId=`${newProj.type==="建築"?"A":"I"}_${yr}${n}`;
  const displayId=editingId?customId:autoId;

  if(loading)return(<div style={{minHeight:"100vh",background:C.bg,display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:12}}><div style={{fontSize:13,color:C.inkSoft,letterSpacing:"0.1em"}}>載入中…</div><div style={{fontSize:10,color:C.inkFaint}}>正在從 Google Sheets 讀取資料</div></div>);

  return(
    <div style={{minHeight:"100vh",background:C.bg,color:C.ink,fontFamily:"'微軟正黑體','Microsoft JhengHei',sans-serif",display:"flex",flexDirection:"column"}}>
      <SavingBadge saving={saving} error={saveError}/>

      {modal==="color"&&<ColorPanel onClose={()=>setModal(null)} onApply={applyColor} currentHex={colorHex}/>}
      {modal==="member"&&<MemberPanel members={members} onClose={()=>setModal(null)} onSave={saveMembers}/>}
      {modal==="overdue"&&<OverdueModal projects={activeProjects} onClose={()=>setModal(null)}/>}
      {modal==="payment"&&<PaymentModal projects={activeProjects} onClose={()=>setModal(null)}/>}
      {modal==="repair"&&<RepairModal projects={activeProjects} onClose={()=>setModal(null)} onUpdate={updateRepair}/>}

      {/* Header */}
      <header style={{background:C.bgSunk,borderBottom:`1px solid ${C.border}`,padding:"0 16px",height:52,display:"flex",alignItems:"center",justifyContent:"space-between",position:"sticky",top:0,zIndex:20}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <span style={{fontSize:10,letterSpacing:"0.25em",color:C.inkSoft,fontWeight:500}}>WD</span>
          <span style={{color:C.border,fontSize:16,fontWeight:100}}>|</span>
          <span style={{fontSize:12,color:C.inkMid,letterSpacing:"0.05em"}}>{view==="overview"?"專案進度總表":view==="new"?"新增專案":proj?.name}</span>
          {view==="detail"&&proj&&<StatusBadge status={proj.status}/>}
        </div>
        <div style={{display:"flex",gap:6,alignItems:"center"}}>
          {view!=="overview"&&<button onClick={goBack} style={bSt()}>← 返回</button>}
          {view==="overview"&&<button onClick={()=>setView("new")} style={bSt(C.accent,C.accent,C.accentText)}>＋ 新增專案</button>}
          {view==="detail"&&<button onClick={()=>{setShowAdd(true);setDetailTab("tasks");}} style={bSt(C.accent,C.accent,C.accentText)}>＋ 新增任務</button>}
          <div style={{position:"relative"}} ref={funcRef}>
            <button onClick={()=>setShowFuncMenu(!showFuncMenu)} style={{...bSt(),padding:"6px 10px",fontSize:14}}>⚙&#xFE0E;</button>
            {showFuncMenu&&(<div style={{position:"absolute",right:0,top:"calc(100% + 6px)",background:C.bgRaised,border:`1px solid ${C.border}`,borderRadius:6,minWidth:140,boxShadow:"0 4px 16px rgba(0,0,0,0.12)",zIndex:30}}>{[{icon:"🎨",label:"調整配色",action:()=>{setModal("color");setShowFuncMenu(false);}},{icon:"👥",label:"人員管理",action:()=>{setModal("member");setShowFuncMenu(false);}},{icon:"🔄",label:"重新整理",action:()=>{loadAll();setShowFuncMenu(false);}}].map(item=>(<button key={item.label} onClick={item.action} style={{display:"flex",alignItems:"center",gap:8,width:"100%",padding:"10px 14px",background:"none",border:"none",color:C.inkMid,cursor:"pointer",fontSize:12,textAlign:"left",fontFamily:"'微軟正黑體','Microsoft JhengHei',sans-serif"}}><span>{item.icon}</span><span>{item.label}</span></button>))}</div>)}
          </div>
        </div>
      </header>

      <main style={{flex:1,padding:"14px",maxWidth:1060,width:"100%",margin:"0 auto",boxSizing:"border-box"}}>

        {/* ══ 總表 ══ */}
        {view==="overview"&&(<div style={{opacity:mounted?1:0,transition:"opacity 0.5s"}}>
          <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:8,marginBottom:20}}>
            {[{label:"進行中",value:activeProjects.filter(p=>p.status==="進行中").length,sub:"個專案",click:null},{label:"任務完成",value:`${doneT}／${totalT}`,sub:"",click:null},{label:"逾期任務",value:overdueT,sub:"個",warn:overdueT>0,click:()=>setModal("overdue")},{label:"修繕進行",value:repairT,sub:"項",warn:repairT>0,click:()=>setModal("repair")},{label:"待請款",value:payT,sub:"筆",warn:payT>0,click:()=>setModal("payment")}].map(s=>(<div key={s.label} onClick={s.click||undefined} style={{background:C.bgRaised,border:`1px solid ${s.warn?"#A07060":C.border}`,borderRadius:6,padding:"12px 14px",boxShadow:"0 1px 3px rgba(0,0,0,0.08)",cursor:s.click?"pointer":"default",transition:"background 0.15s"}} onMouseEnter={e=>{if(s.click)e.currentTarget.style.background=C.bgHover;}} onMouseLeave={e=>{if(s.click)e.currentTarget.style.background=C.bgRaised;}}><div style={{fontSize:22,fontWeight:300,color:s.warn?C.warn:C.ink,letterSpacing:"-0.02em"}}>{s.value}</div><div style={{fontSize:9,color:C.inkFaint,marginTop:3,letterSpacing:"0.1em"}}>{s.label}{s.sub?` ${s.sub}`:""}</div>{s.click&&<div style={{fontSize:9,color:C.inkFaint,marginTop:2}}>點擊查看 →</div>}</div>))}
          </div>
          <TabBar tabs={[["list","清單"],["gantt","甘特圖"]]} active={oTab} onChange={setOTab}/>
          {oTab==="list"&&(<div style={{display:"flex",flexDirection:"column",gap:6,marginTop:8}}>
            {activeProjects.map((p,i)=>{const pc=pct(p.tasks);const days=daysLeft(p.end);return(<div key={p.id} onClick={()=>{setSelected(p.id);setView("detail");setDetailTab("tasks");}} style={{padding:"13px 14px",background:C.bgRaised,border:`1px solid ${C.border}`,borderRadius:6,cursor:"pointer",boxShadow:"0 1px 2px rgba(0,0,0,0.06)",opacity:mounted?1:0,transform:mounted?"none":"translateY(5px)",transition:`opacity 0.4s ${i*0.06}s, transform 0.4s ${i*0.06}s, background 0.15s`}} onMouseEnter={e=>e.currentTarget.style.background=C.bgHover} onMouseLeave={e=>e.currentTarget.style.background=C.bgRaised}><div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}><span style={{width:20,height:20,borderRadius:3,background:C.accent,display:"flex",alignItems:"center",justifyContent:"center",fontSize:8,color:C.accentText,flexShrink:0}}>{typeTag(p.type)}</span><span style={{fontSize:10,color:C.inkFaint,letterSpacing:"0.04em",flexShrink:0}}>{p.id}</span><span style={{fontSize:13,color:C.ink,fontWeight:500,flex:1}}>{p.name}</span><StatusBadge status={p.status}/></div><div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}><div style={{flex:1,height:3,background:C.bgSunk,borderRadius:2}}><div style={{width:`${pc}%`,height:"100%",background:pc===100?C.ok:C.accentMid,borderRadius:2,transition:"width 0.7s"}}/></div><span style={{fontSize:10,color:C.inkFaint,flexShrink:0}}>{pc}%</span><span style={{fontSize:10,color:C.inkFaint,flexShrink:0}}>·</span><span style={{fontSize:10,color:C.inkSoft,flexShrink:0}}>{fmt(p.end)}</span><span style={{fontSize:10,color:days<0?C.warn:days<30?"#7A6A30":C.inkFaint,flexShrink:0}}>{days<0?`逾 ${Math.abs(days)}天`:`剩 ${days}天`}</span></div>{p.members&&p.members.length>0&&(<div style={{display:"flex",alignItems:"center",gap:4,paddingLeft:2}}><span style={{fontSize:9,color:C.inkFaint,marginRight:2}}>負責</span>{p.members.map((m,mi)=>(<div key={mi} style={{display:"flex",alignItems:"center",gap:3}}><Avatar name={m} size={16} members={members}/><span style={{fontSize:10,color:C.inkSoft}}>{SHORT(m)}</span></div>))}</div>)}</div>);})}
          </div>)}
          {oTab==="gantt"&&<div style={{marginTop:4}}><GanttChart projects={activeProjects} members={members}/></div>}
          {archivedProjects.length>0&&(<div style={{marginTop:20}}><button onClick={()=>setShowArchive(!showArchive)} style={{display:"flex",alignItems:"center",gap:6,background:"none",border:"none",color:C.inkFaint,cursor:"pointer",fontSize:11,letterSpacing:"0.08em",padding:"6px 0",fontFamily:"'微軟正黑體','Microsoft JhengHei',sans-serif"}}><span style={{transition:"transform 0.2s",display:"inline-block",transform:showArchive?"rotate(90deg)":"rotate(0deg)"}}>▶</span>封存案件（{archivedProjects.length}）</button>{showArchive&&(<div style={{display:"flex",flexDirection:"column",gap:4,marginTop:6}}>{archivedProjects.map(p=>(<div key={p.id} style={{padding:"10px 14px",background:C.bgSunk,border:`1px solid ${C.borderLight}`,borderRadius:5,opacity:0.65,display:"flex",alignItems:"center",gap:8}}><span style={{width:18,height:18,borderRadius:2,background:C.inkFaint,display:"flex",alignItems:"center",justifyContent:"center",fontSize:7,color:C.bg}}>{typeTag(p.type)}</span><span style={{fontSize:10,color:C.inkFaint}}>{p.id}</span><span style={{fontSize:12,color:C.inkSoft,flex:1}}>{p.name}</span><span style={{fontSize:10,color:C.inkFaint}}>{fmt(p.end)}</span></div>))}</div>)}</div>)}
        </div>)}

        {/* ══ 詳情 ══ */}
        {view==="detail"&&proj&&(<div style={{opacity:mounted?1:0,transition:"opacity 0.3s"}}>
          <div style={{background:C.bgRaised,border:`1px solid ${C.border}`,borderRadius:6,padding:"14px 18px",marginBottom:14,boxShadow:"0 1px 3px rgba(0,0,0,0.07)"}}><div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12,marginBottom:10}}>{[["案件編號",proj.id],["業主",proj.client||"—"],["類型",proj.type]].map(([l,v])=>(<div key={l}><div style={{fontSize:9,color:C.inkFaint,letterSpacing:"0.12em",marginBottom:4}}>{l}</div><div style={{fontSize:12,color:C.inkMid}}>{v}</div></div>))}</div><div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:12}}>{[["開始",fmt(proj.start)],["預計完成",fmt(proj.end)]].map(([l,v])=>(<div key={l}><div style={{fontSize:9,color:C.inkFaint,letterSpacing:"0.12em",marginBottom:4}}>{l}</div><div style={{fontSize:12,color:C.inkMid}}>{v}</div></div>))}</div></div>
          <div style={{display:"flex",gap:6,marginBottom:14,alignItems:"center",flexWrap:"wrap"}}><span style={{fontSize:9,color:C.inkFaint,letterSpacing:"0.12em",marginRight:4}}>狀態</span>{STATUS_LIST.map(s=>(<button key={s} onClick={()=>updateProjects(projects.map(p=>p.id===proj.id?{...p,status:s}:p))} style={{...bSt(proj.status===s?C.accent:"transparent",proj.status===s?C.accent:C.border,proj.status===s?C.accentText:C.inkSoft),padding:"4px 10px",fontSize:11}}>{s}</button>))}<div style={{flex:1}}/><button onClick={()=>archiveProject(proj.id)} style={{...bSt(),padding:"4px 10px",fontSize:11,color:C.warn}}>封存案件</button></div>
          <div style={{marginBottom:16}}><div style={{display:"flex",justifyContent:"space-between",marginBottom:5}}><span style={{fontSize:9,color:C.inkFaint,letterSpacing:"0.12em"}}>整體進度</span><span style={{fontSize:10,color:C.inkSoft}}>{proj.tasks.filter(t=>t.done).length}/{proj.tasks.length} 完成 · {pct(proj.tasks)}%</span></div><div style={{height:3,background:C.bgSunk,borderRadius:2}}><div style={{width:`${pct(proj.tasks)}%`,height:"100%",background:C.accentMid,borderRadius:2,transition:"width 0.8s"}}/></div></div>
          <TabBar tabs={[["tasks","任務清單"],["repair","修繕記錄"],["gantt_local","甘特圖"]]} active={detailTab} onChange={setDetailTab}/>

          {detailTab==="tasks"&&(<div style={{marginTop:6}}>
            {showAdd&&(<div style={{background:C.bgRaised,border:`1px solid ${C.border}`,borderRadius:6,padding:"12px 14px",marginBottom:8,boxShadow:"0 1px 3px rgba(0,0,0,0.07)"}}><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8}}><Field label="任務名稱"><input placeholder="輸入任務名稱" value={newTask.name} onChange={e=>setNewTask({...newTask,name:e.target.value})} style={iSt()}/></Field><Field label="負責人"><select value={newTask.owner||members[0]} onChange={e=>setNewTask({...newTask,owner:e.target.value})} style={iSt()}>{members.map(m=><option key={m}>{m}</option>)}</select></Field><Field label="期限"><input type="date" value={newTask.due} onChange={e=>setNewTask({...newTask,due:e.target.value})} style={iSt()}/></Field><Field label="備註"><input placeholder="選填" value={newTask.note} onChange={e=>setNewTask({...newTask,note:e.target.value})} style={iSt()}/></Field></div><div style={{display:"flex",gap:6,justifyContent:"flex-end"}}><button onClick={()=>addTask(proj.id)} style={bSt(C.accent,C.accent,C.accentText)}>確認新增</button><button onClick={()=>setShowAdd(false)} style={bSt()}>取消</button></div></div>)}
            <div style={{display:"flex",flexDirection:"column",gap:4}}>
              {proj.tasks.map(t=>{const overdue=!t.done&&new Date(t.due)<new Date();const isPay=isPayment(t.name);if(editTask===t.id)return<EditTaskRow key={t.id} task={t} onSave={u=>saveEdit(proj.id,t.id,u)} onCancel={()=>setEditTask(null)} members={members}/>;return(<div key={t.id} style={{padding:"11px 13px",background:C.bgRaised,border:`1px solid ${isPay?"#A07060":C.border}`,borderRadius:5,opacity:t.done?0.5:1,transition:"opacity 0.2s",boxShadow:"0 1px 2px rgba(0,0,0,0.05)"}}><div style={{display:"flex",alignItems:"center",gap:8,marginBottom:5}}><div onClick={()=>toggle(proj.id,t.id)} style={{width:15,height:15,border:`1.5px solid ${t.done?C.ok:C.border}`,borderRadius:3,cursor:"pointer",background:t.done?C.ok:"transparent",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>{t.done&&<span style={{fontSize:9,color:"#e8e8e8"}}>✓</span>}</div><span style={{fontSize:13,color:t.done?C.inkFaint:C.ink,textDecoration:t.done?"line-through":"none",flex:1}}>{t.name}</span>{isPay&&<span style={{fontSize:9,color:C.warn,border:`1px solid ${C.warn}`,padding:"1px 5px",borderRadius:2,flexShrink:0}}>請款</span>}<span style={{fontSize:10,color:t.done?C.inkFaint:overdue?C.warn:C.inkSoft,letterSpacing:"0.05em",flexShrink:0}}>{t.done?"完成":overdue?"逾期":"進行中"}</span><button onClick={()=>{setEditTask(t.id);setConfirmDel(null);}} style={{background:"none",border:"none",color:C.inkFaint,cursor:"pointer",fontSize:13,padding:"2px 3px",flexShrink:0}}>✎</button>{confirmDel===t.id?<button onClick={()=>delTask(proj.id,t.id)} style={{background:"none",border:"none",color:C.warn,cursor:"pointer",fontSize:10,padding:"2px 3px",flexShrink:0}}>確認刪除</button>:<button onClick={()=>setConfirmDel(t.id)} style={{background:"none",border:"none",color:C.border,cursor:"pointer",fontSize:15,padding:"2px 3px",flexShrink:0}}>×</button>}</div><div style={{display:"flex",alignItems:"center",gap:8,paddingLeft:23}}><Avatar name={t.owner} size={15} members={members}/><span style={{fontSize:11,color:C.inkSoft}}>{SHORT(t.owner)}</span><span style={{fontSize:10,color:C.inkFaint}}>·</span><span style={{fontSize:11,color:overdue?C.warn:C.inkSoft,flexShrink:0}}>{fmt(t.due)}{overdue?" ▲":""}</span>{t.note&&<><span style={{fontSize:10,color:C.inkFaint}}>·</span><span style={{fontSize:11,color:C.inkFaint,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t.note}</span></>}</div></div>);})}
              {proj.tasks.length===0&&<div style={{padding:"32px",textAlign:"center",color:C.inkFaint,fontSize:12}}>尚無任務</div>}
            </div>
          </div>)}

          {detailTab==="repair"&&(<div style={{marginTop:6}}><div style={{display:"flex",justifyContent:"flex-end",marginBottom:8}}><button onClick={()=>setShowAddRepair(!showAddRepair)} style={bSt(C.accent,C.accent,C.accentText)}>＋ 新增修繕</button></div>{showAddRepair&&(<div style={{background:C.bgRaised,border:`1px solid ${C.border}`,borderRadius:6,padding:"12px 14px",marginBottom:8}}><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8}}><Field label="修繕項目"><input placeholder="例：浴室防水滲漏" value={newRepair.desc} onChange={e=>setNewRepair({...newRepair,desc:e.target.value})} style={iSt()}/></Field><Field label="備註"><input placeholder="選填" value={newRepair.note} onChange={e=>setNewRepair({...newRepair,note:e.target.value})} style={iSt()}/></Field></div><div style={{display:"flex",gap:6,justifyContent:"flex-end"}}><button onClick={()=>addRepair(proj.id)} style={bSt(C.accent,C.accent,C.accentText)}>確認</button><button onClick={()=>setShowAddRepair(false)} style={bSt()}>取消</button></div></div>)}<div style={{display:"flex",flexDirection:"column",gap:4}}>{(proj.repairs||[]).map(r=>(<div key={r.id} style={{padding:"12px 14px",background:C.bgRaised,border:`1px solid ${C.border}`,borderRadius:5,boxShadow:"0 1px 2px rgba(0,0,0,0.05)",opacity:r.status==="已完成"?0.5:1}}><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:r.note?6:0}}><span style={{fontSize:13,color:C.ink,fontWeight:500}}>{r.desc}</span><select value={r.status} onChange={e=>updateRepair(proj.id,r.id,e.target.value)} style={{...iSt(),width:"auto",padding:"4px 8px",fontSize:11}}>{REPAIR_STATUS.map(s=><option key={s}>{s}</option>)}</select></div>{r.note&&<div style={{fontSize:11,color:C.inkFaint,padding:"5px 8px",background:C.bgSunk,borderRadius:3}}>{r.note}</div>}</div>))}{(proj.repairs||[]).length===0&&<div style={{padding:"32px",textAlign:"center",color:C.inkFaint,fontSize:12}}>尚無修繕記錄</div>}</div></div>)}

          {detailTab==="gantt_local"&&<div style={{marginTop:6}}><ProjectGantt project={proj} members={members}/></div>}
        </div>)}

        {/* ══ 新增專案 ══ */}
        {view==="new"&&(<div style={{maxWidth:540,opacity:mounted?1:0,transition:"opacity 0.3s"}}>
          <div style={{fontSize:9,color:C.inkFaint,letterSpacing:"0.22em",marginBottom:22}}>NEW PROJECT</div>
          <div style={{display:"flex",flexDirection:"column",gap:16}}>
            <Field label="專案名稱"><input placeholder="例：山居案" value={newProj.name} onChange={e=>setNewProj({...newProj,name:e.target.value})} style={iSt()}/></Field>
            <Field label="業主 / 委託方"><input placeholder="選填" value={newProj.client} onChange={e=>setNewProj({...newProj,client:e.target.value})} style={iSt()}/></Field>
            <Field label="類型"><div style={{display:"flex",gap:8}}>{["室內","建築"].map(t=>(<button key={t} onClick={()=>setNewProj({...newProj,type:t})} style={{...bSt(newProj.type===t?C.accent:"transparent",newProj.type===t?C.accent:C.border,newProj.type===t?C.accentText:C.inkMid),flex:1,padding:"9px"}}>{t}</button>))}</div></Field>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}><Field label="開始日期"><input type="date" value={newProj.start} onChange={e=>setNewProj({...newProj,start:e.target.value})} style={iSt()}/></Field><Field label="預計完成"><input type="date" value={newProj.end} onChange={e=>setNewProj({...newProj,end:e.target.value})} style={iSt()}/></Field></div>
            <Field label="負責人員"><div style={{display:"flex",flexWrap:"wrap",gap:6}}>{members.map(m=>{const sel=newProj.members.includes(m);return(<button key={m} onClick={()=>setNewProj({...newProj,members:sel?newProj.members.filter(x=>x!==m):[...newProj.members,m]})} style={{...bSt(sel?C.accent:"transparent",sel?C.accent:C.border,sel?C.accentText:C.inkMid),padding:"5px 12px",display:"flex",alignItems:"center",gap:5}}><Avatar name={m} size={14} members={members}/>{m}</button>);})}</div></Field>
            <div><div style={{fontSize:9,color:C.inkFaint,letterSpacing:"0.14em",marginBottom:6}}>案件編號</div><div style={{display:"flex",alignItems:"center",gap:8,padding:"10px 14px",background:C.bgRaised,border:`1px solid ${C.border}`,borderRadius:4}}><span style={{fontSize:11,color:C.inkSoft,flex:1}}>WD_{editingId?<input value={customId} onChange={e=>setCustomId(e.target.value)} style={{...iSt(),display:"inline-block",width:100,padding:"2px 6px",fontSize:11,marginLeft:2}}/>:<span style={{color:C.inkMid,fontWeight:500}}>{displayId}</span>}</span><button onClick={()=>{setEditingId(!editingId);if(!editingId)setCustomId(displayId);}} style={{...bSt(),padding:"4px 10px",fontSize:11}}>{editingId?"確認":"修改"}</button></div><div style={{fontSize:10,color:C.inkFaint,marginTop:4}}>格式：類型_年度＋件號，例如 I_2603</div></div>
            <button onClick={addProject} style={{...bSt(C.accent,C.accent,C.accentText),padding:"12px",fontSize:13}}>建立專案</button>
          </div>
        </div>)}
      </main>

      <footer style={{background:C.bgSunk,borderTop:`1px solid ${C.border}`,padding:"9px 16px",display:"flex",justifyContent:"space-between",fontSize:10,color:C.inkFaint,letterSpacing:"0.08em"}}>
        <span>何為設計有限公司 · whatis Design</span>
        <span>工作進度追蹤系統 v0.5{saving?" · 儲存中…":""}</span>
      </footer>
    </div>
  );
}
