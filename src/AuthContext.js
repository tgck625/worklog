import React, { createContext, useContext, useState, useEffect } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { ref, onValue, set } from "firebase/database";
import { auth, db } from "./firebase";

const AuthContext = createContext({
  firebaseUser: null,
  loading: true,
  userProfile: null,
  isApproved: false,
  isAdmin: false,
  memberId: "",
  displayName: "",
  access: { workflow: false, timesheet: false, eventstaff: false },
  logout: () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }) {
  const [firebaseUser, setFirebaseUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [userProfile, setUserProfile] = useState(null);

  useEffect(() => {
    if (!auth) { setLoading(false); return; }
    const unsub = onAuthStateChanged(auth, (user) => {
      setFirebaseUser(user);
      if (!user) {
        setUserProfile(null);
        setLoading(false);
      }
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (!firebaseUser || !db) return;
    const userRef = ref(db, `users/${firebaseUser.uid}`);
    const unsub = onValue(userRef, (snap) => {
      const data = snap.val();
      if (data) {
        setUserProfile(data);
      } else {
        const profile = {
          email: firebaseUser.email,
          displayName: firebaseUser.displayName || firebaseUser.email?.split("@")[0] || "",
          role: "member",
          status: "pending",
          memberId: "",
          access: { workflow: false, timesheet: false, eventstaff: false },
          createdAt: new Date().toISOString(),
        };
        set(userRef, profile);
        setUserProfile(profile);
      }
      setLoading(false);
    });
    return () => unsub();
  }, [firebaseUser]);

  const isApproved = userProfile?.status === "approved";
  const isAdmin = userProfile?.role === "admin";
  const memberId = userProfile?.memberId || "";
  const displayName = userProfile?.displayName || firebaseUser?.email || "";
  const access = userProfile?.access || { workflow: false, timesheet: false, eventstaff: false };

  async function logout() {
    const { signOut } = await import("firebase/auth");
    await signOut(auth);
  }

  return (
    <AuthContext.Provider value={{ firebaseUser, loading, userProfile, isApproved, isAdmin, memberId, displayName, access, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
