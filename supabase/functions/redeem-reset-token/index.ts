// Deploy with: supabase functions deploy redeem-reset-token
// Called from the login page (no one is signed in yet) as:
//   supabase.functions.invoke('redeem-reset-token', { body: { email, token, new_password } })
//
// Checks the e-mail + token the ADMIN gave the farmer, then sets the new password.
// Every failure returns the SAME message so nobody can use this to find out which e-mails exist.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const MAX_ATTEMPTS = 5; // wrong tries before the token is locked
const GENERIC = "Invalid or expired token. Check the e-mail and the token, or ask the ADMIN for a new one.";

async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
function sameText(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

serve(async (req) => {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json();
    const email = String(body?.email ?? "").trim();
    const token = String(body?.token ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    const newPassword = String(body?.new_password ?? "");

    if (!email || !token) return json({ error: GENERIC }, 400);
    if (newPassword.length < 6) return json({ error: "The new password must be at least 6 characters." }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // 1. the farmer account (profiles.email, case-insensitive, no wildcards)
    const { data: prof } = await admin.from("profiles").select("id")
      .eq("role", "farmer").ilike("email", email.replace(/[\\%_]/g, "\\$&")).maybeSingle();
    if (!prof) return json({ error: GENERIC }, 400);

    // 2. their newest token that is still usable
    const { data: tok } = await admin.from("password_reset_tokens").select("*")
      .eq("user_id", prof.id).is("used_at", null).is("revoked_at", null)
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (!tok || new Date(tok.expires_at).getTime() < Date.now() || tok.attempts >= MAX_ATTEMPTS) {
      return json({ error: GENERIC }, 400);
    }

    // 3. is it the right token?
    const given = await sha256Hex(`${prof.id}:${token}`);
    if (!sameText(given, tok.token_hash)) {
      const attempts = tok.attempts + 1;
      await admin.from("password_reset_tokens")
        .update({ attempts, ...(attempts >= MAX_ATTEMPTS ? { revoked_at: new Date().toISOString() } : {}) })
        .eq("id", tok.id);
      return json({ error: GENERIC }, 400);
    }

    // 4. use the token up (only one request can win this)
    const { data: claimed } = await admin.from("password_reset_tokens")
      .update({ used_at: new Date().toISOString() })
      .eq("id", tok.id).is("used_at", null).is("revoked_at", null).select("id");
    if (!claimed || claimed.length === 0) return json({ error: GENERIC }, 400);

    // 5. set the new password
    const { error: pwErr } = await admin.auth.admin.updateUserById(prof.id, { password: newPassword });
    if (pwErr) {
      await admin.from("password_reset_tokens").update({ used_at: null }).eq("id", tok.id); // give the token back
      return json({ error: pwErr.message }, 400);
    }

    // 6. housekeeping (never allowed to break the reset): sign out old devices + write the activity log
    try {
      await admin.from("user_sessions").update({ ended_at: new Date().toISOString(), end_reason: "logout_all" })
        .eq("user_id", prof.id).is("ended_at", null);
    } catch (_) { /* ignore */ }
    try {
      await admin.from("activity_log").insert({
        user_id: prof.id, role: "farmer", action: "action", category: "security",
        description: "Password was reset using a token from the ADMIN",
      });
    } catch (_) { /* ignore */ }

    return json({ ok: true });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
