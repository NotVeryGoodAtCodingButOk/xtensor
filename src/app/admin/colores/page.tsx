import { AdminShell } from "@/components/app-shell";
import { ConfigWarning } from "@/components/config-warning";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { hasSupabaseConfig } from "@/lib/env";
import { listColors } from "@/services/catalog";

export default async function ColorsPage() {
  if (!hasSupabaseConfig()) {
    return (
      <AdminShell>
        <ConfigWarning surface="Colores" />
      </AdminShell>
    );
  }

  const colors = await listColors();

  return (
    <AdminShell>
      <Card>
        <CardHeader>
          <CardTitle>Colores</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {colors.map((color) => (
              <div key={color.id} className="border border-[var(--xt-cement)] bg-[var(--xt-paper)] p-3 text-sm font-medium">
                {color.name}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </AdminShell>
  );
}
