"use client";

import { useState } from "react";
import { Check, Pencil, Plus, Trash2, X } from "lucide-react";
import { addColorAction, deleteColorAction, updateColorAction } from "@/app/admin/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Color = { id: string; name: string; created_at: string };

export function ColorsManager({ colors }: { colors: Color[] }) {
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
          Agregar color
        </Button>
      </div>

      {adding && (
        <form
          action={addColorAction}
          className="flex items-center gap-2 border border-[var(--xt-yellow)] bg-[var(--xt-paper)] p-3"
        >
          <Input name="name" placeholder="Nombre del color" className="flex-1" autoFocus required />
          <Button type="submit" size="sm">
            Agregar
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setAdding(false)}>
            <X className="h-4 w-4" />
          </Button>
        </form>
      )}

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {colors.map((color) =>
          editingId === color.id ? (
            <form
              key={color.id}
              action={updateColorAction}
              className="flex items-center gap-1 border border-[var(--xt-yellow)] bg-[var(--xt-paper)] p-2"
            >
              <input type="hidden" name="id" value={color.id} />
              <Input name="name" defaultValue={color.name} className="h-8 flex-1 text-sm" autoFocus required />
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
              key={color.id}
              className="group flex items-center justify-between border border-[var(--xt-cement)] bg-[var(--xt-paper)] p-3 text-sm font-medium"
            >
              <span>{color.name}</span>
              <span className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                <button
                  type="button"
                  title="Editar"
                  onClick={() => {
                    setEditingId(color.id);
                    setAdding(false);
                  }}
                  className="rounded p-1 hover:bg-[var(--xt-yellow-soft)]"
                >
                  <Pencil className="h-3 w-3" />
                </button>
                <form
                  action={deleteColorAction}
                  onSubmit={(e) => {
                    if (!confirm(`¿Eliminar "${color.name}"?`)) e.preventDefault();
                  }}
                >
                  <input type="hidden" name="id" value={color.id} />
                  <button
                    type="submit"
                    title="Eliminar"
                    className="rounded p-1 hover:bg-red-100 hover:text-red-600"
                  >
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
