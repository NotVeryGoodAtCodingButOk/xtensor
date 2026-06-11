create extension if not exists pgcrypto;

create table if not exists public.equipment_catalog (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  name text not null,
  line text,
  default_price_cop numeric,
  is_custom boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.colors (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  created_at timestamptz not null default now()
);

create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  magic_link_token text unique not null default encode(gen_random_bytes(24), 'base64url'),
  created_at timestamptz not null default now()
);

create table if not exists public.workers (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  role text not null,
  hourly_cost_cop numeric,
  is_active boolean not null default true,
  display_color text,
  created_at timestamptz not null default now()
);

create table if not exists public.machines (
  id uuid primary key default gen_random_uuid(),
  senal_number integer not null unique,
  client_id uuid not null references public.clients(id),
  equipment_id uuid references public.equipment_catalog(id),
  custom_equipment_name text,
  color_id uuid references public.colors(id),
  city text,
  line_override text,
  sale_price_cop numeric not null,
  assigned_to text,
  promised_date date not null,
  order_position integer not null,
  status text not null default 'in_production',
  shipped_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint machines_status_check check (status in ('in_production', 'shipped')),
  constraint machines_equipment_name_check check (equipment_id is not null or custom_equipment_name is not null)
);

create table if not exists public.stages (
  id smallint primary key,
  name text not null,
  completion_percentage smallint not null,
  display_order smallint not null
);

insert into public.stages (id, name, completion_percentage, display_order)
values
  (1, 'Material', 20, 1),
  (2, 'Armar', 40, 2),
  (3, 'Resoldar', 50, 3),
  (4, 'Pulir', 70, 4),
  (5, 'Pintar', 80, 5),
  (6, 'Ensamblar', 90, 6),
  (7, 'Empacar', 100, 7)
on conflict (id) do update
set name = excluded.name,
    completion_percentage = excluded.completion_percentage,
    display_order = excluded.display_order;

create table if not exists public.machine_stages (
  id uuid primary key default gen_random_uuid(),
  machine_id uuid not null references public.machines(id) on delete cascade,
  stage_id smallint not null references public.stages(id),
  completion smallint not null default 0,
  last_worker_id uuid references public.workers(id),
  last_updated_at timestamptz,
  unique(machine_id, stage_id),
  constraint machine_stage_completion_check check (completion in (0, 25, 50, 75, 100))
);

create table if not exists public.stage_logs (
  id uuid primary key default gen_random_uuid(),
  machine_id uuid not null references public.machines(id) on delete cascade,
  stage_id smallint not null references public.stages(id),
  worker_id uuid not null references public.workers(id),
  previous_completion smallint not null,
  new_completion smallint not null,
  is_undone boolean not null default false,
  created_at timestamptz not null default now(),
  constraint stage_log_previous_completion_check check (previous_completion in (0, 25, 50, 75, 100)),
  constraint stage_log_new_completion_check check (new_completion in (0, 25, 50, 75, 100))
);

create table if not exists public.holidays (
  date date primary key,
  name text not null,
  is_custom boolean not null default false
);

create table if not exists public.settings (
  id smallint primary key default 1,
  factory_password_hash text not null,
  hourly_cost_per_worker_cop numeric not null default 22019.57,
  labor_factor numeric not null default 0.3,
  daily_hours_mon_fri numeric not null default 9,
  daily_hours_sat numeric not null default 6,
  daily_hours_sun numeric not null default 0,
  active_workers_count smallint not null default 9,
  client_buffer_days smallint not null default 3,
  updated_at timestamptz not null default now(),
  constraint settings_singleton_check check (id = 1)
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  role text not null default 'admin',
  constraint profiles_role_check check (role in ('admin'))
);

create index if not exists machines_status_order_position_idx on public.machines (status, order_position);
create index if not exists machines_client_id_idx on public.machines (client_id);
create index if not exists machine_stages_machine_id_idx on public.machine_stages (machine_id);
create index if not exists stage_logs_worker_created_idx on public.stage_logs (worker_id, created_at desc);
create index if not exists stage_logs_machine_created_idx on public.stage_logs (machine_id, created_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists equipment_catalog_set_updated_at on public.equipment_catalog;
create trigger equipment_catalog_set_updated_at
before update on public.equipment_catalog
for each row execute function public.set_updated_at();

drop trigger if exists machines_set_updated_at on public.machines;
create trigger machines_set_updated_at
before update on public.machines
for each row execute function public.set_updated_at();

drop trigger if exists settings_set_updated_at on public.settings;
create trigger settings_set_updated_at
before update on public.settings
for each row execute function public.set_updated_at();

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'admin'
  );
$$;

alter table public.equipment_catalog enable row level security;
alter table public.colors enable row level security;
alter table public.clients enable row level security;
alter table public.workers enable row level security;
alter table public.machines enable row level security;
alter table public.stages enable row level security;
alter table public.machine_stages enable row level security;
alter table public.stage_logs enable row level security;
alter table public.holidays enable row level security;
alter table public.settings enable row level security;
alter table public.profiles enable row level security;

create policy "admins manage equipment catalog" on public.equipment_catalog for all using (public.is_admin()) with check (public.is_admin());
create policy "admins manage colors" on public.colors for all using (public.is_admin()) with check (public.is_admin());
create policy "admins manage clients" on public.clients for all using (public.is_admin()) with check (public.is_admin());
create policy "admins manage workers" on public.workers for all using (public.is_admin()) with check (public.is_admin());
create policy "admins manage machines" on public.machines for all using (public.is_admin()) with check (public.is_admin());
create policy "admins read stages" on public.stages for select using (public.is_admin());
create policy "admins manage machine stages" on public.machine_stages for all using (public.is_admin()) with check (public.is_admin());
create policy "admins manage stage logs" on public.stage_logs for all using (public.is_admin()) with check (public.is_admin());
create policy "admins manage holidays" on public.holidays for all using (public.is_admin()) with check (public.is_admin());
create policy "admins manage settings" on public.settings for all using (public.is_admin()) with check (public.is_admin());
create policy "users read own profile" on public.profiles for select using (auth.uid() = id or public.is_admin());
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
