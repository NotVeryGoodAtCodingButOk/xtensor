import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, BarChart3, Clock, Coins, PauseCircle, Wrench } from "lucide-react";

export const metadata: Metadata = { title: "Operario · Horas-hombre XTENSOR" };
import { formatCop, formatDateTime, formatHoursDecimal, formatPct, MetricCard, StatsTable } from "@/components/admin/stats-ui";
import { StatisticsTabs } from "@/components/admin/statistics-tabs";
import { buildTimeSplit, TimeSplitBar } from "@/components/admin/time-split-bar";
import { AdminShell } from "@/components/app-shell";
import { ConfigWarning } from "@/components/config-warning";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { hasSupabaseConfig } from "@/lib/env";
import { getLaborDashboard, resolveLaborRange, type LaborRangePreset } from "@/services/labor-dashboard";
import type { LaborSessionDetail } from "@/services/labor-time";

const rangeOptions: Array<{ preset: LaborRangePreset; label: string }> = [
  { preset: "hoy", label: "Hoy" },
  { preset: "esta-semana", label: "Esta semana" },
  { preset: "este-mes", label: "Este mes" },
  { preset: "mes-pasado", label: "Mes pasado" },
  { preset: "ultimos-30-dias", label: "Últimos 30 días" },
];

export default async function WorkerLaborPage({
  params,
  searchParams,
}: {
  params: Promise<{ workerId: string }>;
  searchParams: Promise<{ rango?: string }>;
}) {
  if (!hasSupabaseConfig()) {
    return (
      <AdminShell>
        <ConfigWarning surface="Horas por operario" />
      </AdminShell>
    );
  }

  const [{ workerId }, query] = await Promise.all([params, searchParams]);
  const range = resolveLaborRange(query.rango);
  const { summary } = await getLaborDashboard(range);

  const worker = summary.byWorker.find((entry) => entry.workerId === workerId);
  if (!worker) {
    notFound();
  }

  const machineLabelById = new Map(summary.byMachine.map((machine) => [machine.machineId, machine.label]));

  const activities = summary.byWorkerActivityType
    .filter((entry) => entry.workerId === workerId)
    .sort((a, b) => b.minutes - a.minutes);

  const splitSegments = buildTimeSplit({
    machineMinutes: worker.machineMinutes,
    reprocessMinutes: worker.reprocessMinutes,
    activities,
  });

  const machineRows = summary.byWorkerMachine
    .filter((entry) => entry.workerId === workerId)
    .sort((a, b) => b.minutes - a.minutes)
    .map((entry) => [
      `#${entry.serialNumber}`,
      machineLabelById.get(entry.machineId) ?? "Máquina sin datos",
      entry.stageName,
      formatHoursDecimal(entry.minutes),
      entry.isReprocess ? <Badge variant="warning">Reproceso</Badge> : "—",
    ]);

  const activityRows = activities.map((entry) => [entry.name, formatHoursDecimal(entry.minutes)]);

  const sessionRows = summary.sessions
    .filter((session) => session.workerId === workerId)
    .map((session) => [
      formatDateTime(session.startedAt),
      <span key="task" className="inline-flex items-center gap-2">
        {describeSessionTask(session)}
        {session.isReprocess ? <Badge variant="warning">Reproceso</Badge> : null}
      </span>,
      session.machineSerialNumbers.map((serial) => `#${serial}`).join(", ") || "—",
      formatHoursDecimal(session.minutes),
      sessionStatus(session),
    ]);

  return (
    <AdminShell>
      <StatisticsTabs active="horas" />
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link
            href={`/admin/estadisticas/horas?rango=${range.preset}`}
            className="xt-eyebrow inline-flex items-center gap-1 text-[var(--xt-steel)] hover:text-[var(--xt-black)]"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Horas-hombre
          </Link>
          <h1 className="text-3xl font-bold">{worker.fullName}</h1>
          <p className="text-sm text-[var(--xt-steel)]">
            {range.label} · {worker.daysWithRecords} {worker.daysWithRecords === 1 ? "día" : "días"} con registro
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
              <Link href={`/admin/estadisticas/horas/operario/${workerId}?rango=${option.preset}`}>{option.label}</Link>
            </Button>
          ))}
        </div>
      </div>

      <section className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          icon={Clock}
          eyebrow="Tiempo capturado"
          title="Horas registradas"
          value={formatHoursDecimal(worker.registeredMinutes)}
          detail={range.label}
          formula="byWorker.registeredMinutes"
          prominent
        />
        <MetricCard
          icon={Wrench}
          eyebrow="Producción"
          title="Horas en máquinas"
          value={formatHoursDecimal(worker.machineMinutes)}
          detail="Etapas de producción, sin reproceso."
          formula="byWorker.machineMinutes"
        />
        <MetricCard
          icon={PauseCircle}
          eyebrow="Fuera de etapas"
          title="Horas en actividades"
          value={formatHoursDecimal(worker.otherMinutes)}
          detail="Aseo, orden, mejoras, arreglos e instalaciones."
          formula="byWorker.otherMinutes"
        />
        <MetricCard
          icon={BarChart3}
          eyebrow="Aprovechamiento"
          title="Utilización"
          value={formatPct(worker.utilizationPct)}
          detail={`Sin registrar: ${formatHoursDecimal(worker.unregisteredMinutes)}`}
          formula="registeredMinutes / availableMinutes"
        />
        <MetricCard
          icon={Coins}
          eyebrow="Costo"
          title="Costo mano de obra"
          value={formatCop(worker.laborCostCop)}
          detail="Horas registradas × su costo hora."
          formula="Σ horas de sesión × costo hora del operario"
        />
      </section>

      <section className="mb-5">
        <Card>
          <CardHeader>
            <CardTitle>En qué se le va el tiempo</CardTitle>
            <CardDescription>Reparto de sus horas entre producción, reproceso y cada actividad.</CardDescription>
          </CardHeader>
          <CardContent>
            <TimeSplitBar segments={splitSegments} empty="No tiene tiempo registrado en este rango." />
          </CardContent>
        </Card>
      </section>

      <section className="mb-5 grid gap-5 xl:grid-cols-[2fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Máquinas y etapas</CardTitle>
            <CardDescription>
              Horas de producción. Cuando trabajó varias máquinas en un mismo cronómetro, el tiempo se reparte por igual
              entre ellas.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <StatsTable
              empty="No trabajó en máquinas en este rango."
              headers={["Serial", "Máquina", "Etapa", "Horas", "Reproceso"]}
              rows={machineRows}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Actividades</CardTitle>
            <CardDescription>Horas fuera de las etapas de producción.</CardDescription>
          </CardHeader>
          <CardContent>
            <StatsTable empty="No registró actividades en este rango." headers={["Actividad", "Horas"]} rows={activityRows} />
          </CardContent>
        </Card>
      </section>

      <section className="mb-5">
        <Card>
          <CardHeader>
            <CardTitle>Bitácora</CardTitle>
            <CardDescription>Cada cronómetro que marcó, del más reciente al más antiguo.</CardDescription>
          </CardHeader>
          <CardContent>
            <StatsTable
              empty="No hay cronómetros en este rango."
              headers={["Inicio", "Tarea", "Máquinas", "Horas", "Estado"]}
              rows={sessionRows}
            />
          </CardContent>
        </Card>
      </section>
    </AdminShell>
  );
}

function describeSessionTask(session: LaborSessionDetail) {
  if (session.kind === "stage") {
    return session.stageName ?? "Etapa";
  }

  // El texto libre solo sobrevive en sesiones anteriores al catálogo.
  return session.activityTypeNames.join(" + ") || session.note.trim() || "Actividad";
}

function sessionStatus(session: LaborSessionDetail) {
  if (session.endedAt === null) {
    return <Badge variant="warning">En curso</Badge>;
  }
  if (session.endReason === "paused") {
    return <Badge variant="muted">Pausada</Badge>;
  }

  return formatDateTime(session.endedAt);
}
