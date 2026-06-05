"use client";

import { ArrowLeft, RotateCcw, Trash2 } from "lucide-react";
import {
  deleteMachineAction,
  sendMachineToPreviosAction,
  sendMachineToProductionAction,
} from "@/app/admin/actions";
import { Button } from "@/components/ui/button";
import type { MachineStatus } from "@/types/database";

export function MachineEditActions({
  machineId,
  cotiNumber,
  status,
  undoPreviosMove = false,
}: {
  machineId: string;
  cotiNumber: number;
  status: MachineStatus;
  undoPreviosMove?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {status === "pending" ? (
        <form action={sendMachineToProductionAction}>
          <input type="hidden" name="machineId" value={machineId} />
          <Button type="submit" variant="outline">
            <RotateCcw className="h-4 w-4" />
            {undoPreviosMove ? "Deshacer: volver a producción" : "Enviar a producción"}
          </Button>
        </form>
      ) : (
        <form
          action={sendMachineToPreviosAction}
          onSubmit={(event) => {
            if (!confirm(`¿Enviar COTI ${cotiNumber} a previos?`)) event.preventDefault();
          }}
        >
          <input type="hidden" name="machineId" value={machineId} />
          <Button type="submit" variant="outline">
            <ArrowLeft className="h-4 w-4" />
            Enviar a previos
          </Button>
        </form>
      )}
      <form
        action={deleteMachineAction}
        onSubmit={(event) => {
          if (!confirm(`¿Eliminar definitivamente COTI ${cotiNumber}?`)) event.preventDefault();
        }}
      >
        <input type="hidden" name="machineId" value={machineId} />
        <Button type="submit" variant="danger">
          <Trash2 className="h-4 w-4" />
          Eliminar máquina
        </Button>
      </form>
    </div>
  );
}
