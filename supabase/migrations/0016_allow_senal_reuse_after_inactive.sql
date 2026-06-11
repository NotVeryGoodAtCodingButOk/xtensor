-- Señales are assigned from the active queue and may wrap from 999 back to 1.
-- Once a machine is shipped, its señal can be reused by a future active machine.

alter table public.machines
  drop constraint if exists machines_senal_number_key,
  drop constraint if exists machines_coti_number_key;

create index if not exists machines_active_senal_number_idx
  on public.machines (senal_number)
  where status in ('pending', 'in_production', 'finished');
