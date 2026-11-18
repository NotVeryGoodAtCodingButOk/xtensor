import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { FLOOR_SNAPSHOT_VERSION, type FloorActivity, type FloorMachine, type FloorSnapshot } from "@/lib/floor/types";
import { isResumable } from "@/lib/floor/state";
import { listActivityTypes } from "@/services/activity-types";
import { chunked, fetchAllPages } from "@/services/batching";
import { listWorkers } from "@/services/catalog";
import { listMachinePrevioRows } from "@/services/previos";
import { listMachinesForActivities } from "@/services/work-sessions";
import type { Database } from "@/types/database";

type WorkSessionRow = Database["public"]["Tables"]["work_sessions"]["Row"];

/** Hasta cuándo atrás se puede reanudar algo pausado (igual que listPausedActivities). */
const PAUSED_ACTIVITY_WINDOW_DAYS = 30;

type MachineSnapshotRow = {
  id: string;
  serial_number: number;
  custom_equipment_name: string | null;
  status: FloorMachine["status"];
  order_position: number;
  city: string | null;
  equipment_catalog: { code: string | null; name: string } | null;
  clients: { name: string } | null;
  colors: { name: string } | null;
  machine_stages: Array<{ stage_id: number; completion: number }>;
};

type StageLogSnapshotRow = {
  machine_id: string;
  stage_id: number;
  new_completion: number;
  is_reprocess: boolean;
  created_at: string;
};

type SessionSnapshotRow = Pick<
  WorkSessionRow,
  | "id"
  | "activity_id"
  | "worker_id"
  | "kind"
  | "stage_id"
  | "note"
  | "is_reprocess"
  | "started_at"
  | "ended_at"
  | "end_reason"
> & {
  work_session_activity_types: Array<{ activity_type_id: string }>;
  work_session_machines: Array<{ machine_id: string; machines: { serial_number: number } | null }>;
};

const SESSION_SELECT =
  "id, activity_id, worker_id, kind, stage_id, note, is_reprocess, started_at, ended_at, end_reason, work_session_activity_types(activity_type_id), work_session_machines(machine_id, machines(serial_number))";

/**
 * Todo lo que el iPad necesita para trabajar sin conexión, en una sola
 * respuesta liviana (no usa MACHINE_SELECT: no trae precios ni historial completo).
 */
export async function getFloorSnapshot(now: Date = new Date()): Promise<FloorSnapshot> {
  const supabase = createSupabaseAdminClient();
  const serverTime = now.getTime();

  const [workers, stages, machineRows, activityMachines, activityTypes, activities, previoRows] = await Promise.all([
    listWorkers(true),
    loadStages(supabase),
    loadMachinesInProduction(supabase),
    listMachinesForActivities(now),
    listActivityTypes(true),
    loadActivities(supabase, now),
    listMachinePrevioRows(),
  ]);

  const logsByMachine = await loadLatestStageLogs(
    supabase,
    machineRows.map((row) => row.id),
  );

  const machines = machineRows.map<FloorMachine>((row) => {
    const progress: FloorMachine["stages"] = {};
    for (const stage of row.machine_stages) {
      const logs = logsByMachine.get(`${row.id}|${stage.stage_id}`) ?? [];
      const lastDone = logs.find((log) => log.new_completion === 100);
      progress[stage.stage_id] = {
        completion: stage.completion >= 100 ? 100 : 0,
        lastDoneAt: lastDone ? new Date(lastDone.created_at).getTime() : null,
        lastIsReprocess: logs[0]?.is_reprocess ?? false,
      };
    }
    return {
      id: row.id,
      serial: row.serial_number,
      code: row.equipment_catalog?.code ?? null,
      name: row.equipment_catalog?.name ?? row.custom_equipment_name ?? "Producto personalizado",
      client: row.clients?.name ?? "Cliente sin nombre",
      city: row.city,
      color: row.colors?.name ?? null,
      status: row.status,
      order: row.order_position,
      stages: progress,
    };
  });

  // Igual que listPausedActivities: lo pausado solo sigue si sus máquinas están en
  // producción y la etapa sigue pendiente en alguna. Lo abierto siempre se muestra.
  const machinesById = new Map(machines.map((machine) => [machine.id, machine]));
  const visibleActivities = activities.filter((activity) => {
    if (activity.segments.some((segment) => segment.endedAt === null)) return true;
    if (activity.kind !== "stage" || activity.stageId === null || !isResumable(activity)) return false;
    const stageId = activity.stageId;
    return (
      activity.machineIds.length > 0 &&
      activity.machineIds.every((id) => machinesById.has(id)) &&
      activity.machineIds.some((id) => machinesById.get(id)?.stages[stageId]?.completion !== 100)
    );
  });

  return {
    version: FLOOR_SNAPSHOT_VERSION,
    serverTime,
    workers: workers.map((worker) => ({
      id: worker.id,
      name: worker.full_name,
      role: worker.role,
      color: worker.display_color,
    })),
    stages,
    machines,
    activityMachines: activityMachines.map((machine) => ({
      id: machine.id,
      serial: machine.serialNumber,
      name: machine.equipmentName,
      client: machine.clientName,
      status: machine.status,
    })),
    activityTypes: activityTypes.map((type) => ({
      id: type.id,
      name: type.name,
      description: type.description,
      allowsMachine: type.allowsMachine,
    })),
    activities: visibleActivities,
    previoRows: previoRows
      .filter((row) => row.status === "pending" || row.status === "in_production")
      .map((row) => ({
        machineId: row.machineId,
        serial: row.serialNumber,
        client: row.clientName,
        equipment: row.equipmentName,
        color: row.colorName,
        promisedDate: row.promisedDate,
        previos: row.previos.map((previo) => ({
          previoCatalogId: previo.previoCatalogId,
          name: previo.name,
          received: previo.received,
        })),
      })),
  };
}

