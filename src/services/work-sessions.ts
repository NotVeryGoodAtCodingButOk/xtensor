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
  kind: "stage" | "other";
  stageId: number | null;
  stageName: string | null;
  note: string | null;
  isReprocess: boolean;
  startedAt: string;
  machines: OpenSessionMachine[];
};

export type OpenSessionSummary = {
  workerId: string;
  kind: "stage" | "other";
  stageName: string | null;
  note: string | null;
  startedAt: string;
  machineCount: number;
};

type OpenSessionSelectRow = WorkSessionRow & {
  stages: { name: string } | null;
  work_session_machines: Array<{
    machine_id: string;
    machines: Pick<MachineRow, "id" | "serial_number" | "custom_equipment_name"> & {
      equipment_catalog: { name: string } | null;
      clients: { name: string } | null;
    };
  }>;
};

type OpenSessionSummaryRow = Pick<WorkSessionRow, "worker_id" | "kind" | "note" | "started_at"> & {
  stages: { name: string } | null;
  work_session_machines: Array<{ machine_id: string }>;
};

type SessionWithMachineIdsRow = WorkSessionRow & {
  work_session_machines: Array<{ machine_id: string }>;
};

const OPEN_SESSION_SELECT = `
  *,
  stages(name),
  work_session_machines(
    machine_id,
    machines(id, serial_number, custom_equipment_name, equipment_catalog(name), clients(name))
  )
`;

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

  return mapOpenSessionRow(data as unknown as OpenSessionSelectRow);
}

/** Every open session across workers, for the worker-picker badges. */
export async function listOpenSessions(): Promise<OpenSessionSummary[]> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("work_sessions")
    .select("worker_id, kind, note, started_at, stages(name), work_session_machines(machine_id)")
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
    machineCount: row.work_session_machines?.length ?? 0,
  }));
}

/** Starts a timed stage session on one or several machines (time split equally). */
export async function startStageSession(input: { workerId: string; machineIds: string[]; stageId: number }) {
  const machineIds = [...new Set(input.machineIds)];
  if (machineIds.length === 0) {
    throw new Error("Selecciona al menos una máquina.");
  }

  const supabase = createSupabaseAdminClient();

  await assertNoOpenSession(supabase, input.workerId);

  const { data: machines, error: machinesError } = await supabase
    .from("machines")
    .select("id, status")
    .in("id", machineIds);

  if (machinesError) {
    throw new Error(`No se pudieron verificar las máquinas: ${machinesError.message}`);
  }
  if ((machines ?? []).length !== machineIds.length || machines.some((machine) => machine.status !== "in_production")) {
    throw new Error("Todas las máquinas deben estar en producción.");
  }

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
 * Closes the worker's open session. "completed" also marks the stage done
 * (100%) on every machine of the session; "paused" just closes the session.
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

  const finishedMachineIds: string[] = [];

  if (input.reason === "completed" && session.kind === "stage" && session.stage_id !== null) {
    const machineIds = session.work_session_machines.map((entry) => entry.machine_id);

    for (const machineId of machineIds) {
      const result = await updateStageProgress({
        machineId,
        stageId: session.stage_id,
        completion: 100,
        workerId: input.workerId,
      });
      if (result.stage && (result.stage as { completion: number }).completion === 100) {
        finishedMachineIds.push(machineId);
      }
    }
  }

  return { finishedMachineIds };
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

function mapOpenSessionRow(row: OpenSessionSelectRow): OpenSessionView {
  return {
    id: row.id,
    workerId: row.worker_id,
    kind: row.kind,
    stageId: row.stage_id,
    stageName: row.stages?.name ?? null,
    note: row.note,
    isReprocess: row.is_reprocess,
    startedAt: row.started_at,
    machines: (row.work_session_machines ?? []).map((entry) => ({
      id: entry.machine_id,
      serialNumber: entry.machines?.serial_number ?? 0,
      equipmentName:
        entry.machines?.equipment_catalog?.name ?? entry.machines?.custom_equipment_name ?? "Producto personalizado",
      clientName: entry.machines?.clients?.name ?? null,
    })),
  };
}
