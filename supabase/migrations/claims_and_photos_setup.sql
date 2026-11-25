-- ============================================================================
-- ONE-FILE SETUP: crop insurance claims + photo evidence.
-- Paste this whole file into Supabase > SQL Editor and press Run (once).
-- It runs insurance_claims.sql first, then insurance_claim_photos.sql. Safe to run again.
-- ============================================================================

-- ============================================================================
-- MIGRATION — Crop insurance CLAIM applications (farmer files, ADMIN decides).
--
-- A calamity usually damages only PART of a farm, so a claim is paid only for the damaged part:
--     damage %          = damaged area / insured area
--     value of damage   = estimated crop value x damage %
--     insurance paid    = value of damage x coverage rate (80%)
-- The farmer files the claim with the damaged area; the ADMIN inspects, confirms the damage %,
-- and approves or rejects it. Approving marks the policy as Claimed.
-- Safe to run more than once.
-- ============================================================================
create table if not exists public.insurance_claims (
  id                      uuid primary key default gen_random_uuid(),
  insurance_id            uuid not null references public.insurance_registrations(id) on delete cascade,
  farmer_id               uuid not null references public.farmers(id) on delete cascade,
  crop_name               text not null,
  insured_area            numeric(10,2) not null,
  cause                   text not null check (cause in ('Typhoon','Flood','Drought','Pest infestation','Plant disease','Landslide / earthquake','Other')),
  cause_other             text,
  calamity_date           date not null,
  damaged_area            numeric(10,2) not null check (damaged_area > 0),
  damage_percentage       numeric(5,2) not null default 0,
  description             text,
  estimated_amount        numeric(12,2),            -- the farmer's estimate when the claim was filed
  computation             jsonb,                    -- price, yield basis, crop value ... shown on the printed form
  status                  text not null default 'Pending' check (status in ('Pending','Approved','Rejected')),
  final_damage_percentage numeric(5,2),             -- confirmed by the ADMIN after inspection
  final_amount            numeric(12,2),
  admin_remarks           text,
  reviewed_by             uuid references public.profiles(id) on delete set null,
  reviewed_at             timestamptz,
  created_at              timestamptz not null default now()
);
create index if not exists idx_ins_claims_farmer on public.insurance_claims (farmer_id, created_at desc);
create index if not exists idx_ins_claims_policy on public.insurance_claims (insurance_id);

alter table public.insurance_claims enable row level security;
drop policy if exists "ins_claim_select" on public.insurance_claims;
create policy "ins_claim_select" on public.insurance_claims for select
  using (farmer_id = auth.uid() or public.is_staff());
drop policy if exists "ins_claim_insert" on public.insurance_claims;
create policy "ins_claim_insert" on public.insurance_claims for insert
  with check (farmer_id = auth.uid());
-- no update / delete policy on purpose: only decide_insurance_claim() below can change a claim.

-- The server checks every claim, whatever the browser sends.
create or replace function public.guard_insurance_claim() returns trigger
language plpgsql security definer set search_path = public as $$
declare pol public.insurance_registrations%rowtype;
begin
  select * into pol from public.insurance_registrations where id = new.insurance_id;
  if not found or pol.farmer_id <> new.farmer_id then
    raise exception 'That insurance policy was not found.';
  end if;
  if pol.status in ('Claimed', 'Cancelled') then
    raise exception 'This policy is already % and cannot be claimed.', lower(pol.status);
  end if;
  if new.calamity_date > current_date then
    raise exception 'The date of the calamity cannot be in the future.';
  end if;
  if pol.coverage_start_date is not null and new.calamity_date < pol.coverage_start_date then
    raise exception 'The damage happened before the coverage started, so it is not covered.';
  end if;
  if pol.coverage_end_date is not null and new.calamity_date > pol.coverage_end_date then
    raise exception 'The damage happened after the coverage ended, so it is not covered.';
  end if;
  if new.damaged_area > pol.area then
    raise exception 'The damaged area cannot be larger than the insured area (% ha).', pol.area;
  end if;
  if exists (select 1 from public.insurance_claims c where c.insurance_id = new.insurance_id and c.status = 'Pending') then
    raise exception 'You already have a claim waiting for review for this policy.';
  end if;
  -- these are decided by the server, not the browser
  new.crop_name := pol.crop_name;
  new.insured_area := pol.area;
  new.damage_percentage := round(new.damaged_area / pol.area * 100, 2);
  new.status := 'Pending';
  new.final_damage_percentage := null; new.final_amount := null; new.admin_remarks := null;
  new.reviewed_by := null; new.reviewed_at := null;
  return new;
