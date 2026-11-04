import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { normalizeMachineLine } from "@/lib/machine-lines";
import type { Database } from "@/types/database";
import type { CalculatedMachineView, MachineView, StageView } from "@/types/domain";
import {
  calculateQueue,
  DEFAULT_STAGES,
  type ProductionSettings,
  resolveLaborFactor,
} from "@/services/calculations";
import { createMachinePreviosFromEquipment } from "@/services/previos";
import { addClientBuffer, estimateDeliveryDate, type Holiday } from "@/services/schedule";
import { listHolidays } from "@/services/catalog";
import { getSettings, mapSettings } from "@/services/settings";

type MachineInsert = Database["public"]["Tables"]["machines"]["Insert"];
type MachineUpdate = Database["public"]["Tables"]["machines"]["Update"];
type MachineWarrantyEventInsert = Database["public"]["Tables"]["machine_warranty_events"]["Insert"];
type MachineQueueRow = Pick<Database["public"]["Tables"]["machines"]["Row"], "id" | "order_position" | "status" | "created_at">;
type ListMachineStatus = Extract<
  Database["public"]["Tables"]["machines"]["Row"]["status"],
  "in_production" | "finished" | "shipped" | "on_hold"
>;
type MachineStatusFilter = ListMachineStatus | readonly ListMachineStatus[];

type MachineRow = Database["public"]["Tables"]["machines"]["Row"] & {
  clients: Database["public"]["Tables"]["clients"]["Row"] | null;
  colors: Database["public"]["Tables"]["colors"]["Row"] | null;
  equipment_catalog: Database["public"]["Tables"]["equipment_catalog"]["Row"] | null;
  machine_stages: Array<
    Database["public"]["Tables"]["machine_stages"]["Row"] & {
      stages: Database["public"]["Tables"]["stages"]["Row"] | null;
      workers: Database["public"]["Tables"]["workers"]["Row"] | null;
    }
  >;
  stage_logs: Array<
    Pick<Database["public"]["Tables"]["stage_logs"]["Row"], "stage_id" | "is_reprocess" | "is_undone" | "created_at">
  >;
  machine_warranty_events: Array<Pick<Database["public"]["Tables"]["machine_warranty_events"]["Row"], "id">>;
};

const MACHINE_SELECT = `
  *,
  clients(*),
  colors(*),
  equipment_catalog(*),
  machine_stages(
    *,
    stages(*),
    workers(*)
  ),
  stage_logs(stage_id, is_reprocess, is_undone, created_at),
  machine_warranty_events(id)
`;

export const FACTORY_BOARD_STATUSES = ["in_production", "finished"] as const satisfies readonly ListMachineStatus[];

export async function listMachines(
  status?: MachineStatusFilter,
  options?: { shippedRetentionDays?: number; now?: Date },
) {
  const supabase = createSupabaseAdminClient();
  const statusFilter = normalizeMachineStatusFilter(status);
  const shippedOnly = statusFilter.length === 1 && statusFilter[0] === "shipped";
  let query = supabase.from("machines").select(MACHINE_SELECT);

  if (statusFilter.includes("shipped") && !shippedOnly) {
    throw new Error("Las máquinas despachadas deben consultarse en una lista separada.");
  }

  if (shippedOnly) {
    query = query.order("shipped_at", { ascending: false }).order("order_position", { ascending: true });
  } else {
    query = query.order("order_position", { ascending: true });
  }

  if (statusFilter.length === 1) {
    query = query.eq("status", statusFilter[0]);
  } else if (statusFilter.length > 1) {
    query = query.in("status", statusFilter);
  }

  if (shippedOnly) {
    const shippedRetentionDays = options?.shippedRetentionDays ?? 60;
    const shippedSince = new Date(options?.now ?? new Date());
    shippedSince.setDate(shippedSince.getDate() - Math.max(0, shippedRetentionDays));
    query = query.gte("shipped_at", shippedSince.toISOString());
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`No se pudieron cargar las máquinas: ${error.message}`);
  }

  return (data as unknown as MachineRow[]).map(mapMachineRow);
}

