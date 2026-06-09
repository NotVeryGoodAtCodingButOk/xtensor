import type { Metadata } from "next";
import { AdminShell } from "@/components/app-shell";
import { ClientsManager } from "@/components/admin/clients-manager";

export const metadata: Metadata = { title: "Clientes XTENSOR" };
import { ConfigWarning } from "@/components/config-warning";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { hasSupabaseConfig } from "@/lib/env";
import { listClients } from "@/services/catalog";
import { buildClientUrl } from "@/services/clients";

export default async function ClientsPage() {
  if (!hasSupabaseConfig()) {
    return (
      <AdminShell>
        <ConfigWarning surface="Clientes" />
      </AdminShell>
    );
  }

  const clients = await listClients();
  const clientsWithUrls = clients.map((c) => ({
    ...c,
    clientUrl: buildClientUrl(c.magic_link_token),
  }));

  return (
    <AdminShell>
      <Card>
        <CardHeader>
          <CardTitle>Clientes y enlaces</CardTitle>
        </CardHeader>
        <CardContent>
          <ClientsManager clients={clientsWithUrls} />
        </CardContent>
      </Card>
    </AdminShell>
  );
}
