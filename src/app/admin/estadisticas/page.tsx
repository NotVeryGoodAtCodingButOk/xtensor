import type { Metadata } from "next";
import Link from "next/link";
import { Activity, AlertTriangle, BarChart3, Clock, Factory, RefreshCcw, Timer, Truck, Users } from "lucide-react";

export const metadata: Metadata = { title: "Estadísticas XTENSOR" };
import { AdminShell } from "@/components/app-shell";
import { ConfigWarning } from "@/components/config-warning";
import { RealtimeRefresh } from "@/components/realtime-refresh";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { hasSupabaseConfig } from "@/lib/env";
import { cn } from "@/lib/utils";
import { listHolidays } from "@/services/catalog";
import { getSettings, mapSettings } from "@/services/settings";
import {
  getStatisticsDashboard,
  resolveStatisticsRange,
  type BreakdownTimingStats,
  type StatisticsRangePreset,
} from "@/services/statistics";

const rangeOptions: Array<{ preset: StatisticsRangePreset; label: string }> = [
  { preset: "current-month", label: "Mes actual" },
  { preset: "previous-month", label: "Mes anterior" },
  { preset: "last-90-days", label: "90 días" },
  { preset: "all-time", label: "Histórico" },
];

export default async function StatisticsPage({
  searchParams,
}: {
  searchParams: Promise<{ rango?: string }>;
}) {
  if (!hasSupabaseConfig()) {
    return (
      <AdminShell>
        <ConfigWarning surface="Estadísticas" />
      </AdminShell>
    );
  }

  const query = await searchParams;
  const range = resolveStatisticsRange(query.rango);
  const settings = mapSettings(await getSettings());
  const holidays = await listHolidays();
  const dashboard = await getStatisticsDashboard({ range, settings, holidays });
  const dateLabel =
    dashboard.range.startDate && dashboard.range.endDate
      ? `${dashboard.range.startDate} a ${dashboard.range.endDate}`
      : "todo el histórico";

  return (
    <AdminShell>
      <RealtimeRefresh channelName="admin-statistics" tables={["machines", "machine_stages", "stage_logs", "machine_warranty_events"]} />
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="xt-eyebrow">Administración</p>
          <h1 className="text-3xl font-bold">Estadísticas</h1>
          <p className="text-sm text-[var(--xt-steel)]">
            Tiempos calculados con jornada laboral, festivos de Colombia y registros de avance.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {rangeOptions.map((option) => (
            <Button
              key={option.preset}
              asChild
              variant={dashboard.range.preset === option.preset ? "default" : "outline"}
              size="sm"
            >
              <Link href={`/admin/estadisticas?rango=${option.preset}`}>{option.label}</Link>
            </Button>
          ))}
        </div>
      </div>

      <div className="mb-4 border border-[var(--xt-black)] bg-[var(--xt-white)] p-4 shadow-[var(--shadow-sm)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="xt-eyebrow">Rango</p>
            <p className="text-lg font-semibold">{dashboard.range.label}</p>
            <p className="text-sm text-[var(--xt-steel)]">{dateLabel}</p>
          </div>
          <Badge variant="muted">Calculado {formatDateTime(dashboard.generatedAt)}</Badge>
        </div>
      </div>

      <section className="mb-5 grid gap-4 lg:grid-cols-[1.3fr_1fr_1fr]">
        <MetricCard
          icon={Timer}
          eyebrow="KPI principal"
          title="Tiempo de producción"
          value={formatHours(dashboard.summary.production.averageHours)}
          detail={`${dashboard.summary.production.count} máquinas · mediana ${formatHours(dashboard.summary.production.medianHours)} · p90 ${formatHours(dashboard.summary.production.p90Hours)} · desde primera tarea hasta Empacar 100%`}
          prominent
        />
        <MetricCard
          icon={Factory}
          eyebrow="Pedido a terminado"
          title="Ciclo total"
          value={formatHours(dashboard.summary.orderToCompletion.averageHours)}
          detail="Desde creación del pedido hasta Empacar 100%."
        />
        <MetricCard
          icon={Truck}
          eyebrow="Producción a despacho"
          title="Espera promedio"
          value={formatHours(dashboard.summary.productionToShipment.averageHours)}
          detail={`${dashboard.summary.shippedMachinesCount} despachos en el rango.`}
        />
      </section>

      <section className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard
          icon={Clock}
          eyebrow="Entrada a despacho"
          title="Promedio"
          value={formatHours(dashboard.summary.inputToShipment.averageHours)}
          detail="Ciclo completo hasta despacho."
        />
        <MetricCard
          icon={Activity}
          eyebrow="WIP actual"
          title="En producción"
          value={String(dashboard.summary.currentWipCount)}
          detail="Máquinas activas ahora."
        />
        <MetricCard
          icon={RefreshCcw}
          eyebrow="Calidad"
          title="Reprocesos"
          value={String(dashboard.summary.reprocessCount)}
          detail="Veces que una tarea hecha volvió a abrirse."
        />
        <MetricCard
          icon={AlertTriangle}
          eyebrow="Cumplimiento"
          title="Producción tarde"
          value={String(dashboard.summary.lateProductionCount)}
          detail={`Retraso promedio ${formatHours(dashboard.summary.averageProductionDelayHours)}.`}
        />
        <MetricCard
          icon={BarChart3}
          eyebrow="Cumplimiento"
          title="Despachos tarde"
          value={String(dashboard.summary.lateShipmentCount)}
          detail={`Retraso promedio ${formatHours(dashboard.summary.averageShipmentDelayHours)}.`}
        />
      </section>

      <section className="mb-5">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <RefreshCcw className="h-5 w-5" />
              Garantías
            </CardTitle>
            <CardDescription>Máquinas devueltas a producción por garantía dentro del rango seleccionado.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="xt-eyebrow">Registro</p>
                <p className="text-3xl font-bold">{dashboard.summary.warrantyCount}</p>
              </div>
              <Badge variant="muted">
                {dashboard.summary.warrantyCount} garantía{dashboard.summary.warrantyCount === 1 ? "" : "s"}
              </Badge>
            </div>
            <StatsTable
              empty="No hay garantías en este rango."
              headers={["PLACA", "Cliente", "Equipo", "Mensaje", "Fecha"]}
              rows={dashboard.warrantyEvents.map((event) => [
                `#${event.placaNumber}`,
                event.clientName,
                event.equipmentName,
                event.message,
                formatDateTime(event.createdAt),
              ])}
            />
          </CardContent>
        </Card>
      </section>

      <section className="mb-5 grid gap-5 xl:grid-cols-[1.2fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Cuellos de botella por etapa</CardTitle>
            <CardDescription>Tiempo laboral desde que la etapa queda habilitada hasta que llega a 100%.</CardDescription>
          </CardHeader>
          <CardContent>
            <StatsTable
              empty="No hay etapas completadas en este rango."
              headers={["Etapa", "Completadas", "Reprocesos", "Promedio", "Mediana", "P90", "Máximo"]}
              rows={dashboard.stages.map((stage) => [
                stage.stageName,
                String(stage.count),
                String(stage.reprocessCount),
                formatHours(stage.averageHours),
                formatHours(stage.medianHours),
                formatHours(stage.p90Hours),
                formatHours(stage.maxHours),
              ])}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Etapas abiertas más antiguas</CardTitle>
            <CardDescription>Máquinas activas que llevan más tiempo laboral esperando cierre de etapa.</CardDescription>
          </CardHeader>
          <CardContent>
            <StatsTable
              empty="No hay etapas abiertas con fecha de inicio."
              headers={["PLACA", "Etapa", "Antigüedad", "Cliente"]}
              rows={dashboard.currentOpenStages.map((stage) => [
                `#${stage.placaNumber}`,
                stage.stageName,
                formatHours(stage.agingHours),
                stage.clientName,
              ])}
            />
          </CardContent>
        </Card>
      </section>

      <section className="mb-5 grid gap-5 xl:grid-cols-2">
        <BreakdownCard title="Por equipo" rows={dashboard.breakdowns.byEquipment} />
        <BreakdownCard title="Por línea" rows={dashboard.breakdowns.byLine} />
        <BreakdownCard title="Por cliente" rows={dashboard.breakdowns.byClient} />
        <BreakdownCard title="Por ciudad" rows={dashboard.breakdowns.byCity} />
      </section>

      <section className="mb-5 grid gap-5 xl:grid-cols-[1fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Actividad por operario
            </CardTitle>
            <CardDescription>Cuenta acciones de avance y reproceso, no horas de mano de obra.</CardDescription>
          </CardHeader>
          <CardContent>
            <StatsTable
              empty="No hay actividad registrada en este rango."
              headers={["Operario", "Acciones", "Cierres 100%", "Reprocesos", "Última actividad"]}
              rows={dashboard.workers.map((worker) => [
                worker.workerName,
                String(worker.updateCount),
                String(worker.completionCount),
                String(worker.reprocessCount),
                formatDateTime(worker.lastActivityAt),
              ])}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" />
              Calidad de datos
            </CardTitle>
            <CardDescription>Casos que pueden distorsionar métricas o indicar flujo incompleto.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3">
              <QualityRow label="Sin Empacar 100%" value={dashboard.dataQuality.missingProductionCompletion.length} />
              <QualityRow label="Despachadas sin cierre de producción" value={dashboard.dataQuality.shippedWithoutProductionCompletion.length} />
              <QualityRow label="Etapas fuera de secuencia" value={dashboard.dataQuality.outOfSequenceStages.length} />
              <QualityRow label="Acciones deshechas en rango" value={dashboard.dataQuality.undoneLogsCount} />
            </div>
            <div className="mt-4">
              <StatsTable
                empty="No hay alertas prioritarias."
                headers={["PLACA", "Máquina", "Detalle"]}
                rows={[
                  ...dashboard.dataQuality.shippedWithoutProductionCompletion,
                  ...dashboard.dataQuality.outOfSequenceStages,
                ]
                  .slice(0, 8)
                  .map((issue) => [`#${issue.placaNumber}`, issue.label, issue.detail])}
              />
            </div>
          </CardContent>
        </Card>
      </section>
    </AdminShell>
  );
}

