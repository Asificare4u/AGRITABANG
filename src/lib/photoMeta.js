// Reads the information a phone camera stores inside a JPEG (EXIF): when the photo was taken,
// where (GPS) and with what camera. No libraries. Photos shared through Messenger / Facebook usually
// have this removed, so every field can be missing.

const TYPE_SIZE = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 };

function readIfd(dv, base, rel, little) {
  const tags = {};
  let p = base + rel;
  if (p + 2 > dv.byteLength) return tags;
  const n = dv.getUint16(p, little); p += 2;
  for (let i = 0; i < n && p + 12 <= dv.byteLength; i++, p += 12) {
    const tag = dv.getUint16(p, little), type = dv.getUint16(p + 2, little), count = dv.getUint32(p + 4, little);
    const size = (TYPE_SIZE[type] || 1) * count;
    const off = size <= 4 ? p + 8 : base + dv.getUint32(p + 8, little);
    if (off + size <= dv.byteLength) tags[tag] = { type, count, off };
  }
  return tags;
}
function text(dv, t) {
  if (!t || t.type !== 2) return null;
  let s = "";
  for (let i = 0; i < t.count; i++) { const c = dv.getUint8(t.off + i); if (c === 0) break; s += String.fromCharCode(c); }
  return s.trim() || null;
}
function rationals(dv, t, little) {
  if (!t || t.type !== 5) return null;
  const out = [];
  for (let i = 0; i < t.count; i++) {
    const num = dv.getUint32(t.off + i * 8, little), den = dv.getUint32(t.off + i * 8 + 4, little);
    out.push(den ? num / den : 0);
  }
  return out;
}
const dms = (v) => (v && v.length >= 3 ? v[0] + v[1] / 60 + v[2] / 3600 : null);
const toIso = (s) => { const m = /^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/.exec(s || ""); return m && m[1] !== "0000" ? `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}` : null; };

export function parseExif(buf) {
  try {
    const dv = new DataView(buf);
    if (dv.byteLength < 12 || dv.getUint16(0) !== 0xffd8) return {};
    let off = 2;
    while (off + 4 < dv.byteLength && dv.getUint8(off) === 0xff) {
      const marker = dv.getUint8(off + 1), size = dv.getUint16(off + 2);
      if (marker === 0xe1 && dv.getUint32(off + 4) === 0x45786966 && dv.getUint16(off + 8) === 0) {
        const base = off + 10;
        const little = dv.getUint16(base) === 0x4949;
        if (dv.getUint16(base + 2, little) !== 42) return {};
        const ifd0 = readIfd(dv, base, dv.getUint32(base + 4, little), little);
        const exif = ifd0[0x8769] ? readIfd(dv, base, dv.getUint32(ifd0[0x8769].off, little), little) : {};
        const gps = ifd0[0x8825] ? readIfd(dv, base, dv.getUint32(ifd0[0x8825].off, little), little) : {};
        const make = text(dv, ifd0[0x010f]), model = text(dv, ifd0[0x0110]);
        const camera = [make, model && make && model.toLowerCase().startsWith(make.toLowerCase()) ? model.slice(make.length).trim() : model].filter(Boolean).join(" ") || null;
        const taken_at = toIso(text(dv, exif[0x9003])) || toIso(text(dv, exif[0x9004])) || toIso(text(dv, ifd0[0x0132]));
        let latitude = dms(rationals(dv, gps[2], little)), longitude = dms(rationals(dv, gps[4], little));
        if (latitude != null && text(dv, gps[1]) === "S") latitude = -latitude;
        if (longitude != null && text(dv, gps[3]) === "W") longitude = -longitude;
        if (latitude == null || longitude == null || (latitude === 0 && longitude === 0)) { latitude = null; longitude = null; }
        else { latitude = Math.round(latitude * 1e6) / 1e6; longitude = Math.round(longitude * 1e6) / 1e6; }
        return { camera, taken_at, latitude, longitude };
      }
      if (marker === 0xda) break;
      off += 2 + size;
    }
  } catch { /* unreadable EXIF just means no metadata */ }
  return {};
}

export async function readPhotoMeta(file) {
  if (file.type !== "image/jpeg") return {};
  return parseExif(await file.slice(0, 262144).arrayBuffer());
}

export async function sha256Hex(blob) {
  const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// phone photos are 3-8 MB: shrink to 1600 px JPEG (about 300 KB) so the free storage lasts
export async function compressImage(file, maxSide = 1600, quality = 0.82) {
  const bmp = await createImageBitmap(file, { imageOrientation: "from-image" }).catch(() => createImageBitmap(file));
  const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  const width = Math.round(bmp.width * scale), height = Math.round(bmp.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = width; canvas.height = height;
  canvas.getContext("2d").drawImage(bmp, 0, 0, width, height);
  bmp.close?.();
  const blob = await new Promise((res) => canvas.toBlob(res, "image/jpeg", quality));
  if (!blob) throw new Error("Could not read this photo.");
  return { blob, width, height };
}

// ---- text for the screen and the printed form
export const fmtBytes = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
export function photoLines(p) {
  return {
    taken: p.taken_at ? new Date(p.taken_at).toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" }) : "Not stored in the photo",
    location: p.latitude != null ? `${p.latitude}, ${p.longitude}` : "Not stored in the photo",
    camera: p.camera || "Not stored in the photo",
    file: `${p.width || "?"}×${p.height || "?"} px · ${p.file_size ? fmtBytes(p.file_size) : "?"}`,
    uploaded: p.created_at ? new Date(p.created_at).toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" }) : "Not uploaded yet",
    fingerprint: p.sha256 ? p.sha256.slice(0, 12).toUpperCase() : "—",
  };
}
// Helpful checks for the ADMIN. They are hints, never an automatic rejection.
export function photoFlags(p, calamityDate) {
  const flags = [];
  if (p.taken_at) {
    const days = Math.round((new Date(p.taken_at.slice(0, 10)) - new Date(calamityDate)) / 86400000);
    if (days < 0) flags.push({ tone: "warn", text: `Taken ${-days} day${days === -1 ? "" : "s"} BEFORE the reported calamity` });
    else if (days > 30) flags.push({ tone: "warn", text: `Taken ${days} days after the calamity` });
    else flags.push({ tone: "ok", text: days === 0 ? "Taken on the day of the calamity" : `Taken ${days} day${days === 1 ? "" : "s"} after the calamity` });
  } else flags.push({ tone: "warn", text: "No date stored in the photo" });
  flags.push(p.latitude != null ? { tone: "ok", text: "Location stored in the photo" } : { tone: "warn", text: "No location stored in the photo" });
  return flags;
}