export async function listClientVisibleMachines(clientId: string) {
  const supabase = createSupabaseAdminClient();
  const shippedSince = new Date();
  shippedSince.setDate(shippedSince.getDate() - 60);

  const { data, error } = await supabase
    .from("machines")
    .select(MACHINE_SELECT)
    .eq("client_id", clientId)
    .or(`status.eq.in_production,and(status.eq.shipped,shipped_at.gte.${shippedSince.toISOString()})`)
    .order("order_position", { ascending: true });

  if (error) {
    throw new Error(`No se pudieron cargar las máquinas del cliente: ${error.message}`);
  }

  return (data as unknown as MachineRow[]).map(mapMachineRow);
}

export async function listCalculatedMachines(input: {
  settings: ProductionSettings;
  holidays: Holiday[];
  startDate?: Date;
  status?: MachineStatusFilter;
  shippedRetentionDays?: number;
}) {
  const machines = await listMachines(input.status, {
    shippedRetentionDays: input.shippedRetentionDays,
  });
  return calculateMachines(machines, input.settings, input.holidays, input.startDate);
}

export function normalizeMachineStatusFilter(status?: MachineStatusFilter) {
  if (!status) {
    return [];
  }

  return typeof status === "string" ? [status] : [...new Set(status)];
}

export function calculateMachines(
  machines: MachineView[],
  settings: ProductionSettings,
  holidays: Holiday[],
  startDate = new Date(),
) {
  const queue = calculateQueue(
    machines
      .filter((machine) => machine.status === "in_production")
      .map((machine) => ({
        id: machine.id,
        salePriceCop: machine.salePriceCop,
        laborFactor: machine.equipmentLaborFactor,
        orderPosition: machine.orderPosition,
        promisedDate: machine.promisedDate,
        stages: machine.stages.map((stage) => ({
          stageId: stage.id,
          completion: stage.completion,
        })),
      })),
    settings,
    DEFAULT_STAGES,
  );
  const calculationsById = new Map(queue.map((calculation) => [calculation.machineId, calculation]));

  return machines.map<CalculatedMachineView>((machine) => {
    const calculation = calculationsById.get(machine.id) ?? {
      machineId: machine.id,
      progressPct: 1,
      totalHours: 0,
      remainingHours: 0,
      remainingHumanDays: 0,
      accumulatedHours: 0,
    };
    const estimatedDate =
      machine.status === "shipped" && machine.shippedAt
        ? machine.shippedAt.slice(0, 10)
        : estimateDeliveryDate(calculation.accumulatedHours, startDate, settings, holidays);
    const lastCompletedStageAt = machine.stages
      .filter((stage) => stage.completion === 100 && stage.lastUpdatedAt)
      .sort((a, b) => b.id - a.id)[0]?.lastUpdatedAt ?? null;
    const { laborFactor, source: laborFactorSource } = resolveLaborFactor(machine.equipmentLaborFactor, settings);

    return {
      ...machine,
      ...calculation,
      laborFactor,
      laborFactorSource,
      estimatedDate,
      clientEstimatedDate: addClientBuffer(estimatedDate, settings.clientBufferDays),
      lastCompletedStageAt,
    };
  });
}

export async function getMachine(id: string) {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.from("machines").select(MACHINE_SELECT).eq("id", id).single();

  if (error) {
    throw new Error(`No se pudo cargar la máquina: ${error.message}`);
  }

  return mapMachineRow(data as unknown as MachineRow);
}

export async function getMaxOrderPosition() {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("machines")
    .select("order_position")
    .order("order_position", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`No se pudo calcular la posición en cola: ${error.message}`);
  }

  return data?.order_position ?? 0;
}

