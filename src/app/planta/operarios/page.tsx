import Link from "next/link";
import { redirect } from "next/navigation";
import { lockFactoryAction, selectWorkerAction } from "@/app/planta/actions";
import { BrandLogo } from "@/components/brand";
import { ConfigWarning } from "@/components/config-warning";
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
                Ver tablero
              </Button>
            </Link>
            <form action={lockFactoryAction}>
              <Button type="submit" variant="outline" size="lg">
                Bloquear tablero
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
        <div className="grid grid-cols-2 gap-5 lg:grid-cols-3">
          {workers.map((worker) => (
            <form key={worker.id} action={selectWorkerAction}>
              <input type="hidden" name="workerId" value={worker.id} />
              <button
                type="submit"
                className="flex h-[200px] w-full flex-col justify-end border border-[var(--xt-black)] p-6 text-left text-white shadow-[var(--shadow-stamp)] transition-transform duration-200 ease-[var(--ease-snap)] active:translate-y-px active:shadow-none"
                style={{ background: worker.display_color ?? "var(--xt-black)" }}
              >
                <span className="[font-family:var(--font-barlow-condensed)] text-3xl font-bold leading-tight">{worker.full_name}</span>
                <span className="mt-2 text-lg opacity-90">{worker.role}</span>
              </button>
            </form>
          ))}
        </div>
      </section>
    </main>
  );
}
