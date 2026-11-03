/**
 * Diagnóstico de SOLO LECTURA de la fecha «Reestimada».
 *
 * Para cada máquina en cola (in_production) lista: serial, order_position,
 * reestimated_date guardada, «Actualizada» viva (la misma que calcula el
 * tablero admin con listCalculatedMachines y new Date()) y si coinciden.
 * No escribe nada en la base.
 *
 * Usage:
 *   corepack pnpm tsx scripts/check-reestimated.ts
 */
import fs from "node:fs";
import path from "node:path";

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
  // Import after loading env: the services read process.env lazily, but keep
  // the order explicit so this never runs against a half-configured client.
  const { listCalculatedMachines } = await import("../src/services/machines");
  const { listHolidays } = await import("../src/services/catalog");
  const { getSettings, mapSettings } = await import("../src/services/settings");
  const { createSupabaseAdminClient } = await import("../src/lib/supabase/admin");

  const settings = mapSettings(await getSettings());
  const holidays = await listHolidays();
  const machines = await listCalculatedMachines({ settings, holidays, status: "in_production" });

  const supabase = createSupabaseAdminClient();
  const { data: rows, error } = await supabase
    .from("machines")
    .select("id, updated_at")
    .eq("status", "in_production");
  if (error) throw new Error(`No se pudieron leer las máquinas: ${error.message}`);
  const updatedAtById = new Map((rows ?? []).map((row) => [row.id, row.updated_at]));

  const sorted = [...machines].sort((a, b) => a.orderPosition - b.orderPosition);
  const positions = sorted.map((machine) => machine.orderPosition);
  const duplicatedPositions = positions.filter((position, index) => positions.indexOf(position) !== index);
  const gapless = positions.every((position, index) => position === index + 1);

  let matches = 0;
  let missing = 0;
  let behind = 0;
  let ahead = 0;

  console.log(`Ahora (servidor): ${new Date().toISOString()}  TZ=${Intl.DateTimeFormat().resolvedOptions().timeZone}`);
  console.log(
    `Configuración: factor ${settings.laborFactor}, costo hora ${settings.hourlyCostPerWorkerCop}, ` +
      `${settings.activeWorkersCount} operarios × ${settings.dailyHoursMonFri} h (vie ${settings.dailyHoursFri} h)`,
  );
  console.log("");
  console.log(
    [
      "pos".padStart(3),
      "serial".padStart(6),
      "prometida ".padEnd(10),
      "reestimada".padEnd(10),
      "actualizada".padEnd(11),
      "rest. h".padStart(8),
      "acum. h".padStart(9),
      "¿coinciden?".padEnd(13),
      "updated_at",
    ].join("  "),
  );

  for (const machine of sorted) {
    const reestimated = machine.reestimatedDate;
    let verdict: string;
    if (!reestimated) {
      verdict = "SIN BASE";
      missing += 1;
    } else if (reestimated === machine.estimatedDate) {
      verdict = "sí";
      matches += 1;
    } else if (machine.estimatedDate > reestimated) {
      verdict = "NO (atrasada)";
      behind += 1;
    } else {
      verdict = "NO (adelant.)";
      ahead += 1;
    }

    console.log(
      [
        String(machine.orderPosition).padStart(3),
        String(machine.serialNumber).padStart(6),
        machine.promisedDate.padEnd(10),
        (reestimated ?? "—").padEnd(10),
        machine.estimatedDate.padEnd(11),
        machine.remainingHours.toFixed(1).padStart(8),
        machine.accumulatedHours.toFixed(1).padStart(9),
        verdict.padEnd(13),
        updatedAtById.get(machine.id) ?? "",
      ].join("  "),
    );
  }

  console.log("");
  console.log(
    `${sorted.length} máquina(s) en cola: ${matches} coinciden, ${behind} con Actualizada después de la Reestimada, ` +
      `${ahead} con Actualizada antes, ${missing} sin Reestimada.`,
  );
  console.log(
    `Posiciones: ${gapless ? "1..N sin huecos" : "CON HUECOS"}` +
      (duplicatedPositions.length > 0 ? `, duplicadas: ${[...new Set(duplicatedPositions)].join(", ")}` : ""),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
