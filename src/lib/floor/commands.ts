/**
 * Comandos de la planta: cada toque del operario que cambia algo. El iPad los
 * guarda en su bandeja de salida con la hora real (`at`) y los manda en orden
 * (`seq`). El `id` lo genera el iPad y hace de llave de idempotencia: reenviar
 * el mismo comando nunca lo aplica dos veces.
 *
 * Versionado: el servidor debe seguir aceptando `v: 1` mientras pueda quedar un
 * iPad con comandos viejos sin enviar. Un cambio de forma = nuevo `v`.
 */

export const FLOOR_COMMAND_VERSION = 1;

export type FloorCommandPayloads = {
  "session.start_stage": {
    workerId: string;
    sessionId: string;
    activityId: string;
    stageId: number;
    machineIds: string[];
  };
  "session.start_other": {
    workerId: string;
    sessionId: string;
    activityId: string;
    activityTypeIds: string[];
    machineIds: string[];
  };
  "session.pause": { workerId: string; sessionId: string };
  "session.finish": { workerId: string; sessionId: string };
  "session.resume": { workerId: string; sessionId: string; activityId: string };
  "activity.finish_paused": { workerId: string; activityId: string };
  "stage.set": { workerId: string; machineId: string; stageId: number; completion: 0 | 100 };
  "previo.set_received": { machineId: string; previoCatalogId: string; received: boolean };
};

export type FloorCommandType = keyof FloorCommandPayloads;

export const FLOOR_COMMAND_TYPES = [
  "session.start_stage",
  "session.start_other",
  "session.pause",
  "session.finish",
  "session.resume",
  "activity.finish_paused",
  "stage.set",
  "previo.set_received",
] as const satisfies readonly FloorCommandType[];

export type FloorCommandOf<K extends FloorCommandType> = {
  id: string;
  v: typeof FLOOR_COMMAND_VERSION;
  /** Consecutivo por dispositivo: el servidor aplica en este orden. */
  seq: number;
  /** Hora real del toque (epoch ms, reloj del iPad). */
  at: number;
  type: K;
  payload: FloorCommandPayloads[K];
};

export type FloorCommand = { [K in FloorCommandType]: FloorCommandOf<K> }[FloorCommandType];

/** Lo que el iPad pide hacer, antes de ponerle id, consecutivo y hora. */
export type FloorIntent = { [K in FloorCommandType]: { type: K; payload: FloorCommandPayloads[K] } }[FloorCommandType];

/** Resultado por comando que devuelve POST /planta/api/piso/sync. */
export type FloorCommandOutcome = {
  id: string;
  status: "applied" | "applied_flagged" | "rejected" | "retry";
  flags: string[];
  error: string | null;
};

export type FloorSyncRequest = {
  deviceId: string;
  /** Reloj del iPad al enviar: el servidor corrige la hora de cada comando si el iPad va adelantado o atrasado. */
  sentAt: number;
  appVersion: string;
  swSupported: boolean;
  pendingCount: number;
  commands: FloorCommand[];
};

export type FloorSyncResponse = { serverTime: number; outcomes: FloorCommandOutcome[] };

/** Texto corto en español de cada comando, para la lista de revisión. */
export const FLOOR_COMMAND_LABELS: Record<FloorCommandType, string> = {
  "session.start_stage": "Iniciar etapa",
  "session.start_other": "Iniciar actividad",
  "session.pause": "Pausar",
  "session.finish": "Terminar",
  "session.resume": "Reanudar",
  "activity.finish_paused": "Terminar pausada",
  "stage.set": "Marcar etapa",
  "previo.set_received": "Recibido de almacén",
};

/** Motivo legible de cada marca que deja el servidor al aplicar un comando con conflicto. */
export const FLOOR_FLAG_LABELS: Record<string, string> = {
  machine_not_in_production: "La máquina ya no estaba en producción; el tiempo se guardó igual.",
  stage_not_marked:
    "La máquina ya no estaba en producción: la etapa no se marcó para no devolverla a producción.",
  already_closed: "La sesión ya estaba cerrada; se dejó la hora de cierre que tenía.",
  superseded: "Alguien cambió esto después desde otro equipo; se dejó el cambio más reciente.",
  closed_unknown_open_session: "El operario tenía otra sesión abierta; se pausó a la hora de este inicio.",
  future_time: "El iPad tenía la hora adelantada; se usó la hora del servidor.",
  old_time: "La acción tenía más de 30 días cuando llegó.",
  not_resumable: "La actividad ya no se podía reanudar; el tiempo se guardó igual.",
};
