import type { Metadata } from "next";
import { AdminShell } from "@/components/app-shell";
import { ConfigWarning } from "@/components/config-warning";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { hasSupabaseConfig } from "@/lib/env";
import { listFloorDevices, listFloorReviewItems } from "@/services/floor-review";
import { markFloorCommandReviewedAction } from "./actions";

export const metadata: Metadata = { title: "Sincronización de planta XTENSOR" };
export const dynamic = "force-dynamic";

const dateTime = new Intl.DateTimeFormat("es-CO", {
  timeZone: "America/Bogota",
  dateStyle: "short",
  timeStyle: "short",
});

/**
 * Lo que el iPad registró sin conexión y al sincronizar necesitó una decisión:
 * se guardó con un conflicto (el tiempo trabajado siempre se guarda) o no se
 * pudo guardar. También muestra cuándo se comunicó cada iPad por última vez.
 */
export default async function FloorSyncPage() {
  if (!hasSupabaseConfig()) {
    return (
      <AdminShell>
        <ConfigWarning surface="Sincronización de planta" />
      </AdminShell>
    );
  }

  const [items, devices] = await Promise.all([listFloorReviewItems(), listFloorDevices()]);

  return (
    <AdminShell>
      <div className="mb-5">
        <p className="xt-eyebrow">Administración</p>
        <h1 className="text-3xl font-bold">Sincronización de planta</h1>
        <p className="text-sm text-[var(--xt-steel)]">
          El iPad registra aunque no haya internet y envía todo al volver la señal. Aquí aparece lo que llegó con un
          conflicto o no se pudo guardar.
        </p>
      </div>

      <section className="mb-8 border border-[var(--xt-black)] bg-[var(--xt-white)] shadow-[var(--shadow-sm)]">
        <div className="overflow-x-auto">
          <Table className="min-w-[900px] text-sm">
            <TableHeader>
              <TableRow>
                <TableHead>Hora real</TableHead>
                <TableHead>Operario</TableHead>
                <TableHead>Acción</TableHead>
                <TableHead>Detalle</TableHead>
                <TableHead>Qué pasó</TableHead>
                <TableHead>Llegó</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-8 text-center text-[var(--xt-steel)]">
                    Nada para revisar.
                  </TableCell>
                </TableRow>
              ) : (
                items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="whitespace-nowrap">{dateTime.format(new Date(item.occurredAt))}</TableCell>
                    <TableCell>{item.workerName ?? "—"}</TableCell>
                    <TableCell className="whitespace-nowrap">{item.action}</TableCell>
                    <TableCell>{item.detail || "—"}</TableCell>
                    <TableCell className="max-w-[360px]">
                      <Badge variant={item.status === "rejected" ? "danger" : "warning"}>
                        {item.status === "rejected" ? "No se guardó" : "Guardado con conflicto"}
                      </Badge>
                      <p className="mt-1 text-xs leading-snug">{item.reasons.join(" ")}</p>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{dateTime.format(new Date(item.receivedAt))}</TableCell>
                    <TableCell>
                      <form action={markFloorCommandReviewedAction}>
                        <input type="hidden" name="id" value={item.id} />
                        <Button type="submit" size="sm" variant="outline">
                          Revisado
                        </Button>
                      </form>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </section>

      <h2 className="mb-3 text-xl font-bold">Dispositivos de planta</h2>
      <section className="border border-[var(--xt-black)] bg-[var(--xt-white)] shadow-[var(--shadow-sm)]">
        <div className="overflow-x-auto">
          <Table className="min-w-[700px] text-sm">
            <TableHeader>
              <TableRow>
                <TableHead>Dispositivo</TableHead>
                <TableHead>Última comunicación</TableHead>
                <TableHead>Sin enviar</TableHead>
                <TableHead>Abre sin internet</TableHead>
                <TableHead>Versión</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {devices.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-8 text-center text-[var(--xt-steel)]">
                    Ningún dispositivo ha sincronizado todavía.
                  </TableCell>
                </TableRow>
              ) : (
                devices.map((device) => (
                  <TableRow key={device.deviceId}>
                    <TableCell>{device.device}</TableCell>
                    <TableCell className="whitespace-nowrap">{dateTime.format(new Date(device.lastSyncAt))}</TableCell>
                    <TableCell>{device.pendingCount}</TableCell>
                    <TableCell>{device.swSupported === null ? "—" : device.swSupported ? "Sí" : "No"}</TableCell>
                    <TableCell className="text-xs text-[var(--xt-steel)]">{device.appVersion ?? "—"}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </section>
    </AdminShell>
  );
}
