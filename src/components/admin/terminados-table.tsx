"use client";

import { useState } from "react";
import { RotateCcw, Truck, X } from "lucide-react";
import { bulkDespacharTerminadosAction, reprocesarMaquinaAction } from "@/app/admin/actions";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ActionTooltip } from "@/components/ui/tooltip";
import type { MachineView } from "@/types/domain";

const C = "px-3 py-2 whitespace-nowrap";

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" });
}

export function TerminadosTable({ machines }: { machines: MachineView[] }) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  function toggle(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (selectedIds.size === machines.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(machines.map((m) => m.id)));
    }
  }

  const allSelected = machines.length > 0 && selectedIds.size === machines.length;

  if (machines.length === 0) {
    return (
      <p className="py-12 text-center text-sm text-[var(--xt-steel)]">
        No hay máquinas terminadas esperando despacho.
      </p>
    );
  }

  return (
    <div className="grid gap-2">
      {selectedIds.size > 0 && (
        <form
          action={bulkDespacharTerminadosAction}
          className="flex items-center gap-3 rounded-[2px] border border-[var(--xt-black)] bg-[var(--xt-yellow-soft)] px-3 py-2"
        >
          {Array.from(selectedIds).map((id) => (
            <input key={id} type="hidden" name="machineIds" value={id} />
          ))}
          <span className="text-xs font-medium">
            {selectedIds.size} seleccionada{selectedIds.size === 1 ? "" : "s"}
          </span>
          <ActionTooltip text="Despacha todas las máquinas seleccionadas.">
            <Button type="submit" size="sm" variant="outline" className="ml-auto gap-1.5">
              <Truck className="h-3.5 w-3.5" />
              Despachar seleccionadas
            </Button>
          </ActionTooltip>
          <ActionTooltip text="Quita la selección actual.">
            <Button type="button" size="sm" variant="ghost" onClick={() => setSelectedIds(new Set())}>
              <X className="h-3.5 w-3.5" />
            </Button>
          </ActionTooltip>
        </form>
      )}

      <div className="overflow-x-auto border border-[var(--xt-black)] bg-[var(--xt-white)] shadow-[var(--shadow-sm)]">
        <Table className="min-w-[900px] text-xs">
          <TableHeader>
            <TableRow>
              <TableHead className="w-8 px-3 py-2">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleAll}
                  aria-label="Seleccionar todas"
                  className="h-3.5 w-3.5 accent-[var(--xt-yellow-deep)]"
                />
              </TableHead>
              <TableHead className={C}>PLACA</TableHead>
              <TableHead className={C}>Cliente</TableHead>
              <TableHead className={C}>Código</TableHead>
              <TableHead className={C}>Máquina</TableHead>
              <TableHead className={C}>Color</TableHead>
              <TableHead className={C}>Ciudad</TableHead>
              <TableHead className={C}>Terminada</TableHead>
              <TableHead className={C} />
            </TableRow>
          </TableHeader>
          <TableBody>
            {machines.map((machine) => (
              <TableRow key={machine.id}>
                <TableCell className="px-3 py-2">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(machine.id)}
                    onChange={() => toggle(machine.id)}
                    aria-label={`Seleccionar PLACA ${machine.placaNumber}`}
                    className="h-3.5 w-3.5 accent-[var(--xt-yellow-deep)]"
                  />
                </TableCell>
                <TableCell className={`${C} font-semibold tabular-nums`}>{machine.placaNumber}</TableCell>
                <TableCell className={`${C} max-w-[120px] truncate`}>{machine.clientName}</TableCell>
                <TableCell className={`${C} whitespace-nowrap font-mono text-[10px] text-[var(--xt-steel)]`}>
                  {machine.equipmentCode ?? "—"}
                </TableCell>
                <TableCell className={`${C} max-w-[180px]`}>
                  <span className="line-clamp-1">{machine.equipmentName}</span>
                </TableCell>
                <TableCell className={C}>{machine.colorName ?? "—"}</TableCell>
                <TableCell className={C}>{machine.city ?? "—"}</TableCell>
                <TableCell className={`${C} tabular-nums text-[var(--xt-steel)]`}>
                  {formatDate(machine.completedAt)}
                </TableCell>
                <TableCell className={`${C} text-right`}>
                  <div className="flex items-center justify-end gap-2">
                    <form action={reprocesarMaquinaAction}>
                      <input type="hidden" name="machineId" value={machine.id} />
                      <ActionTooltip text="Devuelve esta máquina a producción para reproceso.">
                        <Button type="submit" size="sm" variant="ghost" className="gap-1.5 text-[var(--xt-steel)]">
                          <RotateCcw className="h-3.5 w-3.5" />
                          Reproceso
                        </Button>
                      </ActionTooltip>
                    </form>
                    <form action={bulkDespacharTerminadosAction}>
                      <input type="hidden" name="machineIds" value={machine.id} />
                      <ActionTooltip text="Marca esta máquina como despachada.">
                        <Button type="submit" size="sm" variant="outline" className="gap-1.5">
                          <Truck className="h-3.5 w-3.5" />
                          Despachar
                        </Button>
                      </ActionTooltip>
                    </form>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
