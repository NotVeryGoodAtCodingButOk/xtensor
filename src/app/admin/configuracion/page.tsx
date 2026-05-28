import { updateFactoryPasswordAction } from "@/app/admin/actions";
import { AdminShell } from "@/components/app-shell";
import { ConfigWarning } from "@/components/config-warning";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import { hasSupabaseConfig } from "@/lib/env";
import { listHolidays } from "@/services/catalog";
import { getSettings } from "@/services/settings";

const PASSWORD_MESSAGES: Record<string, { text: string; tone: "ok" | "error" }> = {
  ok: { text: "Contraseña actualizada.", tone: "ok" },
  corta: { text: "La contraseña debe tener al menos 6 caracteres.", tone: "error" },
  nocoincide: { text: "Las contraseñas no coinciden.", tone: "error" },
};

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ password?: string }>;
}) {
  if (!hasSupabaseConfig()) {
    return (
      <AdminShell>
        <ConfigWarning surface="Configuración" />
      </AdminShell>
    );
  }

  const [settings, holidays, params] = await Promise.all([
    getSettings(),
    listHolidays(),
    searchParams,
  ]);

  const passwordStatus = params.password ? PASSWORD_MESSAGES[params.password] : undefined;

  return (
    <AdminShell>
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Parámetros</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableBody>
                <TableRow>
                  <TableCell>Costo hora operario</TableCell>
                  <TableCell className="text-right">{Number(settings.hourly_cost_per_worker_cop).toFixed(2)}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Factor mano de obra</TableCell>
                  <TableCell className="text-right">{Number(settings.labor_factor).toFixed(2)}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Operarios activos</TableCell>
                  <TableCell className="text-right">{settings.active_workers_count}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Horas lunes a viernes</TableCell>
                  <TableCell className="text-right">{Number(settings.daily_hours_mon_fri).toFixed(2)}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Horas sábado</TableCell>
                  <TableCell className="text-right">{Number(settings.daily_hours_sat).toFixed(2)}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Buffer cliente</TableCell>
                  <TableCell className="text-right">{settings.client_buffer_days} días</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Contraseña de planta</CardTitle>
          </CardHeader>
          <CardContent>
            {passwordStatus ? (
              <p
                className={`mb-3 text-sm font-semibold ${
                  passwordStatus.tone === "ok" ? "text-[var(--xt-green)]" : "text-[var(--xt-red)]"
                }`}
              >
                {passwordStatus.text}
              </p>
            ) : null}
            <form action={updateFactoryPasswordAction} className="grid gap-4">
              <label className="grid gap-2 text-sm font-semibold">
                Nueva contraseña
                <Input
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  minLength={6}
                  required
                />
              </label>
              <label className="grid gap-2 text-sm font-semibold">
                Confirmar contraseña
                <Input
                  name="confirm"
                  type="password"
                  autoComplete="new-password"
                  minLength={6}
                  required
                />
              </label>
              <Button type="submit">Actualizar contraseña</Button>
            </form>
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Festivos</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid max-h-[520px] gap-2 overflow-auto">
              {holidays.map((holiday) => (
                <div key={holiday.date} className="flex justify-between border border-[var(--xt-cement)] bg-[var(--xt-paper)] p-3 text-sm">
                  <span>{holiday.name}</span>
                  <span className="text-[var(--xt-steel)]">{holiday.date}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </AdminShell>
  );
}
