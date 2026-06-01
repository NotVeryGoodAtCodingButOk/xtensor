import Link from "next/link";
import { ArrowUpDown, MoreHorizontal, Pencil, Truck } from "lucide-react";
import { markShippedAction, unmarkShippedAction } from "@/app/admin/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCurrencyCop, formatPercent } from "@/lib/utils";
import { formatDateEs } from "@/services/schedule";
import type { CalculatedMachineView } from "@/types/domain";

export function ProductionTable({
  machines,
  shipped = false,
}: {
  machines: CalculatedMachineView[];
  shipped?: boolean;
}) {
  return (
    <div className="overflow-x-auto border border-[var(--xt-black)] bg-[var(--xt-white)] shadow-[var(--shadow-sm)]">
      <Table className="min-w-[1900px]">
        <TableHeader>
          <TableRow>
            <TableHead>
              <ArrowUpDown className="h-4 w-4" aria-label="Orden" />
            </TableHead>
            <TableHead>Avance %</TableHead>
            <TableHead>COTI</TableHead>
            <TableHead>Cliente</TableHead>
            <TableHead>Cód. equipo</TableHead>
            <TableHead>Equipo</TableHead>
            <TableHead>Color</TableHead>
            <TableHead>Ciudad</TableHead>
            <TableHead>Línea</TableHead>
            <TableHead className="text-right">Venta antes de IVA</TableHead>
            <TableHead className="text-right">Horas totales</TableHead>
            <TableHead className="text-right">Horas faltantes</TableHead>
            <TableHead className="text-right">Días-hombre</TableHead>
            <TableHead className="text-right">Acumulado</TableHead>
            <TableHead>Quién</TableHead>
            <TableHead>Ofrecido</TableHead>
            <TableHead>Estimado</TableHead>
            {["Material", "Armar", "Resoldar", "Pulir", "Pintar", "Ensamblar", "Empacar"].map((stage) => (
              <TableHead key={stage}>{stage}</TableHead>
            ))}
            <TableHead>Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {machines.map((machine) => {
            const isLate = machine.estimatedDate > machine.promisedDate;
            const isReady = machine.progressPct >= 1 && machine.status === "in_production";
            return (
              <TableRow key={machine.id} className={isReady ? "bg-[var(--xt-yellow-soft)]" : undefined}>
                <TableCell className="text-[var(--xt-steel)]">{machine.orderPosition}</TableCell>
                <TableCell>
                  <div className="grid min-w-28 gap-1">
                    <span>{formatPercent(machine.progressPct)}</span>
                    <Progress value={machine.progressPct} />
                  </div>
                </TableCell>
                <TableCell>
                  <Link className="font-semibold underline-offset-2 hover:underline hover:decoration-[var(--xt-yellow)]" href={`/admin/maquinas/${machine.id}`}>
                    {machine.cotiNumber}
                  </Link>
                </TableCell>
                <TableCell>{machine.clientName}</TableCell>
                <TableCell>{machine.equipmentCode ?? "Personalizado"}</TableCell>
                <TableCell>{machine.equipmentName}</TableCell>
                <TableCell>{machine.colorName ?? "Sin color"}</TableCell>
                <TableCell>{machine.city ?? ""}</TableCell>
                <TableCell>{machine.line ?? ""}</TableCell>
                <TableCell className="text-right">{formatCurrencyCop(machine.salePriceCop)}</TableCell>
                <TableCell className="text-right">{machine.totalHours.toFixed(2)}</TableCell>
                <TableCell className="text-right">{machine.remainingHours.toFixed(2)}</TableCell>
                <TableCell className="text-right">{machine.remainingHumanDays.toFixed(2)}</TableCell>
                <TableCell className="text-right">{machine.accumulatedHours.toFixed(2)}</TableCell>
                <TableCell>{machine.assignedTo ?? ""}</TableCell>
                <TableCell>{formatDateEs(machine.promisedDate)}</TableCell>
                <TableCell className={isLate ? "bg-red-50 text-[var(--line-pro-red)]" : ""}>{formatDateEs(machine.estimatedDate)}</TableCell>
                {machine.stages.map((stage) => (
                  <TableCell key={stage.id}>
                    <Badge variant={stage.completion === 100 ? "success" : stage.completion > 0 ? "warning" : "muted"}>
                      {stage.completion === 100 ? "OK" : stage.completion > 0 ? `${stage.completion}%` : stage.name}
                    </Badge>
                  </TableCell>
                ))}
                <TableCell>
                  <div className="flex gap-1">
                    {!shipped && (
                      <Button size="sm" variant="outline" asChild>
                        <Link href={`/admin/maquinas/${machine.id}`}>
                          <Pencil className="h-3 w-3" />
                          Editar
                        </Link>
                      </Button>
                    )}
                    <form action={shipped ? unmarkShippedAction : markShippedAction}>
                      <input type="hidden" name="machineId" value={machine.id} />
                      <Button size="sm" variant={shipped ? "outline" : "secondary"} type="submit">
                        {shipped ? <MoreHorizontal className="h-4 w-4" /> : <Truck className="h-4 w-4" />}
                        {shipped ? "Reactivar" : "Despachar"}
                      </Button>
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
