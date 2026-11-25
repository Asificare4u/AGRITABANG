import React, { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext.jsx";
import { supabase } from "../../lib/supabaseClient";
import LoginAbout from "../../components/LoginAbout.jsx";
import PasswordField from "../../components/PasswordField.jsx";
import SavedAccounts from "../../components/SavedAccounts.jsx";
import ForgotPassword from "../../components/ForgotPassword.jsx";
import { saveAccount } from "../../lib/savedAccounts";

export default function Login() {
  const { login, logout, session, role, loading, profileError } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [remember, setRemember] = useState(true);
  const [savedTick, setSavedTick] = useState(0);
  const [mode, setMode] = useState("login"); // "login" or "reset" (forgot password)
  const [notice, setNotice] = useState("");

  if (!loading && session && role) return <Navigate to={`/${role}`} replace />;

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const data = await login(email, password);
      // The account's own role decides where it goes: Farmer, ADMIN or Association President.
      const { data: profileRow, error: profileErr } = await supabase
        .from("profiles").select("role, full_name").eq("id", data.user.id).single();
      if (profileErr || !profileRow) {
        await supabase.auth.signOut();
        setError("Could not verify this account's role. Please try again.");
        return;
      }
      if (remember) { saveAccount({ email, role: profileRow.role, name: profileRow.full_name }); setSavedTick((t) => t + 1); }
      // AuthContext's onAuthStateChange picks up the session and fills in `role`;
      // the <Navigate> at the top then opens the right page automatically.
    } catch (err) {
      const m = err.message || "Invalid email or password.";
      setError(/invalid login/i.test(m) ? `${m}. Farmer forgot the password? Tap "Forgot password?" and ask the ADMIN for a reset token.` : m);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="login-screen">
      <div className="login-split">
      <LoginAbout />
      <div className="login-card">
        <div className="login-brand">
          <img src="/agritabang-logo.png" alt="AgriTabang" width="56" height="56" style={{ objectFit: "contain" }} />
          <div>
            <span className="login-brand-name">Agri<em>Tabang</em></span>
            <span className="login-brand-tag">Farmer Profiling &amp; Assistance Management System</span>
          </div>
        </div>

        {!loading && session && !role && profileError && (
          <div className="hint-text" style={{ color: "var(--danger)", background: "var(--cream)", border: "1px solid var(--cream-2)", borderRadius: 8, padding: "10px 12px", marginBottom: 14 }}>
            <i className="fa-solid fa-triangle-exclamation"></i> {profileError}
            <div style={{ marginTop: 8 }}>
              <button type="button" className="btn-ghost" onClick={async () => { await logout(); }}>Sign out and try again</button>
            </div>
          </div>
        )}

        <p className="hint-text" style={{ margin: "0 0 12px" }}><i className="fa-solid fa-circle-info"></i> Sign in with your account. You will go straight to your own page (Farmer, ADMIN or Association President).</p>

        {notice && mode === "login" && (
          <p className="hint-text" style={{ color: "var(--forest-deep)", background: "var(--sage-pale)", borderRadius: 8, padding: "10px 12px", marginBottom: 12 }}><i className="fa-solid fa-circle-check"></i> {notice}</p>
        )}

        {mode === "reset" ? (
          <ForgotPassword
            defaultEmail={email}
            onBack={() => setMode("login")}
            onDone={(doneEmail) => { setEmail(doneEmail); setPassword(""); setError(""); setNotice("Password changed. Sign in with your new password."); setMode("login"); }}
          />
        ) : (
          <>
          <SavedAccounts refreshKey={savedTick} onPick={(a) => { setEmail(a.email); setPassword(""); setError(""); setTimeout(() => document.getElementById("login-password")?.focus(), 0); }} />

          <form onSubmit={handleSubmit} className="modal-body">
            <label>Email <input type="email" name="email" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="e.g. renante.salvana@example.com" required /></label>
            <PasswordField value={password} onChange={(e) => setPassword(e.target.value)} />
            <label className="remember-row"><input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} /> Remember this account on this device</label>
            <button type="button" className="login-forgot" onClick={() => { setError(""); setNotice(""); setMode("reset"); }}>Forgot password? (Farmers)</button>
            {error && <p className="hint-text" style={{ color: "var(--danger)" }}><i className="fa-solid fa-triangle-exclamation"></i> {error}</p>}
            <button type="submit" className="btn-primary login-submit" disabled={submitting}>
              {submitting ? <><i className="fa-solid fa-spinner fa-spin"></i> Signing in…</> : <><i className="fa-solid fa-right-to-bracket"></i> Sign In</>}
            </button>
          </form>

          </>
        )}

        <div className="login-security-note">
          <i className="fa-solid fa-shield-halved"></i>
          <span>Protected by Supabase Authentication &amp; Row-Level Security (RLS) — each role only accesses the modules it is authorized for.</span>
        </div>
      </div>
      </div>
    </div>
  );
}
