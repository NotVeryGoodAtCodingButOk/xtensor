import type { Metadata } from "next";
import { updateMachineAction } from "@/app/admin/actions";

export const metadata: Metadata = { title: "Máquina XTENSOR" };
import { AdminShell } from "@/components/app-shell";
import { CatalogCombobox } from "@/components/admin/catalog-combobox";
import { MachineEditActions } from "@/components/admin/machine-edit-actions";
import { ConfigWarning } from "@/components/config-warning";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { hasSupabaseConfig } from "@/lib/env";
import { MACHINE_LINE_OPTIONS, normalizeMachineLine } from "@/lib/machine-lines";
import { listCatalog, listColors } from "@/services/catalog";
import { getMachine } from "@/services/machines";

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
  const [machine, catalog, colors] = await Promise.all([getMachine(id), listCatalog(), listColors()]);

  return (
    <AdminShell>
      <Card className="max-w-4xl">
        <CardHeader>
          <CardTitle>Editar SEÑAL {machine.senalNumber}</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={updateMachineAction} className="grid gap-4 md:grid-cols-2">
            <input type="hidden" name="machineId" value={machine.id} />
            <Field label="SEÑAL">
              <Input name="senalNumber" type="number" min="1" defaultValue={machine.senalNumber} required />
            </Field>
            <Field label="Cliente">
              <Input value={machine.clientName} readOnly />
            </Field>
            <label className="grid gap-2 text-sm font-medium">
              Equipo
              <CatalogCombobox
                items={catalog.filter((c) => c.is_active).map((c) => ({ id: c.id, code: c.code, name: c.name }))}
                defaultId={machine.equipmentId}
                defaultLabel={
                  machine.equipmentId && machine.equipmentCode
                    ? `${machine.equipmentCode} · ${machine.equipmentName}`
                    : machine.equipmentName
                }
              />
            </label>
            <ColorField colors={colors} defaultId={machine.colorId} />
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
            <Field label="Prometido">
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
              senalNumber={machine.senalNumber}
              status={machine.status}
              undoPreviosMove={false}
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

function ColorField({
  colors,
  defaultId,
}: {
  colors: { id: string; name: string }[];
  defaultId: string | null;
}) {
  return (
    <label className="grid gap-2 text-sm font-medium">
      Color
      <select
        name="colorId"
        defaultValue={defaultId ?? ""}
        className="h-10 rounded-[2px] border border-[var(--xt-aluminum)] bg-[var(--xt-white)] px-3 focus-visible:border-[var(--xt-black)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--xt-yellow)]"
      >
        <option value="">Sin color</option>
        {colors.map((color) => (
          <option key={color.id} value={color.id}>
            {color.name}
          </option>
        ))}
      </select>
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
