"use client";

import { updateMachineAction } from "@/app/admin/actions";
import { CatalogCombobox } from "@/components/admin/catalog-combobox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MACHINE_LINE_OPTIONS, normalizeMachineLine } from "@/lib/machine-lines";
import type { MachineView } from "@/types/domain";

type MachineEditFormMachine = Pick<
  MachineView,
  | "id"
  | "serialNumber"
  | "clientId"
  | "clientName"
  | "equipmentId"
  | "equipmentCode"
  | "equipmentName"
  | "colorId"
  | "city"
  | "line"
  | "salePriceCop"
  | "assignedTo"
  | "promisedDate"
  | "orderPosition"
>;

type CatalogOption = {
  id: string;
  code: string;
  name: string;
};

type ColorOption = {
  id: string;
  name: string;
};

type ClientOption = {
  id: string;
  name: string;
};

export function MachineEditForm({
  machine,
  catalog,
  colors,
  clients,
}: {
  machine: MachineEditFormMachine;
  catalog: CatalogOption[];
  colors: ColorOption[];
  clients: ClientOption[];
}) {
  return (
    <form
      action={updateMachineAction}
      className="grid gap-4 md:grid-cols-2"
      onSubmit={(event) => {
        const formData = new FormData(event.currentTarget);
        const nextName = String(formData.get("clientName") ?? "").trim();
        const mergeTarget = clients.find(
          (candidate) => candidate.id !== machine.clientId && candidate.name.trim() === nextName,
        );

        if (
          mergeTarget &&
          !confirm(
            `¿Fusionar "${machine.clientName}" con "${mergeTarget.name}"? Sus máquinas y enlaces quedarán en un solo cliente.`,
          )
        ) {
          event.preventDefault();
        }
      }}
    >
      <input type="hidden" name="machineId" value={machine.id} />
      <Field label="SERIAL">
        <Input name="serialNumber" type="number" min="1" defaultValue={machine.serialNumber} required />
      </Field>
      <Field label="Cliente">
        <Input name="clientName" defaultValue={machine.clientName} required />
      </Field>
      <label className="grid gap-2 text-sm font-medium">
        Equipo
        <CatalogCombobox
          items={catalog}
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
  colors: ColorOption[];
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
