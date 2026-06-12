"use client";

import { updateSettingsAction } from "@/app/admin/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";

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
};

const inputCls = "h-8 w-28 text-right text-sm";

export function SettingsForm({ settings, savedOk }: { settings: Settings; savedOk?: boolean }) {
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
      <div className="flex justify-end">
        <Button type="submit" size="sm">Guardar parámetros</Button>
      </div>
    </form>
  );
}