end;
$$;
drop trigger if exists trg_guard_insurance_claim on public.insurance_claims;
create trigger trg_guard_insurance_claim before insert on public.insurance_claims
  for each row execute function public.guard_insurance_claim();

-- Tell every ADMIN when a farmer files a claim.
create or replace function public.notify_admin_insurance_claim() returns trigger
language plpgsql security definer set search_path = public as $$
declare who text;
begin
  select coalesce(p.full_name, 'A farmer') into who from public.profiles p where p.id = new.farmer_id;
  insert into public.notifications (recipient_id, icon, message, category)
  select a.id, 'fa-file-invoice-dollar',
         '<b>' || replace(replace(replace(who, '&', '&amp;'), '<', '&lt;'), '>', '&gt;') || '</b> filed a crop insurance claim for <b>'
              || replace(replace(replace(new.crop_name, '&', '&amp;'), '<', '&lt;'), '>', '&gt;') || '</b>.',
         'insurance'
  from public.profiles a where a.role = 'admin';
  return new;
end;
$$;
drop trigger if exists trg_notify_admin_insurance_claim on public.insurance_claims;
create trigger trg_notify_admin_insurance_claim after insert on public.insurance_claims
  for each row execute function public.notify_admin_insurance_claim();

-- The ADMIN approves (with the confirmed damage) or rejects (with a reason). Approving marks the policy Claimed.
create or replace function public.decide_insurance_claim(
  p_claim uuid, p_approve boolean, p_damage_pct numeric, p_damage_value numeric, p_amount numeric, p_remarks text
) returns void
language plpgsql security definer set search_path = public as $$
declare
  c public.insurance_claims%rowtype;
  msg text;
  crop_safe text;
begin
  if public.current_role() is distinct from 'admin' then
    raise exception 'Only the ADMIN can decide a claim.';
  end if;
  select * into c from public.insurance_claims where id = p_claim for update;
  if not found then raise exception 'Claim not found.'; end if;
  if c.status <> 'Pending' then raise exception 'This claim was already decided.'; end if;
  crop_safe := replace(replace(replace(c.crop_name, '&', '&amp;'), '<', '&lt;'), '>', '&gt;');

  if p_approve then
    if p_damage_pct is null or p_damage_pct <= 0 or p_damage_pct > 100 then
      raise exception 'Enter the confirmed damage, from 1 to 100 percent.';
    end if;
    update public.insurance_claims
       set status = 'Approved', final_damage_percentage = p_damage_pct, final_amount = p_amount,
           admin_remarks = nullif(trim(coalesce(p_remarks, '')), ''), reviewed_by = auth.uid(), reviewed_at = now()
     where id = p_claim;
    update public.insurance_registrations
       set status = 'Claimed', estimated_damage_percentage = p_damage_pct, estimated_damage_amount = p_damage_value,
           estimated_insurance_amount = p_amount, claim_date = c.created_at::date
     where id = c.insurance_id;
    msg := 'Your crop insurance claim for <b>' || crop_safe || '</b> was <b>approved</b>. Estimated assistance: <b>PHP '
           || to_char(coalesce(p_amount, 0), 'FM999,999,990.00') || '</b> for ' || p_damage_pct || '% confirmed damage.';
  else
    if nullif(trim(coalesce(p_remarks, '')), '') is null then
      raise exception 'Please give the reason for rejecting this claim.';
    end if;
    update public.insurance_claims
       set status = 'Rejected', admin_remarks = trim(p_remarks), reviewed_by = auth.uid(), reviewed_at = now()
     where id = p_claim;
    msg := 'Your crop insurance claim for <b>' || crop_safe || '</b> was <b>not approved</b>. Reason: '
           || replace(replace(replace(trim(p_remarks), '&', '&amp;'), '<', '&lt;'), '>', '&gt;');
  end if;

  insert into public.notifications (recipient_id, icon, message, category)
  values (c.farmer_id, case when p_approve then 'fa-circle-check' else 'fa-circle-xmark' end, msg, 'insurance');
