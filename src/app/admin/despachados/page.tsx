import type { Metadata } from "next";
import { AdminShell } from "@/components/app-shell";
import { ConfigWarning } from "@/components/config-warning";
import { ProductionTable } from "@/components/admin/production-table";

export const metadata: Metadata = { title: "Despachados XTENSOR" };
import { hasSupabaseConfig } from "@/lib/env";
import { listHolidays } from "@/services/catalog";
import { listCalculatedMachines } from "@/services/machines";
import { getSettings, mapSettings } from "@/services/settings";

export default async function ShippedPage() {
  if (!hasSupabaseConfig()) {
    return (
      <AdminShell>
        <ConfigWarning surface="Despachados" />
      </AdminShell>
    );
  }

  const settings = mapSettings(await getSettings());
  const holidays = await listHolidays();
  const machines = await listCalculatedMachines({
    settings,
    holidays,
    status: "shipped",
    shippedRetentionDays: settings.shippedRetentionDays,
  });

  return (
    <AdminShell>
      <div className="mb-5">
        <p className="xt-eyebrow">Administración</p>
        <h1 className="text-3xl font-bold">Despachados</h1>
        <p className="text-sm text-[var(--xt-steel)]">
          Histórico de despachos recientes. Se muestran los últimos {settings.shippedRetentionDays} días.
        </p>
      </div>
      <ProductionTable machines={machines} shipped />
    </AdminShell>
  );
}
