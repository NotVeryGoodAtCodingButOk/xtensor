update public.equipment_catalog
set line = case
  when lower(translate(coalesce(line, ''), 'ÁÉÍÓÚáéíóúÑñ', 'AEIOUaeiouNn')) like '%muscul%' then 'musculacion'
  when lower(translate(coalesce(line, ''), 'ÁÉÍÓÚáéíóúÑñ', 'AEIOUaeiouNn')) like '%bio%' then 'bioparques'
  when lower(translate(coalesce(line, ''), 'ÁÉÍÓÚáéíóúÑñ', 'AEIOUaeiouNn')) like '%manten%' then 'Mantenimiento'
  else 'otros'
end;

update public.machines
set line_override = case
  when lower(translate(coalesce(line_override, ''), 'ÁÉÍÓÚáéíóúÑñ', 'AEIOUaeiouNn')) like '%muscul%' then 'musculacion'
  when lower(translate(coalesce(line_override, ''), 'ÁÉÍÓÚáéíóúÑñ', 'AEIOUaeiouNn')) like '%bio%' then 'bioparques'
  when lower(translate(coalesce(line_override, ''), 'ÁÉÍÓÚáéíóúÑñ', 'AEIOUaeiouNn')) like '%manten%' then 'Mantenimiento'
  when line_override is null then null
  else 'otros'
end;

alter table public.equipment_catalog
  drop constraint if exists equipment_catalog_line_schema_check;

alter table public.equipment_catalog
  add constraint equipment_catalog_line_schema_check
  check (line in ('musculacion', 'bioparques', 'Mantenimiento', 'otros'));

alter table public.machines
  drop constraint if exists machines_line_override_schema_check;

alter table public.machines
  add constraint machines_line_override_schema_check
  check (line_override is null or line_override in ('musculacion', 'bioparques', 'Mantenimiento', 'otros'));
