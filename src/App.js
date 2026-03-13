import { useState, useEffect, useRef } from "react";

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

function ProjectAddForm({ onAdd, disabled }) {
  const [mode, setMode] = useState(null);
  const [eventDate, setEventDate] = useState("");
  const [eventPlace, setEventPlace] = useState("");
  const [eventContent, setEventContent] = useState("");
  const [otherName, setOtherName] = useState("");

  function getEventName() {
    if (!eventDate) return "";
    const d = new Date(eventDate);
    const yy = String(d.getFullYear()).slice(2);
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const parts = [`${yy}${mm}${dd}`];
    if (eventPlace.trim()) parts.push(eventPlace.trim());
    if (eventContent.trim()) parts.push(eventContent.trim());
    return parts.join("_");
  }

  function handleAddEvent() {
    const name = getEventName();
    if (!name) return;
    onAdd(name);
    setEventDate(""); setEventPlace(""); setEventContent(""); setMode(null);
  }

  function handleAddOther() {
    const name = otherName.trim();
    if (!name) return;
    onAdd(name);
    setOtherName(""); setMode(null);
  }

  const preview = getEventName();

  return (
    <div>
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={() => setMode(mode === "event" ? null : "event")} disabled={disabled} className="btn"
          style={{ padding: "5px 14px", fontSize: 11, borderRadius: 20, background: mode === "event" ? "#FF8C42" : "transparent", color: mode === "event" ? "#fff" : "#aaaaaa", border: mode === "event" ? "1.5px solid #FF8C42" : "1.5px dashed #c8c0b8", letterSpacing: "0.06em" }}>
          + イベント
        </button>
        <button onClick={() => setMode(mode === "other" ? null : "other")} disabled={disabled} className="btn"
          style={{ padding: "5px 14px", fontSize: 11, borderRadius: 20, background: mode === "other" ? "#FF8C42" : "transparent", color: mode === "other" ? "#fff" : "#aaaaaa", border: mode === "other" ? "1.5px solid #FF8C42" : "1.5px dashed #c8c0b8", letterSpacing: "0.06em" }}>
          + その他
        </button>
      </div>
      {mode === "event" && (
        <div style={{ marginTop: 8 }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
            <input type="date" value={eventDate} onChange={e => setEventDate(e.target.value)} style={{ width: 150, flex: "0 0 auto" }} />
            <input value={eventPlace} onChange={e => setEventPlace(e.target.value)} placeholder="場所（例：レクサス）" style={{ flex: 1, minWidth: 100 }} />
            <input value={eventContent} onChange={e => setEventContent(e.target.value)} placeholder="体験内容（例：苺大福）" style={{ flex: 1, minWidth: 100 }} />
          </div>
          {preview && <div style={{ fontSize: 11, color: "#FF8C42", marginBottom: 6 }}>→ {preview}</div>}
          <button onClick={handleAddEvent} disabled={!preview} className="btn"
            style={{ padding: "6px 20px", background: preview ? "#FF8C42" : "#f0ebe4", color: preview ? "#fff" : "#bbbbbb", fontSize: 12 }}>
            追加
          </button>
        </div>
      )}
      {mode === "other" && (
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <input value={otherName} onChange={e => setOtherName(e.target.value)} placeholder="プロジェクト名..." onKeyDown={e => { if (e.key === "Enter") handleAddOther(); }} disabled={disabled} />
          <button onClick={handleAddOther} disabled={!otherName.trim() || disabled} className="btn"
            style={{ padding: "0 16px", background: otherName.trim() ? "#FF8C42" : "#f0ebe4", color: otherName.trim() ? "#fff" : "#bbbbbb", fontSize: 13, whiteSpace: "nowrap" }}>
            追加
          </button>
        </div>
      )}
    </div>
  );
}

function ManualLogForm({ projects, tasks, setProjects, setTasks, onAdd }) {
  const [selProject, setSelProject] = useState("");
  const [selTask, setSelTask] = useState("");
  const [startTime, setStartTime] = useState(() => {
    const now = new Date();
    const pad = n => String(n).padStart(2, '0');
    return `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
  });
  const [endTime, setEndTime] = useState("");
  const [newProj, setNewProj] = useState("");
  const [newTsk, setNewTsk] = useState("");

  const duration = (() => {
    if (!startTime || !endTime) return null;
    const diff = (new Date(endTime) - new Date(startTime)) / 1000;
    return diff > 0 ? Math.floor(diff) : null;
  })();

  function addProject() {
    const name = newProj.trim();
    if (name && !projects.includes(name)) {
      setProjects(prev => [...prev, name]);
      setSelProject(name);
    }
    setNewProj("");
  }

  function addTask() {
    const name = newTsk.trim();
    if (name && !tasks.includes(name)) {
      setTasks(prev => [...prev, name]);
      setSelTask(name);
    }
    setNewTsk("");
  }

  function handleAdd() {
    if (!selProject || !selTask || !startTime || !endTime || !duration) return;
    onAdd({
      id: Date.now(),
      project: selProject,
      task: selTask,
      startedAt: new Date(startTime).toISOString(),
      endedAt: new Date(endTime).toISOString(),
      duration,
      note: "",
    });
    setStartTime("");
    setEndTime("");
  }

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <span style={{ fontSize: 10, fontWeight: 600, color: "#fff", background: "#FF8C42", padding: "2px 8px", borderRadius: 4, letterSpacing: "0.1em" }}>PROJECT</span>
          <div style={{ flex: 1, height: 1, background: "#f0ebe4" }} />
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: projects.length > 0 ? 10 : 0 }}>
          {projects.map(p => (
            <button key={p} onClick={() => setSelProject(p)} className="btn" style={{ padding: "6px 14px", background: selProject === p ? "#FF8C42" : "#f0ebe4", color: selProject === p ? "#fff" : "#666666", fontSize: 12 }}>
              {p}<span onClick={e => { e.stopPropagation(); setProjects(prev => prev.filter(x => x !== p)); if (selProject === p) setSelProject(""); }} style={{ marginLeft: 6, cursor: "pointer" }}>×</span>
            </button>
          ))}
        </div>
        <ProjectAddForm onAdd={(name) => { if (!projects.includes(name)) { setProjects(prev => [...prev, name]); setSelProject(name); } }} />
      </div>
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <span style={{ fontSize: 10, fontWeight: 600, color: "#fff", background: "#4FC48A", padding: "2px 8px", borderRadius: 4, letterSpacing: "0.1em" }}>作業内容</span>
          <div style={{ flex: 1, height: 1, background: "#f0ebe4" }} />
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
          {tasks.map(t => (
            <button key={t} onClick={() => setSelTask(t)} className="btn" style={{ padding: "6px 14px", background: selTask === t ? "#FF8C42" : "#f0ebe4", color: selTask === t ? "#fff" : "#666666", fontSize: 12 }}>{t}</button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <input value={newTsk} onChange={e => setNewTsk(e.target.value)} placeholder="新規作業内容..." onKeyDown={e => { if (e.key === "Enter") e.preventDefault(); }} />
          <button onClick={addTask} className="btn" style={{ padding: "0 16px", background: "#f0ebe4", color: "#666666", fontSize: 13, whiteSpace: "nowrap" }}>+ 追加</button>
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
        <div style={{ flex: 1, minWidth: 160 }}>
          <div style={{ fontSize: 11, color: "#999999", marginBottom: 4 }}>開始時刻</div>
          <input type="datetime-local" value={startTime} onChange={e => { setStartTime(e.target.value); if (e.target.value) { const d = e.target.value.split("T")[0]; setEndTime(prev => prev ? d + "T" + (prev.split("T")[1] || "00:00") : d + "T00:00"); } }} />
        </div>
        <div style={{ flex: 1, minWidth: 160 }}>
          <div style={{ fontSize: 11, color: "#999999", marginBottom: 4 }}>終了時刻</div>
          <input type="datetime-local" value={endTime} onChange={e => setEndTime(e.target.value)} />
        </div>
        {duration && (
          <div style={{ fontSize: 13, color: "#FF8C42", fontWeight: 700, minWidth: 80 }}>
            {Math.floor(duration/3600)}h {Math.floor((duration%3600)/60)}m
          </div>
        )}
      </div>
      <button onClick={handleAdd} disabled={!selProject || !selTask || !duration} className="btn" style={{ width: "100%", padding: 12, background: (selProject && selTask && duration) ? "#FF8C42" : "#f0ebe4", color: (selProject && selTask && duration) ? "#fff" : "#bbbbbb", fontSize: 13 }}>→ シート送信</button>
    </div>
  );
}

function PlanTab({ projects, tasks, setProjects, setTasks, gasUrl }) {
  const today = new Date().toLocaleDateString("ja-JP", { year: "numeric", month: "2-digit", day: "2-digit" });
  const [plans, setPlans] = useState(() => loadLS("wl_plans", []));
  const [selProject, setSelProject] = useState("");
  const [selTask, setSelTask] = useState("");
  const [minutes, setMinutes] = useState("");
  const [newProj, setNewProj] = useState("");
  const [newTsk, setNewTsk] = useState("");

  useEffect(() => { saveLS("wl_plans", plans); }, [plans]);
  useEffect(() => { setPlans(prev => prev.filter(p => p.date === today || !p.done)); }, [today]);

  function addPlanProject() {
    const name = newProj.trim();
    if (name && !projects.includes(name)) {
      const np = [...projects, name];
      setProjects(np);
      setSelProject(name);
      if (gasUrl) postToGAS(gasUrl, { action: "syncMaster", projects: np, tasks });
    }
    setNewProj("");
  }

  function addPlanTask() {
    const name = newTsk.trim();
    if (name && !tasks.includes(name)) {
      const nt = [...tasks, name];
      setTasks(nt);
      setSelTask(name);
      if (gasUrl) postToGAS(gasUrl, { action: "syncMaster", projects, tasks: nt });
    }
    setNewTsk("");
  }

  function addPlan() {
    if (!selProject || !selTask || !minutes) return;
    setPlans(prev => [...prev, { id: Date.now(), date: today, project: selProject, task: selTask, minutes: parseInt(minutes), done: false }]);
    setMinutes("");
  }

  function toggleDone(id) { setPlans(prev => prev.map(p => p.id === id ? { ...p, done: !p.done } : p)); }
  function deletePlan(id) { setPlans(prev => prev.filter(p => p.id !== id)); }

  const totalMin = plans.reduce((s, p) => s + p.minutes, 0);

  return (
    <div>
      <div style={{ fontSize: 11, color: "#999999", letterSpacing: "0.1em", marginBottom: 16 }}>{today} の計画</div>
      <div style={{ background: "#ffffff", border: "1px solid #f0ebe4", borderRadius: 16, padding: 20, marginBottom: 12 }}>
        <div style={{ fontSize: 11, color: "#999999", letterSpacing: "0.1em", marginBottom: 10 }}>PROJECT</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
          {projects.map(p => (
            <button key={p} onClick={() => setSelProject(p)} className="btn" style={{ padding: "6px 14px", background: selProject === p ? "#FF8C42" : "#f0ebe4", color: selProject === p ? "#fff" : "#666666", fontSize: 12 }}>
              {p}<span onClick={e => { e.stopPropagation(); setProjects(prev => prev.filter(x => x !== p)); if (selProject === p) setSelProject(""); }} style={{ marginLeft: 6, cursor: "pointer" }}>×</span>
            </button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <input value={newProj} onChange={e => setNewProj(e.target.value)} placeholder="例：260308豆腐（年月日イベント内容）" />
          <button onClick={addPlanProject} className="btn" style={{ padding: "0 16px", background: "#f0ebe4", color: "#666666", fontSize: 13, whiteSpace: "nowrap" }}>+ 追加</button>
        </div>
      </div>
      <div style={{ background: "#ffffff", border: "1px solid #f0ebe4", borderRadius: 16, padding: 20, marginBottom: 12 }}>
        <div style={{ fontSize: 11, color: "#999999", letterSpacing: "0.1em", marginBottom: 10 }}>TASK</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
          {tasks.map(t => (
            <button key={t} onClick={() => setSelTask(t)} className="btn" style={{ padding: "6px 14px", background: selTask === t ? "#FF8C42" : "#f0ebe4", color: selTask === t ? "#fff" : "#666666", fontSize: 12 }}>
              {t}<span onClick={e => { e.stopPropagation(); setTasks(prev => prev.filter(x => x !== t)); if (selTask === t) setSelTask(""); }} style={{ marginLeft: 6, cursor: "pointer" }}>×</span>
            </button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <input value={newTsk} onChange={e => setNewTsk(e.target.value)} placeholder="新規作業内容追加..." />
          <button onClick={addPlanTask} className="btn" style={{ padding: "0 16px", background: "#f0ebe4", color: "#666666", fontSize: 13, whiteSpace: "nowrap" }}>+ 追加</button>
        </div>
      </div>
      <div style={{ background: "#ffffff", border: "1px solid #f0ebe4", borderRadius: 16, padding: 20, marginBottom: 12 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input value={minutes} onChange={e => setMinutes(e.target.value)} placeholder="予定分数" type="number" style={{ width: 120 }} />
          <button onClick={addPlan} className="btn" style={{ padding: "0 16px", background: "#FF8C42", color: "#fff", fontSize: 13 }}>+ 計画追加</button>
        </div>
      </div>
      <div style={{ background: "#ffffff", border: "1px solid #f0ebe4", borderRadius: 16, padding: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
          <span style={{ fontSize: 12, color: "#666666" }}>合計予定: <span style={{ color: "#F7C34F", fontWeight: 700 }}>{totalMin}分（{Math.floor(totalMin/60)}h{totalMin%60 > 0 ? `${totalMin%60}m` : ""}）</span></span>
          <span style={{ fontSize: 12, color: "#666666" }}>完了: <span style={{ color: "#4FC48A", fontWeight: 700 }}>{plans.filter(p => p.done).length}/{plans.length}件</span></span>
        </div>
        {plans.length === 0 && <div style={{ fontSize: 12, color: "#bbbbbb", textAlign: "center", padding: 20 }}>計画を追加してください</div>}
        {plans.map(p => (
          <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 0", borderBottom: "1px solid #f0ebe4", opacity: p.done ? 0.5 : 1 }}>
            <button onClick={() => toggleDone(p.id)} className="btn" style={{ padding: "4px 10px", background: p.done ? "#4FC48A22" : "#f0ebe4", color: p.done ? "#4FC48A" : "#999999", fontSize: 12, minWidth: 36 }}>{p.done ? "✓" : "○"}</button>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, color: p.done ? "#999999" : "#333333", textDecoration: p.done ? "line-through" : "none" }}>{p.task}</div>
              <div style={{ fontSize: 11, color: "#999999" }}>{p.project} · {p.minutes}分（{Math.floor(p.minutes/60)}h{p.minutes%60 > 0 ? `${p.minutes%60}m` : ""}）</div>
            </div>
            <button onClick={() => deletePlan(p.id)} className="btn" style={{ padding: "4px 8px", background: "transparent", color: "#bbbbbb", fontSize: 14 }}>🗑</button>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function App() {
  const [projects, setProjects] = useState(() => loadLS("wl_projects", []));
  const [newProject, setNewProject] = useState("");
  const [selectedProject, setSelectedProject] = useState("");

  const [tasks, setTasks] = useState(() => {
    const saved = loadLS("wl_tasks", []);
    const merged = [...DEFAULT_TASKS];
    saved.forEach(t => { if (!merged.includes(t)) merged.push(t); });
    return merged;
  });
  const [newTask, setNewTask] = useState("");
  const [selectedTask, setSelectedTask] = useState("");

  const [logs, setLogs] = useState([]);
  const [deletedIds, setDeletedIds] = useState([]);
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [startTime, setStartTime] = useState(null);
  const [activeTab, setActiveTab] = useState("timer");
  const [exportStatus, setExportStatus] = useState(null);
  const [exportedIds, setExportedIds] = useState(() => new Set(loadLS("wl_exportedIds", [])));
  const [lastDeleted, setLastDeleted] = useState([]);
  const [updatedNoteIds, setUpdatedNoteIds] = useState(new Set());
  const [savedLogs, setSavedLogs] = useState([]);
  const [editingNote, setEditingNote] = useState(null);

  useEffect(() => { saveLS("wl_projects", projects); }, [projects]);
  useEffect(() => { saveLS("wl_tasks", tasks); }, [tasks]);
  useEffect(() => { saveLS("wl_logs", logs); }, [logs]);
  useEffect(() => { saveLS("wl_selectedProject", selectedProject); }, [selectedProject]);
  useEffect(() => { saveLS("wl_selectedTask", selectedTask); }, [selectedTask]);
  useEffect(() => { saveLS("wl_exportedIds", [...exportedIds]); }, [exportedIds]);
  useEffect(() => { saveLS("wl_deletedIds", deletedIds); }, [deletedIds]);

  const [gasUrl, setGasUrl] = useState(() => loadLS("wl_gasUrl", GAS_URL));
  useEffect(() => {
    if (!gasUrl) return;
    fetchFromGAS(gasUrl, "getLogs").then(data => {
      if (data && data.logs) {
        setLogs(data.logs);
        setExportedIds(prev => new Set([...prev, ...data.logs.map(l => String(l.id))]));
      }
    });
  }, [gasUrl]);
  const [gasInput, setGasInput] = useState(() => loadLS("wl_gasUrl", GAS_URL));
  const intervalRef = useRef(null);

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
    setStartTime(Date.now());
    setElapsed(0);
    setRunning(true);
  }

  function handleStop() {
    setRunning(false);
    const log = {
      id: Date.now(),
      project: selectedProject,
      task: selectedTask,
      startedAt: new Date(startTime).toISOString(),
      endedAt: new Date().toISOString(),
      duration: elapsed,
      note: "",
    };
    setLogs(prev => [log, ...prev]);
    setElapsed(0);
    setSavedLogs(prev => [log, ...prev]);
  }

  function addProject() {
    const name = newProject.trim();
    if (name && !projects.includes(name)) {
      setProjects(prev => [...prev, name]);
      setSelectedProject(name);
    }
    setNewProject("");
  }

  function deleteProject(name) {
    if (running && selectedProject === name) return;
    setProjects(prev => prev.filter(p => p !== name));
    if (selectedProject === name) setSelectedProject(projects.find(p => p !== name) || "");
  }

  function addTask() {
    const name = newTask.trim();
    if (name && !tasks.includes(name)) {
      setTasks(prev => [...prev, name]);
      setSelectedTask(name);
    }
    setNewTask("");
  }

  function deleteTask(name) {
    setTasks(prev => prev.filter(t => t !== name));
    if (selectedTask === name) setSelectedTask("");
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

      <div style={{ background: "#ffffff90", borderBottom: "1px solid #f0ebe4", position: "sticky", top: 0, zIndex: 10 }}>
        <div style={{ maxWidth: 720, margin: "0 auto", padding: "0 20px", display: "flex", alignItems: "center", justifyContent: "space-between", height: 54 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: running ? "#4FC48A" : "#bbbbbb", boxShadow: running ? "0 0 8px #4FC48A" : "none" }} className={running ? "pulse" : ""} />
            <span style={{ fontFamily: "'Pacifico', cursive", fontSize: 16, letterSpacing: "0.06em" }}>TIMESHEET</span>
          </div>
          <div style={{ display: "flex" }}>
            {[["plan","計画"],["timer","タイマー"],["log","ログ"],["report","レポート"],["settings","設定"]].map(([id, label]) => (
              <button key={id} className={`tab-btn ${activeTab === id ? "active" : ""}`} onClick={() => setActiveTab(id)}>{label}</button>
            ))}
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 720, margin: "0 auto", padding: "28px 20px 60px" }}>

        {activeTab === "timer" && (
          <div className="fade-in">
            <div style={{ textAlign: "center", padding: "36px 0 28px", background: "#ffffff", border: "1px solid #f0ebe4", borderRadius: 20, marginBottom: 20 }}>
              <div style={{ fontSize: 64, fontWeight: 300, letterSpacing: "-0.02em", color: running ? "#FF8C42" : "#cccccc", transition: "color 0.4s" }}>
                {timerDisplay}
              </div>
              {running && <div style={{ fontSize: 12, color: "#999999", marginTop: 8, letterSpacing: "0.08em" }}>{selectedProject} — {selectedTask}</div>}
            </div>

            <div style={{ background: "#ffffff", border: "1px solid #f0ebe4", borderRadius: 16, padding: 24 }}>
              <div style={{ marginBottom: 20 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                  <span style={{ fontSize: 10, fontWeight: 600, color: "#fff", background: "#FF8C42", padding: "2px 8px", borderRadius: 4, letterSpacing: "0.1em" }}>PROJECT</span>
                  <div style={{ flex: 1, height: 1, background: "#f0ebe4" }} />
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: projects.length > 0 ? 10 : 0 }}>
                  {projects.map(p => (
                    <button key={p} onClick={() => !running && setSelectedProject(p)} className="btn" style={{ padding: "6px 14px", background: selectedProject === p ? projectColor(p) : "#f0ebe4", color: selectedProject === p ? "#fff" : "#666666", fontSize: 12 }}>
                      {p}{!running && <span onClick={e => { e.stopPropagation(); deleteProject(p); }} style={{ marginLeft: 6, cursor: "pointer" }}>×</span>}
                    </button>
                  ))}
                </div>
                <ProjectAddForm onAdd={(name) => { if (!projects.includes(name)) { setProjects(prev => [...prev, name]); setSelectedProject(name); } }} disabled={running} />
              </div>

              <div style={{ marginBottom: 20 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                  <span style={{ fontSize: 10, fontWeight: 600, color: "#fff", background: "#4FC48A", padding: "2px 8px", borderRadius: 4, letterSpacing: "0.1em" }}>作業内容</span>
                  <div style={{ flex: 1, height: 1, background: "#f0ebe4" }} />
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
                  {tasks.map(t => (
                    <button key={t} onClick={() => !running && setSelectedTask(t)} className="btn" style={{ padding: "6px 14px", background: selectedTask === t ? "#FF8C42" : "#f0ebe4", color: selectedTask === t ? "#fff" : "#666666", fontSize: 12 }}>
                      {t}{!running && <span onClick={e => { e.stopPropagation(); deleteTask(t); }} style={{ marginLeft: 6, cursor: "pointer" }}>×</span>}
                    </button>
                  ))}
                  {tasks.length === 0 && <span style={{ fontSize: 12, color: "#bbbbbb" }}>まだ作業内容がありません</span>}
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <input value={newTask} onChange={e => setNewTask(e.target.value)} placeholder="作業内容を追加..." onKeyDown={e => { if (e.key === "Enter") e.preventDefault(); }} disabled={running} />
                  <button onClick={addTask} disabled={running} className="btn" style={{ padding: "0 16px", background: "#f0ebe4", color: "#666666", fontSize: 13, whiteSpace: "nowrap" }}>+ 追加</button>
                </div>
              </div>

              {!running ? (
                <button onClick={handleStart} disabled={!selectedTask.trim() || !selectedProject} className="btn" style={{ width: "100%", padding: 14, background: (selectedTask.trim() && selectedProject) ? "#FF8C42" : "#f0ebe4", color: (selectedTask.trim() && selectedProject) ? "#fff" : "#bbbbbb", fontSize: 14, letterSpacing: "0.1em" }}>
                  ▶ 開始
                </button>
              ) : (
                <button onClick={handleStop} className="btn" style={{ width: "100%", padding: 14, background: "#F76E6E18", color: "#F76E6E", border: "1px solid #F76E6E44", fontSize: 14, letterSpacing: "0.1em" }}>
                  ■ 終了して保存
                </button>
              )}
            </div>

            {savedLogs.map(savedLog => (
              <div key={savedLog.id} style={{ background: "#ffffff", border: "1px solid #f0ebe4", borderRadius: 16, padding: 16, marginTop: 12, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <span style={{ flex: 1, fontSize: 13, color: "#333333" }}>✅ {savedLog.project} · {savedLog.task} · {formatDurationShort(savedLog.duration)}</span>
                <button onClick={() => {
                  if (gasUrl) {
                    postToGAS(gasUrl, { action: "syncLogs", logs: [savedLog], deletedIds: [], updatedNotes: [] });
                    setExportedIds(prev => new Set([...prev, String(savedLog.id)]));
                    setSavedLogs(prev => prev.filter(l => String(l.id) !== String(savedLog.id)));
                  }
                }} className="btn" style={{ padding: "8px 16px", background: "#FF8C4218", color: "#FF8C42", border: "1px solid #FF8C4244", fontSize: 12, whiteSpace: "nowrap" }}>→ シート送信</button>
                <button onClick={() => {
                  setLastDeleted(prev => [savedLog, ...prev].slice(0, 3));
                  setLogs(prev => prev.filter(l => String(l.id) !== String(savedLog.id)));
                  setSavedLogs(prev => prev.filter(l => String(l.id) !== String(savedLog.id)));
                }} className="btn" style={{ padding: "8px 16px", background: "#F76E6E18", color: "#F76E6E", border: "1px solid #F76E6E44", fontSize: 12, whiteSpace: "nowrap" }}>🗑 削除</button>
              </div>
            ))}

            {logs.length > 0 && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, marginTop: 16 }}>
                {[
                  { label: "今日の合計", value: formatDurationShort(Object.entries(dateTotals).filter(([k]) => k === formatDate(new Date().toISOString())).reduce((a,[,v]) => a+v, 0)) },
                  { label: "記録数", value: `${logs.length}件` },
                  { label: "PJ数", value: `${Object.keys(projectTotals).length}件` },
                ].map(({ label, value }) => (
                  <div key={label} style={{ background: "#ffffff", border: "1px solid #f0ebe4", borderRadius: 12, padding: "14px", textAlign: "center" }}>
                    <div style={{ fontSize: 11, color: "#999999", marginBottom: 6, letterSpacing: "0.08em" }}>{label}</div>
                    <div style={{ fontSize: 20, fontWeight: 300, color: "#FF8C42" }}>{value}</div>
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
            <div style={{ background: "#ffffff", border: "1px solid #f0ebe4", borderRadius: 16, padding: 20, marginBottom: 16 }}>
              <div style={{ fontSize: 11, color: "#999999", letterSpacing: "0.1em", marginBottom: 16 }}>手動ログ追加</div>
              <ManualLogForm projects={projects} tasks={tasks} setProjects={setProjects} setTasks={setTasks} onAdd={(log) => {
                setLogs(prev => [log, ...prev]);
                if (gasUrl) {
                  postToGAS(gasUrl, { action: "syncLogs", logs: [log], deletedIds: [], updatedNotes: [] });
                  setExportedIds(prev => new Set([...prev, String(log.id)]));
                }
              }} />
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 12, marginBottom: 16 }}>
              {deletedIds.length > 0 && <span style={{ fontSize: 12, color: "#F7C34F" }}>削除済み{deletedIds.length}件あり</span>}
              {exportStatus && <span style={{ fontSize: 12, color: exportStatus.includes("✓") ? "#4FC48A" : "#F7C34F" }}>{exportStatus}</span>}
              {lastDeleted.length > 0 && (
                <button onClick={undoDelete} className="btn" style={{ padding: "9px 18px", background: "#4FC48A18", color: "#4FC48A", border: "1px solid #4FC48A44", fontSize: 12 }}>↩ 削除を回復（{lastDeleted.length}）</button>
              )}
              <button onClick={exportToSheets} className="btn" style={{ padding: "9px 18px", background: "#FF8C4218", color: "#FF8C42", border: "1px solid #FF8C4244", fontSize: 12, letterSpacing: "0.08em" }}>
                → Sheetsに送信
              </button>
            </div>

            {(() => {
              const twoWeeksAgo = new Date();
              twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
              const recentLogs = [...logs].filter(l => new Date(l.startedAt) >= twoWeeksAgo).sort((a,b) => b.startedAt.localeCompare(a.startedAt));
              const hiddenCount = logs.length - recentLogs.length;
              return recentLogs.length === 0 ? (
              <div style={{ textAlign: "center", color: "#bbbbbb", padding: "80px 0" }}>まだログがありません</div>
            ) : (
              <div style={{ background: "#ffffff", border: "1px solid #f0ebe4", borderRadius: 16, overflow: "hidden" }}>
                {hiddenCount > 0 && <div style={{ padding: "10px 20px", fontSize: 11, color: "#bbbbbb", borderBottom: "1px solid #f0ebe4", textAlign: "center" }}>2週間より前のログ {hiddenCount}件は非表示（ローカルに保持中）</div>}
                {recentLogs.map((log, i, arr) => (
                  <div key={log.id} style={{ padding: "16px 20px", borderBottom: i < arr.length-1 ? "1px solid #f0ebe4" : "none" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                      <span style={{ flex: 1, fontSize: 13, color: "#333333" }}>{log.task}</span>
                      <span className="pill" style={{ background: projectColor(log.project)+"22", color: projectColor(log.project), border: `1px solid ${projectColor(log.project)}33` }}>{log.project}</span>
                      <span style={{ fontSize: 11, color: "#999999" }}>{formatDateTime(log.startedAt)}</span>
                      <span style={{ fontSize: 12, color: "#666666", minWidth: 70 }}>{formatDurationShort(log.duration)}</span>
                      <span style={{ fontSize: 13, color: exportedIds.has(String(log.id)) ? "#4FC48A" : "#bbbbbb", minWidth: 16 }}>{exportedIds.has(String(log.id)) ? "✓" : "·"}</span>
                      <button className="del-btn" onClick={() => deleteLog(log.id)} title="削除">🗑</button>
                    </div>
                    {editingNote === log.id ? (
                      <div style={{ display: "flex", gap: 8 }}>
                        <textarea value={log.note} onChange={e => updateNote(log.id, e.target.value)} placeholder="備考を入力..." rows={2} style={{ fontSize: 12, resize: "vertical" }} />
                        <button onClick={() => setEditingNote(null)} className="btn" style={{ padding: "6px 12px", background: "#FF8C4222", color: "#FF8C42", fontSize: 12, whiteSpace: "nowrap" }}>完了</button>
                      </div>
                    ) : (
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        {log.note ? (
                          <span style={{ fontSize: 12, color: "#666666", flex: 1 }}>📝 {log.note}</span>
                        ) : (
                          <span style={{ fontSize: 12, color: "#bbbbbb", flex: 1 }}>備考なし</span>
                        )}
                        <button onClick={() => setEditingNote(log.id)} className="btn" style={{ padding: "4px 10px", background: "#f0ebe4", color: "#999999", fontSize: 11 }}>備考を編集</button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            );
            })()}
          </div>
        )}

        {activeTab === "plan" && (
          <div className="fade-in">
            <PlanTab projects={projects} tasks={tasks} setProjects={setProjects} setTasks={setTasks} gasUrl={gasUrl} />
          </div>
        )}

        {activeTab === "settings" && (
          <div className="fade-in">
            <div style={{ background: "#ffffff", border: "1px solid #f0ebe4", borderRadius: 16, padding: 24 }}>
              <div style={{ fontSize: 11, color: "#999999", letterSpacing: "0.1em", marginBottom: 16 }}>Google Sheets 連携設定</div>
              <div style={{ fontSize: 12, color: "#666666", marginBottom: 12 }}>自分専用のGAS WebアプリURLを入力してください。</div>
              <input
                value={gasInput || ""}
                onChange={e => setGasInput(e.target.value)}
                placeholder="https://script.google.com/macros/s/..."
                style={{ marginBottom: 10 }}
              />
              <button
                onClick={() => { setGasUrl(gasInput); saveLS("wl_gasUrl", gasInput); alert("保存しました！"); }}
                className="btn"
                style={{ width: "100%", padding: 12, background: "#FF8C42", color: "#fff", fontSize: 13 }}
              >
                保存
              </button>
              <div style={{ marginTop: 24, paddingTop: 20, borderTop: "1px solid #f0ebe4" }}>
                <div style={{ fontSize: 11, color: "#999999", letterSpacing: "0.1em", marginBottom: 12 }}>データリセット</div>
                <button
                  onClick={() => { if (window.confirm("全データを削除しますか？")) { localStorage.clear(); window.location.reload(); } }}
                  className="btn"
                  style={{ padding: "10px 20px", background: "#F76E6E18", color: "#F76E6E", border: "1px solid #F76E6E44", fontSize: 12 }}
                >
                  全データを初期化
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}