export async function createMachine(input: MachineInsert) {
  const supabase = createSupabaseAdminClient();
  const { data: machine, error: machineError } = await supabase
    .from("machines")
    .insert(input)
    .select("*")
    .single();

  if (machineError) {
    throw new Error(`No se pudo crear la máquina: ${machineError.message}`);
  }

  const stageRows = DEFAULT_STAGES.map((stage) => ({
    machine_id: machine.id,
    stage_id: stage.id,
    completion: 0,
  }));
  const { error: stagesError } = await supabase.from("machine_stages").insert(stageRows);

  if (stagesError) {
    await supabase.from("machines").delete().eq("id", machine.id);
    throw new Error(`No se pudieron crear las etapas: ${stagesError.message}`);
  }

  try {
    await createMachinePreviosFromEquipment(machine.id, machine.equipment_id);
  } catch (error) {
    await supabase.from("machines").delete().eq("id", machine.id);
    throw error;
  }

  // Slot the new machine into the queue by its requested position and recompact
  // so positions stay gapless and unique (same RPC takes the reestimada).
  if (machine.status === "in_production") {
    await snapshotReestimatedDates([machine.id]);
  }

  return getMachine(machine.id);
}

export async function updateMachine(id: string, patch: MachineUpdate) {
  const supabase = createSupabaseAdminClient();
  const { order_position, ...rest } = patch;

  if (order_position !== undefined) {
    const { data: current, error: currentError } = await supabase
      .from("machines")
      .select("status")
      .eq("id", id)
      .single();

    if (currentError) {
      throw new Error(`No se pudo cargar la máquina: ${currentError.message}`);
    }

    const nextStatus = (patch.status ?? current.status) as Database["public"]["Tables"]["machines"]["Row"]["status"];

    if (nextStatus === "in_production") {
      if (Object.keys(rest).length > 0) {
        const { error: updateError } = await supabase.from("machines").update(rest).eq("id", id);
        if (updateError) {
          throw new Error(`No se pudo actualizar la máquina: ${updateError.message}`);
        }
      }

      await reorderProductionQueue(id, order_position, { entering: current.status !== "in_production" });
      return getMachine(id);
    }
  }

  const { error } = await supabase.from("machines").update(patch).eq("id", id);

  if (error) {
    throw new Error(`No se pudo actualizar la máquina: ${error.message}`);
  }

  return getMachine(id);
}

export async function deleteMachine(id: string) {
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.from("machines").delete().eq("id", id);

  if (error) {
    throw new Error(`No se pudo eliminar la máquina: ${error.message}`);
  }

  await normalizeProductionQueue();
}

export async function reorderMachines(orderedIds: string[]) {
  const supabase = createSupabaseAdminClient();
  const { queue, settings, holidays } = await loadQueueContext(supabase);
  const plan = planQueueReorder({ queue, orderedIds, settings, holidays });
  await saveProductionQueue(supabase, plan.orderedIds, plan.reestimatedDates);
}

/** Ids whose position in the queue changed between the two orderings (ids new to the list count as changed). */
export function changedQueueIds(oldIds: string[], newIds: string[]): string[] {
  const oldIndexById = new Map(oldIds.map((id, index) => [id, index]));
  return newIds.filter((id, index) => oldIndexById.get(id) !== index);
}

export function buildMovedQueueOrder(
  queue: MachineQueueRow[],
  machineId: string,
  targetPosition: number,
) {
  return moveIdInOrder(sortProductionQueue(queue).map((machine) => machine.id), machineId, targetPosition);
}

/** Saca `machineId` de la lista y lo pone en `targetPosition` (1 = primera), recortada a los extremos. */
function moveIdInOrder(ids: string[], machineId: string, targetPosition: number) {
  const ordered = ids.filter((id) => id !== machineId);
  const targetIndex = Math.min(Math.max(Math.trunc(targetPosition) - 1, 0), ordered.length);
  ordered.splice(targetIndex, 0, machineId);
  return ordered;
}

/**
 * Plan de un reordenamiento de la cola, calculado en memoria antes de
 * escribir nada: el orden completo (los ids desconocidos se descartan y los
 * que falten se agregan al final en su orden actual) y la nueva fecha
 * reestimada = Actualizada en el nuevo orden, solo para las máquinas cuyo
 * índice cambió. Las demás conservan su reestimada (su fecha no se movió).
 *
 * `previousIds` (opcional) es el orden de antes cuando la cola ya cambió en la
 * base (p. ej. entraron máquinas); por defecto, el de `queue` por orderPosition.
 * Los ids que no estaban antes cuentan como cambiados.
 */
