import Link from "next/link";
import { formatLaborHours } from "@/components/admin/budget-meter";
import { MACHINE_STATUS_LABEL, machineLaborDetailHref, PartialDataBadge } from "@/components/admin/machine-labor-report";
import { DEFAULT_STAGES } from "@/services/calculations";
import { MIN_VISIBLE_HOURS } from "@/services/machine-labor";
import type { MachineTimeRow } from "@/types/labor-report";

/**
 * Estadísticas → Tiempo: una barra por cotización, partida por etapa, con el
 * largo proporcional a las horas (la máquina con más horas llena el ancho).
 * La rayita negra marca las horas máximas de la máquina.
 */

/** Un color fijo por etapa, en orden de proceso (validado para daltonismo). */
const STAGE_COLORS: Record<number, string> = Object.fromEntries(
  [...DEFAULT_STAGES]
    .sort((a, b) => a.displayOrder - b.displayOrder)
    .map((stage, index) => [stage.id, ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#6250d6"][index]]),
);

const ORDERED_STAGES = [...DEFAULT_STAGES].sort((a, b) => a.displayOrder - b.displayOrder);

export function MachineTimeLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
      {ORDERED_STAGES.map((stage) => (
        <span key={stage.id} className="inline-flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-[3px]" style={{ backgroundColor: STAGE_COLORS[stage.id] }} aria-hidden />
          {stage.name}
        </span>
      ))}
      <span className="inline-flex items-center gap-1.5 text-[var(--xt-steel)]">
        <span className="h-4 w-0.5 bg-[var(--xt-black)]" aria-hidden />
        Horas máximas
      </span>
    </div>
  );
}

export function MachineTimeChart({ rows }: { rows: MachineTimeRow[] }) {
  if (rows.length === 0) {
    return <p className="py-6 text-center text-sm text-[var(--xt-steel)]">No hay cotizaciones con cronómetros con estos filtros.</p>;
  }

  const scale = Math.max(...rows.map((row) => Math.max(row.spentHours, row.budgetHours)), 0.0001);

  return (
    <ul className="divide-y divide-[var(--xt-cement)]">
      {rows.map((row) => (
        <li key={row.machineId} className="grid gap-x-4 gap-y-2 py-3 md:grid-cols-[13rem_1fr_6rem] md:items-center">
          <div className="min-w-0">
            <Link
              href={machineLaborDetailHref(row.machineId)}
              className="font-semibold tabular-nums underline decoration-[var(--xt-yellow-deep)] decoration-2 underline-offset-4"
            >
              #{row.serialNumber}
            </Link>
            <p className="truncate text-sm font-semibold" title={row.equipmentName}>
              {row.equipmentName}
            </p>
            <p className="truncate text-xs text-[var(--xt-steel)]" title={row.clientName}>
              {row.clientName} · {MACHINE_STATUS_LABEL[row.status]}
            </p>
            {row.hasPartialData ? <div className="mt-1"><PartialDataBadge /></div> : null}
          </div>

          <div className="min-w-0">
            <StackedBar row={row} scale={scale} />
            <p className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-[var(--xt-steel)]">
              {row.byStage
                .filter((stage) => stage.hours >= MIN_VISIBLE_HOURS)
                .map((stage) => (
                  <span key={stage.stageId} className="inline-flex items-center gap-1 tabular-nums">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: STAGE_COLORS[stage.stageId] }} aria-hidden />
                    {stage.stageName} {formatLaborHours(stage.hours)}
                  </span>
                ))}
            </p>
          </div>

          <div className="text-sm md:text-right">
            <p className="font-bold tabular-nums">{formatLaborHours(row.spentHours)}</p>
            <p className="text-xs text-[var(--xt-steel)] tabular-nums">
              {row.budgetHours > 0 ? `de ${formatLaborHours(row.budgetHours)} máx` : "sin máximo"}
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
}

function StackedBar({ row, scale }: { row: MachineTimeRow; scale: number }) {
  const segments = row.byStage.filter((stage) => stage.hours >= MIN_VISIBLE_HOURS);

  return (
    <div className="relative h-6 w-full bg-[var(--xt-paper)]">
      <div className="flex h-full gap-[2px]" style={{ width: `${(row.spentHours / scale) * 100}%` }}>
        {segments.map((stage, index) => (
          <div
            key={stage.stageId}
            className="group relative h-full min-w-[3px] first:rounded-l-[2px] last:rounded-r-[4px]"
            style={{ flexGrow: stage.hours, flexBasis: 0, backgroundColor: STAGE_COLORS[stage.stageId] }}
          >
            <span
              className={`pointer-events-none absolute bottom-full z-10 mb-1.5 hidden whitespace-nowrap border border-[var(--xt-black)] bg-[var(--xt-white)] px-2 py-1 text-xs shadow-[var(--shadow-sm)] group-hover:block ${
                index === segments.length - 1 && segments.length > 1 ? "right-0" : "left-0"
              }`}
            >
              <strong>{stage.stageName}</strong> · {formatLaborHours(stage.hours)}
              {row.spentHours > 0 ? ` · ${Math.round((stage.hours / row.spentHours) * 100)}%` : null}
              {stage.reprocessHours > 0 ? ` · ${formatLaborHours(stage.reprocessHours)} reproceso` : null}
            </span>
          </div>
        ))}
      </div>
      {row.budgetHours > 0 ? (
        <div
          className="absolute -inset-y-1 w-0.5 bg-[var(--xt-black)]"
          style={{ left: `calc(${(row.budgetHours / scale) * 100}% - 1px)` }}
          title={`Horas máximas: ${formatLaborHours(row.budgetHours)}`}
        />
      ) : null}
    </div>
  );
}
