-- Task 8: seed Turkish public holidays for 2026-2027 — the calendar
-- business-days.ts / PublicHolidayService need to compute the 5-business-
-- day payout due date correctly across a bayram.
--
-- Fixed-date national holidays are exact. The three movable religious
-- holidays (Ramazan Bayramı, Kurban Bayramı) are the Diyanet's PROJECTED
-- Hijri-calendar dates for 2026/2027 as publicly announced ahead of time —
-- standard practice for a business-day calendar this far out, but, per
-- convention, subject to a one-day shift on official moon-sighting
-- confirmation close to the date; re-verify and correct via a follow-up
-- migration if that happens. Each bayram's half-day "arife" (eve) is
-- deliberately NOT included as a full holiday (the morning is a working
-- half-day) — only the full non-working days are, matching how Oct 28's
-- half-day Cumhuriyet Bayramı eve is likewise excluded below.
--
-- ON CONFLICT DO NOTHING makes `up` idempotent (re-running it after a
-- partial apply, or alongside a manually-seeded row, is a no-op for
-- whichever dates already exist). `down` deletes EXACTLY these 27 dates,
-- by value — never a table-wide DELETE — so any OTHER holiday an admin
-- seeds later is left untouched.

INSERT INTO "public_holidays" ("id", "date", "name", "updatedAt") VALUES
  ('seed_holiday_2026_01_01', '2026-01-01', 'Yılbaşı', CURRENT_TIMESTAMP),
  ('seed_holiday_2026_03_20', '2026-03-20', 'Ramazan Bayramı (1. gün)', CURRENT_TIMESTAMP),
  ('seed_holiday_2026_03_21', '2026-03-21', 'Ramazan Bayramı (2. gün)', CURRENT_TIMESTAMP),
  ('seed_holiday_2026_03_22', '2026-03-22', 'Ramazan Bayramı (3. gün)', CURRENT_TIMESTAMP),
  ('seed_holiday_2026_04_23', '2026-04-23', 'Ulusal Egemenlik ve Çocuk Bayramı', CURRENT_TIMESTAMP),
  ('seed_holiday_2026_05_01', '2026-05-01', 'Emek ve Dayanışma Günü', CURRENT_TIMESTAMP),
  ('seed_holiday_2026_05_19', '2026-05-19', 'Atatürk''ü Anma, Gençlik ve Spor Bayramı', CURRENT_TIMESTAMP),
  ('seed_holiday_2026_05_27', '2026-05-27', 'Kurban Bayramı (1. gün)', CURRENT_TIMESTAMP),
  ('seed_holiday_2026_05_28', '2026-05-28', 'Kurban Bayramı (2. gün)', CURRENT_TIMESTAMP),
  ('seed_holiday_2026_05_29', '2026-05-29', 'Kurban Bayramı (3. gün)', CURRENT_TIMESTAMP),
  ('seed_holiday_2026_05_30', '2026-05-30', 'Kurban Bayramı (4. gün)', CURRENT_TIMESTAMP),
  ('seed_holiday_2026_07_15', '2026-07-15', 'Demokrasi ve Milli Birlik Günü', CURRENT_TIMESTAMP),
  ('seed_holiday_2026_08_30', '2026-08-30', 'Zafer Bayramı', CURRENT_TIMESTAMP),
  ('seed_holiday_2026_10_29', '2026-10-29', 'Cumhuriyet Bayramı', CURRENT_TIMESTAMP),
  ('seed_holiday_2027_01_01', '2027-01-01', 'Yılbaşı', CURRENT_TIMESTAMP),
  ('seed_holiday_2027_03_09', '2027-03-09', 'Ramazan Bayramı (1. gün)', CURRENT_TIMESTAMP),
  ('seed_holiday_2027_03_10', '2027-03-10', 'Ramazan Bayramı (2. gün)', CURRENT_TIMESTAMP),
  ('seed_holiday_2027_03_11', '2027-03-11', 'Ramazan Bayramı (3. gün)', CURRENT_TIMESTAMP),
  ('seed_holiday_2027_04_23', '2027-04-23', 'Ulusal Egemenlik ve Çocuk Bayramı', CURRENT_TIMESTAMP),
  ('seed_holiday_2027_05_01', '2027-05-01', 'Emek ve Dayanışma Günü', CURRENT_TIMESTAMP),
  ('seed_holiday_2027_05_16', '2027-05-16', 'Kurban Bayramı (1. gün)', CURRENT_TIMESTAMP),
  ('seed_holiday_2027_05_17', '2027-05-17', 'Kurban Bayramı (2. gün)', CURRENT_TIMESTAMP),
  ('seed_holiday_2027_05_18', '2027-05-18', 'Kurban Bayramı (3. gün)', CURRENT_TIMESTAMP),
  ('seed_holiday_2027_05_19', '2027-05-19', 'Kurban Bayramı (4. gün) / Atatürk''ü Anma, Gençlik ve Spor Bayramı', CURRENT_TIMESTAMP),
  ('seed_holiday_2027_07_15', '2027-07-15', 'Demokrasi ve Milli Birlik Günü', CURRENT_TIMESTAMP),
  ('seed_holiday_2027_08_30', '2027-08-30', 'Zafer Bayramı', CURRENT_TIMESTAMP),
  ('seed_holiday_2027_10_29', '2027-10-29', 'Cumhuriyet Bayramı', CURRENT_TIMESTAMP)
ON CONFLICT ("date") DO NOTHING;