export function planQueueReorder(input: {
  queue: MachineView[];
  orderedIds: string[];
  settings: ProductionSettings;
  holidays: Holiday[];
  startDate?: Date;
  previousIds?: string[];
}): { orderedIds: string[]; reestimatedDates: Record<string, string> } {
  const queue = input.queue.filter((machine) => machine.status === "in_production");
  // Array.prototype.sort es estable: con posiciones repetidas se respeta el orden de llegada.
  const currentIds = [...queue].sort((a, b) => a.orderPosition - b.orderPosition).map((machine) => machine.id);
  const queueIds = new Set(currentIds);
  const seen = new Set<string>();
  const orderedIds: string[] = [];

  for (const id of [...input.orderedIds, ...currentIds]) {
    if (queueIds.has(id) && !seen.has(id)) {
      orderedIds.push(id);
      seen.add(id);
    }
  }

  const changed = changedQueueIds(input.previousIds ?? currentIds, orderedIds);
  if (changed.length === 0) {
    return { orderedIds, reestimatedDates: {} };
  }

  const indexById = new Map(orderedIds.map((id, index) => [id, index]));
  const reordered = queue.map((machine) => ({ ...machine, orderPosition: (indexById.get(machine.id) ?? 0) + 1 }));
  const estimatedDateById = new Map(
    calculateMachines(reordered, input.settings, input.holidays, input.startDate).map((machine) => [
      machine.id,
      machine.estimatedDate,
    ]),
  );

  const reestimatedDates: Record<string, string> = {};
  for (const id of changed) {
    const estimatedDate = estimatedDateById.get(id);
    if (estimatedDate) reestimatedDates[id] = estimatedDate;
  }

  return { orderedIds, reestimatedDates };
}

export async function markMachineFinished(id: string) {
  const machine = await updateMachine(id, {
    status: "finished",
    completed_at: new Date().toISOString(),
  });
  await normalizeProductionQueue();
  return machine;
}

export async function markMachineShipped(id: string) {
  const machine = await updateMachine(id, {
    status: "shipped",
    shipped_at: new Date().toISOString(),
  });
  await normalizeProductionQueue();
  return machine;
}

export async function unmarkMachineShipped(id: string) {
  const supabase = createSupabaseAdminClient();
  await ensureMachineStages(supabase, [id]);
  const machine = await updateMachine(id, {
    status: "in_production",
    shipped_at: null,
  });
  await normalizeProductionQueue();
  return machine;
}

export async function sendMachineToPrevios(id: string) {
  const machine = await updateMachine(id, {
    status: "pending",
    shipped_at: null,
  });
  await normalizeProductionQueue();
  return machine;
}

export async function sendMachineToProduction(id: string) {
  const supabase = createSupabaseAdminClient();
  await ensureMachineStages(supabase, [id]);

  // Stamp the production start the first time the machine enters production,
  // preserving the original date if it ever bounces back and forth.
  const { error: startError } = await supabase
    .from("machines")
    .update({ production_started_at: new Date().toISOString() })
    .eq("id", id)
    .is("production_started_at", null);
  if (startError) {
    throw new Error(`No se pudo registrar el inicio en producción: ${startError.message}`);
  }

  const machine = await updateMachine(id, {
    status: "in_production",
    shipped_at: null,
  });
  await snapshotReestimatedDates([id]);
  return machine;
}

// Park a machine (typically a XTENSOR "propia") as on_hold: it leaves the
// production queue and board but keeps all its stage progress and previos, so
// it can be reactivated later. Only in-production machines can be parked.
export async function sendMachineToHold(id: string) {
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase
    .from("machines")
    .update({ status: "on_hold" })
    .eq("id", id)
    .eq("status", "in_production");
  if (error) throw new Error(`No se pudo enviar a Propias en Espera: ${error.message}`);
  await normalizeProductionQueue(supabase);
}

