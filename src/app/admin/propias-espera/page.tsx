import type { Metadata } from "next";

export const metadata: Metadata = { title: "Propias en Espera XTENSOR" };

import { AdminShell } from "@/components/app-shell";
import { ConfigWarning } from "@/components/config-warning";
import { PropiasEnEsperaManager, type OnHoldMachineCard } from "@/components/admin/propias-espera-manager";
import { RealtimeRefresh } from "@/components/realtime-refresh";
import { hasSupabaseConfig } from "@/lib/env";
import { calculateProgressPct } from "@/services/calculations";
import { listMachines } from "@/services/machines";
import { listMachinePrevioRows } from "@/services/previos";

export const dynamic = "force-dynamic";

export default async function PropiasEnEsperaPage() {
  if (!hasSupabaseConfig()) {
    return (
      <AdminShell>
        <ConfigWarning surface="Propias en Espera" />
      </AdminShell>
    );
  }

  const [machines, previoRows] = await Promise.all([listMachines("on_hold"), listMachinePrevioRows()]);
  const previosByMachine = new Map(previoRows.map((row) => [row.machineId, row.previos]));

  const cards: OnHoldMachineCard[] = machines
    .map((machine) => ({
      id: machine.id,
      serialNumber: machine.serialNumber,
      clientName: machine.clientName,
      equipmentName: machine.equipmentName,
      equipmentCode: machine.equipmentCode,
      colorName: machine.colorName,
      promisedDate: machine.promisedDate,
      progressPct: calculateProgressPct(
        machine.stages.map((stage) => ({ stageId: stage.id, completion: stage.completion })),
      ),
      stages: machine.stages.map((stage) => ({ id: stage.id, name: stage.name, completion: stage.completion })),
      previos: previosByMachine.get(machine.id) ?? [],
    }))
    .sort((a, b) => a.serialNumber - b.serialNumber);

  return (
    <AdminShell>
      <RealtimeRefresh
        channelName="admin-propias-espera"
        tables={["machines", "machine_stages", "machine_previos", "machine_previo_events", "colors"]}
      />
      <div className="mb-5 flex items-center justify-between gap-4">
        <div>
          <p className="xt-eyebrow">Administración</p>
          <h1 className="text-3xl font-bold">Propias en Espera</h1>
          <p className="text-sm text-[var(--xt-steel)]">
            Máquinas propias aparcadas a medio fabricar. Conservan sus avances y previos, listas para
            reincorporarse a producción cuando se vendan.
          </p>
        </div>
      </div>
      <PropiasEnEsperaManager machines={cards} />
    </AdminShell>
  );
}
