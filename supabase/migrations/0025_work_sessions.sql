-- Real labor-time capture: a worker starts/finishes a timed activity (a
-- production stage on one or several machines, split equally, or "Otro" with
-- a free-text note). At most one open session per worker at a time.
create table if not exists public.work_sessions (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid not null references public.workers(id),
  -- kind is constrained to 'stage'/'other' implicitly by work_sessions_kind_check below;
  -- an inline check here would collide with that name (Postgres auto-names an
  -- unnamed column check "<table>_<column>_check", i.e. the same name).
  kind text not null,
  stage_id smallint references public.stages(id),
  note text,
  is_reprocess boolean not null default false,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  end_reason text check (end_reason in ('completed','paused')),
  created_at timestamptz not null default now(),
  constraint work_sessions_kind_check check ((kind='stage' and stage_id is not null) or (kind='other' and stage_id is null and coalesce(btrim(note),'')<>'')),
  constraint work_sessions_end_check check (ended_at is null or ended_at >= started_at)
);

create unique index if not exists work_sessions_one_open_per_worker on public.work_sessions(worker_id) where ended_at is null;
create index if not exists work_sessions_started_at_idx on public.work_sessions(started_at desc);

create table if not exists public.work_session_machines (
  session_id uuid not null references public.work_sessions(id) on delete cascade,
  machine_id uuid not null references public.machines(id) on delete cascade,
  primary key (session_id, machine_id)
);

create index if not exists work_session_machines_machine_idx on public.work_session_machines(machine_id);

-- Configurable factory shift + breaks, used to clip registered labor time to
-- the real working window (nights, weekends and holidays are excluded).
alter table public.settings
  add column if not exists shift_start time not null default '08:00',
  add column if not exists shift_end_mon_thu time not null default '17:00',
  add column if not exists shift_end_fri time not null default '14:30',
  add column if not exists shift_end_sat time,
  add column if not exists shift_breaks jsonb not null default '[{"start":"09:00","minutes":15},{"start":"12:00","minutes":30}]'::jsonb;

alter table public.work_sessions enable row level security;
alter table public.work_session_machines enable row level security;

drop policy if exists "admins manage work sessions" on public.work_sessions;
create policy "admins manage work sessions" on public.work_sessions for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "admins manage work session machines" on public.work_session_machines;
create policy "admins manage work session machines" on public.work_session_machines for all using (public.is_admin()) with check (public.is_admin());

do $$
begin
  alter publication supabase_realtime add table public.work_sessions;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.work_session_machines;
exception when duplicate_object then null;
end $$;
