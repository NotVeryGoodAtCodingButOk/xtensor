/**
 * Seed Supabase with real data extracted from the Excel workbook.
 *
 * Reads tests/fixtures/excel-plan-prod-mayo-2026.json (run `pnpm excel:fixtures` first)
 * and upserts workers, clients, colors, equipment catalog, machines, and
 * machine_stages into the Supabase instance pointed to by .env.local.
 *
 * Usage:
 *   pnpm seed:excel
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { normalizeMachineLine } from "../src/lib/machine-lines";

type Fixture = {
  settings: {
    laborFactor: number;
    hourlyCostPerWorkerCop: number;
    activeWorkersCount: number;
    dailyHoursMonFri: number;
    dailyHoursSat: number;
    dailyHoursSun: number;
    clientBufferDays: number;
  };
  workers: {
    displayOrder: number;
    fullName: string;
    role: string;
    hourlyCostCop: number;
  }[];
  catalog: {
    code: string;
    name: string;
    defaultPriceCop: number | null;
  }[];
  rows: {
    row: number;
    serialNumber: number;
    clientName: string;
    equipmentCode: string;
    equipmentName: string;
    colorName: string;
    city: string;
    line: string;
    salePriceCop: number;
    promisedRaw: string;
    stages: { stageId: number; completion: number }[];
  }[];
};

function loadEnv() {
  const file = path.resolve(process.cwd(), ".env.local");
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

const SPANISH_MONTHS: Record<string, number> = {
  ene: 1, feb: 2, mar: 3, abr: 4, may: 5, jun: 6,
  jul: 7, ago: 8, sep: 9, oct: 10, nov: 11, dic: 12,
};

function parsePromised(raw: string): string {
  const trimmed = raw.trim();
  if (/^\d+$/.test(trimmed)) {
    // Excel serial date — epoch 1899-12-30
    const epoch = Date.UTC(1899, 11, 30);
    const ms = epoch + Number(trimmed) * 86_400_000;
    return new Date(ms).toISOString().slice(0, 10);
  }
  const m = trimmed.match(/^(\d{1,2})\s+([a-zñ]+)/i);
  if (!m) throw new Error(`Cannot parse promised date: "${raw}"`);
  const day = Number(m[1]);
  const month = SPANISH_MONTHS[m[2].slice(0, 3).toLowerCase()];
  if (!month) throw new Error(`Unknown month: "${raw}"`);
  return `2026-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

const WORKER_COLORS = [
  "#dc2626", "#2563eb", "#16a34a", "#f59e0b", "#7c3aed",
  "#0891b2", "#db2777", "#65a30d", "#ea580c",
];

async function main() {
  loadEnv();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env vars in .env.local");

  const fixturePath = path.resolve(process.cwd(), "tests/fixtures/excel-plan-prod-mayo-2026.json");
  const fixture: Fixture = JSON.parse(fs.readFileSync(fixturePath, "utf8"));

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // --- Workers ---------------------------------------------------------------
  console.log(`Upserting ${fixture.workers.length} workers...`);
  const workerRows = fixture.workers.map((w, i) => ({
    full_name: w.fullName,
    role: w.role,
    hourly_cost_cop: w.hourlyCostCop,
    is_active: true,
    display_color: WORKER_COLORS[i % WORKER_COLORS.length],
  }));
  // Upsert by full_name (no unique constraint, so delete+insert)
  {
    const names = workerRows.map((w) => w.full_name);
    const { data: existing } = await supabase.from("workers").select("id, full_name").in("full_name", names);
    const existingNames = new Set((existing ?? []).map((r) => r.full_name));
    const toInsert = workerRows.filter((w) => !existingNames.has(w.full_name));
    if (toInsert.length) {
      const { error } = await supabase.from("workers").insert(toInsert);
      if (error) throw error;
    }
    // Update existing rows to keep role/cost/color in sync
    for (const w of workerRows) {
      const { error } = await supabase
        .from("workers")
        .update({
          role: w.role,
          hourly_cost_cop: w.hourly_cost_cop,
          display_color: w.display_color,
          is_active: true,
        })
        .eq("full_name", w.full_name);
      if (error) throw error;
    }
  }

  // --- Colors ----------------------------------------------------------------
  const colorNames = Array.from(
    new Set(fixture.rows.map((r) => r.colorName.trim()).filter(Boolean)),
  );
  console.log(`Upserting ${colorNames.length} colors...`);
  for (const name of colorNames) {
    const { error } = await supabase.from("colors").upsert({ name }, { onConflict: "name" });
    if (error) throw error;
  }
  const { data: colorRows } = await supabase.from("colors").select("id, name");
  const colorByName = new Map((colorRows ?? []).map((c) => [c.name, c.id]));

  // --- Clients ---------------------------------------------------------------
  const clientNames = Array.from(new Set(fixture.rows.map((r) => r.clientName.trim()).filter(Boolean)));
  console.log(`Upserting ${clientNames.length} clients...`);
  for (const name of clientNames) {
    const { error } = await supabase
      .from("clients")
      .upsert(
        { name, magic_link_token: crypto.randomBytes(24).toString("base64url") },
        { onConflict: "name", ignoreDuplicates: true },
      );
    if (error) throw error;
  }
  const { data: clientRows } = await supabase.from("clients").select("id, name");
  const clientByName = new Map((clientRows ?? []).map((c) => [c.name, c.id]));

  // --- Equipment catalog -----------------------------------------------------
  const catalogMap = new Map<
    string,
    { code: string; name: string; line: string | null; default_price_cop: number | null }
  >();
  // Seed from the full "Precios y materiales" sheet first so the catalog
  // contains every product the factory offers, not only what's in production.
  for (const item of fixture.catalog ?? []) {
    const code = item.code.toUpperCase();
    catalogMap.set(code, {
      code,
      name: item.name,
      line: "otros",
      default_price_cop: item.defaultPriceCop ?? null,
    });
  }
  // Overlay rows from the production plan — these have an authoritative
  // `line` and the most recent quoted price.
  for (const r of fixture.rows) {
    if (!r.equipmentCode) continue;
    const code = r.equipmentCode.toUpperCase();
    const existing = catalogMap.get(code);
    catalogMap.set(code, {
      code,
      name: existing?.name || r.equipmentName,
      line: normalizeMachineLine(r.line || existing?.line),
      default_price_cop: r.salePriceCop || existing?.default_price_cop || null,
    });
  }
  console.log(`Upserting ${catalogMap.size} equipment catalog entries...`);
  for (const item of catalogMap.values()) {
    const { error } = await supabase
      .from("equipment_catalog")
      .upsert(
        { ...item, is_custom: false, is_active: true },
        { onConflict: "code" },
      );
    if (error) throw error;
  }
  const { data: equipRows } = await supabase.from("equipment_catalog").select("id, code");
  const equipByCode = new Map((equipRows ?? []).map((e) => [e.code, e.id]));

  // --- Machines + machine_stages --------------------------------------------
  console.log(`Upserting ${fixture.rows.length} machines...`);
  let position = 0;
  for (const r of fixture.rows) {
    position += 1;
    const clientId = clientByName.get(r.clientName.trim());
    if (!clientId) throw new Error(`No client id for ${r.clientName}`);
    const equipmentId = equipByCode.get(r.equipmentCode.toUpperCase()) ?? null;
    const colorId = r.colorName.trim() ? colorByName.get(r.colorName.trim()) ?? null : null;
    const promisedDate = parsePromised(r.promisedRaw);
    const allDone = r.stages.every((s) => s.completion === 100);

    const machineRow = {
      serial_number: r.serialNumber,
      client_id: clientId,
      equipment_id: equipmentId,
      custom_equipment_name: equipmentId ? null : r.equipmentName || "Producto personalizado",
      color_id: colorId,
      city: r.city || null,
      line_override: null,
      sale_price_cop: r.salePriceCop,
      promised_date: promisedDate,
      order_position: position,
      status: allDone ? "shipped" : "in_production",
      shipped_at: allDone ? `${promisedDate}T12:00:00Z` : null,
    };

    const { data: existing, error: selErr } = await supabase
      .from("machines")
      .select("id")
      .eq("serial_number", r.serialNumber)
      .maybeSingle();
    if (selErr) throw selErr;

    let machineId: string;
    if (existing) {
      machineId = existing.id;
      const { error } = await supabase.from("machines").update(machineRow).eq("id", machineId);
      if (error) throw error;
    } else {
      const { data, error } = await supabase
        .from("machines")
        .insert(machineRow)
        .select("id")
        .single();
      if (error) throw error;
      machineId = data.id;
    }

    // machine_stages — one per stage, allowed completions 0/25/50/75/100
    const stageRows = r.stages.map((s) => ({
      machine_id: machineId,
      stage_id: s.stageId,
      completion: s.completion,
    }));
    const { error: stageErr } = await supabase
      .from("machine_stages")
      .upsert(stageRows, { onConflict: "machine_id,stage_id" });
    if (stageErr) throw stageErr;
  }

  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
