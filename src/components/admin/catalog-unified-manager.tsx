"use client";

import { Fragment, useState } from "react";
import { Check, ChevronDown, ChevronUp, Plus, Trash2, X } from "lucide-react";
import {
  addCatalogItemAction,
  addEquipmentPrevioAction,
  addPrevioCatalogItemAction,
  deletePrevioCatalogItemAction,
  removeEquipmentPrevioAction,
  updateCatalogItemAction,
} from "@/app/admin/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCurrencyCop } from "@/lib/utils";
import type { Database } from "@/types/database";
import type { EquipmentPrevioView, PrevioCatalogView } from "@/types/domain";

type CatalogRow = Database["public"]["Tables"]["equipment_catalog"]["Row"] & {
  previos: EquipmentPrevioView[];
};

const selectCls =
  "flex h-8 rounded-[2px] border border-[var(--xt-aluminum)] bg-[var(--xt-white)] px-2 py-1 text-sm focus-visible:border-[var(--xt-black)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--xt-yellow)]";

function AddRow({ onCancel }: { onCancel: () => void }) {
  return (
    <TableRow className="bg-[var(--xt-yellow-soft)]">
      <TableCell />
      <TableCell colSpan={6}>
        <form action={addCatalogItemAction} className="flex flex-wrap items-center gap-2">
          <Input name="code" placeholder="Código" className="h-8 w-28 text-sm" required autoFocus />
          <Input name="name" placeholder="Nombre del equipo" className="h-8 w-52 text-sm" required />
          <Input name="line" placeholder="Línea" className="h-8 w-24 text-sm" />
          <Input name="default_price_cop" type="number" min="0" placeholder="Precio" className="h-8 w-32 text-sm" />
          <Button type="submit" size="sm">
            <Check className="h-3 w-3" />
            Agregar
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
            <X className="h-3 w-3" />
          </Button>
        </form>
      </TableCell>
    </TableRow>
  );
}

function ExpandedPanel({
  item,
  previosCatalog,
  onClose,
}: {
  item: CatalogRow;
  previosCatalog: PrevioCatalogView[];
  onClose: () => void;
}) {
  return (
    <TableRow className="bg-[var(--xt-yellow-soft)]/45 hover:bg-[var(--xt-yellow-soft)]/45">
      <TableCell />
      <TableCell colSpan={6}>
        <div className="grid gap-5 py-3">
          {/* Edit fields */}
          <div className="grid gap-2">
            <p className="text-sm font-semibold">Editar equipo</p>
            <form action={updateCatalogItemAction} className="flex flex-wrap items-center gap-2">
              <input type="hidden" name="id" value={item.id} />
              <Input name="code" defaultValue={item.code} placeholder="Código" className="h-8 w-28 text-sm" required />
              <Input name="name" defaultValue={item.name} placeholder="Nombre del equipo" className="h-8 w-52 text-sm" required />
              <Input name="line" defaultValue={item.line ?? ""} placeholder="Línea" className="h-8 w-24 text-sm" />
              <Input
                name="default_price_cop"
                type="number"
                min="0"
                defaultValue={item.default_price_cop ?? ""}
                placeholder="Precio"
                className="h-8 w-32 text-sm"
              />
              <select name="is_active" defaultValue={item.is_active ? "true" : "false"} className={selectCls}>
                <option value="true">Activo</option>
                <option value="false">Inactivo</option>
              </select>
              <Button type="submit" size="sm">
                <Check className="h-3 w-3" />
                Guardar
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={onClose}>
                <X className="h-3 w-3" />
              </Button>
            </form>
          </div>

          {/* Previos */}
          <div className="grid gap-2">
            <div>
              <p className="text-sm font-semibold">Previos para {item.code}</p>
              <p className="text-xs text-[var(--xt-steel)]">
                Las máquinas nuevas de este código reciben estos previos automáticamente.
              </p>
            </div>
            <form action={addEquipmentPrevioAction} className="flex flex-wrap items-center gap-2">
              <input type="hidden" name="equipmentId" value={item.id} />
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
              <Button type="submit" size="sm">
                <Plus className="h-3 w-3" />
                Agregar
              </Button>
            </form>
            <div className="flex flex-wrap gap-2">
              {item.previos.length === 0 ? (
                <p className="text-xs text-[var(--xt-steel)]">Sin previos asociados.</p>
              ) : (
                item.previos.map((previo) => (
                  <form key={previo.id} action={removeEquipmentPrevioAction}>
                    <input type="hidden" name="equipmentPrevioId" value={previo.id} />
                    <Button type="submit" size="sm" variant="outline">
                      {previo.name}
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </form>
                ))
              )}
            </div>
          </div>
        </div>
      </TableCell>
    </TableRow>
  );
}

