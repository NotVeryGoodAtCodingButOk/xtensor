import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { changeWorkerAction, lockFactoryAction } from "@/app/planta/actions";
import { BrandLogo } from "@/components/brand";
import { ConfigWarning } from "@/components/config-warning";
import { RealtimeRefresh } from "@/components/realtime-refresh";
import { StageStrip } from "@/components/factory/stage-strip";
import { Button } from "@/components/ui/button";
import { getFactorySharedData } from "@/lib/factory-cache";
import { hasFactoryConfig } from "@/lib/env";
import { getActiveWorkerId, isFactoryUnlocked } from "@/lib/factory-session";
import type { CalculatedMachineView } from "@/types/domain";

export default async function FactoryMachinesPage({
  searchParams,
}: {
  searchParams: Promise<{ workerId?: string }>;
}) {
  if (!hasFactoryConfig()) {
    return (
      <main className="grid min-h-screen place-items-center bg-[var(--xt-paper)] p-6">
        <ConfigWarning surface="Lista de máquinas" />
      </main>
    );
  }

  if (!(await isFactoryUnlocked())) {
    redirect("/planta");
  }

  const [{ workerId: workerIdFromQuery }, cookieWorkerId, shared] = await Promise.all([
    searchParams,
    getActiveWorkerId(),
    getFactorySharedData(),
  ]);
  const workerId = cookieWorkerId ?? workerIdFromQuery ?? null;
  if (!workerId) {
    redirect("/planta/operarios");
  }

  const worker = shared.workers.find((item) => item.id === workerId);
  if (!worker) {
    redirect("/planta/operarios?error=operario");
  }

  const machines = shared.machines;
  const orderedMachines = [...machines].sort(sortMachinesForWorkers);
  const workerColor = worker?.display_color ?? "var(--xt-black)";
  const workerHeaderBackground = `linear-gradient(rgba(10, 10, 10, 0.42), rgba(10, 10, 10, 0.42)), ${workerColor}`;
  const workerQuery = cookieWorkerId ? "" : `?workerId=${workerId}`;
  const navButtonClass = "min-h-11 px-4 text-sm text-white hover:text-white hover:bg-white/20";

  return (
    <main className="min-h-screen bg-[var(--xt-paper)]">
      <RealtimeRefresh channelName="factory-list" tables={["machines", "machine_stages", "colors"]} />
      <header className="sticky top-0 z-10 border-b border-[var(--xt-graphite)]">
        <div
          className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-[var(--xt-white)]"
          style={{ background: workerHeaderBackground }}
        >
          <div className="flex min-w-0 items-center gap-4">
            <BrandLogo inverse />
            <div className="min-w-0 border-l border-white/40 pl-4">
              <p className="xt-eyebrow xt-eyebrow-light leading-none mb-0.5">Operario activo</p>
              <h1 className="truncate text-lg font-bold leading-none">{worker?.full_name ?? "Operario"}</h1>
            </div>
          </div>
          <nav className="flex w-full flex-wrap items-center gap-2 lg:w-auto lg:justify-end">
            <Button asChild variant="ghost" size="sm" className={navButtonClass}>
              <Link href="/planta/operarios">Operarios</Link>
            </Button>
            <Button asChild variant="ghost" size="sm" className={navButtonClass}>
              <Link href="/planta/tablero">Cartelera</Link>
            </Button>
            <form action={changeWorkerAction}>
              <Button type="submit" variant="ghost" size="sm" className={navButtonClass}>
                Cambiar operario
              </Button>
            </form>
            <form action={lockFactoryAction}>
              <Button
                type="submit"
                variant="outline"
                size="sm"
                className="min-h-11 border-white/30 bg-transparent px-4 text-sm text-white hover:bg-white/10 hover:text-white"
              >
                Cerrar sesión
              </Button>
            </form>
          </nav>
        </div>
        <div className="xt-hazard h-2" />
      </header>

      {orderedMachines.length === 0 ? (
        <section className="grid min-h-[calc(100vh-7rem)] place-items-center px-5 py-12 text-center">
          <div className="max-w-xl">
            <p className="xt-eyebrow">Producción</p>
            <h2 className="[font-family:var(--font-barlow-condensed)] text-5xl font-bold leading-none">
              No hay máquinas en producción.
            </h2>
            <p className="mt-3 text-lg text-[var(--xt-steel)]">
              Cuando una máquina pase de previos a producción aparecerá aquí para registrar tareas.
            </p>
          </div>
        </section>
      ) : (
        <div className="grid gap-4 p-5 xl:grid-cols-2 2xl:grid-cols-3">
          {orderedMachines.map((machine) => {
            const completedStages = machine.stages.filter((stage) => stage.completion === 100).length;
            const totalStages = machine.stages.length;
            const isComplete = totalStages > 0 && completedStages === totalStages;
            const isStarted = machine.stages.some((stage) => stage.completion > 0) && !isComplete;

            return (
              <Link
                key={machine.id}
                href={`/planta/maquinas/${machine.id}${workerQuery}`}
                className="flex min-h-[230px] flex-col border border-[var(--xt-black)] bg-[var(--xt-white)] shadow-[var(--shadow-sm)] transition-colors hover:bg-[var(--xt-yellow-soft)]"
              >
                <div className="flex flex-1 flex-col gap-4 p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="[font-family:var(--font-barlow-condensed)] text-4xl font-bold leading-none break-words">
                        {machine.equipmentName}
                      </h2>
                    </div>
                    <ChevronRight className="mt-2 h-6 w-6 shrink-0 text-[var(--xt-steel)]" />
                  </div>

                  <div className="grid gap-1 text-base text-[var(--xt-steel)]">
                    <p className="truncate">
                      {machine.clientName} · {machine.colorName ?? "Sin color"}
                    </p>
                    <p className="truncate">
                      PLACA {machine.placaNumber} · {machine.equipmentCode ?? "Personalizado"}
                    </p>
                  </div>

                  <div className="[font-family:var(--font-barlow-condensed)] text-xl font-bold">
                    {isComplete ? "Terminada" : isStarted ? `${completedStages} de ${totalStages} tareas listas` : "Sin iniciar"}
                  </div>
                </div>

                <div className="border-t border-[var(--xt-cement)] px-5 py-3">
                  <StageStrip stages={machine.stages} />
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </main>
  );
}

function sortMachinesForWorkers(a: CalculatedMachineView, b: CalculatedMachineView) {
  const aGroup = getWorkerSortGroup(a);
  const bGroup = getWorkerSortGroup(b);

  if (aGroup !== bGroup) {
    return aGroup - bGroup;
  }

  if (aGroup === 0 && a.progressPct !== b.progressPct) {
    return b.progressPct - a.progressPct;
  }

  return a.orderPosition - b.orderPosition;
}

function getWorkerSortGroup(machine: CalculatedMachineView) {
  if (machine.progressPct >= 1) {
    return 2;
  }

  if (machine.progressPct > 0) {
    return 0;
  }

  return 1;
}
