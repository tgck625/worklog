import React, { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { BrowserRouter, Routes, Route, useNavigate } from "react-router-dom";
import Timesheet from "./Timesheet";
import NavBar from "./NavBar";
import DistributionList from "./DistributionList";
import { AuthProvider, useAuth } from "./AuthContext";
import LoginPage from "./LoginPage";
import AdminMembers from "./AdminMembers";

// ── Error Boundary ───────────────────────────────────────────────────────
class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { hasError:false, error:null }; }
  static getDerivedStateFromError(error) { return { hasError:true, error }; }
  render() {
    if (this.state.hasError) return (
      <div style={{ padding:40, textAlign:'center', fontFamily:"'Noto Sans JP',sans-serif" }}>
        <div style={{ fontSize:24, marginBottom:16 }}>⚠ エラーが発生しました</div>
        <div style={{ fontSize:13, color:'#7a746c', marginBottom:20 }}>{this.state.error?.message}</div>
        <button onClick={()=>{ localStorage.removeItem('wf_isTsuge'); window.location.reload(); }}
          style={{ padding:'10px 24px', borderRadius:8, border:'none', background:'#e07840', color:'#fff', fontSize:14, cursor:'pointer' }}>
          リロード
        </button>
      </div>
    );
    return this.props.children;
  }
}

// ── Colors ──────────────────────────────────────────────────────────────
const C = {
  cream:'#faf8f4', cream2:'#f3f0ea', cream3:'#ece8e0',
  border:'#ddd8ce', border2:'#ccc6bb',
  text:'#3a3530', text2:'#7a746c', text3:'#a89f94',
  orange:'#e07840', orange2:'#c96830', orangeBg:'#fdf0e8', orangeBorder:'#f0c8a8',
  green:'#5a9070', blue:'#5878a0', red:'#b85050', amber:'#c08030',
};
const PALETTE = ['#e07840','#2e8b57','#4a72a8','#c04848','#b87820','#6858c0','#c84878','#1a8a8a','#8850a8','#8b6040','#d04880','#2868b0','#488a28','#7848b0','#a87818','#b83838','#187898','#6060c0','#a84868','#388858'];
const KEY = 'kodawarin_tasks';
const PIN_KEY = 'wf_tsuge_pin';

// ── Data helpers ─────────────────────────────────────────────────────────
function genId() { return Math.random().toString(36).slice(2,9); }

function getDefaultData() {
  return { projects: [], members: [], tasks: [] };
}

function loadData() {
  try {
    const d = JSON.parse(localStorage.getItem(KEY));
    if (!d) return getDefaultData();
    // migration
    if (d.events && !d.projects) { d.projects = d.events; delete d.events; }
    d.projects = (d.projects||[]).map(p => ({ type:'other', ...p }));
    d.tasks = (d.tasks||[]).map(t => { if(t.eventId&&!t.projectId){t.projectId=t.eventId;delete t.eventId;} return t; });
    d.tasks = d.tasks.map(t => { if (!t.assigneeIds) { t.assigneeIds = t.assigneeId ? [t.assigneeId] : []; } return t; });
    // migrate catOrder from localStorage to data
    if (!d.catOrder) { try { const co = JSON.parse(localStorage.getItem('wf_listCatOrder')); if (co?.length) d.catOrder = co; } catch {} }
    return d;
  } catch { return getDefaultData(); }
}
function saveData(d) { try { localStorage.setItem(KEY, JSON.stringify(d)); } catch {} }

// ── Date helpers ─────────────────────────────────────────────────────────
function fmtDate(s) { if(!s) return ''; const [,m,d]=s.split('-'); return `${parseInt(m)}/${parseInt(d)}`; }
function daysDiff(a, b) {
  const da = new Date(a); da.setHours(0,0,0,0);
  const db = new Date(b); db.setHours(0,0,0,0);
  return Math.round((da-db)/86400000);
}
function addDays(dateStr, n) {
  const d = new Date(dateStr); d.setDate(d.getDate()+n);
  return d.toISOString().slice(0,10);
}
function genEventName(date, venue, content) {
  if (!date) return '';
  const [y,m,d] = date.split('-');
  const yy = y.slice(2);
  const parts = [`${yy}${m}${d}`];
  if (venue?.trim()) parts.push(venue.trim());
  if (content?.trim()) parts.push(content.trim());
  return parts.join('_');
}

// ── Due date style (6-level) ──────────────────────────────────────────────
function getDueStyle(due) {
  if (!due) return { color: C.text3, bg: 'transparent', border: 'transparent' };
  const today = new Date(); today.setHours(0,0,0,0);
  const d = new Date(due); d.setHours(0,0,0,0);
  const diff = Math.round((d-today)/86400000);
  if (diff < 0)  return { color:'#fff', bg:'#b85050', border:'#b85050', overdue: Math.abs(diff) };
  if (diff === 0) return { color:'#fff', bg:'#c96830', border:'#c96830' };
  if (diff === 1) return { color:'#c96830', bg:'#fdf0e8', border:'#f0c8a8' };
  if (diff <= 3)  return { color:'#c08030', bg:'#fef8ec', border:'#e8d090' };
  if (diff <= 7)  return { color:'#5a9070', bg:'#eef6f0', border:'#b8d8c0' };
  return { color: C.text3, bg:'transparent', border:'transparent' };
}

// ── Relative label (開催N日前/後) ──────────────────────────────────────────
function getRelLabel(proj, due) {
  if (!proj || !due || (!proj.end && !proj.eventDate)) return null;
  const base = proj.end || proj.eventDate;
  const diff = daysDiff(due, base); // due - base
  if (diff === 0) return '開催日当日';
  if (diff < 0) return `開催${Math.abs(diff)}日前`;
  return `開催${diff}日後`;
}

function getDoneOverdue(t) {
  if (t.status !== 'done' || !t.due || !t.doneAt) return null;
  const diff = daysDiff(t.doneAt, t.due); // doneAt - due (positive means late)
  if (diff <= 0) return null;
  return `${diff}日超過後完了`;
}

// ── Primitive UI ──────────────────────────────────────────────────────────
function Avatar({ name, color, size=24, fs=11, title }) {
  return <div title={title||name} style={{ width:size,height:size,borderRadius:'50%',display:'flex',alignItems:'center',justifyContent:'center',fontSize:fs,fontWeight:700,flexShrink:0,background:color,color:'#fff',letterSpacing:-0.5 }}>{name.slice(0,2)}</div>;
}
function StatusBadge({ status }) {
  const map = { todo:['未着手',C.orange,'#fdf0e8',C.orange+'55'], doing:['進行中',C.blue,'#edf1f8',C.blue+'55'], done:['完了',C.text3,'#f0ede6',C.border], skip:['今回不要','#aaa','#f0f0f0','#ccc'] };
  const [label,color,bg,border] = map[status]||['','','',''];
  return <span style={{ display:'inline-flex',alignItems:'center',padding:'2px 8px',borderRadius:999,fontSize:11,fontWeight:500,background:bg,color,border:`1px solid ${border}`,whiteSpace:'nowrap' }}>{label}</span>;
}
function PriorityDot({ priority }) {
  const c = { high:C.red, mid:C.amber, low:C.text3 };
  return <div style={{ width:5,height:5,borderRadius:'50%',flexShrink:0,background:c[priority]||c.mid }} />;
}
function Btn({ children, onClick, variant='default', small, style: sx, disabled }) {
  const base = { display:'inline-flex',alignItems:'center',gap:5,borderRadius:999,border:'none',cursor:disabled?'default':'pointer',fontSize:small?11:12,fontFamily:'inherit',fontWeight:500,transition:'all 0.12s',whiteSpace:'nowrap',padding:small?'4px 10px':'7px 14px', opacity:disabled?0.5:1, ...sx };
  const variants = {
    default: { background:C.cream2, color:C.text2, border:`1px solid ${C.border}` },
    primary: { background:C.orange, color:'#fff' },
    danger:  { background:'transparent', color:C.red, border:`1px solid ${C.red}55` },
    amber:   { background:C.orangeBg, color:C.amber, border:`1px solid ${C.orangeBorder}` },
    ghost:   { background:'transparent', color:C.text2 },
  };
  return <button onClick={disabled?undefined:onClick} style={{ ...base, ...variants[variant] }}>{children}</button>;
}
const inp = { background:'#fff', border:`1px solid ${C.border}`, borderRadius:10, color:C.text, padding:'8px 10px', fontSize:13, fontFamily:'inherit', width:'100%', outline:'none', transition:'border 0.12s' };
const Input = React.forwardRef(function Input(props, ref) { return <input ref={ref} style={inp} {...props} onFocus={e=>e.target.style.borderColor=C.orange} onBlur={e=>e.target.style.borderColor=C.border} />; });
function Select({ children, ...props }) { return <select style={inp} {...props} onFocus={e=>e.target.style.borderColor=C.orange} onBlur={e=>e.target.style.borderColor=C.border}>{children}</select>; }
function Textarea({ style:sx, ...props }) { return <textarea style={{ ...inp, resize:'vertical', minHeight:68, ...sx }} {...props} onFocus={e=>e.target.style.borderColor=C.orange} onBlur={e=>e.target.style.borderColor=C.border} />; }
function FG({ label, children }) {
  return <div style={{ display:'flex',flexDirection:'column',gap:5 }}><label style={{ fontSize:11,fontWeight:600,color:C.text2,letterSpacing:0.3 }}>{label}</label>{children}</div>;
}
function ColorSwatchPicker({ selected, onSelect }) {
  return <div style={{ display:'flex',gap:6,flexWrap:'wrap' }}>
    {PALETTE.map(c=><div key={c} onClick={()=>onSelect(c)} style={{ width:22,height:22,borderRadius:'50%',cursor:'pointer',background:c,border:c===selected?`3px solid ${C.text}`:`2px solid transparent`,transform:c===selected?'scale(1.15)':'scale(1)',transition:'all 0.1s' }}/>)}
  </div>;
}
function InfoBox({ children }) {
  return <div style={{ background:C.orangeBg,border:`1px solid ${C.orangeBorder}`,borderRadius:10,padding:'10px 14px',fontSize:12,color:C.amber }}>{children}</div>;
}

