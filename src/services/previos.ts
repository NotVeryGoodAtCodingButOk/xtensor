import fs from "node:fs";
import path from "node:path";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/types/database";
import type {
  EquipmentPrevioView,
  MachinePrevioListRow,
  MachinePrevioSummary,
  MachinePrevioView,
  PrevioCatalogView,
} from "@/types/domain";

type PrevioCatalogRow = Database["public"]["Tables"]["previo_catalog"]["Row"];
type MachinePrevioRow = Database["public"]["Tables"]["machine_previos"]["Row"];
type PrevioEventType = Database["public"]["Tables"]["machine_previo_events"]["Row"]["event_type"];

type MachinePrevioSelectRow = Database["public"]["Tables"]["machines"]["Row"] & {
  clients: Pick<Database["public"]["Tables"]["clients"]["Row"], "name"> | null;
  equipment_catalog: (Pick<Database["public"]["Tables"]["equipment_catalog"]["Row"], "code" | "name"> & {
    equipment_previos: Array<
      Pick<Database["public"]["Tables"]["equipment_previos"]["Row"], "previo_catalog_id"> & {
        previo_catalog: Pick<PrevioCatalogRow, "name"> | null;
      }
    >;
  }) | null;
  machine_previos: Array<
    MachinePrevioRow & {
      previo_catalog: Pick<PrevioCatalogRow, "name"> | null;
    }
  >;
};

type CatalogMachineRow = Database["public"]["Tables"]["equipment_catalog"]["Row"] & {
  equipment_previos: Array<
    Database["public"]["Tables"]["equipment_previos"]["Row"] & {
      previo_catalog: Pick<PrevioCatalogRow, "name"> | null;
    }
  >;
};

type MachineBootstrapRow = Pick<Database["public"]["Tables"]["machines"]["Row"], "id" | "serial_number"> & {
  equipment_catalog: Pick<Database["public"]["Tables"]["equipment_catalog"]["Row"], "code" | "name"> | null;
  machine_previos: Array<Pick<Database["public"]["Tables"]["machine_previos"]["Row"], "previo_catalog_id">>;
};

type FixtureRow = {
  serialNumber: number;
  equipmentCode: string;
  previos?: string[];
};

type Fixture = {
  rows: FixtureRow[];
};

type FixturePrevioMaps = {
  explicitBySerial: Map<number, string[]>;
  byEquipmentCode: Map<string, string[]>;
};

const MACHINE_PREVIOS_SELECT = `
  id,
  serial_number,
  promised_date,
  status,
  custom_equipment_name,
  clients(name),
  equipment_catalog(code, name, equipment_previos(previo_catalog_id, previo_catalog(name))),
  machine_previos(
    *,
    previo_catalog(name)
  )
`;

export async function listPrevioCatalog(): Promise<PrevioCatalogView[]> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.from("previo_catalog").select("*").order("name", { ascending: true });

  if (error) {
    throw new Error(`No se pudieron cargar los previos: ${error.message}`);
  }

  return (data ?? []).map((item) => ({
    id: item.id,
    name: item.name,
    createdAt: item.created_at,
  }));
}

export async function createPrevioCatalogItem(name: string) {
  const supabase = createSupabaseAdminClient();
  const normalized = normalizePrevioName(name);
  const { data, error } = await supabase.from("previo_catalog").insert({ name: normalized }).select("*").single();

  if (error) {
    throw new Error(`No se pudo crear el previo: ${error.message}`);
  }

  return data;
}

export async function deletePrevioCatalogItem(id: string) {
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.from("previo_catalog").delete().eq("id", id);

  if (error) {
    throw new Error(`No se pudo eliminar el previo: ${error.message}`);
  }
}

export async function listMachinePrevioRows(): Promise<MachinePrevioListRow[]> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("machines")
    .select(MACHINE_PREVIOS_SELECT)
    .order("order_position", { ascending: true });

  if (error) {
    throw new Error(`No se pudieron cargar los previos por máquina: ${error.message}`);
  }

  return ((data ?? []) as unknown as MachinePrevioSelectRow[]).map(mapMachinePrevioListRow);
}

