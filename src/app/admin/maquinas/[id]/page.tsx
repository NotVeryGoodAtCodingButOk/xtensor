import { updateMachineAction } from "@/app/admin/actions";
import { AdminShell } from "@/components/app-shell";
import { MachineEditActions } from "@/components/admin/machine-edit-actions";
import { ConfigWarning } from "@/components/config-warning";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { hasSupabaseConfig } from "@/lib/env";
import { MACHINE_LINE_OPTIONS, normalizeMachineLine } from "@/lib/machine-lines";
import { getMachine } from "@/services/machines";

export default async function EditMachinePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ moved?: string }>;
}) {
  if (!hasSupabaseConfig()) {
    return (
      <AdminShell>
        <ConfigWarning surface="Editar máquina" />
      </AdminShell>
    );
  }

  const [{ id }, query] = await Promise.all([
    params,
    searchParams ?? Promise.resolve({ moved: undefined }),
  ]);
  const machine = await getMachine(id);

  const movedMessage =
    query.moved === "previos"
      ? "Máquina enviada a previos."
      : query.moved === "production"
        ? "Máquina devuelta a producción."
        : null;

  return (
    <AdminShell>
      <Card className="max-w-4xl">
        <CardHeader>
          <CardTitle>Editar COTI {machine.cotiNumber}</CardTitle>
        </CardHeader>
        <CardContent>
          {movedMessage ? (
            <div className="mb-4 rounded-[2px] border border-[var(--xt-yellow)] bg-[var(--xt-yellow-soft)] px-4 py-3 text-sm font-medium">
              {movedMessage}
            </div>
          ) : null}
          <form action={updateMachineAction} className="grid gap-4 md:grid-cols-2">
            <input type="hidden" name="machineId" value={machine.id} />
            <Field label="COTI">
              <Input name="cotiNumber" type="number" min="1" defaultValue={machine.cotiNumber} required />
            </Field>
            <Field label="Cliente">
              <Input value={machine.clientName} readOnly />
            </Field>
            <Field label="Equipo">
              <Input value={machine.equipmentName} readOnly />
            </Field>
            <Field label="Ciudad">
              <Input name="city" defaultValue={machine.city ?? ""} />
            </Field>
            <LineField defaultValue={machine.line} />
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
          <div className="mt-6 border-t border-[var(--xt-cement)] pt-4">
            <MachineEditActions
              machineId={machine.id}
              cotiNumber={machine.cotiNumber}
              status={machine.status}
              undoPreviosMove={query.moved === "previos"}
            />
          </div>
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

function LineField({ defaultValue }: { defaultValue: string | null }) {
  return (
    <label className="grid gap-2 text-sm font-medium">
      Línea
      <select
        name="line"
        defaultValue={normalizeMachineLine(defaultValue)}
        className="h-10 rounded-[2px] border border-[var(--xt-aluminum)] bg-[var(--xt-white)] px-3 focus-visible:border-[var(--xt-black)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--xt-yellow)]"
      >
        {MACHINE_LINE_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