// ── Modal shell ───────────────────────────────────────────────────────────
function Modal({ open, onClose, title, children, footer, maxWidth=480 }) {
  const ref = useRef();
  const isMobileModal = typeof window !== 'undefined' && window.innerWidth < 768;
  useEffect(()=>{
    if (!open) return;
    const fn = e=>{ if(e.key==='Escape') onClose(); };
    window.addEventListener('keydown',fn);
    return ()=>window.removeEventListener('keydown',fn);
  },[open,onClose]);
  if (!open) return null;
  if (isMobileModal) {
    return (
      <div ref={ref} onClick={e=>{ if(e.target===ref.current) onClose(); }}
        style={{ position:'fixed',inset:0,background:'rgba(58,53,48,0.45)',display:'flex',alignItems:'flex-end',justifyContent:'center',zIndex:200,backdropFilter:'blur(2px)' }}>
        <div style={{ background:C.cream,border:`1px solid ${C.border}`,borderRadius:'16px 16px 0 0',width:'100%',maxHeight:'92vh',display:'flex',flexDirection:'column',boxShadow:'0 -8px 32px rgba(58,53,48,0.18)',animation:'modal-up 0.2s ease' }}>
          <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',padding:'16px 20px',borderBottom:`1px solid ${C.border}`,flexShrink:0 }}>
            <div style={{ fontSize:14,fontWeight:600,color:C.text }}>{title}</div>
            <button onClick={onClose} style={{ width:28,height:28,borderRadius:8,border:`1px solid ${C.border}`,background:C.cream2,color:C.text2,cursor:'pointer',fontSize:16,display:'flex',alignItems:'center',justifyContent:'center' }}>×</button>
          </div>
          <div style={{ padding:20,display:'flex',flexDirection:'column',gap:14,overflowY:'auto',flex:1 }}>{children}</div>
          {footer && <div style={{ padding:'14px 20px',borderTop:`1px solid ${C.border}`,display:'flex',justifyContent:'flex-end',gap:8,flexShrink:0 }}>{footer}</div>}
        </div>
      </div>
    );
  }
  return (
    <div ref={ref} onClick={e=>{ if(e.target===ref.current) onClose(); }}
      style={{ position:'fixed',inset:0,background:'rgba(58,53,48,0.45)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:200,padding:20,backdropFilter:'blur(2px)' }}>
      <div style={{ background:C.cream,border:`1px solid ${C.border}`,borderRadius:16,width:'100%',maxWidth,maxHeight:'90vh',display:'flex',flexDirection:'column',boxShadow:'0 16px 48px rgba(58,53,48,0.18)',animation:'modal-in 0.15s ease' }}>
        <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',padding:'16px 20px',borderBottom:`1px solid ${C.border}`,flexShrink:0 }}>
          <div style={{ fontSize:14,fontWeight:600,color:C.text }}>{title}</div>
          <button onClick={onClose} style={{ width:28,height:28,borderRadius:8,border:`1px solid ${C.border}`,background:C.cream2,color:C.text2,cursor:'pointer',fontSize:16,display:'flex',alignItems:'center',justifyContent:'center' }}>×</button>
        </div>
        <div style={{ padding:20,display:'flex',flexDirection:'column',gap:14,overflowY:'auto',flex:1 }}>{children}</div>
        {footer && <div style={{ padding:'14px 20px',borderTop:`1px solid ${C.border}`,display:'flex',justifyContent:'flex-end',gap:8,flexShrink:0 }}>{footer}</div>}
      </div>
    </div>
  );
}

// ── PIN Modal ─────────────────────────────────────────────────────────────
function PINModal({ open, onClose, onSuccess, mode='unlock' }) {
  const [pin, setPin] = useState('');
  const [err, setErr] = useState('');
  const [setupStep, setSetupStep] = useState(1);
  const setupStepRef = useRef(1);
  const firstPinRef = useRef('');
  const inputRef = useRef(null);

  useEffect(()=>{ if(open){ setPin(''); setErr(''); setSetupStep(1); setupStepRef.current=1; firstPinRef.current=''; setTimeout(()=>inputRef.current?.focus(),100); } },[open]);

  function handleChange(v) {
    const digits = v.replace(/\D/g,'').slice(0,4);
    setPin(digits); setErr('');
    if (digits.length===4) setTimeout(()=>submit(digits), 80);
  }

  function submit(p) {
    const stored = localStorage.getItem(PIN_KEY);
    if (mode==='setup' || !stored) {
      if (setupStepRef.current===1) {
        firstPinRef.current=p; setupStepRef.current=2;
        setSetupStep(2); setPin(''); setErr(''); return;
      }
      if (p===firstPinRef.current) { localStorage.setItem(PIN_KEY,p); onSuccess(); onClose(); }
      else { setErr('PINが一致しません'); setPin(''); setupStepRef.current=1; firstPinRef.current=''; setSetupStep(1); }
    } else if (mode==='unlock') {
      if (p===stored) { onSuccess(); onClose(); }
      else { setErr('PINが違います'); setPin(''); }
    }
  }

  const promptText = mode==='setup'
    ? (setupStep===1 ? '新しいPINを入力（4桁）' : 'もう一度入力して確認')
    : '柘植モードのPINを入力';

  function resetPin() {
    if (!window.confirm('PINをリセットしますか？\n新しいPINを設定し直せます。')) return;
    localStorage.removeItem(PIN_KEY);
    setPin(''); setErr(''); setSetupStep(1); setupStepRef.current=1; firstPinRef.current='';
    setTimeout(()=>inputRef.current?.focus(), 100);
  }

  return (
    <Modal open={open} onClose={onClose} title="PIN認証" maxWidth={280}>
      <div style={{ textAlign:'center',fontSize:12,color:C.text2,marginBottom:12 }}>{promptText}</div>
      <input ref={inputRef} type="password" inputMode="numeric" value={pin} onChange={e=>handleChange(e.target.value)}
        maxLength={4} placeholder="••••"
        style={{ width:'100%',textAlign:'center',fontSize:24,letterSpacing:12,padding:'10px',borderRadius:8,border:`1px solid ${C.border}`,outline:'none',fontFamily:'inherit' }}/>
      {err && <div style={{ textAlign:'center',fontSize:11,color:C.red,marginTop:8 }}>{err}</div>}
      <button onClick={()=>submit(pin)} disabled={pin.length<4}
        style={{ width:'100%',marginTop:14,padding:'10px',borderRadius:8,border:'none',background:pin.length===4?C.orange:'#f0ebe4',color:pin.length===4?'#fff':'#bbb',fontSize:13,cursor:pin.length===4?'pointer':'default',fontFamily:'inherit',fontWeight:600 }}>
        確認
      </button>
      {mode==='unlock' && (
        <div style={{ textAlign:'center',marginTop:10 }}>
          <button onClick={resetPin}
            style={{ background:'none',border:'none',fontSize:11,color:C.text3,cursor:'pointer',textDecoration:'underline',fontFamily:'inherit' }}>
            PINを忘れた場合はこちら
          </button>
        </div>
      )}
    </Modal>
  );
}

// ── Duplicate Modal ───────────────────────────────────────────────────────
function DuplicateModal({ open, onClose, project, tasks, members, onDuplicate }) {
  const [newDate, setNewDate] = useState('');
  const [venue, setVenue] = useState('');
  const [content, setContent] = useState('');
  const [color, setColor] = useState(project?.color||PALETTE[0]);
  useEffect(()=>{
    if(open){
      setNewDate('');
      setVenue(project?.venue||'');
      setContent(project?.content||'');
      setColor(project?.color||PALETTE[0]);
    }
  },[open,project]);

  if (!project) return null;
  const base = project.end || project.eventDate || '';
  const newName = project.type==='event' ? genEventName(newDate||base, venue, content) : project.name+' (コピー)';
  const projTasks = tasks.filter(t=>t.projectId===project.id && t.due && base);

  return (
    <Modal open={open} onClose={onClose} title="プロジェクトを複製" maxWidth={520}
      footer={<>
        <Btn onClick={onClose}>キャンセル</Btn>
        <Btn variant="amber" onClick={()=>{
          if (!newDate && project.type==='event') { alert('新しい開催日を入力してください'); return; }
          onDuplicate({ project, newDate, newName, color, venue, content });
          onClose();
        }}>複製する</Btn>
      </>}>
      <InfoBox>
        <strong>{project.name}</strong> を複製します。<br/>タスクの期日は新しい開催日基準で自動計算されます。すべてのタスクのステータスは「未着手」にリセットされます。
      </InfoBox>
      {project.type==='event' && (<>
        <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:12 }}>
          <FG label="新しい開催日">
            <Input type="date" value={newDate} onChange={e=>setNewDate(e.target.value)} />
          </FG>
          <FG label="会場">
            <Input value={venue} onChange={e=>setVenue(e.target.value)} placeholder="CBC蟹江"/>
          </FG>
          <FG label="内容">
            <Input value={content} onChange={e=>setContent(e.target.value)} placeholder="苺大福"/>
          </FG>
        </div>
      </>)}
      <FG label="新しいプロジェクト名">
        <div style={{ padding:'8px 10px',background:C.cream2,borderRadius:10,fontSize:13,color:C.text2 }}>{newName}</div>
      </FG>
      <FG label="テーマカラー"><ColorSwatchPicker selected={color} onSelect={setColor}/></FG>
      {projTasks.length > 0 && newDate && base && (
        <div>
          <div style={{ fontSize:11,fontWeight:600,color:C.text2,marginBottom:8 }}>タスク期日の変換プレビュー</div>
          {projTasks.map(t=>{
            const offset = daysDiff(t.due, base);
            const newDue = addDays(newDate, offset);
            return <div key={t.id} style={{ display:'flex',justifyContent:'space-between',fontSize:11,color:C.text2,padding:'4px 0',borderBottom:`1px solid ${C.border}` }}>
              <span style={{ overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',maxWidth:220 }}>{t.title}</span>
              <span style={{ color:C.text3,whiteSpace:'nowrap',marginLeft:8 }}>{fmtDate(t.due)} → <span style={{ color:C.orange }}>{fmtDate(newDue)}</span></span>
            </div>;
          })}
        </div>
      )}
    </Modal>
  );
}

// ── Copy Tasks Modal ──────────────────────────────────────────────────────
function CopyTasksModal({ currentProjectId, projects, tasks, onClose, onCopy }) {
  const [srcId, setSrcId] = useState('');
  const srcOptions = projects.filter(p => p.id !== currentProjectId && !p.closed).sort((a,b)=>(a.eventDate||'9999').localeCompare(b.eventDate||'9999'));
  const srcProject = projects.find(p => p.id === srcId);
  const currentProject = projects.find(p => p.id === currentProjectId);
  const srcTasks = tasks.filter(t => t.projectId === srcId);

  const currentBase = currentProject?.eventDate || currentProject?.end || '';
  const srcBase = srcProject?.eventDate || srcProject?.end || '';

  function doCopy() {
    if (!srcId) { alert('コピー元を選んでください'); return; }
    const newTasks = srcTasks.map(t => {
      let due = t.due;
      if (due && srcBase && currentBase) {
        const offset = daysDiff(due, srcBase);
        due = addDays(currentBase, offset);
      }
      return { ...t, id: genId(), projectId: currentProjectId, status: 'todo', due, doneAt: undefined, checklist:(t.checklist||[]).map(c=>({...c,id:genId(),checked:false})) };
    });
    onCopy(newTasks);
  }

  return (
    <Modal open={true} onClose={onClose} title="タスクをコピー" maxWidth={480}
      footer={<><Btn onClick={onClose}>キャンセル</Btn><Btn variant="primary" onClick={doCopy}>コピーする</Btn></>}>
      <FG label="コピー元プロジェクト">
        <Select value={srcId} onChange={e=>setSrcId(e.target.value)}>
          <option value="">-- 選択 --</option>
          {srcOptions.filter(p=>p.type==='event').length>0 && <optgroup label="イベント">
            {srcOptions.filter(p=>p.type==='event').map(p=><option key={p.id} value={p.id}>{p.name}{p.eventDate ? ` (${p.eventDate})` : ''}</option>)}
          </optgroup>}
          {srcOptions.filter(p=>p.type!=='event').length>0 && <optgroup label="その他">
            {srcOptions.filter(p=>p.type!=='event').map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
          </optgroup>}
        </Select>
      </FG>
      {srcProject && (
        <>
          <div style={{ fontSize:11,color:C.text2,marginBottom:8 }}>
            {srcTasks.length}件のタスク
            {srcBase && currentBase && srcBase !== currentBase && (
              <span style={{ color:C.orange,marginLeft:6 }}>
                （期日を {Math.round(daysDiff(currentBase, srcBase))} 日シフト）
              </span>
            )}
          </div>
          {srcTasks.length > 0 && (
            <div style={{ border:`1px solid ${C.border}`,borderRadius:10,overflow:'hidden' }}>
              {srcTasks.map((t,i) => {
                let newDue = t.due;
                if (t.due && srcBase && currentBase) newDue = addDays(currentBase, daysDiff(t.due, srcBase));
                return (
                  <div key={t.id} style={{ display:'flex',justifyContent:'space-between',fontSize:12,padding:'8px 12px',borderBottom:i<srcTasks.length-1?`1px solid ${C.border}`:'none' }}>
                    <span style={{ color:C.text,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',maxWidth:260 }}>{t.title}</span>
                    <span style={{ color:C.text3,whiteSpace:'nowrap',marginLeft:8,flexShrink:0 }}>
                      {newDue ? fmtDate(newDue) : '期日なし'}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
          {srcTasks.length === 0 && <div style={{ color:C.text3,fontSize:12 }}>このプロジェクトにはタスクがありません</div>}
        </>
      )}
    </Modal>
  );
}

// ── Task Modal ────────────────────────────────────────────────────────────
function TaskModal({ open, onClose, data, projects, members, defaultProjectId, defaultStatus, defaultAssigneeId, defaultTitle, onSave, onDelete, isTsuge }) {
  const [title,setTitle]=useState('');
  const [projectId,setProjectId]=useState('');
  const [assigneeIds,setAssigneeIds]=useState([]);
  const [due,setDue]=useState('');
  const [status,setStatus]=useState('todo');
  const [priority,setPriority]=useState('mid');
  const [memo,setMemo]=useState('');
  const [estimatedMin,setEstimatedMin]=useState('');
  const [manual,setManual]=useState('');
  const [isPrivate,setIsPrivate]=useState(false);
  const [starred,setStarred]=useState(false);
  const [checklist,setChecklist]=useState([]);
  const [links,setLinks]=useState([]);
  const [newCheckItem,setNewCheckItem]=useState('');
  const checkComposingRef=useRef(false);
  const checkEnterRef=useRef(0);
  const titleRef=useRef(null);

  useEffect(()=>{
    if(!open) return;
    if(data){ setTitle(data.title); setProjectId(data.projectId); setAssigneeIds(data.assigneeIds||[]); setDue(data.due||''); setStatus(data.status); setPriority(data.priority); setMemo(data.memo||''); setEstimatedMin(data.estimatedMin||''); setManual(data.manual||''); setIsPrivate(!!data.isPrivate); setChecklist(data.checklist||[]); setLinks(data.links||[]); setStarred(!!data.starred); }
    else { const t=defaultTitle||'【】'; setTitle(t); setProjectId(defaultProjectId!=='all'?defaultProjectId:(projects[0]?.id||'')); setAssigneeIds(defaultAssigneeId?[defaultAssigneeId]:[]); setDue(''); setStatus(defaultStatus||'todo'); setPriority('mid'); setMemo(''); setEstimatedMin(''); setManual(''); setIsPrivate(false); setChecklist([]); setLinks([]); setStarred(false); }
    setNewCheckItem('');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[open]);

  useEffect(()=>{
    if(open && !data && titleRef.current){
      const el=titleRef.current; el.focus(); const pos=el.value.lastIndexOf('】'); el.setSelectionRange(pos>=0?pos:1,pos>=0?pos:1);
    }
  },[open,data]);

  const selProj = projects.find(p=>p.id===projectId);
  const relLabel = selProj && due ? getRelLabel(selProj, due) : null;
  const availableMembers = ((selProj?.visibleMemberIds?.length > 0)
    ? members.filter(m => selProj.visibleMemberIds.includes(m.id))
    : members).filter(m => !m.closed);

  return (
    <Modal open={open} onClose={onClose} title={data?'タスクを編集':'タスクを追加'}
      footer={<>
        {data && <Btn variant="danger" style={{ marginRight:'auto' }} onClick={()=>{ if(window.confirm('このタスクを削除しますか？')){onDelete(data.id);onClose();} }}>削除</Btn>}
        <Btn onClick={onClose}>キャンセル</Btn>
        <Btn variant="primary" onClick={()=>{ if(!title.trim()){alert('タスク名を入力してください');return;} onSave({id:data?.id||genId(),title:title.trim(),projectId,assigneeIds,due,status,priority,memo,estimatedMin:estimatedMin?Number(estimatedMin):0,manual,isPrivate,starred,checklist,links:links.filter(l=>l.url.trim())}); onClose(); }}>保存</Btn>
      </>}>
      <FG label="タスク名"><Input ref={titleRef} value={title} onChange={e=>setTitle(e.target.value)} placeholder="タスクの内容を入力" autoFocus/></FG>
      <FG label="プロジェクト">
        <Select value={projectId} onChange={e=>{
          const newProjId = e.target.value;
          setProjectId(newProjId);
          const newProj = projects.find(p=>p.id===newProjId);
          if (newProj?.visibleMemberIds?.length > 0) {
            setAssigneeIds(prev => prev.filter(id => newProj.visibleMemberIds.includes(id)));
          }
        }}>
          {projects.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
        </Select>
      </FG>
      <FG label="担当者">
        <div style={{ display:'flex',flexWrap:'wrap',gap:6 }}>
          {availableMembers.map(m=>{
            const checked=assigneeIds.includes(m.id);
            return (
              <label key={m.id} style={{ display:'flex',alignItems:'center',gap:5,padding:'5px 10px',borderRadius:999,border:`1px solid ${checked?m.color:C.border}`,background:checked?m.color+'20':'transparent',cursor:'pointer',fontSize:12,color:checked?m.color:C.text2,transition:'all 0.12s' }}>
                <input type="checkbox" checked={checked} onChange={e=>setAssigneeIds(e.target.checked?[...assigneeIds,m.id]:assigneeIds.filter(id=>id!==m.id))} style={{ display:'none' }}/>
                <Avatar name={m.name} color={m.color} size={16} fs={8}/>
                {m.name}
              </label>
            );
          })}
          {availableMembers.length===0 && <span style={{ fontSize:12,color:C.text3 }}>メンバーがいません（プロジェクトにメンバーを設定してください）</span>}
        </div>
      </FG>
      <FG label="期日">
        <div style={{ display:'flex',alignItems:'center',gap:8 }}>
          <Input type="date" value={due} onChange={e=>setDue(e.target.value)} style={{ flex:1 }}/>
          {selProj && (selProj.eventDate || selProj.end) && (() => {
            const base = selProj.eventDate||selProj.end;
            const diff = due ? daysDiff(due, base) : null;
            const absDiff = diff!==null ? Math.abs(diff) : '';
            const dir = diff!==null ? (diff<=0?'before':'after') : 'before';
            const weeksVal = absDiff!=='' && absDiff%7===0 ? absDiff/7 : '';
            return (
              <div style={{ display:'flex',alignItems:'center',gap:4,flexShrink:0,flexWrap:'wrap' }}>
                <input type="number" min="0" placeholder="N" value={absDiff}
                  onChange={e=>{ const n=parseInt(e.target.value); if(!isNaN(n)&&n>=0) setDue(addDays(base, dir==='before'?-n:n)); }}
                  style={{ width:40,padding:'4px 6px',border:`1px solid ${C.border}`,borderRadius:6,fontSize:12,fontFamily:'inherit',textAlign:'center',outline:'none' }}/>
                <span style={{ fontSize:11,color:C.text3 }}>日</span>
                <span style={{ fontSize:11,color:C.text3+'88' }}>/</span>
                <input type="number" min="0" placeholder="N" value={weeksVal}
                  onChange={e=>{ const n=parseInt(e.target.value); if(!isNaN(n)&&n>=0) setDue(addDays(base, dir==='before'?-n*7:n*7)); }}
                  style={{ width:40,padding:'4px 6px',border:`1px solid ${C.border}`,borderRadius:6,fontSize:12,fontFamily:'inherit',textAlign:'center',outline:'none' }}/>
                <span style={{ fontSize:11,color:C.text3 }}>週</span>
                <select value={dir} onChange={e=>{ if(absDiff!==''&&absDiff>0) setDue(addDays(base, e.target.value==='before'?-absDiff:absDiff)); }}
                  style={{ padding:'3px 4px',border:`1px solid ${C.border}`,borderRadius:6,fontSize:11,fontFamily:'inherit',color:C.text2,outline:'none',background:'#fff' }}>
                  <option value="before">前</option>
                  <option value="after">後</option>
                </select>
              </div>
            );
          })()}
        </div>
        {relLabel && <div style={{ fontSize:11,color:C.orange,marginTop:3 }}>{relLabel}</div>}
      </FG>
      <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:12 }}>
        <FG label="ステータス">
          <Select value={status} onChange={e=>setStatus(e.target.value)}>
            <option value="todo">未着手</option>
            <option value="doing">進行中</option>
            <option value="done">完了</option>
            <option value="skip">今回不要</option>
          </Select>
        </FG>
        <FG label="優先度">
          <Select value={priority} onChange={e=>setPriority(e.target.value)}>
            <option value="high">高</option>
            <option value="mid">中</option>
            <option value="low">低</option>
          </Select>
        </FG>
        <FG label="目安時間（分）">
          <Input type="number" min="0" value={estimatedMin} onChange={e=>setEstimatedMin(e.target.value)} placeholder="例: 30"/>
        </FG>
      </div>
      <button onClick={()=>setStarred(!starred)} style={{ display:'flex',alignItems:'center',gap:6,padding:'6px 14px',borderRadius:999,border:`1px solid ${starred?'#d4a020':C.border}`,background:starred?'#fef8e8':'transparent',color:starred?'#b8860b':C.text3,cursor:'pointer',fontSize:12,fontFamily:'inherit',fontWeight:starred?600:400,transition:'all 0.15s',marginBottom:4 }}>
        <span style={{ fontSize:16 }}>{starred?'★':'☆'}</span>今日やる
      </button>
      <FG label="関連リンク">
        <div style={{ display:'flex',flexDirection:'column',gap:6 }}>
          {links.map((link,i)=>(
            <div key={i} style={{ display:'flex',alignItems:'center',gap:6 }}>
              <input value={link.label} onChange={e=>setLinks(ls=>ls.map((l,j)=>j===i?{...l,label:e.target.value}:l))} placeholder="リンク名"
                style={{ width:100,padding:'5px 8px',borderRadius:6,border:`1px solid ${C.border}`,fontSize:12,fontFamily:'inherit',color:C.text,outline:'none' }}/>
              <input value={link.url} onChange={e=>setLinks(ls=>ls.map((l,j)=>j===i?{...l,url:e.target.value}:l))} placeholder="https://..."
                style={{ flex:1,padding:'5px 8px',borderRadius:6,border:`1px solid ${C.border}`,fontSize:12,fontFamily:'inherit',color:C.text,outline:'none' }}/>
              <button onClick={()=>setLinks(ls=>ls.filter((_,j)=>j!==i))} style={{ background:'none',border:'none',color:C.text3,cursor:'pointer',fontSize:12,padding:'0 2px',fontFamily:'inherit',flexShrink:0 }}
                onMouseEnter={e=>e.currentTarget.style.color=C.red} onMouseLeave={e=>e.currentTarget.style.color=C.text3}>✕</button>
            </div>
          ))}
          <button onClick={()=>setLinks(ls=>[...ls,{label:'',url:''}])}
            style={{ padding:'4px 12px',borderRadius:8,border:`1px solid ${C.border}`,background:'transparent',color:C.text3,cursor:'pointer',fontSize:11,fontFamily:'inherit',alignSelf:'flex-start' }}
            onMouseEnter={e=>{e.currentTarget.style.borderColor=C.orange;e.currentTarget.style.color=C.orange;}}
            onMouseLeave={e=>{e.currentTarget.style.borderColor=C.border;e.currentTarget.style.color=C.text3;}}>＋ リンク追加</button>
        </div>
      </FG>
      <FG label="マニュアル・メモ"><Textarea value={manual} onChange={e=>setManual(e.target.value)} placeholder="作業手順・マニュアル（任意）" style={{ minHeight:100 }}/></FG>
      <FG label="チェックリスト">
        <div style={{ display:'flex',flexDirection:'column',gap:4 }}>
          {checklist.map((item,i)=>(
            <div key={item.id} style={{ display:'flex',alignItems:'center',gap:6,padding:'4px 8px',borderRadius:8,background:item.checked?C.cream2:'transparent',border:`1px solid ${C.border}` }}>
              <input type="checkbox" checked={!!item.checked} onChange={()=>setChecklist(cl=>cl.map((c,j)=>j===i?{...c,checked:!c.checked}:c))} style={{ accentColor:C.green,cursor:'pointer',flexShrink:0 }}/>
              <input value={item.text} onChange={e=>setChecklist(cl=>cl.map((c,j)=>j===i?{...c,text:e.target.value}:c))}
                style={{ flex:1,fontSize:12,color:item.checked?C.text3:C.text,textDecoration:item.checked?'line-through':'none',border:'none',background:'transparent',outline:'none',fontFamily:'inherit',padding:'2px 0' }}/>
              <div style={{ display:'flex',flexDirection:'column',gap:0,flexShrink:0 }}>
                <button disabled={i===0} onClick={()=>setChecklist(cl=>{const a=[...cl];[a[i-1],a[i]]=[a[i],a[i-1]];return a;})}
                  style={{ background:'none',border:'none',cursor:i===0?'default':'pointer',color:i===0?C.text3+'55':C.text3,fontSize:8,padding:0,lineHeight:1,fontFamily:'inherit' }}>▲</button>
                <button disabled={i===checklist.length-1} onClick={()=>setChecklist(cl=>{const a=[...cl];[a[i],a[i+1]]=[a[i+1],a[i]];return a;})}
                  style={{ background:'none',border:'none',cursor:i===checklist.length-1?'default':'pointer',color:i===checklist.length-1?C.text3+'55':C.text3,fontSize:8,padding:0,lineHeight:1,fontFamily:'inherit' }}>▼</button>
              </div>
              <button onClick={()=>setChecklist(cl=>cl.filter((_,j)=>j!==i))} style={{ background:'none',border:'none',color:C.text3,cursor:'pointer',fontSize:12,padding:'0 2px',fontFamily:'inherit',flexShrink:0 }}
                onMouseEnter={e=>e.currentTarget.style.color=C.red} onMouseLeave={e=>e.currentTarget.style.color=C.text3}>✕</button>
            </div>
          ))}
          <div style={{ display:'flex',gap:6 }}>
            <input value={newCheckItem} onChange={e=>{setNewCheckItem(e.target.value);checkEnterRef.current=0;}} placeholder="項目を追加…"
              onCompositionStart={()=>checkComposingRef.current=true}
              onCompositionEnd={()=>{checkComposingRef.current=false;checkEnterRef.current=0;}}
              onKeyDown={e=>{ if(e.key==='Enter'&&!checkComposingRef.current&&newCheckItem.trim()){ e.preventDefault(); checkEnterRef.current++; if(checkEnterRef.current>=2){ setChecklist(cl=>[...cl,{id:genId(),text:newCheckItem.trim(),checked:false}]); setNewCheckItem(''); checkEnterRef.current=0; } } }}
              style={{ flex:1,padding:'6px 10px',borderRadius:8,border:`1px solid ${C.border}`,fontSize:12,fontFamily:'inherit',color:C.text,outline:'none' }}/>
            <button onClick={()=>{ if(newCheckItem.trim()){ setChecklist(cl=>[...cl,{id:genId(),text:newCheckItem.trim(),checked:false}]); setNewCheckItem(''); checkEnterRef.current=0; } }}
              style={{ padding:'4px 12px',borderRadius:8,border:`1px solid ${C.border}`,background:C.cream2,color:C.text2,cursor:'pointer',fontSize:12,fontFamily:'inherit' }}
              onMouseEnter={e=>{e.currentTarget.style.borderColor=C.orange;e.currentTarget.style.color=C.orange;}}
              onMouseLeave={e=>{e.currentTarget.style.borderColor=C.border;e.currentTarget.style.color=C.text2;}}>＋</button>
          </div>
          {newCheckItem.trim()&&checkEnterRef.current>=1&&<div style={{ fontSize:10,color:C.text3 }}>Enterをもう1回押して追加</div>}
          {checklist.length>0 && <div style={{ fontSize:10,color:C.text3 }}>{checklist.filter(c=>c.checked).length}/{checklist.length} 完了</div>}
        </div>
      </FG>
    </Modal>
  );
}

// ── Project Modal ─────────────────────────────────────────────────────────
function ProjectModal({ open, onClose, data, members, onSave, onDelete, isTsuge, adminMemberId, defaultType }) {
  const [type,setType]=useState('event');
  const [name,setName]=useState('');
  const [color,setColor]=useState(PALETTE[0]);
  const [isPrivate,setIsPrivate]=useState(false);
  const [eventDate,setEventDate]=useState('');
  const [venue,setVenue]=useState('');
  const [content,setContent]=useState('');
  const [start,setStart]=useState('');
  const [end,setEnd]=useState('');
  const [memo,setMemo]=useState('');
  const [links,setLinks]=useState([]);
  const [visibleMemberIds,setVisibleMemberIds]=useState([]);
  const [closed,setClosed]=useState(false);

  useEffect(()=>{
    if(!open) return;
    if(data){ setType(data.type||'event'); setName(data.name||''); setColor(data.color||PALETTE[0]); setIsPrivate(!!data.isPrivate); setEventDate(data.eventDate||''); setVenue(data.venue||''); setContent(data.content||''); setStart(data.start||''); setEnd(data.end||data.eventDate||''); setMemo(data.memo||''); setLinks(data.links||[]); setVisibleMemberIds(data.visibleMemberIds||[]); setClosed(!!data.closed); }
    else { setType(defaultType||'event'); setName(''); setColor(PALETTE[0]); setIsPrivate(false); setEventDate(''); setVenue(''); setContent(''); setStart(''); setEnd(''); setMemo(''); setLinks([]); setVisibleMemberIds(adminMemberId?[adminMemberId]:[]); setClosed(false); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[open]);

  const preview = type==='event' ? genEventName(eventDate, venue, content) : name.trim();

  function handleSave() {
    const nm = type==='event' ? genEventName(eventDate,venue,content) : name.trim();
    if(!nm){ alert('プロジェクト名を入力してください'); return; }
    const finalVisibleMemberIds = adminMemberId && !visibleMemberIds.includes(adminMemberId) ? [...visibleMemberIds, adminMemberId] : visibleMemberIds;
    const proj = { id:data?.id||genId(), type, name:nm, color, isPrivate, closed, memo, visibleMemberIds: finalVisibleMemberIds,
      links: links.filter(lk=>lk.url.trim()),
      ...(type==='event' ? { eventDate, venue, content, start:eventDate, end:eventDate } : { start, end }),
    };
    onSave(proj); onClose();
  }

  function updateLink(i, field, val) {
    setLinks(links.map((lk,j)=>j===i?{...lk,[field]:val}:lk));
  }

  const linkInputStyle = { background:'#fff',border:`1px solid ${C.border}`,borderRadius:8,color:C.text,padding:'6px 8px',fontSize:12,fontFamily:'inherit',outline:'none' };

  return (
    <Modal open={open} onClose={onClose} title={data?'プロジェクトを編集':'プロジェクトを追加'} maxWidth={540}
      footer={<>
        {data && <Btn variant="danger" style={{ marginRight:'auto' }} onClick={()=>{ if(window.confirm('このプロジェクトと関連タスクをすべて削除しますか？')){onDelete(data.id);onClose();} }}>削除</Btn>}
        <Btn onClick={onClose}>キャンセル</Btn>
        <Btn variant="primary" onClick={handleSave}>保存</Btn>
      </>}>
      <div style={{ display:'flex',gap:4,background:C.cream3,padding:3,borderRadius:999 }}>
        {[['event','イベント'],['other','その他']].map(([v,l])=>(
          <button key={v} onClick={()=>setType(v)} style={{ flex:1,padding:'6px',borderRadius:999,border:'none',background:type===v?'#fff':'transparent',color:type===v?C.orange:C.text2,fontFamily:'inherit',fontSize:12,fontWeight:500,cursor:'pointer',boxShadow:type===v?'0 1px 4px rgba(0,0,0,0.12)':'none',transition:'all 0.12s' }}>{l}</button>
        ))}
      </div>
      {type==='event' ? (<>
        <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:12 }}>
          <FG label="開催日"><Input type="date" value={eventDate} onChange={e=>setEventDate(e.target.value)}/></FG>
          <FG label="場所"><Input value={venue} onChange={e=>setVenue(e.target.value)} placeholder="CBC蟹江"/></FG>
          <FG label="内容"><Input value={content} onChange={e=>setContent(e.target.value)} placeholder="苺大福"/></FG>
        </div>
        {preview && <div style={{ fontSize:12,color:C.orange }}>→ {preview}</div>}
      </>) : (
        <FG label="プロジェクト名"><Input value={name} onChange={e=>setName(e.target.value)} placeholder="例：広報・SNS運用"/></FG>
      )}
      {type==='other' && (
        <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:12 }}>
          <FG label="開始日（任意）"><Input type="date" value={start} onChange={e=>setStart(e.target.value)}/></FG>
          <FG label="終了日（任意）"><Input type="date" value={end} onChange={e=>setEnd(e.target.value)}/></FG>
        </div>
      )}
      <FG label="テーマカラー"><ColorSwatchPicker selected={color} onSelect={setColor}/></FG>
      <FG label="メモ（特記事項）">
        <Textarea value={memo} onChange={e=>setMemo(e.target.value)} placeholder="特記事項・備考を入力" style={{ minHeight:56 }}/>
      </FG>
      <div style={{ display:'flex',flexDirection:'column',gap:6 }}>
        <label style={{ fontSize:11,fontWeight:600,color:C.text2,letterSpacing:0.3 }}>リンク</label>
        {links.map((lk,i)=>(
          <div key={i} style={{ display:'flex',gap:6,alignItems:'center' }}>
            <input value={lk.label} onChange={e=>updateLink(i,'label',e.target.value)} placeholder="ラベル（例：スプレッドシート）"
              style={{ ...linkInputStyle,flex:'0 0 140px' }}/>
            <input value={lk.url} onChange={e=>updateLink(i,'url',e.target.value)} placeholder="https://..."
              style={{ ...linkInputStyle,flex:1 }}/>
            <button onClick={()=>setLinks(links.filter((_,j)=>j!==i))}
              style={{ padding:'4px 8px',borderRadius:8,border:`1px solid ${C.red}55`,background:'transparent',color:C.red,cursor:'pointer',fontSize:12,fontFamily:'inherit',flexShrink:0 }}>×</button>
          </div>
        ))}
        <button onClick={()=>setLinks([...links,{label:'',url:''}])}
          style={{ alignSelf:'flex-start',padding:'5px 12px',borderRadius:999,border:`1.5px dashed ${C.border}`,background:'transparent',color:C.text3,cursor:'pointer',fontSize:11,fontFamily:'inherit',transition:'all 0.12s' }}
          onMouseEnter={e=>{ e.currentTarget.style.borderColor=C.orange; e.currentTarget.style.color=C.orange; }}
          onMouseLeave={e=>{ e.currentTarget.style.borderColor=C.border; e.currentTarget.style.color=C.text3; }}>
          ＋ リンクを追加
        </button>
      </div>
      <div>
        <label style={{ fontSize:11,fontWeight:600,color:C.text2,letterSpacing:0.3,display:'block',marginBottom:8 }}>表示メンバー（選択したメンバーのみ表示）</label>
        {(members||[]).length>0 ? (
          <>
            <div style={{ display:'flex',flexWrap:'wrap',gap:8,marginBottom:6 }}>
              {(members||[]).filter(m=>!m.closed).map(m=>{
                const checked = visibleMemberIds.includes(m.id);
                return (
                  <label key={m.id} style={{ display:'flex',alignItems:'center',gap:6,fontSize:12,color:C.text,cursor:'pointer',padding:'5px 10px',borderRadius:999,border:`1px solid ${checked?m.color:C.border}`,background:checked?m.color+'22':'transparent',transition:'all 0.12s' }}>
                    <input type="checkbox" checked={checked} onChange={e=>setVisibleMemberIds(prev=>e.target.checked?[...prev,m.id]:prev.filter(id=>id!==m.id))} style={{ display:'none' }}/>
                    <Avatar name={m.name} color={m.color} size={16} fs={8}/>
                    {m.name}
                  </label>
                );
              })}
            </div>
            <div style={{ fontSize:11,color:C.text3 }}>
              {visibleMemberIds.length===0 ? '管理者のみ表示' : `${visibleMemberIds.length}名に表示`}
            </div>
          </>
        ) : (
          <div style={{ fontSize:11,color:C.text3 }}>メンバータブでメンバーを追加すると、ここで表示設定ができます</div>
        )}
      </div>
      {data && (
        <label style={{ display:'flex',alignItems:'center',gap:8,fontSize:12,color:closed?C.text3:C.text2,cursor:'pointer' }}>
          <input type="checkbox" checked={closed} onChange={e=>setClosed(e.target.checked)}/>
          終了したプロジェクトに移動する
        </label>
      )}
      {isTsuge && (
        <label style={{ display:'flex',alignItems:'center',gap:8,fontSize:12,color:C.text2,cursor:'pointer' }}>
          <input type="checkbox" checked={isPrivate} onChange={e=>setIsPrivate(e.target.checked)}/>
          非公開（柘植のみ表示）
        </label>
      )}
    </Modal>
  );
}

// ── Member Modal ──────────────────────────────────────────────────────────
function MemberModal({ open, onClose, onSave, existingMemberIds }) {
  const [name, setName] = useState('');
  const composingRef = useRef(false);
  const enterCountRef = useRef(0);
  useEffect(()=>{ if(open){ setName(''); enterCountRef.current=0; } },[open]);
  function handleAdd() {
    const n = name.trim();
    if(!n) return;
    onSave({ id: genId(), name: n, color: PALETTE[((existingMemberIds||[]).length+1)%PALETTE.length] });
    onClose();
  }
  return (
    <Modal open={open} onClose={onClose} title="メンバーを追加"
      footer={<><Btn onClick={onClose}>キャンセル</Btn><Btn variant="primary" onClick={handleAdd} disabled={!name.trim()}>追加</Btn></>}>
      <FG label="メンバー名">
        <Input value={name} onChange={e=>{setName(e.target.value);enterCountRef.current=0;}} placeholder="名前を入力" autoFocus
          onCompositionStart={()=>composingRef.current=true}
          onCompositionEnd={()=>{composingRef.current=false;enterCountRef.current=0;}}
          onKeyDown={e=>{ if(e.key==='Enter'&&!composingRef.current){ e.preventDefault(); enterCountRef.current++; if(enterCountRef.current>=2) handleAdd(); } }}/>
        {name.trim()&&<div style={{ fontSize:10,color:C.text3,marginTop:3 }}>Enterをもう1回押して確定</div>}
      </FG>
    </Modal>
  );
}

// ── Category helper ──────────────────────────────────────────────────────
function extractCategory(title) {
  const m = title.match(/【(.+?)】/);
  return m ? m[1] : null;
}
function stripCategory(title) {
  return title.replace(/【.+?】\s*/, '');
}

// ── Kanban ────────────────────────────────────────────────────────────────
function KanbanView({ tasks, projects, members, onOpenTask, onStatusChange, onAddTask, onDuplicateTask, onCopyTaskToProject, taskOrder, onReorder, isMobile, onAddTaskWithStatus, onTimerSelect, timerTaskId }) {
  const dragId = useRef(null);
  const dragSourceCol = useRef(null);
  const dragOverCard = useRef(null);
  const [copyToOpen, setCopyToOpen] = useState(null);
  const kanbanOrderedProjects = (() => {
    const active = projects.filter(p=>!p.closed);
    const ev = active.filter(p=>p.type==='event').sort((a,b)=>(a.eventDate||'9999').localeCompare(b.eventDate||'9999'));
    const ot = active.filter(p=>p.type!=='event').sort((a,b)=>(b.start||b.end||'').localeCompare(a.start||a.end||''));
    return [...ev,...ot];
  })();
  const [groupByCategory, setGroupByCategory] = useState(()=>{ try { return localStorage.getItem('wf_kanban_catGroup')==='true'; } catch { return false; } });
  const toggleCatGroup = () => { setGroupByCategory(prev => { const v=!prev; try{localStorage.setItem('wf_kanban_catGroup',String(v))}catch{} return v; }); };
  const statuses = [
    { key:'todo', label:'未着手', color:C.text3 },
    { key:'doing', label:'進行中', color:C.blue },
    { key:'done', label:'完了', color:C.green },
    { key:'skip', label:'今回不要', color:'#aaa' },
  ];

  function getSortedColTasks(colKey) {
    const col = tasks.filter(t=>t.status===colKey);
    const order = taskOrder ? taskOrder[colKey] : null;
    if (order && order.length > 0) {
      const ordered = order.map(id=>col.find(t=>t.id===id)).filter(Boolean);
      const rest = col.filter(t=>!order.includes(t.id));
      rest.sort((a,b)=>{
        if (!a.due && !b.due) return 0;
        if (!a.due) return 1;
        if (!b.due) return -1;
        return a.due < b.due ? -1 : a.due > b.due ? 1 : 0;
      });
      return [...ordered, ...rest];
    }
    const sorted = [...col];
    sorted.sort((a,b)=>{
      if (!a.due && !b.due) return 0;
      if (!a.due) return 1;
      if (!b.due) return -1;
      return a.due < b.due ? -1 : a.due > b.due ? 1 : 0;
    });
    return sorted;
  }

  const renderCard = (t, st) => {
    const proj = projects.find(p=>p.id===t.projectId);
    const taskMembers = (t.assigneeIds||[]).map(id=>members.find(m=>m.id===id)).filter(Boolean);
    const ds = getDueStyle(t.due);
    const relLabel = proj && t.due ? getRelLabel(proj,t.due) : null;
    const displayTitle = groupByCategory ? stripCategory(t.title) : t.title;
    const cat = extractCategory(t.title);
    return (
      <div key={t.id} draggable onClick={()=>onOpenTask(t)}
        onDragStart={()=>{ dragId.current=t.id; dragSourceCol.current=st.key; }}
        onDragEnd={()=>{ dragId.current=null; dragSourceCol.current=null; dragOverCard.current=null; }}
        onDragOver={e=>{ e.preventDefault(); e.stopPropagation(); dragOverCard.current=t.id; }}
        onDrop={e=>{
          e.stopPropagation();
          if (!dragId.current || !dragOverCard.current) return;
          if (dragSourceCol.current === st.key && dragId.current !== dragOverCard.current) {
            onReorder(st.key, dragId.current, dragOverCard.current);
          }
        }}
        style={{ background:timerTaskId===t.id?C.orangeBg:'#fff',border:`1px solid ${timerTaskId===t.id?C.orange:C.border}`,borderRadius:10,padding:12,cursor:'pointer',transition:'all 0.12s' }}
        onMouseEnter={e=>{ e.currentTarget.style.borderColor=timerTaskId===t.id?C.orange:C.border2; e.currentTarget.style.transform='translateY(-2px)'; e.currentTarget.style.boxShadow='0 4px 12px rgba(58,53,48,0.1)'; }}
        onMouseLeave={e=>{ e.currentTarget.style.borderColor=timerTaskId===t.id?C.orange:C.border; e.currentTarget.style.transform=''; e.currentTarget.style.boxShadow=''; }}>
        {proj && <div style={{ fontSize:10,fontWeight:600,letterSpacing:0.3,marginBottom:5,display:'flex',alignItems:'center',gap:4,color:proj.color }}>
          <div style={{ width:6,height:6,borderRadius:'50%',background:proj.color }}/>{proj.name}
        </div>}
        <div style={{ display:'flex',alignItems:'flex-start',gap:5,marginBottom:8 }}>
          <PriorityDot priority={t.priority}/>
          <div style={{ fontSize:13,fontWeight:500,color:C.text,lineHeight:1.4,flex:1 }}>
            {!groupByCategory && cat && <span style={{ fontSize:10,color:C.blue,background:C.blue+'14',padding:'1px 5px',borderRadius:4,marginRight:4,fontWeight:600 }}>{cat}</span>}
            {displayTitle}
          </div>
          {t.isPrivate && <span style={{ fontSize:9,color:C.orange,background:C.orangeBg,border:`1px solid ${C.orangeBorder}`,padding:'1px 5px',borderRadius:999,whiteSpace:'nowrap',flexShrink:0 }}>🔐</span>}
        </div>
        <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',gap:6,flexWrap:'wrap' }}>
          <div style={{ display:'flex',alignItems:'center',gap:5,fontSize:11,color:C.text2 }}>
            {taskMembers.length>0
              ? <div style={{ display:'flex',alignItems:'center',gap:3 }}>
                  {taskMembers.map(m=><Avatar key={m.id} name={m.name} color={m.color} size={18} fs={9}/>)}
                  {taskMembers.length===1 && <span>{taskMembers[0].name.split(' ')[0]}</span>}
                </div>
              : <span style={{ color:C.text3 }}>未割当</span>}
          </div>
          <div style={{ display:'flex',gap:5,alignItems:'center',flexWrap:'wrap' }}>
            {relLabel && <span style={{ fontSize:10,color:C.text3,background:C.cream3,padding:'1px 6px',borderRadius:999 }}>{relLabel}</span>}
            {t.due && (()=>{
              const doneOverdue = getDoneOverdue(t);
              if (t.status==='done') {
                return <span style={{ fontSize:10,padding:'2px 7px',borderRadius:999,background:C.cream2,color:C.text3,border:`1px solid ${C.border}`,whiteSpace:'nowrap' }}>
                  📅 {fmtDate(t.due)}{doneOverdue ? ` (${doneOverdue})` : ''}
                </span>;
              }
              return <span style={{ fontSize:10,padding:'2px 7px',borderRadius:999,background:ds.bg,color:ds.color,border:`1px solid ${ds.border}`,whiteSpace:'nowrap' }}>
                📅 {fmtDate(t.due)}{ds.overdue?` (${ds.overdue}日超過)`:''}
              </span>;
            })()}
            <button onClick={e=>{ e.stopPropagation(); onOpenTask(t); }}
              title="編集" style={{ padding:'1px 6px',borderRadius:999,border:`1px solid ${C.border}`,background:C.cream2,color:C.text3,cursor:'pointer',fontSize:10,fontFamily:'inherit',lineHeight:1.5 }}
              onMouseEnter={e=>{ e.currentTarget.style.borderColor=C.blue; e.currentTarget.style.color=C.blue; }}
              onMouseLeave={e=>{ e.currentTarget.style.borderColor=C.border; e.currentTarget.style.color=C.text3; }}>
              ✏️
            </button>
            {onDuplicateTask && (
              <button onClick={e=>{ e.stopPropagation(); onDuplicateTask(t); }}
                title="複製" style={{ padding:'1px 6px',borderRadius:999,border:`1px solid ${C.border}`,background:C.cream2,color:C.text3,cursor:'pointer',fontSize:10,fontFamily:'inherit',lineHeight:1.5 }}
                onMouseEnter={e=>{ e.currentTarget.style.borderColor=C.orange; e.currentTarget.style.color=C.orange; }}
                onMouseLeave={e=>{ e.currentTarget.style.borderColor=C.border; e.currentTarget.style.color=C.text3; }}>
                ⧉
              </button>
            )}
            {onCopyTaskToProject && <div style={{ display:'inline-block',position:'relative' }}>
              <button onClick={e=>{ e.stopPropagation(); setCopyToOpen(copyToOpen===t.id?null:t.id); }}
                title="他プロジェクトにコピー" style={{ padding:'1px 6px',borderRadius:999,border:`1px solid ${C.border}`,background:C.cream2,color:C.text3,cursor:'pointer',fontSize:10,fontFamily:'inherit',lineHeight:1.5 }}
                onMouseEnter={e=>{ e.currentTarget.style.borderColor=C.green; e.currentTarget.style.color=C.green; }}
                onMouseLeave={e=>{ e.currentTarget.style.borderColor=C.border; e.currentTarget.style.color=C.text3; }}>
                ➜
              </button>
              {copyToOpen===t.id && <ProjectPickerDropdown projects={kanbanOrderedProjects} excludeId={t.projectId} onSelect={pid=>{ onCopyTaskToProject(t,pid); setCopyToOpen(null); }}/>}
            </div>}
            <button onClick={e=>{ e.stopPropagation(); if(window.confirm('削除しますか？')) onStatusChange(t.id,'__delete__'); }}
              style={{ padding:'2px 7px',borderRadius:999,border:`1px solid ${C.red}44`,background:'transparent',color:C.text3,cursor:'pointer',fontSize:10,fontFamily:'inherit',lineHeight:1.5 }}
              onMouseEnter={e=>{ e.currentTarget.style.background=C.red; e.currentTarget.style.color='#fff'; e.currentTarget.style.borderColor=C.red; }}
              onMouseLeave={e=>{ e.currentTarget.style.background='transparent'; e.currentTarget.style.color=C.text3; e.currentTarget.style.borderColor=C.red+'44'; }}>
              🗑
            </button>
            {t.status==='todo' && (
              <button onClick={e=>{ e.stopPropagation(); onStatusChange(t.id,'done'); }}
                style={{ padding:'2px 8px',borderRadius:999,border:`1px solid ${C.green}55`,background:'#edf5f0',color:C.green,cursor:'pointer',fontSize:10,fontFamily:'inherit',lineHeight:1.5,whiteSpace:'nowrap' }}
                onMouseEnter={e=>{ e.currentTarget.style.background=C.green; e.currentTarget.style.color='#fff'; }}
                onMouseLeave={e=>{ e.currentTarget.style.background='#edf5f0'; e.currentTarget.style.color=C.green; }}>
                →完了
              </button>
            )}
            <button onClick={e=>{ e.stopPropagation(); const next=t.status==='todo'?'doing':t.status==='doing'?'done':t.status==='done'?'skip':t.status==='skip'?'todo':'todo'; onStatusChange(t.id,next); }}
              style={{ padding:'2px 8px',borderRadius:999,border:`1px solid ${C.border}`,background:C.cream2,color:C.text3,cursor:'pointer',fontSize:10,fontFamily:'inherit',lineHeight:1.5,whiteSpace:'nowrap' }}
              onMouseEnter={e=>{ e.currentTarget.style.borderColor=C.orange; e.currentTarget.style.color=C.orange; e.currentTarget.style.background=C.orangeBg; }}
              onMouseLeave={e=>{ e.currentTarget.style.borderColor=C.border; e.currentTarget.style.color=C.text3; e.currentTarget.style.background=C.cream2; }}>
              {t.status==='todo'?'→進行中':t.status==='doing'?'→完了':'→未着手'}
            </button>
          </div>
        </div>
      </div>
    );
  };

  const renderColContent = (colTasks, st) => {
    if (colTasks.length===0 && st.key!=='todo') return <div style={{ padding:20,textAlign:'center',color:C.text3,fontSize:12 }}>タスクなし</div>;
    if (!groupByCategory) return colTasks.map(t => renderCard(t, st));
    // Group by category
    const catMap = new Map();
    colTasks.forEach(t => {
      const cat = extractCategory(t.title) || 'その他';
      if (!catMap.has(cat)) catMap.set(cat, []);
      catMap.get(cat).push(t);
    });
    const catColors = ['#5856d6','#1a6bbf','#e07840','#34c759','#ff3b30','#ff9500','#8e8e93'];
    let ci2 = 0;
    return Array.from(catMap.entries()).map(([cat, catTasks]) => {
      const color = cat === 'その他' ? C.text3 : catColors[ci2++ % catColors.length];
      return (
        <div key={cat}>
          <div style={{ fontSize:10,fontWeight:700,color,letterSpacing:0.3,padding:'8px 2px 4px',borderBottom:`2px solid ${color}33`,marginBottom:6,display:'flex',alignItems:'center',gap:4 }}>
            <div style={{ width:5,height:5,borderRadius:'50%',background:color }}/>{cat}<span style={{ fontWeight:400,color:C.text3,marginLeft:2 }}>({catTasks.length})</span>
          </div>
          {catTasks.map(t => renderCard(t, st))}
        </div>
      );
    });
  };

  return (
    <div style={{ flex:1,overflowX:'auto',overflowY:'hidden',padding:'16px 24px' }}>
      <div style={{ display:'flex',alignItems:'center',gap:8,marginBottom:10 }}>
        <button onClick={toggleCatGroup}
          style={{ padding:'4px 10px',borderRadius:999,border:`1px solid ${groupByCategory?C.blue:C.border}`,background:groupByCategory?C.blue+'14':'transparent',color:groupByCategory?C.blue:C.text3,cursor:'pointer',fontSize:11,fontFamily:'inherit',transition:'all 0.12s' }}>
          {groupByCategory ? '✦ カテゴリ別' : '☰ カテゴリ別'}
        </button>
      </div>
      <div style={{ display:'flex',flexDirection:'row',gap:14,height:'calc(100% - 36px)',minWidth:'fit-content' }}>
        {statuses.map(st=>{
          const colTasks = getSortedColTasks(st.key);
          return (
            <div key={st.key}
              onDragOver={e=>{ e.preventDefault(); if(dragSourceCol.current !== st.key) e.currentTarget.style.outline=`2px dashed ${C.orange}`; }}
              onDragLeave={e=>{ e.currentTarget.style.outline='none'; }}
              onDrop={e=>{
                e.currentTarget.style.outline='none';
                if (!dragId.current) return;
                if (dragSourceCol.current === st.key) return;
                onStatusChange(dragId.current, st.key);
              }}
              style={{ width:isMobile?280:255,flexShrink:0,display:'flex',flexDirection:'column',background:C.cream2,borderRadius:14,border:`1px solid ${C.border}`,maxHeight:'100%',transition:'outline 0.1s' }}>
              <div style={{ padding:'12px 14px',borderBottom:`1px solid ${C.border}`,display:'flex',alignItems:'center',justifyContent:'space-between',flexShrink:0 }}>
                <div style={{ display:'flex',alignItems:'center',gap:8,fontWeight:600,fontSize:12,color:C.text }}>
                  <div style={{ width:7,height:7,borderRadius:'50%',background:st.color }}/>
                  {st.label}
                </div>
                <span style={{ fontSize:11,color:C.text3,background:C.cream3,padding:'1px 6px',borderRadius:999 }}>{colTasks.length}</span>
              </div>
              <div style={{ flex:1,overflowY:'auto',padding:10,display:'flex',flexDirection:'column',gap:8 }}>
                {renderColContent(colTasks, st)}
                {st.key !== 'done' && (
                  <button onClick={()=>(onAddTaskWithStatus||onAddTask)(st.key)} style={{ display:'flex',alignItems:'center',justifyContent:'center',gap:5,width:'100%',padding:'8px',borderRadius:10,border:`1.5px dashed ${C.border2}`,background:'transparent',color:C.text3,cursor:'pointer',fontSize:12,fontFamily:'inherit',transition:'all 0.12s',marginTop:2 }}
                    onMouseEnter={e=>{ e.currentTarget.style.borderColor=C.orange; e.currentTarget.style.color=C.orange; e.currentTarget.style.background=C.orangeBg; }}
                    onMouseLeave={e=>{ e.currentTarget.style.borderColor=C.border2; e.currentTarget.style.color=C.text3; e.currentTarget.style.background='transparent'; }}>
                    ＋ タスクを追加
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Timer Panel (right side of kanban) ────────────────────────────────────
function TimerPanel({ timerTask, projects, onClearTask }) {
  const [running, setRunning] = useState(false);
  const [paused, setPaused] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [startTime, setStartTime] = useState(null);
  const [logs, setLogs] = useState(()=>{ try { return JSON.parse(localStorage.getItem('wf_timer_logs'))||[]; } catch { return []; } });
  const [exportedIds, setExportedIds] = useState(()=>{ try { return new Set(JSON.parse(localStorage.getItem('wf_timer_exportedIds'))||[]); } catch { return new Set(); } });
  const [deletedIds, setDeletedIds] = useState([]);
  const [updatedNoteIds, setUpdatedNoteIds] = useState(new Set());
  const [lastDeleted, setLastDeleted] = useState([]);
  const intervalRef = useRef(null);
  const [manualMinutes, setManualMinutes] = useState('');
  const [manualNote, setManualNote] = useState('');
  // After-stop state: show saved log for note editing before sheet send
  const [savedLog, setSavedLog] = useState(null);
  const [savedLogNote, setSavedLogNote] = useState('');
  const [editingNoteId, setEditingNoteId] = useState(null);

  useEffect(()=>{ try { localStorage.setItem('wf_timer_logs', JSON.stringify(logs)); } catch {} }, [logs]);
  useEffect(()=>{ try { localStorage.setItem('wf_timer_exportedIds', JSON.stringify([...exportedIds])); } catch {} }, [exportedIds]);

  useEffect(()=>{
    if (running) {
      intervalRef.current = setInterval(()=>setElapsed(Math.floor((Date.now()-startTime)/1000)),1000);
    } else { clearInterval(intervalRef.current); }
    return ()=>clearInterval(intervalRef.current);
  },[running,startTime]);

  const pad = n => String(Math.floor(n)).padStart(2,'0');
  const timerDisplay = `${pad(elapsed/3600)}:${pad((elapsed%3600)/60)}:${pad(elapsed%60)}`;

  function postGAS(payload) {
    let gasUrl = localStorage.getItem('wl_gasUrl');
    if (gasUrl) { try { gasUrl = JSON.parse(gasUrl); } catch {} }
    if (gasUrl) { try { fetch(gasUrl, { method:'POST', body:JSON.stringify(payload), redirect:'follow' }); } catch {} }
  }

  function doStart() {
    if (!timerTask) return;
    setStartTime(Date.now()); setElapsed(0); setRunning(true);
  }
  function doResume() {
    if (!timerTask) return;
    setStartTime(Date.now() - elapsed*1000); setPaused(false); setRunning(true);
  }
  function doPause() { setRunning(false); setPaused(true); }
  function doStop() {
    if (!timerTask) return;
    setRunning(false); setPaused(false);
    const proj = projects.find(p=>p.id===timerTask.projectId);
    const log = { id: Date.now(), project: proj?.name||'', task: timerTask.title, startedAt: new Date(startTime).toISOString(), endedAt: new Date().toISOString(), duration: elapsed, note: '' };
    setLogs(prev=>[log,...prev]);
    setElapsed(0);
    setSavedLog(log); setSavedLogNote('');
  }
  function doCancel() { setRunning(false); setPaused(false); setElapsed(0); onClearTask(); }

  // Send saved log (after stop) to sheet
  function sendSavedLog() {
    if (!savedLog) return;
    const logWithNote = { ...savedLog, note: savedLogNote };
    setLogs(prev=>prev.map(l=>l.id===savedLog.id ? logWithNote : l));
    postGAS({ action:'syncLogs', logs:[logWithNote], deletedIds:[], updatedNotes:[] });
    setExportedIds(prev=>new Set([...prev, String(savedLog.id)]));
    setSavedLog(null); setSavedLogNote(''); onClearTask();
  }

  // Manual log: just minutes
  function submitManualLog() {
    if (!timerTask) return;
    const mins = parseInt(manualMinutes)||0;
    const dur = mins*60;
    if (dur <= 0) return;
    const proj = projects.find(p=>p.id===timerTask.projectId);
    const now = new Date();
    const log = { id: Date.now(), project: proj?.name||'', task: timerTask.title, startedAt: new Date(now.getTime()-dur*1000).toISOString(), endedAt: now.toISOString(), duration: dur, note: manualNote };
    setLogs(prev=>[log,...prev]);
    postGAS({ action:'syncLogs', logs:[log], deletedIds:[], updatedNotes:[] });
    setExportedIds(prev=>new Set([...prev, String(log.id)]));
    setManualMinutes(''); setManualNote(''); onClearTask();
  }

  // Log operations
  function deleteLog(id) {
    const strId = String(id);
    const logToDelete = logs.find(l=>String(l.id)===strId);
    setLastDeleted(prev=> logToDelete ? [logToDelete,...prev].slice(0,3) : prev);
    setLogs(prev=>prev.filter(l=>String(l.id)!==strId));
    if (exportedIds.has(strId)) setDeletedIds(prev=>[...prev, strId]);
    setExportedIds(prev=>{ const s=new Set(prev); s.delete(strId); return s; });
  }
  function undoDelete() {
    if (!lastDeleted.length) return;
    const [first,...rest] = lastDeleted;
    setLogs(prev=>[first,...prev]);
    setLastDeleted(rest);
  }
  function updateNote(id, note) {
    setLogs(prev=>prev.map(l=>l.id===id ? {...l, note} : l));
    setUpdatedNoteIds(prev=>new Set([...prev, String(id)]));
  }
  function syncSheets() {
    const newLogs = logs.filter(l=>!exportedIds.has(String(l.id)));
    const updatedNotes = logs.filter(l=>exportedIds.has(String(l.id))&&updatedNoteIds.has(String(l.id)));
    if (!newLogs.length && !deletedIds.length && !updatedNotes.length) return;
    postGAS({ action:'syncLogs', logs:newLogs, deletedIds, updatedNotes });
    setExportedIds(prev=>new Set([...prev,...newLogs.map(l=>String(l.id))]));
    setDeletedIds([]); setUpdatedNoteIds(new Set());
  }

  function fmtDur(s) {
    const h=Math.floor(s/3600), m=Math.floor((s%3600)/60), ss=s%60;
    if(h>0) return `${h}h${m}m`;
    if(m>0) return `${m}m${ss}s`;
    return `${ss}s`;
  }

  const todayStr = new Date().toISOString().slice(0,10);
  const yesterdayStr = (()=>{ const d=new Date(); d.setDate(d.getDate()-1); return d.toISOString().slice(0,10); })();
  const todayLogs = logs.filter(l=>l.startedAt?.slice(0,10)===todayStr);
  const yesterdayLogs = logs.filter(l=>l.startedAt?.slice(0,10)===yesterdayStr);
  const todayTotal = todayLogs.reduce((s,l)=>s+l.duration,0);
  const yesterdayTotal = yesterdayLogs.reduce((s,l)=>s+l.duration,0);
  const [showYesterday, setShowYesterday] = useState(false);
  const timerProj = timerTask ? projects.find(p=>p.id===timerTask.projectId) : null;
  const manualDur = (parseInt(manualMinutes)||0)*60;
  const isIdle = !running && !paused && !savedLog;
  const hasUnsyncedChanges = logs.some(l=>!exportedIds.has(String(l.id))) || deletedIds.length>0 || updatedNoteIds.size>0;
  const [editingLogId, setEditingLogId] = useState(null);
  const [editDuration, setEditDuration] = useState('');

  return (
    <div style={{ width:260,flexShrink:0,display:'flex',flexDirection:'column',background:'#fff',borderRadius:14,border:`1px solid ${C.border}`,maxHeight:'100%',overflow:'hidden' }}>
      {/* Header */}
      <div style={{ padding:'10px 14px',borderBottom:`1px solid ${C.border}`,display:'flex',alignItems:'center',gap:8,flexShrink:0 }}>
        <div style={{ width:7,height:7,borderRadius:'50%',background:running?C.green:paused?C.amber:C.text3,boxShadow:running?`0 0 6px ${C.green}`:'none' }}/>
        <span style={{ fontSize:12,fontWeight:600,color:C.text }}>タイマー</span>
        {todayTotal>0 && <span style={{ fontSize:10,color:C.text3,marginLeft:'auto' }}>今日 {fmtDur(todayTotal)}</span>}
      </div>

      {/* Selected Task Info */}
      {timerTask ? (
        <div style={{ padding:'10px 14px',borderBottom:`1px solid ${C.border}`,flexShrink:0,background:C.orangeBg }}>
          <div style={{ fontSize:12,color:C.text,fontWeight:500,lineHeight:1.4 }}>{timerTask.title}</div>
          {timerProj && <div style={{ fontSize:10,color:timerProj.color,marginTop:2 }}>{timerProj.name}</div>}
        </div>
      ) : (
        <div style={{ padding:'14px',textAlign:'center',borderBottom:`1px solid ${C.border}`,flexShrink:0 }}>
          <div style={{ fontSize:11,color:C.text3 }}>タスクを押して選択</div>
        </div>
      )}

      {/* After-stop: note editing + sheet send */}
      {savedLog && (
        <div style={{ padding:'10px 14px',borderBottom:`1px solid ${C.border}`,flexShrink:0,background:C.cream }}>
          <div style={{ fontSize:11,color:C.green,fontWeight:600,marginBottom:6 }}>✓ {fmtDur(savedLog.duration)} 記録済み</div>
          <input value={savedLogNote} onChange={e=>setSavedLogNote(e.target.value)} placeholder="備考（任意）"
            style={{ width:'100%',padding:'5px 8px',borderRadius:6,border:`1px solid ${C.border}`,fontSize:11,fontFamily:'inherit',background:'#fff',color:C.text,boxSizing:'border-box',marginBottom:6 }}/>
          <button onClick={sendSavedLog}
            style={{ width:'100%',padding:'6px',borderRadius:8,border:'none',background:C.orange,color:'#fff',cursor:'pointer',fontSize:11,fontFamily:'inherit',fontWeight:500 }}>
            → シート送信
          </button>
        </div>
      )}

      {/* Timer + Manual Log - only when task is selected and no saved log pending */}
      {timerTask && !savedLog && (
        <div style={{ flexShrink:0,borderBottom:`1px solid ${C.border}` }}>
          <div style={{ padding:'12px 14px',textAlign:'center' }}>
            <div style={{ fontSize:30,fontWeight:300,letterSpacing:'-0.02em',color:running?C.orange:paused?C.amber:C.text3,fontFamily:"'DM Mono','Fira Code',monospace",transition:'color 0.3s' }}>
              {timerDisplay}
            </div>
            <div style={{ display:'flex',gap:5,justifyContent:'center',marginTop:8,flexWrap:'wrap' }}>
              {isIdle && (
                <button onClick={doStart} style={{ padding:'5px 16px',borderRadius:999,border:'none',background:C.orange,color:'#fff',cursor:'pointer',fontSize:11,fontFamily:'inherit',fontWeight:500 }}>▶ タイマー開始</button>
              )}
              {running && <>
                <button onClick={doPause} style={{ padding:'5px 12px',borderRadius:999,border:`1px solid ${C.amber}`,background:C.cream,color:C.amber,cursor:'pointer',fontSize:11,fontFamily:'inherit',fontWeight:500 }}>⏸ 一時停止</button>
                <button onClick={doStop} style={{ padding:'5px 12px',borderRadius:999,border:`1px solid ${C.red}`,background:C.cream,color:C.red,cursor:'pointer',fontSize:11,fontFamily:'inherit',fontWeight:500 }}>■ 停止</button>
              </>}
              {paused && <>
                <button onClick={doResume} style={{ padding:'5px 12px',borderRadius:999,border:'none',background:C.orange,color:'#fff',cursor:'pointer',fontSize:11,fontFamily:'inherit',fontWeight:500 }}>▶ 再開</button>
                <button onClick={doStop} style={{ padding:'5px 12px',borderRadius:999,border:`1px solid ${C.red}`,background:C.cream,color:C.red,cursor:'pointer',fontSize:11,fontFamily:'inherit',fontWeight:500 }}>■ 停止</button>
                <button onClick={doCancel} style={{ padding:'5px 8px',borderRadius:999,border:`1px solid ${C.border}`,background:'transparent',color:C.text3,cursor:'pointer',fontSize:10,fontFamily:'inherit' }}>✕</button>
              </>}
            </div>
          </div>
          {/* Manual Log (when idle) */}
          {isIdle && (
            <div style={{ padding:'10px 14px',borderTop:`1px solid ${C.border}` }}>
              <div style={{ fontSize:10,fontWeight:600,color:C.text3,marginBottom:6 }}>または手動で記録</div>
              <div style={{ display:'flex',gap:6,alignItems:'center',marginBottom:6 }}>
                <input type="number" min="0" value={manualMinutes} onChange={e=>setManualMinutes(e.target.value)} placeholder="0"
                  style={{ width:60,padding:'5px 6px',borderRadius:6,border:`1px solid ${C.border}`,fontSize:12,fontFamily:'inherit',background:'#fff',color:C.text,textAlign:'center',boxSizing:'border-box' }}/>
                <span style={{ fontSize:11,color:C.text2 }}>分</span>
              </div>
              <input value={manualNote} onChange={e=>setManualNote(e.target.value)} placeholder="備考（任意）"
                style={{ width:'100%',padding:'5px 8px',borderRadius:6,border:`1px solid ${C.border}`,fontSize:11,fontFamily:'inherit',background:'#fff',color:C.text,boxSizing:'border-box',marginBottom:6 }}/>
              <button onClick={submitManualLog} disabled={!manualDur}
                style={{ width:'100%',padding:'6px',borderRadius:8,border:'none',background:manualDur?C.orange:C.cream3,color:manualDur?'#fff':C.text3,cursor:manualDur?'pointer':'default',fontSize:11,fontFamily:'inherit',fontWeight:500 }}>
                → シート送信
              </button>
            </div>
          )}
        </div>
      )}

      {/* Logs */}
      <div style={{ flex:1,overflowY:'auto',padding:10 }}>
        <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',padding:'4px 4px 6px' }}>
          <span style={{ fontSize:10,fontWeight:600,color:C.text3,letterSpacing:0.3 }}>今日のログ ({todayLogs.length})</span>
          <div style={{ display:'flex',gap:4,alignItems:'center' }}>
            {lastDeleted.length>0 && (
              <button onClick={undoDelete} style={{ padding:'2px 6px',borderRadius:999,border:`1px solid ${C.green}55`,background:'#edf5f0',color:C.green,cursor:'pointer',fontSize:9,fontFamily:'inherit' }}>↩ 戻す({lastDeleted.length})</button>
            )}
            {hasUnsyncedChanges && (
              <button onClick={syncSheets} style={{ padding:'2px 6px',borderRadius:999,border:`1px solid ${C.orange}55`,background:C.orangeBg,color:C.orange,cursor:'pointer',fontSize:9,fontFamily:'inherit' }}>↑ 同期</button>
            )}
          </div>
        </div>
        {todayLogs.length>0 ? todayLogs.map(l=>{
          const isEditing = editingLogId===l.id;
          return (
          <div key={l.id} style={{ padding:'5px 6px',fontSize:10,color:C.text2,borderBottom:`1px solid ${C.border}22` }}>
            <div style={{ display:'flex',justifyContent:'space-between',gap:4,alignItems:'center' }}>
              <span style={{ flex:1,fontWeight:500 }}>{l.task}</span>
              {isEditing ? (
                <div style={{ display:'flex',gap:3,alignItems:'center',flexShrink:0 }}>
                  <input type="number" min="0" value={editDuration} onChange={e=>setEditDuration(e.target.value)}
                    style={{ width:40,padding:'2px 4px',borderRadius:4,border:`1px solid ${C.border}`,fontSize:10,fontFamily:'inherit',textAlign:'center' }}/>
                  <span style={{ fontSize:9,color:C.text3 }}>分</span>
                  <button onClick={()=>{ const mins=parseInt(editDuration)||0; if(mins>0){setLogs(prev=>prev.map(x=>x.id===l.id?{...x,duration:mins*60}:x));setUpdatedNoteIds(prev=>new Set([...prev,String(l.id)]));} setEditingLogId(null); }}
                    style={{ padding:'2px 5px',borderRadius:4,border:'none',background:C.orange,color:'#fff',cursor:'pointer',fontSize:9,fontFamily:'inherit' }}>OK</button>
                  <button onClick={()=>setEditingLogId(null)}
                    style={{ padding:'2px 5px',borderRadius:4,border:`1px solid ${C.border}`,background:'transparent',color:C.text3,cursor:'pointer',fontSize:9,fontFamily:'inherit' }}>✕</button>
                </div>
              ) : (
                <span onClick={()=>{setEditingLogId(l.id);setEditDuration(String(Math.round(l.duration/60)));}} style={{ color:C.orange,fontWeight:600,flexShrink:0,cursor:'pointer' }}
                  onMouseEnter={e=>{e.currentTarget.style.textDecoration='underline';}} onMouseLeave={e=>{e.currentTarget.style.textDecoration='none';}}>{fmtDur(l.duration)}</span>
              )}
              <button onClick={()=>deleteLog(l.id)} style={{ padding:'1px 4px',border:'none',background:'transparent',color:C.text3,cursor:'pointer',fontSize:10,flexShrink:0 }}
                onMouseEnter={e=>{e.currentTarget.style.color=C.red;}} onMouseLeave={e=>{e.currentTarget.style.color=C.text3;}}>🗑</button>
            </div>
            <div style={{ color:C.text3,fontSize:9,marginBottom:2 }}>{l.project}</div>
            {editingNoteId===l.id ? (
              <div style={{ display:'flex',gap:4 }}>
                <input value={l.note||''} onChange={e=>updateNote(l.id,e.target.value)} placeholder="備考..."
                  style={{ flex:1,padding:'3px 6px',borderRadius:4,border:`1px solid ${C.border}`,fontSize:10,fontFamily:'inherit',background:'#fff',color:C.text,boxSizing:'border-box' }}/>
                <button onClick={()=>setEditingNoteId(null)} style={{ padding:'3px 6px',borderRadius:4,border:'none',background:C.orange,color:'#fff',cursor:'pointer',fontSize:9,fontFamily:'inherit' }}>OK</button>
              </div>
            ) : (
              <div onClick={()=>setEditingNoteId(l.id)} style={{ cursor:'pointer',fontSize:9,color:l.note?C.text2:C.text3,fontStyle:l.note?'normal':'italic' }}>
                {l.note ? `📝 ${l.note}` : '+ 備考'}
              </div>
            )}
          </div>
          );
        }) : (
          <div style={{ padding:16,textAlign:'center',fontSize:11,color:C.text3 }}>まだログがありません</div>
        )}

        {/* Yesterday's Logs */}
        {yesterdayLogs.length>0 && (
          <>
            <div onClick={()=>setShowYesterday(!showYesterday)}
              style={{ display:'flex',alignItems:'center',justifyContent:'space-between',padding:'8px 4px 6px',marginTop:4,cursor:'pointer',borderTop:`1px solid ${C.border}` }}
              onMouseEnter={e=>{e.currentTarget.style.background=C.cream;}} onMouseLeave={e=>{e.currentTarget.style.background='transparent';}}>
              <span style={{ fontSize:10,fontWeight:600,color:C.text3,letterSpacing:0.3 }}>昨日のログ ({yesterdayLogs.length}){yesterdayTotal>0 && ` — ${fmtDur(yesterdayTotal)}`}</span>
              <span style={{ fontSize:10,color:C.text3 }}>{showYesterday?'▲':'▼'}</span>
            </div>
            {showYesterday && yesterdayLogs.map(l=>{
              const isEditing = editingLogId===l.id;
              return (
              <div key={l.id} style={{ padding:'5px 6px',fontSize:10,color:C.text2,borderBottom:`1px solid ${C.border}22` }}>
                <div style={{ display:'flex',justifyContent:'space-between',gap:4,alignItems:'center' }}>
                  <span style={{ flex:1,fontWeight:500 }}>{l.task}</span>
                  {isEditing ? (
                    <div style={{ display:'flex',gap:3,alignItems:'center',flexShrink:0 }}>
                      <input type="number" min="0" value={editDuration} onChange={e=>setEditDuration(e.target.value)}
                        style={{ width:40,padding:'2px 4px',borderRadius:4,border:`1px solid ${C.border}`,fontSize:10,fontFamily:'inherit',textAlign:'center' }}/>
                      <span style={{ fontSize:9,color:C.text3 }}>分</span>
                      <button onClick={()=>{ const mins=parseInt(editDuration)||0; if(mins>0){setLogs(prev=>prev.map(x=>x.id===l.id?{...x,duration:mins*60}:x));setUpdatedNoteIds(prev=>new Set([...prev,String(l.id)]));} setEditingLogId(null); }}
                        style={{ padding:'2px 5px',borderRadius:4,border:'none',background:C.orange,color:'#fff',cursor:'pointer',fontSize:9,fontFamily:'inherit' }}>OK</button>
                      <button onClick={()=>setEditingLogId(null)}
                        style={{ padding:'2px 5px',borderRadius:4,border:`1px solid ${C.border}`,background:'transparent',color:C.text3,cursor:'pointer',fontSize:9,fontFamily:'inherit' }}>✕</button>
                    </div>
                  ) : (
                    <span onClick={()=>{setEditingLogId(l.id);setEditDuration(String(Math.round(l.duration/60)));}} style={{ color:C.orange,fontWeight:600,flexShrink:0,cursor:'pointer' }}
                      onMouseEnter={e=>{e.currentTarget.style.textDecoration='underline';}} onMouseLeave={e=>{e.currentTarget.style.textDecoration='none';}}>{fmtDur(l.duration)}</span>
                  )}
                  <button onClick={()=>deleteLog(l.id)} style={{ padding:'1px 4px',border:'none',background:'transparent',color:C.text3,cursor:'pointer',fontSize:10,flexShrink:0 }}
                    onMouseEnter={e=>{e.currentTarget.style.color=C.red;}} onMouseLeave={e=>{e.currentTarget.style.color=C.text3;}}>🗑</button>
                </div>
                <div style={{ color:C.text3,fontSize:9,marginBottom:2 }}>{l.project}</div>
                {editingNoteId===l.id ? (
                  <div style={{ display:'flex',gap:4 }}>
                    <input value={l.note||''} onChange={e=>updateNote(l.id,e.target.value)} placeholder="備考..."
                      style={{ flex:1,padding:'3px 6px',borderRadius:4,border:`1px solid ${C.border}`,fontSize:10,fontFamily:'inherit',background:'#fff',color:C.text,boxSizing:'border-box' }}/>
                    <button onClick={()=>setEditingNoteId(null)} style={{ padding:'3px 6px',borderRadius:4,border:'none',background:C.orange,color:'#fff',cursor:'pointer',fontSize:9,fontFamily:'inherit' }}>OK</button>
                  </div>
                ) : (
                  <div onClick={()=>setEditingNoteId(l.id)} style={{ cursor:'pointer',fontSize:9,color:l.note?C.text2:C.text3,fontStyle:l.note?'normal':'italic' }}>
                    {l.note ? `📝 ${l.note}` : '+ 備考'}
                  </div>
                )}
              </div>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}

function ProjectPickerDropdown({ projects, excludeId, onSelect, style }) {
  const filtered = projects.filter(p=>p.id!==excludeId);
  const events = filtered.filter(p=>p.type==='event');
  const others = filtered.filter(p=>p.type!=='event');
  return (
    <div onClick={e=>e.stopPropagation()} style={{ position:'absolute',top:'100%',right:0,zIndex:100,background:'#fff',border:`1px solid ${C.border}`,borderRadius:8,boxShadow:'0 4px 16px rgba(0,0,0,0.12)',minWidth:200,maxHeight:280,overflowY:'auto',padding:4,...style }}>
      {events.length>0 && <div style={{ fontSize:9,fontWeight:700,color:C.text3,padding:'4px 8px 2px',letterSpacing:1 }}>イベント</div>}
      {events.map(p=>(
        <div key={p.id} onClick={()=>onSelect(p.id)}
          style={{ padding:'5px 10px',fontSize:11,cursor:'pointer',borderRadius:6,display:'flex',alignItems:'center',gap:6 }}
          onMouseEnter={e=>e.currentTarget.style.background=C.cream2} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
          <div style={{ width:6,height:6,borderRadius:'50%',background:p.color,flexShrink:0 }}/>{p.name}
        </div>
      ))}
      {others.length>0 && <div style={{ fontSize:9,fontWeight:700,color:C.text3,padding:'4px 8px 2px',letterSpacing:1,marginTop:events.length?4:0 }}>その他</div>}
      {others.map(p=>(
        <div key={p.id} onClick={()=>onSelect(p.id)}
          style={{ padding:'5px 10px',fontSize:11,cursor:'pointer',borderRadius:6,display:'flex',alignItems:'center',gap:6 }}
          onMouseEnter={e=>e.currentTarget.style.background=C.cream2} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
          <div style={{ width:6,height:6,borderRadius:'50%',background:p.color,flexShrink:0 }}/>{p.name}
        </div>
      ))}
    </div>
  );
}

// ── Commit-on-blur number input ──────────────────────────────────────────
function NumInput({ value, onCommit, placeholder, style, min, step }) {
  const [local, setLocal] = useState(String(value ?? ''));
  const prev = useRef(value);
  if (value !== prev.current) { prev.current = value; setLocal(String(value ?? '')); }
  const commit = () => { const n = parseInt(local); onCommit(isNaN(n) ? '' : n); };
  return <input type="number" min={min??0} step={step} placeholder={placeholder||'-'} value={local}
    onChange={e=>setLocal(e.target.value)}
    onBlur={commit}
    onKeyDown={e=>{ if(e.key==='Enter'){e.target.blur();} }}
    style={style}/>;
}

// ── List View ─────────────────────────────────────────────────────────────
function ListView({ tasks, projects, members, onOpenTask, onStatusChange, onDelete, onDeleteTasks, onSave, onSaveBulk, onTimerSelect, timerTaskId, onAddTask, onCopyCategoryToProject, onDuplicateTask, onCopyTaskToProject, catOrder, onCatOrderChange, onRenameCategory, currentProject }) {
  const [assigneeOpen, setAssigneeOpen] = useState(null);
  const [copyCatOpen, setCopyCatOpen] = useState(null);
  const [copyToOpen, setCopyToOpen] = useState(null);
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkIds, setBulkIds] = useState(new Set());
  const [bulkAssigneeOpen, setBulkAssigneeOpen] = useState(false);
  const [bulkCopyOpen, setBulkCopyOpen] = useState(false);
  const [bulkDueOpen, setBulkDueOpen] = useState(false);
  const [bulkDueDate, setBulkDueDate] = useState('');
  const [bulkDueDaysBefore, setBulkDueDaysBefore] = useState('');
  const [bulkDueDir, setBulkDueDir] = useState('before');
  const [catReorderOpen, setCatReorderOpen] = useState(false);
  const [dragCat, setDragCat] = useState(null);
  const [dragOverCat, setDragOverCat] = useState(null);
  const [statusFilter, setStatusFilter] = useState(null); // null | 'todo' | 'doing' | 'done' | 'skip'
  const [memberFilterLocal, setMemberFilterLocal] = useState(null); // null | memberId
  const [openedCats, setOpenedCats] = useState(() => { try { const s = JSON.parse(localStorage.getItem('wf_openedCats')); return s?.length ? new Set(s) : new Set(); } catch { return new Set(); } });
  const activeMembers = members.filter(m=>!m.closed);
  const toggleCollapse = (cat) => setOpenedCats(prev => { const s = new Set(prev); s.has(cat) ? s.delete(cat) : s.add(cat); try { localStorage.setItem('wf_openedCats', JSON.stringify([...s])); } catch {} return s; });
  // Ordered project list matching sidebar: events by date, then others
  const orderedProjects = (() => {
    const active = projects.filter(p=>!p.closed);
    const ev = active.filter(p=>p.type==='event').sort((a,b)=>(a.eventDate||'9999').localeCompare(b.eventDate||'9999'));
    const ot = active.filter(p=>p.type!=='event').sort((a,b)=>(b.start||b.end||'').localeCompare(a.start||a.end||''));
    return [...ev,...ot];
  })();
  function toggleBulk(id) { setBulkIds(prev=>{const s=new Set(prev);s.has(id)?s.delete(id):s.add(id);return s;}); }
  function bulkAddAssignee(memberId) {
    const updated = tasks.filter(t=>bulkIds.has(t.id)&&!(t.assigneeIds||[]).includes(memberId))
      .map(t=>({...t,assigneeIds:[...(t.assigneeIds||[]),memberId]}));
    if(updated.length) onSaveBulk(updated);
  }
  function bulkRemoveAssignee(memberId) {
    const updated = tasks.filter(t=>bulkIds.has(t.id)&&(t.assigneeIds||[]).includes(memberId))
      .map(t=>({...t,assigneeIds:(t.assigneeIds||[]).filter(id=>id!==memberId)}));
    if(updated.length) onSaveBulk(updated);
  }
  if (!tasks.length) return <div style={{ flex:1,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',color:C.text3,gap:10 }}><div style={{ fontSize:36 }}>📋</div><div style={{ fontSize:14,color:C.text2 }}>タスクがありません</div>{onAddTask&&<button onClick={onAddTask} style={{ marginTop:8,padding:'8px 20px',borderRadius:10,border:`1.5px dashed ${C.border2}`,background:'transparent',color:C.text3,cursor:'pointer',fontSize:12,fontFamily:'inherit' }} onMouseEnter={e=>{e.currentTarget.style.borderColor=C.orange;e.currentTarget.style.color=C.orange;}} onMouseLeave={e=>{e.currentTarget.style.borderColor=C.border2;e.currentTarget.style.color=C.text3;}}>＋ タスク追加</button>}</div>;
  const thStyle = { textAlign:'left',fontSize:10,fontWeight:600,color:C.text3,letterSpacing:0.5,textTransform:'uppercase',padding:'8px 12px',borderBottom:`1px solid ${C.border}`,whiteSpace:'nowrap' };
  const tdStyle = { padding:'8px 12px',borderBottom:`1px solid ${C.border}`,verticalAlign:'middle' };

  // Filter by status and member
  const filtered = tasks.filter(t => {
    if (statusFilter && t.status !== statusFilter) return false;
    if (memberFilterLocal === '__unassigned__' && (t.assigneeIds||[]).length > 0) return false;
    if (memberFilterLocal && memberFilterLocal !== '__unassigned__' && !(t.assigneeIds||[]).includes(memberFilterLocal)) return false;
    return true;
  });
  // Sort by due date (earliest first, no due last) then group by category
  const sorted = [...filtered].sort((a,b) => { if(!a.due&&!b.due) return 0; if(!a.due) return 1; if(!b.due) return -1; return a.due.localeCompare(b.due); });
  const catMap = new Map();
  sorted.forEach(t => {
    const cat = extractCategory(t.title) || 'その他';
    if (!catMap.has(cat)) catMap.set(cat, []);
    catMap.get(cat).push(t);
  });
  const allCats = Array.from(catMap.keys());
  const categories = allCats.sort((a,b) => {
    if(a==='その他') return 1; if(b==='その他') return -1;
    const ai=catOrder.indexOf(a), bi=catOrder.indexOf(b);
    if(ai>=0&&bi>=0) return ai-bi;
    if(ai>=0) return -1; if(bi>=0) return 1;
    return a.localeCompare(b,'ja');
  });
  function moveCat(cat, dir) {
    const curr = [...categories].filter(c=>c!=='その他');
    const idx = curr.indexOf(cat);
    if(idx<0) return;
    const ni = idx+dir;
    if(ni<0||ni>=curr.length) return;
    [curr[idx],curr[ni]]=[curr[ni],curr[idx]];
    onCatOrderChange(curr);
  }
  const catColors = ['#5856d6','#1a6bbf','#e07840','#34c759','#ff9500','#ff3b30','#8e8e93'];
  // カテゴリ名→色の安定マップ（catOrderベースで固定）
  const catColorMap = (() => {
    const m = {};
    const baseColorMap = {};
    let colorIdx = 0;
    const baseName = (cat) => cat.replace(/[\(（].+[\)）]$/, '').trim();
    const ordered = [...(catOrder||[]), ...allCats.filter(c=>!(catOrder||[]).includes(c))].filter(c=>c!=='その他');
    ordered.forEach(c => {
      const base = baseName(c);
      if (!(base in baseColorMap)) { baseColorMap[base] = catColors[colorIdx++ % catColors.length]; }
      m[c] = baseColorMap[base];
    });
    return m;
  })();

  const renderRow = (t) => {
    const pj=projects.find(p=>p.id===t.projectId);
    const mbs=(t.assigneeIds||[]).map(id=>members.find(m=>m.id===id)).filter(Boolean);
    const ds=getDueStyle(t.due);
    const rel=pj&&t.due?getRelLabel(pj,t.due):null;
    const availMembers=(pj?.visibleMemberIds?.length>0?members.filter(m=>pj.visibleMemberIds.includes(m.id)):members).filter(m=>!m.closed);
    const displayTitle = stripCategory(t.title);
    const isSkip = t.status==='skip';
    const isDone = t.status==='done';
    const dimStyle = isSkip ? { opacity:0.4 } : isDone ? { opacity:0.55 } : {};
    const rowBg = isSkip ? '#f5f4f2' : isDone ? '#f5f3ef' : '';
    const hoverBg = isSkip ? '#eeedea' : isDone ? '#edeae5' : C.cream2;
    return (
      <tr key={t.id} style={rowBg?{background:rowBg}:{}}
        onMouseEnter={e=>Array.from(e.currentTarget.cells).forEach(td=>td.style.background=hoverBg)}
        onMouseLeave={e=>Array.from(e.currentTarget.cells).forEach(td=>td.style.background=rowBg||'')}>
        {bulkMode && <td style={{ ...tdStyle,padding:'8px 4px 8px 12px',width:24 }} onClick={e=>e.stopPropagation()}>
          <input type="checkbox" checked={bulkIds.has(t.id)} onChange={()=>toggleBulk(t.id)} style={{ accentColor:C.orange,cursor:'pointer',width:16,height:16 }}/>
        </td>}
        {onTimerSelect && !bulkMode && <td style={{ ...tdStyle,padding:'8px 4px 8px 12px',width:24,...dimStyle }} onClick={e=>e.stopPropagation()}>
          <button onClick={()=>onTimerSelect(t)}
            title="タイマー" style={{ background:'none',border:'none',cursor:'pointer',color:timerTaskId===t.id?C.orange:C.text3,fontSize:14,padding:'2px 4px',borderRadius:6,fontFamily:'inherit',lineHeight:1 }}
            onMouseEnter={e=>{ e.currentTarget.style.color=C.orange; e.currentTarget.style.background=C.orangeBg; }}
            onMouseLeave={e=>{ e.currentTarget.style.color=timerTaskId===t.id?C.orange:C.text3; e.currentTarget.style.background='none'; }}>
            ⏱
          </button>
        </td>}
        <td style={{ ...tdStyle,cursor:'pointer',background:timerTaskId===t.id?C.orangeBg:undefined,...dimStyle }} onClick={()=>onOpenTask(t)}>
          <div style={{ display:'flex',alignItems:'center',gap:6 }}><PriorityDot priority={t.priority}/>{displayTitle}{t.manual&&<span title="メモあり" style={{ fontSize:9,color:C.blue,background:C.blue+'14',padding:'1px 5px',borderRadius:999 }}>📝</span>}{t.checklist?.length>0&&<span style={{ fontSize:9,color:t.checklist.filter(c=>c.checked).length===t.checklist.length?C.green:C.text3,background:C.cream2,padding:'1px 6px',borderRadius:999 }}>☑ {t.checklist.filter(c=>c.checked).length}/{t.checklist.length}</span>}</div>
        </td>
        <td style={{ ...tdStyle,cursor:'pointer',...dimStyle }} onClick={e=>{ e.stopPropagation(); const next=t.status==='todo'?'doing':t.status==='doing'?'done':t.status==='done'?'skip':t.status==='skip'?'todo':'todo'; onStatusChange(t.id,next); }}
          title="クリックでステータス変更">
          <div style={{ display:'flex',alignItems:'center',gap:4 }}><StatusBadge status={t.status}/><span onClick={e=>{e.stopPropagation();onSave({...t,starred:!t.starred});}} style={{ cursor:'pointer',fontSize:14,color:t.starred?'#d4a020':C.text3+'55',lineHeight:1 }} title="今日やる">{t.starred?'★':'☆'}</span></div>
        </td>
        <td style={{ ...tdStyle,position:'relative',cursor:'pointer',...dimStyle }}
          onClick={e=>{ e.stopPropagation(); setAssigneeOpen(assigneeOpen===t.id?null:t.id); }}>
          {mbs.length>0
            ? <div style={{ display:'flex',alignItems:'center',gap:4,flexWrap:'wrap' }}>
                {mbs.map(m=><Avatar key={m.id} name={m.name} color={m.color} size={22} fs={10} title={m.name}/>)}
                <span style={{ color:C.text3,fontSize:10 }}>▾</span>
              </div>
            : <span style={{ color:C.text3,fontSize:12 }}>未割当 ▾</span>}
          {assigneeOpen===t.id && availMembers.length>0 && (
            <div onClick={e=>e.stopPropagation()} style={{ position:'absolute',top:'100%',left:0,zIndex:200,background:'#fff',border:`1px solid ${C.border}`,borderRadius:10,padding:6,display:'flex',flexDirection:'column',gap:2,minWidth:150,boxShadow:'0 4px 16px rgba(58,53,48,0.15)' }}>
              {availMembers.map(m=>{
                const checked=(t.assigneeIds||[]).includes(m.id);
                return (
                  <label key={m.id} style={{ display:'flex',alignItems:'center',gap:7,padding:'5px 8px',borderRadius:6,cursor:'pointer',background:checked?m.color+'18':'transparent',fontSize:12,color:checked?m.color:C.text }}>
                    <input type="checkbox" checked={checked} onChange={e=>{ e.stopPropagation(); const ids=t.assigneeIds||[]; onSave({...t,assigneeIds:checked?ids.filter(id=>id!==m.id):[...ids,m.id]}); }} style={{ display:'none' }}/>
                    <Avatar name={m.name} color={m.color} size={18} fs={9}/>
                    {m.name}
                    {checked && <span style={{ marginLeft:'auto',fontSize:11,color:m.color }}>✓</span>}
                  </label>
                );
              })}
            </div>
          )}
        </td>
        <td style={{ ...tdStyle,...dimStyle }} onClick={e=>e.stopPropagation()}>
          <input type="date" value={t.due||''} onChange={e=>onSave({...t,due:e.target.value})}
            style={{ border:'none',background:'transparent',color:ds.overdue?ds.bg:t.due?C.text:C.text3,fontSize:11,fontFamily:'inherit',cursor:'pointer',outline:'none',padding:0,fontWeight:ds.overdue?700:400 }}/>
          {ds.overdue && t.status!=='done' && t.status!=='skip' && <div style={{ fontSize:9,color:'#fff',background:ds.bg,borderRadius:999,padding:'1px 5px',marginTop:1,display:'inline-block',fontWeight:600 }}>{ds.overdue}日超過</div>}
          {pj && (pj.eventDate||pj.end) && t.status!=='skip' && (() => {
            const base=pj.eventDate||pj.end;
            const diff=t.due?daysDiff(t.due,base):null;
            const ad=diff!==null?Math.abs(diff):'';
            const dir=diff!==null?(diff<=0?'before':'after'):'before';
            const wv=ad!==''&&ad%7===0?ad/7:'';
            const sign=dir==='before'?-1:1;
            return (
              <div style={{ display:'flex',alignItems:'center',gap:2,marginTop:2 }}>
                <NumInput value={ad} onCommit={n=>{if(n!==''&&n>=0)onSave({...t,due:addDays(base,sign*n)});}}
                  style={{ width:28,border:'none',background:'transparent',color:C.text3,fontSize:10,fontFamily:'inherit',outline:'none',padding:0,textAlign:'right' }}/>
                <span style={{ fontSize:10,color:C.text3 }}>日</span>
                <span style={{ fontSize:10,color:C.text3+'66' }}>/</span>
                <NumInput value={wv} onCommit={n=>{if(n!==''&&n>=0)onSave({...t,due:addDays(base,sign*n*7)});}}
                  style={{ width:22,border:'none',background:'transparent',color:C.text3,fontSize:10,fontFamily:'inherit',outline:'none',padding:0,textAlign:'right' }}/>
                <span style={{ fontSize:10,color:C.text3 }}>週</span>
                <select value={dir} onChange={e=>{if(ad!==''&&ad>0)onSave({...t,due:addDays(base,(e.target.value==='before'?-1:1)*ad)});}}
                  style={{ border:'none',background:'transparent',color:C.text3,fontSize:9,fontFamily:'inherit',outline:'none',padding:0 }}>
                  <option value="before">前</option>
                  <option value="after">後</option>
                </select>
              </div>
            );
          })()}
        </td>
        <td style={{ ...tdStyle,whiteSpace:'nowrap',...dimStyle }} onClick={e=>e.stopPropagation()}>
          <NumInput value={t.estimatedMin||''} step={5} onCommit={n=>onSave({...t,estimatedMin:n||''})}
            style={{ width:40,border:'none',background:'transparent',color:t.estimatedMin?C.text2:C.text3,fontSize:11,fontFamily:'inherit',outline:'none',padding:0,textAlign:'right' }}/>
          {t.estimatedMin ? <span style={{ fontSize:10,color:C.text3 }}>m</span> : null}
        </td>
        <td style={{ ...tdStyle,whiteSpace:'nowrap' }} onClick={e=>e.stopPropagation()}>
          {onDuplicateTask && <button onClick={()=>onDuplicateTask(t)}
            title="複製" style={{ background:'none',border:'none',cursor:'pointer',color:C.text3,fontSize:13,padding:'3px 6px',borderRadius:6,fontFamily:'inherit' }}
            onMouseEnter={e=>{ e.currentTarget.style.color=C.blue; e.currentTarget.style.background=C.blue+'18'; }}
            onMouseLeave={e=>{ e.currentTarget.style.color=C.text3; e.currentTarget.style.background='none'; }}>
            ⧉
          </button>}
          {onCopyTaskToProject && <div style={{ display:'inline-block',position:'relative' }}>
            <button onClick={()=>setCopyToOpen(copyToOpen===t.id?null:t.id)}
              title="他プロジェクトにコピー" style={{ background:'none',border:'none',cursor:'pointer',color:C.text3,fontSize:12,padding:'3px 6px',borderRadius:6,fontFamily:'inherit' }}
              onMouseEnter={e=>{ e.currentTarget.style.color=C.green; e.currentTarget.style.background=C.green+'18'; }}
              onMouseLeave={e=>{ e.currentTarget.style.color=C.text3; e.currentTarget.style.background='none'; }}>
              ➜
            </button>
            {copyToOpen===t.id && <ProjectPickerDropdown projects={orderedProjects} excludeId={t.projectId} onSelect={pid=>{ onCopyTaskToProject(t,pid); setCopyToOpen(null); }}/>}
          </div>}
          <button onClick={()=>{ if(window.confirm('このタスクを削除しますか？')) onDelete(t.id); }}
            style={{ background:'none',border:'none',cursor:'pointer',color:C.text3,fontSize:14,padding:'3px 6px',borderRadius:6,fontFamily:'inherit' }}
            onMouseEnter={e=>{ e.currentTarget.style.color=C.red; e.currentTarget.style.background=C.red+'18'; }}
            onMouseLeave={e=>{ e.currentTarget.style.color=C.text3; e.currentTarget.style.background='none'; }}>
            🗑
          </button>
          <button onClick={()=>onOpenTask(t)}
            title="編集" style={{ padding:'1px 6px',borderRadius:999,border:`1px solid ${C.border}`,background:C.cream2,color:C.text3,cursor:'pointer',fontSize:10,fontFamily:'inherit',lineHeight:1.5 }}
            onMouseEnter={e=>{ e.currentTarget.style.borderColor=C.blue; e.currentTarget.style.color=C.blue; }}
            onMouseLeave={e=>{ e.currentTarget.style.borderColor=C.border; e.currentTarget.style.color=C.text3; }}>
            ✏️
          </button>
        </td>
      </tr>
    );
  };

  return (
    <div style={{ flex:1,overflowY:'auto',padding:'16px 24px' }} onClick={()=>{setAssigneeOpen(null);setCopyCatOpen(null);setBulkAssigneeOpen(false);}}>
      {/* Bulk mode bar */}
      <div style={{ display:'flex',alignItems:'center',gap:8,marginBottom:12,position:'sticky',top:0,zIndex:100,background:C.cream,paddingTop:4,paddingBottom:4 }}>
        {/* Filters */}
        <div style={{ display:'flex',alignItems:'center',gap:4 }}>
          {[['todo','未着手'],['doing','進行中'],['done','完了'],['skip','不要']].map(([k,l])=>(
            <button key={k} onClick={()=>setStatusFilter(statusFilter===k?null:k)}
              style={{ padding:'3px 8px',borderRadius:999,border:`1px solid ${statusFilter===k?C.orange:C.border}`,background:statusFilter===k?C.orange:C.cream,color:statusFilter===k?'#fff':C.text3,cursor:'pointer',fontSize:10,fontFamily:'inherit',fontWeight:statusFilter===k?600:400 }}>{l}</button>
          ))}
        </div>
        <select value={memberFilterLocal||''} onChange={e=>setMemberFilterLocal(e.target.value||null)}
          style={{ padding:'3px 8px',borderRadius:6,border:`1px solid ${memberFilterLocal?C.orange:C.border}`,background:memberFilterLocal?C.orange+'18':'transparent',color:memberFilterLocal?C.text:C.text3,fontSize:10,fontFamily:'inherit',outline:'none' }}>
          <option value="">全メンバー</option>
          <option value="__unassigned__">未割当</option>
          {activeMembers.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
        {(statusFilter||memberFilterLocal) && <span style={{ fontSize:10,color:C.text3 }}>({filtered.length}/{tasks.length}件)</span>}
        {bulkMode && <>
          <div style={{ width:1,height:16,background:C.border,margin:'0 4px' }}/>
          <span style={{ fontSize:10,color:C.text2,fontWeight:600 }}>{bulkIds.size}件選択中</span>
        </>}
        <span style={{ marginLeft:'auto',position:'relative' }}>
          {!bulkMode ? (
            <button onClick={()=>{setBulkMode(true);setBulkIds(new Set());}}
              style={{ padding:'3px 10px',borderRadius:6,border:`1px solid ${C.border}`,background:'transparent',color:C.text3,cursor:'pointer',fontSize:10,fontFamily:'inherit' }}
              onMouseEnter={e=>{e.currentTarget.style.borderColor=C.orange;e.currentTarget.style.color=C.orange;}}
              onMouseLeave={e=>{e.currentTarget.style.borderColor=C.border;e.currentTarget.style.color=C.text3;}}>一括操作</button>
          ) : (
            <button onClick={()=>{setBulkMode(false);setBulkIds(new Set());setBulkAssigneeOpen(false);setBulkCopyOpen(false);setBulkDueOpen(false);}}
              style={{ padding:'3px 10px',borderRadius:6,border:`1px solid ${C.orange}`,background:C.orange,color:'#fff',cursor:'pointer',fontSize:10,fontFamily:'inherit',fontWeight:600 }}>選択終了</button>
          )}
        </span>
      </div>
      {/* Floating bulk action panel — only when selecting */}
      {bulkMode && bulkIds.size > 0 && createPortal(
        <div style={{ position:'fixed',top:320,right:16,zIndex:9000,background:'#fff',borderRadius:12,padding:'10px 16px',display:'flex',flexDirection:'column',alignItems:'stretch',gap:8,boxShadow:'0 4px 20px rgba(58,53,48,0.25)',border:`1px solid ${C.border}`,maxWidth:220 }}>
          <span style={{ fontSize:12,color:C.text2,fontWeight:600 }}>{bulkIds.size}件選択</span>
          <div style={{ position:'relative' }}>
            <button onClick={e=>{e.stopPropagation();setBulkAssigneeOpen(!bulkAssigneeOpen);setBulkDueOpen(false);setBulkCopyOpen(false);}}
              style={{ padding:'5px 14px',borderRadius:6,border:'none',background:C.orange,color:'#fff',cursor:'pointer',fontSize:11,fontFamily:'inherit',fontWeight:600 }}>担当者変更</button>
            {bulkAssigneeOpen && (
              <div onClick={e=>e.stopPropagation()} style={{ position:'absolute',top:'100%',right:0,zIndex:500,background:'#fff',border:`1px solid ${C.border}`,borderRadius:10,padding:8,display:'flex',flexDirection:'column',gap:4,minWidth:180,boxShadow:'0 4px 16px rgba(58,53,48,0.15)',marginTop:4 }}>
                <div style={{ fontSize:10,color:C.text3,fontWeight:600,padding:'2px 6px' }}>担当者を追加/解除</div>
                {activeMembers.map(m=>{
                  const allHave = [...bulkIds].every(id=>{ const t=tasks.find(x=>x.id===id); return (t?.assigneeIds||[]).includes(m.id); });
                  return (
                    <div key={m.id} style={{ display:'flex',alignItems:'center',gap:8,padding:'6px 8px',borderRadius:6,cursor:'pointer',background:allHave?m.color+'18':'transparent' }}
                      onClick={()=>{ allHave ? bulkRemoveAssignee(m.id) : bulkAddAssignee(m.id); }}>
                      <Avatar name={m.name} color={m.color} size={22} fs={10}/>
                      <span style={{ fontSize:12,color:C.text,flex:1 }}>{m.name}</span>
                      {allHave && <span style={{ fontSize:11,color:m.color }}>✓</span>}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          <div style={{ position:'relative' }}>
            <button onClick={e=>{e.stopPropagation();setBulkDueOpen(!bulkDueOpen);setBulkAssigneeOpen(false);setBulkCopyOpen(false);}}
              style={{ padding:'5px 14px',borderRadius:6,border:'none',background:C.blue,color:'#fff',cursor:'pointer',fontSize:11,fontFamily:'inherit',fontWeight:600 }}>期日設定</button>
            {bulkDueOpen && (
              <div onClick={e=>e.stopPropagation()} style={{ position:'absolute',top:'100%',right:0,zIndex:500,background:'#fff',border:`1px solid ${C.border}`,borderRadius:10,padding:12,display:'flex',flexDirection:'column',gap:8,minWidth:220,boxShadow:'0 4px 16px rgba(58,53,48,0.15)',marginTop:4 }}>
                <div style={{ fontSize:10,color:C.text3,fontWeight:600 }}>期日を設定</div>
                <input type="date" value={bulkDueDate} onChange={e=>{setBulkDueDate(e.target.value);setBulkDueDaysBefore('');}}
                  style={{ padding:'5px 8px',border:`1px solid ${C.border}`,borderRadius:6,fontSize:12,fontFamily:'inherit' }}/>
                {(() => { const proj = currentProject || (bulkIds.size>0 ? projects.find(p=>p.id===tasks.find(t=>bulkIds.has(t.id))?.projectId) : null); const base = proj?.eventDate||proj?.end; const sign=bulkDueDir==='before'?-1:1; return base ? (<>
                  <div style={{ display:'flex',alignItems:'center',gap:6,flexWrap:'wrap' }}>
                    <input type="number" min="0" placeholder="N" value={bulkDueDaysBefore}
                      onChange={e=>{const n=parseInt(e.target.value);setBulkDueDaysBefore(e.target.value);if(!isNaN(n)&&n>=0)setBulkDueDate(addDays(base,sign*n));}}
                      style={{ width:46,padding:'5px 6px',border:`1px solid ${C.border}`,borderRadius:6,fontSize:12,fontFamily:'inherit',textAlign:'center' }}/>
                    <span style={{ fontSize:11,color:C.text3 }}>日</span>
                    <span style={{ fontSize:10,color:C.text3+'88' }}>/</span>
                    <input type="number" min="0" placeholder="N"
                      value={bulkDueDaysBefore && parseInt(bulkDueDaysBefore)%7===0 ? parseInt(bulkDueDaysBefore)/7 : ''}
                      onChange={e=>{const n=parseInt(e.target.value);if(!isNaN(n)&&n>=0){setBulkDueDaysBefore(String(n*7));setBulkDueDate(addDays(base,sign*n*7));}}}
                      style={{ width:46,padding:'5px 6px',border:`1px solid ${C.border}`,borderRadius:6,fontSize:12,fontFamily:'inherit',textAlign:'center' }}/>
                    <span style={{ fontSize:11,color:C.text3 }}>週</span>
                    <select value={bulkDueDir} onChange={e=>{setBulkDueDir(e.target.value);const n=parseInt(bulkDueDaysBefore);if(!isNaN(n)&&n>=0)setBulkDueDate(addDays(base,(e.target.value==='before'?-1:1)*n));}}
                      style={{ padding:'4px 6px',border:`1px solid ${C.border}`,borderRadius:6,fontSize:11,fontFamily:'inherit',color:C.text2,outline:'none' }}>
                      <option value="before">前</option>
                      <option value="after">後</option>
                    </select>
                  </div>
                  <div style={{ fontSize:10,color:C.text3 }}>開催日: {base}</div>
                </>) : null; })()}
                <button onClick={()=>{
                  if(!bulkDueDate) return;
                  const updated=tasks.filter(t=>bulkIds.has(t.id)).map(t=>({...t,due:bulkDueDate}));
                  if(updated.length) onSaveBulk(updated);
                  setBulkDueOpen(false);setBulkDueDate('');setBulkDueDaysBefore('');
                }} disabled={!bulkDueDate}
                  style={{ padding:'6px 12px',borderRadius:6,border:'none',background:bulkDueDate?C.blue:C.cream3,color:bulkDueDate?'#fff':C.text3,cursor:bulkDueDate?'pointer':'default',fontSize:12,fontFamily:'inherit',fontWeight:600 }}>
                  {bulkIds.size}件に適用
                </button>
              </div>
            )}
          </div>
          {onCopyTaskToProject && <div style={{ position:'relative' }}>
            <button onClick={e=>{e.stopPropagation();setBulkCopyOpen(!bulkCopyOpen);setBulkAssigneeOpen(false);setBulkDueOpen(false);}}
              style={{ padding:'5px 14px',borderRadius:6,border:'none',background:C.green,color:'#fff',cursor:'pointer',fontSize:11,fontFamily:'inherit',fontWeight:600 }}>コピー</button>
            {bulkCopyOpen && (
              <div style={{ position:'absolute',top:'100%',right:0,marginTop:4 }}>
                <ProjectPickerDropdown projects={orderedProjects} onSelect={pid=>{ const selected=tasks.filter(t=>bulkIds.has(t.id)); onCopyTaskToProject(selected,pid); setBulkCopyOpen(false); setBulkIds(new Set()); setBulkMode(false); }} style={{ left:'auto',right:0 }}/>
              </div>
            )}
          </div>}
          <button onClick={()=>{setBulkMode(false);setBulkIds(new Set());setBulkAssigneeOpen(false);setBulkCopyOpen(false);setBulkDueOpen(false);}}
            style={{ padding:'5px 10px',borderRadius:6,border:`1px solid ${C.border}`,background:'transparent',color:C.text3,cursor:'pointer',fontSize:11,fontFamily:'inherit' }}>✕</button>
        </div>
      , document.body)}
      {categories.map((cat, ci) => {
        const catTasks = catMap.get(cat);
        const color = cat === 'その他' ? C.text3 : (catColorMap[cat] || catColors[0]);
        const allDone = catTasks.length > 0 && catTasks.every(t=>t.status==='done'||t.status==='skip');
        return (
          <div key={cat} style={{ marginBottom:20 }}
            onDragOver={e=>{if(cat==='その他')return;e.preventDefault();setDragOverCat(cat);}}
            onDragLeave={e=>{if(!e.currentTarget.contains(e.relatedTarget))setDragOverCat(null);}}>
            <div style={{ display:'flex',alignItems:'center',gap:8,padding:'10px 0 6px',borderBottom:`2px solid ${dragOverCat===cat?C.orange:color+'44'}`,cursor:'pointer',background:dragCat===cat?C.orangeBg+'88':'transparent',transition:'border-color 0.15s',opacity:allDone?0.45:1 }}
              onClick={()=>toggleCollapse(cat)}>
              {cat!=='その他' && <span draggable
                onDragStart={e=>{setDragCat(cat);e.dataTransfer.effectAllowed='move';}}
                onDragEnd={()=>{
                  if(dragCat && dragOverCat && dragCat!==dragOverCat) {
                    const reorderCats = categories.filter(c=>c!=='その他');
                    const arr = [...reorderCats];
                    const fi = arr.indexOf(dragCat), ti = arr.indexOf(dragOverCat);
                    arr.splice(fi,1); arr.splice(ti,0,dragCat);
                    if(categories.includes('その他')) arr.push('その他');
                    onCatOrderChange(arr);
                  }
                  setDragCat(null);setDragOverCat(null);
                }}
                onClick={e=>e.stopPropagation()}
                style={{ cursor:'grab',fontSize:12,color:C.text3,userSelect:'none',padding:'0 2px',lineHeight:1 }}
                title="ドラッグで並び替え">☰</span>}
              <span style={{ fontSize:10,color:C.text3,width:10,flexShrink:0 }}>{openedCats.has(cat)?'▼':'▶'}</span>
              <div style={{ width:8,height:8,borderRadius:'50%',background:color,flexShrink:0 }}/>
              <span style={{ fontSize:13,fontWeight:600,color:allDone?C.text3:color,textDecoration:allDone?'line-through':'none' }}>{cat}</span>
              <span style={{ fontSize:11,color:C.text3 }}>({catTasks.length})</span>
              {allDone && (
                <span style={{ fontSize:9,padding:'1px 6px',borderRadius:999,background:C.green+'20',color:C.green,border:`1px solid ${C.green}44`,fontWeight:600 }}>完了</span>
              )}
              {/* Member avatars in this category */}
              {(() => {
                const mids = new Set();
                const activeTasks = catTasks.filter(t=>t.status!=='skip');
                const hasUnassigned = activeTasks.some(t=>!(t.assigneeIds||[]).length);
                activeTasks.forEach(t=>(t.assigneeIds||[]).forEach(id=>mids.add(id)));
                const catMembers = [...mids].map(id=>members.find(m=>m.id===id)).filter(Boolean);
                return (catMembers.length > 0 || hasUnassigned) ? (
                  <div style={{ display:'flex',gap:2,marginLeft:4,alignItems:'center' }} onClick={e=>e.stopPropagation()}>
                    {catMembers.map(m=><Avatar key={m.id} name={m.name} color={m.color} size={18} fs={8}/>)}
                    {hasUnassigned && <span style={{ display:'inline-flex',alignItems:'center',justifyContent:'center',width:18,height:18,borderRadius:'50%',background:C.cream3,color:C.text3,fontSize:8,fontWeight:600,border:`1px dashed ${C.border}` }}>?</span>}
                  </div>
                ) : null;
              })()}
              <button onClick={e=>{e.stopPropagation();onAddTask(cat);}} style={{ padding:'0 5px',border:`1px solid ${C.border}`,borderRadius:4,background:'transparent',color:C.text3,cursor:'pointer',fontSize:11,fontFamily:'inherit',lineHeight:1.5 }}
                onMouseEnter={e=>{e.currentTarget.style.borderColor=C.orange;e.currentTarget.style.color=C.orange;}}
                onMouseLeave={e=>{e.currentTarget.style.borderColor=C.border;e.currentTarget.style.color=C.text3;}}>＋</button>
              {cat!=='その他' && onRenameCategory && <button onClick={e=>{e.stopPropagation();
                const newName = window.prompt(`【${cat}】のカテゴリ名を変更`, cat);
                if(newName && newName.trim() && newName.trim()!==cat) onRenameCategory(cat, newName.trim(), catTasks);
              }} style={{ padding:'0 5px',border:`1px solid ${C.border}`,borderRadius:4,background:'transparent',color:C.text3,cursor:'pointer',fontSize:11,fontFamily:'inherit',lineHeight:1.5 }}
                  title="カテゴリ名を一括変更"
                  onMouseEnter={e=>{e.currentTarget.style.borderColor=C.orange;e.currentTarget.style.color=C.orange;}}
                  onMouseLeave={e=>{e.currentTarget.style.borderColor=C.border;e.currentTarget.style.color=C.text3;}}>✏ 名前変更</button>}
              {cat!=='その他' && <button onClick={e=>{e.stopPropagation();if(window.confirm(`【${cat}】のタスク${catTasks.length}件をすべて削除しますか？`)){onDeleteTasks(catTasks.map(t=>t.id));}}} style={{ padding:'0 5px',border:`1px solid ${C.border}`,borderRadius:4,background:'transparent',color:C.text3,cursor:'pointer',fontSize:11,fontFamily:'inherit',lineHeight:1.5 }}
                  title="このカテゴリのタスクを一括削除"
                  onMouseEnter={e=>{e.currentTarget.style.borderColor='#F76E6E';e.currentTarget.style.color='#F76E6E';}}
                  onMouseLeave={e=>{e.currentTarget.style.borderColor=C.border;e.currentTarget.style.color=C.text3;}}>🗑 削除</button>}
              {cat!=='その他' && onCopyCategoryToProject && <span style={{ position:'relative' }}>
                <button onClick={e=>{e.stopPropagation();setCopyCatOpen(copyCatOpen===cat?null:cat);}} style={{ padding:'0 5px',border:`1px solid ${C.border}`,borderRadius:4,background:'transparent',color:C.text3,cursor:'pointer',fontSize:11,fontFamily:'inherit',lineHeight:1.5 }}
                  title="このカテゴリのタスクを他プロジェクトにコピー"
                  onMouseEnter={e=>{e.currentTarget.style.borderColor=C.blue;e.currentTarget.style.color=C.blue;}}
                  onMouseLeave={e=>{e.currentTarget.style.borderColor=C.border;e.currentTarget.style.color=C.text3;}}>📋 コピー</button>
                {copyCatOpen===cat && (
                  <div onClick={e=>e.stopPropagation()} style={{ position:'absolute',top:'100%',left:0,zIndex:300,marginTop:4 }}>
                    <ProjectPickerDropdown projects={orderedProjects} onSelect={pid=>{
                      const pName = orderedProjects.find(p=>p.id===pid)?.name||'';
                      if(window.confirm(`【${cat}】のタスク${catTasks.length}件を「${pName}」にコピーしますか？`)){
                        onCopyCategoryToProject(catTasks, pid);
                        setCopyCatOpen(null);
                      }
                    }} style={{ position:'relative',top:0,right:'auto' }}/>
                  </div>
                )}
              </span>}
              {cat!=='その他' && <span style={{ marginLeft:'auto',display:'flex',gap:2,alignItems:'center' }}>
                {ci===0 && categories.filter(c=>c!=='その他').length>1 && <button onClick={e=>{e.stopPropagation();setCatReorderOpen(true);}} style={{ padding:'0 6px',border:`1px solid ${C.border}`,borderRadius:4,background:C.cream2,color:C.text3,cursor:'pointer',fontSize:10,fontFamily:'inherit',lineHeight:1.6,marginRight:4 }}
                  onMouseEnter={e=>{e.currentTarget.style.borderColor=C.orange;e.currentTarget.style.color=C.orange;}}
                  onMouseLeave={e=>{e.currentTarget.style.borderColor=C.border;e.currentTarget.style.color=C.text3;}}>順番変更</button>}
                <button onClick={e=>{e.stopPropagation();moveCat(cat,-1);}} disabled={ci===0} style={{ padding:'0 4px',border:`1px solid ${C.border}`,borderRadius:4,background:C.cream2,color:ci===0?C.text3+'55':C.text3,cursor:ci===0?'default':'pointer',fontSize:10,fontFamily:'inherit',lineHeight:1.6 }}>▲</button>
                <button onClick={e=>{e.stopPropagation();moveCat(cat,1);}} disabled={ci===categories.length-1||(ci===categories.length-2&&categories[categories.length-1]==='その他')} style={{ padding:'0 4px',border:`1px solid ${C.border}`,borderRadius:4,background:C.cream2,color:(ci>=categories.length-2)?C.text3+'55':C.text3,cursor:(ci>=categories.length-2)?'default':'pointer',fontSize:10,fontFamily:'inherit',lineHeight:1.6 }}>▼</button>
              </span>}
            </div>
            {openedCats.has(cat) && <table style={{ width:'100%',borderCollapse:'collapse' }}>
              <thead><tr>{(bulkMode?['']:(onTimerSelect?['']:[])).concat(['タスク名','ステータス','担当者','期日','目安','']).map((h,i)=>(
                <th key={h||`empty${i}`} style={{...thStyle,...(i===0&&onTimerSelect?{width:24,padding:'8px 4px'}:{})}}>{h}</th>
              ))}</tr></thead>
              <tbody>{catTasks.map(t => renderRow(t))}</tbody>
            </table>}
          </div>
        );
      })}
      {onAddTask && <button onClick={onAddTask} style={{ display:'flex',alignItems:'center',justifyContent:'center',gap:5,width:'100%',padding:'8px',borderRadius:10,border:`1.5px dashed ${C.border2}`,background:'transparent',color:C.text3,cursor:'pointer',fontSize:12,fontFamily:'inherit',transition:'all 0.12s',marginTop:2 }}
        onMouseEnter={e=>{e.currentTarget.style.borderColor=C.orange;e.currentTarget.style.color=C.orange;}}
        onMouseLeave={e=>{e.currentTarget.style.borderColor=C.border2;e.currentTarget.style.color=C.text3;}}>＋ タスク追加</button>}

      {/* Category reorder modal */}
      {catReorderOpen && (() => {
        const reorderCats = categories.filter(c=>c!=='その他');
        return (
          <div style={{ position:'fixed',inset:0,zIndex:5000,display:'flex',alignItems:'center',justifyContent:'center',background:'rgba(0,0,0,0.3)' }} onClick={()=>{setCatReorderOpen(false);setDragCat(null);setDragOverCat(null);}}>
            <div onClick={e=>e.stopPropagation()} style={{ background:'#fff',borderRadius:14,padding:20,minWidth:280,maxWidth:400,maxHeight:'70vh',overflowY:'auto',boxShadow:'0 8px 32px rgba(0,0,0,0.2)',animation:'modal-in 0.15s ease-out' }}>
              <div style={{ fontSize:14,fontWeight:600,color:C.text,marginBottom:12 }}>カテゴリ順番変更</div>
              <div style={{ fontSize:11,color:C.text3,marginBottom:12 }}>ドラッグで並び替え</div>
              {reorderCats.map((cat,i) => (
                <div key={cat}
                  draggable
                  onDragStart={()=>setDragCat(cat)}
                  onDragOver={e=>{e.preventDefault();setDragOverCat(cat);}}
                  onDragEnd={()=>{
                    if(dragCat && dragOverCat && dragCat!==dragOverCat) {
                      const arr = [...reorderCats];
                      const fi = arr.indexOf(dragCat), ti = arr.indexOf(dragOverCat);
                      arr.splice(fi,1); arr.splice(ti,0,dragCat);
                      if(categories.includes('その他')) arr.push('その他');
                      onCatOrderChange(arr);
                    }
                    setDragCat(null);setDragOverCat(null);
                  }}
                  style={{
                    display:'flex',alignItems:'center',gap:10,padding:'10px 12px',marginBottom:4,
                    borderRadius:8,border:`1px solid ${dragOverCat===cat?C.orange:C.border}`,
                    background:dragCat===cat?C.orangeBg:dragOverCat===cat?C.orange+'12':'#fff',
                    cursor:'grab',transition:'all 0.1s',userSelect:'none',
                  }}>
                  <span style={{ color:C.text3,fontSize:14,cursor:'grab' }}>☰</span>
                  <span style={{ fontSize:13,color:C.text,flex:1 }}>{cat}</span>
                  <span style={{ fontSize:10,color:C.text3 }}>({catMap.get(cat)?.length||0})</span>
                </div>
              ))}
              <button onClick={()=>{setCatReorderOpen(false);setDragCat(null);setDragOverCat(null);}}
                style={{ marginTop:12,width:'100%',padding:'8px',borderRadius:8,border:'none',background:C.orange,color:'#fff',cursor:'pointer',fontSize:13,fontFamily:'inherit',fontWeight:600 }}>
                閉じる
              </button>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

// ── Member View ───────────────────────────────────────────────────────────
function MemberView({ tasks, projects, members, memberFilter, onOpenTask, onSave, onStatusChange, isMobile }) {
  const show = (memberFilter==='all' ? members : members.filter(m=>m.id===memberFilter)).filter(m=>!m.closed);
  const [selectedMember, setSelectedMember] = useState(()=>show[0]?.id||null);
  const [sf, setSf] = useState(null);
  const [sortKey, setSortKey] = useState('due');
  if (!show.length) return <div style={{ flex:1,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',color:C.text3,gap:10 }}><div style={{ fontSize:36 }}>👥</div></div>;
  const sel = show.find(m=>m.id===selectedMember) || show[0];
  const mt = tasks.filter(t=>(t.assigneeIds||[]).includes(sel.id));
  const filtered = sf==='starred' ? mt.filter(t=>t.starred) : sf ? mt.filter(t=>t.status===sf) : mt;
  const starCount = mt.filter(t=>t.starred).length;
  const sorted = [...filtered].sort((a,b)=>{
    if(sortKey==='due') return (a.due||'9999').localeCompare(b.due||'9999');
    if(sortKey==='project') { const pa=projects.find(p=>p.id===a.projectId); const pb=projects.find(p=>p.id===b.projectId); const pc=(pa?.name||'').localeCompare(pb?.name||''); return pc!==0?pc:(a.due||'9999').localeCompare(b.due||'9999'); }
    if(sortKey==='status') { const order={todo:0,doing:1,done:2,skip:3}; const sc=(order[a.status]??9)-(order[b.status]??9); return sc!==0?sc:(a.due||'9999').localeCompare(b.due||'9999'); }
    return 0;
  });
  const todoCount=mt.filter(t=>t.status==='todo').length;
  const doingCount=mt.filter(t=>t.status==='doing').length;
  const doneCount=mt.filter(t=>t.status==='done').length;
  const sBtnStyle=(st,color,active)=>({ fontSize:11,color:active?'#fff':color,cursor:'pointer',padding:'3px 10px',borderRadius:999,border:'none',background:active?color:'transparent',fontFamily:'inherit',fontWeight:active?700:400,transition:'all 0.12s' });
  const thStyle={ textAlign:'left',fontSize:10,fontWeight:600,color:C.text3,letterSpacing:0.5,padding:'8px 12px',borderBottom:`1px solid ${C.border}`,whiteSpace:'nowrap' };
  const td={ padding:'8px 12px',borderBottom:`1px solid ${C.border}`,verticalAlign:'middle' };
  return (
    <div style={{ flex:1,display:'flex',flexDirection:'column',overflow:'hidden' }}>
      {/* Member tabs */}
      <div className="nb-tabs" style={{ display:'flex',alignItems:'center',gap:0,borderBottom:`1px solid ${C.border}`,padding:'0 16px',flexShrink:0,overflowX:'auto',WebkitOverflowScrolling:'touch' }}>
        {show.map(m=>{
          const active=sel.id===m.id;
          const mCount=tasks.filter(t=>(t.assigneeIds||[]).includes(m.id)).length;
          return (
            <button key={m.id} onClick={()=>{setSelectedMember(m.id);setSf(null);}} style={{
              display:'flex',alignItems:'center',gap:6,padding:'10px 16px',border:'none',borderBottom:active?`2px solid ${m.color}`:'2px solid transparent',
              background:'transparent',cursor:'pointer',fontFamily:'inherit',fontSize:12,fontWeight:active?600:400,
              color:active?m.color:C.text2,transition:'all 0.15s',whiteSpace:'nowrap',
            }}>
              <Avatar name={m.name} color={m.color} size={20} fs={9}/>
              {m.name}
              <span style={{ fontSize:10,color:active?m.color:C.text3,opacity:0.7 }}>{mCount}</span>
            </button>
          );
        })}
      </div>
      {/* Status filter + sort bar */}
      <div style={{ display:'flex',alignItems:'center',gap:6,padding:'10px 20px',flexShrink:0,flexWrap:'wrap' }}>
        <span style={{ fontSize:12,color:C.text2,fontWeight:600 }}>{sel.name}</span>
        <span style={{ fontSize:11,color:C.text3 }}>— {mt.length}件</span>
        <div style={{ display:'flex',gap:3,marginLeft:8 }}>
          <button onClick={()=>setSf(sf==='starred'?null:'starred')} style={sBtnStyle('starred','#b8860b',sf==='starred')}>★ 今日やる {starCount}</button>
          <button onClick={()=>setSf(sf==='todo'?null:'todo')} style={sBtnStyle('todo',C.text2,sf==='todo')}>未着手 {todoCount}</button>
          <button onClick={()=>setSf(sf==='doing'?null:'doing')} style={sBtnStyle('doing',C.blue,sf==='doing')}>進行中 {doingCount}</button>
          <button onClick={()=>setSf(sf==='done'?null:'done')} style={sBtnStyle('done',C.green,sf==='done')}>完了 {doneCount}</button>
        </div>
        <div style={{ marginLeft:'auto',display:'flex',alignItems:'center',gap:4 }}>
          <span style={{ fontSize:10,color:C.text3 }}>並替:</span>
          {[['due','期日順'],['project','PJ順'],['status','状態順']].map(([k,l])=>(
            <button key={k} onClick={()=>setSortKey(k)} style={{ fontSize:10,padding:'2px 8px',borderRadius:999,border:`1px solid ${sortKey===k?C.orange:C.border}`,background:sortKey===k?C.orangeBg:'transparent',color:sortKey===k?C.orange:C.text3,cursor:'pointer',fontFamily:'inherit',fontWeight:sortKey===k?600:400 }}>{l}</button>
          ))}
        </div>
      </div>
      {/* Task table */}
      <div style={{ flex:1,overflowY:'auto',padding:'0 20px 20px' }}>
        {filtered.length===0 ? <div style={{ padding:'20px 0',color:C.text3,fontSize:12,textAlign:'center' }}>{sf?'該当タスクなし':'タスクなし'}</div>
          : <div style={{ display:'flex',flexDirection:'column',gap:0 }}>
            {sorted.map(t=>{
              const pj=projects.find(p=>p.id===t.projectId);
              const ds=getDueStyle(t.due);
              const isSkip=t.status==='skip';
              return (
                <div key={t.id} onClick={()=>onOpenTask(t)} style={{ display:'inline-flex',alignItems:'center',gap:12,padding:'8px 12px',borderBottom:`1px solid ${C.border}`,cursor:'pointer',transition:'background 0.1s',...(isSkip?{opacity:0.4}:{}) }}
                  onMouseEnter={e=>e.currentTarget.style.background=C.cream2}
                  onMouseLeave={e=>e.currentTarget.style.background=''}>
                  <div style={{ minWidth:0 }}>
                    {pj && <div style={{ fontSize:10,color:pj.color,display:'flex',alignItems:'center',gap:4,marginBottom:2 }}><span style={{ width:6,height:6,borderRadius:'50%',background:pj.color,flexShrink:0 }}/>{pj.name}</div>}
                    <div style={{ fontSize:13,color:C.text,fontWeight:500 }}>{t.title}</div>
                  </div>
                  <div style={{ display:'flex',alignItems:'center',gap:4 }} onClick={e=>e.stopPropagation()}>
                    <select value={t.status} onChange={e=>{if(onStatusChange) onStatusChange(t.id,e.target.value);}} style={{ fontSize:11,padding:'2px 4px',borderRadius:6,border:`1px solid ${C.border}`,background:'#fff',color:C.text,fontFamily:'inherit',cursor:'pointer' }}>
                      <option value="todo">未着手</option><option value="doing">進行中</option><option value="done">完了</option><option value="skip">今回不要</option>
                    </select>
                    {onSave&&<span onClick={()=>onSave({...t,starred:!t.starred})} style={{ cursor:'pointer',fontSize:14,color:t.starred?'#d4a020':C.text3+'55',lineHeight:1 }} title="今日やる">{t.starred?'★':'☆'}</span>}
                  </div>
                  {t.due && <span style={{ fontSize:10,padding:'2px 6px',borderRadius:999,background:ds.bg,color:ds.color,border:`1px solid ${ds.border}`,whiteSpace:'nowrap',flexShrink:0 }}>{fmtDate(t.due)}{ds.overdue && !isSkip?` +${ds.overdue}d`:''}</span>}
                </div>
              );
            })}
          </div>}
      </div>
    </div>
  );
}

// ── Calendar View ─────────────────────────────────────────────────────────
function CalendarView({ tasks, projects, members, onOpenTask }) {
  const today = new Date(); today.setHours(0,0,0,0);
  const todayStr = today.toISOString().slice(0,10);
  const [currentMonth, setCurrentMonth] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedDate, setSelectedDate] = useState(null);

  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const prevMonth = () => setCurrentMonth(new Date(year, month - 1, 1));
  const nextMonth = () => setCurrentMonth(new Date(year, month + 1, 1));
  const goToday = () => { setCurrentMonth(new Date(today.getFullYear(), today.getMonth(), 1)); setSelectedDate(todayStr); };

  // Build map: date string -> tasks
  const tasksByDate = {};
  tasks.forEach(t => {
    if (!t.due) return;
    if (!tasksByDate[t.due]) tasksByDate[t.due] = [];
    tasksByDate[t.due].push(t);
  });

  const cells = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    cells.push(dateStr);
  }

  const selectedTasks = selectedDate && tasksByDate[selectedDate] ? tasksByDate[selectedDate] : [];

  return (
    <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden' }}>
      <div style={{ flex:1, overflow:'auto', padding:'16px 24px' }}>
        {/* Month navigation */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:16, marginBottom:16 }}>
          <button onClick={prevMonth} style={{ background:'none', border:`1px solid ${C.border}`, borderRadius:8, cursor:'pointer', padding:'4px 12px', fontSize:16, color:C.text2, fontFamily:'inherit' }}>‹</button>
          <div style={{ fontSize:16, fontWeight:600, color:C.text, minWidth:140, textAlign:'center' }}>{year}年{month+1}月</div>
          <button onClick={nextMonth} style={{ background:'none', border:`1px solid ${C.border}`, borderRadius:8, cursor:'pointer', padding:'4px 12px', fontSize:16, color:C.text2, fontFamily:'inherit' }}>›</button>
          <button onClick={goToday} style={{ background:'none', border:`1px solid ${C.orange}`, borderRadius:8, cursor:'pointer', padding:'4px 10px', fontSize:11, color:C.orange, fontFamily:'inherit' }}>今日</button>
        </div>
        {/* Day headers */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:2, marginBottom:2 }}>
          {['日','月','火','水','木','金','土'].map((d,i) => (
            <div key={d} style={{ textAlign:'center', fontSize:11, fontWeight:600, color:i===0?'#b85050':i===6?'#5878a0':C.text3, padding:'4px 0' }}>{d}</div>
          ))}
        </div>
        {/* Calendar grid */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:2 }}>
          {cells.map((dateStr, i) => {
            if (!dateStr) return <div key={`empty-${i}`} />;
            const day = parseInt(dateStr.slice(-2));
            const dayOfWeek = new Date(dateStr).getDay();
            const dateTasks = tasksByDate[dateStr] || [];
            const hasTasks = dateTasks.length > 0;
            const hasIncomplete = dateTasks.some(t => t.status !== 'done');
            const isToday = dateStr === todayStr;
            const isSelected = dateStr === selectedDate;
            const isOverdue = hasTasks && dateTasks.some(t => t.status !== 'done' && new Date(dateStr) < today);

            let bg = '#fff';
            let border = C.border;
            let numColor = dayOfWeek === 0 ? '#b85050' : dayOfWeek === 6 ? '#5878a0' : C.text;
            if (isSelected) { bg = C.orangeBg; border = C.orange; }
            else if (isToday) { bg = '#f0f8ff'; border = '#5878a0'; }

            return (
              <div key={dateStr} onClick={() => setSelectedDate(dateStr === selectedDate ? null : dateStr)}
                style={{ minHeight:60, padding:'4px 6px', background:bg, border:`1.5px solid ${border}`, borderRadius:8, cursor:hasTasks?'pointer':'default', transition:'all 0.12s', position:'relative' }}
                onMouseEnter={e=>{ if(hasTasks){e.currentTarget.style.borderColor=C.orange;e.currentTarget.style.background=C.orangeBg;} }}
                onMouseLeave={e=>{ e.currentTarget.style.borderColor=isSelected?C.orange:isToday?'#5878a0':C.border; e.currentTarget.style.background=isSelected?C.orangeBg:isToday?'#f0f8ff':'#fff'; }}>
                <div style={{ fontSize:13, fontWeight:isToday?700:400, color:isToday?'#5878a0':numColor, textAlign:'right' }}>
                  {isToday ? <span style={{ background:'#5878a0', color:'#fff', borderRadius:999, padding:'1px 6px', fontSize:12 }}>{day}</span> : day}
                </div>
                {hasTasks && (
                  <div style={{ display:'flex', gap:3, flexWrap:'wrap', marginTop:2 }}>
                    {isOverdue && <span style={{ width:7, height:7, borderRadius:'50%', background:'#b85050', flexShrink:0 }} title="期限切れあり" />}
                    {hasIncomplete && !isOverdue && <span style={{ width:7, height:7, borderRadius:'50%', background:C.orange, flexShrink:0 }} title="未完了あり" />}
                    {!hasIncomplete && <span style={{ width:7, height:7, borderRadius:'50%', background:C.green, flexShrink:0 }} title="すべて完了" />}
                    <span style={{ fontSize:10, color:C.text3 }}>{dateTasks.length}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {/* Selected date tasks */}
        {selectedDate && (
          <div style={{ marginTop:16, borderTop:`1px solid ${C.border}`, paddingTop:12 }}>
            <div style={{ fontSize:13, fontWeight:600, color:C.text, marginBottom:10 }}>
              {(() => { const [,m,d] = selectedDate.split('-'); return `${parseInt(m)}月${parseInt(d)}日`; })()}のタスク
              {selectedTasks.length === 0 && <span style={{ fontWeight:400, color:C.text3, marginLeft:8 }}>なし</span>}
            </div>
            {selectedTasks.map(t => {
              const proj = projects.find(p => p.id === t.projectId);
              const assignees = (t.assigneeIds || []).map(id => members.find(m => m.id === id)?.name).filter(Boolean);
              const isDone = t.status === 'done';
              const ds = getDueStyle(t.due);
              return (
                <div key={t.id} onClick={() => onOpenTask(t)}
                  style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 14px', marginBottom:4, background:'#fff', border:`1px solid ${C.border}`, borderRadius:10, cursor:'pointer', transition:'all 0.12s', opacity:isDone?0.6:1 }}
                  onMouseEnter={e=>{ e.currentTarget.style.borderColor=C.orange; e.currentTarget.style.boxShadow='0 2px 8px rgba(224,120,64,0.10)'; }}
                  onMouseLeave={e=>{ e.currentTarget.style.borderColor=C.border; e.currentTarget.style.boxShadow='none'; }}>
                  <span style={{ fontSize:14, flexShrink:0 }}>{isDone?'✅':t.status==='progress'?'🔵':'⬜'}</span>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:13, fontWeight:500, color:C.text, textDecoration:isDone?'line-through':'none', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{t.starred&&<span style={{ color:'#d4a020',marginRight:3 }}>★</span>}{t.title}</div>
                    <div style={{ display:'flex', gap:8, marginTop:2, fontSize:11, color:C.text3 }}>
                      {proj && <span style={{ color:C.text2 }}>{proj.name}</span>}
                      {assignees.length > 0 && <span>👤 {assignees.join(', ')}</span>}
                    </div>
                  </div>
                  {!isDone && ds.bg !== 'transparent' && (
                    <span style={{ fontSize:10, padding:'2px 8px', borderRadius:999, background:ds.bg, color:ds.color, border:`1px solid ${ds.border}`, whiteSpace:'nowrap', flexShrink:0 }}>
                      {ds.overdue ? `${ds.overdue}日超過` : fmtDate(t.due)}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ── App ───────────────────────────────────────────────────────────────────
function Workflow() {
  const [data, setData] = useState(()=>loadData());
  const [tab, setTab] = useState('tasks');
  const [projFilter, setProjFilter] = useState(() => { try { return localStorage.getItem('wf_projFilter') || 'all'; } catch { return 'all'; } });
  const setProjFilterSaved = (v) => { setProjFilter(v); try { localStorage.setItem('wf_projFilter', v); } catch {} };
  const [view, setView] = useState(()=>{ try { return localStorage.getItem('wf_view')||'kanban'; } catch { return 'kanban'; } });
  const [memberFilter, setMemberFilter] = useState('all');
  const isDev = window.location.hostname.includes('-dev');
  const { isAdmin, memberId: authMemberId, displayName: authDisplayName } = useAuth();
  const isTsuge = isDev ? isAdmin : true;
  const myMemberId = authMemberId;
  useEffect(() => {
    if (authMemberId) { try { localStorage.setItem('wf_myMemberId', authMemberId); } catch {} }
  }, [authMemberId]);
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [closedProjOpen, setClosedProjOpen] = useState(false);
  const [bulkCloseMode, setBulkCloseMode] = useState(false);
  const [bulkCloseIds, setBulkCloseIds] = useState(new Set());
  const [openMonths, setOpenMonths] = useState(()=>{ const m=new Date().toISOString().slice(0,7); return {event:{[m]:true},other:{[m]:true},closed:{}}; });
  const toggleMonth = (section,month)=>setOpenMonths(prev=>({...prev,[section]:{...prev[section],[month]:!prev[section][month]}}));
  const [timerTask, setTimerTask] = useState(null);
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  // 他タブ（eventstaff-shift等）でlocalStorage変更があったら即反映
  useEffect(() => {
    const handler = (e) => {
      if (e.key === KEY) {
        console.log('[storage event] data overwritten by other tab');
        setGasFetchDebug(prev => prev + ' | STORAGE_OVERWRITE');
        setData(loadData());
      }
    };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }, []);

  // ── Event Staff data ──
  const [esEvents, setEsEvents] = useState(() => { try { return JSON.parse(localStorage.getItem('staff_mgmt_events')) || []; } catch { return []; } });
  const [esStaffs, setEsStaffs] = useState(() => { try { return JSON.parse(localStorage.getItem('staff_mgmt_staffs')) || []; } catch { return []; } });
  const [staffRoles, setStaffRoles] = useState(() => { try { return JSON.parse(localStorage.getItem('wf_staff_roles')) || {}; } catch { return {}; } });
  const [staffOrder, setStaffOrder] = useState(() => { try { return JSON.parse(localStorage.getItem('wf_staff_order')) || {}; } catch { return {}; } });
  useEffect(() => { try { localStorage.setItem('wf_staff_roles', JSON.stringify(staffRoles)); } catch {} }, [staffRoles]);
  useEffect(() => { try { localStorage.setItem('wf_staff_order', JSON.stringify(staffOrder)); } catch {} }, [staffOrder]);
  const [dragStaff, setDragStaff] = useState(null);
  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'staff_mgmt_events') { try { setEsEvents(JSON.parse(e.newValue) || []); } catch {} }
      if (e.key === 'staff_mgmt_staffs') { try { setEsStaffs(JSON.parse(e.newValue) || []); } catch {} }
    };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }, []);
  function getConfirmedStaff(projectId) {
    if (!String(projectId).startsWith('es_ev_')) return [];
    const evId = String(projectId).replace('es_ev_', '');
    const ev = esEvents.find(e => String(e.id) === evId);
    if (!ev || !ev.staffAssignments) return [];
    return ev.staffAssignments
      .filter(a => a.status === 'confirmed' || a.status === 'worked' || a.status === 'leader')
      .map(a => {
        const s = esStaffs.find(x => String(x.id) === String(a.staffId));
        return { staffId: a.staffId, name: s?.name || '?', status: a.status, isLeader: a.isLeader };
      });
  }
  function getConfirmedMakers(projectId) {
    if (!String(projectId).startsWith('es_ev_')) return [];
    const evId = String(projectId).replace('es_ev_', '');
    const ev = esEvents.find(e => String(e.id) === evId);
    if (!ev || !ev.makers || !ev.makers.length) return [];
    const presence = ev.makerAttendance?.presence || {};
    return ev.makers
      .filter(name => presence[name] === 'confirmed')
      .map(name => ({ name }));
  }

  const [taskModal, setTaskModal] = useState({ open:false, data:null, defaultStatus:'todo' });
  const [projModal, setProjModal] = useState({ open:false, data:null, defaultType:null });
  const [memberModal, setMemberModal] = useState(false);
  const [pinModal, setPinModal] = useState({ open:false, mode:'unlock' });
  const [dupModal, setDupModal] = useState({ open:false, project:null });
  const [copyTasksModal, setCopyTasksModal] = useState(false);
  const [taskOrder, setTaskOrder] = useState(() => { try { const v = localStorage.getItem('wf_taskOrder'); return v ? JSON.parse(v) : {}; } catch { return {}; } });

  // ── GAS Sync ────────────────────────────────────────────────────────────
  const WF_GAS_DEFAULT = 'https://script.google.com/macros/s/AKfycbyZ1OwbcqN5fBECUSyXDuv51_35S1fBz7C3Z6UyXN86nuQ73GYkPn9qgJwaLi0WwZE-/exec';
  const [wfGasUrl, setWfGasUrl] = useState(() => { try { return localStorage.getItem('wf_gasUrl') || WF_GAS_DEFAULT; } catch { return WF_GAS_DEFAULT; } });
  // FirebaseからWorkflow GAS URLを取得（管理者が設定した共有URL）
  useEffect(() => {
    import("firebase/database").then(({ ref: fbRef, onValue })=>{
      import("./firebase").then(({ db: fbDb })=>{
        if (!fbDb) return;
        const unsub = onValue(fbRef(fbDb, "config/wfGasUrl"), (snap)=>{
          const url = snap.val();
          if (url) { setWfGasUrl(url); try { localStorage.setItem('wf_gasUrl', url); } catch {} }
        });
        return ()=>unsub();
      });
    });
  }, []);
  const [syncStatus, setSyncStatus] = useState('');
  const [lastSyncedAt, setLastSyncedAt] = useState(null);
  const syncVersionRef = useRef(0);
  const localDirtyRef = useRef(false); // ローカルに未push変更があるか
  const pushFailCountRef = useRef(0);  // push連続失敗回数
  const [pushFailed, setPushFailed] = useState(false); // UI警告用
  const pushTimerRef = useRef(null);
  const schedulePushRef = useRef(null);
  const wfGasUrlRef = useRef(wfGasUrl);
  useEffect(() => { wfGasUrlRef.current = wfGasUrl; }, [wfGasUrl]);

  const [gasFetchDebug, setGasFetchDebug] = useState('未取得');
  const fetchFromGAS = useCallback(async (url) => {
    try {
      setGasFetchDebug('取得中...');
      const res = await fetch(`${url}?action=getWorkflowData&_t=${Date.now()}&_r=${Math.random()}`, { cache:'no-store', headers:{'Cache-Control':'no-cache'} });
      const json = await res.json();
      if (json.ok) {
        setLastSyncedAt(new Date());
        if (json.data && json.version >= syncVersionRef.current) {
          const merged = json.data;
          // データ同期: 未pushの変更がある場合はリモートで上書きしない
          setData(prev => {
            const localTasks = prev?.tasks?.length || 0;
            const remoteTasks = (merged.tasks||[]).length;
            // 未pushのローカル変更がある場合、リモートで上書きしない（ローカルを優先してpushを再試行）
            if (localDirtyRef.current) {
              setGasFetchDebug(`BLOCKED(dirty): push未完了のためリモート拒否 L=${localTasks} R=${remoteTasks}`);
              if (prev) schedulePushRef.current?.(prev);
              return prev;
            }
            // pushは完了しているが、リモートが大幅に少ない場合もブロック（安全策）
            if (localTasks > 0 && remoteTasks < localTasks && (localTasks - remoteTasks) >= 3) {
              setGasFetchDebug(`BLOCKED: local=${localTasks} > remote=${remoteTasks} (${localTasks-remoteTasks}件減少を阻止)`);
              if (prev) schedulePushRef.current?.(prev);
              return prev;
            }
            // 同じバージョンかつタスク数も同じならスキップ
            if (json.version === syncVersionRef.current && remoteTasks === localTasks) {
              setGasFetchDebug(`same v${json.version} T:${remoteTasks}`);
              return prev;
            }
            syncVersionRef.current = json.version;
            if (prev?.catOrder && !merged.catOrder) merged.catOrder = prev.catOrder;
            saveData(merged);
            setGasFetchDebug(`OK P:${(merged.projects||[]).length} T:${(merged.tasks||[]).length}`);
            return merged;
          });
        }
      } else {
        setGasFetchDebug(`NG: ${JSON.stringify(json).slice(0,50)}`);
      }
    } catch (e) { setGasFetchDebug(`ERR: ${e.message}`); }
  }, []);

  useEffect(() => {
    if (wfGasUrl) fetchFromGAS(wfGasUrl);
  }, [wfGasUrl, fetchFromGAS]);

  useEffect(() => {
    if (!wfGasUrl) return;
    const id = setInterval(() => fetchFromGAS(wfGasUrl), 20000);
    return () => clearInterval(id);
  }, [wfGasUrl, fetchFromGAS]);

  function schedulePush(d) {
    if (!isTsuge) return;
    const url = wfGasUrlRef.current;
    if (!url) return;
    clearTimeout(pushTimerRef.current);
    localDirtyRef.current = true;
    setSyncStatus('pending');
    pushTimerRef.current = setTimeout(() => attemptPush(url, d, 0), 1500);
  }

  async function attemptPush(url, d, retryCount) {
    setSyncStatus('syncing');
    try {
      const res = await fetch(url, { method: 'POST', body: JSON.stringify({ action: 'saveWorkflowData', data: d }) });
      const json = await res.json();
      if (json.ok) {
        syncVersionRef.current = json.version;
        localDirtyRef.current = false;
        pushFailCountRef.current = 0;
        setPushFailed(false);
        setLastSyncedAt(new Date());
        setSyncStatus('synced');
        setTimeout(() => setSyncStatus(''), 3000);
      } else {
        handlePushFail(url, d, retryCount);
      }
    } catch {
      handlePushFail(url, d, retryCount);
    }
  }

  function handlePushFail(url, d, retryCount) {
    pushFailCountRef.current += 1;
    if (retryCount < 3) {
      // 5秒、15秒、45秒で自動リトライ
      const delay = 5000 * Math.pow(3, retryCount);
      setSyncStatus(`retry ${retryCount + 1}/3...`);
      setTimeout(() => attemptPush(url, d, retryCount + 1), delay);
    } else {
      setSyncStatus('error');
      setPushFailed(true);
      // ローカルバックアップを追加保存
      try { localStorage.setItem('kodawarin_tasks_backup', localStorage.getItem('kodawarin_tasks')); } catch {}
    }
  }
  schedulePushRef.current = schedulePush;

  // ページを閉じる前に未保存データがあれば警告
  useEffect(() => {
    const handler = (e) => {
      if (localDirtyRef.current) {
        e.preventDefault();
        e.returnValue = 'サーバーに保存されていない変更があります。';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, []);

  const updateRef = useRef(null);
  updateRef.current = (d) => { setData(d); saveData(d); schedulePush(d); };
  function update(d) { updateRef.current(d); }


  // ── Mutations ──────────────────────────────────────────────────────────
  function saveTask(t) {
    const existing = data.tasks.find(x=>x.id===t.id);
    let taskToSave = t;
    if (existing && existing.status !== 'done' && t.status === 'done') {
      taskToSave = { ...t, doneAt: new Date().toISOString().slice(0,10) };
    } else if (existing && t.status !== 'done') {
      const { doneAt:_, ...rest } = t;
      taskToSave = rest;
    }
    // new task with status='done' → no doneAt (per spec)
    const tasks = existing ? data.tasks.map(x=>x.id===t.id?taskToSave:x) : [...data.tasks, taskToSave];
    update({ ...data, tasks });
  }
  function deleteTask(id) { update({ ...data, tasks:data.tasks.filter(t=>t.id!==id) }); }
  function deleteTasks(ids) { const s=new Set(ids); update({ ...data, tasks:data.tasks.filter(t=>!s.has(t.id)) }); }
  function saveBulkTasks(updatedTasks) {
    const map = new Map(updatedTasks.map(t=>[t.id,t]));
    update({ ...data, tasks:data.tasks.map(t=>map.has(t.id)?map.get(t.id):t) });
  }
  function changeStatus(id, status) {
    if (status==='__delete__') { deleteTask(id); return; }
    update({ ...data, tasks:data.tasks.map(t=>{
      if (t.id!==id) return t;
      if (status==='done' && t.status!=='done') return { ...t, status, doneAt:new Date().toISOString().slice(0,10) };
      if (status!=='done') { const { doneAt:_, ...rest } = { ...t, status }; return rest; }
      return { ...t, status };
    })});
  }

  function reorderTask(colKey, draggedId, overId) {
    setTaskOrder(prev => {
      const colTasks = data.tasks.filter(t => t.status === colKey).map(t => t.id);
      const base = prev[colKey] ? prev[colKey].filter(id => colTasks.includes(id)) : colTasks;
      const missing = colTasks.filter(id => !base.includes(id));
      const ids = [...base, ...missing];
      const fromIdx = ids.indexOf(draggedId);
      const toIdx = ids.indexOf(overId);
      if (fromIdx === -1 || toIdx === -1) return prev;
      const next = [...ids];
      next.splice(fromIdx, 1);
      next.splice(toIdx, 0, draggedId);
      const updated = { ...prev, [colKey]: next };
      try { localStorage.setItem('wf_taskOrder', JSON.stringify(updated)); } catch {}
      return updated;
    });
  }

  function saveProject(p) {
    const old = data.projects.find(x=>x.id===p.id);
    const projects = old ? data.projects.map(x=>x.id===p.id?p:x) : [...data.projects,p];
    update({ ...data, projects });
    if (old && old.name !== p.name) {
      try {
        const tsLogs = JSON.parse(localStorage.getItem('wl_logs') || '[]');
        const updated = tsLogs.map(l => l.project === old.name ? { ...l, project: p.name } : l);
        localStorage.setItem('wl_logs', JSON.stringify(updated));
        const tsProjects = JSON.parse(localStorage.getItem('wl_projects') || '[]');
        const updatedProjects = tsProjects.map(n => n === old.name ? p.name : n);
        localStorage.setItem('wl_projects', JSON.stringify(updatedProjects));
      } catch {}
    }
  }
  function deleteProject(id) {
    if(projFilter===id) setProjFilterSaved('all');
    update({ ...data, projects:data.projects.filter(p=>p.id!==id), tasks:data.tasks.filter(t=>t.projectId!==id) });
  }
  function saveMember(m) { update({ ...data, members:[...data.members,m] }); }
  function updateMember(id, updates) { update({ ...data, members:data.members.map(m=>m.id===id?{...m,...updates}:m) }); }
  function deleteMember(id) {
    update({ ...data, members:data.members.filter(m=>m.id!==id), tasks:data.tasks.map(t=>({...t,assigneeIds:(t.assigneeIds||[]).filter(aid=>aid!==id)})) });
  }

  function doDuplicate({ project, newDate, newName, color, venue, content }) {
    const base = project.end||project.eventDate||'';
    const newId = genId();
    const newProj = { ...project, id:newId, name:newName, color,
      ...(project.type==='event' ? { eventDate:newDate, start:newDate, end:newDate, venue:venue??project.venue, content:content??project.content } : {}),
    };
    const newTasks = data.tasks
      .filter(t=>t.projectId===project.id)
      .map(t=>{
        let due = t.due;
        if (due && base && newDate) {
          const offset = daysDiff(t.due, base);
          due = addDays(newDate, offset);
        }
        return { ...t, id:genId(), projectId:newId, status:'todo', due };
      });
    update({ ...data, projects:[...data.projects,newProj], tasks:[...data.tasks,...newTasks] });
  }

  // ── Event Calendar Sync ──────────────────────────────────────────────────
  useEffect(() => {
    const calGasUrl = (() => { try { const v = localStorage.getItem('wl_calGasUrl'); if (!v) return ''; try { return JSON.parse(v); } catch { return v; } } catch { return ''; } })();
    if (!calGasUrl) return;
    const events = data.projects
      .filter(p => p.type === 'event' && p.eventDate && !p.closed)
      .map(p => ({ name: p.name, date: p.eventDate }));
    if (!events.length) return;
    fetch(calGasUrl, { method: 'POST', body: JSON.stringify({ action: 'syncEventDates', events }), redirect: 'follow' }).catch(() => {});
  }, [data.projects]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Google Calendar Sync ─────────────────────────────────────────────────
  useEffect(() => {
    if (!myMemberId) return;
    const calGasUrl = (() => { try { const v = localStorage.getItem('wl_calGasUrl'); if (!v) return ''; try { return JSON.parse(v); } catch { return v; } } catch { return ''; } })();
    if (!calGasUrl) return;
    const myTasks = data.tasks.filter(t =>
      (t.assigneeIds||[]).includes(myMemberId) && t.due && t.status !== 'done'
    ).map(t => ({
      title: t.title,
      due: t.due,
      project: data.projects.find(p=>p.id===t.projectId)?.name || '',
    }));
    if (!myTasks.length) return;
    fetch(calGasUrl, { method:'POST', body:JSON.stringify({ action:'syncCalendar', tasks:myTasks }), redirect:'follow' }).catch(()=>{});
  }, [data, myMemberId]);

  useEffect(() => {
    const payload = {
      source:'kodawarin_task_manager', exportedAt:new Date().toISOString(),
      tasks: data.tasks.map(t=>{
        const pj=data.projects.find(p=>p.id===t.projectId);
        const assigneeNames=(t.assigneeIds||[]).map(id=>data.members.find(m=>m.id===id)?.name).filter(Boolean);
        const relLabel = pj&&t.due ? getRelLabel(pj,t.due) : null;
        return { ...t, project:pj?.name||'', assignee:assigneeNames.join(', '), relativeToEvent:relLabel };
      }),
      members:data.members, projects:data.projects,
    };
    localStorage.setItem('kodawarin_plan_tasks', JSON.stringify(payload));
  }, [data]);

  function duplicateTask(t) {
    const newTask = { ...t, id:genId(), title:t.title+' (コピー)', status:'todo', checklist:(t.checklist||[]).map(c=>({...c,id:genId(),checked:false})) };
    update({ ...data, tasks:[...data.tasks, newTask] });
  }

  function copyTaskToProject(tasksOrTask, targetProjectId) {
    const arr = Array.isArray(tasksOrTask) ? tasksOrTask : [tasksOrTask];
    const newTasks = arr.map(t=>({ ...t, id:genId(), projectId:targetProjectId, status:'todo', checklist:(t.checklist||[]).map(c=>({...c,id:genId(),checked:false})) }));
    update({ ...data, tasks:[...data.tasks, ...newTasks] });
  }

  function copyCategoryToProject(categoryTasks, targetProjectId) {
    const targetProj = data.projects.find(p=>p.id===targetProjectId);
    if (!targetProj) return;
    const newTasks = categoryTasks.map(t => ({
      ...t, id:genId(), projectId:targetProjectId, status:'todo', due:'', doneAt:undefined,
      checklist:(t.checklist||[]).map(c=>({...c,id:genId(),checked:false})),
    }));
    update({ ...data, tasks:[...data.tasks, ...newTasks] });
  }

  function renameCategory(oldCat, newCat, catTasks) {
    const updatedTasks = data.tasks.map(t => {
      if (!catTasks.some(ct => ct.id === t.id)) return t;
      return { ...t, title: t.title.replace(`【${oldCat}】`, `【${newCat}】`) };
    });
    // catOrderも更新
    const newCatOrder = (data.catOrder||[]).map(c => c === oldCat ? newCat : c);
    update({ ...data, tasks: updatedTasks, catOrder: newCatOrder });
  }

  // Visible projects: admin sees all, members see only projects they're added to
  const visibleProjects = data.projects.filter(p => {
    if (isTsuge) return true; // admin sees everything
    if (p.isPrivate) return false;
    if (!myMemberId) return false;
    if (p.visibleMemberIds && p.visibleMemberIds.length > 0) {
      return p.visibleMemberIds.includes(myMemberId);
    }
    return false; // members only see projects they're explicitly added to
  });

  // デバッグ用（後で削除）
  const _debugInfo = {
    myMemberId,
    gasUrl: wfGasUrl ? '有' : '無',
    totalProjects: data.projects.length,
    totalTasks: data.tasks.length,
    visibleCount: visibleProjects.length,
    projectsWithMe: data.projects.filter(p => (p.visibleMemberIds||[]).includes(myMemberId)).length,
    sampleVisibleMemberIds: data.projects.slice(0,3).map(p => ({ name: p.name?.slice(0,10), vids: (p.visibleMemberIds||[]).join(',').slice(0,30) })),
    syncStatus,
    isTsuge,
    membersCount: data.members.length,
    gasFetch: gasFetchDebug,
  };
  const activeProjects = visibleProjects.filter(p=>!p.closed);
  const closedProjects = visibleProjects.filter(p=>p.closed).sort((a,b)=>(b.eventDate||b.end||'').localeCompare(a.eventDate||a.end||''));
  const eventProjects = activeProjects.filter(p=>p.type==='event').sort((a,b)=>(a.eventDate||'9999').localeCompare(b.eventDate||'9999'));
  const otherProjects = activeProjects.filter(p=>p.type!=='event').sort((a,b)=>(b.start||b.end||'').localeCompare(a.start||a.end||''));
  const groupByMonth = (projects, dateKey) => {
    const groups = {};
    projects.forEach(p => {
      const d = dateKey(p);
      const month = d ? d.slice(0,7) : '日付なし';
      if (!groups[month]) groups[month] = [];
      groups[month].push(p);
    });
    return Object.entries(groups).sort((a,b)=> a[0]==='日付なし'?1:b[0]==='日付なし'?-1:a[0].localeCompare(b[0]));
  };
  const eventByMonth = groupByMonth(eventProjects, p=>p.eventDate);
  const closedByMonth = groupByMonth(closedProjects, p=>p.eventDate||p.end);

  const closedProjectIds = new Set(closedProjects.map(p=>p.id));
  const memberMap = Object.fromEntries((data.members||[]).map(m=>[m.id,m]));
  const projMemberDots = {};
  data.tasks.forEach(t=>{
    if(!t.assigneeIds||!t.assigneeIds.length) return;
    if(!projMemberDots[t.projectId]) projMemberDots[t.projectId]=new Set();
    t.assigneeIds.forEach(mid=>{ const m=memberMap[mid]; if(m&&!m.closed&&m.color) projMemberDots[t.projectId].add(m.color); });
  });
  const getDotsFor = pid => projMemberDots[pid] ? [...projMemberDots[pid]] : [];
  const filteredTasks = data.tasks
    .filter(t=>{ const pj=data.projects.find(p=>p.id===t.projectId); return pj ? visibleProjects.some(vp=>vp.id===pj.id) : isTsuge; })
    .filter(t=>!t.isPrivate||isTsuge)
    .filter(t=>projFilter==='all'?!closedProjectIds.has(t.projectId):t.projectId===projFilter)
    .filter(t=>memberFilter==='all'||(t.assigneeIds||[]).includes(memberFilter));

  const projName = projFilter==='all' ? 'すべてのプロジェクト' : (visibleProjects.find(p=>p.id===projFilter)?.name||'');

  return (
    <div style={{ height:'100vh',background:C.cream,color:C.text,fontFamily:"'Noto Sans JP',sans-serif",fontSize:13,display:'flex',flexDirection:'column',overflow:'hidden' }}>
      {pushFailed && (
        <div style={{ background:'#d32f2f',color:'#fff',fontSize:13,padding:'10px 16px',fontFamily:"'Noto Sans JP',sans-serif",zIndex:10000,display:'flex',alignItems:'center',gap:12 }}>
          <span style={{ fontSize:18 }}>!</span>
          <span>サーバーへの保存に失敗しています。データはこの端末にのみ保存されています。ページを閉じないでください。</span>
          <button onClick={()=>{ if(wfGasUrlRef.current && data) attemptPush(wfGasUrlRef.current, data, 0); }} style={{ marginLeft:'auto',padding:'4px 16px',background:'#fff',color:'#d32f2f',border:'none',borderRadius:4,fontWeight:600,cursor:'pointer',whiteSpace:'nowrap' }}>再送信</button>
        </div>
      )}
      <div style={{ background:'#333',color:'#0f0',fontSize:10,padding:'6px 12px',fontFamily:'monospace',whiteSpace:'pre-wrap',zIndex:9999 }}>
        {`ID:${_debugInfo.myMemberId||'なし'} | GAS:${_debugInfo.gasUrl} | fetch:${_debugInfo.gasFetch} | 全T:${data.tasks.length} | 選択PJ:${projFilter} | 選択T:${data.tasks.filter(t=>t.projectId===projFilter).length} | fT:${filteredTasks.length} | admin:${_debugInfo.isTsuge} | sync:${_debugInfo.syncStatus||'idle'}\n`}
        {_debugInfo.sampleVisibleMemberIds.map(p=>`${p.name}: [${p.vids||'空'}]`).join(' | ')}
      </div>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@300;400;500;600&family=Playfair+Display:ital@0;1&display=swap');
        * { box-sizing:border-box; margin:0; padding:0; }
        ::-webkit-scrollbar { width:5px; height:5px; }
        ::-webkit-scrollbar-track { background:transparent; }
        ::-webkit-scrollbar-thumb { background:${C.cream3}; border-radius:3px; }
        select option { background:#fff; }
        input[type="date"]::-webkit-calendar-picker-indicator { opacity:0.5; cursor:pointer; }
        input[type="number"]::-webkit-inner-spin-button,
        input[type="number"]::-webkit-outer-spin-button { -webkit-appearance:none; margin:0; }
        input[type="number"] { -moz-appearance:textfield; }
        @keyframes modal-in { from{opacity:0;transform:scale(0.97) translateY(-6px)} to{opacity:1;transform:scale(1) translateY(0)} }
        @keyframes modal-up { from{opacity:0;transform:translateY(40px)} to{opacity:1;transform:translateY(0)} }
        @keyframes shake { 0%,100%{transform:translateX(0)} 20%,60%{transform:translateX(-6px)} 40%,80%{transform:translateX(6px)} }
      `}</style>

      {/* ── Header ── */}
      <NavBar
        currentApp="workflow"
        tabs={[['tasks','進捗'],['members','メンバー']]}
        activeTab={tab}
        onTabChange={setTab}
        rightActions={<>
          <span onClick={()=>{
              if(wfGasUrl){
                syncVersionRef.current=0;
                localDirtyRef.current=false;
                fetchFromGAS(wfGasUrl);
              }
            }} style={{ fontSize:10, color:syncStatus==='error'?C.red:syncStatus==='syncing'||syncStatus==='pending'?C.amber:C.text3, transition:'color 0.3s', whiteSpace:'nowrap', cursor:'pointer' }}
            title="タップで強制同期">
            {!wfGasUrl?'⚠ GAS未接続':syncStatus==='syncing'?'⟳ 同期中…':syncStatus==='pending'?'…':syncStatus==='error'?'⚠ 同期失敗':lastSyncedAt?`✓ ${lastSyncedAt.getHours().toString().padStart(2,'0')}:${lastSyncedAt.getMinutes().toString().padStart(2,'0')} 同期済`:'接続中…'}
            {` P:${data.projects.length} T:${data.tasks.length}`}
          </span>
          {authMemberId && (
            <span style={{ padding:'5px 10px',borderRadius:999,border:`1px solid ${C.blue}`,background:C.blue+'18',color:C.blue,fontSize:11,fontFamily:'inherit',maxWidth:120,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis' }}>
              {data.members.find(m=>m.id===authMemberId)?.name || authDisplayName}
            </span>
          )}
        </>}
      />

      {/* ── Body ── */}
      <div style={{ display:'flex',flex:1,overflow:'hidden',position:'relative',minHeight:0 }}>

        {/* ── Sidebar overlay (mobile) ── */}
        {isMobile && sidebarOpen && (
          <div onClick={()=>setSidebarOpen(false)} style={{ position:'fixed',top:52,left:0,right:0,bottom:0,background:'rgba(58,53,48,0.35)',zIndex:299 }}/>
        )}

        {/* ── Sidebar ── */}
        <div style={{ width:230,background:'#fff',borderRight:`1px solid ${C.border}`,display:'flex',flexDirection:'column',flexShrink:0,overflowY:'auto',
          ...(isMobile ? { position:'fixed',top:52,left:0,height:'calc(100% - 52px)',zIndex:300,transform:sidebarOpen?'translateX(0)':'translateX(-100%)',transition:'transform 0.25s ease' } : {}) }}>
          <div style={{ padding:'16px 12px 8px' }}>
            {/* Bulk close bar */}
            {bulkCloseMode ? (
              <div style={{ display:'flex',alignItems:'center',gap:6,padding:'6px 4px 10px',borderBottom:`1px solid ${C.border}`,marginBottom:6 }}>
                <span style={{ fontSize:11,color:C.text2,flex:1 }}>{bulkCloseIds.size}件選択中</span>
                <button onClick={()=>{
                  if(bulkCloseIds.size===0) return;
                  if(!window.confirm(`${bulkCloseIds.size}件のプロジェクトを終了しますか？`)) return;
                  update({...data, projects:data.projects.map(p=>bulkCloseIds.has(p.id)?{...p,closed:true}:p)});
                  if(bulkCloseIds.has(projFilter)) setProjFilterSaved('all');
                  setBulkCloseIds(new Set()); setBulkCloseMode(false);
                }} disabled={bulkCloseIds.size===0}
                  style={{ padding:'3px 10px',borderRadius:6,border:'none',background:bulkCloseIds.size>0?C.orange:C.cream3,color:bulkCloseIds.size>0?'#fff':C.text3,cursor:bulkCloseIds.size>0?'pointer':'default',fontSize:11,fontFamily:'inherit',fontWeight:600 }}>終了する</button>
                <button onClick={()=>{setBulkCloseMode(false);setBulkCloseIds(new Set());}}
                  style={{ padding:'3px 8px',borderRadius:6,border:`1px solid ${C.border}`,background:'transparent',color:C.text3,cursor:'pointer',fontSize:11,fontFamily:'inherit' }}>取消</button>
              </div>
            ) : (
              <div style={{ display:'flex',alignItems:'center',gap:6,padding:'0 4px 6px' }}>
                <div style={{ flex:1 }}/>
                <button onClick={()=>setBulkCloseMode(true)}
                  style={{ padding:'2px 8px',borderRadius:4,border:`1px solid ${C.border}`,background:'transparent',color:C.text3,cursor:'pointer',fontSize:10,fontFamily:'inherit' }}
                  onMouseEnter={e=>{e.currentTarget.style.borderColor=C.orange;e.currentTarget.style.color=C.orange;}}
                  onMouseLeave={e=>{e.currentTarget.style.borderColor=C.border;e.currentTarget.style.color=C.text3;}}
                  title="複数プロジェクトを一括終了">一括終了</button>
              </div>
            )}
            {/* All */}
            <SidebarItem label="すべて" color={C.text3} count={data.tasks.filter(t=>!closedProjectIds.has(t.projectId)).length} active={!bulkCloseMode&&projFilter==='all'} onClick={()=>{ if(bulkCloseMode) return; setProjFilterSaved('all'); if(isMobile) setSidebarOpen(false); }}/>

            {/* Events */}
            <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',padding:'12px 4px 6px' }}>
              <span style={{ fontSize:10,fontWeight:700,letterSpacing:1,color:C.text3,textTransform:'uppercase' }}>イベント</span>
              {!bulkCloseMode && <button onClick={()=>setProjModal({open:true,data:null,defaultType:'event'})} style={{ padding:'0 5px',border:`1px solid ${C.border}`,borderRadius:4,background:'transparent',color:C.text3,cursor:'pointer',fontSize:11,fontFamily:'inherit',lineHeight:1.5 }}
                onMouseEnter={e=>{ e.currentTarget.style.borderColor=C.orange; e.currentTarget.style.color=C.orange; }}
                onMouseLeave={e=>{ e.currentTarget.style.borderColor=C.border; e.currentTarget.style.color=C.text3; }}>＋</button>}
            </div>
            {eventByMonth.map(([month, ps])=>{ const label = month==='日付なし'?'日付なし':`${month.slice(0,4)}年${parseInt(month.slice(5))}月`; const isOpen = openMonths.event?.[month]; return <div key={month}>
              <div onClick={()=>toggleMonth('event',month)} style={{ display:'flex',alignItems:'center',gap:4,padding:'4px 8px',cursor:'pointer',borderRadius:4 }}
                onMouseEnter={e=>e.currentTarget.style.background=C.cream3||'#f5f0eb'} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                <span style={{ fontSize:9,color:C.text3,width:10 }}>{isOpen?'▼':'▶'}</span>
                <span style={{ fontSize:10,color:C.text3,fontWeight:600 }}>{label}</span>
                <span style={{ fontSize:9,color:C.text3,opacity:0.6 }}>({ps.length})</span>
              </div>
              {isOpen && ps.map(p=>bulkCloseMode ? (
                <label key={p.id} style={{ display:'flex',alignItems:'center',gap:6,padding:'5px 8px 5px 12px',cursor:'pointer',borderRadius:6,fontSize:12,color:bulkCloseIds.has(p.id)?C.orange:C.text }}
                  onMouseEnter={e=>e.currentTarget.style.background=C.cream2} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                  <input type="checkbox" checked={bulkCloseIds.has(p.id)} onChange={()=>setBulkCloseIds(prev=>{const s=new Set(prev);s.has(p.id)?s.delete(p.id):s.add(p.id);return s;})} style={{ accentColor:C.orange }}/>
                  <span style={{ overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>{p.name}</span>
                </label>
              ) : <SidebarItem key={p.id} label={p.name} color={p.color} count={data.tasks.filter(t=>t.projectId===p.id).length} active={projFilter===p.id} onClick={()=>{ setProjFilterSaved(p.id); if(isMobile) setSidebarOpen(false); }} onContextMenu={e=>{ e.preventDefault(); setProjModal({open:true,data:p}); }} isPrivate={p.isPrivate} restricted={p.visibleMemberIds&&p.visibleMemberIds.length>0} memberDots={getDotsFor(p.id)}/>)}
            </div>; })}

            {/* Other */}
            <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',padding:'12px 4px 6px' }}>
              <span style={{ fontSize:10,fontWeight:700,letterSpacing:1,color:C.text3,textTransform:'uppercase' }}>その他</span>
              {!bulkCloseMode && <button onClick={()=>setProjModal({open:true,data:null,defaultType:'other'})} style={{ padding:'0 5px',border:`1px solid ${C.border}`,borderRadius:4,background:'transparent',color:C.text3,cursor:'pointer',fontSize:11,fontFamily:'inherit',lineHeight:1.5 }}
                onMouseEnter={e=>{ e.currentTarget.style.borderColor=C.orange; e.currentTarget.style.color=C.orange; }}
                onMouseLeave={e=>{ e.currentTarget.style.borderColor=C.border; e.currentTarget.style.color=C.text3; }}>＋</button>}
            </div>
            {otherProjects.map(p=>bulkCloseMode ? (
              <label key={p.id} style={{ display:'flex',alignItems:'center',gap:6,padding:'5px 8px 5px 12px',cursor:'pointer',borderRadius:6,fontSize:12,color:bulkCloseIds.has(p.id)?C.orange:C.text }}
                onMouseEnter={e=>e.currentTarget.style.background=C.cream2} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                <input type="checkbox" checked={bulkCloseIds.has(p.id)} onChange={()=>setBulkCloseIds(prev=>{const s=new Set(prev);s.has(p.id)?s.delete(p.id):s.add(p.id);return s;})} style={{ accentColor:C.orange }}/>
                <span style={{ overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>{p.name}</span>
              </label>
            ) : <SidebarItem key={p.id} label={p.name} color={p.color} count={data.tasks.filter(t=>t.projectId===p.id).length} active={projFilter===p.id} onClick={()=>{ setProjFilterSaved(p.id); if(isMobile) setSidebarOpen(false); }} onContextMenu={e=>{ e.preventDefault(); setProjModal({open:true,data:p}); }} isPrivate={p.isPrivate} restricted={p.visibleMemberIds&&p.visibleMemberIds.length>0} memberDots={getDotsFor(p.id)}/>)}

            {/* Closed (accordion) */}
            {closedProjects.length>0 && <>
              <div onClick={()=>setClosedProjOpen(!closedProjOpen)} style={{ display:'flex',alignItems:'center',justifyContent:'space-between',padding:'12px 4px 6px',cursor:'pointer',opacity:0.6 }}>
                <span style={{ fontSize:10,fontWeight:700,letterSpacing:1,color:C.text3,textTransform:'uppercase' }}>終了したプロジェクト ({closedProjects.length})</span>
                <span style={{ fontSize:10,color:C.text3 }}>{closedProjOpen?'▼':'▶'}</span>
              </div>
              {closedProjOpen && closedByMonth.map(([month, ps])=>{ const label = month==='日付なし'?'日付なし':`${month.slice(0,4)}年${parseInt(month.slice(5))}月`; const isOpen = openMonths.closed?.[month]; return <div key={month}>
                <div onClick={()=>toggleMonth('closed',month)} style={{ display:'flex',alignItems:'center',gap:4,padding:'4px 8px',cursor:'pointer',borderRadius:4 }}
                  onMouseEnter={e=>e.currentTarget.style.background=C.cream3||'#f5f0eb'} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                  <span style={{ fontSize:9,color:C.text3,width:10 }}>{isOpen?'▼':'▶'}</span>
                  <span style={{ fontSize:10,color:C.text3,fontWeight:600 }}>{label}</span>
                  <span style={{ fontSize:9,color:C.text3,opacity:0.6 }}>({ps.length})</span>
                </div>
                {isOpen && ps.map(p=><SidebarItem key={p.id} label={p.name} color={C.text3} count={data.tasks.filter(t=>t.projectId===p.id).length} active={projFilter===p.id} onClick={()=>{ setProjFilterSaved(p.id); if(isMobile) setSidebarOpen(false); }} onContextMenu={e=>{ e.preventDefault(); setProjModal({open:true,data:p}); }} isPrivate={p.isPrivate} restricted={p.visibleMemberIds&&p.visibleMemberIds.length>0} memberDots={getDotsFor(p.id)}/>)}
              </div>; })}
            </>}
          </div>
          {isAdmin && (
            <div style={{ marginTop:'auto',padding:'12px 14px',borderTop:`1px solid ${C.border}` }}>
              <span style={{ fontSize:11,opacity:0.45,color:C.text3,fontFamily:'inherit',display:'flex',alignItems:'center',gap:4 }}>
                🔓<span style={{ fontSize:10 }}>管理者</span>
              </span>
            </div>
          )}
        </div>

        {/* ── Content ── */}
        <div style={{ flex:1,display:'flex',flexDirection:'column',overflow:'hidden',minHeight:0 }}>

          {tab==='tasks' && (<>
            <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',padding:'10px 24px',borderBottom:`1px solid ${C.border}`,background:C.cream,flexShrink:0,gap:12,flexWrap:isMobile?'wrap':'nowrap' }}>
              <div style={{ display:'flex',alignItems:'center',gap:12 }}>
                {isMobile && (
                  <button onClick={()=>setSidebarOpen(true)} style={{ background:'none',border:`1px solid ${C.border}`,borderRadius:8,cursor:'pointer',fontSize:18,color:C.text2,padding:'2px 8px',lineHeight:1,flexShrink:0 }}>≡</button>
                )}
                <div style={{ fontSize:15,fontWeight:600,color:C.text }}>{projName}</div>
                <div style={{ display:'flex',gap:2,background:C.cream3,borderRadius:999,padding:2 }}>
                  {[['kanban','カンバン'],['list','リスト'],['member','メンバー別']].map(([v,l])=>(
                    <button key={v} onClick={()=>{setView(v);try{localStorage.setItem('wf_view',v);}catch{}}} style={{ padding:'5px 11px',borderRadius:999,border:'none',background:view===v?'#fff':'transparent',color:view===v?C.orange:C.text2,cursor:'pointer',fontSize:12,fontFamily:'inherit',fontWeight:view===v?500:400,boxShadow:view===v?'0 1px 3px rgba(58,53,48,0.12)':'none',transition:'all 0.12s' }}>{l}</button>
                  ))}
                </div>
              </div>
              <div style={{ display:'flex',gap:6,alignItems:'center' }}>
                {projFilter !== 'all' && (
                  <>
                    <Btn onClick={()=>setCopyTasksModal(true)} style={{ fontSize:12,padding:'5px 10px' }}>タスクをコピー</Btn>
                    {(()=>{ const _cp = visibleProjects.find(p=>p.id===projFilter); return _cp ? (
                      _cp.closed
                        ? <Btn onClick={()=>{ saveProject({..._cp, closed:false}); }} style={{ fontSize:12,padding:'5px 10px' }}>再開する</Btn>
                        : <Btn onClick={()=>{ if(window.confirm('このプロジェクトを終了しますか？')) { saveProject({..._cp, closed:true}); setProjFilterSaved('all'); } }} style={{ fontSize:12,padding:'5px 10px',color:C.text3 }}>プロジェクトを終了</Btn>
                    ) : null; })()}
                  </>
                )}
                <Select value={memberFilter} onChange={e=>setMemberFilter(e.target.value)} style={{ width:'auto',padding:'5px 10px' }}>
                  <option value="all">全メンバー</option>
                  {data.members.filter(m=>!m.closed).map(m=><option key={m.id} value={m.id}>{m.name}</option>)}
                </Select>
              </div>
            </div>
            {projFilter !== 'all' && (()=>{
              const _pj = visibleProjects.find(p=>p.id===projFilter);
              if (!_pj) return null;
              const confirmedStaff = getConfirmedStaff(_pj.id);
              const confirmedMakers = getConfirmedMakers(_pj.id);
              const hasMemo = !!_pj.memo;
              const hasLinks = _pj.links?.length > 0;
              const hasStaff = confirmedStaff.length > 0;
              const hasMakers = confirmedMakers.length > 0;
              if (!hasMemo && !hasLinks && !hasStaff && !hasMakers) return null;
              return (<>
                {(hasMemo || hasLinks) && (
                  <div style={{ padding:'6px 24px',borderBottom:`1px solid ${C.border}`,background:'#fff',display:'flex',alignItems:'center',gap:16,flexShrink:0,flexWrap:'wrap' }}>
                    {_pj.memo && <span style={{ fontSize:11,color:C.text2,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',maxWidth:400 }}>📝 {_pj.memo}</span>}
                    {_pj.links?.map((lk,_i)=>(
                      <a key={_i} href={lk.url} target="_blank" rel="noreferrer" style={{ fontSize:11,color:C.blue,textDecoration:'none',whiteSpace:'nowrap',flexShrink:0 }}
                        onMouseEnter={e=>e.currentTarget.style.textDecoration='underline'}
                        onMouseLeave={e=>e.currentTarget.style.textDecoration='none'}>
                        🔗 {lk.label||lk.url}
                      </a>
                    ))}
                  </div>
                )}
                {hasStaff && (()=>{
                  const order = staffOrder[_pj.id] || [];
                  const sorted = [...confirmedStaff].sort((a,b)=>{
                    const ia = order.indexOf(String(a.staffId));
                    const ib = order.indexOf(String(b.staffId));
                    if (ia>=0 && ib>=0) return ia-ib;
                    if (ia>=0) return -1;
                    if (ib>=0) return 1;
                    return 0;
                  });
                  return (
                  <div style={{ padding:'8px 24px',borderBottom:`1px solid ${C.border}`,background:'#fefcfa',flexShrink:0 }}>
                    <div style={{ fontSize:10,fontWeight:600,color:C.text3,letterSpacing:0.3,marginBottom:6 }}>確定スタッフ（{sorted.length}名）</div>
                    <div style={{ display:'flex',flexWrap:'wrap',gap:6 }}>
                      {sorted.map(s => {
                        const roleKey = `${_pj.id}_${s.staffId}`;
                        const role = staffRoles[roleKey] || '';
                        const isDragging = dragStaff === String(s.staffId);
                        return (
                          <div key={s.staffId}
                            draggable
                            onDragStart={e=>{setDragStaff(String(s.staffId));e.dataTransfer.effectAllowed='move';}}
                            onDragEnd={()=>setDragStaff(null)}
                            onDragOver={e=>{e.preventDefault();e.dataTransfer.dropEffect='move';}}
                            onDrop={e=>{
                              e.preventDefault();
                              if(!dragStaff||dragStaff===String(s.staffId)) return;
                              const ids = sorted.map(x=>String(x.staffId));
                              const fromIdx = ids.indexOf(dragStaff);
                              const toIdx = ids.indexOf(String(s.staffId));
                              if(fromIdx<0||toIdx<0) return;
                              ids.splice(fromIdx,1);
                              ids.splice(toIdx,0,dragStaff);
                              setStaffOrder(prev=>({...prev,[_pj.id]:ids}));
                              setDragStaff(null);
                            }}
                            style={{ display:'flex',alignItems:'center',gap:4,padding:'4px 8px',borderRadius:8,background:isDragging?C.orangeBg:'#fff',border:`1px solid ${isDragging?C.orange:C.border}`,fontSize:11,cursor:'grab',opacity:isDragging?0.6:1,transition:'opacity 0.1s,border 0.1s',touchAction:'none' }}>
                            <span style={{ fontWeight:600,color:s.isLeader?C.orange:C.text,whiteSpace:'nowrap' }}>{s.isLeader?'★':''}{s.name}</span>
                            <input
                              value={role}
                              onChange={e=>setStaffRoles(prev=>({...prev,[roleKey]:e.target.value}))}
                              placeholder="役割"
                              style={{ border:'none',outline:'none',fontSize:10,color:C.text2,background:'transparent',width:role?Math.max(40,role.length*12):40,padding:'2px 4px',fontFamily:'inherit' }}
                              onFocus={e=>{e.target.style.borderBottom=`1px solid ${C.orange}`;e.target.parentElement.draggable=false;}}
                              onBlur={e=>{e.target.style.borderBottom='none';e.target.parentElement.draggable=true;}}
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  );
                })()}
                {hasMakers && (
                  <div style={{ padding:'8px 24px',borderBottom:`1px solid ${C.border}`,background:'#fefcfa',flexShrink:0 }}>
                    <div style={{ fontSize:10,fontWeight:600,color:C.text3,letterSpacing:0.3,marginBottom:6 }}>参加確定 作り手（{confirmedMakers.length}名）</div>
                    <div style={{ display:'flex',flexWrap:'wrap',gap:6 }}>
                      {confirmedMakers.map(m => (
                        <div key={m.name} style={{ display:'flex',alignItems:'center',gap:4,padding:'4px 10px',borderRadius:8,background:'#fff',border:`1px solid ${C.border}`,fontSize:11 }}>
                          <span style={{ color:'#5a9070',fontWeight:600 }}>🌿</span>
                          <span style={{ fontWeight:500,color:C.text }}>{m.name}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>);
            })()}
            {view==='kanban' && (
              <div style={{ display:'flex',flex:1,overflow:'hidden',minHeight:0 }}>
                <KanbanView tasks={filteredTasks} projects={visibleProjects} members={data.members} onOpenTask={t=>setTaskModal({open:true,data:t,defaultStatus:'todo'})} onStatusChange={changeStatus} onAddTask={()=>setTaskModal({open:true,data:null,defaultStatus:'todo'})} onAddTaskWithStatus={s=>setTaskModal({open:true,data:null,defaultStatus:s})} onDuplicateTask={duplicateTask} onCopyTaskToProject={copyTaskToProject} taskOrder={taskOrder} onReorder={reorderTask} isMobile={isMobile} onTimerSelect={t=>setTimerTask(t)} timerTaskId={timerTask?.id}/>
                {!isMobile && <div style={{ padding:'16px 16px 16px 0',flexShrink:0,display:'flex' }}><TimerPanel timerTask={timerTask} projects={visibleProjects} onClearTask={()=>setTimerTask(null)}/></div>}
              </div>
            )}
            {view==='list' && (
              <div style={{ display:'flex',flex:1,overflow:'hidden',minHeight:0 }}>
                <ListView tasks={filteredTasks} projects={visibleProjects} members={data.members} onOpenTask={t=>setTaskModal({open:true,data:t})} onStatusChange={changeStatus} onDelete={deleteTask} onDeleteTasks={deleteTasks} onSave={saveTask} onSaveBulk={saveBulkTasks} onTimerSelect={t=>setTimerTask(t)} timerTaskId={timerTask?.id} onAddTask={(cat)=>setTaskModal({open:true,data:null,defaultStatus:'todo',defaultTitle:cat?`【${cat}】`:undefined})} onCopyCategoryToProject={copyCategoryToProject} onDuplicateTask={duplicateTask} onCopyTaskToProject={copyTaskToProject} catOrder={data.catOrder||[]} onCatOrderChange={order=>update({...data,catOrder:order})} onRenameCategory={renameCategory} currentProject={projFilter!=='all'?visibleProjects.find(p=>p.id===projFilter):null}/>
                {!isMobile && <div style={{ padding:'16px 16px 16px 0',flexShrink:0,display:'flex' }}><TimerPanel timerTask={timerTask} projects={visibleProjects} onClearTask={()=>setTimerTask(null)}/></div>}
              </div>
            )}
            {view==='calendar' && <CalendarView tasks={filteredTasks} projects={visibleProjects} members={data.members} onOpenTask={t=>setTaskModal({open:true,data:t})} />}
            {view==='member' && <MemberView tasks={filteredTasks} projects={visibleProjects} members={data.members} memberFilter={memberFilter} onOpenTask={t=>setTaskModal({open:true,data:t})} onSave={saveTask} onStatusChange={changeStatus} isMobile={isMobile}/>}
          </>)}

          {tab==='members' && (<>
            <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',padding:'10px 24px',borderBottom:`1px solid ${C.border}`,background:C.cream,flexShrink:0,gap:12 }}>
              <div style={{ display:'flex',alignItems:'center',gap:12 }}>
                {isMobile && (
                  <button onClick={()=>setSidebarOpen(true)} style={{ background:'none',border:`1px solid ${C.border}`,borderRadius:8,cursor:'pointer',fontSize:18,color:C.text2,padding:'2px 8px',lineHeight:1,flexShrink:0 }}>≡</button>
                )}
                <div style={{ fontSize:15,fontWeight:600,color:C.text }}>メンバー管理</div>
              </div>
              <Btn variant="primary" onClick={()=>setMemberModal(true)}>＋ メンバー追加</Btn>
            </div>
            <div style={{ flex:1,overflowY:'auto',display:'flex',flexDirection:'column',minHeight:0 }}>
              <div style={{ padding:24,maxWidth:600 }}>
                {data.members.length===0
                  ? <EmptyState icon="👤" msg="メンバーを追加してください"/>
                  : <>
                    {data.members.filter(m=>!m.closed).map(m=>(
                      <div key={m.id} style={{ display:'flex',alignItems:'center',gap:12,padding:'12px 14px',border:`1px solid ${C.border}`,borderRadius:12,background:'#fff',marginBottom:8 }}>
                        <div style={{ position:'relative',flexShrink:0 }}>
                          <div onClick={e=>{const el=e.currentTarget.nextSibling;el.style.display=el.style.display==='none'?'flex':'none';}} style={{ cursor:'pointer' }}><Avatar name={m.name} color={m.color} size={32} fs={14}/></div>
                          <div style={{ display:'none',position:'absolute',top:'100%',left:0,zIndex:200,background:'#fff',border:`1px solid ${C.border}`,borderRadius:8,padding:6,gap:4,flexWrap:'wrap',width:140,boxShadow:'0 4px 12px rgba(0,0,0,0.12)',marginTop:4 }}>
                            {PALETTE.map(c=><div key={c} onClick={()=>updateMember(m.id,{color:c})} style={{ width:22,height:22,borderRadius:'50%',background:c,cursor:'pointer',border:c===m.color?'2px solid #333':'2px solid transparent' }}/>)}
                          </div>
                        </div>
                        <div style={{ flex:1 }}>
                          <input value={m.name} onChange={e=>updateMember(m.id,{name:e.target.value})}
                            style={{ fontSize:13,fontWeight:600,color:C.text,border:'none',background:'transparent',outline:'none',fontFamily:'inherit',padding:'2px 0',width:'100%',borderBottom:`1px solid transparent` }}
                            onFocus={e=>e.currentTarget.style.borderBottom=`1px solid ${C.orange}`}
                            onBlur={e=>e.currentTarget.style.borderBottom='1px solid transparent'}/>
                          <div style={{ fontSize:11,color:C.text3 }}>{data.tasks.filter(t=>(t.assigneeIds||[]).includes(m.id)).length}件のタスク</div>
                        </div>
                        <Btn small onClick={()=>{ if(window.confirm(`${m.name} を終了メンバーに移動しますか？`)) updateMember(m.id,{closed:true}); }} style={{ color:C.text3,borderColor:C.border }}>終了</Btn>
                        <Btn variant="danger" small onClick={()=>{ if(window.confirm('このメンバーを削除しますか？（タスクの担当も外れます）')) deleteMember(m.id); }}>削除</Btn>
                      </div>
                    ))}
                    {data.members.some(m=>m.closed) && <>
                      <div style={{ fontSize:11,fontWeight:700,color:C.text3,letterSpacing:0.5,padding:'16px 0 6px',borderTop:`1px solid ${C.border}`,marginTop:8 }}>終了したメンバー</div>
                      {data.members.filter(m=>m.closed).map(m=>(
                        <div key={m.id} style={{ display:'flex',alignItems:'center',gap:12,padding:'10px 14px',border:`1px solid ${C.border}`,borderRadius:12,background:C.cream2,marginBottom:8,opacity:0.7 }}>
                          <Avatar name={m.name} color={m.color} size={32} fs={14}/>
                          <div style={{ flex:1 }}>
                            <div style={{ fontSize:13,fontWeight:600,color:C.text3 }}>{m.name}</div>
                            <div style={{ fontSize:11,color:C.text3 }}>{data.tasks.filter(t=>(t.assigneeIds||[]).includes(m.id)).length}件のタスク</div>
                          </div>
                          <Btn small onClick={()=>updateMember(m.id,{closed:false})} style={{ color:C.green,borderColor:C.green }}>復帰</Btn>
                          <Btn variant="danger" small onClick={()=>{ if(window.confirm('このメンバーを削除しますか？（タスクの担当も外れます）')) deleteMember(m.id); }}>削除</Btn>
                        </div>
                      ))}
                    </>}
                  </>}
              </div>
              {data.members.length > 0 && (<>
                <div style={{ padding:'8px 24px',fontSize:11,fontWeight:700,color:C.text3,letterSpacing:1,textTransform:'uppercase',borderTop:`1px solid ${C.border}` }}>タスク状況</div>
                <MemberView tasks={filteredTasks} projects={visibleProjects} members={data.members} memberFilter="all" onOpenTask={t=>setTaskModal({open:true,data:t})} onSave={saveTask} onStatusChange={changeStatus} isMobile={isMobile}/>
              </>)}
            </div>
          </>)}

        </div>
      </div>

      {/* ── Modals ── */}
      <TaskModal open={taskModal.open} onClose={()=>setTaskModal({open:false,data:null,defaultStatus:'todo'})} data={taskModal.data} projects={visibleProjects} members={data.members} defaultProjectId={projFilter} defaultStatus={taskModal.defaultStatus} defaultTitle={taskModal.defaultTitle} defaultAssigneeId={myMemberId} onSave={saveTask} onDelete={deleteTask} isTsuge={isTsuge}/>
      <ProjectModal open={projModal.open} onClose={()=>setProjModal({open:false,data:null,defaultType:null})} data={projModal.data} defaultType={projModal.defaultType} members={data.members} onSave={saveProject} onDelete={deleteProject} isTsuge={isTsuge} adminMemberId={isTsuge ? myMemberId : null}/>
      <MemberModal open={memberModal} onClose={()=>setMemberModal(false)} onSave={saveMember} existingMemberIds={data.members.map(m=>m.id)}/>
      <PINModal open={pinModal.open} onClose={()=>setPinModal({open:false,mode:'unlock'})} mode={pinModal.mode}
        onSuccess={()=>{}}/>
      <DuplicateModal open={dupModal.open} onClose={()=>setDupModal({open:false,project:null})} project={dupModal.project} tasks={data.tasks} members={data.members} onDuplicate={doDuplicate}/>
      {copyTasksModal && (
        <CopyTasksModal
          currentProjectId={projFilter}
          projects={visibleProjects}
          tasks={data.tasks}
          onClose={()=>setCopyTasksModal(false)}
          onCopy={(newTasks)=>{ update({...data, tasks:[...data.tasks,...newTasks]}); setCopyTasksModal(false); }}
        />
      )}
    </div>
  );
}

function SidebarItem({ label, color, count, active, onClick, onContextMenu, isPrivate, restricted, memberDots }) {
  return (
    <div onClick={onClick} onContextMenu={onContextMenu} style={{ display:'flex',alignItems:'center',gap:8,padding:'8px 10px',borderRadius:10,cursor:'pointer',background:active?C.orangeBg:'transparent',transition:'all 0.12s',marginBottom:2 }}
      onMouseEnter={e=>{ if(!active) e.currentTarget.style.background=C.cream2; }}
      onMouseLeave={e=>{ if(!active) e.currentTarget.style.background='transparent'; }}>
      <div style={{ width:7,height:7,borderRadius:'50%',background:color,flexShrink:0 }}/>
      <span style={{ fontSize:12,fontWeight:active?600:400,color:active?C.orange:C.text,flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>{label}</span>
      {memberDots && memberDots.length > 0 && (
        <div style={{ display:'flex',gap:2,flexShrink:0 }}>
          {memberDots.map((mc,i)=><div key={i} style={{ width:7,height:7,borderRadius:'50%',background:mc }} title={mc}/>)}
        </div>
      )}
      {isPrivate && <span style={{ fontSize:9,color:C.orange }}>🔐</span>}
      {restricted && <span style={{ fontSize:9,color:C.blue }} title="表示メンバー制限あり">👥</span>}
      <span style={{ fontSize:10,color:C.text3,background:C.cream3,padding:'1px 5px',borderRadius:999,flexShrink:0 }}>{count}</span>
    </div>
  );
}
function EmptyState({ icon, msg }) {
  return <div style={{ display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:'60px 20px',color:C.text3,gap:10,textAlign:'center' }}><div style={{ fontSize:36 }}>{icon}</div><div style={{ fontSize:14,color:C.text2 }}>{msg}</div></div>;
}

// ── Unified Settings Page ─────────────────────────────────────────────────
function SettingsPage() {
  const navigate = useNavigate();
  const { isAdmin, logout, displayName } = useAuth();
  const { ref: fbRef, set: fbSet } = require("firebase/database");
  const { db: fbDb } = require("./firebase");
  const hasFirebase = !!fbDb;
  // wl_* keys are JSON-encoded (Timesheet uses JSON.parse to read them)
  // wf_* keys are plain strings (Workflow uses localStorage.getItem)
  const lsJson = (k, fb='') => { try { const v = localStorage.getItem(k); if (!v) return fb; try { return JSON.parse(v); } catch { return v; } } catch { return fb; } };
  const lsRaw  = (k, fb='') => { try { return localStorage.getItem(k) || fb; } catch { return fb; } };

  const DEFAULT_SHEET = 'https://docs.google.com/spreadsheets/d/1C2zF59fpeSC7iBOSIlbrPwcIqUa86UIiZM22d7-g8N0/edit?gid=96225699#gid=96225699';
  const GAS_DEFAULT = 'https://script.google.com/macros/s/AKfycbwrH1MPcKI1vWDT5Os4hheC0rx-vz0AhY_OVfifigopdxYtKOi4aWm_o2yV9ARAwNOK/exec';

  const [name, setName] = useState(() => lsJson('wl_userName'));
  const wfMembers = (() => { try { const d = JSON.parse(localStorage.getItem('kodawarin_tasks') || '{}'); return d.members || []; } catch { return []; } })();
  const [tsGas, setTsGas] = useState(() => lsJson('wl_gasUrl', GAS_DEFAULT));
  const [tsSheet, setTsSheet] = useState(() => lsJson('wl_sheetUrl', DEFAULT_SHEET));
  const [wfGas, setWfGas] = useState(() => lsRaw('wf_gasUrl'));
  const [calGasUrl, setCalGasUrl] = useState(() => lsJson('wl_calGasUrl'));
  const [saved, setSaved] = useState('');
  const [testResult, setTestResult] = useState('');
  const [calTestResult, setCalTestResult] = useState('');

  async function testCalGas() {
    if (!calGasUrl) { setCalTestResult('⚠ URLが入力されていません'); return; }
    setCalTestResult('テスト中…');
    try {
      const res = await fetch(calGasUrl, {
        method: 'POST',
        body: JSON.stringify({ action: 'syncCalendar', tasks: [{ title: 'テスト', due: new Date().toISOString().slice(0,10), project: 'テスト送信' }] }),
        redirect: 'follow',
      });
      const text = await res.text();
      let json; try { json = JSON.parse(text); } catch { json = null; }
      if (json && json.ok) { setCalTestResult('✓ 成功！カレンダーを確認してください（今日の日付で「[WF] テスト」が作成されます）'); }
      else { setCalTestResult(`⚠ GASからの応答: ${text.slice(0,200)}`); }
    } catch(err) { setCalTestResult(`✗ 接続失敗 — ${err.message}`); }
  }

  async function testWfGas() {
    if (!wfGas) { setTestResult('⚠ URLが入力されていません'); return; }
    setTestResult('テスト中…');
    try {
      const res = await fetch(`${wfGas}?action=getWorkflowData&_t=${Date.now()}`);
      const json = await res.json();
      if (json.ok) {
        const t = json.version ? new Date(json.version).toLocaleString('ja-JP') : '（データなし）';
        setTestResult(`✓ 接続OK　最終保存: ${t}`);
      } else { setTestResult('⚠ GASからエラーが返りました'); }
    } catch { setTestResult('✗ 接続失敗 — URLを確認してください'); }
  }

  function saveAll() {
    localStorage.setItem('wl_userName', JSON.stringify(name));
    localStorage.setItem('wl_gasUrl', JSON.stringify(tsGas));
    localStorage.setItem('wl_sheetUrl', JSON.stringify(tsSheet));
    localStorage.setItem('wf_gasUrl', wfGas);
    localStorage.setItem('wl_calGasUrl', JSON.stringify(calGasUrl));
    // Workflow GAS URLをFirebaseに保存（全デバイスで共有）
    if (wfGas && hasFirebase) {
      fbSet(fbRef(fbDb, "config/wfGasUrl"), wfGas);
    }
    setSaved('✓ 保存しました');
    setTimeout(() => setSaved(''), 2500);
  }

  const card = { background:'#fff', border:`1px solid ${C.border}`, borderRadius:14, padding:20, marginBottom:14 };
  const label = { fontSize:11, fontWeight:700, color:C.text2, letterSpacing:0.5, display:'block', marginBottom:6 };
  const inp = { width:'100%', padding:'9px 12px', borderRadius:8, border:`1px solid ${C.border}`, fontSize:13, fontFamily:"'Noto Sans JP',sans-serif", outline:'none', color:C.text, background:'#fff', marginBottom:0 };

  return (
    <div style={{ minHeight:'100vh', background:C.cream, fontFamily:"'Noto Sans JP',sans-serif", fontSize:13, color:C.text }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;600&display=swap'); *{box-sizing:border-box;margin:0;padding:0;}`}</style>
      <div style={{ height:52, background:'#fff', borderBottom:`1px solid ${C.border}`, display:'flex', alignItems:'center', padding:'0 24px', gap:12, flexShrink:0 }}>
        <button onClick={()=>navigate('/')} style={{ background:'none', border:'none', cursor:'pointer', fontSize:18, color:C.text2, padding:'4px 6px', borderRadius:8, lineHeight:1 }}
          onMouseEnter={e=>e.currentTarget.style.color=C.orange} onMouseLeave={e=>e.currentTarget.style.color=C.text2}>←</button>
        <span style={{ fontSize:15, fontWeight:600, color:C.text }}>設定</span>
        {saved && <span style={{ fontSize:12, color:C.green, marginLeft:'auto' }}>{saved}</span>}
        <button onClick={()=>navigate('/')} style={{ marginLeft:'auto', padding:'6px 14px', borderRadius:999, border:`1px solid ${C.border}`, background:'#fff', color:C.text2, cursor:'pointer', fontSize:12, fontFamily:"'Noto Sans JP',sans-serif", fontWeight:500, transition:'all 0.15s' }}
          onMouseEnter={e=>{e.currentTarget.style.borderColor=C.orange;e.currentTarget.style.color=C.orange;}}
          onMouseLeave={e=>{e.currentTarget.style.borderColor=C.border;e.currentTarget.style.color=C.text2;}}>
          Workflow →
        </button>
      </div>

      <div style={{ maxWidth:520, margin:'32px auto', padding:'0 20px 60px' }}>

        <div style={card}>
          <label style={label}>自分の名前</label>
          <div style={{ fontSize:11, color:C.text3, marginBottom:10 }}>Timesheetでのタスク抽出に使います。</div>
          {wfMembers.length > 0 ? (
            <select value={name} onChange={e=>setName(e.target.value)} style={{ ...inp, cursor:'pointer' }}>
              <option value="">-- 選択してください --</option>
              {wfMembers.map(m=><option key={m.id} value={m.name}>{m.name}</option>)}
            </select>
          ) : (
            <input value={name} onChange={e=>setName(e.target.value)} placeholder="例：田中 さやか" style={inp}/>
          )}
        </div>

        <div style={card}>
          <label style={label}>Timesheet — ログ送信GAS URL</label>
          <div style={{ fontSize:11, color:C.text3, marginBottom:10 }}>各自のGAS WebアプリURL。ログの送受信に使います。</div>
          <input value={tsGas} onChange={e=>setTsGas(e.target.value)} placeholder="https://script.google.com/macros/s/..." style={inp}/>
        </div>

        <div style={card}>
          <label style={label}>Timesheet — スプレッドシートURL</label>
          <div style={{ fontSize:11, color:C.text3, marginBottom:10 }}>📊ボタンで開くスプレッドシートのURL。</div>
          <input value={tsSheet} onChange={e=>setTsSheet(e.target.value)} placeholder="https://docs.google.com/spreadsheets/d/..." style={inp}/>
        </div>

        <div style={card}>
          <label style={label}>Googleカレンダー連携 — GAS URL</label>
          <div style={{ fontSize:11, color:C.text3, marginBottom:10 }}>
            自分に割り当てられた期限付きタスクを、<strong>自分のGoogleカレンダー</strong>の期限日に自動追加します。<br/>
            各自が自分のGoogleアカウントでGASをデプロイしてURLを入力してください。
          </div>
          <input value={calGasUrl} onChange={e=>{ setCalGasUrl(e.target.value); setCalTestResult(''); }} placeholder="https://script.google.com/macros/s/..." style={{ ...inp, marginBottom:10 }}/>
          <button onClick={testCalGas} style={{ padding:'7px 16px', borderRadius:8, border:`1px solid ${C.border}`, background:'transparent', color:C.text2, cursor:'pointer', fontSize:12, fontFamily:"'Noto Sans JP',sans-serif", transition:'all 0.15s', marginBottom:10 }}
            onMouseEnter={e=>{ e.currentTarget.style.borderColor=C.orange; e.currentTarget.style.color=C.orange; }}
            onMouseLeave={e=>{ e.currentTarget.style.borderColor=C.border; e.currentTarget.style.color=C.text2; }}>
            テスト送信
          </button>
          {calTestResult && <div style={{ marginBottom:10, fontSize:12, color:calTestResult.startsWith('✓')?C.green:calTestResult.startsWith('✗')?C.red:C.amber }}>{calTestResult}</div>}
          <details>
            <summary style={{ fontSize:11, color:C.blue, cursor:'pointer', marginBottom:8 }}>▶ GASの作り方（クリックで表示）</summary>
            <div style={{ fontSize:11, color:C.text2, lineHeight:2, marginBottom:8, marginTop:6 }}>
              <strong>① GASプロジェクトを作る</strong><br/>
              1. <a href="https://script.google.com" target="_blank" rel="noreferrer" style={{ color:C.blue }}>script.google.com</a> をGoogleアカウントでログインして開く<br/>
              2. 左上の「新しいプロジェクト」をクリック<br/>
              3. 画面中央のコードエリアにある既存の文字をすべて消す<br/>
              4. 下のコードをコピーして貼り付ける<br/>
              5. フロッピーアイコン（または Ctrl+S）で保存<br/>
              <br/>
              <strong>② カレンダーを指定する（任意）</strong><br/>
              コード1行目の <code style={{ background:C.cream2, padding:'1px 4px', borderRadius:3 }}>var CALENDAR_NAME = ''</code> の <code style={{ background:C.cream2, padding:'1px 4px', borderRadius:3 }}>''</code> の中に、使いたいGoogleカレンダーの名前を入力する（例: <code style={{ background:C.cream2, padding:'1px 4px', borderRadius:3 }}>'マイカレンダー'</code>）。空のままにするとデフォルトカレンダーが使われる。<br/>
              <br/>
              <strong>③ カレンダーの権限を承認する</strong><br/>
              6. 画面上部の関数ドロップダウンで <strong>authorizeCalendar</strong> を選択<br/>
              7. 「実行」ボタンを押す → 「権限を確認」ダイアログが出たら「許可」をクリック<br/>
              8. ログに指定したカレンダー名が表示されれば成功<br/>
              <br/>
              <strong>④ ウェブアプリとしてデプロイする</strong><br/>
              9. 右上の「デプロイ」→「新しいデプロイ」をクリック<br/>
              10. 「種類の選択」横の歯車アイコン → 「ウェブアプリ」を選択<br/>
              11. 「実行者」を <strong>自分</strong>、「アクセスできるユーザー」を <strong>全員</strong> に設定<br/>
              12. 「デプロイ」→ 表示されたURLをコピー<br/>
              13. 上の入力欄に貼り付けて「保存」→「テスト送信」で確認
            </div>
            <pre style={{ padding:12, background:C.cream2, borderRadius:8, fontSize:10, color:C.text2, overflowX:'auto', whiteSpace:'pre-wrap', border:`1px solid ${C.border}`, margin:0 }}>{`var CALENDAR_NAME = ''; // タスク用カレンダー名（空=デフォルト）
var EVENT_CALENDAR_NAME = 'こだわりんイベント開催日'; // イベント開催日カレンダー名

function doPost(e) {
  if (!e || !e.postData) return ContentService
    .createTextOutput(JSON.stringify({ ok: false, error: 'no post data' }))
    .setMimeType(ContentService.MimeType.JSON);
  var data = JSON.parse(e.postData.contents);

  if (data.action === 'syncCalendar') {
    var cals = CALENDAR_NAME ? CalendarApp.getCalendarsByName(CALENDAR_NAME) : [];
    var cal = cals.length ? cals[0] : CalendarApp.getDefaultCalendar();
    (data.tasks || []).forEach(function(t) {
      if (!t.due) return;
      var p = t.due.split('-').map(Number);
      var date = new Date(p[0], p[1]-1, p[2]);
      var title = t.title;
      var next = new Date(p[0], p[1]-1, p[2]+1);
      var existing = cal.getEvents(date, next)
        .filter(function(ev){ return ev.getTitle() === title; });
      if (!existing.length) {
        cal.createAllDayEvent(title, date,
          { description: t.project || '' });
      }
    });
    return ContentService
      .createTextOutput(JSON.stringify({ ok: true }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  if (data.action === 'syncEventDates') {
    var eventCals = CalendarApp.getCalendarsByName(EVENT_CALENDAR_NAME);
    var eventCal = eventCals.length ? eventCals[0] : CalendarApp.getDefaultCalendar();
    (data.events || []).forEach(function(ev) {
      if (!ev.date) return;
      var p = ev.date.split('-').map(Number);
      var date = new Date(p[0], p[1]-1, p[2]);
      var next = new Date(p[0], p[1]-1, p[2]+1);
      var existing = eventCal.getEvents(date, next)
        .filter(function(e){ return e.getTitle() === ev.name; });
      if (!existing.length) {
        eventCal.createAllDayEvent(ev.name, date);
      }
    });
    return ContentService
      .createTextOutput(JSON.stringify({ ok: true }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet(e) {
  return ContentService
    .createTextOutput(JSON.stringify({ ok: true }))
    .setMimeType(ContentService.MimeType.JSON);
}

function authorizeCalendar() {
  var cals = CALENDAR_NAME ? CalendarApp.getCalendarsByName(CALENDAR_NAME) : [];
  var cal = cals.length ? cals[0] : CalendarApp.getDefaultCalendar();
  Logger.log('タスクカレンダー: ' + cal.getName());
  var eventCals = CalendarApp.getCalendarsByName(EVENT_CALENDAR_NAME);
  var eventCal = eventCals.length ? eventCals[0] : CalendarApp.getDefaultCalendar();
  Logger.log('イベントカレンダー: ' + eventCal.getName());
}`}</pre>
          </details>
        </div>

        <div style={card}>
          <label style={label}>Workflow — 共有GAS URL</label>
          <div style={{ fontSize:11, color:C.text3, marginBottom:10 }}>全員が同じURLを入力するとWorkflowデータがリアルタイム共有されます。</div>
          <input value={wfGas} onChange={e=>{ setWfGas(e.target.value); setTestResult(''); }} placeholder="https://script.google.com/macros/s/..." style={{ ...inp, marginBottom:10 }}/>
          <button onClick={testWfGas} style={{ padding:'7px 16px', borderRadius:8, border:`1px solid ${C.border}`, background:'transparent', color:C.text2, cursor:'pointer', fontSize:12, fontFamily:"'Noto Sans JP',sans-serif", transition:'all 0.15s' }}
            onMouseEnter={e=>{ e.currentTarget.style.borderColor=C.orange; e.currentTarget.style.color=C.orange; }}
            onMouseLeave={e=>{ e.currentTarget.style.borderColor=C.border; e.currentTarget.style.color=C.text2; }}>
            接続テスト
          </button>
          {testResult && <div style={{ marginTop:8, fontSize:12, color:testResult.startsWith('✓')?C.green:testResult.startsWith('✗')?C.red:C.amber }}>{testResult}</div>}
        </div>

        <button onClick={saveAll} style={{ width:'100%', padding:14, borderRadius:10, border:'none', background:saved?C.green:C.orange, color:'#fff', fontSize:14, fontWeight:600, cursor:'pointer', fontFamily:"'Noto Sans JP',sans-serif", transition:'all 0.3s' }}
          onMouseEnter={e=>e.currentTarget.style.filter='brightness(1.08)'} onMouseLeave={e=>e.currentTarget.style.filter=''}>
          {saved ? '✓ 保存しました' : '保存'}
        </button>

        <div style={{ marginTop:24, ...card }}>
          <label style={{ ...label, color:C.red }}>データリセット</label>
          <div style={{ fontSize:11, color:C.text3, marginBottom:12 }}>ローカルに保存されたデータをすべて削除します。GAS接続中の場合は次回起動時に再取得されます。</div>
          <button onClick={()=>{ if(window.confirm('全データをリセットしますか？')) { localStorage.clear(); window.location.href='/'; } }}
            style={{ padding:'8px 16px', borderRadius:8, border:`1px solid ${C.red}55`, background:'transparent', color:C.red, cursor:'pointer', fontSize:12, fontFamily:"'Noto Sans JP',sans-serif" }}>
            ローカルデータを初期化
          </button>
        </div>

        {isAdmin && (
          <div style={{ marginTop:24 }}>
            <div style={{ fontSize:15, fontWeight:600, color:C.text, marginBottom:14 }}>メンバー管理</div>
            <AdminMembers wfMembers={wfMembers}/>
          </div>
        )}

        <div style={{ marginTop:24, ...card }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <div>
              <div style={{ fontSize:12, color:C.text2 }}>ログイン中: {displayName}</div>
            </div>
            <button onClick={()=>{ logout(); window.location.href='/'; }}
              style={{ padding:'8px 16px', borderRadius:8, border:`1px solid ${C.border}`, background:'transparent', color:C.text2, cursor:'pointer', fontSize:12, fontFamily:"'Noto Sans JP',sans-serif" }}>
              ログアウト
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── useNavigate wrapper for SettingsPage ─────────────────────────────────
function SettingsPageWrapper() {
  return <SettingsPage/>;
}

function PageTitle({ title }) {
  useEffect(() => { document.title = title; }, [title]);
  return null;
}

function AuthGate() {
  const isDev = window.location.hostname.includes('-dev');
  const { firebaseUser, loading, isApproved, userProfile, isAdmin, access } = useAuth();

  // 本番環境（-devがないURL）では認証をスキップ
  if (!isDev) {
    return (
      <Routes>
        <Route path="/" element={<><PageTitle title="Workflow"/><Workflow /></>} />
        <Route path="/timesheet" element={<><PageTitle title="Timesheet"/><Timesheet /></>} />
        <Route path="/settings" element={<><PageTitle title="設定"/><SettingsPageWrapper /></>} />
        <Route path="/distribution-list" element={<><PageTitle title="配布リスト"/><DistributionList /></>} />
      </Routes>
    );
  }

  if (loading) {
    return <div style={{ display:'flex',alignItems:'center',justifyContent:'center',height:'100vh',fontFamily:"'Noto Sans JP',sans-serif",color:'#a89f94' }}>読み込み中...</div>;
  }

  if (!firebaseUser) {
    return <LoginPage />;
  }

  if (userProfile && !isApproved) {
    return (
      <div style={{ display:'flex',alignItems:'center',justifyContent:'center',height:'100vh',fontFamily:"'Noto Sans JP',sans-serif",textAlign:'center',padding:20 }}>
        <div>
          <div style={{ fontSize:40,marginBottom:16 }}>⏳</div>
          <div style={{ fontSize:16,fontWeight:600,color:'#3a3530',marginBottom:12 }}>承認待ち</div>
          <div style={{ fontSize:13,color:'#7a746c',lineHeight:1.8 }}>管理者の承認をお待ちください。</div>
          <button onClick={()=>signOutUser()}
            style={{ marginTop:20,padding:'8px 20px',borderRadius:8,border:'1px solid #ddd8ce',background:'transparent',color:'#7a746c',cursor:'pointer',fontSize:12,fontFamily:"'Noto Sans JP',sans-serif" }}>
            ログアウト
          </button>
        </div>
      </div>
    );
  }

  const noAccess = (
    <div style={{ display:'flex',alignItems:'center',justifyContent:'center',height:'100vh',fontFamily:"'Noto Sans JP',sans-serif",textAlign:'center',padding:20 }}>
      <div>
        <div style={{ fontSize:40,marginBottom:16 }}>🚫</div>
        <div style={{ fontSize:16,fontWeight:600,color:'#3a3530',marginBottom:12 }}>アクセス権限がありません</div>
        <div style={{ fontSize:13,color:'#7a746c',marginBottom:16 }}>管理者にアクセス権の付与を依頼してください。</div>
        <button onClick={()=>signOutUser()}
          style={{ padding:'8px 20px',borderRadius:8,border:'1px solid #ddd8ce',background:'transparent',color:'#7a746c',cursor:'pointer',fontSize:12,fontFamily:"'Noto Sans JP',sans-serif" }}>
          ログアウト
        </button>
      </div>
    </div>
  );

  return (
    <Routes>
      <Route path="/" element={isAdmin || access.workflow ? <><PageTitle title="Workflow"/><Workflow /></> : noAccess} />
      <Route path="/timesheet" element={isAdmin || access.timesheet ? <><PageTitle title="Timesheet"/><Timesheet /></> : noAccess} />
      <Route path="/settings" element={<><PageTitle title="設定"/><SettingsPageWrapper /></>} />
      <Route path="/distribution-list" element={<><PageTitle title="配布リスト"/><DistributionList /></>} />
    </Routes>
  );
}

function signOutUser() {
  import("firebase/auth").then(({ signOut }) => {
    import("./firebase").then(({ auth }) => {
      signOut(auth);
    });
  });
}

function ProductionRoutes() {
  return (
    <Routes>
      <Route path="/" element={<><PageTitle title="Workflow"/><Workflow /></>} />
      <Route path="/timesheet" element={<><PageTitle title="Timesheet"/><Timesheet /></>} />
      <Route path="/settings" element={<><PageTitle title="設定"/><SettingsPageWrapper /></>} />
      <Route path="/distribution-list" element={<><PageTitle title="配布リスト"/><DistributionList /></>} />
    </Routes>
  );
}

export default function App() {
  const isDev = window.location.hostname.includes('-dev');
  return (
    <ErrorBoundary>
      <BrowserRouter>
        {isDev ? (
          <AuthProvider>
            <AuthGate />
          </AuthProvider>
        ) : (
          <ProductionRoutes />
        )}
      </BrowserRouter>
    </ErrorBoundary>
  );
}
