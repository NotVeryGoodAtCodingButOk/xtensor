/**
 * One-off backfill: sets reestimated_date = estimatedDate for every
 * in_production machine that doesn't have a baseline yet.
 *
 * Existing machines predate the "Reestimada" column (see migration
 * 0024_machine_reestimated_date.sql), so without this backfill they'd show
 * "—" and never trip the late flag (isBehindReestimate) until the next
 * queue reorder or re-entry snapshots them naturally.
 *
 * Usage:
 *   pnpm backfill:reestimated
 */
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { calculateQueue, DEFAULT_STAGES, type ProductionSettings } from "../src/services/calculations";
import { estimateDeliveryDate, type Holiday } from "../src/services/schedule";

function loadEnv() {
  const file = path.resolve(process.cwd(), ".env.local");
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

async function main() {
  loadEnv();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env vars in .env.local");

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: settingsRow, error: settingsError } = await supabase
    .from("settings")
    .select("*")
    .eq("id", 1)
    .single();
  if (settingsError) throw new Error(`No se pudo cargar la configuración: ${settingsError.message}`);

  const settings: ProductionSettings = {
    hourlyCostPerWorkerCop: Number(settingsRow.hourly_cost_per_worker_cop),
    laborFactor: Number(settingsRow.labor_factor),
    dailyHoursMonFri: Number(settingsRow.daily_hours_mon_fri),
    dailyHoursFri: Number(settingsRow.daily_hours_fri),
    dailyHoursSat: Number(settingsRow.daily_hours_sat),
    dailyHoursSun: Number(settingsRow.daily_hours_sun),
    activeWorkersCount: Number(settingsRow.active_workers_count),
    clientBufferDays: Number(settingsRow.client_buffer_days),
    shippedRetentionDays: Number(settingsRow.shipped_retention_days ?? 60),
    // Shift fields only feed labor-time; the delivery-date queue ignores them.
    shiftStart: "08:00",
    shiftEndMonThu: "17:00",
    shiftEndFri: "14:30",
    shiftEndSat: null,
    shiftBreaks: [],
  };

  const { data: holidayRows, error: holidaysError } = await supabase
    .from("holidays")
    .select("*")
    .order("date", { ascending: true });
  if (holidaysError) throw new Error(`No se pudieron cargar los festivos: ${holidaysError.message}`);
  const holidays: Holiday[] = (holidayRows ?? []).map((h) => ({
    date: h.date,
    name: h.name,
    isCustom: h.is_custom,
  }));

  const { data: machines, error: machinesError } = await supabase
    .from("machines")
    .select("id, sale_price_cop, order_position, promised_date, reestimated_date, machine_stages(stage_id, completion)")
    .eq("status", "in_production")
    .order("order_position", { ascending: true });
  if (machinesError) throw new Error(`No se pudieron cargar las máquinas: ${machinesError.message}`);

  const queueInput = (machines ?? []).map((machine) => ({
    id: machine.id,
    salePriceCop: Number(machine.sale_price_cop),
    orderPosition: machine.order_position,
    promisedDate: machine.promised_date,
    stages: (machine.machine_stages ?? []).map((stage) => ({
      stageId: stage.stage_id,
      completion: stage.completion,
    })),
  }));

  const queue = calculateQueue(queueInput, settings, DEFAULT_STAGES);
  const calculationById = new Map(queue.map((calculation) => [calculation.machineId, calculation]));

  const scheduleStart = new Date();
  let updated = 0;
  for (const machine of machines ?? []) {
    if (machine.reestimated_date) continue; // only backfill missing baselines
    const calculation = calculationById.get(machine.id);
    if (!calculation) continue;

    const estimatedDate = estimateDeliveryDate(calculation.accumulatedHours, scheduleStart, settings, holidays);
    const { error } = await supabase
      .from("machines")
      .update({ reestimated_date: estimatedDate })
      .eq("id", machine.id);
    if (error) throw new Error(`No se pudo actualizar la máquina ${machine.id}: ${error.message}`);
    updated += 1;
  }

  console.log(`Reestimada asignada a ${updated} de ${(machines ?? []).length} máquina(s) en producción.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
