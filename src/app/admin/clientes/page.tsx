import { regenerateClientTokenAction } from "@/app/admin/actions";
import { AdminShell } from "@/components/app-shell";
import { ConfigWarning } from "@/components/config-warning";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { buildClientUrl } from "@/services/clients";
import { hasSupabaseConfig } from "@/lib/env";
import { listClients } from "@/services/catalog";

export default async function ClientsPage() {
  if (!hasSupabaseConfig()) {
    return (
      <AdminShell>
        <ConfigWarning surface="Clientes" />
      </AdminShell>
    );
  }

  const clients = await listClients();

  return (
    <AdminShell>
      <Card>
        <CardHeader>
          <CardTitle>Clientes y enlaces</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cliente</TableHead>
                <TableHead>Enlace</TableHead>
                <TableHead>Creado</TableHead>
                <TableHead>Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {clients.map((client) => (
                <TableRow key={client.id}>
                  <TableCell className="font-medium">{client.name}</TableCell>
                  <TableCell className="max-w-xl truncate">{buildClientUrl(client.magic_link_token)}</TableCell>
                  <TableCell>{client.created_at.slice(0, 10)}</TableCell>
                  <TableCell>
                    <form action={regenerateClientTokenAction}>
                      <input type="hidden" name="clientId" value={client.id} />
                      <Button type="submit" size="sm" variant="outline">
                        Regenerar enlace
                      </Button>
                    </form>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </AdminShell>
  );
}
