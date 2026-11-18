/**
 * Núcleo puro de la planta sin conexión: aplica comandos sobre el último
 * snapshot del servidor para obtener lo que ve el operario. Las reglas son las
 * mismas que validaba el servidor antes (mismos mensajes), así el iPad rechaza
 * al instante lo que no tiene sentido y acepta el resto aunque no haya red.
 *
 * Sin React ni Supabase: se prueba directo en tests/unit/floor-state.test.ts.
 */
import { classifyStageRevert } from "@/services/stage-revert";
import type { FloorCommand, FloorCommandOf } from "@/lib/floor/commands";
import type {
  FloorActivity,
  FloorActivityMachine,
  FloorActivityType,
  FloorMachine,
  FloorPrevioRow,
  FloorSegment,
  FloorSnapshot,
  FloorStage,
  FloorWorker,
} from "@/lib/floor/types";

/** Ventana para que un 100→0 cuente como corrección de un toque equivocado y no como reproceso. */
export const REPROCESS_GRACE_MINUTES = 5;

export type FloorState = {
  workers: FloorWorker[];
  stages: FloorStage[];
  /** Máquinas en producción (y las que el iPad terminó hasta el próximo snapshot), por id. */
  machines: Record<string, FloorMachine>;
  activityMachines: FloorActivityMachine[];
  activityTypes: FloorActivityType[];
  activities: FloorActivity[];
  previoRows: FloorPrevioRow[];
};

export type FloorEffects = {
  /** Máquinas a las que este comando les cerró la última etapa. */
  finishedMachineIds: string[];
  revert: "undo" | "reprocess" | null;
  /** No cambia nada (p. ej. marcar hecha una etapa ya hecha): no se guarda el comando. */
  noop: boolean;
};

export type ApplyResult = { ok: true; state: FloorState; effects: FloorEffects } | { ok: false; error: string };

export const NO_EFFECTS: FloorEffects = { finishedMachineIds: [], revert: null, noop: false };

const OPEN_SESSION_MESSAGE = "Termina o pausa lo que tienes en curso.";

/**
 * Estado base a partir del snapshot. `clockOffsetMs` = hora del servidor − hora
 * del iPad: las horas del servidor se pasan al reloj del iPad para que los
 * cronómetros (que cuentan con Date.now()) salgan bien.
 */
export function stateFromSnapshot(snapshot: FloorSnapshot, clockOffsetMs = 0): FloorState {
  const shift = (ms: number | null) => (ms === null ? null : ms - clockOffsetMs);

  const machines: Record<string, FloorMachine> = {};
  for (const machine of snapshot.machines) {
    const stages: FloorMachine["stages"] = {};
    for (const [stageId, progress] of Object.entries(machine.stages)) {
      stages[Number(stageId)] = { ...progress, lastDoneAt: shift(progress.lastDoneAt) };
    }
    machines[machine.id] = { ...machine, stages };
  }

  return {
    workers: snapshot.workers,
    stages: snapshot.stages,
    machines,
    activityMachines: snapshot.activityMachines,
    activityTypes: snapshot.activityTypes,
    activities: snapshot.activities.map((activity) => ({
      ...activity,
      segments: activity.segments.map((segment) => ({
        ...segment,
        startedAt: segment.startedAt - clockOffsetMs,
        endedAt: shift(segment.endedAt),
      })),
    })),
    previoRows: snapshot.previoRows,
  };
}

/** Aplica en orden; un comando que ya no aplica se salta (el servidor decide al sincronizar). */
export function projectState(base: FloorState, commands: FloorCommand[]): FloorState {
  let state = base;
  for (const command of commands) {
    const result = applyCommand(state, command);
    if (result.ok) state = result.state;
  }
  return state;
}

export function applyCommand(state: FloorState, command: FloorCommand): ApplyResult {
  switch (command.type) {
    case "session.start_stage":
      return startStage(state, command);
    case "session.start_other":
      return startOther(state, command);
    case "session.pause":
      return closeOpenSegment(state, command, "paused");
    case "session.finish":
      return closeOpenSegment(state, command, "completed");
    case "session.resume":
      return resume(state, command);
    case "activity.finish_paused":
      return finishPaused(state, command);
    case "stage.set":
      return setStage(state, command);
    case "previo.set_received":
      return setPrevioReceived(state, command);
  }
}

// ── Consultas ────────────────────────────────────────────────────────────────

