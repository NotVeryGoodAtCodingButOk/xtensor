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
  if (input.status !== "in_production") {
    return getMachine((await insertMachine(input)).id);
  }

  // Entra directo a la cola: la nueva toma línea base y las que desplaza se corren.
  let createdId = "";
  await replanQueue({
    mutate: async () => {
      createdId = (await insertMachine(input)).id;
    },
  });
  return getMachine(createdId);
}

async function insertMachine(input: MachineInsert) {
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

  return machine;
}

/**
 * Actualiza una máquina. Si queda en la cola y el cambio mueve las fechas
 * (posición, entrada a la cola, venta o equipo), replanifica: orden y
 * reestimadas desplazadas en una sola RPC (ver replanQueue).
 */
export async function updateMachine(id: string, patch: MachineUpdate) {
  const supabase = createSupabaseAdminClient();
  const { order_position, ...rest } = patch;
  const mayMoveDates =
    order_position !== undefined ||
    patch.status !== undefined ||
    patch.sale_price_cop !== undefined ||
    patch.equipment_id !== undefined;

  if (mayMoveDates) {
    const { data: current, error: currentError } = await supabase
      .from("machines")
      .select("status, sale_price_cop, equipment_id")
      .eq("id", id)
      .single();

    if (currentError) {
      throw new Error(`No se pudo cargar la máquina: ${currentError.message}`);
    }

    const nextStatus = (patch.status ?? current.status) as Database["public"]["Tables"]["machines"]["Row"]["status"];
    const entering = nextStatus === "in_production" && current.status !== "in_production";
    const changesEstimate =
      (patch.sale_price_cop !== undefined && Number(patch.sale_price_cop) !== Number(current.sale_price_cop)) ||
      (patch.equipment_id !== undefined && patch.equipment_id !== current.equipment_id);

    if (nextStatus === "in_production" && (order_position !== undefined || entering || changesEstimate)) {
      await replanQueue({
        mutate:
          Object.keys(rest).length > 0
            ? async () => {
                const { error: updateError } = await supabase.from("machines").update(rest).eq("id", id);
                if (updateError) {
                  throw new Error(`No se pudo actualizar la máquina: ${updateError.message}`);
                }
              }
            : undefined,
        reorder: order_position !== undefined ? (ids) => moveIdInOrder(ids, id, order_position) : undefined,
      });
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
  await replanQueue({ reorder: () => orderedIds });
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
 * que falten se agregan al final en su orden actual) y las reestimadas
 * desplazadas con shiftReestimatedDates (cada una se mueve lo mismo que su
 * Actualizada, así un atraso real se conserva).
 *
 * `previousIds` (opcional) es el orden de antes cuando la cola ya cambió en la
 * base (p. ej. entraron máquinas); por defecto, el de `queue` por orderPosition.
 * Los ids que no estaban antes reciben línea base nueva.
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
  const orderedIds = completeQueueOrder(currentIds, input.orderedIds);
  const previousIds = input.previousIds ? completeQueueOrder([], input.previousIds, new Set(currentIds)) : currentIds;

  return {
    orderedIds,
    reestimatedDates: shiftReestimatedDates({
      before: estimateQueueDates(queue, previousIds, input.settings, input.holidays, input.startDate),
      after: estimateQueueDates(queue, orderedIds, input.settings, input.holidays, input.startDate),
      current: currentReestimatedDates(queue),
    }),
  };
}

/**
 * Regla única de la Reestimada al replanificar: se mueve los mismos días
 * (calendario) que se movió la Actualizada, así un atraso real no se borra.
 * - Entra a la cola (está en `after` y no en `before`) o no tiene reestimada → línea base = Actualizada.
 * - Si no, delta = after − before en días; si es 0 no se toca.
 * Devuelve solo los ids que cambian.
 */
export function shiftReestimatedDates(input: {
  before: Record<string, string>;
  after: Record<string, string>;
  current: Record<string, string | null>;
}): Record<string, string> {
  const result: Record<string, string> = {};

  for (const [id, afterDate] of Object.entries(input.after)) {
    const current = input.current[id] ?? null;
    const beforeDate = input.before[id];

    if (beforeDate === undefined || current === null) {
      if (current !== afterDate) result[id] = afterDate;
      continue;
    }

    const delta = calendarDaysBetween(beforeDate, afterDate);
    if (delta !== 0) result[id] = addCalendarDays(current, delta);
  }

  return result;
}

/** Orden completo: ids de `wanted` que están en la cola, sin repetir, y luego los que falten en su orden actual. */
function completeQueueOrder(currentIds: string[], wanted: string[], allowed = new Set(currentIds)): string[] {
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const id of [...wanted, ...currentIds]) {
    if (allowed.has(id) && !seen.has(id)) {
      ordered.push(id);
      seen.add(id);
    }
  }
  return ordered;
}

/** Actualizada por id si la cola fuera `orderedIds` (solo esas máquinas, en ese orden). */
function estimateQueueDates(
  queue: MachineView[],
  orderedIds: string[],
  settings: ProductionSettings,
  holidays: Holiday[],
  startDate?: Date,
): Record<string, string> {
  const indexById = new Map(orderedIds.map((id, index) => [id, index]));
  const subset = queue
    .filter((machine) => machine.status === "in_production" && indexById.has(machine.id))
    .map((machine) => ({ ...machine, orderPosition: (indexById.get(machine.id) ?? 0) + 1 }));

  return Object.fromEntries(
    calculateMachines(subset, settings, holidays, startDate).map((machine) => [machine.id, machine.estimatedDate]),
  );
}

