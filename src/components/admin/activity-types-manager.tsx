"use client";

import { useState } from "react";
import { Check, Pencil, Plus, Trash2, X } from "lucide-react";
import {
  addActivityTypeAction,
  deleteActivityTypeAction,
  updateActivityTypeAction,
} from "@/app/admin/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ActivityTypeView } from "@/services/activity-types";

/**
 * CRUD for the activities a worker can log time against outside the
 * production stages. Deactivating hides an activity from the factory floor
 * without touching the hours already registered under it.
 */
export function ActivityTypesManager({ activityTypes }: { activityTypes: ActivityTypeView[] }) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-[var(--xt-steel)]">
          Lo que el operario ve en <strong>Actividades</strong> en la tablet de planta.
        </p>
        <Button
          size="sm"
          onClick={() => {
            setAdding(true);
            setEditingId(null);
          }}
        >
          <Plus className="h-4 w-4" />
          Agregar actividad
        </Button>
      </div>

      {adding && (
        <form
          action={addActivityTypeAction}
          className="flex flex-wrap items-center gap-2 border border-[var(--xt-yellow)] bg-[var(--xt-paper)] p-3"
        >
          <Input name="name" placeholder="Nombre de la actividad" className="min-w-40 flex-1" autoFocus required />
          <label className="flex items-center gap-2 text-sm font-semibold">
            <input type="checkbox" name="allowsMachine" value="1" className="h-4 w-4" />
            Se asocia a máquinas
          </label>
          <Button type="submit" size="sm">
            Agregar
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setAdding(false)}>
            <X className="h-4 w-4" />
          </Button>
        </form>
      )}

      <div className="grid gap-2">
        {activityTypes.map((type) =>
          editingId === type.id ? (
            <form
              key={type.id}
              action={updateActivityTypeAction}
              className="flex flex-wrap items-center gap-2 border border-[var(--xt-yellow)] bg-[var(--xt-paper)] p-2"
            >
              <input type="hidden" name="id" value={type.id} />
              <Input name="name" defaultValue={type.name} className="h-8 min-w-40 flex-1 text-sm" autoFocus required />
              <label className="flex items-center gap-2 text-sm font-semibold">
                <input
                  type="checkbox"
                  name="allowsMachine"
                  value="1"
                  defaultChecked={type.allowsMachine}
                  className="h-4 w-4"
                />
                Máquinas
              </label>
              <label className="flex items-center gap-2 text-sm font-semibold">
                <input type="checkbox" name="isActive" value="1" defaultChecked={type.isActive} className="h-4 w-4" />
                Activa
              </label>
              <Button type="submit" size="icon" className="h-8 w-8 shrink-0">
                <Check className="h-3 w-3" />
              </Button>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-8 w-8 shrink-0"
                onClick={() => setEditingId(null)}
              >
                <X className="h-3 w-3" />
              </Button>
            </form>
          ) : (
            <div
              key={type.id}
              className="group flex items-center justify-between gap-3 border border-[var(--xt-cement)] bg-[var(--xt-paper)] p-3 text-sm font-medium"
            >
              <span className="flex flex-wrap items-center gap-2">
                <span className={type.isActive ? undefined : "text-[var(--xt-steel)] line-through"}>{type.name}</span>
                {type.allowsMachine ? <Badge variant="muted">Con máquina</Badge> : null}
                {type.isActive ? null : <Badge variant="warning">Inactiva</Badge>}
              </span>
              <span className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                <button
                  type="button"
                  title="Editar"
                  onClick={() => {
                    setEditingId(type.id);
                    setAdding(false);
                  }}
                  className="rounded p-1 hover:bg-[var(--xt-yellow-soft)]"
                >
                  <Pencil className="h-3 w-3" />
                </button>
                <form
                  action={deleteActivityTypeAction}
                  onSubmit={(e) => {
                    if (!confirm(`¿Eliminar "${type.name}"?`)) e.preventDefault();
                  }}
                >
                  <input type="hidden" name="id" value={type.id} />
                  <button type="submit" title="Eliminar" className="rounded p-1 hover:bg-red-100 hover:text-red-600">
                    <Trash2 className="h-3 w-3" />
                  </button>
                </form>
              </span>
            </div>
          ),
        )}
      </div>
    </div>
  );
}
