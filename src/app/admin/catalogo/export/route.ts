import { buildCatalogWorkbook } from "@/services/excel";
import { listCatalogWithMachineTargets } from "@/services/previos";
import { requireAdmin } from "@/lib/admin-auth";

export async function GET() {
  try {
    await requireAdmin();
  } catch {
    return new Response("No autorizado.", { status: 401 });
  }

  const items = await listCatalogWithMachineTargets();

  const buffer = await buildCatalogWorkbook(
    items.map((item) => ({
      code: item.code,
      name: item.name,
      line: item.line,
      default_price_cop: item.default_price_cop,
      is_active: item.is_active,
      previos: item.previos,
    })),
  );
  const filename = `catalogo-xtensor-${new Date().toISOString().slice(0, 10)}.xlsx`;

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
