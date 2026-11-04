import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { MACHINE_LINE_VALUES, normalizeMachineLine } from "@/lib/machine-lines";
import { listActivityTypes } from "@/services/activity-types";
import {
  budgetStatus,
  calculateProgressPct,
  DEFAULT_STAGES,
  estimateTotalHours,
  resolveLaborFactor,
  type ProductionSettings,
} from "@/services/calculations";
import { listHolidays, listWorkers } from "@/services/catalog";
import {
  shiftFromSettings,
  summarizeMachineLabor,
  UNCLASSIFIED_ACTIVITY_ID,
  workedMinutes,
  type FactoryShift,
  type HolidaySet,
  type LaborActivityTypeInput,
  type LaborSessionInput,
  type LaborWorkerInput,
  type MachineLaborTotals,
} from "@/services/labor-time";
import { toLaborFactorOrNull } from "@/services/machines";
import { getSettings, mapSettings } from "@/services/settings";
import { getFirstSessionStartedAt, listSessionsForMachines } from "@/services/work-sessions";
import type { Database, MachineStatus } from "@/types/database";
import type { CalculatedMachineView } from "@/types/domain";
import type {
  EquipmentLaborRow,
  MachineLaborActivityRow,
  MachineLaborDetail,
  MachineLaborFilters,
  MachineLaborReport,
  MachineLaborRow,
  MachineLaborSessionRow,
  MachineLaborSnapshot,
  MachineLaborStageRow,
  MachineLaborStatusFilter,
  MachineLaborWorkerRow,
} from "@/types/labor-report";

// Horas de mano de obra de toda la vida por máquina: presupuesto (horas
// máximas) vs. llevadas, % MO esperado vs. real y la ficha de cada máquina.
// Las funciones build* son puras (testeables sin Supabase); el admin client
// solo se invoca dentro de las funciones async.

const CUSTOM_EQUIPMENT_GROUP_NAME = "Productos personalizados";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const STATUS_FILTERS: Record<MachineLaborStatusFilter, MachineStatus[]> = {
  "en-produccion": ["in_production"],
  terminadas: ["finished"],
  despachadas: ["shipped"],
  todas: ["in_production", "finished", "shipped"],
};

/** Lo que el reporte necesita de una máquina (sale de la base o de un CalculatedMachineView). */
export type MachineLaborSource = {
  id: string;
  serialNumber: number;
  equipmentId: string | null;
  equipmentName: string;
  clientName: string;
  line: string | null;
  status: MachineStatus;
  /** 0..1 */
  progressPct: number;
  salePriceCop: number;
  /** equipment_catalog.labor_factor crudo; null = usa el % general. */
  equipmentLaborFactor: number | null;
  productionStartedAt: string | null;
  completedAt: string | null;
  shippedAt: string | null;
  promisedDate: string;
  reestimatedDate: string | null;
};

type LaborContext = {
  settings: ProductionSettings;
  shift: FactoryShift;
  holidays: HolidaySet;
  workers: LaborWorkerInput[];
};

// ---------------------------------------------------------------------------
// Servicios
// ---------------------------------------------------------------------------

/** Totales de toda la vida por máquina (todas las pedidas están en el Map, aunque no tengan sesiones). */
export async function getMachineLaborTotals(machineIds: string[]): Promise<Map<string, MachineLaborTotals>> {
  const ids = [...new Set(machineIds.filter(Boolean))];
  if (ids.length === 0) {
    return new Map();
  }

  return computeMachineLaborTotals(ids, await loadLaborContext());
}

/**
 * Agrega `labor` (horas máximas, llevadas, % consumido y estado) a cada
 * máquina. Las horas máximas usan el % vigente del equipo, también para las
 * terminadas; en las terminadas/despachadas las llevadas son las finales.
 */
export async function attachMachineLabor<T extends CalculatedMachineView>(
  machines: T[],
  settings: ProductionSettings,
): Promise<Array<T & { labor: MachineLaborSnapshot }>> {
  const [totals, trackingSince] = await Promise.all([
    getMachineLaborTotals(machines.map((machine) => machine.id)),
    getFirstSessionStartedAt(),
  ]);
  return machines.map((machine) => ({
    ...machine,
    labor: buildMachineLaborSnapshot(machine, totals.get(machine.id), settings, trackingSince),
  }));
}

