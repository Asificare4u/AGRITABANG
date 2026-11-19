-- ============================================================================
-- MIGRATION — Notifications tell the farmer WHO did it.
--
--   Before:  "Your registered crop Rice was verified by the MAO."   /   (just the title)
--   Now:     "Admin verified your registered crop Rice."
--            "Admin posted an announcement: <title>"
--            "Association President posted an announcement: <title>"
--            "Admin posted new assistance — Fertilizer: <title> ..."
--            "Association President scheduled a meeting — ..."
--
-- The name shown is the ROLE of the person who did it: Admin or Association President
-- (the role is read from the person who posted / verified).
-- Safe to run more than once. Nothing is deleted. Run it in the Supabase SQL Editor.
-- ============================================================================

-- who is this person? -> "Admin" / "Association President" (or "The MAO" when unknown)
create or replace function public._actor_label(p_id uuid) returns text
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select case p.role::text when 'admin' then 'Admin' when 'president' then 'Association President' else 'The MAO' end
       from public.profiles p where p.id = p_id),
    'The MAO');
$$;
revoke all on function public._actor_label(uuid) from public;

-- make text safe to show inside a notification (the bell shows HTML)
create or replace function public._html(t text) returns text
language sql immutable as $$
  select replace(replace(replace(coalesce(t, ''), '&', '&amp;'), '<', '&lt;'), '>', '&gt;');
$$;

-- ---- 1) announcements (Admin or Association President) ------------------------------------------
create or replace function public.notify_on_new_announcement() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  who text;
begin
  who := case when new.posted_by is not null then public._actor_label(new.posted_by)
              when new.posted_by_role::text = 'president' then 'Association President'
              else 'Admin' end;
  insert into public.notifications (recipient_id, icon, message, category)
  select p.id, coalesce(new.icon, 'fa-bullhorn'),
         '<b>' || who || '</b> posted an announcement: ' || public._html(new.title),
         'announcement'
  from public.profiles p
  where p.id is distinct from new.posted_by
    and (new.association_id is null
         or p.role in ('admin', 'president')
         or exists (select 1 from public.farmers f where f.id = p.id and f.is_association_member and f.association_id = new.association_id));
  return new;
end;
$$;

-- ---- 2) assistance posted ---------------------------------------------------------------------
create or replace function public.notify_qualified_farmers(p_farmer uuid default null, p_announcement uuid default null)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  rec record;
  n integer := 0;
begin
  for rec in
    select a.id as ann_id, a.title, a.assistance_type, a.icon, a.posted_by, r.farmer_id
    from public.assistance_announcements a
    join public.assistance_announcement_recipients r on r.announcement_id = a.id
    where (a.deadline is null or a.deadline >= current_date)
      and (p_farmer is null or r.farmer_id = p_farmer)
      and (p_announcement is null or a.id = p_announcement)
      and not exists (select 1 from public.assistance_qualified_notified q where q.announcement_id = a.id and q.farmer_id = r.farmer_id)
      and not exists (select 1 from public.assistance_records ar where ar.announcement_id = a.id and ar.farmer_id = r.farmer_id)
  loop
    if public.farmer_qualifies(rec.farmer_id, rec.assistance_type) then
      insert into public.assistance_qualified_notified (announcement_id, farmer_id) values (rec.ann_id, rec.farmer_id) on conflict do nothing;
      insert into public.notifications (recipient_id, icon, message, category)
      values (rec.farmer_id, coalesce(rec.icon, 'fa-hand-holding-dollar'),
              'You are <b>eligible</b> for <b>' || public._html(rec.assistance_type) || ':</b> ' || public._html(rec.title)
                || ', posted by <b>' || public._actor_label(rec.posted_by) || '</b>. Open My Eligibility to apply.',
              'assistance');
      n := n + 1;
    end if;
  end loop;
  return n;
end;
$$;
revoke execute on function public.notify_qualified_farmers(uuid, uuid) from public, anon, authenticated;

create or replace function public.notify_on_assistance_announcement() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  n integer;
begin
  insert into public.assistance_announcement_recipients (announcement_id, farmer_id)
  select new.id, r from public.assistance_recipient_ids(new.audience, new.target_crops) r
  on conflict do nothing;

  perform public.notify_qualified_farmers(null, new.id);

  insert into public.notifications (recipient_id, icon, message, category)
  select rc.farmer_id, coalesce(new.icon, 'fa-hand-holding-dollar'),
         '<b>' || public._actor_label(coalesce(new.posted_by, auth.uid())) || '</b> posted new assistance — <b>'
              || public._html(new.assistance_type) || ':</b> ' || public._html(new.title)
              || '. Open My Eligibility to see what you still need to qualify.',
         'assistance'
  from public.assistance_announcement_recipients rc
  where rc.announcement_id = new.id
    and not exists (select 1 from public.assistance_qualified_notified q where q.announcement_id = new.id and q.farmer_id = rc.farmer_id);

  select count(*) into n from public.assistance_announcement_recipients where announcement_id = new.id;
  update public.assistance_announcements set recipient_count = n where id = new.id;
  return new;
end;
$$;

-- ---- 3) crop verified / rejected ---------------------------------------------------------------
create or replace function public.notify_farmer_crop_result() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  crop text := public._html(new.crop_name);
  who  text := public._actor_label(auth.uid());
begin
  if new.status is not distinct from old.status then return new; end if;
  if new.status = 'Verified' then
    insert into public.notifications (recipient_id, icon, message, category)
    values (new.farmer_id, 'fa-circle-check', '<b>' || who || '</b> <b>verified</b> your registered crop <b>' || crop || '</b>.', 'crop');
  elsif new.status = 'Rejected' then
    insert into public.notifications (recipient_id, icon, message, category)
    values (new.farmer_id, 'fa-circle-xmark',
            '<b>' || who || '</b> <b>rejected</b> your registered crop <b>' || crop || '</b>.'
              || coalesce(' Reason: ' || public._html(nullif(trim(new.remarks), '')), ''),
            'crop');
  end if;
  return new;
end;
$$;

-- ---- 4) meetings (Admin or Association President) -----------------------------------------------
create or replace function public.notify_on_new_meeting() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  aname text; msg text;
begin
  select name into aname from public.associations where id = new.association_id;
  msg := '<b>' || public._actor_label(coalesce(new.created_by, auth.uid())) || '</b> scheduled a meeting — <b>'
      || public._html(new.meeting_type) || ':</b> ' || public._html(new.title)
      || ' — ' || to_char(new.meeting_date, 'Mon DD, YYYY') || ' at ' || public._html(new.location)
      || ' (' || coalesce(aname, 'all associations') || ').';
  insert into public.notifications (recipient_id, icon, message, category)
  select f.id, 'fa-people-roof', msg, 'announcement'
  from public.farmers f
  where f.is_association_member and (new.association_id is null or f.association_id = new.association_id);
  return new;
end;
$$;
