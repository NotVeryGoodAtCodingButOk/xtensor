import { AdminShell } from "@/components/app-shell";
import { PreviosManager } from "@/components/admin/previos-manager";
import { ConfigWarning } from "@/components/config-warning";
import { RealtimeRefresh } from "@/components/realtime-refresh";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { hasSupabaseConfig } from "@/lib/env";
import { listMachinePrevioRows, listPrevioCatalog } from "@/services/previos";

export default async function PreviosPage({
  searchParams,
}: {
  searchParams?: Promise<{ seed?: string; machines?: string; previos?: string }>;
}) {
  if (!hasSupabaseConfig()) {
    return (
      <AdminShell>
        <ConfigWarning surface="Previos" />
      </AdminShell>
    );
  }

  const [machines, previosCatalog, params] = await Promise.all([
    listMachinePrevioRows(),
    listPrevioCatalog(),
    searchParams ?? Promise.resolve({ seed: undefined, machines: undefined, previos: undefined }),
  ]);

  const seededMessage =
    params.seed === "ok"
      ? `Carga completada: ${params.machines ?? "0"} máquinas actualizadas y ${params.previos ?? "0"} previos agregados.`
      : null;

  return (
    <AdminShell>
      <RealtimeRefresh channelName="admin-previos" tables={["machines", "machine_previos", "machine_previo_events"]} />
      <Card>
        <CardHeader>
          <CardTitle>Previos por máquina</CardTitle>
        </CardHeader>
        <CardContent>
          <PreviosManager machines={machines} previosCatalog={previosCatalog} seededMessage={seededMessage} />
        </CardContent>
      </Card>
    </AdminShell>
  );
}
