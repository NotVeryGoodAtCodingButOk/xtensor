create table if not exists public.previo_catalog (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  created_at timestamptz not null default now()
);

create table if not exists public.machine_previos (
  id uuid primary key default gen_random_uuid(),
  machine_id uuid not null references public.machines(id) on delete cascade,
  previo_catalog_id uuid not null references public.previo_catalog(id),
  ordered boolean not null default false,
  ordered_at timestamptz,
  ordered_by uuid references public.profiles(id),
  received boolean not null default false,
  received_at timestamptz,
  received_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  unique(machine_id, previo_catalog_id)
);

create table if not exists public.machine_previo_events (
  id uuid primary key default gen_random_uuid(),
  machine_previo_id uuid references public.machine_previos(id) on delete set null,
  machine_id uuid not null references public.machines(id) on delete cascade,
  previo_catalog_id uuid not null references public.previo_catalog(id),
  event_type text not null,
  actor_profile_id uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  constraint machine_previo_events_type_check check (
    event_type in (
      'ordered_checked',
      'ordered_unchecked',
      'received_checked',
      'received_unchecked'
    )
  )
);

create index if not exists machine_previos_machine_id_idx on public.machine_previos (machine_id);
create index if not exists machine_previos_previo_catalog_id_idx on public.machine_previos (previo_catalog_id);
create index if not exists machine_previo_events_machine_idx on public.machine_previo_events (machine_id, created_at desc);
create index if not exists machine_previo_events_actor_idx on public.machine_previo_events (actor_profile_id, created_at desc);
create index if not exists machine_previo_events_previo_idx on public.machine_previo_events (previo_catalog_id, created_at desc);

alter table public.previo_catalog enable row level security;
alter table public.machine_previos enable row level security;
alter table public.machine_previo_events enable row level security;

drop policy if exists "admins manage previo catalog" on public.previo_catalog;
create policy "admins manage previo catalog" on public.previo_catalog for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "admins manage machine previos" on public.machine_previos;
create policy "admins manage machine previos" on public.machine_previos for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "admins manage machine previo events" on public.machine_previo_events;
create policy "admins manage machine previo events" on public.machine_previo_events for all using (public.is_admin()) with check (public.is_admin());

do $$
begin
  alter publication supabase_realtime add table public.machine_previos;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.machine_previo_events;
exception when duplicate_object then null;
end $$;