export async function listCatalogWithMachineTargets() {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("equipment_catalog")
    .select(`
      *,
      equipment_previos(
        *,
        previo_catalog(name)
      )
    `)
    .order("code", { ascending: true });

  if (error) {
    throw new Error(`No se pudo cargar el catálogo con máquinas: ${error.message}`);
  }

  return ((data ?? []) as unknown as CatalogMachineRow[]).map((item) => ({
    ...item,
    previos: mapEquipmentPrevios(item.equipment_previos ?? []),
  }));
}

export async function addEquipmentPrevio(equipmentId: string, previoCatalogId: string) {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("equipment_previos")
    .upsert(
      {
        equipment_id: equipmentId,
        previo_catalog_id: previoCatalogId,
      },
      { onConflict: "equipment_id,previo_catalog_id" },
    )
    .select("*")
    .single();

  if (error) {
    throw new Error(`No se pudo asociar el previo al equipo: ${error.message}`);
  }

  return data;
}

export async function removeEquipmentPrevio(equipmentPrevioId: string) {
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.from("equipment_previos").delete().eq("id", equipmentPrevioId);

  if (error) {
    throw new Error(`No se pudo quitar el previo del equipo: ${error.message}`);
  }
}

export async function removeEquipmentPrevioByIds(equipmentId: string, previoCatalogId: string) {
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase
    .from("equipment_previos")
    .delete()
    .eq("equipment_id", equipmentId)
    .eq("previo_catalog_id", previoCatalogId);

  if (error) {
    throw new Error(`No se pudo quitar el previo del equipo: ${error.message}`);
  }
}

export async function syncMachinePreviosFromEquipment(equipmentId: string) {
  const supabase = createSupabaseAdminClient();
  const { data: equipmentPrevios, error: equipmentPreviosError } = await supabase
    .from("equipment_previos")
    .select("previo_catalog_id")
    .eq("equipment_id", equipmentId);

  if (equipmentPreviosError) {
    throw new Error(`No se pudieron cargar los previos del equipo: ${equipmentPreviosError.message}`);
  }

  if (!equipmentPrevios || equipmentPrevios.length === 0) {
    return { machinesTouched: 0, previosCreated: 0 };
  }

  const { data: machines, error: machinesError } = await supabase
    .from("machines")
    .select("id, machine_previos(previo_catalog_id)")
    .eq("equipment_id", equipmentId);

  if (machinesError) {
    throw new Error(`No se pudieron cargar las máquinas del equipo: ${machinesError.message}`);
  }

  let machinesTouched = 0;
  let previosCreated = 0;
  const defaultIds = equipmentPrevios.map((previo) => previo.previo_catalog_id);

  for (const machine of (machines ?? []) as unknown as Array<{ id: string; machine_previos: Array<{ previo_catalog_id: string }> }>) {
    const existingIds = new Set((machine.machine_previos ?? []).map((previo) => previo.previo_catalog_id));
    const rowsToInsert = defaultIds
      .filter((previoCatalogId) => !existingIds.has(previoCatalogId))
      .map((previoCatalogId) => ({
        machine_id: machine.id,
        previo_catalog_id: previoCatalogId,
      }));

    if (rowsToInsert.length === 0) continue;
    const { error } = await supabase.from("machine_previos").insert(rowsToInsert);
    if (error) {
      throw new Error(`No se pudieron sincronizar los previos del equipo: ${error.message}`);
    }

    machinesTouched += 1;
    previosCreated += rowsToInsert.length;
  }

  return { machinesTouched, previosCreated };
}

export async function createMachinePreviosFromEquipment(machineId: string, equipmentId: string | null | undefined) {
  if (!equipmentId) return;

  const supabase = createSupabaseAdminClient();
  const { data: equipmentPrevios, error } = await supabase
    .from("equipment_previos")
    .select("previo_catalog_id")
    .eq("equipment_id", equipmentId);

  if (error) {
    throw new Error(`No se pudieron cargar los previos del equipo: ${error.message}`);
  }

  if (!equipmentPrevios || equipmentPrevios.length === 0) return;

  const rows = equipmentPrevios.map((previo) => ({
    machine_id: machineId,
    previo_catalog_id: previo.previo_catalog_id,
  }));
  const { error: insertError } = await supabase.from("machine_previos").upsert(rows, { onConflict: "machine_id,previo_catalog_id" });

  if (insertError) {
    throw new Error(`No se pudieron crear los previos de la máquina: ${insertError.message}`);
  }
}

