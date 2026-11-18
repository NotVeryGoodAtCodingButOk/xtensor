/**
 * Modelo de datos de la planta sin conexión. El servidor arma un FloorSnapshot
 * (GET /planta/api/piso), el iPad lo guarda y encima aplica los comandos que
 * aún no ha enviado (ver state.ts). Todas las horas son epoch ms.
 *
 * Sin dependencias de React ni de Supabase: lo usan el iPad y el servidor.
 */

export const FLOOR_SNAPSHOT_VERSION = 1;

export type FloorWorker = { id: string; name: string; role: string; color: string | null };

export type FloorStage = { id: number; name: string };

export type FloorStageProgress = {
  completion: 0 | 100;
  /** Última marca de "hecha" vigente (no deshecha): define si un 100→0 es corrección o reproceso. */
  lastDoneAt: number | null;
  /** La última bitácora vigente fue un reproceso: la próxima sesión de la etapa cuenta como reproceso. */
  lastIsReprocess: boolean;
};

export type FloorMachineStatus = "pending" | "in_production" | "finished" | "shipped" | "on_hold";

export type FloorMachine = {
  id: string;
  serial: number;
  code: string | null;
  name: string;
  client: string;
  city: string | null;
  color: string | null;
  status: FloorMachineStatus;
  order: number;
  /** Avance por id de etapa. */
  stages: Record<number, FloorStageProgress>;
};

export type FloorActivityMachineStatus = "in_production" | "finished" | "shipped";

/** Máquinas a las que se les puede asociar una actividad (5S no; empaque, arreglos sí). */
export type FloorActivityMachine = {
  id: string;
  serial: number;
  name: string;
  client: string;
  status: FloorActivityMachineStatus;
};

export type FloorActivityType = { id: string; name: string; description: string | null; allowsMachine: boolean };

export type FloorSegment = {
  id: string;
  startedAt: number;
  endedAt: number | null;
  endReason: "completed" | "paused" | null;
};

/**
 * Una actividad = cadena de tramos (work_sessions con el mismo activity_id).
 * El snapshot solo trae las abiertas y las pausadas que se pueden reanudar.
 */
export type FloorActivity = {
  activityId: string;
  workerId: string;
  kind: "stage" | "other";
  stageId: number | null;
  activityTypeIds: string[];
  note: string | null;
  isReprocess: boolean;
  machineIds: string[];
  /** Serial de cada máquina, en el mismo orden que machineIds. */
  machineSerials: number[];
  segments: FloorSegment[];
};

export type FloorPrevio = { previoCatalogId: string; name: string; received: boolean };

export type FloorPrevioRow = {
  machineId: string;
  serial: number;
  client: string;
  equipment: string;
  color: string | null;
  promisedDate: string;
  previos: FloorPrevio[];
};

export type FloorSnapshot = {
  version: typeof FLOOR_SNAPSHOT_VERSION;
  /** Hora del servidor al armar el snapshot. */
  serverTime: number;
  workers: FloorWorker[];
  stages: FloorStage[];
  /** Máquinas en producción. */
  machines: FloorMachine[];
  activityMachines: FloorActivityMachine[];
  activityTypes: FloorActivityType[];
  activities: FloorActivity[];
  /** Almacén: máquinas pendientes y en producción con sus previos. */
  previoRows: FloorPrevioRow[];
};
