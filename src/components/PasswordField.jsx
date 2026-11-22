import React, { useState } from "react";
import "./login-about.css";

// Password input with an eye button: press it to show the password, press again to hide it.
export default function PasswordField({ value, onChange, placeholder = "••••••••", label = "Password", autoComplete = "current-password", id = "login-password" }) {
  const [show, setShow] = useState(false);
  return (
    <label>
      {label}
      <span className="pw-wrap">
        <input id={id} type={show ? "text" : "password"} value={value} onChange={onChange} placeholder={placeholder} autoComplete={autoComplete} required />
        <button
          type="button"
          className="pw-eye"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => setShow((s) => !s)}
          aria-label={show ? "Hide password" : "Show password"}
          aria-pressed={show}
          title={show ? "Hide password" : "Show password"}
        >
          <i className={`fa-solid ${show ? "fa-eye-slash" : "fa-eye"}`}></i>
        </button>
      </span>
    </label>
  );
}
