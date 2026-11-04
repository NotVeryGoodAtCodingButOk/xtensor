export type StageDefinition = {
  id: number;
  name: string;
  completionPercentage: number;
  displayOrder: number;
};

export type StageProgress = {
  stageId: number;
  completion: number;
};

export type ShiftBreak = {
  start: string; // "HH:mm"
  minutes: number;
};

export type ProductionSettings = {
  hourlyCostPerWorkerCop: number;
  laborFactor: number;
  dailyHoursMonFri: number;
  dailyHoursFri: number;
  dailyHoursSat: number;
  dailyHoursSun: number;
  activeWorkersCount: number;
  clientBufferDays: number;
  shippedRetentionDays: number;
  // Factory shift window (labor-time capture) — see src/services/labor-time.ts.
  shiftStart: string; // "HH:mm"
  shiftEndMonThu: string; // "HH:mm"
  shiftEndFri: string; // "HH:mm"
  shiftEndSat: string | null; // "HH:mm", null = no Saturday shift
  shiftBreaks: ShiftBreak[];
};

export type QueueMachineInput = {
  id: string;
  salePriceCop: number;
  /** % MO del equipo (fracción). null/undefined = settings.laborFactor. */
  laborFactor?: number | null;
  orderPosition: number;
  promisedDate: string;
  stages: StageProgress[];
};

export type QueueMachineCalculation = {
  machineId: string;
  progressPct: number;
  totalHours: number;
  remainingHours: number;
  remainingHumanDays: number;
  accumulatedHours: number;
};

export const DEFAULT_STAGES: StageDefinition[] = [
  { id: 1, name: "Material", completionPercentage: 20, displayOrder: 1 },
  { id: 2, name: "Armar", completionPercentage: 40, displayOrder: 2 },
  { id: 3, name: "Resoldar", completionPercentage: 50, displayOrder: 3 },
  { id: 4, name: "Pulir", completionPercentage: 70, displayOrder: 4 },
  { id: 5, name: "Pintar", completionPercentage: 80, displayOrder: 5 },
  { id: 6, name: "Ensamblar", completionPercentage: 90, displayOrder: 6 },
  { id: 7, name: "Empacar", completionPercentage: 100, displayOrder: 7 },
];

export const DEFAULT_SETTINGS: ProductionSettings = {
  hourlyCostPerWorkerCop: 22019.57,
  laborFactor: 0.3,
  dailyHoursMonFri: 8.25,
  dailyHoursFri: 5.75,
  dailyHoursSat: 0,
  dailyHoursSun: 0,
  activeWorkersCount: 9,
  clientBufferDays: 3,
  shippedRetentionDays: 60,
  shiftStart: "08:00",
  shiftEndMonThu: "17:00",
  shiftEndFri: "14:30",
  shiftEndSat: null,
  shiftBreaks: [
    { start: "09:00", minutes: 15 },
    { start: "12:00", minutes: 30 },
  ],
};

/**
 * Horas máximas de mano de obra de una máquina: venta × % MO ÷ costo hora
 * promedio de planta. El % es el del equipo en el catálogo; si el equipo no
 * tiene % propio (null/undefined) se usa el general de Configuración.
 */
export function estimateTotalHours(
  salePriceCop: number,
  settings: ProductionSettings,
  laborFactor?: number | null,
) {
  if (settings.hourlyCostPerWorkerCop <= 0) {
    throw new Error("El costo hora debe ser mayor que cero.");
  }

  return (salePriceCop * resolveLaborFactor(laborFactor, settings).laborFactor) / settings.hourlyCostPerWorkerCop;
}

/** % MO efectivo de un equipo: el suyo si es válido (0 < f ≤ 1), si no el general. */
export function resolveLaborFactor(
  equipmentLaborFactor: number | null | undefined,
  settings: Pick<ProductionSettings, "laborFactor">,
): { laborFactor: number; source: "catalogo" | "general" } {
  if (
    typeof equipmentLaborFactor === "number" &&
    Number.isFinite(equipmentLaborFactor) &&
    equipmentLaborFactor > 0 &&
    equipmentLaborFactor <= 1
  ) {
    return { laborFactor: equipmentLaborFactor, source: "catalogo" };
  }

  return { laborFactor: settings.laborFactor, source: "general" };
}

export const LABOR_PCT_ERROR = "El % de mano de obra debe estar entre 1 y 100.";

/**
 * % de mano de obra escrito por una persona (formulario o Excel), en %:
 * "30", "32,5", "32.5", "35 %". Vacío = null (el equipo usa el % general).
 * Devuelve la fracción (0.325) o un error si no está entre 1 y 100.
 */
