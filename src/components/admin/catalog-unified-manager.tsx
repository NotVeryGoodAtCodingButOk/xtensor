"use client";

import { Fragment, useState } from "react";
import { Check, ChevronDown, ChevronUp, Download, Plus, Trash2, X } from "lucide-react";
import {
  addCatalogItemAction,
  addPrevioCatalogItemAction,
  deleteCatalogItemAction,
  deletePrevioCatalogItemAction,
  toggleEquipmentPrevioAction,
  updateCatalogItemAction,
} from "@/app/admin/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MACHINE_LINE_OPTIONS, normalizeMachineLine } from "@/lib/machine-lines";
import { cn, formatCurrencyCop } from "@/lib/utils";
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
          <select name="line" defaultValue="otros" className={cn(selectCls, "w-36")}>
            {MACHINE_LINE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
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

function EditPanel({
  item,
  onClose,
}: {
  item: CatalogRow;
  onClose: () => void;
}) {
  const currentLine = normalizeMachineLine(item.line);

  return (
    <TableRow className="bg-[var(--xt-yellow-soft)]/45 hover:bg-[var(--xt-yellow-soft)]/45">
      <TableCell />
      <TableCell colSpan={6}>
        <div className="py-3">
          <p className="mb-2 text-sm font-semibold">Editar equipo</p>
          <div className="flex flex-wrap items-center gap-2">
            <form action={updateCatalogItemAction} className="flex flex-wrap items-center gap-2">
              <input type="hidden" name="id" value={item.id} />
              <Input name="code" defaultValue={item.code} placeholder="Código" className="h-8 w-28 text-sm" required />
              <Input name="name" defaultValue={item.name} placeholder="Nombre del equipo" className="h-8 w-52 text-sm" required />
              <select name="line" defaultValue={currentLine} className={cn(selectCls, "w-36")}>
                {MACHINE_LINE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
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
            <form
              action={deleteCatalogItemAction}
              onSubmit={(e) => {
                if (!confirm(`¿Eliminar "${item.name}"? Esta acción no se puede deshacer.`)) e.preventDefault();
              }}
              className="ml-auto"
            >
              <input type="hidden" name="id" value={item.id} />
              <Button type="submit" size="sm" variant="danger">
                <Trash2 className="h-3 w-3" />
                Eliminar
              </Button>
            </form>
          </div>
        </div>
      </TableCell>
    </TableRow>
  );
}

function DeletePrevioButton({ previo }: { previo: PrevioCatalogView }) {
  return (
    <form
      action={deletePrevioCatalogItemAction}
      onSubmit={(e) => {
        if (
          !window.confirm(
            `¿Eliminar el previo maestro "${previo.name}"?\n\n` +
              "Se quitará de TODAS las máquinas y de todos los códigos de equipo que lo tengan asociado. Esta acción no se puede deshacer.",
          )
        ) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="id" value={previo.id} />
      <Button type="submit" size="sm" variant="outline">
        {previo.name}
        <Trash2 className="h-3 w-3" />
      </Button>
    </form>
  );
}

function InlinePrevioChip({
  item,
  previo,
  active,
}: {
  item: CatalogRow;
  previo: PrevioCatalogView;
  active: boolean;
}) {
  return (
    <form action={toggleEquipmentPrevioAction}>
      <input type="hidden" name="equipmentId" value={item.id} />
      <input type="hidden" name="previoCatalogId" value={previo.id} />
      <input type="hidden" name="isActive" value={String(!active)} />
      <button
        type="submit"
        onClick={(e) => e.stopPropagation()}
        title={active ? `Quitar "${previo.name}"` : `Activar "${previo.name}"`}
        className={cn(
          "inline-flex items-center gap-1 border px-1.5 py-0.5 text-[10px] transition-colors leading-none",
          active
            ? "border-[var(--xt-black)] bg-[var(--xt-yellow)] text-[var(--xt-black)] font-medium"
            : "border-[var(--xt-cement)] bg-[var(--xt-white)] text-[var(--xt-aluminum)] hover:border-[var(--xt-steel)] hover:text-[var(--xt-steel)]",
        )}
      >
        {active && <Check className="h-2.5 w-2.5 shrink-0" />}
        {previo.name}
      </button>
    </form>
  );
}

function downloadCatalogCsv(catalog: CatalogRow[]) {
  const headers = ["Código", "Equipo", "Línea", "Precio COP", "Estado"];
  const rows = catalog.map((item) => [
    item.code,
    item.name,
    item.line ?? "",
    item.default_price_cop ?? "",
    item.is_active ? "Activo" : "Inactivo",
  ]);
  const csv = [headers, ...rows]
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `catalogo-xtensor-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
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
              <DeletePrevioButton key={previo.id} previo={previo} />
            ))}
          </div>
        </div>
      </section>

      {/* Equipment table */}
      <div className="grid gap-3">
        <div className="flex items-center gap-3">
          <Input
            placeholder="Buscar por código, nombre o línea…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-sm"
          />
          <div className="ml-auto flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => downloadCatalogCsv(catalog)}>
              <Download className="h-4 w-4" />
              Descargar
            </Button>
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
          <Table className="min-w-[960px] text-xs">
            <TableHeader>
              <TableRow>
                <TableHead className="w-12" />
                <TableHead>Código</TableHead>
                <TableHead>Equipo</TableHead>
                <TableHead>Línea</TableHead>
                <TableHead className="text-right">Precio</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Previos requeridos</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {adding && <AddRow onCancel={() => setAdding(false)} />}
              {filtered.map((item) => {
                const expanded = expandedId === item.id;
                const activePrevioIds = new Set(item.previos.map((p) => p.previoCatalogId));
                return (
                  <Fragment key={item.id}>
                    <TableRow>
                      <TableCell>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          aria-label={expanded ? "Contraer" : "Editar"}
                          onClick={() => {
                            setExpandedId(expanded ? null : item.id);
                            setAdding(false);
                          }}
                        >
                          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        </Button>
                      </TableCell>
                      <TableCell className="font-medium">{item.code}</TableCell>
                      <TableCell>{item.name}</TableCell>
                      <TableCell>{item.line ?? <span className="text-[var(--xt-aluminum)]">—</span>}</TableCell>
                      <TableCell className="text-right">
                        {formatCurrencyCop(Number(item.default_price_cop ?? 0))}
                      </TableCell>
                      <TableCell>
                        <Badge variant={item.is_active ? "success" : "muted"}>
                          {item.is_active ? "Activo" : "Inactivo"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {previosCatalog.length === 0 ? (
                            <span className="text-[var(--xt-aluminum)]">Sin previos en catálogo</span>
                          ) : (
                            previosCatalog.map((previo) => (
                              <InlinePrevioChip
                                key={previo.id}
                                item={item}
                                previo={previo}
                                active={activePrevioIds.has(previo.id)}
                              />
                            ))
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                    {expanded && (
                      <EditPanel
                        key={`${item.id}-edit`}
                        item={item}
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
