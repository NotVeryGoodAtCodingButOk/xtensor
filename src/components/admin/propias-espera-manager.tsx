"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { ExternalLink, PlayCircle, Search } from "lucide-react";
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
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1 rounded-[2px] border px-1.5 text-[10px] font-semibold uppercase leading-none",
        done
          ? "border-[var(--line-bio-green)] bg-[var(--line-bio-green)]/10 text-[var(--line-bio-green)]"
          : started
            ? "border-[var(--xt-yellow-deep)] bg-[var(--xt-yellow-soft)] text-[var(--xt-black)]"
            : "border-[var(--xt-cement)] bg-[var(--xt-white)] text-[var(--xt-aluminum)]",
      )}
      title={`${name}: ${completion}%`}
    >
      <span className="text-[var(--xt-steel)]">
        {STAGE_SHORT[name] ?? name.slice(0, 3)}
      </span>
      <span className="min-w-3 text-center font-bold tabular-nums">
        {done ? "✓" : started ? completion : "·"}
      </span>
    </span>
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
        "inline-flex min-h-6 items-center gap-1.5 rounded-[2px] border px-1.5 py-0.5 text-[11px] leading-none",
        bothDone
          ? "border-[var(--line-bio-green)] bg-[var(--line-bio-green)]/10 text-[var(--line-bio-green)]"
          : neitherDone
            ? "border-[var(--xt-cement)] bg-[var(--xt-white)] text-[var(--xt-steel)]"
            : "border-[var(--xt-yellow)] bg-[var(--xt-yellow-soft)] text-[var(--xt-black)]",
      )}
    >
      <span className="max-w-36 truncate font-semibold" title={previo.name}>
        {previo.name}
      </span>
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
            aria-label={`Pedido: ${previo.name}`}
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
            aria-label={`Recibido: ${previo.name}`}
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
      <ActionTooltip text="Edita el cliente. Asígnalo al vender la máquina." className="min-w-0 max-w-full">
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="inline-block max-w-full cursor-text truncate text-left font-medium underline-offset-2 hover:underline"
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
        className="h-7 w-44 max-w-full rounded-[2px] border border-[var(--xt-yellow)] bg-[var(--xt-yellow-soft)] px-1.5 py-0.5 text-sm outline-none"
      />
    </form>
  );
}

function MachineCard({ machine }: { machine: OnHoldMachineCard }) {
  const completedPrevios = machine.previos.filter((previo) => previo.ordered && previo.received).length;

  return (
    <div className="border border-[var(--xt-black)] bg-[var(--xt-white)] px-3 py-2 shadow-[var(--shadow-sm)]">
      <div className="grid gap-3 lg:grid-cols-[minmax(260px,0.95fr)_minmax(360px,1.35fr)_auto] lg:items-start xl:grid-cols-[minmax(340px,1fr)_minmax(520px,1.5fr)_auto]">
        <div className="min-w-0">
          <div className="flex min-w-0 items-start gap-2.5">
            <span className="shrink-0 text-2xl font-bold tabular-nums leading-none text-[var(--xt-black)]">
              {machine.serialNumber}
            </span>
            <div className="min-w-0">
              <div className="flex min-w-0 items-center gap-1.5">
                <CellTooltip text={machine.equipmentName}>
                  <span className="line-clamp-1 text-sm font-semibold leading-tight">{machine.equipmentName}</span>
                </CellTooltip>
                <Link
                  href={`/admin/maquinas/${machine.id}`}
                  className="inline-flex h-6 w-6 shrink-0 items-center justify-center text-[var(--xt-steel)] hover:text-[var(--xt-black)]"
                  title="Ver máquina"
                  aria-label={`Ver SERIAL ${machine.serialNumber}`}
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                </Link>
              </div>
              <p className="mt-0.5 truncate text-xs text-[var(--xt-steel)]">
                {machine.equipmentCode ? <span className="font-mono">{machine.equipmentCode}</span> : "Sin código"}
                {machine.colorName ? ` · ${machine.colorName}` : ""}
                {` · Prometido ${formatDateEs(machine.promisedDate)}`}
              </p>
              <div className="mt-1 flex min-w-0 items-baseline gap-1 text-sm">
                <span className="shrink-0 text-xs text-[var(--xt-steel)]">Cliente:</span>
                <InlineClientEdit machineId={machine.id} clientName={machine.clientName} />
              </div>
            </div>
          </div>
        </div>

        <div className="min-w-0 space-y-1.5">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-[var(--xt-steel)]">Avance</span>
            <div className="h-1.5 w-32 overflow-hidden rounded-full bg-[var(--xt-cement)]">
              <div
                className="h-full bg-[var(--xt-black)]"
                style={{ width: `${Math.max(0, Math.min(1, machine.progressPct)) * 100}%` }}
              />
            </div>
            <span className="text-sm font-bold tabular-nums">{formatPercent(machine.progressPct)}</span>
            <div className="flex min-w-0 flex-wrap gap-1">
              {machine.stages.map((stage) => (
                <StagePin key={stage.id} name={stage.name} completion={stage.completion} />
              ))}
            </div>
          </div>

          <div className="flex min-w-0 items-start gap-2">
            <span className="mt-1 shrink-0 text-xs font-semibold uppercase tracking-wide text-[var(--xt-steel)]">
              Previos
              {machine.previos.length > 0 ? (
                <span className="ml-1 font-bold tracking-normal text-[var(--xt-black)]">
                  {completedPrevios}/{machine.previos.length}
                </span>
              ) : null}
            </span>
            {machine.previos.length === 0 ? (
              <p className="mt-1 text-xs text-[var(--xt-aluminum)]">Sin previos registrados.</p>
            ) : (
              <div className="flex max-h-16 min-w-0 flex-1 flex-wrap gap-1 overflow-y-auto pr-1">
                {machine.previos.map((previo) => (
                  <PrevioChip key={previo.previoCatalogId} machineId={machine.id} previo={previo} />
                ))}
              </div>
            )}
          </div>
        </div>

        <form action={reactivateHoldMachineAction} className="lg:justify-self-end">
          <input type="hidden" name="machineId" value={machine.id} />
          <ActionTooltip text="Devuelve la máquina a la cola de producción con sus avances y previos.">
            <Button type="submit" size="sm" className="w-full lg:w-auto">
              <PlayCircle className="h-4 w-4" />
              Reactivar
            </Button>
          </ActionTooltip>
        </form>
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
    <div className="grid gap-2.5">
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
