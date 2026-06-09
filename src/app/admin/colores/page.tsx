import type { Metadata } from "next";
import { AdminShell } from "@/components/app-shell";
import { ColorsManager } from "@/components/admin/colors-manager";

export const metadata: Metadata = { title: "Colores XTENSOR" };
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
          <ColorsManager colors={colors} />
        </CardContent>
      </Card>
    </AdminShell>
  );
}
