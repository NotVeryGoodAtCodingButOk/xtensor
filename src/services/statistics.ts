import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { normalizeMachineLine } from "@/lib/machine-lines";
import type { ProductionSettings } from "@/services/calculations";
import type { Holiday } from "@/services/schedule";
import type { Database, MachineStatus } from "@/types/database";

export const FACTORY_TIME_ZONE = "America/Bogota";
export const WORKDAY_START_HOUR = 8;

export type StatisticsRangePreset = "current-month" | "previous-month" | "last-90-days" | "all-time";

export type StatisticsRange = {
  preset: StatisticsRangePreset;
  label: string;
  startDate: string | null;
  endDate: string | null;
  startAt: Date | null;
  endAt: Date | null;
};

export type MachineTimingInput = {
  id: string;
  senalNumber: number;
  clientName: string;
  equipmentName: string;
  line: string | null;
  colorName: string | null;
  city: string | null;
  promisedDate: string;
  status: MachineStatus;
  createdAt: string;
  shippedAt: string | null;
  stages: StageTimingInput[];
  logs: StageLogTimingInput[];
};

export type StageTimingInput = {
  id: number;
  name: string;
  displayOrder: number;
  completion: number;
  lastUpdatedAt: string | null;
};

export type StageLogTimingInput = {
  id: string;
  stageId: number;
  workerId: string;
  workerName: string | null;
  previousCompletion: number;
  newCompletion: number;
  isReprocess: boolean;
  isUndone: boolean;
  createdAt: string;
};

export type WarrantyEventTimingInput = {
  id: string;
  machineId: string;
  senalNumber: number;
  clientName: string;
  equipmentName: string;
  message: string;
  createdAt: string;
};

export type StageTiming = {
  stageId: number;
  stageName: string;
  displayOrder: number;
  completion: number;
  startAt: string | null;
  completedAt: string | null;
  workingHours: number | null;
  isComplete: boolean;
  isOutOfSequence: boolean;
};

export type CurrentOpenStageTiming = {
  stageId: number;
  stageName: string;
  startedAt: string;
  agingHours: number;
  lastUpdatedAt: string | null;
};

export type MachineTimingStats = {
  id: string;
  senalNumber: number;
  clientName: string;
  equipmentName: string;
  line: string | null;
  colorName: string | null;
  city: string | null;
  promisedDate: string;
  status: MachineStatus;
  createdAt: string;
  shippedAt: string | null;
  productionCompletedAt: string | null;
  productionActualStartAt: string | null;
  productionHours: number | null;
  orderToCompletionHours: number | null;
  shipmentHours: number | null;
  inputToShipmentHours: number | null;
  productionDelayHours: number;
  shipmentDelayHours: number;
  isProductionLate: boolean;
  isShipmentLate: boolean;
  stages: StageTiming[];
  currentOpenStage: CurrentOpenStageTiming | null;
};

export type HourSummary = {
  count: number;
  averageHours: number | null;
  medianHours: number | null;
  p90Hours: number | null;
  maxHours: number | null;
};

export type StageTimingStats = HourSummary & {
  stageId: number;
  stageName: string;
  reprocessCount: number;
};

export type BreakdownTimingStats = HourSummary & {
  label: string;
};

export type WorkerActivityStats = {
  workerId: string;
  workerName: string;
  updateCount: number;
  completionCount: number;
  reprocessCount: number;
  lastActivityAt: string;
};

export type CurrentOpenStageStats = CurrentOpenStageTiming & {
  machineId: string;
  senalNumber: number;
  clientName: string;
  equipmentName: string;
};

export type DataQualityIssue = {
  machineId: string;
  senalNumber: number;
  label: string;
  detail: string;
};

