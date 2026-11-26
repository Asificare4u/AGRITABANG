import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { tr } from "../lib/i18n";

// Wraps every /farmer page. It:
//  1. switches on the farmer-friendly look (html.farmer-ui, see farmer-friendly.css);
//  2. remembers the farmer's chosen text size on this device;
//  3. shows the "Text size" buttons in the top bar;
//  4. names every table column inside each row (data-label) so tables can show as easy cards.
// ADMIN and PRESIDENT screens never load this, so they are unchanged.

const KEY = "agritabang.farmer.textSize";
const SIZES = [
  { id: "normal", name: "Normal text", font: "1rem" },
  { id: "large", name: "Large text", font: "1.3rem" },
  { id: "xlarge", name: "Extra large text", font: "1.6rem" },
];

function readSize() {
  try {
    const v = localStorage.getItem(KEY);
    return SIZES.some((s) => s.id === v) ? v : "normal";
  } catch (_) {
    return "normal";
  }
}

// Write each column title into its cells and decide which tables show as cards.
function labelTables() {
  document.querySelectorAll("table.data-table").forEach((table) => {
    const heads = Array.from(table.querySelectorAll("thead th")).map((th) => th.textContent.trim());
    const box = table.closest(".table-panel");
    if (box) box.classList.toggle("ft-cards", heads.length >= 5 || window.innerWidth <= 800);
    table.querySelectorAll("tbody tr").forEach((tr) => {
      const cells = Array.from(tr.children);
      const empty = cells.length === 1 && cells[0].colSpan > 1; // "No records yet." row
      tr.classList.toggle("ft-empty", empty);
      if (empty) return;
      cells.forEach((td, i) => {
        const label = heads[i] || "";
        if (td.getAttribute("data-label") !== label) td.setAttribute("data-label", label);
        td.classList.toggle("ft-title", i === 0);
        td.classList.toggle("ft-actions", i > 0 && !label);
      });
    });
  });
}

function TextSize({ size, setSize, floating }) {
  return (
    <div className={`ft-size ${floating ? "floating" : ""}`} role="group" aria-label={tr("Text size")}>
      <span>{tr("Text size")}</span>
      {SIZES.map((s) => (
        <button
          type="button"
          key={s.id}
          aria-pressed={size === s.id}
          aria-label={tr(s.name)}
          title={tr(s.name)}
          style={{ fontSize: s.font }}
          onClick={() => setSize(s.id)}
        >A</button>
      ))}
    </div>
  );
}

export default function FarmerShell({ children }) {
  const [size, setSize] = useState(readSize);
  const [slot, setSlot] = useState(null); // where the Text size buttons go (the top bar)

  // 1 + 2: farmer-friendly mode and the chosen text size
  useEffect(() => {
    const root = document.documentElement;
    root.classList.add("farmer-ui");
    root.dataset.text = size;
    try { localStorage.setItem(KEY, size); } catch (_) { /* private mode: just not remembered */ }
  }, [size]);
  useEffect(() => () => {
    const root = document.documentElement;
    root.classList.remove("farmer-ui");
    delete root.dataset.text;
  }, []);

  // 3 + 4: keep the table labels and the top-bar slot up to date as pages change
  useEffect(() => {
    let queued = false;
    const run = () => {
      queued = false;
      labelTables();
      const found = document.querySelector(".topbar-widgets");
      setSlot((prev) => (prev === found ? prev : found));
    };
    const schedule = () => { if (!queued) { queued = true; requestAnimationFrame(run); } };
    const observer = new MutationObserver(schedule); // child changes only, so our own attribute writes do not loop
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("resize", schedule);
    schedule();
    return () => { observer.disconnect(); window.removeEventListener("resize", schedule); };
  }, []);

  const control = <TextSize size={size} setSize={setSize} floating={!slot} />;
  return (
    <>
      {children}
      {createPortal(control, slot || document.body)}
    </>
  );
}
