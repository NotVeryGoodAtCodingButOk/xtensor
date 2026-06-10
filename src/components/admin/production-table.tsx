"use client";

import Link from "next/link";
import type { KeyboardEvent, ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { Pencil, Trash2, Truck } from "lucide-react";
import {
  updateMachineInlineAction,
  markShippedAction,
  warrantyMachineAction,
} from "@/app/admin/actions";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CellTooltip } from "@/components/ui/tooltip";
import { Input } from "@/components/ui/input";
import { resolveMachineColorHex } from "@/lib/machine-colors";
import { MACHINE_LINE_OPTIONS, normalizeMachineLine } from "@/lib/machine-lines";
import { cn, formatCurrencyCop } from "@/lib/utils";
import { formatDateEs } from "@/services/schedule";
import type { CalculatedMachineView } from "@/types/domain";

export type SortKey = keyof CalculatedMachineView;
export type SortConfig = { key: SortKey; dir: "asc" | "desc" } | null;
type EditableField = "placaNumber" | "salePriceCop" | "assignedTo" | "promisedDate" | "orderPosition" | "city" | "line";

function StagePin({ completion }: { completion: number }) {
  if (completion === 100) {
    return <span className="font-bold text-[var(--line-bio-green)]">✓</span>;
  }
  if (completion > 0) {
    return (
      <span className="rounded-[2px] bg-[var(--xt-yellow)] px-1 py-0.5 font-bold tabular-nums text-[var(--xt-black)]">
        {completion}
      </span>
    );
  }
  return <span className="text-[var(--xt-cement)]">·</span>;
}

function SortIndicator({ active, dir }: { active: boolean; dir?: "asc" | "desc" }) {
  if (!active) return <span className="text-[var(--xt-aluminum)] text-[10px]">⇅</span>;
  return <span className="text-[10px]">{dir === "asc" ? "↑" : "↓"}</span>;
}

const C = "px-2 py-1.5";
const STAGES_SHORT = ["Mat", "Arm", "Res", "Pul", "Pin", "Ens", "Emp"];
const STAGES_FULL  = ["Material", "Armar", "Resoldar", "Pulir", "Pintar", "Ensamblar", "Empacar"];

function EditableMachineCell({
  machine,
  field,
  display,
  value,
  inputType,
  className,
  inputClassName,
  min,
  step,
  title,
}: {
  machine: CalculatedMachineView;
  field: EditableField;
  display: ReactNode;
  value: string | number;
  inputType: "text" | "number" | "date";
  className?: string;
  inputClassName?: string;
  min?: number;
  step?: number | "any";
  title?: string;
}) {
  const [editing, setEditing] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editing) return;
    inputRef.current?.focus();
    if (inputType !== "date") {
      inputRef.current?.select();
    }
  }, [editing, inputType]);

  function beginEdit() {
    setEditing(true);
  }

  function submitEdit() {
    formRef.current?.requestSubmit();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      setEditing(false);
    }
    if (event.key === "Enter") {
      event.preventDefault();
      submitEdit();
    }
  }

  if (!editing) {
    return (
      <div
        className={cn(
          "cursor-text rounded-[2px] px-1 -mx-1 transition-colors hover:bg-[var(--xt-yellow-soft)]",
          className,
        )}
        onDoubleClick={beginEdit}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            beginEdit();
          }
        }}
        role="button"
        tabIndex={0}
        title={title ?? "Doble clic para editar"}
      >
        {display}
      </div>
    );
  }

  return (
    <form ref={formRef} action={updateMachineInlineAction} className={cn("min-w-0", className)}>
      <input type="hidden" name="machineId" value={machine.id} />
      <HiddenMachineFields machine={machine} omit={field} />
      <Input
        ref={inputRef}
        name={field}
        type={inputType}
        defaultValue={String(value)}
        min={min}
        step={step}
        onBlur={submitEdit}
        onKeyDown={handleKeyDown}
        className={cn(
          "h-7 rounded-[2px] border-[var(--xt-black)] px-2 text-xs shadow-none focus-visible:ring-1 focus-visible:ring-[var(--xt-yellow)]",
          inputClassName,
        )}
      />
    </form>
  );
}

function HiddenMachineFields({ machine, omit }: { machine: CalculatedMachineView; omit: EditableField }) {
  const fields: Array<{ name: EditableField; value: string | number }> = [
    { name: "placaNumber", value: machine.placaNumber },
    { name: "salePriceCop", value: machine.salePriceCop },
    { name: "assignedTo", value: machine.assignedTo ?? "" },
    { name: "promisedDate", value: machine.promisedDate },
    { name: "orderPosition", value: machine.orderPosition },
    { name: "city", value: machine.city ?? "" },
    { name: "line", value: machine.line ?? "" },
  ];

  return (
    <>
      {fields
        .filter((field) => field.name !== omit)
        .map((field) => (
          <input key={field.name} type="hidden" name={field.name} value={field.value} />
        ))}
    </>
  );
}

