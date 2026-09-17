import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import type { ProductionSettings, ShiftBreak } from "@/services/calculations";
import type { Holiday } from "@/services/schedule";

// Pure module: no Supabase import, so it (and its tests) never touch the
// admin client or environment. Kept separate from statistics.ts, which
// already carries the same timezone constant but also imports Supabase.
const FACTORY_TIME_ZONE = "America/Bogota";

export type FactoryShift = {
  start: string; // "HH:mm"
  endByWeekday: Record<number, string | null>; // 0=Sun..6=Sat, null = day off
  breaks: ShiftBreak[];
};

export type HolidaySet = Holiday[] | Set<string>;

/**
 * Builds the weekly shift shape from settings: Mon-Thu share one close time,
 * Friday and Saturday have their own (Saturday may be null = no work),
 * Sunday is always off.
 */
export function shiftFromSettings(
  settings: Pick<ProductionSettings, "shiftStart" | "shiftEndMonThu" | "shiftEndFri" | "shiftEndSat" | "shiftBreaks">,
): FactoryShift {
  return {
    start: settings.shiftStart,
    endByWeekday: {
      0: null,
      1: settings.shiftEndMonThu,
      2: settings.shiftEndMonThu,
      3: settings.shiftEndMonThu,
      4: settings.shiftEndMonThu,
      5: settings.shiftEndFri,
      6: settings.shiftEndSat,
    },
    breaks: settings.shiftBreaks,
  };
}

/**
 * Parses a Postgres `time` string ("HH:mm" or "HH:mm:ss") into "HH:mm".
 * Returns null for anything malformed so callers can ignore/ default it.
 */
export function normalizeShiftTime(value: string | null | undefined): string | null {
  if (!value) return null;
  const match = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(value.trim());
  if (!match) return null;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;

  return `${pad2(hours)}:${pad2(minutes)}`;
}

/**
 * Sanitizes the `shift_breaks` jsonb column into a clean ShiftBreak[],
 * silently dropping malformed entries instead of throwing.
 */
export function sanitizeShiftBreaks(value: unknown): ShiftBreak[] {
  if (!Array.isArray(value)) return [];

  const breaks: ShiftBreak[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const start = normalizeShiftTime((entry as { start?: unknown }).start as string | undefined);
    const minutesRaw = (entry as { minutes?: unknown }).minutes;
    const minutes = typeof minutesRaw === "number" ? minutesRaw : Number(minutesRaw);
    if (!start || !Number.isFinite(minutes) || minutes <= 0 || minutes > 240) continue;
    breaks.push({ start, minutes: Math.round(minutes) });
  }

  return breaks;
}

/**
 * Minutes of real labor time inside [startIso, endIso), clipped to the
 * factory shift window each Bogota-local calendar day, minus breaks and
 * holidays/days off. Keeps fractional minutes — round only for display.
 */
export function workedMinutes(startIso: string, endIso: string, shift: FactoryShift, holidays: HolidaySet): number {
  const byDay = workedMinutesByDay(startIso, endIso, shift, holidays);
  let total = 0;
  for (const minutes of byDay.values()) total += minutes;
  return total;
}

/**
 * Same as workedMinutes, but broken down per Bogota-local calendar day.
 * Used both to total time worked and to attribute which days a worker
 * actually had registered activity on (for availability/utilization).
 */
export function workedMinutesByDay(
  startIso: string,
  endIso: string,
  shift: FactoryShift,
  holidays: HolidaySet,
): Map<string, number> {
  const result = new Map<string, number>();
  const start = new Date(startIso);
  const end = new Date(endIso);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end.getTime() <= start.getTime()) {
    return result;
  }

  const holidaySet = toHolidaySet(holidays);
  let dateKey = toFactoryDateKey(start);
  const endDateKey = toFactoryDateKey(end);

  while (dateKey <= endDateKey) {
    const minutes = dayIntersectionMinutes(dateKey, shift, holidaySet, start, end);
    if (minutes > 0) {
      result.set(dateKey, minutes);
    }
    dateKey = addDaysToDateKey(dateKey, 1);
  }

  return result;
}