export async function bulkSendToHold(ids: string[]) {
  if (ids.length === 0) return;
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase
    .from("machines")
    .update({ status: "on_hold" })
    .in("id", ids)
    .eq("status", "in_production");
  if (error) throw new Error(`No se pudo enviar a Propias en Espera: ${error.message}`);
  await normalizeProductionQueue(supabase);
}

// Reactivate a parked machine: it re-enters the current production queue at the
// end (a large target position is clamped to the tail by reorderProductionQueue,
// which also takes its reestimada in the same RPC) with its stage progress and
// previos intact. The original production start is preserved since it was
// stamped the first time the machine entered production.
export async function sendHoldMachineToProduction(id: string) {
  const supabase = createSupabaseAdminClient();
  await ensureMachineStages(supabase, [id]);
  const { error: startError } = await supabase
    .from("machines")
    .update({ production_started_at: new Date().toISOString() })
    .eq("id", id)
    .is("production_started_at", null);
  if (startError) {
    throw new Error(`No se pudo registrar el inicio en producción: ${startError.message}`);
  }

  const machine = await updateMachine(id, {
    status: "in_production",
    shipped_at: null,
    order_position: 999_999,
  });
  return machine;
}

export async function sendMachineToWarranty(id: string, message: string) {
  const supabase = createSupabaseAdminClient();
  const warrantyMessage = message.trim();

  if (!warrantyMessage) {
    throw new Error("El mensaje de la garantía es obligatorio.");
  }

  const { data: machine, error: machineError } = await supabase
    .from("machines")
    .select("id, serial_number, status")
    .eq("id", id)
    .single();

  if (machineError) {
    throw new Error(`No se pudo cargar la máquina: ${machineError.message}`);
  }
  if (machine.status !== "shipped") {
    throw new Error("La garantía solo se puede registrar desde despachados.");
  }

  const warrantyEvent: MachineWarrantyEventInsert = {
    machine_id: machine.id,
    serial_number: machine.serial_number,
    message: warrantyMessage,
  };

  const { data: event, error: eventError } = await supabase
    .from("machine_warranty_events")
    .insert(warrantyEvent)
    .select("id")
    .single();

  if (eventError) {
    throw new Error(`No se pudo registrar la garantía: ${eventError.message}`);
  }

  const { error: updateError } = await supabase
    .from("machines")
    .update({ status: "in_production", shipped_at: null, completed_at: null })
    .eq("id", machine.id);

  if (updateError) {
    if (event?.id) {
      await supabase.from("machine_warranty_events").delete().eq("id", event.id);
    }
    throw new Error(`No se pudo devolver la máquina a producción: ${updateError.message}`);
  }

  // Reset all stages so the machine re-enters production from scratch.
  // Done via direct update (no stage_logs) so warranty resets are NOT counted as reprocesos.
  const { error: resetError } = await supabase
    .from("machine_stages")
    .update({ completion: 0, last_worker_id: null, last_updated_at: null })
    .eq("machine_id", machine.id);

  if (resetError) {
    throw new Error(`No se pudieron reiniciar las etapas: ${resetError.message}`);
  }

  await snapshotReestimatedDates([machine.id]);
  return getMachine(machine.id);
}

