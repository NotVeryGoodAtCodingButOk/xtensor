/**
 * Aplica un comando de planta en la base de datos. Cada paso es idempotente
 * (ids del iPad, "solo si sigue abierta", command_id en bitácoras), así que
 * reaplicar un comando a medias tras una caída deja todo igual que una vez.
 *
 * Política de conflictos (decisión del negocio): el tiempo trabajado es un
 * hecho y siempre se guarda; los cambios de estado que ya no aplican se
 * saltan. Ambos casos se marcan (flags) para revisión en
 * /admin/sincronizacion. Solo se rechaza lo imposible (operario, máquina o
 * sesión que no existen).
 */
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { FloorCommandOf } from "@/lib/floor/commands";
import { FloorRejection, type ApplyContext } from "@/services/floor-sync/process";
import { toggleMachinePrevio } from "@/services/previos";
import { updateStageProgress } from "@/services/stages";
import { completeStageOnMachines, computeSessionIsReprocess } from "@/services/work-sessions";

type Supabase = ReturnType<typeof createSupabaseAdminClient>;

type SegmentRow = {
  id: string;
  activity_id: string;
  worker_id: string;
  kind: "stage" | "other";
  stage_id: number | null;
  is_reprocess: boolean;
  started_at: string;
  ended_at: string | null;
  end_reason: "completed" | "paused" | null;
  work_session_machines: Array<{ machine_id: string }>;
};

const SEGMENT_SELECT =
  "id, activity_id, worker_id, kind, stage_id, is_reprocess, started_at, ended_at, end_reason, work_session_machines(machine_id)";

export async function applyFloorCommand(context: ApplyContext): Promise<void> {
  const supabase = createSupabaseAdminClient();
  const { command } = context;

  switch (command.type) {
    case "session.start_stage":
      return startStage(supabase, context, command);
    case "session.start_other":
      return startOther(supabase, context, command);
    case "session.pause":
      return closeSegment(supabase, context, command, "paused");
    case "session.finish":
      return closeSegment(supabase, context, command, "completed");
    case "session.resume":
      return resume(supabase, context, command);
    case "activity.finish_paused":
      return finishPaused(supabase, context, command);
    case "stage.set":
      return setStage(supabase, context, command);
    case "previo.set_received":
      return setPrevioReceived(supabase, context, command);
  }
}

async function startStage(supabase: Supabase, context: ApplyContext, command: FloorCommandOf<"session.start_stage">) {
  const { workerId, sessionId, activityId, stageId } = command.payload;
  const machineIds = [...new Set(command.payload.machineIds)];
  await assertWorker(supabase, workerId);
  await assertStage(supabase, stageId);
  const statuses = await machineStatuses(supabase, machineIds);
  if (statuses.some((status) => status !== "in_production")) context.flags.push("machine_not_in_production");

  if (!(await sessionExists(supabase, sessionId))) {
    await closeUnknownOpenSession(supabase, context, workerId, sessionId);
    const isReprocess = await computeSessionIsReprocess(supabase, machineIds, stageId);
    await insertSegment(supabase, {
      id: sessionId,
      activity_id: activityId,
      worker_id: workerId,
      kind: "stage",
      stage_id: stageId,
      is_reprocess: isReprocess,
      started_at: context.occurredAt.toISOString(),
    });
  }
  await linkMachines(supabase, sessionId, machineIds);
}