export type StatisticsDashboardData = {
  range: StatisticsRange;
  generatedAt: string;
  summary: {
    production: HourSummary;
    orderToCompletion: HourSummary;
    productionToShipment: HourSummary;
    inputToShipment: HourSummary;
    completedMachinesCount: number;
    shippedMachinesCount: number;
    currentWipCount: number;
    lateProductionCount: number;
    lateShipmentCount: number;
    averageProductionDelayHours: number | null;
    averageShipmentDelayHours: number | null;
    warrantyCount: number;
    reprocessCount: number;
  };
  stages: StageTimingStats[];
  currentOpenStages: CurrentOpenStageStats[];
  warrantyEvents: WarrantyEventTimingInput[];
  breakdowns: {
    byEquipment: BreakdownTimingStats[];
    byLine: BreakdownTimingStats[];
    byClient: BreakdownTimingStats[];
    byCity: BreakdownTimingStats[];
    byColor: BreakdownTimingStats[];
  };
  workers: WorkerActivityStats[];
  dataQuality: {
    missingProductionCompletion: DataQualityIssue[];
    shippedWithoutProductionCompletion: DataQualityIssue[];
    outOfSequenceStages: DataQualityIssue[];
    undoneLogsCount: number;
  };
};

type StageRow = Database["public"]["Tables"]["stages"]["Row"];
type WorkerRow = Database["public"]["Tables"]["workers"]["Row"];
type MachineStageRow = Database["public"]["Tables"]["machine_stages"]["Row"] & {
  stages: StageRow | null;
  workers: WorkerRow | null;
};
type StageLogRow = Database["public"]["Tables"]["stage_logs"]["Row"] & {
  stages: StageRow | null;
  workers: WorkerRow | null;
};
type MachineStatisticsRow = Database["public"]["Tables"]["machines"]["Row"] & {
  clients: Database["public"]["Tables"]["clients"]["Row"] | null;
  colors: Database["public"]["Tables"]["colors"]["Row"] | null;
  equipment_catalog: Database["public"]["Tables"]["equipment_catalog"]["Row"] | null;
  machine_stages: MachineStageRow[];
  stage_logs: StageLogRow[];
};
type WarrantyEventRow = Database["public"]["Tables"]["machine_warranty_events"]["Row"] & {
  machines: Pick<MachineStatisticsRow, "id" | "senal_number" | "clients" | "equipment_catalog"> | null;
};

const STATISTICS_MACHINE_SELECT = `
  *,
  clients(*),
  colors(*),
  equipment_catalog(*),
  machine_stages(
    *,
    stages(*),
    workers(*)
  ),
  stage_logs(
    *,
    stages(*),
    workers(*)
  )
`;

export async function getStatisticsDashboard(input: {
  range: StatisticsRange;
  settings: ProductionSettings;
  holidays: Holiday[];
  now?: Date;
}) {
  const supabase = createSupabaseAdminClient();
  const [machinesResult, warrantyResult] = await Promise.all([
    supabase.from("machines").select(STATISTICS_MACHINE_SELECT).order("created_at", { ascending: true }),
    supabase
      .from("machine_warranty_events")
      .select("*, machines(id, senal_number, clients(*), equipment_catalog(*))")
      .order("created_at", { ascending: false }),
  ]);

  if (machinesResult.error) {
    throw new Error(`No se pudieron cargar las estadísticas: ${machinesResult.error.message}`);
  }
  if (warrantyResult.error) {
    throw new Error(`No se pudieron cargar las garantías: ${warrantyResult.error.message}`);
  }

  return buildStatisticsDashboard({
    machines: (machinesResult.data as unknown as MachineStatisticsRow[]).map(mapStatisticsMachineRow),
    warrantyEvents: (warrantyResult.data as unknown as WarrantyEventRow[]).map(mapWarrantyEventRow),
    range: input.range,
    settings: input.settings,
    holidays: input.holidays,
    now: input.now,
  });
}

export function resolveStatisticsRange(preset: string | undefined, now = new Date()): StatisticsRange {
  const selectedPreset = isStatisticsRangePreset(preset) ? preset : "current-month";
  const today = toFactoryDateKey(now);
  const currentMonthStart = `${today.slice(0, 7)}-01`;
  const nextMonthStart = addMonthsToMonthStart(currentMonthStart, 1);

  if (selectedPreset === "all-time") {
    return {
      preset: selectedPreset,
      label: "Todo el histórico",
      startDate: null,
      endDate: null,
      startAt: null,
      endAt: null,
    };
  }

  if (selectedPreset === "previous-month") {
    const previousMonthStart = addMonthsToMonthStart(currentMonthStart, -1);
    return createRange({
      preset: selectedPreset,
      label: "Mes anterior",
      startDate: previousMonthStart,
      endExclusiveDate: currentMonthStart,
    });
  }

  if (selectedPreset === "last-90-days") {
    return createRange({
      preset: selectedPreset,
      label: "Últimos 90 días",
      startDate: addDaysToDateKey(today, -89),
      endExclusiveDate: addDaysToDateKey(today, 1),
    });
  }

  return createRange({
    preset: "current-month",
    label: "Mes actual",
    startDate: currentMonthStart,
    endExclusiveDate: nextMonthStart,
  });
}

