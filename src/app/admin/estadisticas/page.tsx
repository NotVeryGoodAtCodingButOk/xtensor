import type { Metadata } from "next";
import Link from "next/link";
import { Activity, AlertTriangle, BarChart3, Coins, Package, RefreshCcw, Truck, Users } from "lucide-react";

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
  type StatisticsRangePreset,
} from "@/services/statistics";

const rangeOptions: Array<{ preset: StatisticsRangePreset; label: string }> = [
  { preset: "current-month", label: "Mes actual" },
  { preset: "previous-month", label: "Mes anterior" },
  { preset: "last-90-days", label: "90 días" },
  { preset: "all-time", label: "Histórico" },
];

// Previos surfaced on the statistics page: láser, torno armado, torno ensamble y cojines.
const TRACKED_PREVIO_NAMES = new Set(["Laser", "Torno A.", "Torno E.", "Cojines"]);

function isTrackedPrevio(name: string) {
  return TRACKED_PREVIO_NAMES.has(name.trim());
}

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

  const { summary } = dashboard;

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

      {/* Rango summary bar */}
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

      {/* Dashboard compact grid */}
      <section className="mb-5">
        <p className="xt-eyebrow mb-2">Dashboard</p>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            icon={Package}
            eyebrow="Estado"
            title="Previos"
            value={String(summary.currentPreviosCount)}
            detail="Máquinas en previos"
          />
          <MetricCard
            icon={Activity}
            eyebrow="WIP actual"
            title="En producción"
            value={String(summary.currentWipCount)}
            detail="Máquinas activas ahora."
          />
          <MetricCard
            icon={Coins}
            eyebrow="Producción L30D"
            title="Producción"
            value={formatCop(summary.last30Days.totalProductionCop)}
            detail={`${summary.last30Days.finishedMachinesCount} máquinas terminadas · últimos 30 días`}
          />
          <MetricCard
            icon={Users}
            eyebrow="Por persona L30D"
            title="Producción / persona"
            value={formatCop(summary.last30Days.productionPerWorkerCop)}
            detail={`${summary.last30Days.workerCount} personas en nómina`}
          />
          <MetricCard
            icon={BarChart3}
            eyebrow="Mano de obra L30D"
            title="% del precio"
            value={formatPct(summary.last30Days.laborCostShareAvgPct)}
            detail="% promedio del precio de venta (L30D)"
          />
          <MetricCard
            icon={AlertTriangle}
            eyebrow="Cumplimiento"
            title="A tiempo"
            value={formatPct(summary.onTimeCompletion.pct)}
            detail={`${summary.onTimeCompletion.onTimeCount}/${summary.onTimeCompletion.count} máquinas a tiempo`}
          />
          <MetricCard
            icon={Truck}
            eyebrow={summary.shippedThisMonth.monthLabel}
            title="Despachado este mes"
            value={formatCop(summary.shippedThisMonth.totalCop)}
            detail={`${summary.shippedThisMonth.count} despachos · ${summary.shippedThisMonth.monthLabel}`}
          />
          <MetricCard
            icon={Coins}
            eyebrow="Cierre del mes"
            title="Expectativa"
            value={formatCop(summary.monthEndShipmentForecast.totalCop)}
            detail={`Despachado ${formatCop(summary.monthEndShipmentForecast.committedCop)} + proyectado ${formatCop(summary.monthEndShipmentForecast.forecastCop)} (${summary.monthEndShipmentForecast.forecastCount} por despachar)`}
          />
        </div>
      </section>

      {/* Productividad por máquina */}
      <section className="mb-5">
        <Card>
          <CardHeader>
            <CardTitle>Productividad por máquina</CardTitle>
            <CardDescription>
              Tiempo desde el pedido y desde el inicio de producción hasta Empacar 100%, por máquina del rango.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <StatsTable
              empty="No hay máquinas con datos de productividad en este rango."
              headers={["SERIAL", "Cliente", "Equipo", "Pedido → terminado", "Producción → terminado", "Mano de obra %", "A tiempo"]}
              rows={dashboard.productivityByMachine.map((m) => [
                `#${m.serialNumber}`,
                m.clientName,
                m.equipmentName,
                formatHours(m.orderToCompletionHours),
                formatHours(m.productionHours),
                formatPct(m.laborCostPctOfSale),
                m.isProductionLate ? "No" : "Sí",
              ])}
            />
          </CardContent>
        </Card>
      </section>

      {/* Garantías */}
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
              headers={["SERIAL", "Cliente", "Equipo", "Mensaje", "Fecha"]}
              rows={dashboard.warrantyEvents.map((event) => [
                `#${event.serialNumber}`,
                event.clientName,
                event.equipmentName,
                event.message,
                formatDateTime(event.createdAt),
              ])}
            />
          </CardContent>
        </Card>
      </section>

      {/* Por equipo + Previos seguidos */}
      <section className="mb-5 grid gap-5 xl:grid-cols-[1fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Por equipo</CardTitle>
            <CardDescription>Promedio de producción total para máquinas completadas en el rango.</CardDescription>
          </CardHeader>
          <CardContent>
            <StatsTable
              empty="No hay máquinas completadas en este rango."
              headers={["Grupo", "Máquinas", "Promedio", "P90"]}
              rows={dashboard.breakdowns.byEquipment.map((row) => [
                row.label,
                String(row.count),
                formatHours(row.averageHours),
                formatHours(row.p90Hours),
              ])}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              Tiempo de previos seguidos
            </CardTitle>
            <CardDescription>Días desde que se pide hasta que se recibe — láser, torno armado, torno ensamble y cojines.</CardDescription>
          </CardHeader>
          <CardContent>
            <StatsTable
              empty="No hay previos seguidos recibidos en este rango."
              headers={["Previo", "Recibidos", "Promedio", "Mediana", "P90", "Máximo"]}
              rows={dashboard.breakdowns.byPrevio
                .filter((previo) => isTrackedPrevio(previo.label))
                .map((previo) => [
                  previo.label,
                  String(previo.count),
                  formatLeadTime(previo.averageHours),
                  formatLeadTime(previo.medianHours),
                  formatLeadTime(previo.p90Hours),
                  formatLeadTime(previo.maxHours),
                ])}
            />
          </CardContent>
        </Card>
      </section>

      {/* Previos pendientes seguidos */}
      <section className="mb-5">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              Previos pendientes seguidos
            </CardTitle>
            <CardDescription>Pedidos que aún no se reciben — láser, torno armado, torno ensamble y cojines, por antigüedad.</CardDescription>
          </CardHeader>
          <CardContent>
            <StatsTable
              empty="No hay previos seguidos pendientes de recibir."
              headers={["SERIAL", "Previo", "Antigüedad", "Cliente"]}
              rows={dashboard.pendingPrevios
                .filter((previo) => isTrackedPrevio(previo.previoName))
                .map((previo) => [
                  `#${previo.serialNumber}`,
                  previo.previoName,
                  formatLeadTime(previo.agingHours),
                  previo.clientName,
                ])}
            />
          </CardContent>
        </Card>
      </section>

      {/* Operario + Calidad de datos */}
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
                headers={["SERIAL", "Máquina", "Detalle"]}
                rows={[
                  ...dashboard.dataQuality.shippedWithoutProductionCompletion,
                  ...dashboard.dataQuality.outOfSequenceStages,
                ]
                  .slice(0, 8)
                  .map((issue) => [`#${issue.serialNumber}`, issue.label, issue.detail])}
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
  icon: typeof Activity;
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

function formatPct(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "Sin datos";
  }

  return `${new Intl.NumberFormat("es-CO", { maximumFractionDigits: 1 }).format(value)} %`;
}

function formatCop(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value) || value === 0) {
    return "Sin datos";
  }

  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatLeadTime(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "Sin datos";
  }
  if (value < 24) {
    return formatHours(value);
  }

  const days = value / 24;
  return `${new Intl.NumberFormat("es-CO", { maximumFractionDigits: 1 }).format(days)} d`;
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("es-CO", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Bogota",
  }).format(new Date(value));
}
