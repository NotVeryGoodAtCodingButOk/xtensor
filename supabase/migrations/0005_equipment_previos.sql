create table if not exists public.equipment_previos (
  id uuid primary key default gen_random_uuid(),
  equipment_id uuid not null references public.equipment_catalog(id) on delete cascade,
  previo_catalog_id uuid not null references public.previo_catalog(id),
  created_at timestamptz not null default now(),
  unique(equipment_id, previo_catalog_id)
);

create index if not exists equipment_previos_equipment_id_idx on public.equipment_previos (equipment_id);
create index if not exists equipment_previos_previo_catalog_id_idx on public.equipment_previos (previo_catalog_id);

insert into public.equipment_previos (equipment_id, previo_catalog_id)
select distinct m.equipment_id, mp.previo_catalog_id
from public.machine_previos mp
join public.machines m on m.id = mp.machine_id
where m.equipment_id is not null
on conflict (equipment_id, previo_catalog_id) do nothing;

alter table public.equipment_previos enable row level security;

drop policy if exists "admins manage equipment previos" on public.equipment_previos;
create policy "admins manage equipment previos" on public.equipment_previos for all using (public.is_admin()) with check (public.is_admin());

do $$
begin
  alter publication supabase_realtime add table public.equipment_previos;
exception when duplicate_object then null;
end $$;
