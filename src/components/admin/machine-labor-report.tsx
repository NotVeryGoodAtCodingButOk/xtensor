import Link from "next/link";
import { AlertTriangle, Gauge, Percent, Wrench } from "lucide-react";
import { BudgetHoursText, formatLaborHours } from "@/components/admin/budget-meter";
import { formatCop, formatLaborPct, formatPct, MetricCard, StatsTable } from "@/components/admin/stats-ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MACHINE_LINE_OPTIONS } from "@/lib/machine-lines";
import { cn } from "@/lib/utils";
import type { MachineStatus } from "@/types/database";
import type {
  EquipmentLaborRow,
  LaborFactorSource,
  MachineLaborFilters,
  MachineLaborReport,
  MachineLaborRow,
  MachineLaborStatusFilter,
} from "@/types/labor-report";

/**
 * Estadísticas → Máquinas: horas de toda la vida por cotización y por tipo
 * de máquina, con % MO esperado (catálogo) vs. real (costo hora de cada
 * operario ÷ venta). Componentes de presentación; la página arma los datos
 * con getMachineLaborReport.
 */

export const MACHINE_STATUS_LABEL: Record<MachineStatus, string> = {
  pending: "Previos",
  in_production: "En producción",
  finished: "Terminada",
  shipped: "Despachada",
  on_hold: "En espera",
};

export const MACHINE_LABOR_STATUS_OPTIONS: Array<{ value: MachineLaborStatusFilter; label: string }> = [
  { value: "todas", label: "Todas" },
  { value: "en-produccion", label: "En producción" },
  { value: "terminadas", label: "Terminadas" },
  { value: "despachadas", label: "Despachadas" },
];

export const MACHINE_LABOR_PATH = "/admin/estadisticas/maquinas";

export function machineLaborDetailHref(machineId: string) {
  return `${MACHINE_LABOR_PATH}/${machineId}`;
}

const PARTIAL_DATA_TITLE =
  "Entró a producción antes de que existieran los cronómetros (o terminó sin sesiones): sus horas están incompletas y no entra en los promedios por tipo.";

/** «Datos parciales» con la explicación en el tooltip. */
export function PartialDataBadge() {
  return (
    <Badge variant="muted" title={PARTIAL_DATA_TITLE} className="whitespace-nowrap">
      Datos parciales
    </Badge>
  );
}

/** % MO esperado: el del equipo, o el general en gris. */
export function ExpectedLaborPct({
  laborFactor,
  source,
  showSource = false,
}: {
  laborFactor: number;
  source: LaborFactorSource;
  /** Agrega «(general)» al lado cuando viene de Configuración. */
  showSource?: boolean;
}) {
  if (source === "general") {
    return (
      <span className="text-[var(--xt-steel)]" title="% general de Configuración (el equipo no tiene % propio)">
        {formatLaborPct(laborFactor)}
        {showSource ? " (general)" : null}
      </span>
    );
  }

  return <span title="% del equipo en el catálogo">{formatLaborPct(laborFactor)}</span>;
}

/** % MO real; en rojo cuando supera al esperado. */
export function RealLaborPct({ real, expected }: { real: number | null; expected: number }) {
  if (real === null) {
    return <span className="text-[var(--xt-steel)]">Sin datos</span>;
  }

  const over = real > expected;
  return (
    <span
      className={cn("tabular-nums", over && "font-semibold text-[var(--line-pro-red)]")}
      title={over ? `Por encima del esperado (${formatLaborPct(expected)})` : undefined}
    >
      {formatLaborPct(real)}
    </span>
  );
}

function spentPctText(spentPct: number | null) {
  return spentPct === null ? "Sin datos" : formatPct(spentPct * 100);
}

function costOrDash(value: number) {
  return value > 0 ? formatCop(value) : "—";
}

export function MachineLaborKpis({ totals }: { totals: MachineLaborReport["totals"] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <MetricCard
        icon={Wrench}
        eyebrow="Cotizaciones"
        title="Máquinas"
        value={String(totals.machineCount)}
        detail="Máquinas que entran en el reporte con los filtros elegidos."
        formula="report.machines.length"
      />
      <MetricCard
        icon={AlertTriangle}
        eyebrow="Presupuesto"
        title="Excedidas"
        value={String(totals.overBudgetCount)}
        detail="Llevan más horas que su H. máx."
        formula="H. llevadas > H. máx"
      />
      <MetricCard
        icon={Gauge}
        eyebrow="Presupuesto"
        title="En riesgo"
        value={String(totals.atRiskCount)}
        detail="Sin terminar, consumen horas más rápido de lo que avanzan."
        formula="% consumido > avance + 10 pp"
      />
      <MetricCard
        icon={Percent}
        eyebrow="Mano de obra"
        title="% MO esperado vs. % MO real"
        value={`${formatLaborPct(totals.avgExpectedLaborPct)} / ${formatLaborPct(totals.avgRealLaborPct)}`}
        detail="Promedio de las terminadas y despachadas con datos completos."
        formula="real = Σ horas × costo hora de cada operario ÷ venta"
        prominent
      />
    </div>
  );
}