export function openActivityOf(state: FloorState, workerId: string): FloorActivity | null {
  return state.activities.find((activity) => activity.workerId === workerId && isOpen(activity)) ?? null;
}

/** Tiempo de los tramos ya cerrados. */
export function closedSegmentsMs(activity: FloorActivity): number {
  let total = 0;
  for (const segment of activity.segments) {
    if (segment.endedAt !== null && segment.endedAt > segment.startedAt) {
      total += segment.endedAt - segment.startedAt;
    }
  }
  return total;
}

/** Todos los tramos cerrados, ninguno terminado, y el último cerrado con Pausar. */
export function isResumable(activity: FloorActivity): boolean {
  const { segments } = activity;
  if (segments.length === 0) return false;
  if (segments.some((segment) => segment.endedAt === null || segment.endReason === "completed")) return false;
  return segments[segments.length - 1].endReason === "paused";
}

/**
 * Lo que el operario dejó pausado y puede reanudar, la pausa más reciente
 * primero. Igual que listPausedActivities en el servidor: etapa pendiente en al
 * menos una máquina, todas en producción, y una sola por etapa + máquinas.
 */
export function pausedActivitiesOf(state: FloorState, workerId: string): FloorActivity[] {
  const candidates = state.activities
    .filter(
      (activity) =>
        activity.workerId === workerId &&
        activity.kind === "stage" &&
        activity.stageId !== null &&
        activity.machineIds.length > 0 &&
        isResumable(activity) &&
        activity.machineIds.every((id) => state.machines[id]?.status === "in_production") &&
        activity.machineIds.some((id) => state.machines[id]?.stages[activity.stageId as number]?.completion !== 100),
    )
    .sort((a, b) => pausedAt(b) - pausedAt(a));

  const latestByWork = new Map<string, FloorActivity>();
  for (const activity of candidates) {
    const key = `${activity.stageId}|${[...activity.machineIds].sort().join(",")}`;
    if (!latestByWork.has(key)) latestByWork.set(key, activity);
  }
  return [...latestByWork.values()];
}

export function stageName(state: FloorState, stageId: number | null): string | null {
  if (stageId === null) return null;
  return state.stages.find((stage) => stage.id === stageId)?.name ?? null;
}

export function activityTypeNames(state: FloorState, activity: FloorActivity): string[] {
  return activity.activityTypeIds
    .map((id) => state.activityTypes.find((type) => type.id === id)?.name)
    .filter((name): name is string => Boolean(name))
    .sort((a, b) => a.localeCompare(b));
}

/** Máquinas en producción en el orden de la cola. */
export function machinesInProduction(state: FloorState): FloorMachine[] {
  return Object.values(state.machines)
    .filter((machine) => machine.status === "in_production")
    .sort((a, b) => a.order - b.order);
}

// ── Comandos ─────────────────────────────────────────────────────────────────

function startStage(state: FloorState, command: FloorCommandOf<"session.start_stage">): ApplyResult {
  const { workerId, sessionId, activityId, stageId } = command.payload;
  const machineIds = unique(command.payload.machineIds);

  if (!hasWorker(state, workerId)) return fail("Selecciona un operario para continuar.");
  if (machineIds.length === 0) return fail("Selecciona al menos una máquina.");
  if (openActivityOf(state, workerId)) return fail(OPEN_SESSION_MESSAGE);
  if (!state.stages.some((stage) => stage.id === stageId)) return fail("Esa etapa no existe.");

  const machines = machineIds.map((id) => state.machines[id]);
  if (machines.some((machine) => !machine || machine.status !== "in_production")) {
    return fail("Todas las máquinas deben estar en producción.");
  }

  const isReprocess = machines.some((machine) => {
    const progress = machine.stages[stageId];
    return Boolean(progress && progress.completion < 100 && progress.lastIsReprocess);
  });

  return ok({
    ...state,
    activities: [
      ...state.activities,
      {
        activityId,
        workerId,
        kind: "stage",
        stageId,
        activityTypeIds: [],
        note: null,
        isReprocess,
        machineIds,
        machineSerials: machines.map((machine) => machine.serial),
        segments: [{ id: sessionId, startedAt: command.at, endedAt: null, endReason: null }],
      },
    ],
  });
}

