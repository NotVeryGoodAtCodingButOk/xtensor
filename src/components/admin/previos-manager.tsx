"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { ArrowRight } from "lucide-react";
import { sendToProductionAction, toggleMachinePrevioAction, updateMachinePlacaAction, updateMachineClientAction } from "@/app/admin/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CellTooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { formatDateEs } from "@/services/schedule";
import type { MachinePrevioListRow, MachinePrevioView } from "@/types/domain";

function InlinePlacaEdit({ machineId, placaNumber }: { machineId: string; placaNumber: number }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(String(placaNumber));
  const formRef = useRef<HTMLFormElement>(null);

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      formRef.current?.requestSubmit();
    } else if (e.key === "Escape") {
      setValue(String(placaNumber));
      setEditing(false);
    }
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="font-semibold underline-offset-2 hover:underline cursor-text"
        title="Haz clic para editar el PLACA"
      >
        {placaNumber}
      </button>
    );
  }

  return (
    <form
      ref={formRef}
      action={updateMachinePlacaAction}
      onSubmit={() => setEditing(false)}
    >
      <input type="hidden" name="machineId" value={machineId} />
      <input
        autoFocus
        type="number"
        name="placaNumber"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => { formRef.current?.requestSubmit(); setEditing(false); }}
        onKeyDown={handleKeyDown}
        className="w-20 rounded-[2px] border border-[var(--xt-yellow)] bg-[var(--xt-yellow-soft)] px-1 py-0.5 text-xs font-semibold outline-none"
      />
    </form>
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
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="max-w-[100px] truncate text-left cursor-text hover:underline underline-offset-2"
        title={clientName}
      >
        {clientName}
      </button>
    );
  }

  return (
    <form
      ref={formRef}
      action={updateMachineClientAction}
      onSubmit={() => setEditing(false)}
    >
      <input type="hidden" name="machineId" value={machineId} />
      <input
        autoFocus
        type="text"
        name="clientName"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => { formRef.current?.requestSubmit(); setEditing(false); }}
        onKeyDown={handleKeyDown}
        className="w-28 rounded-[2px] border border-[var(--xt-yellow)] bg-[var(--xt-yellow-soft)] px-1 py-0.5 text-xs outline-none"
      />
    </form>
  );
}

const selectCls =
  "flex h-8 rounded-[2px] border border-[var(--xt-aluminum)] bg-[var(--xt-white)] px-2 py-1 text-sm focus-visible:border-[var(--xt-black)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--xt-yellow)]";

function PrevioChip({ previo }: { previo: MachinePrevioView }) {
  const orderedRef = useRef<HTMLInputElement>(null);
  const receivedRef = useRef<HTMLInputElement>(null);

  const bothDone = previo.ordered && previo.received;
  const neitherDone = !previo.ordered && !previo.received;

  return (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 border px-1.5 py-1 text-[10px] leading-none",
        bothDone
          ? "border-[var(--line-bio-green)] bg-[var(--line-bio-green)]/10 text-[var(--line-bio-green)]"
          : neitherDone
            ? "border-[var(--xt-cement)] bg-[var(--xt-white)] text-[var(--xt-steel)]"
            : "border-[var(--xt-yellow)] bg-[var(--xt-yellow-soft)] text-[var(--xt-black)]",
      )}
    >
      <span className="font-medium">{previo.name}</span>

      {/* Pedido toggle */}
      <form action={toggleMachinePrevioAction} className="inline">
        <input type="hidden" name="machinePrevioId" value={previo.id} />
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

      {/* Recibido toggle */}
      <form action={toggleMachinePrevioAction} className="inline">
        <input type="hidden" name="machinePrevioId" value={previo.id} />
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

function PreviosCell({ machine }: { machine: MachinePrevioListRow }) {
  if (machine.previos.length === 0) {
    return <span className="text-[var(--xt-aluminum)]">Sin previos</span>;
  }
  return (
    <div className="flex flex-wrap gap-1">
      {machine.previos.map((previo) => (
        <PrevioChip key={`${previo.id}-${previo.ordered}-${previo.received}`} previo={previo} />
      ))}
    </div>
  );
}