/** Filtros de /admin/estadisticas/maquinas (?estado=&linea=&equipo=); valores inválidos → defecto. */
export function resolveMachineLaborFilters(params: { estado?: string; linea?: string; equipo?: string }): MachineLaborFilters {
  const estado = params.estado && params.estado in STATUS_FILTERS ? (params.estado as MachineLaborStatusFilter) : "todas";
  const linea = MACHINE_LINE_VALUES.find((value) => value === params.linea?.trim()) ?? null;
  const equipo = params.equipo && UUID_PATTERN.test(params.equipo.trim()) ? params.equipo.trim() : null;
  return { estado, linea, equipo };
}

export async function getMachineLaborReport(filters: MachineLaborFilters): Promise<MachineLaborReport> {
  const [context, trackingSince, machineRows] = await Promise.all([
    loadLaborContext(),
    getFirstSessionStartedAt(),
    fetchReportMachines(filters),
  ]);

  const sources = machineRows
    .map(mapReportMachine)
    .filter((machine) => filters.linea === null || machine.line === filters.linea);
  const totals = await computeMachineLaborTotals(
    sources.map((machine) => machine.id),
    context,
  );
  const rows = sources
    .map((machine) => buildMachineLaborRow(machine, totals.get(machine.id), context.settings, trackingSince))
    .sort((a, b) => b.serialNumber - a.serialNumber);

  return {
    filters,
    machines: rows,
    byEquipment: buildEquipmentLaborRows(rows),
    totals: summarizeMachineLaborRows(rows),
    trackingSince,
  };
}

export async function getMachineLaborDetail(machineId: string): Promise<MachineLaborDetail | null> {
  if (!UUID_PATTERN.test(machineId)) {
    return null;
  }

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.from("machines").select(REPORT_MACHINE_SELECT).eq("id", machineId).maybeSingle();
  if (error) {
    throw new Error(`No se pudo cargar la máquina: ${error.message}`);
  }
  if (!data) {
    return null;
  }

  const machine = mapReportMachine(data as unknown as ReportMachineRow);
  const [context, trackingSince, sessions, activityTypeRows] = await Promise.all([
    loadLaborContext(),
    getFirstSessionStartedAt(),
    listSessionsForMachines([machine.id]),
    listActivityTypes(),
  ]);
  const now = new Date();
  const totals = summarizeMachineLabor({
    sessions,
    workers: context.workers,
    shift: context.shift,
    holidays: context.holidays,
    now,
    hourlyCostFallback: context.settings.hourlyCostPerWorkerCop,
    machineIds: [machine.id],
  }).get(machine.id);

  return buildMachineLaborDetail({
    machine,
    row: buildMachineLaborRow(machine, totals, context.settings, trackingSince),
    totals,
    sessions,
    workers: context.workers,
    activityTypes: activityTypeRows.map((type) => ({ id: type.id, name: type.name })),
    shift: context.shift,
    holidays: context.holidays,
    now,
  });
}

// ---------------------------------------------------------------------------
// Funciones puras
// ---------------------------------------------------------------------------

/**
 * Datos parciales: no hay cronómetros aún, la máquina entró a producción antes
 * del primero, o terminó sin horas de producción. Una máquina en curso que
 * entró después y todavía no tiene horas NO es parcial: simplemente va en 0.
 */
export function hasPartialLaborData(input: {
  productionStartedAt: string | null;
  isFinal: boolean;
  productionMinutes: number;
  trackingSince: string | null;
}): boolean {
  if (input.trackingSince === null) return true;
  const startedBeforeTracking =
    input.productionStartedAt !== null &&
    new Date(input.productionStartedAt).getTime() < new Date(input.trackingSince).getTime();
  return startedBeforeTracking || (input.isFinal && input.productionMinutes <= 0);
}

export function buildMachineLaborSnapshot(
  machine: Pick<MachineLaborSource, "salePriceCop" | "equipmentLaborFactor" | "status" | "progressPct" | "productionStartedAt">,
  totals: MachineLaborTotals | undefined,
  settings: ProductionSettings,
  trackingSince: string | null = null,
): MachineLaborSnapshot {
  const budgetHours = safeBudgetHours(machine.salePriceCop, settings, machine.equipmentLaborFactor);
  const spentHours = (totals?.productionMinutes ?? 0) / 60;
  const isFinal = machine.status === "finished" || machine.status === "shipped";

  return {
    budgetHours,
    spentHours,
    reprocessHours: (totals?.reprocessMinutes ?? 0) / 60,
    spentPct: budgetHours > 0 ? spentHours / budgetHours : null,
    status: budgetStatus({ budgetHours, spentHours, progressPct: machine.progressPct, isFinished: isFinal }),
    isFinal,
    hasPartialData: hasPartialLaborData({
      productionStartedAt: machine.productionStartedAt,
      isFinal,
      productionMinutes: totals?.productionMinutes ?? 0,
      trackingSince,
    }),
  };
}

