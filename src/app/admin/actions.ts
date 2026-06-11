"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { revalidateFactoryData } from "@/lib/factory-cache";
import { roundToFractionDigits } from "@/lib/utils";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAdmin, getAdminOrAuthError } from "@/lib/admin-auth";
import { normalizeMachineLine } from "@/lib/machine-lines";
import {
  createCustomEquipment,
  createColor,
  updateColor,
  deleteColor,
  createWorker,
  updateWorker,
  createCatalogItem,
  updateCatalogItem,
  deleteCatalogItem,
  createHoliday,
  deleteHoliday,
  listCatalog,
} from "@/services/catalog";
import { ensureClientByName, regenerateClientToken, updateClient, deleteClient } from "@/services/clients";
import {
  bulkMarkShipped,
  bulkSendToProduction,
  createMachine,
  deleteMachine,
  getMaxOrderPosition,
  markMachineFinished,
  markMachineShipped,
  reorderMachines,
  sendFinishedToProduction,
  sendMachineToPrevios,
  sendMachineToProduction,
  sendMachineToWarranty,
  updateMachine,
  unmarkMachineShipped,
} from "@/services/machines";
import { parseQuoteWorkbook } from "@/services/excel";
import { buildQuotePreview, type QuotePreview, type QuotePreviewLine } from "@/services/quote-preview";
import { AUTO_PLACA_MAX, listActivePlacaNumbers, normalizePlacaNumber } from "@/services/placas";
import {
  addMachinePrevio,
  addEquipmentPrevio,
  bootstrapPreviosFromFixture,
  bulkApplyPrevioToMachines,
  createMachinePreviosFromEquipment,
  createPrevioCatalogItem,
  deletePrevioCatalogItem,
  removeMachinePrevio,
  removeEquipmentPrevio,
  removeEquipmentPrevioByIds,
  syncMachinePreviosFromEquipment,
  toggleMachinePrevio,
} from "@/services/previos";
import { updateFactoryPassword, updateSettings } from "@/services/settings";

export async function signInAction(formData: FormData) {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    redirect("/admin/login?error=credenciales");
  }

  redirect("/admin");
}

export async function signOutAction() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/admin/login");
}

export async function markFinishedAction(formData: FormData) {
  await requireAdmin();
  await markMachineFinished(String(formData.get("machineId") ?? ""));
  revalidateFactoryData();
  redirect("/admin?toast=finished");
}

export async function markShippedAction(formData: FormData) {
  await requireAdmin();
  await markMachineShipped(String(formData.get("machineId") ?? ""));
  revalidateFactoryData();
  redirect("/admin?toast=shipped&count=1");
}

export async function createMachineAction(formData: FormData) {
  await requireAdmin();
  const client = await ensureClientByName(String(formData.get("clientName") ?? ""));
  const customEquipmentName = String(formData.get("customEquipmentName") ?? "").trim();
  const equipmentIdInput = String(formData.get("equipmentId") ?? "");
  const salePriceCop = Number(formData.get("salePriceCop"));
  const line = normalizeMachineLine(formData.get("line"));
  const equipment =
    equipmentIdInput || !customEquipmentName
      ? null
      : await createCustomEquipment({
          name: customEquipmentName,
          line,
          defaultPriceCop: Number.isFinite(salePriceCop) ? salePriceCop : null,
        });

  await createMachine({
    placa_number: Number(formData.get("placaNumber")),
    client_id: client.id,
    equipment_id: equipmentIdInput || equipment?.id || null,
    custom_equipment_name: equipmentIdInput ? null : customEquipmentName,
    color_id: String(formData.get("colorId") ?? "") || null,
    city: String(formData.get("city") ?? "").trim() || null,
    line_override: line,
    sale_price_cop: salePriceCop,
    assigned_to: String(formData.get("assignedTo") ?? "").trim() || null,
    promised_date: String(formData.get("promisedDate") ?? ""),
    order_position: Number(formData.get("orderPosition")) || 9999,
  });

  revalidateFactoryData();
  redirect("/admin");
}

