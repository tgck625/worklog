import { useState, useEffect, useRef } from "react";
import NavBar from "./NavBar";

const GAS_URL = "https://script.google.com/macros/s/AKfycbwrH1MPcKI1vWDT5Os4hheC0rx-vz0AhY_OVfifigopdxYtKOi4aWm_o2yV9ARAwNOK/exec";

const COLORS = ["#FF8C42","#F76E6E","#4FC48A","#F7C34F","#B47FF7","#F7914F","#4FD6F7","#F74FA8"];

const DEFAULT_TASKS = [
  "作り手との日程調整",
  "作り手打ち合わせ",
  "マニュアル作成更新",
  "紙芝居作成",
  "会場とのやりとり",
  "チラシ作成",
  "LINE配信",
  "Instagram配信",
  "予約管理",
  "当日イベント運営",
  "印刷・パウチ",
  "社内打ち合わせ",
];

function formatDurationShort(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function formatDate(dateStr) {
  const d = new Date(dateStr);
  return `${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}`;
}

function formatDateTime(dateStr) {
  const d = new Date(dateStr);
  return `${formatDate(dateStr)} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}

function getMonthKey(dateStr) {
  const d = new Date(dateStr);
  return `${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}`;
}

function loadLS(key, fallback) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
}
function saveLS(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}
async function fetchFromGAS(url, action) {
  try {
    const res = await fetch(url + "?action=" + action, { redirect: "follow" });
    return await res.json();
  } catch { return null; }
}
async function postToGAS(url, payload) {
  try {
    await fetch(url, { method: "POST", body: JSON.stringify(payload), redirect: "follow" });
    return true;
  } catch { return false; }
}


function getWorkflowDueDateStyle(dueDateStr) {
  if (!dueDateStr) return { color: "#999999", label: null };
  const due = new Date(dueDateStr);
  due.setHours(0, 0, 0, 0);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const diff = Math.round((due - now) / (1000 * 60 * 60 * 24));
  if (diff < 0) return { color: "#F76E6E", label: `${Math.abs(diff)}日超過` };
  if (diff === 0) return { color: "#C04000", label: "今日" };
  if (diff === 1) return { color: "#FF8C42", label: "明日" };
  if (diff <= 3) return { color: "#F7A825", label: `${diff}日後` };
  if (diff <= 7) return { color: "#8BAD30", label: `${diff}日後` };
  return { color: "#999999", label: `${diff}日後` };
}


export default function Timesheet() {
  const [projects, setProjects] = useState(() => loadLS("wl_projects", []));
  const [selectedProject, setSelectedProject] = useState("");

  const [tasks, setTasks] = useState(() => {
    const saved = loadLS("wl_tasks", []);
    const merged = [...DEFAULT_TASKS];
    saved.forEach(t => { if (!merged.includes(t)) merged.push(t); });
    return merged;
  });
  const [selectedTask, setSelectedTask] = useState("");

  const [logs, setLogs] = useState([]);
  const [deletedIds, setDeletedIds] = useState([]);
  const [running, setRunning] = useState(false);
  const [paused, setPaused] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [startTime, setStartTime] = useState(null);
  const [activeTab, setActiveTab] = useState("timer");
  const [exportStatus, setExportStatus] = useState(null);
  const [exportedIds, setExportedIds] = useState(() => new Set(loadLS("wl_exportedIds", [])));
  const [lastDeleted, setLastDeleted] = useState([]);
  const [updatedNoteIds, setUpdatedNoteIds] = useState(new Set());
  const [savedLogs, setSavedLogs] = useState([]);
  const [editingNote, setEditingNote] = useState(null);
  const [savedLogNotes, setSavedLogNotes] = useState({});
  const [preNote, setPreNote] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);
  const [addMode, setAddMode] = useState(""); // "event" | "other"
  const [addProject, setAddProject] = useState("");
  const [addEventDate, setAddEventDate] = useState("");
  const [addVenue, setAddVenue] = useState("");
  const [addContent, setAddContent] = useState("");
  const [addTask, setAddTask] = useState("");
  const [addDueDate, setAddDueDate] = useState("");
  const [addMinutes, setAddMinutes] = useState("");
  const [addNote, setAddNote] = useState("");
  const [addStatus, setAddStatus] = useState("todo");
  const [customTask, setCustomTask] = useState("");
  const [hiddenTasks, setHiddenTasks] = useState(() => loadLS("wl_hidden_tasks", []));
  const [taskEditMode, setTaskEditMode] = useState(false);
  const [showAllLogs, setShowAllLogs] = useState(false);
  const [logShowForm, setLogShowForm] = useState(false);
  const [logFromWf, setLogFromWf] = useState(false);
  const [logMode, setLogMode] = useState("");
  const [logProject, setLogProject] = useState("");
  const [logTask, setLogTask] = useState("");
  const [logCustomTask, setLogCustomTask] = useState("");
  const [logStartTime, setLogStartTime] = useState("");
  const [logEndTime, setLogEndTime] = useState("");
  const [logNote, setLogNote] = useState("");

  useEffect(() => { saveLS("wl_projects", projects); }, [projects]);
  useEffect(() => { saveLS("wl_tasks", tasks); }, [tasks]);
  useEffect(() => { saveLS("wl_logs", logs); }, [logs]);
  useEffect(() => { saveLS("wl_selectedProject", selectedProject); }, [selectedProject]);
  useEffect(() => { saveLS("wl_selectedTask", selectedTask); }, [selectedTask]);
  useEffect(() => { saveLS("wl_exportedIds", [...exportedIds]); }, [exportedIds]);
  useEffect(() => { saveLS("wl_deletedIds", deletedIds); }, [deletedIds]);
  useEffect(() => { saveLS("wl_hidden_tasks", hiddenTasks); }, [hiddenTasks]);

  // eslint-disable-next-line no-unused-vars
  const [userName] = useState(() => loadLS("wl_userName", ""));
  const [myMemberId] = useState(() => { try { return localStorage.getItem("wf_myMemberId") || ""; } catch { return ""; } });
  const [gasUrl, setGasUrl] = useState(() => loadLS("wl_gasUrl", GAS_URL));
  const DEFAULT_SHEET_URL = "https://docs.google.com/spreadsheets/d/1C2zF59fpeSC7iBOSIlbrPwcIqUa86UIiZM22d7-g8N0/edit?gid=96225699#gid=96225699";
  const [sheetUrl, setSheetUrl] = useState(() => loadLS("wl_sheetUrl", DEFAULT_SHEET_URL));
  useEffect(() => {
    if (!gasUrl) return;
    fetchFromGAS(gasUrl, "getLogs").then(data => {
      if (data && data.logs) {
        setLogs(data.logs);
        setExportedIds(prev => new Set([...prev, ...data.logs.map(l => String(l.id))]));
      }
    });
  }, [gasUrl]);
  const intervalRef = useRef(null);

  const today = new Date().toLocaleDateString("ja-JP", { year: "numeric", month: "2-digit", day: "2-digit" });
  const [plans, setPlans] = useState(() => loadLS("wl_plans", []));
  useEffect(() => { saveLS("wl_plans", plans); }, [plans]);
  useEffect(() => { setPlans(prev => prev.filter(p => p.date === today || !p.done)); }, [today]);

  // wfタスクの完了済みID（GASによる上書きで復活しない様にローカル保持）
  const [wfDoneIds, setWfDoneIds] = useState(() => new Set(loadLS("wl_wf_done_ids", [])));
  useEffect(() => { saveLS("wl_wf_done_ids", [...wfDoneIds]); }, [wfDoneIds]);

  const [wfData, setWfData] = useState(() => loadLS("kodawarin_tasks", null));
  useEffect(() => {
    const handler = e => {
      if (e.key === "kodawarin_tasks") { try { setWfData(JSON.parse(e.newValue)); } catch {} }
      if (e.key === "wl_gasUrl") { setGasUrl(e.newValue || ""); }
      if (e.key === "wl_sheetUrl") { setSheetUrl(e.newValue || DEFAULT_SHEET_URL); }
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, [DEFAULT_SHEET_URL]);

  // Derive Workflow project names and task titles
  const wfProjects = wfData?.projects || [];
  const wfProjectNames = [...new Set(wfProjects.filter(p=>!p.closed).map(p=>p.name))];
  const wfTaskTitles = [...new Set((wfData?.tasks||[]).map(t=>t.title))];
  // Merged lists (Workflow first, then local additions)
  const allProjects = [...new Set([...wfProjectNames, ...projects])];
  const allTasks = [...new Set([...wfTaskTitles, ...tasks])].filter(t=>!hiddenTasks.includes(t)).sort((a,b)=>a.localeCompare(b,'ja'));
  // Helper to resolve project name from projectId
  const resolveWfProject = (t) => wfProjects.find(p=>p.id===t.projectId)?.name || '';

  useEffect(() => {
    if (running) {
      intervalRef.current = setInterval(() => {
        setElapsed(Math.floor((Date.now() - startTime) / 1000));
      }, 1000);
    } else {
      clearInterval(intervalRef.current);
    }
    return () => clearInterval(intervalRef.current);
  }, [running, startTime]);

  function handleStart() {
    if (!selectedProject || !selectedTask.trim()) return;
    if (paused) {
      setStartTime(Date.now() - elapsed * 1000);
      setPaused(false);
    } else {
      setStartTime(Date.now());
      setElapsed(0);
    }
    setRunning(true);
  }

  function handlePause() {
    setRunning(false);
    setPaused(true);
  }

  function handleStop() {
    setRunning(false);
    setPaused(false);
    const log = {
      id: Date.now(),
      project: selectedProject,
      task: selectedTask,
      startedAt: new Date(startTime).toISOString(),
      endedAt: new Date().toISOString(),
      duration: elapsed,
      note: preNote,
    };
    setLogs(prev => [log, ...prev]);
    setElapsed(0);
    setSavedLogs(prev => [log, ...prev]);
    setSavedLogNotes(prev => ({ ...prev, [log.id]: preNote }));
    setPreNote("");
  }

  function deleteLog(id) {
    const strId = String(id);
    const logToDelete = logs.find(l => String(l.id) === strId);
    setLastDeleted(prev => logToDelete ? [logToDelete, ...prev].slice(0, 3) : prev);
    setLogs(prev => prev.filter(l => String(l.id) !== strId));
    if (exportedIds.has(strId)) {
      setDeletedIds(prev => [...prev, strId]);
    }
    setExportedIds(prev => { const s = new Set(prev); s.delete(strId); return s; });
  }

  function undoDelete() {
    if (lastDeleted.length === 0) return;
    const [first, ...rest] = lastDeleted;
    setLogs(prev => [first, ...prev]);
    setLastDeleted(rest);
  }

  function updateNote(id, note) {
    setLogs(prev => prev.map(l => l.id === id ? { ...l, note } : l));
    setUpdatedNoteIds(prev => new Set([...prev, String(id)]));
  }

  // 完了は一方向のみ（完了 → 未着手には戻さない）
  function togglePlanDone(id) {
    setPlans(prev => prev.map(p => {
      if (p.id !== id || p.done) return p;
      return { ...p, done: true, doneAt: Date.now() };
    }));
  }
  function deletePlan(id) { setPlans(prev => prev.filter(p => p.id !== id)); }

  function toggleWfTask(taskId, currentStatus) {
    const todayStr = new Date().toISOString().slice(0, 10);
    // 完了済みなら何もしない（復活防止）
    if (wfDoneIds.has(String(taskId)) || currentStatus === 'done') return;
    // 完了IDをローカルに記録（GAS同期で上書きされても復活しない）
    setWfDoneIds(prev => new Set([...prev, String(taskId)]));
    const wfMainData = loadLS("kodawarin_tasks", null);
    if (wfMainData && wfMainData.tasks) {
      const updatedMain = { ...wfMainData, tasks: wfMainData.tasks.map(t => {
        if (t.id !== taskId) return t;
        return { ...t, status: 'done', doneAt: todayStr };
      })};
      saveLS("kodawarin_tasks", updatedMain);
      setWfData(updatedMain);
      const wfGasUrl = localStorage.getItem('wf_gasUrl');
      if (wfGasUrl) postToGAS(wfGasUrl, { action: 'saveWorkflowData', data: updatedMain });
    }
  }

  function genEventName(date, venue, content) {
    if (!date) return '';
    const [y,m,d] = date.split('-');
    const parts = [`${y.slice(2)}${m}${d}`];
    if (venue?.trim()) parts.push(venue.trim());
    if (content?.trim()) parts.push(content.trim());
    return parts.join('_');
  }

  function resetAddForm() {
    setShowAddForm(false); setAddMode(""); setAddProject(""); setAddEventDate(""); setAddVenue(""); setAddContent(""); setAddTask(""); setAddDueDate(""); setAddMinutes(""); setAddNote(""); setAddStatus("todo"); setCustomTask("");
  }

  function handleAddTaskToTimer() {
    const task = customTask.trim() || addTask;
    const project = addProject;
    if (!task || !project) return;
    const minutes = (addMinutes && parseInt(addMinutes) > 0) ? parseInt(addMinutes) : 0;
    if (!projects.includes(project)) setProjects(prev => [...prev, project]);
    setPlans(prev => [...prev, { id: Date.now(), date: today, project, task, minutes, due: addDueDate || null, note: addNote || null, done: false, status: addStatus }]);
    if (customTask.trim() && !tasks.includes(customTask.trim())) {
      setTasks(prev => [...prev, customTask.trim()]);
    }
    resetAddForm();
  }

  const logEffectiveProject = logProject;

  function resetLogForm() {
    setLogShowForm(false); setLogFromWf(false); setLogMode(""); setLogProject(""); setLogTask(""); setLogCustomTask(""); setLogStartTime(""); setLogEndTime(""); setLogNote("");
  }

  function submitLog(logDuration) {
    const task = logCustomTask.trim() || logTask;
    if (!logEffectiveProject || !task) return;
    if (logCustomTask.trim() && !tasks.includes(logCustomTask.trim())) setTasks(prev=>[...prev,logCustomTask.trim()]);
    if (!projects.includes(logEffectiveProject)) setProjects(prev=>[...prev,logEffectiveProject]);
    const log = { id:Date.now(), project:logEffectiveProject, task, startedAt:new Date(logStartTime).toISOString(), endedAt:new Date(logEndTime).toISOString(), duration:logDuration, note:logNote };
    setLogs(prev=>[log,...prev]);
    if (gasUrl) { postToGAS(gasUrl,{action:"syncLogs",logs:[log],deletedIds:[],updatedNotes:[]}); setExportedIds(prev=>new Set([...prev,String(log.id)])); }
    resetLogForm();
  }

  function projectColor(name) {
    const idx = projects.indexOf(name) % COLORS.length;
    return COLORS[idx >= 0 ? idx : 0];
  }

  const projectTotals = {}, dateTotals = {}, monthTotals = {};
  logs.forEach(log => {
    projectTotals[log.project] = (projectTotals[log.project] || 0) + log.duration;
    const dk = formatDate(log.startedAt);
    dateTotals[dk] = (dateTotals[dk] || 0) + log.duration;
    const mk = getMonthKey(log.startedAt);
    monthTotals[mk] = (monthTotals[mk] || 0) + log.duration;
  });

  async function exportToSheets() {
    const newLogs = logs.filter(l => !exportedIds.has(String(l.id)));
    const updatedNotes = logs.filter(l => exportedIds.has(String(l.id)) && updatedNoteIds.has(String(l.id)));
    if (newLogs.length === 0 && deletedIds.length === 0 && updatedNotes.length === 0) {
      setExportStatus("新しいログはありません");
      setTimeout(() => setExportStatus(null), 3000);
      return;
    }
    setExportStatus("送信中...");
    try {
      await postToGAS(gasUrl, { action: "syncLogs", logs: newLogs, deletedIds, updatedNotes });
      setExportedIds(prev => new Set([...prev, ...newLogs.map(l => String(l.id))]));
      setDeletedIds([]);
      setUpdatedNoteIds(new Set());
      setExportStatus("✓ 送信しました");
    } catch {
      setExportStatus("エラーが発生しました");
    }
    setTimeout(() => setExportStatus(null), 4000);
  }

  const maxProject = Math.max(...Object.values(projectTotals), 1);
  const pad = n => String(Math.floor(n)).padStart(2,'0');
  const timerDisplay = `${pad(elapsed/3600)}:${pad((elapsed%3600)/60)}:${pad(elapsed%60)}`;

  return (
    <div style={{ minHeight: "100vh", background: "#fafaf8", color: "#333333", fontFamily: "'DM Mono', 'Fira Code', monospace" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500&family=Pacifico&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        .tab-btn { background: none; border: none; cursor: pointer; padding: 10px 20px; font-family: inherit; font-size: 13px; letter-spacing: 0.08em; transition: all 0.2s; }
        .tab-btn.active { color: #FF8C42; border-bottom: 2px solid #FF8C42; }
        .tab-btn:not(.active) { color: #999999; border-bottom: 2px solid transparent; }
        .tab-btn:hover:not(.active) { color: #666666; }
        .pill { display: inline-flex; align-items: center; gap: 4px; padding: 4px 10px; border-radius: 20px; font-size: 11px; font-weight: 500; }
        input, select, textarea { background: #ffffff; border: 2px solid #e8e0d8; color: #333333; border-radius: 12px; padding: 10px 14px; font-family: inherit; font-size: 13px; outline: none; transition: border 0.2s; width: 100%; }
        input:focus, select:focus, textarea:focus { border-color: #FF8C42; }
        input::placeholder, textarea::placeholder { color: #bbbbbb; }
        .btn { border: none; border-radius: 20px; cursor: pointer; font-family: inherit; font-weight: 500; letter-spacing: 0.06em; transition: all 0.2s; }
        .btn:hover { filter: brightness(1.1); transform: translateY(-1px); }
        .btn:active { transform: translateY(0); }
        .del-btn { background: none; border: none; cursor: pointer; color: #bbbbbb; font-size: 13px; padding: 0 3px; transition: color 0.2s; line-height: 1; }
        .del-btn:hover { color: #F76E6E; }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
        .pulse { animation: pulse 1.5s ease-in-out infinite; }
        @keyframes fadeIn { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }
        .fade-in { animation: fadeIn 0.3s ease; }
      `}</style>

      <NavBar
        currentApp="timesheet"
        tabs={[["timer","タイマー"],["log","ログ"],["report","レポート"]]}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        runningDot={running ? "#4FC48A" : paused ? "#F7C34F" : null}
        rightActions={
          <button onClick={() => {
            if (sheetUrl) { window.open(sheetUrl, "_blank"); }
            else { setActiveTab("settings"); }
          }} style={{ display:"flex",alignItems:"center",gap:4,padding:"5px 12px",borderRadius:999,border:"1px solid #ddd8ce",background:"transparent",color:"#7a746c",cursor:"pointer",fontSize:11,fontFamily:"inherit",transition:"all 0.15s",whiteSpace:"nowrap" }}
            onMouseEnter={e=>{ e.currentTarget.style.borderColor="#e07840"; e.currentTarget.style.color="#e07840"; }}
            onMouseLeave={e=>{ e.currentTarget.style.borderColor="#ddd8ce"; e.currentTarget.style.color="#7a746c"; }}>
            📊 スプレッドシート
          </button>
        }
      />

      <div style={{ maxWidth: 720, margin: "0 auto", padding: "28px 20px 60px" }}>

        {activeTab === "timer" && (
  <div className="fade-in">
    {/* ── Timer display ── */}
    <div style={{ textAlign:"center",padding:"32px 0 20px",background:"#ffffff",border:"1px solid #f0ebe4",borderRadius:20,marginBottom:16 }}>
      <div style={{ fontSize:60,fontWeight:300,letterSpacing:"-0.02em",color:running?"#FF8C42":"#cccccc",transition:"color 0.4s" }}>
        {timerDisplay}
      </div>
      {(selectedProject||selectedTask) && (
        <div style={{ fontSize:12,color:"#999999",marginTop:6,letterSpacing:"0.08em" }}>
          {selectedProject}{selectedProject&&selectedTask?" — ":""}{selectedTask}
        </div>
      )}
    </div>

    {/* ── Note + Start/Stop ── */}
    <div style={{ marginBottom:16 }}>
      {!running && !paused && (
        <div style={{ marginBottom:8 }}>
          <textarea value={preNote} onChange={e=>setPreNote(e.target.value)} placeholder="詳細・備考（任意）..." rows={2} style={{ fontSize:12,resize:"vertical" }}/>
        </div>
      )}
      {!running && !paused ? (
        <button onClick={handleStart} disabled={!selectedTask.trim()||!selectedProject} className="btn"
          style={{ width:"100%",padding:14,background:(selectedTask.trim()&&selectedProject)?"#FF8C42":"#f0ebe4",color:(selectedTask.trim()&&selectedProject)?"#fff":"#bbbbbb",fontSize:14,letterSpacing:"0.1em" }}>
          ▶ 開始
        </button>
      ) : running ? (
        <div style={{ display:"flex",gap:8 }}>
          <button onClick={handlePause} className="btn"
            style={{ flex:1,padding:14,background:"#F7C34F22",color:"#c08020",border:"1px solid #F7C34F66",fontSize:14,letterSpacing:"0.1em" }}>
            ⏸ 一時停止
          </button>
          <button onClick={handleStop} className="btn"
            style={{ flex:1,padding:14,background:"#F76E6E18",color:"#F76E6E",border:"1px solid #F76E6E44",fontSize:14,letterSpacing:"0.1em" }}>
            ■ 終了して保存
          </button>
        </div>
      ) : (
        <div style={{ display:"flex",gap:8 }}>
          <button onClick={handleStart} className="btn"
            style={{ flex:1,padding:14,background:"#4FC48A22",color:"#4FC48A",border:"1px solid #4FC48A44",fontSize:14,letterSpacing:"0.1em" }}>
            ▶ 再開
          </button>
          <button onClick={handleStop} className="btn"
            style={{ flex:1,padding:14,background:"#F76E6E18",color:"#F76E6E",border:"1px solid #F76E6E44",fontSize:14,letterSpacing:"0.1em" }}>
            ■ 終了して保存
          </button>
        </div>
      )}
    </div>

    {/* ── Saved logs after stopping ── */}
    {savedLogs.map(savedLog => (
      <div key={savedLog.id} style={{ background:"#ffffff",border:"1px solid #f0ebe4",borderRadius:16,padding:16,marginBottom:12 }}>
        <div style={{ display:"flex",alignItems:"center",gap:10,flexWrap:"wrap",marginBottom:10 }}>
          <span style={{ flex:1,fontSize:13,color:"#333333" }}>✅ {savedLog.project} · {savedLog.task} · {formatDurationShort(savedLog.duration)}</span>
          <button onClick={() => {
            if (gasUrl) {
              const note = savedLogNotes[savedLog.id] || "";
              const logWithNote = { ...savedLog, note };
              updateNote(savedLog.id, note);
              postToGAS(gasUrl, { action:"syncLogs",logs:[logWithNote],deletedIds:[],updatedNotes:[] });
              setExportedIds(prev => new Set([...prev, String(savedLog.id)]));
              setSavedLogs(prev => prev.filter(l => String(l.id) !== String(savedLog.id)));
              setSavedLogNotes(prev => { const n = {...prev}; delete n[savedLog.id]; return n; });
            }
          }} className="btn" style={{ padding:"8px 16px",background:"#FF8C4218",color:"#FF8C42",border:"1px solid #FF8C4244",fontSize:12,whiteSpace:"nowrap" }}>→ シート送信</button>
          <button onClick={() => {
            setLastDeleted(prev => [savedLog, ...prev].slice(0,3));
            setLogs(prev => prev.filter(l => String(l.id) !== String(savedLog.id)));
            setSavedLogs(prev => prev.filter(l => String(l.id) !== String(savedLog.id)));
          }} className="btn" style={{ padding:"8px 16px",background:"#F76E6E18",color:"#F76E6E",border:"1px solid #F76E6E44",fontSize:12,whiteSpace:"nowrap" }}>🗑 削除</button>
        </div>
        <textarea value={savedLogNotes[savedLog.id]||""} onChange={e=>setSavedLogNotes(prev=>({...prev,[savedLog.id]:e.target.value}))}
          placeholder="詳細・備考を入力..." rows={2} style={{ fontSize:12,resize:"vertical" }}/>
      </div>
    ))}

    {/* ── Task list card ── */}
    <div style={{ background:"#ffffff",border:"1px solid #f0ebe4",borderRadius:16,padding:20,marginBottom:12 }}>
      <div style={{ fontSize:11,color:"#999999",letterSpacing:"0.1em",marginBottom:16 }}>{today} のタスク</div>

      {/* Merged task list sorted by due date */}
      {(()=>{
        const DAY = 86400000;
        const now = Date.now();
        const myWfTasks = myMemberId
          ? (wfData?.tasks||[]).filter(t => (t.status==='todo'||t.status==='doing') && (t.assigneeIds||[]).includes(myMemberId) && !wfDoneIds.has(String(t.id)))
          : [];
        const todayPlans = plans.filter(p=>p.date===today);

        const items = [
          ...myWfTasks
            .map(t => ({ type:'wf', id:t.id, title:t.title, project:resolveWfProject(t), due:t.due, done:false, raw:t })),
          ...todayPlans
            .filter(p => !p.done || (p.doneAt && (now - p.doneAt) < DAY))
            .map(p => ({ type:'plan', id:p.id, title:p.task, project:p.project, due:p.due||null, minutes:p.minutes, done:p.done, planStatus:p.status||'todo', raw:p })),
        ].sort((a,b) => {
          if (a.done !== b.done) return a.done ? 1 : -1;
          if (a.due && b.due) return a.due.localeCompare(b.due);
          if (a.due) return -1;
          if (b.due) return 1;
          return 0;
        });

        if (items.length === 0) {
          if (!myMemberId && wfData?.tasks?.length > 0) {
            return <div style={{ fontSize:12,color:"#aaaaaa",textAlign:"center",padding:"12px 0" }}>ワークフローで「自分を設定」するとタスクが表示されます</div>;
          }
          return null;
        }
        return items.map(item => {
          const ds = item.due ? getWorkflowDueDateStyle(item.due) : null;
          const isSelected = !item.done && selectedProject===item.project && selectedTask===item.title;
          return (
            <div key={`${item.type}-${item.id}`}
              onClick={()=>{ if(!running&&!item.done){ setSelectedProject(item.project); setSelectedTask(item.title); } }}
              style={{ display:"flex",alignItems:"center",gap:10,padding:"10px 12px",borderRadius:10,marginBottom:4,
                background:isSelected?"#FF8C4212":"transparent",cursor:item.done?"default":"pointer",
                opacity:item.done?0.5:1,transition:"background 0.15s",
                border:`1px solid ${isSelected?"#FF8C4244":"transparent"}` }}>
              <button onClick={e=>{ e.stopPropagation(); item.type==='wf' ? toggleWfTask(item.id, item.raw.status) : togglePlanDone(item.id); }} className="btn"
                style={{ padding:"4px 10px",background:item.done?"#4FC48A22":item.planStatus==='doing'?"#FF8C4222":"#f0ebe4",color:item.done?"#4FC48A":item.planStatus==='doing'?"#FF8C42":"#999999",fontSize:12,minWidth:36,flexShrink:0 }}>
                {item.done?"✓":item.planStatus==='doing'?"▶":"○"}
              </button>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:11,color:item.done?"#cccccc":"#aaaaaa",marginBottom:2 }}>
                  {item.project}{item.type==='plan' && item.minutes ? ` · ${item.minutes}分` : ''}{item.type==='wf' ? ' · workflow' : ''}{item.type==='plan'&&item.planStatus==='doing'&&!item.done ? ' · 進行中' : ''}
                </div>
                <div style={{ fontSize:13,color:item.done?"#bbbbbb":"#333333",textDecoration:item.done?"line-through":"none" }}>
                  {item.title}
                </div>
              </div>
              {ds?.label && <span style={{ fontSize:11,color:ds.color,fontWeight:600,whiteSpace:"nowrap" }}>{ds.label}</span>}
              {item.type==='plan' && (
                <button onClick={e=>{e.stopPropagation(); deletePlan(item.id);}} className="btn"
                  style={{ padding:"4px 8px",background:"transparent",color:"#bbbbbb",fontSize:14,flexShrink:0 }}>🗑</button>
              )}
            </div>
          );
        });
      })()}

      {/* Add task button / form */}
      {!showAddForm ? (
        <button onClick={()=>{ if(!running) setShowAddForm(true); }} disabled={running} className="btn"
          style={{ width:"100%",padding:"10px",background:"#f0ebe4",color:running?"#cccccc":"#888888",fontSize:12,letterSpacing:"0.06em",marginTop:4 }}>
          ＋ タスクを追加
        </button>
      ) : (
        <div style={{ marginTop:12,padding:16,background:"#f7f4f0",borderRadius:12 }}>
          {/* Step1: project select */}
          {!addMode && (
            <div style={{ marginBottom:12 }}>
              <div style={{ fontSize:11,color:"#999999",letterSpacing:"0.1em",marginBottom:8 }}>PROJECT</div>
              <div style={{ display:"flex",flexWrap:"wrap",gap:6,marginBottom:8 }}>
                {wfProjectNames.map(p=>(
                  <button key={p} onClick={()=>{ setAddMode("wf"); setAddProject(p); }} className="btn"
                    style={{ padding:"7px 14px",background:"#ffffff",color:"#FF8C42",border:"1px solid #FF8C4266",fontSize:12,fontWeight:600 }}>
                    {p}
                  </button>
                ))}
                <button onClick={()=>setAddMode("other")} className="btn"
                  style={{ padding:"7px 14px",background:"#ffffff",color:"#666666",border:"1px solid #e8e0d8",fontSize:12 }}>
                  ＋ その他
                </button>
              </div>
            </div>
          )}
          {/* WF project mode */}
          {addMode === "wf" && (
            <div style={{ marginBottom:12 }}>
              <div style={{ fontSize:11,color:"#999999",letterSpacing:"0.1em",marginBottom:6 }}>PROJECT</div>
              <div style={{ fontSize:13,color:"#FF8C42",fontWeight:600,marginBottom:6 }}>→ {addProject}</div>
              <button onClick={()=>{ setAddMode(""); setAddProject(""); }} style={{ fontSize:11,color:"#999999",background:"none",border:"none",cursor:"pointer",padding:0 }}>← 戻る</button>
            </div>
          )}
          {/* Other mode */}
          {addMode === "other" && (
            <div style={{ marginBottom:12 }}>
              <div style={{ fontSize:11,color:"#999999",letterSpacing:"0.1em",marginBottom:8 }}>PROJECT — その他</div>
              <div style={{ display:"flex",flexWrap:"wrap",gap:6,marginBottom:8 }}>
                {allProjects.map(p=>(
                  <button key={p} onClick={()=>setAddProject(p)} className="btn"
                    style={{ padding:"5px 12px",background:addProject===p?"#FF8C42":"#ffffff",color:addProject===p?"#fff":"#666666",fontSize:12,border:"1px solid #e8e0d8" }}>
                    {p}
                  </button>
                ))}
              </div>
              <input value={addProject} onChange={e=>setAddProject(e.target.value)} onKeyDown={e=>{ if(e.key==='Enter') e.preventDefault(); }} placeholder="または直接入力..."/>
              <button type="button" onClick={()=>setAddMode("")} style={{ fontSize:11,color:"#999999",background:"none",border:"none",cursor:"pointer",padding:"4px 0 0",display:"block" }}>← 戻る</button>
            </div>
          )}
          {/* Task (shown after mode selected) */}
          {addMode && (
            <div style={{ marginBottom:12 }}>
              <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8 }}>
                <div style={{ fontSize:11,color:"#999999",letterSpacing:"0.1em" }}>TASK</div>
                <button type="button" onClick={()=>setTaskEditMode(v=>!v)} style={{ fontSize:10,color:taskEditMode?"#FF8C42":"#aaaaaa",background:"none",border:`1px solid ${taskEditMode?"#FF8C4266":"#e8e0d8"}`,borderRadius:6,padding:"2px 8px",cursor:"pointer",fontFamily:"inherit" }}>{taskEditMode?"完了":"整理"}</button>
              </div>
              <div style={{ display:"flex",flexWrap:"wrap",gap:6,marginBottom:8 }}>
                {allTasks.map(t=>(
                  <div key={t} style={{ display:"inline-flex",alignItems:"stretch" }}>
                    <button type="button" onClick={()=>{ if(!taskEditMode){ setAddTask(t); setCustomTask(""); } }} className="btn"
                      style={{ padding:"5px 12px",fontSize:12,...(taskEditMode?{background:"#ffffff",color:"#666666",border:"1px solid #e8e0d8",borderRight:"none",borderRadius:"6px 0 0 6px"}:{background:(addTask===t&&!customTask)?"#FF8C42":"#ffffff",color:(addTask===t&&!customTask)?"#fff":"#666666",border:"1px solid #e8e0d8",borderRadius:"6px"}) }}>
                      {t}
                    </button>
                    {taskEditMode && (
                      <button type="button" onClick={()=>setHiddenTasks(prev=>[...prev,t])} style={{ padding:"5px 7px",background:"#fff0ef",color:"#ff3b30",fontSize:11,border:"1px solid #e8e0d8",borderLeft:"none",borderRadius:"0 6px 6px 0",cursor:"pointer",lineHeight:1 }}>×</button>
                    )}
                  </div>
                ))}
              </div>
              {taskEditMode && hiddenTasks.length>0 && (
                <div style={{ marginBottom:8 }}>
                  <div style={{ fontSize:10,color:"#aaaaaa",letterSpacing:"0.08em",marginBottom:4 }}>非表示中</div>
                  <div style={{ display:"flex",flexWrap:"wrap",gap:4 }}>
                    {hiddenTasks.map(t=>(
                      <button key={t} type="button" onClick={()=>setHiddenTasks(prev=>prev.filter(h=>h!==t))} style={{ padding:"4px 10px",background:"#f7f4f0",color:"#999999",fontSize:11,border:"1px solid #e8e0d8",borderRadius:6,cursor:"pointer" }}>{t} ↩</button>
                    ))}
                  </div>
                </div>
              )}
              <input value={customTask} onChange={e=>{ setCustomTask(e.target.value); if(e.target.value) setAddTask(""); }} placeholder="または直接入力（臨時タスク）..."/>
            </div>
          )}
          {addMode && (
            <div style={{ marginBottom:12 }}>
              <div style={{ display:"flex",gap:8,marginBottom:8,flexWrap:"wrap" }}>
                <div style={{ display:"flex",flexDirection:"column",gap:4,flex:1,minWidth:140 }}>
                  <label style={{ fontSize:11,color:"#999999",letterSpacing:"0.1em" }}>期日</label>
                  <input value={addDueDate} onChange={e=>setAddDueDate(e.target.value)} type="date"/>
                </div>
                <div style={{ display:"flex",flexDirection:"column",gap:4,flex:1,minWidth:120 }}>
                  <label style={{ fontSize:11,color:"#999999",letterSpacing:"0.1em" }}>予定分数</label>
                  <input value={addMinutes} onChange={e=>setAddMinutes(e.target.value)} placeholder="省略可" type="number"/>
                </div>
              </div>
              <div style={{ display:"flex",flexDirection:"column",gap:4 }}>
                <label style={{ fontSize:11,color:"#999999",letterSpacing:"0.1em" }}>詳細備考</label>
                <textarea value={addNote} onChange={e=>setAddNote(e.target.value)} placeholder="任意..." rows={2} style={{ fontSize:12,resize:"vertical" }}/>
              </div>
              <div style={{ display:"flex",gap:8,marginTop:10 }}>
                <button onClick={()=>setAddStatus("todo")} className="btn"
                  style={{ flex:1,padding:"7px 12px",background:addStatus==="todo"?"#f0ebe4":"transparent",color:addStatus==="todo"?"#666666":"#aaaaaa",border:"1px solid #e8e0d8",fontSize:12,fontWeight:addStatus==="todo"?600:400 }}>
                  ○ 未着手
                </button>
                <button onClick={()=>setAddStatus("doing")} className="btn"
                  style={{ flex:1,padding:"7px 12px",background:addStatus==="doing"?"#FF8C4222":"transparent",color:addStatus==="doing"?"#FF8C42":"#aaaaaa",border:`1px solid ${addStatus==="doing"?"#FF8C4244":"#e8e0d8"}`,fontSize:12,fontWeight:addStatus==="doing"?600:400 }}>
                  ▶ 進行中
                </button>
              </div>
            </div>
          )}
          <div style={{ display:"flex",gap:8 }}>
            <button onClick={resetAddForm} className="btn"
              style={{ padding:"8px 16px",background:"#e8e0d8",color:"#666666",fontSize:12 }}>キャンセル</button>
            {addMode && (() => {
              const proj = addMode==="event" ? genEventName(addEventDate,addVenue,addContent) : addProject;
              const task = customTask.trim() || addTask;
              const ok = !!proj && !!task;
              return (
                <button onClick={handleAddTaskToTimer} disabled={!ok} className="btn"
                  style={{ flex:1,padding:"8px 16px",background:ok?"#FF8C42":"#f0ebe4",color:ok?"#fff":"#bbbbbb",fontSize:12 }}>
                  ＋ 追加
                </button>
              );
            })()}
          </div>
        </div>
      )}
    </div>

    {/* ── Quick stats ── */}
    {logs.length > 0 && (
      <div style={{ display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12,marginTop:8 }}>
        {[
          { label:"今日の合計", value:formatDurationShort(Object.entries(dateTotals).filter(([k])=>k===formatDate(new Date().toISOString())).reduce((a,[,v])=>a+v,0)) },
          { label:"記録数", value:`${logs.length}件` },
          { label:"PJ数", value:`${Object.keys(projectTotals).length}件` },
        ].map(({label,value})=>(
          <div key={label} style={{ background:"#ffffff",border:"1px solid #f0ebe4",borderRadius:12,padding:"14px",textAlign:"center" }}>
            <div style={{ fontSize:11,color:"#999999",marginBottom:6,letterSpacing:"0.08em" }}>{label}</div>
            <div style={{ fontSize:20,fontWeight:300,color:"#FF8C42" }}>{value}</div>
          </div>
        ))}
      </div>
    )}
  </div>
)}

        {activeTab === "report" && (
          <div className="fade-in">
            {logs.length === 0 ? (
              <div style={{ textAlign: "center", color: "#bbbbbb", padding: "80px 0" }}>まだログがありません</div>
            ) : (
              <>
                <div style={{ background: "#ffffff", border: "1px solid #f0ebe4", borderRadius: 16, padding: 24, marginBottom: 16 }}>
                  <div style={{ fontSize: 11, color: "#999999", letterSpacing: "0.1em", marginBottom: 16 }}>プロジェクト別</div>
                  {Object.entries(projectTotals).sort(([,a],[,b]) => b-a).map(([proj, dur]) => {
                    const taskBreakdown = {};
                    logs.filter(l => l.project === proj).forEach(l => {
                      taskBreakdown[l.task] = (taskBreakdown[l.task] || 0) + l.duration;
                    });
                    return (
                      <div key={proj} style={{ marginBottom: 16 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: 13 }}>
                          <span style={{ color: projectColor(proj), fontWeight: 500 }}>【{proj}】合計</span>
                          <span style={{ color: "#666666" }}>{formatDurationShort(dur)}</span>
                        </div>
                        <div style={{ background: "#f0ebe4", borderRadius: 4, height: 22, overflow: "hidden", marginBottom: 8 }}>
                          <div style={{ width: `${(dur/maxProject)*100}%`, height: "100%", background: projectColor(proj)+"44", borderRight: `3px solid ${projectColor(proj)}`, transition: "width 0.5s", minWidth: 4 }} />
                        </div>
                        {Object.entries(taskBreakdown).sort(([,a],[,b]) => b-a).map(([task, tdur]) => (
                          <div key={task} style={{ display: "flex", justifyContent: "space-between", padding: "4px 12px", fontSize: 12, color: "#666666" }}>
                            <span>└ {task}</span>
                            <span>{formatDurationShort(tdur)}</span>
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </div>

                <div style={{ background: "#ffffff", border: "1px solid #f0ebe4", borderRadius: 16, padding: 24 }}>
                  <div style={{ fontSize: 11, color: "#999999", letterSpacing: "0.1em", marginBottom: 16 }}>月別・日別</div>
                  {Object.entries(
                    logs.reduce((acc, log) => {
                      const mk = getMonthKey(log.startedAt);
                      const dk = formatDate(log.startedAt);
                      if (!acc[mk]) acc[mk] = { total: 0, days: {} };
                      acc[mk].total += log.duration;
                      acc[mk].days[dk] = (acc[mk].days[dk] || 0) + log.duration;
                      return acc;
                    }, {})
                  ).sort(([a],[b]) => b.localeCompare(a)).map(([month, { total, days }]) => (
                    <div key={month} style={{ marginBottom: 20 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 12px", background: "#FF8C4218", borderRadius: 8, marginBottom: 6, fontSize: 13 }}>
                        <span style={{ color: "#FF8C42", fontWeight: 500 }}>【{month} 合計】</span>
                        <span style={{ color: "#FF8C42" }}>{formatDurationShort(total)}</span>
                      </div>
                      {Object.entries(days).sort(([a],[b]) => a.localeCompare(b)).map(([date, dur]) => {
                        const d = new Date(date.replace(/\//g, '-'));
                        const weekday = ["日","月","火","水","木","金","土"][d.getDay()];
                        const label = `${date.slice(5).replace('/', '月')}日（${weekday}）`;
                        return (
                          <div key={date} style={{ display: "flex", justifyContent: "space-between", padding: "5px 20px", fontSize: 12, color: "#666666" }}>
                            <span>{label}</span>
                            <span>{formatDurationShort(dur)}</span>
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {activeTab === "log" && (
          <div className="fade-in">

            {/* ── Today's logs summary ── */}
            {(() => {
              const todayLogs = [...logs].filter(l => formatDate(l.startedAt) === today).sort((a,b) => b.startedAt.localeCompare(a.startedAt));
              return (
                <div style={{ background:"#ffffff",border:"1px solid #f0ebe4",borderRadius:16,overflow:"hidden",marginBottom:16 }}>
                  <div style={{ padding:"14px 20px",borderBottom:"1px solid #f0ebe4",display:"flex",alignItems:"center",justifyContent:"space-between" }}>
                    <span style={{ fontSize:11,color:"#999999",letterSpacing:"0.1em" }}>今日のログ（{todayLogs.length}件）</span>
                    <div style={{ display:"flex",alignItems:"center",gap:12 }}>
                      {exportStatus && <span style={{ fontSize:12,color:exportStatus.includes("✓")?"#4FC48A":"#F7C34F" }}>{exportStatus}</span>}
                      {lastDeleted.length > 0 && (
                        <button onClick={undoDelete} className="btn" style={{ padding:"5px 12px",background:"#4FC48A18",color:"#4FC48A",border:"1px solid #4FC48A44",fontSize:11 }}>↩ 回復({lastDeleted.length})</button>
                      )}
                      <button onClick={exportToSheets} className="btn" style={{ padding:"5px 12px",background:"#FF8C4218",color:"#FF8C42",border:"1px solid #FF8C4244",fontSize:11 }}>→ Sheets送信</button>
                    </div>
                  </div>
                  {todayLogs.length === 0
                    ? <div style={{ padding:"20px",textAlign:"center",color:"#bbbbbb",fontSize:12 }}>今日のログはまだありません</div>
                    : todayLogs.map((log,i,arr) => (
                      <div key={log.id} style={{ padding:"10px 20px",borderBottom:i<arr.length-1?"1px solid #f0ebe4":"none" }}>
                        <div style={{ display:"flex",alignItems:"center",gap:10,marginBottom:4 }}>
                          <span style={{ flex:1,fontSize:13,color:"#333333" }}>{log.task}</span>
                          <span className="pill" style={{ background:projectColor(log.project)+"22",color:projectColor(log.project),border:`1px solid ${projectColor(log.project)}33` }}>{log.project}</span>
                          <span style={{ fontSize:12,color:"#666666" }}>{formatDurationShort(log.duration)}</span>
                          <span style={{ fontSize:13,color:exportedIds.has(String(log.id))?"#4FC48A":"#bbbbbb",minWidth:16 }}>{exportedIds.has(String(log.id))?"✓":"·"}</span>
                          <button className="del-btn" onClick={()=>deleteLog(log.id)} title="削除">🗑</button>
                        </div>
                        {editingNote === log.id ? (
                          <div style={{ display:"flex",gap:8 }}>
                            <textarea value={log.note||""} onChange={e=>updateNote(log.id,e.target.value)} placeholder="詳細・備考を入力..." rows={2} style={{ fontSize:12,resize:"vertical" }}/>
                            <button onClick={()=>setEditingNote(null)} className="btn" style={{ padding:"6px 12px",background:"#FF8C4222",color:"#FF8C42",fontSize:12,whiteSpace:"nowrap" }}>完了</button>
                          </div>
                        ) : (
                          <div style={{ display:"flex",alignItems:"center",gap:8 }}>
                            {log.note
                              ? <span style={{ fontSize:12,color:"#666666",flex:1 }}>📝 {log.note}</span>
                              : <span style={{ fontSize:12,color:"#dddddd",flex:1 }}>備考なし</span>}
                            <button onClick={()=>setEditingNote(log.id)} className="btn" style={{ padding:"3px 8px",background:"#f0ebe4",color:"#999999",fontSize:11 }}>詳細備考</button>
                          </div>
                        )}
                      </div>
                    ))
                  }
                  <button onClick={()=>setShowAllLogs(v=>!v)}
                    style={{ width:"100%",padding:"10px",background:"#f7f4f0",border:"none",borderTop:"1px solid #f0ebe4",color:"#888888",fontSize:12,cursor:"pointer",letterSpacing:"0.05em" }}>
                    {showAllLogs ? "▲ 閉じる" : "▼ 過去のログを表示"}
                  </button>
                </div>
              );
            })()}

            {/* ── Full log history ── */}
            {showAllLogs && (()=>{
              const twoWeeksAgo = new Date();
              twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
              const recentLogs = [...logs].filter(l => new Date(l.startedAt) >= twoWeeksAgo).sort((a,b) => b.startedAt.localeCompare(a.startedAt));
              const hiddenCount = logs.length - recentLogs.length;
              return recentLogs.length === 0 ? null : (
                <div style={{ background:"#ffffff",border:"1px solid #f0ebe4",borderRadius:16,overflow:"hidden",marginBottom:16 }}>
                  {hiddenCount > 0 && <div style={{ padding:"10px 20px",fontSize:11,color:"#bbbbbb",borderBottom:"1px solid #f0ebe4",textAlign:"center" }}>2週間より前のログ {hiddenCount}件は非表示</div>}
                  {recentLogs.map((log,i,arr) => (
                    <div key={log.id} style={{ padding:"14px 20px",borderBottom:i<arr.length-1?"1px solid #f0ebe4":"none" }}>
                      <div style={{ display:"flex",alignItems:"center",gap:10,marginBottom:6 }}>
                        <span style={{ flex:1,fontSize:13,color:"#333333" }}>{log.task}</span>
                        <span className="pill" style={{ background:projectColor(log.project)+"22",color:projectColor(log.project),border:`1px solid ${projectColor(log.project)}33` }}>{log.project}</span>
                        <span style={{ fontSize:11,color:"#999999" }}>{formatDateTime(log.startedAt)}</span>
                        <span style={{ fontSize:12,color:"#666666",minWidth:70 }}>{formatDurationShort(log.duration)}</span>
                        <span style={{ fontSize:13,color:exportedIds.has(String(log.id))?"#4FC48A":"#bbbbbb",minWidth:16 }}>{exportedIds.has(String(log.id))?"✓":"·"}</span>
                        <button className="del-btn" onClick={()=>deleteLog(log.id)} title="削除">🗑</button>
                      </div>
                      {editingNote === log.id ? (
                        <div style={{ display:"flex",gap:8 }}>
                          <textarea value={log.note} onChange={e=>updateNote(log.id,e.target.value)} placeholder="詳細・備考を入力..." rows={2} style={{ fontSize:12,resize:"vertical" }}/>
                          <button onClick={()=>setEditingNote(null)} className="btn" style={{ padding:"6px 12px",background:"#FF8C4222",color:"#FF8C42",fontSize:12,whiteSpace:"nowrap" }}>完了</button>
                        </div>
                      ) : (
                        <div style={{ display:"flex",alignItems:"center",gap:8 }}>
                          {log.note
                            ? <span style={{ fontSize:12,color:"#666666",flex:1 }}>📝 {log.note}</span>
                            : <span style={{ fontSize:12,color:"#bbbbbb",flex:1 }}>詳細・備考なし</span>}
                          <button onClick={()=>setEditingNote(log.id)} className="btn" style={{ padding:"4px 10px",background:"#f0ebe4",color:"#999999",fontSize:11 }}>詳細備考</button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              );
            })()}

            {/* ── Manual log form (same structure as timer task card) ── */}
            {(()=>{
              const myWfTasks = myMemberId
                ? (wfData?.tasks||[]).filter(t=>(t.status==='todo'||t.status==='doing')&&(t.assigneeIds||[]).includes(myMemberId)).map(t=>({...t,projectName:resolveWfProject(t)}))
                : [];
              const logDurationCalc = (()=>{ if(!logStartTime||!logEndTime) return null; const diff=(new Date(logEndTime)-new Date(logStartTime))/1000; return diff>0?Math.floor(diff):null; })();
              return (
                <div style={{ background:"#ffffff",border:"1px solid #f0ebe4",borderRadius:16,padding:20,marginBottom:12 }}>
                  <div style={{ fontSize:11,color:"#999999",letterSpacing:"0.1em",marginBottom:16 }}>手動ログ追加</div>

                  {/* WORKFLOW tasks */}
                  {myWfTasks.length>0 && (
                    <div style={{ marginBottom:12 }}>
                      <div style={{ display:"flex",alignItems:"center",gap:8,marginBottom:10 }}>
                        <span style={{ fontSize:10,fontWeight:600,color:"#888888",background:"#f0ebe4",padding:"2px 8px",borderRadius:4,letterSpacing:"0.1em" }}>WORKFLOW タスク</span>
                        <div style={{ flex:1,height:1,background:"#f0ebe4" }}/>
                      </div>
                      {myWfTasks.map((t,i)=>{
                        const isSelected = logProject===t.projectName && logTask===t.title && !logCustomTask;
                        const ds = getWorkflowDueDateStyle(t.due);
                        return (
                          <div key={i} onClick={()=>{ setLogProject(t.projectName); setLogTask(t.title); setLogCustomTask(""); setLogFromWf(true); setLogShowForm(true); }}
                            style={{ display:"flex",alignItems:"center",gap:10,padding:"10px 12px",borderRadius:10,marginBottom:4,
                              background:isSelected?"#FF8C4212":"transparent",cursor:"pointer",transition:"background 0.15s",
                              border:`1px solid ${isSelected?"#FF8C4244":"transparent"}` }}>
                            <div style={{ flex:1 }}>
                              <div style={{ fontSize:13,color:"#333333" }}>{t.title}</div>
                              {t.projectName && <div style={{ fontSize:11,color:"#999999",marginTop:2 }}>{t.projectName}</div>}
                            </div>
                            {ds.label && <span style={{ fontSize:11,color:ds.color,fontWeight:600,whiteSpace:"nowrap" }}>{ds.label}</span>}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Add form toggle */}
                  {!logShowForm ? (
                    <button onClick={()=>setLogShowForm(true)} className="btn"
                      style={{ width:"100%",padding:"10px",background:"#f0ebe4",color:"#888888",fontSize:12,letterSpacing:"0.06em",marginTop:4 }}>
                      ＋ タスクを追加
                    </button>
                  ) : (
                    <div style={{ marginTop:12,padding:16,background:"#f7f4f0",borderRadius:12 }}>
                      {logFromWf ? (
                        <div style={{ marginBottom:12,padding:"8px 12px",background:"#ffffff",borderRadius:8,border:"1px solid #e8e0d8" }}>
                          <div style={{ fontSize:11,color:"#999999",marginBottom:2 }}>{logProject}</div>
                          <div style={{ fontSize:13,color:"#333333",fontWeight:500 }}>{logTask}</div>
                        </div>
                      ) : (<>
                        {/* mode select */}
                        {!logMode && (
                          <div style={{ marginBottom:12 }}>
                            <div style={{ fontSize:11,color:"#999999",letterSpacing:"0.1em",marginBottom:8 }}>PROJECT</div>
                            <div style={{ display:"flex",flexWrap:"wrap",gap:6,marginBottom:8 }}>
                              {wfProjectNames.map(p=>(
                                <button key={p} onClick={()=>{ setLogMode("wf"); setLogProject(p); }} className="btn"
                                  style={{ padding:"7px 14px",background:"#ffffff",color:"#FF8C42",border:"1px solid #FF8C4266",fontSize:12,fontWeight:600 }}>
                                  {p}
                                </button>
                              ))}
                              <button onClick={()=>setLogMode("other")} className="btn"
                                style={{ padding:"7px 14px",background:"#ffffff",color:"#666666",border:"1px solid #e8e0d8",fontSize:12 }}>
                                ＋ その他
                              </button>
                            </div>
                          </div>
                        )}
                        {logMode==="wf" && (
                          <div style={{ marginBottom:12 }}>
                            <div style={{ fontSize:11,color:"#999999",letterSpacing:"0.1em",marginBottom:6 }}>PROJECT</div>
                            <div style={{ fontSize:13,color:"#FF8C42",fontWeight:600,marginBottom:6 }}>→ {logProject}</div>
                            <button onClick={()=>{ setLogMode(""); setLogProject(""); }} style={{ fontSize:11,color:"#999999",background:"none",border:"none",cursor:"pointer",padding:0 }}>← 戻る</button>
                          </div>
                        )}
                        {logMode==="other" && (
                          <div style={{ marginBottom:12 }}>
                            <div style={{ fontSize:11,color:"#999999",letterSpacing:"0.1em",marginBottom:8 }}>PROJECT — その他</div>
                            <div style={{ display:"flex",flexWrap:"wrap",gap:6,marginBottom:8 }}>
                              {allProjects.map(p=>(
                                <button key={p} onClick={()=>setLogProject(p)} className="btn"
                                  style={{ padding:"5px 12px",background:logProject===p?"#FF8C42":"#ffffff",color:logProject===p?"#fff":"#666666",fontSize:12,border:"1px solid #e8e0d8" }}>
                                  {p}
                                </button>
                              ))}
                            </div>
                            <input value={logProject} onChange={e=>setLogProject(e.target.value)} onKeyDown={e=>{ if(e.key==='Enter') e.preventDefault(); }} placeholder="または直接入力..."/>
                            <button type="button" onClick={()=>setLogMode("")} style={{ fontSize:11,color:"#999999",background:"none",border:"none",cursor:"pointer",padding:"4px 0 0",display:"block" }}>← 戻る</button>
                          </div>
                        )}
                        {logMode && (
                          <div style={{ marginBottom:12 }}>
                            <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8 }}>
                              <div style={{ fontSize:11,color:"#999999",letterSpacing:"0.1em" }}>TASK</div>
                              <button type="button" onClick={()=>setTaskEditMode(v=>!v)} style={{ fontSize:10,color:taskEditMode?"#FF8C42":"#aaaaaa",background:"none",border:`1px solid ${taskEditMode?"#FF8C4266":"#e8e0d8"}`,borderRadius:6,padding:"2px 8px",cursor:"pointer",fontFamily:"inherit" }}>{taskEditMode?"完了":"整理"}</button>
                            </div>
                            <div style={{ display:"flex",flexWrap:"wrap",gap:6,marginBottom:8 }}>
                              {allTasks.map(t=>(
                                <div key={t} style={{ display:"inline-flex",alignItems:"stretch" }}>
                                  <button type="button" onClick={()=>{ if(!taskEditMode){ setLogTask(t); setLogCustomTask(""); } }} className="btn"
                                    style={{ padding:"5px 12px",fontSize:12,...(taskEditMode?{background:"#ffffff",color:"#666666",border:"1px solid #e8e0d8",borderRight:"none",borderRadius:"6px 0 0 6px"}:{background:(logTask===t&&!logCustomTask)?"#FF8C42":"#ffffff",color:(logTask===t&&!logCustomTask)?"#fff":"#666666",border:"1px solid #e8e0d8",borderRadius:"6px"}) }}>
                                    {t}
                                  </button>
                                  {taskEditMode && (
                                    <button type="button" onClick={()=>setHiddenTasks(prev=>[...prev,t])} style={{ padding:"5px 7px",background:"#fff0ef",color:"#ff3b30",fontSize:11,border:"1px solid #e8e0d8",borderLeft:"none",borderRadius:"0 6px 6px 0",cursor:"pointer",lineHeight:1 }}>×</button>
                                  )}
                                </div>
                              ))}
                            </div>
                            {taskEditMode && hiddenTasks.length>0 && (
                              <div style={{ marginBottom:8 }}>
                                <div style={{ fontSize:10,color:"#aaaaaa",letterSpacing:"0.08em",marginBottom:4 }}>非表示中</div>
                                <div style={{ display:"flex",flexWrap:"wrap",gap:4 }}>
                                  {hiddenTasks.map(t=>(
                                    <button key={t} type="button" onClick={()=>setHiddenTasks(prev=>prev.filter(h=>h!==t))} style={{ padding:"4px 10px",background:"#f7f4f0",color:"#999999",fontSize:11,border:"1px solid #e8e0d8",borderRadius:6,cursor:"pointer" }}>{t} ↩</button>
                                  ))}
                                </div>
                              </div>
                            )}
                            <input value={logCustomTask} onChange={e=>{ setLogCustomTask(e.target.value); if(e.target.value) setLogTask(""); }} placeholder="または直接入力（臨時タスク）..."/>
                          </div>
                        )}
                      </>)}
                      {(logFromWf || logMode) && (<>
                        <div style={{ display:"flex",gap:8,marginBottom:12,flexWrap:"wrap" }}>
                          <div style={{ flex:1,minWidth:150 }}>
                            <div style={{ fontSize:11,color:"#999999",letterSpacing:"0.1em",marginBottom:6 }}>開始時刻</div>
                            <input type="datetime-local" value={logStartTime} onChange={e=>{ setLogStartTime(e.target.value); if(e.target.value){ const d=e.target.value.split("T")[0]; setLogEndTime(prev=>prev?d+"T"+(prev.split("T")[1]||"00:00"):d+"T00:00"); }}}/>
                          </div>
                          <div style={{ flex:1,minWidth:150 }}>
                            <div style={{ fontSize:11,color:"#999999",letterSpacing:"0.1em",marginBottom:6 }}>終了時刻</div>
                            <input type="datetime-local" value={logEndTime} onChange={e=>setLogEndTime(e.target.value)}/>
                          </div>
                          {logDurationCalc && <div style={{ fontSize:13,color:"#FF8C42",fontWeight:700,alignSelf:"flex-end",paddingBottom:2 }}>{Math.floor(logDurationCalc/3600)}h {Math.floor((logDurationCalc%3600)/60)}m</div>}
                        </div>
                        <div style={{ marginBottom:12 }}>
                          <div style={{ fontSize:11,color:"#999999",letterSpacing:"0.1em",marginBottom:6 }}>詳細・備考</div>
                          <textarea value={logNote} onChange={e=>setLogNote(e.target.value)} placeholder="詳細・備考を入力..." rows={2} style={{ fontSize:12,resize:"vertical" }}/>
                        </div>
                      </>)}
                      <div style={{ display:"flex",gap:8 }}>
                        <button onClick={resetLogForm} className="btn"
                          style={{ padding:"8px 16px",background:"#e8e0d8",color:"#666666",fontSize:12 }}>キャンセル</button>
                        {(()=>{ const ok=!!logEffectiveProject&&!!(logTask||logCustomTask.trim()); return (
                          <button onClick={()=>submitLog(logDurationCalc||0)} disabled={!ok} className="btn"
                            style={{ flex:1,padding:"8px 16px",background:ok?"#FF8C42":"#f0ebe4",color:ok?"#fff":"#bbbbbb",fontSize:12 }}>
                            ログ追加（シート送信）
                          </button>
                        ); })()}
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}

          </div>
        )}

      </div>
    </div>
  );
}