"use client";

import Link from "next/link";
import { Fragment, useMemo, useRef, useState } from "react";
import { Truck } from "lucide-react";
import {
  markShippedFromPreviosAction,
  sendToProductionAction,
  toggleMachinePrevioAction,
  unmarkShippedFromPreviosAction,
} from "@/app/admin/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { formatDateEs } from "@/services/schedule";
import type { MachinePrevioListRow, MachinePrevioView } from "@/types/domain";

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

export function PreviosManager({
  machines,
  pendingMachines,
  seededMessage,
}: {
  machines: MachinePrevioListRow[];
  pendingMachines: MachinePrevioListRow[];
  seededMessage?: string | null;
}) {
  const [clientFilter, setClientFilter] = useState("");
  const [search, setSearch] = useState("");
  const [promisedDate, setPromisedDate] = useState("");
  const [pendingOrdered, setPendingOrdered] = useState(false);
  const [pendingReceived, setPendingReceived] = useState(false);
  const [selectedPending, setSelectedPending] = useState<Set<string>>(new Set());

  const clients = useMemo(
    () => Array.from(new Set(machines.map((machine) => machine.clientName))).sort((a, b) => a.localeCompare(b, "es")),
    [machines],
  );

  const filteredMachines = useMemo(() => {
    const term = search.trim().toLowerCase();
    return machines.filter((machine) => {
      if (clientFilter && machine.clientName !== clientFilter) return false;
      if (promisedDate && machine.promisedDate !== promisedDate) return false;
      if (pendingOrdered && !machine.summary.pendingOrdered) return false;
      if (pendingReceived && !machine.summary.pendingReceived) return false;
      if (!term) return true;
      return (
        String(machine.cotiNumber).includes(term) ||
        machine.clientName.toLowerCase().includes(term) ||
        machine.equipmentName.toLowerCase().includes(term) ||
        (machine.equipmentCode ?? "").toLowerCase().includes(term)
      );
    });
  }, [clientFilter, machines, pendingOrdered, pendingReceived, promisedDate, search]);

  function togglePending(id: string) {
    setSelectedPending((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAllPending(checked: boolean) {
    setSelectedPending(checked ? new Set(pendingMachines.map((m) => m.machineId)) : new Set());
  }

  const allPendingSelected = pendingMachines.length > 0 && selectedPending.size === pendingMachines.length;
  const somePendingSelected = selectedPending.size > 0 && !allPendingSelected;

  return (
    <div className="grid gap-6">
      {/* Pending import review */}
      {pendingMachines.length > 0 && (
        <div className="border border-[var(--xt-black)] bg-[var(--xt-white)] shadow-[var(--shadow-sm)]">
          <div className="flex items-center justify-between gap-3 border-b border-[var(--xt-aluminum)] px-4 py-3">
            <div>
              <h2 className="font-semibold">Pendientes de revisión</h2>
              <p className="text-xs text-[var(--xt-steel)]">
                {pendingMachines.length} máquina{pendingMachines.length === 1 ? "" : "s"} importada{pendingMachines.length === 1 ? "" : "s"}, aún no en producción
              </p>
            </div>
            {selectedPending.size > 0 && (
              <form action={sendToProductionAction}>
                {Array.from(selectedPending).map((id) => (
                  <input key={id} type="hidden" name="machineIds" value={id} />
                ))}
                <Button type="submit" size="sm">
                  Enviar a producción ({selectedPending.size})
                </Button>
              </form>
            )}
          </div>
          <div className="overflow-x-auto">
            <Table className="min-w-[720px]">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10 px-3">
                    <input
                      type="checkbox"
                      checked={allPendingSelected}
                      ref={(el) => { if (el) el.indeterminate = somePendingSelected; }}
                      onChange={(e) => toggleAllPending(e.target.checked)}
                      aria-label="Seleccionar todas"
                    />
                  </TableHead>
                  <TableHead>COTI</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Equipo</TableHead>
                  <TableHead>Ofrecido</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendingMachines.map((machine) => (
                  <TableRow
                    key={machine.machineId}
                    className={selectedPending.has(machine.machineId) ? "bg-[var(--xt-yellow-soft)]/60" : undefined}
                  >
                    <TableCell className="px-3">
                      <input
                        type="checkbox"
                        checked={selectedPending.has(machine.machineId)}
                        onChange={() => togglePending(machine.machineId)}
                        aria-label={`Seleccionar COTI ${machine.cotiNumber}`}
                      />
                    </TableCell>
                    <TableCell>
                      <Link href={`/admin/maquinas/${machine.machineId}`} className="font-semibold underline-offset-2 hover:underline">
                        {machine.cotiNumber}
                      </Link>
                    </TableCell>
                    <TableCell>{machine.clientName}</TableCell>
                    <TableCell>
                      <div className="grid gap-0.5">
                        <span>{machine.equipmentName}</span>
                        {machine.equipmentCode ? <span className="text-xs text-[var(--xt-steel)]">{machine.equipmentCode}</span> : null}
                      </div>
                    </TableCell>
                    <TableCell>{formatDateEs(machine.promisedDate)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* In-production / shipped machines with inline previos */}
      <div className="grid gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="grid gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar por COTI, cliente o equipo"
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

        <div className="overflow-x-auto border border-[var(--xt-black)] bg-[var(--xt-white)] shadow-[var(--shadow-sm)]">
          <Table className="min-w-[1100px] text-xs">
            <TableHeader>
              <TableRow>
                <TableHead>COTI</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Equipo</TableHead>
                <TableHead>Ofrecido</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Previos</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredMachines.map((machine) => {
                const isShipped = machine.status === "shipped";
                return (
                  <TableRow key={machine.machineId}>
                    <TableCell>
                      <Link
                        href={`/admin/maquinas/${machine.machineId}`}
                        className="font-semibold underline-offset-2 hover:underline"
                      >
                        {machine.cotiNumber}
                      </Link>
                    </TableCell>
                    <TableCell className="max-w-[100px] truncate" title={machine.clientName}>
                      {machine.clientName}
                    </TableCell>
                    <TableCell className="max-w-[160px]">
                      <div className="grid gap-0.5">
                        <span className="line-clamp-1">{machine.equipmentName}</span>
                        {machine.equipmentCode ? (
                          <span className="font-mono text-[10px] text-[var(--xt-steel)]">{machine.equipmentCode}</span>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{formatDateEs(machine.promisedDate)}</TableCell>
                    <TableCell>
                      <Badge variant={isShipped ? "success" : "warning"}>
                        {isShipped ? "Despachada" : "En producción"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {machine.previos.length === 0 ? (
                        <span className="text-[var(--xt-aluminum)]">Sin previos</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {machine.previos.map((previo) => (
                            <PrevioChip key={previo.id} previo={previo} />
                          ))}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <form action={isShipped ? unmarkShippedFromPreviosAction : markShippedFromPreviosAction}>
                        <input type="hidden" name="machineId" value={machine.machineId} />
                        <button
                          type="submit"
                          title={isShipped ? "Reactivar" : "Despachar"}
                          className={cn(
                            "inline-flex h-6 w-6 items-center justify-center rounded-[2px] border",
                            isShipped
                              ? "border-[var(--xt-cement)] bg-[var(--xt-white)] text-[var(--xt-steel)] hover:bg-[var(--xt-yellow-soft)]"
                              : "border-[var(--xt-steel)] bg-[var(--xt-graphite)] text-[var(--xt-white)] hover:bg-[var(--xt-black)]",
                          )}
                        >
                          <Truck className="h-3 w-3" />
                        </button>
                      </form>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
