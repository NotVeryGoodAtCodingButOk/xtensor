/**
 * Formas que pintan los componentes de planta, derivadas del estado proyectado
 * (state.ts). Puras: sin React.
 */
import { describeOpenSession } from "@/lib/work-session-ui";
import {
  activityTypeNames,
  closedSegmentsMs,
  openActivityOf,
  pausedActivitiesOf,
  stageName,
  type FloorState,
} from "@/lib/floor/state";
import type { FloorActivity } from "@/lib/floor/types";

export type FloorSessionMachine = { id: string; serialNumber: number };

/** La sesión abierta del operario, como la pinta la barra "En curso" y la tarjeta de etapa. */
export type FloorSessionView = {
  /** Tramo abierto: es el que se pausa o termina. */
  id: string;
  activityId: string;
  kind: "stage" | "other";
  stageId: number | null;
  stageName: string | null;
  activityTypes: Array<{ id: string; name: string }>;
  note: string | null;
  isReprocess: boolean;
  /** ISO del inicio del tramo abierto (reloj del iPad). */
  startedAt: string;
  /** Tiempo de los tramos anteriores (antes de pausar). */
  accumulatedMs: number;
  machines: FloorSessionMachine[];
};

export type FloorPausedView = {
  activityId: string;
  stageId: number;
  stageName: string | null;
  accumulatedMs: number;
  machines: FloorSessionMachine[];
};

export function openSessionView(state: FloorState, workerId: string): FloorSessionView | null {
  const activity = openActivityOf(state, workerId);
  const open = activity?.segments.find((segment) => segment.endedAt === null);
  if (!activity || !open) return null;

  return {
    id: open.id,
    activityId: activity.activityId,
    kind: activity.kind,
    stageId: activity.stageId,
    stageName: stageName(state, activity.stageId),
    activityTypes: activity.activityTypeIds
      .map((id) => ({ id, name: state.activityTypes.find((type) => type.id === id)?.name ?? "Actividad" }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    note: activity.note,
    isReprocess: activity.isReprocess,
    startedAt: new Date(open.startedAt).toISOString(),
    accumulatedMs: closedSegmentsMs(activity),
    machines: sessionMachines(activity),
  };
}

export function pausedViews(state: FloorState, workerId: string): FloorPausedView[] {
  return pausedActivitiesOf(state, workerId).map((activity) => ({
    activityId: activity.activityId,
    stageId: activity.stageId as number,
    stageName: stageName(state, activity.stageId),
    accumulatedMs: closedSegmentsMs(activity),
    machines: sessionMachines(activity),
  }));
}

/** "En curso: Pulir · #12" por operario, para el selector. */
export function workerBadges(state: FloorState): Map<string, string> {
  const badges = new Map<string, string>();
  for (const worker of state.workers) {
    const activity = openActivityOf(state, worker.id);
    if (!activity) continue;
    badges.set(
      worker.id,
      describeOpenSession({
        kind: activity.kind,
        stageName: stageName(state, activity.stageId),
        activityTypeNames: activityTypeNames(state, activity),
        note: activity.note,
        machineSerialNumbers: [...activity.machineSerials].sort((a, b) => a - b),
      }),
    );
  }
  return badges;
}

function sessionMachines(activity: FloorActivity): FloorSessionMachine[] {
  return activity.machineIds
    .map((id, index) => ({ id, serialNumber: activity.machineSerials[index] ?? 0 }))
    .sort((a, b) => a.serialNumber - b.serialNumber);
}
