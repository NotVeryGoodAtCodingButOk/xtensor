import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { updateStageProgress } from "@/services/stages";
import type { DoneMarkWithoutSession, LaborSessionInput } from "@/services/labor-time";
import type { Database } from "@/types/database";

type WorkSessionRow = Database["public"]["Tables"]["work_sessions"]["Row"];
type MachineRow = Database["public"]["Tables"]["machines"]["Row"];

export type OpenSessionMachine = {
  id: string;
  serialNumber: number;
  equipmentName: string;
  clientName: string | null;
};

export type OpenSessionView = {
  id: string;
  workerId: string;
  /** Chain id shared by every segment (pausar/reanudar) of this activity. */
  activityId: string;
  kind: "stage" | "other";
  stageId: number | null;
  stageName: string | null;
  note: string | null;
  isReprocess: boolean;
  startedAt: string;
  /** Time already logged in earlier segments of the activity, before this one. */
  accumulatedMs: number;
  machines: OpenSessionMachine[];
};

/** An activity the worker paused and can pick up again where it left off. */
export type PausedActivityView = {
  activityId: string;
  stageId: number;
  stageName: string | null;
  isReprocess: boolean;
  /** Start of the first segment — when the worker first began this activity. */
  startedAt: string;
  /** End of the last segment — when they paused. */
  pausedAt: string;
  /** Time logged across every segment so far. */
  accumulatedMs: number;
  machines: OpenSessionMachine[];
};

export type OpenSessionSummary = {
  workerId: string;
  kind: "stage" | "other";
  stageName: string | null;
  note: string | null;
  startedAt: string;
  /** Serial numbers of the machines being worked on, to identify them in the picker. */
  machineSerialNumbers: number[];
};

type SessionMachineRow = {
  machine_id: string;
  machines: Pick<MachineRow, "id" | "serial_number" | "custom_equipment_name" | "status"> & {
    equipment_catalog: { name: string } | null;
    clients: { name: string } | null;
  };
};

type OpenSessionSelectRow = WorkSessionRow & {
  stages: { name: string } | null;
  work_session_machines: SessionMachineRow[];
};

type OpenSessionSummaryRow = Pick<WorkSessionRow, "worker_id" | "kind" | "note" | "started_at"> & {
  stages: { name: string } | null;
  work_session_machines: Array<{ machines: Pick<MachineRow, "serial_number"> | null }>;
};

type SessionWithMachineIdsRow = WorkSessionRow & {
  work_session_machines: Array<{ machine_id: string }>;
};

const OPEN_SESSION_SELECT = `
  *,
  stages(name),
  work_session_machines(
    machine_id,
    machines(id, serial_number, custom_equipment_name, status, equipment_catalog(name), clients(name))
  )
`;

/** How far back a paused activity stays resumable from the factory floor. */
const PAUSED_ACTIVITY_WINDOW_DAYS = 30;

/** The active worker's own open session, or null. At most one can be open. */
export async function getOpenSession(workerId: string): Promise<OpenSessionView | null> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("work_sessions")
    .select(OPEN_SESSION_SELECT)
    .eq("worker_id", workerId)
    .is("ended_at", null)
    .maybeSingle();

  if (error) {
    throw new Error(`No se pudo cargar la sesión activa: ${error.message}`);
  }
  if (!data) {
    return null;
  }

  const row = data as unknown as OpenSessionSelectRow;
  const accumulatedMs = await sumClosedSegmentsMs(supabase, workerId, row.activity_id);

  return mapOpenSessionRow(row, accumulatedMs);
}

/** Every open session across workers, for the worker-picker badges. */
export async function listOpenSessions(): Promise<OpenSessionSummary[]> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("work_sessions")
    .select("worker_id, kind, note, started_at, stages(name), work_session_machines(machines(serial_number))")
    .is("ended_at", null);

  if (error) {
    throw new Error(`No se pudieron cargar las sesiones abiertas: ${error.message}`);
  }

  const rows = (data ?? []) as unknown as OpenSessionSummaryRow[];

  return rows.map((row) => ({
    workerId: row.worker_id,
    kind: row.kind,
    stageName: row.stages?.name ?? null,
    note: row.note,
    startedAt: row.started_at,
    machineSerialNumbers: (row.work_session_machines ?? [])
      .map((entry) => entry.machines?.serial_number)
      .filter((serial): serial is number => typeof serial === "number")
      .sort((a, b) => a - b),
  }));
}