/**
 * Total minutes available in the factory shift on a given Bogota-local date
 * (0 on holidays/days off), net of breaks.
 */
export function availableShiftMinutes(dateYmd: string, shift: FactoryShift, holidays: HolidaySet): number {
  const holidaySet = toHolidaySet(holidays);
  if (holidaySet.has(dateYmd)) return 0;

  const endTime = shift.endByWeekday[getDateKeyWeekday(dateYmd)];
  if (!endTime) return 0;

  const dayStart = localDateTimeToUtc(dateYmd, shift.start);
  const dayEnd = localDateTimeToUtc(dateYmd, endTime);
  if (dayEnd <= dayStart) return 0;

  const workIntervals = subtractBreaks(dayStart, dayEnd, shift.breaks, dateYmd);
  return sumIntervalMinutes(workIntervals);
}

/**
 * Splits `minutes` equally among `ids` (e.g. several machines worked in one
 * session). Returns a Map so callers can look up per-id shares; empty ids
 * yields an empty map.
 */
export function splitEqually<T extends string>(minutes: number, ids: T[]): Map<T, number> {
  const map = new Map<T, number>();
  if (ids.length === 0) return map;
  const share = minutes / ids.length;
  for (const id of ids) map.set(id, share);
  return map;
}

// ---------------------------------------------------------------------------
// summarizeLabor
// ---------------------------------------------------------------------------

export type LaborSessionInput = {
  id: string;
  workerId: string;
  kind: "stage" | "other";
  stageId: number | null;
  /** Actividades del catálogo marcadas en la sesión (solo kind "other"). */
  activityTypeIds: string[];
  note: string | null;
  isReprocess: boolean;
  startedAt: string;
  endedAt: string | null;
  endReason: "completed" | "paused" | null;
  machineIds: string[];
};

export type LaborWorkerInput = {
  id: string;
  fullName: string;
  hourlyCostCop: number | null;
};

export type LaborMachineInput = {
  id: string;
  serialNumber: number;
  label: string;
  salePriceCop: number;
  isWarranty?: boolean;
};

export type LaborStageInput = {
  id: number;
  name: string;
};

export type LaborActivityTypeInput = {
  id: string;
  name: string;
};

/**
 * Bucket for the sessions registered before the catálogo de actividades
 * existed (free-text note, no type). Keeps Σ byActivityType equal to
 * totals.otherMinutes instead of silently dropping that time.
 */
export const UNCLASSIFIED_ACTIVITY_ID = "sin-clasificar";

export type DoneMarkWithoutSession = {
  workerId: string;
  machineId: string;
  stageId: number;
  createdAt: string;
};

export type SummarizeLaborInput = {
  sessions: LaborSessionInput[];
  workers: LaborWorkerInput[];
  machines: LaborMachineInput[];
  stages: LaborStageInput[];
  shift: FactoryShift;
  holidays: HolidaySet;
  activityTypes?: LaborActivityTypeInput[];
  range: { startIso: string; endIso: string };
  now: Date | string;
  hourlyCostFallback: number;
  estimateHours: (salePriceCop: number) => number;
  doneMarksWithoutSession?: DoneMarkWithoutSession[];
};

export type LaborTotals = {
  registeredMinutes: number;
  machineMinutes: number;
  reprocessMinutes: number;
  otherMinutes: number;
  availableMinutes: number;
  unregisteredMinutes: number;
  utilizationPct: number | null;
  laborCostCop: number;
};

export type LaborByWorker = LaborTotals & {
  workerId: string;
  fullName: string;
  daysWithRecords: number;
};