export function buildMachineLaborRow(
  machine: MachineLaborSource,
  totals: MachineLaborTotals | undefined,
  settings: ProductionSettings,
  trackingSince: string | null,
): MachineLaborRow {
  const snapshot = buildMachineLaborSnapshot(machine, totals, settings, trackingSince);
  const { laborFactor, source } = resolveLaborFactor(machine.equipmentLaborFactor, settings);
  const realCostCop = totals?.productionCostCop ?? 0;

  return {
    machineId: machine.id,
    serialNumber: machine.serialNumber,
    equipmentId: machine.equipmentId,
    equipmentName: machine.equipmentName,
    clientName: machine.clientName,
    line: machine.line,
    status: machine.status,
    progressPct: machine.progressPct,
    salePriceCop: machine.salePriceCop,
    laborFactor,
    laborFactorSource: source,
    budgetHours: snapshot.budgetHours,
    spentHours: snapshot.spentHours,
    reprocessHours: snapshot.reprocessHours,
    spentPct: snapshot.spentPct,
    budgetStatus: snapshot.status,
    extraHours: (totals?.extraMinutes ?? 0) / 60,
    realCostCop,
    extraCostCop: totals?.extraCostCop ?? 0,
    realLaborPct: machine.salePriceCop > 0 ? realCostCop / machine.salePriceCop : null,
    hasPartialData: snapshot.hasPartialData,
    productionStartedAt: machine.productionStartedAt,
    completedAt: machine.completedAt,
    shippedAt: machine.shippedAt,
  };
}

/** Entra en los promedios: terminada o despachada y con datos completos. */
export function countsForAverages(row: Pick<MachineLaborRow, "status" | "hasPartialData">): boolean {
  return (row.status === "finished" || row.status === "shipped") && !row.hasPartialData;
}

/**
 * Agrupa por equipo del catálogo (null = productos personalizados sin
 * equipo). Promedios solo de las máquinas que cuentan (countsForAverages);
 * totalRealCostCop suma todas las máquinas del grupo en el filtro. Todos los
 * grupos presentes salen, los que no tienen datos completos con promedios en
 * null. Orden: machineCount desc, luego nombre.
 */
export function buildEquipmentLaborRows(rows: MachineLaborRow[]): EquipmentLaborRow[] {
  const groups = new Map<string, MachineLaborRow[]>();
  for (const row of rows) {
    const key = row.equipmentId ?? "";
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }

  return [...groups.values()]
    .map((group) => {
      const first = group[0];
      const averaged = group.filter(countsForAverages);
      return {
        equipmentId: first.equipmentId,
        equipmentName: first.equipmentId === null ? CUSTOM_EQUIPMENT_GROUP_NAME : first.equipmentName,
        line: first.line,
        laborFactor: first.laborFactor,
        laborFactorSource: first.laborFactorSource,
        machineCount: averaged.length,
        avgBudgetHours: average(averaged.map((row) => row.budgetHours)),
        avgSpentHours: average(averaged.map((row) => row.spentHours)),
        avgSpentPct: average(averaged.map((row) => row.spentPct)),
        avgRealLaborPct: average(averaged.map((row) => row.realLaborPct)),
        totalRealCostCop: group.reduce((sum, row) => sum + row.realCostCop, 0),
      };
    })
    .sort((a, b) => b.machineCount - a.machineCount || a.equipmentName.localeCompare(b.equipmentName));
}

export function summarizeMachineLaborRows(rows: MachineLaborRow[]): MachineLaborReport["totals"] {
  const averaged = rows.filter(countsForAverages);
  return {
    machineCount: rows.length,
    overBudgetCount: rows.filter((row) => row.budgetStatus === "excedida").length,
    atRiskCount: rows.filter((row) => row.budgetStatus === "riesgo").length,
    avgExpectedLaborPct: average(averaged.map((row) => row.laborFactor)),
    avgRealLaborPct: average(averaged.map((row) => row.realLaborPct)),
  };
}

