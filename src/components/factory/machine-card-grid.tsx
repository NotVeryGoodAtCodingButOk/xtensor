"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { StageStrip } from "@/components/factory/stage-strip";

/**
 * Datos mínimos de cada tarjeta. La grilla es un componente de cliente a
 * propósito: así las clases largas viajan una sola vez en el JS y no 60 veces
 * en cada respuesta del servidor (cada tarjeta pesaba ~3,8 KB en el payload
 * que el iPad tiene que descargar y procesar en cada render).
 */
export type MachineCardData = {
  id: string;
  code: string | null;
  name: string;
  client: string;
  serial: number;
  /** Etapas en orden: [id de etapa, 1 si está hecha]. */
  stages: [number, 0 | 1][];
};

export function MachineCardGrid({
  machines,
  stageNames,
}: {
  machines: MachineCardData[];
  /** Nombre de cada etapa por id (se envía una vez, no por máquina). */
  stageNames: Record<number, string>;
}) {
  return (
    <div className="xt-machine-grid">
      {machines.map((machine) => (
        <Link
          prefetch={false}
          key={machine.id}
          href={`/planta/maquinas/${machine.id}`}
          className="xt-machine-card flex min-h-[170px] flex-col border border-[var(--xt-black)] bg-[var(--xt-white)] shadow-[var(--shadow-sm)] transition-colors hover:bg-[var(--xt-yellow-soft)]"
        >
          <div className="xt-machine-card-body flex flex-1 flex-col gap-2 p-4">
            <div className="xt-machine-card-heading flex items-start justify-between gap-3">
              <div className="xt-machine-card-fields grid gap-1 min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-[var(--xt-black)]">{machine.code ?? "Personalizado"}</p>
                <p className="truncate text-sm font-bold text-[var(--xt-black)]">{machine.name}</p>
                <p className="truncate text-sm font-bold text-[var(--xt-black)]">{machine.client}</p>
                <p className="flex min-w-0 items-baseline gap-1.5 text-sm font-bold text-[var(--xt-black)]">
                  <span className="xt-eyebrow shrink-0 text-[0.625rem] leading-none">Cotización</span>
                  <span className="truncate">{machine.serial}</span>
                </p>
              </div>
              <ChevronRight className="xt-machine-chevron mt-1 h-6 w-6 shrink-0 text-[var(--xt-steel)]" />
            </div>
          </div>

          <div className="xt-machine-stage-strip border-t border-[var(--xt-cement)] px-4 py-2">
            <StageStrip
              stages={machine.stages.map(([id, done]) => ({
                id,
                name: stageNames[id] ?? "",
                completion: done ? 100 : 0,
              }))}
            />
          </div>
        </Link>
      ))}
    </div>
  );
}
