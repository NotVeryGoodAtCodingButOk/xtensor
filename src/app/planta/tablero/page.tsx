import { redirect } from "next/navigation";
import { BrandLogo } from "@/components/brand";
import { ConfigWarning } from "@/components/config-warning";
import { RealtimeRefresh } from "@/components/realtime-refresh";
import { Progress } from "@/components/ui/progress";
import { hasFactoryConfig } from "@/lib/env";
import { isFactoryUnlocked } from "@/lib/factory-session";
import { cn, formatPercent } from "@/lib/utils";
import { listHolidays } from "@/services/catalog";
import { listCalculatedMachines } from "@/services/machines";
import { formatDateEs } from "@/services/schedule";
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
      <RealtimeRefresh channelName="factory-board" tables={["machines", "machine_stages", "settings"]} />

      <header className="flex items-center justify-between gap-6 border-b border-[var(--xt-steel)] bg-[var(--xt-black)] px-8 py-5">
        <div className="flex items-center gap-6">
          <BrandLogo inverse />
          <div className="border-l border-white/40 pl-6">
            <p className="xt-eyebrow text-white/70">Estado de producción</p>
            <h1 className="[font-family:var(--font-barlow-condensed)] text-4xl font-bold leading-none">
              Tablero de planta
            </h1>
          </div>
        </div>
        <div className="flex items-center gap-8 text-right">
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
      </header>

      <div className="xt-hazard h-2" />

      {/* Column labels */}
      <div className="grid grid-cols-[3.5rem_minmax(0,2.2fr)_minmax(0,3fr)_minmax(0,2fr)_minmax(0,1.6fr)] items-center gap-4 px-8 py-3 text-white/60">
        <span className="xt-eyebrow text-center">#</span>
        <span className="xt-eyebrow">Máquina</span>
        <span className="xt-eyebrow">Avance</span>
        <span className="xt-eyebrow">Siguiente tarea</span>
        <span className="xt-eyebrow text-right">Entrega · estimado</span>
      </div>

      <div className="flex flex-1 flex-col gap-2 px-6 pb-6">
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
        "grid grid-cols-[3.5rem_minmax(0,2.2fr)_minmax(0,3fr)_minmax(0,2fr)_minmax(0,1.6fr)] items-center gap-4 rounded-[4px] border px-4 py-4",
        status === "late" ? "xt-flash-late border-[var(--line-pro-red)]" : "border-white/10",
      )}
    >
      {/* Queue position */}
      <span className="text-center text-2xl font-bold tabular-nums text-white/70">
        {machine.orderPosition}
      </span>

      {/* Machine name + COTI + paint color */}
      <div className="min-w-0">
        <p className="xt-eyebrow text-white/60">COTI {machine.cotiNumber}</p>
        <h2 className="[font-family:var(--font-barlow-condensed)] truncate text-4xl font-bold leading-none">
          {machine.equipmentName}
        </h2>
        <div className="mt-1.5 flex items-center gap-2 text-sm text-white/70">
          <span
            className="inline-block h-4 w-4 shrink-0 rounded-full border border-white/40"
            style={{ backgroundColor: swatch }}
          />
          <span className="truncate">{machine.colorName ?? "Sin color"}</span>
        </div>
      </div>

      {/* Big progress bar */}
      <div className="flex items-center gap-4">
        <Progress
          value={machine.progressPct}
          className="h-7 flex-1 border-white/30 bg-white/10"
          indicatorClassName={status === "done" ? "bg-[var(--line-bio-green)]" : "bg-[var(--xt-yellow)]"}
        />
        <span className="w-20 shrink-0 text-right text-3xl font-bold tabular-nums">
          {formatPercent(machine.progressPct)}
        </span>
      </div>

      {/* Next task */}
      <div className="min-w-0">
        <p
          className={cn(
            "[font-family:var(--font-barlow-condensed)] truncate text-3xl font-bold leading-none",
            status === "done" && "text-[var(--line-bio-green)]",
          )}
        >
          {nextTask}
        </p>
      </div>

      {/* Dates */}
      <div className="text-right">
        <p className="text-xl font-bold tabular-nums leading-tight">{formatDateEs(machine.promisedDate)}</p>
        <p
          className={cn(
            "text-sm tabular-nums leading-tight",
            status === "late" ? "font-bold text-[var(--xt-white)]" : "text-white/55",
          )}
        >
          est. {formatDateEs(machine.estimatedDate)}
        </p>
      </div>
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
  if (!colorName) return "transparent";
  const normalized = colorName
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
  const hex = PAINT_SWATCHES[normalized];
  return hex ? `#${hex}` : "transparent";
}

const PAINT_SWATCHES: Record<string, string> = {
  amarillo: "facc15",
  azul: "60a5fa",
  beige: "d6c2a1",
  blanco: "e5e7eb",
  cafe: "b45309",
  crema: "e7d7b1",
  dorado: "eab308",
  fucsia: "ec4899",
  gris: "9ca3af",
  naranja: "fb923c",
  negro: "1a1a1a",
  plateado: "cbd5e1",
  rojo: "f87171",
  rosado: "f9a8d4",
  verde: "4ade80",
  violeta: "a78bfa",
};
