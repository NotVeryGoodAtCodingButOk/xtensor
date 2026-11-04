import Link from "next/link";
import { formatHoursDecimal, formatPct, StatsTable } from "@/components/admin/stats-ui";
import type { TimeSplitSegment } from "@/components/admin/time-split-bar";
import { Button } from "@/components/ui/button";
import type { LaborGranularity, LaborPeriodRow } from "@/types/labor-report";

/**
 * «Jornada por período»: de la jornada pagada (solo días con registro), cuánto
 * quedó asignado a máquinas y cuánto no, por día, semana o mes. Una barra
 * apilada por fila con los colores y el orden del contrato; sin librería de
 * gráficas.
 */

type SplitMinutes = Pick<
  LaborPeriodRow,
  "machineMinutes" | "reprocessMinutes" | "machineActivityMinutes" | "plantActivityMinutes" | "unregisteredMinutes"
>;

type SplitPart = {
  key: keyof SplitMinutes;
  label: string;
  color: string;
  group: "asignado" | "no-asignado";
};

/** Mismo orden en la barra y en la leyenda. */
export const LABOR_SPLIT_PARTS: SplitPart[] = [
  { key: "machineMinutes", label: "Máquinas", color: "var(--xt-black)", group: "asignado" },
  { key: "reprocessMinutes", label: "Reproceso", color: "var(--line-pro-red)", group: "asignado" },
  { key: "machineActivityMinutes", label: "Actividades con máquina", color: "var(--line-semi-cyan)", group: "asignado" },
  { key: "plantActivityMinutes", label: "Planta (5S y otras)", color: "var(--xt-yellow-deep)", group: "no-asignado" },
  { key: "unregisteredMinutes", label: "Sin registrar", color: "var(--xt-aluminum)", group: "no-asignado" },
];

export const LABOR_GRANULARITY_OPTIONS: Array<{ value: LaborGranularity; label: string }> = [
  { value: "dia", label: "Día" },
  { value: "semana", label: "Semana" },
  { value: "mes", label: "Mes" },
];

const PERIOD_COLUMN: Record<LaborGranularity, string> = { dia: "Día", semana: "Semana", mes: "Mes" };

const UNCLASSIFIED_ACTIVITY_ID = "sin-clasificar";
const MIN_ACTIVITY_DETAIL_MINUTES = 3;

/** Segmentos para un TimeSplitBar de totales (p. ej. el resumen del rango). */
export function buildLaborPeriodSplit(minutes: SplitMinutes): TimeSplitSegment[] {
  return LABOR_SPLIT_PARTS.map((part) => ({
    key: part.key,
    label: part.label,
    minutes: minutes[part.key],
    color: part.color,
  })).filter((segment) => segment.minutes > 0);
}

/**
 * Suma de varias filas (fila «Total» y resumen del rango). workersWithRecords
 * queda como el máximo de un período: las filas no dicen qué operarios eran.
 */
export function sumLaborPeriods(rows: LaborPeriodRow[]): Omit<LaborPeriodRow, "periodKey" | "label" | "startDate"> {
  const totals = {
    workersWithRecords: 0,
    availableMinutes: 0,
    machineMinutes: 0,
    reprocessMinutes: 0,
    machineActivityMinutes: 0,
    plantActivityMinutes: 0,
    unregisteredMinutes: 0,
    assignedMinutes: 0,
    unassignedMinutes: 0,
    minutesByActivityType: {} as Record<string, number>,
  };

  for (const row of rows) {
    totals.workersWithRecords = Math.max(totals.workersWithRecords, row.workersWithRecords);
    totals.availableMinutes += row.availableMinutes;
    totals.machineMinutes += row.machineMinutes;
    totals.reprocessMinutes += row.reprocessMinutes;
    totals.machineActivityMinutes += row.machineActivityMinutes;
    totals.plantActivityMinutes += row.plantActivityMinutes;
    totals.unregisteredMinutes += row.unregisteredMinutes;
    totals.assignedMinutes += row.assignedMinutes;
    totals.unassignedMinutes += row.unassignedMinutes;
    for (const [activityTypeId, minutes] of Object.entries(row.minutesByActivityType)) {
      totals.minutesByActivityType[activityTypeId] = (totals.minutesByActivityType[activityTypeId] ?? 0) + minutes;
    }
  }

  return totals;
}

/**
 * Base de los %: la jornada. Si por cronómetros solapados lo registrado
 * supera la jornada, se usa la suma de las partes para no pasar de 100 %.
 */
function splitBase(row: SplitMinutes & Pick<LaborPeriodRow, "availableMinutes">) {
  const parts = LABOR_SPLIT_PARTS.reduce((sum, part) => sum + row[part.key], 0);
  return Math.max(row.availableMinutes, parts);
}

function hoursAndPct(minutes: number, base: number) {
  return (
    <span className="tabular-nums">
      {formatHoursDecimal(minutes)}
      <span className="text-[var(--xt-steel)]"> · {base > 0 ? formatPct((minutes / base) * 100) : "—"}</span>
    </span>
  );
}

function PeriodBar({ row }: { row: SplitMinutes & Pick<LaborPeriodRow, "availableMinutes"> }) {
  const base = splitBase(row);
  if (base <= 0) {
    return <span className="text-[var(--xt-aluminum)]">—</span>;
  }

  return (
    <div className="flex h-4 w-48 overflow-hidden border border-[var(--xt-black)] bg-[var(--xt-white)]">
      {LABOR_SPLIT_PARTS.filter((part) => row[part.key] > 0).map((part) => (
        <div
          key={part.key}
          title={`${part.label}: ${formatHoursDecimal(row[part.key])} (${formatPct((row[part.key] / base) * 100)})`}
          style={{ flex: `0 0 ${(row[part.key] / base) * 100}%`, minWidth: "2px", backgroundColor: part.color }}
        />
      ))}
    </div>
  );
}

