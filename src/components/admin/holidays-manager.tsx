"use client";

import { useState } from "react";
import { Plus, Trash2, X } from "lucide-react";
import { addHolidayAction, deleteHolidayAction } from "@/app/admin/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Holiday = { date: string; name: string; isCustom: boolean };

export function HolidaysManager({ holidays }: { holidays: Holiday[] }) {
  const [adding, setAdding] = useState(false);

  return (
    <div className="grid gap-4">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setAdding(true)}>
          <Plus className="h-4 w-4" />
          Agregar festivo
        </Button>
      </div>

      {adding && (
        <form
          action={addHolidayAction}
          className="flex flex-wrap items-center gap-2 border border-[var(--xt-yellow)] bg-[var(--xt-paper)] p-3"
        >
          <Input name="date" type="date" required className="h-9 w-44" autoFocus />
          <Input name="name" placeholder="Nombre del festivo" required className="h-9 flex-1 min-w-40" />
          <Button type="submit" size="sm">Agregar</Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setAdding(false)}>
            <X className="h-4 w-4" />
          </Button>
        </form>
      )}

      <div className="grid max-h-[520px] gap-2 overflow-auto">
        {holidays.map((holiday) => (
          <div
            key={holiday.date}
            className="flex items-center justify-between border border-[var(--xt-cement)] bg-[var(--xt-paper)] p-3 text-sm"
          >
            <div className="flex items-center gap-3">
              <span>{holiday.name}</span>
              {holiday.isCustom && (
                <span className="text-xs font-medium text-[var(--xt-steel)] uppercase tracking-wide">Personalizado</span>
              )}
            </div>
            <div className="flex items-center gap-3">
              <span className="text-[var(--xt-steel)]">{holiday.date}</span>
              <form
                action={deleteHolidayAction}
                onSubmit={(e) => {
                  if (!confirm(`¿Eliminar "${holiday.name}"?`)) e.preventDefault();
                }}
              >
                <input type="hidden" name="date" value={holiday.date} />
                <button
                  type="submit"
                  title="Eliminar festivo"
                  className="rounded p-1 text-[var(--xt-steel)] hover:bg-red-100 hover:text-red-600"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </form>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
