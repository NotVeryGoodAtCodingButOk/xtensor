-- Seed inicial para desarrollo/bootstrap.
-- Admin local temporal: example@xtensor.co / 1234
-- Contraseña de planta temporal: planta2026
-- Cambiar desde /admin/configuracion antes de producción.

insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at,
  confirmation_token,
  email_change,
  email_change_token_new,
  recovery_token
)
values (
  '00000000-0000-0000-0000-000000000000',
  '11111111-1111-4111-8111-111111111111',
  'authenticated',
  'authenticated',
  'example@xtensor.co',
  '$2b$10$SRpPfhaJTg67XVZnKwZ78.SUARn3PFslrrfz6MRxDQxOz34ZHnmYO',
  now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"full_name":"XTENSOR Admin Local"}'::jsonb,
  now(),
  now(),
  '',
  '',
  '',
  ''
)
on conflict (id) do update
set email = excluded.email,
    encrypted_password = excluded.encrypted_password,
    email_confirmed_at = coalesce(auth.users.email_confirmed_at, excluded.email_confirmed_at),
    raw_app_meta_data = excluded.raw_app_meta_data,
    raw_user_meta_data = excluded.raw_user_meta_data,
    updated_at = now();

insert into auth.identities (
  provider_id,
  user_id,
  identity_data,
  provider,
  last_sign_in_at,
  created_at,
  updated_at
)
values (
  '11111111-1111-4111-8111-111111111111',
  '11111111-1111-4111-8111-111111111111',
  '{"sub":"11111111-1111-4111-8111-111111111111","email":"example@xtensor.co"}'::jsonb,
  'email',
  now(),
  now(),
  now()
)
on conflict (provider, provider_id) do update
set user_id = excluded.user_id,
    identity_data = excluded.identity_data,
    updated_at = now();

insert into public.profiles (id, full_name, role)
values (
  '11111111-1111-4111-8111-111111111111',
  'XTENSOR Admin Local',
  'admin'
)
on conflict (id) do update
set full_name = excluded.full_name,
    role = excluded.role;

insert into public.settings (
  id,
  factory_password_hash,
  hourly_cost_per_worker_cop,
  labor_factor,
  daily_hours_mon_fri,
  daily_hours_sat,
  daily_hours_sun,
  active_workers_count,
  client_buffer_days
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
  3
)
on conflict (id) do update
set factory_password_hash = excluded.factory_password_hash,
    hourly_cost_per_worker_cop = excluded.hourly_cost_per_worker_cop,
    labor_factor = excluded.labor_factor,
    daily_hours_mon_fri = excluded.daily_hours_mon_fri,
    daily_hours_sat = excluded.daily_hours_sat,
    daily_hours_sun = excluded.daily_hours_sun,
    active_workers_count = excluded.active_workers_count,
    client_buffer_days = excluded.client_buffer_days;
