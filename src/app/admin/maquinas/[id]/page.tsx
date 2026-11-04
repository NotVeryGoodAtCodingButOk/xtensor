import type { Metadata } from "next";

export const metadata: Metadata = { title: "Máquina XTENSOR" };
import { AdminShell } from "@/components/app-shell";
import { MachineEditForm } from "@/components/admin/machine-edit-form";
import { MachineEditActions } from "@/components/admin/machine-edit-actions";
import { ConfigWarning } from "@/components/config-warning";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { hasSupabaseConfig } from "@/lib/env";
import { estimateTotalHours, resolveLaborFactor } from "@/services/calculations";
import { listCatalog, listClients, listColors } from "@/services/catalog";
import { getMachine } from "@/services/machines";
import { getSettings, mapSettings } from "@/services/settings";

export default async function EditMachinePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  if (!hasSupabaseConfig()) {
    return (
      <AdminShell>
        <ConfigWarning surface="Editar máquina" />
      </AdminShell>
    );
  }

  const { id } = await params;
  const [machine, catalog, colors, clients, settingsRow] = await Promise.all([
    getMachine(id),
    listCatalog(),
    listColors(),
    listClients(),
    getSettings(),
  ]);
  const settings = mapSettings(settingsRow);
  const { laborFactor, source: laborFactorSource } = resolveLaborFactor(machine.equipmentLaborFactor, settings);
  const budgetHours =
    settings.hourlyCostPerWorkerCop > 0
      ? estimateTotalHours(machine.salePriceCop, settings, machine.equipmentLaborFactor)
      : null;

  return (
    <AdminShell>
      <Card className="max-w-4xl">
        <CardHeader>
          <CardTitle>Editar SERIAL {machine.serialNumber}</CardTitle>
        </CardHeader>
        <CardContent>
          <MachineEditForm
            machine={{
              id: machine.id,
              serialNumber: machine.serialNumber,
              clientId: machine.clientId,
              clientName: machine.clientName,
              equipmentId: machine.equipmentId,
              equipmentCode: machine.equipmentCode,
              equipmentName: machine.equipmentName,
              colorId: machine.colorId,
              city: machine.city,
              line: machine.line,
              salePriceCop: machine.salePriceCop,
              assignedTo: machine.assignedTo,
              promisedDate: machine.promisedDate,
              orderPosition: machine.orderPosition,
            }}
            catalog={catalog.filter((c) => c.is_active).map((c) => ({ id: c.id, code: c.code, name: c.name }))}
            colors={colors.map((color) => ({ id: color.id, name: color.name }))}
            clients={clients.map((client) => ({ id: client.id, name: client.name }))}
            labor={{ laborFactor, laborFactorSource, budgetHours }}
          />
          <div className="mt-6 border-t border-[var(--xt-cement)] pt-4">
            <MachineEditActions
              machineId={machine.id}
              serialNumber={machine.serialNumber}
              status={machine.status}
              undoPreviosMove={false}
            />
          </div>
        </CardContent>
      </Card>
    </AdminShell>
  );
}
