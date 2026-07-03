-- Add the "on_hold" status for XTENSOR's own (propias) machines that are
-- started, left half-finished, and parked until they are sold. Their stage
-- progress (machine_stages) and previos (machine_previos) are preserved so the
-- machine can be reactivated straight back into the production queue.
alter table public.machines
  drop constraint if exists machines_status_check;

alter table public.machines
  add constraint machines_status_check
  check (status in ('pending', 'in_production', 'finished', 'shipped', 'on_hold'));

-- Placeholder client for propias machines that have no real client yet. The
-- real client is assigned when the machine is sold/reactivated. The token is
-- set explicitly (url-safe base64) because the column's historical default uses
-- an encoding (base64url) that `encode()` rejects on some Postgres versions.
insert into public.clients (name, magic_link_token)
values ('XTENSOR', replace(replace(encode(gen_random_bytes(24), 'base64'), '+', '-'), '/', '_'))
on conflict (name) do nothing;
