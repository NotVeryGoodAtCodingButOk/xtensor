/**
 * Pure classifier for a stage completion revert (100 -> 0).
 *
 * Kept in its own module (no Supabase import) so it can be unit tested
 * without loading `stages.ts`, which pulls in the admin Supabase client at
 * module load time.
 *
 * If the worker un-taps the stage within `graceMinutes` of the last
 * completion, it's treated as an "undo" of a mis-tap (the completion log is
 * simply reverted). Past the grace window, it's a real "reprocess": the
 * machine was sent back to redo the stage, which should be recorded as a new
 * logged event.
 */
export function classifyStageRevert(
  lastCompletedAtIso: string | null,
  now: Date,
  graceMinutes = 5,
): "undo" | "reprocess" {
  if (!lastCompletedAtIso) {
    return "reprocess";
  }

  const lastCompletedAt = new Date(lastCompletedAtIso);
  if (Number.isNaN(lastCompletedAt.getTime())) {
    return "reprocess";
  }

  const diffMinutes = Math.abs(now.getTime() - lastCompletedAt.getTime()) / 60_000;
  return diffMinutes <= graceMinutes ? "undo" : "reprocess";
}
