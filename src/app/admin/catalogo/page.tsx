import type { Metadata } from "next";
import { AdminShell } from "@/components/app-shell";
import { CatalogUnifiedManager } from "@/components/admin/catalog-unified-manager";

export const metadata: Metadata = { title: "Catálogo XTENSOR" };
import { ConfigWarning } from "@/components/config-warning";
import { hasSupabaseConfig } from "@/lib/env";
import { listCatalogWithMachineTargets, listPrevioCatalog } from "@/services/previos";

export default async function CatalogPage() {
  if (!hasSupabaseConfig()) {
    return (
      <AdminShell>
        <ConfigWarning surface="Catálogo" />
      </AdminShell>
    );
  }

  const [catalog, previosCatalog] = await Promise.all([
    listCatalogWithMachineTargets(),
    listPrevioCatalog(),
  ]);

  return (
    <AdminShell>
      <CatalogUnifiedManager catalog={catalog} previosCatalog={previosCatalog} />
    </AdminShell>
  );
}
