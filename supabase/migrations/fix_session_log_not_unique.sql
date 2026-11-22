-- ============================================================================
-- FIX:  "function public._session_log(uuid, text) is not unique"
-- Shown when the ADMIN terminates a user's sessions.
-- Cause: the database has more than one function named public._session_log
--        (an older copy was left behind), so Postgres cannot tell which one to call.
-- This script removes EVERY copy and creates a single one. Safe to run twice.
-- Run it in the Supabase SQL editor.
-- ============================================================================

-- (optional) see the duplicates first:
--   select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'public' and p.proname = '_session_log';

do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = '_session_log'
  loop
    execute 'drop function ' || r.sig;
  end loop;
end $$;

-- one function; the 3rd argument is optional, so calls with 2 or 3 arguments both work
create or replace function public._session_log(p_user uuid, p_text text, p_category text default 'session')
returns void
language sql security definer set search_path = public as $$
  insert into public.activity_log (user_id, action, category, description, page)
  values (p_user, 'action', coalesce(p_category, 'session'), p_text, '/activity-log');
$$;
revoke all on function public._session_log(uuid, text, text) from public;
