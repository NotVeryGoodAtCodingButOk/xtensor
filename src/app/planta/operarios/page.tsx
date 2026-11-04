import { redirect } from "next/navigation";
import { ConfigWarning } from "@/components/config-warning";
import { PlantaNav } from "@/components/factory/planta-nav";
import { WorkerPicker } from "@/components/factory/worker-picker";
import { hasFactoryConfig } from "@/lib/env";
import { isFactoryUnlocked } from "@/lib/factory-session";
import { listWorkers } from "@/services/catalog";
import { listOpenSessions } from "@/services/work-sessions";

export default async function FactoryWorkersPage() {
  if (!hasFactoryConfig()) {
    return (
      <main className="grid min-h-screen place-items-center bg-[var(--xt-paper)] p-6">
        <ConfigWarning surface="Selección de operario" />
      </main>
    );
  }

  if (!(await isFactoryUnlocked())) {
    redirect("/planta");
  }

  const [workers, openSessions] = await Promise.all([listWorkers(true), listOpenSessions()]);

  return (
    <main className="xt-planta xt-planta-page min-h-screen bg-[var(--xt-paper)]">
      <header className="xt-planta-topbar border-b border-[var(--xt-graphite)] bg-[var(--xt-black)]">
        <PlantaNav active="operarios" />
        <div className="xt-hazard h-2" />
      </header>
      <section className="xt-planta-section p-6">
        {/* Solo los campos de la tarjeta: las filas de workers traen hourly_cost_cop (salario). */}
        <WorkerPicker
          workers={workers.map((worker) => ({
            id: worker.id,
            full_name: worker.full_name,
            role: worker.role,
            display_color: worker.display_color,
          }))}
          openSessions={openSessions}
        />
      </section>
    </main>
  );
}
