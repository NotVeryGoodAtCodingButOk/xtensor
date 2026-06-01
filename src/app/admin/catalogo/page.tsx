import { AdminShell } from "@/components/app-shell";
import { CatalogPreviosManager } from "@/components/admin/catalog-previos-manager";
import { CatalogManager } from "@/components/admin/catalog-manager";
import { ConfigWarning } from "@/components/config-warning";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { hasSupabaseConfig } from "@/lib/env";
import { listCatalog } from "@/services/catalog";
import { listCatalogWithMachineTargets, listPrevioCatalog } from "@/services/previos";

export default async function CatalogPage() {
  if (!hasSupabaseConfig()) {
    return (
      <AdminShell>
        <ConfigWarning surface="Catálogo" />
      </AdminShell>
    );
  }

  const [catalog, catalogWithMachines, previosCatalog] = await Promise.all([
    listCatalog(),
    listCatalogWithMachineTargets(),
    listPrevioCatalog(),
  ]);

  return (
    <AdminShell>
      <div className="grid gap-5">
        <Card>
          <CardHeader>
            <CardTitle>Catálogo de equipos</CardTitle>
          </CardHeader>
          <CardContent>
            <CatalogManager catalog={catalog} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Previos por catálogo</CardTitle>
          </CardHeader>
          <CardContent>
            <CatalogPreviosManager catalog={catalogWithMachines} previosCatalog={previosCatalog} />
          </CardContent>
        </Card>
      </div>
    </AdminShell>
  );
}
