-- Backfill all previo_catalog items to all existing machines.
-- A checked previo means the machine needs it; this ensures every machine
-- starts with all catalog previos active so operators can uncheck what doesn't apply.
insert into public.machine_previos (machine_id, previo_catalog_id)
select m.id, pc.id
from public.machines m
cross join public.previo_catalog pc
where not exists (
  select 1 from public.machine_previos mp
  where mp.machine_id = m.id and mp.previo_catalog_id = pc.id
)
on conflict (machine_id, previo_catalog_id) do nothing;
