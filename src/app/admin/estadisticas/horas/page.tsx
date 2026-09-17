import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, BarChart3, Clock, Coins, PauseCircle, PieChart, RefreshCcw, Users, Wrench } from "lucide-react";

export const metadata: Metadata = { title: "Horas-hombre XTENSOR" };
import { StatisticsTabs } from "@/components/admin/statistics-tabs";
import { formatCop, formatDateTime, formatHoursDecimal, formatPct, MetricCard, StatsTable } from "@/components/admin/stats-ui";
import { buildTimeSplit, TimeSplitBar } from "@/components/admin/time-split-bar";
import { AdminShell } from "@/components/app-shell";
import { ConfigWarning } from "@/components/config-warning";
import { RealtimeRefresh } from "@/components/realtime-refresh";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { hasSupabaseConfig } from "@/lib/env";
import { getLaborDashboard, resolveLaborRange, type LaborRangePreset } from "@/services/labor-dashboard";

const rangeOptions: Array<{ preset: LaborRangePreset; label: string }> = [
  { preset: "hoy", label: "Hoy" },
  { preset: "esta-semana", label: "Esta semana" },
  { preset: "este-mes", label: "Este mes" },
  { preset: "mes-pasado", label: "Mes pasado" },
  { preset: "ultimos-30-dias", label: "Últimos 30 días" },
];