/**
 * The worker's paused stage activities, newest pause first. An activity is
 * resumable while every one of its segments is closed, the last one was
 * closed by Pausar, none was closed by Terminar, every machine is still in
 * production and the stage is still pending on at least one of them.
 */
export async function listPausedActivities(workerId: string): Promise<PausedActivityView[]> {
  const supabase = createSupabaseAdminClient();
  const cutoff = new Date(Date.now() - PAUSED_ACTIVITY_WINDOW_DAYS * 24 * 60 * 60_000).toISOString();

  const { data, error } = await supabase
    .from("work_sessions")
    .select(OPEN_SESSION_SELECT)
    .eq("worker_id", workerId)
    .eq("kind", "stage")
    .gte("started_at", cutoff)
    .order("started_at", { ascending: true });

  if (error) {
    throw new Error(`No se pudieron cargar las actividades pausadas: ${error.message}`);
  }

  const rows = (data ?? []) as unknown as OpenSessionSelectRow[];
  const chains = groupByActivity(rows);
  const candidates: PausedActivityView[] = [];

  for (const segments of chains.values()) {
    if (!isResumableChain(segments)) {
      continue;
    }

    const last = segments[segments.length - 1];
    if (last.stage_id === null) {
      continue;
    }

    const machines = mapSessionMachines(segments);
    const stillInProduction = segments[0].work_session_machines.every(
      (entry) => entry.machines?.status === "in_production",
    );
    if (machines.length === 0 || !stillInProduction) {
      continue;
    }

    candidates.push({
      activityId: last.activity_id,
      stageId: last.stage_id,
      stageName: last.stages?.name ?? null,
      isReprocess: segments[0].is_reprocess,
      startedAt: segments[0].started_at,
      pausedAt: last.ended_at as string,
      accumulatedMs: sumSegmentsMs(segments),
      machines,
    });
  }

  if (candidates.length === 0) {
    return [];
  }

  const pendingByStage = await loadPendingStageMachines(supabase, candidates);
  const resumable = candidates
    .filter((activity) => activity.machines.some((machine) => pendingByStage.has(`${machine.id}|${activity.stageId}`)))
    .sort((a, b) => new Date(b.pausedAt).getTime() - new Date(a.pausedAt).getTime());

  // One entry per etapa + juego de máquinas: the UI offers Reanudar instead of
  // a fresh Iniciar while something is paused, so older chains on the same
  // work (sessions paused before pausa/reanudar existed) would only be noise.
  const latestByWork = new Map<string, PausedActivityView>();
  for (const activity of resumable) {
    const key = `${activity.stageId}|${activity.machines.map((machine) => machine.id).join(",")}`;
    if (!latestByWork.has(key)) {
      latestByWork.set(key, activity);
    }
  }

  return [...latestByWork.values()];
}

/** Starts a timed stage session on one or several machines (time split equally). */
export async function startStageSession(input: { workerId: string; machineIds: string[]; stageId: number }) {
  const machineIds = [...new Set(input.machineIds)];
  if (machineIds.length === 0) {
    throw new Error("Selecciona al menos una máquina.");
  }

  const supabase = createSupabaseAdminClient();

  await assertNoOpenSession(supabase, input.workerId);

  await assertMachinesInProduction(supabase, machineIds);

  const isReprocess = await computeSessionIsReprocess(supabase, machineIds, input.stageId);

  const { data: session, error: insertError } = await supabase
    .from("work_sessions")
    .insert({
      worker_id: input.workerId,
      kind: "stage",
      stage_id: input.stageId,
      is_reprocess: isReprocess,
    })
    .select("*")
    .single();

  if (insertError) {
    throw new Error(friendlyOpenSessionMessage(insertError));
  }

  const { error: machinesInsertError } = await supabase
    .from("work_session_machines")
    .insert(machineIds.map((machineId) => ({ session_id: session.id, machine_id: machineId })));

  if (machinesInsertError) {
    await supabase.from("work_sessions").delete().eq("id", session.id);
    throw new Error(`No se pudieron asociar las máquinas: ${machinesInsertError.message}`);
  }

  return session;
}

