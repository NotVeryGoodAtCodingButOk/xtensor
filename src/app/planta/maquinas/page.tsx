import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { changeWorkerAction, lockFactoryAction } from "@/app/planta/actions";
import { BrandLogo } from "@/components/brand";
import { ConfigWarning } from "@/components/config-warning";
import { RealtimeRefresh } from "@/components/realtime-refresh";
import { StageStrip } from "@/components/factory/stage-strip";
import { Button } from "@/components/ui/button";
import { hasFactoryConfig } from "@/lib/env";
import { getActiveWorkerId, isFactoryUnlocked } from "@/lib/factory-session";
import { listHolidays, listWorkers } from "@/services/catalog";
import { listCalculatedMachines } from "@/services/machines";
import { getSettings, mapSettings } from "@/services/settings";
import type { CalculatedMachineView } from "@/types/domain";

export default async function FactoryMachinesPage() {
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

  const workerId = await getActiveWorkerId();
  if (!workerId) {
    redirect("/planta/operarios");
  }

  const [settingsRow, holidays, workers] = await Promise.all([getSettings(), listHolidays(), listWorkers(true)]);
  const worker = workers.find((item) => item.id === workerId);
  const machines = await listCalculatedMachines({
    settings: mapSettings(settingsRow),
    holidays,
    status: "in_production",
  });
  const orderedMachines = [...machines].sort(sortMachinesForWorkers);
  const workerColor = worker?.display_color ?? "var(--xt-black)";

  return (
    <main className="min-h-screen bg-[var(--xt-paper)]">
      <RealtimeRefresh channelName="factory-list" tables={["machines", "machine_stages", "colors"]} />
      <header
        className="sticky top-0 z-10 border-b border-[var(--xt-graphite)] text-[var(--xt-white)]"
        style={{ background: workerColor }}
      >
        <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-4">
          <div className="flex items-center gap-5">
            <BrandLogo inverse />
            <div className="border-l border-white/60 pl-4">
              <p className="xt-eyebrow text-white/80">Operario activo</p>
              <h1 className="text-2xl font-bold">{worker?.full_name ?? "Operario"}</h1>
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            <form action={changeWorkerAction}>
              <Button type="submit" variant="outline" size="lg">
                Cambiar de operario
              </Button>
            </form>
            <form action={lockFactoryAction}>
              <Button type="submit" variant="secondary" size="lg">
                Cerrar sesión
              </Button>
            </form>
          </div>
        </div>
        <div className="xt-hazard h-2" />
      </header>

      <div className="grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-3">
        {orderedMachines.map((machine) => {
          const completedStages = machine.stages.filter((stage) => stage.completion === 100).length;
          const totalStages = machine.stages.length;
          const isComplete = totalStages > 0 && completedStages === totalStages;
          const isStarted = machine.stages.some((stage) => stage.completion > 0) && !isComplete;

          return (
          <Link
            key={machine.id}
            href={`/planta/maquinas/${machine.id}`}
            className="flex min-h-[230px] flex-col border border-[var(--xt-black)] bg-[var(--xt-white)] shadow-[var(--shadow-sm)] transition-colors hover:bg-[var(--xt-yellow-soft)]"
          >
            <div className="flex flex-1 flex-col gap-4 p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="xt-eyebrow">COTI {machine.cotiNumber}</p>
                  <h2 className="[font-family:var(--font-barlow-condensed)] text-4xl font-bold leading-none">
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
                  COTI {machine.cotiNumber} · {machine.equipmentCode ?? "Personalizado"} · {machine.equipmentName}
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
