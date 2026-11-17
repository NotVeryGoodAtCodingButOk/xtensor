-- Registro de conexión de los dispositivos de planta (iPad, TV, portátil).
-- Vercel solo guarda 1 h de logs y no ve las peticiones que nunca llegan; el
-- propio navegador anota cortes, peticiones fallidas y cargas lentas, y las
-- envía al recuperar la conexión. Solo se escribe con service role (server action).
create table if not exists public.connectivity_events (
  id bigint generated always as identity primary key,
  device_id text not null,
  device text not null,
  kind text not null check (kind in ('offline', 'fetch_failed', 'slow_request', 'slow_load', 'gap')),
  started_at timestamptz not null,
  duration_ms integer,
  path text,
  detail text,
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists connectivity_events_started_at_idx
  on public.connectivity_events (started_at desc);

alter table public.connectivity_events enable row level security;

drop policy if exists "connectivity_events_admin_read" on public.connectivity_events;
create policy "connectivity_events_admin_read" on public.connectivity_events
  for select using (public.is_admin());