function EditableMachineLineCell({
  machine,
}: {
  machine: CalculatedMachineView;
}) {
  const [editing, setEditing] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const selectRef = useRef<HTMLSelectElement>(null);

  useEffect(() => {
    if (!editing) return;
    selectRef.current?.focus();
  }, [editing]);

  function beginEdit() {
    setEditing(true);
  }

  function submitEdit() {
    formRef.current?.requestSubmit();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLSelectElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      setEditing(false);
    }
    if (event.key === "Enter") {
      event.preventDefault();
      submitEdit();
    }
  }

  const line = normalizeMachineLine(machine.line);

  if (!editing) {
    return (
      <div
        className="w-full cursor-text rounded-[2px] px-1 -mx-1 transition-colors hover:bg-[var(--xt-yellow-soft)]"
        onDoubleClick={beginEdit}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            beginEdit();
          }
        }}
        role="button"
        tabIndex={0}
        title="Doble clic para editar la línea"
      >
        {line}
      </div>
    );
  }

  return (
    <form ref={formRef} action={updateMachineInlineAction} className="min-w-0">
      <input type="hidden" name="machineId" value={machine.id} />
      <HiddenMachineFields machine={machine} omit="line" />
      <select
        ref={selectRef}
        name="line"
        defaultValue={line}
        onBlur={submitEdit}
        onChange={submitEdit}
        onKeyDown={handleKeyDown}
        className="h-7 min-w-28 rounded-[2px] border border-[var(--xt-black)] bg-[var(--xt-white)] px-2 text-xs shadow-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--xt-yellow)]"
      >
        {MACHINE_LINE_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </form>
  );
}

type SortableHeadProps = {
  sortKey: SortKey;
  label: string;
  className?: string;
  title?: string;
  sortConfig: SortConfig;
  onSort: (key: SortKey) => void;
};

function SortableHead({ sortKey, label, className, title, sortConfig, onSort }: SortableHeadProps) {
  const active = sortConfig?.key === sortKey;
  return (
    <TableHead className={cn(C, className)} title={title}>
      <button
        onClick={() => onSort(sortKey)}
        className="inline-flex items-center gap-1 font-semibold uppercase tracking-wide hover:text-[var(--xt-black)]"
      >
        {label}
        <SortIndicator active={active} dir={sortConfig?.dir} />
      </button>
    </TableHead>
  );
}

function WarrantyButton({ machineId }: { machineId: string }) {
  const formRef = useRef<HTMLFormElement>(null);
  const messageRef = useRef<HTMLInputElement>(null);

  function handleClick() {
    const message = window.prompt("Mensaje muy breve de la garantía");
    if (!message?.trim()) {
      return;
    }

    if (messageRef.current) {
      messageRef.current.value = message.trim();
    }
    formRef.current?.requestSubmit();
  }

  return (
    <form ref={formRef} action={warrantyMachineAction}>
      <input type="hidden" name="machineId" value={machineId} />
      <input ref={messageRef} type="hidden" name="message" defaultValue="" />
      <button
        type="button"
        onClick={handleClick}
        title="Enviar a garantía"
        className="inline-flex h-6 items-center justify-center rounded-[2px] border border-[var(--xt-black)] bg-[var(--xt-yellow)] px-2 text-[10px] font-semibold uppercase tracking-wide text-[var(--xt-black)] hover:bg-[var(--xt-yellow-soft)]"
      >
        Garantía
      </button>
    </form>
  );
}

