import { createMachineAction } from "@/app/admin/actions";
import { AdminShell } from "@/components/app-shell";
import { ConfigWarning } from "@/components/config-warning";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { hasSupabaseConfig } from "@/lib/env";
import { listCatalog, listColors } from "@/services/catalog";

export default async function NewMachinePage() {
  if (!hasSupabaseConfig()) {
    return (
      <AdminShell>
        <ConfigWarning surface="Crear máquina" />
      </AdminShell>
    );
  }

  const [catalog, colors] = await Promise.all([listCatalog(), listColors()]);

  return (
    <AdminShell>
      <Card className="max-w-4xl">
        <CardHeader>
          <CardTitle>Agregar máquina</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={createMachineAction} className="grid gap-4 md:grid-cols-2">
            <Field label="COTI">
              <Input name="cotiNumber" type="number" required />
            </Field>
            <Field label="Cliente">
              <Input name="clientName" required />
            </Field>
            <label className="grid gap-2 text-sm font-medium">
              Equipo del catálogo
              <select name="equipmentId" className="h-10 rounded-[2px] border border-[var(--xt-aluminum)] bg-[var(--xt-white)] px-3 focus-visible:border-[var(--xt-black)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--xt-yellow)]">
                <option value="">Producto personalizado</option>
                {catalog
                  .filter((item) => item.is_active)
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.code} · {item.name}
                    </option>
                  ))}
              </select>
            </label>
            <Field label="Producto personalizado">
              <Input name="customEquipmentName" />
            </Field>
            <label className="grid gap-2 text-sm font-medium">
              Color
              <select name="colorId" className="h-10 rounded-[2px] border border-[var(--xt-aluminum)] bg-[var(--xt-white)] px-3 focus-visible:border-[var(--xt-black)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--xt-yellow)]">
                <option value="">Sin color</option>
                {colors.map((color) => (
                  <option key={color.id} value={color.id}>
                    {color.name}
                  </option>
                ))}
              </select>
            </label>
            <Field label="Ciudad">
              <Input name="city" />
            </Field>
            <Field label="Línea">
              <Input name="line" />
            </Field>
            <Field label="Venta antes de IVA">
              <Input name="salePriceCop" type="number" min="0" required />
            </Field>
            <Field label="Quién">
              <Input name="assignedTo" />
            </Field>
            <Field label="Ofrecido">
              <Input name="promisedDate" type="date" required />
            </Field>
            <Field label="Posición en cola">
              <Input name="orderPosition" type="number" min="1" />
            </Field>
            <div className="md:col-span-2">
              <Button type="submit" size="lg">
                Guardar máquina
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
