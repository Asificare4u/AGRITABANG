import React, { useState } from "react";
import { tr } from "../lib/i18n";

// Cards shown at the very top of every dashboard (latest announcements).
// The small X on the LEFT hides a card for this user. It only hides the card on the dashboard:
// the same announcement is still in the notification bell and on the Announcements page.
const KEY = (userId) => `agritabang.dismissedAnnouncements.${userId || "guest"}`;

function loadDismissed(userId) {
  try {
    const raw = window.localStorage.getItem(KEY(userId));
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export default function AnnounceStrip({ announcements, userId }) {
  const [dismissed, setDismissed] = useState(() => loadDismissed(userId));

  function dismiss(id) {
    const next = Array.from(new Set([...dismissed, id])).slice(-200); // keep the list short
    setDismissed(next);
    try { window.localStorage.setItem(KEY(userId), JSON.stringify(next)); } catch { /* storage blocked: it just reappears next visit */ }
  }

  const visible = (announcements || []).filter((a) => !dismissed.includes(a.id));
  if (visible.length === 0) return null;

  return (
    <div className="announce-top-strip">
      <div className="announce-top-title"><i className="fa-solid fa-bell"></i> {tr("Notifications")}</div>
      {visible.map((a) => (
        <div className="announce-top-card" key={a.id}>
          <button type="button" className="announce-x" onClick={() => dismiss(a.id)} aria-label="Hide this notification" title="Hide (it stays in the bell)">
            <i className="fa-solid fa-xmark"></i>
          </button>
          <i className={`fa-solid ${a.icon || "fa-bullhorn"}`}></i>
          <div>
            <div className="announce-top-head">
              <b>{a.title}</b>
              <span>{new Date(a.created_at).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" })}</span>
            </div>
            <p>{a.body}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