function startOther(state: FloorState, command: FloorCommandOf<"session.start_other">): ApplyResult {
  const { workerId, sessionId, activityId } = command.payload;
  const activityTypeIds = unique(command.payload.activityTypeIds);
  const machineIds = unique(command.payload.machineIds);

  if (!hasWorker(state, workerId)) return fail("Selecciona un operario para continuar.");
  if (activityTypeIds.length === 0) return fail("Selecciona al menos una actividad.");

  const types = activityTypeIds.map((id) => state.activityTypes.find((type) => type.id === id));
  if (types.some((type) => !type)) return fail("Alguna de las actividades ya no está disponible.");
  if (machineIds.length > 0 && !types.some((type) => type?.allowsMachine)) {
    return fail("Esta actividad no se asocia a máquinas.");
  }
  if (openActivityOf(state, workerId)) return fail(OPEN_SESSION_MESSAGE);

  const machines = machineIds.map((id) => state.activityMachines.find((machine) => machine.id === id));
  if (machines.some((machine) => !machine)) {
    return fail("Las máquinas deben estar en producción, terminadas o despachadas.");
  }

  return ok({
    ...state,
    activities: [
      ...state.activities,
      {
        activityId,
        workerId,
        kind: "other",
        stageId: null,
        activityTypeIds,
        note: null,
        isReprocess: false,
        machineIds,
        machineSerials: machines.map((machine) => machine?.serial ?? 0),
        segments: [{ id: sessionId, startedAt: command.at, endedAt: null, endReason: null }],
      },
    ],
  });
}

function closeOpenSegment(
  state: FloorState,
  command: FloorCommandOf<"session.pause"> | FloorCommandOf<"session.finish">,
  reason: "paused" | "completed",
): ApplyResult {
  const { workerId, sessionId } = command.payload;
  const activity = state.activities.find(
    (candidate) =>
      candidate.workerId === workerId &&
      candidate.segments.some((segment) => segment.id === sessionId && segment.endedAt === null),
  );
  if (!activity) return fail("Esta sesión ya fue cerrada.");
  if (reason === "paused" && activity.kind !== "stage") return fail("Las actividades no se pausan: termínala.");

  const segments = activity.segments.map<FloorSegment>((segment) =>
    segment.id === sessionId
      ? { ...segment, endedAt: Math.max(command.at, segment.startedAt), endReason: reason }
      : segment,
  );

  if (reason === "paused") {
    return ok(replaceActivity(state, { ...activity, segments }));
  }

  // Terminar: la actividad sale de la lista y la etapa queda hecha en sus máquinas.
  const withoutActivity = removeActivity(state, activity.activityId);
  if (activity.kind !== "stage" || activity.stageId === null) return ok(withoutActivity);
  return completeStage(withoutActivity, activity.machineIds, activity.stageId, command.at);
}

function resume(state: FloorState, command: FloorCommandOf<"session.resume">): ApplyResult {
  const { workerId, sessionId, activityId } = command.payload;
  const activity = state.activities.find(
    (candidate) => candidate.activityId === activityId && candidate.workerId === workerId,
  );

  if (!activity || !isResumable(activity) || activity.kind !== "stage") {
    return fail("Esta actividad ya no se puede reanudar.");
  }
  if (openActivityOf(state, workerId)) return fail(OPEN_SESSION_MESSAGE);
  if (activity.machineIds.some((id) => state.machines[id]?.status !== "in_production")) {
    return fail("Todas las máquinas deben estar en producción.");
  }

  return ok(
    replaceActivity(state, {
      ...activity,
      segments: [...activity.segments, { id: sessionId, startedAt: command.at, endedAt: null, endReason: null }],
    }),
  );
}

function finishPaused(state: FloorState, command: FloorCommandOf<"activity.finish_paused">): ApplyResult {
  const { workerId, activityId } = command.payload;
  const activity = state.activities.find(
    (candidate) => candidate.activityId === activityId && candidate.workerId === workerId,
  );

  if (!activity || !isResumable(activity) || activity.kind !== "stage" || activity.stageId === null) {
    return fail("Esta actividad ya fue cerrada.");
  }

  return completeStage(removeActivity(state, activityId), activity.machineIds, activity.stageId, command.at);
}

