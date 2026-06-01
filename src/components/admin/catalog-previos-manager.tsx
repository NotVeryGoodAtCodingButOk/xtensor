"use client";

import { Fragment, useState } from "react";
import { ChevronDown, ChevronUp, Plus, Trash2 } from "lucide-react";
import {
  addPrevioCatalogItemAction,
  bulkApplyCatalogPrevioAction,
  deletePrevioCatalogItemAction,
} from "@/app/admin/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCurrencyCop } from "@/lib/utils";
import { formatDateEs } from "@/services/schedule";
import type { Database } from "@/types/database";
import type { PrevioCatalogView } from "@/types/domain";

type CatalogRow = Database["public"]["Tables"]["equipment_catalog"]["Row"] & {
  machines: Array<{
    id: string;
    coti_number: number;
    status: Database["public"]["Tables"]["machines"]["Row"]["status"];
    promised_date: string;
    clients: { name: string } | null;
  }>;
  machineCount: number;
};

const selectCls =
  "flex h-8 rounded-[2px] border border-[var(--xt-aluminum)] bg-[var(--xt-white)] px-2 py-1 text-sm focus-visible:border-[var(--xt-black)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--xt-yellow)]";

export function CatalogPreviosManager({
  catalog,
  previosCatalog,
}: {
  catalog: CatalogRow[];
  previosCatalog: PrevioCatalogView[];
}) {
  const [expandedId, setExpandedId] = useState<string | null>(catalog[0]?.id ?? null);

  return (
    <div className="grid gap-5">
      <section className="grid gap-3 border border-[var(--xt-black)] bg-[var(--xt-white)] p-4 shadow-[var(--shadow-sm)]">
        <div>
          <h2 className="text-lg font-bold">Lista maestra de previos</h2>
          <p className="text-sm text-[var(--xt-steel)]">Nombres disponibles para agregar o quitar en las máquinas.</p>
        </div>
        <div className="flex flex-wrap items-start gap-3">
          <form action={addPrevioCatalogItemAction} className="flex flex-wrap items-center gap-2">
            <Input name="name" placeholder="Nuevo previo" className="h-9 w-56 text-sm" required />
            <Button type="submit" size="sm">
              <Plus className="h-3 w-3" />
              Agregar
            </Button>
          </form>
          <div className="flex flex-wrap gap-2">
            {previosCatalog.map((previo) => (
              <form key={previo.id} action={deletePrevioCatalogItemAction}>
                <input type="hidden" name="id" value={previo.id} />
                <Button type="submit" size="sm" variant="outline">
                  {previo.name}
                  <Trash2 className="h-3 w-3" />
                </Button>
              </form>
            ))}
          </div>
        </div>
      </section>

      <div className="overflow-x-auto border border-[var(--xt-black)] bg-[var(--xt-white)] shadow-[var(--shadow-sm)]">
        <Table className="min-w-[1120px]">
          <TableHeader>
            <TableRow>
              <TableHead className="w-12" />
              <TableHead>Código</TableHead>
              <TableHead>Equipo</TableHead>
              <TableHead>Línea</TableHead>
              <TableHead className="text-right">Precio</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Máquinas</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {catalog.map((item) => {
              const expanded = expandedId === item.id;
              return (
                <Fragment key={item.id}>
                  <TableRow key={item.id}>
                    <TableCell>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        onClick={() => setExpandedId(expanded ? null : item.id)}
                        aria-label={expanded ? "Contraer máquinas" : "Expandir máquinas"}
                      >
                        {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </Button>
                    </TableCell>
                    <TableCell className="font-medium">{item.code}</TableCell>
                    <TableCell>{item.name}</TableCell>
                    <TableCell>{item.line ?? ""}</TableCell>
                    <TableCell className="text-right">{formatCurrencyCop(Number(item.default_price_cop ?? 0))}</TableCell>
                    <TableCell>
                      <Badge variant={item.is_active ? "success" : "muted"}>{item.is_active ? "Activo" : "Inactivo"}</Badge>
                    </TableCell>
                    <TableCell>{item.machineCount}</TableCell>
                  </TableRow>
                  {expanded ? (
                    <TableRow key={`${item.id}-detail`} className="bg-[var(--xt-yellow-soft)]/45">
                      <TableCell colSpan={7}>
                        <div className="grid gap-4 py-2">
                          <form action={bulkApplyCatalogPrevioAction} className="grid gap-3">
                            <div className="flex flex-wrap items-center gap-2">
                              <select name="previoCatalogId" className={selectCls} defaultValue="" required>
                                <option value="" disabled>
                                  Seleccionar previo
                                </option>
                                {previosCatalog.map((previo) => (
                                  <option key={previo.id} value={previo.id}>
                                    {previo.name}
                                  </option>
                                ))}
                              </select>
                              <select name="mode" className={selectCls} defaultValue="add">
                                <option value="add">Agregar a seleccionadas</option>
                                <option value="remove">Quitar de seleccionadas</option>
                              </select>
                              <Button type="submit" size="sm">
                                Aplicar
                              </Button>
                            </div>
                            {item.machines.length === 0 ? (
                              <p className="text-sm text-[var(--xt-steel)]">No hay máquinas activas asociadas a este equipo.</p>
                            ) : (
                              <div className="grid gap-2 md:grid-cols-2">
                                {item.machines.map((machine) => (
                                  <label
                                    key={machine.id}
                                    className="flex items-center justify-between gap-3 border border-[var(--xt-aluminum)] bg-[var(--xt-white)] px-3 py-2 text-sm"
                                  >
                                    <span className="min-w-0">
                                      <span className="font-medium">COTI {machine.coti_number}</span>
                                      <span className="ml-2 text-[var(--xt-steel)]">{machine.clients?.name ?? "Cliente"}</span>
                                      <span className="ml-2 text-[var(--xt-steel)]">{formatDateEs(machine.promised_date)}</span>
                                    </span>
                                    <span className="flex items-center gap-3">
                                      <Badge variant={machine.status === "shipped" ? "success" : "warning"}>
                                        {machine.status === "shipped" ? "Despachada" : "En producción"}
                                      </Badge>
                                      <input type="checkbox" name="machineIds" value={machine.id} defaultChecked />
                                    </span>
                                  </label>
                                ))}
                              </div>
                            )}
                          </form>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : null}
                </Fragment>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