export function buildStatisticsDashboard(input: {
  machines: MachineTimingInput[];
  warrantyEvents: WarrantyEventTimingInput[];
  range: StatisticsRange;
  settings: ProductionSettings;
  holidays: Holiday[];
  now?: Date;
}): StatisticsDashboardData {
  const now = input.now ?? new Date();
  const machineTimings = input.machines.map((machine) =>
    calculateMachineTiming(machine, input.settings, input.holidays, now),
  );
  const completedMachines = machineTimings.filter(
    (machine) => machine.productionCompletedAt && isWithinRange(machine.productionCompletedAt, input.range),
  );
  const shippedMachines = machineTimings.filter(
    (machine) => machine.shippedAt && isWithinRange(machine.shippedAt, input.range),
  );
  const stageEntries = machineTimings.flatMap((machine) =>
    machine.stages
      .filter((stage) => stage.completedAt && isWithinRange(stage.completedAt, input.range))
      .map((stage) => ({ ...stage, machine })),
  );
  const logsInRange = input.machines.flatMap((machine) =>
    machine.logs.filter((log) => isWithinRange(log.createdAt, input.range)),
  );
  const warrantyEvents = input.warrantyEvents.filter((event) => isWithinRange(event.createdAt, input.range));
  const lateProductionDelays = completedMachines
    .filter((machine) => machine.isProductionLate)
    .map((machine) => machine.productionDelayHours);
  const lateShipmentDelays = shippedMachines
    .filter((machine) => machine.isShipmentLate)
    .map((machine) => machine.shipmentDelayHours);

  return {
    range: input.range,
    generatedAt: now.toISOString(),
    summary: {
      production: summarizeHours(completedMachines.map((machine) => machine.productionHours)),
      orderToCompletion: summarizeHours(completedMachines.map((machine) => machine.orderToCompletionHours)),
      productionToShipment: summarizeHours(shippedMachines.map((machine) => machine.shipmentHours)),
      inputToShipment: summarizeHours(shippedMachines.map((machine) => machine.inputToShipmentHours)),
      completedMachinesCount: completedMachines.length,
      shippedMachinesCount: shippedMachines.length,
      currentWipCount: machineTimings.filter((machine) => machine.status === "in_production").length,
      lateProductionCount: completedMachines.filter((machine) => machine.isProductionLate).length,
      lateShipmentCount: shippedMachines.filter((machine) => machine.isShipmentLate).length,
      averageProductionDelayHours: average(lateProductionDelays),
      averageShipmentDelayHours: average(lateShipmentDelays),
      warrantyCount: warrantyEvents.length,
      reprocessCount: logsInRange.filter((log) => log.isReprocess && !log.isUndone).length,
    },
    stages: summarizeStages(stageEntries, logsInRange),
    currentOpenStages: machineTimings
      .filter((machine) => machine.status === "in_production" && machine.currentOpenStage)
      .map((machine) => ({
        ...machine.currentOpenStage!,
        machineId: machine.id,
        senalNumber: machine.senalNumber,
        clientName: machine.clientName,
        equipmentName: machine.equipmentName,
      }))
      .sort((a, b) => b.agingHours - a.agingHours)
      .slice(0, 12),
    warrantyEvents,
    breakdowns: {
      byEquipment: summarizeBreakdown(completedMachines, (machine) => machine.equipmentName),
      byLine: summarizeBreakdown(completedMachines, (machine) => machine.line ?? "Sin línea"),
      byClient: summarizeBreakdown(completedMachines, (machine) => machine.clientName),
      byCity: summarizeBreakdown(completedMachines, (machine) => machine.city ?? "Sin ciudad"),
      byColor: summarizeBreakdown(completedMachines, (machine) => machine.colorName ?? "Sin color"),
    },
    workers: summarizeWorkers(logsInRange),
    dataQuality: {
      missingProductionCompletion: machineTimings
        .filter((machine) => !machine.productionCompletedAt)
        .map((machine) => ({
          machineId: machine.id,
          senalNumber: machine.senalNumber,
          label: machine.equipmentName,
          detail: "No tiene Empacar al 100%.",
        }))
        .slice(0, 12),
      shippedWithoutProductionCompletion: machineTimings
        .filter((machine) => machine.status === "shipped" && !machine.productionCompletedAt)
        .map((machine) => ({
          machineId: machine.id,
          senalNumber: machine.senalNumber,
          label: machine.equipmentName,
          detail: machine.shippedAt ? `Despachada el ${toFactoryDateKey(machine.shippedAt)}.` : "Despachada sin fecha.",
        })),
      outOfSequenceStages: machineTimings.flatMap((machine) =>
        machine.stages
          .filter((stage) => stage.isOutOfSequence)
          .map((stage) => ({
            machineId: machine.id,
            senalNumber: machine.senalNumber,
            label: machine.equipmentName,
            detail: `${stage.stageName} fue completada antes de la etapa previa.`,
          })),
      ),
      undoneLogsCount: logsInRange.filter((log) => log.isUndone).length,
    },
  };
}

