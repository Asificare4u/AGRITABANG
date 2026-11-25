import { supabase } from "./supabaseClient";

export const EVIDENCE_BUCKET = "claim-evidence";
export const MAX_CLAIM_PHOTOS = 3;

// the photos of a claim, each with a temporary link (1 hour) because the bucket is private
export async function loadClaimPhotos(claimId) {
  const { data } = await supabase.from("insurance_claim_photos").select("*").eq("claim_id", claimId).order("created_at");
  const rows = data || [];
  if (!rows.length) return [];
  const { data: urls } = await supabase.storage.from(EVIDENCE_BUCKET).createSignedUrls(rows.map((r) => r.storage_path), 3600);
  return rows.map((r, i) => ({ ...r, url: urls?.[i]?.signedUrl || null }));
}
