"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { PlayCircle, Search } from "lucide-react";
import { reactivateHoldMachineAction, toggleMachinePrevioAction, updateMachineClientAction } from "@/app/admin/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ActionTooltip, CellTooltip } from "@/components/ui/tooltip";
import { cn, formatPercent } from "@/lib/utils";
import { formatDateEs } from "@/services/schedule";
import type { MachinePrevioView } from "@/types/domain";

export type OnHoldMachineCard = {
  id: string;
  serialNumber: number;
  clientName: string;
  equipmentName: string;
  equipmentCode: string | null;
  colorName: string | null;
  promisedDate: string;
  progressPct: number;
  stages: { id: number; name: string; completion: number }[];
  previos: MachinePrevioView[];
};

// Short stage labels mirror the production table so the board reads the same.
const STAGE_SHORT: Record<string, string> = {
  Material: "Mat",
  Armar: "Arm",
  Resoldar: "Res",
  Pulir: "Pul",
  Pintar: "Pin",
  Ensamblar: "Ens",
  Empacar: "Emp",
};

function StagePin({ name, completion }: { name: string; completion: number }) {
  const done = completion === 100;
  const started = completion > 0 && completion < 100;
  return (
    <div className="flex flex-col items-center gap-1">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--xt-steel)]">
        {STAGE_SHORT[name] ?? name.slice(0, 3)}
      </span>
      <span
        className={cn(
          "inline-flex h-7 w-7 items-center justify-center rounded-[2px] border text-xs font-bold tabular-nums",
          done
            ? "border-[var(--line-bio-green)] bg-[var(--line-bio-green)]/10 text-[var(--line-bio-green)]"
            : started
              ? "border-[var(--xt-yellow-deep)] bg-[var(--xt-yellow)] text-[var(--xt-black)]"
              : "border-[var(--xt-cement)] bg-[var(--xt-white)] text-[var(--xt-aluminum)]",
        )}
      >
        {done ? "✓" : started ? completion : "·"}
      </span>
    </div>
  );
}

function PrevioChip({ machineId, previo }: { machineId: string; previo: MachinePrevioView }) {
  const orderedRef = useRef<HTMLInputElement>(null);
  const receivedRef = useRef<HTMLInputElement>(null);
  const bothDone = previo.ordered && previo.received;
  const neitherDone = !previo.ordered && !previo.received;

  return (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 rounded-[2px] border px-2 py-1 text-[11px] leading-none",
        bothDone
          ? "border-[var(--line-bio-green)] bg-[var(--line-bio-green)]/10 text-[var(--line-bio-green)]"
          : neitherDone
            ? "border-[var(--xt-cement)] bg-[var(--xt-white)] text-[var(--xt-steel)]"
            : "border-[var(--xt-yellow)] bg-[var(--xt-yellow-soft)] text-[var(--xt-black)]",
      )}
    >
      <span className="font-semibold">{previo.name}</span>
      <form action={toggleMachinePrevioAction} className="inline">
        <input type="hidden" name="machineId" value={machineId} />
        <input type="hidden" name="previoCatalogId" value={previo.previoCatalogId} />
        <input type="hidden" name="field" value="ordered" />
        <input ref={orderedRef} type="hidden" name="checked" value={String(!previo.ordered)} />
        <label className="inline-flex cursor-pointer items-center gap-0.5">
          <input
            type="checkbox"
            defaultChecked={previo.ordered}
            className="h-2.5 w-2.5 accent-[var(--xt-yellow-deep)]"
            onChange={(e) => {
              if (orderedRef.current) orderedRef.current.value = String(e.currentTarget.checked);
              e.currentTarget.form?.requestSubmit();
            }}
          />
          <span>Ped</span>
        </label>
      </form>
      <form action={toggleMachinePrevioAction} className="inline">
        <input type="hidden" name="machineId" value={machineId} />
        <input type="hidden" name="previoCatalogId" value={previo.previoCatalogId} />
        <input type="hidden" name="field" value="received" />
        <input ref={receivedRef} type="hidden" name="checked" value={String(!previo.received)} />
        <label className="inline-flex cursor-pointer items-center gap-0.5">
          <input
            type="checkbox"
            defaultChecked={previo.received}
            className="h-2.5 w-2.5 accent-[var(--xt-yellow-deep)]"
            onChange={(e) => {
              if (receivedRef.current) receivedRef.current.value = String(e.currentTarget.checked);
              e.currentTarget.form?.requestSubmit();
            }}
          />
          <span>Rec</span>
        </label>
      </form>
    </div>
  );
}

