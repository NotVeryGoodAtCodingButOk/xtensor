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
    : `Construcción est. ${formatDateEs(machine.clientEstimatedDate)}`;

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
      <div className="flex items-center gap-2 px-3 py-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold leading-tight">{machine.equipmentName}</p>
          <p className="[font-family:var(--font-barlow-condensed)] text-xs text-[var(--xt-steel)]">
            {dateLabel}
          </p>
        </div>
        <Badge variant={badgeVariant} className="shrink-0 text-[10px] px-1.5 py-0">{badgeLabel}</Badge>
        <button
          onClick={() => setStagesOpen((v) => !v)}
          className="shrink-0 text-[var(--xt-steel)] hover:text-[var(--xt-ink)]"
          aria-expanded={stagesOpen}
          aria-label="Ver etapas"
        >
          {stagesOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </button>
      </div>

      {stagesOpen && (
        <div
          className={[
            "border-t px-3 py-2 space-y-2",
            isComplete || isShipped ? "border-green-200" : "border-[var(--xt-black)]/10",
          ].join(" ")}
        >
          <div className="flex items-center gap-2">
            <Progress value={machine.progressPct * 100} className="h-1.5 flex-1" />
            <span className="[font-family:var(--font-barlow-condensed)] text-xs font-bold shrink-0">
              {formatPercent(machine.progressPct)}
            </span>
          </div>
          <StageStrip stages={machine.stages} />
        </div>
      )}
    </div>
  );
}
