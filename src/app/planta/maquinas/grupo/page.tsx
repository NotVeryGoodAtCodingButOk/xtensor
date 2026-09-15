import { redirect } from "next/navigation";
import Link from "next/link";
import { BrandLogo } from "@/components/brand";
import { ConfigWarning } from "@/components/config-warning";
import { ActiveSessionBar } from "@/components/factory/active-session-bar";
import { TaskGrid } from "@/components/factory/task-grid";
import { RealtimeRefresh } from "@/components/realtime-refresh";
import { Button } from "@/components/ui/button";
import { getFactorySharedData } from "@/lib/factory-cache";
import { hasFactoryConfig } from "@/lib/env";
import { getActiveWorkerId, isFactoryUnlocked } from "@/lib/factory-session";
import { getOpenSession } from "@/services/work-sessions";

export default async function FactoryMachineGroupPage({
  searchParams,
}: {
  searchParams: Promise<{ ids?: string; workerId?: string }>;
}) {
  if (!hasFactoryConfig()) {
    return (
      <main className="grid min-h-screen place-items-center bg-[var(--xt-paper)] p-6">
        <ConfigWarning surface="Grupo de máquinas" />
      </main>
    );
  }

  if (!(await isFactoryUnlocked())) {
    redirect("/planta");
  }

  const [query, cookieWorkerId, shared] = await Promise.all([
    searchParams,
    getActiveWorkerId(),
    getFactorySharedData(),
  ]);
  const resolvedWorkerId = cookieWorkerId ?? query.workerId ?? null;
  if (!resolvedWorkerId) {
    redirect("/planta/operarios");
  }

  const worker = shared.workers.find((item) => item.id === resolvedWorkerId);
  if (!worker) {
    redirect("/planta/operarios?error=operario");
  }

  const workerQuery = cookieWorkerId ? "" : `?workerId=${resolvedWorkerId}`;
  const requestedIds = [...new Set((query.ids ?? "").split(",").map((id) => id.trim()).filter(Boolean))];
  const machinesById = new Map(shared.machines.map((machine) => [machine.id, machine]));
  const groupMachines = requestedIds
    .map((id) => machinesById.get(id))
    .filter((machine): machine is (typeof shared.machines)[number] => Boolean(machine));

  // No valid machine ids (stale link, or none are in production anymore): bounce back to the list.
  if (groupMachines.length === 0) {
    redirect(`/planta/maquinas${workerQuery}`);
  }

  const openSession = await getOpenSession(resolvedWorkerId);
  const workerColor = worker?.display_color ?? "var(--xt-black)";
  const workerHeaderBackground = `linear-gradient(rgba(10, 10, 10, 0.42), rgba(10, 10, 10, 0.42)), ${workerColor}`;
  const navButtonClass = "min-h-11 px-4 text-sm text-white hover:text-white hover:bg-white/20";
  const continueHref = `/planta/maquinas${workerQuery}`;

  return (
    <main className="xt-planta xt-planta-page xt-machine-detail min-h-screen bg-[var(--xt-paper)] pb-28">
      <RealtimeRefresh channelName="factory-group" tables={["machine_stages", "colors", "work_sessions"]} />
      <header className="xt-machine-detail-header mb-3 border-b border-[var(--xt-black)]">
        <div
          className="xt-planta-worker-bar px-5 py-3 text-[var(--xt-white)]"
          style={{ background: workerHeaderBackground }}
        >
          <div className="xt-planta-worker-row flex flex-wrap items-center justify-between gap-3">
            <div className="xt-planta-worker-identity flex min-w-0 items-center gap-4">
              <BrandLogo inverse />
              <div className="xt-planta-worker-name-wrap min-w-0">
                <p className="xt-eyebrow xt-eyebrow-light leading-none mb-0.5">Operario activo</p>
                <p className="xt-planta-worker-name truncate text-lg font-bold leading-none">
                  {worker?.full_name ?? "Operario"}
                </p>
              </div>
            </div>
            <nav className="xt-planta-worker-nav flex w-full flex-wrap items-center gap-2 lg:w-auto lg:justify-end">
              <Button asChild variant="ghost" size="sm" className={`xt-planta-nav-button ${navButtonClass}`}>
                <Link href="/planta/operarios">Operarios</Link>
              </Button>
              <Button asChild variant="ghost" size="sm" className={`xt-planta-nav-button ${navButtonClass}`}>
                <Link href="/planta/tablero">Cartelera</Link>
              </Button>
              <Button
                asChild
                variant="outline"
                size="sm"
                className="xt-planta-back-button min-h-11 border-[var(--xt-black)] bg-[var(--xt-yellow)] px-4 text-sm text-[var(--xt-black)] hover:bg-[var(--xt-yellow-deep)]"
              >
                <Link href={continueHref}>Volver a máquinas</Link>
              </Button>
            </nav>
          </div>
        </div>
        <div className="xt-hazard h-2" />
        <div className="xt-group-machine-list px-5 py-3">
          <p className="xt-eyebrow">Grupo · {groupMachines.length} máquinas</p>
          <ul className="xt-group-machine-items">
            {groupMachines.map((machine) => (
              <li key={machine.id} className="xt-group-machine-item">
                <span className="xt-group-machine-serial">#{machine.serialNumber}</span>
                <span className="xt-group-machine-equipment">{machine.equipmentName}</span>
                <span className="xt-group-machine-client">{machine.clientName}</span>
              </li>
            ))}
          </ul>
        </div>
      </header>

      {openSession ? <ActiveSessionBar session={openSession} /> : null}

      <TaskGrid
        machines={groupMachines.map((machine) => ({
          id: machine.id,
          serialNumber: machine.serialNumber,
          stages: machine.stages.map((stage) => ({
            id: stage.id,
            name: stage.name,
            completion: stage.completion,
          })),
        }))}
        openSession={openSession}
        continueHref={continueHref}
      />
    </main>
  );
}
