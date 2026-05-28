import Link from "next/link";
import { Plus } from "lucide-react";
import { AdminShell } from "@/components/app-shell";
import { ConfigWarning } from "@/components/config-warning";
import { ProductionTable } from "@/components/admin/production-table";
import { RealtimeRefresh } from "@/components/realtime-refresh";
import { Button } from "@/components/ui/button";
import { hasSupabaseConfig } from "@/lib/env";
import { listHolidays } from "@/services/catalog";
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
  const holidays = await listHolidays();
  const machines = await listCalculatedMachines({ settings, holidays, status: "in_production" });

  return (
    <AdminShell>
      <RealtimeRefresh channelName="admin-dashboard" tables={["machines", "machine_stages", "stage_logs"]} />
      <div className="mb-5 flex items-center justify-between gap-4">
        <div>
          <p className="xt-eyebrow">Administración</p>
          <h1 className="text-3xl font-bold">Plan de producción</h1>
          <p className="text-sm text-[var(--xt-steel)]">Vista densa equivalente a la planilla actual.</p>
        </div>
        <Button asChild>
          <Link href="/admin/maquinas/nueva">
            <Plus className="h-4 w-4" />
            Agregar máquina
          </Link>
        </Button>
      </div>
      <ProductionTable machines={machines} />
    </AdminShell>
  );
}