export async function updateMachineAction(formData: FormData) {
  await requireAdmin();
  const machineId = String(formData.get("machineId") ?? "");
  const equipmentId = String(formData.get("equipmentId") ?? "").trim() || null;
  await updateMachine(machineId, {
    placa_number: Number(formData.get("placaNumber")),
    equipment_id: equipmentId,
    color_id: String(formData.get("colorId") ?? "").trim() || null,
    sale_price_cop: Number(formData.get("salePriceCop")),
    assigned_to: String(formData.get("assignedTo") ?? "").trim() || null,
    promised_date: String(formData.get("promisedDate") ?? ""),
    order_position: Number(formData.get("orderPosition")) || 9999,
    city: String(formData.get("city") ?? "").trim() || null,
    line_override: normalizeMachineLine(formData.get("line")),
  });

  // Keep machine_previos aligned with the (possibly new) equipment so the
  // previos page reflects the equipment's default previos for this machine.
  await createMachinePreviosFromEquipment(machineId, equipmentId);

  revalidateFactoryData();
  revalidatePath("/admin");
  revalidatePath("/admin/previos");
  revalidatePath(`/admin/maquinas/${machineId}`);
  redirect("/admin");
}

export async function updateMachineInlineAction(formData: FormData) {
  await requireAdmin();
  const machineId = String(formData.get("machineId") ?? "");
  await updateMachine(machineId, {
    placa_number: Number(formData.get("placaNumber")),
    sale_price_cop: Number(formData.get("salePriceCop")),
    assigned_to: String(formData.get("assignedTo") ?? "").trim() || null,
    promised_date: String(formData.get("promisedDate") ?? ""),
    order_position: Number(formData.get("orderPosition")) || 9999,
    city: String(formData.get("city") ?? "").trim() || null,
    line_override: normalizeMachineLine(formData.get("line")),
  });

  revalidateFactoryData();
  revalidatePath("/admin");
  revalidatePath(`/admin/maquinas/${machineId}`);
}

export async function unmarkShippedAction(formData: FormData) {
  await requireAdmin();
  await unmarkMachineShipped(String(formData.get("machineId") ?? ""));
  revalidateFactoryData();
  redirect("/admin/despachados");
}

export async function deleteMachineAction(formData: FormData) {
  await requireAdmin();
  await deleteMachine(String(formData.get("machineId") ?? ""));
  revalidateFactoryData();
  redirect("/admin");
}

export async function sendMachineToPreviosAction(formData: FormData) {
  await requireAdmin();
  const machineId = String(formData.get("machineId") ?? "");
  if (machineId) {
    await sendMachineToPrevios(machineId);
  }
  revalidateFactoryData();
  revalidatePath("/admin");
  revalidatePath("/admin/previos");
  revalidatePath(`/admin/maquinas/${machineId}`);
  redirect(`/admin/maquinas/${machineId}?toast=sent-previos&count=1`);
}

export async function sendMachineToProductionAction(formData: FormData) {
  await requireAdmin();
  const machineId = String(formData.get("machineId") ?? "");
  if (machineId) {
    await sendMachineToProduction(machineId);
  }
  revalidateFactoryData();
  revalidatePath("/admin");
  revalidatePath("/admin/previos");
  revalidatePath(`/admin/maquinas/${machineId}`);
  redirect(`/admin/maquinas/${machineId}?toast=sent-production&count=1`);
}

export async function reorderMachinesAction(formData: FormData) {
  await requireAdmin();
  const orderedIds = String(formData.get("orderedIds") ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);

  await reorderMachines(orderedIds);
  revalidateFactoryData();
  revalidatePath("/admin");
  redirect("/admin");
}

export async function updateFactoryPasswordAction(formData: FormData) {
  await requireAdmin();
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (password.length < 6) {
    redirect("/admin/configuracion?password=corta");
  }
  if (password !== confirm) {
    redirect("/admin/configuracion?password=nocoincide");
  }

  await updateFactoryPassword(password);
  redirect("/admin/configuracion?password=ok");
}

