"use client";

import { useState } from "react";
import { ArrowDownUp } from "lucide-react";
import { MachineCard } from "@/components/client/machine-card";
import type { CalculatedMachineView } from "@/types/domain";

export function MachineList({ machines }: { machines: CalculatedMachineView[] }) {
  const [asc, setAsc] = useState(false);

  const sorted = [...machines].sort((a, b) =>
    asc ? a.progressPct - b.progressPct : b.progressPct - a.progressPct,
  );

  return (
    <div>
      <div className="mb-3 flex items-center justify-end gap-2">
        <button
          onClick={() => setAsc((v) => !v)}
          className="flex items-center gap-1.5 text-sm text-[var(--xt-steel)] hover:text-[var(--xt-ink)]"
        >
          <ArrowDownUp className="h-3.5 w-3.5" />
          {asc ? "Menos → Más completo" : "Más → Menos completo"}
        </button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {sorted.map((machine) => (
          <MachineCard key={machine.id} machine={machine} />
        ))}
      </div>
    </div>
  );
}
