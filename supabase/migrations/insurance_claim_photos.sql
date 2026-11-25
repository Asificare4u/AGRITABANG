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