export async function regenerateClientTokenAction(formData: FormData) {
  await requireAdmin();
  await regenerateClientToken(String(formData.get("clientId") ?? ""));
  redirect("/admin/clientes");
}

export async function updateClientAction(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("clientId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (id && name) await updateClient(id, name);
  redirect("/admin/clientes");
}

export async function deleteClientAction(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("clientId") ?? "");
  if (id) await deleteClient(id);
  redirect("/admin/clientes");
}

export async function addColorAction(formData: FormData) {
  await requireAdmin();
  const name = String(formData.get("name") ?? "").trim();
  if (name) await createColor(name);
  revalidateFactoryData();
  redirect("/admin/configuracion#colores");
}

export async function updateColorAction(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (id && name) await updateColor(id, name);
  revalidateFactoryData();
  redirect("/admin/configuracion#colores");
}

export async function deleteColorAction(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (id) await deleteColor(id);
  revalidateFactoryData();
  redirect("/admin/configuracion#colores");
}

export async function addWorkerAction(formData: FormData) {
  await requireAdmin();
  const full_name = String(formData.get("full_name") ?? "").trim();
  const role = String(formData.get("role") ?? "").trim();
  const raw_cost = formData.get("hourly_cost_cop");
  const hourly_cost_cop = raw_cost ? roundToFractionDigits(Number(raw_cost)) : null;
  const display_color = String(formData.get("display_color") ?? "").trim() || null;
  const is_active = formData.get("is_active") !== "false";
  if (full_name && role) await createWorker({ full_name, role, hourly_cost_cop, display_color, is_active });
  revalidateFactoryData();
  redirect("/admin/operarios");
}

export async function updateWorkerAction(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const full_name = String(formData.get("full_name") ?? "").trim();
  const role = String(formData.get("role") ?? "").trim();
  const raw_cost = formData.get("hourly_cost_cop");
  const hourly_cost_cop = raw_cost ? roundToFractionDigits(Number(raw_cost)) : null;
  const display_color = String(formData.get("display_color") ?? "").trim() || null;
  const is_active = formData.get("is_active") !== "false";
  if (id) await updateWorker(id, { full_name, role, hourly_cost_cop, display_color, is_active });
  revalidateFactoryData();
  redirect("/admin/operarios");
}

export async function addCatalogItemAction(formData: FormData) {
  await requireAdmin();
  const code = String(formData.get("code") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const line = normalizeMachineLine(formData.get("line"));
  const default_price_cop = Number(formData.get("default_price_cop")) || null;
  if (code && name) await createCatalogItem({ code, name, line, default_price_cop });
  redirect("/admin/catalogo");
}

export async function addPrevioCatalogItemAction(formData: FormData) {
  await requireAdmin();
  const name = String(formData.get("name") ?? "").trim();
  if (name) await createPrevioCatalogItem(name);
  redirect("/admin/catalogo");
}

export async function deletePrevioCatalogItemAction(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "").trim();
  if (id) await deletePrevioCatalogItem(id);
  redirect("/admin/catalogo");
}

export async function bulkApplyCatalogPrevioAction(formData: FormData) {
  await requireAdmin();
  const previoCatalogId = String(formData.get("previoCatalogId") ?? "").trim();
  const mode = String(formData.get("mode") ?? "add") === "remove" ? "remove" : "add";
  const machineIds = formData.getAll("machineIds").map((value) => String(value)).filter(Boolean);
  if (previoCatalogId && machineIds.length > 0) {
    await bulkApplyPrevioToMachines({ previoCatalogId, machineIds, mode });
  }
  redirect("/admin/catalogo");
}

export async function addEquipmentPrevioAction(formData: FormData) {
  await requireAdmin();
  const equipmentId = String(formData.get("equipmentId") ?? "").trim();
  const previoCatalogId = String(formData.get("previoCatalogId") ?? "").trim();
  if (equipmentId && previoCatalogId) {
    await addEquipmentPrevio(equipmentId, previoCatalogId);
    await syncMachinePreviosFromEquipment(equipmentId);
  }
  revalidatePath("/admin/previos");
  redirect("/admin/catalogo");
}

