import { redirect } from "next/navigation";
import { AlmacenManager } from "@/components/factory/almacen-manager";
import { PlantaNav } from "@/components/factory/planta-nav";
import { ConfigWarning } from "@/components/config-warning";
import { RealtimeRefresh } from "@/components/realtime-refresh";
import { hasFactoryConfig } from "@/lib/env";
import { isFactoryUnlocked } from "@/lib/factory-session";
import { listMachinePrevioRows } from "@/services/previos";

export const dynamic = "force-dynamic";

export default async function FactoryAlmacenPage() {
  if (!hasFactoryConfig()) {
    return (
      <main className="grid min-h-screen place-items-center bg-[var(--xt-paper)] p-6">
        <ConfigWarning surface="Almacén" />
      </main>
    );
  }

  if (!(await isFactoryUnlocked())) {
    redirect("/planta");
  }

  const rows = await listMachinePrevioRows();
  const machines = rows.filter((machine) => machine.status === "pending" || machine.status === "in_production");

  return (
    <main className="xt-planta xt-planta-page min-h-screen bg-[var(--xt-paper)]">
      <RealtimeRefresh
        channelName="factory-almacen"
        tables={["machine_previos", "machine_previo_events", "machines"]}
        pollMs={30_000}
      />
      <header className="xt-planta-topbar border-b border-[var(--xt-graphite)] bg-[var(--xt-black)]">
        <PlantaNav active="almacen" />
        <div className="xt-hazard h-2" />
      </header>
      <section className="xt-planta-section p-6">
        <div className="mb-5">
          <p className="xt-eyebrow">Almacén</p>
          <h1 className="text-3xl font-bold">Recibido de material</h1>
          <p className="text-sm text-[var(--xt-steel)]">
            Marca el material que va llegando: torno armado, torno ensamble, láser y cojines.
          </p>
        </div>
        <AlmacenManager machines={machines} />
      </section>
    </main>
  );
}
