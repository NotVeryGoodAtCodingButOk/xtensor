import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { chunked, fetchAllPages } from "@/services/batching";
import { getSettings, mapSettings } from "@/services/settings";
import { updateStageProgress } from "@/services/stages";
import type { DoneMarkWithoutSession, LaborSessionInput } from "@/services/labor-time";
import type { Database } from "@/types/database";

type WorkSessionRow = Database["public"]["Tables"]["work_sessions"]["Row"];
type MachineRow = Database["public"]["Tables"]["machines"]["Row"];

/**
 * Estados de máquina a los que se les puede cargar una actividad con máquina
 * (empaque, carga e instalación; garantías): al terminar «Empacar» la máquina
 * pasa a terminada, y la carga o instalación llegan después, incluso ya despachada.
 */
export const ACTIVITY_MACHINE_STATUSES = ["in_production", "finished", "shipped"] as const;

export type ActivityMachineStatus = (typeof ACTIVITY_MACHINE_STATUSES)[number];

/** Máquina elegible en el panel de actividades de la tablet. */
export type ActivityPanelMachineOption = {
  id: string;
  serialNumber: number;
  equipmentName: string;
  clientName: string;
  status: ActivityMachineStatus;
};

type SessionWithMachineIdsRow = WorkSessionRow & {
  work_session_activity_types: Array<{ activity_type_id: string }>;
  work_session_machines: Array<{ machine_id: string }>;
};

/**
 * Marks a stage done (100%) on every machine and reports which of them had
 * their LAST pending stage closed by it (status flipped to finished).
 */
export async function completeStageOnMachines(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  input: { machineIds: string[]; stageId: number; workerId: string; at?: Date; commandId?: string },
): Promise<{ finishedMachineIds: string[] }> {
  // Cada máquina toca solo sus propias filas: se marcan en paralelo para que
  // «Terminar» sobre un grupo no espere ~6 consultas en fila por máquina.
  const machineIds = [...new Set(input.machineIds)];
  const results = await Promise.all(
    machineIds.map((machineId) =>
      updateStageProgress({
        machineId,
        stageId: input.stageId,
        completion: 100,
        workerId: input.workerId,
        at: input.at,
        commandId: input.commandId,
      }),
    ),
  );
  const changedMachineIds = machineIds.filter((_, index) => Boolean(results[index].log));

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

const LABOR_SESSION_SELECT = "*, work_session_activity_types(activity_type_id), work_session_machines(machine_id)";

/** Fila de work_sessions (con sus actividades y TODAS sus máquinas) → entrada del motor de labor-time.ts. */
function mapLaborSessionRow(row: SessionWithMachineIdsRow): LaborSessionInput {
  return {
    id: row.id,
    workerId: row.worker_id,
    kind: row.kind,
    stageId: row.stage_id,
    activityTypeIds: row.work_session_activity_types.map((entry) => entry.activity_type_id),
    note: row.note,
    isReprocess: row.is_reprocess,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    endReason: row.end_reason,
    machineIds: row.work_session_machines.map((m) => m.machine_id),
  };
}

/**
 * Sessions overlapping [startIso, endIso), mapped to the camelCase shape
 * `summarizeLabor` (src/services/labor-time.ts) expects.
 */
export async function listSessionsOverlapping(startIso: string, endIso: string): Promise<LaborSessionInput[]> {
  const supabase = createSupabaseAdminClient();
  const rows = await fetchAllPages<SessionWithMachineIdsRow>("No se pudieron cargar las sesiones", (from, to) =>
    supabase
      .from("work_sessions")
      .select(LABOR_SESSION_SELECT)
      .lt("started_at", endIso)
      .or(`ended_at.is.null,ended_at.gt.${startIso}`)
      .order("started_at", { ascending: true })
      .order("id", { ascending: true })
      .range(from, to),
  );

  return rows.map(mapLaborSessionRow);
}

/**
 * Todas las sesiones (de toda la vida) que tocaron alguna de estas máquinas,
 * cada una con TODAS sus máquinas y actividades: así el reparto entre varias
 * máquinas sale igual que en los tableros por rango.
 */
export async function listSessionsForMachines(machineIds: string[]): Promise<LaborSessionInput[]> {
  const ids = [...new Set(machineIds.filter(Boolean))];
  if (ids.length === 0) {
    return [];
  }

  const supabase = createSupabaseAdminClient();
  const sessionIds = new Set<string>();

  // Los lotes son independientes: se piden en paralelo (antes iban en fila y
  // el número de idas y vueltas crecía con el historial de sesiones).
  const linkChunks = await Promise.all(
    chunked(ids).map((chunk) =>
      fetchAllPages<{ session_id: string }>("No se pudieron cargar las sesiones de las máquinas", (from, to) =>
        supabase
          .from("work_session_machines")
          .select("session_id, machine_id")
          .in("machine_id", chunk)
          .order("session_id", { ascending: true })
          .order("machine_id", { ascending: true })
          .range(from, to),
      ),
    ),
  );
  for (const links of linkChunks) {
    for (const link of links) sessionIds.add(link.session_id);
  }

  const sessionChunks = await Promise.all(
    chunked([...sessionIds]).map(async (chunk) => {
      const { data, error } = await supabase.from("work_sessions").select(LABOR_SESSION_SELECT).in("id", chunk);
      if (error) {
        throw new Error(`No se pudieron cargar las sesiones: ${error.message}`);
      }
      return ((data ?? []) as unknown as SessionWithMachineIdsRow[]).map(mapLaborSessionRow);
    }),
  );

  return sessionChunks.flat();
}

/** Inicio del primer cronómetro registrado (ISO) o null si todavía no hay ninguno. */
export async function getFirstSessionStartedAt(): Promise<string | null> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("work_sessions")
    .select("started_at")
    .order("started_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`No se pudo consultar el primer cronómetro: ${error.message}`);
  }

  return data?.started_at ?? null;
}