function currentReestimatedDates(queue: MachineView[]): Record<string, string | null> {
  return Object.fromEntries(queue.map((machine) => [machine.id, machine.reestimatedDate]));
}

function calendarDaysBetween(fromYmd: string, toYmd: string): number {
  return Math.round((ymdToUtcMs(toYmd) - ymdToUtcMs(fromYmd)) / 86_400_000);
}

function addCalendarDays(ymd: string, days: number): string {
  return new Date(ymdToUtcMs(ymd) + days * 86_400_000).toISOString().slice(0, 10);
}

function ymdToUtcMs(ymd: string): number {
  const [year, month, day] = ymd.slice(0, 10).split("-").map(Number);
  return Date.UTC(year, month - 1, day);
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
  // updateMachine replanifica: entra a la cola con línea base nueva y desplaza a las de detrás.
  return updateMachine(id, {
    status: "in_production",
    shipped_at: null,
  });
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

  // updateMachine replanifica: entra a la cola con línea base nueva y desplaza a las de detrás.
  return updateMachine(id, {
    status: "in_production",
    shipped_at: null,
  });
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
// end (a large target position is clamped to the tail by moveIdInOrder; the
// replan gives it a fresh reestimada in the same RPC) with its stage progress and
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

  // Vuelve a la cola desde cero: estado y etapas en la misma replanificación,
  // para que su línea base y el desplazamiento de las demás salgan de las
  // horas reales que le faltan.
  await replanQueue({
    mutate: async () => {
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
    },
  });
  return getMachine(machine.id);
}

export async function bulkSendToProduction(ids: string[]) {
  const supabase = createSupabaseAdminClient();
  await ensureMachineStages(supabase, ids);

  await replanQueue({
    mutate: async () => {
      // Stamp production start only for machines that don't have one yet.
      const { error: startError } = await supabase
        .from("machines")
        .update({ production_started_at: new Date().toISOString() })
        .in("id", ids)
        .eq("status", "pending")
        .is("production_started_at", null);
      if (startError) throw new Error(`No se pudo registrar el inicio en producción: ${startError.message}`);

      // Solo entran las que venían de previos («pending»); las que ya estaban en
      // cola no cambian, así que solo se les desplaza la reestimada si se movieron.
      const { error } = await supabase
        .from("machines")
        .update({ status: "in_production", shipped_at: null })
        .in("id", ids)
        .eq("status", "pending");
      if (error) throw new Error(`No se pudo enviar a producción: ${error.message}`);
    },
  });
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
  // updateMachine replanifica: entra a la cola con línea base nueva y desplaza a las de detrás.
  return updateMachine(id, { status: "in_production", completed_at: null, is_reproceso: true });
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

/**
 * Replanificación de la cola (regla de §9.1 del contrato):
 * Actualizada antes → `mutate` (cambio en la base) → Actualizada después →
 * shiftReestimatedDates → orden y reestimadas en UNA llamada atómica a
 * reorder_production_queue. `reorder` recibe el orden actual (después de la
 * mutación) y devuelve el nuevo; por defecto se conserva y solo se recompacta.
 */
async function replanQueue(
  options: {
    mutate?: () => Promise<void>;
    reorder?: (currentIds: string[]) => string[];
  } = {},
) {
  const supabase = createSupabaseAdminClient();
  const startDate = new Date();
  const before = await loadQueueContext(supabase);

  if (!options.mutate) {
    const currentIds = before.queue.map((machine) => machine.id);
    const plan = planQueueReorder({
      queue: before.queue,
      orderedIds: options.reorder ? options.reorder(currentIds) : currentIds,
      settings: before.settings,
      holidays: before.holidays,
      startDate,
    });
    await saveProductionQueue(supabase, plan.orderedIds, plan.reestimatedDates);
    return;
  }

  const beforeDates = estimateQueueDates(
    before.queue,
    before.queue.map((machine) => machine.id),
    before.settings,
    before.holidays,
    startDate,
  );

  await options.mutate();

  const after = await loadQueueContext(supabase);
  const currentIds = after.queue.map((machine) => machine.id);
  const orderedIds = completeQueueOrder(currentIds, options.reorder ? options.reorder(currentIds) : currentIds);
  const reestimatedDates = shiftReestimatedDates({
    before: beforeDates,
    after: estimateQueueDates(after.queue, orderedIds, after.settings, after.holidays, startDate),
    current: currentReestimatedDates(after.queue),
  });

  await saveProductionQueue(supabase, orderedIds, reestimatedDates);
}

/**
 * Para cambios que mueven las horas de la cola fuera de este módulo (el % de
 * un equipo, el % general o el costo hora): aplica `mutate` y desplaza las
 * reestimadas lo mismo que se movió cada Actualizada.
 */
export async function replanProductionQueue(mutate: () => Promise<unknown>): Promise<void> {
  await replanQueue({
    mutate: async () => {
      await mutate();
    },
  });
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
export function toLaborFactorOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
