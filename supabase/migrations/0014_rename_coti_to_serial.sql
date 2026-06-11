-- Rename the COTI identifier to "Serial" across the schema.
-- The column previously held the cotización/quote number; it is now the machine's "Serial".
-- Guarded/idempotent so it is a no-op on databases already created with serial_number.

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'machines' and column_name = 'coti_number'
  ) then
    alter table public.machines rename column coti_number to serial_number;
    alter table public.machines rename constraint machines_coti_number_key to machines_serial_number_key;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'machine_warranty_events' and column_name = 'coti_number'
  ) then
    alter table public.machine_warranty_events rename column coti_number to serial_number;
  end if;
end $$;
