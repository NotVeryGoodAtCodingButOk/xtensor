import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { DEFAULT_STAGES, estimateTotalHours } from "@/services/calculations";
import { listHolidays, listWorkers } from "@/services/catalog";
import {
  shiftFromSettings,
  summarizeLabor,
  type FactoryShift,
  type LaborMachineInput,
  type LaborStageInput,
  type LaborSummary,
  type LaborWorkerInput,
} from "@/services/labor-time";
import { getSettings, mapSettings } from "@/services/settings";
import type { ProductionSettings } from "@/services/calculations";
import { listDoneMarksWithoutSession, listSessionsOverlapping } from "@/services/work-sessions";
import type { Database } from "@/types/database";

// Kept in this module rather than split out (see task notes): the fetching
// function below imports the admin client, but only *invokes* it inside a
// function body — module load never touches Supabase/env, same pattern
// already used by src/services/statistics.ts. Safe for resolveLaborRange's
// unit tests to import from this file directly.
const FACTORY_TIME_ZONE = "America/Bogota";

export type LaborRangePreset = "hoy" | "esta-semana" | "este-mes" | "mes-pasado" | "ultimos-30-dias";

export type LaborRange = {
  preset: LaborRangePreset;
  label: string;
  startIso: string;
  endIso: string;
};

const RANGE_LABELS: Record<LaborRangePreset, string> = {
  hoy: "Hoy",
  "esta-semana": "Esta semana",
  "este-mes": "Este mes",
  "mes-pasado": "Mes pasado",
  "ultimos-30-dias": "Últimos 30 días",
};

const DEFAULT_PRESET: LaborRangePreset = "esta-semana";

/**
 * Resolves a labor-dashboard range preset into concrete UTC instants,
 * computed against Bogota-local calendar days. `endIso` is the exclusive
 * end of the period (e.g. the start of next Monday for "esta-semana") —
 * `summarizeLabor` clips open sessions to `now` anyway, so an end-of-period
 * boundary in the future is harmless.
 */
export function resolveLaborRange(preset: string | undefined, now: Date = new Date()): LaborRange {
  const selected = isLaborRangePreset(preset) ? preset : DEFAULT_PRESET;
  const todayKey = toFactoryDateKey(now);

  let startDateKey: string;
  let endExclusiveDateKey: string;

  switch (selected) {
    case "hoy": {
      startDateKey = todayKey;
      endExclusiveDateKey = addDaysToDateKey(todayKey, 1);
      break;
    }
    case "esta-semana": {
      const weekday = getDateKeyWeekday(todayKey); // 0=Sun..6=Sat
      const daysSinceMonday = weekday === 0 ? 6 : weekday - 1;
      startDateKey = addDaysToDateKey(todayKey, -daysSinceMonday);
      endExclusiveDateKey = addDaysToDateKey(startDateKey, 7);
      break;
    }
    case "este-mes": {
      startDateKey = `${todayKey.slice(0, 7)}-01`;
      endExclusiveDateKey = addMonthsToMonthStart(startDateKey, 1);
      break;
    }
    case "mes-pasado": {
      const currentMonthStart = `${todayKey.slice(0, 7)}-01`;
      startDateKey = addMonthsToMonthStart(currentMonthStart, -1);
      endExclusiveDateKey = currentMonthStart;
      break;
    }
    case "ultimos-30-dias": {
      startDateKey = addDaysToDateKey(todayKey, -29);
      endExclusiveDateKey = addDaysToDateKey(todayKey, 1);
      break;
    }
  }

  return {
    preset: selected,
    label: RANGE_LABELS[selected],
    startIso: localDateTimeToUtc(startDateKey, "00:00").toISOString(),
    endIso: localDateTimeToUtc(endExclusiveDateKey, "00:00").toISOString(),
  };
}

function isLaborRangePreset(value: string | undefined): value is LaborRangePreset {
  return value === "hoy" || value === "esta-semana" || value === "este-mes" || value === "mes-pasado" || value === "ultimos-30-dias";
}

// ---------------------------------------------------------------------------
// getLaborDashboard
// ---------------------------------------------------------------------------

export type LaborDashboard = {
  range: LaborRange;
  stages: LaborStageInput[];
  shift: FactoryShift;
  settings: ProductionSettings;
  summary: LaborSummary;
};

