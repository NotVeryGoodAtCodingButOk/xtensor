"use client";

import Link from "next/link";
import { useState } from "react";
import { Check } from "lucide-react";
import { StageStrip } from "@/components/factory/stage-strip";
import type { StageView } from "@/types/domain";

export type MultiSelectMachine = {
  id: string;
  serialNumber: number;
  equipmentCode: string | null;
  equipmentName: string;
  clientName: string;
  stages: StageView[];
};

/**
 * "Varias" mode for the machine list: cards become tap-to-select instead of
 * navigating, and a sticky bottom bar continues to the group page with the
 * selected ids once at least one machine is picked.
 */
export function MachineMultiSelect({
  machines,
  groupHrefBase,
}: {
  machines: MultiSelectMachine[];
  /** e.g. "/planta/maquinas/grupo" or "/planta/maquinas/grupo?workerId=…" — "ids" is appended. */
  groupHrefBase: string;
}) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  function toggle(id: string) {
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((existing) => existing !== id) : [...current, id],
    );
  }

  const continueHref = `${groupHrefBase}${groupHrefBase.includes("?") ? "&" : "?"}ids=${selectedIds.join(",")}`;

  return (
    <>
      <div className="xt-machine-grid">
        {machines.map((machine) => {
          const isSelected = selectedIds.includes(machine.id);
          return (
            <button
              key={machine.id}
              type="button"
              onClick={() => toggle(machine.id)}
              aria-pressed={isSelected}
              className={`xt-machine-card xt-machine-card-selectable ${isSelected ? "xt-machine-card-selected" : ""}`}
            >
              <div className="xt-machine-card-body flex flex-1 flex-col gap-2 p-4">
                <div className="xt-machine-card-heading flex items-start justify-between gap-3">
                  <div className="xt-machine-card-fields grid min-w-0 flex-1 gap-1">
                    <p className="truncate text-sm font-bold text-[var(--xt-black)]">
                      {machine.equipmentCode ?? "Personalizado"}
                    </p>
                    <p className="truncate text-sm font-bold text-[var(--xt-black)]">{machine.equipmentName}</p>
                    <p className="truncate text-sm font-bold text-[var(--xt-black)]">{machine.clientName}</p>
                    <p className="flex min-w-0 items-baseline gap-1.5 text-sm font-bold text-[var(--xt-black)]">
                      <span className="xt-eyebrow shrink-0 text-[0.625rem] leading-none">Cotización</span>
                      <span className="truncate">{machine.serialNumber}</span>
                    </p>
                  </div>
                  <span className="xt-machine-card-check" aria-hidden="true">
                    {isSelected ? <Check className="h-4 w-4" /> : null}
                  </span>
                </div>
              </div>

              <div className="xt-machine-stage-strip border-t border-[var(--xt-cement)] px-4 py-2">
                <StageStrip stages={machine.stages} />
              </div>
            </button>
          );
        })}
      </div>

      <div className="xt-multi-select-bar">
        {selectedIds.length > 0 ? (
          <Link href={continueHref} className="xt-multi-select-continue">
            Continuar con {selectedIds.length} {selectedIds.length === 1 ? "máquina" : "máquinas"} →
          </Link>
        ) : (
          <span className="xt-multi-select-continue xt-multi-select-continue-disabled" aria-disabled="true">
            Selecciona al menos una máquina
          </span>
        )}
      </div>
    </>
  );
}
