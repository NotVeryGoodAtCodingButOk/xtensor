-- Separate Friday working hours from Mon-Thu.
-- The factory works shorter Fridays (leaves early) plus a daily break deduction,
-- so a single Mon-Fri figure overstated capacity on Fridays.
-- After this migration `daily_hours_mon_fri` means Mon-Thu; Friday uses `daily_hours_fri`.

alter table public.settings
  add column if not exists daily_hours_fri numeric not null default 9;

-- Net productive hours (breaks already deducted): Mon-Thu 8.25, Fri 5.75, weekends off.
update public.settings
  set daily_hours_mon_fri = 8.25,
      daily_hours_fri = 5.75,
      daily_hours_sat = 0,
      updated_at = now()
  where id = 1;