async function startOther(supabase: Supabase, context: ApplyContext, command: FloorCommandOf<"session.start_other">) {
  const { workerId, sessionId, activityId } = command.payload;
  const activityTypeIds = [...new Set(command.payload.activityTypeIds)];
  const machineIds = [...new Set(command.payload.machineIds)];
  await assertWorker(supabase, workerId);

  const { data: types, error: typesError } = await supabase.from("activity_types").select("id").in("id", activityTypeIds);
  if (typesError) throw new Error(`No se pudieron verificar las actividades: ${typesError.message}`);
  if ((types ?? []).length !== activityTypeIds.length) {
    throw new FloorRejection("Alguna de las actividades ya no existe.");
  }
  await machineStatuses(supabase, machineIds);

  if (!(await sessionExists(supabase, sessionId))) {
    await closeUnknownOpenSession(supabase, context, workerId, sessionId);
    await insertSegment(supabase, {
      id: sessionId,
      activity_id: activityId,
      worker_id: workerId,
      kind: "other",
      stage_id: null,
      is_reprocess: false,
      started_at: context.occurredAt.toISOString(),
    });
  }

  const { error: linkError } = await supabase
    .from("work_session_activity_types")
    .upsert(
      activityTypeIds.map((activityTypeId) => ({ session_id: sessionId, activity_type_id: activityTypeId })),
      { onConflict: "session_id,activity_type_id", ignoreDuplicates: true },
    );
  if (linkError) throw new Error(`No se pudieron asociar las actividades: ${linkError.message}`);
  await linkMachines(supabase, sessionId, machineIds);
}

async function closeSegment(
  supabase: Supabase,
  context: ApplyContext,
  command: FloorCommandOf<"session.pause"> | FloorCommandOf<"session.finish">,
  reason: "paused" | "completed",
) {
  const { workerId, sessionId } = command.payload;
  const { data, error } = await supabase.from("work_sessions").select(SEGMENT_SELECT).eq("id", sessionId).maybeSingle();
  if (error) throw new Error(`No se pudo cargar la sesión: ${error.message}`);
  const segment = data as unknown as SegmentRow | null;
  if (!segment) throw new FloorRejection("La sesión no existe: su inicio no se pudo guardar.");
  if (segment.worker_id !== workerId) throw new FloorRejection("La sesión es de otro operario.");

  const endedAt = notBefore(context.occurredAt, segment.started_at);
  if (segment.ended_at === null) {
    const { error: updateError } = await supabase
      .from("work_sessions")
      .update({ ended_at: endedAt, end_reason: reason })
      .eq("id", sessionId)
      .is("ended_at", null);
    if (updateError) throw new Error(`No se pudo cerrar la sesión: ${updateError.message}`);
  } else if (!(sameInstant(segment.ended_at, endedAt) && segment.end_reason === reason)) {
    // La cerró alguien más (o el mismo iPad con otra hora): se deja como estaba.
    context.flags.push("already_closed");
  }

  if (reason === "completed" && segment.kind === "stage" && segment.stage_id !== null) {
    const machineIds = segment.work_session_machines.map((entry) => entry.machine_id);
    // Otro operario sigue con el cronómetro corriendo: su tiempo ya quedó guardado
    // y la etapa la cierra el último en terminar.
    if (await othersActiveOnStage(supabase, { machineIds, stageId: segment.stage_id, workerId })) return;
    await completeStage(supabase, context, {
      machineIds: segment.work_session_machines.map((entry) => entry.machine_id),
      stageId: segment.stage_id,
      workerId,
    });
  }
}

async function resume(supabase: Supabase, context: ApplyContext, command: FloorCommandOf<"session.resume">) {
  const { workerId, sessionId, activityId } = command.payload;
  const segments = await loadChain(supabase, activityId);
  if (segments.length === 0) throw new FloorRejection("La actividad no existe: su inicio no se pudo guardar.");
  if (segments[0].worker_id !== workerId) throw new FloorRejection("La actividad es de otro operario.");

  const first = segments[0];
  const machineIds = [...new Set(first.work_session_machines.map((entry) => entry.machine_id))];

  if (!segments.some((segment) => segment.id === sessionId)) {
    const last = segments[segments.length - 1];
    const resumable =
      segments.every((segment) => segment.ended_at !== null && segment.end_reason !== "completed") &&
      last.end_reason === "paused";
    if (!resumable) context.flags.push("not_resumable");

    const statuses = await machineStatuses(supabase, machineIds);
    if (statuses.some((status) => status !== "in_production")) context.flags.push("machine_not_in_production");

    await closeUnknownOpenSession(supabase, context, workerId, sessionId);
    await insertSegment(supabase, {
      id: sessionId,
      activity_id: activityId,
      worker_id: workerId,
      kind: "stage",
      stage_id: last.stage_id,
      is_reprocess: first.is_reprocess,
      started_at: notBefore(context.occurredAt, last.ended_at ?? last.started_at),
    });
  }
  await linkMachines(supabase, sessionId, machineIds);
}

