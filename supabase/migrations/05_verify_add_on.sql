-- Run AFTER 04. Shows what the add-on created (one row).
select
  (select count(*) from public.farmers f join public.profiles p on p.id = f.id
     where p.email ~ '^farmer[0-9]+@agritabang\.ph$' and f.photo_url is not null)                       as with_photo,
  (select count(*) from public.farmers f join public.profiles p on p.id = f.id join public.associations a on a.id = f.association_id
     where p.email ~ '^farmer[0-9]+@agritabang\.ph$' and a.name = 'LARFA')                              as in_larfa,
  (select count(*) from public.farmers f join public.profiles p on p.id = f.id join public.associations a on a.id = f.association_id
     where p.email ~ '^farmer[0-9]+@agritabang\.ph$' and a.name = 'LIFA')                               as in_lifa,
  (select count(*) from public.insurance_registrations i join public.profiles p on p.id = i.farmer_id
     where p.email ~ '^farmer[0-9]+@agritabang\.ph$' and i.registration_type = 'New Registration')      as insurance_new,
  (select count(*) from public.insurance_registrations i join public.profiles p on p.id = i.farmer_id
     where p.email ~ '^farmer[0-9]+@agritabang\.ph$' and i.registration_type = 'Renewal')               as insurance_renewal,
  (select recipient_count from public.assistance_announcements where title = '₱5,000 Cash Assistance for Corn and Cassava Farmers' limit 1)        as announcement_recipients,
  (select count(*) from public.assistance_records r join public.assistance_announcements a on a.id = r.announcement_id
     where a.title = '₱5,000 Cash Assistance for Corn and Cassava Farmers' and r.status = 'Pending')                                                as pending_applications;
-- expected: with_photo 92 · in_larfa 38 · in_lifa 27 · insurance_new 31 (16 + 15 renewal first-year policies) · insurance_renewal 15 · applications 5
