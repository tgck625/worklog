import { useState, useEffect, useRef, useCallback } from "react";
import { BrowserRouter, Routes, Route, useNavigate } from "react-router-dom";
import Timesheet from "./Timesheet";
import NavBar from "./NavBar";
import DistributionList from "./DistributionList";

// ── Colors ──────────────────────────────────────────────────────────────
const C = {
  cream:'#faf8f4', cream2:'#f3f0ea', cream3:'#ece8e0',
  border:'#ddd8ce', border2:'#ccc6bb',
  text:'#3a3530', text2:'#7a746c', text3:'#a89f94',
  orange:'#e07840', orange2:'#c96830', orangeBg:'#fdf0e8', orangeBorder:'#f0c8a8',
  green:'#5a9070', blue:'#5878a0', red:'#b85050', amber:'#c08030',
};
const PALETTE = ['#e07840','#5a9070','#5878a0','#b85050','#c08030','#7870c0','#608090','#9870a0','#6888a8','#a07050'];
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
function Avatar({ name, color, size=24, fs=11 }) {
  return <div style={{ width:size,height:size,borderRadius:'50%',display:'flex',alignItems:'center',justifyContent:'center',fontSize:fs,fontWeight:700,flexShrink:0,background:color+'28',color }}>{name[0]}</div>;
}
function StatusBadge({ status }) {
  const map = { todo:['未着手',C.text3,'#f0ebe2',C.border], doing:['進行中',C.blue,'#edf1f8',C.blue+'55'], done:['完了',C.green,'#edf5f0',C.green+'55'] };
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
function Input({ ...props }) { return <input style={inp} {...props} onFocus={e=>e.target.style.borderColor=C.orange} onBlur={e=>e.target.style.borderColor=C.border} />; }
function Select({ children, ...props }) { return <select style={inp} {...props} onFocus={e=>e.target.style.borderColor=C.orange} onBlur={e=>e.target.style.borderColor=C.border}>{children}</select>; }
function Textarea({ ...props }) { return <textarea style={{ ...inp, resize:'vertical', minHeight:68 }} {...props} onFocus={e=>e.target.style.borderColor=C.orange} onBlur={e=>e.target.style.borderColor=C.border} />; }
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
  const [firstPin, setFirstPin] = useState('');
  const inputRef = useRef(null);

  useEffect(()=>{ if(open){ setPin(''); setErr(''); setSetupStep(1); setFirstPin(''); setTimeout(()=>inputRef.current?.focus(),100); } },[open]);

  function handleChange(v) {
    const digits = v.replace(/\D/g,'').slice(0,4);
    setPin(digits); setErr('');
    if (digits.length===4) setTimeout(()=>submit(digits), 80);
  }

  function submit(p) {
    const stored = localStorage.getItem(PIN_KEY);
    if (mode==='setup' || !stored) {
      if (setupStep===1) { setFirstPin(p); setSetupStep(2); setPin(''); setErr(''); return; }
      if (p===firstPin) { localStorage.setItem(PIN_KEY,p); onSuccess(); onClose(); }
      else { setErr('PINが一致しません'); setPin(''); }
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
    setPin(''); setErr(''); setSetupStep(1); setFirstPin('');
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
  const srcOptions = projects.filter(p => p.id !== currentProjectId);
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
      return { ...t, id: genId(), projectId: currentProjectId, status: 'todo', due, doneAt: undefined };
    });
    onCopy(newTasks);
  }

  return (
    <Modal open={true} onClose={onClose} title="タスクをコピー" maxWidth={480}
      footer={<><Btn onClick={onClose}>キャンセル</Btn><Btn variant="primary" onClick={doCopy}>コピーする</Btn></>}>
      <FG label="コピー元プロジェクト">
        <Select value={srcId} onChange={e=>setSrcId(e.target.value)}>
          <option value="">-- 選択 --</option>
          {srcOptions.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
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
function TaskModal({ open, onClose, data, projects, members, defaultProjectId, defaultStatus, onSave, onDelete, isTsuge }) {
  const [title,setTitle]=useState('');
  const [projectId,setProjectId]=useState('');
  const [assigneeIds,setAssigneeIds]=useState([]);
  const [due,setDue]=useState('');
  const [status,setStatus]=useState('todo');
  const [priority,setPriority]=useState('mid');
  const [memo,setMemo]=useState('');
  const [isPrivate,setIsPrivate]=useState(false);

  useEffect(()=>{
    if(!open) return;
    if(data){ setTitle(data.title); setProjectId(data.projectId); setAssigneeIds(data.assigneeIds||[]); setDue(data.due||''); setStatus(data.status); setPriority(data.priority); setMemo(data.memo||''); setIsPrivate(!!data.isPrivate); }
    else { setTitle(''); setProjectId(defaultProjectId!=='all'?defaultProjectId:(projects[0]?.id||'')); setAssigneeIds([]); setDue(''); setStatus(defaultStatus||'todo'); setPriority('mid'); setMemo(''); setIsPrivate(false); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[open]);

  const selProj = projects.find(p=>p.id===projectId);
  const relLabel = selProj && due ? getRelLabel(selProj, due) : null;

  return (
    <Modal open={open} onClose={onClose} title={data?'タスクを編集':'タスクを追加'}
      footer={<>
        {data && <Btn variant="danger" style={{ marginRight:'auto' }} onClick={()=>{ if(window.confirm('このタスクを削除しますか？')){onDelete(data.id);onClose();} }}>削除</Btn>}
        <Btn onClick={onClose}>キャンセル</Btn>
        <Btn variant="primary" onClick={()=>{ if(!title.trim()){alert('タスク名を入力してください');return;} onSave({id:data?.id||genId(),title:title.trim(),projectId,assigneeIds,due,status,priority,memo,isPrivate}); onClose(); }}>保存</Btn>
      </>}>
      <FG label="タスク名"><Input value={title} onChange={e=>setTitle(e.target.value)} placeholder="タスクの内容を入力" autoFocus/></FG>
      <FG label="プロジェクト">
        <Select value={projectId} onChange={e=>setProjectId(e.target.value)}>
          {projects.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
        </Select>
      </FG>
      <FG label="担当者">
        <div style={{ display:'flex',flexWrap:'wrap',gap:6 }}>
          {members.map(m=>{
            const checked=assigneeIds.includes(m.id);
            return (
              <label key={m.id} style={{ display:'flex',alignItems:'center',gap:5,padding:'5px 10px',borderRadius:999,border:`1px solid ${checked?m.color:C.border}`,background:checked?m.color+'20':'transparent',cursor:'pointer',fontSize:12,color:checked?m.color:C.text2,transition:'all 0.12s' }}>
                <input type="checkbox" checked={checked} onChange={e=>setAssigneeIds(e.target.checked?[...assigneeIds,m.id]:assigneeIds.filter(id=>id!==m.id))} style={{ display:'none' }}/>
                <Avatar name={m.name} color={m.color} size={16} fs={8}/>
                {m.name}
              </label>
            );
          })}
          {members.length===0 && <span style={{ fontSize:12,color:C.text3 }}>メンバーがいません</span>}
        </div>
      </FG>
      <FG label="期日">
        <Input type="date" value={due} onChange={e=>setDue(e.target.value)}/>
        {relLabel && <div style={{ fontSize:11,color:C.orange,marginTop:3 }}>{relLabel}</div>}
      </FG>
      <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:12 }}>
        <FG label="ステータス">
          <Select value={status} onChange={e=>setStatus(e.target.value)}>
            <option value="todo">未着手</option>
            <option value="doing">進行中</option>
            <option value="done">完了</option>
          </Select>
        </FG>
        <FG label="優先度">
          <Select value={priority} onChange={e=>setPriority(e.target.value)}>
            <option value="high">高</option>
            <option value="mid">中</option>
            <option value="low">低</option>
          </Select>
        </FG>
      </div>
      <FG label="メモ"><Textarea value={memo} onChange={e=>setMemo(e.target.value)} placeholder="詳細や備考（任意）"/></FG>
      {isTsuge && (
        <label style={{ display:'flex',alignItems:'center',gap:8,fontSize:12,color:C.text2,cursor:'pointer' }}>
          <input type="checkbox" checked={isPrivate} onChange={e=>setIsPrivate(e.target.checked)}/>
          非公開（柘植のみ表示）
        </label>
      )}
    </Modal>
  );
}

// ── Project Modal ─────────────────────────────────────────────────────────
function ProjectModal({ open, onClose, data, members, onSave, onDelete, isTsuge }) {
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
    else { setType('event'); setName(''); setColor(PALETTE[0]); setIsPrivate(false); setEventDate(''); setVenue(''); setContent(''); setStart(''); setEnd(''); setMemo(''); setLinks([]); setVisibleMemberIds([]); setClosed(false); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[open]);

  const preview = type==='event' ? genEventName(eventDate, venue, content) : name.trim();

  function handleSave() {
    const nm = type==='event' ? genEventName(eventDate,venue,content) : name.trim();
    if(!nm){ alert('プロジェクト名を入力してください'); return; }
    const proj = { id:data?.id||genId(), type, name:nm, color, isPrivate, closed, memo, visibleMemberIds,
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
      {(members||[]).length>0 && (
        <div>
          <label style={{ fontSize:11,fontWeight:600,color:C.text2,letterSpacing:0.3,display:'block',marginBottom:8 }}>表示メンバー（選択したメンバーのみ表示）</label>
          <div style={{ display:'flex',flexWrap:'wrap',gap:8,marginBottom:6 }}>
            {(members||[]).map(m=>{
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
            {visibleMemberIds.length===0 ? '全員が表示（制限なし）' : `${visibleMemberIds.length}名のみ表示。「自分」未設定のユーザーには全て表示されます。`}
          </div>
        </div>
      )}
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
function MemberModal({ open, onClose, onSave }) {
  const [name,setName]=useState('');
  const [color,setColor]=useState(PALETTE[1]);
  useEffect(()=>{ if(open){ setName(''); setColor(PALETTE[1]); } },[open]);
  return (
    <Modal open={open} onClose={onClose} title="メンバーを追加"
      footer={<><Btn onClick={onClose}>キャンセル</Btn><Btn variant="primary" onClick={()=>{ if(!name.trim()){alert('名前を入力してください');return;} onSave({id:genId(),name:name.trim(),color}); onClose(); }}>追加</Btn></>}>
      <FG label="名前"><Input value={name} onChange={e=>setName(e.target.value)} placeholder="メンバーの名前" autoFocus/></FG>
      <FG label="アバターカラー"><ColorSwatchPicker selected={color} onSelect={setColor}/></FG>
    </Modal>
  );
}

// ── Kanban ────────────────────────────────────────────────────────────────
function KanbanView({ tasks, projects, members, onOpenTask, onStatusChange, onAddTask, onDuplicateTask, taskOrder, onReorder, isMobile, onAddTaskWithStatus }) {
  const dragId = useRef(null);
  const dragSourceCol = useRef(null);
  const dragOverCard = useRef(null);
  const statuses = [
    { key:'todo', label:'未着手', color:C.text3 },
    { key:'doing', label:'進行中', color:C.blue },
    { key:'done', label:'完了', color:C.green },
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

  return (
    <div style={{ flex:1,overflowX:'auto',overflowY:'hidden',padding:'16px 24px' }}>
      <div style={{ display:'flex',flexDirection:'row',gap:14,height:'100%',minWidth:'fit-content' }}>
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
                {colTasks.length===0 && st.key!=='todo'
                  ? <div style={{ padding:20,textAlign:'center',color:C.text3,fontSize:12 }}>タスクなし</div>
                  : colTasks.map(t=>{
                    const proj = projects.find(p=>p.id===t.projectId);
                    const taskMembers = (t.assigneeIds||[]).map(id=>members.find(m=>m.id===id)).filter(Boolean);
                    const ds = getDueStyle(t.due);
                    const relLabel = proj && t.due ? getRelLabel(proj,t.due) : null;
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
                        style={{ background:'#fff',border:`1px solid ${C.border}`,borderRadius:10,padding:12,cursor:'pointer',transition:'all 0.12s' }}
                        onMouseEnter={e=>{ e.currentTarget.style.borderColor=C.border2; e.currentTarget.style.transform='translateY(-2px)'; e.currentTarget.style.boxShadow='0 4px 12px rgba(58,53,48,0.1)'; }}
                        onMouseLeave={e=>{ e.currentTarget.style.borderColor=C.border; e.currentTarget.style.transform=''; e.currentTarget.style.boxShadow=''; }}>
                        {proj && <div style={{ fontSize:10,fontWeight:600,letterSpacing:0.3,marginBottom:5,display:'flex',alignItems:'center',gap:4,color:proj.color }}>
                          <div style={{ width:6,height:6,borderRadius:'50%',background:proj.color }}/>{proj.name}
                        </div>}
                        <div style={{ display:'flex',alignItems:'flex-start',gap:5,marginBottom:8 }}>
                          <PriorityDot priority={t.priority}/>
                          <div style={{ fontSize:13,fontWeight:500,color:C.text,lineHeight:1.4,flex:1 }}>{t.title}</div>
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
                            {onDuplicateTask && (
                              <button onClick={e=>{ e.stopPropagation(); onDuplicateTask(t); }}
                                title="複製" style={{ padding:'1px 6px',borderRadius:999,border:`1px solid ${C.border}`,background:C.cream2,color:C.text3,cursor:'pointer',fontSize:10,fontFamily:'inherit',lineHeight:1.5 }}
                                onMouseEnter={e=>{ e.currentTarget.style.borderColor=C.orange; e.currentTarget.style.color=C.orange; }}
                                onMouseLeave={e=>{ e.currentTarget.style.borderColor=C.border; e.currentTarget.style.color=C.text3; }}>
                                ⧉
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
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

// ── List View ─────────────────────────────────────────────────────────────
function ListView({ tasks, projects, members, onOpenTask }) {
  if (!tasks.length) return <div style={{ flex:1,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',color:C.text3,gap:10 }}><div style={{ fontSize:36 }}>📋</div><div style={{ fontSize:14,color:C.text2 }}>タスクがありません</div></div>;
  return (
    <div style={{ flex:1,overflowY:'auto',padding:'16px 24px' }}>
      <table style={{ width:'100%',borderCollapse:'collapse' }}>
        <thead><tr>{['タスク名','プロジェクト','担当者','開催日との関係','期日','ステータス'].map(h=>(
          <th key={h} style={{ textAlign:'left',fontSize:10,fontWeight:600,color:C.text3,letterSpacing:0.5,textTransform:'uppercase',padding:'8px 12px',borderBottom:`1px solid ${C.border}`,whiteSpace:'nowrap' }}>{h}</th>
        ))}</tr></thead>
        <tbody>{tasks.map(t=>{
          const pj=projects.find(p=>p.id===t.projectId);
          const mbs=(t.assigneeIds||[]).map(id=>members.find(m=>m.id===id)).filter(Boolean);
          const ds=getDueStyle(t.due);
          const rel=pj&&t.due?getRelLabel(pj,t.due):null;
          return (
            <tr key={t.id} onClick={()=>onOpenTask(t)} style={{ cursor:'pointer' }}
              onMouseEnter={e=>Array.from(e.currentTarget.cells).forEach(td=>td.style.background=C.cream2)}
              onMouseLeave={e=>Array.from(e.currentTarget.cells).forEach(td=>td.style.background='')}>
              <td style={{ padding:'10px 12px',borderBottom:`1px solid ${C.border}` }}><div style={{ display:'flex',alignItems:'center',gap:6 }}><PriorityDot priority={t.priority}/>{t.title}{t.isPrivate&&<span style={{ fontSize:9,color:C.orange,background:C.orangeBg,border:`1px solid ${C.orangeBorder}`,padding:'1px 5px',borderRadius:999 }}>🔐</span>}</div></td>
              <td style={{ padding:'10px 12px',borderBottom:`1px solid ${C.border}` }}>{pj?<span style={{ color:pj.color,fontSize:12 }}>● {pj.name}</span>:<span style={{ color:C.text3 }}>-</span>}</td>
              <td style={{ padding:'10px 12px',borderBottom:`1px solid ${C.border}` }}>{mbs.length>0?<div style={{ display:'flex',alignItems:'center',gap:4 }}>{mbs.map(m=><div key={m.id} style={{ display:'flex',alignItems:'center',gap:4,marginRight:4 }}><Avatar name={m.name} color={m.color} size={18}/><span style={{ fontSize:12 }}>{m.name}</span></div>)}</div>:<span style={{ color:C.text3 }}>-</span>}</td>
              <td style={{ padding:'10px 12px',borderBottom:`1px solid ${C.border}` }}>{rel?<span style={{ fontSize:11,color:C.text3,background:C.cream3,padding:'2px 7px',borderRadius:999 }}>{rel}</span>:'-'}</td>
              <td style={{ padding:'10px 12px',borderBottom:`1px solid ${C.border}` }}>
                {t.due?(()=>{
                  const doneOverdue = getDoneOverdue(t);
                  if (t.status==='done') {
                    return <span style={{ fontSize:11,padding:'2px 7px',borderRadius:999,background:C.cream2,color:C.text3,border:`1px solid ${C.border}` }}>{fmtDate(t.due)}{doneOverdue ? ` (${doneOverdue})` : ''}</span>;
                  }
                  return <span style={{ fontSize:11,padding:'2px 7px',borderRadius:999,background:ds.bg,color:ds.color,border:`1px solid ${ds.border}` }}>{fmtDate(t.due)}{ds.overdue?` (${ds.overdue}日超過)`:''}</span>;
                })():<span style={{ color:C.text3 }}>-</span>}
              </td>
              <td style={{ padding:'10px 12px',borderBottom:`1px solid ${C.border}` }}><StatusBadge status={t.status}/></td>
            </tr>
          );
        })}</tbody>
      </table>
    </div>
  );
}

// ── Member View ───────────────────────────────────────────────────────────
function MemberView({ tasks, projects, members, memberFilter, onOpenTask, isMobile }) {
  const show = memberFilter==='all' ? members : members.filter(m=>m.id===memberFilter);
  if (!show.length) return <div style={{ flex:1,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',color:C.text3,gap:10 }}><div style={{ fontSize:36 }}>👥</div></div>;
  if (isMobile) return (
    <div style={{ overflowX:'auto',overflowY:'visible',padding:'16px 16px',display:'flex',flexDirection:'row',gap:14,alignItems:'flex-start' }}>
      {show.map(m=>{
        const mt=tasks.filter(t=>(t.assigneeIds||[]).includes(m.id));
        const todoCount=mt.filter(t=>t.status==='todo').length;
        const doingCount=mt.filter(t=>t.status==='doing').length;
        const doneCount=mt.filter(t=>t.status==='done').length;
        return (
          <div key={m.id} style={{ width:280,flexShrink:0,background:'#fff',border:`1px solid ${C.border}`,borderRadius:14,overflow:'hidden' }}>
            <div style={{ padding:'12px 16px',borderBottom:`1px solid ${C.border}`,display:'flex',alignItems:'center',gap:10 }}>
              <Avatar name={m.name} color={m.color} size={32} fs={14}/>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:14,fontWeight:600,color:C.text }}>{m.name}</div>
                <div style={{ display:'flex',gap:8,marginTop:3 }}>
                  <span style={{ fontSize:10,color:C.text3 }}>未着手 <strong style={{ color:C.text2 }}>{todoCount}</strong></span>
                  <span style={{ fontSize:10,color:C.blue }}>進行中 <strong>{doingCount}</strong></span>
                  <span style={{ fontSize:10,color:C.green }}>完了 <strong>{doneCount}</strong></span>
                </div>
              </div>
            </div>
            <div style={{ padding:8,display:'flex',flexDirection:'column',gap:3,maxHeight:320,overflowY:'auto' }}>
              {mt.length===0 ? <div style={{ padding:14,textAlign:'center',color:C.text3,fontSize:12 }}>タスクなし</div>
                : mt.map(t=>{
                  const pj=projects.find(p=>p.id===t.projectId);
                  const ds=getDueStyle(t.due);
                  return (
                    <div key={t.id} onClick={()=>onOpenTask(t)} style={{ display:'flex',flexDirection:'column',gap:3,padding:'8px 10px',borderRadius:8,cursor:'pointer',transition:'background 0.1s',borderLeft:`3px solid ${pj?.color||C.border}` }}
                      onMouseEnter={e=>e.currentTarget.style.background=C.cream2}
                      onMouseLeave={e=>e.currentTarget.style.background=''}>
                      <div style={{ fontSize:13,color:C.text,fontWeight:500 }}>{t.title}</div>
                      {pj && <div style={{ fontSize:11,color:pj.color }}>● {pj.name}</div>}
                      {t.due && <div style={{ fontSize:11,padding:'1px 6px',borderRadius:999,background:ds.bg,color:ds.color,border:`1px solid ${ds.border}`,alignSelf:'flex-start' }}>{fmtDate(t.due)}</div>}
                    </div>
                  );
                })}
            </div>
          </div>
        );
      })}
    </div>
  );
  return (
    <div style={{ flex:1,overflowY:'auto',padding:'16px 24px',display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(320px,1fr))',gap:16,alignContent:'start' }}>
      {show.map(m=>{
        const mt=tasks.filter(t=>(t.assigneeIds||[]).includes(m.id));
        const todoCount=mt.filter(t=>t.status==='todo').length;
        const doingCount=mt.filter(t=>t.status==='doing').length;
        const doneCount=mt.filter(t=>t.status==='done').length;
        return (
          <div key={m.id} style={{ background:'#fff',border:`1px solid ${C.border}`,borderRadius:14,overflow:'hidden' }}>
            <div style={{ padding:'12px 16px',borderBottom:`1px solid ${C.border}`,display:'flex',alignItems:'center',gap:10 }}>
              <Avatar name={m.name} color={m.color} size={32} fs={14}/>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:14,fontWeight:600,color:C.text }}>{m.name}</div>
                <div style={{ display:'flex',gap:8,marginTop:3 }}>
                  <span style={{ fontSize:10,color:C.text3 }}>未着手 <strong style={{ color:C.text2 }}>{todoCount}</strong></span>
                  <span style={{ fontSize:10,color:C.blue }}>進行中 <strong>{doingCount}</strong></span>
                  <span style={{ fontSize:10,color:C.green }}>完了 <strong>{doneCount}</strong></span>
                </div>
              </div>
            </div>
            <div style={{ padding:8,display:'flex',flexDirection:'column',gap:3,maxHeight:280,overflowY:'auto' }}>
              {mt.length===0 ? <div style={{ padding:14,textAlign:'center',color:C.text3,fontSize:12 }}>タスクなし</div>
                : mt.map(t=>{
                  const pj=projects.find(p=>p.id===t.projectId);
                  const ds=getDueStyle(t.due);
                  return (
                    <div key={t.id} onClick={()=>onOpenTask(t)} style={{ display:'flex',flexDirection:'column',gap:3,padding:'8px 10px',borderRadius:8,cursor:'pointer',transition:'background 0.1s',borderLeft:`3px solid ${pj?.color||C.border}` }}
                      onMouseEnter={e=>e.currentTarget.style.background=C.cream2}
                      onMouseLeave={e=>e.currentTarget.style.background=''}>
                      <div style={{ display:'flex',alignItems:'center',gap:6 }}>
                        <StatusBadge status={t.status}/>
                        <span style={{ flex:1,fontSize:12,color:C.text,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>{t.title}</span>
                        {t.due && <span style={{ fontSize:10,padding:'2px 6px',borderRadius:999,background:ds.bg,color:ds.color,border:`1px solid ${ds.border}`,whiteSpace:'nowrap' }}>{fmtDate(t.due)}{ds.overdue?` +${ds.overdue}d`:''}</span>}
                      </div>
                      {pj && <div style={{ fontSize:10,color:pj.color,paddingLeft:2 }}>● {pj.name}</div>}
                    </div>
                  );
                })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── App ───────────────────────────────────────────────────────────────────
function Workflow() {
  const [data, setData] = useState(()=>loadData());
  const [tab, setTab] = useState('tasks');
  const [projFilter, setProjFilter] = useState(() => { try { return localStorage.getItem('wf_projFilter') || 'all'; } catch { return 'all'; } });
  const setProjFilterSaved = (v) => { setProjFilter(v); try { localStorage.setItem('wf_projFilter', v); } catch {} };
  const [view, setView] = useState('kanban');
  const [memberFilter, setMemberFilter] = useState('all');
  const [isTsuge, setIsTsuge] = useState(false);
  const [myMemberId, setMyMemberId] = useState(() => { try { return localStorage.getItem('wf_myMemberId') || ''; } catch { return ''; } });
  const setMyMemberIdSaved = v => { setMyMemberId(v); try { localStorage.setItem('wf_myMemberId', v); } catch {} };
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  // 他タブ（eventstaff-shift等）でlocalStorage変更があったら即反映
  useEffect(() => {
    const handler = (e) => {
      if (e.key === KEY) setData(loadData());
    };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }, []);

  const [taskModal, setTaskModal] = useState({ open:false, data:null, defaultStatus:'todo' });
  const [projModal, setProjModal] = useState({ open:false, data:null });
  const [memberModal, setMemberModal] = useState(false);
  const [pinModal, setPinModal] = useState({ open:false, mode:'unlock' });
  const [dupModal, setDupModal] = useState({ open:false, project:null });
  const [copyTasksModal, setCopyTasksModal] = useState(false);
  const [taskOrder, setTaskOrder] = useState(() => { try { const v = localStorage.getItem('wf_taskOrder'); return v ? JSON.parse(v) : {}; } catch { return {}; } });

  // ── GAS Sync ────────────────────────────────────────────────────────────
  const [wfGasUrl] = useState(() => { try { return localStorage.getItem('wf_gasUrl') || ''; } catch { return ''; } });
  const [syncStatus, setSyncStatus] = useState('');
  const [lastSyncedAt, setLastSyncedAt] = useState(null);
  const syncVersionRef = useRef(0);
  const pushTimerRef = useRef(null);
  const wfGasUrlRef = useRef(wfGasUrl);
  useEffect(() => { wfGasUrlRef.current = wfGasUrl; }, [wfGasUrl]);

  const fetchFromGAS = useCallback(async (url) => {
    try {
      const res = await fetch(`${url}?action=getWorkflowData`);
      const json = await res.json();
      if (json.ok) {
        setLastSyncedAt(new Date());
        if (json.data && json.version > syncVersionRef.current) {
          syncVersionRef.current = json.version;
          // es_ev_ プロジェクト（eventstaff-shiftで作成）はGAS上書きから保護
          const local = loadData();
          const localEsProjs = (local.projects||[]).filter(p => String(p.id).startsWith('es_ev_'));
          const localEsTasks = (local.tasks||[]).filter(t => String(t.projectId).startsWith('es_ev_'));
          const gasProjs = (json.data.projects||[]).filter(p => !String(p.id).startsWith('es_ev_'));
          const gasTasks = (json.data.tasks||[]).filter(t => !String(t.projectId).startsWith('es_ev_'));
          const merged = { ...json.data, projects: [...gasProjs, ...localEsProjs], tasks: [...gasTasks, ...localEsTasks] };
          setData(merged);
          saveData(merged);
        }
      }
    } catch {}
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
    const url = wfGasUrlRef.current;
    if (!url) return;
    clearTimeout(pushTimerRef.current);
    setSyncStatus('pending');
    pushTimerRef.current = setTimeout(async () => {
      setSyncStatus('syncing');
      try {
        const res = await fetch(url, { method: 'POST', body: JSON.stringify({ action: 'saveWorkflowData', data: d }) });
        const json = await res.json();
        if (json.ok) {
          syncVersionRef.current = json.version;
          setLastSyncedAt(new Date());
          setSyncStatus('synced');
          setTimeout(() => setSyncStatus(''), 3000);
        } else { setSyncStatus('error'); }
      } catch { setSyncStatus('error'); }
    }, 1500);
  }

  const update = useCallback((d)=>{ setData(d); saveData(d); schedulePush(d); }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
  function changeStatus(id, status) {
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
    const projects = data.projects.find(x=>x.id===p.id) ? data.projects.map(x=>x.id===p.id?p:x) : [...data.projects,p];
    update({ ...data, projects });
  }
  function deleteProject(id) {
    if(projFilter===id) setProjFilterSaved('all');
    update({ ...data, projects:data.projects.filter(p=>p.id!==id), tasks:data.tasks.filter(t=>t.projectId!==id) });
  }
  function saveMember(m) { update({ ...data, members:[...data.members,m] }); }
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
    const newTask = { ...t, id:genId(), title:t.title+' (コピー)', status:'todo' };
    update({ ...data, tasks:[...data.tasks, newTask] });
  }

  // Visible projects (hide private unless Tsuge)
  const visibleProjects = data.projects.filter(p => {
    if (p.isPrivate && !isTsuge) return false;
    if (!isTsuge && p.visibleMemberIds && p.visibleMemberIds.length > 0 && myMemberId) {
      return p.visibleMemberIds.includes(myMemberId);
    }
    return true;
  });
  const activeProjects = visibleProjects.filter(p=>!p.closed);
  const closedProjects = visibleProjects.filter(p=>p.closed).sort((a,b)=>(b.eventDate||b.end||'').localeCompare(a.eventDate||a.end||''));
  const eventProjects = activeProjects.filter(p=>p.type==='event').sort((a,b)=>(a.eventDate||'').localeCompare(b.eventDate||''));
  const otherProjects = activeProjects.filter(p=>p.type!=='event');

  const closedProjectIds = new Set(closedProjects.map(p=>p.id));
  const filteredTasks = data.tasks
    .filter(t=>{ const pj=data.projects.find(p=>p.id===t.projectId); return pj?(!pj.isPrivate||isTsuge):true; })
    .filter(t=>!t.isPrivate||isTsuge)
    .filter(t=>projFilter==='all'?!closedProjectIds.has(t.projectId):t.projectId===projFilter)
    .filter(t=>memberFilter==='all'||(t.assigneeIds||[]).includes(memberFilter));

  const projName = projFilter==='all' ? 'すべてのプロジェクト' : (visibleProjects.find(p=>p.id===projFilter)?.name||'');

  return (
    <div style={{ height:'100vh',background:C.cream,color:C.text,fontFamily:"'Noto Sans JP',sans-serif",fontSize:13,display:'flex',flexDirection:'column',overflow:'hidden' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@300;400;500;600&family=Playfair+Display:ital@0;1&display=swap');
        * { box-sizing:border-box; margin:0; padding:0; }
        ::-webkit-scrollbar { width:5px; height:5px; }
        ::-webkit-scrollbar-track { background:transparent; }
        ::-webkit-scrollbar-thumb { background:${C.cream3}; border-radius:3px; }
        select option { background:#fff; }
        input[type="date"]::-webkit-calendar-picker-indicator { opacity:0.5; cursor:pointer; }
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
          {wfGasUrl && <span style={{ fontSize:10, color:syncStatus==='error'?C.red:syncStatus==='syncing'||syncStatus==='pending'?C.amber:C.text3, transition:'color 0.3s', whiteSpace:'nowrap' }}>
            {syncStatus==='syncing'?'⟳ 同期中…':syncStatus==='pending'?'…':syncStatus==='error'?'⚠ 同期失敗':lastSyncedAt?`✓ ${lastSyncedAt.getHours().toString().padStart(2,'0')}:${lastSyncedAt.getMinutes().toString().padStart(2,'0')} 同期済`:'接続中…'}
          </span>}
          {data.members.length>0 && (
            <select value={myMemberId} onChange={e=>setMyMemberIdSaved(e.target.value)}
              style={{ padding:'5px 10px',borderRadius:999,border:`1px solid ${myMemberId?C.blue:C.border}`,background:myMemberId?C.blue+'18':'transparent',color:myMemberId?C.blue:C.text2,fontSize:11,fontFamily:'inherit',cursor:'pointer',outline:'none',maxWidth:120 }}>
              <option value="">👤 自分を設定</option>
              {data.members.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
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
            {/* All */}
            <SidebarItem label="すべて" color={C.text3} count={data.tasks.filter(t=>!closedProjectIds.has(t.projectId)).length} active={projFilter==='all'} onClick={()=>{ setProjFilterSaved('all'); if(isMobile) setSidebarOpen(false); }}/>

            {/* Events */}
            {eventProjects.length>0 && <>
              <div style={{ fontSize:10,fontWeight:700,letterSpacing:1,color:C.text3,textTransform:'uppercase',padding:'12px 4px 6px' }}>イベント</div>
              {eventProjects.map(p=><SidebarItem key={p.id} label={p.name} color={p.color} count={data.tasks.filter(t=>t.projectId===p.id).length} active={projFilter===p.id} onClick={()=>{ setProjFilterSaved(p.id); if(isMobile) setSidebarOpen(false); }} onContextMenu={e=>{ e.preventDefault(); setProjModal({open:true,data:p}); }} isPrivate={p.isPrivate} restricted={p.visibleMemberIds&&p.visibleMemberIds.length>0}/>)}
            </>}

            {/* Other */}
            {otherProjects.length>0 && <>
              <div style={{ fontSize:10,fontWeight:700,letterSpacing:1,color:C.text3,textTransform:'uppercase',padding:'12px 4px 6px' }}>その他</div>
              {otherProjects.map(p=><SidebarItem key={p.id} label={p.name} color={p.color} count={data.tasks.filter(t=>t.projectId===p.id).length} active={projFilter===p.id} onClick={()=>{ setProjFilterSaved(p.id); if(isMobile) setSidebarOpen(false); }} onContextMenu={e=>{ e.preventDefault(); setProjModal({open:true,data:p}); }} isPrivate={p.isPrivate} restricted={p.visibleMemberIds&&p.visibleMemberIds.length>0}/>)}
            </>}

            {/* Closed */}
            {closedProjects.length>0 && <>
              <div style={{ fontSize:10,fontWeight:700,letterSpacing:1,color:C.text3,textTransform:'uppercase',padding:'12px 4px 6px',opacity:0.6 }}>終了したプロジェクト</div>
              {closedProjects.map(p=><SidebarItem key={p.id} label={p.name} color={C.text3} count={data.tasks.filter(t=>t.projectId===p.id).length} active={projFilter===p.id} onClick={()=>{ setProjFilterSaved(p.id); if(isMobile) setSidebarOpen(false); }} onContextMenu={e=>{ e.preventDefault(); setProjModal({open:true,data:p}); }} isPrivate={p.isPrivate} restricted={p.visibleMemberIds&&p.visibleMemberIds.length>0}/>)}
            </>}

            <button onClick={()=>setProjModal({open:true,data:null})} style={{ display:'flex',alignItems:'center',gap:5,width:'100%',padding:'8px 10px',borderRadius:10,border:`1.5px dashed ${C.border}`,background:'transparent',color:C.text3,cursor:'pointer',fontSize:11,fontFamily:'inherit',marginTop:10,transition:'all 0.12s' }}
              onMouseEnter={e=>{ e.currentTarget.style.borderColor=C.orange; e.currentTarget.style.color=C.orange; e.currentTarget.style.background=C.orangeBg; }}
              onMouseLeave={e=>{ e.currentTarget.style.borderColor=C.border; e.currentTarget.style.color=C.text3; e.currentTarget.style.background='transparent'; }}>
              ＋ プロジェクト追加
            </button>
          </div>
          {data.members.find(m=>m.id===myMemberId&&m.name.includes('柘植')) && (
            <div style={{ marginTop:'auto',padding:'12px 14px',borderTop:`1px solid ${C.border}` }}>
              <button onClick={()=>{ if(isTsuge){setIsTsuge(false);} else { const pin=localStorage.getItem(PIN_KEY); setPinModal({open:true,mode:pin?'unlock':'setup'}); } }}
                style={{ background:'none',border:'none',cursor:'pointer',fontSize:11,opacity:isTsuge?0.45:0.18,padding:0,color:C.text3,fontFamily:'inherit',display:'flex',alignItems:'center',gap:4 }}>
                {isTsuge?'🔓':'🔒'}<span style={{ fontSize:10 }}>{isTsuge?'管理中':'管理'}</span>
              </button>
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
                    <button key={v} onClick={()=>setView(v)} style={{ padding:'5px 11px',borderRadius:999,border:'none',background:view===v?'#fff':'transparent',color:view===v?C.orange:C.text2,cursor:'pointer',fontSize:12,fontFamily:'inherit',fontWeight:view===v?500:400,boxShadow:view===v?'0 1px 3px rgba(58,53,48,0.12)':'none',transition:'all 0.12s' }}>{l}</button>
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
                  {data.members.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}
                </Select>
              </div>
            </div>
            {projFilter !== 'all' && (()=>{
              const _pj = visibleProjects.find(p=>p.id===projFilter);
              if (!_pj || (!_pj.memo && !(_pj.links?.length>0))) return null;
              return (
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
              );
            })()}
            {view==='kanban' && <KanbanView tasks={filteredTasks} projects={visibleProjects} members={data.members} onOpenTask={t=>setTaskModal({open:true,data:t,defaultStatus:'todo'})} onStatusChange={changeStatus} onAddTask={()=>setTaskModal({open:true,data:null,defaultStatus:'todo'})} onAddTaskWithStatus={s=>setTaskModal({open:true,data:null,defaultStatus:s})} onDuplicateTask={duplicateTask} taskOrder={taskOrder} onReorder={reorderTask} isMobile={isMobile}/>}
            {view==='list' && <ListView tasks={filteredTasks} projects={visibleProjects} members={data.members} onOpenTask={t=>setTaskModal({open:true,data:t})}/>}
            {view==='member' && <MemberView tasks={filteredTasks} projects={visibleProjects} members={data.members} memberFilter={memberFilter} onOpenTask={t=>setTaskModal({open:true,data:t})} isMobile={isMobile}/>}
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
                  : data.members.map(m=>(
                    <div key={m.id} style={{ display:'flex',alignItems:'center',gap:12,padding:'12px 14px',border:`1px solid ${C.border}`,borderRadius:12,background:'#fff',marginBottom:8 }}>
                      <Avatar name={m.name} color={m.color} size={32} fs={14}/>
                      <div style={{ flex:1 }}>
                        <div style={{ fontSize:13,fontWeight:600,color:C.text }}>{m.name}</div>
                        <div style={{ fontSize:11,color:C.text3 }}>{data.tasks.filter(t=>(t.assigneeIds||[]).includes(m.id)).length}件のタスク</div>
                      </div>
                      <Btn variant="danger" small onClick={()=>{ if(window.confirm('このメンバーを削除しますか？')) deleteMember(m.id); }}>削除</Btn>
                    </div>
                  ))}
              </div>
              {data.members.length > 0 && (<>
                <div style={{ padding:'8px 24px',fontSize:11,fontWeight:700,color:C.text3,letterSpacing:1,textTransform:'uppercase',borderTop:`1px solid ${C.border}` }}>タスク状況</div>
                <MemberView tasks={filteredTasks} projects={visibleProjects} members={data.members} memberFilter="all" onOpenTask={t=>setTaskModal({open:true,data:t})} isMobile={isMobile}/>
              </>)}
            </div>
          </>)}

        </div>
      </div>

      {/* ── Modals ── */}
      <TaskModal open={taskModal.open} onClose={()=>setTaskModal({open:false,data:null,defaultStatus:'todo'})} data={taskModal.data} projects={visibleProjects} members={data.members} defaultProjectId={projFilter} defaultStatus={taskModal.defaultStatus} onSave={saveTask} onDelete={deleteTask} isTsuge={isTsuge}/>
      <ProjectModal open={projModal.open} onClose={()=>setProjModal({open:false,data:null})} data={projModal.data} members={data.members} onSave={saveProject} onDelete={deleteProject} isTsuge={isTsuge}/>
      <MemberModal open={memberModal} onClose={()=>setMemberModal(false)} onSave={saveMember}/>
      <PINModal open={pinModal.open} onClose={()=>setPinModal({open:false,mode:'unlock'})} mode={pinModal.mode}
        onSuccess={()=>{ if(pinModal.mode==='unlock') setIsTsuge(true); }}/>
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

function SidebarItem({ label, color, count, active, onClick, onContextMenu, isPrivate, restricted }) {
  return (
    <div onClick={onClick} onContextMenu={onContextMenu} style={{ display:'flex',alignItems:'center',gap:8,padding:'8px 10px',borderRadius:10,cursor:'pointer',background:active?C.orangeBg:'transparent',transition:'all 0.12s',marginBottom:2 }}
      onMouseEnter={e=>{ if(!active) e.currentTarget.style.background=C.cream2; }}
      onMouseLeave={e=>{ if(!active) e.currentTarget.style.background='transparent'; }}>
      <div style={{ width:7,height:7,borderRadius:'50%',background:color,flexShrink:0 }}/>
      <span style={{ fontSize:12,fontWeight:active?600:400,color:active?C.orange:C.text,flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>{label}</span>
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
      const res = await fetch(`${wfGas}?action=getWorkflowData`);
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
        <button onClick={()=>navigate(-1)} style={{ background:'none', border:'none', cursor:'pointer', fontSize:18, color:C.text2, padding:'4px 6px', borderRadius:8, lineHeight:1 }}
          onMouseEnter={e=>e.currentTarget.style.color=C.orange} onMouseLeave={e=>e.currentTarget.style.color=C.text2}>←</button>
        <span style={{ fontSize:15, fontWeight:600, color:C.text }}>設定</span>
        {saved && <span style={{ fontSize:12, color:C.green, marginLeft:'auto' }}>{saved}</span>}
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
            <pre style={{ padding:12, background:C.cream2, borderRadius:8, fontSize:10, color:C.text2, overflowX:'auto', whiteSpace:'pre-wrap', border:`1px solid ${C.border}`, margin:0 }}>{`var CALENDAR_NAME = ''; // 例: 'マイカレンダー'。空のままでデフォルト。

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
}

function doGet(e) {
  return ContentService
    .createTextOutput(JSON.stringify({ ok: true }))
    .setMimeType(ContentService.MimeType.JSON);
}

function authorizeCalendar() {
  var cals = CALENDAR_NAME ? CalendarApp.getCalendarsByName(CALENDAR_NAME) : [];
  var cal = cals.length ? cals[0] : CalendarApp.getDefaultCalendar();
  Logger.log('使用カレンダー: ' + cal.getName());
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

        <button onClick={saveAll} style={{ width:'100%', padding:14, borderRadius:10, border:'none', background:C.orange, color:'#fff', fontSize:14, fontWeight:600, cursor:'pointer', fontFamily:"'Noto Sans JP',sans-serif", transition:'filter 0.15s' }}
          onMouseEnter={e=>e.currentTarget.style.filter='brightness(1.08)'} onMouseLeave={e=>e.currentTarget.style.filter=''}>
          保存
        </button>

        <div style={{ marginTop:24, ...card }}>
          <label style={{ ...label, color:C.red }}>データリセット</label>
          <div style={{ fontSize:11, color:C.text3, marginBottom:12 }}>ローカルに保存されたデータをすべて削除します。GAS接続中の場合は次回起動時に再取得されます。</div>
          <button onClick={()=>{ if(window.confirm('全データをリセットしますか？')) { localStorage.clear(); window.location.href='/'; } }}
            style={{ padding:'8px 16px', borderRadius:8, border:`1px solid ${C.red}55`, background:'transparent', color:C.red, cursor:'pointer', fontSize:12, fontFamily:"'Noto Sans JP',sans-serif" }}>
            ローカルデータを初期化
          </button>
        </div>
      </div>
    </div>
  );
}

// ── useNavigate wrapper for SettingsPage ─────────────────────────────────
function SettingsPageWrapper() {
  return <SettingsPage/>;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Workflow />} />
        <Route path="/timesheet" element={<Timesheet />} />
        <Route path="/settings" element={<SettingsPageWrapper />} />
        <Route path="/distribution-list" element={<DistributionList />} />
      </Routes>
    </BrowserRouter>
  );
}