export async function removeEquipmentPrevioAction(formData: FormData) {
  await requireAdmin();
  const equipmentPrevioId = String(formData.get("equipmentPrevioId") ?? "").trim();
  if (equipmentPrevioId) await removeEquipmentPrevio(equipmentPrevioId);
  revalidatePath("/admin/previos");
  redirect("/admin/catalogo");
}

export async function toggleEquipmentPrevioAction(formData: FormData) {
  await requireAdmin();
  const equipmentId = String(formData.get("equipmentId") ?? "").trim();
  const previoCatalogId = String(formData.get("previoCatalogId") ?? "").trim();
  const isActive = String(formData.get("isActive") ?? "") === "true";
  if (equipmentId && previoCatalogId) {
    if (isActive) {
      await addEquipmentPrevio(equipmentId, previoCatalogId);
      // Propagate the new default previo to every machine of this equipment
      // so it shows up on the previos page.
      await syncMachinePreviosFromEquipment(equipmentId);
    } else {
      await removeEquipmentPrevioByIds(equipmentId, previoCatalogId);
    }
  }
  revalidatePath("/admin/catalogo");
  revalidatePath("/admin/previos");
}

export async function updateCatalogItemAction(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const code = String(formData.get("code") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const line = normalizeMachineLine(formData.get("line"));
  const default_price_cop = Number(formData.get("default_price_cop")) || null;
  const is_active = formData.get("is_active") !== "false";
  if (id) await updateCatalogItem(id, { code, name, line, default_price_cop, is_active });
  redirect("/admin/catalogo");
}

export async function deleteCatalogItemAction(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "").trim();
  if (id) await deleteCatalogItem(id);
  redirect("/admin/catalogo");
}

export async function addMachinePrevioAction(formData: FormData) {
  await requireAdmin();
  const machineId = String(formData.get("machineId") ?? "").trim();
  const previoCatalogId = String(formData.get("previoCatalogId") ?? "").trim();
  if (machineId && previoCatalogId) {
    await addMachinePrevio(machineId, previoCatalogId);
  }
  redirect("/admin/previos");
}

export async function removeMachinePrevioAction(formData: FormData) {
  await requireAdmin();
  const machinePrevioId = String(formData.get("machinePrevioId") ?? "").trim();
  if (machinePrevioId) {
    await removeMachinePrevio(machinePrevioId);
  }
  redirect("/admin/previos");
}

export async function toggleMachinePrevioAction(formData: FormData) {
  const machineId = String(formData.get("machineId") ?? "").trim();
  const previoCatalogId = String(formData.get("previoCatalogId") ?? "").trim();
  const field = String(formData.get("field") ?? "") === "received" ? "received" : "ordered";
  const checked = String(formData.get("checked") ?? "") === "true";
  const actorProfileId = await requireActorProfileId();
  if (machineId && previoCatalogId) {
    await toggleMachinePrevio({ machineId, previoCatalogId, field, checked, actorProfileId });
  }
  revalidatePath("/admin/previos");
}

export async function bootstrapPreviosAction() {
  await requireAdmin();
  const result = await bootstrapPreviosFromFixture();
  redirect(`/admin/previos?seed=ok&machines=${result.machinesTouched}&previos=${result.previosCreated}`);
}

export async function updateSettingsAction(formData: FormData) {
  await requireAdmin();
  await updateSettings({
    hourly_cost_per_worker_cop: Number(formData.get("hourly_cost_per_worker_cop")),
    labor_factor: Number(formData.get("labor_factor")),
    active_workers_count: Number(formData.get("active_workers_count")),
    daily_hours_mon_fri: Number(formData.get("daily_hours_mon_fri")),
    daily_hours_sat: Number(formData.get("daily_hours_sat")),
    daily_hours_sun: Number(formData.get("daily_hours_sun") ?? 0),
    client_buffer_days: Number(formData.get("client_buffer_days")),
    shipped_retention_days: Number(formData.get("shipped_retention_days")),
  });
  revalidateFactoryData();
  redirect("/admin/configuracion?settings=ok");
}

