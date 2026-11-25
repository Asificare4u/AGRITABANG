import React, { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { useAuth } from "../../context/AuthContext.jsx";
import { useToast } from "../../context/ToastContext.jsx";
import Modal from "../../components/Modal.jsx";
import PcicApplication, { PcicView } from "./PcicApplication.jsx";
import { StatusBadge } from "../../components/Badges.jsx";
import { computeInsuranceStatus, computeInsuranceBasis, formatPeso, ASSISTANCE_REQUIREMENTS } from "../../lib/businessRules";
import { tr } from "../../lib/i18n";
import { logActivity } from "../../lib/activity";
import ClaimView from "../../components/ClaimPaper.jsx";
import { CLAIM_CAUSES, claimEstimate, claimNo, causeText } from "../../lib/insuranceClaim";
import { readPhotoMeta, compressImage, sha256Hex, photoLines } from "../../lib/photoMeta";
import { EVIDENCE_BUCKET, MAX_CLAIM_PHOTOS, loadClaimPhotos } from "../../lib/claimPhotos";

const blankClaim = { cause: "Typhoon", cause_other: "", calamity_date: "", damaged_area: "", description: "" };


export default function FarmerInsurance() {
  const { farmer, profile } = useAuth();
  const { showToast } = useToast();
  const [rows, setRows] = useState([]);
  const [verifiedYields, setVerifiedYields] = useState([]);
  const [cropPrices, setCropPrices] = useState({});
  // null = list | "new" = PCIC application form | { saved } = view a saved application
  const [screen, setScreen] = useState(null);
  const [detailRow, setDetailRow] = useState(null);
  const [claims, setClaims] = useState([]);
  const [claimPolicy, setClaimPolicy] = useState(null); // the policy a claim is being filed for
  const [claimForm, setClaimForm] = useState(blankClaim);
  const [claimSaving, setClaimSaving] = useState(false);
  const [photos, setPhotos] = useState([]);          // photos picked for the claim being filed
  const [photoBusy, setPhotoBusy] = useState(false);

  async function load() {
    if (!farmer?.id) return;
    const [{ data: regs }, { data: harvests }, { data: prices }, { data: clm }] = await Promise.all([
      supabase.from("insurance_registrations").select("*").eq("farmer_id", farmer.id).order("registered_at", { ascending: false }),
      supabase.from("yield_records").select("crop_name, quantity_kg").eq("farmer_id", farmer.id).eq("status", "Verified"),
      supabase.from("crop_prices").select("*"),
      supabase.from("insurance_claims").select("*").eq("farmer_id", farmer.id).order("created_at", { ascending: false }),
    ]);
    setRows(regs || []);
    setClaims(clm || []);
    setVerifiedYields(harvests || []);
    setCropPrices(Object.fromEntries((prices || []).map((p) => [p.crop_name, Number(p.price_per_kg)])));
  }
  useEffect(() => { load(); }, [farmer?.id]);

  if (screen === "new") return <PcicApplication onCancel={() => setScreen(null)} onSaved={() => { setScreen(null); load(); }} />;
  if (screen?.saved) return <PcicView saved={screen.saved} onBack={() => setScreen(null)} />;
  if (screen?.claim) {
    const info = {
      name: profile?.full_name, rsbsa: farmer?.rsbsa_number, contact: profile?.contact_number,
      address: [farmer?.house_no_purok, farmer?.barangay || "Lindaban", "Manolo Fortich, Bukidnon"].filter(Boolean).join(", "),
    };
    return <ClaimView claim={screen.claim} photos={screen.photos} policy={rows.find((r) => r.id === screen.claim.insurance_id)} info={info} onBack={() => setScreen(null)} />;
  }

  function openClaim(policy) { setClaimForm(blankClaim); clearPhotos(); setClaimPolicy(policy); }
  function clearPhotos() { photos.forEach((p) => URL.revokeObjectURL(p.preview)); setPhotos([]); }
  async function showClaim(c) { setScreen({ claim: c, photos: await loadClaimPhotos(c.id) }); }

  async function addPhotos(e) {
    const files = [...(e.target.files || [])];
    e.target.value = "";
    if (!files.length) return;
    setPhotoBusy(true);
    const next = [...photos];
    for (const f of files) {
      if (next.length >= MAX_CLAIM_PHOTOS) { showToast(`You can add up to ${MAX_CLAIM_PHOTOS} photos.`, "fa-triangle-exclamation"); break; }
      if (!/^image\/(jpeg|png|webp)$/.test(f.type)) { showToast(`${f.name}: please use a JPG, PNG or WebP photo (iPhone: Settings > Camera > Formats > Most Compatible).`, "fa-triangle-exclamation"); continue; }
      try {
        const meta = await readPhotoMeta(f);              // date, GPS and camera, read from the ORIGINAL photo
        const { blob, width, height } = await compressImage(f);
        next.push({ key: `${Date.now()}-${next.length}`, name: f.name, blob, width, height, size: blob.size, preview: URL.createObjectURL(blob), sha256: await sha256Hex(blob), ...meta });
      } catch { showToast(`${f.name}: this photo could not be read.`, "fa-triangle-exclamation"); }
    }
    setPhotos(next);
    setPhotoBusy(false);
  }
  function removePhoto(key) {
    const gone = photos.find((p) => p.key === key);
    if (gone) URL.revokeObjectURL(gone.preview);
    setPhotos(photos.filter((p) => p.key !== key));
  }
  async function submitClaim(e) {
    e.preventDefault();
    const p = claimPolicy;
    const dmg = Number(claimForm.damaged_area);
    const fail = (m) => showToast(m, "fa-triangle-exclamation");
    if (!claimForm.calamity_date) return fail("Please choose the date the damage happened.");
    if (!(dmg > 0)) return fail("Enter how many hectares were damaged.");
    if (dmg > Number(p.area)) return fail(`The damaged area cannot be more than your insured area (${p.area} ha).`);
    if (claimForm.cause === "Other" && !claimForm.cause_other.trim()) return fail("Please tell us what caused the damage.");
    if (photos.length === 0) return fail("Please add at least 1 photo of the damage as proof.");
    const est = claimEstimate(p, dmg, verifiedYields, cropPrices);
    setClaimSaving(true);

    // 1) upload the photos first (their folder is <farmer id>/<claim id>), so a claim never exists without its proof
    const claimId = crypto.randomUUID();
    const uploaded = [];
    for (let i = 0; i < photos.length; i++) {
      const path = `${farmer.id}/${claimId}/${i + 1}-${Math.random().toString(36).slice(2, 8)}.jpg`;
      const { error: upErr } = await supabase.storage.from(EVIDENCE_BUCKET).upload(path, photos[i].blob, { contentType: "image/jpeg", upsert: false });
      if (upErr) {
        if (uploaded.length) await supabase.storage.from(EVIDENCE_BUCKET).remove(uploaded.map((u) => u.path));
        setClaimSaving(false);
        return fail(/bucket/i.test(upErr.message) ? `${upErr.message} — run supabase/migrations/insurance_claim_photos.sql in the Supabase SQL editor first.` : `Photo upload failed: ${upErr.message}`);
      }
      uploaded.push({ path, photo: photos[i] });
    }

    const { data, error } = await supabase.from("insurance_claims").insert({
      id: claimId, insurance_id: p.id, farmer_id: farmer.id, crop_name: p.crop_name, insured_area: p.area,
      cause: claimForm.cause, cause_other: claimForm.cause === "Other" ? claimForm.cause_other.trim() : null,
      calamity_date: claimForm.calamity_date, damaged_area: dmg, damage_percentage: est?.pct ?? 0,
      description: claimForm.description.trim() || null, estimated_amount: est?.amount ?? null,
      computation: est ? { price: est.price, yieldNote: est.yieldNote, cropValue: est.cropValue, damageValue: est.damageValue, coverageRate: est.coverageRate } : null,
    }).select().single();
    if (error) await supabase.storage.from(EVIDENCE_BUCKET).remove(uploaded.map((u) => u.path)); // nothing was filed: remove the files again
    if (error) {
      setClaimSaving(false);
      return fail(/insurance_claims/.test(error.message) && /relation|schema cache/.test(error.message)
        ? `${error.message} — run supabase/migrations/insurance_claims.sql in the Supabase SQL editor first.` : error.message);
    }

    // 2) save what we know about each photo (taken date, GPS, camera, size, fingerprint)
    const { error: metaErr } = await supabase.from("insurance_claim_photos").insert(uploaded.map(({ path, photo }, i) => ({
      claim_id: claimId, farmer_id: farmer.id, storage_path: path, original_name: photo.name, mime_type: "image/jpeg",
      file_size: photo.size, width: photo.width, height: photo.height, sha256: photo.sha256,
      taken_at: photo.taken_at || null, latitude: photo.latitude ?? null, longitude: photo.longitude ?? null, camera: photo.camera || null,
    })));
    setClaimSaving(false);
    if (metaErr) showToast(`Your claim was sent, but the photo details could not be saved: ${metaErr.message}`, "fa-triangle-exclamation");
    logActivity(`Filed a crop insurance claim for ${p.crop_name} — ${dmg} ha damaged`, "insurance");
    showToast("Claim sent to the Municipal Agriculture Office. You can print it now.", "fa-file-invoice-dollar");
    setClaimPolicy(null); setDetailRow(null);
    clearPhotos();
    await load();
    showClaim(data);
  }

  return (
    <section>
      <div className="view-head"><h2><i className="fa-solid fa-shield-heart"></i> {tr("Crop Insurance Records")}</h2><button className="btn-primary" onClick={() => setScreen("new")}><i className="fa-solid fa-plus"></i> {tr("Register Crop")}</button></div>
      <p className="hint-text"><i className="fa-solid fa-circle-info"></i> {tr("Register Crop opens the PCIC Application for Crop Insurance (one long bond sheet). Register crops before any damage occurs to establish insurance eligibility. Expired and past policies stay visible below for your records.")}</p>
      <div className="qual-box">
        <b>{tr("How New Registration vs. Renewal is decided")}</b>
        <p style={{ margin: 0 }}>{tr("If this is the first time you're insuring a given crop, it's recorded as a")} <b>{tr("New Registration")}</b>{tr(". If you already have any previous record for that same crop (active, expired, claimed, or cancelled), registering it again is treated as a")} <b>{tr("Renewal")}</b> {tr("— this applies to every farmer with prior history, not only certain members. You cannot start a new registration for a crop while an active policy for it is still in effect; wait for it to expire, be claimed, or be cancelled first.")}</p>
      </div>
      <div className="qual-box">
        <b>{tr("Eligibility Requirements")}</b>
        <p style={{ margin: 0 }}>{tr(ASSISTANCE_REQUIREMENTS["Crop Insurance"])}</p>
      </div>
      <div className="table-panel">
        <table className="data-table">
          <thead><tr><th>{tr("Crop / Plant Name")}</th><th>{tr("Area")}</th><th>{tr("Type")}</th><th>{tr("Coverage")}</th><th>{tr("Source")}</th><th>{tr("Status")}</th><th></th></tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={7} style={{ textAlign: "center", color: "var(--ink-soft)" }}>{tr("No crops registered for insurance yet.")}</td></tr>}
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{r.crop_name}</td><td>{r.area} {tr("ha")}</td>
                <td><StatusBadge status={r.registration_type || "New Registration"} /></td>
                <td>{r.coverage_start_date || "—"} &rarr; {r.coverage_end_date || "—"}</td>
                <td>{tr(r.insurance_source)}</td>
                <td><StatusBadge status={computeInsuranceStatus(r)} /></td>
                <td><button className="btn-ghost" style={{ padding: "4px 8px", fontSize: ".7rem" }} onClick={() => setDetailRow(r)}><i className="fa-solid fa-eye"></i></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3 style={{ margin: "22px 0 8px", fontSize: "1rem" }}><i className="fa-solid fa-file-invoice-dollar"></i> My Insurance Claims</h3>
      <p className="hint-text"><i className="fa-solid fa-circle-info"></i> Had damage from a calamity? Open a policy above (the eye button) and press <b>File a crop insurance claim</b>. You only claim the part of your farm that was damaged, and you can print the claim form.</p>
      <div className="table-panel">
        <table className="data-table">
          <thead><tr><th>Claim No.</th><th>Crop</th><th>Calamity</th><th>Date</th><th>Damaged</th><th>Assistance</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {claims.length === 0 && <tr><td colSpan={8} style={{ textAlign: "center", color: "var(--ink-soft)" }}>No claims filed yet.</td></tr>}
            {claims.map((c) => (
              <tr key={c.id}>
                <td>{claimNo(c.id)}</td><td>{c.crop_name}</td><td>{causeText(c)}</td><td>{c.calamity_date}</td>
                <td>{c.damaged_area} ha ({c.status === "Approved" ? c.final_damage_percentage : c.damage_percentage}%)</td>
                <td>{c.status === "Approved" ? <b>{formatPeso(c.final_amount)}</b> : c.estimated_amount != null ? <span title="Estimate until the MAO confirms the damage">≈ {formatPeso(c.estimated_amount)}</span> : "—"}</td>
                <td><StatusBadge status={c.status} />{c.status === "Rejected" && c.admin_remarks && <div style={{ fontSize: ".68rem", color: "var(--ink-soft)", marginTop: 2 }}>MAO: {c.admin_remarks}</div>}</td>
                <td><button className="btn-ghost" style={{ padding: "4px 8px", fontSize: ".72rem" }} onClick={() => showClaim(c)}><i className="fa-solid fa-print"></i> View / Print</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal open={!!detailRow} onClose={() => setDetailRow(null)} title={`${detailRow?.crop_name || ""} — Insurance Record`} icon="fa-shield-heart">
        {detailRow && (() => {
          const basis = computeInsuranceBasis(detailRow, verifiedYields, cropPrices);
          const effectiveStatus = computeInsuranceStatus(detailRow);
          return (
            <div className="modal-body">
              <ul className="detail-list">
                <li><span>{tr("Crop / Plant Name")}</span><b>{detailRow.crop_name}</b></li>
                <li><span>{tr("Farm Area")}</span><b>{detailRow.area} {tr("ha")}</b></li>
                <li><span>{tr("Registration Type")}</span><b>{tr(detailRow.registration_type || "New Registration")}</b></li>
                <li><span>{tr("Registration Date")}</span><b>{new Date(detailRow.registered_at).toLocaleDateString("en-PH")}</b></li>
                <li><span>{tr("Coverage Period")}</span><b>{detailRow.coverage_start_date || "—"} {tr("to")} {detailRow.coverage_end_date || "—"}</b></li>
                <li><span>{tr("Status")}</span><b>{effectiveStatus}</b></li>
                <li><span>{tr("Insurance Source")}</span><b>{tr(detailRow.insurance_source)}</b></li>
              </ul>
              {detailRow.pcic_application && (
                <div className="modal-actions" style={{ justifyContent: "flex-start", padding: "4px 0 10px" }}>
                  <button className="btn-primary" onClick={() => { const saved = detailRow.pcic_application; setDetailRow(null); setScreen({ saved }); }}><i className="fa-solid fa-file-lines"></i> {tr("View / Print PCIC Application Form")}</button>
                </div>
              )}
              {(() => {
                const canClaim = effectiveStatus !== "Claimed" && effectiveStatus !== "Cancelled";
                const waiting = claims.find((c) => c.insurance_id === detailRow.id && c.status === "Pending");
                return (
                  <div style={{ padding: "2px 0 10px" }}>
                    {canClaim && !waiting && <button className="btn-primary" onClick={() => openClaim(detailRow)}><i className="fa-solid fa-file-invoice-dollar"></i> File a crop insurance claim</button>}
                    {waiting && <p className="hint-text" style={{ margin: 0 }}><i className="fa-solid fa-hourglass-half"></i> A claim for this policy is waiting for the MAO's review ({claimNo(waiting.id)}). <a href="#" onClick={(e) => { e.preventDefault(); setDetailRow(null); showClaim(waiting); }}>View / Print it</a></p>}
                    {!canClaim && <p className="hint-text" style={{ margin: 0 }}><i className="fa-solid fa-circle-info"></i> This policy is {effectiveStatus.toLowerCase()}, so a new claim cannot be filed for it.</p>}
                  </div>
                );
              })()}
              <p className="rsbsa-subhead">{tr("Insurance Calculation Basis")}</p>
              <div className="qual-box">
                <p style={{ margin: 0 }}>{tr("Crop:")} {detailRow.crop_name}<br />{tr("Farm Area:")} {detailRow.area} {tr("ha")}<br />{tr("Harvest used:")} {basis.yieldBasisNote}<br />{tr("Crop Price: ₱")}{basis.price}{tr("/kg")}<br />{tr("Estimated Crop Value:")} {formatPeso(basis.cropValue)}<br />{tr("Coverage Rate:")} {(basis.coverageRate * 100).toFixed(0)}%</p>
              </div>
              {basis.damagePct != null ? (
                <>
                  <p className="rsbsa-subhead">{tr("Claim / Damage Assessment")}</p>
                  <div className="qual-box">
                    <p style={{ margin: 0 }}>
                      {tr("Estimated Damage:")} {basis.damagePct}%<br />
                      {tr("Estimated Damage Value:")} {formatPeso(basis.damageValue)}<br />
                      <b>{tr("Estimated Insurance Assistance:")} {formatPeso(basis.insuranceAmount)}</b><br />
                      {detailRow.claim_date && <>{tr("Date of Claim:")} {detailRow.claim_date}</>}
                    </p>
                  </div>
                </>
              ) : (
                <p className="hint-text">{tr("No damage claim on file. If undamaged at harvest, estimated coverage would be")} {formatPeso(basis.undamagedEstimate)}.</p>
              )}
            </div>
          );
        })()}
      </Modal>

      {/* FILE A CLAIM: only the damaged part is paid */}
      <Modal open={!!claimPolicy} onClose={() => { if (!claimSaving) { clearPhotos(); setClaimPolicy(null); } }} title="File a crop insurance claim" icon="fa-file-invoice-dollar" wide>
        {claimPolicy && (() => {
          const est = claimEstimate(claimPolicy, claimForm.damaged_area, verifiedYields, cropPrices);
          const today = new Date().toISOString().slice(0, 10);
          const maxDate = claimPolicy.coverage_end_date && claimPolicy.coverage_end_date < today ? claimPolicy.coverage_end_date : today;
          return (
            <form className="modal-body" onSubmit={submitClaim}>
              <p className="hint-text" style={{ margin: 0 }}><i className="fa-solid fa-shield-heart"></i> <span><b>{claimPolicy.crop_name}</b> — {claimPolicy.area} ha insured. Coverage: {claimPolicy.coverage_start_date || "—"} to {claimPolicy.coverage_end_date || "—"}. The damage must have happened during the coverage.</span></p>
              <p className="hint-text" style={{ margin: 0 }}><i className="fa-solid fa-circle-info"></i> <span>Insurance pays only for the <b>damaged part</b> of your crop, not the whole farm. For example, if 1 of your 4 hectares was damaged, the claim is for 25%.</span></p>
              <label>Cause of damage <select value={claimForm.cause} onChange={(e) => setClaimForm({ ...claimForm, cause: e.target.value })}>{CLAIM_CAUSES.map((c) => <option key={c}>{c}</option>)}</select></label>
              {claimForm.cause === "Other" && <label>What caused it? <input value={claimForm.cause_other} onChange={(e) => setClaimForm({ ...claimForm, cause_other: e.target.value })} placeholder="e.g. Rat infestation" required /></label>}
              <div style={{ display: "flex", gap: 10 }}>
                <label style={{ flex: 1 }}>Date it happened <input type="date" value={claimForm.calamity_date} min={claimPolicy.coverage_start_date || undefined} max={maxDate} onChange={(e) => setClaimForm({ ...claimForm, calamity_date: e.target.value })} required /></label>
                <label style={{ flex: 1 }}>Damaged area (hectares) <input type="number" step="0.01" min="0.01" max={claimPolicy.area} value={claimForm.damaged_area} onChange={(e) => setClaimForm({ ...claimForm, damaged_area: e.target.value })} placeholder={`up to ${claimPolicy.area}`} required /></label>
              </div>
              <label>What happened? (optional) <textarea rows={3} value={claimForm.description} onChange={(e) => setClaimForm({ ...claimForm, description: e.target.value })} placeholder="e.g. The flood covered the lower part of the field after the heavy rain." /></label>
              <div className="claim-photo-box">
                <b><i className="fa-solid fa-camera"></i> Photo proof of the damage <span style={{ fontWeight: 400, color: "var(--ink-soft)" }}>(1 to {MAX_CLAIM_PHOTOS} photos, required)</span></b>
                <p className="hint-text" style={{ margin: "4px 0 8px" }}>Take clear photos of the damaged part of your farm. Photos from your phone camera carry the date and location, which helps the MAO check the claim. Photos sent through Messenger or Facebook can lose this, so pick them straight from your gallery.</p>
                <div className="photo-grid">
                  {photos.map((ph) => {
                    const l = photoLines(ph);
                    return (
                      <figure className="photo-card" key={ph.key}>
                        <img src={ph.preview} alt="Damage" />
                        <button type="button" className="photo-remove" onClick={() => removePhoto(ph.key)} aria-label="Remove photo" title="Remove photo"><i className="fa-solid fa-xmark"></i></button>
                        <figcaption>
                          <span className={`photo-chip ${ph.taken_at ? "ok" : "warn"}`}>{ph.taken_at ? l.taken : "No date in photo"}</span>
                          <span className={`photo-chip ${ph.latitude != null ? "ok" : "warn"}`}>{ph.latitude != null ? "Location saved" : "No location in photo"}</span>
                        </figcaption>
                      </figure>
                    );
                  })}
                  {photos.length < MAX_CLAIM_PHOTOS && (
                    <label className="photo-add">
                      <i className={`fa-solid ${photoBusy ? "fa-spinner fa-spin" : "fa-camera"}`}></i>
                      <span>{photoBusy ? "Reading…" : "Add photo"}</span>
                      <input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={addPhotos} disabled={photoBusy || claimSaving} hidden />
                    </label>
                  )}
                </div>
              </div>
              {est ? (
                <div className="qual-box">
                  <b>Your estimate</b>
                  <p style={{ margin: 0 }}>
                    Damaged: {claimForm.damaged_area} ha of {claimPolicy.area} ha = <b>{est.pct}%</b><br />
                    Value of the whole crop: {formatPeso(est.cropValue)} <span style={{ color: "var(--ink-soft)" }}>({est.yieldNote}, ₱{est.price}/kg)</span><br />
                    Value of the damaged part: {formatPeso(est.damageValue)}<br />
                    <b>Estimated insurance assistance: {formatPeso(est.amount)}</b> <span style={{ color: "var(--ink-soft)" }}>({Math.round(est.coverageRate * 100)}% of the damaged value)</span>
                  </p>
                  <p className="hint-text" style={{ margin: "6px 0 0" }}>This is only an estimate. The MAO will inspect your farm and confirm the damage before the final amount is set.</p>
                </div>
              ) : <p className="hint-text" style={{ margin: 0 }}>Enter the damaged area to see your estimate.</p>}
              <div className="modal-actions">
                <button type="button" className="btn-ghost" onClick={() => { clearPhotos(); setClaimPolicy(null); }} disabled={claimSaving}>Cancel</button>
                <button type="submit" className="btn-primary" disabled={claimSaving}>{claimSaving ? "Uploading & sending…" : <><i className="fa-solid fa-paper-plane"></i> Submit claim</>}</button>
              </div>
            </form>
          );
        })()}
      </Modal>
    </section>
  );
}