export async function bulkSendToProduction(ids: string[]) {
  const supabase = createSupabaseAdminClient();
  await ensureMachineStages(supabase, ids);

  // Only machines actually coming from "pending" enter the queue here; track
  // them so ids that were already in_production aren't treated as new (a
  // no-op is possible if the caller passes stale ids).
  const { data: pendingRows, error: pendingError } = await supabase
    .from("machines")
    .select("id")
    .in("id", ids)
    .eq("status", "pending");
  if (pendingError) throw new Error(`No se pudieron verificar las máquinas: ${pendingError.message}`);
  const enteringIds = (pendingRows ?? []).map((row) => row.id);

  // Stamp production start only for machines that don't have one yet.
  const { error: startError } = await supabase
    .from("machines")
    .update({ production_started_at: new Date().toISOString() })
    .in("id", ids)
    .eq("status", "pending")
    .is("production_started_at", null);
  if (startError) throw new Error(`No se pudo registrar el inicio en producción: ${startError.message}`);

  const { error } = await supabase
    .from("machines")
    .update({ status: "in_production", shipped_at: null })
    .in("id", ids)
    .eq("status", "pending");
  if (error) throw new Error(`No se pudo enviar a producción: ${error.message}`);

  // Recompacta y toma la reestimada de las que entran y de las que ya estaban
  // en cola pero quedaron en otro índice (p. ej. una que entra en el medio).
  await snapshotReestimatedDates(enteringIds);
}

export async function bulkMarkFinished(ids: string[]) {
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase
    .from("machines")
    .update({ status: "finished", completed_at: new Date().toISOString() })
    .in("id", ids)
    .eq("status", "in_production");
  if (error) throw new Error(`No se pudo mover a terminados: ${error.message}`);

  await normalizeProductionQueue(supabase);
}

export async function bulkMarkShipped(ids: string[]) {
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase
    .from("machines")
    .update({ status: "shipped", shipped_at: new Date().toISOString() })
    .in("id", ids)
    .eq("status", "finished");
  if (error) throw new Error(`No se pudo despachar: ${error.message}`);

  await normalizeProductionQueue(supabase);
}

export async function sendFinishedToProduction(id: string) {
  const supabase = createSupabaseAdminClient();
  await ensureMachineStages(supabase, [id]);
  const machine = await updateMachine(id, { status: "in_production", completed_at: null, is_reproceso: true });
  await snapshotReestimatedDates([id]);
  return machine;
}

async function ensureMachineStages(supabase: ReturnType<typeof createSupabaseAdminClient>, machineIds: string[]) {
  const uniqueMachineIds = [...new Set(machineIds.filter(Boolean))];
  if (uniqueMachineIds.length === 0) {
    return;
  }

  const stageRows = uniqueMachineIds.flatMap((machineId) =>
    DEFAULT_STAGES.map((stage) => ({
      machine_id: machineId,
      stage_id: stage.id,
      completion: 0,
    })),
  );
  const { error } = await supabase
    .from("machine_stages")
    .upsert(stageRows, { onConflict: "machine_id,stage_id", ignoreDuplicates: true });

  if (error) {
    throw new Error(`No se pudieron preparar las etapas de producción: ${error.message}`);
  }
}

