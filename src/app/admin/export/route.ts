import { buildScheduleWorkbook } from "@/services/excel";
import { listHolidays } from "@/services/catalog";
import { listCalculatedMachines } from "@/services/machines";
import { getSettings, mapSettings } from "@/services/settings";
import { requireAdmin } from "@/lib/admin-auth";

export async function GET() {
  try {
    await requireAdmin();
  } catch {
    return new Response("No autorizado.", { status: 401 });
  }

  const settings = mapSettings(await getSettings());
  const holidays = await listHolidays();
  const machines = await listCalculatedMachines({ settings, holidays });

  const buffer = await buildScheduleWorkbook(machines);
  const filename = `plan-produccion-${new Date().toISOString().slice(0, 10)}.xlsx`;

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
