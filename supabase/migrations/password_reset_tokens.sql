-- ============================================================================
-- MIGRATION — Password reset tokens (a farmer forgot the password).
--
-- Flow:  farmer asks the ADMIN  ->  ADMIN generates a one-time token (Farmers page, key button)
--        ->  farmer enters e-mail + token + a new password on the login page.
--
-- * Only a HASH of the token is stored, never the token itself.
-- * A token works once, expires, and locks after 5 wrong tries.
-- * Only the two Edge Functions (service role) can read or write this table:
--   no policies exist, and the app's anon / signed-in users have no access at all.
-- Safe to run more than once.
-- ============================================================================
create table if not exists public.password_reset_tokens (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  token_hash  text not null,
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null,
  attempts    integer not null default 0,
  used_at     timestamptz,
  revoked_at  timestamptz
);
create index if not exists idx_reset_tokens_user on public.password_reset_tokens (user_id, created_at desc);

alter table public.password_reset_tokens enable row level security;
revoke all on public.password_reset_tokens from anon, authenticated;