function mapMachineRow(row: MachineRow): MachineView {
  const equipmentName = row.equipment_catalog?.name ?? row.custom_equipment_name ?? "Producto personalizado";
  const stages = row.machine_stages
    .map<StageView>((stage) => ({
      id: stage.stage_id,
      name: stage.stages?.name ?? DEFAULT_STAGES.find((item) => item.id === stage.stage_id)?.name ?? "Etapa",
      completionPercentage:
        stage.stages?.completion_percentage ??
        DEFAULT_STAGES.find((item) => item.id === stage.stage_id)?.completionPercentage ??
        0,
      completion: stage.completion,
      lastWorkerName: stage.workers?.full_name ?? null,
      lastUpdatedAt: stage.last_updated_at,
    }))
    .sort((a, b) => a.id - b.id);

  // Production "start" is when the first worker logs the first real task, not
  // when the machine was moved into the production queue (production_started_at).
  // Derived live from the earliest non-undone stage log; null until a task exists.
  const nonUndoneLogs = row.stage_logs.filter((log) => !log.is_undone);
  const firstTaskAt =
    nonUndoneLogs
      .map((log) => log.created_at)
      .sort((a, b) => new Date(a).getTime() - new Date(b).getTime())[0] ?? null;

  // A stage is an "open reprocess" when its latest non-undone log reverted it
  // from 100% back down (is_reprocess) and it hasn't been finished again yet.
  const latestLogByStage = new Map<number, { is_reprocess: boolean; created_at: string }>();
  for (const log of nonUndoneLogs) {
    const existing = latestLogByStage.get(log.stage_id);
    if (!existing || new Date(log.created_at).getTime() > new Date(existing.created_at).getTime()) {
      latestLogByStage.set(log.stage_id, { is_reprocess: log.is_reprocess, created_at: log.created_at });
    }
  }
  const openReprocessStages = stages
    .filter((stage) => stage.completion < 100 && latestLogByStage.get(stage.id)?.is_reprocess === true)
    .map((stage) => stage.name);

  return {
    id: row.id,
    serialNumber: row.serial_number,
    clientId: row.client_id,
    clientName: row.clients?.name ?? "Cliente sin nombre",
    equipmentId: row.equipment_id,
    equipmentCode: row.equipment_catalog?.code ?? null,
    equipmentName,
    equipmentLaborFactor: toLaborFactorOrNull(row.equipment_catalog?.labor_factor),
    colorId: row.color_id ?? null,
    colorName: row.colors?.name ?? null,
    city: row.city,
    line: normalizeMachineLine(row.line_override ?? row.equipment_catalog?.line),
    salePriceCop: Number(row.sale_price_cop),
    assignedTo: row.assigned_to,
    promisedDate: row.promised_date,
    reestimatedDate: row.reestimated_date,
    orderPosition: row.order_position,
    status: row.status,
    shippedAt: row.shipped_at,
    productionStartedAt: row.production_started_at,
    firstTaskAt,
    completedAt: row.completed_at,
    isReproceso: row.is_reproceso,
    isWarranty: row.machine_warranty_events.length > 0,
    stages,
    openReprocessStages,
  };
}

async function reorderProductionQueue(
  machineId: string,
  targetPosition: number,
  options?: { entering?: boolean },
) {
  const supabase = createSupabaseAdminClient();
  const { queue, settings, holidays } = await loadQueueContext(supabase);
  const currentIds = queue.map((machine) => machine.id);
  const plan = planQueueReorder({
    queue,
    orderedIds: moveIdInOrder(currentIds, machineId, targetPosition),
    settings,
    holidays,
    // Si la máquina recién vuelve a la cola (p. ej. desde Propias en Espera), el
    // orden de antes es el de la cola sin ella: no desplaza a las demás.
    previousIds: options?.entering ? currentIds.filter((id) => id !== machineId) : undefined,
  });
  await saveProductionQueue(supabase, plan.orderedIds, plan.reestimatedDates);
}

/**
 * Recompacta la cola (1..N, mismo orden relativo) y toma la reestimada =
 * Actualizada viva de las máquinas que acaban de entrar (`machineIds`) y de
 * las que esa entrada desplazó de índice, todo en la misma RPC atómica. Así
 * el aviso de atraso (isBehindReestimate) compara contra esta línea base y no
 * contra la prometida, que no se mueve.
 */
export async function snapshotReestimatedDates(machineIds: string[]) {
  const supabase = createSupabaseAdminClient();
  const { queue, settings, holidays } = await loadQueueContext(supabase);
  const currentIds = queue.map((machine) => machine.id);
  const entering = new Set(machineIds.filter(Boolean));
  const plan = planQueueReorder({
    queue,
    orderedIds: currentIds,
    settings,
    holidays,
    previousIds: currentIds.filter((id) => !entering.has(id)),
  });
  await saveProductionQueue(supabase, plan.orderedIds, plan.reestimatedDates);
}

/**
 * Toma la reestimada de TODA la cola. Replanificación deliberada: se usa
 * cuando cambia el % de mano de obra de un equipo con máquinas en cola, o el
 * % / costo hora generales, para que el cambio de horas no aparezca como
 * atraso de producción.
 */
export async function snapshotWholeQueueReestimatedDates(): Promise<void> {
  const supabase = createSupabaseAdminClient();
  const { queue, settings, holidays } = await loadQueueContext(supabase);
  const plan = planQueueReorder({
    queue,
    orderedIds: queue.map((machine) => machine.id),
    settings,
    holidays,
    previousIds: [],
  });
  await saveProductionQueue(supabase, plan.orderedIds, plan.reestimatedDates);
}

