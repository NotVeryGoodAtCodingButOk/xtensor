-- 1. Rename the machine identifier column to serial_number on databases that
--    are still on the previous "senal_number" naming. Guarded/idempotent: a
--    no-op where the column is already serial_number (fresh installs) and also
--    handles the legacy placa_number name defensively.
do $$
declare
  src text;
begin
  -- machines.<id> -> serial_number
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'machines' and column_name = 'serial_number'
  ) then
    select column_name into src
    from information_schema.columns
    where table_schema = 'public' and table_name = 'machines'
      and column_name in ('senal_number', 'placa_number')
    limit 1;
    if src is not null then
      execute format('alter table public.machines rename column %I to serial_number', src);
    end if;
  end if;

  -- machine_warranty_events.<id> -> serial_number
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'machine_warranty_events' and column_name = 'serial_number'
  ) then
    select column_name into src
    from information_schema.columns
    where table_schema = 'public' and table_name = 'machine_warranty_events'
      and column_name in ('senal_number', 'placa_number')
    limit 1;
    if src is not null then
      execute format('alter table public.machine_warranty_events rename column %I to serial_number', src);
    end if;
  end if;

  -- unique constraint
  if exists (select 1 from pg_constraint where connamespace = 'public'::regnamespace and conname = 'machines_senal_number_key') then
    alter table public.machines rename constraint machines_senal_number_key to machines_serial_number_key;
  elsif exists (select 1 from pg_constraint where connamespace = 'public'::regnamespace and conname = 'machines_placa_number_key') then
    alter table public.machines rename constraint machines_placa_number_key to machines_serial_number_key;
  end if;

  -- partial unique index on active serials
  if to_regclass('public.machines_active_senal_number_idx') is not null
     and to_regclass('public.machines_active_serial_number_idx') is null then
    alter index public.machines_active_senal_number_idx rename to machines_active_serial_number_idx;
  elsif to_regclass('public.machines_active_placa_number_idx') is not null
     and to_regclass('public.machines_active_serial_number_idx') is null then
    alter index public.machines_active_placa_number_idx rename to machines_active_serial_number_idx;
  end if;
end $$;

-- 2. Restore legitimate "placa" (physical plate) product/material names that an
--    earlier blind text sweep wrongly changed to "señal". These are NOT the
--    identifier and must never become "serial". Value-specific, so it only
--    touches the known-corrupted rows.
update public.equipment_catalog set name = 'Placa Informativa Individual',                  updated_at = now() where code = 'XB429';
update public.equipment_catalog set name = 'Banco predicador con placas',                   updated_at = now() where code = 'XM110';
update public.equipment_catalog set name = 'Sentadilla smith con poleas 2.0 sin placas',    updated_at = now() where code = 'XM189';
update public.equipment_catalog set name = 'Hammer isolateral vuelos con placas',           updated_at = now() where code = 'XM193';
update public.equipment_catalog set name = 'Placas adicionales',                            updated_at = now() where code = 'XM200';

update public.previo_catalog set name = 'Placas' where name = 'Señales';
