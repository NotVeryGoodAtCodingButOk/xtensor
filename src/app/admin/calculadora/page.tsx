import type { Metadata } from "next";

export const metadata: Metadata = { title: "Calculadora XTENSOR" };
import { AdminShell } from "@/components/app-shell";
import { CalculatorForm } from "@/components/admin/calculator-form";
import { ConfigWarning } from "@/components/config-warning";
import { hasSupabaseConfig } from "@/lib/env";
import { listHolidays } from "@/services/catalog";
import { listCalculatedMachines } from "@/services/machines";
import { getSettings, mapSettings } from "@/services/settings";
import type { CalculatedMachineView } from "@/types/domain";

export default async function CalculadoraPage() {
  if (!hasSupabaseConfig()) {
    return (
      <AdminShell>
        <ConfigWarning surface="La calculadora" />
      </AdminShell>
    );
  }

  const settings = mapSettings(await getSettings());
  const holidays = await listHolidays();
  const machines = await listCalculatedMachines({ settings, holidays, status: "in_production" });

  const lastMachine = machines.reduce<CalculatedMachineView | null>(
    (latest, machine) => (!latest || machine.orderPosition > latest.orderPosition ? machine : latest),
    null,
  );

  return (
    <AdminShell>
      <div className="mb-5">
        <p className="xt-eyebrow">Administración</p>
        <h1 className="text-3xl font-bold">Calculadora de entrega</h1>
        <p className="text-sm text-[var(--xt-steel)]">
          Estima horas hombre y fecha de entrega de un pedido nuevo, ubicándolo al final de la cola de producción actual.
        </p>
      </div>
      <CalculatorForm
        settings={settings}
        holidays={holidays}
        baseAccumulatedHours={lastMachine?.accumulatedHours ?? 0}
        anchorSerial={lastMachine?.serialNumber ?? null}
        anchorDate={lastMachine?.estimatedDate ?? null}
      />
    </AdminShell>
  );
}