export function ProductionTable({
  machines,
  shipped = false,
  colorRows = false,
  sortConfig = null,
  onSort,
  selectedIds,
  onToggle,
  onDeleteShipped,
}: {
  machines: CalculatedMachineView[];
  shipped?: boolean;
  colorRows?: boolean;
  sortConfig?: SortConfig;
  onSort?: (key: SortKey) => void;
  selectedIds?: Set<string>;
  onToggle?: (id: string) => void;
  onDeleteShipped?: (id: string) => void;
}) {
  const sortable = !!onSort;
  const selectable = !!onToggle && !!selectedIds;
  const sh = (key: SortKey, label: string, className?: string, title?: string) =>
    sortable ? (
      <SortableHead key={key} sortKey={key} label={label} className={className} title={title} sortConfig={sortConfig} onSort={onSort!} />
    ) : (
      <TableHead key={key} className={cn(C, className)} title={title}>{label}</TableHead>
    );

  return (
    <div className="overflow-x-auto border border-[var(--xt-black)] bg-[var(--xt-white)] shadow-[var(--shadow-sm)]">
      <Table className="min-w-[1200px] text-xs">
        <TableHeader>
          <TableRow>
            {selectable && <TableHead className="w-8 px-2" />}
            {sh("orderPosition", "#")}
            {!shipped && sh("progressPct", "%")}
            {sh("placaNumber", "PLACA")}
            {sh("clientName", "Cliente")}
            {sh("equipmentCode", "Código")}
            {sh("equipmentName", "Máquina")}
            {sh("colorName", "Color")}
            {sh("city", "Ciudad")}
            {sh("line", "Línea")}
            {!shipped && sh("salePriceCop", "Venta", `${C} text-right`, "Venta antes de IVA")}
            {sh("totalHours", "H.Tot", `${C} text-right`, "Horas totales")}
            {!shipped && sh("remainingHours", "H.Fal", `${C} text-right`, "Horas faltantes")}
            {!shipped && sh("remainingHumanDays", "D-H", `${C} text-right`, "Días-hombre restantes")}
            {sh("accumulatedHours", "Acum", `${C} text-right`, "Horas acumuladas en cola")}
            {sh("assignedTo", "Quién")}
            {sh("promisedDate", "Prom.", C, "Fecha prometida")}
            {shipped && sh("shippedAt", "Despach.", C, "Fecha de despacho")}
            {!shipped && sh("estimatedDate", "Act.", C, "Fecha actualizada")}
            {sh("productionStartedAt", "Inicio", C, "Inicio en producción")}
            {sh("completedAt", "Term.", C, "Fecha terminada")}
            {!shipped && STAGES_SHORT.map((s, i) => (
              <TableHead key={s} className={`${C} text-center`} title={STAGES_FULL[i]}>{s}</TableHead>
            ))}
            <TableHead className={C} />
          </TableRow>
        </TableHeader>
        <TableBody>
          {machines.map((machine) => {
            const isLate   = machine.estimatedDate > machine.promisedDate;
            const rowColor = colorRows ? getMachineRowColor(machine.colorName) : null;
            return (
              <TableRow
                key={machine.id}
                style={rowColor ? { backgroundColor: rowColor } : undefined}
              >
                {selectable && (
                  <TableCell className="px-2">
                    <input
                      type="checkbox"
                      checked={selectedIds!.has(machine.id)}
                      onChange={() => onToggle!(machine.id)}
                      aria-label={`Seleccionar PLACA ${machine.placaNumber}`}
                    />
                  </TableCell>
                )}
                <TableCell className={`${C} tabular-nums text-[var(--xt-steel)]`}>
                  <EditableMachineCell
                    machine={machine}
                    field="orderPosition"
                    value={machine.orderPosition}
                    inputType="number"
                    min={1}
                    step={1}
                    className="w-full"
                    inputClassName="w-16 text-center tabular-nums"
                    display={machine.orderPosition}
                    title="Doble clic para editar la posición en cola"
                  />
                </TableCell>

                {!shipped && (
                  <TableCell className={C}>
                    <div className="flex w-14 flex-col gap-0.5">
                      <div className="h-1.5 overflow-hidden rounded-full bg-[var(--xt-cement)]">
                        <div
                          className="h-full bg-[var(--xt-black)]"
                          style={{ width: `${Math.max(0, Math.min(1, machine.progressPct)) * 100}%` }}
                        />
                      </div>
                      <span className="text-center tabular-nums text-[10px] leading-none text-[var(--xt-steel)]">
                        {Math.round(machine.progressPct * 100)}%
                      </span>
                    </div>
                  </TableCell>
                )}

                <TableCell className={`${C} tabular-nums`}>
                  <EditableMachineCell
                    machine={machine}
                    field="placaNumber"
                    value={machine.placaNumber}
                    inputType="number"
                    min={1}
                    step={1}
                    className="w-full font-semibold"
                    inputClassName="w-20 font-semibold tabular-nums"
                    display={machine.placaNumber}
                    title="Doble clic para editar el PLACA"
                  />
                </TableCell>

                <TableCell className={`${C} max-w-[90px]`}>
                  <CellTooltip text={machine.clientName} className="truncate w-full">
                    <span className="truncate">{machine.clientName}</span>
                  </CellTooltip>
                </TableCell>

                <TableCell className={`${C} whitespace-nowrap font-mono text-[10px] text-[var(--xt-steel)]`}>
                  {machine.equipmentCode ?? "—"}
                </TableCell>

                <TableCell className={`${C} max-w-[160px]`}>
                  <CellTooltip text={machine.equipmentName}>
                    <span className="line-clamp-1">{machine.equipmentName}</span>
                  </CellTooltip>
                </TableCell>

                <TableCell className={`${C} whitespace-nowrap`}>{machine.colorName ?? "—"}</TableCell>
                <TableCell className={C}>
                  <EditableMachineCell
                    machine={machine}
                    field="city"
                    value={machine.city ?? ""}
                    inputType="text"
                    className="w-full"
                    inputClassName="min-w-24"
                    display={machine.city ?? "—"}
                  />
                </TableCell>
                <TableCell className={C}>
                  <EditableMachineLineCell machine={machine} />
                </TableCell>

                {!shipped && (
                  <TableCell className={`${C} text-right tabular-nums whitespace-nowrap`}>
                    <EditableMachineCell
                      machine={machine}
                      field="salePriceCop"
                      value={machine.salePriceCop}
                      inputType="number"
                      min={0}
                      step={1}
                      className="w-full"
                      inputClassName="w-28 text-right tabular-nums"
                      display={formatCurrencyCop(machine.salePriceCop)}
                      title="Doble clic para editar la venta antes de IVA"
                    />
                  </TableCell>
                )}
                <TableCell className={`${C} text-right tabular-nums`}>{machine.totalHours.toFixed(1)}</TableCell>
                {!shipped && <TableCell className={`${C} text-right tabular-nums`}>{machine.remainingHours.toFixed(1)}</TableCell>}
                {!shipped && <TableCell className={`${C} text-right tabular-nums`}>{machine.remainingHumanDays.toFixed(1)}</TableCell>}
                <TableCell className={`${C} text-right tabular-nums`}>{machine.accumulatedHours.toFixed(1)}</TableCell>

                <TableCell className={C}>
                  <EditableMachineCell
                    machine={machine}
                    field="assignedTo"
                    value={machine.assignedTo ?? ""}
                    inputType="text"
                    className="w-full"
                    inputClassName="min-w-24"
                    display={machine.assignedTo ?? "—"}
                  />
                </TableCell>
                <TableCell className={`${C} whitespace-nowrap`}>
                  <EditableMachineCell
                    machine={machine}
                    field="promisedDate"
                    value={machine.promisedDate}
                    inputType="date"
                    className="w-full"
                    inputClassName="w-36"
                    display={formatDateEs(machine.promisedDate)}
                    title="Doble clic para editar la fecha prometida"
                  />
                </TableCell>
                {shipped && (
                  <TableCell className={`${C} whitespace-nowrap`}>
                    {machine.shippedAt ? formatDateEs(machine.shippedAt) : "—"}
                  </TableCell>
                )}
                {!shipped && (
                  <TableCell
                    className={cn(`${C} whitespace-nowrap`, isLate && "bg-red-50 text-[var(--line-pro-red)]")}
                  >
                    {formatDateEs(machine.estimatedDate)}
                  </TableCell>
                )}
                <TableCell className={`${C} whitespace-nowrap`}>
                  {machine.productionStartedAt ? formatDateEs(machine.productionStartedAt) : "—"}
                </TableCell>
                <TableCell className={`${C} whitespace-nowrap`}>
                  {machine.completedAt ? formatDateEs(machine.completedAt) : "—"}
                </TableCell>

                {!shipped && machine.stages.map((stage) => (
                  <TableCell key={stage.id} className={`${C} text-center`}>
                    <StagePin completion={stage.completion} />
                  </TableCell>
                ))}

                <TableCell className={C}>
                  <div className="flex gap-1">
                    {!shipped && (
                      <Link
                        href={`/admin/maquinas/${machine.id}`}
                        title="Editar"
                        className="inline-flex h-6 w-6 items-center justify-center rounded-[2px] border border-[var(--xt-black)] bg-[var(--xt-white)] text-[var(--xt-black)] hover:bg-[var(--xt-yellow-soft)]"
                      >
                        <Pencil className="h-3 w-3" />
                      </Link>
                    )}
                    {shipped ? (
                      <>
                        <WarrantyButton machineId={machine.id} />
                        {onDeleteShipped && (
                          <button
                            type="button"
                            title="Eliminar"
                            onClick={() => onDeleteShipped(machine.id)}
                            className="inline-flex h-6 w-6 items-center justify-center rounded-[2px] border border-red-300 bg-red-50 text-red-600 hover:bg-red-100"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        )}
                      </>
                    ) : (
                      <form action={markShippedAction}>
                        <input type="hidden" name="machineId" value={machine.id} />
                        <button
                          type="submit"
                          title="Despachar"
                          className="inline-flex h-6 w-6 items-center justify-center rounded-[2px] border border-[var(--xt-steel)] bg-[var(--xt-graphite)] text-[var(--xt-white)] hover:bg-[var(--xt-black)]"
                        >
                          <Truck className="h-3 w-3" />
                        </button>
                      </form>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

function getMachineRowColor(colorName: string | null) {
  const hex = resolveMachineColorHex(colorName);
  if (!hex) return null;
  const r = Number.parseInt(hex.slice(0, 2), 16);
  const g = Number.parseInt(hex.slice(2, 4), 16);
  const b = Number.parseInt(hex.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, 0.2)`;
}