export type LaborByMachine = {
  machineId: string;
  serialNumber: number;
  label: string;
  isWarranty: boolean;
  /** Production time only (stage sessions) — what the estimate is compared against. */
  totalMinutes: number;
  minutesByStage: Record<number, number>;
  reprocessMinutes: number;
  laborCostCop: number;
  /**
   * Time from catalogued activities tied to this machine (arreglos,
   * instalaciones). Deliberately outside totalMinutes/deviationPct: it is real
   * cost, but it is not part of the estimated production hours.
   */
  otherMinutes: number;
  otherCostCop: number;
  estimatedHours: number | null;
  deviationPct: number | null;
};

export type LaborByActivityType = {
  activityTypeId: string;
  name: string;
  minutes: number;
  laborCostCop: number;
  sessionCount: number;
  workerCount: number;
};

export type LaborByWorkerActivityType = {
  workerId: string;
  fullName: string;
  activityTypeId: string;
  name: string;
  minutes: number;
};

export type LaborByWorkerMachine = {
  workerId: string;
  fullName: string;
  machineId: string;
  serialNumber: number;
  stageId: number;
  stageName: string;
  minutes: number;
  isReprocess: boolean;
};

/**
 * One captured cronómetro, as the dashboards show it: the bitácora behind
 * every aggregate. Σ minutes of a worker's sessions is their
 * registeredMinutes, so the log always reconciles with the totals.
 */
export type LaborSessionDetail = {
  sessionId: string;
  workerId: string;
  fullName: string;
  kind: "stage" | "other";
  stageId: number | null;
  stageName: string | null;
  activityTypeNames: string[];
  /** Only on sessions registered before the catálogo existed. */
  note: string;
  machineSerialNumbers: number[];
  isReprocess: boolean;
  startedAt: string;
  endedAt: string | null;
  endReason: "completed" | "paused" | null;
  minutes: number;
};

export type LaborSummary = {
  totals: LaborTotals;
  byWorker: LaborByWorker[];
  byMachine: LaborByMachine[];
  byWorkerMachine: LaborByWorkerMachine[];
  byActivityType: LaborByActivityType[];
  byWorkerActivityType: LaborByWorkerActivityType[];
  sessions: LaborSessionDetail[];
  dataQuality: {
    openSessionsStartedBeforeToday: Array<{ sessionId: string; workerId: string; fullName: string; startedAt: string }>;
    doneMarksWithoutSession: { count: number; list: DoneMarkWithoutSession[] };
  };
};

/**
 * Aggregates work sessions into the dashboards this module was built to
 * feed: man-hours & labor cost per machine, hours per worker by activity,
 * and utilization (registered vs available shift time).
 *
 * Availability rule (documented here since it's easy to miss): a worker's
 * availableMinutes only counts Bogota-local days on which they have at
 * least one session with > 0 worked minutes. Days without any record are
 * treated as an absence, not as idle/unregistered time — so they don't
 * silently inflate "Sin registrar".
 */