async function finishPaused(supabase: Supabase, context: ApplyContext, command: FloorCommandOf<"activity.finish_paused">) {
  const { workerId, activityId } = command.payload;
  const segments = await loadChain(supabase, activityId);
  if (segments.length === 0) throw new FloorRejection("La actividad no existe: su inicio no se pudo guardar.");
  if (segments[0].worker_id !== workerId) throw new FloorRejection("La actividad es de otro operario.");

  const last = segments[segments.length - 1];
  if (last.ended_at === null) {
    context.flags.push("not_resumable");
  } else if (last.end_reason === "paused") {
    const { error } = await supabase
      .from("work_sessions")
      .update({ end_reason: "completed" })
      .eq("id", last.id)
      .eq("end_reason", "paused");
    if (error) throw new Error(`No se pudo cerrar la actividad: ${error.message}`);
  }

  if (last.kind === "stage" && last.stage_id !== null) {
    const machineIds = segments[0].work_session_machines.map((entry) => entry.machine_id);
    if (await othersActiveOnStage(supabase, { machineIds, stageId: last.stage_id, workerId })) return;
    await completeStage(supabase, context, { machineIds, stageId: last.stage_id, workerId });
  }
}

/** Otro operario tiene una sesión abierta en esta etapa y alguna de estas máquinas. */
async function othersActiveOnStage(
  supabase: Supabase,
  input: { machineIds: string[]; stageId: number; workerId: string },
): Promise<boolean> {
  const machineIds = [...new Set(input.machineIds)];
  if (machineIds.length === 0) return false;
  const { data, error } = await supabase
    .from("work_sessions")
    .select("id, work_session_machines!inner(machine_id)")
    .eq("kind", "stage")
    .eq("stage_id", input.stageId)
    .is("ended_at", null)
    .neq("worker_id", input.workerId)
    .in("work_session_machines.machine_id", machineIds)
    .limit(1);
  if (error) throw new Error(`No se pudo verificar a los demás operarios: ${error.message}`);
  return (data ?? []).length > 0;
}

async function setStage(supabase: Supabase, context: ApplyContext, command: FloorCommandOf<"stage.set">) {
  const { workerId, machineId, stageId, completion } = command.payload;
  await assertWorker(supabase, workerId);

  const { data: stage, error } = await supabase
    .from("machine_stages")
    .select("id")
    .eq("machine_id", machineId)
    .eq("stage_id", stageId)
    .maybeSingle();
  if (error) throw new Error(`No se pudo cargar la etapa: ${error.message}`);
  if (!stage) throw new FloorRejection("Esa etapa no existe en la máquina.");

  // Si la sacaron de producción mientras tanto (terminada, despachada…), marcar la
  // etapa la devolvería a producción: el cambio se salta y se deja para revisión.
  const [status] = await machineStatuses(supabase, [machineId]);
  if (status !== "in_production") {
    context.flags.push("stage_not_marked");
    return;
  }

  if (await stageChangedAfter(supabase, machineId, stageId, context)) {
    context.flags.push("superseded");
    return;
  }

  await updateStageProgress({ machineId, stageId, completion, workerId, at: context.occurredAt, commandId: context.command.id });
}