function ActivityDetail({
  minutesByActivityType,
  activityNames,
}: {
  minutesByActivityType: Record<string, number>;
  activityNames: Record<string, string>;
}) {
  // Menos de 3 min se vería como «0,0 h»: es ruido (p. ej. cronómetros de segundos).
  const entries = Object.entries(minutesByActivityType)
    .filter(([, minutes]) => minutes >= MIN_ACTIVITY_DETAIL_MINUTES)
    .sort((a, b) => b[1] - a[1]);

  if (entries.length === 0) {
    return <span className="text-[var(--xt-aluminum)]">—</span>;
  }

  return (
    <span className="block min-w-48 whitespace-normal text-xs">
      {entries.map(([activityTypeId, minutes], index) => (
        <span key={activityTypeId}>
          {index > 0 ? <span className="text-[var(--xt-aluminum)]"> · </span> : null}
          <span className="font-semibold">
            {activityNames[activityTypeId] ??
              (activityTypeId === UNCLASSIFIED_ACTIVITY_ID ? "Sin clasificar" : "Actividad eliminada")}
          </span>{" "}
          <span className="tabular-nums text-[var(--xt-steel)]">{formatHoursDecimal(minutes)}</span>
        </span>
      ))}
    </span>
  );
}

/** Leyenda de la barra: las cinco partes en orden y cómo se agrupan. */
export function LaborSplitLegend() {
  return (
    <div className="grid gap-2 text-sm">
      <ul className="flex flex-wrap gap-x-5 gap-y-2">
        {LABOR_SPLIT_PARTS.map((part) => (
          <li key={part.key} className="flex items-center gap-2">
            <span
              aria-hidden
              className="h-3 w-3 shrink-0 border border-[var(--xt-black)]"
              style={{ backgroundColor: part.color }}
            />
            <span className="font-semibold">{part.label}</span>
          </li>
        ))}
      </ul>
      <p className="text-xs text-[var(--xt-steel)]">
        <strong className="text-[var(--xt-black)]">Asignado a máquinas</strong> = Máquinas + Reproceso + Actividades con
        máquina. <strong className="text-[var(--xt-black)]">No asignado</strong> = Planta (5S y otras) + Sin registrar.
        La jornada solo cuenta los días en que cada operario registró algo.
      </p>
    </div>
  );
}

/** Selector Día / Semana / Mes (`?vista=`). La página arma el enlace para conservar `?rango=`. */
export function LaborGranularitySelector({
  active,
  hrefFor,
}: {
  active: LaborGranularity;
  hrefFor: (granularity: LaborGranularity) => string;
}) {
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Ver por">
      {LABOR_GRANULARITY_OPTIONS.map((option) => (
        <Button key={option.value} asChild variant={active === option.value ? "default" : "outline"} size="sm">
          <Link href={hrefFor(option.value)}>{option.label}</Link>
        </Button>
      ))}
    </div>
  );
}

export function LaborPeriodTable({
  rows,
  granularity,
  activityNames,
  showWorkers = true,
}: {
  rows: LaborPeriodRow[];
  granularity: LaborGranularity;
  /** activity_type_id → nombre. */
  activityNames: Record<string, string>;
  /** Columna «Operarios»; en la ficha de un operario sobra. */
  showWorkers?: boolean;
}) {
  const workersCell = (value: string) => (showWorkers ? [value] : []);
  const tableRows = rows.map((row) => {
    const base = splitBase(row);
    return [
      <span key="label" className="whitespace-nowrap font-semibold">
        {row.label}
      </span>,
      <PeriodBar key="bar" row={row} />,
      ...workersCell(String(row.workersWithRecords)),
      formatHoursDecimal(row.availableMinutes),
      hoursAndPct(row.assignedMinutes, base),
      hoursAndPct(row.unassignedMinutes, base),
      <ActivityDetail key="detail" minutesByActivityType={row.minutesByActivityType} activityNames={activityNames} />,
    ];
  });

  if (rows.length > 1) {
    const totals = sumLaborPeriods(rows);
    const base = splitBase(totals);
    tableRows.push([
      <strong key="label">Total</strong>,
      <PeriodBar key="bar" row={totals} />,
      ...workersCell("—"),
      <strong key="available">{formatHoursDecimal(totals.availableMinutes)}</strong>,
      <strong key="assigned">{hoursAndPct(totals.assignedMinutes, base)}</strong>,
      <strong key="unassigned">{hoursAndPct(totals.unassignedMinutes, base)}</strong>,
      <ActivityDetail key="detail" minutesByActivityType={totals.minutesByActivityType} activityNames={activityNames} />,
    ]);
  }

  return (
    <div className="grid gap-3">
      <LaborSplitLegend />
      <StatsTable
        empty="No hay jornada registrada en este rango."
        headers={[
          PERIOD_COLUMN[granularity],
          "Reparto",
          ...(showWorkers ? ["Operarios"] : []),
          "Jornada",
          "Asignado a máquinas",
          "No asignado",
          "Detalle por actividad",
        ]}
        rows={tableRows}
      />
    </div>
  );
}