export function summarizeLabor(input: SummarizeLaborInput): LaborSummary {
  const now = typeof input.now === "string" ? new Date(input.now) : input.now;
  const workerById = new Map(input.workers.map((worker) => [worker.id, worker]));
  const machineById = new Map(input.machines.map((machine) => [machine.id, machine]));
  const stageNameById = new Map(input.stages.map((stage) => [stage.id, stage.name]));
  const activityNameById = new Map((input.activityTypes ?? []).map((type) => [type.id, type.name]));

  const byWorker = new Map<string, LaborByWorker & { daySet: Set<string> }>();
  for (const worker of input.workers) {
    byWorker.set(worker.id, {
      workerId: worker.id,
      fullName: worker.fullName,
      daysWithRecords: 0,
      availableMinutes: 0,
      machineMinutes: 0,
      reprocessMinutes: 0,
      otherMinutes: 0,
      registeredMinutes: 0,
      unregisteredMinutes: 0,
      utilizationPct: null,
      laborCostCop: 0,
      daySet: new Set<string>(),
    });
  }

  const byMachine = new Map<string, LaborByMachine>();
  for (const machine of input.machines) {
    let estimatedHours: number | null = null;
    try {
      estimatedHours = input.estimateHours(machine.salePriceCop);
    } catch {
      estimatedHours = null;
    }
    byMachine.set(machine.id, {
      machineId: machine.id,
      serialNumber: machine.serialNumber,
      label: machine.label,
      isWarranty: machine.isWarranty ?? false,
      totalMinutes: 0,
      minutesByStage: {},
      reprocessMinutes: 0,
      laborCostCop: 0,
      otherMinutes: 0,
      otherCostCop: 0,
      estimatedHours,
      deviationPct: null,
    });
  }

  const byWorkerMachineMap = new Map<string, LaborByWorkerMachine>();
  const byActivityTypeMap = new Map<string, LaborByActivityType & { workerIds: Set<string> }>();
  const byWorkerActivityTypeMap = new Map<string, LaborByWorkerActivityType>();
  const sessionDetails: LaborSessionDetail[] = [];

  for (const session of input.sessions) {
    const effectiveStart = maxIso(session.startedAt, input.range.startIso);
    const effectiveEnd = minIso(session.endedAt ?? now.toISOString(), input.range.endIso);
    if (new Date(effectiveEnd).getTime() <= new Date(effectiveStart).getTime()) {
      continue;
    }

    const worker = workerById.get(session.workerId);
    const fullName = worker?.fullName ?? "Operario sin nombre";
    const hourlyCost = worker?.hourlyCostCop ?? input.hourlyCostFallback;

    const minutesByDay = workedMinutesByDay(effectiveStart, effectiveEnd, input.shift, input.holidays);
    const sessionMinutes = sumMapValues(minutesByDay);
    if (sessionMinutes <= 0) {
      continue;
    }

    const workerEntry = getOrCreateWorkerEntry(byWorker, session.workerId, fullName);
    for (const day of minutesByDay.keys()) workerEntry.daySet.add(day);

    const sessionHours = sessionMinutes / 60;
    const sessionCost = sessionHours * hourlyCost;

    workerEntry.registeredMinutes += sessionMinutes;
    workerEntry.laborCostCop += sessionCost;

    sessionDetails.push({
      sessionId: session.id,
      workerId: session.workerId,
      fullName,
      kind: session.kind,
      stageId: session.stageId,
      stageName: session.stageId === null ? null : (stageNameById.get(session.stageId) ?? `Etapa ${session.stageId}`),
      activityTypeNames: session.activityTypeIds
        .map((id) => activityNameById.get(id) ?? "Actividad eliminada")
        .sort((a, b) => a.localeCompare(b)),
      note: session.note ?? "",
      machineSerialNumbers: session.machineIds
        .map((machineId) => machineById.get(machineId)?.serialNumber)
        .filter((serial): serial is number => typeof serial === "number")
        .sort((a, b) => a - b),
      isReprocess: session.isReprocess,
      startedAt: session.startedAt,
      endedAt: session.endedAt,
      endReason: session.endReason,
      minutes: sessionMinutes,
    });

    if (session.kind === "other") {
      workerEntry.otherMinutes += sessionMinutes;

      // El tiempo se reparte en partes iguales entre las actividades marcadas,
      // igual que entre varias máquinas: la suma por actividad sigue siendo el
      // tiempo real trabajado, no un múltiplo de él.
      const activityIds = session.activityTypeIds.length > 0 ? session.activityTypeIds : [UNCLASSIFIED_ACTIVITY_ID];
      const perActivityMinutes = splitEqually(sessionMinutes, activityIds);
      const perActivityCost = sessionCost / activityIds.length;

      for (const activityTypeId of activityIds) {
        const minutes = perActivityMinutes.get(activityTypeId) ?? 0;
        const name =
          activityTypeId === UNCLASSIFIED_ACTIVITY_ID
            ? "Sin clasificar"
            : (activityNameById.get(activityTypeId) ?? "Actividad eliminada");

        const activityEntry = byActivityTypeMap.get(activityTypeId);
        if (activityEntry) {
          activityEntry.minutes += minutes;
          activityEntry.laborCostCop += perActivityCost;
          activityEntry.sessionCount += 1;
          activityEntry.workerIds.add(session.workerId);
        } else {
          byActivityTypeMap.set(activityTypeId, {
            activityTypeId,
            name,
            minutes,
            laborCostCop: perActivityCost,
            sessionCount: 1,
            workerCount: 0,
            workerIds: new Set([session.workerId]),
          });
        }

        const workerActivityKey = `${session.workerId}|${activityTypeId}`;
        const workerActivityEntry = byWorkerActivityTypeMap.get(workerActivityKey);
        if (workerActivityEntry) {
          workerActivityEntry.minutes += minutes;
        } else {
          byWorkerActivityTypeMap.set(workerActivityKey, {
            workerId: session.workerId,
            fullName,
            activityTypeId,
            name,
            minutes,
          });
        }
      }

      // Arreglos e instalaciones pueden apuntar a una máquina: ese tiempo se
      // acumula aparte, para no distorsionar la desviación contra el estimado.
      if (session.machineIds.length > 0) {
        const perMachineMinutes = splitEqually(sessionMinutes, session.machineIds);
        const perMachineCost = sessionCost / session.machineIds.length;
        for (const machineId of session.machineIds) {
          const machineEntry = byMachine.get(machineId);
          if (machineEntry) {
            machineEntry.otherMinutes += perMachineMinutes.get(machineId) ?? 0;
            machineEntry.otherCostCop += perMachineCost;
          }
        }
      }

      continue;
    }

    // kind === "stage"
    if (session.stageId === null || session.machineIds.length === 0) {
      // Defensive: DB constraints should prevent this, but don't crash a
      // dashboard over one malformed session.
      continue;
    }

    if (session.isReprocess) {
      workerEntry.reprocessMinutes += sessionMinutes;
    } else {
      workerEntry.machineMinutes += sessionMinutes;
    }

    const perMachineMinutes = splitEqually(sessionMinutes, session.machineIds);
    const perMachineCost = sessionCost / session.machineIds.length;
    const stageName = stageNameById.get(session.stageId) ?? `Etapa ${session.stageId}`;

    for (const machineId of session.machineIds) {
      const minutes = perMachineMinutes.get(machineId) ?? 0;
      const machineEntry = byMachine.get(machineId);
      if (machineEntry) {
        machineEntry.totalMinutes += minutes;
        machineEntry.minutesByStage[session.stageId] = (machineEntry.minutesByStage[session.stageId] ?? 0) + minutes;
        machineEntry.laborCostCop += perMachineCost;
        if (session.isReprocess) {
          machineEntry.reprocessMinutes += minutes;
        }
      }

      const machine = machineById.get(machineId);
      const key = `${session.workerId}|${machineId}|${session.stageId}|${session.isReprocess}`;
      const existing = byWorkerMachineMap.get(key);
      if (existing) {
        existing.minutes += minutes;
      } else {
        byWorkerMachineMap.set(key, {
          workerId: session.workerId,
          fullName,
          machineId,
          serialNumber: machine?.serialNumber ?? 0,
          stageId: session.stageId,
          stageName,
          minutes,
          isReprocess: session.isReprocess,
        });
      }
    }
  }

  // Availability + deviation, once all sessions are folded in.
  for (const entry of byWorker.values()) {
    let availableMinutes = 0;
    for (const day of entry.daySet) {
      availableMinutes += availableShiftMinutes(day, input.shift, input.holidays);
    }
    entry.daysWithRecords = entry.daySet.size;
    entry.availableMinutes = availableMinutes;
    entry.unregisteredMinutes = Math.max(0, availableMinutes - entry.registeredMinutes);
    entry.utilizationPct = availableMinutes > 0 ? (entry.registeredMinutes / availableMinutes) * 100 : null;
  }

  for (const entry of byMachine.values()) {
    if (entry.estimatedHours !== null && entry.estimatedHours > 0) {
      const actualHours = entry.totalMinutes / 60;
      entry.deviationPct = ((actualHours - entry.estimatedHours) / entry.estimatedHours) * 100;
    }
  }

  const today = toFactoryDateKey(now);
  const openSessionsStartedBeforeToday = input.sessions
    .filter((session) => session.endedAt === null && toFactoryDateKey(session.startedAt) < today)
    .map((session) => ({
      sessionId: session.id,
      workerId: session.workerId,
      fullName: workerById.get(session.workerId)?.fullName ?? "Operario sin nombre",
      startedAt: session.startedAt,
    }));

  const totals = buildTotals(byWorker);

  return {
    totals,
    byWorker: [...byWorker.values()].map((entry) => ({
      workerId: entry.workerId,
      fullName: entry.fullName,
      daysWithRecords: entry.daysWithRecords,
      availableMinutes: entry.availableMinutes,
      machineMinutes: entry.machineMinutes,
      reprocessMinutes: entry.reprocessMinutes,
      otherMinutes: entry.otherMinutes,
      registeredMinutes: entry.registeredMinutes,
      unregisteredMinutes: entry.unregisteredMinutes,
      utilizationPct: entry.utilizationPct,
      laborCostCop: entry.laborCostCop,
    })),
    byMachine: [...byMachine.values()],
    byWorkerMachine: [...byWorkerMachineMap.values()],
    byActivityType: [...byActivityTypeMap.values()]
      .map(({ workerIds, ...entry }) => ({ ...entry, workerCount: workerIds.size }))
      .sort((a, b) => b.minutes - a.minutes),
    byWorkerActivityType: [...byWorkerActivityTypeMap.values()],
    sessions: [...sessionDetails].sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()),
    dataQuality: {
      openSessionsStartedBeforeToday,
      doneMarksWithoutSession: {
        count: input.doneMarksWithoutSession?.length ?? 0,
        list: input.doneMarksWithoutSession ?? [],
      },
    },
  };
}

