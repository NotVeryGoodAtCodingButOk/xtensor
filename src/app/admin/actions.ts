"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createCustomEquipment } from "@/services/catalog";
import { ensureClientByName } from "@/services/clients";
import {
  createMachine,
  deleteMachine,
  markMachineShipped,
  reorderMachines,
  updateMachine,
  unmarkMachineShipped,
} from "@/services/machines";
import { regenerateClientToken } from "@/services/clients";

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

export async function regenerateClientTokenAction(formData: FormData) {
  await regenerateClientToken(String(formData.get("clientId") ?? ""));
  redirect("/admin/clientes");
}
