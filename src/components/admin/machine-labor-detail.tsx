import Link from "next/link";
import { formatLaborHours } from "@/components/admin/budget-meter";
import {
  ExpectedLaborPct,
  formatDateBogota,
  MACHINE_STATUS_LABEL,
  PartialDataBadge,
  RealLaborPct,
} from "@/components/admin/machine-labor-report";
import { formatCop, formatDateTime, formatHoursDecimal, formatPct, StatsTable } from "@/components/admin/stats-ui";
import { Badge } from "@/components/ui/badge";
import { cn, formatCurrencyCop } from "@/lib/utils";
import { formatDateEs } from "@/services/schedule";
import type {
  MachineLaborActivityRow,
  MachineLaborDetail,
  MachineLaborSessionRow,
  MachineLaborStageRow,
  MachineLaborWorkerRow,
} from "@/types/labor-report";

/**
 * Ficha de una máquina (/admin/estadisticas/maquinas/[id]): encabezado,
 * etapas esperado vs. real, operarios, actividades asociadas y bitácora.
 * El medidor de llevadas vs. máximo es BudgetMeter (budget-meter.tsx).
 */

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-0.5">
      <dt className="xt-eyebrow">{label}</dt>
      <dd className="text-sm font-semibold">{children}</dd>
    </div>
  );
}

function dateOrDash(value: string | null, format: (value: string) => string) {
  return value ? format(value) : "—";
}

