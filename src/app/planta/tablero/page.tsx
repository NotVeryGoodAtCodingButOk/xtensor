import Link from "next/link";
import { redirect } from "next/navigation";
import { lockFactoryAction } from "@/app/planta/actions";
import { BrandLogo } from "@/components/brand";
import { ConfigWarning } from "@/components/config-warning";
import { RealtimeRefresh } from "@/components/realtime-refresh";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { hasFactoryConfig } from "@/lib/env";
import { isFactoryUnlocked } from "@/lib/factory-session";
import { resolveMachineColorHex } from "@/lib/machine-colors";
import { cn, formatPercent } from "@/lib/utils";
import { listHolidays } from "@/services/catalog";
import { listCalculatedMachines } from "@/services/machines";
import { formatDateEsNoYear } from "@/services/schedule";
import { getSettings, mapSettings } from "@/services/settings";
import type { CalculatedMachineView } from "@/types/domain";

export const dynamic = "force-dynamic";

type RowStatus = "done" | "late" | "active";

export default async function FactoryBoardPage() {
  if (!hasFactoryConfig()) {
    return (
      <main className="grid min-h-screen place-items-center bg-[var(--xt-paper)] p-6">
        <ConfigWarning surface="Tablero de producción" />
      </main>
    );
  }

  if (!(await isFactoryUnlocked())) {
    redirect("/planta");
  }

  const [settingsRow, holidays] = await Promise.all([getSettings(), listHolidays()]);
  const machines = await listCalculatedMachines({
    settings: mapSettings(settingsRow),
    holidays,
    status: "in_production",
  });
  const orderedMachines = [...machines].sort((a, b) => a.orderPosition - b.orderPosition);

  const lateCount = orderedMachines.filter((m) => getRowStatus(m) === "late").length;

  return (
    <main className="flex min-h-screen flex-col bg-[var(--xt-black)] text-[var(--xt-white)]">
      <RealtimeRefresh channelName="factory-board" tables={["machines", "machine_stages", "settings", "colors"]} />

      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--xt-steel)] bg-[var(--xt-black)] px-8 py-5">
        <div className="flex items-center gap-6">
          <BrandLogo inverse />
          <div className="border-l border-white/40 pl-6">
            <p className="xt-eyebrow text-white/70">Estado de producción</p>
            <h1 className="[font-family:var(--font-barlow-condensed)] text-4xl font-bold leading-none">
              Cartelera
            </h1>
          </div>
        </div>
        <div className="flex items-center gap-6">
          <div className="flex flex-wrap gap-3">
            <Link href="/planta/operarios">
              <Button type="button" variant="secondary" size="lg">
                Ver usuarios
              </Button>
            </Link>
            <form action={lockFactoryAction}>
              <Button type="submit" variant="outline" size="lg">
                Cerrar sesión
              </Button>
            </form>
          </div>
          <div className="flex items-center gap-8 text-right border-l border-white/20 pl-6">
            <div>
              <p className="text-5xl font-bold tabular-nums leading-none">{orderedMachines.length}</p>
              <p className="xt-eyebrow text-white/70">En producción</p>
            </div>
            <div className={cn(lateCount > 0 && "xt-flash-late rounded-[4px] px-3 py-1")}>
              <p
                className={cn(
                  "text-5xl font-bold tabular-nums leading-none",
                  lateCount > 0 ? "text-[var(--xt-white)]" : "text-white/40",
                )}
              >
                {lateCount}
              </p>
              <p className="xt-eyebrow text-white/70">Atrasadas</p>
            </div>
          </div>
        </div>
      </header>

      <div className="xt-hazard h-2" />

      {/* Column labels */}
      <div className="grid grid-cols-[4.5rem_minmax(0,2fr)_minmax(0,1.2fr)_minmax(0,2.4fr)_minmax(0,2fr)_minmax(0,1.4fr)_minmax(0,1.6fr)] items-center gap-3 px-6 py-1.5 text-white/50">
        <span className="xt-eyebrow text-center">COTI</span>
        <span className="xt-eyebrow">Máquina</span>
        <span className="xt-eyebrow">Color</span>
        <span className="xt-eyebrow">Avance</span>
        <span className="xt-eyebrow">Siguiente tarea</span>
        <span className="xt-eyebrow text-right">Prometido</span>
        <span className="xt-eyebrow text-right">Estimado</span>
      </div>

      <div className="flex flex-1 flex-col gap-1 px-6 pb-6">
        {orderedMachines.length === 0 ? (
          <div className="grid flex-1 place-items-center text-2xl text-white/50">
            No hay máquinas en producción.
          </div>
        ) : (
          orderedMachines.map((machine) => (
            <BoardRow key={machine.id} machine={machine} />
          ))
        )}
      </div>
    </main>
  );
}

