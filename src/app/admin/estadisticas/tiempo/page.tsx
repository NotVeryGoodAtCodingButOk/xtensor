import type { Metadata } from "next";
import { Timer } from "lucide-react";
import { MachineLaborFiltersForm, TrackingSinceNote } from "@/components/admin/machine-labor-report";
import { MachineTimeChart, MachineTimeLegend } from "@/components/admin/machine-time-chart";
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

export const metadata: Metadata = { title: "Tiempo · Estadísticas XTENSOR" };

const MACHINE_TIME_PATH = "/admin/estadisticas/tiempo";

export default async function MachineTimePage({
  searchParams,
}: {
  searchParams: Promise<{ estado?: string; linea?: string; equipo?: string }>;
}) {
  if (!hasSupabaseConfig()) {
    return (
      <AdminShell>
        <ConfigWarning surface="Tiempo por etapa" />
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
      <StatisticsTabs active="tiempo" />
      <div className="mb-5">
        <p className="xt-eyebrow">Administración</p>
        <h1 className="text-3xl font-bold">Tiempo por etapa</h1>
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
            <MachineTimeLegend />
            <MachineTimeChart rows={report.machines} />
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
