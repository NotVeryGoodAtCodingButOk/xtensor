-- LMP FEB 2026 master-list sync for equipment_catalog.
--
-- 1) Add 'accesorios' as a supported product line (catalog + machine override),
--    extending the line CHECK constraints introduced in 0009.
-- 2) Re-code 3 machines whose master code changed. Only `code` changes; name,
--    line, price, equipment_previos and machine links are all preserved because
--    those relationships reference equipment_catalog.id (uuid), not the code.
--       XM179 -> XM178  (Hammer isolateral vuelos)
--       XM909 -> XC101  (Accesorio fondos para jaula)
--       XM911 -> XC103  (Pivote de barra para jaula)
-- 3) Insert 13 new machines from the master list that were missing from the
--    catalog. The master has no price for any of them, so default_price_cop is
--    left null (filled at import time from the Excel loader).
--
-- Existing catalog rows (names, prices, previos) are intentionally left untouched.

begin;

-- 1) Extend the line CHECK constraints to allow 'accesorios'.
alter table public.equipment_catalog
  drop constraint if exists equipment_catalog_line_schema_check;
alter table public.equipment_catalog
  add constraint equipment_catalog_line_schema_check
  check (line in ('musculacion', 'bioparques', 'Mantenimiento', 'accesorios', 'otros'));

alter table public.machines
  drop constraint if exists machines_line_override_schema_check;
alter table public.machines
  add constraint machines_line_override_schema_check
  check (line_override is null or line_override in ('musculacion', 'bioparques', 'Mantenimiento', 'accesorios', 'otros'));

-- 2) Re-code machines whose master code changed (idempotent: only acts if the
--    old code still exists and the new code is not already taken).
update public.equipment_catalog
  set code = 'XM178', updated_at = now()
  where code = 'XM179' and not exists (select 1 from public.equipment_catalog where code = 'XM178');
update public.equipment_catalog
  set code = 'XC101', updated_at = now()
  where code = 'XM909' and not exists (select 1 from public.equipment_catalog where code = 'XC101');
update public.equipment_catalog
  set code = 'XC103', updated_at = now()
  where code = 'XM911' and not exists (select 1 from public.equipment_catalog where code = 'XC103');

-- 3) Insert new machines from the master list (idempotent on the unique code).
insert into public.equipment_catalog (code, name, line, default_price_cop, is_custom, is_active)
values
  ('XJ500', 'Balancín de pie',                    'otros',       null, false, true),
  ('XJ501', 'Balancín Doble',                     'otros',       null, false, true),
  ('XJ502', 'Balancín Péndulo',                   'otros',       null, false, true),
  ('XJ503', 'Parque Infantil #1',                 'otros',       null, false, true),
  ('XA910', 'Piso en caucho 1cm liso o cuadrado', 'accesorios',  null, false, true),
  ('XA911', 'Piso en caucho 1cm con chips',       'accesorios',  null, false, true),
  ('XA912', 'Piso en caucho 2cm liso o cuadrado', 'accesorios',  null, false, true),
  ('XA913', 'Piso en caucho 2cm con chips',       'accesorios',  null, false, true),
  ('XM196', 'Banco plano peso libre 2.0',         'musculacion', null, false, true),
  ('XM197', 'Sentadilla sissy 2.0',               'musculacion', null, false, true),
  ('XM198', 'Multifuerza dos estaciones',         'musculacion', null, false, true),
  ('XC102', 'Portapeso',                          'otros',       null, false, true),
  ('XJ508', 'Asiento parque infantil',            'otros',       null, false, true)
on conflict (code) do nothing;

commit;