async function setPrevioReceived(
  supabase: Supabase,
  context: ApplyContext,
  command: FloorCommandOf<"previo.set_received">,
) {
  const { machineId, previoCatalogId, received } = command.payload;

  const [{ data: machine, error: machineError }, { data: previo, error: previoError }] = await Promise.all([
    supabase.from("machines").select("id").eq("id", machineId).maybeSingle(),
    supabase.from("previo_catalog").select("id").eq("id", previoCatalogId).maybeSingle(),
  ]);
  if (machineError || previoError) {
    throw new Error(`No se pudo verificar el previo: ${(machineError ?? previoError)?.message}`);
  }
  if (!machine || !previo) throw new FloorRejection("La máquina o el material ya no existe.");

  const { data: latestEvent, error: eventError } = await supabase
    .from("machine_previo_events")
    .select("created_at, command_id")
    .eq("machine_id", machineId)
    .eq("previo_catalog_id", previoCatalogId)
    .in("event_type", ["received_checked", "received_unchecked"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (eventError) throw new Error(`No se pudo verificar el historial del previo: ${eventError.message}`);
  if (latestEvent?.command_id === context.command.id) return; // ya aplicado
  if (latestEvent && new Date(latestEvent.created_at).getTime() > context.occurredAt.getTime()) {
    context.flags.push("superseded");
    return;
  }

  const { data: current, error: currentError } = await supabase
    .from("machine_previos")
    .select("received")
    .eq("machine_id", machineId)
    .eq("previo_catalog_id", previoCatalogId)
    .maybeSingle();
  if (currentError) throw new Error(`No se pudo cargar el previo: ${currentError.message}`);
  if ((current?.received ?? false) === received) return;

  await toggleMachinePrevio({
    machineId,
    previoCatalogId,
    field: "received",
    checked: received,
    actorProfileId: null,
    at: context.occurredAt,
    commandId: context.command.id,
  });
}

// ── Utilidades ───────────────────────────────────────────────────────────────

/**
 * Marca la etapa hecha en cada máquina, salvo donde ya no está en producción
 * (marcarla la devolvería a producción) o alguien la cambió después de este toque.
 * El tiempo de la sesión ya quedó guardado en ambos casos.
 */
async function completeStage(
  supabase: Supabase,
  context: ApplyContext,
  input: { machineIds: string[]; stageId: number; workerId: string },
) {
  const unique = [...new Set(input.machineIds)];
  const statuses = await machineStatuses(supabase, unique);
  const machineIds: string[] = [];
  for (const [index, machineId] of unique.entries()) {
    if (statuses[index] !== "in_production") {
      context.flags.push("stage_not_marked");
    } else if (await stageChangedAfter(supabase, machineId, input.stageId, context)) {
      context.flags.push("superseded");
    } else {
      machineIds.push(machineId);
    }
  }
  if (machineIds.length === 0) return;

  await completeStageOnMachines(supabase, {
    machineIds,
    stageId: input.stageId,
    workerId: input.workerId,
    at: context.occurredAt,
    commandId: context.command.id,
  });
}

/** Hay una bitácora vigente de otro origen posterior a este toque: ese cambio manda. */
async function stageChangedAfter(supabase: Supabase, machineId: string, stageId: number, context: ApplyContext) {
  const { data, error } = await supabase
    .from("stage_logs")
    .select("id, command_id")
    .eq("machine_id", machineId)
    .eq("stage_id", stageId)
    .eq("is_undone", false)
    .gt("created_at", context.occurredAt.toISOString())
    .limit(5);
  if (error) throw new Error(`No se pudo verificar el historial de la etapa: ${error.message}`);
  return (data ?? []).some((log) => log.command_id !== context.command.id);
}

/**
 * El iPad creía que el operario no tenía nada abierto pero el servidor sí (otra
 * sesión que el iPad no conocía): se pausa a la hora de este inicio y se marca.
 */
async function closeUnknownOpenSession(supabase: Supabase, context: ApplyContext, workerId: string, keepSessionId: string) {
  const { data, error } = await supabase
    .from("work_sessions")
    .select("id, started_at")
    .eq("worker_id", workerId)
    .is("ended_at", null)
    .neq("id", keepSessionId);
  if (error) throw new Error(`No se pudo verificar la sesión en curso: ${error.message}`);

  for (const open of data ?? []) {
    const { error: closeError } = await supabase
      .from("work_sessions")
      .update({ ended_at: notBefore(context.occurredAt, open.started_at), end_reason: "paused" })
      .eq("id", open.id)
      .is("ended_at", null);
    if (closeError) throw new Error(`No se pudo pausar la sesión anterior: ${closeError.message}`);
    context.flags.push("closed_unknown_open_session");
  }
}

async function insertSegment(
  supabase: Supabase,
  row: {
    id: string;
    activity_id: string;
    worker_id: string;
    kind: "stage" | "other";
    stage_id: number | null;
    is_reprocess: boolean;
    started_at: string;
  },
) {
  const { error } = await supabase.from("work_sessions").upsert(row, { onConflict: "id", ignoreDuplicates: true });
  if (error) throw new Error(`No se pudo guardar la sesión: ${error.message}`);
}

async function linkMachines(supabase: Supabase, sessionId: string, machineIds: string[]) {
  if (machineIds.length === 0) return;
  const { error } = await supabase
    .from("work_session_machines")
    .upsert(
      machineIds.map((machineId) => ({ session_id: sessionId, machine_id: machineId })),
      { onConflict: "session_id,machine_id", ignoreDuplicates: true },
    );
  if (error) throw new Error(`No se pudieron asociar las máquinas: ${error.message}`);
}

async function sessionExists(supabase: Supabase, sessionId: string) {
  const { data, error } = await supabase.from("work_sessions").select("id").eq("id", sessionId).maybeSingle();
  if (error) throw new Error(`No se pudo verificar la sesión: ${error.message}`);
  return Boolean(data);
}

async function loadChain(supabase: Supabase, activityId: string): Promise<SegmentRow[]> {
  const { data, error } = await supabase
    .from("work_sessions")
    .select(SEGMENT_SELECT)
    .eq("activity_id", activityId)
    .order("started_at", { ascending: true });
  if (error) throw new Error(`No se pudo cargar la actividad: ${error.message}`);
  return (data ?? []) as unknown as SegmentRow[];
}

async function assertWorker(supabase: Supabase, workerId: string) {
  const { data, error } = await supabase.from("workers").select("id").eq("id", workerId).maybeSingle();
  if (error) throw new Error(`No se pudo verificar el operario: ${error.message}`);
  if (!data) throw new FloorRejection("El operario ya no existe.");
}

async function assertStage(supabase: Supabase, stageId: number) {
  const { data, error } = await supabase.from("stages").select("id").eq("id", stageId).maybeSingle();
  if (error) throw new Error(`No se pudo verificar la etapa: ${error.message}`);
  if (!data) throw new FloorRejection("La etapa ya no existe.");
}

/** Estado de cada máquina; rechaza si alguna ya no existe. */
async function machineStatuses(supabase: Supabase, machineIds: string[]) {
  if (machineIds.length === 0) return [];
  const { data, error } = await supabase.from("machines").select("id, status").in("id", machineIds);
  if (error) throw new Error(`No se pudieron verificar las máquinas: ${error.message}`);
  if ((data ?? []).length !== machineIds.length) throw new FloorRejection("Alguna de las máquinas ya no existe.");
  const byId = new Map((data ?? []).map((row) => [row.id, row.status]));
  return machineIds.map((id) => byId.get(id) as string);
}

/** La hora del comando, pero nunca antes de `floorIso` (la base exige fin ≥ inicio). */
function notBefore(at: Date, floorIso: string) {
  const floor = new Date(floorIso).getTime();
  return new Date(Math.max(at.getTime(), floor)).toISOString();
}

function sameInstant(a: string, b: string) {
  return new Date(a).getTime() === new Date(b).getTime();
}
