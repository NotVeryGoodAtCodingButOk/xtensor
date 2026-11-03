-- % de mano de obra por equipo del catálogo (fracción: 0.3 = 30%).
-- null = el equipo no tiene % propio y usa settings.labor_factor (el % general
-- de Configuración). Sin backfill: todos arrancan en null.
alter table public.equipment_catalog add column if not exists labor_factor numeric;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'equipment_catalog_labor_factor_check'
      and conrelid = 'public.equipment_catalog'::regclass
  ) then
    alter table public.equipment_catalog
      add constraint equipment_catalog_labor_factor_check
      check (labor_factor is null or (labor_factor > 0 and labor_factor <= 1));
  end if;
end $$;
