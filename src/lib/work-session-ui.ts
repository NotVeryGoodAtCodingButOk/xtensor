/**
 * Pure formatting/derivation helpers for the factory-floor time-capture UI
 * (active session bar, task grid cards, multi-machine selection). Kept free
 * of React/Supabase imports so they can be unit tested directly.
 */

/** Order-independent comparison of two machine id lists (dedup'd). */
export function sameMachineSet(a: string[], b: string[]): boolean {
  const setA = new Set(a);
  const setB = new Set(b);
  if (setA.size !== setB.size) {
    return false;
  }
  for (const id of setA) {
    if (!setB.has(id)) {
      return false;
    }
  }
  return true;
}

/** Zero-padded elapsed time as HH:MM:SS. Negative/NaN durations clamp to zero. */
export function formatElapsedTime(elapsedMs: number): string {
  const safeMs = Number.isFinite(elapsedMs) ? Math.max(0, elapsedMs) : 0;
  const totalSeconds = Math.floor(safeMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

/** "#12, #34 (+2)" — compact serial-number list for the active-session bar. */
export function formatMachineList(serialNumbers: number[], maxShown = 2): string {
  if (serialNumbers.length === 0) {
    return "";
  }
  const shown = serialNumbers.slice(0, maxShown).map((serial) => `#${serial}`);
  const extra = serialNumbers.length - shown.length;
  return extra > 0 ? `${shown.join(", ")} (+${extra})` : shown.join(", ");
}

/** True when `startedAtIso` falls before the local calendar day of `now`. */
export function isStartedBeforeToday(startedAtIso: string, now: Date): boolean {
  const started = new Date(startedAtIso);
  if (Number.isNaN(started.getTime())) {
    return false;
  }
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return started.getTime() < startOfToday.getTime();
}

export type StageCardState = {
  /** How many of the card's machines have this stage at 100%. */
  doneCount: number;
  /** How many machines this card covers. */
  total: number;
  /** True when every machine in the card is done with this stage. */
  allDone: boolean;
  /** True when at least one machine in the card is done with this stage. */
  anyDone: boolean;
};

/** Derives a stage card's done/pending state from each machine's completion for that stage. */
export function deriveStageCardState(completions: number[]): StageCardState {
  const total = completions.length;
  const doneCount = completions.filter((completion) => completion === 100).length;
  return {
    doneCount,
    total,
    allDone: total > 0 && doneCount === total,
    anyDone: doneCount > 0,
  };
}
