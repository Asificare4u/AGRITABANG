import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { logActivity } from "../../lib/activity";
import { useToast } from "../../context/ToastContext.jsx";
import { StatusBadge } from "../../components/Badges.jsx";
import { yieldUnitText } from "../../lib/businessRules";
import Modal from "../../components/Modal.jsx";
import { prettyDate } from "../../lib/harvest";

const REPORT_OPTIONS = [
  { value: "all", label: "All Yield Records" },
  { value: "verified", label: "Verified Yield" },
  { value: "pending", label: "Pending Yield" },
  { value: "by_crop", label: "Yield by Crop" },
  { value: "by_farmer", label: "Yield by Farmer" },
  { value: "by_date", label: "Yield by Date" },
];

function ReportTable({ rows, onView, assoc = {} }) {
  return (
    <table className="data-table">
      <thead><tr><th>Farmer</th><th>Association</th><th>Crop / Plant Name</th><th>Farm Area</th><th>Planting Date</th><th>Harvest Date</th><th>Yield Qty</th><th>Unit</th><th>Submitted</th><th>Status</th><th>Verified By</th><th></th></tr></thead>
      <tbody>
        {rows.length === 0 && <tr><td colSpan={12} style={{ textAlign: "center", color: "var(--ink-soft)" }}>No records.</td></tr>}
        {rows.map((r) => (
          <tr key={r.id}>
            <td>{r.farmer_name}</td><td>{assoc[r.farmer_id] || "—"}</td><td>{r.crop_name}</td><td>{r.farm_area ? `${r.farm_area} ha` : "—"}</td>
            <td>{r.planting_date || "—"}</td><td>{r.harvest_date}</td>
            <td>{Number(r.quantity).toLocaleString()}</td><td>{yieldUnitText(r)}</td>
            <td>{new Date(r.submitted_at).toLocaleDateString("en-PH")}</td>
            <td><StatusBadge status={r.status} /></td>
            <td>{r.verified_by_name || "—"}</td>
            <td>
              <button className="btn-ghost" style={{ padding: "4px 10px", fontSize: ".72rem" }} onClick={() => onView(r)} title={r.status === "Pending" ? "View the report, then verify or reject it" : "View details"} aria-label="View report">
                <i className="fa-solid fa-eye"></i> {r.status === "Pending" ? "Review" : "View"}
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function GroupedReport({ rows, groupKey, groupLabel, onView, assoc }) {
  const groups = useMemo(() => {
    const map = new Map();
    rows.forEach((r) => {
      const key = r[groupKey] || "—";
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(r);
    });
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [rows, groupKey]);

  return (
    <>
      {groups.map(([key, groupRows]) => {
        const totalKg = groupRows.reduce((s, r) => s + Number(r.quantity_kg), 0);
        return (
          <div className="table-panel" key={key} style={{ marginBottom: 16 }}>
            <div className="panel-head" style={{ padding: "10px 14px" }}>
              <h3 style={{ fontSize: ".9rem" }}>{groupLabel}: {key}</h3>
              <span className="hint-text" style={{ margin: 0 }}>{groupRows.length} record{groupRows.length === 1 ? "" : "s"} · {totalKg.toLocaleString()} kg total</span>
            </div>
            <ReportTable rows={groupRows} onView={onView} assoc={assoc} />
          </div>
        );
      })}
    </>
  );
}

export default function YieldReports() {
  const { showToast } = useToast();
  const [rows, setRows] = useState([]);
  const [report, setReport] = useState("all");
  const [assoc, setAssoc] = useState({}); // farmer id -> association name / "Not a member"
  const [viewRow, setViewRow] = useState(null); // the report being reviewed (verify / reject only happen from here)

  async function load() {
    const { data, error } = await supabase.from("yield_report").select("*").order("submitted_at", { ascending: false }); // newest report on top
    if (error) return showToast(error.message, "fa-triangle-exclamation");
    setRows(data || []);
    const { data: dir } = await supabase.from("farmer_directory").select("id, is_association_member, association_name");
    setAssoc(Object.fromEntries((dir || []).map((d) => [d.id, d.is_association_member ? (d.association_name || "Member") : "Not a member"])));
  }
  useEffect(() => { load(); }, []);

  async function setStatus(r, status) {
    const id = r.id;
    const what = `${r.farmer_name ? `${r.farmer_name}'s ` : ""}${r.crop_name || "yield"} yield report (${Number(r.quantity).toLocaleString()} ${yieldUnitText(r)})`;
    if (!confirm(`Are you sure you want to ${status === "Verified" ? "verify" : "reject"} ${what}?`)) return false;
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from("yield_records").update({ status, verified_by: user?.id }).eq("id", id);
    if (error) { showToast(error.message, "fa-triangle-exclamation"); return false; }
    logActivity(`Marked a yield record ${status.toLowerCase()}`, "yield");
    showToast(`Yield record marked ${status.toLowerCase()}.`, "fa-wheat-awn");
    load();
    return true;
  }
  const onView = (r) => setViewRow(r);
  async function decideFromView(status) { if (await setStatus(viewRow, status)) setViewRow(null); }

  const filteredRows = useMemo(() => {
    if (report === "verified") return rows.filter((r) => r.status === "Verified");
    if (report === "pending") return rows.filter((r) => r.status === "Pending");
    if (report === "by_date") return [...rows].sort((a, b) => new Date(a.harvest_date) - new Date(b.harvest_date));
    return rows;
  }, [rows, report]);

  const totalKg = filteredRows.reduce((s, r) => s + Number(r.quantity_kg), 0);
  const verifiedCount = rows.filter((r) => r.status === "Verified").length;
  const pendingCount = rows.filter((r) => r.status === "Pending").length;

  return (
    <section>
      <div className="view-head">
        <h2><i className="fa-solid fa-file-lines"></i> Yield Reports</h2>
        <div className="head-actions">
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: ".82rem", color: "var(--ink-soft)" }}>
            Select Report
            <select className="filter-select" value={report} onChange={(e) => setReport(e.target.value)}>
              {REPORT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>
        </div>
      </div>
      <p className="hint-text"><i className="fa-solid fa-circle-info"></i> Submitted farmer harvest data, newest report first. Farm Area and Planting Date are pulled from each farmer's matching Crop Registration. Press <b>Review</b> to open a report — it can only be verified or rejected from there.</p>

      <div className="stat-grid" style={{ marginBottom: 18 }}>
        <div className="stat-card ring-total"><div className="stat-num">{filteredRows.length}</div><div className="stat-label">Records in this report</div></div>
        <div className="stat-card ring-resolved"><div className="stat-num">{verifiedCount}</div><div className="stat-label">Verified (all-time)</div></div>
        <div className="stat-card ring-pending"><div className="stat-num">{pendingCount}</div><div className="stat-label">Pending (all-time)</div></div>
        <div className="stat-card ring-progress"><div className="stat-num">{totalKg.toLocaleString()}</div><div className="stat-label">Total (kg-equivalent) in this report</div></div>
      </div>

      {report === "by_crop" && <GroupedReport rows={rows} groupKey="crop_name" groupLabel="Crop" onView={onView} assoc={assoc} />}
      {report === "by_farmer" && <GroupedReport rows={rows} groupKey="farmer_name" groupLabel="Farmer" onView={onView} assoc={assoc} />}
      {["all", "verified", "pending", "by_date"].includes(report) && (
        <div className="table-panel"><ReportTable rows={filteredRows} onView={onView} assoc={assoc} /></div>
      )}

      {/* REVIEW A REPORT: the admin sees every detail first, then verifies or rejects */}
      <Modal open={!!viewRow} onClose={() => setViewRow(null)} title="Yield report" icon="fa-wheat-awn">
        {viewRow && (
          <div className="modal-body">
            <table className="data-table" style={{ margin: 0 }}>
              <tbody>
                {[
                  ["Farmer", viewRow.farmer_name],
                  ["Association", assoc[viewRow.farmer_id] || "—"],
                  ["Crop / Plant", viewRow.crop_name],
                  ["Season", viewRow.season || "—"],
                  ["Farm area", viewRow.farm_area ? `${viewRow.farm_area} ha` : "—"],
                  ["Planting date", viewRow.planting_date ? prettyDate(viewRow.planting_date) : "—"],
                  ["Harvest date", prettyDate(viewRow.harvest_date)],
                  ["Yield reported", `${Number(viewRow.quantity).toLocaleString()} ${yieldUnitText(viewRow)}`],
                  ["Kg-equivalent", `${Number(viewRow.quantity_kg).toLocaleString()} kg`],
                  ["Submitted", new Date(viewRow.submitted_at).toLocaleString("en-PH")],
                  ["Verified by", viewRow.verified_by_name || "—"],
                ].map(([k, v]) => <tr key={k}><td style={{ width: "38%", color: "var(--ink-soft)" }}>{k}</td><td><b>{v}</b></td></tr>)}
                <tr><td style={{ color: "var(--ink-soft)" }}>Status</td><td><StatusBadge status={viewRow.status} /></td></tr>
              </tbody>
            </table>
            {viewRow.status === "Pending" ? (
              <div className="modal-actions">
                <button type="button" className="btn-ghost" onClick={() => setViewRow(null)}>Close</button>
                <button type="button" className="btn-ghost" onClick={() => decideFromView("Rejected")}><i className="fa-solid fa-xmark"></i> Reject</button>
                <button type="button" className="btn-primary" onClick={() => decideFromView("Verified")}><i className="fa-solid fa-check"></i> Verify</button>
              </div>
            ) : (
              <div className="modal-actions"><button type="button" className="btn-primary" onClick={() => setViewRow(null)}>Close</button></div>
            )}
          </div>
        )}
      </Modal>
    </section>
  );
}
