"use client";

import Link from "next/link";
import { Fragment, useMemo, useState } from "react";
import { CheckSquare, ChevronDown, ChevronUp, Plus, Trash2 } from "lucide-react";
import {
  addMachinePrevioAction,
  bootstrapPreviosAction,
  removeMachinePrevioAction,
  toggleMachinePrevioAction,
} from "@/app/admin/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateEs } from "@/services/schedule";
import type { MachinePrevioListRow, PrevioCatalogView } from "@/types/domain";

const selectCls =
  "flex h-8 rounded-[2px] border border-[var(--xt-aluminum)] bg-[var(--xt-white)] px-2 py-1 text-sm focus-visible:border-[var(--xt-black)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--xt-yellow)]";

export function PreviosManager({
  machines,
  previosCatalog,
  seededMessage,
}: {
  machines: MachinePrevioListRow[];
  previosCatalog: PrevioCatalogView[];
  seededMessage?: string | null;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(machines[0]?.machineId ?? null);
  const [clientFilter, setClientFilter] = useState("");
  const [search, setSearch] = useState("");
  const [promisedDate, setPromisedDate] = useState("");
  const [pendingOrdered, setPendingOrdered] = useState(false);
  const [pendingReceived, setPendingReceived] = useState(false);
  const [productionWarningOnly, setProductionWarningOnly] = useState(false);

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
      if (productionWarningOnly && !machine.summary.incompleteWhileInProduction) return false;
      if (!term) return true;
      return (
        String(machine.cotiNumber).includes(term) ||
        machine.clientName.toLowerCase().includes(term) ||
        machine.equipmentName.toLowerCase().includes(term) ||
        (machine.equipmentCode ?? "").toLowerCase().includes(term)
      );
    });
  }, [clientFilter, machines, pendingOrdered, pendingReceived, productionWarningOnly, promisedDate, search]);

  return (
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
                <option key={client} value={client}>
                  {client}
                </option>
              ))}
            </select>
            <Input type="date" value={promisedDate} onChange={(event) => setPromisedDate(event.target.value)} className="h-9 w-40 text-sm" />
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
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={productionWarningOnly}
                onChange={(event) => setProductionWarningOnly(event.target.checked)}
              />
              En producción con previos incompletos
            </label>
          </div>
        </div>
        <div className="grid justify-items-end gap-2">
          <form action={bootstrapPreviosAction}>
            <Button type="submit" size="sm">
              <CheckSquare className="h-4 w-4" />
              Cargar previos desde Excel
            </Button>
          </form>
          {seededMessage ? <p className="text-xs text-[var(--xt-steel)]">{seededMessage}</p> : null}
        </div>
      </div>

      <div className="overflow-x-auto border border-[var(--xt-black)] bg-[var(--xt-white)] shadow-[var(--shadow-sm)]">
        <Table className="min-w-[980px]">
          <TableHeader>
            <TableRow>
              <TableHead className="w-12" />
              <TableHead>COTI</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead>Equipo</TableHead>
              <TableHead>Ofrecido</TableHead>
              <TableHead>Estado producción</TableHead>
              <TableHead>Resumen previos</TableHead>
              <TableHead>Alertas</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredMachines.map((machine) => {
              const expanded = expandedId === machine.machineId;
              return (
                <Fragment key={machine.machineId}>
                  <TableRow key={machine.machineId}>
                    <TableCell>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        onClick={() => setExpandedId(expanded ? null : machine.machineId)}
                        aria-label={expanded ? "Contraer previos" : "Expandir previos"}
                      >
                        {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </Button>
                    </TableCell>
                    <TableCell>
                      <Link href={`/admin/maquinas/${machine.machineId}`} className="font-semibold underline-offset-2 hover:underline">
                        {machine.cotiNumber}
                      </Link>
                    </TableCell>
                    <TableCell>{machine.clientName}</TableCell>
                    <TableCell>
                      <div className="grid gap-1">
                        <span>{machine.equipmentName}</span>
                        {machine.equipmentCode ? <span className="text-xs text-[var(--xt-steel)]">{machine.equipmentCode}</span> : null}
                      </div>
                    </TableCell>
                    <TableCell>{formatDateEs(machine.promisedDate)}</TableCell>
                    <TableCell>
                      <Badge variant={machine.status === "shipped" ? "success" : "warning"}>
                        {machine.status === "shipped" ? "Despachada" : "En producción"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {machine.summary.missingPrevios ? (
                        <Badge variant="muted">Sin previos</Badge>
                      ) : (
                        <div className="grid gap-1 text-xs text-[var(--xt-steel)]">
                          <span>{machine.summary.orderedCount}/{machine.summary.total} pedidos</span>
                          <span>{machine.summary.receivedCount}/{machine.summary.total} recibidos</span>
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {machine.summary.pendingOrdered ? <Badge variant="warning">Falta pedir</Badge> : null}
                        {machine.summary.pendingReceived ? <Badge variant="warning">Falta recibir</Badge> : null}
                        {machine.summary.incompleteWhileInProduction ? <Badge variant="danger">Revisar</Badge> : null}
                      </div>
                    </TableCell>
                  </TableRow>
                  {expanded ? (
                    <TableRow key={`${machine.machineId}-detail`} className="bg-[var(--xt-yellow-soft)]/45">
                      <TableCell colSpan={8}>
                        <div className="grid gap-4 py-2">
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div className="flex flex-wrap gap-2">
                              <Badge variant="muted">{machine.summary.total} previos</Badge>
                              {machine.summary.incompleteWhileInProduction ? (
                                <Badge variant="danger">Permitir envío a producción con advertencia</Badge>
                              ) : null}
                            </div>
                            <form action={addMachinePrevioAction} className="flex flex-wrap items-center gap-2">
                              <input type="hidden" name="machineId" value={machine.machineId} />
                              <select name="previoCatalogId" className={selectCls} required defaultValue="">
                                <option value="" disabled>
                                  Agregar previo
                                </option>
                                {previosCatalog.map((previo) => (
                                  <option key={previo.id} value={previo.id}>
                                    {previo.name}
                                  </option>
                                ))}
                              </select>
                              <Button type="submit" size="sm">
                                <Plus className="h-3 w-3" />
                                Agregar
                              </Button>
                            </form>
                          </div>

                          <div className="grid gap-2">
                            {machine.previos.length === 0 ? (
                              <p className="text-sm text-[var(--xt-steel)]">Esta máquina no tiene previos cargados.</p>
                            ) : null}
                            {machine.previos.map((previo) => (
                              <div
                                key={previo.id}
                                className="grid gap-3 border border-[var(--xt-aluminum)] bg-[var(--xt-white)] px-3 py-2 md:grid-cols-[minmax(0,1fr)_auto_auto_auto]"
                              >
                                <div className="min-w-0">
                                  <p className="font-medium">{previo.name}</p>
                                  <p className="text-xs text-[var(--xt-steel)]">
                                    {previo.receivedAt
                                      ? `Recibido ${formatDateEs(previo.receivedAt.slice(0, 10))}`
                                      : previo.orderedAt
                                        ? `Pedido ${formatDateEs(previo.orderedAt.slice(0, 10))}`
                                        : "Sin registrar"}
                                  </p>
                                </div>
                                <PrevioToggle machinePrevioId={previo.id} field="ordered" checked={previo.ordered} label="Pedido" />
                                <PrevioToggle machinePrevioId={previo.id} field="received" checked={previo.received} label="Recibido" />
                                <form action={removeMachinePrevioAction}>
                                  <input type="hidden" name="machinePrevioId" value={previo.id} />
                                  <Button type="submit" size="sm" variant="ghost">
                                    <Trash2 className="h-3 w-3" />
                                    Quitar
                                  </Button>
                                </form>
                              </div>
                            ))}
                          </div>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : null}
                </Fragment>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function PrevioToggle({
  machinePrevioId,
  field,
  checked,
  label,
}: {
  machinePrevioId: string;
  field: "ordered" | "received";
  checked: boolean;
  label: string;
}) {
  return (
    <form action={toggleMachinePrevioAction} className="flex items-center gap-2">
      <input type="hidden" name="machinePrevioId" value={machinePrevioId} />
      <input type="hidden" name="field" value={field} />
      <input type="hidden" name="checked" value={String(checked)} />
      <label className="inline-flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          defaultChecked={checked}
          onChange={(event) => {
            const form = event.currentTarget.form;
            const hidden = form?.elements.namedItem("checked");
            if (hidden instanceof HTMLInputElement) {
              hidden.value = String(event.currentTarget.checked);
            }
            form?.requestSubmit();
          }}
        />
        {label}
      </label>
    </form>
  );
}
