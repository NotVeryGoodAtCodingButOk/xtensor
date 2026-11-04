import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Gauge, History, Layers, PauseCircle, Pencil, Users } from "lucide-react";

export const metadata: Metadata = { title: "Ficha de máquina · Estadísticas XTENSOR" };
import { BudgetMeter } from "@/components/admin/budget-meter";
import {
  MachineLaborActivitiesTable,
  MachineLaborHeader,
  MachineLaborSessionsTable,
  MachineLaborStagesTable,
  MachineLaborWorkersTable,
} from "@/components/admin/machine-labor-detail";
import { MACHINE_LABOR_PATH, TrackingSinceNote } from "@/components/admin/machine-labor-report";
import { StatisticsTabs } from "@/components/admin/statistics-tabs";
import { AdminShell } from "@/components/app-shell";
import { ConfigWarning } from "@/components/config-warning";
import { RealtimeRefresh } from "@/components/realtime-refresh";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { hasSupabaseConfig } from "@/lib/env";
import { getMachineLaborDetail } from "@/services/machine-labor";
import { getFirstSessionStartedAt } from "@/services/work-sessions";

export default async function MachineLaborDetailPage({ params }: { params: Promise<{ id: string }> }) {
  if (!hasSupabaseConfig()) {
    return (
      <AdminShell>
        <ConfigWarning surface="Ficha de máquina" />
      </AdminShell>
    );
  }

  const { id } = await params;
  const [detail, trackingSince] = await Promise.all([getMachineLaborDetail(id), getFirstSessionStartedAt()]);
  if (!detail) {
    notFound();
  }

  const { machine } = detail;
  const isFinal = machine.status === "finished" || machine.status === "shipped";

  return (
    <AdminShell>
      <RealtimeRefresh
        channelName={`admin-machine-labor-${machine.machineId}`}
        tables={["machines", "machine_stages", "work_sessions", "work_session_machines"]}
      />
      <StatisticsTabs active="maquinas" />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Link
          href={MACHINE_LABOR_PATH}
          className="xt-eyebrow inline-flex items-center gap-1 text-[var(--xt-steel)] hover:text-[var(--xt-black)]"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Máquinas
        </Link>
        <Button asChild size="sm" variant="outline">
          <Link href={`/admin/maquinas/${machine.machineId}`}>
            <Pencil className="h-3.5 w-3.5" />
            Editar máquina
          </Link>
        </Button>
      </div>

      <section className="mb-5">
        <MachineLaborHeader detail={detail} />
      </section>

      <section className="mb-5">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Gauge className="h-5 w-5" />
              {isFinal ? "Horas finales vs. máximo" : "Horas llevadas vs. máximo"}
            </CardTitle>
            <CardDescription>
              Horas máximas = venta × % MO del equipo ÷ costo hora promedio. Llevadas = cronómetros en etapas de producción,
              incluido el reproceso.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <BudgetMeter
              budgetHours={machine.budgetHours}
              spentHours={machine.spentHours}
              status={machine.budgetStatus}
              isFinal={isFinal}
            />
          </CardContent>
        </Card>
      </section>

      <section className="mb-5 grid gap-5 xl:grid-cols-[3fr_2fr]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Layers className="h-5 w-5" />
              Por etapa
            </CardTitle>
            <CardDescription>Esperado = H. máx × peso de la etapa en el avance. Real incluye el reproceso.</CardDescription>
          </CardHeader>
          <CardContent>
            <MachineLaborStagesTable rows={detail.byStage} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Operarios
            </CardTitle>
            <CardDescription>Horas de producción en esta máquina, costeadas con el costo hora de cada operario.</CardDescription>
          </CardHeader>
          <CardContent>
            <MachineLaborWorkersTable rows={detail.byWorker} />
          </CardContent>
        </Card>
      </section>

      <section className="mb-5">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <PauseCircle className="h-5 w-5" />
              Actividades asociadas
            </CardTitle>
            <CardDescription>
              Empaque, carga, instalación y garantías marcadas con esta máquina. Van fuera de sus horas máximas.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <MachineLaborActivitiesTable rows={detail.extraByActivity} />
          </CardContent>
        </Card>
      </section>

      <section className="mb-5">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <History className="h-5 w-5" />
              Bitácora
            </CardTitle>
            <CardDescription>
              Cada cronómetro que tocó esta máquina, del más reciente al más antiguo. Las horas son las atribuidas a esta
              máquina: si el cronómetro tenía varias, se repartió por igual.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <MachineLaborSessionsTable rows={detail.sessions} />
          </CardContent>
        </Card>
      </section>

      <TrackingSinceNote trackingSince={trackingSince} />
    </AdminShell>
  );
}