export async function addHolidayAction(formData: FormData) {
  await requireAdmin();
  const date = String(formData.get("date") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  if (date && name) await createHoliday(date, name);
  revalidateFactoryData();
  redirect("/admin/configuracion");
}

export async function deleteHolidayAction(formData: FormData) {
  await requireAdmin();
  const date = String(formData.get("date") ?? "").trim();
  if (date) await deleteHoliday(date);
  revalidateFactoryData();
  redirect("/admin/configuracion");
}

export type { QuotePreview, QuotePreviewLine };

/** Returned by the import actions when the admin session has expired. */
export type SessionExpired = { sessionExpired: true };

export async function parseQuoteExcelAction(
  formData: FormData,
): Promise<QuotePreview | SessionExpired> {
  if (!(await getAdminOrAuthError())) return { sessionExpired: true };
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    throw new Error("Selecciona un archivo de Excel.");
  }

  const [quote, catalog, activePlacaNumbers] = await Promise.all([
    file.arrayBuffer().then(parseQuoteWorkbook),
    listCatalog(),
    listActivePlacaNumbers(),
  ]);

  return buildQuotePreview({ quote, catalog, activePlacaNumbers });
}

export type ImportQuoteLineInput = {
  resolution: "skip" | "catalog" | "custom";
  catalogId?: string;
  customName?: string;
  line?: string | null;
  producto: string;
  unidades: number;
  placaNumbers: number[];
  pUnitCop: number;
};

export async function importQuoteAction(input: {
  placaMode: "auto";
  clientName: string;
  promisedDate: string;
  lines: ImportQuoteLineInput[];
}): Promise<{ created: number } | SessionExpired> {
  if (!(await getAdminOrAuthError())) return { sessionExpired: true };
  const clientName = input.clientName.trim();
  if (!clientName) throw new Error("El cliente es requerido.");
  if (!input.promisedDate) throw new Error("La fecha prometida es requerida.");

  const importable = input.lines.filter((line) => line.resolution !== "skip");
  if (importable.length === 0) {
    throw new Error("No hay líneas seleccionadas para importar.");
  }

  const activePlacaNumbers = await listActivePlacaNumbers();
  const unavailablePlacas = new Set(activePlacaNumbers);
  const placasInImport = new Set<number>();
  for (const line of importable) {
    const units = Math.max(1, Math.round(line.unidades) || 1);
    if (line.placaNumbers.length < units) {
      throw new Error(`Faltan placas para "${line.producto}".`);
    }

    for (let i = 0; i < units; i += 1) {
      const placaNumber = normalizePlacaNumber(line.placaNumbers[i]);
      if (!placaNumber) {
        throw new Error(`La PLACA de "${line.producto}" es inválida.`);
      }
      if (placaNumber > AUTO_PLACA_MAX) {
        throw new Error(`La PLACA ${placaNumber} supera el máximo automático de ${AUTO_PLACA_MAX}.`);
      }
      if (unavailablePlacas.has(placaNumber)) {
        throw new Error(`La PLACA ${placaNumber} ya está activa. Elige otra antes de importar.`);
      }
      if (placasInImport.has(placaNumber)) {
        throw new Error(`La PLACA ${placaNumber} está repetida en esta importación.`);
      }
      placasInImport.add(placaNumber);
    }
  }

  const client = await ensureClientByName(clientName);
  let position = await getMaxOrderPosition();
  let created = 0;

  for (const line of importable) {
    let equipmentId: string | null = null;
    let lineOverride: string | null = line.line == null ? null : normalizeMachineLine(line.line);

    if (line.resolution === "catalog") {
      if (!line.catalogId) throw new Error(`Falta el equipo del catálogo para "${line.producto}".`);
      equipmentId = line.catalogId;
    } else {
      const name = (line.customName ?? line.producto).trim();
      if (!name) throw new Error("El producto personalizado requiere un nombre.");
      lineOverride = normalizeMachineLine(line.line);
      const equipment = await createCustomEquipment({
        name,
        line: lineOverride,
        defaultPriceCop: Number.isFinite(line.pUnitCop) ? line.pUnitCop : null,
      });
      equipmentId = equipment.id;
    }

    const units = Math.max(1, Math.round(line.unidades) || 1);
    for (let i = 0; i < units; i += 1) {
      position += 1;
      const placaNumber = normalizePlacaNumber(line.placaNumbers[i]);
      if (!placaNumber) throw new Error(`La PLACA de "${line.producto}" es inválida.`);
      await createMachine({
        placa_number: placaNumber,
        client_id: client.id,
        equipment_id: equipmentId,
        custom_equipment_name: null,
        line_override: lineOverride,
        sale_price_cop: Number.isFinite(line.pUnitCop) ? line.pUnitCop : 0,
        promised_date: input.promisedDate,
        order_position: position,
        status: "pending",
      });
      created += 1;
    }
  }

  revalidateFactoryData();
  return { created };
}

