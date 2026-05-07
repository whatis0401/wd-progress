import { useState, useEffect, useRef, useCallback } from "react";

// ─── Apps Script API ──────────────────────────────────────────
const GAS_URL = "https://script.google.com/macros/s/AKfycbwsiomxJ5rB8dVRciy8OGmU6b0R6dunX8mnXWDwgzhVgwytTu6mOu6DbeBVYC7CRc2tTw/exec";
async function uploadImage(file){
  return new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onload=async(e)=>{
      try{
        const base64=e.target.result.split(",")[1];
        const mimeType=file.type;
        const fileName=`wd_${Date.now()}_${file.name}`;
        const res=await fetch(GAS_URL,{
          method:"POST",
          headers:{"Content-Type":"text/plain"},
          body:JSON.stringify({action:"uploadImage",base64,fileName,mimeType})
        });
        const data=await res.json();
        resolve(data);
      }catch(err){reject(err);}
    };
    reader.readAsDataURL(file);
  });
}

async function deleteImage(fileId){
  await fetch(GAS_URL,{
    method:"POST",
    headers:{"Content-Type":"text/plain"},
    body:JSON.stringify({action:"deleteImage",fileId})
  });
}

async function sheetGet(s){const r=await fetch(`${GAS_URL}?sheet=${encodeURIComponent(s)}`);if(!r.ok)throw new Error(r.status);return r.json();}
async function sheetPut(s,v){const r=await fetch(GAS_URL,{method:"POST",headers:{"Content-Type":"text/plain"},body:JSON.stringify({sheet:s,values:v})});if(!r.ok)throw new Error(r.status);return r.json();}

// ─── 資料轉換 ─────────────────────────────────────────────────
const sliceDate = s => s ? s.toString().slice(0,10) : "";

function rowsToProjects(pRows,tRows,rRows){
  const tasks=rowsToTasks(tRows), repairs=rowsToRepairs(rRows);
  return pRows.slice(1).filter(r=>r[0]).map(r=>({
    id:r[0]||"", name:r[1]||"", type:r[2]||"室內", status:r[3]||"規劃中",
    client:r[4]||"", clientDetail:r[9]||"",
    start:sliceDate(r[5]), end:sliceDate(r[6]),
    members:r[7]?r[7].split(",").map(s=>s.trim()):[],
    archived:r[8]==="TRUE"||r[8]===true,
    milestones:r[10]?(() =>{try{return JSON.parse(r[10]);}catch(e){return{design:defaultDesignMS(),construction:defaultConstructionMS()};}})():{design:defaultDesignMS(),construction:defaultConstructionMS()},
    template:r[11]||"",
    tasks:tasks.filter(t=>t.projectId===r[0]),
    repairs:repairs.filter(rep=>rep.projectId===r[0]),
  }));
}
function rowsToTasks(rows){
  // 自動偵測欄位格式：第一列是 header
  const header=rows[0]||[];
  const ownerIdx=header.findIndex(h=>h==="owners"||h==="owner"); // 相容新舊格式
  const imagesIdx=header.findIndex(h=>h==="images");

  return rows.slice(1).filter(r=>r[0]).map(r=>({
    id:Number(r[0]), projectId:r[1]||"", name:r[2]||"",
    // 相容：owner 舊格式（單一字串）或 owners 新格式（逗號分隔）
    owners:r[ownerIdx>=0?ownerIdx:3]?r[ownerIdx>=0?ownerIdx:3].split(",").map(s=>s.trim()).filter(Boolean):[],
    due:sliceDate(r[4]), done:r[5]==="TRUE"||r[5]===true, note:r[6]||"",
    category:r[7]||"設計",
    subtasks:r[8]?(() => { try { const p=JSON.parse(r[8]); return Array.isArray(p)?p:[]; } catch(e){ return []; } })():[],
    updatedAt:r[9]||"",
    images:imagesIdx>=0&&r[imagesIdx]?(() => { try { const p=JSON.parse(r[imagesIdx]); return Array.isArray(p)?p:[]; } catch(e){ return []; } })():[],
  }));
}
function rowsToRepairs(rows){
  return rows.slice(1).filter(r=>r[0]).map(r=>({
    id:Number(r[0]), projectId:r[1]||"", desc:r[2]||"", status:r[3]||"待安排", note:r[4]||"",
    assignedDate:sliceDate(r[5]), owner:r[6]||"",
  }));
}
function rowsToMembers(rows){return rows.slice(1).filter(r=>r[0]&&(r[1]==="TRUE"||r[1]===true)).map(r=>r[0]);}
function rowsToTemplates(rows){return rows.slice(1).filter(r=>r[0]).map(r=>({name:r[0],tasks:r[1]?(() =>{try{const p=JSON.parse(r[1]);return Array.isArray(p)?p:[];}catch(e){return[];}})():[]}));}

function projectsToRows(projects){
  const h=["id","name","type","status","client","start","end","members","archived","clientDetail","milestones","template"];
  return[h,...projects.map(p=>[p.id,p.name,p.type,p.status,p.client||"",p.start,p.end,(p.members||[]).join(","),p.archived?"TRUE":"FALSE",p.clientDetail||"",JSON.stringify(p.milestones||{}),p.template||""])];
}
function tasksToRows(projects){
  const h=["id","projectId","name","owners","due","done","note","category","subtasks","updatedAt","images"];
  return[h,...projects.flatMap(p=>p.tasks.map(t=>[t.id,p.id,t.name,(t.owners||[]).join(","),t.due||"",t.done?"TRUE":"FALSE",t.note||"",t.category||"設計",JSON.stringify(t.subtasks||[]),t.updatedAt||"",JSON.stringify(t.images||[])]))];
}
function repairsToRows(projects){
  const h=["id","projectId","desc","status","note","assignedDate","owner"];
  return[h,...projects.flatMap(p=>(p.repairs||[]).map(r=>[r.id,p.id,r.desc,r.status,r.note||"",r.assignedDate||"",r.owner||""]))];
}
function membersToRows(members){return[["name","active"],...members.map(m=>[m,"TRUE"])];}
function templatesToRows(templates){return[["name","tasks"],...templates.map(t=>[t.name,JSON.stringify(t.tasks)])];}

// ─── 預設里程碑 ───────────────────────────────────────────────
function defaultDesignMS(){return[{id:1,label:"簽約",done:false},{id:2,label:"初步設計完成",done:false},{id:3,label:"細部設計完成",done:false},{id:4,label:"總體設計完成",done:false}];}
function defaultConstructionMS(){return[{id:1,label:"簽約",done:false},{id:2,label:"基礎工程進場",done:false},{id:3,label:"結構工程進場",done:false},{id:4,label:"細部工程進場",done:false},{id:5,label:"完工",done:false}];}

// ─── 色彩系統 ─────────────────────────────────────────────────
function buildColors(hex){
  let r=parseInt(hex.slice(1,3),16)/255,g=parseInt(hex.slice(3,5),16)/255,b=parseInt(hex.slice(5,7),16)/255;
  const max=Math.max(r,g,b),min=Math.min(r,g,b);let h,s,l=(max+min)/2;
  if(max===min){h=s=0;}else{const d=max-min;s=l>0.5?d/(2-max-min):d/(max+min);switch(max){case r:h=(g-b)/d+(g<b?6:0);break;case g:h=(b-r)/d+2;break;default:h=(r-g)/d+4;}h/=6;}
  const hDeg=Math.round(h*360);
  const hsl=(hh,ss,ll)=>{const h2=hh/360,s2=ss/100,l2=ll/100;if(s2===0){const v=Math.round(l2*255);return`#${v.toString(16).padStart(2,"0").repeat(3)}`;}const q=l2<0.5?l2*(1+s2):l2+s2-l2*s2,p=2*l2-q;const c=(t)=>{if(t<0)t+=1;if(t>1)t-=1;if(t<1/6)return p+(q-p)*6*t;if(t<1/2)return q;if(t<2/3)return p+(q-p)*(2/3-t)*6;return p;};return`#${[h2+1/3,h2,h2-1/3].map(t=>Math.round(c(t)*255).toString(16).padStart(2,"0")).join("")}`;};
  const sl=Math.round(s*100),ll2=Math.round(l*100);
  return{bg:hsl(hDeg,Math.max(sl-10,5),Math.min(ll2+8,88)),bgSunk:hsl(hDeg,Math.max(sl-12,5),Math.max(ll2-5,30)),bgRaised:hsl(hDeg,Math.max(sl-8,5),Math.min(ll2+14,92)),bgHover:hsl(hDeg,Math.max(sl-6,5),Math.min(ll2+18,95)),border:hsl(hDeg,Math.max(sl-15,5),Math.max(ll2-12,30)),borderLight:hsl(hDeg,Math.max(sl-12,5),Math.max(ll2-4,40)),ink:hsl(hDeg,Math.min(sl+10,40),Math.max(ll2-55,8)),inkMid:hsl(hDeg,Math.min(sl+5,30),Math.max(ll2-42,18)),inkSoft:hsl(hDeg,Math.max(sl-5,10),Math.max(ll2-28,30)),inkFaint:hsl(hDeg,Math.max(sl-10,5),Math.max(ll2-18,40)),accent:hsl(hDeg,Math.min(sl+15,55),Math.max(ll2-40,12)),accentMid:hsl(hDeg,Math.min(sl+10,45),Math.max(ll2-28,22)),accentText:hsl(hDeg,Math.max(sl-15,5),Math.min(ll2+30,88)),ok:hsl(140,40,Math.max(ll2-35,18)),warn:hsl(20,55,Math.max(ll2-30,25)),today:hsl(30,45,Math.max(ll2-32,20))};
}
const DEFAULT_HEX="#BDC0BA";
let C=buildColors(DEFAULT_HEX);

// ─── 常數 ─────────────────────────────────────────────────────
const STATUS_LIST=["規劃中","進行中","暫停","完成"];
const ADMIN_PASSWORD="whatis2601";
const REPAIR_STATUS=["待安排","已安排","處理中","已完成"];
const TASK_CATEGORIES=["設計","工程","行政"];
const SHORT=n=>(n&&n.length>1)?n.slice(1):n||"?";
const INIT=n=>(n&&n.length>0)?n[0]:"?";

const pct=t=>!t.length?0:Math.round(t.filter(x=>x.done).length/t.length*100);
const daysLeft=e=>{if(!e)return 0;const d=Math.ceil((new Date(e)-new Date())/86400000);return isNaN(d)?0:d;};
const typeTag=t=>t==="建築"?"A":"I";
const fmt=s=>{if(!s)return"—";return s.toString().slice(0,10).replace(/-/g,"/");};
const isPayment=n=>n&&n.includes("請款");
function hexToRgb(h){return{r:parseInt(h.slice(1,3),16),g:parseInt(h.slice(3,5),16),b:parseInt(h.slice(5,7),16)};}
function rgbToHex(r,g,b){return`#${[r,g,b].map(v=>Math.round(v).toString(16).padStart(2,"0")).join("")}`;}
function rgbToCmyk(r,g,b){r/=255;g/=255;b/=255;const k=1-Math.max(r,g,b);if(k===1)return{c:0,m:0,y:0,k:100};return{c:Math.round((1-r-k)/(1-k)*100),m:Math.round((1-g-k)/(1-k)*100),y:Math.round((1-b-k)/(1-k)*100),k:Math.round(k*100)};}
function cmykToHex(c,m,y,k){return rgbToHex(255*(1-c/100)*(1-k/100),255*(1-m/100)*(1-k/100),255*(1-y/100)*(1-k/100));}
function ganttRange(items){const validItems=items.filter(p=>p.start&&p.end);if(!validItems.length){const now=new Date();return{min:now,max:now,days:1};}const ds=validItems.flatMap(p=>[new Date(p.start),new Date(p.end)]).filter(d=>!isNaN(d));if(!ds.length){const now=new Date();return{min:now,max:now,days:1};}const mn=new Date(Math.min(...ds));mn.setDate(1);const mx=new Date(Math.max(...ds));mx.setMonth(mx.getMonth()+1,1);return{min:mn,max:mx,days:Math.max((mx-mn)/86400000,1)};}
function monthList(s,e){const r=[],c=new Date(s.getFullYear(),s.getMonth(),1),limit=new Date(e);limit.setMonth(limit.getMonth()+1);while(c<=limit&&r.length<60){r.push(new Date(c));c.setMonth(c.getMonth()+1);}return r.length?r:[new Date(s)];}

// ─── UI 元件 ──────────────────────────────────────────────────
function Avatar({name,size=20,members}){
  const idx=members?members.indexOf(name):0;
  const hues=[200,140,30,280,340,60];
  return(<span style={{display:"inline-flex",alignItems:"center",justifyContent:"center",width:size,height:size,borderRadius:"50%",background:`hsl(${hues[Math.max(idx,0)%hues.length]},30%,35%)`,fontSize:size*0.44,color:"#e8e8e8",flexShrink:0,fontFamily:"'微軟正黑體','Microsoft JhengHei',sans-serif"}}>{INIT(name)}</span>);
}
function StatusBadge({status}){
  const s={"進行中":{bg:C.accent,color:C.accentText,bd:C.accent},"規劃中":{bg:"transparent",color:C.inkSoft,bd:C.border},"暫停":{bg:"transparent",color:C.inkFaint,bd:C.borderLight},"完成":{bg:C.ok,color:"#e8e8e8",bd:C.ok}}[status]||{bg:"transparent",color:C.inkFaint,bd:C.borderLight};
  return(<span style={{fontSize:10,color:s.color,background:s.bg,border:`1px solid ${s.bd}`,padding:"2px 8px",borderRadius:2,letterSpacing:"0.07em",whiteSpace:"nowrap"}}>{status}</span>);
}
function TabBar({tabs,active,onChange}){
  return(<div style={{display:"flex",borderBottom:`1px solid ${C.border}`}}>{tabs.map(([k,l])=>(<button key={k} onClick={()=>onChange(k)} style={{background:"none",border:"none",borderBottom:`2px solid ${active===k?C.accent:"transparent"}`,color:active===k?C.ink:C.inkFaint,fontSize:12,padding:"7px 14px 10px",cursor:"pointer",letterSpacing:"0.06em",marginBottom:-1,fontFamily:"'微軟正黑體','Microsoft JhengHei',sans-serif"}}>{l}</button>))}</div>);
}
function Field({label,children}){return(<div><div style={{fontSize:9,color:C.inkFaint,letterSpacing:"0.14em",marginBottom:5}}>{label}</div>{children}</div>);}
function Modal({title,onClose,children,wide}){
  return(<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.35)",zIndex:100,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}><div style={{background:C.bgRaised,border:`1px solid ${C.border}`,borderRadius:8,width:"100%",maxWidth:wide?640:480,maxHeight:"88vh",overflow:"auto",boxShadow:"0 8px 32px rgba(0,0,0,0.18)"}}><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"14px 20px",borderBottom:`1px solid ${C.border}`,position:"sticky",top:0,background:C.bgRaised,zIndex:1}}><span style={{fontSize:13,color:C.ink,fontWeight:500}}>{title}</span><button onClick={onClose} style={{background:"none",border:"none",color:C.inkFaint,cursor:"pointer",fontSize:18,padding:"2px 6px"}}>×</button></div><div style={{padding:"18px 20px"}}>{children}</div></div></div>);
}
function SavingBadge({saving,error,syncing}){
  if(!saving&&!error&&!syncing)return null;
  return(
    <div style={{position:"fixed",bottom:16,right:16,padding:"7px 12px",background:error?C.warn:C.accent,color:C.accentText,borderRadius:4,fontSize:11,zIndex:50,boxShadow:"0 2px 8px rgba(0,0,0,0.2)",display:"flex",alignItems:"center",gap:6}}>
      {syncing&&!saving&&<span style={{width:6,height:6,borderRadius:"50%",background:C.accentText,opacity:0.7,display:"inline-block"}}/>}
      {error?"儲存失敗":saving?"儲存中…":"同步中"}
    </div>
  );
}
function bSt(bg,bd,color){bg=bg||C.bgSunk;bd=bd||C.border;color=color||C.inkMid;return{background:bg,border:`1px solid ${bd}`,color,padding:"6px 14px",borderRadius:4,cursor:"pointer",fontSize:12,letterSpacing:"0.04em",fontFamily:"'微軟正黑體','Microsoft JhengHei',sans-serif"};}
function iSt(extra){return{background:C.bgHover,border:`1px solid ${C.border}`,color:C.ink,padding:"8px 10px",borderRadius:4,fontSize:12,outline:"none",width:"100%",boxSizing:"border-box",minHeight:42,WebkitAppearance:"none",appearance:"none",fontFamily:"'微軟正黑體','Microsoft JhengHei',sans-serif",...extra};}
function sSt(extra){return{background:C.bgHover,border:`1px solid ${C.border}`,color:C.ink,padding:"8px 10px",borderRadius:4,fontSize:12,outline:"none",width:"100%",boxSizing:"border-box",minHeight:42,fontFamily:"'微軟正黑體','Microsoft JhengHei',sans-serif",...extra};}