function buildTotals(byWorker: Map<string, LaborByWorker & { daySet: Set<string> }>): LaborTotals {
  let registeredMinutes = 0;
  let machineMinutes = 0;
  let reprocessMinutes = 0;
  let otherMinutes = 0;
  let availableMinutes = 0;
  let laborCostCop = 0;

  for (const entry of byWorker.values()) {
    registeredMinutes += entry.registeredMinutes;
    machineMinutes += entry.machineMinutes;
    reprocessMinutes += entry.reprocessMinutes;
    otherMinutes += entry.otherMinutes;
    availableMinutes += entry.availableMinutes;
    laborCostCop += entry.laborCostCop;
  }

  const unregisteredMinutes = Math.max(0, availableMinutes - registeredMinutes);
  const utilizationPct = availableMinutes > 0 ? (registeredMinutes / availableMinutes) * 100 : null;

  return {
    registeredMinutes,
    machineMinutes,
    reprocessMinutes,
    otherMinutes,
    availableMinutes,
    unregisteredMinutes,
    utilizationPct,
    laborCostCop,
  };
}

function getOrCreateWorkerEntry(
  byWorker: Map<string, LaborByWorker & { daySet: Set<string> }>,
  workerId: string,
  fullName: string,
) {
  const existing = byWorker.get(workerId);
  if (existing) return existing;

  const created: LaborByWorker & { daySet: Set<string> } = {
    workerId,
    fullName,
    daysWithRecords: 0,
    availableMinutes: 0,
    machineMinutes: 0,
    reprocessMinutes: 0,
    otherMinutes: 0,
    registeredMinutes: 0,
    unregisteredMinutes: 0,
    utilizationPct: null,
    laborCostCop: 0,
    daySet: new Set<string>(),
  };
  byWorker.set(workerId, created);
  return created;
}

