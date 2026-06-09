import { redirect } from "next/navigation";
import { ConfigWarning } from "@/components/config-warning";
import { PlantaNav } from "@/components/factory/planta-nav";
import { WorkerPicker } from "@/components/factory/worker-picker";
import { hasFactoryConfig } from "@/lib/env";
import { isFactoryUnlocked } from "@/lib/factory-session";
import { listWorkers } from "@/services/catalog";

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

  const workers = await listWorkers(true);

  return (
    <main className="min-h-screen bg-[var(--xt-paper)]">
      <header className="border-b border-[var(--xt-graphite)] bg-[var(--xt-black)]">
        <PlantaNav active="operarios" />
        <div className="xt-hazard h-2" />
      </header>
      <section className="p-6">
        <div className="mb-6">
          <p className="xt-eyebrow">Operarios</p>
          <h1 className="text-4xl font-bold">¿Quién eres?</h1>
        </div>
        <WorkerPicker workers={workers} />
      </section>
    </main>
  );
}