/** Starts a timed "Otro" session (no machine) with a required free-text note. */
export async function startOtherSession(input: { workerId: string; note: string }) {
  const note = input.note.trim();
  if (!note) {
    throw new Error("Escribe una nota para la actividad.");
  }
  if (note.length > 200) {
    throw new Error("La nota debe tener máximo 200 caracteres.");
  }

  const supabase = createSupabaseAdminClient();

  await assertNoOpenSession(supabase, input.workerId);

  const { data: session, error: insertError } = await supabase
    .from("work_sessions")
    .insert({ worker_id: input.workerId, kind: "other", note })
    .select("*")
    .single();

  if (insertError) {
    throw new Error(friendlyOpenSessionMessage(insertError));
  }

  return session;
}

/**
 * Reanudar: opens a new segment on a paused activity, keeping its activity_id
 * so the floor timer picks up from the time already logged.
 */
export async function resumeActivity(input: { workerId: string; activityId: string }) {
  const supabase = createSupabaseAdminClient();

  await assertNoOpenSession(supabase, input.workerId);

  const segments = await loadActivitySegments(supabase, input.workerId, input.activityId);
  const last = segments[segments.length - 1];

  if (!isResumableChain(segments) || last.kind !== "stage" || last.stage_id === null) {
    throw new Error("Esta actividad ya no se puede reanudar.");
  }

  const machineIds = [...new Set(segments[0].work_session_machines.map((entry) => entry.machine_id))];
  await assertMachinesInProduction(supabase, machineIds);

  const { data: session, error: insertError } = await supabase
    .from("work_sessions")
    .insert({
      worker_id: input.workerId,
      activity_id: input.activityId,
      kind: "stage",
      stage_id: last.stage_id,
      is_reprocess: segments[0].is_reprocess,
    })
    .select("*")
    .single();

  if (insertError) {
    throw new Error(friendlyOpenSessionMessage(insertError));
  }

  const { error: machinesInsertError } = await supabase
    .from("work_session_machines")
    .insert(machineIds.map((machineId) => ({ session_id: session.id, machine_id: machineId })));

  if (machinesInsertError) {
    await supabase.from("work_sessions").delete().eq("id", session.id);
    throw new Error(`No se pudieron asociar las máquinas: ${machinesInsertError.message}`);
  }

  return session;
}

/**
 * Terminar on a paused activity: marks the stage done without reopening the
 * cronómetro. The last segment is re-stamped as "completed" so the activity
 * stops showing up as resumable.
 */
export async function finishPausedActivity(input: { workerId: string; activityId: string }) {
  const supabase = createSupabaseAdminClient();

  const segments = await loadActivitySegments(supabase, input.workerId, input.activityId);
  const last = segments[segments.length - 1];

  if (!isResumableChain(segments) || last.kind !== "stage" || last.stage_id === null) {
    throw new Error("Esta actividad ya fue cerrada.");
  }

  const { error: updateError } = await supabase
    .from("work_sessions")
    .update({ end_reason: "completed" })
    .eq("id", last.id);

  if (updateError) {
    throw new Error(`No se pudo cerrar la actividad: ${updateError.message}`);
  }

  const machineIds = [...new Set(segments[0].work_session_machines.map((entry) => entry.machine_id))];

  return completeStageOnMachines(supabase, {
    machineIds,
    stageId: last.stage_id,
    workerId: input.workerId,
  });
}

/**
 * Closes the worker's open session. "completed" also marks the stage done
 * (100%) on every machine of the session; "paused" leaves the activity
 * resumable through `resumeActivity`.
 */
export async function finishSession(input: {
  workerId: string;
  sessionId: string;
  reason: "completed" | "paused";
}) {
  const supabase = createSupabaseAdminClient();

  const { data, error: sessionError } = await supabase
    .from("work_sessions")
    .select("*, work_session_machines(machine_id)")
    .eq("id", input.sessionId)
    .eq("worker_id", input.workerId)
    .single();

  if (sessionError) {
    throw new Error(`No se pudo cargar la sesión: ${sessionError.message}`);
  }

  const session = data as unknown as SessionWithMachineIdsRow;

  if (session.ended_at) {
    throw new Error("Esta sesión ya fue cerrada.");
  }

  const { error: updateError } = await supabase
    .from("work_sessions")
    .update({ ended_at: new Date().toISOString(), end_reason: input.reason })
    .eq("id", session.id);

  if (updateError) {
    throw new Error(`No se pudo cerrar la sesión: ${updateError.message}`);
  }

  if (input.reason === "completed" && session.kind === "stage" && session.stage_id !== null) {
    return completeStageOnMachines(supabase, {
      machineIds: session.work_session_machines.map((entry) => entry.machine_id),
      stageId: session.stage_id,
      workerId: input.workerId,
    });
  }

  return { finishedMachineIds: [] };
}

