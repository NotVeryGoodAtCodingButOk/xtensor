import { redirect } from "next/navigation";
import Link from "next/link";
import { undoStageAction, updateStageAction } from "@/app/planta/actions";
import { BrandLogo } from "@/components/brand";
import { ConfigWarning } from "@/components/config-warning";
import { RealtimeRefresh } from "@/components/realtime-refresh";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { hasFactoryConfig } from "@/lib/env";
import { getActiveWorkerId, isFactoryUnlocked } from "@/lib/factory-session";
import { formatPercent } from "@/lib/utils";
import { getMachine } from "@/services/machines";

export default async function FactoryMachineDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ log?: string }>;
}) {
  if (!hasFactoryConfig()) {
    return (
      <main className="grid min-h-screen place-items-center bg-[var(--xt-paper)] p-6">
        <ConfigWarning surface="Detalle de máquina" />
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

  const [{ id }, query] = await Promise.all([params, searchParams]);
  const machine = await getMachine(id);
  const progressPct = machine.stages.reduce((total, stage, index, stages) => {
    const previous = index === 0 ? 0 : stages[index - 1].completionPercentage;
    return total + (stage.completionPercentage - previous) * (stage.completion / 100);
  }, 0) / 100;

  return (
    <main className="min-h-screen bg-[var(--xt-paper)] pb-28">
      <RealtimeRefresh channelName={`factory-detail-${machine.id}`} tables={["machine_stages"]} />
      <header className="mb-5 border-b border-[var(--xt-black)] bg-[var(--xt-white)]">
        <div className="border-b border-[var(--xt-graphite)] bg-[var(--xt-black)] px-5 py-4 text-[var(--xt-white)]">
          <BrandLogo inverse />
        </div>
        <div className="xt-hazard h-2" />
        <div className="p-5">
          <div className="mb-3 flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="xt-eyebrow">Detalle de máquina</p>
              <h1 className="text-3xl font-bold">
              COTI {machine.cotiNumber} · {machine.equipmentName}
              </h1>
              <p className="text-lg text-[var(--xt-steel)]">
              {machine.clientName} · {machine.city ?? "Sin ciudad"} · {machine.colorName ?? "Sin color"}
              </p>
            </div>
            <Button asChild variant="outline" size="lg">
              <Link href="/planta/maquinas">Volver a la lista</Link>
            </Button>
          </div>
          <Progress value={progressPct} className="h-5" />
          <p className="mt-2 [font-family:var(--font-barlow-condensed)] text-2xl font-bold">{formatPercent(progressPct)}</p>
        </div>
      </header>
      <div className="grid gap-4 px-5">
        {machine.stages.map((stage) => (
          <Card key={stage.id}>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>{stage.name}</span>
                <span>{stage.completion}%</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Progress value={stage.completion / 100} className="mb-4 h-4" />
              <p className="mb-4 text-sm text-[var(--xt-steel)]">
                Último cambio: {stage.lastWorkerName ?? "Sin registro"}
                {stage.lastUpdatedAt ? ` · ${stage.lastUpdatedAt.slice(0, 16).replace("T", " ")}` : ""}
              </p>
              <div className="grid grid-cols-5 gap-3">
                {[0, 25, 50, 75, 100].map((completion) => (
                  <form key={completion} action={updateStageAction}>
                    <input type="hidden" name="machineId" value={machine.id} />
                    <input type="hidden" name="stageId" value={stage.id} />
                    <input type="hidden" name="completion" value={completion} />
                    <Button type="submit" size="touch" variant={completion === stage.completion ? "default" : "outline"} className="w-full">
                      {completion} %
                    </Button>
                  </form>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      {query.log ? (
        <div className="fixed inset-x-5 bottom-5 border border-[var(--xt-yellow)] bg-[var(--xt-black)] p-4 text-white shadow-lg">
          <form action={undoStageAction} className="flex items-center justify-between gap-4">
            <input type="hidden" name="machineId" value={machine.id} />
            <input type="hidden" name="logId" value={query.log} />
            <span>Acción registrada. Puedes deshacerla ahora.</span>
            <Button type="submit" variant="secondary">
              Deshacer
            </Button>
          </form>
        </div>
      ) : null}
    </main>
  );
}