export function buildMachineLaborDetail(input: {
  machine: Pick<MachineLaborSource, "id" | "promisedDate" | "reestimatedDate">;
  row: MachineLaborRow;
  totals: MachineLaborTotals | undefined;
  /** Sesiones de la máquina, cada una con TODAS sus máquinas. */
  sessions: LaborSessionInput[];
  workers: LaborWorkerInput[];
  activityTypes: LaborActivityTypeInput[];
  shift: FactoryShift;
  holidays: HolidaySet;
  now: Date;
}): MachineLaborDetail {
  const { row, totals } = input;
  const workerNameById = new Map(input.workers.map((worker) => [worker.id, worker.fullName]));
  const activityNameById = new Map(input.activityTypes.map((type) => [type.id, type.name]));
  const activityName = (id: string) =>
    id === UNCLASSIFIED_ACTIVITY_ID ? "Sin clasificar" : (activityNameById.get(id) ?? "Actividad eliminada");

  let previousThreshold = 0;
  const byStage: MachineLaborStageRow[] = [...DEFAULT_STAGES]
    .sort((a, b) => a.displayOrder - b.displayOrder)
    .map((stage) => {
      const weight = (stage.completionPercentage - previousThreshold) / 100;
      previousThreshold = stage.completionPercentage;
      return {
        stageId: stage.id,
        stageName: stage.name,
        expectedHours: row.budgetHours * weight,
        spentHours: (totals?.minutesByStage[stage.id] ?? 0) / 60,
        reprocessHours: (totals?.reprocessMinutesByStage[stage.id] ?? 0) / 60,
      };
    });

  const byWorker: MachineLaborWorkerRow[] = Object.entries(totals?.minutesByWorker ?? {})
    .map(([workerId, minutes]) => ({
      workerId,
      fullName: workerNameById.get(workerId) ?? "Operario sin nombre",
      hours: minutes / 60,
      costCop: totals?.costByWorker[workerId] ?? 0,
    }))
    .sort((a, b) => b.hours - a.hours);

  const extraByActivity: MachineLaborActivityRow[] = Object.entries(totals?.extraMinutesByActivityType ?? {})
    .map(([activityTypeId, minutes]) => ({
      activityTypeId,
      name: activityName(activityTypeId),
      hours: minutes / 60,
      costCop: totals?.extraCostByActivityType[activityTypeId] ?? 0,
    }))
    .sort((a, b) => b.hours - a.hours);

  const stageNameById = new Map(DEFAULT_STAGES.map((stage) => [stage.id, stage.name]));
  const nowIso = input.now.toISOString();
  const sessions: MachineLaborSessionRow[] = [];
  for (const session of input.sessions) {
    if (!session.machineIds.includes(input.machine.id)) continue;
    if (session.kind === "stage" && session.stageId === null) continue;

    const minutes =
      workedMinutes(session.startedAt, session.endedAt ?? nowIso, input.shift, input.holidays) / session.machineIds.length;
    if (minutes <= 0) continue;

    const label =
      session.kind === "stage"
        ? (stageNameById.get(session.stageId as number) ?? `Etapa ${session.stageId}`)
        : session.activityTypeIds.length > 0
          ? session.activityTypeIds.map(activityName).join(", ")
          : session.note?.trim() || "Sin clasificar";

    sessions.push({
      sessionId: session.id,
      workerName: workerNameById.get(session.workerId) ?? "Operario sin nombre",
      kind: session.kind,
      label,
      isReprocess: session.isReprocess,
      startedAt: session.startedAt,
      endedAt: session.endedAt,
      minutes,
      sharedWith: session.machineIds.length,
    });
  }
  sessions.sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());

  return {
    machine: row,
    promisedDate: input.machine.promisedDate,
    reestimatedDate: input.machine.reestimatedDate,
    byStage,
    byWorker,
    extraByActivity,
    sessions,
  };
}

// ---------------------------------------------------------------------------
// Internos
// ---------------------------------------------------------------------------

const REPORT_MACHINE_SELECT = `
  id, serial_number, status, sale_price_cop, equipment_id, custom_equipment_name, line_override,
  production_started_at, completed_at, shipped_at, promised_date, reestimated_date,
  equipment_catalog(name, line, labor_factor),
  clients(name),
  machine_stages(stage_id, completion)
`;

