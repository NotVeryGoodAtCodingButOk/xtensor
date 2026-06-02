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

export type ProductionSettings = {
  hourlyCostPerWorkerCop: number;
  laborFactor: number;
  dailyHoursMonFri: number;
  dailyHoursSat: number;
  dailyHoursSun: number;
  activeWorkersCount: number;
  clientBufferDays: number;
  shippedRetentionDays: number;
};

export type QueueMachineInput = {
  id: string;
  salePriceCop: number;
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
  dailyHoursMonFri: 9,
  dailyHoursSat: 6,
  dailyHoursSun: 0,
  activeWorkersCount: 9,
  clientBufferDays: 3,
  shippedRetentionDays: 60,
};

export function estimateTotalHours(salePriceCop: number, settings: ProductionSettings) {
  if (settings.hourlyCostPerWorkerCop <= 0) {
    throw new Error("El costo hora debe ser mayor que cero.");
  }

  return (salePriceCop * settings.laborFactor) / settings.hourlyCostPerWorkerCop;
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
      const totalHours = estimateTotalHours(machine.salePriceCop, settings);
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

function clampCompletion(value: number) {
  if (![0, 25, 50, 75, 100].includes(value)) {
    throw new Error(`Avance de etapa inválido: ${value}`);
  }

  return value;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
