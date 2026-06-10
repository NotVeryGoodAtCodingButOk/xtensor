-- Add 'finished' status for machines that have completed all production stages
-- but have not yet been dispatched. Machines auto-transition here when the
-- last stage is marked done on the factory floor.

ALTER TABLE public.machines
  DROP CONSTRAINT IF EXISTS machines_status_check;

ALTER TABLE public.machines
  ADD CONSTRAINT machines_status_check
  CHECK (status IN ('pending', 'in_production', 'finished', 'shipped'));
