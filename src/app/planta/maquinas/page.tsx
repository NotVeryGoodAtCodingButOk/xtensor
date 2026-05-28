import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { changeWorkerAction, lockFactoryAction } from "@/app/planta/actions";
import { BrandLogo } from "@/components/brand";
import { ConfigWarning } from "@/components/config-warning";
import { RealtimeRefresh } from "@/components/realtime-refresh";
import { StageStrip } from "@/components/factory/stage-strip";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { hasFactoryConfig } from "@/lib/env";
import { getActiveWorkerId, isFactoryUnlocked } from "@/lib/factory-session";
import { formatPercent } from "@/lib/utils";
import { listHolidays, listWorkers } from "@/services/catalog";
import { listCalculatedMachines } from "@/services/machines";
import { getSettings, mapSettings } from "@/services/settings";

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

  return (
    <main className="min-h-screen bg-[var(--xt-paper)]">
      <RealtimeRefresh channelName="factory-list" tables={["machines", "machine_stages"]} />
      <header className="sticky top-0 z-10 border-b border-[var(--xt-graphite)] bg-[var(--xt-black)] text-[var(--xt-white)]">
        <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-4">
          <div className="flex items-center gap-5">
            <BrandLogo inverse />
            <div className="border-l border-[var(--xt-yellow)] pl-4">
              <p className="xt-eyebrow text-[var(--xt-yellow)]">Operario activo</p>
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
                Bloquear
              </Button>
            </form>
          </div>
        </div>
        <div className="xt-hazard h-2" />
      </header>

      <div className="grid gap-2 p-5">
        {machines.map((machine) => (
          <Link
            key={machine.id}
            href={`/planta/maquinas/${machine.id}`}
            className="block border border-[var(--xt-black)] bg-[var(--xt-white)] shadow-[var(--shadow-sm)] transition-colors hover:bg-[var(--xt-yellow-soft)]"
          >
            {/* Main row */}
            <div className="flex items-center gap-4 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">
                  COTI {machine.cotiNumber} · {machine.equipmentCode ?? "Personalizado"} · {machine.equipmentName}
                </p>
                <p className="truncate text-sm text-[var(--xt-steel)]">
                  {machine.clientName} · {machine.colorName ?? "Sin color"}
                </p>
              </div>

              {/* Progress bar — fixed width so all bars align */}
              <div className="hidden w-[220px] shrink-0 sm:block">
                <div className="mb-1 flex justify-between text-xs text-[var(--xt-steel)]">
                  <span>Avance</span>
                  <span>{formatPercent(machine.progressPct)}</span>
                </div>
                <Progress value={machine.progressPct} className="h-2" />
              </div>

              {/* % on mobile */}
              <span className="[font-family:var(--font-barlow-condensed)] shrink-0 text-base font-bold sm:hidden">
                {formatPercent(machine.progressPct)}
              </span>

              <ChevronRight className="h-4 w-4 shrink-0 text-[var(--xt-steel)]" />
            </div>

            {/* Mobile: bar */}
            <div className="px-4 pb-2 sm:hidden">
              <Progress value={machine.progressPct} className="h-2" />
            </div>

            {/* Stage strip — always visible */}
            <div className="border-t border-[var(--xt-cement)] px-4 py-2">
              <StageStrip stages={machine.stages} />
            </div>
          </Link>
        ))}
      </div>
    </main>
  );
}
