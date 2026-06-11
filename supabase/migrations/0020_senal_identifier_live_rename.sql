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
    where table_schema = 'public' and table_name = 'machines' and column_name = 'senal_number'
  ) then
    execute format('alter table public.machines rename column %I to senal_number', old_identifier);
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'machine_warranty_events' and column_name = old_identifier
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'machine_warranty_events' and column_name = 'senal_number'
  ) then
    execute format('alter table public.machine_warranty_events rename column %I to senal_number', old_identifier);
  end if;

  if exists (
    select 1 from pg_constraint
    where connamespace = 'public'::regnamespace and conname = old_constraint
  ) then
    execute format('alter table public.machines rename constraint %I to machines_senal_number_key', old_constraint);
  end if;

  if to_regclass(format('%I.%I', 'public', old_active_index)) is not null
    and to_regclass('public.machines_active_senal_number_idx') is null
  then
    execute format('alter index public.%I rename to machines_active_senal_number_idx', old_active_index);
  end if;
end $$;

do $$
declare
  column_record record;
  old_lower text := 'pla' || 'ca';
  old_title text := 'Pla' || 'ca';
  old_upper text := 'PLA' || 'CA';
  old_lower_plural text := 'pla' || 'cas';
  old_title_plural text := 'Pla' || 'cas';
  old_upper_plural text := 'PLA' || 'CAS';
begin
  for column_record in
    select table_schema, table_name, column_name
    from information_schema.columns
    where table_schema = 'public'
      and udt_name in ('text', 'varchar', 'bpchar', 'citext')
  loop
    execute format(
      'update %I.%I set %I = replace(replace(replace(replace(replace(replace(%I, %L, %L), %L, %L), %L, %L), %L, %L), %L, %L), %L, %L) where %I ilike %L',
      column_record.table_schema,
      column_record.table_name,
      column_record.column_name,
      column_record.column_name,
      old_lower_plural, 'señales',
      old_title_plural, 'Señales',
      old_upper_plural, 'SEÑALES',
      old_lower, 'señal',
      old_title, 'Señal',
      old_upper, 'SEÑAL',
      column_record.column_name,
      '%' || old_lower || '%'
    );
  end loop;
end $$;