function InlineClientEdit({ machineId, clientName }: { machineId: string; clientName: string }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(clientName);
  const formRef = useRef<HTMLFormElement>(null);

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      formRef.current?.requestSubmit();
    } else if (e.key === "Escape") {
      setValue(clientName);
      setEditing(false);
    }
  }

  if (!editing) {
    return (
      <ActionTooltip text="Edita el cliente. Asígnalo al vender la máquina.">
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="cursor-text text-left font-medium underline-offset-2 hover:underline"
          title={clientName}
        >
          {clientName}
        </button>
      </ActionTooltip>
    );
  }

  return (
    <form ref={formRef} action={updateMachineClientAction} onSubmit={() => setEditing(false)}>
      <input type="hidden" name="machineId" value={machineId} />
      <input
        autoFocus
        type="text"
        name="clientName"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => { formRef.current?.requestSubmit(); setEditing(false); }}
        onKeyDown={handleKeyDown}
        className="w-40 rounded-[2px] border border-[var(--xt-yellow)] bg-[var(--xt-yellow-soft)] px-1 py-0.5 text-sm outline-none"
      />
    </form>
  );
}

function MachineCard({ machine }: { machine: OnHoldMachineCard }) {
  return (
    <div className="border border-[var(--xt-black)] bg-[var(--xt-white)] shadow-[var(--shadow-sm)]">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--xt-aluminum)] px-4 py-3">
        <div className="flex items-start gap-3">
          <span className="text-3xl font-bold tabular-nums leading-none text-[var(--xt-black)]">
            {machine.serialNumber}
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <CellTooltip text={machine.equipmentName}>
                <span className="line-clamp-1 font-semibold">{machine.equipmentName}</span>
              </CellTooltip>
              <Link
                href={`/admin/maquinas/${machine.id}`}
                className="shrink-0 text-[var(--xt-steel)] hover:text-[var(--xt-black)]"
                title="Ver máquina"
              >
                ↗
              </Link>
            </div>
            <p className="text-xs text-[var(--xt-steel)]">
              {machine.equipmentCode ? <span className="font-mono">{machine.equipmentCode}</span> : "Sin código"}
              {machine.colorName ? ` · ${machine.colorName}` : ""}
              {` · Prometido ${formatDateEs(machine.promisedDate)}`}
            </p>
            <div className="mt-1 text-sm">
              <span className="text-xs text-[var(--xt-steel)]">Cliente: </span>
              <InlineClientEdit machineId={machine.id} clientName={machine.clientName} />
            </div>
          </div>
        </div>
        <form action={reactivateHoldMachineAction}>
          <input type="hidden" name="machineId" value={machine.id} />
          <ActionTooltip text="Devuelve la máquina a la cola de producción con sus avances y previos.">
            <Button type="submit" size="sm">
              <PlayCircle className="h-4 w-4" />
              Reactivar
            </Button>
          </ActionTooltip>
        </form>
      </div>

      {/* Avance */}
      <div className="border-b border-[var(--xt-cement)] px-4 py-3">
        <div className="mb-2 flex items-center gap-3">
          <span className="text-xs font-semibold uppercase tracking-wide text-[var(--xt-steel)]">Avance</span>
          <div className="h-1.5 w-40 overflow-hidden rounded-full bg-[var(--xt-cement)]">
            <div className="h-full bg-[var(--xt-black)]" style={{ width: `${Math.max(0, Math.min(1, machine.progressPct)) * 100}%` }} />
          </div>
          <span className="text-sm font-bold tabular-nums">{formatPercent(machine.progressPct)}</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {machine.stages.map((stage) => (
            <StagePin key={stage.id} name={stage.name} completion={stage.completion} />
          ))}
        </div>
      </div>

      {/* Previos */}
      <div className="px-4 py-3">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--xt-steel)]">Previos</p>
        {machine.previos.length === 0 ? (
          <p className="text-xs text-[var(--xt-aluminum)]">Sin previos registrados.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {machine.previos.map((previo) => (
              <PrevioChip key={previo.previoCatalogId} machineId={machine.id} previo={previo} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function PropiasEnEsperaManager({ machines }: { machines: OnHoldMachineCard[] }) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return machines;
    return machines.filter(
      (m) =>
        String(m.serialNumber).includes(term) ||
        m.clientName.toLowerCase().includes(term) ||
        m.equipmentName.toLowerCase().includes(term) ||
        (m.equipmentCode ?? "").toLowerCase().includes(term),
    );
  }, [machines, search]);

  if (machines.length === 0) {
    return (
      <div className="grid place-items-center border border-dashed border-[var(--xt-aluminum)] bg-[var(--xt-white)] px-6 py-16 text-center">
        <p className="text-lg font-semibold">No hay máquinas en espera.</p>
        <p className="mt-1 max-w-md text-sm text-[var(--xt-steel)]">
          Desde el plan de producción puedes enviar máquinas propias a esta sección para dejarlas
          aparcadas hasta que se vendan.
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      <div className="relative w-72">
        <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--xt-aluminum)]" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por SERIAL, cliente o equipo"
          className="h-9 pl-7 text-sm"
        />
      </div>
      {filtered.length === 0 ? (
        <p className="text-sm text-[var(--xt-steel)]">Ninguna máquina coincide con la búsqueda.</p>
      ) : (
        filtered.map((machine) => <MachineCard key={machine.id} machine={machine} />)
      )}
    </div>
  );
}
