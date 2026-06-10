import { buildShippedWorkbook } from "@/services/excel";
import { listHolidays } from "@/services/catalog";
import { listCalculatedMachines } from "@/services/machines";
import { getSettings, mapSettings } from "@/services/settings";
import { requireAdmin } from "@/lib/admin-auth";

export async function GET(request: Request) {
  try {
    await requireAdmin();
  } catch {
    return new Response("No autorizado.", { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const rawIds = searchParams.get("ids");
  const requestedIds = rawIds ? new Set(rawIds.split(",").filter(Boolean)) : null;

  const settings = mapSettings(await getSettings());
  const holidays = await listHolidays();
  const machines = await listCalculatedMachines({
    settings,
    holidays,
    status: "shipped",
    shippedRetentionDays: settings.shippedRetentionDays,
  });

  const filtered = requestedIds ? machines.filter((m) => requestedIds.has(m.id)) : machines;

  const buffer = await buildShippedWorkbook(filtered);
  const filename = `despachados-${new Date().toISOString().slice(0, 10)}.xlsx`;

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
