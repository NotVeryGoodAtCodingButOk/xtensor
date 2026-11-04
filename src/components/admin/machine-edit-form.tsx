"use client";

import Link from "next/link";
import { useState } from "react";
import { updateMachineAction } from "@/app/admin/actions";
import { formatLaborHours } from "@/components/admin/budget-meter";
import { CatalogCombobox } from "@/components/admin/catalog-combobox";
import { formatLaborPct } from "@/components/admin/stats-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MACHINE_LINE_OPTIONS, normalizeMachineLine } from "@/lib/machine-lines";
import type { MachineView } from "@/types/domain";
import type { LaborFactorSource } from "@/types/labor-report";

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

/** Mano de obra de la máquina según lo guardado: el % sale del catálogo y no se edita aquí. */
type MachineLaborInfo = {
  laborFactor: number;
  laborFactorSource: LaborFactorSource;
  /** null si el costo hora de Configuración no es válido. */
  budgetHours: number | null;
};

export function MachineEditForm({
  machine,
  catalog,
  colors,
  clients,
  labor,
}: {
  machine: MachineEditFormMachine;
  catalog: CatalogOption[];
  colors: ColorOption[];
  clients: ClientOption[];
  labor?: MachineLaborInfo;
}) {
  const [clientName, setClientName] = useState(machine.clientName);
  const [clientMode, setClientMode] = useState<"reassign" | "rename">("reassign");
  const nameChanged = clientName.trim() !== machine.clientName.trim();

  return (
    <form
      action={updateMachineAction}
      className="grid gap-4 md:grid-cols-2"
      onSubmit={(event) => {
        if (clientMode !== "rename" || !nameChanged) {
          return;
        }
        const nextName = clientName.trim();
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
      <input type="hidden" name="clientMode" value={clientMode} />
      <Field label="SERIAL">
        <Input name="serialNumber" type="number" min="1" defaultValue={machine.serialNumber} required />
      </Field>
      <div className="grid gap-2 text-sm font-medium">
        <label className="grid gap-2">
          Cliente
          <Input
            name="clientName"
            value={clientName}
            onChange={(event) => setClientName(event.target.value)}
            required
          />
        </label>
        {nameChanged ? (
          <fieldset className="grid gap-1.5 rounded-[2px] border border-[var(--xt-aluminum)] bg-[var(--xt-white)] px-3 py-2 text-xs font-normal">
            <legend className="px-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--xt-steel)]">
              Aplicar cambio de cliente a
            </legend>
            <label className="flex items-start gap-2">
              <input
                type="radio"
                name="clientModeChoice"
                className="mt-0.5"
                checked={clientMode === "reassign"}
                onChange={() => setClientMode("reassign")}
              />
              <span>
                <span className="font-medium">Solo esta máquina</span> — la reasigna a «{clientName.trim() || "…"}»
                sin tocar las demás máquinas de «{machine.clientName}».
              </span>
            </label>
            <label className="flex items-start gap-2">
              <input
                type="radio"
                name="clientModeChoice"
                className="mt-0.5"
                checked={clientMode === "rename"}
                onChange={() => setClientMode("rename")}
              />
              <span>
                <span className="font-medium">Todas las máquinas de «{machine.clientName}»</span> — renombra el
                cliente completo (afecta todas sus máquinas y enlaces).
              </span>
            </label>
          </fieldset>
        ) : null}
      </div>
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
      {labor ? <LaborReadout labor={labor} /> : null}
      <div className="md:col-span-2">
        <Button type="submit" size="lg">
          Guardar cambios
        </Button>
      </div>
    </form>
  );
}

function LaborReadout({ labor }: { labor: MachineLaborInfo }) {
  const general = labor.laborFactorSource === "general";
  return (
    <div className="grid gap-1 border border-[var(--xt-cement)] bg-[var(--xt-paper)] px-3 py-2 text-sm md:col-span-2">
      <div className="flex flex-wrap gap-x-8 gap-y-1">
        <span>
          % MO del catálogo:{" "}
          <strong className={general ? "text-[var(--xt-steel)]" : undefined}>
            {formatLaborPct(labor.laborFactor)}
            {general ? " (general)" : ""}
          </strong>
        </span>
        <span title="Horas máximas = venta × % MO del equipo ÷ costo hora promedio">
          H. máx: <strong className="tabular-nums">{labor.budgetHours !== null ? formatLaborHours(labor.budgetHours) : "Sin datos"}</strong>
        </span>
      </div>
      <p className="text-xs text-[var(--xt-steel)]">
        Solo lectura, con la venta y el equipo guardados. El % se cambia en el{" "}
        <Link href="/admin/catalogo" className="underline">
          Catálogo
        </Link>
        {general ? " (este equipo usa el % general de Configuración)" : ""}.
      </p>
    </div>
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