/**
 * Marks a stage done (100%) on every machine and reports which of them had
 * their LAST pending stage closed by it (status flipped to finished).
 */
async function completeStageOnMachines(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  input: { machineIds: string[]; stageId: number; workerId: string },
): Promise<{ finishedMachineIds: string[] }> {
  const changedMachineIds: string[] = [];

  for (const machineId of input.machineIds) {
    const result = await updateStageProgress({
      machineId,
      stageId: input.stageId,
      completion: 100,
      workerId: input.workerId,
    });
    if (result.log) {
      changedMachineIds.push(machineId);
    }
  }

  if (changedMachineIds.length === 0) {
    return { finishedMachineIds: [] };
  }

  const { data: finishedRows, error: finishedError } = await supabase
    .from("machines")
    .select("id")
    .in("id", changedMachineIds)
    .eq("status", "finished");

  if (finishedError) {
    throw new Error(`No se pudo verificar las máquinas terminadas: ${finishedError.message}`);
  }

  return { finishedMachineIds: (finishedRows ?? []).map((row) => row.id) };
}

/**
 * Sessions overlapping [startIso, endIso), mapped to the camelCase shape
 * `summarizeLabor` (src/services/labor-time.ts) expects.
 */
export async function listSessionsOverlapping(startIso: string, endIso: string): Promise<LaborSessionInput[]> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("work_sessions")
    .select("*, work_session_machines(machine_id)")
    .lt("started_at", endIso)
    .or(`ended_at.is.null,ended_at.gt.${startIso}`);

  if (error) {
    throw new Error(`No se pudieron cargar las sesiones: ${error.message}`);
  }

  const rows = (data ?? []) as unknown as SessionWithMachineIdsRow[];

  return rows.map((row) => ({
    id: row.id,
    workerId: row.worker_id,
    kind: row.kind,
    stageId: row.stage_id,
    note: row.note,
    isReprocess: row.is_reprocess,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    endReason: row.end_reason,
    machineIds: row.work_session_machines.map((m) => m.machine_id),
  }));
}

/**
 * Stage-completion marks (stage_logs, new_completion=100) in range that
 * aren't covered by any matching work session (same worker/stage/machine,
 * with the log time inside [session.started_at, session.ended_at + 2min]).
 * Signals legacy/manual completions the time capture missed.
 */
export async function listDoneMarksWithoutSession(
  startIso: string,
  endIso: string,
): Promise<DoneMarkWithoutSession[]> {
  const supabase = createSupabaseAdminClient();
  const GRACE_MS = 2 * 60_000;

  const [logsResult, sessionsResult] = await Promise.all([
    supabase
      .from("stage_logs")
      .select("machine_id, stage_id, worker_id, created_at")
      .eq("new_completion", 100)
      .eq("is_undone", false)
      .gte("created_at", startIso)
      .lt("created_at", endIso),
    supabase
      .from("work_sessions")
      .select("worker_id, stage_id, started_at, ended_at, work_session_machines(machine_id)")
      .eq("kind", "stage")
      .lt("started_at", endIso)
      .or(`ended_at.is.null,ended_at.gt.${startIso}`),
  ]);

  if (logsResult.error) {
    throw new Error(`No se pudieron cargar las marcas de avance: ${logsResult.error.message}`);
  }
  if (sessionsResult.error) {
    throw new Error(`No se pudieron cargar las sesiones: ${sessionsResult.error.message}`);
  }

  type DoneMarkSessionRow = Pick<WorkSessionRow, "worker_id" | "stage_id" | "started_at" | "ended_at"> & {
    work_session_machines: Array<{ machine_id: string }>;
  };
  const sessionRows = (sessionsResult.data ?? []) as unknown as DoneMarkSessionRow[];

  const sessions = sessionRows.map((row) => ({
    workerId: row.worker_id,
    stageId: row.stage_id,
    startMs: new Date(row.started_at).getTime(),
    endMs: row.ended_at ? new Date(row.ended_at).getTime() + GRACE_MS : Infinity,
    machineIds: new Set(row.work_session_machines.map((m) => m.machine_id)),
  }));

  return (logsResult.data ?? [])
    .filter((log) => {
      const logMs = new Date(log.created_at).getTime();
      return !sessions.some(
        (session) =>
          session.workerId === log.worker_id &&
          session.stageId === log.stage_id &&
          session.machineIds.has(log.machine_id) &&
          logMs >= session.startMs &&
          logMs <= session.endMs,
      );
    })
    .map((log) => ({
      workerId: log.worker_id,
      machineId: log.machine_id,
      stageId: log.stage_id as number,
      createdAt: log.created_at,
    }));
}

