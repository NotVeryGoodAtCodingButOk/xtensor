alter table public.machines
  add column if not exists is_reproceso boolean not null default false;
