import type { Metadata } from "next";
import Link from "next/link";
import { Upload } from "lucide-react";

export const metadata: Metadata = { title: "Previos XTENSOR" };
import { AdminShell } from "@/components/app-shell";
import { ExcelImportGuide } from "@/components/admin/excel-import-guide";
import { PreviosManager } from "@/components/admin/previos-manager";
import { ConfigWarning } from "@/components/config-warning";
import { RealtimeRefresh } from "@/components/realtime-refresh";
import { Button } from "@/components/ui/button";
import { ActionTooltip } from "@/components/ui/tooltip";
import { hasSupabaseConfig } from "@/lib/env";
import { listMachinePrevioRows } from "@/services/previos";

export default async function PreviosPage({
  searchParams,
}: {
  searchParams?: Promise<{ seed?: string; machines?: string; previos?: string; imported?: string }>;
}) {
  if (!hasSupabaseConfig()) {
    return (
      <AdminShell>
        <ConfigWarning surface="Previos" />
      </AdminShell>
    );
  }

  const [allMachines, params] = await Promise.all([
    listMachinePrevioRows(),
    searchParams ?? Promise.resolve({ seed: undefined, machines: undefined, previos: undefined, imported: undefined }),
  ]);

  const pendingMachines = allMachines.filter((m) => m.status === "pending");
  const productionMachines = allMachines.filter((m) => m.status === "in_production");

  const seededMessage =
    params.seed === "ok"
      ? `Carga completada: ${params.machines ?? "0"} máquinas actualizadas y ${params.previos ?? "0"} previos agregados.`
      : params.imported
        ? `${params.imported} máquina${Number(params.imported) === 1 ? "" : "s"} importada${Number(params.imported) === 1 ? "" : "s"} y en previos.`
        : null;

  return (
    <AdminShell>
      <RealtimeRefresh channelName="admin-previos" tables={["machines", "machine_previos", "machine_previo_events", "equipment_previos"]} />
      <div className="mb-5 flex items-center justify-between gap-4">
        <div>
          <p className="xt-eyebrow">Administración</p>
          <h1 className="text-3xl font-bold">Previos</h1>
          <p className="text-sm text-[var(--xt-steel)]">Revisión de cotizaciones y seguimiento de materiales.</p>
        </div>
        <ActionTooltip text="Importa máquinas y previos desde la plantilla de Excel.">
          <Button asChild>
            <Link href="/admin/importar">
              <Upload className="h-4 w-4" />
              Importar Excel
            </Link>
          </Button>
        </ActionTooltip>
      </div>
      <div className="mb-5">
        <ExcelImportGuide templateHref="/admin/importar/plantilla" />
      </div>
      <PreviosManager
        pendingMachines={pendingMachines}
        productionMachines={productionMachines}
        seededMessage={seededMessage}
      />
    </AdminShell>
  );
}
