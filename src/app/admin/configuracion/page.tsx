import { LogOut } from "lucide-react";
import { signOutAction, updateFactoryPasswordAction } from "@/app/admin/actions";
import { AdminShell } from "@/components/app-shell";
import { HolidaysManager } from "@/components/admin/holidays-manager";
import { SettingsForm } from "@/components/admin/settings-form";
import { ConfigWarning } from "@/components/config-warning";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
  searchParams: Promise<{ password?: string; settings?: string }>;
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
            <SettingsForm settings={settings} savedOk={params.settings === "ok"} />
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
        <Card>
          <CardHeader>
            <CardTitle>Sesión administrativa</CardTitle>
          </CardHeader>
          <CardContent>
            <form action={signOutAction}>
              <Button type="submit" variant="outline">
                <LogOut className="h-4 w-4" />
                Cerrar sesión
              </Button>
            </form>
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Festivos</CardTitle>
          </CardHeader>
          <CardContent>
            <HolidaysManager holidays={holidays} />
          </CardContent>
        </Card>
      </div>
    </AdminShell>
  );
}
