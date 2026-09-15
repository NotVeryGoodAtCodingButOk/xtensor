-- Adds a "reestimada" baseline date snapshot to machines. This is the
-- estimatedDate captured when the machine enters the in-production queue or
-- when the queue is reordered. The late flag compares live estimatedDate
-- against this baseline instead of the immovable promised_date, so
-- intentional queue reordering doesn't make the boards falsely scream late.
alter table public.machines add column if not exists reestimated_date date;
