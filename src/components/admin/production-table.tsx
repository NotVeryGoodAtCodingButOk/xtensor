import Link from "next/link";
import { Pencil, RotateCcw, Truck } from "lucide-react";
import { markShippedAction, unmarkShippedAction } from "@/app/admin/actions";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn, formatCurrencyCop, formatPercent } from "@/lib/utils";
import { formatDateEs } from "@/services/schedule";
import type { CalculatedMachineView } from "@/types/domain";

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

const C = "px-2 py-1.5";
const STAGES_SHORT = ["Mat", "Arm", "Res", "Pul", "Pin", "Ens", "Emp"];
const STAGES_FULL  = ["Material", "Armar", "Resoldar", "Pulir", "Pintar", "Ensamblar", "Empacar"];

export function ProductionTable({
  machines,
  shipped = false,
  colorRows = false,
}: {
  machines: CalculatedMachineView[];
  shipped?: boolean;
  colorRows?: boolean;
}) {
  return (
    <div className="overflow-x-auto border border-[var(--xt-black)] bg-[var(--xt-white)] shadow-[var(--shadow-sm)]">
      <Table className="min-w-[1200px] text-xs">
        <TableHeader>
          <TableRow>
            <TableHead className={C}>#</TableHead>
            <TableHead className={C}>%</TableHead>
            <TableHead className={C}>COTI</TableHead>
            <TableHead className={C}>Cliente</TableHead>
            <TableHead className={C}>Equipo</TableHead>
            <TableHead className={C}>Color</TableHead>
            <TableHead className={C}>Ciudad</TableHead>
            <TableHead className={C}>Línea</TableHead>
            <TableHead className={`${C} text-right`} title="Venta antes de IVA">Venta</TableHead>
            <TableHead className={`${C} text-right`} title="Horas totales">H.Tot</TableHead>
            <TableHead className={`${C} text-right`} title="Horas faltantes">H.Fal</TableHead>
            <TableHead className={`${C} text-right`} title="Días-hombre restantes">D-H</TableHead>
            <TableHead className={`${C} text-right`} title="Horas acumuladas en cola">Acum</TableHead>
            <TableHead className={C}>Quién</TableHead>
            <TableHead className={C} title="Fecha ofrecida">Ofrec.</TableHead>
            <TableHead className={C} title="Fecha estimada">Estim.</TableHead>
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