export function calculateMachineTiming(
  input: MachineTimingInput,
  settings: ProductionSettings,
  holidays: Holiday[],
  now = new Date(),
): MachineTimingStats {
  const stages = [...input.stages].sort((a, b) => a.displayOrder - b.displayOrder || a.id - b.id);
  const stageTimings: StageTiming[] = [];
  let previousCompletedAt: string | null = null;
  let previousStageWasComplete = true;

  for (const [index, stage] of stages.entries()) {
    const startAt = index === 0 ? input.createdAt : previousCompletedAt;
    const completedAt = resolveStageCompletedAt(stage, input.logs);
    const completedBeforePrevious =
      index > 0 && completedAt !== null && previousCompletedAt !== null && compareIso(completedAt, previousCompletedAt) < 0;
    const completedWithoutPrevious = index > 0 && Boolean(completedAt) && !previousStageWasComplete;
    const workingHours =
      startAt && completedAt && compareIso(completedAt, startAt) >= 0
        ? calculateWorkingHoursBetween(startAt, completedAt, settings, holidays)
        : null;

    stageTimings.push({
      stageId: stage.id,
      stageName: stage.name,
      displayOrder: stage.displayOrder,
      completion: stage.completion,
      startAt,
      completedAt,
      workingHours,
      isComplete: Boolean(completedAt),
      isOutOfSequence: completedBeforePrevious || completedWithoutPrevious,
    });

    previousCompletedAt = completedAt;
    previousStageWasComplete = Boolean(completedAt);
  }

  const productionCompletedAt = stageTimings[stageTimings.length - 1]?.completedAt ?? null;
  const productionActualStartAt =
    input.logs
      .filter((log) => !log.isUndone)
      .sort((a, b) => compareIso(a.createdAt, b.createdAt))[0]?.createdAt ?? null;
  const productionHours =
    productionActualStartAt && productionCompletedAt
      ? calculateWorkingHoursBetween(productionActualStartAt, productionCompletedAt, settings, holidays)
      : null;
  const orderToCompletionHours = productionCompletedAt
    ? calculateWorkingHoursBetween(input.createdAt, productionCompletedAt, settings, holidays)
    : null;
  const shipmentHours =
    productionCompletedAt && input.shippedAt
      ? calculateWorkingHoursBetween(productionCompletedAt, input.shippedAt, settings, holidays)
      : null;
  const inputToShipmentHours = input.shippedAt
    ? calculateWorkingHoursBetween(input.createdAt, input.shippedAt, settings, holidays)
    : null;
  const currentOpenStage = resolveCurrentOpenStage(stageTimings, input, settings, holidays, now);

  return {
    id: input.id,
    senalNumber: input.senalNumber,
    clientName: input.clientName,
    equipmentName: input.equipmentName,
    line: input.line,
    colorName: input.colorName,
    city: input.city,
    promisedDate: input.promisedDate,
    status: input.status,
    createdAt: input.createdAt,
    shippedAt: input.shippedAt,
    productionCompletedAt,
    productionActualStartAt,
    productionHours,
    orderToCompletionHours,
    shipmentHours,
    inputToShipmentHours,
    productionDelayHours: productionCompletedAt
      ? calculateDelayAfterPromise(input.promisedDate, productionCompletedAt, settings, holidays)
      : 0,
    shipmentDelayHours: input.shippedAt
      ? calculateDelayAfterPromise(input.promisedDate, input.shippedAt, settings, holidays)
      : 0,
    isProductionLate: productionCompletedAt ? toFactoryDateKey(productionCompletedAt) > input.promisedDate : false,
    isShipmentLate: input.shippedAt ? toFactoryDateKey(input.shippedAt) > input.promisedDate : false,
    stages: stageTimings,
    currentOpenStage,
  };
}

