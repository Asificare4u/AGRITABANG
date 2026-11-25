import React, { useState } from "react";
import { supabase } from "../lib/supabaseClient";
import PasswordField from "./PasswordField.jsx";

// Login page, Farmer tab: "Forgot password?" form.
// The farmer asks the ADMIN for a one-time reset token, then enters it here with a new password.
export default function ForgotPassword({ defaultEmail = "", onBack, onDone }) {
  const [email, setEmail] = useState(defaultEmail);
  const [token, setToken] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError("");
    if (pw.length < 6) return setError("The new password must be at least 6 characters.");
    if (pw !== pw2) return setError("The two passwords do not match.");
    setBusy(true);
    let data, error;
    try {
      ({ data, error } = await supabase.functions.invoke("redeem-reset-token", {
        body: { email: email.trim(), token, new_password: pw },
      }));
    } catch (err) { error = err; }
    setBusy(false);
    // success ONLY when the function says so; any other reply (not deployed, rejected, wrong token ...) is an error
    if (data?.ok === true) return onDone(email.trim());
    let msg = data?.error;
    if (!msg && error) {
      try { const j = await error.context.json(); msg = j.error || j.message; } catch { /* not a JSON reply */ }
      if (!msg) msg = error.message;
    }
    if (/not found|failed to send|invalid jwt|non-2xx/i.test(msg || "")) msg = "The password reset service is not available yet. Please tell the system developer.";
    setError(msg || "Could not reset the password. Please try again.");
  }

  return (
    <form onSubmit={submit} className="modal-body">
      <p className="hint-text"><i className="fa-solid fa-circle-info"></i> <span>Forgot your password? Go to the Municipal Agriculture Office (ADMIN) and ask for a <b>reset token</b>. Then enter it below with your new password. (This is for farmer accounts. ADMIN and Association President accounts must ask the system administrator.)</span></p>
      <label>Email <input type="email" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="e.g. renante.salvana@example.com" required /></label>
      <label>Reset token
        <input
          value={token}
          onChange={(e) => setToken(e.target.value.toUpperCase())}
          placeholder="XXXX-XXXX"
          maxLength={12}
          autoComplete="off"
          spellCheck={false}
          className="reset-token-input"
          required
        />
      </label>
      <PasswordField id="reset-new-password" label="New password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="At least 6 characters" autoComplete="new-password" />
      <PasswordField id="reset-confirm-password" label="Confirm new password" value={pw2} onChange={(e) => setPw2(e.target.value)} placeholder="Type it again" autoComplete="new-password" />
      {error && <p className="hint-text" style={{ color: "var(--danger)" }}><i className="fa-solid fa-triangle-exclamation"></i> {error}</p>}
      <button type="submit" className="btn-primary login-submit" disabled={busy}>
        {busy ? <><i className="fa-solid fa-spinner fa-spin"></i> Saving…</> : <><i className="fa-solid fa-key"></i> Set new password</>}
      </button>
      <button type="button" className="login-forgot" onClick={onBack}><i className="fa-solid fa-arrow-left"></i> Back to sign in</button>
    </form>
  );
}