export function PreviosManager({
  pendingMachines,
  productionMachines,
  seededMessage,
}: {
  pendingMachines: MachinePrevioListRow[];
  productionMachines: MachinePrevioListRow[];
  seededMessage?: string | null;
}) {
  const [clientFilter, setClientFilter] = useState("");
  const [search, setSearch] = useState("");
  const [promisedDate, setPromisedDate] = useState("");
  const [pendingOrdered, setPendingOrdered] = useState(false);
  const [pendingReceived, setPendingReceived] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const clients = useMemo(
    () =>
      Array.from(
        new Set([...pendingMachines, ...productionMachines].map((machine) => machine.clientName)),
      ).sort((a, b) => a.localeCompare(b, "es")),
    [pendingMachines, productionMachines],
  );

  const matchesFilters = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (machine: MachinePrevioListRow) => {
      if (clientFilter && machine.clientName !== clientFilter) return false;
      if (promisedDate && machine.promisedDate !== promisedDate) return false;
      if (pendingOrdered && !machine.summary.pendingOrdered) return false;
      if (pendingReceived && !machine.summary.pendingReceived) return false;
      if (!term) return true;
      return (
        String(machine.placaNumber).includes(term) ||
        machine.clientName.toLowerCase().includes(term) ||
        machine.equipmentName.toLowerCase().includes(term) ||
        (machine.equipmentCode ?? "").toLowerCase().includes(term)
      );
    };
  }, [clientFilter, pendingOrdered, pendingReceived, promisedDate, search]);

  const filteredPending = useMemo(() => pendingMachines.filter(matchesFilters), [pendingMachines, matchesFilters]);
  const filteredProduction = useMemo(
    () => productionMachines.filter(matchesFilters),
    [productionMachines, matchesFilters],
  );

  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll(checked: boolean) {
    setSelected(checked ? new Set(filteredPending.map((m) => m.machineId)) : new Set());
  }

  const allSelected = filteredPending.length > 0 && filteredPending.every((m) => selected.has(m.machineId));
  const someSelected = selected.size > 0 && !allSelected;

  return (
    <div className="grid gap-6">
      {/* Filters */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar por PLACA, cliente o equipo"
              className="h-9 w-72 text-sm"
            />
            <select className={selectCls} value={clientFilter} onChange={(event) => setClientFilter(event.target.value)}>
              <option value="">Todos los clientes</option>
              {clients.map((client) => (
                <option key={client} value={client}>{client}</option>
              ))}
            </select>
            <Input
              type="date"
              value={promisedDate}
              onChange={(event) => setPromisedDate(event.target.value)}
              className="h-9 w-40 text-sm"
            />
          </div>
          <div className="flex flex-wrap items-center gap-4 text-sm">
            <label className="inline-flex items-center gap-2">
              <input type="checkbox" checked={pendingOrdered} onChange={(event) => setPendingOrdered(event.target.checked)} />
              Pendiente por pedir
            </label>
            <label className="inline-flex items-center gap-2">
              <input type="checkbox" checked={pendingReceived} onChange={(event) => setPendingReceived(event.target.checked)} />
              Pendiente por recibir
            </label>
          </div>
        </div>
        {seededMessage ? <p className="text-xs text-[var(--xt-steel)]">{seededMessage}</p> : null}
      </div>

      {/* Previos pending (pre-production) */}
      <div className="border border-[var(--xt-black)] bg-[var(--xt-white)] shadow-[var(--shadow-sm)]">
        <div className="flex items-center justify-between gap-3 border-b border-[var(--xt-aluminum)] px-4 py-3">
          <div>
            <h2 className="font-semibold">En previos</h2>
            <p className="text-xs text-[var(--xt-steel)]">
              {filteredPending.length} máquina{filteredPending.length === 1 ? "" : "s"} antes de producción
            </p>
          </div>
          {selected.size > 0 && (
            <form action={sendToProductionAction}>
              {Array.from(selected).map((id) => (
                <input key={id} type="hidden" name="machineIds" value={id} />
              ))}
              <Button type="submit" size="sm">
                <ArrowRight className="h-4 w-4" />
                Enviar a producción ({selected.size})
              </Button>
            </form>
          )}
        </div>
        <div className="overflow-x-auto">
          <Table className="min-w-[1100px] text-xs">
            <TableHeader>
              <TableRow>
                <TableHead className="w-10 px-3">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    ref={(el) => { if (el) el.indeterminate = someSelected; }}
                    onChange={(e) => toggleAll(e.target.checked)}
                    aria-label="Seleccionar todas"
                  />
                </TableHead>
                <TableHead>PLACA</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Código</TableHead>
                <TableHead>Máquina</TableHead>
                <TableHead>Prometido</TableHead>
                <TableHead>Previos</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredPending.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="py-6 text-center text-[var(--xt-steel)]">
                    No hay máquinas en previos.
                  </TableCell>
                </TableRow>
              ) : (
                filteredPending.map((machine) => (
                  <TableRow
                    key={machine.machineId}
                    className={selected.has(machine.machineId) ? "bg-[var(--xt-yellow-soft)]/60" : undefined}
                  >
                    <TableCell className="px-3">
                      <input
                        type="checkbox"
                        checked={selected.has(machine.machineId)}
                        onChange={() => toggleSelected(machine.machineId)}
                        aria-label={`Seleccionar PLACA ${machine.placaNumber}`}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <InlinePlacaEdit machineId={machine.machineId} placaNumber={machine.placaNumber} />
                        <Link
                          href={`/admin/maquinas/${machine.machineId}`}
                          className="text-[var(--xt-steel)] hover:text-[var(--xt-black)]"
                          title="Ver máquina"
                        >
                          ↗
                        </Link>
                      </div>
                    </TableCell>
                    <TableCell>
                      <InlineClientEdit machineId={machine.machineId} clientName={machine.clientName} />
                    </TableCell>
                    <TableCell className="whitespace-nowrap font-mono text-[10px] text-[var(--xt-steel)]">
                      {machine.equipmentCode ?? "—"}
                    </TableCell>
                    <TableCell className="max-w-[160px]">
                      <CellTooltip text={machine.equipmentName}>
                        <span className="line-clamp-1">{machine.equipmentName}</span>
                      </CellTooltip>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{formatDateEs(machine.promisedDate)}</TableCell>
                    <TableCell>
                      <PreviosCell machine={machine} />
                    </TableCell>
                    <TableCell>
                      <form action={sendToProductionAction}>
                        <input type="hidden" name="machineIds" value={machine.machineId} />
                        <button
                          type="submit"
                          title="Enviar a producción"
                          className="inline-flex h-6 w-6 items-center justify-center rounded-[2px] border border-[var(--xt-steel)] bg-[var(--xt-graphite)] text-[var(--xt-white)] hover:bg-[var(--xt-black)]"
                        >
                          <ArrowRight className="h-3 w-3" />
                        </button>
                      </form>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* In production — previos tracking continues, no send/ship actions */}
      {filteredProduction.length > 0 && (
        <div className="border border-[var(--xt-aluminum)] bg-[var(--xt-white)] shadow-[var(--shadow-sm)]">
          <div className="border-b border-[var(--xt-aluminum)] px-4 py-3">
            <h2 className="font-semibold">En producción</h2>
            <p className="text-xs text-[var(--xt-steel)]">
              {filteredProduction.length} máquina{filteredProduction.length === 1 ? "" : "s"} ya en producción · seguimiento de previos
            </p>
          </div>
          <div className="overflow-x-auto">
            <Table className="min-w-[1000px] text-xs">
              <TableHeader>
                <TableRow>
                  <TableHead>PLACA</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Código</TableHead>
                  <TableHead>Máquina</TableHead>
                  <TableHead>Prometido</TableHead>
                  <TableHead>Previos</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredProduction.map((machine) => (
                  <TableRow key={machine.machineId}>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <InlinePlacaEdit machineId={machine.machineId} placaNumber={machine.placaNumber} />
                        <Link
                          href={`/admin/maquinas/${machine.machineId}`}
                          className="text-[var(--xt-steel)] hover:text-[var(--xt-black)]"
                          title="Ver máquina"
                        >
                          ↗
                        </Link>
                      </div>
                    </TableCell>
                    <TableCell>
                      <InlineClientEdit machineId={machine.machineId} clientName={machine.clientName} />
                    </TableCell>
                    <TableCell className="whitespace-nowrap font-mono text-[10px] text-[var(--xt-steel)]">
                      {machine.equipmentCode ?? "—"}
                    </TableCell>
                    <TableCell className="max-w-[160px]">
                      <CellTooltip text={machine.equipmentName}>
                        <span className="line-clamp-1">{machine.equipmentName}</span>
                      </CellTooltip>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{formatDateEs(machine.promisedDate)}</TableCell>
                    <TableCell>
                      <PreviosCell machine={machine} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </div>
  );
}
