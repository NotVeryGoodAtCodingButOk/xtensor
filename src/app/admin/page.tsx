import type { Metadata } from "next";
import { Download } from "lucide-react";

export const metadata: Metadata = { title: "Producción XTENSOR" };
import { AdminShell } from "@/components/app-shell";
import { ConfigWarning } from "@/components/config-warning";
import { ProductionTablePanel } from "@/components/admin/production-table-panel";
import { RealtimeRefresh } from "@/components/realtime-refresh";
import { Button } from "@/components/ui/button";
import { ActionTooltip } from "@/components/ui/tooltip";
import { hasSupabaseConfig } from "@/lib/env";
import { listColors, listHolidays } from "@/services/catalog";
import { listCalculatedMachines } from "@/services/machines";
import { getSettings, mapSettings } from "@/services/settings";

export default async function AdminDashboardPage() {
  if (!hasSupabaseConfig()) {
    return (
      <AdminShell>
        <ConfigWarning surface="El tablero administrativo" />
      </AdminShell>
    );
  }

  const settings = mapSettings(await getSettings());
  const [holidays, colors] = await Promise.all([listHolidays(), listColors()]);
  const machines = await listCalculatedMachines({ settings, holidays, status: "in_production" });

  return (
    <AdminShell>
      <RealtimeRefresh channelName="admin-dashboard" tables={["machines", "machine_stages", "stage_logs", "colors"]} />
      <div className="mb-5 flex items-center justify-between gap-4">
        <div>
          <p className="xt-eyebrow">Administración</p>
          <h1 className="text-3xl font-bold">Plan de producción</h1>
          <p className="text-sm text-[var(--xt-steel)]">Vista densa equivalente a la planilla actual.</p>
        </div>
        <div className="flex items-center gap-2">
          <ActionTooltip text="Descarga la vista actual de producción en Excel.">
            <Button asChild variant="outline">
              <a href="/admin/export">
                <Download className="h-4 w-4" />
                Exportar Excel
              </a>
            </Button>
          </ActionTooltip>
        </div>
      </div>
      <ProductionTablePanel machines={machines} colors={colors} />
    </AdminShell>
  );
}
