// The "date of harvest" a farmer enters in the Crop Registration (PCIC form, item B.8) is saved with the crop as
// cropping_schedule = "<sowing date> to <harvest date>". The Yield report reads it from there, so the farmer
// does not have to type the harvest date again.
export function registeredHarvestDate(reg) {
  const m = /(\d{4}-\d{2}-\d{2})\s*$/.exec(reg?.cropping_schedule || "");
  if (m) return m[1];
  // older rows: read it from the saved registration form
  const lots = reg?.pcic_application?.lots;
  if (!Array.isArray(lots) || lots.length === 0) return null;
  const lot = lots.find((l) => Number(l.area) === Number(reg.area) && (l.planting || lots[0]?.planting) === reg.planting_date) || lots[0];
  return lot?.harvest || null;
}

// Harvest date the system expects for a crop name, from the farmer's newest non-rejected registration of that crop.
export function autoHarvestFor(cropName, regs) {
  const key = (cropName || "").trim().toLowerCase();
  const mine = (regs || [])
    .filter((r) => (r.status || "Pending") !== "Rejected" && (r.crop_name || "").trim().toLowerCase() === key)
    .sort((a, b) => new Date(b.registered_at || 0) - new Date(a.registered_at || 0));
  for (const r of mine) {
    const date = registeredHarvestDate(r);
    if (date) return { date, planted: r.planting_date || null };
  }
  return null;
}

export const prettyDate = (d) => (d ? new Date(`${d}T00:00:00`).toLocaleDateString("en-PH", { month: "long", day: "numeric", year: "numeric" }) : "—");