export default async function LaborStatisticsPage({
  searchParams,
}: {
  searchParams: Promise<{ rango?: string }>;
}) {
  if (!hasSupabaseConfig()) {
    return (
      <AdminShell>
        <ConfigWarning surface="Horas-hombre" />
      </AdminShell>
    );
  }

  const query = await searchParams;
  const range = resolveLaborRange(query.rango);
  const dashboard = await getLaborDashboard(range);
  const { summary, stages, settings } = dashboard;
  const hasRecords = summary.totals.registeredMinutes > 0;

  const splitSegments = buildTimeSplit({
    machineMinutes: summary.totals.machineMinutes,
    reprocessMinutes: summary.totals.reprocessMinutes,
    activities: summary.byActivityType,
  });

  const workerRows = [...summary.byWorker]
    .filter((worker) => worker.availableMinutes > 0 || worker.registeredMinutes > 0)
    .sort((a, b) => b.registeredMinutes - a.registeredMinutes)
    .map((worker) => [
      <Link
        key="name"
        href={`/admin/estadisticas/horas/operario/${worker.workerId}?rango=${range.preset}`}
        className="font-semibold underline decoration-[var(--xt-yellow-deep)] decoration-2 underline-offset-4"
      >
        {worker.fullName}
      </Link>,
      String(worker.daysWithRecords),
      formatHoursDecimal(worker.registeredMinutes),
      formatHoursDecimal(worker.machineMinutes),
      formatHoursDecimal(worker.reprocessMinutes),
      formatHoursDecimal(worker.otherMinutes),
      formatHoursDecimal(worker.unregisteredMinutes),
      formatPct(worker.utilizationPct),
      formatCop(worker.laborCostCop),
    ]);

  const machineRows = [...summary.byMachine]
    .filter((machine) => machine.totalMinutes > 0 || machine.otherMinutes > 0)
    .sort((a, b) => b.laborCostCop + b.otherCostCop - (a.laborCostCop + a.otherCostCop))
    .map((machine) => [
      `#${machine.serialNumber}`,
      <span key="label" className="inline-flex items-center gap-2 whitespace-nowrap">
        {machine.label}
        {machine.isWarranty ? <Badge variant="warning">Garantía</Badge> : null}
      </span>,
      formatHoursDecimal(machine.totalMinutes),
      formatHoursDecimal(machine.reprocessMinutes),
      formatHoursDecimal(machine.otherMinutes),
      costCell(machine.laborCostCop),
      costCell(machine.otherCostCop),
      <strong key="total">{costCell(machine.laborCostCop + machine.otherCostCop)}</strong>,
      machine.estimatedHours !== null ? formatHoursDecimal(machine.estimatedHours * 60) : "Sin datos",
      deviationCell(machine.deviationPct),
      ...stages.map((stage) => formatHoursDecimal(machine.minutesByStage[stage.id] ?? 0)),
    ]);

  const activityTypeRows = [...summary.byActivityType].map((activity) => [
    activity.name,
    formatHoursDecimal(activity.minutes),
    String(activity.sessionCount),
    String(activity.workerCount),
    formatCop(activity.laborCostCop),
  ]);

  const otherActivityRows = summary.sessions
    .filter((session) => session.kind === "other")
    .map((session) => [
      session.fullName,
      session.activityTypeNames.join(" + ") || session.note || "Sin clasificar",
      session.machineSerialNumbers.map((serial) => `#${serial}`).join(", ") || "—",
      formatDateTime(session.startedAt),
      formatHoursDecimal(session.minutes),
    ]);

  const openSessionRows = summary.dataQuality.openSessionsStartedBeforeToday.map((session) => [
    session.fullName,
    formatDateTime(session.startedAt),
  ]);

  const breaksLabel =
    settings.shiftBreaks.length > 0
      ? settings.shiftBreaks.map((shiftBreak) => `${shiftBreak.start} (${shiftBreak.minutes} min)`).join(", ")
      : "sin pausas configuradas";

  return (
    <AdminShell>
      <RealtimeRefresh channelName="admin-labor" tables={["work_sessions", "work_session_machines", "stage_logs"]} />
      <StatisticsTabs active="horas" />
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="xt-eyebrow">Administración</p>
          <h1 className="text-3xl font-bold">Horas-hombre</h1>
          <p className="text-sm text-[var(--xt-steel)]">
            Tiempo real de planta capturado por los operarios, recortado al horario y las pausas de la fábrica.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {rangeOptions.map((option) => (
            <Button
              key={option.preset}
              asChild
              variant={range.preset === option.preset ? "default" : "outline"}
              size="sm"
            >
              <Link href={`/admin/estadisticas/horas?rango=${option.preset}`}>{option.label}</Link>
            </Button>
          ))}
        </div>
      </div>

      <div className="mb-4 border border-[var(--xt-black)] bg-[var(--xt-white)] p-4 shadow-[var(--shadow-sm)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="xt-eyebrow">Rango</p>
            <p className="text-lg font-semibold">{range.label}</p>
          </div>
          <Badge variant="muted">Calculado {formatDateTime(new Date().toISOString())}</Badge>
        </div>
      </div>

      {!hasRecords ? (
        <Card className="mb-5 border-[var(--xt-black)] bg-[var(--xt-yellow-soft)]">
          <CardContent className="flex items-center gap-3 py-5">
            <Clock className="h-8 w-8 shrink-0 text-[var(--xt-steel)]" />
            <div>
              <p className="font-semibold">Todavía no hay tiempo registrado en este rango.</p>
              <p className="text-sm text-[var(--xt-steel)]">
                La captura de horas empieza cuando un operario usa Iniciar cronómetro y Terminar en la tablet de planta, en una
                etapa de producción o en una actividad del catálogo.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* KPIs */}
      <section className="mb-5">
        <p className="xt-eyebrow mb-2">Dashboard</p>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            icon={Clock}
            eyebrow="Tiempo capturado"
            title="Horas registradas"
            value={formatHoursDecimal(summary.totals.registeredMinutes)}
            detail={range.label}
            formula="summarizeLabor(sessions).totals.registeredMinutes"
          />
          <MetricCard
            icon={Wrench}
            eyebrow="Producción"
            title="Horas en máquinas"
            value={formatHoursDecimal(summary.totals.machineMinutes)}
            detail="Tiempo en etapas de producción, sin reproceso."
            formula="totals.machineMinutes"
          />
          <MetricCard
            icon={RefreshCcw}
            eyebrow="Reprocesos"
            title="Horas reproceso"
            value={formatHoursDecimal(summary.totals.reprocessMinutes)}
            detail="Tiempo en etapas que se están rehaciendo."
            formula="totals.reprocessMinutes"
          />
          <MetricCard
            icon={PauseCircle}
            eyebrow="Fuera de etapas"
            title="Horas en actividades"
            value={formatHoursDecimal(summary.totals.otherMinutes)}
            detail="Aseo, orden, mejoras, arreglos e instalaciones."
            formula="totals.otherMinutes"
          />
          <MetricCard
            icon={AlertTriangle}
            eyebrow="Brecha"
            title="Sin registrar"
            value={formatHoursDecimal(summary.totals.unregisteredMinutes)}
            detail="Disponible menos registrado, solo días con actividad."
            formula="totals.availableMinutes - totals.registeredMinutes"
          />
          <MetricCard
            icon={BarChart3}
            eyebrow="Aprovechamiento"
            title="Utilización"
            value={formatPct(summary.totals.utilizationPct)}
            detail="Registrado sobre disponible en días con actividad."
            formula="totals.registeredMinutes / totals.availableMinutes"
          />
          <MetricCard
            icon={Coins}
            eyebrow="Costo"
            title="Costo mano de obra"
            value={formatCop(summary.totals.laborCostCop)}
            detail={range.label}
            formula="Σ horas de sesión × costo hora del operario"
          />
        </div>
      </section>

      {/* En qué se va el tiempo */}
      <section className="mb-5">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <PieChart className="h-5 w-5" />
              En qué se va el tiempo
            </CardTitle>
            <CardDescription>
              Reparto de las horas registradas entre producción, reproceso y cada actividad del catálogo.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <TimeSplitBar segments={splitSegments} empty="No hay tiempo registrado en este rango." />
          </CardContent>
        </Card>
      </section>

      {/* Por operario */}
      <section className="mb-5">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Por operario
            </CardTitle>
            <CardDescription>
              Horas registradas por operario, desglosadas por tipo de actividad. Toca un nombre para ver su detalle.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <StatsTable
              empty="No hay operarios con horas en este rango."
              headers={[
                "Operario",
                "Días con registro",
                "Jornada (h)",
                "Máquinas (h)",
                "Reproceso (h)",
                "Actividades (h)",
                "Sin registrar (h)",
                "Utilización %",
                "Costo",
              ]}
              rows={workerRows}
            />
          </CardContent>
        </Card>
      </section>

      {/* Por máquina */}
      <section className="mb-5">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Wrench className="h-5 w-5" />
              Por máquina
            </CardTitle>
            <CardDescription>
              Ordenadas por costo. El costo de actividades (arreglos, instalaciones) va aparte del de producción: es plata
              real, pero no estaba en las horas estimadas, así que no entra en la desviación.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <StatsTable
              empty="No hay máquinas con horas registradas en este rango."
              headers={[
                "Serial",
                "Máquina",
                "Horas-hombre",
                "Reproceso (h)",
                "Actividades (h)",
                "Costo producción",
                "Costo actividades",
                "Costo total",
                "Horas estimadas",
                "Desviación %",
                ...stages.map((stage) => stage.name),
              ]}
              rows={machineRows}
            />
          </CardContent>
        </Card>
      </section>

      {/* Por actividad */}
      <section className="mb-5">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <PauseCircle className="h-5 w-5" />
              Por actividad
            </CardTitle>
            <CardDescription>
              Horas fuera de las etapas de producción, por actividad del catálogo. Cuando un operario marca varias
              actividades en un mismo cronómetro, el tiempo se reparte por igual entre ellas.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <StatsTable
              empty="No hay actividades registradas en este rango."
              headers={["Actividad", "Horas", "Sesiones", "Operarios", "Costo"]}
              rows={activityTypeRows}
            />
          </CardContent>
        </Card>
      </section>

      {/* Detalle de actividades + Calidad de datos */}
      <section className="mb-5 grid gap-5 xl:grid-cols-[1fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Detalle de actividades</CardTitle>
            <CardDescription>Cada cronómetro capturado fuera de una etapa de producción.</CardDescription>
          </CardHeader>
          <CardContent>
            <StatsTable
              empty="No hay actividades en este rango."
              headers={["Operario", "Actividad", "Máquinas", "Inicio", "Horas"]}
              rows={otherActivityRows}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" />
              Calidad de datos
            </CardTitle>
            <CardDescription>Señales que pueden distorsionar las horas o el costo de mano de obra.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="mb-4 grid gap-3 sm:grid-cols-2">
              <QualityStat
                label="Sesiones abiertas desde antes de hoy"
                value={summary.dataQuality.openSessionsStartedBeforeToday.length}
                detail="El operario no marcó Terminar ni Pausar; su tiempo sigue contando hasta ahora."
              />
              <QualityStat
                label="Marcadas sin tiempo"
                value={summary.dataQuality.doneMarksWithoutSession.count}
                detail="Etapas marcadas al 100% sin una sesión de tiempo que las respalde."
              />
            </div>
            <StatsTable
              empty="No hay sesiones abiertas desde antes de hoy."
              headers={["Operario", "Inicio"]}
              rows={openSessionRows}
            />
          </CardContent>
        </Card>
      </section>

      <p className="text-xs text-[var(--xt-steel)]">
        Tiempo recortado al horario de planta (entrada {settings.shiftStart}, salida lun–jue {settings.shiftEndMonThu}, vie{" "}
        {settings.shiftEndFri}
        {settings.shiftEndSat ? `, sáb ${settings.shiftEndSat}` : ""}; pausas {breaksLabel}). Días sin registros no cuentan como
        tiempo disponible.{" "}
        <Link href="/admin/configuracion" className="underline">
          Ver configuración de horario
        </Link>
        .
      </p>
    </AdminShell>
  );
}

function QualityStat({ label, value, detail }: { label: string; value: number; detail: string }) {
  return (
    <div className="border border-[var(--xt-cement)] p-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-semibold">{label}</span>
        <Badge variant={value > 0 ? "warning" : "success"}>{value}</Badge>
      </div>
      <p className="mt-1 text-xs text-[var(--xt-steel)]">{detail}</p>
    </div>
  );
}

/** Un costo en cero es "sin nada registrado", no "sin datos": se muestra como raya. */
function costCell(value: number) {
  return value > 0 ? formatCop(value) : "—";
}

function deviationCell(pct: number | null) {
  if (pct === null) {
    return "Sin datos";
  }

  const className = pct > 10 ? "font-semibold text-[var(--line-pro-red)]" : pct <= 0 ? "font-semibold text-[var(--line-bio-green)]" : undefined;
  const formatted = `${pct >= 0 ? "+" : ""}${new Intl.NumberFormat("es-CO", { maximumFractionDigits: 1 }).format(pct)} %`;

  return <span className={className}>{formatted}</span>;
}