export function parseLaborPct(
  value: string | number | null | undefined,
): { ok: true; laborFactor: number | null } | { ok: false; error: string } {
  if (value === null || value === undefined) {
    return { ok: true, laborFactor: null };
  }

  const text = String(value).replace(/%/g, "").replace(/\s+/g, "").replace(",", ".");
  if (!text) {
    return { ok: true, laborFactor: null };
  }

  const pct = /^\d+(\.\d+)?$/.test(text) ? Number(text) : Number.NaN;
  if (!Number.isFinite(pct) || pct < 1 || pct > 100) {
    return { ok: false, error: LABOR_PCT_ERROR };
  }

  // Redondeo a 4 decimales de fracción (0,01 %) para no guardar ruido de coma flotante.
  return { ok: true, laborFactor: Math.round(pct * 100) / 10_000 };
}

/** Margen (en fracción de avance) antes de marcar una máquina "en riesgo". */
export const BUDGET_RISK_MARGIN = 0.1;

/**
 * Estado del presupuesto de horas de una máquina:
 * - excedida: ya registró más horas que las máximas.
 * - riesgo: sin terminar, ha consumido más del presupuesto de lo que ha avanzado (+10 pp de margen).
 * - ok: lo demás, incluido "sin presupuesto" (venta 0).
 */
export function budgetStatus(input: {
  budgetHours: number;
  spentHours: number;
  progressPct: number;
  isFinished: boolean;
}): "ok" | "riesgo" | "excedida" {
  if (!(input.budgetHours > 0)) {
    return "ok";
  }

  if (input.spentHours > input.budgetHours) {
    return "excedida";
  }

  if (!input.isFinished && input.spentHours / input.budgetHours > clamp(input.progressPct, 0, 1) + BUDGET_RISK_MARGIN) {
    return "riesgo";
  }

  return "ok";
}

export function calculateProgressPct(
  stageProgress: StageProgress[],
  stages: StageDefinition[] = DEFAULT_STAGES,
) {
  const progressByStage = new Map(stageProgress.map((stage) => [stage.stageId, stage.completion]));
  const sortedStages = [...stages].sort((a, b) => a.displayOrder - b.displayOrder);

  let previousThreshold = 0;
  let progress = 0;

  for (const stage of sortedStages) {
    const intervalWeight = stage.completionPercentage - previousThreshold;
    const completion = clampCompletion(progressByStage.get(stage.id) ?? 0);
    progress += intervalWeight * (completion / 100);
    previousThreshold = stage.completionPercentage;
  }

  return clamp(progress / 100, 0, 1);
}

export function calculateRemainingHours(totalHours: number, progressPct: number) {
  return Math.max(0, totalHours * (1 - clamp(progressPct, 0, 1)));
}

export function calculateRemainingHumanDays(remainingHours: number, settings: ProductionSettings) {
  if (settings.dailyHoursMonFri <= 0) {
    throw new Error("Las horas diarias deben ser mayores que cero.");
  }

  return remainingHours / settings.dailyHoursMonFri;
}

export function calculateQueue(
  machines: QueueMachineInput[],
  settings: ProductionSettings,
  stages: StageDefinition[] = DEFAULT_STAGES,
) {
  let accumulatedHours = 0;

  return [...machines]
    .sort((a, b) => a.orderPosition - b.orderPosition)
    .map<QueueMachineCalculation>((machine) => {
      const progressPct = calculateProgressPct(machine.stages, stages);
      const totalHours = estimateTotalHours(machine.salePriceCop, settings, machine.laborFactor);
      const remainingHours = calculateRemainingHours(totalHours, progressPct);
      const remainingHumanDays = calculateRemainingHumanDays(remainingHours, settings);
      accumulatedHours += remainingHours;

      return {
        machineId: machine.id,
        progressPct,
        totalHours,
        remainingHours,
        remainingHumanDays,
        accumulatedHours,
      };
    });
}

/**
 * A machine is "behind" its reestimate when the live estimatedDate has
 * slipped past the reestimated_date baseline (snapshotted when it entered
 * the queue or the queue was last reordered). A null baseline never flags
 * as late — it means no snapshot exists yet.
 */
export function isBehindReestimate(machine: { estimatedDate: string; reestimatedDate: string | null }): boolean {
  return machine.estimatedDate > (machine.reestimatedDate ?? machine.estimatedDate);
}

function clampCompletion(value: number) {
  if (![0, 25, 50, 75, 100].includes(value)) {
    throw new Error(`Avance de etapa inválido: ${value}`);
  }

  return value;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