/** ¿Alguna máquina en cola es de este equipo? (para no replanificar la cola sin necesidad). */
export async function equipmentHasMachinesInQueue(equipmentId: string): Promise<boolean> {
  const supabase = createSupabaseAdminClient();
  const { count, error } = await supabase
    .from("machines")
    .select("id", { count: "exact", head: true })
    .eq("status", "in_production")
    .eq("equipment_id", equipmentId);

  if (error) {
    throw new Error(`No se pudo revisar la cola de producción: ${error.message}`);
  }

  return (count ?? 0) > 0;
}

/** Cola en producción con todo lo que necesita el cálculo de fechas, en su orden actual. */
async function loadQueueContext(supabase: ReturnType<typeof createSupabaseAdminClient>) {
  const [settingsRow, holidays, queueResult] = await Promise.all([
    getSettings(),
    listHolidays(),
    supabase
      .from("machines")
      .select(MACHINE_SELECT)
      .eq("status", "in_production")
      .order("order_position", { ascending: true })
      .order("created_at", { ascending: true })
      .order("id", { ascending: true }),
  ]);

  if (queueResult.error) {
    throw new Error(`No se pudo cargar la cola de producción: ${queueResult.error.message}`);
  }

  const rows = (queueResult.data ?? []) as unknown as MachineRow[];
  // orderPosition = índice actual (1..N): desempata posiciones repetidas por created_at/id.
  const queue = rows.map((row, index) => ({ ...mapMachineRow(row), orderPosition: index + 1 }));
  return { queue, settings: mapSettings(settingsRow), holidays };
}

async function listProductionQueue(supabase = createSupabaseAdminClient()) {
  const { data, error } = await supabase
    .from("machines")
    .select("id, order_position, status, created_at")
    .eq("status", "in_production")
    .order("order_position", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`No se pudo cargar la cola de producción: ${error.message}`);
  }

  return (data as unknown as MachineQueueRow[]).map((machine) => ({
    ...machine,
    order_position: machine.order_position ?? 0,
  }));
}

function sortProductionQueue(queue: MachineQueueRow[]) {
  return [...queue].sort((a, b) => {
    if (a.order_position !== b.order_position) {
      return a.order_position - b.order_position;
    }
    if (a.created_at !== b.created_at) {
      return a.created_at.localeCompare(b.created_at);
    }
    return a.id.localeCompare(b.id);
  });
}

/**
 * Guarda el orden de la cola y, en la misma sentencia, la reestimada de las
 * máquinas de `reestimatedDates` (las demás conservan la suya). Usa la RPC
 * atómica reorder_production_queue (0031); la vieja
 * reorder_in_production_machines ya no se llama desde aquí.
 */
async function saveProductionQueue(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  orderedIds: string[],
  reestimatedDates: Record<string, string> = {},
) {
  const ordered = orderedIds.filter(Boolean);

  if (ordered.length === 0) {
    return;
  }

  const { error } = await supabase.rpc("reorder_production_queue", {
    ordered_machine_ids: ordered,
    reestimated_dates: reestimatedDates,
  });

  if (error) {
    throw new Error(`No se pudo reordenar la cola: ${error.message}`);
  }
}

// Recompacts the in-production queue to a gapless 1..N sequence, preserving the
// current relative order. Run after any machine leaves production so the "#"
// column never shows gaps (e.g. starting at 10 after shipping) or duplicate
// positions. The machines behind move up (earlier dates): their reestimada is
// kept, so a real gain never hides a later slip.
async function normalizeProductionQueue(supabase = createSupabaseAdminClient()) {
  const queue = await listProductionQueue(supabase);
  const orderedIds = sortProductionQueue(queue).map((machine) => machine.id);
  await saveProductionQueue(supabase, orderedIds);
}

/** labor_factor llega como numeric (string o number) desde PostgREST; null/undefined si no hay % propio. */
function toLaborFactorOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