// ─── GanttChart ───────────────────────────────────────────────
function GanttChart({projects,members}){
  const valid=projects.filter(p=>p.start&&p.end);
  if(!valid.length)return null;
  const{min,max,days:td}=ganttRange(valid);
  const ms=monthList(min,max);
  const today=new Date();
  const tp=Math.max(0,Math.min(100,(today-min)/86400000/td*100));
  const bL=d=>Math.max(0,(new Date(d)-min)/86400000/td*100);
  const bW=(s,e)=>Math.max(0.5,bL(e)-bL(s));
  return(<div style={{background:C.bgRaised,border:`1px solid ${C.border}`,borderRadius:6,overflow:"auto"}}><div style={{minWidth:520}}><div style={{display:"flex",borderBottom:`1px solid ${C.border}`}}><div style={{width:200,flexShrink:0,borderRight:`1px solid ${C.border}`,padding:"9px 14px",fontSize:10,color:C.inkSoft}}>專案</div><div style={{flex:1,display:"flex",position:"relative"}}>{ms.map((m,i)=>(<div key={i} style={{flex:1,padding:"9px 0 9px 6px",fontSize:10,color:C.inkSoft,borderRight:`1px solid ${C.borderLight}`}}>{m.getFullYear()===today.getFullYear()?`${m.getMonth()+1}月`:`${String(m.getFullYear()).slice(2)}/${m.getMonth()+1}`}</div>))}<div style={{position:"absolute",top:0,bottom:0,left:`${tp}%`,width:1,background:C.today,opacity:0.6}}/></div></div>{valid.map((p,pi)=>{const pc=pct(p.tasks);return(<div key={p.id} style={{display:"flex",alignItems:"center",borderBottom:pi<valid.length-1?`1px solid ${C.borderLight}`:"none",minHeight:50}}><div style={{width:200,flexShrink:0,padding:"8px 14px",borderRight:`1px solid ${C.border}`,display:"flex",flexDirection:"column",gap:3}}><div style={{display:"flex",alignItems:"center",gap:6}}><span style={{width:15,height:15,borderRadius:2,background:C.accent,display:"flex",alignItems:"center",justifyContent:"center",fontSize:8,color:C.accentText,flexShrink:0}}>{typeTag(p.type)}</span><span style={{fontSize:12,color:C.ink,fontWeight:500}}>{p.name}</span></div><div style={{fontSize:9,color:C.inkFaint,paddingLeft:21}}>{p.id}</div></div><div style={{flex:1,position:"relative",height:50,display:"flex",alignItems:"center"}}>{ms.map((_,i)=><div key={i} style={{position:"absolute",top:0,bottom:0,left:`${i/ms.length*100}%`,width:1,background:C.borderLight,opacity:0.5}}/>)}<div style={{position:"absolute",top:0,bottom:0,left:`${tp}%`,width:1,background:C.today,opacity:0.3}}/><div style={{position:"absolute",left:`${bL(p.start)}%`,width:`${bW(p.start,p.end)}%`,height:20,borderRadius:3,background:C.bgSunk,border:`1px solid ${C.border}`,overflow:"hidden"}}><div style={{width:`${pc}%`,height:"100%",background:C.accentMid,transition:"width 0.8s"}}/></div>{p.tasks.filter(t=>t.due).map(t=>(<div key={t.id} title={`${t.name}·${(t.owners||[]).join("、")}`} style={{position:"absolute",left:`calc(${bL(t.due)}% - 3px)`,width:7,height:7,borderRadius:"50%",background:t.done?C.ok:C.inkSoft,border:`1px solid ${t.done?C.ok:C.border}`,top:"50%",transform:"translateY(-50%)",zIndex:1,cursor:"default"}}/>))}{pc>6&&<span style={{position:"absolute",left:`calc(${bL(p.start)}% + 7px)`,fontSize:9,color:C.accentText,zIndex:2}}>{pc}%</span>}</div></div>);})} <div style={{display:"flex",borderTop:`1px solid ${C.borderLight}`,padding:"5px 0 5px 200px",fontSize:9,color:C.today}}><div style={{flex:1,position:"relative"}}><span style={{position:"absolute",left:`${tp}%`,transform:"translateX(-50%)"}}>TODAY</span></div></div></div></div>);
}