export function calculateWorkingHoursBetween(
  startInput: string | Date,
  endInput: string | Date,
  settings: ProductionSettings,
  holidays: Holiday[],
) {
  const start = typeof startInput === "string" ? new Date(startInput) : startInput;
  const end = typeof endInput === "string" ? new Date(endInput) : endInput;

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end.getTime() <= start.getTime()) {
    return 0;
  }

  const holidayDates = new Set(holidays.map((holiday) => holiday.date));
  let dateKey = toFactoryDateKey(start);
  const endDateKey = toFactoryDateKey(end);
  let workingMilliseconds = 0;

  while (dateKey <= endDateKey) {
    const dailyHours = getDailyWorkingHours(dateKey, settings, holidayDates);

    if (dailyHours > 0) {
      const dayStart = localFactoryDateTimeToUtc(dateKey, WORKDAY_START_HOUR);
      const dayEnd = localFactoryDateTimeToUtc(dateKey, WORKDAY_START_HOUR + dailyHours);
      const overlapStart = Math.max(start.getTime(), dayStart.getTime());
      const overlapEnd = Math.min(end.getTime(), dayEnd.getTime());

      if (overlapEnd > overlapStart) {
        workingMilliseconds += overlapEnd - overlapStart;
      }
    }

    dateKey = addDaysToDateKey(dateKey, 1);
  }

  return workingMilliseconds / 3_600_000;
}

export function toFactoryDateKey(date: string | Date) {
  return formatInTimeZone(date, FACTORY_TIME_ZONE, "yyyy-MM-dd");
}

function mapStatisticsMachineRow(row: MachineStatisticsRow): MachineTimingInput {
  const equipmentName = row.equipment_catalog?.name ?? row.custom_equipment_name ?? "Producto personalizado";

  return {
    id: row.id,
    senalNumber: row.senal_number,
    clientName: row.clients?.name ?? "Cliente sin nombre",
    equipmentName,
    line: normalizeMachineLine(row.line_override ?? row.equipment_catalog?.line),
    colorName: row.colors?.name ?? null,
    city: row.city,
    promisedDate: row.promised_date,
    status: row.status,
    createdAt: row.created_at,
    shippedAt: row.shipped_at,
    stages: row.machine_stages.map((stage) => ({
      id: stage.stage_id,
      name: stage.stages?.name ?? `Etapa ${stage.stage_id}`,
      displayOrder: stage.stages?.display_order ?? stage.stage_id,
      completion: stage.completion,
      lastUpdatedAt: stage.last_updated_at,
    })),
    logs: row.stage_logs.map((log) => ({
      id: log.id,
      stageId: log.stage_id,
      workerId: log.worker_id,
      workerName: log.workers?.full_name ?? null,
      previousCompletion: log.previous_completion,
      newCompletion: log.new_completion,
      isReprocess: log.is_reprocess,
      isUndone: log.is_undone,
      createdAt: log.created_at,
    })),
  };
}

function mapWarrantyEventRow(row: WarrantyEventRow): WarrantyEventTimingInput {
  return {
    id: row.id,
    machineId: row.machine_id,
    senalNumber: row.senal_number,
    clientName: row.machines?.clients?.name ?? "Cliente sin nombre",
    equipmentName: row.machines?.equipment_catalog?.name ?? "Producto personalizado",
    message: row.message,
    createdAt: row.created_at,
  };
}

