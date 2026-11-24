import type { Metadata } from "next";
import { Timer } from "lucide-react";
import Link from "next/link";
import { formatLaborHours } from "@/components/admin/budget-meter";
import {
  MACHINE_STATUS_LABEL,
  MachineLaborFiltersForm,
  machineLaborDetailHref,
  PartialDataBadge,
  TrackingSinceNote,
} from "@/components/admin/machine-labor-report";
import { STAGE_COLORS, TimeBarList, TimeLegend, type TimeBarRow } from "@/components/admin/time-bars";
import { StatisticsTabs } from "@/components/admin/statistics-tabs";
import { formatDateTime } from "@/components/admin/stats-ui";
import { AdminShell } from "@/components/app-shell";
import { ConfigWarning } from "@/components/config-warning";
import { RealtimeRefresh } from "@/components/realtime-refresh";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { hasSupabaseConfig } from "@/lib/env";
import { listCatalog } from "@/services/catalog";
import { getMachineTimeReport, resolveMachineLaborFilters } from "@/services/machine-labor";
import type { MachineTimeRow } from "@/types/labor-report";

export const metadata: Metadata = { title: "Tiempos máquinas · Estadísticas XTENSOR" };

const MACHINE_TIME_PATH = "/admin/estadisticas/tiempos-maquinas";

function toBarRow(row: MachineTimeRow): TimeBarRow {
  return {
    id: row.machineId,
    header: (
      <>
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
        {row.hasPartialData ? (
          <div className="mt-1">
            <PartialDataBadge />
          </div>
        ) : null}
      </>
    ),
    segments: row.byStage.map((stage) => ({
      key: String(stage.stageId),
      label: stage.stageName,
      hours: stage.hours,
      color: STAGE_COLORS[stage.stageId],
      note: stage.reprocessHours > 0 ? `${formatLaborHours(stage.reprocessHours)} reproceso` : undefined,
    })),
    totalHours: row.spentHours,
    totalNote: row.budgetHours > 0 ? `de ${formatLaborHours(row.budgetHours)} máx` : "sin máximo",
    markerHours: row.budgetHours,
  };
}

export default async function MachineTimePage({
  searchParams,
}: {
  searchParams: Promise<{ estado?: string; linea?: string; equipo?: string }>;
}) {
  if (!hasSupabaseConfig()) {
    return (
      <AdminShell>
        <ConfigWarning surface="Tiempos máquinas" />
      </AdminShell>
    );
  }

  const filters = resolveMachineLaborFilters(await searchParams);
  const [report, catalog] = await Promise.all([getMachineTimeReport(filters), listCatalog()]);
  const equipmentOptions = catalog.map((item) => ({ id: item.id, name: `${item.code} · ${item.name}` }));

  return (
    <AdminShell>
      <RealtimeRefresh
        channelName="admin-machine-time"
        tables={["machines", "work_sessions", "work_session_machines"]}
      />
      <StatisticsTabs active="tiempos-maquinas" />
      <div className="mb-5">
        <p className="xt-eyebrow">Administración</p>
        <h1 className="text-3xl font-bold">Tiempos máquinas</h1>
        <p className="text-sm text-[var(--xt-steel)]">
          Cuánto tiempo se gastó en cada procedimiento de cada cotización, con los cronómetros de planta.
        </p>
      </div>

      <div className="mb-4 border border-[var(--xt-black)] bg-[var(--xt-white)] p-4 shadow-[var(--shadow-sm)]">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <MachineLaborFiltersForm filters={filters} equipmentOptions={equipmentOptions} action={MACHINE_TIME_PATH} />
          <Badge variant="muted">Calculado {formatDateTime(new Date().toISOString())}</Badge>
        </div>
      </div>

      <section className="mb-5">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Timer className="h-5 w-5" />
              Por cotización
            </CardTitle>
            <CardDescription>
              Horas de jornada por etapa (incluye reproceso). El largo de la barra compara las máquinas entre sí; pasa el
              cursor por un color para ver la etapa. Toca un serial para ver su ficha.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <TimeLegend marker />
            <TimeBarList rows={report.machines.map(toBarRow)} empty="No hay cotizaciones con cronómetros con estos filtros." />
            {report.withoutTimersCount > 0 ? (
              <p className="text-xs text-[var(--xt-steel)]">
                {report.withoutTimersCount} cotización{report.withoutTimersCount === 1 ? "" : "es"} de este filtro no
                tiene{report.withoutTimersCount === 1 ? "" : "n"} cronómetros de etapa y no se muestra
                {report.withoutTimersCount === 1 ? "" : "n"}.
              </p>
            ) : null}
          </CardContent>
        </Card>
      </section>

      <TrackingSinceNote trackingSince={report.trackingSince} />
    </AdminShell>
  );
}