// ---------------------------------------------------------------------------
// internal helpers
// ---------------------------------------------------------------------------

function dayIntersectionMinutes(
  dateKey: string,
  shift: FactoryShift,
  holidaySet: Set<string>,
  rangeStart: Date,
  rangeEnd: Date,
): number {
  if (holidaySet.has(dateKey)) return 0;

  const endTime = shift.endByWeekday[getDateKeyWeekday(dateKey)];
  if (!endTime) return 0;

  const dayStart = localDateTimeToUtc(dateKey, shift.start);
  const dayEnd = localDateTimeToUtc(dateKey, endTime);
  if (dayEnd <= dayStart) return 0;

  const workIntervals = subtractBreaks(dayStart, dayEnd, shift.breaks, dateKey);

  let minutes = 0;
  for (const [intervalStart, intervalEnd] of workIntervals) {
    const overlapStart = Math.max(intervalStart.getTime(), rangeStart.getTime());
    const overlapEnd = Math.min(intervalEnd.getTime(), rangeEnd.getTime());
    if (overlapEnd > overlapStart) {
      minutes += (overlapEnd - overlapStart) / 60_000;
    }
  }
  return minutes;
}

function subtractBreaks(dayStart: Date, dayEnd: Date, breaks: ShiftBreak[], dateKey: string): Array<[Date, Date]> {
  const breakIntervals = breaks
    .map((shiftBreak): [Date, Date] => {
      const breakStart = localDateTimeToUtc(dateKey, shiftBreak.start);
      const breakEnd = new Date(breakStart.getTime() + shiftBreak.minutes * 60_000);
      return [breakStart, breakEnd];
    })
    .filter(([breakStart, breakEnd]) => breakEnd > dayStart && breakStart < dayEnd)
    .map(([breakStart, breakEnd]): [Date, Date] => [
      new Date(Math.max(breakStart.getTime(), dayStart.getTime())),
      new Date(Math.min(breakEnd.getTime(), dayEnd.getTime())),
    ])
    .sort((a, b) => a[0].getTime() - b[0].getTime());

  const merged: Array<[Date, Date]> = [];
  for (const interval of breakIntervals) {
    const last = merged[merged.length - 1];
    if (last && interval[0].getTime() <= last[1].getTime()) {
      if (interval[1].getTime() > last[1].getTime()) {
        last[1] = interval[1];
      }
    } else {
      merged.push(interval);
    }
  }

  const result: Array<[Date, Date]> = [];
  let cursor = dayStart;
  for (const [breakStart, breakEnd] of merged) {
    if (breakStart.getTime() > cursor.getTime()) {
      result.push([cursor, breakStart]);
    }
    if (breakEnd.getTime() > cursor.getTime()) {
      cursor = breakEnd;
    }
  }
  if (cursor.getTime() < dayEnd.getTime()) {
    result.push([cursor, dayEnd]);
  }
  return result;
}

