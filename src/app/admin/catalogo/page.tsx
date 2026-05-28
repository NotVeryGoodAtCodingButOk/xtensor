import { AdminShell } from "@/components/app-shell";
import { ConfigWarning } from "@/components/config-warning";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { hasSupabaseConfig } from "@/lib/env";
import { formatCurrencyCop } from "@/lib/utils";
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
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Código</TableHead>
                <TableHead>Equipo</TableHead>
                <TableHead>Línea</TableHead>
                <TableHead className="text-right">Precio</TableHead>
                <TableHead>Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {catalog.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-medium">{item.code}</TableCell>
                  <TableCell>{item.name}</TableCell>
                  <TableCell>{item.line ?? ""}</TableCell>
                  <TableCell className="text-right">{formatCurrencyCop(Number(item.default_price_cop ?? 0))}</TableCell>
                  <TableCell>
                    <Badge variant={item.is_active ? "success" : "muted"}>{item.is_active ? "Activo" : "Inactivo"}</Badge>
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
