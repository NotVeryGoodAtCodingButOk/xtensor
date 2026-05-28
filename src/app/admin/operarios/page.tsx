import { AdminShell } from "@/components/app-shell";
import { ConfigWarning } from "@/components/config-warning";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { hasSupabaseConfig } from "@/lib/env";
import { formatCurrencyCop } from "@/lib/utils";
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
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Rol</TableHead>
                <TableHead className="text-right">Costo hora</TableHead>
                <TableHead>Color</TableHead>
                <TableHead>Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {workers.map((worker) => (
                <TableRow key={worker.id}>
                  <TableCell className="font-medium">{worker.full_name}</TableCell>
                  <TableCell>{worker.role}</TableCell>
                  <TableCell className="text-right">{formatCurrencyCop(Number(worker.hourly_cost_cop ?? 0))}</TableCell>
                  <TableCell>
                    <span className="inline-flex items-center gap-2">
                      <span className="h-4 w-4 rounded" style={{ background: worker.display_color ?? "#d6d3d1" }} />
                      {worker.display_color ?? "Sin color"}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Badge variant={worker.is_active ? "success" : "muted"}>{worker.is_active ? "Activo" : "Inactivo"}</Badge>
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
