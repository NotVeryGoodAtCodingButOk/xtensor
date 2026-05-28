-- Idempotent re-application of RLS policies and seed for production bootstrap.

drop policy if exists "admins manage equipment catalog" on public.equipment_catalog;
create policy "admins manage equipment catalog" on public.equipment_catalog for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "admins manage colors" on public.colors;
create policy "admins manage colors" on public.colors for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "admins manage clients" on public.clients;
create policy "admins manage clients" on public.clients for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "admins manage workers" on public.workers;
create policy "admins manage workers" on public.workers for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "admins manage machines" on public.machines;
create policy "admins manage machines" on public.machines for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "admins read stages" on public.stages;
create policy "admins read stages" on public.stages for select using (public.is_admin());

drop policy if exists "admins manage machine stages" on public.machine_stages;
create policy "admins manage machine stages" on public.machine_stages for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "admins manage stage logs" on public.stage_logs;
create policy "admins manage stage logs" on public.stage_logs for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "admins manage holidays" on public.holidays;
create policy "admins manage holidays" on public.holidays for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "admins manage settings" on public.settings;
create policy "admins manage settings" on public.settings for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "users read own profile" on public.profiles;
create policy "users read own profile" on public.profiles for select using (auth.uid() = id or public.is_admin());

drop policy if exists "admins manage profiles" on public.profiles;
create policy "admins manage profiles" on public.profiles for all using (public.is_admin()) with check (public.is_admin());

do $$
begin
  alter publication supabase_realtime add table public.machines;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.machine_stages;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.stage_logs;
exception when duplicate_object then null;
end $$;

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
on conflict (id) do nothing;
