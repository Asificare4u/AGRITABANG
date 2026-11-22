// Deploy with: supabase functions deploy admin-issue-reset-token
// Called from the React app as:
//   supabase.functions.invoke('admin-issue-reset-token', { body: { farmer_id } })
//
// The ADMIN uses this when a farmer forgot the password. It creates a one-time token
// (shown to the ADMIN ONCE, stored only as a hash) that the farmer enters on the login page.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const TOKEN_HOURS = 24;                                  // how long a token stays valid
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";      // no I, L, O, 0, 1 (easy to read aloud)

function makeToken(): string {
  const limit = 256 - (256 % ALPHABET.length);           // reject biased bytes
  let out = "";
  while (out.length < 8) {
    for (const b of crypto.getRandomValues(new Uint8Array(16))) {
      if (b < limit && out.length < 8) out += ALPHABET[b % ALPHABET.length];
    }
  }
  return out;
}

async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
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
    const authHeader = req.headers.get("Authorization") ?? "";
    const callerClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { global: { headers: { Authorization: authHeader } } });
    const { data: userData, error: userErr } = await callerClient.auth.getUser();
    if (userErr || !userData?.user) return json({ error: "Not authenticated" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const { data: callerProfile } = await admin.from("profiles").select("role").eq("id", userData.user.id).single();
    if (!callerProfile || callerProfile.role !== "admin") return json({ error: "Only the ADMIN can create reset tokens" }, 403);

    const { farmer_id } = await req.json();
    if (!farmer_id) return json({ error: "farmer_id is required" }, 400);

    const { data: target } = await admin.from("profiles").select("id, full_name, email, role").eq("id", farmer_id).single();
    if (!target || target.role !== "farmer") return json({ error: "Reset tokens can only be created for farmer accounts" }, 400);

    // any older unused token of this farmer stops working
    await admin.from("password_reset_tokens")
      .update({ revoked_at: new Date().toISOString() })
      .eq("user_id", target.id).is("used_at", null).is("revoked_at", null);

    const token = makeToken();
    const expires_at = new Date(Date.now() + TOKEN_HOURS * 3600 * 1000).toISOString();
    const { error: insErr } = await admin.from("password_reset_tokens").insert({
      user_id: target.id,
      token_hash: await sha256Hex(`${target.id}:${token}`),
      created_by: userData.user.id,
      expires_at,
    });
    if (insErr) return json({ error: insErr.message }, 400);

    return json({
      token: `${token.slice(0, 4)}-${token.slice(4)}`,
      expires_at,
      full_name: target.full_name,
      email: target.email,
    });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
