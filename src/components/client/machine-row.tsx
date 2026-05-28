"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { StageStrip } from "@/components/factory/stage-strip";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { formatPercent } from "@/lib/utils";
import { formatDateEs } from "@/services/schedule";
import type { CalculatedMachineView } from "@/types/domain";

export function MachineRow({ machine }: { machine: CalculatedMachineView }) {
  const [open, setOpen] = useState(false);
  const isShipped = machine.status === "shipped";

  const dateLabel = isShipped && machine.shippedAt
    ? `Completada · ${formatDateEs(machine.shippedAt.slice(0, 10))}`
    : `Entrega est. ${formatDateEs(machine.clientEstimatedDate)}`;

  return (
    <div
      className={[
        "border shadow-[var(--shadow-sm)]",
        isShipped
          ? "border-l-4 border-green-500 bg-green-50"
          : "border-[var(--xt-black)] bg-[var(--xt-white)]",
      ].join(" ")}
    >
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-4 px-4 py-3 text-left"
        aria-expanded={open}
      >
        {/* Machine name */}
        <span className="min-w-0 flex-1 truncate font-semibold">
          {machine.equipmentCode ?? "Personalizado"} · {machine.equipmentName}
        </span>

        {/* Progress bar — desktop, fills middle */}
        <div className="hidden flex-1 max-w-[220px] shrink-0 sm:block">
          <div className="mb-1 flex justify-between text-xs text-[var(--xt-steel)]">
            <span>Avance</span>
            <span>{formatPercent(machine.progressPct)}</span>
          </div>
          <Progress value={machine.progressPct} className="h-2" />
        </div>

        {/* % on mobile only */}
        <span className="[font-family:var(--font-barlow-condensed)] shrink-0 text-base font-bold sm:hidden">
          {formatPercent(machine.progressPct)}
        </span>

        {/* Date — desktop */}
        <span className="[font-family:var(--font-barlow-condensed)] hidden shrink-0 text-base font-bold sm:block">
          {dateLabel}
        </span>

        {open ? (
          <ChevronUp className="h-4 w-4 shrink-0 text-[var(--xt-steel)]" />
        ) : (
          <ChevronDown className="h-4 w-4 shrink-0 text-[var(--xt-steel)]" />
        )}
      </button>

      {/* Mobile: bar + date */}
      <div className="px-4 pb-2 sm:hidden">
        <Progress value={machine.progressPct} className="mb-2 h-2" />
        <span className="[font-family:var(--font-barlow-condensed)] text-sm font-bold">
          {dateLabel}
        </span>
      </div>

      {open && (
        <div
          className={[
            "border-t px-4 py-4",
            isShipped ? "border-green-300" : "border-[var(--xt-black)]",
          ].join(" ")}
        >
          <div className="mb-4 flex items-start justify-between gap-4">
            <span className="text-sm text-[var(--xt-steel)]">
              Color: {machine.colorName ?? "Sin color"}
            </span>
            <Badge variant={isShipped ? "success" : "default"}>
              {isShipped ? "Completada" : "En producción"}
            </Badge>
          </div>
          <StageStrip stages={machine.stages} />
          <p className="[font-family:var(--font-barlow-condensed)] mt-4 text-2xl font-bold">
            {dateLabel}
          </p>
        </div>
      )}
    </div>
  );
}