export function CatalogUnifiedManager({
  catalog,
  previosCatalog,
}: {
  catalog: CatalogRow[];
  previosCatalog: PrevioCatalogView[];
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [search, setSearch] = useState("");

  const filtered = search
    ? catalog.filter(
        (item) =>
          item.code.toLowerCase().includes(search.toLowerCase()) ||
          item.name.toLowerCase().includes(search.toLowerCase()) ||
          (item.line ?? "").toLowerCase().includes(search.toLowerCase()),
      )
    : catalog;

  return (
    <div className="grid gap-5">
      {/* Master previos list */}
      <section className="grid gap-3 border border-[var(--xt-black)] bg-[var(--xt-white)] p-4 shadow-[var(--shadow-sm)]">
        <div>
          <h2 className="text-lg font-bold">Lista maestra de previos</h2>
          <p className="text-sm text-[var(--xt-steel)]">Nombres disponibles para asociar a cada código de equipo.</p>
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

      {/* Unified table */}
      <div className="grid gap-3">
        <div className="flex items-center gap-3">
          <Input
            placeholder="Buscar por código, nombre o línea…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-sm"
          />
          <div className="ml-auto">
            <Button
              size="sm"
              onClick={() => {
                setAdding(true);
                setExpandedId(null);
              }}
            >
              <Plus className="h-4 w-4" />
              Agregar equipo
            </Button>
          </div>
        </div>

        <div className="overflow-x-auto border border-[var(--xt-black)] bg-[var(--xt-white)] shadow-[var(--shadow-sm)]">
          <Table className="min-w-[900px]">
            <TableHeader>
              <TableRow>
                <TableHead className="w-12" />
                <TableHead>Código</TableHead>
                <TableHead>Equipo</TableHead>
                <TableHead>Línea</TableHead>
                <TableHead className="text-right">Precio</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Previos</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {adding && <AddRow onCancel={() => setAdding(false)} />}
              {filtered.map((item) => {
                const expanded = expandedId === item.id;
                return (
                  <Fragment key={item.id}>
                    <TableRow
                      className="cursor-pointer"
                      onClick={() => {
                        setExpandedId(expanded ? null : item.id);
                        setAdding(false);
                      }}
                    >
                      <TableCell>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          aria-label={expanded ? "Contraer" : "Expandir"}
                          onClick={(e) => {
                            e.stopPropagation();
                            setExpandedId(expanded ? null : item.id);
                            setAdding(false);
                          }}
                        >
                          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        </Button>
                      </TableCell>
                      <TableCell className="font-medium">{item.code}</TableCell>
                      <TableCell>{item.name}</TableCell>
                      <TableCell>{item.line ?? ""}</TableCell>
                      <TableCell className="text-right">
                        {formatCurrencyCop(Number(item.default_price_cop ?? 0))}
                      </TableCell>
                      <TableCell>
                        <Badge variant={item.is_active ? "success" : "muted"}>
                          {item.is_active ? "Activo" : "Inactivo"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {item.previos.length === 0 ? (
                          <Badge variant="muted">Sin previos</Badge>
                        ) : (
                          <span className="text-sm">{item.previos.length}</span>
                        )}
                      </TableCell>
                    </TableRow>
                    {expanded && (
                      <ExpandedPanel
                        key={`${item.id}-panel`}
                        item={item}
                        previosCatalog={previosCatalog}
                        onClose={() => setExpandedId(null)}
                      />
                    )}
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