type ActivityMachineRow = Pick<
  MachineRow,
  "id" | "serial_number" | "custom_equipment_name" | "status" | "order_position" | "completed_at" | "shipped_at"
> & {
  equipment_catalog: { name: string } | null;
  clients: { name: string } | null;
};

/**
 * Máquinas a las que se les puede asociar una actividad (empaque, carga e
 * instalación; garantías) en la tablet: en producción, terminadas y
 * despachadas dentro de settings.shipped_retention_days.
 */
export async function listMachinesForActivities(now: Date = new Date()): Promise<ActivityPanelMachineOption[]> {
  const supabase = createSupabaseAdminClient();
  const settings = mapSettings(await getSettings());
  const shippedSince = new Date(now);
  shippedSince.setDate(shippedSince.getDate() - Math.max(0, settings.shippedRetentionDays));

  const { data, error } = await supabase
    .from("machines")
    .select(
      "id, serial_number, custom_equipment_name, status, order_position, completed_at, shipped_at, equipment_catalog(name), clients(name)",
    )
    .or(`status.in.(in_production,finished),and(status.eq.shipped,shipped_at.gte.${shippedSince.toISOString()})`);

  if (error) {
    throw new Error(`No se pudieron cargar las máquinas: ${error.message}`);
  }

  return sortActivityMachines((data ?? []) as unknown as ActivityMachineRow[]).map((row) => ({
    id: row.id,
    serialNumber: row.serial_number,
    equipmentName: row.equipment_catalog?.name ?? row.custom_equipment_name ?? "Producto personalizado",
    clientName: row.clients?.name ?? "Cliente sin nombre",
    status: row.status as ActivityMachineStatus,
  }));
}

/**
 * Orden del selector: en producción por posición en cola, luego terminadas y
 * luego despachadas, estas dos de la más reciente a la más antigua.
 */
export function sortActivityMachines<
  T extends {
    status: string;
    order_position: number;
    completed_at: string | null;
    shipped_at: string | null;
    serial_number: number;
  },
>(rows: T[]): T[] {
  const rank = (status: string) => ACTIVITY_MACHINE_STATUSES.indexOf(status as ActivityMachineStatus);
  const time = (value: string | null) => (value ? new Date(value).getTime() : 0);

  return rows
    .filter((row) => rank(row.status) >= 0)
    .sort((a, b) => {
      if (rank(a.status) !== rank(b.status)) return rank(a.status) - rank(b.status);
      if (a.status === "in_production") return a.order_position - b.order_position;
      const at = a.status === "finished" ? time(a.completed_at) : time(a.shipped_at);
      const bt = b.status === "finished" ? time(b.completed_at) : time(b.shipped_at);
      return bt - at || b.serial_number - a.serial_number;
    });
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

  type DoneMarkLogRow = { machine_id: string; stage_id: number; worker_id: string; created_at: string };
  type DoneMarkSessionRow = Pick<WorkSessionRow, "worker_id" | "stage_id" | "started_at" | "ended_at"> & {
    work_session_machines: Array<{ machine_id: string }>;
  };

  const [logRows, sessionRows] = await Promise.all([
    fetchAllPages<DoneMarkLogRow>("No se pudieron cargar las marcas de avance", (from, to) =>
      supabase
        .from("stage_logs")
        .select("machine_id, stage_id, worker_id, created_at")
        .eq("new_completion", 100)
        .eq("is_undone", false)
        .gte("created_at", startIso)
        .lt("created_at", endIso)
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to),
    ),
    fetchAllPages<DoneMarkSessionRow>("No se pudieron cargar las sesiones", (from, to) =>
      supabase
        .from("work_sessions")
        .select("worker_id, stage_id, started_at, ended_at, work_session_machines(machine_id)")
        .eq("kind", "stage")
        .lt("started_at", endIso)
        .or(`ended_at.is.null,ended_at.gt.${startIso}`)
        .order("started_at", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to),
    ),
  ]);

  const sessions = sessionRows.map((row) => ({
    workerId: row.worker_id,
    stageId: row.stage_id,
    startMs: new Date(row.started_at).getTime(),
    endMs: row.ended_at ? new Date(row.ended_at).getTime() + GRACE_MS : Infinity,
    machineIds: new Set(row.work_session_machines.map((m) => m.machine_id)),
  }));

  return logRows
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

/**
 * A session should be flagged as reprocess time when it targets a stage that
 * is currently incomplete on a machine BUT whose latest (non-undone) log for
 * that stage was itself a reprocess — i.e. the worker is redoing a stage that
 * was already sent back once, not doing it for the first time.
 */
export async function computeSessionIsReprocess(
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