export function MachineLaborHeader({ detail }: { detail: MachineLaborDetail }) {
  const { machine } = detail;

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="xt-eyebrow">Cotización #{machine.serialNumber}</p>
          <h1 className="text-3xl font-bold">{machine.equipmentName}</h1>
          <p className="text-sm text-[var(--xt-steel)]">
            {machine.clientName}
            {machine.line ? ` · ${machine.line}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={machine.status === "in_production" ? "warning" : "muted"}>
            {MACHINE_STATUS_LABEL[machine.status]}
          </Badge>
          {machine.hasPartialData ? <PartialDataBadge /> : null}
        </div>
      </div>

      <dl className="grid gap-4 border border-[var(--xt-cement)] bg-[var(--xt-white)] p-4 sm:grid-cols-3 xl:grid-cols-6">
        <Fact label="Avance">{formatPct(machine.progressPct * 100)}</Fact>
        <Fact label="Venta">{formatCurrencyCop(machine.salePriceCop)}</Fact>
        <Fact label="% MO esperado">
          <ExpectedLaborPct laborFactor={machine.laborFactor} source={machine.laborFactorSource} showSource />
        </Fact>
        <Fact label="% MO real">
          <RealLaborPct real={machine.realLaborPct} expected={machine.laborFactor} />
        </Fact>
        <Fact label="Costo real">{machine.realCostCop > 0 ? formatCop(machine.realCostCop) : "—"}</Fact>
        <Fact label="Horas actividades">
          {machine.extraHours > 0 ? `${formatLaborHours(machine.extraHours)} · ${formatCop(machine.extraCostCop)}` : "—"}
        </Fact>
        <Fact label="Prometida">{formatDateEs(detail.promisedDate)}</Fact>
        <Fact label="Reestimada">{dateOrDash(detail.reestimatedDate, formatDateEs)}</Fact>
        <Fact label="Inicio producción">{dateOrDash(machine.productionStartedAt, formatDateBogota)}</Fact>
        <Fact label="Terminada">{dateOrDash(machine.completedAt, formatDateBogota)}</Fact>
        <Fact label="Despachada">{dateOrDash(machine.shippedAt, formatDateBogota)}</Fact>
        <Fact label="Reproceso">{machine.reprocessHours > 0 ? formatLaborHours(machine.reprocessHours) : "—"}</Fact>
      </dl>
    </div>
  );
}

/** Barra corta real vs. esperado: negra hasta el esperado, roja si se pasa. */
function StageBar({ expected, spent }: { expected: number; spent: number }) {
  const scale = Math.max(expected, spent);
  if (scale <= 0) {
    return <span className="text-[var(--xt-aluminum)]">—</span>;
  }
  const over = spent > expected;

  return (
    <div className="relative h-2.5 w-32 overflow-hidden border border-[var(--xt-black)] bg-[var(--xt-cement)]">
      <div
        className="h-full"
        style={{
          width: `${(spent / scale) * 100}%`,
          backgroundColor: over ? "var(--line-pro-red)" : "var(--xt-black)",
        }}
      />
      {over && expected > 0 ? (
        <div
          className="absolute inset-y-0 w-0.5 bg-[var(--xt-white)]"
          style={{ left: `${(expected / scale) * 100}%` }}
        />
      ) : null}
    </div>
  );
}

function differenceText(expected: number, spent: number) {
  const diff = spent - expected;
  if (Math.abs(diff) < 0.05) {
    return <span className="text-[var(--xt-steel)]">0,0 h</span>;
  }

  return (
    <span className={cn("tabular-nums", diff > 0 ? "font-semibold text-[var(--line-pro-red)]" : "text-[var(--xt-steel)]")}>
      {diff > 0 ? "+" : "−"}
      {formatLaborHours(Math.abs(diff))}
    </span>
  );
}

export function MachineLaborStagesTable({ rows }: { rows: MachineLaborStageRow[] }) {
  const tableRows = rows.map((row) => [
    <span key="stage" className="font-semibold">
      {row.stageName}
    </span>,
    formatLaborHours(row.expectedHours),
    formatLaborHours(row.spentHours),
    row.reprocessHours > 0 ? formatLaborHours(row.reprocessHours) : "—",
    differenceText(row.expectedHours, row.spentHours),
    <StageBar key="bar" expected={row.expectedHours} spent={row.spentHours} />,
  ]);

  if (rows.length > 0) {
    const expected = rows.reduce((sum, row) => sum + row.expectedHours, 0);
    const spent = rows.reduce((sum, row) => sum + row.spentHours, 0);
    const reprocess = rows.reduce((sum, row) => sum + row.reprocessHours, 0);
    tableRows.push([
      <strong key="stage">Total</strong>,
      <strong key="expected">{formatLaborHours(expected)}</strong>,
      <strong key="spent">{formatLaborHours(spent)}</strong>,
      reprocess > 0 ? <strong key="reprocess">{formatLaborHours(reprocess)}</strong> : "—",
      differenceText(expected, spent),
      <StageBar key="bar" expected={expected} spent={spent} />,
    ]);
  }

  return (
    <StatsTable
      empty="Esta máquina no tiene etapas."
      headers={["Etapa", "Esperado", "Real", "Reproceso", "Diferencia", "Real vs. esperado"]}
      rows={tableRows}
    />
  );
}

export function MachineLaborWorkersTable({ rows }: { rows: MachineLaborWorkerRow[] }) {
  const sorted = [...rows].sort((a, b) => b.hours - a.hours);
  const totalHours = sorted.reduce((sum, row) => sum + row.hours, 0);
  const totalCost = sorted.reduce((sum, row) => sum + row.costCop, 0);

  const tableRows = sorted.map((row) => [
    <Link
      key="name"
      href={`/admin/estadisticas/horas/operario/${row.workerId}`}
      className="font-semibold underline decoration-[var(--xt-yellow-deep)] decoration-2 underline-offset-4"
    >
      {row.fullName}
    </Link>,
    formatLaborHours(row.hours),
    totalHours > 0 ? formatPct((row.hours / totalHours) * 100) : "—",
    row.costCop > 0 ? formatCop(row.costCop) : "—",
  ]);

  if (sorted.length > 1) {
    tableRows.push([
      <strong key="name">Total</strong>,
      <strong key="hours">{formatLaborHours(totalHours)}</strong>,
      "100 %",
      <strong key="cost">{totalCost > 0 ? formatCop(totalCost) : "—"}</strong>,
    ]);
  }

  return (
    <StatsTable
      empty="Ningún operario ha registrado horas de producción en esta máquina."
      headers={["Operario", "Horas", "% de la máquina", "Costo"]}
      rows={tableRows}
    />
  );
}

export function MachineLaborActivitiesTable({ rows }: { rows: MachineLaborActivityRow[] }) {
  const sorted = [...rows].sort((a, b) => b.hours - a.hours);
  const tableRows = sorted.map((row) => [
    <span key="name" className="font-semibold">
      {row.name}
    </span>,
    formatLaborHours(row.hours),
    row.costCop > 0 ? formatCop(row.costCop) : "—",
  ]);

  if (sorted.length > 1) {
    const hours = sorted.reduce((sum, row) => sum + row.hours, 0);
    const cost = sorted.reduce((sum, row) => sum + row.costCop, 0);
    tableRows.push([
      <strong key="name">Total</strong>,
      <strong key="hours">{formatLaborHours(hours)}</strong>,
      <strong key="cost">{cost > 0 ? formatCop(cost) : "—"}</strong>,
    ]);
  }

  return (
    <StatsTable
      empty="No hay actividades asociadas a esta máquina."
      headers={["Actividad", "Horas", "Costo"]}
      rows={tableRows}
    />
  );
}

function sessionTask(session: MachineLaborSessionRow) {
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      {session.kind === "other" ? <Badge variant="muted">Actividad</Badge> : null}
      <span>{session.label}</span>
      {session.isReprocess ? <Badge variant="danger">Reproceso</Badge> : null}
    </span>
  );
}

export function MachineLaborSessionsTable({ rows }: { rows: MachineLaborSessionRow[] }) {
  return (
    <StatsTable
      empty="Esta máquina todavía no tiene cronómetros."
      headers={["Inicio", "Fin", "Operario", "Tarea", "Horas", "Compartido"]}
      rows={rows.map((session) => [
        <span key="start" className="whitespace-nowrap">
          {formatDateTime(session.startedAt)}
        </span>,
        session.endedAt ? formatDateTime(session.endedAt) : <Badge variant="warning">En curso</Badge>,
        session.workerName,
        sessionTask(session),
        formatHoursDecimal(session.minutes),
        session.sharedWith > 1 ? (
          <span key="shared" title="El cronómetro se repartió por igual entre las máquinas marcadas.">
            Entre {session.sharedWith} máquinas
          </span>
        ) : (
          "—"
        ),
      ])}
    />
  );
}
