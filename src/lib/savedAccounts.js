// Accounts the person chose to remember on THIS device (email + name + role only; the password is never saved here).
const KEY = "agritabang.savedAccounts";

function readAll() {
  try { const a = JSON.parse(localStorage.getItem(KEY) || "[]"); return Array.isArray(a) ? a : []; } catch { return []; }
}
function writeAll(list) { try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* storage full or blocked: ignore */ } }

export function getSavedAccounts(role) {
  return readAll().filter((a) => a && a.email && (!role || a.role === role));
}
export function saveAccount({ email, role, name }) {
  const e = String(email || "").trim().toLowerCase();
  if (!e || !role) return;
  const list = readAll().filter((a) => !(a.email === e && a.role === role));
  list.unshift({ email: e, role, name: name || "" });
  writeAll(list.slice(0, 50));
}
export function removeSavedAccount(email, role) {
  writeAll(readAll().filter((a) => !(a.email === String(email).toLowerCase() && a.role === role)));
}