async function assertMachinesInProduction(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  machineIds: string[],
) {
  const { data: machines, error } = await supabase.from("machines").select("id, status").in("id", machineIds);

  if (error) {
    throw new Error(`No se pudieron verificar las máquinas: ${error.message}`);
  }
  if ((machines ?? []).length !== machineIds.length || machines.some((machine) => machine.status !== "in_production")) {
    throw new Error("Todas las máquinas deben estar en producción.");
  }
}

/** Every segment of one activity, oldest first. Throws when the chain is unknown. */
async function loadActivitySegments(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  workerId: string,
  activityId: string,
): Promise<OpenSessionSelectRow[]> {
  const { data, error } = await supabase
    .from("work_sessions")
    .select(OPEN_SESSION_SELECT)
    .eq("worker_id", workerId)
    .eq("activity_id", activityId)
    .order("started_at", { ascending: true });

  if (error) {
    throw new Error(`No se pudo cargar la actividad: ${error.message}`);
  }

  const segments = (data ?? []) as unknown as OpenSessionSelectRow[];
  if (segments.length === 0) {
    throw new Error("Esta actividad ya no existe.");
  }

  return segments;
}

function groupByActivity(rows: OpenSessionSelectRow[]): Map<string, OpenSessionSelectRow[]> {
  const chains = new Map<string, OpenSessionSelectRow[]>();
  for (const row of rows) {
    const segments = chains.get(row.activity_id);
    if (segments) {
      segments.push(row);
    } else {
      chains.set(row.activity_id, [row]);
    }
  }
  return chains;
}

/**
 * True when the chain is paused: every segment closed, none of them closed by
 * Terminar, and the last one closed by Pausar.
 */
function isResumableChain(segments: OpenSessionSelectRow[]): boolean {
  if (segments.length === 0) {
    return false;
  }
  if (segments.some((segment) => segment.ended_at === null || segment.end_reason === "completed")) {
    return false;
  }
  return segments[segments.length - 1].end_reason === "paused";
}

function sumSegmentsMs(segments: Array<Pick<WorkSessionRow, "started_at" | "ended_at">>): number {
  let total = 0;
  for (const segment of segments) {
    if (!segment.ended_at) continue;
    const elapsed = new Date(segment.ended_at).getTime() - new Date(segment.started_at).getTime();
    if (Number.isFinite(elapsed) && elapsed > 0) {
      total += elapsed;
    }
  }
  return total;
}

/** Time logged by the already-closed segments of an activity. */
async function sumClosedSegmentsMs(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  workerId: string,
  activityId: string,
): Promise<number> {
  const { data, error } = await supabase
    .from("work_sessions")
    .select("started_at, ended_at")
    .eq("worker_id", workerId)
    .eq("activity_id", activityId)
    .not("ended_at", "is", null);

  if (error) {
    throw new Error(`No se pudo calcular el tiempo acumulado: ${error.message}`);
  }

  return sumSegmentsMs(data ?? []);
}

