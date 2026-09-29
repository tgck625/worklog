// Firebase Auth for static eventstaff-shift pages
// Uses Firebase CDN (compat mode) loaded in the HTML

(function() {
  // Firebase config — must match src/firebase.js
  const firebaseConfig = {
    apiKey: "AIzaSyBCcflIJwpfOl-3QnEOwIYbuWEBtXSQ8q4",
    authDomain: "koawarin.firebaseapp.com",
    databaseURL: "https://koawarin-default-rtdb.firebaseio.com",
    projectId: "koawarin",
    storageBucket: "koawarin.firebasestorage.app",
    messagingSenderId: "556633584401",
    appId: "1:556633584401:web:781d05008abf9372e192b0",
  };

  // Initialize Firebase (compat)
  if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
  }

  const auth = firebase.auth();
  const db = firebase.database();

  // Create login overlay
  const overlay = document.createElement('div');
  overlay.id = 'auth-overlay';
  overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:#faf8f4;z-index:99999;display:flex;align-items:center;justify-content:center;font-family:"Noto Sans JP",sans-serif';
  overlay.innerHTML = `
    <div id="auth-card" style="width:100%;max-width:380px;background:#fff;border-radius:16px;border:1px solid #ddd8ce;padding:36px 32px;box-shadow:0 2px 12px rgba(58,53,48,0.06)">
      <div style="text-align:center;margin-bottom:24px">
        <div style="font-size:20px;font-weight:600;color:#e07840;margin-bottom:4px">Kodawarin</div>
        <div style="font-size:12px;color:#a89f94">ログイン</div>
      </div>
      <div id="auth-error" style="display:none;margin-bottom:14px;padding:10px 14px;border-radius:8px;background:#fff0ef;color:#b85050;font-size:12px;border:1px solid #ffd0cc"></div>
      <div style="margin-bottom:14px">
        <label style="font-size:11px;font-weight:600;color:#7a746c;display:block;margin-bottom:6px">メールアドレス</label>
        <input id="auth-email" type="email" placeholder="example@email.com" style="width:100%;padding:10px 14px;border-radius:10px;border:1px solid #ddd8ce;font-size:13px;font-family:'Noto Sans JP',sans-serif;outline:none;color:#3a3530;box-sizing:border-box"/>
      </div>
      <div style="margin-bottom:20px">
        <label style="font-size:11px;font-weight:600;color:#7a746c;display:block;margin-bottom:6px">パスワード</label>
        <input id="auth-password" type="password" placeholder="パスワード" style="width:100%;padding:10px 14px;border-radius:10px;border:1px solid #ddd8ce;font-size:13px;font-family:'Noto Sans JP',sans-serif;outline:none;color:#3a3530;box-sizing:border-box"/>
      </div>
      <button id="auth-submit" style="width:100%;padding:14px;border-radius:10px;border:none;background:#e07840;color:#fff;font-size:14px;font-weight:600;cursor:pointer;font-family:'Noto Sans JP',sans-serif">ログイン</button>
    </div>
    <div id="auth-loading" style="display:none;text-align:center;color:#a89f94">読み込み中...</div>
    <div id="auth-denied" style="display:none;text-align:center;padding:20px">
      <div style="font-size:40px;margin-bottom:16px">🚫</div>
      <div style="font-size:16px;font-weight:600;color:#3a3530;margin-bottom:12px">アクセス権限がありません</div>
      <div style="font-size:13px;color:#7a746c;margin-bottom:20px">管理者にアクセス権の付与を依頼してください。</div>
      <button onclick="firebase.auth().signOut().then(function(){location.reload()})" style="padding:8px 20px;border-radius:8px;border:1px solid #ddd8ce;background:transparent;color:#7a746c;cursor:pointer;font-size:12px;font-family:'Noto Sans JP',sans-serif">ログアウト</button>
    </div>
  `;
  document.body.prepend(overlay);

  // Show loading first
  document.getElementById('auth-card').style.display = 'none';
  document.getElementById('auth-loading').style.display = 'block';

  // Login handler
  document.getElementById('auth-submit').addEventListener('click', function() {
    var email = document.getElementById('auth-email').value;
    var password = document.getElementById('auth-password').value;
    var errEl = document.getElementById('auth-error');
    errEl.style.display = 'none';

    auth.signInWithEmailAndPassword(email, password).catch(function(err) {
      errEl.style.display = 'block';
      if (err.code === 'auth/invalid-credential' || err.code === 'auth/wrong-password' || err.code === 'auth/user-not-found') {
        errEl.textContent = 'メールアドレスまたはパスワードが正しくありません';
      } else {
        errEl.textContent = err.message;
      }
    });
  });

  // Enter key support
  document.getElementById('auth-password').addEventListener('keydown', function(e) {
    if (e.key === 'Enter') document.getElementById('auth-submit').click();
  });

  // Auth state listener
  auth.onAuthStateChanged(function(user) {
    if (!user) {
      // Show login form
      overlay.style.display = 'flex';
      document.getElementById('auth-card').style.display = 'block';
      document.getElementById('auth-loading').style.display = 'none';
      document.getElementById('auth-denied').style.display = 'none';
      return;
    }

    // Check user profile in database
    db.ref('users/' + user.uid).once('value').then(function(snap) {
      var profile = snap.val();
      if (!profile || profile.status !== 'approved') {
        // Not approved
        document.getElementById('auth-card').style.display = 'none';
        document.getElementById('auth-loading').style.display = 'none';
        document.getElementById('auth-denied').style.display = 'block';
        document.querySelector('#auth-denied div:nth-child(2)').textContent = '承認待ち';
        document.querySelector('#auth-denied div:nth-child(3)').textContent = '管理者の承認をお待ちください。';
        return;
      }

      // Check eventstaff access
      if (profile.role !== 'admin' && !(profile.access && profile.access.eventstaff)) {
        document.getElementById('auth-card').style.display = 'none';
        document.getElementById('auth-loading').style.display = 'none';
        document.getElementById('auth-denied').style.display = 'block';
        return;
      }

      // Approved and has access — hide overlay and show the app
      overlay.style.display = 'none';

      // Expose auth info globally for PIN check
      window._authUser = {
        uid: user.uid,
        email: user.email,
        isAdmin: profile.role === 'admin',
        displayName: profile.displayName,
        memberId: profile.memberId,
      };
    });
  });
})();