function MetricCard({
  icon: Icon,
  eyebrow,
  title,
  value,
  detail,
  prominent = false,
}: {
  icon: typeof Timer;
  eyebrow: string;
  title: string;
  value: string;
  detail: string;
  prominent?: boolean;
}) {
  return (
    <Card className={cn(prominent && "border-[var(--xt-black)] bg-[var(--xt-yellow-soft)]")}>
      <CardHeader className="gap-3">
        <div className="flex items-center justify-between gap-3">
          <p className="xt-eyebrow">{eyebrow}</p>
          <Icon className="h-5 w-5 text-[var(--xt-steel)]" />
        </div>
        <div>
          <CardTitle className={prominent ? "text-4xl" : "text-3xl"}>{value}</CardTitle>
          <p className="mt-1 font-semibold">{title}</p>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-[var(--xt-steel)]">{detail}</p>
      </CardContent>
    </Card>
  );
}

function BreakdownCard({ title, rows }: { title: string; rows: BreakdownTimingStats[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>Promedio de producción total para máquinas completadas en el rango.</CardDescription>
      </CardHeader>
      <CardContent>
        <StatsTable
          empty="No hay máquinas completadas en este rango."
          headers={["Grupo", "Máquinas", "Promedio", "P90"]}
          rows={rows.map((row) => [row.label, String(row.count), formatHours(row.averageHours), formatHours(row.p90Hours)])}
        />
      </CardContent>
    </Card>
  );
}

function StatsTable({
  headers,
  rows,
  empty,
}: {
  headers: string[];
  rows: string[][];
  empty: string;
}) {
  if (rows.length === 0) {
    return <p className="border border-dashed border-[var(--xt-cement)] p-4 text-sm text-[var(--xt-steel)]">{empty}</p>;
  }

  return (
    <div className="overflow-x-auto border border-[var(--xt-cement)]">
      <Table>
        <TableHeader>
          <TableRow>
            {headers.map((header) => (
              <TableHead key={header}>{header}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, rowIndex) => (
            <TableRow key={`${row[0]}-${rowIndex}`}>
              {row.map((cell, cellIndex) => (
                <TableCell key={`${cell}-${cellIndex}`} className={cellIndex > 0 ? "whitespace-nowrap" : undefined}>
                  {cell}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function QualityRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-[var(--xt-cement)] pb-2 last:border-b-0 last:pb-0">
      <span className="text-sm text-[var(--xt-steel)]">{label}</span>
      <Badge variant={value > 0 ? "warning" : "success"}>{value}</Badge>
    </div>
  );
}

function formatHours(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "Sin datos";
  }
  if (value < 1) {
    return `${Math.round(value * 60)} min`;
  }

  return `${new Intl.NumberFormat("es-CO", { maximumFractionDigits: 1 }).format(value)} h`;
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("es-CO", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Bogota",
  }).format(new Date(value));
}
