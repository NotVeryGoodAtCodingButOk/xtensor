"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { ArrowRight } from "lucide-react";
import { sendToProductionAction, toggleMachinePrevioAction, updateMachineSerialAction, updateMachineClientAction, updateMachineColorAction } from "@/app/admin/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ActionTooltip, CellTooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { formatDateEs } from "@/services/schedule";
import type { MachinePrevioListRow, MachinePrevioView, PrevioCatalogView } from "@/types/domain";

function InlineSerialEdit({ machineId, serialNumber }: { machineId: string; serialNumber: number }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(String(serialNumber));
  const formRef = useRef<HTMLFormElement>(null);

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      formRef.current?.requestSubmit();
    } else if (e.key === "Escape") {
      setValue(String(serialNumber));
      setEditing(false);
    }
  }

  if (!editing) {
    return (
      <ActionTooltip text="Edita el número de SERIAL de esta máquina.">
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="font-semibold underline-offset-2 hover:underline cursor-text"
          title="Haz clic para editar la SERIAL"
        >
          {serialNumber}
        </button>
      </ActionTooltip>
    );
  }

  return (
    <form
      ref={formRef}
      action={updateMachineSerialAction}
      onSubmit={() => setEditing(false)}
    >
      <input type="hidden" name="machineId" value={machineId} />
      <input
        autoFocus
        type="number"
        name="serialNumber"
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
      <ActionTooltip text="Edita el nombre del cliente de esta máquina.">
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="max-w-[100px] truncate text-left cursor-text hover:underline underline-offset-2"
          title={clientName}
        >
          {clientName}
        </button>
      </ActionTooltip>
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

function InlineColorEdit({ machineId, colorId, colorName, colors }: { machineId: string; colorId: string | null; colorName: string | null; colors: { id: string; name: string }[] }) {
  const [editing, setEditing] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const selectRef = useRef<HTMLSelectElement>(null);

  if (!editing) {
    return (
      <ActionTooltip text="Edita el color de esta máquina.">
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="cursor-text hover:underline underline-offset-2 text-left"
          title={colorName ?? "Sin color"}
        >
          {colorName ?? <span className="text-[var(--xt-aluminum)]">—</span>}
        </button>
      </ActionTooltip>
    );
  }

  return (
    <form
      ref={formRef}
      action={updateMachineColorAction}
      onSubmit={() => setEditing(false)}
    >
      <input type="hidden" name="machineId" value={machineId} />
      <select
        ref={selectRef}
        autoFocus
        name="colorId"
        defaultValue={colorId ?? ""}
        onBlur={() => { formRef.current?.requestSubmit(); setEditing(false); }}
        onChange={() => { formRef.current?.requestSubmit(); setEditing(false); }}
        onKeyDown={(e) => {
          if (e.key === "Escape") setEditing(false);
        }}
        className="rounded-[2px] border border-[var(--xt-yellow)] bg-[var(--xt-yellow-soft)] px-1 py-0.5 text-xs outline-none"
      >
        <option value="">Sin color</option>
        {colors.map((c) => (
          <option key={c.id} value={c.id}>{c.name}</option>
        ))}
      </select>
    </form>
  );
}

const selectCls =
  "flex h-8 rounded-[2px] border border-[var(--xt-aluminum)] bg-[var(--xt-white)] px-2 py-1 text-sm focus-visible:border-[var(--xt-black)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--xt-yellow)]";

// Normalize a previo name so display/order/exclusion lists are robust to the
// abbreviated, punctuated, or accented variants stored in `previo_catalog`
// (e.g. "Inox.", "Pintu.", "Plástico"). Columns are matched to cells by
// previoCatalogId, never by name, so renames can't silently drop a column.
function normalizePrevioName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/\./g, "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

// Previo types intentionally hidden from the board (data is kept, just not shown).
const EXCLUDED_PREVIOS = new Set(["zinc", "rodam", "rodamientos", "tornillos", "plastico"]);

// Clean header labels for the abbreviated catalog names; falls back to the
// catalog name for anything not listed here.
const PREVIO_LABELS: Record<string, string> = {
  inox: "Inox",
  "torno a": "Torno A",
  "torno e": "Torno E",
  pintu: "Pintura",
};

// Fixed column order (production sequence); unknown previos are appended after.
const PREVIO_COLUMN_ORDER = ["laser", "tubos", "inox", "placas", "torno a", "torno e", "pintu", "carenaje", "cojines"];

type PrevioColumn = { id: string; label: string };

function buildPrevioColumns(catalog: PrevioCatalogView[]): PrevioColumn[] {
  return catalog
    .filter((item) => !EXCLUDED_PREVIOS.has(normalizePrevioName(item.name)))
    .map((item) => {
      const key = normalizePrevioName(item.name);
      return { id: item.id, label: PREVIO_LABELS[key] ?? item.name, order: PREVIO_COLUMN_ORDER.indexOf(key) };
    })
    .sort((a, b) => {
      const ao = a.order === -1 ? Number.MAX_SAFE_INTEGER : a.order;
      const bo = b.order === -1 ? Number.MAX_SAFE_INTEGER : b.order;
      if (ao !== bo) return ao - bo;
      return a.label.localeCompare(b.label, "es");
    })
    .map(({ id, label }) => ({ id, label }));
}

function PrevioColumnChip({ machineId, previo }: { machineId: string; previo: MachinePrevioView }) {
  const orderedRef = useRef<HTMLInputElement>(null);
  const receivedRef = useRef<HTMLInputElement>(null);
  const bothDone = previo.ordered && previo.received;
  const neitherDone = !previo.ordered && !previo.received;

  return (
    <div
      className={cn(
        "inline-flex items-center gap-1 border px-1.5 py-1 text-[10px] leading-none",
        bothDone
          ? "border-[var(--line-bio-green)] bg-[var(--line-bio-green)]/10 text-[var(--line-bio-green)]"
          : neitherDone
            ? "border-[var(--xt-cement)] bg-[var(--xt-white)] text-[var(--xt-steel)]"
            : "border-[var(--xt-yellow)] bg-[var(--xt-yellow-soft)] text-[var(--xt-black)]",
      )}
    >
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

export function PreviosManager({
  pendingMachines,
  productionMachines,
  seededMessage,
  colors = [],
  previoCatalog = [],
}: {
  pendingMachines: MachinePrevioListRow[];
  productionMachines: MachinePrevioListRow[];
  seededMessage?: string | null;
  colors?: { id: string; name: string }[];
  previoCatalog?: PrevioCatalogView[];
}) {
  const previoColumns = useMemo(() => buildPrevioColumns(previoCatalog), [previoCatalog]);
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
        String(machine.serialNumber).includes(term) ||
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
              placeholder="Buscar por SERIAL, cliente o equipo"
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
              <ActionTooltip text="Mueve las máquinas seleccionadas desde previos a producción.">
                <Button type="submit" size="sm">
                  <ArrowRight className="h-4 w-4" />
                  Enviar a producción ({selected.size})
                </Button>
              </ActionTooltip>
            </form>
          )}
        </div>
        <div className="overflow-x-auto">
          <Table className="min-w-[1700px] text-xs">
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
                <TableHead>SERIAL</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Código</TableHead>
                <TableHead>Máquina</TableHead>
                <TableHead>Color</TableHead>
                <TableHead>Prometido</TableHead>
                {previoColumns.map((col) => (
                  <TableHead key={col.id} className="whitespace-nowrap text-center">{col.label}</TableHead>
                ))}
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredPending.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7 + previoColumns.length + 1} className="py-6 text-center text-[var(--xt-steel)]">
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
                        aria-label={`Seleccionar SERIAL ${machine.serialNumber}`}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <InlineSerialEdit machineId={machine.machineId} serialNumber={machine.serialNumber} />
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
                    <TableCell className="whitespace-nowrap">
                      <InlineColorEdit machineId={machine.machineId} colorId={machine.colorId} colorName={machine.colorName} colors={colors} />
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{formatDateEs(machine.promisedDate)}</TableCell>
                    {previoColumns.map((col) => {
                      const previo = machine.previos.find((p) => p.previoCatalogId === col.id);
                      return (
                        <TableCell key={col.id} className="text-center">
                          {previo ? (
                            <PrevioColumnChip machineId={machine.machineId} previo={previo} />
                          ) : (
                            <span className="text-[var(--xt-aluminum)]">—</span>
                          )}
                        </TableCell>
                      );
                    })}
                    <TableCell>
                      <form action={sendToProductionAction}>
                        <input type="hidden" name="machineIds" value={machine.machineId} />
                        <ActionTooltip text="Envía esta máquina a producción." align="right">
                          <button
                            type="submit"
                            title="Enviar a producción"
                            className="inline-flex h-6 w-6 items-center justify-center rounded-[2px] border border-[var(--xt-steel)] bg-[var(--xt-graphite)] text-[var(--xt-white)] hover:bg-[var(--xt-black)]"
                          >
                            <ArrowRight className="h-3 w-3" />
                          </button>
                        </ActionTooltip>
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
            <Table className="min-w-[1640px] text-xs">
              <TableHeader>
                <TableRow>
                  <TableHead>SERIAL</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Código</TableHead>
                  <TableHead>Máquina</TableHead>
                  <TableHead>Color</TableHead>
                  <TableHead>Prometido</TableHead>
                  {previoColumns.map((col) => (
                    <TableHead key={col.id} className="whitespace-nowrap text-center">{col.label}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredProduction.map((machine) => (
                  <TableRow key={machine.machineId}>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <InlineSerialEdit machineId={machine.machineId} serialNumber={machine.serialNumber} />
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
                    <TableCell className="whitespace-nowrap">
                      <InlineColorEdit machineId={machine.machineId} colorId={machine.colorId} colorName={machine.colorName} colors={colors} />
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{formatDateEs(machine.promisedDate)}</TableCell>
                    {previoColumns.map((col) => {
                      const previo = machine.previos.find((p) => p.previoCatalogId === col.id);
                      return (
                        <TableCell key={col.id} className="text-center">
                          {previo ? (
                            <PrevioColumnChip machineId={machine.machineId} previo={previo} />
                          ) : (
                            <span className="text-[var(--xt-aluminum)]">—</span>
                          )}
                        </TableCell>
                      );
                    })}
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
