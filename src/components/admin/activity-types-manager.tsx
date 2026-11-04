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

const DESCRIPTION_MAX_LENGTH = 120;

const selectCls =
  "h-8 min-w-48 rounded-[2px] border border-[var(--xt-aluminum)] bg-[var(--xt-white)] px-2 text-sm focus-visible:border-[var(--xt-black)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--xt-yellow)]";

function sessionsLabel(count: number) {
  return count === 1 ? "1 sesión" : `${count} sesiones`;
}

/**
 * CRUD for the activities a worker can log time against outside the
 * production stages. Deactivating hides an activity from the factory floor
 * without touching the hours already registered under it. Deleting one that
 * already has hours asks where to move them (move_to_id) first.
 */
export function ActivityTypesManager({
  activityTypes,
  usageById,
}: {
  activityTypes: ActivityTypeView[];
  /** activity_type_id → nº de sesiones vinculadas. */
  usageById: Record<string, number>;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
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
            setDeletingId(null);
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
          <Input
            name="description"
            placeholder="Descripción (opcional)"
            maxLength={DESCRIPTION_MAX_LENGTH}
            className="min-w-56 flex-[2]"
          />
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
        {activityTypes.map((type) => {
          const usage = usageById[type.id] ?? 0;

          if (editingId === type.id) {
            return (
              <form
                key={type.id}
                action={updateActivityTypeAction}
                className="flex flex-wrap items-center gap-2 border border-[var(--xt-yellow)] bg-[var(--xt-paper)] p-2"
              >
                <input type="hidden" name="id" value={type.id} />
                <Input name="name" defaultValue={type.name} className="h-8 min-w-40 flex-1 text-sm" autoFocus required />
                <Input
                  name="description"
                  defaultValue={type.description ?? ""}
                  placeholder="Descripción (opcional)"
                  maxLength={DESCRIPTION_MAX_LENGTH}
                  className="h-8 min-w-56 flex-[2] text-sm"
                />
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
            );
          }

          if (deletingId === type.id && usage > 0) {
            return (
              <MoveHoursAndDeleteForm
                key={type.id}
                type={type}
                usage={usage}
                targets={activityTypes.filter((candidate) => candidate.id !== type.id)}
                onCancel={() => setDeletingId(null)}
              />
            );
          }

          return (
            <div
              key={type.id}
              className="group flex items-center justify-between gap-3 border border-[var(--xt-cement)] bg-[var(--xt-paper)] p-3 text-sm font-medium"
            >
              <span className="grid gap-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span className={type.isActive ? undefined : "text-[var(--xt-steel)] line-through"}>{type.name}</span>
                  {type.allowsMachine ? <Badge variant="muted">Con máquina</Badge> : null}
                  {type.isActive ? null : <Badge variant="warning">Inactiva</Badge>}
                  {usage > 0 ? <span className="text-xs font-normal text-[var(--xt-steel)]">{sessionsLabel(usage)}</span> : null}
                </span>
                {type.description ? (
                  <span className="text-xs font-normal text-[var(--xt-steel)]">{type.description}</span>
                ) : null}
              </span>
              <span className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
                <button
                  type="button"
                  title="Editar"
                  onClick={() => {
                    setEditingId(type.id);
                    setDeletingId(null);
                    setAdding(false);
                  }}
                  className="rounded p-1 hover:bg-[var(--xt-yellow-soft)]"
                >
                  <Pencil className="h-3 w-3" />
                </button>
                {usage > 0 ? (
                  <DeleteButton
                    onClick={() => {
                      setDeletingId(type.id);
                      setEditingId(null);
                      setAdding(false);
                    }}
                  />
                ) : (
                  <form
                    action={deleteActivityTypeAction}
                    onSubmit={(e) => {
                      if (!confirm(`¿Eliminar "${type.name}"?`)) e.preventDefault();
                    }}
                  >
                    <input type="hidden" name="id" value={type.id} />
                    <DeleteButton type="submit" />
                  </form>
                )}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DeleteButton({ type = "button", onClick }: { type?: "button" | "submit"; onClick?: () => void }) {
  return (
    <button
      type={type}
      onClick={onClick}
      className="inline-flex items-center gap-1 rounded px-1.5 py-1 text-xs font-semibold text-[var(--xt-steel)] hover:bg-[var(--xt-cement)] hover:text-[var(--line-pro-red)]"
    >
      <Trash2 className="h-3 w-3" />
      Eliminar
    </button>
  );
}

/**
 * Una actividad con horas no se puede borrar sin más: sus sesiones pasan a
 * otra actividad (move_to_id) y luego se elimina.
 */
function MoveHoursAndDeleteForm({
  type,
  usage,
  targets,
  onCancel,
}: {
  type: ActivityTypeView;
  usage: number;
  targets: ActivityTypeView[];
  onCancel: () => void;
}) {
  return (
    <form
      action={deleteActivityTypeAction}
      onSubmit={(e) => {
        const select = e.currentTarget.elements.namedItem("move_to_id") as HTMLSelectElement | null;
        const target = targets.find((candidate) => candidate.id === select?.value);
        if (!target || !confirm(`¿Eliminar "${type.name}" y mover sus horas a "${target.name}"?`)) {
          e.preventDefault();
        }
      }}
      className="grid gap-3 border border-[var(--line-pro-red)] bg-[var(--xt-paper)] p-3 text-sm"
    >
      <input type="hidden" name="id" value={type.id} />
      <p>
        <strong>{type.name}</strong> tiene horas registradas ({sessionsLabel(usage)}). Antes de eliminarla, elige a qué
        actividad pasan esas horas.
      </p>
      {targets.length === 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-[var(--xt-steel)]">No hay otra actividad a donde moverlas. Agrega una primero.</p>
          <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex flex-wrap items-center gap-2 font-semibold">
            Mover sus horas a…
            <select name="move_to_id" required defaultValue="" className={selectCls} autoFocus>
              <option value="" disabled>
                Elige una actividad
              </option>
              {targets.map((target) => (
                <option key={target.id} value={target.id}>
                  {target.isActive ? target.name : `${target.name} (inactiva)`}
                </option>
              ))}
            </select>
          </label>
          <Button type="submit" size="sm" variant="danger">
            <Trash2 className="h-3 w-3" />
            Eliminar
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}
    </form>
  );
}
