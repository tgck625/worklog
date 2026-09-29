import React, { useState } from "react";
import { signInWithEmailAndPassword, createUserWithEmailAndPassword } from "firebase/auth";
import { auth } from "./firebase";

const C = {
  cream: '#faf8f4', border: '#ddd8ce', text: '#3a3530', text2: '#7a746c', text3: '#a89f94',
  orange: '#e07840', red: '#b85050',
};

export default function LoginPage() {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      if (mode === "login") {
        await signInWithEmailAndPassword(auth, email, password);
      } else {
        await createUserWithEmailAndPassword(auth, email, password);
      }
    } catch (err) {
      const msg = {
        "auth/invalid-email": "メールアドレスの形式が正しくありません",
        "auth/user-not-found": "アカウントが見つかりません",
        "auth/wrong-password": "パスワードが間違っています",
        "auth/invalid-credential": "メールアドレスまたはパスワードが間違っています",
        "auth/email-already-in-use": "このメールアドレスは既に登録されています",
        "auth/weak-password": "パスワードは6文字以上にしてください",
      }[err.code] || err.message;
      setError(msg);
    }
    setSubmitting(false);
  }

  const card = {
    background: '#fff', borderRadius: 16, border: `1px solid ${C.border}`,
    padding: 32, width: '100%', maxWidth: 360,
  };
  const inp = {
    width: '100%', padding: '10px 14px', borderRadius: 8, border: `1px solid ${C.border}`,
    fontSize: 14, fontFamily: "'Noto Sans JP',sans-serif", outline: 'none', color: C.text,
    marginBottom: 12,
  };
  const btn = {
    width: '100%', padding: '11px 0', borderRadius: 10, border: 'none',
    background: C.orange, color: '#fff', fontSize: 14, fontWeight: 600,
    fontFamily: "'Noto Sans JP',sans-serif", cursor: 'pointer', marginTop: 4,
  };

  return (
    <div style={{
      minHeight: '100vh', background: C.cream, display: 'flex', alignItems: 'center',
      justifyContent: 'center', fontFamily: "'Noto Sans JP',sans-serif", padding: 20,
    }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;600&display=swap');`}</style>
      <div style={card}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{ fontSize: 20, fontWeight: 600, color: C.text, marginBottom: 4 }}>
            {mode === "login" ? "ログイン" : "新規登録"}
          </div>
          <div style={{ fontSize: 12, color: C.text3 }}>Workflow</div>
        </div>
        <form onSubmit={handleSubmit}>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)}
            placeholder="メールアドレス" style={inp} required autoFocus />
          <input type="password" value={password} onChange={e => setPassword(e.target.value)}
            placeholder="パスワード" style={inp} required minLength={6} />
          {error && <div style={{ color: C.red, fontSize: 12, marginBottom: 8 }}>{error}</div>}
          <button type="submit" disabled={submitting} style={{ ...btn, opacity: submitting ? 0.6 : 1 }}>
            {submitting ? "..." : mode === "login" ? "ログイン" : "登録"}
          </button>
        </form>
        <div style={{ textAlign: 'center', marginTop: 16 }}>
          <button onClick={() => { setMode(mode === "login" ? "signup" : "login"); setError(""); }}
            style={{ background: 'none', border: 'none', color: C.text2, fontSize: 12, cursor: 'pointer', textDecoration: 'underline', fontFamily: "'Noto Sans JP',sans-serif" }}>
            {mode === "login" ? "アカウントを作成" : "ログインに戻る"}
          </button>
        </div>
      </div>
    </div>
  );
}
