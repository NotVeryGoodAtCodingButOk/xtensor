import { AdminShell } from "@/components/app-shell";
import { ConfigWarning } from "@/components/config-warning";
import { ExcelImportManager } from "@/components/admin/excel-import-manager";
import { hasSupabaseConfig } from "@/lib/env";
import { listCatalog, listHolidays } from "@/services/catalog";
import { listCalculatedMachines } from "@/services/machines";
import { getSettings, mapSettings } from "@/services/settings";

export default async function ImportQuotePage() {
  if (!hasSupabaseConfig()) {
    return (
      <AdminShell>
        <ConfigWarning surface="Importar cotización" />
      </AdminShell>
    );
  }

  const settings = mapSettings(await getSettings());
  const [catalog, holidays] = await Promise.all([listCatalog(), listHolidays()]);
  const machines = await listCalculatedMachines({ settings, holidays, status: "in_production" });

  const queueEndDate =
    machines.reduce<string | null>((latest, machine) => {
      if (!machine.estimatedDate) return latest;
      return !latest || machine.estimatedDate > latest ? machine.estimatedDate : latest;
    }, null) ?? new Date().toISOString().slice(0, 10);

  const catalogOptions = catalog
    .filter((item) => item.is_active)
    .map((item) => ({ id: item.id, code: item.code, name: item.name }));

  return (
    <AdminShell>
      <ExcelImportManager catalog={catalogOptions} queueEndDate={queueEndDate} />
    </AdminShell>
  );
}