export async function addMachinePrevio(machineId: string, previoCatalogId: string) {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("machine_previos")
    .upsert(
      {
        machine_id: machineId,
        previo_catalog_id: previoCatalogId,
      },
      { onConflict: "machine_id,previo_catalog_id" },
    )
    .select("*")
    .single();

  if (error) {
    throw new Error(`No se pudo agregar el previo a la máquina: ${error.message}`);
  }

  return data;
}

export async function removeMachinePrevio(machinePrevioId: string) {
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.from("machine_previos").delete().eq("id", machinePrevioId);

  if (error) {
    throw new Error(`No se pudo quitar el previo de la máquina: ${error.message}`);
  }
}

export async function bulkApplyPrevioToMachines(input: {
  machineIds: string[];
  previoCatalogId: string;
  mode: "add" | "remove";
}) {
  if (input.machineIds.length === 0) return;

  const supabase = createSupabaseAdminClient();
  if (input.mode === "add") {
    const rows = input.machineIds.map((machineId) => ({
      machine_id: machineId,
      previo_catalog_id: input.previoCatalogId,
    }));
    const { error } = await supabase.from("machine_previos").upsert(rows, { onConflict: "machine_id,previo_catalog_id" });
    if (error) {
      throw new Error(`No se pudieron aplicar los previos a las máquinas: ${error.message}`);
    }
    return;
  }

  const { error } = await supabase
    .from("machine_previos")
    .delete()
    .eq("previo_catalog_id", input.previoCatalogId)
    .in("machine_id", input.machineIds);

  if (error) {
    throw new Error(`No se pudieron quitar los previos de las máquinas: ${error.message}`);
  }
}

export async function toggleMachinePrevio(input: {
  machineId: string;
  previoCatalogId: string;
  field: "ordered" | "received";
  checked: boolean;
  actorProfileId: string;
}) {
  const supabase = createSupabaseAdminClient();
  // Ensure a machine_previos row exists for this (machine, previo) pair before
  // toggling — the previos page can render previos straight from the equipment
  // catalog, so the row may not have been created yet.
  const { data: current, error: currentError } = await supabase
    .from("machine_previos")
    .upsert(
      { machine_id: input.machineId, previo_catalog_id: input.previoCatalogId },
      { onConflict: "machine_id,previo_catalog_id", ignoreDuplicates: false },
    )
    .select("*")
    .single();

  if (currentError || !current) {
    throw new Error(`No se pudo cargar el previo de la máquina: ${currentError?.message ?? "No existe."}`);
  }

  const now = new Date().toISOString();
  const patch =
    input.field === "ordered"
      ? {
          ordered: input.checked,
          ordered_at: input.checked ? now : null,
          ordered_by: input.checked ? input.actorProfileId : null,
        }
      : {
          received: input.checked,
          received_at: input.checked ? now : null,
          received_by: input.checked ? input.actorProfileId : null,
        };

  const { error: updateError } = await supabase.from("machine_previos").update(patch).eq("id", current.id);
  if (updateError) {
    throw new Error(`No se pudo actualizar el previo de la máquina: ${updateError.message}`);
  }

  const eventType = buildPrevioEventType(input.field, input.checked);
  const { error: eventError } = await supabase.from("machine_previo_events").insert({
    machine_previo_id: current.id,
    machine_id: current.machine_id,
    previo_catalog_id: current.previo_catalog_id,
    event_type: eventType,
    actor_profile_id: input.actorProfileId,
    created_at: now,
  });

  if (eventError) {
    throw new Error(`No se pudo registrar el evento del previo: ${eventError.message}`);
  }
}