end;
$$;
revoke all on function public.decide_insurance_claim(uuid, boolean, numeric, numeric, numeric, text) from public;
grant execute on function public.decide_insurance_claim(uuid, boolean, numeric, numeric, numeric, text) to authenticated;


-- ============================================================================
-- MIGRATION — Photo evidence for crop insurance claims.
-- Run AFTER insurance_claims.sql. Safe to run more than once.
--
-- * Photos live in a PRIVATE storage bucket (claim-evidence); only the farmer who owns the claim
--   and the staff can open them.
-- * Each photo has a metadata row: when it was taken, where (GPS), the camera, the file size,
--   a fingerprint (SHA-256) and the upload time (set by the SERVER, not the browser).
-- * A claim cannot be APPROVED without at least one photo.
-- ============================================================================

-- 1) private bucket (photos are shrunk by the app before upload; 3 MB limit is a safety net)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('claim-evidence', 'claim-evidence', false, 3145728, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = false, file_size_limit = 3145728, allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

-- 2) who can upload / open / remove the files (folder layout: <farmer id>/<claim id>/<file>)
drop policy if exists "claim_evidence_insert" on storage.objects;
create policy "claim_evidence_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'claim-evidence' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "claim_evidence_select" on storage.objects;
create policy "claim_evidence_select" on storage.objects for select to authenticated
  using (bucket_id = 'claim-evidence' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_staff()));

-- a farmer can only clean up files of a claim that was never filed; filed evidence cannot be deleted
drop policy if exists "claim_evidence_delete" on storage.objects;
create policy "claim_evidence_delete" on storage.objects for delete to authenticated
  using (
    bucket_id = 'claim-evidence'
    and (storage.foldername(name))[1] = auth.uid()::text
    and not exists (select 1 from public.insurance_claims c where c.id::text = (storage.foldername(name))[2])
  );

-- 3) metadata of every photo
create table if not exists public.insurance_claim_photos (
  id            uuid primary key default gen_random_uuid(),
  claim_id      uuid not null references public.insurance_claims(id) on delete cascade,
  farmer_id     uuid not null references public.farmers(id) on delete cascade,
  storage_path  text not null,
  original_name text,
  mime_type     text,
  file_size     integer,
  width         integer,
  height        integer,
  sha256        text,
  taken_at      timestamp,            -- date/time stored inside the photo itself (EXIF), no time zone
  latitude      numeric(9,6),         -- GPS stored inside the photo (EXIF)
  longitude     numeric(9,6),
  camera        text,
  created_at    timestamptz not null default now()   -- upload time, forced by the server below
);
create index if not exists idx_claim_photos_claim on public.insurance_claim_photos (claim_id);

alter table public.insurance_claim_photos enable row level security;
drop policy if exists "claim_photo_select" on public.insurance_claim_photos;
create policy "claim_photo_select" on public.insurance_claim_photos for select
  using (farmer_id = auth.uid() or public.is_staff());
drop policy if exists "claim_photo_insert" on public.insurance_claim_photos;
create policy "claim_photo_insert" on public.insurance_claim_photos for insert
  with check (
    farmer_id = auth.uid()
    and exists (select 1 from public.insurance_claims c where c.id = claim_id and c.farmer_id = auth.uid() and c.status = 'Pending')
  );
