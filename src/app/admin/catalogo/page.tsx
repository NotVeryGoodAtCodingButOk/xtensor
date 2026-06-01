import { AdminShell } from "@/components/app-shell";
import { CatalogManager } from "@/components/admin/catalog-manager";
import { ConfigWarning } from "@/components/config-warning";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { hasSupabaseConfig } from "@/lib/env";
import { listCatalog } from "@/services/catalog";

export default async function CatalogPage() {
  if (!hasSupabaseConfig()) {
    return (
      <AdminShell>
        <ConfigWarning surface="Catálogo" />
      </AdminShell>
    );
  }

  const catalog = await listCatalog();

  return (
    <AdminShell>
      <Card>
        <CardHeader>
          <CardTitle>Catálogo de equipos</CardTitle>
        </CardHeader>
        <CardContent>
          <CatalogManager catalog={catalog} />
        </CardContent>
      </Card>
    </AdminShell>
  );
}
