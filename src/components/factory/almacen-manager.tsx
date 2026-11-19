"use client";

import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CellTooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { DispatchResult } from "@/lib/floor/client";
import type { FloorIntent } from "@/lib/floor/commands";
import type { FloorPrevio, FloorPrevioRow } from "@/lib/floor/types";
import { formatDateEs } from "@/services/schedule";

// Normalize a previo name so it matches regardless of the abbreviated,
// punctuated, or accented variants stored in `previo_catalog` (e.g. "Torno A.",
// "Laser"). Columns are matched to cells by previoCatalogId, never by name.
function normalizePrevioName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/\./g, "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

// The four previo types the warehouse (Daniel) checks, in display order.
const ALMACEN_PREVIO_ORDER = ["torno a", "torno e", "laser", "cojines"];
const ALMACEN_PREVIO_LABELS: Record<string, string> = {
  "torno a": "Torno armado",
  "torno e": "Torno ensamble",
  laser: "Láser",
  cojines: "Cojines",
};
const ALMACEN_PREVIO_KEYS = new Set(ALMACEN_PREVIO_ORDER);

type PrevioColumn = { id: string; label: string };

function buildPrevioColumns(machines: FloorPrevioRow[]): PrevioColumn[] {
  const byKey = new Map<string, string>(); // key -> previoCatalogId
  for (const machine of machines) {
    for (const previo of machine.previos) {
      const key = normalizePrevioName(previo.name);
      if (ALMACEN_PREVIO_KEYS.has(key) && !byKey.has(key)) {
        byKey.set(key, previo.previoCatalogId);
      }
    }
  }
  return ALMACEN_PREVIO_ORDER.filter((key) => byKey.has(key)).map((key) => ({
    id: byKey.get(key)!,
    label: ALMACEN_PREVIO_LABELS[key] ?? key,
  }));
}

function ReceivedChip({
  machineId,
  previo,
  dispatch,
}: {
  machineId: string;
  previo: FloorPrevio;
  dispatch: (intent: FloorIntent) => DispatchResult;
}) {
  return (
    <label
      className={cn(
        "inline-flex cursor-pointer items-center gap-1.5 border px-2.5 py-1.5 text-xs font-semibold leading-none transition-colors",
        previo.received
          ? "border-[var(--line-bio-green)] bg-[var(--line-bio-green)]/12 text-[var(--line-bio-green)]"
          : "border-[var(--xt-cement)] bg-[var(--xt-white)] text-[var(--xt-steel)]",
      )}
    >
      <input
        type="checkbox"
        checked={previo.received}
        className="h-5 w-5 accent-[var(--line-bio-green)]"
        onChange={(event) =>
          dispatch({
            type: "previo.set_received",
            payload: { machineId, previoCatalogId: previo.previoCatalogId, received: event.currentTarget.checked },
          })
        }
      />
      Recibido
    </label>
  );
}

/** Recibido de material. Cada marca se guarda en el iPad al instante y se envía sola (funciona sin red). */
export function AlmacenManager({
  machines,
  dispatch,
}: {
  machines: FloorPrevioRow[];
  dispatch: (intent: FloorIntent) => DispatchResult;
}) {
  const previoColumns = useMemo(() => buildPrevioColumns(machines), [machines]);
  const columnIds = useMemo(() => new Set(previoColumns.map((col) => col.id)), [previoColumns]);
  const [search, setSearch] = useState("");
  const [pendingOnly, setPendingOnly] = useState(false);

  // Only machines that actually need one of the four warehouse previos.
  const relevantMachines = useMemo(
    () => machines.filter((machine) => machine.previos.some((p) => columnIds.has(p.previoCatalogId))),
    [machines, columnIds],
  );

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return relevantMachines.filter((machine) => {
      if (pendingOnly) {
        const hasPending = machine.previos.some((p) => columnIds.has(p.previoCatalogId) && !p.received);
        if (!hasPending) return false;
      }
      if (!term) return true;
      return (
        String(machine.serial).includes(term) ||
        machine.client.toLowerCase().includes(term) ||
        machine.equipment.toLowerCase().includes(term)
      );
    });
  }, [relevantMachines, columnIds, pendingOnly, search]);

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Buscar por SERIAL, cliente o máquina"
          className="h-11 w-full max-w-xs text-base"
        />
        <label className="inline-flex items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            checked={pendingOnly}
            onChange={(event) => setPendingOnly(event.target.checked)}
            className="h-4 w-4"
          />
          Solo pendientes por recibir
        </label>
      </div>

      <div className="border border-[var(--xt-black)] bg-[var(--xt-white)] shadow-[var(--shadow-sm)]">
        <div className="overflow-auto max-h-[calc(100vh-4.5rem)]">
          <Table className="min-w-[900px] text-sm">
            <TableHeader>
              <TableRow>
                <TableHead>SERIAL</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Máquina</TableHead>
                <TableHead>Color</TableHead>
                <TableHead>Prometido</TableHead>
                {previoColumns.map((col) => (
                  <TableHead key={col.id} className="whitespace-nowrap text-center">
                    {col.label}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5 + previoColumns.length} className="py-8 text-center text-[var(--xt-steel)]">
                    No hay máquinas con material por recibir.
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((machine) => (
                  <TableRow key={machine.machineId}>
                    <TableCell>
                      <span className="font-semibold tabular-nums">{machine.serial}</span>
                    </TableCell>
                    <TableCell className="max-w-[160px]">
                      <CellTooltip text={machine.client}>
                        <span className="line-clamp-1">{machine.client}</span>
                      </CellTooltip>
                    </TableCell>
                    <TableCell className="max-w-[200px]">
                      <CellTooltip text={machine.equipment}>
                        <span className="line-clamp-1">{machine.equipment}</span>
                      </CellTooltip>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {machine.color ?? <span className="text-[var(--xt-aluminum)]">—</span>}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{formatDateEs(machine.promisedDate)}</TableCell>
                    {previoColumns.map((col) => {
                      const previo = machine.previos.find((p) => p.previoCatalogId === col.id);
                      return (
                        <TableCell key={col.id} className="text-center">
                          {previo ? (
                            <ReceivedChip machineId={machine.machineId} previo={previo} dispatch={dispatch} />
                          ) : (
                            <span className="text-[var(--xt-aluminum)]">—</span>
                          )}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