export async function bootstrapPreviosFromFixture() {
  const fixture = loadPrevioFixture();
  const supabase = createSupabaseAdminClient();
  const allPrevioNames = Array.from(
    new Set(
      fixture.rows.flatMap((row) => (row.previos ?? []).map(normalizePrevioName)).filter(Boolean),
    ),
  );

  for (const name of allPrevioNames) {
    const { error } = await supabase.from("previo_catalog").upsert({ name }, { onConflict: "name" });
    if (error) {
      throw new Error(`No se pudo sincronizar el catálogo de previos: ${error.message}`);
    }
  }

  const { data: previoCatalogRows, error: previoCatalogError } = await supabase.from("previo_catalog").select("*");
  if (previoCatalogError) {
    throw new Error(`No se pudo cargar el catálogo de previos: ${previoCatalogError.message}`);
  }
  const previoIdByName = new Map((previoCatalogRows ?? []).map((row) => [row.name, row.id]));

  const { data: machinesData, error: machinesError } = await supabase
    .from("machines")
    .select(`
      id,
      serial_number,
      equipment_catalog(code, name),
      machine_previos(previo_catalog_id)
    `);

  if (machinesError) {
    throw new Error(`No se pudieron cargar las máquinas para poblar previos: ${machinesError.message}`);
  }

  const fixtureMaps = buildFixturePrevioMaps(fixture.rows);

  let machinesTouched = 0;
  let previosCreated = 0;

  const machines = (machinesData ?? []) as unknown as MachineBootstrapRow[];

  for (const machine of machines) {
    const equipmentCode = machine.equipment_catalog?.code ?? "";
    const inferred = resolveFixturePrevios(
      {
        serialNumber: machine.serial_number,
        equipmentCode,
      },
      fixtureMaps,
    );
    if (inferred.length === 0) continue;

    const existingIds = new Set((machine.machine_previos ?? []).map((previo) => previo.previo_catalog_id));
    const rowsToInsert = inferred
      .map((name) => previoIdByName.get(name))
      .filter((previoCatalogId): previoCatalogId is string => Boolean(previoCatalogId))
      .filter((previoCatalogId) => !existingIds.has(previoCatalogId))
      .map((previoCatalogId) => ({
        machine_id: machine.id,
        previo_catalog_id: previoCatalogId,
      }));

    if (rowsToInsert.length === 0) continue;

    const { error } = await supabase.from("machine_previos").insert(rowsToInsert);
    if (error) {
      throw new Error(`No se pudieron crear previos para la máquina ${machine.serial_number}: ${error.message}`);
    }

    machinesTouched += 1;
    previosCreated += rowsToInsert.length;
  }

  await syncEquipmentPreviosFromFixture(fixtureMaps, previoIdByName);

  return {
    machinesTouched,
    previosCreated,
    catalogCreated: allPrevioNames.length,
  };
}

async function syncEquipmentPreviosFromFixture(fixtureMaps: FixturePrevioMaps, previoIdByName: Map<string, string>) {
  const supabase = createSupabaseAdminClient();
  const { data: equipmentRows, error } = await supabase.from("equipment_catalog").select("id, code");
  if (error) {
    throw new Error(`No se pudo cargar el catálogo de equipos para previos: ${error.message}`);
  }

  const rows = (equipmentRows ?? []).flatMap((equipment) => {
    const names = fixtureMaps.byEquipmentCode.get(equipment.code) ?? [];
    return names
      .map((name) => previoIdByName.get(name))
      .filter((previoCatalogId): previoCatalogId is string => Boolean(previoCatalogId))
      .map((previoCatalogId) => ({
        equipment_id: equipment.id,
        previo_catalog_id: previoCatalogId,
      }));
  });

  if (rows.length === 0) return;
  const { error: upsertError } = await supabase.from("equipment_previos").upsert(rows, {
    onConflict: "equipment_id,previo_catalog_id",
  });
  if (upsertError) {
    throw new Error(`No se pudieron asociar previos a los equipos: ${upsertError.message}`);
  }
}

