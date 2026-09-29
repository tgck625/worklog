import { useNavigate } from "react-router-dom";
import { useAuth } from "./AuthContext";

const ORANGE = "#e07840";
const CREAM  = "#faf8f4";
const BORDER = "#ddd8ce";
const TEXT2  = "#7a746c";
const TEXT3  = "#a89f94";

export default function NavBar({ currentApp, tabs, activeTab, onTabChange, rightActions, runningDot }) {
  const navigate = useNavigate();
  const isDev = window.location.hostname.includes('-dev');
  const { isAdmin, access } = useAuth();

  const allApps = [
    { id: "workflow",  label: "Workflow",  path: "/", accessKey: "workflow" },
    { id: "timesheet", label: "Timesheet", path: "/timesheet", accessKey: "timesheet" },
    { id: "staffshift", label: "スタッフシフト", path: "/eventstaff-shift/", accessKey: "eventstaff" },
  ];
  const visibleApps = isDev ? allApps.filter(app => isAdmin || access[app.accessKey]) : allApps;

  return (
    <div style={{
      display: "flex", alignItems: "center", height: 52,
      background: "#fff", borderBottom: `1px solid ${BORDER}`,
      flexShrink: 0, padding: "0 12px 0 16px", gap: 0,
    }}>
    <style>{`
      .nb-tabs::-webkit-scrollbar { display: none; }
      .nb-tabs { -ms-overflow-style: none; scrollbar-width: none; }
    `}</style>

      {/* ── App switcher ── */}
      <div style={{ display: "flex", alignItems: "center", background: CREAM, borderRadius: 999, padding: 3, gap: 2, marginRight: 8, flexShrink: 0 }}>
        {visibleApps.map(app => {
          const active = currentApp === app.id;
          return (
            <button key={app.id} onClick={() => app.path.startsWith("/eventstaff-shift") ? (window.location.href = app.path) : navigate(app.path)} style={{
              display: "flex", alignItems: "center", gap: 5,
              padding: "5px 14px", borderRadius: 999, border: "none",
              background: active ? "#fff" : "transparent",
              color: active ? ORANGE : TEXT3,
              fontFamily: "'Noto Sans JP', 'DM Mono', sans-serif",
              fontSize: 12, fontWeight: active ? 600 : 400,
              cursor: "pointer", transition: "all 0.15s",
              boxShadow: active ? "0 1px 4px rgba(58,53,48,0.10)" : "none",
              letterSpacing: active ? 0 : 0,
            }}>
              {active && runningDot && (
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: runningDot, boxShadow: `0 0 6px ${runningDot}`, flexShrink: 0 }} />
              )}
              {app.label}
            </button>
          );
        })}
      </div>

      {/* ── Divider ── */}
      <div style={{ width: 1, height: 20, background: BORDER, marginRight: 4, flexShrink: 0 }} />

      {/* ── Page tabs ── */}
      <div className="nb-tabs" style={{ display: "flex", alignItems: "center", flex: 1, overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
        {tabs.map(([id, label]) => {
          const active = activeTab === id;
          return (
            <button key={id} onClick={() => onTabChange(id)} style={{
              padding: "0 16px", height: 52, border: "none", borderRadius: 0,
              borderBottom: active ? `2px solid ${ORANGE}` : "2px solid transparent",
              background: "transparent",
              color: active ? ORANGE : TEXT2,
              fontFamily: "'Noto Sans JP', 'DM Mono', sans-serif",
              fontSize: 13, fontWeight: active ? 600 : 400,
              cursor: "pointer", transition: "all 0.15s", whiteSpace: "nowrap",
            }}>
              {label}
            </button>
          );
        })}
      </div>

      {/* ── Right actions ── */}
      {rightActions && (
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0, flexWrap: "nowrap" }}>
          {rightActions}
        </div>
      )}

      {/* ── Settings button ── */}
      <button onClick={() => navigate("/settings")} style={{
        marginLeft: 8, padding: "5px 10px", borderRadius: 999, border: `1px solid ${BORDER}`,
        background: "transparent", color: TEXT2, cursor: "pointer", fontSize: 14, lineHeight: 1,
        transition: "all 0.15s", flexShrink: 0,
      }}
        onMouseEnter={e=>{ e.currentTarget.style.borderColor="#e07840"; e.currentTarget.style.color="#e07840"; }}
        onMouseLeave={e=>{ e.currentTarget.style.borderColor=BORDER; e.currentTarget.style.color=TEXT2; }}
        title="設定">
        ⚙
      </button>
    </div>
  );
}
