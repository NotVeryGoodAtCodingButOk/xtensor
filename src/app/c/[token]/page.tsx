import { notFound } from "next/navigation";
import { BrandLogo } from "@/components/brand";
import { ConfigWarning } from "@/components/config-warning";
import { MachineList } from "@/components/client/machine-list";
import { RealtimeRefresh } from "@/components/realtime-refresh";
import { hasSupabaseConfig } from "@/lib/env";
import { getClientByToken } from "@/services/clients";
import { listHolidays } from "@/services/catalog";
import { calculateMachines, listClientVisibleMachines } from "@/services/machines";
import { getSettings, mapSettings } from "@/services/settings";
import { formatDateEs } from "@/services/schedule";

export default async function ClientPortalPage({ params }: { params: Promise<{ token: string }> }) {
  if (!hasSupabaseConfig()) {
    return (
      <main className="grid min-h-screen place-items-center bg-[var(--xt-paper)] p-6">
        <ConfigWarning surface="El portal del cliente" />
      </main>
    );
  }

  const { token } = await params;
  const client = await getClientByToken(token);
  if (!client) {
    notFound();
  }

  const [settingsRow, holidays, rawMachines] = await Promise.all([
    getSettings(),
    listHolidays(),
    listClientVisibleMachines(client.id),
  ]);
  const machines = calculateMachines(rawMachines, mapSettings(settingsRow), holidays);

  const totalCount = machines.length;
  const terminadasCount = machines.filter((m) => m.progressPct >= 1 || m.status === "shipped").length;
  const allDone = terminadasCount === totalCount && totalCount > 0;
  const completionPct = totalCount > 0 ? Math.round((terminadasCount / totalCount) * 100) : 0;
  // Date of last pending machine (clientEstimatedDate already includes the 3-day buffer)
  const lastDespachoDate = machines
    .filter((m) => m.progressPct < 1 && m.status !== "shipped")
    .map((m) => m.clientEstimatedDate)
    .sort()
    .at(-1);

  return (
    <main className="min-h-screen bg-[var(--xt-paper)]">
      <RealtimeRefresh channelName={`client-${client.id}`} tables={["machines", "machine_stages"]} />
      <header className="bg-[var(--xt-black)] text-[var(--xt-white)]">
        <div className="mx-auto flex max-w-4xl flex-wrap items-end justify-between gap-6 px-4 py-8">
          <div>
            <BrandLogo inverse className="mb-8" />
            <p className="xt-eyebrow text-[var(--xt-yellow)]">Portal de cliente</p>
            <h1 className="text-4xl font-bold">Hola, {client.name}</h1>
          </div>
          <div className="text-right">
            <p className="[font-family:var(--font-barlow-condensed)] text-3xl font-bold text-[var(--xt-yellow)]">
              {terminadasCount}/{totalCount} terminadas
            </p>
            <p className="[font-family:var(--font-barlow-condensed)] text-base font-medium text-[var(--xt-white)]/70">
              {completionPct}% completado
              {!allDone && lastDespachoDate && (
                <> · Construcción est. {formatDateEs(lastDespachoDate)}</>
              )}
              {allDone && <> · Pedido listo para despacho</>}
            </p>
          </div>
        </div>
        <div className="xt-hazard h-2" />
      </header>
      <div className="mx-auto max-w-4xl px-4 py-6">
        <header className="sr-only">
          <h2>Seguimiento de producción</h2>
        </header>
        <MachineList machines={machines} />
      </div>
    </main>
  );
}