function sumIntervalMinutes(intervals: Array<[Date, Date]>) {
  let minutes = 0;
  for (const [start, end] of intervals) {
    minutes += (end.getTime() - start.getTime()) / 60_000;
  }
  return minutes;
}

function sumMapValues(map: Map<string, number>) {
  let total = 0;
  for (const value of map.values()) total += value;
  return total;
}

function toHolidaySet(holidays: HolidaySet): Set<string> {
  return holidays instanceof Set ? holidays : new Set(holidays.map((holiday) => holiday.date));
}

function localDateTimeToUtc(dateKey: string, hhmm: string): Date {
  return fromZonedTime(`${dateKey}T${hhmm}:00`, FACTORY_TIME_ZONE);
}

function toFactoryDateKey(date: string | Date): string {
  return formatInTimeZone(date, FACTORY_TIME_ZONE, "yyyy-MM-dd");
}

function addDaysToDateKey(dateKey: string, days: number): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return [date.getUTCFullYear(), pad2(date.getUTCMonth() + 1), pad2(date.getUTCDate())].join("-");
}

function getDateKeyWeekday(dateKey: string): number {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

function maxIso(a: string, b: string): string {
  return new Date(a).getTime() >= new Date(b).getTime() ? a : b;
}

function minIso(a: string, b: string): string {
  return new Date(a).getTime() <= new Date(b).getTime() ? a : b;
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}
