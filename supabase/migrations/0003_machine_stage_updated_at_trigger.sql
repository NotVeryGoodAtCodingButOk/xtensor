-- Backfill last_updated_at for stages that have completion > 0 but no timestamp.
-- Uses the latest stage_log entry as the source of truth; falls back to NOW().
UPDATE machine_stages ms
SET last_updated_at = COALESCE(
  (SELECT MAX(sl.created_at)
   FROM stage_logs sl
   WHERE sl.machine_id = ms.machine_id
     AND sl.stage_id = ms.stage_id
     AND sl.is_undone = false),
  NOW()
)
WHERE ms.completion > 0 AND ms.last_updated_at IS NULL;

-- Trigger: auto-set last_updated_at when a stage is inserted/updated with completion > 0.
CREATE OR REPLACE FUNCTION public.set_machine_stage_updated_at()
RETURNS trigger AS $$
BEGIN
  IF NEW.completion > 0 AND NEW.last_updated_at IS NULL THEN
    NEW.last_updated_at = NOW();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS machine_stages_set_updated_at ON public.machine_stages;
CREATE TRIGGER machine_stages_set_updated_at
  BEFORE INSERT OR UPDATE ON public.machine_stages
  FOR EACH ROW EXECUTE FUNCTION public.set_machine_stage_updated_at();
