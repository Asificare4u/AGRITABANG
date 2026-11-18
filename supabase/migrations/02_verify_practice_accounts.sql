-- Run AFTER 01_create_practice_farmers.sql. Every row should say OK; the last line is the total.
select
  p.full_name,
  p.email,
  extract(year from age(date '2026-11-17', f.date_of_birth))::int            as age,
  (select count(*) from public.crop_registrations c where c.farmer_id = f.id and c.status = 'Verified') as verified_crops,
  (select count(*) from public.yield_records y where y.farmer_id = f.id and y.status = 'Verified')      as verified_yields,
  (u.encrypted_password is not null and u.email_confirmed_at is not null)    as can_sign_in,
  case when (select count(*) from public.crop_registrations c where c.farmer_id = f.id) >= 1
        and (select count(*) from public.yield_records y where y.farmer_id = f.id) >= 1
        and u.encrypted_password is not null and u.email_confirmed_at is not null
       then 'OK' else 'INCOMPLETE' end                                         as status
from public.profiles p
join public.farmers f on f.id = p.id
join auth.users u on u.id = p.id
where p.email ~ '^farmer[0-9]+@agritabang\.ph$'
order by split_part(split_part(p.email, 'farmer', 2), '@', 1)::int;

-- totals
select count(*) as practice_accounts,
       count(*) filter (where exists (select 1 from public.crop_registrations c where c.farmer_id = f.id)) as with_crop,
       count(*) filter (where exists (select 1 from public.yield_records y where y.farmer_id = f.id)) as with_yield
from public.profiles p join public.farmers f on f.id = p.id
where p.email ~ '^farmer[0-9]+@agritabang\.ph$';
