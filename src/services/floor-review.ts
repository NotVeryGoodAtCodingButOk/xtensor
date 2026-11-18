import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { FLOOR_COMMAND_LABELS, FLOOR_FLAG_LABELS, type FloorCommandType } from "@/lib/floor/commands";

/** Cuánto atrás se muestran los registros de planta para revisar. */
const REVIEW_WINDOW_DAYS = 30;

export type FloorReviewItem = {
  id: string;
  occurredAt: string;
  receivedAt: string;
  workerName: string | null;
  action: string;
  detail: string;
  status: "applied_flagged" | "rejected";
  reasons: string[];
};

export type FloorDeviceView = {
  deviceId: string;
  device: string;
  lastSyncAt: string;
  pendingCount: number;
  swSupported: boolean | null;
  appVersion: string | null;
};

type Payload = {
  workerId?: string;
  sessionId?: string;
  activityId?: string;
  machineId?: string;
  machineIds?: string[];
  stageId?: number;
  completion?: number;
  received?: boolean;
  activityTypeIds?: string[];
};

/**
 * Registros del iPad que llegaron con conflicto (se guardaron y se marcaron) o
 * que no se pudieron guardar, aún sin revisar.
 */
export async function listFloorReviewItems(): Promise<FloorReviewItem[]> {
  const supabase = createSupabaseAdminClient();
  const since = new Date(Date.now() - REVIEW_WINDOW_DAYS * 24 * 60 * 60_000).toISOString();

  const { data, error } = await supabase
    .from("floor_commands")
    .select("id, type, payload, worker_id, occurred_at, received_at, status, flags, error")
    .in("status", ["applied_flagged", "rejected"])
    .is("reviewed_at", null)
    .gte("received_at", since)
    .order("occurred_at", { ascending: false })
    .limit(200);

  if (error) {
    throw new Error(`No se pudieron cargar los registros de planta: ${error.message}`);
  }

  const rows = data ?? [];
  if (rows.length === 0) return [];

  const payloads = rows.map((row) => (row.payload ?? {}) as Payload);
  const workerIds = [...new Set(rows.map((row) => row.worker_id).filter((id): id is string => Boolean(id)))];
  const machineIds = [
    ...new Set(payloads.flatMap((payload) => [...(payload.machineIds ?? []), ...(payload.machineId ? [payload.machineId] : [])])),
  ];

  // Pausar/terminar/reanudar solo traen la sesión o la actividad: la etapa y las
  // máquinas se buscan en la sesión que quedó guardada.
  const sessionIds = [...new Set(payloads.map((payload) => payload.sessionId).filter((id): id is string => Boolean(id)))];
  const activityIds = [...new Set(payloads.map((payload) => payload.activityId).filter((id): id is string => Boolean(id)))];

  const [workers, machines, stages, sessions] = await Promise.all([
    workerIds.length ? supabase.from("workers").select("id, full_name").in("id", workerIds) : Promise.resolve({ data: [] }),
    machineIds.length ? supabase.from("machines").select("id, serial_number").in("id", machineIds) : Promise.resolve({ data: [] }),
    supabase.from("stages").select("id, name"),
    sessionIds.length || activityIds.length
      ? supabase
          .from("work_sessions")
          .select("id, activity_id, stage_id, work_session_machines(machines(serial_number)), work_session_activity_types(activity_types(name))")
          .or(
            [
              sessionIds.length ? `id.in.(${sessionIds.join(",")})` : null,
              activityIds.length ? `activity_id.in.(${activityIds.join(",")})` : null,
            ]
              .filter(Boolean)
              .join(","),
          )
      : Promise.resolve({ data: [] }),
  ]);

  const workerName = new Map((workers.data ?? []).map((row) => [row.id, row.full_name]));
  const serial = new Map((machines.data ?? []).map((row) => [row.id, row.serial_number]));
  const stageName = new Map((stages.data ?? []).map((row) => [row.id, row.name]));

  type SessionInfo = {
    id: string;
    activity_id: string;
    stage_id: number | null;
    work_session_machines: Array<{ machines: { serial_number: number } | null }>;
    work_session_activity_types: Array<{ activity_types: { name: string } | null }>;
  };
  const describeSession = (session: SessionInfo | undefined) => {
    if (!session) return [];
    const activity = session.stage_id
      ? stageName.get(session.stage_id) ?? `Etapa ${session.stage_id}`
      : session.work_session_activity_types.map((entry) => entry.activity_types?.name).filter(Boolean).join(" + ");
    const serials = session.work_session_machines.map((entry) => `#${entry.machines?.serial_number ?? "?"}`).join(", ");
    return [activity || null, serials || null];
  };
  const sessionRows = (sessions.data ?? []) as unknown as SessionInfo[];
  const bySession = new Map(sessionRows.map((session) => [session.id, session]));
  const byActivity = new Map(sessionRows.map((session) => [session.activity_id, session]));

  return rows.map((row, index) => {
    const payload = payloads[index];
    const ids = payload.machineIds ?? (payload.machineId ? [payload.machineId] : []);
    const fromSession =
      ids.length === 0 && !payload.stageId
        ? describeSession(
            (payload.sessionId ? bySession.get(payload.sessionId) : undefined) ??
              (payload.activityId ? byActivity.get(payload.activityId) : undefined),
          )
        : [];
    const parts = [
      ...fromSession,
      payload.stageId ? stageName.get(payload.stageId) ?? `Etapa ${payload.stageId}` : null,
      ids.length ? ids.map((id) => `#${serial.get(id) ?? "?"}`).join(", ") : null,
      row.type === "stage.set" ? (payload.completion === 100 ? "hecha" : "pendiente") : null,
      row.type === "previo.set_received" ? (payload.received ? "recibido" : "no recibido") : null,
    ].filter(Boolean);

    return {
      id: row.id,
      occurredAt: row.occurred_at,
      receivedAt: row.received_at,
      workerName: row.worker_id ? workerName.get(row.worker_id) ?? null : null,
      action: FLOOR_COMMAND_LABELS[row.type as FloorCommandType] ?? row.type,
      detail: parts.join(" · "),
      status: row.status as FloorReviewItem["status"],
      reasons:
        row.status === "rejected"
          ? [row.error ?? "No se pudo guardar."]
          : (row.flags ?? []).map((flag) => FLOOR_FLAG_LABELS[flag] ?? flag),
    };
  });
}

export async function listFloorDevices(): Promise<FloorDeviceView[]> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("floor_devices")
    .select("device_id, device, last_sync_at, pending_count, sw_supported, app_version")
    .order("last_sync_at", { ascending: false })
    .limit(20);

  if (error) {
    throw new Error(`No se pudieron cargar los dispositivos de planta: ${error.message}`);
  }

  return (data ?? []).map((row) => ({
    deviceId: row.device_id,
    device: row.device,
    lastSyncAt: row.last_sync_at,
    pendingCount: row.pending_count,
    swSupported: row.sw_supported,
    appVersion: row.app_version,
  }));
}

export async function markFloorCommandReviewed(id: string) {
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.from("floor_commands").update({ reviewed_at: new Date().toISOString() }).eq("id", id);
  if (error) {
    throw new Error(`No se pudo marcar como revisado: ${error.message}`);
  }
}
