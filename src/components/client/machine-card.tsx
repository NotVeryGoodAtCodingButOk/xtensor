"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { StageStrip } from "@/components/factory/stage-strip";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { formatPercent } from "@/lib/utils";
import { formatDateEs } from "@/services/schedule";
import type { CalculatedMachineView } from "@/types/domain";

function getCompletionDate(machine: CalculatedMachineView): string | null {
  if (machine.shippedAt) return machine.shippedAt.slice(0, 10);
  const dates = machine.stages
    .map((s) => s.lastUpdatedAt)
    .filter((d): d is string => d !== null);
  if (dates.length === 0) return null;
  return dates.sort().at(-1)!.slice(0, 10);
}

export function MachineCard({ machine }: { machine: CalculatedMachineView }) {
  const [stagesOpen, setStagesOpen] = useState(false);

  const isComplete = machine.progressPct >= 1;
  const isShipped = machine.status === "shipped";

  const completionDate = isComplete ? getCompletionDate(machine) : null;

  const dateLabel = isComplete && completionDate
    ? `Terminada · ${formatDateEs(completionDate)}`
    : `Despacho est. ${formatDateEs(machine.clientEstimatedDate)}`;

  const badgeVariant = isComplete || isShipped ? "success" : "default";
  const badgeLabel = isShipped ? "Despachada" : isComplete ? "Completada" : "En producción";

  return (
    <div
      className={[
        "border shadow-[var(--shadow-sm)]",
        isComplete || isShipped
          ? "border-l-4 border-green-500 bg-green-50"
          : "border-[var(--xt-black)] bg-[var(--xt-white)]",
      ].join(" ")}
    >
      <div className="p-4">
        {/* Header row */}
        <div className="mb-3 flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate font-semibold leading-tight">{machine.equipmentName}</p>
            {machine.colorName && (
              <p className="mt-0.5 text-xs text-[var(--xt-steel)]">{machine.colorName}</p>
            )}
          </div>
          <Badge variant={badgeVariant} className="shrink-0">{badgeLabel}</Badge>
        </div>

        {/* Progress */}
        <div className="mb-1 flex items-center justify-between gap-2 text-xs">
          <span className="text-[var(--xt-steel)]">Avance</span>
          <span className="[font-family:var(--font-barlow-condensed)] font-bold">
            {formatPercent(machine.progressPct)}
          </span>
        </div>
        <Progress value={machine.progressPct} className="mb-3 h-1.5" />

        {/* Date + stages toggle */}
        <div className="flex items-center justify-between gap-2">
          <p className="[font-family:var(--font-barlow-condensed)] text-sm font-bold">
            {dateLabel}
          </p>
          <button
            onClick={() => setStagesOpen((v) => !v)}
            className="flex items-center gap-1 text-xs text-[var(--xt-steel)] hover:text-[var(--xt-ink)]"
            aria-expanded={stagesOpen}
          >
            Etapas
            {stagesOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>
        </div>
      </div>

      {stagesOpen && (
        <div
          className={[
            "border-t px-4 py-3",
            isComplete || isShipped ? "border-green-200" : "border-[var(--xt-black)]/10",
          ].join(" ")}
        >
          <StageStrip stages={machine.stages} />
        </div>
      )}
    </div>
  );
}
