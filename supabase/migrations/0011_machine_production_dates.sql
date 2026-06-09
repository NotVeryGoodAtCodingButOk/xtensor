-- Production lifecycle dates on machines:
--   production_started_at — set when a machine moves from previos to production
--   completed_at          — set automatically when all stages reach 100%
-- (shipped_at already records dispatch from production to shipped)

alter table public.machines
  add column if not exists production_started_at timestamptz,
  add column if not exists completed_at timestamptz;

-- Backfill completed_at for machines whose stages are already all complete,
-- using the most recent stage update as the completion timestamp.
update public.machines m
set completed_at = sub.max_at
from (
  select
    machine_id,
    max(last_updated_at) as max_at,
    count(*) as total,
    count(*) filter (where completion >= 100) as done
  from public.machine_stages
  group by machine_id
) sub
where sub.machine_id = m.id
  and sub.total > 0
  and sub.total = sub.done
  and m.completed_at is null;
