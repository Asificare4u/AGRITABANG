-- ============================================================================
-- MIGRATION — Wording: "yield" is now called "harvest" in the messages the database writes.
-- (Only the text changes. Table names, columns and logic stay exactly the same.)
-- Run once in Supabase > SQL Editor. Safe to run again.
-- Notifications that were already sent keep their old wording.
-- ============================================================================

create or replace function public.guard_yield_record() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  r public.app_role := public.current_role();
  details_changed boolean;
begin
  if tg_op = 'INSERT' then
    if r is distinct from 'admin' then
      if not public.farmer_has_registered_crop(new.farmer_id, new.crop_name) then
        raise exception 'You need to register this crop first (Crop Registration) before you can report its harvest.';
      end if;
      new.status := 'Pending'; new.verified_by := null;      -- always starts pending
    end if;
    return new;
  end if;

  -- UPDATE
  if r = 'admin' then return new; end if;                       -- the admin verifies / rejects / corrects

  details_changed := (new.crop_name, new.season, new.quantity, new.unit, new.unit_other, new.kg_per_unit, new.harvest_date)
                     is distinct from
                     (old.crop_name, old.season, old.quantity, old.unit, old.unit_other, old.kg_per_unit, old.harvest_date);
  if details_changed then
    if lower(trim(new.crop_name)) is distinct from lower(trim(old.crop_name))
       and not public.farmer_has_registered_crop(new.farmer_id, new.crop_name) then
      raise exception 'You need to register this crop first (Crop Registration) before you can report its harvest.';
    end if;
    new.status := 'Pending'; new.verified_by := null;           -- corrected numbers are verified again
  else
    new.status := old.status; new.verified_by := old.verified_by; -- a farmer can't verify his/her own report
  end if;
  return new;
end;
$$;

create or replace function public.notify_admin_yield() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  who text; edited boolean; msg text;
begin
  if public.current_role() = 'admin' then return new; end if;
  edited := tg_op = 'UPDATE';
  if edited and (new.crop_name, new.season, new.quantity, new.unit, new.harvest_date)
                is not distinct from (old.crop_name, old.season, old.quantity, old.unit, old.harvest_date) then
    return new;                                                  -- nothing about the report changed
  end if;
  select coalesce(p.full_name, 'A farmer') into who from public.profiles p where p.id = new.farmer_id;
  msg := '<b>' || replace(replace(replace(who, '&', '&amp;'), '<', '&lt;'), '>', '&gt;') || '</b> '
      || case when edited then 'edited a harvest report' else 'reported a harvest' end
      || ' (<b>' || replace(replace(replace(new.crop_name, '&', '&amp;'), '<', '&lt;'), '>', '&gt;') || '</b>, '
      || replace(replace(replace(new.season, '&', '&amp;'), '<', '&lt;'), '>', '&gt;') || '). Waiting for your verification.';
  insert into public.notifications (recipient_id, icon, message, category)
  select a.id, 'fa-wheat-awn', msg, 'yield'
  from public.profiles a
  where a.role = 'admin'
    and not exists (select 1 from public.notifications n where n.recipient_id = a.id and n.message = msg and n.read = false);
  return new;
end;
$$;
