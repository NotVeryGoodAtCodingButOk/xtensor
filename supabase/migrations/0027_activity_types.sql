-- Las actividades sin etapa de producción dejan de ser texto libre ("Otra
-- actividad" + nota) y pasan a un catálogo enunciado y editable desde el panel
-- admin: aseo, orden, mejoras planta, arreglar máquinas, instalación externa.
--
-- Una sesión puede marcar varias actividades a la vez; el tiempo se reparte en
-- partes iguales entre ellas, igual que ya se reparte entre varias máquinas.
-- Los tipos con allows_machine dejan además asociar máquinas, para poder
-- costear garantías e instalaciones contra la máquina real.
create table if not exists public.activity_types (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  sort_order smallint not null default 0,
  -- Si el tipo deja asociar máquinas (arreglos, instalaciones) o no (aseo).
  allows_machine boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

insert into public.activity_types (name, sort_order, allows_machine) values
  ('Aseo', 1, false),
  ('Orden', 2, false),
  ('Mejoras planta', 3, false),
  ('Arreglar máquinas', 4, true),
  ('Instalación externa', 5, true)
on conflict (name) do nothing;

create table if not exists public.work_session_activity_types (
  session_id uuid not null references public.work_sessions(id) on delete cascade,
  -- restrict: un tipo con horas registradas se desactiva, no se borra.
  activity_type_id uuid not null references public.activity_types(id) on delete restrict,
  primary key (session_id, activity_type_id)
);

create index if not exists work_session_activity_types_type_idx
  on public.work_session_activity_types(activity_type_id);

-- La nota deja de ser obligatoria en las sesiones "other": lo obligatorio pasa
-- a ser el tipo de actividad, que vive en la tabla puente y por lo tanto no es
-- visible para un check de columna (se valida en services/work-sessions.ts).
-- Las sesiones históricas conservan su nota como único rastro de qué se hizo.
alter table public.work_sessions drop constraint if exists work_sessions_kind_check;
alter table public.work_sessions add constraint work_sessions_kind_check
  check ((kind = 'stage' and stage_id is not null) or (kind = 'other' and stage_id is null));

alter table public.activity_types enable row level security;
alter table public.work_session_activity_types enable row level security;

drop policy if exists "admins manage activity types" on public.activity_types;
create policy "admins manage activity types" on public.activity_types
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "admins manage work session activity types" on public.work_session_activity_types;
create policy "admins manage work session activity types" on public.work_session_activity_types
  for all using (public.is_admin()) with check (public.is_admin());

do $$
begin
  alter publication supabase_realtime add table public.work_session_activity_types;
exception when duplicate_object then null;
end $$;
