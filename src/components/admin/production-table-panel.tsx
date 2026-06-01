"use client";

import { useState } from "react";
import { Palette } from "lucide-react";
import { ProductionTable } from "@/components/admin/production-table";
import type { CalculatedMachineView } from "@/types/domain";

export function ProductionTablePanel({ machines }: { machines: CalculatedMachineView[] }) {
  const [colorRows, setColorRows] = useState(false);

  return (
    <div className="grid gap-3">
      <label className="ml-auto inline-flex items-center gap-2 text-sm text-[var(--xt-steel)]">
        <span className="inline-flex h-6 w-6 items-center justify-center border border-[var(--xt-cement)] bg-[var(--xt-white)] text-[var(--xt-black)]">
          <Palette className="h-3.5 w-3.5" />
        </span>
        <span>Colorear filas</span>
        <input
          type="checkbox"
          checked={colorRows}
          onChange={(event) => setColorRows(event.target.checked)}
          className="h-4 w-4 accent-[var(--xt-yellow-deep)]"
          aria-label="Colorear filas según el color de la máquina"
        />
      </label>
      <ProductionTable machines={machines} colorRows={colorRows} />
    </div>
  );
}
