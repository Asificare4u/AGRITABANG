import React from "react";
import { formatPeso } from "../lib/businessRules";
import { claimNo, causeText } from "../lib/insuranceClaim";

const fmtDate = (d) => (d ? new Date(`${String(d).slice(0, 10)}T00:00:00`).toLocaleDateString("en-PH", { month: "long", day: "numeric", year: "numeric" }) : "—");

// The printable "Crop Insurance Claim Application" (one page).
export function ClaimPaper({ claim, policy, info }) {
  const comp = claim.computation || {};
  const decided = claim.status !== "Pending";
  const pct = claim.status === "Approved" ? claim.final_damage_percentage : claim.damage_percentage;
  const amount = claim.status === "Approved" ? claim.final_amount : claim.estimated_amount;
  return (
    <div className="claim-paper">
      <div className="claim-head">
        <p>Republic of the Philippines · Province of Bukidnon</p>
        <p>Municipality of Manolo Fortich · Municipal Agriculture Office</p>
        <h1>CROP INSURANCE CLAIM APPLICATION</h1>
        <p className="claim-meta">Claim No. <b>{claimNo(claim.id)}</b> &nbsp;·&nbsp; Date filed: <b>{fmtDate(claim.created_at)}</b></p>
      </div>

      <h2>A. Farmer</h2>
      <table className="claim-table"><tbody>
        <tr><th>Name</th><td>{info.name || "—"}</td><th>RSBSA No.</th><td>{info.rsbsa || "—"}</td></tr>
        <tr><th>Address</th><td>{info.address || "—"}</td><th>Contact No.</th><td>{info.contact || "—"}</td></tr>
      </tbody></table>

      <h2>B. Insured crop</h2>
      <table className="claim-table"><tbody>
        <tr><th>Crop</th><td>{claim.crop_name}</td><th>Insured area</th><td>{claim.insured_area} ha</td></tr>
        <tr><th>Coverage period</th><td>{fmtDate(policy?.coverage_start_date)} to {fmtDate(policy?.coverage_end_date)}</td><th>Insurance source</th><td>{policy?.insurance_source || "—"}</td></tr>
      </tbody></table>

      <h2>C. Calamity and damage</h2>
      <table className="claim-table"><tbody>
        <tr><th>Cause of damage</th><td>{causeText(claim)}</td><th>Date it happened</th><td>{fmtDate(claim.calamity_date)}</td></tr>
        <tr><th>Damaged area</th><td>{claim.damaged_area} ha of {claim.insured_area} ha</td><th>Damage</th><td><b>{claim.damage_percentage}%</b> of the insured area</td></tr>
        <tr><th>What happened</th><td colSpan={3}>{claim.description || "—"}</td></tr>
      </tbody></table>

      <h2>D. How the assistance is computed</h2>
      <table className="claim-table claim-wide"><tbody>
        <tr><th>Estimated value of the whole crop</th><td>{comp.cropValue != null ? formatPeso(comp.cropValue) : "—"}</td><td className="claim-note">{comp.yieldNote || ""}{comp.price ? ` × ₱${comp.price}/kg` : ""}</td></tr>
        <tr><th>Share that was damaged</th><td>{pct != null ? `${pct}%` : "—"}</td><td className="claim-note">{claim.status === "Approved" ? "confirmed by the MAO after inspection" : "as reported by the farmer"}</td></tr>
        <tr><th>Value of the damaged part</th><td>{comp.cropValue != null && pct != null ? formatPeso(comp.cropValue * (Number(pct) / 100)) : "—"}</td><td className="claim-note">whole-crop value × damage</td></tr>
        <tr><th>Coverage rate</th><td>{comp.coverageRate != null ? `${Math.round(comp.coverageRate * 100)}%` : "—"}</td><td className="claim-note"></td></tr>
        <tr className="claim-total"><th>{claim.status === "Approved" ? "Insurance assistance (approved)" : "Estimated insurance assistance"}</th><td colSpan={2}><b>{amount != null ? formatPeso(amount) : "—"}</b></td></tr>
      </tbody></table>
      <p className="claim-fine">Only the <b>damaged part</b> of the crop is paid, not the whole farm. {claim.status === "Approved" ? "This is the amount approved by the Municipal Agriculture Office after inspection." : "This amount is an estimate until the Municipal Agriculture Office inspects the farm and confirms the damage."}</p>

      <h2>E. Farmer's certification</h2>
      <p className="claim-fine" style={{ marginTop: 0 }}>I certify that the information above is true and correct, and I allow the Municipal Agriculture Office to inspect my farm.</p>
      <div className="claim-sign"><div><span></span>Signature over printed name of farmer</div><div><span></span>Date</div></div>

      <h2>F. For the Municipal Agriculture Office</h2>
      <table className="claim-table"><tbody>
        <tr><th>Received by / date</th><td></td><th>Damage confirmed after inspection</th><td>{claim.status === "Approved" ? `${claim.final_damage_percentage}%` : "______ %"}</td></tr>
        <tr><th>Decision</th><td colSpan={3}>{decided ? <b>{claim.status === "Approved" ? "APPROVED" : "NOT APPROVED"}{claim.reviewed_at ? ` — ${fmtDate(claim.reviewed_at)}` : ""}</b> : "☐ Approved   ☐ Not approved"}</td></tr>
        <tr><th>Remarks</th><td colSpan={3}>{claim.admin_remarks || ""}</td></tr>
      </tbody></table>
      <div className="claim-sign"><div><span></span>Inspected by (MAO)</div><div><span></span>Approved by (MAO head)</div></div>
    </div>
  );
}

export default function ClaimView({ claim, policy, info, onBack }) {
  return (
    <section>
      <div className="no-print claim-bar">
        <button className="btn-ghost" onClick={onBack}>← Back</button>
        <button className="btn-primary" onClick={() => window.print()}><i className="fa-solid fa-print"></i> Print</button>
      </div>
      <ClaimPaper claim={claim} policy={policy} info={info} />
    </section>
  );
}