-- no update / delete policy: evidence cannot be edited or removed from the app.

create or replace function public.guard_claim_photo() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.insurance_claim_photos where claim_id = new.claim_id) >= 5 then
    raise exception 'A claim can have at most 5 photos.';
  end if;
  if new.storage_path not like new.farmer_id::text || '/' || new.claim_id::text || '/%' then
    raise exception 'The photo file does not belong to this claim.';
  end if;
  new.created_at := now();              -- the upload time comes from the server
  return new;
end;
$$;
drop trigger if exists trg_guard_claim_photo on public.insurance_claim_photos;
create trigger trg_guard_claim_photo before insert on public.insurance_claim_photos
  for each row execute function public.guard_claim_photo();

-- 4) approving a claim now needs photo evidence (same function as before + one check)
create or replace function public.decide_insurance_claim(
  p_claim uuid, p_approve boolean, p_damage_pct numeric, p_damage_value numeric, p_amount numeric, p_remarks text
) returns void
language plpgsql security definer set search_path = public as $$
declare
  c public.insurance_claims%rowtype;
  msg text;
  crop_safe text;
begin
  if public.current_role() is distinct from 'admin' then
    raise exception 'Only the ADMIN can decide a claim.';
  end if;
  select * into c from public.insurance_claims where id = p_claim for update;
  if not found then raise exception 'Claim not found.'; end if;
  if c.status <> 'Pending' then raise exception 'This claim was already decided.'; end if;
  crop_safe := replace(replace(replace(c.crop_name, '&', '&amp;'), '<', '&lt;'), '>', '&gt;');

  if p_approve then
    if not exists (select 1 from public.insurance_claim_photos where claim_id = p_claim) then
      raise exception 'This claim has no photo evidence, so it cannot be approved.';
    end if;
    if p_damage_pct is null or p_damage_pct <= 0 or p_damage_pct > 100 then
      raise exception 'Enter the confirmed damage, from 1 to 100 percent.';
    end if;
    update public.insurance_claims
       set status = 'Approved', final_damage_percentage = p_damage_pct, final_amount = p_amount,
           admin_remarks = nullif(trim(coalesce(p_remarks, '')), ''), reviewed_by = auth.uid(), reviewed_at = now()
     where id = p_claim;
    update public.insurance_registrations
       set status = 'Claimed', estimated_damage_percentage = p_damage_pct, estimated_damage_amount = p_damage_value,
           estimated_insurance_amount = p_amount, claim_date = c.created_at::date
     where id = c.insurance_id;
    msg := 'Your crop insurance claim for <b>' || crop_safe || '</b> was <b>approved</b>. Estimated assistance: <b>PHP '
           || to_char(coalesce(p_amount, 0), 'FM999,999,990.00') || '</b> for ' || p_damage_pct || '% confirmed damage.';
  else
    if nullif(trim(coalesce(p_remarks, '')), '') is null then
      raise exception 'Please give the reason for rejecting this claim.';
    end if;
    update public.insurance_claims
       set status = 'Rejected', admin_remarks = trim(p_remarks), reviewed_by = auth.uid(), reviewed_at = now()
     where id = p_claim;
    msg := 'Your crop insurance claim for <b>' || crop_safe || '</b> was <b>not approved</b>. Reason: '
           || replace(replace(replace(trim(p_remarks), '&', '&amp;'), '<', '&lt;'), '>', '&gt;');
  end if;

  insert into public.notifications (recipient_id, icon, message, category)
  values (c.farmer_id, case when p_approve then 'fa-circle-check' else 'fa-circle-xmark' end, msg, 'insurance');
end;
$$;
revoke all on function public.decide_insurance_claim(uuid, boolean, numeric, numeric, numeric, text) from public;
grant execute on function public.decide_insurance_claim(uuid, boolean, numeric, numeric, numeric, text) to authenticated;
