import { createSupabaseAdminClient } from "@/lib/supabase/admin";
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
  )
`;

export async function listMachines(
  status?: "in_production" | "shipped",
  options?: { shippedRetentionDays?: number; now?: Date },
) {
  const supabase = createSupabaseAdminClient();
  let query = supabase.from("machines").select(MACHINE_SELECT);

  if (status === "shipped") {
    query = query.order("shipped_at", { ascending: false }).order("order_position", { ascending: true });
  } else {
    query = query.order("order_position", { ascending: true });
  }

  if (status) {
    query = query.eq("status", status);
  }

  if (status === "shipped") {
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
  status?: "in_production" | "shipped";
  shippedRetentionDays?: number;
}) {
  const machines = await listMachines(input.status, {
    shippedRetentionDays: input.shippedRetentionDays,
  });
  return calculateMachines(machines, input.settings, input.holidays, input.startDate);
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

  return getMachine(machine.id);
}

export async function updateMachine(id: string, patch: MachineUpdate) {
  const supabase = createSupabaseAdminClient();
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
}

export async function reorderMachines(orderedIds: string[]) {
  const supabase = createSupabaseAdminClient();
  const updates = orderedIds.map((id, index) =>
    supabase.from("machines").update({ order_position: index + 1 }).eq("id", id),
  );
  const results = await Promise.all(updates);
  const error = results.find((result) => result.error)?.error;

  if (error) {
    throw new Error(`No se pudo reordenar la cola: ${error.message}`);
  }
}

export async function markMachineShipped(id: string) {
  return updateMachine(id, {
    status: "shipped",
    shipped_at: new Date().toISOString(),
  });
}

export async function unmarkMachineShipped(id: string) {
  return updateMachine(id, {
    status: "in_production",
    shipped_at: null,
  });
}

export async function sendMachineToWarranty(id: string, message: string) {
  const supabase = createSupabaseAdminClient();
  const warrantyMessage = message.trim();

  if (!warrantyMessage) {
    throw new Error("El mensaje de la garantía es obligatorio.");
  }

  const { data: machine, error: machineError } = await supabase
    .from("machines")
    .select("id, coti_number, status")
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
    coti_number: machine.coti_number,
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
    .update({ status: "in_production", shipped_at: null })
    .eq("id", machine.id);

  if (updateError) {
    if (event?.id) {
      await supabase.from("machine_warranty_events").delete().eq("id", event.id);
    }
    throw new Error(`No se pudo devolver la máquina a producción: ${updateError.message}`);
  }

  return getMachine(machine.id);
}

export async function bulkSendToProduction(ids: string[]) {
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase
    .from("machines")
    .update({ status: "in_production" })
    .in("id", ids)
    .eq("status", "pending");
  if (error) throw new Error(`No se pudo enviar a producción: ${error.message}`);
}

export async function bulkMarkShipped(ids: string[]) {
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase
    .from("machines")
    .update({ status: "shipped", shipped_at: new Date().toISOString() })
    .in("id", ids)
    .eq("status", "in_production");
  if (error) throw new Error(`No se pudo despachar: ${error.message}`);
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

  return {
    id: row.id,
    cotiNumber: row.coti_number,
    clientId: row.client_id,
    clientName: row.clients?.name ?? "Cliente sin nombre",
    equipmentCode: row.equipment_catalog?.code ?? null,
    equipmentName,
    colorName: row.colors?.name ?? null,
    city: row.city,
    line: row.line_override ?? row.equipment_catalog?.line ?? null,
    salePriceCop: Number(row.sale_price_cop),
    assignedTo: row.assigned_to,
    promisedDate: row.promised_date,
    orderPosition: row.order_position,
    status: row.status,
    shippedAt: row.shipped_at,
    stages,
  };
}
