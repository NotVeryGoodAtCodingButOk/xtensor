"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { updateSettingsAction } from "@/app/admin/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";

type ShiftBreak = { start: string; minutes: number };

type Settings = {
  hourly_cost_per_worker_cop: number;
  labor_factor: number;
  active_workers_count: number;
  daily_hours_mon_fri: number;
  daily_hours_fri: number;
  daily_hours_sat: number;
  daily_hours_sun: number;
  client_buffer_days: number;
  shipped_retention_days: number;
  shift_start: string;
  shift_end_mon_thu: string;
  shift_end_fri: string;
  shift_end_sat: string | null;
  shift_breaks: unknown;
};

const inputCls = "h-8 w-28 text-right text-sm";
const timeInputCls = "h-8 w-28 text-sm";

function toTimeInputValue(value: string | null | undefined) {
  return value ? value.slice(0, 5) : "";
}

function normalizeInitialBreaks(value: unknown): ShiftBreak[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is ShiftBreak => Boolean(entry) && typeof entry === "object")
    .map((entry) => ({
      start: toTimeInputValue(String((entry as { start?: unknown }).start ?? "")),
      minutes: Number((entry as { minutes?: unknown }).minutes) || 0,
    }));
}

export function SettingsForm({ settings, savedOk }: { settings: Settings; savedOk?: boolean }) {
  const [breaks, setBreaks] = useState<ShiftBreak[]>(() => normalizeInitialBreaks(settings.shift_breaks));

  function addBreak() {
    setBreaks((prev) => [...prev, { start: "10:00", minutes: 15 }]);
  }

  function removeBreak(index: number) {
    setBreaks((prev) => prev.filter((_, i) => i !== index));
  }

  function updateBreak(index: number, patch: Partial<ShiftBreak>) {
    setBreaks((prev) => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  }

  return (
    <form action={updateSettingsAction} className="grid gap-4">
      {savedOk && (
        <p className="text-sm font-semibold text-[var(--xt-green)]">Parámetros actualizados.</p>
      )}
      <Table>
        <TableBody>
          <TableRow>
            <TableCell>Costo hora operario</TableCell>
            <TableCell className="text-right">
              <Input name="hourly_cost_per_worker_cop" type="number" step="0.01" min="0" defaultValue={Number(settings.hourly_cost_per_worker_cop).toFixed(2)} required className={inputCls} />
            </TableCell>
          </TableRow>
          <TableRow>
            <TableCell>Factor mano de obra</TableCell>
            <TableCell className="text-right">
              <Input name="labor_factor" type="number" step="0.01" min="0" defaultValue={Number(settings.labor_factor).toFixed(2)} required className={inputCls} />
            </TableCell>
          </TableRow>
          <TableRow>
            <TableCell>Operarios activos</TableCell>
            <TableCell className="text-right">
              <Input name="active_workers_count" type="number" step="1" min="1" defaultValue={settings.active_workers_count} required className={inputCls} />
            </TableCell>
          </TableRow>
          <TableRow>
            <TableCell>Horas lunes a jueves</TableCell>
            <TableCell className="text-right">
              <Input name="daily_hours_mon_fri" type="number" step="0.25" min="0" defaultValue={Number(settings.daily_hours_mon_fri).toFixed(2)} required className={inputCls} />
            </TableCell>
          </TableRow>
          <TableRow>
            <TableCell>Horas viernes</TableCell>
            <TableCell className="text-right">
              <Input name="daily_hours_fri" type="number" step="0.25" min="0" defaultValue={Number(settings.daily_hours_fri).toFixed(2)} required className={inputCls} />
            </TableCell>
          </TableRow>
          <TableRow>
            <TableCell>Horas sábado</TableCell>
            <TableCell className="text-right">
              <Input name="daily_hours_sat" type="number" step="0.5" min="0" defaultValue={Number(settings.daily_hours_sat).toFixed(2)} required className={inputCls} />
            </TableCell>
          </TableRow>
          <TableRow>
            <TableCell>Horas domingo</TableCell>
            <TableCell className="text-right">
              <Input name="daily_hours_sun" type="number" step="0.5" min="0" defaultValue={Number(settings.daily_hours_sun).toFixed(2)} required className={inputCls} />
            </TableCell>
          </TableRow>
          <TableRow>
            <TableCell>Buffer cliente</TableCell>
            <TableCell className="text-right">
              <Input name="client_buffer_days" type="number" step="1" min="0" defaultValue={settings.client_buffer_days} required className={inputCls} />
            </TableCell>
          </TableRow>
          <TableRow>
            <TableCell>Retención despachados</TableCell>
            <TableCell className="text-right">
              <Input
                name="shipped_retention_days"
                type="number"
                step="1"
                min="0"
                defaultValue={settings.shipped_retention_days}
                required
                className={inputCls}
              />
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>

      <div className="grid gap-3 border-t border-[var(--xt-cement)] pt-4">
        <h3 className="text-sm font-semibold">Horario de planta</h3>
        <Table>
          <TableBody>
            <TableRow>
              <TableCell>Inicio de jornada</TableCell>
              <TableCell className="text-right">
                <Input
                  name="shift_start"
                  type="time"
                  defaultValue={toTimeInputValue(settings.shift_start)}
                  required
                  className={timeInputCls}
                />
              </TableCell>
            </TableRow>
            <TableRow>
              <TableCell>Cierre lunes a jueves</TableCell>
              <TableCell className="text-right">
                <Input
                  name="shift_end_mon_thu"
                  type="time"
                  defaultValue={toTimeInputValue(settings.shift_end_mon_thu)}
                  required
                  className={timeInputCls}
                />
              </TableCell>
            </TableRow>
            <TableRow>
              <TableCell>Cierre viernes</TableCell>
              <TableCell className="text-right">
                <Input
                  name="shift_end_fri"
                  type="time"
                  defaultValue={toTimeInputValue(settings.shift_end_fri)}
                  required
                  className={timeInputCls}
                />
              </TableCell>
            </TableRow>
            <TableRow>
              <TableCell>Cierre sábado (vacío = sin jornada)</TableCell>
              <TableCell className="text-right">
                <Input
                  name="shift_end_sat"
                  type="time"
                  defaultValue={toTimeInputValue(settings.shift_end_sat)}
                  className={timeInputCls}
                />
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>

        <div className="grid gap-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Pausas</span>
            <Button type="button" size="sm" variant="outline" onClick={addBreak}>
              <Plus className="h-4 w-4" />
              Agregar pausa
            </Button>
          </div>
          {breaks.length === 0 && (
            <p className="text-sm text-[var(--xt-steel)]">Sin pausas configuradas.</p>
          )}
          {breaks.map((shiftBreak, index) => (
            <div key={index} className="flex items-center gap-2">
              <Input
                type="time"
                value={shiftBreak.start}
                onChange={(e) => updateBreak(index, { start: e.target.value })}
                className={timeInputCls}
              />
              <Input
                type="number"
                min={1}
                max={240}
                value={shiftBreak.minutes}
                onChange={(e) => updateBreak(index, { minutes: Number(e.target.value) })}
                className="h-8 w-20 text-sm"
              />
              <span className="text-xs text-[var(--xt-steel)]">min</span>
              <button
                type="button"
                onClick={() => removeBreak(index)}
                title="Eliminar pausa"
                className="rounded p-1 text-[var(--xt-steel)] hover:bg-red-100 hover:text-red-600"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
          <input type="hidden" name="shift_breaks" value={JSON.stringify(breaks)} />
        </div>
      </div>

      <div className="flex justify-end">
        <Button type="submit" size="sm">Guardar parámetros</Button>
      </div>
    </form>
  );
}
