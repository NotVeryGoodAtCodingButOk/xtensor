import type { Metadata } from "next";
import { AdminShell } from "@/components/app-shell";
import { WorkersManager } from "@/components/admin/workers-manager";

export const metadata: Metadata = { title: "Operarios XTENSOR" };
import { ConfigWarning } from "@/components/config-warning";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { hasSupabaseConfig } from "@/lib/env";
import { listWorkers } from "@/services/catalog";

export default async function WorkersPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  if (!hasSupabaseConfig()) {
    return (
      <AdminShell>
        <ConfigWarning surface="Operarios" />
      </AdminShell>
    );
  }

  const workers = await listWorkers();

  return (
    <AdminShell>
      <Card>
        <CardHeader>
          <CardTitle>Operarios</CardTitle>
        </CardHeader>
        <CardContent>
          {error === "en-curso" && (
            <p role="alert" className="mb-4 rounded-[2px] border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
              No se puede eliminar: el operario tiene una actividad en curso. Debe terminarla primero.
            </p>
          )}
          <WorkersManager workers={workers} />
        </CardContent>
      </Card>
    </AdminShell>
  );
}
