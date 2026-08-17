-- Down migration for 20260814193500_seed_public_holidays_2026_2027.
--
-- Deletes exactly the 27 rows `up` inserted, by their fixed ids — never a
-- table-wide DELETE, so any holiday an admin adds by hand later (or a
-- future migration seeding 2028+) is left untouched. Idempotent: re-
-- running this after the rows are already gone is a clean no-op.

DELETE FROM "public_holidays" WHERE "id" IN (
  'seed_holiday_2026_01_01',
  'seed_holiday_2026_03_20',
  'seed_holiday_2026_03_21',
  'seed_holiday_2026_03_22',
  'seed_holiday_2026_04_23',
  'seed_holiday_2026_05_01',
  'seed_holiday_2026_05_19',
  'seed_holiday_2026_05_27',
  'seed_holiday_2026_05_28',
  'seed_holiday_2026_05_29',
  'seed_holiday_2026_05_30',
  'seed_holiday_2026_07_15',
  'seed_holiday_2026_08_30',
  'seed_holiday_2026_10_29',
  'seed_holiday_2027_01_01',
  'seed_holiday_2027_03_09',
  'seed_holiday_2027_03_10',
  'seed_holiday_2027_03_11',
  'seed_holiday_2027_04_23',
  'seed_holiday_2027_05_01',
  'seed_holiday_2027_05_16',
  'seed_holiday_2027_05_17',
  'seed_holiday_2027_05_18',
  'seed_holiday_2027_05_19',
  'seed_holiday_2027_07_15',
  'seed_holiday_2027_08_30',
  'seed_holiday_2027_10_29'
);