function BoardRow({ machine }: { machine: CalculatedMachineView }) {
  const status = getRowStatus(machine);
  const nextTask = getNextTask(machine);
  const swatch = getPaintSwatch(machine.colorName);

  const rowStyle =
    status === "done"
      ? { backgroundColor: "rgba(46, 158, 63, 0.22)" }
      : status === "active"
        ? { backgroundColor: "rgba(255, 255, 255, 0.05)" }
        : undefined; // late uses the flashing animation class

  return (
    <div
      style={rowStyle}
      className={cn(
        "grid grid-cols-[4.5rem_minmax(0,2fr)_minmax(0,1.2fr)_minmax(0,2.4fr)_minmax(0,2fr)_minmax(0,1.4fr)_minmax(0,1.6fr)] items-center gap-3 rounded-[4px] border px-4 py-1.5",
        status === "late" ? "xt-flash-late border-[var(--line-pro-red)]" : "border-white/10",
      )}
    >
      {/* COTI number */}
      <span className="text-center text-2xl font-bold tabular-nums text-white/80 leading-none">
        {machine.cotiNumber}
      </span>

      {/* Machine name */}
      <div className="min-w-0">
        <h2 className="[font-family:var(--font-barlow-condensed)] truncate text-2xl font-bold leading-none">
          {machine.equipmentName}
        </h2>
      </div>

      {/* Color */}
      <div className="flex items-center gap-1.5 min-w-0">
        <span
          className="inline-block h-3 w-3 shrink-0 rounded-full border border-white/40"
          style={{ backgroundColor: swatch }}
        />
        <span className="truncate text-sm text-white/70">{machine.colorName ?? "—"}</span>
      </div>

      {/* Progress bar */}
      <div className="flex items-center gap-2">
        <Progress
          value={machine.progressPct}
          className="h-2.5 flex-1 border-white/20 bg-white/10"
          indicatorClassName={status === "done" ? "bg-[var(--line-bio-green)]" : "bg-[var(--xt-yellow)]"}
        />
        <span className="w-12 shrink-0 text-right text-base font-bold tabular-nums leading-none">
          {formatPercent(machine.progressPct)}
        </span>
      </div>

      {/* Next task */}
      <div className="min-w-0">
        <p
          className={cn(
            "[font-family:var(--font-barlow-condensed)] truncate text-2xl font-bold leading-none",
            status === "done" && "text-[var(--line-bio-green)]",
          )}
        >
          {nextTask}
        </p>
      </div>

      {/* Promised date */}
      <p className="text-right text-xl font-bold tabular-nums leading-none">
        {formatDateEsNoYear(machine.promisedDate)}
      </p>

      {/* Estimated date */}
      <p
        className={cn(
          "text-right text-xl font-bold tabular-nums leading-none",
          status === "late" ? "text-[var(--xt-yellow)]" : "text-white/55",
        )}
      >
        est. {formatDateEsNoYear(machine.estimatedDate)}
      </p>
    </div>
  );
}

function getRowStatus(machine: CalculatedMachineView): RowStatus {
  if (machine.progressPct >= 1) {
    return "done";
  }
  if (machine.estimatedDate > machine.promisedDate) {
    return "late";
  }
  return "active";
}

function getNextTask(machine: CalculatedMachineView): string {
  const pending = machine.stages.find((stage) => stage.completion < 100);
  return pending ? pending.name : "Terminada";
}

function getPaintSwatch(colorName: string | null): string {
  const hex = resolveMachineColorHex(colorName);
  return hex ? `#${hex}` : "transparent";
}
