import { useState, useEffect, useRef } from "react";
import NavBar from "./NavBar";
import { useAuth } from "./AuthContext";

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

function ProjectReport({ logs, projectTotals, maxProject, projectColor, formatDurationShort, formatDateTime }) {
  const [expandedProj, setExpandedProj] = useState(null);
  const [expandedTask, setExpandedTask] = useState(null);
  return (
    <div style={{ background: "#ffffff", border: "1px solid #f0ebe4", borderRadius: 16, padding: 24, marginBottom: 16 }}>
      <div style={{ fontSize: 11, color: "#999999", letterSpacing: "0.1em", marginBottom: 16 }}>プロジェクト別</div>
      {Object.entries(projectTotals).sort(([,a],[,b]) => b-a).map(([proj, dur]) => {
        const projLogs = logs.filter(l => l.project === proj);
        const taskBreakdown = {};
        projLogs.forEach(l => {
          if (!taskBreakdown[l.task]) taskBreakdown[l.task] = { total: 0, logs: [] };
          taskBreakdown[l.task].total += l.duration;
          taskBreakdown[l.task].logs.push(l);
        });
        const isOpen = expandedProj === proj;
        return (
          <div key={proj} style={{ marginBottom: 16 }}>
            <div onClick={() => setExpandedProj(isOpen ? null : proj)} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6, fontSize: 13, cursor: "pointer", padding: "6px 8px", borderRadius: 8, background: isOpen ? projectColor(proj) + "12" : "transparent" }}
              onMouseEnter={e => e.currentTarget.style.background = projectColor(proj) + "12"}
              onMouseLeave={e => { if (!isOpen) e.currentTarget.style.background = "transparent"; }}>
              <span style={{ color: projectColor(proj), fontWeight: 600 }}>
                <span style={{ fontSize: 10, marginRight: 4 }}>{isOpen ? "▼" : "▶"}</span>
                {proj}
              </span>
              <span style={{ color: "#666666", fontWeight: 500 }}>{formatDurationShort(dur)}</span>
            </div>
            <div style={{ background: "#f0ebe4", borderRadius: 4, height: 22, overflow: "hidden", marginBottom: isOpen ? 8 : 0 }}>
              <div style={{ width: `${(dur/maxProject)*100}%`, height: "100%", background: projectColor(proj)+"44", borderRight: `3px solid ${projectColor(proj)}`, transition: "width 0.5s", minWidth: 4 }} />
            </div>
            {isOpen && Object.entries(taskBreakdown).sort(([,a],[,b]) => b.total - a.total).map(([task, { total, logs: taskLogs }]) => {
              const taskKey = proj + "|" + task;
              const taskOpen = expandedTask === taskKey;
              return (
                <div key={task} style={{ marginLeft: 8 }}>
                  <div onClick={() => setExpandedTask(taskOpen ? null : taskKey)} style={{ display: "flex", justifyContent: "space-between", padding: "5px 12px", fontSize: 12, color: "#666666", cursor: "pointer", borderRadius: 6 }}
                    onMouseEnter={e => e.currentTarget.style.background = "#f9f5f0"}
                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                    <span><span style={{ fontSize: 9, marginRight: 4 }}>{taskOpen ? "▼" : "▶"}</span>{task}</span>
                    <span>{formatDurationShort(total)}</span>
                  </div>
                  {taskOpen && (
                    <div style={{ marginLeft: 20, borderLeft: "2px solid #f0ebe4", paddingLeft: 10, marginBottom: 6 }}>
                      {taskLogs.sort((a, b) => new Date(a.startedAt) - new Date(b.startedAt)).map(l => (
                        <div key={l.id} style={{ padding: "3px 0", fontSize: 11, color: "#888888" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                            <span>{formatDateTime(l.startedAt)}</span>
                            <span style={{ flexShrink: 0 }}>{formatDurationShort(l.duration)}</span>
                          </div>
                          {l.note && <div style={{ fontSize: 11, color: "#aaa", marginTop: 1 }}>📝 {l.note}</div>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

function DailyReport({ logs, formatDurationShort, formatDateTime, projectColor }) {
  const [expandedDate, setExpandedDate] = useState(null);
  const [monthView, setMonthView] = useState({});
  const [expandedCat, setExpandedCat] = useState(null);
  const monthData = logs.reduce((acc, log) => {
    const mk = getMonthKey(log.startedAt);
    const dk = formatDate(log.startedAt);
    if (!acc[mk]) acc[mk] = { total: 0, days: {}, projects: {} };
    acc[mk].total += log.duration;
    if (!acc[mk].days[dk]) acc[mk].days[dk] = { total: 0, logs: [] };
    acc[mk].days[dk].total += log.duration;
    acc[mk].days[dk].logs.push(log);
    acc[mk].projects[log.project] = (acc[mk].projects[log.project] || 0) + log.duration;
    return acc;
  }, {});
  const toggleMonthView = (month) => setMonthView(prev => ({ ...prev, [month]: prev[month] === "project" ? "daily" : "project" }));
  return (
    <div style={{ background: "#ffffff", border: "1px solid #f0ebe4", borderRadius: 16, padding: 24 }}>
      {Object.entries(monthData).sort(([a],[b]) => b.localeCompare(a)).map(([month, { total, days, projects }]) => {
        const view = monthView[month] || "daily";
        return (
        <div key={month} style={{ marginBottom: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", background: "#FF8C4218", borderRadius: 8, marginBottom: 6, fontSize: 13 }}>
            <span style={{ color: "#FF8C42", fontWeight: 500 }}>【{month} 合計】</span>
            <span style={{ color: "#FF8C42" }}>{formatDurationShort(total)}</span>
          </div>
          <div style={{ display: "flex", gap: 2, background: "#f0ebe4", borderRadius: 999, padding: 2, marginBottom: 8 }}>
            {[["daily","日別"],["dailyCat","日別カテゴリ"],["project","カテゴリ別"]].map(([k,l]) => (
              <button key={k} onClick={() => setMonthView(prev => ({ ...prev, [month]: k }))} style={{ flex:1, padding:"4px 0", borderRadius:999, border:"none", background:view===k?"#ffffff":"transparent", color:view===k?"#FF8C42":"#999999", fontWeight:view===k?600:400, fontSize:10, cursor:"pointer", fontFamily:"inherit", transition:"all 0.15s", boxShadow:view===k?"0 1px 3px rgba(0,0,0,0.06)":"none" }}>{l}</button>
            ))}
          </div>
          {view === "daily" && Object.entries(days).sort(([a],[b]) => a.localeCompare(b)).map(([date, { total: dayTotal, logs: dayLogs }]) => {
            const d = new Date(date.replace(/\//g, '-'));
            const weekday = ["日","月","火","水","木","金","土"][d.getDay()];
            const label = `${date.slice(5).replace('/', '月')}日（${weekday}）`;
            const isOpen = expandedDate === date;
            return (
              <div key={date}>
                <div onClick={() => setExpandedDate(isOpen ? null : date)} style={{ display: "flex", justifyContent: "space-between", padding: "5px 12px", fontSize: 12, color: "#666666", cursor: "pointer", borderRadius: 6 }}
                  onMouseEnter={e => e.currentTarget.style.background = "#f9f5f0"}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                  <span><span style={{ fontSize: 9, marginRight: 4 }}>{isOpen ? "▼" : "▶"}</span>{label}</span>
                  <span>{formatDurationShort(dayTotal)}</span>
                </div>
                {isOpen && (
                  <div style={{ marginLeft: 20, borderLeft: "2px solid #f0ebe4", paddingLeft: 10, marginBottom: 6 }}>
                    {dayLogs.sort((a, b) => new Date(a.startedAt) - new Date(b.startedAt)).map(l => (
                      <div key={l.id} style={{ padding: "4px 0", fontSize: 11 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                          <span style={{ color: "#888" }}>{formatDateTime(l.startedAt).slice(11)}</span>
                          <span style={{ color: projectColor(l.project), fontWeight: 500, flex: 1, textAlign: "left", marginLeft: 8, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.project}</span>
                          <span style={{ color: "#888", flexShrink: 0 }}>{formatDurationShort(l.duration)}</span>
                        </div>
                        <div style={{ color: "#999", marginLeft: 0 }}>{l.task}{l.note ? ` — ${l.note}` : ""}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          {view === "dailyCat" && Object.entries(days).sort(([a],[b]) => a.localeCompare(b)).map(([date, { total: dayTotal, logs: dayLogs }]) => {
            const d = new Date(date.replace(/\//g, '-'));
            const weekday = ["日","月","火","水","木","金","土"][d.getDay()];
            const label = `${date.slice(5).replace('/', '月')}日（${weekday}）`;
            const isDateOpen = expandedDate === "dc_" + date;
            // Group by category
            const catData = {};
            dayLogs.forEach(l => {
              const taskCat = l.task.match(/【(.+?)】/);
              const cat = taskCat ? taskCat[1] : l.project;
              if (!catData[cat]) catData[cat] = { total: 0, logs: [] };
              catData[cat].total += l.duration;
              catData[cat].logs.push(l);
            });
            return (
              <div key={date}>
                <div onClick={() => setExpandedDate(isDateOpen ? null : "dc_" + date)} style={{ display: "flex", justifyContent: "space-between", padding: "5px 12px", fontSize: 12, color: "#666666", cursor: "pointer", borderRadius: 6 }}
                  onMouseEnter={e => e.currentTarget.style.background = "#f9f5f0"}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                  <span><span style={{ fontSize: 9, marginRight: 4 }}>{isDateOpen ? "▼" : "▶"}</span>{label}</span>
                  <span>{formatDurationShort(dayTotal)}</span>
                </div>
                {isDateOpen && (
                  <div style={{ marginLeft: 16, borderLeft: "2px solid #f0ebe4", paddingLeft: 10, marginBottom: 6 }}>
                    {Object.entries(catData).sort(([,a],[,b]) => b.total - a.total).map(([cat, { total: catDur, logs: catLogs }]) => {
                      const catKey = date + "|" + cat;
                      const isCatOpen = expandedCat === catKey;
                      const maxCat = Math.max(...Object.values(catData).map(d => d.total), 1);
                      return (
                        <div key={cat} style={{ marginBottom: 4 }}>
                          <div onClick={() => setExpandedCat(isCatOpen ? null : catKey)} style={{ display: "flex", justifyContent: "space-between", padding: "2px 4px", fontSize: 11, cursor: "pointer", borderRadius: 4 }}
                            onMouseEnter={e => e.currentTarget.style.background = "#f9f5f0"}
                            onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                            <span style={{ color: projectColor(cat), fontWeight: 500 }}>
                              <span style={{ fontSize: 9, marginRight: 4 }}>{isCatOpen ? "▼" : "▶"}</span>{cat}
                            </span>
                            <span style={{ color: "#666", fontSize: 11 }}>{formatDurationShort(catDur)}</span>
                          </div>
                          <div style={{ background: "#f0ebe4", borderRadius: 3, height: 10, overflow: "hidden", marginBottom: isCatOpen ? 4 : 0, marginLeft: 14 }}>
                            <div style={{ width: `${(catDur/maxCat)*100}%`, height: "100%", background: projectColor(cat)+"44", borderRight: `2px solid ${projectColor(cat)}`, transition: "width 0.5s", minWidth: 3 }} />
                          </div>
                          {isCatOpen && (
                            <div style={{ marginLeft: 24, borderLeft: "2px solid #f0ebe4", paddingLeft: 8, marginBottom: 4 }}>
                              {catLogs.sort((a, b) => new Date(a.startedAt) - new Date(b.startedAt)).map(l => (
                                <div key={l.id} style={{ padding: "2px 0", fontSize: 10 }}>
                                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                                    <span style={{ color: "#888" }}>{formatDateTime(l.startedAt).slice(11)}</span>
                                    <span style={{ color: "#999", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.task.replace(/【.+?】\s*/, '')}{l.note ? ` / ${l.note}` : ""}</span>
                                    <span style={{ color: "#888", flexShrink: 0 }}>{formatDurationShort(l.duration)}</span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
          {view === "project" && (() => {
            const monthLogs = Object.values(days).flatMap(d => d.logs);
            const catData = {};
            monthLogs.forEach(l => {
              const taskCat = l.task.match(/【(.+?)】/);
              const cat = taskCat ? taskCat[1] : l.project;
              if (!catData[cat]) catData[cat] = { total: 0, logs: [] };
              catData[cat].total += l.duration;
              catData[cat].logs.push(l);
            });
            const maxP = Math.max(...Object.values(catData).map(d => d.total), 1);
            return Object.entries(catData).sort(([,a],[,b]) => b.total - a.total).map(([cat, { total: catDur, logs: catLogs }]) => {
              const catKey = month + "|" + cat;
              const isOpen = expandedCat === catKey;
              return (
              <div key={cat} style={{ padding: "4px 8px", fontSize: 12 }}>
                <div onClick={() => setExpandedCat(isOpen ? null : catKey)} style={{ display: "flex", justifyContent: "space-between", marginBottom: 2, cursor: "pointer", borderRadius: 4, padding: "2px 4px" }}
                  onMouseEnter={e => e.currentTarget.style.background = "#f9f5f0"}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                  <span style={{ color: projectColor(cat), fontWeight: 500 }}>
                    <span style={{ fontSize: 9, marginRight: 4 }}>{isOpen ? "▼" : "▶"}</span>{cat}
                  </span>
                  <span style={{ color: "#666" }}>{formatDurationShort(catDur)}</span>
                </div>
                <div style={{ background: "#f0ebe4", borderRadius: 3, height: 14, overflow: "hidden", marginBottom: isOpen ? 6 : 0 }}>
                  <div style={{ width: `${(catDur/maxP)*100}%`, height: "100%", background: projectColor(cat)+"44", borderRight: `2px solid ${projectColor(cat)}`, transition: "width 0.5s", minWidth: 3 }} />
                </div>
                {isOpen && (
                  <div style={{ marginLeft: 16, borderLeft: "2px solid #f0ebe4", paddingLeft: 10, marginBottom: 6 }}>
                    {catLogs.sort((a, b) => new Date(a.startedAt) - new Date(b.startedAt)).map(l => (
                      <div key={l.id} style={{ padding: "3px 0", fontSize: 11 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                          <span style={{ color: "#888" }}>{formatDateTime(l.startedAt)}</span>
                          <span style={{ color: "#888", flexShrink: 0 }}>{formatDurationShort(l.duration)}</span>
                        </div>
                        <div style={{ color: "#999" }}>{l.project} — {l.task.replace(/【.+?】\s*/, '')}{l.note ? ` / ${l.note}` : ""}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );});
          })()}
        </div>
      );})}
    </div>
  );
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
  const [deletedIds, setDeletedIds] = useState(() => loadLS("wl_deletedIds", []));
  const [running, setRunning] = useState(false);
  const [paused, setPaused] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [startTime, setStartTime] = useState(null);
  const [activeTab, setActiveTab] = useState("report");
  const [reportTab, setReportTab] = useState("project");
  const [exportStatus, setExportStatus] = useState(null);
  const [exportedIds, setExportedIds] = useState(() => new Set(loadLS("wl_exportedIds", [])));
  const [lastDeleted, setLastDeleted] = useState([]);
  const [updatedNoteIds, setUpdatedNoteIds] = useState(new Set());
  const [savedLogs, setSavedLogs] = useState([]);
  const [editingNote, setEditingNote] = useState(null);
  const [savedLogNotes, setSavedLogNotes] = useState({});
  const [preNote, setPreNote] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);
  const [addProject, setAddProject] = useState("");
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
  const [logDurationMode, setLogDurationMode] = useState(true);
  const [logMinutes, setLogMinutes] = useState("");
  const [poolSort, setPoolSort] = useState("event");
  const [expandedGroups, setExpandedGroups] = useState(new Set());
  const [poolShowAll, setPoolShowAll] = useState(false);
  const [hiddenProjects, setHiddenProjects] = useState(() => { try { return new Set(JSON.parse(localStorage.getItem("wl_hidden_projects")||"[]")); } catch { return new Set(); } });
  const [showHiddenProjects, setShowHiddenProjects] = useState(false);
  const toggleHideProject = (projName) => { setHiddenProjects(prev => { const next = new Set(prev); if (next.has(projName)) next.delete(projName); else next.add(projName); try { localStorage.setItem("wl_hidden_projects", JSON.stringify([...next])); } catch {} return next; }); };

  useEffect(() => { saveLS("wl_projects", projects); }, [projects]);
  useEffect(() => { saveLS("wl_tasks", tasks); }, [tasks]);
  useEffect(() => { saveLS("wl_logs", logs); }, [logs]);
  useEffect(() => { saveLS("wl_selectedProject", selectedProject); }, [selectedProject]);
  useEffect(() => { saveLS("wl_selectedTask", selectedTask); }, [selectedTask]);
  useEffect(() => { saveLS("wl_exportedIds", [...exportedIds]); }, [exportedIds]);
  useEffect(() => { saveLS("wl_deletedIds", deletedIds); }, [deletedIds]);
  useEffect(() => { saveLS("wl_hidden_tasks", hiddenTasks); }, [hiddenTasks]);

  const { memberId: authMemberId, displayName: authDisplayName } = useAuth();
  // eslint-disable-next-line no-unused-vars
  const [userName] = useState(() => authDisplayName || loadLS("wl_userName", ""));
  const [myMemberId] = useState(() => authMemberId || ((() => { try { return localStorage.getItem("wf_myMemberId") || ""; } catch { return ""; } })()));
  const [gasUrl, setGasUrl] = useState(() => loadLS("wl_gasUrl", GAS_URL));
  const DEFAULT_SHEET_URL = "https://docs.google.com/spreadsheets/d/1C2zF59fpeSC7iBOSIlbrPwcIqUa86UIiZM22d7-g8N0/edit?gid=96225699#gid=96225699";
  const [sheetUrl, setSheetUrl] = useState(() => loadLS("wl_sheetUrl", DEFAULT_SHEET_URL));
  useEffect(() => {
    if (!gasUrl) return;
    fetchFromGAS(gasUrl, "getLogs").then(data => {
      if (data && data.logs) {
        const pendingDeleted = new Set(loadLS("wl_deletedIds", []).map(String));
        const filteredLogs = pendingDeleted.size > 0
          ? data.logs.filter(l => !pendingDeleted.has(String(l.id)))
          : data.logs;
        setLogs(filteredLogs);
        setExportedIds(prev => new Set([...prev, ...filteredLogs.map(l => String(l.id))]));
        // 未同期の削除をGASに送信してクリーンアップ
        if (pendingDeleted.size > 0) {
          postToGAS(gasUrl, { action: "syncLogs", logs: [], deletedIds: [...pendingDeleted], updatedNotes: [] })
            .then(ok => { if (ok) { setDeletedIds([]); } });
        }
      }
    });
  }, [gasUrl]);
  const intervalRef = useRef(null);

  const today = new Date().toLocaleDateString("ja-JP", { year: "numeric", month: "2-digit", day: "2-digit" });
  const [plans, setPlans] = useState(() => loadLS("wl_plans", []));
  useEffect(() => { saveLS("wl_plans", plans); }, [plans]);
  useEffect(() => {
    setPlans(prev => prev
      .filter(p => !p.done || p.date === today)
      .map(p => (!p.done && p.date !== today) ? { ...p, date: today } : p)
    );
  }, [today]);

  // wfタスクの完了済みID（GASによる上書きで復活しない様にローカル保持）
  const [wfDoneIds, setWfDoneIds] = useState(() => new Set(loadLS("wl_wf_done_ids", [])));
  useEffect(() => { saveLS("wl_wf_done_ids", [...wfDoneIds]); }, [wfDoneIds]);

  const [wfData, setWfData] = useState(() => {
    const d = loadLS("kodawarin_tasks", null);
    if (d && d.members && d.projects) {
      const tsuge = d.members.find(m => m.name === '柘植千佳');
      if (tsuge) {
        let changed = false;
        d.projects = d.projects.map(p => {
          if (!(p.visibleMemberIds || []).includes(tsuge.id)) {
            changed = true;
            return { ...p, visibleMemberIds: [...(p.visibleMemberIds || []), tsuge.id] };
          }
          return p;
        });
        if (changed) saveLS("kodawarin_tasks", d);
      }
    }
    return d;
  });

  // wfDataが更新されたとき、ワークフロー側でtodo/doingに戻ったタスクをwfDoneIdsから除去
  useEffect(() => {
    if (!wfData?.tasks) return;
    setWfDoneIds(prev => {
      const next = new Set(prev);
      let changed = false;
      wfData.tasks.forEach(t => {
        if ((t.status === 'todo' || t.status === 'doing') && next.has(String(t.id))) {
          next.delete(String(t.id));
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [wfData]);
  useEffect(() => {
    const storageHandler = e => {
      if (e.key === "kodawarin_tasks") { try { setWfData(JSON.parse(e.newValue)); } catch {} }
      if (e.key === "wl_gasUrl") { setGasUrl(e.newValue || ""); }
      if (e.key === "wl_sheetUrl") { setSheetUrl(e.newValue || DEFAULT_SHEET_URL); }
    };
    // 同一タブでワークフロー側が更新した場合も反映（タブフォーカス時・visibility復帰時）
    const refreshHandler = () => { setWfData(loadLS("kodawarin_tasks", null)); };
    window.addEventListener("storage", storageHandler);
    window.addEventListener("focus", refreshHandler);
    document.addEventListener("visibilitychange", () => { if (!document.hidden) refreshHandler(); });
    return () => {
      window.removeEventListener("storage", storageHandler);
      window.removeEventListener("focus", refreshHandler);
    };
  }, [DEFAULT_SHEET_URL]);

  useEffect(() => {
    window.fixAssign = (keyword) => {
      const kw = keyword || '260705';
      const data = JSON.parse(localStorage.getItem('kodawarin_tasks'));
      if (!data || !myMemberId) { console.log('data or myMemberId missing, myMemberId=' + myMemberId); return; }
      const proj = data.projects.find(function(p) { return p.name && p.name.indexOf(kw) >= 0; });
      if (!proj) { console.log('project not found: ' + kw); return; }
      console.log('project: ' + proj.name + ' id=' + proj.id);
      const projTasks = data.tasks.filter(function(t) { return t.projectId === proj.id; });
      console.log('total tasks in project: ' + projTasks.length);
      projTasks.forEach(function(t) {
        const assigned = (t.assigneeIds || []).indexOf(myMemberId) >= 0;
        console.log('[' + t.status + '] ' + (assigned ? 'OK' : 'NOT ASSIGNED') + ' - ' + t.title);
      });
      let assigned = 0, undoneTodo = 0;
      data.tasks = data.tasks.map(function(t) {
        if (t.projectId !== proj.id) return t;
        var updated = Object.assign({}, t);
        if ((updated.assigneeIds || []).indexOf(myMemberId) < 0) {
          updated.assigneeIds = (updated.assigneeIds || []).concat([myMemberId]);
          assigned++;
        }
        if (updated.status === 'done') { updated.status = 'todo'; undoneTodo++; }
        return updated;
      });
      localStorage.setItem('kodawarin_tasks', JSON.stringify(data));
      setWfData(data);
      // wfDoneIds から260705タスクのIDを除去
      var projTaskIds = projTasks.map(function(t) { return String(t.id); });
      setWfDoneIds(function(prev) {
        var next = new Set(prev);
        projTaskIds.forEach(function(id) { next.delete(id); });
        return next;
      });
      console.log('assigned: ' + assigned + ', status reset to todo: ' + undoneTodo + ', cleared from doneIds: ' + projTaskIds.length);
    };
  }, [myMemberId]);

  // Derive Workflow project names and task titles
  const wfProjects = wfData?.projects || [];
  const wfProjectNames = [...new Set(wfProjects.filter(p=>!p.closed).map(p=>p.name))];

  // Merged lists (Workflow first, then local additions)
  const allProjects = [...new Set([...wfProjectNames, ...projects])];
  const localTasks = tasks.filter(t=>!hiddenTasks.includes(t)).sort((a,b)=>a.localeCompare(b,'ja'));
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
      if (gasUrl) postToGAS(gasUrl, { action: "syncLogs", logs: [], deletedIds: [strId], updatedNotes: [] });
    }
    setExportedIds(prev => { const s = new Set(prev); s.delete(strId); return s; });
  }

  function undoDelete() {
    if (lastDeleted.length === 0) return;
    const [first, ...rest] = lastDeleted;
    setLogs(prev => [first, ...prev]);
    setLastDeleted(rest);
    setDeletedIds(prev => prev.filter(id => String(id) !== String(first.id)));
    if (gasUrl) {
      postToGAS(gasUrl, { action: "syncLogs", logs: [first], deletedIds: [], updatedNotes: [] });
      setExportedIds(prev => new Set([...prev, String(first.id)]));
    }
  }

  function updateNote(id, note) {
    setLogs(prev => prev.map(l => l.id === id ? { ...l, note } : l));
    setUpdatedNoteIds(prev => new Set([...prev, String(id)]));
    if (gasUrl && exportedIds.has(String(id))) {
      postToGAS(gasUrl, { action: "syncLogs", logs: [], deletedIds: [], updatedNotes: [{ id, note }] });
    }
  }

  function addToPlan(project, task, wfTaskId) {
    if (plans.some(p => p.date === today && p.project === project && p.task === task && !p.done)) return;
    if (project && !projects.includes(project)) setProjects(prev => [...prev, project]);
    setPlans(prev => [...prev, { id: Date.now(), project: project || "", task, date: today, minutes: 0, due: null, note: null, done: false, status: 'todo', wfTaskId: wfTaskId || null }]);
  }

  function undoWfTask(taskId) {
    setWfDoneIds(prev => { const next = new Set(prev); next.delete(String(taskId)); return next; });
    const wfMainData = loadLS("kodawarin_tasks", null);
    if (wfMainData && wfMainData.tasks) {
      const updatedMain = { ...wfMainData, tasks: wfMainData.tasks.map(t => {
        if (t.id !== taskId) return t;
        const { doneAt: _, ...rest } = t;
        return { ...rest, status: 'todo' };
      })};
      saveLS("kodawarin_tasks", updatedMain);
      setWfData(updatedMain);
      const wfGasUrl = localStorage.getItem('wf_gasUrl');
      if (wfGasUrl) postToGAS(wfGasUrl, { action: 'saveWorkflowData', data: updatedMain });
    }
  }

  function togglePlanDone(id) {
    const plan = plans.find(p => p.id === id);
    if (!plan) return;
    if (!plan.done) {
      // 完了にする
      const wfTask = plan.wfTaskId
        ? (wfData?.tasks || []).find(t => t.id === plan.wfTaskId)
        : (wfData?.tasks || []).find(t =>
            resolveWfProject(t) === plan.project && t.title === plan.task &&
            (t.status === 'todo' || t.status === 'doing') && !wfDoneIds.has(String(t.id))
          );
      if (wfTask && !wfDoneIds.has(String(wfTask.id)) && wfTask.status !== 'done') {
        toggleWfTask(wfTask.id, wfTask.status);
      }
      setPlans(prev => prev.map(p => p.id !== id ? p : { ...p, done: true, doneAt: Date.now() }));
    } else {
      // 完了を取り消す
      const wfTask = plan.wfTaskId
        ? (wfData?.tasks || []).find(t => t.id === plan.wfTaskId)
        : (wfData?.tasks || []).find(t =>
            resolveWfProject(t) === plan.project && t.title === plan.task && t.status === 'done'
          );
      if (wfTask) undoWfTask(wfTask.id);
      setPlans(prev => prev.map(p => {
        if (p.id !== id) return p;
        const { doneAt: _, ...rest } = p;
        return { ...rest, done: false };
      }));
    }
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

  function resetAddForm() {
    setShowAddForm(false); setAddProject(""); setAddTask(""); setAddDueDate(""); setAddMinutes(""); setAddNote(""); setAddStatus("todo"); setCustomTask("");
  }

  function handleAddTaskToTimer() {
    const task = customTask.trim() || addTask;
    const project = addProject.trim();
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
    setLogShowForm(false); setLogFromWf(false); setLogMode(""); setLogProject(""); setLogTask(""); setLogCustomTask(""); setLogStartTime(""); setLogEndTime(""); setLogNote(""); setLogDurationMode(false); setLogMinutes("");
  }

  function submitLog() {
    const task = logCustomTask.trim() || logTask;
    if (!logEffectiveProject || !task) return;
    if (logCustomTask.trim() && !tasks.includes(logCustomTask.trim())) setTasks(prev=>[...prev,logCustomTask.trim()]);
    if (!projects.includes(logEffectiveProject)) setProjects(prev=>[...prev,logEffectiveProject]);
    let startedAt, endedAt, duration;
    if (logDurationMode) {
      const mins = parseInt(logMinutes) || 0;
      duration = mins * 60;
      const now = new Date();
      endedAt = now.toISOString();
      startedAt = new Date(now.getTime() - duration * 1000).toISOString();
    } else {
      duration = (!logStartTime||!logEndTime) ? 0 : Math.max(0, Math.floor((new Date(logEndTime)-new Date(logStartTime))/1000));
      startedAt = new Date(logStartTime).toISOString();
      endedAt = new Date(logEndTime).toISOString();
    }
    const log = { id:Date.now(), project:logEffectiveProject, task, startedAt, endedAt, duration, note:logNote };
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
    <div style={{ minHeight: "100vh", background: "#fafaf8", color: "#333333", fontFamily: "'Noto Sans JP', 'DM Mono', sans-serif" }}>
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
        tabs={[]}
        activeTab={activeTab}
        onTabChange={setActiveTab}
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

        {false && activeTab === "timer" && (
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
        <div style={{ display:"flex",gap:8 }}>
          <button onClick={handleStart} disabled={!selectedTask.trim()||!selectedProject} className="btn"
            style={{ flex:1,padding:14,background:(selectedTask.trim()&&selectedProject)?"#FF8C42":"#f0ebe4",color:(selectedTask.trim()&&selectedProject)?"#fff":"#bbbbbb",fontSize:14,letterSpacing:"0.1em" }}>
            ▶ 開始
          </button>
          <button onClick={()=>setLogShowForm(true)} className="btn"
            style={{ padding:"14px 18px",background:"#f0ebe4",color:"#888888",fontSize:13,letterSpacing:"0.06em",whiteSpace:"nowrap" }}>
            ✎ 手動ログ
          </button>
        </div>
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

    {/* ── Manual log form ── */}
    {(()=>{
      const logDurationCalc = (()=>{ if(!logStartTime||!logEndTime) return null; const diff=(new Date(logEndTime)-new Date(logStartTime))/1000; return diff>0?Math.floor(diff):null; })();
      if (!logShowForm) return null;
      return (
        <div style={{ background:"#ffffff",border:"1px solid #f0ebe4",borderRadius:16,padding:20,marginBottom:12 }}>
          <div style={{ fontSize:11,color:"#999999",letterSpacing:"0.1em",marginBottom:12 }}>手動ログ追加</div>
          <div style={{ padding:16,background:"#f7f4f0",borderRadius:12 }}>
            {logFromWf ? (
              <div style={{ marginBottom:12,padding:"8px 12px",background:"#ffffff",borderRadius:8,border:"1px solid #e8e0d8" }}>
                <div style={{ fontSize:11,color:"#999999",marginBottom:2 }}>{logProject}</div>
                <div style={{ fontSize:13,color:"#333333",fontWeight:500 }}>{logTask}</div>
              </div>
            ) : (<>
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
                    {localTasks.map(t=>(
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
              <div style={{ display:"flex",gap:6,marginBottom:12 }}>
                <button onClick={()=>setLogDurationMode(false)} className="btn"
                  style={{ flex:1,padding:"7px",background:!logDurationMode?"#FF8C42":"#f0ebe4",color:!logDurationMode?"#fff":"#888888",fontSize:11,letterSpacing:"0.05em" }}>
                  時刻で入力
                </button>
                <button onClick={()=>setLogDurationMode(true)} className="btn"
                  style={{ flex:1,padding:"7px",background:logDurationMode?"#FF8C42":"#f0ebe4",color:logDurationMode?"#fff":"#888888",fontSize:11,letterSpacing:"0.05em" }}>
                  所要時間のみ
                </button>
              </div>
              {logDurationMode ? (
                <div style={{ marginBottom:12 }}>
                  <div style={{ fontSize:11,color:"#999999",letterSpacing:"0.1em",marginBottom:6 }}>所要時間（分）</div>
                  <input type="number" value={logMinutes} onChange={e=>setLogMinutes(e.target.value)} placeholder="例：30" min="1" style={{ marginBottom:6 }}/>
                  <div style={{ fontSize:11,color:"#aaaaaa" }}>送信日（{today}）が記録されます</div>
                </div>
              ) : (
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
              )}
              <div style={{ marginBottom:12 }}>
                <div style={{ fontSize:11,color:"#999999",letterSpacing:"0.1em",marginBottom:6 }}>詳細・備考</div>
                <textarea value={logNote} onChange={e=>setLogNote(e.target.value)} placeholder="詳細・備考を入力..." rows={2} style={{ fontSize:12,resize:"vertical" }}/>
              </div>
            </>)}
            <div style={{ display:"flex",gap:8 }}>
              <button onClick={resetLogForm} className="btn"
                style={{ padding:"8px 16px",background:"#e8e0d8",color:"#666666",fontSize:12 }}>キャンセル</button>
              {(()=>{
                const okBase = !!logEffectiveProject && !!(logTask || logCustomTask.trim());
                const okTime = logDurationMode ? (!!logMinutes && parseInt(logMinutes) > 0) : true;
                const ok = okBase && okTime;
                return (
                  <button onClick={submitLog} disabled={!ok} className="btn"
                    style={{ flex:1,padding:"8px 16px",background:ok?"#FF8C42":"#f0ebe4",color:ok?"#fff":"#bbbbbb",fontSize:12 }}>
                    ログ追加（シート送信）
                  </button>
                );
              })()}
            </div>
          </div>
        </div>
      );
    })()}

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

    {/* ── Today's priority list ── */}
    <div style={{ background:"#ffffff",border:"1px solid #f0ebe4",borderRadius:16,padding:20,marginBottom:12 }}>
      <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12 }}>
        <span style={{ fontSize:11,color:"#999999",letterSpacing:"0.1em" }}>{today} の優先タスク</span>
        <span style={{ fontSize:10,color:"#cccccc" }}>タップで選択 → タイマー / 手動ログ</span>
      </div>
      {(()=>{
        const DAY = 86400000;
        const now = Date.now();
        const wfTaskDone = p => { if (!p.wfTaskId) return false; const t=(wfData?.tasks||[]).find(t=>t.id===p.wfTaskId); return (t&&t.status==='done')||wfDoneIds.has(String(p.wfTaskId)); };
        const planEventKey = proj => { const m=(proj||"").match(/^(\d{6})/); return m?m[1]:"000000"; };
        const todayPlanItems = plans.filter(p=>p.date===today).filter(p=>p.done?(p.doneAt&&(now-p.doneAt)<DAY):!wfTaskDone(p)).sort((a,b)=>{
          const ea=planEventKey(a.project),eb=planEventKey(b.project);
          if(ea!==eb)return ea.localeCompare(eb);
          if(a.done!==b.done)return a.done?1:-1;
          if(a.due&&b.due)return a.due.localeCompare(b.due);if(a.due)return -1;if(b.due)return 1;return 0;
        });
        if (todayPlanItems.length===0) return (
          <div style={{ fontSize:12,color:"#cccccc",textAlign:"center",padding:"20px 0",borderRadius:10,border:"2px dashed #f0ebe4" }}>
            下のプールで ★ を押して追加<br/><span style={{fontSize:10}}>タイマーとログで共有されます</span>
          </div>
        );
        const planGroups=[]; const planSeen=new Map();
        todayPlanItems.forEach(p=>{ const k=p.project||''; if(!planSeen.has(k)){planSeen.set(k,[]);planGroups.push(k);} planSeen.get(k).push(p); });
        return planGroups.map(proj=>(
          <div key={proj} style={{marginBottom:8}}>
            {proj && <div style={{fontSize:10,fontWeight:700,color:"#5b7fa6",letterSpacing:"0.08em",padding:"4px 12px 2px",opacity:0.8}}>{proj}</div>}
            {planSeen.get(proj).map(p=>{
              const isSelected = !p.done && selectedProject===p.project && selectedTask===p.task;
              const ds = p.due ? getWorkflowDueDateStyle(p.due) : null;
              return (
                <div key={p.id} onClick={()=>{if(!running&&!p.done){setSelectedProject(p.project);setSelectedTask(p.task);}if(!p.done){setLogProject(p.project);setLogTask(p.task);setLogCustomTask("");setLogFromWf(true);}}}
                  style={{ display:"flex",alignItems:"center",gap:10,padding:"8px 12px",borderRadius:10,marginBottom:2,
                    background:isSelected?"#FF8C4212":"transparent",cursor:p.done?"default":"pointer",opacity:p.done?0.5:1,
                    transition:"background 0.15s",border:`1px solid ${isSelected?"#FF8C4244":"transparent"}` }}>
                  <div style={{flex:1}}>
                    <div style={{fontSize:13,color:p.done?"#bbbbbb":"#333333",textDecoration:p.done?"line-through":"none"}}>{p.task}{p.minutes?<span style={{fontSize:11,color:"#aaaaaa"}}> · {p.minutes}分</span>:""}{p.status==='doing'&&!p.done?<span style={{fontSize:11,color:"#FF8C42"}}> · 進行中</span>:""}</div>
                  </div>
                  {ds?.label && <span style={{fontSize:11,color:ds.color,fontWeight:600,whiteSpace:"nowrap"}}>{ds.label}</span>}
                  <button onClick={e=>{e.stopPropagation();togglePlanDone(p.id);}} className="btn"
                    style={{ padding:"4px 8px",background:p.done?"#4FC48A22":"#f0ebe4",color:p.done?"#4FC48A":"#aaa",fontSize:10,flexShrink:0,border:p.done?"1px solid #4FC48A44":"1px solid #e8e0d8" }}>
                    {p.done?"✓ 済":"→完了"}
                  </button>
                  <button onClick={e=>{e.stopPropagation();deletePlan(p.id);}} className="btn"
                    style={{padding:"4px 8px",background:"transparent",color:"#bbbbbb",fontSize:10,flexShrink:0,border:"1px solid #e8e0d8"}}>低優先へ</button>
                </div>
              );
            })}
          </div>
        ));
      })()}
    </div>

    {/* ── Task pool ── */}
    <div style={{ background:"#ffffff",border:"1px solid #f0ebe4",borderRadius:16,padding:20,marginBottom:12 }}>
      <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12 }}>
        <span style={{ fontSize:11,color:"#999999",letterSpacing:"0.1em" }}>タスクプール <span style={{color:"#cccccc",fontSize:10}}>★ で優先タスクに追加</span></span>
        <div style={{ display:"flex",gap:4 }}>
          <button onClick={()=>{setPoolSort("due");setPoolShowAll(false);}} className="btn"
            style={{ padding:"3px 10px",fontSize:10,background:poolSort==="due"?"#FF8C42":"#f0ebe4",color:poolSort==="due"?"#fff":"#888888",borderRadius:12 }}>
            期日順
          </button>
          <button onClick={()=>{setPoolSort("event");setPoolShowAll(false);}} className="btn"
            style={{ padding:"3px 10px",fontSize:10,background:poolSort==="event"?"#FF8C42":"#f0ebe4",color:poolSort==="event"?"#fff":"#888888",borderRadius:12 }}>
            イベント順
          </button>
        </div>
      </div>
      {(()=>{
        const eventDateKey = proj => { const m = (proj||"").match(/^(\d{6})/); return m ? m[1] : "000000"; };
        const allNonClosedProjects = (wfProjects||[]).filter(p=>!p.closed);
        const myProjectIds = new Set(allNonClosedProjects.filter(p=>(p.visibleMemberIds||[]).includes(myMemberId)).map(p=>p.id));
        const allTodoDoingTasks = (wfData?.tasks||[]).filter(t=>(t.status==='todo'||t.status==='doing')&&!wfDoneIds.has(String(t.id)));
        const myWfTasks = myMemberId
          ? allTodoDoingTasks.filter(t=>(t.assigneeIds||[]).includes(myMemberId)||myProjectIds.has(t.projectId))
            .map(t=>({id:t.id,task:t.title,project:resolveWfProject(t),due:t.due}))
            .filter(t=>showHiddenProjects||!hiddenProjects.has(t.project))
            .sort((a,b)=>{
              if (poolSort==="event") {
                const ea=eventDateKey(a.project), eb=eventDateKey(b.project);
                if (ea!==eb) return ea.localeCompare(eb);
                return (a.project||"").localeCompare(b.project||"");
              }
              if(a.due&&b.due)return a.due.localeCompare(b.due);if(a.due)return -1;if(b.due)return 1;return 0;
            })
          : [];
        if (myWfTasks.length===0 && !myMemberId && wfData?.tasks?.length>0) return (
          <div style={{fontSize:12,color:"#aaaaaa",textAlign:"center",padding:"8px 0",marginBottom:8}}>ワークフローで「自分を設定」するとタスクが表示されます</div>
        );
        const renderTask = item => {
          const ds = item.due?getWorkflowDueDateStyle(item.due):null;
          const alreadyAdded = plans.some(p=>p.date===today&&p.project===item.project&&p.task===item.task&&!p.done);
          const isPoolSelected = selectedProject===item.project && selectedTask===item.task;
          return (
            <div key={item.id} onClick={()=>{setSelectedProject(item.project);setSelectedTask(item.task);setLogProject(item.project);setLogTask(item.task);setLogCustomTask("");setLogFromWf(true);}}
              style={{display:"flex",alignItems:"center",gap:10,padding:"10px 12px",borderRadius:10,marginBottom:4,
                background:isPoolSelected?"#FF8C4212":"transparent",border:`1px solid ${isPoolSelected?"#FF8C4244":"transparent"}`,transition:"background 0.15s",cursor:"pointer"}}>
              <button onClick={()=>toggleWfTask(item.id, 'todo')} className="btn"
                style={{padding:"4px 10px",background:"#f0ebe4",color:"#999999",fontSize:12,minWidth:36,flexShrink:0}}>
                ○
              </button>
              <div style={{flex:1}}>
                {poolSort!=="event" && item.project && <div style={{fontSize:12,color:"#5b7fa6",marginBottom:2,fontWeight:500}}>{item.project}</div>}
                <div style={{fontSize:13,color:"#333333"}}>{item.task}</div>
              </div>
              {ds?.label && <span style={{fontSize:11,color:ds.color,fontWeight:600,whiteSpace:"nowrap"}}>{ds.label}</span>}
              <button onClick={()=>addToPlan(item.project,item.task,item.id)} disabled={alreadyAdded} className="btn"
                style={{padding:"4px 10px",background:"transparent",color:alreadyAdded?"#F7C34F":"#cccccc",fontSize:18,flexShrink:0,lineHeight:1}}>
                {alreadyAdded?"★":"☆"}
              </button>
            </div>
          );
        };
        if (poolSort !== "event") {
          const POOL_LIMIT = 10;
          const visible = poolShowAll ? myWfTasks : myWfTasks.slice(0, POOL_LIMIT);
          const hidden = myWfTasks.length - visible.length;
          return (<>
            {visible.map(renderTask)}
            {hidden > 0 && (
              <button onClick={()=>setPoolShowAll(true)} className="btn"
                style={{width:"100%",padding:"10px",background:"#f7f4f0",color:"#888888",fontSize:12,letterSpacing:"0.05em",marginTop:4,borderRadius:10}}>
                ▼ もっと見る（残り{hidden}件）
              </button>
            )}
            {poolShowAll && myWfTasks.length > POOL_LIMIT && (
              <button onClick={()=>setPoolShowAll(false)} className="btn"
                style={{width:"100%",padding:"8px",background:"transparent",color:"#bbbbbb",fontSize:11,marginTop:4}}>
                ▲ 折りたたむ
              </button>
            )}
          </>);
        }
        // イベント順：プロジェクトごとにグループ化（タスク0件のPJも含む）
        const seen = new Map();
        const groups = [];
        // まず全非closedプロジェクトをグループとして追加
        allNonClosedProjects
          .map(p => p.name)
          .filter(n => n)
          .sort((a, b) => {
            const ea = eventDateKey(a), eb = eventDateKey(b);
            if (ea !== eb) return ea.localeCompare(eb);
            return a.localeCompare(b);
          })
          .forEach(name => {
            if (!seen.has(name)) { seen.set(name, []); groups.push(name); }
          });
        // タスクを各グループに振り分け（五十音順）
        myWfTasks.forEach(item => {
          const key = item.project || '';
          if (!seen.has(key)) { seen.set(key, []); groups.push(key); }
          seen.get(key).push(item);
        });
        seen.forEach(tasks => tasks.sort((a, b) => (a.task || '').localeCompare(b.task || '', 'ja')));
        const filteredGroups = showHiddenProjects ? groups : groups.filter(g => !hiddenProjects.has(g));
        const hiddenCount = groups.length - groups.filter(g => !hiddenProjects.has(g)).length;
        const GROUP_LIMIT = 5;
        const visibleGroups = poolShowAll ? filteredGroups : filteredGroups.slice(0, GROUP_LIMIT);
        const hiddenGroups = filteredGroups.length - visibleGroups.length;
        return (<>
          {visibleGroups.map(proj => {
            const tasks = seen.get(proj) || [];
            const expanded = expandedGroups.has(proj);
            const isEmpty = tasks.length === 0;
            const toggle = () => { if (isEmpty) return; setExpandedGroups(prev => {
              const next = new Set(prev);
              expanded ? next.delete(proj) : next.add(proj);
              return next;
            }); };
            const wfProjObj = (wfProjects||[]).find(p=>p.name===proj);
            const goToWf = (e) => {
              e.stopPropagation();
              if (wfProjObj) { try { localStorage.setItem('wf_projFilter', wfProjObj.id); } catch {} }
              window.open('/', '_blank');
            };
            return (
              <div key={proj}>
                <div onClick={toggle} style={{display:"flex",alignItems:"center",gap:8,margin:"10px 0 4px",padding:"6px 12px",borderRadius:8,cursor:isEmpty?"default":"pointer",background:expanded?"transparent":"#f7f4f0",userSelect:"none"}}>
                  {!isEmpty && <span style={{fontSize:10,color:"#aaaaaa",flexShrink:0,transition:"transform 0.2s",transform:expanded?"rotate(0deg)":"rotate(-90deg)",display:"inline-block"}}>▼</span>}
                  <span style={{fontSize:11,fontWeight:700,color:isEmpty?"#999":"#5b7fa6",letterSpacing:"0.04em",flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{proj||'(プロジェクトなし)'}</span>
                  <span style={{fontSize:10,color:isEmpty?"#bbb":"#bbbbbb",flexShrink:0}}>{isEmpty?"タスクなし":`${tasks.length}件`}</span>
                  <button onClick={(e)=>{e.stopPropagation();toggleHideProject(proj);}} className="btn"
                    style={{padding:"2px 6px",background:"transparent",color:hiddenProjects.has(proj)?"#FF8C42":"#ccc",fontSize:13,flexShrink:0,lineHeight:1}}
                    title={hiddenProjects.has(proj)?"表示する":"非表示にする"}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      {hiddenProjects.has(proj) ? <>
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
                      </> : <>
                        <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94"/>
                        <path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19"/>
                        <line x1="1" y1="1" x2="23" y2="23"/>
                      </>}
                    </svg>
                  </button>
                  <button onClick={goToWf} className="btn"
                    style={{padding:"2px 8px",background:"transparent",color:"#aaa",fontSize:11,flexShrink:0,lineHeight:1}}
                    onMouseEnter={e=>e.currentTarget.style.color="#5b7fa6"}
                    onMouseLeave={e=>e.currentTarget.style.color="#aaa"}>
                    →WF
                  </button>
                </div>
                {expanded && tasks.map(renderTask)}
              </div>
            );
          })}
          {hiddenGroups > 0 && (
            <button onClick={()=>setPoolShowAll(true)} className="btn"
              style={{width:"100%",padding:"10px",background:"#f7f4f0",color:"#888888",fontSize:12,letterSpacing:"0.05em",marginTop:8,borderRadius:10}}>
              ▼ もっと見る（残り{hiddenGroups}プロジェクト）
            </button>
          )}
          {poolShowAll && groups.length > GROUP_LIMIT && (
            <button onClick={()=>setPoolShowAll(false)} className="btn"
              style={{width:"100%",padding:"8px",background:"transparent",color:"#bbbbbb",fontSize:11,marginTop:4}}>
              ▲ 折りたたむ
            </button>
          )}
          {hiddenCount > 0 && (
            <button onClick={()=>setShowHiddenProjects(v=>!v)} className="btn"
              style={{width:"100%",padding:"8px",background:"transparent",color:"#bbbbbb",fontSize:10,marginTop:4}}>
              {showHiddenProjects ? `非表示を隠す` : `非表示のプロジェクト（${hiddenCount}件）を表示`}
            </button>
          )}
        </>);
      })()}

      {/* Add custom task form */}
      {!showAddForm ? (
        <button onClick={()=>{ if(!running) setShowAddForm(true); }} disabled={running} className="btn"
          style={{ width:"100%",padding:"10px",background:"#f0ebe4",color:running?"#cccccc":"#888888",fontSize:12,letterSpacing:"0.06em",marginTop:4 }}>
          ＋ タスクを手動追加
        </button>
      ) : (
        <div style={{ marginTop:12,padding:16,background:"#f7f4f0",borderRadius:12 }}>
          {/* PROJECT */}
          <div style={{ marginBottom:12 }}>
            <div style={{ fontSize:11,color:"#999999",letterSpacing:"0.1em",marginBottom:8 }}>PROJECT</div>
            <div style={{ display:"flex",flexWrap:"wrap",gap:6,marginBottom:8 }}>
              {allProjects.map(p=>(
                <button key={p} onClick={()=>setAddProject(p)} className="btn"
                  style={{ padding:"5px 12px",background:addProject===p?"#FF8C42":"#ffffff",color:addProject===p?"#fff":wfProjectNames.includes(p)?"#FF8C42":"#666666",border:`1px solid ${wfProjectNames.includes(p)?"#FF8C4266":"#e8e0d8"}`,fontSize:12,fontWeight:wfProjectNames.includes(p)?600:400 }}>
                  {p}
                </button>
              ))}
            </div>
            <input value={addProject} onChange={e=>setAddProject(e.target.value)} onKeyDown={e=>{ if(e.key==='Enter') e.preventDefault(); }} placeholder="または直接入力..."/>
          </div>
          {/* TASK */}
          <div style={{ marginBottom:12 }}>
            <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8 }}>
              <div style={{ fontSize:11,color:"#999999",letterSpacing:"0.1em" }}>TASK</div>
              <button type="button" onClick={()=>setTaskEditMode(v=>!v)} style={{ fontSize:10,color:taskEditMode?"#FF8C42":"#aaaaaa",background:"none",border:`1px solid ${taskEditMode?"#FF8C4266":"#e8e0d8"}`,borderRadius:6,padding:"2px 8px",cursor:"pointer",fontFamily:"inherit" }}>{taskEditMode?"完了":"整理"}</button>
            </div>
            <div style={{ display:"flex",flexWrap:"wrap",gap:6,marginBottom:8 }}>
              {localTasks.map(t=>(
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
          {/* Optional fields */}
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
          <div style={{ display:"flex",gap:8 }}>
            <button onClick={resetAddForm} className="btn"
              style={{ padding:"8px 16px",background:"#e8e0d8",color:"#666666",fontSize:12 }}>キャンセル</button>
            {(()=>{
              const proj = addProject.trim();
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


    {/* ── Today's logs summary ── */}
    {(()=>{
      const todayLogs = [...logs].filter(l => formatDate(l.startedAt) === today).sort((a,b) => b.startedAt.localeCompare(a.startedAt));
      return (
        <div style={{ background:"#ffffff",border:"1px solid #f0ebe4",borderRadius:16,overflow:"hidden",marginBottom:16,marginTop:8 }}>
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
  </div>
)}

        {activeTab === "report" && (
          <div className="fade-in">
            {logs.length === 0 ? (
              <div style={{ textAlign: "center", color: "#bbbbbb", padding: "80px 0" }}>まだログがありません</div>
            ) : (
              <>
                <div style={{ display:"flex", gap:2, background:"#f0ebe4", borderRadius:999, padding:2, marginBottom:16 }}>
                  {[["project","プロジェクト別"],["daily","日別・月別"]].map(([k,l])=>(
                    <button key={k} onClick={()=>setReportTab(k)} style={{ flex:1, padding:"7px 0", borderRadius:999, border:"none", background:reportTab===k?"#ffffff":"transparent", color:reportTab===k?"#FF8C42":"#999999", fontWeight:reportTab===k?600:400, fontSize:12, cursor:"pointer", fontFamily:"inherit", transition:"all 0.15s", boxShadow:reportTab===k?"0 1px 4px rgba(0,0,0,0.08)":"none" }}>{l}</button>
                  ))}
                </div>
                {reportTab === "project" && (
                  <ProjectReport logs={logs} projectTotals={projectTotals} maxProject={maxProject} projectColor={projectColor} formatDurationShort={formatDurationShort} formatDateTime={formatDateTime}/>
                )}
                {reportTab === "daily" && (
                  <DailyReport logs={logs} formatDurationShort={formatDurationShort} formatDateTime={formatDateTime} projectColor={projectColor}/>
                )}
              </>
            )}
          </div>
        )}


      </div>
    </div>
  );
}