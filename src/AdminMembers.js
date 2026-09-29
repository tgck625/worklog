import React, { useState, useEffect } from "react";
import { ref, onValue, update } from "firebase/database";
import { db } from "./firebase";

const C = {
  cream: '#faf8f4', border: '#ddd8ce', text: '#3a3530', text2: '#7a746c', text3: '#a89f94',
  orange: '#e07840', green: '#5a9070', red: '#b85050',
};

export default function AdminMembers({ wfMembers }) {
  const [users, setUsers] = useState({});

  useEffect(() => {
    const usersRef = ref(db, "users");
    const unsub = onValue(usersRef, (snap) => {
      setUsers(snap.val() || {});
    });
    return () => unsub();
  }, []);

  function toggleApproved(uid, currentStatus) {
    const newStatus = currentStatus === "approved" ? "pending" : "approved";
    update(ref(db, `users/${uid}`), { status: newStatus });
  }

  function toggleAdmin(uid, currentRole) {
    const isAdmin = currentRole === "admin";
    if (!window.confirm(isAdmin ? "管理者権限を外しますか？" : "管理者権限を付与しますか？")) return;
    update(ref(db, `users/${uid}`), { role: isAdmin ? "member" : "admin" });
  }

  function toggleAccess(uid, key, current) {
    update(ref(db, `users/${uid}/access`), { [key]: !current });
  }

  function setMemberId(uid, memberId) {
    update(ref(db, `users/${uid}`), { memberId });
  }

  function deleteUser(uid, email) {
    if (!window.confirm(`${email} を削除しますか？`) ) return;
    update(ref(db, `users/${uid}`), null);
  }

  const entries = Object.entries(users).sort((a, b) => {
    const aAdmin = a[1].role === "admin";
    const bAdmin = b[1].role === "admin";
    if (aAdmin && !bAdmin) return -1;
    if (!aAdmin && bAdmin) return 1;
    return (a[1].createdAt || '').localeCompare(b[1].createdAt || '');
  });

  const card = { background: '#fff', border: `1px solid ${C.border}`, borderRadius: 14, padding: 16, marginBottom: 10 };
  const badge = (active, color) => ({
    display: 'inline-block', padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600,
    background: active ? color : '#f3f0ea', color: active ? '#fff' : C.text3, cursor: 'pointer',
    border: 'none', fontFamily: "'Noto Sans JP',sans-serif", marginRight: 4,
  });

  return (
    <div>
      <div style={{ fontSize: 14, fontWeight: 600, color: C.text, marginBottom: 12 }}>メンバー管理</div>
      <div style={{ fontSize: 11, color: C.text3, marginBottom: 16 }}>登録済みユーザーの承認・権限を管理します。</div>

      {entries.length === 0 && <div style={{ color: C.text3, fontSize: 12 }}>ユーザーがいません</div>}

      {entries.map(([uid, u]) => (
        <div key={uid} style={card}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{u.displayName || u.email}</span>
            {u.role === "admin" && <span style={{ fontSize: 10, color: C.orange, fontWeight: 700 }}>ADMIN</span>}
          </div>
          <div style={{ fontSize: 11, color: C.text3, marginBottom: 8 }}>{u.email}</div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
            <button onClick={() => toggleApproved(uid, u.status)} style={badge(u.status === "approved", C.green)}>
              {u.status === "approved" ? "承認済" : "未承認"}
            </button>
            <button onClick={() => toggleAdmin(uid, u.role)} style={badge(u.role === "admin", C.orange)}>
              管理者
            </button>
          </div>

          <div style={{ fontSize: 11, color: C.text2, marginBottom: 4 }}>アクセス権:</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
            {[
              ["workflow", "Workflow"],
              ["timesheet", "Timesheet"],
              ["eventstaff", "EventStaff"],
            ].map(([key, label]) => (
              <button key={key} onClick={() => toggleAccess(uid, key, u.access?.[key])}
                style={badge(u.access?.[key], '#5878a0')}>
                {label}
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
            <span style={{ fontSize: 11, color: C.text2 }}>WF メンバー:</span>
            <select value={u.memberId || ""} onChange={e => setMemberId(uid, e.target.value)}
              style={{ fontSize: 12, padding: '3px 6px', borderRadius: 6, border: `1px solid ${C.border}`, fontFamily: "'Noto Sans JP',sans-serif", color: C.text }}>
              <option value="">-- 未設定 --</option>
              {(wfMembers || []).map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>

          <button onClick={() => deleteUser(uid, u.email)}
            style={{ background: 'none', border: 'none', color: C.red, fontSize: 11, cursor: 'pointer', fontFamily: "'Noto Sans JP',sans-serif", textDecoration: 'underline' }}>
            削除
          </button>
        </div>
      ))}
    </div>
  );
}