function resolveStageCompletedAt(stage: StageTimingInput, logs: StageLogTimingInput[]) {
  if (stage.completion !== 100) {
    return null;
  }

  const latestCompletionLog = logs
    .filter((log) => log.stageId === stage.id && log.newCompletion === 100 && !log.isUndone)
    .sort((a, b) => compareIso(b.createdAt, a.createdAt))[0];

  return latestCompletionLog?.createdAt ?? stage.lastUpdatedAt;
}

function resolveCurrentOpenStage(
  stageTimings: StageTiming[],
  input: MachineTimingInput,
  settings: ProductionSettings,
  holidays: Holiday[],
  now: Date,
): CurrentOpenStageTiming | null {
  const openStage = stageTimings.find((stage) => !stage.isComplete);

  if (!openStage?.startAt) {
    return null;
  }

  const sourceStage = input.stages.find((stage) => stage.id === openStage.stageId);

  return {
    stageId: openStage.stageId,
    stageName: openStage.stageName,
    startedAt: openStage.startAt,
    agingHours: calculateWorkingHoursBetween(openStage.startAt, now, settings, holidays),
    lastUpdatedAt: sourceStage?.lastUpdatedAt ?? null,
  };
}

function summarizeStages(
  entries: Array<StageTiming & { machine: MachineTimingStats }>,
  logs: StageLogTimingInput[],
): StageTimingStats[] {
  const byStage = new Map<number, Array<StageTiming & { machine: MachineTimingStats }>>();
  const reprocessByStage = new Map<number, number>();

  for (const entry of entries) {
    const current = byStage.get(entry.stageId) ?? [];
    current.push(entry);
    byStage.set(entry.stageId, current);
  }

  for (const log of logs) {
    if (!log.isReprocess || log.isUndone) {
      continue;
    }
    reprocessByStage.set(log.stageId, (reprocessByStage.get(log.stageId) ?? 0) + 1);
  }

  return [...byStage.entries()]
    .map(([stageId, stageEntries]) => ({
      stageId,
      stageName: stageEntries[0]?.stageName ?? `Etapa ${stageId}`,
      reprocessCount: reprocessByStage.get(stageId) ?? 0,
      ...summarizeHours(stageEntries.map((entry) => entry.workingHours)),
    }))
    .sort((a, b) => (b.p90Hours ?? 0) - (a.p90Hours ?? 0));
}

function summarizeBreakdown(
  machines: MachineTimingStats[],
  getLabel: (machine: MachineTimingStats) => string,
): BreakdownTimingStats[] {
  const byLabel = new Map<string, number[]>();

  for (const machine of machines) {
    if (machine.productionHours === null) continue;
    const label = getLabel(machine).trim() || "Sin dato";
    byLabel.set(label, [...(byLabel.get(label) ?? []), machine.productionHours]);
  }

  return [...byLabel.entries()]
    .map(([label, values]) => ({ label, ...summarizeHours(values) }))
    .sort((a, b) => (b.averageHours ?? 0) - (a.averageHours ?? 0))
    .slice(0, 10);
}

function summarizeWorkers(logs: StageLogTimingInput[]): WorkerActivityStats[] {
  const byWorker = new Map<string, WorkerActivityStats>();

  for (const log of logs.filter((item) => !item.isUndone)) {
    const current = byWorker.get(log.workerId) ?? {
      workerId: log.workerId,
      workerName: log.workerName ?? "Operario sin nombre",
      updateCount: 0,
      completionCount: 0,
      reprocessCount: 0,
      lastActivityAt: log.createdAt,
    };

    current.updateCount += 1;
    if (log.newCompletion === 100) {
      current.completionCount += 1;
    }
    if (log.isReprocess) {
      current.reprocessCount += 1;
    }
    if (compareIso(log.createdAt, current.lastActivityAt) > 0) {
      current.lastActivityAt = log.createdAt;
    }
    byWorker.set(log.workerId, current);
  }

  return [...byWorker.values()].sort((a, b) => b.updateCount - a.updateCount || compareIso(b.lastActivityAt, a.lastActivityAt));
}