function ProjectGantt({project,members}){
  const tasks=project.tasks.filter(t=>t.due);
  if(!tasks.length||!project.start||!project.end)return<div style={{padding:"32px",textAlign:"center",color:C.inkFaint,fontSize:12}}>尚無任務或期限</div>;
  const all=[new Date(project.start),new Date(project.end),...tasks.map(t=>new Date(t.due))];
  let mn=new Date(Math.min(...all));mn.setDate(1);let mx=new Date(Math.max(...all));mx.setMonth(mx.getMonth()+1,1);
  const td=Math.max((mx-mn)/86400000,1),ms=monthList(mn,mx),today=new Date();
  const tp=Math.max(0,Math.min(100,(today-mn)/86400000/td*100));
  const pOf=d=>Math.max(0,Math.min(100,(new Date(d)-mn)/86400000/td*100));
  return(<div style={{background:C.bgRaised,border:`1px solid ${C.border}`,borderRadius:6,overflow:"auto"}}><div style={{minWidth:460}}><div style={{display:"flex",borderBottom:`1px solid ${C.border}`}}><div style={{width:160,flexShrink:0,borderRight:`1px solid ${C.border}`,padding:"9px 14px",fontSize:10,color:C.inkSoft}}>任務</div><div style={{flex:1,display:"flex",position:"relative"}}>{ms.map((m,i)=><div key={i} style={{flex:1,padding:"9px 0 9px 5px",fontSize:10,color:C.inkSoft,borderRight:`1px solid ${C.borderLight}`}}>{m.getMonth()+1}月</div>)}<div style={{position:"absolute",top:0,bottom:0,left:`${tp}%`,width:1,background:C.today,opacity:0.5}}/></div></div>{tasks.map((t,i)=>{const ov=!t.done&&new Date(t.due)<today;const dp=pOf(t.due);return(<div key={t.id} style={{display:"flex",alignItems:"center",minHeight:36,borderBottom:i<tasks.length-1?`1px solid ${C.borderLight}`:"none"}}><div style={{width:160,flexShrink:0,padding:"5px 14px",borderRight:`1px solid ${C.border}`,display:"flex",alignItems:"center",gap:6}}><div style={{width:12,height:12,border:`1px solid ${t.done?C.ok:C.border}`,borderRadius:2,background:t.done?C.ok:"transparent",flexShrink:0}}/><span style={{fontSize:11,color:t.done?C.inkFaint:C.inkMid,textDecoration:t.done?"line-through":"none",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t.name}</span></div><div style={{flex:1,position:"relative",height:36,display:"flex",alignItems:"center"}}>{ms.map((_,mi)=><div key={mi} style={{position:"absolute",top:0,bottom:0,left:`${mi/ms.length*100}%`,width:1,background:C.borderLight,opacity:0.4}}/>)}<div style={{position:"absolute",top:0,bottom:0,left:`${tp}%`,width:1,background:C.today,opacity:0.3}}/><div title={`期限：${t.due}`} style={{position:"absolute",left:`calc(${dp}% - 5px)`,width:10,height:10,borderRadius:"50%",zIndex:1,background:t.done?C.ok:ov?C.warn:C.inkSoft,border:`1px solid ${t.done?C.ok:ov?C.warn:C.border}`}}/><div style={{position:"absolute",left:`calc(${dp}% + 10px)`}}>{(t.owners||[]).slice(0,2).map((o,i)=><Avatar key={i} name={o} size={14} members={members}/>)}</div></div></div>);})} </div></div>);
}

// ─── MilestonePanel ───────────────────────────────────────────
function MilestonePanel({milestones,onChange}){
  const[editing,setEditing]=useState(false);
  const[local,setLocal]=useState(JSON.parse(JSON.stringify(milestones)));
  const msKey=JSON.stringify(milestones);
  useEffect(()=>{
    if(!editing)setLocal(JSON.parse(JSON.stringify(milestones)));
  },[msKey]);

  function toggleMS(type,id){
    const next={...local,[type]:local[type].map(m=>m.id===id?{...m,done:!m.done}:m)};
    setLocal(next);onChange(next);
  }
  function addMS(type){
    const next={...local,[type]:[...local[type],{id:Date.now(),label:"新里程碑",done:false}]};
    setLocal(next);
  }
  function updateLabel(type,id,label){
    setLocal({...local,[type]:local[type].map(m=>m.id===id?{...m,label}:m)});
  }
  function removeMS(type,id){
    const next={...local,[type]:local[type].filter(m=>m.id!==id)};
    setLocal(next);
  }
  function save(){onChange(local);setEditing(false);}

  return(
    <div style={{background:C.bgRaised,border:`1px solid ${C.border}`,borderRadius:6,padding:"14px 18px",marginBottom:14,boxShadow:"0 1px 3px rgba(0,0,0,0.07)"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
        <span style={{fontSize:9,color:C.inkFaint,letterSpacing:"0.14em"}}>專案里程碑</span>
        <button onClick={()=>editing?save():setEditing(true)} style={{...bSt(),padding:"3px 10px",fontSize:11}}>{editing?"儲存":"編輯"}</button>
      </div>
      {[["design","設計階段"],["construction","工程階段"]].map(([type,label])=>(
        <div key={type} style={{marginBottom:12}}>
          <div style={{fontSize:10,color:C.inkSoft,marginBottom:6,letterSpacing:"0.06em"}}>{label}</div>
          <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
            {local[type].map(m=>(
              <div key={m.id} style={{display:"flex",alignItems:"center",gap:5,padding:"5px 10px",background:m.done?C.ok+"22":C.bgSunk,border:`1px solid ${m.done?C.ok:C.border}`,borderRadius:4}}>
                <div onClick={()=>toggleMS(type,m.id)} style={{width:14,height:14,border:`1.5px solid ${m.done?C.ok:C.border}`,borderRadius:3,cursor:"pointer",background:m.done?C.ok:"transparent",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                  {m.done&&<span style={{fontSize:9,color:"#e8e8e8"}}>✓</span>}
                </div>
                {editing
                  ?<input value={m.label} onChange={e=>updateLabel(type,m.id,e.target.value)} style={{...iSt({width:90,padding:"2px 5px",fontSize:11})}}/>
                  :<span style={{fontSize:11,color:m.done?C.ok:C.inkMid,textDecoration:m.done?"line-through":"none"}}>{m.label}</span>
                }
                {editing&&<button onClick={()=>removeMS(type,m.id)} style={{background:"none",border:"none",color:C.inkFaint,cursor:"pointer",fontSize:13,padding:"0 2px"}}>×</button>}
              </div>
            ))}
            {editing&&<button onClick={()=>addMS(type)} style={{...bSt(),padding:"4px 10px",fontSize:11}}>＋</button>}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── TaskDetail Modal ─────────────────────────────────────────

// ─── ImageSection 元件 ───────────────────────────────────────
function NewTaskImageUpload({images,onUpload,onDelete}){
  const[uploading,setUploading]=useState(false);
  const inputRef=useRef(null);
  return(
    <div style={{marginBottom:10}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
        <span style={{fontSize:10,color:C.inkFaint,letterSpacing:"0.12em"}}>附加圖片（選填）</span>
        <button type="button" onClick={()=>inputRef.current.click()} disabled={uploading}
          style={{...bSt(),padding:"3px 10px",fontSize:11,opacity:uploading?0.6:1}}>
          {uploading?"上傳中…":"＋ 圖片"}
        </button>
        <input ref={inputRef} type="file" accept="image/*" multiple style={{display:"none"}}
          onChange={async e=>{
            setUploading(true);
            for(const f of Array.from(e.target.files)){
              if(f.size>10*1024*1024){alert(`「${f.name}」超過 10MB，已略過`);continue;}
              await onUpload(f);
            }
            setUploading(false);
            e.target.value="";
          }}/>
      </div>
      {(images||[]).length>0&&(
        <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
          {(images||[]).map((img,i)=>(
            <div key={i} style={{position:"relative",width:72,height:72,borderRadius:4,overflow:"hidden",border:`1px solid ${C.border}`,flexShrink:0}}>
              <img src={img.thumbUrl} alt="" style={{width:"100%",height:"100%",objectFit:"cover",cursor:"pointer"}} onClick={()=>window.open(img.viewUrl,"_blank")}/>
              <button type="button" onClick={()=>onDelete(img.fileId,i)}
                style={{position:"absolute",top:2,right:2,background:"rgba(0,0,0,0.55)",border:"none",color:"#fff",borderRadius:"50%",width:18,height:18,cursor:"pointer",fontSize:12,display:"flex",alignItems:"center",justifyContent:"center",padding:0,lineHeight:1}}>×</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ImageSection({images,onUpload,onDelete,uploading}){
  const inputRef=useRef(null);
  return(
    <div style={{marginBottom:16}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
        <span style={{fontSize:10,color:C.inkFaint,letterSpacing:"0.12em"}}>圖片紀錄</span>
        <button onClick={()=>inputRef.current.click()} disabled={uploading}
          style={{...bSt(),padding:"3px 10px",fontSize:11,opacity:uploading?0.6:1}}>
          {uploading?"上傳中…":"＋ 上傳圖片"}
        </button>
        <input ref={inputRef} type="file" accept="image/*" multiple style={{display:"none"}}
          onChange={e=>{Array.from(e.target.files).forEach(f=>onUpload(f));e.target.value="";}}/>
      </div>
      {(images||[]).length===0&&(
        <div style={{fontSize:11,color:C.inkFaint,textAlign:"center",padding:"12px 0"}}>尚無圖片，點上傳加入施工紀錄</div>
      )}
      <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
        {(images||[]).map((img,i)=>(
          <div key={i} style={{position:"relative",width:90,height:90,borderRadius:4,overflow:"hidden",border:`1px solid ${C.border}`,flexShrink:0}}>
            <img src={img.thumbUrl} alt={img.fileName||"圖片"} style={{width:"100%",height:"100%",objectFit:"cover",cursor:"pointer"}}
              onClick={()=>window.open(img.viewUrl,"_blank")}
              onError={e=>{e.target.style.display="none";}}/>
            <button onClick={()=>onDelete(img.fileId,i)}
              style={{position:"absolute",top:2,right:2,background:"rgba(0,0,0,0.55)",border:"none",color:"#fff",borderRadius:"50%",width:18,height:18,cursor:"pointer",fontSize:12,display:"flex",alignItems:"center",justifyContent:"center",padding:0,lineHeight:1}}>×</button>
          </div>
        ))}
      </div>
    </div>
  );
}

function TaskDetailModal({task,onClose,onUpdate,members,onReorderSub}){
  // 用內部 state 同步顯示，確保上傳後立即更新
  const[internalTask,setInternalTask]=useState(task);
  useEffect(()=>{setInternalTask(task);},[task]);
  const liveTask=internalTask;
  const[newSub,setNewSub]=useState("");
  const[editSubId,setEditSubId]=useState(null);
  const[editSubName,setEditSubName]=useState("");
  const subDragRef=useRef(null);
  const subDragOverRef=useRef(null);
  const[subDraggingId,setSubDraggingId]=useState(null);
  const[subDragOverId,setSubDragOverId]=useState(null);
  const[uploading,setUploading]=useState(false);
  const[subUploadingId,setSubUploadingId]=useState(null);

  function addSub(){
    if(!newSub.trim())return;
    const subtasks=[...(liveTask.subtasks||[]),{id:Date.now(),name:newSub.trim(),done:false,images:[]}];
    const updated={...liveTask,subtasks};setInternalTask(updated);onUpdate(updated);setNewSub("");
  }
  function toggleSub(id){
    const subtasks=(liveTask.subtasks||[]).map(s=>s.id===id?{...s,done:!s.done}:s);
    const updated={...liveTask,subtasks};setInternalTask(updated);onUpdate(updated);
  }
  function delSub(id){
    const subtasks=(liveTask.subtasks||[]).filter(s=>s.id!==id);
    const updated={...liveTask,subtasks};setInternalTask(updated);onUpdate(updated);
  }
  function startEditSub(s){setEditSubId(s.id);setEditSubName(s.name);}
  function saveEditSub(id){
    if(!editSubName.trim())return;
    const subtasks=(liveTask.subtasks||[]).map(s=>s.id===id?{...s,name:editSubName.trim()}:s);
    const updated={...liveTask,subtasks};setInternalTask(updated);onUpdate(updated);
    setEditSubId(null);setEditSubName("");
  }

  // 任務圖片上傳
  const[uploadError,setUploadError]=useState("");
  async function handleUploadImage(file){
    setUploading(true);
    setUploadError("");
    try{
      if(file.size>10*1024*1024){
        setUploadError("檔案過大，請選擇 10MB 以下的圖片");
        return;
      }
      const result=await uploadImage(file);
      if(result.success){
        const newImage={fileId:result.fileId,viewUrl:result.viewUrl,thumbUrl:result.thumbUrl,fileName:result.fileName};
        const updated={...liveTask,images:[...(liveTask.images||[]),newImage]};
        setInternalTask(updated);
        onUpdate(updated);
      }else{
        setUploadError("上傳失敗：請確認 Apps Script 已重新部署");
      }
    }catch(e){
      console.error(e);
      setUploadError("上傳失敗："+e.message);
    }
    finally{setUploading(false);}
  }

  // 任務圖片刪除
  async function handleDeleteImage(fileId,idx){
    const images=(liveTask.images||[]).filter((_,i)=>i!==idx);
    const updated={...liveTask,images};
    setInternalTask(updated);
    onUpdate(updated);
    await deleteImage(fileId);
  }

  // 子任務圖片上傳
  async function handleUploadSubImage(subId,file){
    setSubUploadingId(subId);
    try{
      const result=await uploadImage(file);
      if(result.success){
        const subtasks=(liveTask.subtasks||[]).map(s=>s.id===subId?{...s,images:[...(s.images||[]),{fileId:result.fileId,viewUrl:result.viewUrl,thumbUrl:result.thumbUrl,fileName:result.fileName}]}:s);
        const updated={...liveTask,subtasks};
        setInternalTask(updated);
        onUpdate(updated);
      }
    }catch(e){console.error(e);}
    finally{setSubUploadingId(null);}
  }

  // 子任務圖片刪除
  async function handleDeleteSubImage(subId,fileId,idx){
    const subtasks=(liveTask.subtasks||[]).map(s=>s.id===subId?{...s,images:(s.images||[]).filter((_,i)=>i!==idx)}:s);
    const updated={...liveTask,subtasks};
    setInternalTask(updated);
    onUpdate(updated);
    await deleteImage(fileId);
  }

  return(
    <Modal title={liveTask.name} onClose={onClose} wide>
      {/* 任務資訊 */}
      <div style={{display:"flex",gap:10,marginBottom:14,flexWrap:"wrap"}}>
        <div style={{fontSize:11,color:C.inkSoft}}>負責：{(liveTask.owners||[]).join("、")||"未指派"}</div>
        {liveTask.due&&<div style={{fontSize:11,color:C.inkSoft}}>期限：{fmt(liveTask.due)}</div>}
        <div style={{fontSize:11,color:C.inkSoft}}>類別：{liveTask.category}</div>
        {liveTask.note&&<div style={{fontSize:11,color:C.inkFaint}}>備註：{liveTask.note}</div>}
      </div>

      {/* 圖片區塊 */}
      <ImageSection images={liveTask.images||[]} onUpload={handleUploadImage} onDelete={handleDeleteImage} uploading={uploading}/>
      {uploadError&&<div style={{fontSize:11,color:C.warn,marginBottom:8,padding:"6px 10px",background:C.warn+"22",borderRadius:4}}>{uploadError}</div>}

      {/* 子任務 */}
      <div style={{fontSize:10,color:C.inkFaint,letterSpacing:"0.12em",marginBottom:8}}>子任務</div>
      <div style={{display:"flex",flexDirection:"column",gap:4,marginBottom:12}}>
        {[...(liveTask.subtasks||[]).filter(s=>!s.done),...(liveTask.subtasks||[]).filter(s=>s.done)].map(s=>(
          <div key={s.id}
            draggable
            onDragStart={()=>{subDragRef.current=s.id;setSubDraggingId(s.id);}}
            onDragOver={e=>{e.preventDefault();subDragOverRef.current=s.id;setSubDragOverId(s.id);}}
            onDragEnd={()=>{setSubDraggingId(null);setSubDragOverId(null);subDragRef.current=null;subDragOverRef.current=null;}}
            onDrop={()=>{if(subDragRef.current&&subDragOverRef.current&&subDragRef.current!==subDragOverRef.current){onReorderSub&&onReorderSub(subDragRef.current,subDragOverRef.current);}setSubDraggingId(null);setSubDragOverId(null);subDragRef.current=null;subDragOverRef.current=null;}}
            style={{background:C.bg,border:`1px solid ${subDragOverId===s.id&&subDraggingId!==s.id?C.accent:C.border}`,borderRadius:4,opacity:subDraggingId===s.id?0.3:s.done?0.5:1,transition:"opacity 0.15s,border-color 0.15s",boxShadow:subDragOverId===s.id&&subDraggingId!==s.id?"0 0 0 2px "+C.accent+"44":"none",cursor:"grab"}}>
            <div style={{display:"flex",alignItems:"center",gap:8,padding:"7px 10px"}}>
              <div onClick={()=>toggleSub(s.id)} style={{width:14,height:14,border:`1.5px solid ${s.done?C.ok:C.border}`,borderRadius:3,cursor:"pointer",background:s.done?C.ok:"transparent",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                {s.done&&<span style={{fontSize:9,color:"#e8e8e8"}}>✓</span>}
              </div>
              {editSubId===s.id
                ?<input value={editSubName} onChange={e=>setEditSubName(e.target.value)}
                    onKeyDown={e=>{if(e.key==="Enter")saveEditSub(s.id);if(e.key==="Escape")setEditSubId(null);}}
                    style={{...iSt({flex:1,padding:"3px 7px",fontSize:12})}} autoFocus/>
                :<span style={{flex:1,fontSize:12,color:s.done?C.inkFaint:C.ink,textDecoration:s.done?"line-through":"none"}}>{s.name}</span>
              }
              {/* 子任務圖片數量 */}
              {(s.images||[]).length>0&&<span style={{fontSize:10,color:C.inkFaint}}>📷 {s.images.length}</span>}
              {editSubId===s.id
                ?<><button onClick={()=>saveEditSub(s.id)} style={{background:"none",border:"none",color:C.ok,cursor:"pointer",fontSize:13}}>✓</button>
                  <button onClick={()=>setEditSubId(null)} style={{background:"none",border:"none",color:C.inkFaint,cursor:"pointer",fontSize:14}}>✕</button></>
                :<><button onClick={()=>startEditSub(s)} style={{background:"none",border:"none",color:C.inkFaint,cursor:"pointer",fontSize:12,padding:"2px 3px"}}>✎</button>
                  <button onClick={()=>delSub(s.id)} style={{background:"none",border:"none",color:C.inkFaint,cursor:"pointer",fontSize:14}}>×</button></>
              }
            </div>
            {/* 子任務圖片區塊 */}
            {!s.done&&(
              <div style={{padding:"0 10px 8px 36px"}}>
                <ImageSection images={s.images||[]} onUpload={f=>handleUploadSubImage(s.id,f)} onDelete={(fId,i)=>handleDeleteSubImage(s.id,fId,i)} uploading={subUploadingId===s.id}/>
              </div>
            )}
          </div>
        ))}
        {(liveTask.subtasks||[]).length===0&&<div style={{fontSize:11,color:C.inkFaint,textAlign:"center",padding:"12px"}}>尚無子任務</div>}
      </div>
      <div style={{display:"flex",gap:8}}>
        <input value={newSub} onChange={e=>setNewSub(e.target.value)} placeholder="新增子任務" style={{...iSt(),flex:1}}
          onKeyDown={e=>{if(e.key==="Enter")addSub();}}/>
        <button onClick={addSub} style={bSt(C.accent,C.accent,C.accentText)}>新增</button>
      </div>
    </Modal>
  );
}

// ─── EditInfoModal ────────────────────────────────────────────
function EditInfoModal({proj,onClose,onSave}){
  const[f,setF]=useState({name:proj.name,client:proj.client||"",clientDetail:proj.clientDetail||"",start:proj.start,end:proj.end,type:proj.type,members:proj.members||[]});
  return(
    <Modal title="編輯專案資訊" onClose={onClose}>
      <div style={{display:"flex",flexDirection:"column",gap:14}}>
        <Field label="專案名稱"><input value={f.name} onChange={e=>setF({...f,name:e.target.value})} style={iSt()}/></Field>
        <Field label="業主"><input value={f.client} onChange={e=>setF({...f,client:e.target.value})} style={iSt()}/></Field>
        <Field label="業主細部資訊"><textarea value={f.clientDetail} onChange={e=>setF({...f,clientDetail:e.target.value})} placeholder="停車格號碼、樓層位置…" style={{...iSt(),height:72,resize:"vertical"}}/></Field>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
          <Field label="開始日期"><input type="date" value={f.start} onChange={e=>setF({...f,start:e.target.value})} style={{...iSt(),minHeight:40,WebkitAppearance:"none"}}/></Field>
          <Field label="預計完成"><input type="date" value={f.end} onChange={e=>setF({...f,end:e.target.value})} style={{...iSt(),minHeight:40,WebkitAppearance:"none"}}/></Field>
        </div>
        <div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:4}}>
          <button onClick={onClose} style={bSt()}>取消</button>
          <button onClick={()=>onSave(f)} style={bSt(C.accent,C.accent,C.accentText)}>儲存</button>
        </div>
      </div>
    </Modal>
  );
}

// ─── TemplateModal ────────────────────────────────────────────
function TemplateModal({proj,templates,onClose,onSaveTemplate,onApplyTemplate}){
  const[saveName,setSaveName]=useState(proj.name+"範本");
  return(
    <Modal title="專案範本" onClose={onClose}>
      <div style={{marginBottom:20}}>
        <div style={{fontSize:10,color:C.inkFaint,letterSpacing:"0.12em",marginBottom:10}}>儲存目前任務為範本</div>
        <div style={{display:"flex",gap:8}}>
          <input value={saveName} onChange={e=>setSaveName(e.target.value)} placeholder="範本名稱" style={{...iSt(),flex:1}}/>
          <button onClick={()=>onSaveTemplate(saveName)} style={bSt(C.accent,C.accent,C.accentText)}>儲存範本</button>
        </div>
      </div>
      {templates.length>0&&(
        <div>
          <div style={{fontSize:10,color:C.inkFaint,letterSpacing:"0.12em",marginBottom:10}}>套用現有範本</div>
          <div style={{display:"flex",flexDirection:"column",gap:6}}>
            {templates.map((t,i)=>(
              <div key={i} style={{display:"flex",alignItems:"center",gap:8,padding:"10px 14px",background:C.bg,border:`1px solid ${C.border}`,borderRadius:4}}>
                <span style={{flex:1,fontSize:12,color:C.ink}}>{t.name}</span>
                <span style={{fontSize:11,color:C.inkFaint}}>{t.tasks.length} 個任務</span>
                <button onClick={()=>onApplyTemplate(t)} style={{...bSt(),padding:"4px 10px",fontSize:11}}>套用</button>
              </div>
            ))}
          </div>
        </div>
      )}
    </Modal>
  );
}

// ─── ColorPanel ───────────────────────────────────────────────
function ColorPanel({onClose,onApply,currentHex}){
  const[mode,setMode]=useState("hex");
  const[hex,setHex]=useState(currentHex);
  const[rgb,setRgb]=useState(hexToRgb(currentHex));
  const[cmyk,setCmyk]=useState(()=>{const r=hexToRgb(currentHex);return rgbToCmyk(r.r,r.g,r.b);});
  function syncH(h){if(!/^#[0-9a-fA-F]{6}$/.test(h))return;const r=hexToRgb(h);setRgb(r);setCmyk(rgbToCmyk(r.r,r.g,r.b));setHex(h);}
  function syncR(r){const h=rgbToHex(r.r,r.g,r.b);setHex(h);setCmyk(rgbToCmyk(r.r,r.g,r.b));setRgb(r);}
  function syncC(cm){const h=cmykToHex(cm.c,cm.m,cm.y,cm.k);setHex(h);const r=hexToRgb(h);setRgb(r);setCmyk(cm);}
  const pv=buildColors(hex);
  const presets=["#BDC0BA","#C4B9A8","#A8BAC4","#B8C4A8","#C4A8B8","#C4C4A8","#A8A8A8"];
  return(<Modal title="調整主色調" onClose={onClose}><div style={{marginBottom:14}}><div style={{fontSize:9,color:C.inkFaint,letterSpacing:"0.14em",marginBottom:8}}>預設色票</div><div style={{display:"flex",gap:8,flexWrap:"wrap"}}>{presets.map(c=>(<div key={c} onClick={()=>syncH(c)} style={{width:28,height:28,borderRadius:4,background:c,border:`2px solid ${hex===c?C.accent:C.border}`,cursor:"pointer"}}/>))}</div></div><div style={{display:"flex",alignItems:"center",gap:8,marginBottom:14}}><input type="color" value={hex} onChange={e=>syncH(e.target.value)} style={{width:42,height:42,border:`1px solid ${C.border}`,borderRadius:4,cursor:"pointer",padding:2,background:"none"}}/><span style={{fontSize:11,color:C.inkSoft}}>直接選色</span></div><div style={{display:"flex",gap:4,marginBottom:12}}>{["hex","rgb","cmyk"].map(m=>(<button key={m} onClick={()=>setMode(m)} style={{...bSt(mode===m?C.accent:"transparent",mode===m?C.accent:C.border,mode===m?C.accentText:C.inkSoft),padding:"4px 10px",fontSize:11,textTransform:"uppercase"}}>{m}</button>))}</div>{mode==="hex"&&<Field label="HEX"><input value={hex} onChange={e=>syncH(e.target.value)} placeholder="#BDC0BA" style={iSt()}/></Field>}{mode==="rgb"&&<div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>{["r","g","b"].map(k=>(<Field key={k} label={k.toUpperCase()}><input type="number" min={0} max={255} value={rgb[k]} onChange={e=>syncR({...rgb,[k]:Number(e.target.value)})} style={iSt()}/></Field>))}</div>}{mode==="cmyk"&&<div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:8}}>{["c","m","y","k"].map(k=>(<Field key={k} label={k.toUpperCase()}><input type="number" min={0} max={100} value={cmyk[k]} onChange={e=>syncC({...cmyk,[k]:Number(e.target.value)})} style={iSt()}/></Field>))}</div>}<div style={{marginTop:14,padding:"10px 14px",borderRadius:6,background:pv.bg,border:`1px solid ${pv.border}`}}><div style={{fontSize:9,color:pv.inkFaint,marginBottom:6}}>預覽</div><div style={{display:"flex",gap:8,alignItems:"center"}}><span style={{background:pv.accent,color:pv.accentText,fontSize:11,padding:"4px 10px",borderRadius:3}}>按鈕</span><span style={{background:pv.bgRaised,border:`1px solid ${pv.border}`,color:pv.ink,fontSize:11,padding:"4px 10px",borderRadius:3}}>卡片</span><span style={{fontSize:12,color:pv.ink}}>文字</span></div></div><div style={{display:"flex",gap:8,marginTop:14,justifyContent:"flex-end"}}><button onClick={onClose} style={bSt()}>取消</button><button onClick={()=>onApply(hex)} style={bSt(C.accent,C.accent,C.accentText)}>套用</button></div></Modal>);
}

function MemberPanel({members,onClose,onSave}){
  const[list,setList]=useState([...members]);
  const[n,setN]=useState("");
  return(<Modal title="人員管理" onClose={onClose}><div style={{display:"flex",flexDirection:"column",gap:5,marginBottom:14}}>{list.map((m,i)=>(<div key={i} style={{display:"flex",alignItems:"center",gap:8,padding:"8px 12px",background:C.bg,border:`1px solid ${C.border}`,borderRadius:4}}><Avatar name={m} size={22} members={list}/><span style={{flex:1,fontSize:13,color:C.ink}}>{m}</span><button onClick={()=>setList(list.filter((_,j)=>j!==i))} style={{background:"none",border:"none",color:C.inkFaint,cursor:"pointer",fontSize:15}}>×</button></div>))}</div><div style={{display:"flex",gap:8}}><input value={n} onChange={e=>setN(e.target.value)} placeholder="新增人員姓名" style={{...iSt(),flex:1}} onKeyDown={e=>{if(e.key==="Enter"&&n.trim()){setList([...list,n.trim()]);setN("");}}} /><button onClick={()=>{if(n.trim()){setList([...list,n.trim()]);setN("");}}} style={bSt(C.accent,C.accent,C.accentText)}>新增</button></div><div style={{display:"flex",gap:8,marginTop:14,justifyContent:"flex-end"}}><button onClick={onClose} style={bSt()}>取消</button><button onClick={()=>onSave(list)} style={bSt(C.accent,C.accent,C.accentText)}>儲存</button></div></Modal>);
}

function OverdueModal({projects,onClose}){
  const items=projects.flatMap(p=>p.tasks.filter(t=>t.due&&!t.done&&t.due<new Date().toISOString().slice(0,10)).map(t=>({proj:p.name,projId:p.id,task:t.name,owners:t.owners||[],due:t.due})));
  return(<Modal title={`逾期任務（${items.length}）`} onClose={onClose}>{items.length===0?<div style={{color:C.inkFaint,fontSize:12,textAlign:"center",padding:"20px"}}>目前沒有逾期任務</div>:<div style={{display:"flex",flexDirection:"column",gap:5}}>{items.map((it,i)=>(<div key={i} style={{padding:"10px 14px",background:C.bg,border:`1px solid ${C.border}`,borderRadius:5}}><div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}><span style={{fontSize:12,color:C.ink,fontWeight:500}}>{it.task}</span><span style={{fontSize:10,color:C.warn}}>逾期 {Math.abs(daysLeft(it.due))} 天</span></div><div style={{display:"flex",gap:10,fontSize:11,color:C.inkSoft,flexWrap:"wrap"}}><span>{it.projId}·{it.proj}</span><span>{(it.owners||[]).join("、")}</span><span>{fmt(it.due)}</span></div></div>))}</div>}</Modal>);
}
function PaymentModal({projects,onClose}){
  const items=projects.flatMap(p=>p.tasks.filter(t=>isPayment(t.name)).map(t=>({proj:p.name,projId:p.id,task:t.name,owners:t.owners||[],due:t.due,done:t.done})));
  return(<Modal title={`工程請款（${items.filter(i=>!i.done).length} 待處理）`} onClose={onClose}>{items.length===0?<div style={{color:C.inkFaint,fontSize:12,textAlign:"center",padding:"20px"}}>目前無請款任務</div>:<div style={{display:"flex",flexDirection:"column",gap:5}}>{items.map((it,i)=>(<div key={i} style={{padding:"10px 14px",background:C.bg,border:`1px solid ${it.done?C.borderLight:C.border}`,borderRadius:5,opacity:it.done?0.55:1}}><div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}><span style={{fontSize:12,color:C.ink,fontWeight:500,textDecoration:it.done?"line-through":"none"}}>{it.task}</span><span style={{fontSize:10,color:it.done?C.ok:it.due&&daysLeft(it.due)<0?C.warn:C.inkSoft}}>{it.done?"已完成":it.due?daysLeft(it.due)<0?`逾期 ${Math.abs(daysLeft(it.due))}天`:`剩 ${daysLeft(it.due)}天`:""}</span></div><div style={{display:"flex",gap:10,fontSize:11,color:C.inkSoft,flexWrap:"wrap"}}><span>{it.projId}·{it.proj}</span><span>{(it.owners||[]).join("、")}</span>{it.due&&<span>{fmt(it.due)}</span>}</div></div>))}</div>}</Modal>);
}
function RepairModal({projects,customRepairs,onClose,onUpdate}){
  const projectItems=projects.flatMap(p=>(p.repairs||[]).map(r=>({...r,proj:p.name,projId:p.id})));
  const customItems=(customRepairs||[]).map(r=>({...r,proj:r.customProjectName||"手動輸入案件",projId:"__custom__"}));
  const items=[...projectItems,...customItems].filter(i=>i.status!=="已完成");
  return(<Modal title={`修繕進行（${items.length}）`} onClose={onClose}>{items.length===0?<div style={{color:C.inkFaint,fontSize:12,textAlign:"center",padding:"20px"}}>目前無修繕記錄</div>:<div style={{display:"flex",flexDirection:"column",gap:5}}>{items.map((it,i)=>(<div key={i} style={{padding:"10px 14px",background:C.bg,border:`1px solid ${C.border}`,borderRadius:5}}><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:it.note?5:0}}><div><div style={{fontSize:12,color:C.ink,fontWeight:500,marginBottom:2}}>{it.desc}</div><div style={{fontSize:11,color:C.inkSoft}}>{it.projId}·{it.proj}</div></div><select value={it.status} onChange={e=>onUpdate(it.projId,it.id,e.target.value)} style={{...sSt({width:"auto",padding:"4px 8px",fontSize:11})}}>{REPAIR_STATUS.map(s=><option key={s}>{s}</option>)}</select></div>{it.note&&<div style={{fontSize:11,color:C.inkFaint,padding:"5px 8px",background:C.bgSunk,borderRadius:3,marginTop:5}}>{it.note}</div>}</div>))}</div>}</Modal>);
}

// ─── EditTaskRow ──────────────────────────────────────────────
function EditTaskRow({task,onSave,onCancel,members}){
  const[f,setF]=useState({name:task.name,owners:task.owners||[],due:task.due||"",note:task.note||"",category:task.category||"設計"});
  return(
    <div style={{padding:"10px 13px",background:C.bgHover,border:`1px solid ${C.border}`,borderRadius:5,display:"flex",flexDirection:"column",gap:8}}>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
        <Field label="任務名稱"><input value={f.name} onChange={e=>setF({...f,name:e.target.value})} style={iSt()}/></Field>
        <Field label="期限（選填）"><input type="date" value={f.due} onChange={e=>setF({...f,due:e.target.value})} style={{...iSt(),minHeight:40,WebkitAppearance:"none"}}/></Field>
        <Field label="類別"><select value={f.category} onChange={e=>setF({...f,category:e.target.value})} style={sSt()}>{TASK_CATEGORIES.map(c=><option key={c}>{c}</option>)}</select></Field>
        <Field label="備註"><input value={f.note} onChange={e=>setF({...f,note:e.target.value})} placeholder="選填" style={iSt()}/></Field>
      </div>
      <Field label="負責人（可多選）">
        <div style={{padding:"8px 10px",background:C.bgHover,border:`1px solid ${C.border}`,borderRadius:4,minHeight:42}}>
          {members.length===0
            ?<span style={{fontSize:11,color:C.inkFaint}}>載入中…</span>
            :<div style={{display:"flex",flexWrap:"wrap",gap:6}}>
              {members.map(m=>{
                const sel=(f.owners||[]).includes(m);
                return(
                  <button type="button" key={m}
                    onClick={()=>setF(prev=>{const cur=prev.owners||[];return{...prev,owners:sel?cur.filter(x=>x!==m):[...cur,m]};})}
                    style={{...bSt(sel?C.accent:"transparent",sel?C.accent:C.border,sel?C.accentText:C.inkMid),padding:"4px 12px",fontSize:12,display:"flex",alignItems:"center",gap:5}}>
                    <Avatar name={m} size={14} members={members}/>{m}
                  </button>
                );
              })}
            </div>
          }
        </div>
      </Field>
      <div style={{display:"flex",gap:6,justifyContent:"flex-end"}}>
        <button onClick={()=>onSave(f)} style={{...bSt(C.accent,C.accent,C.accentText),padding:"5px 14px",fontSize:11}}>儲存</button>
        <button onClick={onCancel} style={{...bSt(),padding:"5px 14px",fontSize:11}}>取消</button>
      </div>
    </div>
  );
}

// ─── 主元件 ──────────────────────────────────────────────────
export default function App(){
  const[colorHex,setColorHex]=useState(DEFAULT_HEX);
  const[members,setMembers]=useState([]);
  const[projects,setProjects]=useState([]);
  const[templates,setTemplates]=useState([]);
  const[loading,setLoading]=useState(true);
  const[saving,setSaving]=useState(false);
  const[saveError,setSaveError]=useState(false);
  const[syncing,setSyncing]=useState(false); // 背景同步中
  const[view,setView]=useState("overview");
  const[selected,setSelected]=useState(null);
  const[detailTab,setDetailTab]=useState("tasks");
  const[oTab,setOTab]=useState("list");
  const[showAdd,setShowAdd]=useState(false);
  const[editTask,setEditTask]=useState(null);
  const[taskDetail,setTaskDetail]=useState(null);
  const[newTask,setNewTask]=useState({name:"",owners:[],due:"",note:"",category:"設計",images:[]}); // owner 在 members 載入後由 useEffect 補上
  const[newProj,setNewProj]=useState({name:"",type:"室內",client:"",clientDetail:"",start:"",end:"",members:[]});
  const[customId,setCustomId]=useState("");
  const[editingId,setEditingId]=useState(false);
  const[dupIdError,setDupIdError]=useState(false);
  const[mounted,setMounted]=useState(false);
  const[confirmDel,setConfirmDel]=useState(null);
  const[confirmDeleteProject,setConfirmDeleteProject]=useState(null);
  const[conflict,setConflict]=useState(null); // {pid, tid, local, remote}
  const[modal,setModal]=useState(null);
  const[showFuncMenu,setShowFuncMenu]=useState(false);
  const[showArchive,setShowArchive]=useState(false);
  const[newRepair,setNewRepair]=useState({desc:"",note:""});
  const[showAddRepair,setShowAddRepair]=useState(false);
  const[isAdmin,setIsAdmin]=useState(false);
  const[showAdminLogin,setShowAdminLogin]=useState(false);
  const[adminPwInput,setAdminPwInput]=useState("");
  const[adminPwError,setAdminPwError]=useState(false);
  const[taskCatFilter,setTaskCatFilter]=useState("全部");
  const[collapsedCats,setCollapsedCats]=useState({});
  const[showEditInfo,setShowEditInfo]=useState(false);
  const[showTemplate,setShowTemplate]=useState(false);
  const[newRepairGlobal,setNewRepairGlobal]=useState({projectId:"",customProjectName:"",desc:"",note:"",assignedDate:"",owner:""});
  const[customRepairs,setCustomRepairs]=useState([]); // 手動輸入的修繕記錄（存入 Sheets CustomRepairs）
  const[showAddRepairGlobal,setShowAddRepairGlobal]=useState(false);
  const[editRepairId,setEditRepairId]=useState(null);
  const[editRepairData,setEditRepairData]=useState(null);
  const[confirmRepairId,setConfirmRepairId]=useState(null);
  const funcRef=useRef(null);
  const saveTimer=useRef(null);

  useEffect(()=>{setTimeout(()=>setMounted(true),60);},[]);
  useEffect(()=>{C=buildColors(colorHex);setMounted(m=>!m);setTimeout(()=>setMounted(m=>!m),10);},[colorHex]);
  useEffect(()=>{function h(e){if(funcRef.current&&!funcRef.current.contains(e.target))setShowFuncMenu(false);}document.addEventListener("mousedown",h);return()=>document.removeEventListener("mousedown",h);},[]);
  useEffect(()=>{loadAll();},[]);
  useEffect(()=>{if(members.length>0&&(newTask.owners||[]).length===0)setNewTask(t=>({...t,owners:[members[0]]}));},[members]);

  // 每 2 分鐘自動重新整理，確保多人操作時資料同步
  // 只有在沒有待儲存操作時才執行，避免覆蓋剛新增的資料
  useEffect(()=>{
    const timer=setInterval(()=>{
      if(!saving&&!saveTimer.current)loadAll(true,true); // 背景靜默合併更新
    },120000);
    return()=>clearInterval(timer);
  },[saving]);

  async function loadAll(mergeWithLocal=false,silent=false){
    if(!mergeWithLocal&&!silent)setLoading(true);
    if(silent)setSyncing(true);
    try{
      const[pR,tR,rR,mR,tmR,crR]=await Promise.all([sheetGet("Projects"),sheetGet("Tasks"),sheetGet("Repairs"),sheetGet("Members"),sheetGet("Templates").catch(()=>[["name","tasks"]]),sheetGet("CustomRepairs").catch(()=>[["id","desc","status","note","assignedDate","owner","customProjectName"]])]);
      const remoteProjects=rowsToProjects(pR,tR,rR);
      setMembers(rowsToMembers(mR));
      setTemplates(rowsToTemplates(tmR));
      const remoteCR=crR.slice(1).filter(r=>r[0]).map(r=>({id:Number(r[0]),desc:r[1]||'',status:r[2]||'待安排',note:r[3]||'',assignedDate:r[4]||'',owner:r[5]||'',customProjectName:r[6]||''}));
      if(!mergeWithLocal)setCustomRepairs(remoteCR);

      if(mergeWithLocal){
        // 合併：保留本地比遠端新的任務，也保留本地新建的專案
        setProjects(prev=>{
          // 合併遠端已有的專案
          const merged=remoteProjects.map(remoteP=>{
            const localP=prev.find(p=>p.id===remoteP.id);
            if(!localP)return remoteP;
            const mergedTasks=remoteP.tasks.map(remoteT=>{
              const localT=localP.tasks.find(t=>t.id===remoteT.id);
              if(!localT)return remoteT;
              if(localT.updatedAt&&remoteT.updatedAt&&localT.updatedAt>remoteT.updatedAt)return localT;
              return remoteT;
            });
            const remoteIds=new Set(remoteP.tasks.map(t=>t.id));
            const localOnlyTasks=localP.tasks.filter(t=>!remoteIds.has(t.id));
            // 專案層級資料（milestones, status, client 等）以本地為主，避免覆蓋未存入的修改
            return{...remoteP,...localP,tasks:[...mergedTasks,...localOnlyTasks]};
          });
          // 保留本地新建但遠端還沒有的專案（剛建立還沒存入 Sheets）
          const remoteProjectIds=new Set(remoteProjects.map(p=>p.id));
          const localOnlyProjects=prev.filter(p=>!remoteProjectIds.has(p.id));
          return[...merged,...localOnlyProjects];
        });
      }else{
        setProjects(remoteProjects);
      }
    }catch(e){console.error(e);setSaveError(true);setTimeout(()=>setSaveError(false),4000);}
    finally{setLoading(false);setSyncing(false);}
  }

  const latestState=useRef({projects,members,templates,customRepairs});
  useEffect(()=>{latestState.current={projects,members,templates,customRepairs};},[projects,members,templates,customRepairs]);

  const scheduleSave=useCallback((ps,ms,tms)=>{
    if(saveTimer.current)clearTimeout(saveTimer.current);
    saveTimer.current=setTimeout(async()=>{
      setSaving(true);setSaveError(false);
      try{
        // 用 ref 取得最新 state，避免 closure stale state 問題
        const curP=ps||latestState.current.projects;
        const curM=ms||latestState.current.members;
        const curT=tms||latestState.current.templates;

        // 先讀取 Sheets 最新資料，合併後再寫回（避免多人同時操作覆蓋）
        const[latestPRows,latestTRows,latestRRows]=await Promise.all([
          sheetGet("Projects"),sheetGet("Tasks"),sheetGet("Repairs")
        ]);
        const latestProjects=rowsToProjects(latestPRows,latestTRows,latestRRows);

        // 衝突偵測：比對每個任務的 updatedAt
        const conflicts=[];
        const mergedProjects=curP.map(localP=>{
          const remoteP=latestProjects.find(p=>p.id===localP.id);
          if(!remoteP)return localP;
          const mergedTasks=localP.tasks.map(localT=>{
            const remoteT=remoteP.tasks.find(t=>t.id===localT.id);
            if(!remoteT)return localT;
            // 若遠端比本地新，且本地有修改（updatedAt 不同）→ 衝突
            if(remoteT.updatedAt&&localT.updatedAt&&
               remoteT.updatedAt>localT.updatedAt&&
               remoteT.updatedAt!==localT.updatedAt){
              conflicts.push({pid:localP.id,projName:localP.name,tid:localT.id,local:localT,remote:remoteT});
              return remoteT; // 暫時以遠端為主，讓使用者決定
            }
            return localT;
          });
          // 專案層級以 localP 為主（包含 milestones, status 等本地修改）
          return{...remoteP,...localP,tasks:mergedTasks};
        });

        // 保留遠端新增的專案
        const localIds=new Set(curP.map(p=>p.id));
        const remoteOnlyProjects=latestProjects.filter(p=>!localIds.has(p.id));
        const finalProjects=[...mergedProjects,...remoteOnlyProjects];

        const curCR=latestState.current.customRepairs;
        await Promise.all([
          sheetPut("Projects",projectsToRows(finalProjects)),
          sheetPut("Tasks",tasksToRows(finalProjects)),
          sheetPut("Repairs",repairsToRows(finalProjects)),
          sheetPut("CustomRepairs",[["id","desc","status","note","assignedDate","owner","customProjectName"],...curCR.map(r=>[r.id,r.desc,r.status,r.note||"",r.assignedDate||"",r.owner||"",r.customProjectName||""])]),
          ...(ms?[sheetPut("Members",membersToRows(curM))]:[]),
          ...(tms?[sheetPut("Templates",templatesToRows(curT))]:[]),
        ]);

        // 更新本地 state
        setProjects(finalProjects);

        // 如果有衝突，顯示第一個衝突給使用者處理
        if(conflicts.length>0){
          setConflict(conflicts[0]);
        }
      }catch(e){console.error(e);setSaveError(true);setTimeout(()=>setSaveError(false),4000);}
      finally{setSaving(false);saveTimer.current=null;}
    },800);
  },[]);

  const proj=selected?projects.find(p=>p.id===selected):null;

  function updateProjects(next){setProjects(next);scheduleSave(next,null,null);}
  function applyColor(hex){C=buildColors(hex);setColorHex(hex);setModal(null);}
  function saveMembers(list){setMembers(list);scheduleSave(null,list,null);setModal(null);}
  function updateRepair(pid,rid,status){updateProjects(projects.map(p=>p.id===pid?{...p,repairs:(p.repairs||[]).map(r=>r.id===rid?{...r,status}:r)}:p));}

  // ── 全域修繕管理 ──
  function moveGlobalRepair(oldPid,rid,newData){
    // 一次性：從舊案件移除並加入新案件，避免兩次 updateProjects 的 stale state 問題
    const newRepairItem={id:Date.now(),desc:newData.desc,note:newData.note||"",status:newData.status||"待安排",assignedDate:newData.assignedDate||"",owner:newData.owner||""};
    const newPid=newData.projectId;
    if(newPid==="__custom__"){
      const removed=projects.map(p=>p.id===oldPid?{...p,repairs:(p.repairs||[]).filter(r=>r.id!==rid)}:p);
      updateProjects(removed);
      setCustomRepairs(prev=>[...prev,{...newRepairItem,customProjectName:newData.customProjectName||""}]);
    }else{
      const next=projects.map(p=>{
        if(p.id===oldPid)return{...p,repairs:(p.repairs||[]).filter(r=>r.id!==rid)};
        if(p.id===newPid)return{...p,repairs:[...(p.repairs||[]),newRepairItem]};
        return p;
      });
      updateProjects(next);
    }
  }

  function addGlobalRepair(repair){
    const now=Date.now();
    const newRepairItem={id:now,desc:repair.desc,note:repair.note||"",status:"待安排",assignedDate:repair.assignedDate||"",owner:repair.owner||""};

    if(repair.projectId==="__custom__"){
      // 手動輸入：存入 customRepairs（獨立 state，不污染 Projects）
      const customName=repair.customProjectName||"手動輸入案件";
      setCustomRepairs(prev=>[...prev,{...newRepairItem,customProjectName:customName}]);
    }else{
      const pid=repair.projectId;
      const next=projects.map(p=>p.id===pid?{...p,repairs:[...(p.repairs||[]),newRepairItem]}:p);
      updateProjects(next);
    }
  }
  function updateGlobalRepair(pid,rid,updates){
    if(pid==="__custom__"){
      setCustomRepairs(prev=>prev.map(r=>r.id===rid?{...r,...updates}:r));
      return;
    }
    const next=projects.map(p=>p.id===pid?{...p,repairs:(p.repairs||[]).map(r=>r.id===rid?{...r,...updates}:r)}:p);
    updateProjects(next);
  }
  function deleteGlobalRepair(pid,rid){
    if(pid==="__custom__"){
      setCustomRepairs(prev=>prev.filter(r=>r.id!==rid));
      return;
    }
    const next=projects.map(p=>p.id===pid?{...p,repairs:(p.repairs||[]).filter(r=>r.id!==rid)}:p);
    updateProjects(next);
  }

  function addProject(){
    if(!newProj.name||!newProj.start||!newProj.end)return;
    const yr=new Date().getFullYear().toString().slice(2);
    const n=String(projects.filter(p=>p.type===newProj.type).length+1).padStart(2,"0");
    const autoId=`${newProj.type==="建築"?"A":"I"}_${yr}${n}`;
    const finalId=editingId&&customId.trim()?customId.trim():autoId;
    // 驗證 ID 不重複
    if(projects.some(p=>p.id===`WD_${finalId}`)){
      setDupIdError(true);return;
    }
    setDupIdError(false);
    const next=[...projects,{...newProj,id:`WD_${finalId}`,status:"規劃中",tasks:[],repairs:[],archived:false,milestones:{design:defaultDesignMS(),construction:defaultConstructionMS()},template:""}];
    updateProjects(next);setNewProj({name:"",type:"室內",client:"",clientDetail:"",start:"",end:"",members:[]});setCustomId("");setEditingId(false);setView("overview");
  }

  function addTask(pid){
    if(!newTask.name)return;
    const now=new Date().toISOString();
    const next=projects.map(p=>p.id===pid?{...p,tasks:[...p.tasks,{id:Date.now(),...newTask,owners:newTask.owners||[],done:false,subtasks:[],images:newTask.images||[],updatedAt:now}]}:p);
    updateProjects(next);setNewTask({name:"",owners:members.length>0?[members[0]]:[],due:"",note:"",category:"設計",images:[]});setShowAdd(false);
  }

  function toggle(pid,tid){const now=new Date().toISOString();updateProjects(projects.map(p=>p.id===pid?{...p,tasks:p.tasks.map(t=>t.id===tid?{...t,done:!t.done,updatedAt:now}:t)}:p));}
  function delTask(pid,tid){updateProjects(projects.map(p=>p.id===pid?{...p,tasks:p.tasks.filter(t=>t.id!==tid)}:p));setConfirmDel(null);}
  function saveEdit(pid,tid,u){const now=new Date().toISOString();updateProjects(projects.map(p=>p.id===pid?{...p,tasks:p.tasks.map(t=>t.id===tid?{...t,...u,updatedAt:now}:t)}:p));setEditTask(null);}
  function updateTaskDetail(pid,updated){const now=new Date().toISOString();const u={...updated,updatedAt:now};updateProjects(projects.map(p=>p.id===pid?{...p,tasks:p.tasks.map(t=>t.id===u.id?u:t)}:p));}
  function addRepair(pid){if(!newRepair.desc)return;updateProjects(projects.map(p=>p.id===pid?{...p,repairs:[...(p.repairs||[]),{id:Date.now(),desc:newRepair.desc,note:newRepair.note,status:"待安排"}]}:p));setNewRepair({desc:"",note:""});setShowAddRepair(false);}
  function updateMilestones(pid,ms){updateProjects(projects.map(p=>p.id===pid?{...p,milestones:ms}:p));}
  function reorderTasks(pid, fromId, toId){
    const next=projects.map(p=>{
      if(p.id!==pid)return p;
      const tasks=[...p.tasks];
      const fromIdx=tasks.findIndex(t=>t.id===fromId);
      const toIdx=tasks.findIndex(t=>t.id===toId);
      if(fromIdx===-1||toIdx===-1)return p;
      const[moved]=tasks.splice(fromIdx,1);
      tasks.splice(toIdx,0,moved);
      return{...p,tasks};
    });
    setProjects(next);
    scheduleSave(next,null,null);
  }

  function reorderSubtasks(pid, tid, fromId, toId){
    const next=projects.map(p=>{
      if(p.id!==pid)return p;
      return{...p,tasks:p.tasks.map(t=>{
        if(t.id!==tid)return t;
        const subs=[...(t.subtasks||[])];
        const fromIdx=subs.findIndex(s=>s.id===fromId);
        const toIdx=subs.findIndex(s=>s.id===toId);
        if(fromIdx===-1||toIdx===-1)return t;
        const[moved]=subs.splice(fromIdx,1);
        subs.splice(toIdx,0,moved);
        return{...t,subtasks:subs};
      })};
    });
    setProjects(next);
    scheduleSave(next,null,null);
    return next;
  }

  function archiveProject(pid){updateProjects(projects.map(p=>p.id===pid?{...p,archived:true,status:"完成"}:p));goBack();}
  function saveEditInfo(pid,f){updateProjects(projects.map(p=>p.id===pid?{...p,...f}:p));setShowEditInfo(false);}
  function saveTemplate(name){
    if(!proj)return;
    const taskData=proj.tasks.map(t=>({name:t.name,category:t.category,note:t.note}));
    const next=[...templates.filter(t=>t.name!==name),{name,tasks:taskData}];
    setTemplates(next);scheduleSave(null,null,next);setShowTemplate(false);
  }
  function applyTemplate(tpl){
    if(!proj)return;
    const newTasks=tpl.tasks.map((t,i)=>({id:Date.now()+i,projectId:proj.id,name:t.name,owner:members[0]||"",due:"",done:false,note:t.note||"",category:t.category||"設計",subtasks:[],images:[],owners:t.owners||[members[0]||""],updatedAt:new Date().toISOString()}));
    updateProjects(projects.map(p=>p.id===proj.id?{...p,tasks:[...p.tasks,...newTasks]}:p));
    setShowTemplate(false);
  }
  function goBack(){setView("overview");setSelected(null);setShowAdd(false);setEditTask(null);setConfirmDel(null);setTaskDetail(null);setShowEditInfo(false);setShowTemplate(false);setDetailTab("tasks");setTaskCatFilter("全部");setShowAddRepair(false);setCollapsedCats({});}
  function toggleCat(cat){setCollapsedCats(c=>({...c,[cat]:!c[cat]}));}

  const activeProjects=projects.filter(p=>!p.archived);
  const archivedProjects=projects.filter(p=>p.archived);
  const today=new Date().toISOString().slice(0,10);
  const overdueT=activeProjects.reduce((a,p)=>a+p.tasks.filter(t=>t.due&&!t.done&&t.due<today).length,0);
  // 修繕進行：合併所有專案修繕 + 手動修繕，排除已完成
  const allRepairsForBadge=[
    ...[...activeProjects,...projects.filter(p=>p.archived)].flatMap(p=>(p.repairs||[]).map(r=>({...r,projId:p.id}))),
    ...(customRepairs||[]).map(r=>({...r,projId:"__custom__"}))
  ];
  const repairT=allRepairsForBadge.filter(r=>r.status!=="已完成").length;
  const payT=activeProjects.reduce((a,p)=>a+p.tasks.filter(t=>isPayment(t.name)&&!t.done).length,0);
  const totalT=activeProjects.reduce((a,p)=>a+p.tasks.length,0);
  const doneT=activeProjects.reduce((a,p)=>a+p.tasks.filter(t=>t.done).length,0);

  const yr=new Date().getFullYear().toString().slice(2);
  const nn=String(projects.filter(p=>p.type===newProj.type).length+1).padStart(2,"0");
  const autoId=`${newProj.type==="建築"?"A":"I"}_${yr}${nn}`;
  const displayId=editingId?customId:autoId;

  // 任務分類篩選
  const filteredTasks=(proj?.tasks||[]).filter(t=>taskCatFilter==="全部"||t.category===taskCatFilter);
  // groupedTasks removed (unused)

  if(loading)return(<div style={{minHeight:"100vh",background:C.bg,display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:10}}><div style={{fontSize:13,color:C.inkSoft,letterSpacing:"0.1em"}}>載入中…</div><div style={{fontSize:10,color:C.inkFaint}}>正在從 Google Sheets 讀取資料</div></div>);

  return(
    <div style={{minHeight:"100vh",background:C.bg,color:C.ink,fontFamily:"'微軟正黑體','Microsoft JhengHei',sans-serif",display:"flex",flexDirection:"column"}}>
      <SavingBadge saving={saving} error={saveError} syncing={syncing}/>

      {/* Modals */}
      {modal==="color"&&<ColorPanel onClose={()=>setModal(null)} onApply={applyColor} currentHex={colorHex}/>}
      {modal==="member"&&<MemberPanel members={members} onClose={()=>setModal(null)} onSave={saveMembers}/>}
      {modal==="overdue"&&<OverdueModal projects={activeProjects} onClose={()=>setModal(null)}/>}
      {modal==="payment"&&<PaymentModal projects={activeProjects} onClose={()=>setModal(null)}/>}
      {modal==="repair"&&<RepairModal projects={[...activeProjects,...projects.filter(p=>p.archived)]} customRepairs={customRepairs} onClose={()=>setModal(null)} onUpdate={updateRepair}/>}
      {taskDetail&&proj&&<TaskDetailModal task={taskDetail} onClose={()=>setTaskDetail(null)} onUpdate={t=>{updateTaskDetail(proj.id,t);setTaskDetail(t);}} members={members} onReorderSub={(fId,tId)=>{const next=reorderSubtasks(proj.id,taskDetail.id,fId,tId);if(next){const updatedP=next.find(p=>p.id===proj.id);const updatedT=updatedP?.tasks.find(t=>t.id===taskDetail.id);if(updatedT)setTaskDetail({...updatedT});}}} />}
      {/* 衝突解決 Modal */}
      {conflict&&(
        <Modal title="⚠️ 任務內容衝突" onClose={()=>setConflict(null)} wide>
          <div style={{fontSize:12,color:C.inkSoft,marginBottom:16}}>
            「{conflict.projName}」的任務「{conflict.local.name}」已被其他人修改，請選擇要保留哪個版本：
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:16}}>
            {/* 本地版本 */}
            <div style={{background:C.bgSunk,border:`1px solid ${C.border}`,borderRadius:6,padding:"12px 14px"}}>
              <div style={{fontSize:10,color:C.inkFaint,letterSpacing:"0.12em",marginBottom:8}}>你的版本</div>
              {[["任務名稱",conflict.local.name],["負責人",(conflict.local.owners||[]).join("、")||"未指派"],["期限",conflict.local.due||"—"],["備註",conflict.local.note||"—"],["狀態",conflict.local.done?"完成":"進行中"]].map(([l,v])=>(
                <div key={l} style={{marginBottom:5}}>
                  <span style={{fontSize:10,color:C.inkFaint}}>{l}：</span>
                  <span style={{fontSize:11,color:C.ink}}>{v}</span>
                </div>
              ))}
              <div style={{fontSize:9,color:C.inkFaint,marginTop:8}}>修改時間：{conflict.local.updatedAt?new Date(conflict.local.updatedAt).toLocaleString("zh-TW"):"—"}</div>
            </div>
            {/* 遠端版本 */}
            <div style={{background:C.bgSunk,border:`1px solid ${C.accent}`,borderRadius:6,padding:"12px 14px"}}>
              <div style={{fontSize:10,color:C.accent,letterSpacing:"0.12em",marginBottom:8}}>對方的版本</div>
              {[["任務名稱",conflict.remote.name],["負責人",(conflict.remote.owners||[]).join("、")||"未指派"],["期限",conflict.remote.due||"—"],["備註",conflict.remote.note||"—"],["狀態",conflict.remote.done?"完成":"進行中"]].map(([l,v])=>(
                <div key={l} style={{marginBottom:5}}>
                  <span style={{fontSize:10,color:C.inkFaint}}>{l}：</span>
                  <span style={{fontSize:11,color:C.ink}}>{v}</span>
                </div>
              ))}
              <div style={{fontSize:9,color:C.inkFaint,marginTop:8}}>修改時間：{conflict.remote.updatedAt?new Date(conflict.remote.updatedAt).toLocaleString("zh-TW"):"—"}</div>
            </div>
          </div>
          <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
            <button onClick={()=>{
              // 保留我的版本
              const now=new Date().toISOString();
              const resolved={...conflict.local,updatedAt:now};
              const next=projects.map(p=>p.id===conflict.pid?{...p,tasks:p.tasks.map(t=>t.id===conflict.tid?resolved:t)}:p);
              updateProjects(next);
              setConflict(null);
            }} style={bSt()}>保留我的版本</button>
            <button onClick={()=>{
              // 接受對方版本，寫回 Sheets
              const next=projects.map(p=>p.id===conflict.pid?{...p,tasks:p.tasks.map(t=>t.id===conflict.tid?conflict.remote:t)}:p);
              updateProjects(next);
              setConflict(null);
            }} style={bSt(C.accent,C.accent,C.accentText)}>接受對方版本</button>
          </div>
        </Modal>
      )}
      {showAdminLogin&&(
        <Modal title="管理員登入" onClose={()=>{setShowAdminLogin(false);setAdminPwInput("");setAdminPwError(false);}}>
          <div style={{display:"flex",flexDirection:"column",gap:12}}>
            <Field label="請輸入管理員密碼">
              <input type="password" value={adminPwInput} onChange={e=>{setAdminPwInput(e.target.value);setAdminPwError(false);}}
                onKeyDown={e=>{if(e.key==="Enter"){if(adminPwInput===ADMIN_PASSWORD){setIsAdmin(true);setShowAdminLogin(false);setAdminPwInput("");}else{setAdminPwError(true);}}}}
                placeholder="輸入密碼" style={iSt()} autoFocus/>
            </Field>
            {adminPwError&&<div style={{fontSize:11,color:C.warn}}>密碼錯誤，請再試一次</div>}
            <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
              <button onClick={()=>{setShowAdminLogin(false);setAdminPwInput("");setAdminPwError(false);}} style={bSt()}>取消</button>
              <button onClick={()=>{if(adminPwInput===ADMIN_PASSWORD){setIsAdmin(true);setShowAdminLogin(false);setAdminPwInput("");}else{setAdminPwError(true);}}} style={bSt(C.accent,C.accent,C.accentText)}>登入</button>
            </div>
          </div>
        </Modal>
      )}
      {showEditInfo&&proj&&<EditInfoModal proj={proj} onClose={()=>setShowEditInfo(false)} onSave={f=>saveEditInfo(proj.id,f)}/>}
      {showTemplate&&proj&&<TemplateModal proj={proj} templates={templates} onClose={()=>setShowTemplate(false)} onSaveTemplate={saveTemplate} onApplyTemplate={applyTemplate}/>}

      {/* Header */}
      <header style={{background:C.bgSunk,borderBottom:`1px solid ${C.border}`,padding:"0 12px",height:52,display:"flex",alignItems:"center",justifyContent:"space-between",position:"sticky",top:0,zIndex:20,gap:8}}>
        <div style={{display:"flex",alignItems:"center",gap:8,flex:1,minWidth:0}}>
          <span style={{fontSize:10,letterSpacing:"0.12em",color:C.inkSoft,fontWeight:500,flexShrink:0}}>whatis</span>
          <span style={{color:C.border,fontSize:14,fontWeight:100,flexShrink:0}}>|</span>
          <span style={{fontSize:12,color:C.inkMid,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",minWidth:0}}>{view==="overview"?"專案進度總表":view==="new"?"新增專案":proj?.name}</span>
          {view==="detail"&&proj&&<span style={{flexShrink:0}}><StatusBadge status={proj.status}/></span>}
          {isAdmin&&<span style={{fontSize:9,color:C.warn,border:`1px solid ${C.warn}`,padding:"2px 6px",borderRadius:2,letterSpacing:"0.06em",flexShrink:0}}>管理員</span>}
        </div>
        <div style={{display:"flex",gap:4,alignItems:"center",flexShrink:0}}>
          {view!=="overview"&&<button onClick={goBack} style={bSt()}>← 返回</button>}
          {view==="overview"&&<button onClick={()=>setView("new")} style={bSt(C.accent,C.accent,C.accentText)}>＋ 新增專案</button>}
          {view==="detail"&&<button onClick={()=>{setShowAdd(true);setDetailTab("tasks");}} style={bSt(C.accent,C.accent,C.accentText)}>＋ 新增任務</button>}
          <button onClick={()=>window.open(window.location.href,"wd-float","width=420,height=640,resizable=yes,scrollbars=yes,toolbar=no,menubar=no,location=no,status=no")} style={{background:"none",border:"none",color:C.inkMid,cursor:"pointer",padding:"6px 8px",fontSize:13,fontFamily:"'微軟正黑體','Microsoft JhengHei',sans-serif",letterSpacing:"0.02em"}} title="開啟小視窗">⊞&#xFE0E;</button>
          <div style={{position:"relative"}} ref={funcRef}>
            <button onClick={()=>setShowFuncMenu(!showFuncMenu)} style={{background:"none",border:"none",color:C.inkMid,cursor:"pointer",padding:"6px 10px",fontSize:14,fontFamily:"'微軟正黑體','Microsoft JhengHei',sans-serif"}}>⚙&#xFE0E;</button>
            {showFuncMenu&&(<div style={{position:"absolute",right:0,top:"calc(100% + 6px)",background:C.bgRaised,border:`1px solid ${C.border}`,borderRadius:6,minWidth:140,boxShadow:"0 4px 16px rgba(0,0,0,0.12)",zIndex:30}}>{[{icon:"🎨",label:"調整配色",action:()=>{setModal("color");setShowFuncMenu(false);}},{icon:"👥",label:"人員管理",action:()=>{setModal("member");setShowFuncMenu(false);}},{icon:"🔄",label:"重新整理",action:()=>{loadAll(true,true);setShowFuncMenu(false);}},{icon:isAdmin?"🔓":"🔐",label:isAdmin?"登出管理員":"管理員登入",action:()=>{if(isAdmin){setIsAdmin(false);}else{setShowAdminLogin(true);}setShowFuncMenu(false);}}].map(item=>(<button key={item.label} onClick={item.action} style={{display:"flex",alignItems:"center",gap:8,width:"100%",padding:"10px 14px",background:"none",border:"none",color:C.inkMid,cursor:"pointer",fontSize:12,textAlign:"left",fontFamily:"'微軟正黑體','Microsoft JhengHei',sans-serif"}}><span>{item.icon}</span><span>{item.label}</span></button>))}</div>)}
          </div>
        </div>
      </header>

      <main style={{flex:1,padding:"14px",maxWidth:1060,width:"100%",margin:"0 auto",boxSizing:"border-box"}}>

        {/* ══ 總表 ══ */}
        {view==="overview"&&(<div style={{opacity:mounted?1:0,transition:"opacity 0.5s"}}>
          <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:8,marginBottom:20}}>
            {[{label:"進行中",value:activeProjects.filter(p=>p.status==="進行中").length,sub:"個專案",click:null},{label:"任務完成",value:`${doneT}／${totalT}`,sub:"",click:null},{label:"逾期任務",value:overdueT,sub:"個",warn:overdueT>0,click:()=>setModal("overdue")},{label:"修繕進行",value:repairT,sub:"項",warn:repairT>0,click:()=>{setOTab("repairs");}},{label:"待請款",value:payT,sub:"筆",warn:payT>0,click:()=>setModal("payment")}].map(s=>(<div key={s.label} onClick={s.click||undefined} style={{background:C.bgRaised,border:`1px solid ${s.warn?"#A07060":C.border}`,borderRadius:6,padding:"12px 14px",boxShadow:"0 1px 3px rgba(0,0,0,0.08)",cursor:s.click?"pointer":"default",transition:"background 0.15s"}} onMouseEnter={e=>{if(s.click)e.currentTarget.style.background=C.bgHover;}} onMouseLeave={e=>{if(s.click)e.currentTarget.style.background=C.bgRaised;}}><div style={{fontSize:22,fontWeight:300,color:s.warn?C.warn:C.ink,letterSpacing:"-0.02em"}}>{s.value}</div><div style={{fontSize:9,color:C.inkFaint,marginTop:3,letterSpacing:"0.1em"}}>{s.label}{s.sub?` ${s.sub}`:""}</div>{s.click&&<div style={{fontSize:9,color:C.inkFaint,marginTop:2}}>點擊查看 →</div>}</div>))}
          </div>
          <TabBar tabs={[["list","清單"],["gantt","甘特圖"],["repairs","修繕管理"]]} active={oTab} onChange={setOTab}/>
          {oTab==="list"&&(<div style={{display:"flex",flexDirection:"column",gap:6,marginTop:8}}>
            {activeProjects.map((p,i)=>{const pc=pct(p.tasks);const days=daysLeft(p.end);return(<div key={p.id} onClick={()=>{setSelected(p.id);setView("detail");setDetailTab("tasks");}} style={{padding:"13px 14px",background:C.bgRaised,border:`1px solid ${C.border}`,borderRadius:6,cursor:"pointer",boxShadow:"0 1px 2px rgba(0,0,0,0.06)",opacity:mounted?1:0,transform:mounted?"none":"translateY(5px)",transition:`opacity 0.4s ${i*0.06}s, transform 0.4s ${i*0.06}s, background 0.15s`}} onMouseEnter={e=>e.currentTarget.style.background=C.bgHover} onMouseLeave={e=>e.currentTarget.style.background=C.bgRaised}><div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}><span style={{width:20,height:20,borderRadius:3,background:C.accent,display:"flex",alignItems:"center",justifyContent:"center",fontSize:8,color:C.accentText,flexShrink:0}}>{typeTag(p.type)}</span><span style={{fontSize:10,color:C.inkFaint,flexShrink:0}}>{p.id}</span><span style={{fontSize:13,color:C.ink,fontWeight:500,flex:1}}>{p.name}</span><StatusBadge status={p.status}/></div><div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}><div style={{flex:1,height:3,background:C.bgSunk,borderRadius:2}}><div style={{width:`${pc}%`,height:"100%",background:pc===100?C.ok:C.accentMid,borderRadius:2,transition:"width 0.7s"}}/></div><span style={{fontSize:10,color:C.inkFaint,flexShrink:0}}>{pc}%</span><span style={{fontSize:10,color:C.inkFaint}}>·</span><span style={{fontSize:10,color:C.inkSoft,flexShrink:0}}>{fmt(p.end)}</span><span style={{fontSize:10,color:days<0?C.warn:days<30?"#7A6A30":C.inkFaint,flexShrink:0}}>{days<0?`逾 ${Math.abs(days)}天`:`剩 ${days}天`}</span></div>{p.members&&p.members.length>0&&(<div style={{display:"flex",alignItems:"center",gap:4}}><span style={{fontSize:9,color:C.inkFaint,marginRight:2}}>負責</span>{p.members.map((m,mi)=>(<div key={mi} style={{display:"flex",alignItems:"center",gap:3}}><Avatar name={m} size={15} members={members}/><span style={{fontSize:10,color:C.inkSoft}}>{SHORT(m)}</span></div>))}</div>)}</div>);})}
          </div>)}
          {oTab==="gantt"&&<div style={{marginTop:4}}><GanttChart projects={activeProjects} members={members}/></div>}

          {/* ══ 修繕管理 Tab ══ */}
          {oTab==="repairs"&&(<RepairTab
            projects={[...activeProjects,...archivedProjects]}
            customRepairs={customRepairs}
            members={members}
            showAddRepairGlobal={showAddRepairGlobal}
            setShowAddRepairGlobal={setShowAddRepairGlobal}
            newRepairGlobal={newRepairGlobal}
            setNewRepairGlobal={setNewRepairGlobal}
            editRepairId={editRepairId}
            setEditRepairId={setEditRepairId}
            editRepairData={editRepairData}
            setEditRepairData={setEditRepairData}
            confirmRepairId={confirmRepairId}
            setConfirmRepairId={setConfirmRepairId}
            onAdd={addGlobalRepair}
            onUpdate={updateGlobalRepair}
            onDelete={deleteGlobalRepair}
            onMoveRepair={moveGlobalRepair}
          />)}

          {archivedProjects.length>0&&(<div style={{marginTop:20}}><button onClick={()=>setShowArchive(!showArchive)} style={{display:"flex",alignItems:"center",gap:6,background:"none",border:"none",color:C.inkFaint,cursor:"pointer",fontSize:11,padding:"6px 0",fontFamily:"'微軟正黑體','Microsoft JhengHei',sans-serif"}}><span style={{transition:"transform 0.2s",display:"inline-block",transform:showArchive?"rotate(90deg)":"rotate(0deg)"}}>▶</span>封存案件（{archivedProjects.length}）</button>{showArchive&&(<div style={{display:"flex",flexDirection:"column",gap:4,marginTop:6}}>{archivedProjects.map(p=>(<div key={p.id} style={{padding:"10px 14px",background:C.bgSunk,border:`1px solid ${C.borderLight}`,borderRadius:5,display:"flex",alignItems:"center",gap:8}}><span style={{width:17,height:17,borderRadius:2,background:C.inkFaint,display:"flex",alignItems:"center",justifyContent:"center",fontSize:7,color:C.bg}}>{typeTag(p.type)}</span><span style={{fontSize:10,color:C.inkFaint}}>{p.id}</span><span style={{fontSize:12,color:C.inkSoft,flex:1}}>{p.name}</span><span style={{fontSize:10,color:C.inkFaint}}>{fmt(p.end)}</span><button onClick={e=>{e.stopPropagation();updateProjects(projects.map(pp=>pp.id===p.id?{...pp,archived:false,status:"進行中"}:pp));}} style={{...bSt(),padding:"3px 8px",fontSize:10,flexShrink:0}}>恢復</button>{isAdmin&&(confirmDeleteProject===p.id
  ?<><button onClick={e=>{e.stopPropagation();updateProjects(projects.filter(pp=>pp.id!==p.id));setConfirmDeleteProject(null);}} style={{...bSt(),padding:"3px 8px",fontSize:10,flexShrink:0,color:C.warn,borderColor:C.warn}}>確認刪除</button>
    <button onClick={e=>{e.stopPropagation();setConfirmDeleteProject(null);}} style={{...bSt(),padding:"3px 8px",fontSize:10,flexShrink:0}}>取消</button></>
  :<button onClick={e=>{e.stopPropagation();setConfirmDeleteProject(p.id);}} style={{...bSt(),padding:"3px 8px",fontSize:10,flexShrink:0,color:C.warn,borderColor:C.warn}}>刪除</button>
)}</div>))}</div>)}</div>)}
        </div>)}

        {/* ══ 詳情 ══ */}
        {view==="detail"&&proj&&(<div style={{opacity:mounted?1:0,transition:"opacity 0.3s"}}>

          {/* 資訊欄 */}
          <div style={{background:C.bgRaised,border:`1px solid ${C.border}`,borderRadius:6,padding:"14px 18px",marginBottom:10,boxShadow:"0 1px 3px rgba(0,0,0,0.07)"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
              <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12,flex:1}}>
                {[["案件編號",proj.id],["業主",proj.client||"—"],["類型",proj.type]].map(([l,v])=>(<div key={l}><div style={{fontSize:9,color:C.inkFaint,letterSpacing:"0.12em",marginBottom:4}}>{l}</div><div style={{fontSize:12,color:C.inkMid}}>{v}</div></div>))}
              </div>
              <button onClick={()=>setShowEditInfo(true)} style={{...bSt(),padding:"4px 10px",fontSize:11,marginLeft:10,flexShrink:0}}>編輯</button>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:12,marginBottom:proj.clientDetail?10:0}}>
              {[["開始",fmt(proj.start)],["預計完成",fmt(proj.end)]].map(([l,v])=>(<div key={l}><div style={{fontSize:9,color:C.inkFaint,letterSpacing:"0.12em",marginBottom:4}}>{l}</div><div style={{fontSize:12,color:C.inkMid}}>{v}</div></div>))}
            </div>
            {proj.clientDetail&&<div style={{fontSize:11,color:C.inkFaint,padding:"6px 10px",background:C.bgSunk,borderRadius:3}}>{proj.clientDetail}</div>}
          </div>

          {/* 任務完成總覽 */}
          <div style={{background:C.bgRaised,border:`1px solid ${C.border}`,borderRadius:6,padding:"12px 18px",marginBottom:10,boxShadow:"0 1px 3px rgba(0,0,0,0.07)"}}>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
              <span style={{fontSize:9,color:C.inkFaint,letterSpacing:"0.12em"}}>整體進度</span>
              <span style={{fontSize:10,color:C.inkSoft}}>{proj.tasks.filter(t=>t.done).length}/{proj.tasks.length} 完成 · {pct(proj.tasks)}%</span>
            </div>
            <div style={{height:3,background:C.bgSunk,borderRadius:2,marginBottom:0}}><div style={{width:`${pct(proj.tasks)}%`,height:"100%",background:C.accentMid,borderRadius:2,transition:"width 0.8s"}}/></div>
          </div>

          {/* 里程碑 */}
          <MilestonePanel milestones={proj.milestones||{design:defaultDesignMS(),construction:defaultConstructionMS()}} onChange={ms=>updateMilestones(proj.id,ms)}/>

          {/* 狀態 + 操作 */}
          <div style={{display:"flex",gap:6,marginBottom:12,alignItems:"center",flexWrap:"wrap"}}>
            <span style={{fontSize:9,color:C.inkFaint,letterSpacing:"0.12em",marginRight:4}}>狀態</span>
            {STATUS_LIST.map(s=>(<button key={s} onClick={()=>updateProjects(projects.map(p=>p.id===proj.id?{...p,status:s}:p))} style={{...bSt(proj.status===s?C.accent:"transparent",proj.status===s?C.accent:C.border,proj.status===s?C.accentText:C.inkSoft),padding:"4px 10px",fontSize:11}}>{s}</button>))}
            <div style={{flex:1}}/>
            <button onClick={()=>setShowTemplate(true)} style={{...bSt(),padding:"4px 10px",fontSize:11}}>📋 範本</button>
            <button onClick={()=>archiveProject(proj.id)} style={{...bSt(),padding:"4px 10px",fontSize:11,color:C.warn}}>封存</button>
          </div>

          <TabBar tabs={[["tasks","任務清單"],["gantt_local","甘特圖"]]} active={detailTab} onChange={setDetailTab}/>

          {/* ── 任務清單 ── */}
          {detailTab==="tasks"&&(<div style={{marginTop:8}}>
            {/* 新增表單 */}
            {showAdd&&(<div style={{background:C.bgRaised,border:`1px solid ${C.border}`,borderRadius:6,padding:"12px 14px",marginBottom:8,boxShadow:"0 1px 3px rgba(0,0,0,0.07)"}}>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8}}>
                <Field label="任務名稱"><input placeholder="輸入任務名稱" value={newTask.name} onChange={e=>setNewTask({...newTask,name:e.target.value})} style={iSt()}/></Field>
                <Field label="期限（選填）"><input type="date" value={newTask.due} onChange={e=>setNewTask({...newTask,due:e.target.value})} style={{...iSt(),minHeight:40,WebkitAppearance:"none"}}/></Field>
                <Field label="類別"><select value={newTask.category} onChange={e=>setNewTask({...newTask,category:e.target.value})} style={sSt()}>{TASK_CATEGORIES.map(c=><option key={c}>{c}</option>)}</select></Field>
                <Field label="備註"><input placeholder="選填" value={newTask.note} onChange={e=>setNewTask({...newTask,note:e.target.value})} style={iSt()}/></Field>
              </div>
              {/* 負責人多選 */}
              <Field label="負責人（可多選）">
                <div style={{padding:"8px 10px",background:C.bgHover,border:`1px solid ${C.border}`,borderRadius:4,minHeight:42}}>
                  {members.length===0
                    ?<span style={{fontSize:11,color:C.inkFaint}}>載入人員中…</span>
                    :<div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                      {members.map(m=>{const sel=(newTask.owners||[]).includes(m);return(
                        <button type="button" key={m}
                          onClick={()=>setNewTask(prev=>{const cur=prev.owners||[];return {...prev,owners:sel?cur.filter(x=>x!==m):[...cur,m]};})}
                          style={{...bSt(sel?C.accent:"transparent",sel?C.accent:C.border,sel?C.accentText:C.inkMid),padding:"4px 12px",fontSize:12,display:"flex",alignItems:"center",gap:5}}>
                          <Avatar name={m} size={14} members={members}/>{m}
                        </button>
                      );})}
                    </div>
                  }
                </div>
              </Field>
              {/* 上傳圖片 */}
              <NewTaskImageUpload images={newTask.images||[]} onUpload={async(file)=>{
                const result=await uploadImage(file);
                if(result.success){setNewTask(prev=>({...prev,images:[...(prev.images||[]),{fileId:result.fileId,viewUrl:result.viewUrl,thumbUrl:result.thumbUrl,fileName:result.fileName}]}));}
              }} onDelete={async(fileId,i)=>{
                setNewTask(prev=>({...prev,images:(prev.images||[]).filter((_,idx)=>idx!==i)}));
                await deleteImage(fileId);
              }}/>
              <div style={{display:"flex",gap:6,justifyContent:"flex-end"}}>
                <button type="button" onClick={()=>addTask(proj.id)} style={bSt(C.accent,C.accent,C.accentText)}>確認新增</button>
                <button type="button" onClick={()=>setShowAdd(false)} style={bSt()}>取消</button>
              </div>
            </div>)}

            {/* 分類篩選 */}
            <div style={{display:"flex",gap:6,marginBottom:8}}>
              {["全部",...TASK_CATEGORIES].map(cat=>(<button key={cat} onClick={()=>{setTaskCatFilter(cat);setConfirmDel(null);setEditTask(null);}} style={{...bSt(taskCatFilter===cat?C.accent:"transparent",taskCatFilter===cat?C.accent:C.border,taskCatFilter===cat?C.accentText:C.inkSoft),padding:"4px 12px",fontSize:11}}>{cat}</button>))}
            </div>

            {/* 任務列表 */}
            {taskCatFilter==="全部"
              ? TASK_CATEGORIES.map(cat=>{
                  const catTasks=proj.tasks.filter(t=>t.category===cat);
                  if(!catTasks.length)return null;
                  return(
                    <div key={cat} style={{marginBottom:8}}>
                      <button onClick={()=>toggleCat(cat)} style={{display:"flex",alignItems:"center",gap:6,background:"none",border:"none",color:C.inkSoft,cursor:"pointer",fontSize:11,padding:"5px 0",fontFamily:"'微軟正黑體','Microsoft JhengHei',sans-serif",marginBottom:4}}>
                        <span style={{transition:"transform 0.2s",display:"inline-block",transform:collapsedCats[cat]?"rotate(-90deg)":"rotate(0deg)"}}>▾</span>
                        {cat}（{catTasks.filter(t=>t.done).length}/{catTasks.length}）
                      </button>
                      {!collapsedCats[cat]&&<TaskList tasks={catTasks} proj={proj} members={members} editTask={editTask} confirmDel={confirmDel} setEditTask={setEditTask} setConfirmDel={setConfirmDel} toggle={toggle} delTask={delTask} saveEdit={saveEdit} setTaskDetail={setTaskDetail} onReorder={(fId,tId)=>reorderTasks(proj.id,fId,tId)}/>}
                    </div>
                  );
                })
              : <TaskList tasks={filteredTasks} proj={proj} members={members} editTask={editTask} confirmDel={confirmDel} setEditTask={setEditTask} setConfirmDel={setConfirmDel} toggle={toggle} delTask={delTask} saveEdit={saveEdit} setTaskDetail={setTaskDetail} onReorder={(fId,tId)=>reorderTasks(proj.id,fId,tId)}/>
            }
            {proj.tasks.length===0&&<div style={{padding:"32px",textAlign:"center",color:C.inkFaint,fontSize:12}}>尚無任務</div>}
          </div>)}


          {detailTab==="gantt_local"&&<div style={{marginTop:8}}><ProjectGantt project={proj} members={members}/></div>}
        </div>)}

        {/* ══ 新增專案 ══ */}
        {view==="new"&&(<div style={{maxWidth:540,margin:"0 auto",opacity:mounted?1:0,transition:"opacity 0.3s"}}>
          <div style={{fontSize:9,color:C.inkFaint,letterSpacing:"0.22em",marginBottom:20}}>NEW PROJECT</div>
          <div style={{display:"flex",flexDirection:"column",gap:14}}>
            <Field label="專案名稱"><input placeholder="例：山居案" value={newProj.name} onChange={e=>setNewProj({...newProj,name:e.target.value})} style={iSt()}/></Field>
            <Field label="業主 / 委託方"><input placeholder="選填" value={newProj.client} onChange={e=>setNewProj({...newProj,client:e.target.value})} style={iSt()}/></Field>
            <Field label="業主細部資訊"><textarea placeholder="停車格號碼、樓層位置…（選填）" value={newProj.clientDetail} onChange={e=>setNewProj({...newProj,clientDetail:e.target.value})} style={{...iSt({height:64,resize:"vertical"})}}/></Field>
            <Field label="類型"><div style={{display:"flex",gap:8}}>{["室內","建築"].map(t=>(<button key={t} onClick={()=>setNewProj({...newProj,type:t})} style={{...bSt(newProj.type===t?C.accent:"transparent",newProj.type===t?C.accent:C.border,newProj.type===t?C.accentText:C.inkMid),flex:1,padding:"9px"}}>{t}</button>))}</div></Field>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
              <Field label="開始日期"><input type="date" value={newProj.start} onChange={e=>setNewProj({...newProj,start:e.target.value})} style={{...iSt(),minHeight:40,WebkitAppearance:"none"}}/></Field>
              <Field label="預計完成"><input type="date" value={newProj.end} onChange={e=>setNewProj({...newProj,end:e.target.value})} style={{...iSt(),minHeight:40,WebkitAppearance:"none"}}/></Field>
            </div>
            <Field label="負責人員"><div style={{display:"flex",flexWrap:"wrap",gap:6}}>{members.map(m=>{const sel=newProj.members.includes(m);return(<button key={m} onClick={()=>setNewProj({...newProj,members:sel?newProj.members.filter(x=>x!==m):[...newProj.members,m]})} style={{...bSt(sel?C.accent:"transparent",sel?C.accent:C.border,sel?C.accentText:C.inkMid),padding:"5px 12px",display:"flex",alignItems:"center",gap:5}}><Avatar name={m} size={14} members={members}/>{m}</button>);})}</div></Field>
            <div>
              <div style={{fontSize:9,color:C.inkFaint,letterSpacing:"0.14em",marginBottom:6}}>案件編號</div>
              <div style={{display:"flex",alignItems:"center",gap:8,padding:"10px 14px",background:C.bgRaised,border:`1px solid ${C.border}`,borderRadius:4}}>
                <span style={{fontSize:11,color:C.inkSoft,flex:1}}>WD_{editingId?<input value={customId} onChange={e=>setCustomId(e.target.value)} style={{...iSt({display:"inline-block",width:100,padding:"2px 6px",fontSize:11,marginLeft:2})}}/>:<span style={{color:C.inkMid,fontWeight:500}}>{displayId}</span>}</span>
                <button onClick={()=>{setEditingId(!editingId);if(!editingId)setCustomId(displayId);setDupIdError(false);}} style={{...bSt(),padding:"4px 10px",fontSize:11}}>{editingId?"確認":"修改"}</button>
              </div>
              <div style={{fontSize:10,color:C.inkFaint,marginTop:4}}>格式：類型_年度＋件號，例如 I_2603</div>
              {dupIdError&&<div style={{fontSize:11,color:C.warn,marginTop:4}}>此案件編號已存在，請修改</div>}
            </div>
            <button onClick={addProject} style={{...bSt(C.accent,C.accent,C.accentText),padding:"12px",fontSize:13}}>建立專案</button>
          </div>
        </div>)}
      </main>

      <footer style={{background:C.bgSunk,borderTop:`1px solid ${C.border}`,padding:"9px 16px",display:"flex",justifyContent:"space-between",fontSize:10,color:C.inkFaint,letterSpacing:"0.08em"}}>
        <span>何為設計有限公司 · whatis Design</span>
        <span>工作進度追蹤系統 v0.6{saving?" · 儲存中…":""}</span>
      </footer>
    </div>
  );
}

// ─── RepairTab 元件 ──────────────────────────────────────────
function RepairTab({
  projects,
  customRepairs,
  members,
  showAddRepairGlobal,
  setShowAddRepairGlobal,
  newRepairGlobal,
  setNewRepairGlobal,
  editRepairId,
  setEditRepairId,
  editRepairData,
  setEditRepairData,
  confirmRepairId,
  setConfirmRepairId,
  onAdd,
  onUpdate,
  onDelete,
  onMoveRepair
}){

  const projectRepairs=projects.flatMap(p=>(p.repairs||[]).map(r=>({...r,projName:p.name,projId:p.id,projArchived:p.archived||false})));
  const manualRepairs=(customRepairs||[]).map(r=>({...r,projName:r.customProjectName||"手動輸入案件",projId:"__custom__",projArchived:false,isCustom:true}));
  const allRepairs=[...projectRepairs,...manualRepairs];
  const active=allRepairs.filter(r=>r.status!=="已完成").sort((a,b)=>{if(!a.assignedDate)return 1;if(!b.assignedDate)return -1;return a.assignedDate.localeCompare(b.assignedDate);});
  const done=allRepairs.filter(r=>r.status==="已完成");
  const sorted=[...active,...done];

  function handleAdd(){
    if(!newRepairGlobal.projectId||!newRepairGlobal.desc)return;
    if(newRepairGlobal.projectId==="__custom__"&&!newRepairGlobal.customProjectName.trim())return;
    onAdd(newRepairGlobal);
    setNewRepairGlobal({projectId:"",customProjectName:"",desc:"",note:"",assignedDate:"",owner:""});
    setShowAddRepairGlobal(false);
  }

  function handleSaveEdit(r){
    if(editRepairData.projectId!==r.projId){
      // 換案件：同時傳入兩個操作讓父元件一次性完成
      onMoveRepair(r.projId,r.id,editRepairData);
    }else{
      onUpdate(r.projId,r.id,editRepairData);
    }
    setEditRepairId(null);setEditRepairData(null);
  }

  return(
    <div style={{marginTop:8}}>
      {/* 新增按鈕 */}
      <div style={{display:"flex",justifyContent:"flex-end",marginBottom:10}}>
        <button onClick={()=>setShowAddRepairGlobal(!showAddRepairGlobal)} style={bSt(C.accent,C.accent,C.accentText)}>＋ 新增修繕</button>
      </div>

      {/* 新增表單 */}
      {showAddRepairGlobal&&(
        <div style={{background:C.bgRaised,border:`1px solid ${C.border}`,borderRadius:6,padding:"14px 16px",marginBottom:12,boxShadow:"0 1px 3px rgba(0,0,0,0.07)"}}>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8}}>
            <Field label="關聯案件">
              <select value={newRepairGlobal.projectId} onChange={e=>setNewRepairGlobal({...newRepairGlobal,projectId:e.target.value,customProjectName:""})} style={sSt()}>
                <option value="">請選擇案件</option>
                {projects.map(p=>(<option key={p.id} value={p.id}>{p.id} · {p.name}{p.projArchived?" (封存)":""}</option>))}
                <option value="__custom__">＋ 手動輸入</option>
              </select>
              {newRepairGlobal.projectId==="__custom__"&&(
                <input placeholder="輸入案件名稱" value={newRepairGlobal.customProjectName} onChange={e=>setNewRepairGlobal({...newRepairGlobal,customProjectName:e.target.value})} style={{...iSt(),marginTop:6}}/>
              )}
            </Field>
            <Field label="修繕項目"><input placeholder="例：浴室防水滲漏" value={newRepairGlobal.desc} onChange={e=>setNewRepairGlobal({...newRepairGlobal,desc:e.target.value})} style={iSt()}/></Field>
            <Field label="負責人">
              <select value={newRepairGlobal.owner} onChange={e=>setNewRepairGlobal({...newRepairGlobal,owner:e.target.value})} style={sSt()}>
                <option value="">指派負責人</option>
                {members.map(m=><option key={m}>{m}</option>)}
              </select>
            </Field>
            <Field label="預約日期"><input type="date" value={newRepairGlobal.assignedDate} onChange={e=>setNewRepairGlobal({...newRepairGlobal,assignedDate:e.target.value})} style={{...iSt(),minHeight:40,WebkitAppearance:"none"}}/></Field>
            <Field label="備註"><input placeholder="選填" value={newRepairGlobal.note} onChange={e=>setNewRepairGlobal({...newRepairGlobal,note:e.target.value})} style={iSt()}/></Field>
          </div>
          <div style={{display:"flex",gap:6,justifyContent:"flex-end"}}>
            <button onClick={handleAdd} style={bSt(C.accent,C.accent,C.accentText)}>確認新增</button>
            <button onClick={()=>setShowAddRepairGlobal(false)} style={bSt()}>取消</button>
          </div>
        </div>
      )}

      {/* 修繕列表 */}
      {!sorted.length&&<div style={{padding:"32px",textAlign:"center",color:C.inkFaint,fontSize:12}}>尚無修繕記錄</div>}
      <div style={{display:"flex",flexDirection:"column",gap:6}}>
        {active.length>0&&<div style={{fontSize:9,color:C.inkFaint,letterSpacing:"0.12em",marginBottom:2}}>進行中（{active.length}）</div>}
        {active.map(r=><RepairCard key={`${r.projId}-${r.id}`} r={r} projects={projects} members={members} isEditing={editRepairId===`${r.projId}-${r.id}`} editData={editRepairData} setEditData={setEditRepairData} onStartEdit={()=>{setEditRepairId(`${r.projId}-${r.id}`);setEditRepairData({projectId:r.projId,desc:r.desc,note:r.note||"",assignedDate:r.assignedDate||"",owner:r.owner||"",status:r.status});}} onSave={()=>handleSaveEdit(r)} onCancel={()=>{setEditRepairId(null);setEditRepairData(null);}} onStatusChange={s=>onUpdate(r.projId,r.id,{status:s})} onDelete={()=>onDelete(r.projId,r.id)} confirmId={confirmRepairId} setConfirmId={setConfirmRepairId}/>)}
        {done.length>0&&<div style={{fontSize:9,color:C.inkFaint,letterSpacing:"0.12em",marginTop:8,marginBottom:2}}>已完成（{done.length}）</div>}
        {done.map(r=><RepairCard key={`${r.projId}-${r.id}`} r={r} projects={projects} members={members} isEditing={editRepairId===`${r.projId}-${r.id}`} editData={editRepairData} setEditData={setEditRepairData} onStartEdit={()=>{setEditRepairId(`${r.projId}-${r.id}`);setEditRepairData({projectId:r.projId,desc:r.desc,note:r.note||"",assignedDate:r.assignedDate||"",owner:r.owner||"",status:r.status});}} onSave={()=>handleSaveEdit(r)} onCancel={()=>{setEditRepairId(null);setEditRepairData(null);}} onStatusChange={s=>onUpdate(r.projId,r.id,{status:s})} onDelete={()=>onDelete(r.projId,r.id)} confirmId={confirmRepairId} setConfirmId={setConfirmRepairId}/>)}
      </div>
    </div>
  );
}

function RepairCard({r,projects,members,isEditing,editData,setEditData,onStartEdit,onSave,onCancel,onStatusChange,onDelete,confirmId,setConfirmId}){
  const repairKey=`${r.projId}-${r.id}`;
  const overdue=r.assignedDate&&r.status!=="已完成"&&new Date(r.assignedDate)<new Date();
  if(isEditing&&editData){
    return(
      <div style={{background:C.bgRaised,border:`1px solid ${C.border}`,borderRadius:6,padding:"12px 14px",boxShadow:"0 1px 2px rgba(0,0,0,0.05)"}}>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8}}>
          <Field label="關聯案件">
            <select value={editData.projectId} onChange={e=>setEditData({...editData,projectId:e.target.value})} style={sSt()}>
              {projects.map(p=>(<option key={p.id} value={p.id}>{p.id} · {p.name}</option>))}
            </select>
          </Field>
          <Field label="修繕項目"><input value={editData.desc} onChange={e=>setEditData({...editData,desc:e.target.value})} style={iSt()}/></Field>
          <Field label="負責人">
            <select value={editData.owner||""} onChange={e=>setEditData({...editData,owner:e.target.value})} style={sSt()}>
              <option value="">未指派</option>
              {members.map(m=><option key={m}>{m}</option>)}
            </select>
          </Field>
          <Field label="預約日期"><input type="date" value={editData.assignedDate||""} onChange={e=>setEditData({...editData,assignedDate:e.target.value})} style={{...iSt(),minHeight:40,WebkitAppearance:"none"}}/></Field>
          <Field label="狀態">
            <select value={editData.status} onChange={e=>setEditData({...editData,status:e.target.value})} style={sSt()}>
              {REPAIR_STATUS.map(s=><option key={s}>{s}</option>)}
            </select>
          </Field>
          <Field label="備註"><input value={editData.note||""} onChange={e=>setEditData({...editData,note:e.target.value})} placeholder="選填" style={iSt()}/></Field>
        </div>
        <div style={{display:"flex",gap:6,justifyContent:"flex-end"}}>
          <button onClick={onSave} style={bSt(C.accent,C.accent,C.accentText)}>儲存</button>
          <button onClick={onCancel} style={bSt()}>取消</button>
        </div>
      </div>
    );
  }
  return(
    <div style={{background:C.bgRaised,border:`1px solid ${C.border}`,borderRadius:6,padding:"12px 14px",boxShadow:"0 1px 2px rgba(0,0,0,0.05)",opacity:r.status==="已完成"?0.55:1}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:6}}>
        <div style={{flex:1}}>
          <div style={{fontSize:13,color:C.ink,fontWeight:500,marginBottom:3,textDecoration:r.status==="已完成"?"line-through":"none"}}>{r.desc}</div>
          <div style={{display:"flex",gap:6,flexWrap:"wrap",alignItems:"center"}}>
            <span style={{fontSize:10,color:C.inkFaint}}>
              {r.projId.startsWith("REPAIR_")?r.projName:`${r.projId} · ${r.projName}`}
            </span>
            {r.projArchived&&!r.projId.startsWith("REPAIR_")&&<span style={{fontSize:9,color:C.inkFaint,border:`1px solid ${C.borderLight}`,padding:"1px 5px",borderRadius:2}}>封存</span>}
            {r.projId.startsWith("REPAIR_")&&<span style={{fontSize:9,color:C.inkSoft,border:`1px solid ${C.borderLight}`,padding:"1px 5px",borderRadius:2}}>手動輸入</span>}
          </div>
        </div>
        <div style={{display:"flex",gap:4,alignItems:"center",flexShrink:0,marginLeft:8}}>
          <select value={r.status} onChange={e=>onStatusChange(e.target.value)} style={{...sSt({width:"auto",padding:"4px 8px",fontSize:11})}}>
            {REPAIR_STATUS.map(s=><option key={s}>{s}</option>)}
          </select>
          <button onClick={onStartEdit} style={{background:"none",border:"none",color:C.inkFaint,cursor:"pointer",fontSize:13,padding:"2px 4px"}}>✎</button>
                {confirmId===repairKey
                  ?<><button onClick={onDelete} style={{background:"none",border:"none",color:C.warn,cursor:"pointer",fontSize:10,padding:"2px 3px"}}>確認</button>
                    <button onClick={()=>setConfirmId(null)} style={{background:"none",border:"none",color:C.inkFaint,cursor:"pointer",fontSize:12,padding:"2px 3px"}}>取消</button></>
                  :<button onClick={()=>setConfirmId(repairKey)} style={{background:"none",border:"none",color:C.inkFaint,cursor:"pointer",fontSize:15,padding:"2px 4px"}}>×</button>
                }
        </div>
      </div>
      <div style={{display:"flex",gap:10,flexWrap:"wrap",alignItems:"center"}}>
        {r.owner&&<div style={{display:"flex",alignItems:"center",gap:4}}><Avatar name={r.owner} size={14} members={members}/><span style={{fontSize:11,color:C.inkSoft}}>{SHORT(r.owner)}</span></div>}
        {r.assignedDate&&<span style={{fontSize:11,color:overdue?C.warn:C.inkSoft}}>{overdue?"⚠ ":""}{fmt(r.assignedDate)}</span>}
        {r.note&&<span style={{fontSize:11,color:C.inkFaint}}>· {r.note}</span>}
      </div>
    </div>
  );
}

// ─── TaskList 子元件 ──────────────────────────────────────────────
function TaskList({tasks,proj,members,editTask,confirmDel,setEditTask,setConfirmDel,toggle,delTask,saveEdit,setTaskDetail,onReorder}){
  const sortedTasks=[...tasks.filter(t=>!t.done),...tasks.filter(t=>t.done)];
  const dragRef=useRef(null);
  const dragOverRef=useRef(null);
  const[draggingId,setDraggingId]=useState(null);
  const[dragOverId,setDragOverId]=useState(null);
  return(
    <div style={{display:"flex",flexDirection:"column",gap:4}}>
      {sortedTasks.map(t=>{
        const overdue=t.due&&!t.done&&t.due<new Date().toISOString().slice(0,10);
        const isPay=isPayment(t.name);
        const subDone=(t.subtasks||[]).filter(s=>s.done).length;
        const subTotal=(t.subtasks||[]).length;
        if(editTask===t.id)return<EditTaskRow key={t.id} task={t} onSave={u=>saveEdit(proj.id,t.id,u)} onCancel={()=>setEditTask(null)} members={members}/>;
        return(
          <div key={t.id}
          draggable
          onDragStart={()=>{dragRef.current=t.id;setDraggingId(t.id);}}
          onDragOver={e=>{e.preventDefault();dragOverRef.current=t.id;setDragOverId(t.id);}}
          onDragEnd={()=>{setDraggingId(null);setDragOverId(null);dragRef.current=null;dragOverRef.current=null;}}
          onDrop={()=>{if(dragRef.current&&dragOverRef.current&&dragRef.current!==dragOverRef.current){onReorder&&onReorder(dragRef.current,dragOverRef.current);}setDraggingId(null);setDragOverId(null);dragRef.current=null;dragOverRef.current=null;}}
          style={{padding:"10px 13px",background:C.bgRaised,border:`1px solid ${dragOverId===t.id&&draggingId!==t.id?C.accent:isPay?"#A07060":C.border}`,borderRadius:5,opacity:draggingId===t.id?0.3:t.done?0.5:1,transition:"opacity 0.15s, border-color 0.15s, transform 0.15s",boxShadow:dragOverId===t.id&&draggingId!==t.id?"0 0 0 2px "+C.accent+"44":"0 1px 2px rgba(0,0,0,0.05)",cursor:"grab",transform:dragOverId===t.id&&draggingId!==t.id?"translateY(-2px)":"none"}}>
            <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:subTotal>0?5:0}}>
              <div onClick={()=>toggle(proj.id,t.id)} style={{width:15,height:15,border:`1.5px solid ${t.done?C.ok:C.border}`,borderRadius:3,cursor:"pointer",background:t.done?C.ok:"transparent",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                {t.done&&<span style={{fontSize:9,color:"#e8e8e8"}}>✓</span>}
              </div>
              <span onClick={()=>setTaskDetail(t)} style={{fontSize:13,color:t.done?C.inkFaint:C.ink,textDecoration:t.done?"line-through":"none",flex:1,cursor:"pointer"}}>{t.name}</span>
              {isPay&&<span style={{fontSize:9,color:C.warn,border:`1px solid ${C.warn}`,padding:"1px 5px",borderRadius:2,flexShrink:0}}>請款</span>}
              <span style={{fontSize:10,color:t.done?C.inkFaint:overdue?C.warn:C.inkSoft,flexShrink:0}}>{t.done?"完成":overdue?"逾期":"進行中"}</span>
              <button onClick={()=>{setEditTask(t.id);setConfirmDel(null);}} style={{background:"none",border:"none",color:C.inkFaint,cursor:"pointer",fontSize:13,padding:"2px 3px",flexShrink:0}}>✎</button>
              {confirmDel===t.id?<button onClick={()=>delTask(proj.id,t.id)} style={{background:"none",border:"none",color:C.warn,cursor:"pointer",fontSize:10,padding:"2px 3px",flexShrink:0}}>確認刪除</button>:<button onClick={()=>setConfirmDel(t.id)} style={{background:"none",border:"none",color:C.border,cursor:"pointer",fontSize:15,padding:"2px 3px",flexShrink:0}}>×</button>}
            </div>
            <div style={{display:"flex",alignItems:"center",gap:8,paddingLeft:22,flexWrap:"wrap"}}>
              {(t.owners||[]).map((o,i)=>(<div key={i} style={{display:"flex",alignItems:"center",gap:3}}><Avatar name={o} size={14} members={members}/><span style={{fontSize:11,color:C.inkSoft}}>{SHORT(o)}</span></div>))}
              {t.due&&<><span style={{fontSize:10,color:C.inkFaint}}>·</span><span style={{fontSize:11,color:overdue?C.warn:C.inkSoft,flexShrink:0}}>{fmt(t.due)}{overdue?" ▲":""}</span></>}
              {t.note&&<><span style={{fontSize:10,color:C.inkFaint}}>·</span><span style={{fontSize:11,color:C.inkFaint,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t.note}</span></>}
              {(t.images||[]).length>0&&<span style={{fontSize:10,color:C.inkFaint}}>· 📷 {t.images.length}</span>}
              {subTotal>0&&<span style={{fontSize:10,color:C.inkFaint,marginLeft:"auto"}}>子任務 {subDone}/{subTotal}</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
