import { BrandStamp } from "@/components/brand";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function ConfigWarning({ surface }: { surface: string }) {
  return (
    <Card className="max-w-xl">
      <CardHeader className="flex-row items-start gap-4">
        <BrandStamp className="h-12 w-12 shadow-none" />
        <div>
          <p className="xt-eyebrow">XTENSOR Producción</p>
          <CardTitle>Configuración pendiente</CardTitle>
          <CardDescription>
            {surface} está lista para conectarse, pero faltan variables de entorno de Supabase o Vercel.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-[var(--xt-steel)]">
          Configura `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
          `SUPABASE_SERVICE_ROLE_KEY` y `FACTORY_COOKIE_SECRET` según `.env.example`.
        </p>
      </CardContent>
    </Card>
  );
}
