import { compare, hash } from "bcrypt-ts";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/types/database";
import type { ProductionSettings } from "@/services/calculations";

type SettingsRow = Database["public"]["Tables"]["settings"]["Row"];
type SettingsUpdate = Database["public"]["Tables"]["settings"]["Update"];

export function mapSettings(row: SettingsRow): ProductionSettings {
  return {
    hourlyCostPerWorkerCop: Number(row.hourly_cost_per_worker_cop),
    laborFactor: Number(row.labor_factor),
    dailyHoursMonFri: Number(row.daily_hours_mon_fri),
    dailyHoursFri: Number(row.daily_hours_fri),
    dailyHoursSat: Number(row.daily_hours_sat),
    dailyHoursSun: Number(row.daily_hours_sun),
    activeWorkersCount: Number(row.active_workers_count),
    clientBufferDays: Number(row.client_buffer_days),
    shippedRetentionDays: Number(row.shipped_retention_days ?? 60),
  };
}

export async function getSettings() {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.from("settings").select("*").eq("id", 1).single();

  if (error) {
    throw new Error(`No se pudo cargar la configuración: ${error.message}`);
  }

  return data;
}

export async function updateSettings(patch: SettingsUpdate) {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("settings")
    .update(patch)
    .eq("id", 1)
    .select("*")
    .single();

  if (error) {
    throw new Error(`No se pudo actualizar la configuración: ${error.message}`);
  }

  return data;
}

export async function verifyFactoryPassword(password: string) {
  const settings = await getSettings();
  return compare(password, settings.factory_password_hash);
}

export async function updateFactoryPassword(password: string) {
  const factoryPasswordHash = await hash(password, 12);
  return updateSettings({ factory_password_hash: factoryPasswordHash });
}
