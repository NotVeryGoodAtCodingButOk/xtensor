-- Rename the COTI identifier to "Placa" across the schema.
-- The column previously held the cotización/quote number; it is now the machine's "placa".
-- Guarded/idempotent so it is a no-op on databases already created with placa_number.

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'machines' and column_name = 'coti_number'
  ) then
    alter table public.machines rename column coti_number to placa_number;
    alter table public.machines rename constraint machines_coti_number_key to machines_placa_number_key;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'machine_warranty_events' and column_name = 'coti_number'
  ) then
    alter table public.machine_warranty_events rename column coti_number to placa_number;
  end if;
end $$;