export async function updateMachineClientAction(formData: FormData) {
  await requireAdmin();
  const machineId = String(formData.get("machineId") ?? "");
  const clientName = String(formData.get("clientName") ?? "").trim();
  if (machineId && clientName) {
    const client = await ensureClientByName(clientName);
    await updateMachine(machineId, { client_id: client.id });
  }
  revalidateFactoryData();
  revalidatePath("/admin/previos");
}

export async function updateMachinePlacaAction(formData: FormData) {
  await requireAdmin();
  const machineId = String(formData.get("machineId") ?? "");
  const placaNumber = Number(formData.get("placaNumber"));
  if (machineId && Number.isFinite(placaNumber) && placaNumber > 0) {
    await updateMachine(machineId, { placa_number: placaNumber });
  }
  revalidateFactoryData();
  revalidatePath("/admin/previos");
}

export async function sendToProductionAction(formData: FormData) {
  await requireAdmin();
  const machineIds = formData.getAll("machineIds").map(String).filter(Boolean);
  if (machineIds.length > 0) await bulkSendToProduction(machineIds);
  revalidateFactoryData();
  redirect(`/admin/previos?toast=sent-production&count=${machineIds.length || 1}`);
}

export async function bulkMarkShippedAction(formData: FormData) {
  await requireAdmin();
  const machineIds = formData.getAll("machineIds").map(String).filter(Boolean);
  if (machineIds.length > 0) await bulkMarkShipped(machineIds);
  revalidateFactoryData();
  redirect(`/admin?toast=shipped&count=${machineIds.length || 1}`);
}

export async function bulkDeleteMachinesAction(formData: FormData) {
  await requireAdmin();
  const machineIds = formData.getAll("machineIds").map(String).filter(Boolean);
  for (const id of machineIds) {
    await deleteMachine(id);
  }
  revalidateFactoryData();
  redirect(`/admin/despachados?toast=deleted&count=${machineIds.length}`);
}

export async function bulkDespacharTerminadosAction(formData: FormData) {
  await requireAdmin();
  const machineIds = formData.getAll("machineIds").map(String).filter(Boolean);
  if (machineIds.length > 0) await bulkMarkShipped(machineIds);
  revalidateFactoryData();
  revalidatePath("/admin/terminados");
  redirect(`/admin/terminados?toast=shipped&count=${machineIds.length || 1}`);
}

export async function reprocesarMaquinaAction(formData: FormData) {
  await requireAdmin();
  const machineId = String(formData.get("machineId") ?? "");
  await sendFinishedToProduction(machineId);
  revalidateFactoryData();
  revalidatePath("/admin/terminados");
  redirect("/admin/terminados?toast=reproceso");
}

export async function warrantyMachineAction(formData: FormData) {
  await requireAdmin();
  const machineId = String(formData.get("machineId") ?? "");
  const message = String(formData.get("message") ?? "").trim();

  if (!machineId) {
    throw new Error("Falta la máquina para registrar la garantía.");
  }
  if (!message) {
    throw new Error("Describe brevemente la garantía.");
  }

  await sendMachineToWarranty(machineId, message);
  revalidateFactoryData();
  redirect("/admin/despachados");
}

async function requireActorProfileId() {
  return (await requireAdmin()).id;
}
