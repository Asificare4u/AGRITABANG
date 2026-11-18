-- ============================================================================
-- AgriTabang — 92 PRACTICE FARMER ACCOUNTS  (practice / testing data only)
--
-- Run in the Supabase SQL editor (it runs as postgres, so it may create auth users).
-- * Names are "Farmer 1" ... "Farmer 92". Login = email + password (see the Excel file).
-- * Every account gets: profile, farmer record (age via date of birth), 1 crop registration
--   (status Verified by the admin account) and 1 yield report (Verified by the admin account).
-- * Crop and yield numbers are SAMPLE values, NOT real production. The yield season is labelled
--   "PRACTICE ... (sample data)" and the crop remarks say PRACTICE DATA.
-- * Existing accounts are NEVER overwritten: an email that already exists is skipped.
-- * Safe to run twice (the second run skips everything and creates nothing).
-- ============================================================================
begin;

-- the crop guard forces every inserted crop to 'Pending'; switch it off only for this script
alter table public.crop_registrations disable trigger trg_guard_crop_verification;

do $$
declare
  admin_id uuid; assoc_id uuid; fid uuid; rec record;
  made int := 0; skipped int := 0;
begin
  select id into admin_id from public.profiles where role = 'admin' order by created_at limit 1;
  select id into assoc_id from public.associations where name = 'LARFA';
  if admin_id is null then raise notice 'No admin profile found - crops/yields will be Verified without a verifier id.'; end if;

  for rec in
    select * from (values
  (1, 'Farmer 1', 'farmer1@agritabang.ph', 'Prac-dfzMQVc7', 58, date '1968-11-10', '0900-000-0001', 'Purok 1', 'Corn', 3.0, date '2026-01-28', date '2026-05-18', 11495, true),
  (2, 'Farmer 2', 'farmer2@agritabang.ph', 'Prac-cQuN9dZT', 42, date '1984-11-03', '0900-000-0002', 'Purok 2', 'Corn', 3.0, date '2026-03-04', date '2026-06-22', 9760, true),
  (3, 'Farmer 3', 'farmer3@agritabang.ph', 'Prac-UDQwkGMV', 37, date '1989-10-27', '0900-000-0003', 'Purok 3', 'Corn', 0.75, date '2026-01-16', date '2026-05-06', 2670, false),
  (4, 'Farmer 4', 'farmer4@agritabang.ph', 'Prac-Hy5gZnTj', 61, date '1965-10-20', '0900-000-0004', 'Purok 4', 'Rice', 1.5, date '2026-01-20', date '2026-05-20', 6480, true),
  (5, 'Farmer 5', 'farmer5@agritabang.ph', 'Prac-HUtAf475', 47, date '1979-10-14', '0900-000-0005', 'Purok 5', 'Corn', 1.25, date '2026-03-12', date '2026-06-30', 4930, true),
  (6, 'Farmer 6', 'farmer6@agritabang.ph', 'Prac-zq7BQGR3', 72, date '1954-10-06', '0900-000-0006', 'Purok 6', 'Corn', 2.0, date '2026-03-03', date '2026-06-21', 6515, false),
  (7, 'Farmer 7', 'farmer7@agritabang.ph', 'Prac-NJSecEgE', 53, date '1973-09-29', '0900-000-0007', 'Purok 7', 'Cassava', 1.5, date '2026-03-08', date '2026-11-10', 18680, true),
  (8, 'Farmer 8', 'farmer8@agritabang.ph', 'Prac-buhhaH9p', 36, date '1990-09-22', '0900-000-0008', 'Purok 1', 'Sweet Potato (Camote)', 3.0, date '2026-02-07', date '2026-05-18', 26875, true),
  (9, 'Farmer 9', 'farmer9@agritabang.ph', 'Prac-4pggMb6v', 45, date '1981-09-15', '0900-000-0009', 'Purok 2', 'Rice', 2.5, date '2026-02-22', date '2026-06-22', 7170, false),
  (10, 'Farmer 10', 'farmer10@agritabang.ph', 'Prac-HaPfPp4Q', 53, date '1973-09-08', '0900-000-0010', 'Purok 3', 'Sweet Potato (Camote)', 1.5, date '2026-01-20', date '2026-04-30', 13270, true),
  (11, 'Farmer 11', 'farmer11@agritabang.ph', 'Prac-acacxdJU', 20, date '2006-09-01', '0900-000-0011', 'Purok 4', 'Rice', 0.5, date '2026-01-18', date '2026-05-18', 2230, true),
  (12, 'Farmer 12', 'farmer12@agritabang.ph', 'Prac-w9ryEcTP', 71, date '1955-08-26', '0900-000-0012', 'Purok 5', 'Cassava', 0.5, date '2026-03-06', date '2026-11-10', 6005, false),
  (13, 'Farmer 13', 'farmer13@agritabang.ph', 'Prac-VVyvNKCe', 51, date '1975-08-19', '0900-000-0013', 'Purok 6', 'Ampalaya', 1.25, date '2026-01-29', date '2026-04-14', 5480, true),
  (14, 'Farmer 14', 'farmer14@agritabang.ph', 'Prac-SPjPsXB4', 43, date '1983-08-12', '0900-000-0014', 'Purok 7', 'Sweet Potato (Camote)', 3.0, date '2026-03-09', date '2026-06-17', 17925, true),
  (15, 'Farmer 15', 'farmer15@agritabang.ph', 'Prac-pAtBbm8w', 68, date '1958-08-04', '0900-000-0015', 'Purok 1', 'Tomato', 2.0, date '2026-02-06', date '2026-05-07', 19960, false),
  (16, 'Farmer 16', 'farmer16@agritabang.ph', 'Prac-bbQaSsCe', 50, date '1976-07-28', '0900-000-0016', 'Purok 2', 'Rice', 1.25, date '2026-03-02', date '2026-06-30', 4410, true),
  (17, 'Farmer 17', 'farmer17@agritabang.ph', 'Prac-MrdghQ5j', 43, date '1983-07-22', '0900-000-0017', 'Purok 3', 'Rice', 0.5, date '2026-01-26', date '2026-05-26', 2105, true),
  (18, 'Farmer 18', 'farmer18@agritabang.ph', 'Prac-VgXbvv6z', 49, date '1977-07-14', '0900-000-0018', 'Purok 4', 'Eggplant (Talong)', 1.5, date '2026-02-21', date '2026-06-01', 8635, false),
  (19, 'Farmer 19', 'farmer19@agritabang.ph', 'Prac-UqREdGGw', 59, date '1967-07-08', '0900-000-0019', 'Purok 5', 'Rice', 1.25, date '2026-03-02', date '2026-06-30', 5100, true),
  (20, 'Farmer 20', 'farmer20@agritabang.ph', 'Prac-jWBRst6B', 64, date '1962-06-30', '0900-000-0020', 'Purok 6', 'Sweet Potato (Camote)', 1.5, date '2026-02-03', date '2026-05-14', 10740, true),
  (21, 'Farmer 21', 'farmer21@agritabang.ph', 'Prac-uPThuZfy', 76, date '1950-06-23', '0900-000-0021', 'Purok 7', 'Sweet Potato (Camote)', 0.5, date '2026-01-20', date '2026-04-30', 2950, false),
  (22, 'Farmer 22', 'farmer22@agritabang.ph', 'Prac-sFw5gWxs', 48, date '1978-06-16', '0900-000-0022', 'Purok 1', 'Tomato', 0.5, date '2026-01-23', date '2026-04-23', 4300, true),
  (23, 'Farmer 23', 'farmer23@agritabang.ph', 'Prac-3qMmBpR3', 56, date '1970-06-09', '0900-000-0023', 'Purok 2', 'Corn', 3.0, date '2026-01-28', date '2026-05-18', 8350, true),
  (24, 'Farmer 24', 'farmer24@agritabang.ph', 'Prac-6JvFfVCV', 52, date '1974-06-02', '0900-000-0024', 'Purok 3', 'Rice', 2.5, date '2026-02-25', date '2026-06-25', 6755, false),
  (25, 'Farmer 25', 'farmer25@agritabang.ph', 'Prac-22R7csYQ', 44, date '1982-05-26', '0900-000-0025', 'Purok 4', 'Corn', 0.75, date '2026-02-05', date '2026-05-26', 2625, true),
  (26, 'Farmer 26', 'farmer26@agritabang.ph', 'Prac-m3wV2Pwz', 42, date '1984-05-19', '0900-000-0026', 'Purok 5', 'Tomato', 2.5, date '2026-02-25', date '2026-05-26', 22960, true),
  (27, 'Farmer 27', 'farmer27@agritabang.ph', 'Prac-MtsTueYn', 60, date '1966-05-12', '0900-000-0027', 'Purok 6', 'Corn', 3.0, date '2026-02-28', date '2026-06-18', 10555, false),
  (28, 'Farmer 28', 'farmer28@agritabang.ph', 'Prac-ApY3het2', 61, date '1965-05-05', '0900-000-0028', 'Purok 7', 'Corn', 2.5, date '2026-02-12', date '2026-06-02', 8170, true),
  (29, 'Farmer 29', 'farmer29@agritabang.ph', 'Prac-9YMYBsEB', 46, date '1980-04-28', '0900-000-0029', 'Purok 1', 'Rice', 1.0, date '2026-02-17', date '2026-06-17', 3965, true),
  (30, 'Farmer 30', 'farmer30@agritabang.ph', 'Prac-UPYzmJjm', 41, date '1985-04-21', '0900-000-0030', 'Purok 2', 'Rice', 1.25, date '2026-02-25', date '2026-06-25', 3710, false),
  (31, 'Farmer 31', 'farmer31@agritabang.ph', 'Prac-nfMtqT6C', 52, date '1974-04-14', '0900-000-0031', 'Purok 3', 'Corn', 3.0, date '2026-03-08', date '2026-06-26', 9570, true),
  (32, 'Farmer 32', 'farmer32@agritabang.ph', 'Prac-cW5mRdWP', 74, date '1952-04-07', '0900-000-0032', 'Purok 4', 'Tomato', 2.5, date '2026-01-16', date '2026-04-16', 22295, true),
  (33, 'Farmer 33', 'farmer33@agritabang.ph', 'Prac-vd8KjkBE', 27, date '1999-04-01', '0900-000-0033', 'Purok 5', 'Cassava', 1.5, date '2026-02-19', date '2026-11-10', 14025, false),
  (34, 'Farmer 34', 'farmer34@agritabang.ph', 'Prac-eQgYWHCd', 75, date '1951-03-25', '0900-000-0034', 'Purok 6', 'Corn', 2.5, date '2026-02-16', date '2026-06-06', 9880, true),
  (35, 'Farmer 35', 'farmer35@agritabang.ph', 'Prac-6Ww4ExBR', 69, date '1957-03-17', '0900-000-0035', 'Purok 7', 'Sweet Potato (Camote)', 1.25, date '2026-02-24', date '2026-06-04', 11770, true),
  (36, 'Farmer 36', 'farmer36@agritabang.ph', 'Prac-Qsh9j2MM', 59, date '1967-03-11', '0900-000-0036', 'Purok 1', 'Tomato', 1.25, date '2026-03-14', date '2026-06-12', 9985, false),
  (37, 'Farmer 37', 'farmer37@agritabang.ph', 'Prac-jqYHrjV8', 51, date '1975-03-04', '0900-000-0037', 'Purok 2', 'Sweet Potato (Camote)', 0.5, date '2026-03-14', date '2026-06-22', 3605, true),
  (38, 'Farmer 38', 'farmer38@agritabang.ph', 'Prac-bFXbXYNa', 40, date '1986-02-24', '0900-000-0038', 'Purok 3', 'Corn', 1.5, date '2026-03-02', date '2026-06-20', 5935, true),
  (39, 'Farmer 39', 'farmer39@agritabang.ph', 'Prac-bByPV3hH', 63, date '1963-02-18', '0900-000-0039', 'Purok 4', 'Tomato', 1.0, date '2026-02-09', date '2026-05-10', 8110, false),
  (40, 'Farmer 40', 'farmer40@agritabang.ph', 'Prac-edgwq7qK', 44, date '1982-02-10', '0900-000-0040', 'Purok 5', 'Corn', 2.5, date '2026-02-08', date '2026-05-29', 6900, true),
  (41, 'Farmer 41', 'farmer41@agritabang.ph', 'Prac-2PZqVcFc', 46, date '1980-02-04', '0900-000-0041', 'Purok 6', 'Ampalaya', 1.25, date '2026-01-30', date '2026-04-15', 6415, true),
  (42, 'Farmer 42', 'farmer42@agritabang.ph', 'Prac-YcFPY5KZ', 29, date '1997-01-27', '0900-000-0042', 'Purok 7', 'Corn', 2.0, date '2026-02-18', date '2026-06-08', 7370, false),
  (43, 'Farmer 43', 'farmer43@agritabang.ph', 'Prac-eNdFTVmy', 65, date '1961-11-16', '0900-000-0043', 'Purok 1', 'Rice', 1.0, date '2026-02-07', date '2026-06-07', 3520, true),
  (44, 'Farmer 44', 'farmer44@agritabang.ph', 'Prac-mcvgeunv', 56, date '1970-11-09', '0900-000-0044', 'Purok 2', 'Rice', 1.0, date '2026-02-03', date '2026-06-03', 3140, true),
  (45, 'Farmer 45', 'farmer45@agritabang.ph', 'Prac-Fr2ZFYPn', 38, date '1988-11-02', '0900-000-0045', 'Purok 3', 'Rice', 0.75, date '2026-02-20', date '2026-06-20', 2610, false),
  (46, 'Farmer 46', 'farmer46@agritabang.ph', 'Prac-VcdsHFZ3', 48, date '1978-10-26', '0900-000-0046', 'Purok 4', 'Corn', 1.25, date '2026-03-07', date '2026-06-25', 3520, true),
  (47, 'Farmer 47', 'farmer47@agritabang.ph', 'Prac-WQfzKYyb', 41, date '1985-10-19', '0900-000-0047', 'Purok 5', 'Ampalaya', 2.0, date '2026-03-14', date '2026-05-28', 10520, true),
  (48, 'Farmer 48', 'farmer48@agritabang.ph', 'Prac-CwkrfwYn', 18, date '2008-10-12', '0900-000-0048', 'Purok 6', 'Rice', 1.0, date '2026-02-07', date '2026-06-07', 3520, false),
  (49, 'Farmer 49', 'farmer49@agritabang.ph', 'Prac-6SwatWfK', 43, date '1983-10-06', '0900-000-0049', 'Purok 7', 'Rice', 1.25, date '2026-02-13', date '2026-06-13', 5000, true),
  (50, 'Farmer 50', 'farmer50@agritabang.ph', 'Prac-s32rQQBD', 66, date '1960-09-28', '0900-000-0050', 'Purok 1', 'Eggplant (Talong)', 1.0, date '2026-02-15', date '2026-05-26', 6660, true),
  (51, 'Farmer 51', 'farmer51@agritabang.ph', 'Prac-ssRAsBe7', 79, date '1947-09-22', '0900-000-0051', 'Purok 2', 'Rice', 2.5, date '2026-02-13', date '2026-06-13', 6705, false),
  (52, 'Farmer 52', 'farmer52@agritabang.ph', 'Prac-qxmdFUZz', 55, date '1971-09-15', '0900-000-0052', 'Purok 3', 'Corn', 0.75, date '2026-02-11', date '2026-06-01', 2640, true),
  (53, 'Farmer 53', 'farmer53@agritabang.ph', 'Prac-JnyZRtNM', 59, date '1967-09-08', '0900-000-0053', 'Purok 4', 'Corn', 2.5, date '2026-03-13', date '2026-07-01', 7900, true),
  (54, 'Farmer 54', 'farmer54@agritabang.ph', 'Prac-UaZ8rawM', 47, date '1979-09-01', '0900-000-0054', 'Purok 5', 'Eggplant (Talong)', 2.5, date '2026-01-30', date '2026-05-10', 15275, false),
  (55, 'Farmer 55', 'farmer55@agritabang.ph', 'Prac-a2watD2U', 36, date '1990-08-24', '0900-000-0055', 'Purok 6', 'Corn', 3.0, date '2026-01-25', date '2026-05-15', 12175, true),
  (56, 'Farmer 56', 'farmer56@agritabang.ph', 'Prac-Hkp2cGfM', 34, date '1992-08-17', '0900-000-0056', 'Purok 7', 'Sweet Potato (Camote)', 3.0, date '2026-02-24', date '2026-06-04', 20485, true),
  (57, 'Farmer 57', 'farmer57@agritabang.ph', 'Prac-twbtYpt4', 50, date '1976-08-10', '0900-000-0057', 'Purok 1', 'Corn', 2.5, date '2026-02-26', date '2026-06-16', 9805, false),
  (58, 'Farmer 58', 'farmer58@agritabang.ph', 'Prac-AQrk7Kmb', 33, date '1993-08-03', '0900-000-0058', 'Purok 2', 'Tomato', 1.5, date '2026-02-06', date '2026-05-07', 12570, true),
  (59, 'Farmer 59', 'farmer59@agritabang.ph', 'Prac-Zeqbuhg5', 56, date '1970-07-27', '0900-000-0059', 'Purok 3', 'Corn', 3.0, date '2026-02-21', date '2026-06-11', 10130, true),
  (60, 'Farmer 60', 'farmer60@agritabang.ph', 'Prac-83NMkePy', 38, date '1988-07-20', '0900-000-0060', 'Purok 4', 'Corn', 1.5, date '2026-01-19', date '2026-05-09', 5655, false),
  (61, 'Farmer 61', 'farmer61@agritabang.ph', 'Prac-zYkMbtpw', 23, date '2003-07-14', '0900-000-0061', 'Purok 5', 'Cassava', 3.0, date '2026-02-26', date '2026-11-10', 41555, true),
  (62, 'Farmer 62', 'farmer62@agritabang.ph', 'Prac-PFz3xyUG', 41, date '1985-07-06', '0900-000-0062', 'Purok 6', 'Rice', 1.5, date '2026-01-16', date '2026-05-16', 6270, true),
  (63, 'Farmer 63', 'farmer63@agritabang.ph', 'Prac-mxdKK6Rd', 40, date '1986-06-29', '0900-000-0063', 'Purok 7', 'Rice', 2.0, date '2026-01-19', date '2026-05-19', 7520, false),
  (64, 'Farmer 64', 'farmer64@agritabang.ph', 'Prac-HCAqrwrg', 55, date '1971-06-23', '0900-000-0064', 'Purok 1', 'Eggplant (Talong)', 3.0, date '2026-01-18', date '2026-04-28', 20065, true),
  (65, 'Farmer 65', 'farmer65@agritabang.ph', 'Prac-v7GFzyGJ', 31, date '1995-06-16', '0900-000-0065', 'Purok 2', 'Rice', 0.5, date '2026-02-09', date '2026-06-09', 2265, true),
  (66, 'Farmer 66', 'farmer66@agritabang.ph', 'Prac-mNGXF6TT', 57, date '1969-06-08', '0900-000-0066', 'Purok 3', 'Corn', 0.5, date '2026-03-11', date '2026-06-29', 1825, false),
  (67, 'Farmer 67', 'farmer67@agritabang.ph', 'Prac-aQDH7hTD', 38, date '1988-06-01', '0900-000-0067', 'Purok 4', 'Rice', 2.0, date '2026-02-06', date '2026-06-06', 6305, true),
  (68, 'Farmer 68', 'farmer68@agritabang.ph', 'Prac-Ds9M4tPD', 37, date '1989-05-25', '0900-000-0068', 'Purok 5', 'Corn', 2.5, date '2026-03-07', date '2026-06-25', 6690, true),
  (69, 'Farmer 69', 'farmer69@agritabang.ph', 'Prac-TXV4cUj8', 65, date '1961-05-18', '0900-000-0069', 'Purok 6', 'Cassava', 1.25, date '2026-02-28', date '2026-11-10', 15315, false),
  (70, 'Farmer 70', 'farmer70@agritabang.ph', 'Prac-JF6MuFPA', 58, date '1968-05-11', '0900-000-0070', 'Purok 7', 'Corn', 1.25, date '2026-02-25', date '2026-06-15', 3535, true),
  (71, 'Farmer 71', 'farmer71@agritabang.ph', 'Prac-zRwjSV96', 54, date '1972-05-04', '0900-000-0071', 'Purok 1', 'Ampalaya', 3.0, date '2026-02-28', date '2026-05-14', 21465, true),
  (72, 'Farmer 72', 'farmer72@agritabang.ph', 'Prac-agAUfaYS', 70, date '1956-04-27', '0900-000-0072', 'Purok 2', 'Rice', 1.25, date '2026-02-16', date '2026-06-16', 3855, false),
  (73, 'Farmer 73', 'farmer73@agritabang.ph', 'Prac-rqYnZj85', 67, date '1959-04-21', '0900-000-0073', 'Purok 3', 'Ampalaya', 1.25, date '2026-03-11', date '2026-05-25', 6470, true),
  (74, 'Farmer 74', 'farmer74@agritabang.ph', 'Prac-rcgBmgmV', 39, date '1987-04-14', '0900-000-0074', 'Purok 4', 'Corn', 1.0, date '2026-01-28', date '2026-05-18', 3720, true),
  (75, 'Farmer 75', 'farmer75@agritabang.ph', 'Prac-mfvEGkva', 26, date '2000-04-06', '0900-000-0075', 'Purok 5', 'Corn', 1.0, date '2026-02-10', date '2026-05-31', 3955, false),
  (76, 'Farmer 76', 'farmer76@agritabang.ph', 'Prac-wmPrjfXB', 28, date '1998-03-30', '0900-000-0076', 'Purok 6', 'Rice', 3.0, date '2026-01-30', date '2026-05-30', 10640, true),
  (77, 'Farmer 77', 'farmer77@agritabang.ph', 'Prac-8he6XG4r', 30, date '1996-03-23', '0900-000-0077', 'Purok 7', 'Eggplant (Talong)', 3.0, date '2026-03-12', date '2026-06-20', 20035, true),
  (78, 'Farmer 78', 'farmer78@agritabang.ph', 'Prac-RBEp78W3', 49, date '1977-03-16', '0900-000-0078', 'Purok 1', 'Cassava', 1.0, date '2026-03-12', date '2026-11-10', 10615, false),
  (79, 'Farmer 79', 'farmer79@agritabang.ph', 'Prac-hywqwkt5', 63, date '1963-03-10', '0900-000-0079', 'Purok 2', 'Cassava', 2.0, date '2026-03-08', date '2026-11-10', 22595, true),
  (80, 'Farmer 80', 'farmer80@agritabang.ph', 'Prac-HxnNUuDm', 32, date '1994-03-02', '0900-000-0080', 'Purok 3', 'Rice', 1.25, date '2026-02-06', date '2026-06-06', 4240, true),
  (81, 'Farmer 81', 'farmer81@agritabang.ph', 'Prac-jwPEcUTh', 39, date '1987-02-24', '0900-000-0081', 'Purok 4', 'Rice', 1.25, date '2026-01-29', date '2026-05-29', 4955, false),
  (82, 'Farmer 82', 'farmer82@agritabang.ph', 'Prac-BdPamMjk', 57, date '1969-02-16', '0900-000-0082', 'Purok 5', 'Eggplant (Talong)', 3.0, date '2026-03-07', date '2026-06-15', 23425, true),
  (83, 'Farmer 83', 'farmer83@agritabang.ph', 'Prac-HhvuRzCj', 78, date '1948-02-10', '0900-000-0083', 'Purok 6', 'Corn', 2.5, date '2026-03-06', date '2026-06-24', 8740, true),
  (84, 'Farmer 84', 'farmer84@agritabang.ph', 'Prac-v2ktZEUA', 77, date '1949-02-02', '0900-000-0084', 'Purok 7', 'Tomato', 0.75, date '2026-01-15', date '2026-04-15', 6500, false),
  (85, 'Farmer 85', 'farmer85@agritabang.ph', 'Prac-fJpCBtQX', 36, date '1990-01-26', '0900-000-0085', 'Purok 1', 'Cassava', 1.5, date '2026-01-19', date '2026-10-16', 16170, true),
  (86, 'Farmer 86', 'farmer86@agritabang.ph', 'Prac-dFuDUHhP', 45, date '1981-11-15', '0900-000-0086', 'Purok 2', 'Cassava', 2.5, date '2026-02-04', date '2026-11-01', 34540, true),
  (87, 'Farmer 87', 'farmer87@agritabang.ph', 'Prac-yZVQG5KM', 64, date '1962-11-08', '0900-000-0087', 'Purok 3', 'Ampalaya', 0.75, date '2026-02-28', date '2026-05-14', 3215, false),
  (88, 'Farmer 88', 'farmer88@agritabang.ph', 'Prac-2TcRSDzz', 62, date '1964-11-01', '0900-000-0088', 'Purok 4', 'Sweet Potato (Camote)', 3.0, date '2026-01-29', date '2026-05-09', 21940, true),
  (89, 'Farmer 89', 'farmer89@agritabang.ph', 'Prac-YhXg8unW', 62, date '1964-10-25', '0900-000-0089', 'Purok 5', 'Corn', 1.0, date '2026-02-14', date '2026-06-04', 2705, true),
  (90, 'Farmer 90', 'farmer90@agritabang.ph', 'Prac-EsJ6kY2P', 62, date '1964-10-18', '0900-000-0090', 'Purok 6', 'Corn', 2.0, date '2026-02-17', date '2026-06-07', 5710, false),
  (91, 'Farmer 91', 'farmer91@agritabang.ph', 'Prac-Fvv3h5ye', 60, date '1966-10-11', '0900-000-0091', 'Purok 7', 'Tomato', 1.25, date '2026-02-01', date '2026-05-02', 8335, true),
  (92, 'Farmer 92', 'farmer92@agritabang.ph', 'Prac-PDMhUFnw', 54, date '1972-10-04', '0900-000-0092', 'Purok 1', 'Eggplant (Talong)', 2.0, date '2026-03-01', date '2026-06-09', 18060, true)
    ) as t(n, full_name, email, pw, age, dob, mobile, purok, crop, area, planting, harvest, kg, member)
  loop
    if exists (select 1 from auth.users where email = rec.email) then
      skipped := skipped + 1; continue;
    end if;
    fid := gen_random_uuid();

    insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, email_change, email_change_token_new, recovery_token)
    values ('00000000-0000-0000-0000-000000000000', fid, 'authenticated', 'authenticated', rec.email,
      crypt(rec.pw, gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '');

    insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    values (gen_random_uuid(), fid, fid::text, jsonb_build_object('sub', fid::text, 'email', rec.email), 'email', now(), now(), now());

    insert into public.profiles (id, role, full_name, email, contact_number)
    values (fid, 'farmer', rec.full_name, rec.email, rec.mobile);

    insert into public.farmers (id, location, farm_size, is_association_member, association_id, validated, validated_by, validated_at,
      surname, first_name, date_of_birth, mobile_number, house_no_purok, barangay, city_municipality, province, region,
      is_farmer, farm_location, commodity, commodity_size)
    values (fid, rec.purok || ', Lindaban, Manolo Fortich, Bukidnon', rec.area, rec.member, case when rec.member then assoc_id end, true, admin_id, now(),
      'Farmer', rec.n::text, rec.dob, rec.mobile, rec.purok, 'Lindaban', 'Manolo Fortich', 'Bukidnon', 'Region X (Northern Mindanao)',
      true, 'Lindaban, Manolo Fortich, Bukidnon', rec.crop, rec.area);

    insert into public.farmer_crops (farmer_id, crop_name) values (fid, rec.crop);

    insert into public.crop_registrations (farmer_id, crop_name, area, planting_date, variety, land_category, tenurial_status,
      status, verified_by, verified_at, remarks)
    values (fid, rec.crop, rec.area, rec.planting, 'Practice sample', 'Upland', 'Registered Owner',
      'Verified', admin_id, now(), 'PRACTICE DATA - sample crop for testing only');

    insert into public.yield_records (farmer_id, crop_name, season, quantity, unit, harvest_date, status, verified_by)
    values (fid, rec.crop, 'PRACTICE Season 2026 (sample data)', rec.kg, 'kg', rec.harvest, 'Verified', admin_id);

    made := made + 1;
  end loop;
  raise notice 'Practice farmers created: %, skipped (already existed): %', made, skipped;
end $$;

alter table public.crop_registrations enable trigger trg_guard_crop_verification;
commit;