/** "machineId|stageId" keys for the pairs where the stage is still pending. */
async function loadPendingStageMachines(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  activities: PausedActivityView[],
): Promise<Set<string>> {
  const machineIds = [...new Set(activities.flatMap((activity) => activity.machines.map((machine) => machine.id)))];
  const stageIds = [...new Set(activities.map((activity) => activity.stageId))];

  const { data, error } = await supabase
    .from("machine_stages")
    .select("machine_id, stage_id, completion")
    .in("machine_id", machineIds)
    .in("stage_id", stageIds);

  if (error) {
    throw new Error(`No se pudo verificar el avance de las etapas: ${error.message}`);
  }

  const pending = new Set<string>();
  for (const row of data ?? []) {
    if (row.completion < 100) {
      pending.add(`${row.machine_id}|${row.stage_id}`);
    }
  }
  return pending;
}

async function assertNoOpenSession(supabase: ReturnType<typeof createSupabaseAdminClient>, workerId: string) {
  const { data: openSession, error } = await supabase
    .from("work_sessions")
    .select("id")
    .eq("worker_id", workerId)
    .is("ended_at", null)
    .maybeSingle();

  if (error) {
    throw new Error(`No se pudo verificar la sesión en curso: ${error.message}`);
  }
  if (openSession) {
    throw new Error("Termina o pausa lo que tienes en curso.");
  }
}

function friendlyOpenSessionMessage(error: { code?: string; message: string }) {
  if (error.code === "23505") {
    return "Termina o pausa lo que tienes en curso.";
  }
  return `No se pudo iniciar la sesión: ${error.message}`;
}

/**
 * A session should be flagged as reprocess time when it targets a stage that
 * is currently incomplete on a machine BUT whose latest (non-undone) log for
 * that stage was itself a reprocess — i.e. the worker is redoing a stage that
 * was already sent back once, not doing it for the first time.
 */
async function computeSessionIsReprocess(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  machineIds: string[],
  stageId: number,
): Promise<boolean> {
  const { data: stageRows, error: stageError } = await supabase
    .from("machine_stages")
    .select("machine_id, completion")
    .eq("stage_id", stageId)
    .in("machine_id", machineIds);

  if (stageError) {
    throw new Error(`No se pudo verificar el avance de la etapa: ${stageError.message}`);
  }

  const incompleteMachineIds = (stageRows ?? [])
    .filter((row) => row.completion < 100)
    .map((row) => row.machine_id);

  if (incompleteMachineIds.length === 0) {
    return false;
  }

  const { data: logs, error: logsError } = await supabase
    .from("stage_logs")
    .select("machine_id, is_reprocess, created_at")
    .eq("stage_id", stageId)
    .eq("is_undone", false)
    .in("machine_id", incompleteMachineIds)
    .order("created_at", { ascending: false });

  if (logsError) {
    throw new Error(`No se pudo verificar el historial de la etapa: ${logsError.message}`);
  }

  const latestByMachine = new Map<string, boolean>();
  for (const log of logs ?? []) {
    if (!latestByMachine.has(log.machine_id)) {
      latestByMachine.set(log.machine_id, log.is_reprocess);
    }
  }

  return incompleteMachineIds.some((machineId) => latestByMachine.get(machineId) === true);
}

function mapOpenSessionRow(row: OpenSessionSelectRow, accumulatedMs: number): OpenSessionView {
  return {
    id: row.id,
    workerId: row.worker_id,
    activityId: row.activity_id,
    kind: row.kind,
    stageId: row.stage_id,
    stageName: row.stages?.name ?? null,
    note: row.note,
    isReprocess: row.is_reprocess,
    startedAt: row.started_at,
    accumulatedMs,
    machines: mapSessionMachines([row]),
  };
}

/** Machines of an activity, deduped across its segments. */
function mapSessionMachines(segments: OpenSessionSelectRow[]): OpenSessionMachine[] {
  const byId = new Map<string, OpenSessionMachine>();

  for (const segment of segments) {
    for (const entry of segment.work_session_machines ?? []) {
      if (byId.has(entry.machine_id)) continue;
      byId.set(entry.machine_id, {
        id: entry.machine_id,
        serialNumber: entry.machines?.serial_number ?? 0,
        equipmentName:
          entry.machines?.equipment_catalog?.name ?? entry.machines?.custom_equipment_name ?? "Producto personalizado",
        clientName: entry.machines?.clients?.name ?? null,
      });
    }
  }

  return [...byId.values()].sort((a, b) => a.serialNumber - b.serialNumber);
}
