import type { Metadata } from "next";
import Link from "next/link";
import { Users } from "lucide-react";
import { formatLaborHours } from "@/components/admin/budget-meter";
import { StatisticsTabs } from "@/components/admin/statistics-tabs";
import { formatDateTime } from "@/components/admin/stats-ui";
import { ACTIVITY_COLOR, STAGE_COLORS, TimeBarList, TimeLegend, type TimeBarRow } from "@/components/admin/time-bars";
import { AdminShell } from "@/components/app-shell";
import { ConfigWarning } from "@/components/config-warning";
import { RealtimeRefresh } from "@/components/realtime-refresh";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { hasSupabaseConfig } from "@/lib/env";
import { resolveLaborRange, type LaborRangePreset } from "@/services/labor-dashboard";
import { getWorkerTimeReport, type WorkerTimeRow } from "@/services/worker-time";

export const metadata: Metadata = { title: "Tiempos operarios · Estadísticas XTENSOR" };

const WORKER_TIME_PATH = "/admin/estadisticas/tiempos-operarios";

const rangeOptions: Array<{ preset: LaborRangePreset; label: string }> = [
  { preset: "hoy", label: "Hoy" },
  { preset: "esta-semana", label: "Esta semana" },
  { preset: "este-mes", label: "Este mes" },
  { preset: "mes-pasado", label: "Mes pasado" },
  { preset: "ultimos-30-dias", label: "Últimos 30 días" },
  { preset: "ultimos-90-dias", label: "Últimos 3 meses" },
  { preset: "este-ano", label: "Este año" },
];

function toBarRow(row: WorkerTimeRow, preset: LaborRangePreset): TimeBarRow {
  return {
    id: row.workerId,
    header: (
      <Link
        href={`/admin/estadisticas/horas/operario/${row.workerId}?rango=${preset}`}
        className="font-semibold underline decoration-[var(--xt-yellow-deep)] decoration-2 underline-offset-4"
      >
        {row.fullName}
      </Link>
    ),
    segments: [
      ...row.byStage.map((stage) => ({
        key: String(stage.stageId),
        label: stage.stageName,
        hours: stage.hours,
        color: STAGE_COLORS[stage.stageId],
        note: stage.reprocessHours > 0 ? `${formatLaborHours(stage.reprocessHours)} reproceso` : undefined,
      })),
      {
        key: "actividades",
        label: "Actividades",
        hours: row.activityHours,
        color: ACTIVITY_COLOR,
        note: row.activities.map((activity) => `${activity.name} ${formatLaborHours(activity.hours)}`).join(", ") || undefined,
      },
    ],
    totalHours: row.totalHours,
    totalNote: "registradas",
  };
}

export default async function WorkerTimePage({ searchParams }: { searchParams: Promise<{ rango?: string }> }) {
  if (!hasSupabaseConfig()) {
    return (
      <AdminShell>
        <ConfigWarning surface="Tiempos operarios" />
      </AdminShell>
    );
  }

  const range = resolveLaborRange((await searchParams).rango);
  const report = await getWorkerTimeReport(range);

  return (
    <AdminShell>
      <RealtimeRefresh channelName="admin-worker-time" tables={["work_sessions", "work_session_machines"]} />
      <StatisticsTabs active="tiempos-operarios" />
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="xt-eyebrow">Administración</p>
          <h1 className="text-3xl font-bold">Tiempos operarios</h1>
          <p className="text-sm text-[var(--xt-steel)]">
            En qué se le fue el tiempo a cada operario: horas por etapa y actividades, con los cronómetros de planta.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {rangeOptions.map((option) => (
            <Button key={option.preset} asChild variant={range.preset === option.preset ? "default" : "outline"} size="sm">
              <Link href={`${WORKER_TIME_PATH}?rango=${option.preset}`}>{option.label}</Link>
            </Button>
          ))}
        </div>
      </div>

      <section className="mb-5">
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  Por operario · {range.label}
                </CardTitle>
                <CardDescription>
                  Horas de jornada registradas (incluye reproceso). Actividades = 5S, empaque, carga, instalación,
                  arreglos y demás tiempo sin etapa. Pasa el cursor por un color para ver el detalle; toca un nombre para
                  ver su bitácora.
                </CardDescription>
              </div>
              <Badge variant="muted">Calculado {formatDateTime(new Date().toISOString())}</Badge>
            </div>
          </CardHeader>
          <CardContent className="grid gap-4">
            <TimeLegend activities />
            <TimeBarList
              rows={report.workers.map((row) => toBarRow(row, range.preset))}
              empty="Ningún operario registró tiempo en este rango."
            />
          </CardContent>
        </Card>
      </section>
    </AdminShell>
  );
}
