-- Planta sin conexión: el iPad guarda cada acción del operario (comando) con la
-- hora real y la envía al volver la red. floor_commands es la bitácora
-- idempotente (el id lo genera el iPad) y floor_devices el último contacto de
-- cada dispositivo. command_id evita duplicar bitácoras al reenviar.

create table if not exists public.floor_commands (
  id uuid primary key,
  device_id text not null,
  seq bigint not null,
  worker_id uuid,
  type text not null,
  payload jsonb not null,
  -- Hora real de la acción (reloj del iPad corregido con el del servidor).
  occurred_at timestamptz not null,
  device_at timestamptz not null,
  clock_offset_ms integer not null default 0,
  status text not null check (status in ('processing', 'applied', 'applied_flagged', 'rejected')),
  flags text[] not null default '{}',
  error text,
  claimed_at timestamptz not null default now(),
  received_at timestamptz not null default now(),
  finished_at timestamptz,
  reviewed_at timestamptz
);

-- Reintentos por error del servidor: tras varios, el comando se marca rechazado
-- para que uno dañado no frene la cola del iPad.
alter table public.floor_commands add column if not exists attempts integer not null default 0;

create index if not exists floor_commands_device_seq_idx on public.floor_commands (device_id, seq);
create index if not exists floor_commands_review_idx on public.floor_commands (received_at desc)
  where status in ('applied_flagged', 'rejected');

alter table public.floor_commands enable row level security;
drop policy if exists "floor_commands_admin_read" on public.floor_commands;
create policy "floor_commands_admin_read" on public.floor_commands for select using (public.is_admin());

create table if not exists public.floor_devices (
  device_id text primary key,
  device text not null,
  user_agent text,
  app_version text,
  sw_supported boolean,
  pending_count integer not null default 0,
  last_sync_at timestamptz not null default now()
);

alter table public.floor_devices enable row level security;
drop policy if exists "floor_devices_admin_read" on public.floor_devices;
create policy "floor_devices_admin_read" on public.floor_devices for select using (public.is_admin());

-- Un comando de planta escribe a lo sumo una bitácora por máquina y un evento de previo.
alter table public.stage_logs add column if not exists command_id uuid;
create unique index if not exists stage_logs_command_machine_key on public.stage_logs (command_id, machine_id);

alter table public.machine_previo_events add column if not exists command_id uuid;
create unique index if not exists machine_previo_events_command_key on public.machine_previo_events (command_id);
