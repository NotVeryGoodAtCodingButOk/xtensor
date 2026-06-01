"use client";

import { StageStrip } from "@/components/factory/stage-strip";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { formatPercent } from "@/lib/utils";
import { formatDateEs } from "@/services/schedule";
import type { CalculatedMachineView } from "@/types/domain";

export function MachineCard({ machine }: { machine: CalculatedMachineView }) {
  const isShipped = machine.status === "shipped";

  const dateLabel = isShipped && machine.shippedAt
    ? `Despachada · ${formatDateEs(machine.shippedAt.slice(0, 10))}`
    : `Despachar ${formatDateEs(machine.clientEstimatedDate)}`;

  return (
    <div
      className={[
        "border p-4 shadow-[var(--shadow-sm)]",
        isShipped
          ? "border-l-4 border-green-500 bg-green-50"
          : "border-[var(--xt-black)] bg-[var(--xt-white)]",
      ].join(" ")}
    >
      {/* Header row */}
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="min-w-0">
          {machine.equipmentCode && (
            <p className="mb-0.5 text-xs font-medium text-[var(--xt-steel)]">
              {machine.equipmentCode}
            </p>
          )}
          <p className="truncate font-semibold leading-tight">
            {machine.equipmentName}
          </p>
          {machine.colorName && (
            <p className="mt-0.5 text-xs text-[var(--xt-steel)]">{machine.colorName}</p>
          )}
        </div>
        <Badge variant={isShipped ? "success" : "default"} className="shrink-0">
          {isShipped ? "Despachada" : "En producción"}
        </Badge>
      </div>

      {/* Progress */}
      <div className="mb-1 flex items-center justify-between gap-2 text-xs">
        <span className="text-[var(--xt-steel)]">Avance</span>
        <span className="[font-family:var(--font-barlow-condensed)] font-bold">
          {formatPercent(machine.progressPct)}
        </span>
      </div>
      <Progress value={machine.progressPct} className="mb-3 h-1.5" />

      {/* Footer row */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <StageStrip stages={machine.stages} />
        <p className="[font-family:var(--font-barlow-condensed)] shrink-0 text-sm font-bold">
          {dateLabel}
        </p>
      </div>
    </div>
  );
}
