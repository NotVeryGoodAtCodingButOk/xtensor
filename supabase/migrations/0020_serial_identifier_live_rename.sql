-- Rename the machine identifier column to serial_number (guarded/idempotent).
-- Works whether the column is currently named placa_number (legacy) or already
-- serial_number — on a fresh install it is a no-op because 0001 already creates
-- serial_number.
--
-- NOTE: an earlier version of this migration also ran a *blind* text sweep that
-- replaced every occurrence of the identifier word in EVERY public text column.
-- That corrupted legitimate product/material names where the word means a
-- physical plate (e.g. "Banco predicador con placas", "Placa Informativa
-- Individual", the "Placas" previo). The sweep has been removed; 0021 performs a
-- surgical, value-specific correction instead so fresh installs are never
-- corrupted.
do $$
declare
  old_identifier text := 'pla' || 'ca_number';
  old_constraint text := 'machines_' || old_identifier || '_key';
  old_active_index text := 'machines_active_' || old_identifier || '_idx';
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'machines' and column_name = old_identifier
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'machines' and column_name = 'serial_number'
  ) then
    execute format('alter table public.machines rename column %I to serial_number', old_identifier);
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'machine_warranty_events' and column_name = old_identifier
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'machine_warranty_events' and column_name = 'serial_number'
  ) then
    execute format('alter table public.machine_warranty_events rename column %I to serial_number', old_identifier);
  end if;

  if exists (
    select 1 from pg_constraint
    where connamespace = 'public'::regnamespace and conname = old_constraint
  ) then
    execute format('alter table public.machines rename constraint %I to machines_serial_number_key', old_constraint);
  end if;

  if to_regclass(format('%I.%I', 'public', old_active_index)) is not null
    and to_regclass('public.machines_active_serial_number_idx') is null
  then
    execute format('alter index public.%I rename to machines_active_serial_number_idx', old_active_index);
  end if;
end $$;
