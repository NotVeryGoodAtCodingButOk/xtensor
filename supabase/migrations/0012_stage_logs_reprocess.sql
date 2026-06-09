alter table public.stage_logs
  add column if not exists is_reprocess boolean not null default false;

update public.stage_logs
set is_reprocess = true
where is_reprocess = false
  and previous_completion >= 100
  and new_completion < 100;
