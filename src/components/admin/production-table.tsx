"use client";

import Link from "next/link";
import { Pencil, RotateCcw, Truck } from "lucide-react";
import { markShippedAction, unmarkShippedAction } from "@/app/admin/actions";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn, formatCurrencyCop, formatPercent } from "@/lib/utils";
import { formatDateEs } from "@/services/schedule";
import type { CalculatedMachineView } from "@/types/domain";

export type SortKey = keyof CalculatedMachineView;
export type SortConfig = { key: SortKey; dir: "asc" | "desc" } | null;

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

export function ProductionTable({
  machines,
  shipped = false,
  colorRows = false,
  sortConfig = null,
  onSort,
}: {
  machines: CalculatedMachineView[];
  shipped?: boolean;
  colorRows?: boolean;
  sortConfig?: SortConfig;
  onSort?: (key: SortKey) => void;
}) {
  const sortable = !!onSort;
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
            {sh("orderPosition", "#")}
            {sh("progressPct", "%")}
            {sh("cotiNumber", "COTI")}
            {sh("clientName", "Cliente")}
            {sh("equipmentName", "Equipo")}
            {sh("colorName", "Color")}
            {sh("city", "Ciudad")}
            {sh("line", "Línea")}
            {sh("salePriceCop", "Venta", `${C} text-right`, "Venta antes de IVA")}
            {sh("totalHours", "H.Tot", `${C} text-right`, "Horas totales")}
            {sh("remainingHours", "H.Fal", `${C} text-right`, "Horas faltantes")}
            {sh("remainingHumanDays", "D-H", `${C} text-right`, "Días-hombre restantes")}
            {sh("accumulatedHours", "Acum", `${C} text-right`, "Horas acumuladas en cola")}
            {sh("assignedTo", "Quién")}
            {sh("promisedDate", "Ofrec.", C, "Fecha ofrecida")}
            {sh("estimatedDate", "Estim.", C, "Fecha estimada")}
            {STAGES_SHORT.map((s, i) => (
              <TableHead key={s} className={`${C} text-center`} title={STAGES_FULL[i]}>{s}</TableHead>
            ))}
            <TableHead className={C} />
          </TableRow>
        </TableHeader>
        <TableBody>
          {machines.map((machine) => {
            const isLate   = machine.estimatedDate > machine.promisedDate;
            const isReady  = machine.progressPct >= 1 && machine.status === "in_production";
            const rowColor = colorRows ? getMachineRowColor(machine.colorName) : null;
            return (
              <TableRow
                key={machine.id}
                className={cn(isReady && !rowColor ? "bg-[var(--xt-yellow-soft)]" : undefined)}
                style={rowColor ? { backgroundColor: rowColor } : undefined}
              >
                <TableCell className={`${C} tabular-nums text-[var(--xt-steel)]`}>{machine.orderPosition}</TableCell>

                <TableCell className={C}>
                  <div className="flex w-14 flex-col gap-0.5">
                    <Progress value={machine.progressPct} className="h-1.5" />
                    <span className="text-center tabular-nums text-[10px] leading-none text-[var(--xt-steel)]">
                      {formatPercent(machine.progressPct)}
                    </span>
                  </div>
                </TableCell>

                <TableCell className={C}>
                  <Link
                    className="font-semibold underline-offset-2 hover:underline hover:decoration-[var(--xt-yellow)]"
                    href={`/admin/maquinas/${machine.id}`}
                  >
                    {machine.cotiNumber}
                  </Link>
                </TableCell>

                <TableCell className={`${C} max-w-[90px] truncate`} title={machine.clientName}>
                  {machine.clientName}
                </TableCell>

                <TableCell className={`${C} max-w-[160px]`} title={`${machine.equipmentCode ?? ""} ${machine.equipmentName}`}>
                  {machine.equipmentCode && (
                    <span className="mr-1 font-mono text-[10px] text-[var(--xt-steel)]">
                      {machine.equipmentCode}
                    </span>
                  )}
                  <span className="line-clamp-1">{machine.equipmentName}</span>
                </TableCell>

                <TableCell className={`${C} whitespace-nowrap`}>{machine.colorName ?? "—"}</TableCell>
                <TableCell className={C}>{machine.city ?? "—"}</TableCell>
                <TableCell className={C}>{machine.line ?? "—"}</TableCell>

                <TableCell className={`${C} text-right tabular-nums whitespace-nowrap`}>
                  {formatCurrencyCop(machine.salePriceCop)}
                </TableCell>
                <TableCell className={`${C} text-right tabular-nums`}>{machine.totalHours.toFixed(1)}</TableCell>
                <TableCell className={`${C} text-right tabular-nums`}>{machine.remainingHours.toFixed(1)}</TableCell>
                <TableCell className={`${C} text-right tabular-nums`}>{machine.remainingHumanDays.toFixed(1)}</TableCell>
                <TableCell className={`${C} text-right tabular-nums`}>{machine.accumulatedHours.toFixed(1)}</TableCell>

                <TableCell className={C}>{machine.assignedTo ?? "—"}</TableCell>
                <TableCell className={`${C} whitespace-nowrap`}>{formatDateEs(machine.promisedDate)}</TableCell>
                <TableCell
                  className={cn(`${C} whitespace-nowrap`, isLate && "bg-red-50 text-[var(--line-pro-red)]")}
                >
                  {formatDateEs(machine.estimatedDate)}
                </TableCell>

                {machine.stages.map((stage) => (
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
                    <form action={shipped ? unmarkShippedAction : markShippedAction}>
                      <input type="hidden" name="machineId" value={machine.id} />
                      <button
                        type="submit"
                        title={shipped ? "Reactivar" : "Despachar"}
                        className="inline-flex h-6 w-6 items-center justify-center rounded-[2px] border border-[var(--xt-steel)] bg-[var(--xt-graphite)] text-[var(--xt-white)] hover:bg-[var(--xt-black)]"
                      >
                        {shipped ? <RotateCcw className="h-3 w-3" /> : <Truck className="h-3 w-3" />}
                      </button>
                    </form>
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
  if (!colorName) return null;
  const normalized = normalizeColorName(colorName);
  const hex = MACHINE_ROW_COLORS[normalized];
  if (!hex) return null;
  const r = Number.parseInt(hex.slice(0, 2), 16);
  const g = Number.parseInt(hex.slice(2, 4), 16);
  const b = Number.parseInt(hex.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, 0.2)`;
}

function normalizeColorName(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

const MACHINE_ROW_COLORS: Record<string, string> = {
  amarillo: "facc15",
  azul:     "60a5fa",
  beige:    "d6c2a1",
  blanco:   "e5e7eb",
  cafe:     "b45309",
  crema:    "e7d7b1",
  dorado:   "eab308",
  fucsia:   "ec4899",
  gris:     "9ca3af",
  naranja:  "fb923c",
  negro:    "9ca3af",
  plateado: "cbd5e1",
  rojo:     "f87171",
  rosado:   "f9a8d4",
  verde:    "4ade80",
  violeta:  "a78bfa",
};