function mapMachinePrevioListRow(row: MachinePrevioSelectRow): MachinePrevioListRow {
  // Per-machine ordered/received state, keyed by previo, for whatever rows exist.
  const stateByPrevioId = new Map(
    (row.machine_previos ?? []).map((previo) => [previo.previo_catalog_id, previo]),
  );

  // The equipment's previos (defined in catalogo) are the source of truth for
  // which previos a machine needs. We render those directly and merge in any
  // saved per-machine state, so the list always reflects the catalogo even when
  // a machine_previos row hasn't been created yet (e.g. after changing a
  // machine's code or editing the equipment's previos).
  const previos = (row.equipment_catalog?.equipment_previos ?? [])
    .map<MachinePrevioView>((equipmentPrevio) => {
      const state = stateByPrevioId.get(equipmentPrevio.previo_catalog_id);
      return {
        id: state?.id ?? null,
        previoCatalogId: equipmentPrevio.previo_catalog_id,
        name: equipmentPrevio.previo_catalog?.name ?? state?.previo_catalog?.name ?? "Previo",
        ordered: state?.ordered ?? false,
        orderedAt: state?.ordered_at ?? null,
        orderedBy: state?.ordered_by ?? null,
        received: state?.received ?? false,
        receivedAt: state?.received_at ?? null,
        receivedBy: state?.received_by ?? null,
        createdAt: state?.created_at ?? null,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, "es"));

  return {
    machineId: row.id,
    serialNumber: row.serial_number,
    clientName: row.clients?.name ?? "Cliente sin nombre",
    equipmentName: row.equipment_catalog?.name ?? row.custom_equipment_name ?? "Producto personalizado",
    equipmentCode: row.equipment_catalog?.code ?? null,
    promisedDate: row.promised_date,
    status: row.status,
    previos,
    summary: buildMachinePrevioSummary(previos, row.status),
  };
}

export function buildMachinePrevioSummary(previos: MachinePrevioView[], status: Database["public"]["Tables"]["machines"]["Row"]["status"]): MachinePrevioSummary {
  const total = previos.length;
  const orderedCount = previos.filter((previo) => previo.ordered).length;
  const receivedCount = previos.filter((previo) => previo.received).length;
  const missingPrevios = total === 0;
  return {
    total,
    orderedCount,
    receivedCount,
    missingPrevios,
    pendingOrdered: total > 0 && orderedCount < total,
    pendingReceived: total > 0 && receivedCount < total,
    incompleteWhileInProduction: status === "in_production" && total > 0 && receivedCount < total,
  };
}

function mapEquipmentPrevios(
  rows: Array<Database["public"]["Tables"]["equipment_previos"]["Row"] & { previo_catalog: Pick<PrevioCatalogRow, "name"> | null }>,
): EquipmentPrevioView[] {
  return rows
    .map((row) => ({
      id: row.id,
      previoCatalogId: row.previo_catalog_id,
      name: row.previo_catalog?.name ?? "Previo",
      createdAt: row.created_at,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "es"));
}

function buildPrevioEventType(field: "ordered" | "received", checked: boolean): PrevioEventType {
  if (field === "ordered") {
    return checked ? "ordered_checked" : "ordered_unchecked";
  }
  return checked ? "received_checked" : "received_unchecked";
}

export function normalizePrevioName(name: string) {
  return name.trim().replace(/\s+/g, " ");
}

function loadPrevioFixture(): Fixture {
  const fixturePath = path.resolve(process.cwd(), "tests/fixtures/excel-plan-prod-mayo-2026.json");
  const raw = fs.readFileSync(fixturePath, "utf8");
  return JSON.parse(raw) as Fixture;
}

export function buildFixturePrevioMaps(rows: FixtureRow[]): FixturePrevioMaps {
  const explicitBySerial = new Map<number, string[]>();
  const byEquipmentCodeSets = new Map<string, Set<string>>();

  for (const row of rows) {
    const names = Array.from(new Set((row.previos ?? []).map(normalizePrevioName).filter(Boolean)));
    explicitBySerial.set(row.serialNumber, names);
    if (row.equipmentCode && names.length > 0) {
      const existing = byEquipmentCodeSets.get(row.equipmentCode) ?? new Set<string>();
      names.forEach((name) => existing.add(name));
      byEquipmentCodeSets.set(row.equipmentCode, existing);
    }
  }

  return {
    explicitBySerial,
    byEquipmentCode: new Map(Array.from(byEquipmentCodeSets.entries()).map(([code, names]) => [code, Array.from(names).sort()])),
  };
}

export function resolveFixturePrevios(
  machine: { serialNumber: number; equipmentCode: string | null },
  maps: FixturePrevioMaps,
) {
  const explicit = maps.explicitBySerial.get(machine.serialNumber) ?? [];
  if (explicit.length > 0) return explicit;
  return maps.byEquipmentCode.get(machine.equipmentCode ?? "") ?? [];
}
