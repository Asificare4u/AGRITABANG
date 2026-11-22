import React, { useEffect, useState } from "react";
import { getSavedAccounts, removeSavedAccount } from "../lib/savedAccounts";
import "./login-about.css";

// Shows ONLY the accounts saved for the tab that is selected (Farmer, ADMIN or President).
// Nothing is shown when there is no saved account for that role.
export default function SavedAccounts({ role, onPick, refreshKey = 0 }) {
  const [list, setList] = useState([]);
  useEffect(() => { setList(getSavedAccounts(role)); }, [role, refreshKey]);
  if (!list.length) return null;

  return (
    <div className="saved-box">
      <div className="saved-title">Saved on this device</div>
      <div className="saved-list">
        {list.map((a) => (
          <div className="saved-item" key={a.email}>
            <button type="button" className="saved-pick" onClick={() => onPick(a)}>
              <span className="saved-avatar">{(a.name || a.email).trim()[0]?.toUpperCase()}</span>
              <span className="saved-text">
                <b>{a.name || a.email}</b>
                {a.name ? <small>{a.email}</small> : null}
              </span>
            </button>
            <button type="button" className="saved-x" aria-label={`Forget ${a.email}`} title="Forget this account"
              onClick={() => { removeSavedAccount(a.email, role); setList(getSavedAccounts(role)); }}>×</button>
          </div>
        ))}
      </div>
    </div>
  );
}
