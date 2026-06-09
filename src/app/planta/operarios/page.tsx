import Link from "next/link";
import { redirect } from "next/navigation";
import { lockFactoryAction } from "@/app/planta/actions";
import { BrandLogo } from "@/components/brand";
import { ConfigWarning } from "@/components/config-warning";
import { WorkerPicker } from "@/components/factory/worker-picker";
import { Button } from "@/components/ui/button";
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
      <header className="border-b border-[var(--xt-graphite)] bg-[var(--xt-black)] text-[var(--xt-white)]">
        <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-4">
          <BrandLogo inverse />
          <div className="flex flex-wrap gap-3">
            <Link href="/planta/tablero">
              <Button type="button" variant="secondary" size="lg">
                Ver cartelera
              </Button>
            </Link>
            <form action={lockFactoryAction}>
              <Button type="submit" variant="outline" size="lg">
                Cerrar sesión
              </Button>
            </form>
          </div>
        </div>
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