type LaborMachineRow = Pick<
  Database["public"]["Tables"]["machines"]["Row"],
  "id" | "serial_number" | "sale_price_cop" | "custom_equipment_name"
> & {
  equipment_catalog: { name: string } | null;
  clients: { name: string } | null;
  machine_warranty_events: Array<{ id: string }>;
};

export async function getLaborDashboard(range: LaborRange): Promise<LaborDashboard> {
  const [sessions, doneMarksWithoutSession, settingsRow, holidays, workerRows] = await Promise.all([
    listSessionsOverlapping(range.startIso, range.endIso),
    listDoneMarksWithoutSession(range.startIso, range.endIso),
    getSettings(),
    listHolidays(),
    listWorkers(),
  ]);

  const settings = mapSettings(settingsRow);
  const shift = shiftFromSettings(settings);
  const stages: LaborStageInput[] = DEFAULT_STAGES.map((stage) => ({ id: stage.id, name: stage.name }));

  const machineIds = [...new Set(sessions.flatMap((session) => session.machineIds))];
  const machines = machineIds.length > 0 ? await fetchLaborMachines(machineIds) : [];

  const workers: LaborWorkerInput[] = workerRows.map((worker) => ({
    id: worker.id,
    fullName: worker.full_name,
    hourlyCostCop: worker.hourly_cost_cop,
  }));

  const summary = summarizeLabor({
    sessions,
    workers,
    machines,
    stages,
    shift,
    holidays,
    range: { startIso: range.startIso, endIso: range.endIso },
    now: new Date(),
    hourlyCostFallback: settings.hourlyCostPerWorkerCop,
    estimateHours: (salePriceCop) => estimateTotalHours(salePriceCop, settings),
    doneMarksWithoutSession,
  });

  // Historical sessions of inactive workers still need their names resolved
  // (handled above by passing every worker to summarizeLabor), but an
  // inactive worker with no sessions in range shouldn't show up as a zero row.
  const activeWorkerIds = new Set(workerRows.filter((worker) => worker.is_active).map((worker) => worker.id));
  const byWorker = summary.byWorker.filter((worker) => activeWorkerIds.has(worker.workerId) || worker.daysWithRecords > 0);

  return {
    range,
    stages,
    shift,
    settings,
    summary: { ...summary, byWorker },
  };
}

async function fetchLaborMachines(machineIds: string[]): Promise<LaborMachineInput[]> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("machines")
    .select("id, serial_number, sale_price_cop, custom_equipment_name, equipment_catalog(name), clients(name), machine_warranty_events(id)")
    .in("id", machineIds);

  if (error) {
    throw new Error(`No se pudieron cargar las máquinas: ${error.message}`);
  }

  const rows = (data ?? []) as unknown as LaborMachineRow[];

  return rows.map((row) => {
    const equipmentName = row.equipment_catalog?.name ?? row.custom_equipment_name ?? "Producto personalizado";
    const clientName = row.clients?.name ?? "Cliente sin nombre";

    return {
      id: row.id,
      serialNumber: row.serial_number,
      label: `${equipmentName} · ${clientName}`,
      salePriceCop: Number(row.sale_price_cop) || 0,
      isWarranty: (row.machine_warranty_events?.length ?? 0) > 0,
    };
  });
}

// ---------------------------------------------------------------------------
// internal date helpers (Bogota-local calendar days; duplicated in a couple
// of modules on purpose — see src/services/labor-time.ts for the rationale)
// ---------------------------------------------------------------------------

function toFactoryDateKey(date: Date): string {
  return formatInTimeZone(date, FACTORY_TIME_ZONE, "yyyy-MM-dd");
}

function localDateTimeToUtc(dateKey: string, hhmm: string): Date {
  return fromZonedTime(`${dateKey}T${hhmm}:00`, FACTORY_TIME_ZONE);
}

function addDaysToDateKey(dateKey: string, days: number): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return [date.getUTCFullYear(), pad2(date.getUTCMonth() + 1), pad2(date.getUTCDate())].join("-");
}

function addMonthsToMonthStart(dateKey: string, months: number): string {
  const [year, month] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1 + months, 1));
  return [date.getUTCFullYear(), pad2(date.getUTCMonth() + 1), "01"].join("-");
}

function getDateKeyWeekday(dateKey: string): number {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}
