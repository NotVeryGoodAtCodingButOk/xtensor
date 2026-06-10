"use client";

import { useState } from "react";
import { Check, Pencil, Plus, X } from "lucide-react";
import { addWorkerAction, updateWorkerAction } from "@/app/admin/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCurrencyCop, formatDecimalInput } from "@/lib/utils";

type Worker = {
  id: string;
  full_name: string;
  role: string;
  hourly_cost_cop: number | null;
  is_active: boolean;
  display_color: string | null;
  created_at: string;
};

const selectCls =
  "flex h-8 rounded-[2px] border border-[var(--xt-aluminum)] bg-[var(--xt-white)] px-2 py-1 text-sm focus-visible:border-[var(--xt-black)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--xt-yellow)]";

function WorkerEditRow({ worker, onCancel }: { worker?: Worker; onCancel: () => void }) {
  const action = worker ? updateWorkerAction : addWorkerAction;
  const [displayColor, setDisplayColor] = useState(worker?.display_color ?? "#d6d3d1");

  return (
    <TableRow className="bg-[var(--xt-yellow-soft)]">
      <TableCell colSpan={7}>
        <form action={action} className="flex flex-wrap items-center gap-2">
          {worker && <input type="hidden" name="id" value={worker.id} />}
          <Input
            name="full_name"
            defaultValue={worker?.full_name}
            placeholder="Nombre completo"
            className="h-8 w-40 text-sm"
            required
            autoFocus
          />
          <Input
            name="role"
            defaultValue={worker?.role}
            placeholder="Rol (ej: Soldador)"
            className="h-8 w-32 text-sm"
            required
          />
          <Input
            name="hourly_cost_cop"
            type="number"
            min="0"
            step="0.01"
            defaultValue={formatDecimalInput(worker?.hourly_cost_cop)}
            placeholder="Costo/hora"
            className="h-8 w-28 text-sm"
          />
          <div className="flex items-center gap-2 text-sm">
            <span className="text-[var(--xt-steel)]">Color</span>
            <input
              name="display_color"
              type="color"
              value={displayColor}
              onChange={(event) => setDisplayColor(event.target.value)}
              className="h-8 w-10 cursor-pointer rounded-[2px] border border-[var(--xt-aluminum)] bg-[var(--xt-white)] p-0.5"
              aria-label="Color del operario"
            />
            <span className="min-w-20 font-mono text-xs uppercase text-[var(--xt-steel)]">{displayColor}</span>
          </div>
          <select
            name="is_active"
            defaultValue={worker ? (worker.is_active ? "true" : "false") : "true"}
            className={selectCls}
          >
            <option value="true">Activo</option>
            <option value="false">Inactivo</option>
          </select>
          <Button type="submit" size="sm">
            <Check className="h-3 w-3" />
            {worker ? "Guardar" : "Agregar"}
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
            <X className="h-3 w-3" />
          </Button>
        </form>
      </TableCell>
    </TableRow>
  );
}

export function WorkersManager({ workers }: { workers: Worker[] }) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  return (
    <div className="grid gap-4">
      <div className="flex justify-end">
        <Button
          size="sm"
          onClick={() => {
            setAdding(true);
            setEditingId(null);
          }}
        >
          <Plus className="h-4 w-4" />
          Agregar operario
        </Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nombre</TableHead>
            <TableHead>Rol</TableHead>
            <TableHead className="text-right">Costo hora</TableHead>
            <TableHead>Color</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead>Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {adding && <WorkerEditRow onCancel={() => setAdding(false)} />}
          {workers.map((worker) =>
            editingId === worker.id ? (
              <WorkerEditRow key={worker.id} worker={worker} onCancel={() => setEditingId(null)} />
            ) : (
              <TableRow key={worker.id}>
                <TableCell className="font-medium">{worker.full_name}</TableCell>
                <TableCell>{worker.role}</TableCell>
                <TableCell className="text-right">{formatCurrencyCop(Number(worker.hourly_cost_cop ?? 0))}</TableCell>
                <TableCell>
                  <span className="inline-flex items-center gap-2">
                    <span className="h-4 w-4 rounded" style={{ background: worker.display_color ?? "#d6d3d1" }} />
                    {worker.display_color ?? "Sin color"}
                  </span>
                </TableCell>
                <TableCell>
                  <Badge variant={worker.is_active ? "success" : "muted"}>
                    {worker.is_active ? "Activo" : "Inactivo"}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Button
                    size="sm"
                    variant="outline"
                    type="button"
                    onClick={() => {
                      setEditingId(worker.id);
                      setAdding(false);
                    }}
                  >
                    <Pencil className="h-3 w-3" />
                    Editar
                  </Button>
                </TableCell>
              </TableRow>
            ),
          )}
        </TableBody>
      </Table>
    </div>
  );
}