async function loadStages(supabase: ReturnType<typeof createSupabaseAdminClient>) {
  const { data, error } = await supabase.from("stages").select("id, name").order("display_order", { ascending: true });
  if (error) {
    throw new Error(`No se pudieron cargar las etapas: ${error.message}`);
  }
  return (data ?? []).map((row) => ({ id: row.id, name: row.name }));
}

async function loadMachinesInProduction(supabase: ReturnType<typeof createSupabaseAdminClient>) {
  const { data, error } = await supabase
    .from("machines")
    .select(
      "id, serial_number, custom_equipment_name, status, order_position, city, equipment_catalog(code, name), clients(name), colors(name), machine_stages(stage_id, completion)",
    )
    .eq("status", "in_production")
    .order("order_position", { ascending: true });

  if (error) {
    throw new Error(`No se pudieron cargar las máquinas: ${error.message}`);
  }
  return (data ?? []) as unknown as MachineSnapshotRow[];
}

/** Bitácoras vigentes (no deshechas) por máquina + etapa, la más reciente primero. */
async function loadLatestStageLogs(supabase: ReturnType<typeof createSupabaseAdminClient>, machineIds: string[]) {
  const byKey = new Map<string, StageLogSnapshotRow[]>();
  if (machineIds.length === 0) return byKey;

  const pages = await Promise.all(
    chunked(machineIds).map((chunk) =>
      fetchAllPages<StageLogSnapshotRow>("No se pudo cargar el historial de las etapas", (from, to) =>
        supabase
          .from("stage_logs")
          .select("machine_id, stage_id, new_completion, is_reprocess, created_at")
          .in("machine_id", chunk)
          .eq("is_undone", false)
          .order("created_at", { ascending: false })
          .order("id", { ascending: true })
          .range(from, to),
      ),
    ),
  );

  for (const log of pages.flat()) {
    const key = `${log.machine_id}|${log.stage_id}`;
    const list = byKey.get(key);
    if (list) list.push(log);
    else byKey.set(key, [log]);
  }
  for (const list of byKey.values()) {
    list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }
  return byKey;
}

/**
 * Cadenas abiertas (de cualquier operario) y cadenas de etapa recientes que
 * pueden estar pausadas, cada una con todos sus tramos.
 */
async function loadActivities(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  now: Date,
): Promise<FloorActivity[]> {
  const cutoff = new Date(now.getTime() - PAUSED_ACTIVITY_WINDOW_DAYS * 24 * 60 * 60_000).toISOString();

  const { data: seeds, error: seedsError } = await supabase
    .from("work_sessions")
    .select("activity_id")
    .or(`ended_at.is.null,and(kind.eq.stage,started_at.gte.${cutoff})`);

  if (seedsError) {
    throw new Error(`No se pudieron cargar las sesiones: ${seedsError.message}`);
  }

  const activityIds = [...new Set((seeds ?? []).map((row) => row.activity_id))];
  if (activityIds.length === 0) return [];

  const rows = (
    await Promise.all(
      chunked(activityIds).map(async (chunk) => {
        const { data, error } = await supabase
          .from("work_sessions")
          .select(SESSION_SELECT)
          .in("activity_id", chunk)
          .order("started_at", { ascending: true });
        if (error) {
          throw new Error(`No se pudieron cargar las sesiones: ${error.message}`);
        }
        return (data ?? []) as unknown as SessionSnapshotRow[];
      }),
    )
  ).flat();

  const chains = new Map<string, SessionSnapshotRow[]>();
  for (const row of rows) {
    const chain = chains.get(row.activity_id);
    if (chain) chain.push(row);
    else chains.set(row.activity_id, [row]);
  }

  return [...chains.values()].map((segments) => {
    segments.sort((a, b) => new Date(a.started_at).getTime() - new Date(b.started_at).getTime());
    const first = segments[0];
    const last = segments[segments.length - 1];
    const machines = new Map<string, number>();
    for (const entry of first.work_session_machines ?? []) {
      machines.set(entry.machine_id, entry.machines?.serial_number ?? 0);
    }
    return {
      activityId: first.activity_id,
      workerId: first.worker_id,
      kind: first.kind,
      stageId: last.stage_id,
      activityTypeIds: (last.work_session_activity_types ?? []).map((entry) => entry.activity_type_id),
      note: first.note,
      isReprocess: first.is_reprocess,
      machineIds: [...machines.keys()],
      machineSerials: [...machines.values()],
      segments: segments.map((segment) => ({
        id: segment.id,
        startedAt: new Date(segment.started_at).getTime(),
        endedAt: segment.ended_at ? new Date(segment.ended_at).getTime() : null,
        endReason: segment.end_reason,
      })),
    };
  });
}
