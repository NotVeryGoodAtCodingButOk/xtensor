import { redirect } from "next/navigation";
import { unlockFactoryAction } from "@/app/planta/actions";
import { BrandLogo, BrandStamp } from "@/components/brand";
import { ConfigWarning } from "@/components/config-warning";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { hasFactoryConfig } from "@/lib/env";
import { isFactoryUnlocked } from "@/lib/factory-session";

export default async function FactoryLockPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  if (!hasFactoryConfig()) {
    return (
      <main className="grid min-h-screen place-items-center bg-[var(--xt-paper)] p-6">
        <ConfigWarning surface="El tablero de planta" />
      </main>
    );
  }

  if (await isFactoryUnlocked()) {
    redirect("/planta/operarios");
  }

  const params = await searchParams;

  return (
    <main className="xt-brand-photo grid min-h-screen place-items-center p-6">
      <Card className="w-full max-w-xl border-[var(--xt-black)] bg-[var(--xt-paper)]">
        <CardHeader className="items-center text-center">
          <BrandLogo className="mb-3" />
          <BrandStamp className="mb-2 h-20 w-20" />
          <p className="xt-eyebrow">Modo planta</p>
          <CardTitle className="text-3xl">Tablero de planta</CardTitle>
          <CardDescription>Desbloquea el iPad para iniciar la jornada.</CardDescription>
        </CardHeader>
        <CardContent>
          {params.error ? (
            <p className="mb-4 border border-[var(--line-pro-red)] bg-red-50 p-4 text-center text-[var(--line-pro-red)]">Contraseña incorrecta.</p>
          ) : null}
          <form action={unlockFactoryAction} className="grid gap-4">
            <Input name="password" type="password" className="h-16 text-xl" autoFocus required />
            <Button type="submit" size="touch">
              Iniciar sesión
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
