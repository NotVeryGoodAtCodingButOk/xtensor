-- Seed inicial para desarrollo/bootstrap.
-- Contraseña de planta temporal: planta2026
-- Cambiar desde /admin/configuracion antes de producción.

insert into public.settings (
  id,
  factory_password_hash,
  hourly_cost_per_worker_cop,
  labor_factor,
  daily_hours_mon_fri,
  daily_hours_sat,
  daily_hours_sun,
  active_workers_count,
  client_buffer_days,
  shipped_retention_days
)
values (
  1,
  '$2b$12$5DSRjHAjPi1hfoOTG3s7LuNnDk88lMCHptcFvfT1Pzr4NhTgJgSp6',
  22019.57,
  0.3,
  9,
  6,
  0,
  9,
  3,
  60
)
on conflict (id) do update
set factory_password_hash = excluded.factory_password_hash,
    hourly_cost_per_worker_cop = excluded.hourly_cost_per_worker_cop,
    labor_factor = excluded.labor_factor,
    daily_hours_mon_fri = excluded.daily_hours_mon_fri,
    daily_hours_sat = excluded.daily_hours_sat,
    daily_hours_sun = excluded.daily_hours_sun,
    active_workers_count = excluded.active_workers_count,
    client_buffer_days = excluded.client_buffer_days,
    shipped_retention_days = excluded.shipped_retention_days;
