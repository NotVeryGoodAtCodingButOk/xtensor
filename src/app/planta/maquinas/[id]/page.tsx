import { redirect } from "next/navigation";
import Link from "next/link";
import { updateStageAction } from "@/app/planta/actions";
import { BrandLogo } from "@/components/brand";
import { ConfigWarning } from "@/components/config-warning";
import { QueryToast } from "@/components/ui/query-toast";
import { ReturnToWorkersBar } from "@/components/factory/return-to-workers-bar";
import { RealtimeRefresh } from "@/components/realtime-refresh";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { hasFactoryConfig } from "@/lib/env";
import { getActiveWorkerId, isFactoryUnlocked } from "@/lib/factory-session";
import { listWorkers } from "@/services/catalog";
import { getMachine } from "@/services/machines";
import type { StageView } from "@/types/domain";

export default async function FactoryMachineDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ logged?: string; toast?: string }>;
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
  const [machine, workers] = await Promise.all([getMachine(id), listWorkers(true)]);
  const worker = workers.find((item) => item.id === workerId);
  const workerColor = worker?.display_color ?? "var(--xt-black)";
  const orderedStages = [...machine.stages].sort(sortStagesForWorkers);
  const toastMessage = query.toast === "finished" ? "Máquina terminada" : null;

  return (
    <main className="min-h-screen bg-[var(--xt-paper)] pb-28">
      <QueryToast
        message={toastMessage}
        description={toastMessage ? "Todas las etapas quedaron hechas." : null}
        clearKeys={["toast"]}
      />
      <RealtimeRefresh channelName={`factory-detail-${machine.id}`} tables={["machine_stages", "colors"]} />
      <header className="mb-5 border-b border-[var(--xt-black)] bg-[var(--xt-white)]">
        <div
          className="grid items-center gap-4 border-b border-[var(--xt-graphite)] px-5 py-4 text-[var(--xt-white)] md:grid-cols-[auto_1fr_auto]"
          style={{ background: workerColor }}
        >
          <div className="flex justify-center md:justify-start">
            <BrandLogo inverse />
          </div>
          <div className="text-center">
            <p className="xt-eyebrow text-white/80">Operario activo</p>
            <h1 className="text-3xl font-bold leading-none md:text-4xl">{worker?.full_name ?? "Operario"}</h1>
          </div>
          <Button
            asChild
            variant="outline"
            size="lg"
            className="justify-self-center border-[var(--xt-black)] bg-[var(--xt-yellow)] text-[var(--xt-black)] hover:bg-[var(--xt-yellow-deep)] md:justify-self-end"
          >
            <Link href="/planta/maquinas">Volver a máquinas</Link>
          </Button>
        </div>
        <div className="xt-hazard h-2" />
        <div className="grid gap-4 px-5 py-6 text-center">
          <div className="grid gap-1">
            <p className="xt-eyebrow">Detalle de máquina</p>
            <p className="text-lg text-[var(--xt-steel)]">
              COTI {machine.cotiNumber} · {machine.clientName} · {machine.city ?? "Sin ciudad"} · {machine.colorName ?? "Sin color"}
            </p>
          </div>
          <h2 className="[font-family:var(--font-barlow-condensed)] text-5xl font-bold leading-none md:text-7xl">
            {machine.equipmentName}
          </h2>
          <p className="[font-family:var(--font-barlow-condensed)] text-2xl font-bold">
            {machine.stages.filter((stage) => stage.completion === 100).length} de {machine.stages.length} tareas hechas
          </p>
        </div>
      </header>

      <div className="grid gap-4 px-5 md:grid-cols-2 xl:grid-cols-3">
        {orderedStages.map((stage) => {
          const isDone = stage.completion === 100;

          return (
          <Card
            key={stage.id}
            className={isDone ? "border-[#bfd8c0] bg-[#eef8ee]" : "border-[var(--xt-black)] bg-[var(--xt-white)]"}
          >
            <div className="grid min-h-[210px] gap-4 p-5">
              <div>
                <p className="xt-eyebrow">{isDone ? "Hecha" : "Pendiente"}</p>
                <h2 className="[font-family:var(--font-barlow-condensed)] text-5xl font-bold leading-none">
                  {stage.name}
                </h2>
              </div>
              <p className="text-sm text-[var(--xt-steel)]">
                Último cambio: {stage.lastWorkerName ?? "Sin registro"}
                {stage.lastUpdatedAt ? ` · ${stage.lastUpdatedAt.slice(0, 16).replace("T", " ")}` : ""}
              </p>
              <form action={updateStageAction} className="self-end">
                <input type="hidden" name="machineId" value={machine.id} />
                <input type="hidden" name="stageId" value={stage.id} />
                <input type="hidden" name="completion" value={isDone ? 0 : 100} />
                <Button type="submit" size="touch" variant={isDone ? "outline" : "default"} className="w-full">
                  {isDone ? "Marcar pendiente" : "Marcar como hecha"}
                </Button>
              </form>
            </div>
          </Card>
          );
        })}
      </div>
      {query.logged ? <ReturnToWorkersBar continueHref={`/planta/maquinas/${machine.id}`} /> : null}
    </main>
  );
}

function sortStagesForWorkers(a: StageView, b: StageView) {
  const aDone = a.completion === 100;
  const bDone = b.completion === 100;

  if (aDone !== bDone) {
    return aDone ? 1 : -1;
  }

  return a.id - b.id;
}
