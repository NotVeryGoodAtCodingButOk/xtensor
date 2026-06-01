"use client";

import { useState } from "react";
import { Check, Pencil, Plus, X } from "lucide-react";
import { addCatalogItemAction, updateCatalogItemAction } from "@/app/admin/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCurrencyCop } from "@/lib/utils";

type CatalogItem = {
  id: string;
  code: string;
  name: string;
  line: string | null;
  default_price_cop: number | null;
  is_active: boolean;
  is_custom: boolean;
  created_at: string;
  updated_at: string;
};

const selectCls =
  "flex h-8 rounded-[2px] border border-[var(--xt-aluminum)] bg-[var(--xt-white)] px-2 py-1 text-sm focus-visible:border-[var(--xt-black)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--xt-yellow)]";

function CatalogEditRow({ item, onCancel }: { item?: CatalogItem; onCancel: () => void }) {
  const action = item ? updateCatalogItemAction : addCatalogItemAction;
  return (
    <TableRow className="bg-[var(--xt-yellow-soft)]">
      <TableCell colSpan={6}>
        <form action={action} className="flex flex-wrap items-center gap-2">
          {item && <input type="hidden" name="id" value={item.id} />}
          <Input
            name="code"
            defaultValue={item?.code}
            placeholder="Código"
            className="h-8 w-28 text-sm"
            required
            autoFocus
          />
          <Input
            name="name"
            defaultValue={item?.name}
            placeholder="Nombre del equipo"
            className="h-8 w-52 text-sm"
            required
          />
          <Input
            name="line"
            defaultValue={item?.line ?? ""}
            placeholder="Línea"
            className="h-8 w-24 text-sm"
          />
          <Input
            name="default_price_cop"
            type="number"
            min="0"
            defaultValue={item?.default_price_cop ?? ""}
            placeholder="Precio"
            className="h-8 w-32 text-sm"
          />
          {item && (
            <select
              name="is_active"
              defaultValue={item.is_active ? "true" : "false"}
              className={selectCls}
            >
              <option value="true">Activo</option>
              <option value="false">Inactivo</option>
            </select>
          )}
          <Button type="submit" size="sm">
            <Check className="h-3 w-3" />
            {item ? "Guardar" : "Agregar"}
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
            <X className="h-3 w-3" />
          </Button>
        </form>
      </TableCell>
    </TableRow>
  );
}

export function CatalogManager({ catalog }: { catalog: CatalogItem[] }) {
  const [editingId, setEditingId] = useState<string | null>(null);
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
    <div className="grid gap-4">
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
              setEditingId(null);
            }}
          >
            <Plus className="h-4 w-4" />
            Agregar equipo
          </Button>
        </div>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Código</TableHead>
            <TableHead>Equipo</TableHead>
            <TableHead>Línea</TableHead>
            <TableHead className="text-right">Precio</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead>Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {adding && <CatalogEditRow onCancel={() => setAdding(false)} />}
          {filtered.map((item) =>
            editingId === item.id ? (
              <CatalogEditRow key={item.id} item={item} onCancel={() => setEditingId(null)} />
            ) : (
              <TableRow key={item.id}>
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
                  <Button
                    size="sm"
                    variant="outline"
                    type="button"
                    onClick={() => {
                      setEditingId(item.id);
                      setAdding(false);
                    }}
                  >
                    <Pencil className="h-3 w-3" />
                    Editar
                  </Button>
                </TableCell>
              </TableRow>
            ),
          )}
        </TableBody>
      </Table>
    </div>
  );
}
