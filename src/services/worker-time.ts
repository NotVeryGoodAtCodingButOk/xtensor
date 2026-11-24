import { DEFAULT_STAGES } from "@/services/calculations";
import { getLaborDashboard, type LaborRange } from "@/services/labor-dashboard";
import type { LaborSummary } from "@/services/labor-time";

// Estadísticas → Tiempos operarios: en qué se le fue el tiempo a cada operario
// dentro de un rango (horas por etapa + actividades sin etapa). Sale del mismo
// resumen que Horas-hombre, así que las cifras cuadran con esa pestaña.

/** Menos de un minuto = toques de prueba, no trabajo: no se grafica. */
const MIN_VISIBLE_HOURS = 1 / 60;

export type WorkerTimeStage = {
  stageId: number;
  stageName: string;
  /** Incluye reproceso. */
  hours: number;
  reprocessHours: number;
};

export type WorkerTimeActivity = {
  activityTypeId: string;
  name: string;
  hours: number;
};

export type WorkerTimeRow = {
  workerId: string;
  fullName: string;
  /** Etapas + actividades = horas registradas con cronómetro en el rango. */
  totalHours: number;
  byStage: WorkerTimeStage[];
  activityHours: number;
  /** Mayor a menor. */
  activities: WorkerTimeActivity[];
};

export type WorkerTimeReport = {
  range: LaborRange;
  workers: WorkerTimeRow[];
};

export async function getWorkerTimeReport(range: LaborRange): Promise<WorkerTimeReport> {
  const dashboard = await getLaborDashboard(range);
  return { range, workers: buildWorkerTimeRows(dashboard.summary) };
}

/** Una fila por operario con al menos un minuto registrado, de más a menos horas. */
export function buildWorkerTimeRows(
  summary: Pick<LaborSummary, "byWorker" | "byWorkerMachine" | "byWorkerActivityType">,
): WorkerTimeRow[] {
  const orderedStages = [...DEFAULT_STAGES].sort((a, b) => a.displayOrder - b.displayOrder);

  return summary.byWorker
    .map((worker) => {
      const stageMinutes = new Map<number, number>();
      const reprocessMinutes = new Map<number, number>();
      for (const entry of summary.byWorkerMachine) {
        if (entry.workerId !== worker.workerId) continue;
        stageMinutes.set(entry.stageId, (stageMinutes.get(entry.stageId) ?? 0) + entry.minutes);
        if (entry.isReprocess) {
          reprocessMinutes.set(entry.stageId, (reprocessMinutes.get(entry.stageId) ?? 0) + entry.minutes);
        }
      }

      const byStage = orderedStages.map((stage) => ({
        stageId: stage.id,
        stageName: stage.name,
        hours: (stageMinutes.get(stage.id) ?? 0) / 60,
        reprocessHours: (reprocessMinutes.get(stage.id) ?? 0) / 60,
      }));

      const activities = summary.byWorkerActivityType
        .filter((entry) => entry.workerId === worker.workerId && entry.minutes > 0)
        .map((entry) => ({ activityTypeId: entry.activityTypeId, name: entry.name, hours: entry.minutes / 60 }))
        .sort((a, b) => b.hours - a.hours);
      const activityHours = activities.reduce((sum, activity) => sum + activity.hours, 0);

      return {
        workerId: worker.workerId,
        fullName: worker.fullName,
        totalHours: byStage.reduce((sum, stage) => sum + stage.hours, 0) + activityHours,
        byStage,
        activityHours,
        activities,
      };
    })
    .filter((row) => row.totalHours >= MIN_VISIBLE_HOURS)
    .sort((a, b) => b.totalHours - a.totalHours);
}
