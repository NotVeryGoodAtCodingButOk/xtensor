import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { normalizeMachineLine } from "@/lib/machine-lines";
import type { Database } from "@/types/database";
import type { CalculatedMachineView, MachineView, StageView } from "@/types/domain";
import {
  calculateQueue,
  DEFAULT_STAGES,
  type ProductionSettings,
} from "@/services/calculations";
import { createMachinePreviosFromEquipment } from "@/services/previos";
import { addClientBuffer, estimateDeliveryDate, type Holiday } from "@/services/schedule";

type MachineInsert = Database["public"]["Tables"]["machines"]["Insert"];
type MachineUpdate = Database["public"]["Tables"]["machines"]["Update"];
type MachineWarrantyEventInsert = Database["public"]["Tables"]["machine_warranty_events"]["Insert"];
type MachineQueueRow = Pick<Database["public"]["Tables"]["machines"]["Row"], "id" | "order_position" | "status" | "created_at">;
type ListMachineStatus = Extract<
  Database["public"]["Tables"]["machines"]["Row"]["status"],
  "in_production" | "finished" | "shipped"
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
  stage_logs: Array<Pick<Database["public"]["Tables"]["stage_logs"]["Row"], "created_at" | "is_undone">>;
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
  stage_logs(created_at, is_undone),
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

    return {
      ...machine,
      ...calculation,
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
  // so positions stay gapless and unique.
  if (machine.status === "in_production") {
    await normalizeProductionQueue(supabase);
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

      await reorderProductionQueue(id, order_position);
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
  const queue = await listProductionQueue(supabase);
  const queueIds = new Set(queue.map((machine) => machine.id));
  const nextIds: string[] = [];
  const seen = new Set<string>();

  for (const id of orderedIds) {
    if (queueIds.has(id) && !seen.has(id)) {
      nextIds.push(id);
      seen.add(id);
    }
  }

  for (const machine of queue) {
    if (!seen.has(machine.id)) {
      nextIds.push(machine.id);
      seen.add(machine.id);
    }
  }

  await persistProductionQueueOrder(supabase, nextIds);
}

export function buildMovedQueueOrder(
  queue: MachineQueueRow[],
  machineId: string,
  targetPosition: number,
) {
  const ordered = sortProductionQueue(queue).map((machine) => machine.id).filter((id) => id !== machineId);
  const targetIndex = Math.min(Math.max(Math.trunc(targetPosition) - 1, 0), ordered.length);
  ordered.splice(targetIndex, 0, machineId);
  return ordered;
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
  await normalizeProductionQueue();
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

  await normalizeProductionQueue(supabase);
  return getMachine(machine.id);
}

export async function bulkSendToProduction(ids: string[]) {
  const supabase = createSupabaseAdminClient();
  await ensureMachineStages(supabase, ids);

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

  await normalizeProductionQueue(supabase);
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
  await normalizeProductionQueue();
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
  const firstTaskAt =
    row.stage_logs
      .filter((log) => !log.is_undone)
      .map((log) => log.created_at)
      .sort((a, b) => new Date(a).getTime() - new Date(b).getTime())[0] ?? null;

  return {
    id: row.id,
    serialNumber: row.serial_number,
    clientId: row.client_id,
    clientName: row.clients?.name ?? "Cliente sin nombre",
    equipmentId: row.equipment_id,
    equipmentCode: row.equipment_catalog?.code ?? null,
    equipmentName,
    colorId: row.color_id ?? null,
    colorName: row.colors?.name ?? null,
    city: row.city,
    line: normalizeMachineLine(row.line_override ?? row.equipment_catalog?.line),
    salePriceCop: Number(row.sale_price_cop),
    assignedTo: row.assigned_to,
    promisedDate: row.promised_date,
    orderPosition: row.order_position,
    status: row.status,
    shippedAt: row.shipped_at,
    productionStartedAt: row.production_started_at,
    firstTaskAt,
    completedAt: row.completed_at,
    isReproceso: row.is_reproceso,
    isWarranty: row.machine_warranty_events.length > 0,
    stages,
  };
}

async function reorderProductionQueue(machineId: string, targetPosition: number) {
  const supabase = createSupabaseAdminClient();
  const queue = await listProductionQueue(supabase);
  const orderedIds = buildMovedQueueOrder(queue, machineId, targetPosition);
  await persistProductionQueueOrder(supabase, orderedIds);
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

async function persistProductionQueueOrder(supabase = createSupabaseAdminClient(), orderedIds: string[]) {
  const ordered = orderedIds.filter(Boolean);

  if (ordered.length === 0) {
    return;
  }

  const { error } = await supabase.rpc("reorder_in_production_machines", {
    ordered_machine_ids: ordered,
  });

  if (error) {
    throw new Error(`No se pudo reordenar la cola: ${error.message}`);
  }
}

// Recompacts the in-production queue to a gapless 1..N sequence, preserving the
// current relative order. Run after any machine enters or leaves production so
// the "#" column never shows gaps (e.g. starting at 10 after shipping) or
// duplicate positions.
async function normalizeProductionQueue(supabase = createSupabaseAdminClient()) {
  const queue = await listProductionQueue(supabase);
  const orderedIds = sortProductionQueue(queue).map((machine) => machine.id);
  await persistProductionQueueOrder(supabase, orderedIds);
}
