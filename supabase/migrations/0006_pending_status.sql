alter table public.machines drop constraint machines_status_check;
alter table public.machines add constraint machines_status_check check (status in ('pending', 'in_production', 'shipped'));
