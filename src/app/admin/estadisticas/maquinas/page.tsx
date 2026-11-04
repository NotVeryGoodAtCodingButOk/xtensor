import type { Metadata } from "next";
import { Factory, Layers } from "lucide-react";

export const metadata: Metadata = { title: "Máquinas · Estadísticas XTENSOR" };
import {
  EquipmentLaborTable,
  MachineLaborFiltersForm,
  MachineLaborKpis,
  MachineLaborTable,
  TrackingSinceNote,
} from "@/components/admin/machine-labor-report";
import { StatisticsTabs } from "@/components/admin/statistics-tabs";
import { formatDateTime } from "@/components/admin/stats-ui";
import { AdminShell } from "@/components/app-shell";
import { ConfigWarning } from "@/components/config-warning";
import { RealtimeRefresh } from "@/components/realtime-refresh";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { hasSupabaseConfig } from "@/lib/env";
import { listCatalog } from "@/services/catalog";
import { getMachineLaborReport, resolveMachineLaborFilters } from "@/services/machine-labor";

export default async function MachineLaborPage({
  searchParams,
}: {
  searchParams: Promise<{ estado?: string; linea?: string; equipo?: string }>;
}) {
  if (!hasSupabaseConfig()) {
    return (
      <AdminShell>
        <ConfigWarning surface="Estadísticas por máquina" />
      </AdminShell>
    );
  }

  const filters = resolveMachineLaborFilters(await searchParams);
  const [report, catalog] = await Promise.all([getMachineLaborReport(filters), listCatalog()]);
  const equipmentOptions = catalog.map((item) => ({ id: item.id, name: `${item.code} · ${item.name}` }));

  return (
    <AdminShell>
      <RealtimeRefresh
        channelName="admin-machine-labor"
        tables={["machines", "machine_stages", "work_sessions", "work_session_machines"]}
      />
      <StatisticsTabs active="maquinas" />
      <div className="mb-5">
        <p className="xt-eyebrow">Administración</p>
        <h1 className="text-3xl font-bold">Horas por máquina</h1>
        <p className="text-sm text-[var(--xt-steel)]">
          Horas de toda la vida de cada cotización (máximas, llevadas y finales) y % de mano de obra esperado vs. real,
          costeado con el costo hora de cada operario.
        </p>
      </div>

      <div className="mb-4 border border-[var(--xt-black)] bg-[var(--xt-white)] p-4 shadow-[var(--shadow-sm)]">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <MachineLaborFiltersForm filters={filters} equipmentOptions={equipmentOptions} />
          <Badge variant="muted">Calculado {formatDateTime(new Date().toISOString())}</Badge>
        </div>
      </div>

      <section className="mb-5">
        <p className="xt-eyebrow mb-2">Dashboard</p>
        <MachineLaborKpis totals={report.totals} />
      </section>

      <section className="mb-5">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Factory className="h-5 w-5" />
              Por cotización
            </CardTitle>
            <CardDescription>
              H. máx = venta × % MO del equipo ÷ costo hora promedio. H. llevadas = cronómetros en etapas (incluye
              reproceso); en las terminadas son las horas finales. Las actividades asociadas (empaque, carga, instalación,
              garantías) van aparte. Toca un serial para ver su ficha.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <MachineLaborTable rows={report.machines} />
          </CardContent>
        </Card>
      </section>

      <section className="mb-5">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Layers className="h-5 w-5" />
              Por tipo de máquina
            </CardTitle>
            <CardDescription>
              Promedios solo de las terminadas y despachadas con datos completos («Máquinas» cuenta las que entran en el
              promedio). El costo real total suma todas las máquinas del tipo.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <EquipmentLaborTable rows={report.byEquipment} />
          </CardContent>
        </Card>
      </section>

      <TrackingSinceNote trackingSince={report.trackingSince} />
    </AdminShell>
  );
}
