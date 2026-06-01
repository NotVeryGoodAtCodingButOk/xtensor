import { AdminShell } from "@/components/app-shell";
import { WorkersManager } from "@/components/admin/workers-manager";
import { ConfigWarning } from "@/components/config-warning";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { hasSupabaseConfig } from "@/lib/env";
import { listWorkers } from "@/services/catalog";

export default async function WorkersPage() {
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
          <WorkersManager workers={workers} />
        </CardContent>
      </Card>
    </AdminShell>
  );
}
