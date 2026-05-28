import Link from "next/link";
import { redirect } from "next/navigation";
import { changeWorkerAction, lockFactoryAction } from "@/app/planta/actions";
import { BrandLogo } from "@/components/brand";
import { ConfigWarning } from "@/components/config-warning";
import { RealtimeRefresh } from "@/components/realtime-refresh";
import { StageStrip } from "@/components/factory/stage-strip";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
      <div className="grid gap-4 p-5">
        {machines.map((machine) => (
          <Link key={machine.id} href={`/planta/maquinas/${machine.id}`}>
            <Card className="transition-colors hover:border-[var(--xt-black)] hover:bg-[var(--xt-yellow-soft)]">
              <CardContent className="grid gap-3 p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="[font-family:var(--font-barlow-condensed)] text-2xl font-bold">
                      COTI {machine.cotiNumber} · {machine.equipmentCode ?? "Personalizado"}
                    </p>
                    <p className="text-lg">{machine.equipmentName}</p>
                    <p className="text-[var(--xt-steel)]">
                      {machine.clientName} · {machine.colorName ?? "Sin color"}
                    </p>
                  </div>
                  <div className="min-w-40 text-right [font-family:var(--font-barlow-condensed)] text-2xl font-bold">{formatPercent(machine.progressPct)}</div>
                </div>
                <Progress value={machine.progressPct} className="h-4" />
                <StageStrip stages={machine.stages} />
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </main>
  );
}