function setStage(state: FloorState, command: FloorCommandOf<"stage.set">): ApplyResult {
  const { workerId, machineId, stageId, completion } = command.payload;
  if (!hasWorker(state, workerId)) return fail("Selecciona un operario para continuar.");
  if (completion !== 0 && completion !== 100) return fail("La tarea debe estar pendiente o hecha.");

  const machine = state.machines[machineId];
  const progress = machine?.stages[stageId];
  if (!machine || !progress) return fail("Esa etapa no existe en la máquina.");
  if (progress.completion === completion) return { ok: true, state, effects: { ...NO_EFFECTS, noop: true } };

  if (completion === 100) {
    const updated = withStage(machine, stageId, { completion: 100, lastDoneAt: command.at, lastIsReprocess: false });
    return ok(replaceMachine(state, updated), {
      finishedMachineIds: becameFinished(machine, updated) ? [machineId] : [],
    });
  }

  const revert = classifyStageRevert(
    progress.lastDoneAt === null ? null : new Date(progress.lastDoneAt).toISOString(),
    new Date(command.at),
    REPROCESS_GRACE_MINUTES,
  );
  const updated = withStage(
    machine,
    stageId,
    revert === "undo"
      ? { completion: 0, lastDoneAt: null, lastIsReprocess: progress.lastIsReprocess }
      : { completion: 0, lastDoneAt: progress.lastDoneAt, lastIsReprocess: true },
  );
  return ok(replaceMachine(state, updated), { revert });
}

function setPrevioReceived(state: FloorState, command: FloorCommandOf<"previo.set_received">): ApplyResult {
  const { machineId, previoCatalogId, received } = command.payload;
  const row = state.previoRows.find((candidate) => candidate.machineId === machineId);
  const previo = row?.previos.find((candidate) => candidate.previoCatalogId === previoCatalogId);
  if (!row || !previo) return fail("Ese material no está en la lista de almacén.");
  if (previo.received === received) return { ok: true, state, effects: { ...NO_EFFECTS, noop: true } };

  return ok({
    ...state,
    previoRows: state.previoRows.map((candidate) =>
      candidate.machineId === machineId
        ? {
            ...candidate,
            previos: candidate.previos.map((item) =>
              item.previoCatalogId === previoCatalogId ? { ...item, received } : item,
            ),
          }
        : candidate,
    ),
  });
}

// ── Utilidades ───────────────────────────────────────────────────────────────

/** Marca la etapa hecha en cada máquina conocida (las que salieron de producción se saltan). */
function completeStage(state: FloorState, machineIds: string[], stageId: number, at: number): ApplyResult {
  let next = state;
  const finishedMachineIds: string[] = [];
  for (const machineId of unique(machineIds)) {
    const machine = next.machines[machineId];
    const progress = machine?.stages[stageId];
    if (!machine || !progress || progress.completion === 100) continue;
    const updated = withStage(machine, stageId, { completion: 100, lastDoneAt: at, lastIsReprocess: false });
    if (becameFinished(machine, updated)) finishedMachineIds.push(machineId);
    next = replaceMachine(next, updated);
  }
  return ok(next, { finishedMachineIds });
}

function withStage(
  machine: FloorMachine,
  stageId: number,
  progress: FloorMachine["stages"][number],
): FloorMachine {
  const stages = { ...machine.stages, [stageId]: progress };
  const allDone = Object.values(stages).every((stage) => stage.completion === 100);
  const status =
    allDone && machine.status === "in_production"
      ? "finished"
      : !allDone && machine.status === "finished"
        ? "in_production"
        : machine.status;
  return { ...machine, stages, status };
}

function becameFinished(before: FloorMachine, after: FloorMachine) {
  return before.status !== "finished" && after.status === "finished";
}

function replaceMachine(state: FloorState, machine: FloorMachine): FloorState {
  return { ...state, machines: { ...state.machines, [machine.id]: machine } };
}

function replaceActivity(state: FloorState, activity: FloorActivity): FloorState {
  return {
    ...state,
    activities: state.activities.map((candidate) =>
      candidate.activityId === activity.activityId ? activity : candidate,
    ),
  };
}

function removeActivity(state: FloorState, activityId: string): FloorState {
  return { ...state, activities: state.activities.filter((activity) => activity.activityId !== activityId) };
}

function isOpen(activity: FloorActivity) {
  return activity.segments.some((segment) => segment.endedAt === null);
}

function pausedAt(activity: FloorActivity) {
  return activity.segments[activity.segments.length - 1]?.endedAt ?? 0;
}

function hasWorker(state: FloorState, workerId: string) {
  return state.workers.some((worker) => worker.id === workerId);
}

function unique(ids: string[]) {
  return [...new Set(ids)];
}

function ok(state: FloorState, effects: Partial<FloorEffects> = {}): ApplyResult {
  return { ok: true, state, effects: { ...NO_EFFECTS, ...effects } };
}

function fail(error: string): ApplyResult {
  return { ok: false, error };
}
