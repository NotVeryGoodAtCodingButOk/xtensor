"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  createCustomEquipment,
  createColor,
  updateColor,
  deleteColor,
  createWorker,
  updateWorker,
  createCatalogItem,
  updateCatalogItem,
  createHoliday,
  deleteHoliday,
} from "@/services/catalog";
import { ensureClientByName, regenerateClientToken, updateClient, deleteClient } from "@/services/clients";
import {
  createMachine,
  deleteMachine,
  markMachineShipped,
  reorderMachines,
  updateMachine,
  unmarkMachineShipped,
} from "@/services/machines";
import {
  addMachinePrevio,
  bootstrapPreviosFromFixture,
  bulkApplyPrevioToMachines,
  createPrevioCatalogItem,
  deletePrevioCatalogItem,
  removeMachinePrevio,
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

export async function markShippedAction(formData: FormData) {
  await markMachineShipped(String(formData.get("machineId") ?? ""));
  redirect("/admin");
}

export async function createMachineAction(formData: FormData) {
  const client = await ensureClientByName(String(formData.get("clientName") ?? ""));
  const customEquipmentName = String(formData.get("customEquipmentName") ?? "").trim();
  const equipmentIdInput = String(formData.get("equipmentId") ?? "");
  const salePriceCop = Number(formData.get("salePriceCop"));
  const line = String(formData.get("line") ?? "").trim() || null;
  const equipment =
    equipmentIdInput || !customEquipmentName
      ? null
      : await createCustomEquipment({
          name: customEquipmentName,
          line,
          defaultPriceCop: Number.isFinite(salePriceCop) ? salePriceCop : null,
        });

  await createMachine({
    coti_number: Number(formData.get("cotiNumber")),
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

  redirect("/admin");
}

export async function updateMachineAction(formData: FormData) {
  const machineId = String(formData.get("machineId") ?? "");
  await updateMachine(machineId, {
    sale_price_cop: Number(formData.get("salePriceCop")),
    assigned_to: String(formData.get("assignedTo") ?? "").trim() || null,
    promised_date: String(formData.get("promisedDate") ?? ""),
    order_position: Number(formData.get("orderPosition")) || 9999,
    city: String(formData.get("city") ?? "").trim() || null,
    line_override: String(formData.get("line") ?? "").trim() || null,
  });

  redirect("/admin");
}

export async function unmarkShippedAction(formData: FormData) {
  await unmarkMachineShipped(String(formData.get("machineId") ?? ""));
  redirect("/admin/despachados");
}

export async function deleteMachineAction(formData: FormData) {
  await deleteMachine(String(formData.get("machineId") ?? ""));
  redirect("/admin");
}

export async function reorderMachinesAction(formData: FormData) {
  const orderedIds = String(formData.get("orderedIds") ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);

  await reorderMachines(orderedIds);
  redirect("/admin");
}

export async function updateFactoryPasswordAction(formData: FormData) {
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
  await regenerateClientToken(String(formData.get("clientId") ?? ""));
  redirect("/admin/clientes");
}

export async function updateClientAction(formData: FormData) {
  const id = String(formData.get("clientId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (id && name) await updateClient(id, name);
  redirect("/admin/clientes");
}

export async function deleteClientAction(formData: FormData) {
  const id = String(formData.get("clientId") ?? "");
  if (id) await deleteClient(id);
  redirect("/admin/clientes");
}

export async function addColorAction(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  if (name) await createColor(name);
  redirect("/admin/colores");
}

export async function updateColorAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (id && name) await updateColor(id, name);
  redirect("/admin/colores");
}

export async function deleteColorAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (id) await deleteColor(id);
  redirect("/admin/colores");
}

export async function addWorkerAction(formData: FormData) {
  const full_name = String(formData.get("full_name") ?? "").trim();
  const role = String(formData.get("role") ?? "").trim();
  const raw_cost = formData.get("hourly_cost_cop");
  const hourly_cost_cop = raw_cost ? Number(raw_cost) || null : null;
  const display_color = String(formData.get("display_color") ?? "").trim() || null;
  const is_active = formData.get("is_active") !== "false";
  if (full_name && role) await createWorker({ full_name, role, hourly_cost_cop, display_color, is_active });
  redirect("/admin/operarios");
}

export async function updateWorkerAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const full_name = String(formData.get("full_name") ?? "").trim();
  const role = String(formData.get("role") ?? "").trim();
  const raw_cost = formData.get("hourly_cost_cop");
  const hourly_cost_cop = raw_cost ? Number(raw_cost) || null : null;
  const display_color = String(formData.get("display_color") ?? "").trim() || null;
  const is_active = formData.get("is_active") !== "false";
  if (id) await updateWorker(id, { full_name, role, hourly_cost_cop, display_color, is_active });
  redirect("/admin/operarios");
}

export async function addCatalogItemAction(formData: FormData) {
  const code = String(formData.get("code") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const line = String(formData.get("line") ?? "").trim() || null;
  const default_price_cop = Number(formData.get("default_price_cop")) || null;
  if (code && name) await createCatalogItem({ code, name, line, default_price_cop });
  redirect("/admin/catalogo");
}

export async function addPrevioCatalogItemAction(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  if (name) await createPrevioCatalogItem(name);
  redirect("/admin/catalogo");
}

export async function deletePrevioCatalogItemAction(formData: FormData) {
  const id = String(formData.get("id") ?? "").trim();
  if (id) await deletePrevioCatalogItem(id);
  redirect("/admin/catalogo");
}

export async function bulkApplyCatalogPrevioAction(formData: FormData) {
  const previoCatalogId = String(formData.get("previoCatalogId") ?? "").trim();
  const mode = String(formData.get("mode") ?? "add") === "remove" ? "remove" : "add";
  const machineIds = formData.getAll("machineIds").map((value) => String(value)).filter(Boolean);
  if (previoCatalogId && machineIds.length > 0) {
    await bulkApplyPrevioToMachines({ previoCatalogId, machineIds, mode });
  }
  redirect("/admin/catalogo");
}

export async function updateCatalogItemAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const code = String(formData.get("code") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const line = String(formData.get("line") ?? "").trim() || null;
  const default_price_cop = Number(formData.get("default_price_cop")) || null;
  const is_active = formData.get("is_active") !== "false";
  if (id) await updateCatalogItem(id, { code, name, line, default_price_cop, is_active });
  redirect("/admin/catalogo");
}

export async function addMachinePrevioAction(formData: FormData) {
  const machineId = String(formData.get("machineId") ?? "").trim();
  const previoCatalogId = String(formData.get("previoCatalogId") ?? "").trim();
  if (machineId && previoCatalogId) {
    await addMachinePrevio(machineId, previoCatalogId);
  }
  redirect("/admin/previos");
}

export async function removeMachinePrevioAction(formData: FormData) {
  const machinePrevioId = String(formData.get("machinePrevioId") ?? "").trim();
  if (machinePrevioId) {
    await removeMachinePrevio(machinePrevioId);
  }
  redirect("/admin/previos");
}

export async function toggleMachinePrevioAction(formData: FormData) {
  const machinePrevioId = String(formData.get("machinePrevioId") ?? "").trim();
  const field = String(formData.get("field") ?? "") === "received" ? "received" : "ordered";
  const checked = String(formData.get("checked") ?? "") === "true";
  const actorProfileId = await requireActorProfileId();
  if (machinePrevioId) {
    await toggleMachinePrevio({ machinePrevioId, field, checked, actorProfileId });
  }
  redirect("/admin/previos");
}

export async function bootstrapPreviosAction() {
  const result = await bootstrapPreviosFromFixture();
  redirect(`/admin/previos?seed=ok&machines=${result.machinesTouched}&previos=${result.previosCreated}`);
}

export async function updateSettingsAction(formData: FormData) {
  await updateSettings({
    hourly_cost_per_worker_cop: Number(formData.get("hourly_cost_per_worker_cop")),
    labor_factor: Number(formData.get("labor_factor")),
    active_workers_count: Number(formData.get("active_workers_count")),
    daily_hours_mon_fri: Number(formData.get("daily_hours_mon_fri")),
    daily_hours_sat: Number(formData.get("daily_hours_sat")),
    daily_hours_sun: Number(formData.get("daily_hours_sun") ?? 0),
    client_buffer_days: Number(formData.get("client_buffer_days")),
  });
  redirect("/admin/configuracion?settings=ok");
}

export async function addHolidayAction(formData: FormData) {
  const date = String(formData.get("date") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  if (date && name) await createHoliday(date, name);
  redirect("/admin/configuracion");
}

export async function deleteHolidayAction(formData: FormData) {
  const date = String(formData.get("date") ?? "").trim();
  if (date) await deleteHoliday(date);
  redirect("/admin/configuracion");
}

async function requireActorProfileId() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    throw new Error("No se pudo identificar al usuario actual.");
  }

  return user.id;
}
