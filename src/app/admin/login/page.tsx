import { Suspense } from "react";
import { signInAction } from "@/app/admin/actions";
import { BrandLogo } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export default function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  return (
    <main className="xt-brand-photo grid min-h-screen place-items-center px-4 py-10">
      <Card className="w-full max-w-md border-[var(--xt-black)] bg-[var(--xt-paper)]">
        <CardHeader className="gap-4">
          <BrandLogo />
          <div>
            <p className="xt-eyebrow">Control de fábrica</p>
          <CardTitle>Panel administrativo</CardTitle>
          <CardDescription>Ingresa con tu correo y contraseña.</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <Suspense>
            <LoginError searchParams={searchParams} />
          </Suspense>
          <form action={signInAction} className="grid gap-4">
            <label className="grid gap-2 text-sm font-semibold">
              Correo
              <Input name="email" type="email" autoComplete="email" required />
            </label>
            <label className="grid gap-2 text-sm font-semibold">
              Contraseña
              <Input name="password" type="password" autoComplete="current-password" required />
            </label>
            <Button type="submit" size="lg">
              Entrar
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}

async function LoginError({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const params = await searchParams;
  if (!params.error) {
    return null;
  }

  return <p className="mb-4 border border-[var(--line-pro-red)] bg-red-50 p-3 text-sm text-[var(--line-pro-red)]">Credenciales incorrectas.</p>;
}
