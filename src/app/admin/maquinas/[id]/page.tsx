import { updateMachineAction } from "@/app/admin/actions";
import { AdminShell } from "@/components/app-shell";
import { ConfigWarning } from "@/components/config-warning";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { hasSupabaseConfig } from "@/lib/env";
import { getMachine } from "@/services/machines";

export default async function EditMachinePage({ params }: { params: Promise<{ id: string }> }) {
  if (!hasSupabaseConfig()) {
    return (
      <AdminShell>
        <ConfigWarning surface="Editar máquina" />
      </AdminShell>
    );
  }

  const { id } = await params;
  const machine = await getMachine(id);

  return (
    <AdminShell>
      <Card className="max-w-4xl">
        <CardHeader>
          <CardTitle>Editar COTI {machine.cotiNumber}</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={updateMachineAction} className="grid gap-4 md:grid-cols-2">
            <input type="hidden" name="machineId" value={machine.id} />
            <Field label="Cliente">
              <Input value={machine.clientName} readOnly />
            </Field>
            <Field label="Equipo">
              <Input value={machine.equipmentName} readOnly />
            </Field>
            <Field label="Ciudad">
              <Input name="city" defaultValue={machine.city ?? ""} />
            </Field>
            <Field label="Línea">
              <Input name="line" defaultValue={machine.line ?? ""} />
            </Field>
            <Field label="Venta antes de IVA">
              <Input name="salePriceCop" type="number" min="0" defaultValue={machine.salePriceCop} required />
            </Field>
            <Field label="Quién">
              <Input name="assignedTo" defaultValue={machine.assignedTo ?? ""} />
            </Field>
            <Field label="Ofrecido">
              <Input name="promisedDate" type="date" defaultValue={machine.promisedDate} required />
            </Field>
            <Field label="Posición en cola">
              <Input name="orderPosition" type="number" min="1" defaultValue={machine.orderPosition} />
            </Field>
            <div className="md:col-span-2">
              <Button type="submit" size="lg">
                Guardar cambios
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </AdminShell>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-2 text-sm font-medium">
      {label}
      {children}
    </label>
  );
}
