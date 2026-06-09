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
import { getFactorySharedData } from "@/lib/factory-cache";
import { hasFactoryConfig } from "@/lib/env";
import { getActiveWorkerId, isFactoryUnlocked } from "@/lib/factory-session";
import { getMachine } from "@/services/machines";
import type { StageView } from "@/types/domain";

export default async function FactoryMachineDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ logged?: string; toast?: string; workerId?: string }>;
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

  const [{ id }, query, cookieWorkerId, shared] = await Promise.all([
    params,
    searchParams,
    getActiveWorkerId(),
    getFactorySharedData(),
  ]);
  const resolvedWorkerId = cookieWorkerId ?? query.workerId ?? null;
  if (!resolvedWorkerId) {
    redirect("/planta/operarios");
  }

  const machine = await getMachine(id);
  const worker = shared.workers.find((item) => item.id === resolvedWorkerId);
  if (!worker) {
    redirect("/planta/operarios?error=operario");
  }
  const workerColor = worker?.display_color ?? "var(--xt-black)";
  const orderedStages = [...machine.stages].sort(sortStagesForWorkers);
  const toastMessage = query.toast === "finished" ? "Máquina terminada" : null;
  const workerQuery = cookieWorkerId ? "" : `?workerId=${resolvedWorkerId}`;

  return (
    <main className="min-h-screen bg-[var(--xt-paper)] pb-28">
      <QueryToast
        message={toastMessage}
        description={toastMessage ? "Todas las etapas quedaron hechas." : null}
        clearKeys={["toast"]}
      />
      <RealtimeRefresh channelName={`factory-detail-${machine.id}`} tables={["machine_stages", "colors"]} />
      <header className="mb-5 border-b border-[var(--xt-black)]">
        <div
          className="px-5 py-3 text-[var(--xt-white)]"
          style={{ background: workerColor }}
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-4">
              <BrandLogo inverse />
              <div>
                <p className="xt-eyebrow text-white/70 leading-none mb-0.5">Operario activo</p>
                <p className="font-bold leading-none text-lg">{worker?.full_name ?? "Operario"}</p>
              </div>
            </div>
            <nav className="flex flex-wrap items-center gap-2">
              <Button asChild variant="ghost" size="sm" className="text-white hover:text-white hover:bg-white/20">
                <Link href="/planta/operarios">Operarios</Link>
              </Button>
              <Button asChild variant="ghost" size="sm" className="text-white hover:text-white hover:bg-white/20">
                <Link href="/planta/tablero">Cartelera</Link>
              </Button>
              <Button
                asChild
                variant="outline"
                size="sm"
                className="border-[var(--xt-black)] bg-[var(--xt-yellow)] text-[var(--xt-black)] hover:bg-[var(--xt-yellow-deep)]"
              >
                <Link href={`/planta/maquinas${workerQuery}`}>Volver a máquinas</Link>
              </Button>
            </nav>
          </div>
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
                  {isDone ? "Reproceso" : "Marcar como hecha"}
                </Button>
              </form>
            </div>
          </Card>
          );
        })}
      </div>
      {query.logged ? <ReturnToWorkersBar continueHref={`/planta/maquinas/${machine.id}${workerQuery}`} /> : null}
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