export function MachineLaborTable({ rows }: { rows: MachineLaborRow[] }) {
  return (
    <StatsTable
      empty="No hay máquinas con estos filtros."
      headers={[
        "Serial",
        "Máquina",
        "Cliente",
        "Estado",
        "Avance",
        "H. máx",
        "H. llevadas",
        "% consumido",
        "% MO esperado",
        "% MO real",
        "Costo real",
        "Horas actividades",
      ]}
      rows={rows.map((row) => [
        <span key="serial" className="grid justify-items-start gap-1">
          <Link
            href={machineLaborDetailHref(row.machineId)}
            className="font-semibold tabular-nums underline decoration-[var(--xt-yellow-deep)] decoration-2 underline-offset-4"
          >
            #{row.serialNumber}
          </Link>
          {row.hasPartialData ? <PartialDataBadge /> : null}
        </span>,
        row.equipmentName,
        row.clientName,
        MACHINE_STATUS_LABEL[row.status],
        formatPct(row.progressPct * 100),
        row.budgetHours > 0 ? formatLaborHours(row.budgetHours) : "Sin datos",
        <BudgetHoursText
          key="spent"
          hours={row.spentHours}
          status={row.budgetStatus}
          title={
            row.reprocessHours > 0 ? `Incluye ${formatLaborHours(row.reprocessHours)} de reproceso` : undefined
          }
        />,
        spentPctText(row.spentPct),
        <ExpectedLaborPct key="expected" laborFactor={row.laborFactor} source={row.laborFactorSource} />,
        <RealLaborPct key="real" real={row.realLaborPct} expected={row.laborFactor} />,
        costOrDash(row.realCostCop),
        row.extraHours > 0 ? (
          <span key="extra" title={`Costo: ${formatCop(row.extraCostCop)} · fuera del presupuesto de la máquina`}>
            {formatLaborHours(row.extraHours)}
          </span>
        ) : (
          "—"
        ),
      ])}
    />
  );
}

export function EquipmentLaborTable({ rows }: { rows: EquipmentLaborRow[] }) {
  return (
    <StatsTable
      empty="No hay tipos de máquina con estos filtros."
      headers={[
        "Tipo de máquina",
        "Línea",
        "% MO esperado",
        "Máquinas",
        "H. máx prom.",
        "H. llevadas prom.",
        "% consumido prom.",
        "% MO real prom.",
        "Costo real total",
      ]}
      rows={rows.map((row) => [
        <span key="name" className="font-semibold">
          {row.equipmentName}
        </span>,
        row.line ?? "—",
        <ExpectedLaborPct key="expected" laborFactor={row.laborFactor} source={row.laborFactorSource} showSource />,
        String(row.machineCount),
        formatLaborHours(row.avgBudgetHours),
        formatLaborHours(row.avgSpentHours),
        spentPctText(row.avgSpentPct),
        <RealLaborPct key="real" real={row.avgRealLaborPct} expected={row.laborFactor} />,
        costOrDash(row.totalRealCostCop),
      ])}
    />
  );
}

const filterSelectCls =
  "h-8 min-w-36 rounded-[2px] border border-[var(--xt-aluminum)] bg-[var(--xt-white)] px-2 text-sm focus-visible:border-[var(--xt-black)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--xt-yellow)]";

/** Filtros `?estado=&linea=&equipo=` como formulario GET (funciona sin JavaScript). */
export function MachineLaborFiltersForm({
  filters,
  equipmentOptions,
}: {
  filters: MachineLaborFilters;
  equipmentOptions: Array<{ id: string; name: string }>;
}) {
  const filtered = filters.estado !== "todas" || filters.linea !== null || filters.equipo !== null;

  return (
    <form method="get" action={MACHINE_LABOR_PATH} className="flex flex-wrap items-end gap-3">
      <label className="grid gap-1 text-xs font-semibold uppercase tracking-wide text-[var(--xt-steel)]">
        Estado
        <select name="estado" defaultValue={filters.estado} className={filterSelectCls}>
          {MACHINE_LABOR_STATUS_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <label className="grid gap-1 text-xs font-semibold uppercase tracking-wide text-[var(--xt-steel)]">
        Línea
        <select name="linea" defaultValue={filters.linea ?? ""} className={filterSelectCls}>
          <option value="">Todas</option>
          {MACHINE_LINE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <label className="grid gap-1 text-xs font-semibold uppercase tracking-wide text-[var(--xt-steel)]">
        Equipo
        <select name="equipo" defaultValue={filters.equipo ?? ""} className={cn(filterSelectCls, "max-w-72")}>
          <option value="">Todos</option>
          {equipmentOptions.map((option) => (
            <option key={option.id} value={option.id}>
              {option.name}
            </option>
          ))}
        </select>
      </label>
      <Button type="submit" size="sm">
        Filtrar
      </Button>
      {filtered ? (
        <Button asChild size="sm" variant="ghost">
          <Link href={MACHINE_LABOR_PATH}>Quitar filtros</Link>
        </Button>
      ) : null}
    </form>
  );
}

/** Fecha (sin hora) en Bogotá: "15 de septiembre de 2026". */
export function formatDateBogota(value: string) {
  return new Intl.DateTimeFormat("es-CO", { dateStyle: "long", timeZone: "America/Bogota" }).format(new Date(value));
}

/** «Los cronómetros existen desde {trackingSince}»: lo anterior no tiene horas. */
export function TrackingSinceNote({ trackingSince }: { trackingSince: string | null }) {
  return (
    <p className="text-xs text-[var(--xt-steel)]">
      {trackingSince
        ? `Los cronómetros existen desde ${formatDateBogota(trackingSince)}. Las máquinas que arrancaron antes muestran «Datos parciales» y no entran en los promedios.`
        : "Todavía no hay cronómetros registrados."}
    </p>
  );
}
