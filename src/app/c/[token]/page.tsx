import { notFound } from "next/navigation";
import { BrandLogo } from "@/components/brand";
import { ConfigWarning } from "@/components/config-warning";
import { MachineRow } from "@/components/client/machine-row";
import { RealtimeRefresh } from "@/components/realtime-refresh";
import { hasSupabaseConfig } from "@/lib/env";
import { getClientByToken } from "@/services/clients";
import { listHolidays } from "@/services/catalog";
import { calculateMachines, listClientVisibleMachines } from "@/services/machines";
import { getSettings, mapSettings } from "@/services/settings";

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
          <p className="[font-family:var(--font-barlow-condensed)] text-2xl font-bold text-[var(--xt-yellow)]">
            {machines.filter((machine) => machine.status === "in_production").length} máquinas en producción
          </p>
        </div>
        <div className="xt-hazard h-2" />
      </header>
      <div className="mx-auto grid max-w-4xl gap-2 px-4 py-6">
        <header className="sr-only">
          <h2>Seguimiento de producción</h2>
        </header>
        {machines.map((machine) => (
          <MachineRow key={machine.id} machine={machine} />
        ))}
      </div>
    </main>
  );
}
