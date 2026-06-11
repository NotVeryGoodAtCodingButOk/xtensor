import { redirect } from "next/navigation";
import { ConfigWarning } from "@/components/config-warning";
import { PlantaNav } from "@/components/factory/planta-nav";
import { RealtimeRefresh } from "@/components/realtime-refresh";
import { Progress } from "@/components/ui/progress";
import { hasFactoryConfig } from "@/lib/env";
import { isFactoryUnlocked } from "@/lib/factory-session";
import { resolveMachineColorHex } from "@/lib/machine-colors";
import { cn, formatPercent } from "@/lib/utils";
import { listHolidays } from "@/services/catalog";
import { listCalculatedMachines } from "@/services/machines";
import { formatDateEsNoYear } from "@/services/schedule";
import { getSettings, mapSettings } from "@/services/settings";
import { CellTooltip } from "@/components/ui/tooltip";
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
    <main className="xt-planta xt-board flex min-h-screen flex-col bg-[var(--xt-black)] text-[var(--xt-white)]">
      <RealtimeRefresh
        channelName="factory-board"
        tables={["machines", "machine_stages", "settings", "colors"]}
        pollMs={30_000}
      />

      <header className="xt-board-header border-b border-[var(--xt-steel)] bg-[var(--xt-black)]">
        <PlantaNav active="tablero" />
        <div className="xt-hazard h-2" />
        <div className="xt-board-summary flex flex-wrap items-center justify-between gap-4 px-8 py-5">
          <div className="xt-board-title-block">
            <p className="xt-eyebrow xt-eyebrow-light">Estado de producción</p>
            <h1 className="xt-board-title [font-family:var(--font-barlow-condensed)] text-4xl font-bold leading-none">
              Cartelera
            </h1>
          </div>
          <div className="xt-board-metrics flex items-center gap-8 text-right">
            <div className="xt-board-metric">
              <p className="xt-board-metric-value text-5xl font-bold tabular-nums leading-none">{orderedMachines.length}</p>
              <p className="xt-eyebrow xt-eyebrow-light">En producción</p>
            </div>
            <div className={cn("xt-board-metric", lateCount > 0 && "xt-flash-late rounded-[4px] px-3 py-1")}>
              <p
                className={cn(
                  "xt-board-metric-value text-5xl font-bold tabular-nums leading-none",
                  lateCount > 0 ? "text-[var(--xt-white)]" : "text-white/40",
                )}
              >
                {lateCount}
              </p>
              <p className="xt-eyebrow xt-eyebrow-light">Atrasadas</p>
            </div>
          </div>
        </div>
      </header>

      {/* Column labels */}
      <div className="xt-board-columns sticky top-0 z-10 grid grid-cols-[4.5rem_minmax(0,1.8fr)_minmax(0,1.5fr)_minmax(0,1.1fr)_minmax(0,2.1fr)_minmax(0,1.7fr)_minmax(0,1.3fr)_minmax(0,1.5fr)] items-center gap-3 bg-[var(--xt-black)] px-6 py-2 [font-family:var(--font-barlow-condensed)] text-sm font-extrabold uppercase tracking-widest text-white">
        <span className="text-center">SERIAL</span>
        <span>Máquina</span>
        <span>Cliente</span>
        <span>Color</span>
        <span>Avance</span>
        <span>Siguiente tarea</span>
        <span className="text-right">Prometido</span>
        <span className="text-right">Actualizada</span>
      </div>

      <div className="xt-board-rows flex flex-1 flex-col gap-1 px-6 pb-6">
        {orderedMachines.length === 0 ? (
          <div className="xt-board-empty grid flex-1 place-items-center text-2xl text-white/50">
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
        "xt-board-row grid grid-cols-[4.5rem_minmax(0,1.8fr)_minmax(0,1.5fr)_minmax(0,1.1fr)_minmax(0,2.1fr)_minmax(0,1.7fr)_minmax(0,1.3fr)_minmax(0,1.5fr)] items-center gap-3 rounded-[4px] border px-4 py-1.5",
        `xt-board-row-${status}`,
        status === "late" ? "xt-flash-late border-[var(--line-pro-red)]" : "border-white/10",
      )}
    >
      {/* SERIAL number */}
      <span className="xt-board-serial text-center text-2xl font-bold tabular-nums text-white/80 leading-none">
        {machine.serialNumber}
      </span>

      {/* Machine name */}
      <div className="xt-board-cell min-w-0">
        <CellTooltip text={machine.equipmentName} variant="light">
          <h2 className="xt-board-machine [font-family:var(--font-barlow-condensed)] truncate text-2xl font-bold leading-none">
            {machine.equipmentName}
          </h2>
        </CellTooltip>
      </div>

      {/* Client name */}
      <div className="xt-board-cell min-w-0">
        <CellTooltip text={machine.clientName} variant="light">
          <p className="xt-board-client truncate text-base font-semibold leading-none text-white/75">{machine.clientName}</p>
        </CellTooltip>
      </div>

      {/* Color */}
      <div className="xt-board-color flex items-center gap-1.5 min-w-0">
        <span
          className="xt-board-swatch inline-block h-3 w-3 shrink-0 rounded-full border border-white/40"
          style={{ backgroundColor: swatch }}
        />
        <CellTooltip text={machine.colorName} variant="light">
          <span className="xt-board-color-name truncate text-sm text-white/70">{machine.colorName ?? "—"}</span>
        </CellTooltip>
      </div>

      {/* Progress bar */}
      <div className="xt-board-progress flex items-center gap-2">
        <Progress
          value={machine.progressPct}
          className="h-2.5 flex-1 border-white/20 bg-white/10"
          indicatorClassName={status === "done" ? "bg-[var(--line-bio-green)]" : "bg-[var(--xt-yellow)]"}
        />
        <span className="xt-board-percent w-12 shrink-0 text-right text-base font-bold tabular-nums leading-none">
          {formatPercent(machine.progressPct)}
        </span>
      </div>

      {/* Next task */}
      <div className="xt-board-cell min-w-0">
        <CellTooltip text={nextTask} variant="light">
          <p
            className={cn(
              "xt-board-next [font-family:var(--font-barlow-condensed)] truncate text-2xl font-bold leading-none",
              status === "done" && "text-[var(--line-bio-green)]",
            )}
          >
            {nextTask}
          </p>
        </CellTooltip>
      </div>

      {/* Promised date */}
      <p className="xt-board-date text-right text-xl font-bold tabular-nums leading-none">
        {formatDateEsNoYear(machine.promisedDate)}
      </p>

      {/* Estimated date */}
      <p
        className={cn(
          "xt-board-date xt-board-estimated text-right text-xl font-bold tabular-nums leading-none",
          status === "late" ? "text-[var(--xt-yellow)]" : "text-white/55",
        )}
      >
        {formatDateEsNoYear(machine.estimatedDate)}
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
