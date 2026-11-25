import React, { useEffect, useState } from "react";
import "./login-about.css";

// "What is AgriTabang / Who developed it" panel for the login page.
// The developer slideshow moves to the next person every 3 seconds, by itself, for as long as the login page is open.
// It never pauses (not on hover, not after a click) - clicking a dot only jumps there and restarts the 3 seconds.
const TEAM = [
  { name: "Jose Maria P. Cabrera", role: "Documenter", photo: "/developers/cabrera.png", blurb: "Prepares the capstone paper, the user manual and the system documentation." },
  { name: "Jhandie A. Sumihay", role: "Data Analyst", photo: "/developers/sumihay.png", blurb: "Studies the farmer data and survey results the system is built on." },
  { name: "Saliz II R. Pag-oy", role: "Programmer", photo: "/developers/pagoy.png", blurb: "Builds and maintains the AgriTabang web application." },
  { name: "Roland Justine M. Partos", role: "Adviser", photo: "/developers/partos.png", blurb: "Our capstone adviser, who guides the team and reviews the project." },
];
const SLIDE_MS = 3000;

export default function LoginAbout() {
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => setIdx((i) => (i + 1) % TEAM.length), SLIDE_MS);
    return () => clearTimeout(t);
  }, [idx]);

  return (
    <section className="about-panel" aria-label="About AgriTabang">
      <h2 className="about-title">What is <em>AgriTabang</em>?</h2>
      <p className="about-text">
        AgriTabang is a Farmer Profiling and Assistance Management System for Barangay Lindaban,
        Manolo Fortich, Bukidnon. It helps the Barangay Agricultural Technician Managing Agricultural Network and the
        Association President keep farmer profiles, crop registrations and harvest records in one place, check who
        qualifies, and give out assistance fairly and openly.
      </p>
      <ul className="about-points">
        <li><i className="fa-solid fa-id-card"></i> Farmer profiling</li>
        <li><i className="fa-solid fa-seedling"></i> Crops &amp; harvest records</li>
        <li><i className="fa-solid fa-hand-holding-dollar"></i> Fair assistance</li>
      </ul>

      <div className="about-divider"></div>

      <span className="about-eyebrow">The developers</span>
      <h3 className="about-subtitle">Who developed AgriTabang?</h3>
      <p className="about-text about-text-sm">Built by BSIT students of Northern Bukidnon State College as a capstone project, guided by their adviser.</p>

      <div className="team-show">
        <div className="team-stage" aria-live="polite">
          {TEAM.map((m, i) => {
            const offset = (i - idx + TEAM.length) % TEAM.length;
            const state = offset === 0 ? "is-active" : offset === 1 ? "is-next" : "is-prev";
            return (
              <article key={m.name} className={`team-slide ${state}`} aria-hidden={offset !== 0}>
                <img className="team-photo" src={m.photo} alt={m.name} width="288" height="288" />
                <div className="team-info">
                  <span className="team-role">{m.role}</span>
                  <h4 className="team-name">{m.name}</h4>
                  <p className="team-blurb">{m.blurb}</p>
                </div>
              </article>
            );
          })}
        </div>
        <div className="team-footer">
          <div className="team-dots" role="tablist" aria-label="Choose a developer">
            {TEAM.map((m, i) => (
              <button key={m.name} type="button" role="tab" aria-selected={i === idx} aria-label={`${m.role}: ${m.name}`}
                className={`team-dot ${i === idx ? "on" : ""}`} onClick={() => setIdx(i)} />
            ))}
          </div>
          <span className="team-count">{idx + 1} / {TEAM.length}</span>
        </div>
        <div className="team-progress"><span key={idx} style={{ animationDuration: `${SLIDE_MS}ms` }} /></div>
      </div>
    </section>
  );
}