function summarizeHours(values: Array<number | null | undefined>): HourSummary {
  const cleanValues = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));

  if (cleanValues.length === 0) {
    return {
      count: 0,
      averageHours: null,
      medianHours: null,
      p90Hours: null,
      maxHours: null,
    };
  }

  const sortedValues = [...cleanValues].sort((a, b) => a - b);

  return {
    count: cleanValues.length,
    averageHours: average(cleanValues),
    medianHours: percentile(sortedValues, 50),
    p90Hours: percentile(sortedValues, 90),
    maxHours: sortedValues[sortedValues.length - 1],
  };
}

function average(values: number[]) {
  if (values.length === 0) {
    return null;
  }

  return values.reduce((total, value) => total + value, 0) / values.length;
}

function percentile(sortedValues: number[], percentileValue: number) {
  if (sortedValues.length === 0) {
    return null;
  }

  const index = Math.min(
    sortedValues.length - 1,
    Math.max(0, Math.ceil((percentileValue / 100) * sortedValues.length) - 1),
  );
  return sortedValues[index];
}

function calculateDelayAfterPromise(
  promisedDate: string,
  actualAt: string,
  settings: ProductionSettings,
  holidays: Holiday[],
) {
  if (toFactoryDateKey(actualAt) <= promisedDate) {
    return 0;
  }

  return calculateWorkingHoursBetween(
    localFactoryDateTimeToUtc(promisedDate, 23 + 59 / 60 + 59 / 3600),
    actualAt,
    settings,
    holidays,
  );
}

function isWithinRange(value: string | Date, range: StatisticsRange) {
  const date = typeof value === "string" ? new Date(value) : value;
  const timestamp = date.getTime();

  if (range.startAt && timestamp < range.startAt.getTime()) {
    return false;
  }
  if (range.endAt && timestamp >= range.endAt.getTime()) {
    return false;
  }

  return true;
}

function createRange(input: {
  preset: StatisticsRangePreset;
  label: string;
  startDate: string;
  endExclusiveDate: string;
}): StatisticsRange {
  return {
    preset: input.preset,
    label: input.label,
    startDate: input.startDate,
    endDate: addDaysToDateKey(input.endExclusiveDate, -1),
    startAt: localFactoryDateTimeToUtc(input.startDate, 0),
    endAt: localFactoryDateTimeToUtc(input.endExclusiveDate, 0),
  };
}

function isStatisticsRangePreset(value: string | undefined): value is StatisticsRangePreset {
  return value === "current-month" || value === "previous-month" || value === "last-90-days" || value === "all-time";
}

function getDailyWorkingHours(
  dateKey: string,
  settings: ProductionSettings,
  holidayDates: Set<string>,
) {
  if (holidayDates.has(dateKey)) {
    return 0;
  }

  const day = getDateKeyWeekday(dateKey);
  if (day === 0) {
    return settings.dailyHoursSun;
  }
  if (day === 6) {
    return settings.dailyHoursSat;
  }

  return settings.dailyHoursMonFri;
}

function localFactoryDateTimeToUtc(dateKey: string, hourDecimal: number) {
  const totalMinutes = Math.max(0, Math.round(hourDecimal * 60));
  const dateOffset = Math.floor(totalMinutes / 1440);
  const minuteOfDay = totalMinutes % 1440;
  const localDateKey = addDaysToDateKey(dateKey, dateOffset);
  const hours = Math.floor(minuteOfDay / 60);
  const minutes = minuteOfDay % 60;

  return fromZonedTime(
    `${localDateKey}T${pad2(hours)}:${pad2(minutes)}:00`,
    FACTORY_TIME_ZONE,
  );
}

function addDaysToDateKey(dateKey: string, days: number) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));

  return [
    date.getUTCFullYear(),
    pad2(date.getUTCMonth() + 1),
    pad2(date.getUTCDate()),
  ].join("-");
}

function addMonthsToMonthStart(dateKey: string, months: number) {
  const [year, month] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1 + months, 1));

  return [
    date.getUTCFullYear(),
    pad2(date.getUTCMonth() + 1),
    "01",
  ].join("-");
}

function getDateKeyWeekday(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

function compareIso(left: string, right: string) {
  return new Date(left).getTime() - new Date(right).getTime();
}

function pad2(value: number) {
  return String(value).padStart(2, "0");
}
