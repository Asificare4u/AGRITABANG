import { computeInsuranceBasis } from "./businessRules";

export const CLAIM_CAUSES = ["Typhoon", "Flood", "Drought", "Pest infestation", "Plant disease", "Landslide / earthquake", "Other"];

export const claimNo = (id) => `CLM-${String(id || "").slice(0, 8).toUpperCase()}`;
export const causeText = (c) => (c.cause === "Other" && c.cause_other ? `Other: ${c.cause_other}` : c.cause);

// A claim pays for the DAMAGED PART only, not the whole crop:
//   damage %  = damaged area / insured area
//   damage value = crop value x damage %      |      insurance = damage value x coverage rate
// Same chain the Crop Insurance Reports page already uses (computeInsuranceBasis).
export function claimEstimate(policy, damagedArea, verifiedYields, cropPrices, damagePctOverride) {
  const area = Number(policy?.area);
  const dmg = Number(damagedArea);
  if (!(area > 0)) return null;
  const pct = damagePctOverride != null && damagePctOverride !== ""
    ? Math.min(100, Math.max(0, Number(damagePctOverride)))
    : (dmg > 0 ? Math.min(100, Math.round((dmg / area) * 10000) / 100) : 0);
  if (!(pct > 0)) return null;
  const b = computeInsuranceBasis({ ...policy, estimated_damage_percentage: pct }, verifiedYields, cropPrices);
  return {
    pct, price: b.price, yieldNote: b.yieldBasisNote, cropValue: b.cropValue,
    damageValue: b.damageValue, coverageRate: b.coverageRate, amount: b.insuranceAmount,
  };
}