type ReportMachineRow = Pick<
  Database["public"]["Tables"]["machines"]["Row"],
  | "id"
  | "serial_number"
  | "status"
  | "sale_price_cop"
  | "equipment_id"
  | "custom_equipment_name"
  | "line_override"
  | "production_started_at"
  | "completed_at"
  | "shipped_at"
  | "promised_date"
  | "reestimated_date"
> & {
  equipment_catalog: { name: string; line: string | null; labor_factor: number | string | null } | null;
  clients: { name: string } | null;
  machine_stages: Array<{ stage_id: number; completion: number }>;
};

async function loadLaborContext(): Promise<LaborContext> {
  const [settingsRow, holidays, workerRows] = await Promise.all([getSettings(), listHolidays(), listWorkers()]);
  const settings = mapSettings(settingsRow);
  return {
    settings,
    shift: shiftFromSettings(settings),
    holidays,
    workers: workerRows.map((worker) => ({
      id: worker.id,
      fullName: worker.full_name,
      hourlyCostCop: worker.hourly_cost_cop === null ? null : Number(worker.hourly_cost_cop),
    })),
  };
}

async function computeMachineLaborTotals(machineIds: string[], context: LaborContext) {
  const sessions = await listSessionsForMachines(machineIds);
  return summarizeMachineLabor({
    sessions,
    workers: context.workers,
    shift: context.shift,
    holidays: context.holidays,
    now: new Date(),
    hourlyCostFallback: context.settings.hourlyCostPerWorkerCop,
    machineIds,
  });
}

async function fetchReportMachines(filters: MachineLaborFilters): Promise<ReportMachineRow[]> {
  const supabase = createSupabaseAdminClient();
  const PAGE = 1000;
  const rows: ReportMachineRow[] = [];

  for (let from = 0; ; from += PAGE) {
    let query = supabase
      .from("machines")
      .select(REPORT_MACHINE_SELECT)
      .in("status", STATUS_FILTERS[filters.estado])
      .order("serial_number", { ascending: false })
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (filters.equipo) {
      query = query.eq("equipment_id", filters.equipo);
    }

    const { data, error } = await query;
    if (error) {
      throw new Error(`No se pudieron cargar las máquinas: ${error.message}`);
    }
    rows.push(...((data ?? []) as unknown as ReportMachineRow[]));
    if ((data ?? []).length < PAGE) break;
  }

  return rows;
}

function mapReportMachine(row: ReportMachineRow): MachineLaborSource {
  return {
    id: row.id,
    serialNumber: row.serial_number,
    equipmentId: row.equipment_id,
    equipmentName: row.equipment_catalog?.name ?? row.custom_equipment_name ?? "Producto personalizado",
    clientName: row.clients?.name ?? "Cliente sin nombre",
    line: normalizeMachineLine(row.line_override ?? row.equipment_catalog?.line),
    status: row.status,
    progressPct: progressOf(row),
    salePriceCop: Number(row.sale_price_cop) || 0,
    equipmentLaborFactor: toLaborFactorOrNull(row.equipment_catalog?.labor_factor),
    productionStartedAt: row.production_started_at,
    completedAt: row.completed_at,
    shippedAt: row.shipped_at,
    promisedDate: row.promised_date,
    reestimatedDate: row.reestimated_date,
  };
}

/** Terminadas y despachadas cuentan como 100% (igual que calculateMachines fuera de la cola). */
function progressOf(row: ReportMachineRow): number {
  if (row.status === "finished" || row.status === "shipped") {
    return 1;
  }
  try {
    return calculateProgressPct(
      (row.machine_stages ?? []).map((stage) => ({ stageId: stage.stage_id, completion: stage.completion })),
    );
  } catch {
    return 0;
  }
}

function safeBudgetHours(salePriceCop: number, settings: ProductionSettings, laborFactor: number | null): number {
  if (!(salePriceCop > 0)) {
    return 0;
  }
  try {
    return estimateTotalHours(salePriceCop, settings, laborFactor);
  } catch {
    return 0;
  }
}

function average(values: Array<number | null>): number | null {
  const present = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  return present.length > 0 ? present.reduce((sum, value) => sum + value, 0) / present.length : null;
}
