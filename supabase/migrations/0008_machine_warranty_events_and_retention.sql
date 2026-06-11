alter table public.settings
  add column if not exists shipped_retention_days smallint not null default 60;

create table if not exists public.machine_warranty_events (
  id uuid primary key default gen_random_uuid(),
  machine_id uuid not null references public.machines(id) on delete cascade,
  serial_number integer not null,
  message text not null,
  actor_profile_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists machine_warranty_events_created_at_idx
  on public.machine_warranty_events (created_at desc);

create index if not exists machine_warranty_events_machine_id_created_at_idx
  on public.machine_warranty_events (machine_id, created_at desc);

alter table public.machine_warranty_events enable row level security;

drop policy if exists "admins manage machine warranty events" on public.machine_warranty_events;
create policy "admins manage machine warranty events" on public.machine_warranty_events for all using (public.is_admin()) with check (public.is_admin());

do $$
begin
  alter publication supabase_realtime add table public.machine_warranty_events;
exception when duplicate_object then null;
end $$;
