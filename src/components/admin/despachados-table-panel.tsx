"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import { AlertTriangle, ChevronDown, Download, Search, Trash2, X } from "lucide-react";
import { bulkDeleteMachinesAction } from "@/app/admin/actions";
import { ProductionTable } from "@/components/admin/production-table";
import type { SortConfig, SortKey } from "@/components/admin/production-table";
import { Button } from "@/components/ui/button";
import { ActionTooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { CalculatedMachineView } from "@/types/domain";

type FilterState = {
  search: string;
  clients: string[];
  colors: string[];
  cities: string[];
  lines: string[];
  assignees: string[];
};

const EMPTY_FILTERS: FilterState = {
  search: "",
  clients: [],
  colors: [],
  cities: [],
  lines: [],
  assignees: [],
};

function isFiltered(f: FilterState) {
  return (
    f.search !== "" ||
    f.clients.length > 0 ||
    f.colors.length > 0 ||
    f.cities.length > 0 ||
    f.lines.length > 0 ||
    f.assignees.length > 0
  );
}

function filterMachines(machines: CalculatedMachineView[], f: FilterState): CalculatedMachineView[] {
  return machines.filter((m) => {
    if (f.search) {
      const q = f.search.toLowerCase();
      const hit =
        m.serialNumber.toString().includes(q) ||
        m.clientName.toLowerCase().includes(q) ||
        m.equipmentName.toLowerCase().includes(q) ||
        (m.equipmentCode ?? "").toLowerCase().includes(q);
      if (!hit) return false;
    }
    if (f.clients.length > 0 && !f.clients.includes(m.clientName)) return false;
    if (f.colors.length > 0 && !f.colors.includes(m.colorName ?? "—")) return false;
    if (f.cities.length > 0 && !f.cities.includes(m.city ?? "—")) return false;
    if (f.lines.length > 0 && !f.lines.includes(m.line ?? "—")) return false;
    if (f.assignees.length > 0 && !f.assignees.includes(m.assignedTo ?? "—")) return false;
    return true;
  });
}

function sortMachines(machines: CalculatedMachineView[], s: SortConfig): CalculatedMachineView[] {
  if (!s) return machines;
  return [...machines].sort((a, b) => {
    const av = a[s.key];
    const bv = b[s.key];
    let cmp = 0;
    if (av == null && bv == null) cmp = 0;
    else if (av == null) cmp = 1;
    else if (bv == null) cmp = -1;
    else if (typeof av === "string" && typeof bv === "string") cmp = av.localeCompare(bv, "es");
    else cmp = (av as number) < (bv as number) ? -1 : (av as number) > (bv as number) ? 1 : 0;
    return s.dir === "asc" ? cmp : -cmp;
  });
}

function uniqueVals(machines: CalculatedMachineView[], key: keyof CalculatedMachineView): string[] {
  const set = new Set<string>();
  for (const m of machines) {
    const v = m[key];
    set.add(v == null ? "—" : String(v));
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b, "es"));
}

function FilterDropdown({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: string[];
  selected: string[];
  onChange: (values: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const active = selected.length > 0;

  function toggle(value: string) {
    onChange(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value]);
  }

  return (
    <div className="relative" ref={ref}>
      <ActionTooltip text={`Abre el filtro por ${label.toLowerCase()}.`}>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className={cn(
            "inline-flex h-7 items-center gap-1 border px-2 text-xs transition-colors",
            active
              ? "border-[var(--xt-black)] bg-[var(--xt-yellow)] font-medium text-[var(--xt-black)]"
              : "border-[var(--xt-cement)] bg-[var(--xt-white)] text-[var(--xt-steel)] hover:border-[var(--xt-aluminum)] hover:text-[var(--xt-black)]",
          )}
        >
          {label}
          {active && (
            <span className="rounded-sm bg-[var(--xt-black)] px-1 py-px text-[9px] leading-none text-[var(--xt-yellow)]">
              {selected.length}
            </span>
          )}
          <ChevronDown className={cn("h-3 w-3 transition-transform", open && "rotate-180")} />
        </button>
      </ActionTooltip>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-0.5 min-w-[160px] max-h-64 overflow-y-auto border border-[var(--xt-black)] bg-[var(--xt-white)] shadow-md">
          {options.map((opt) => (
            <label
              key={opt}
              className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-xs hover:bg-[var(--xt-yellow-soft)]"
            >
              <input
                type="checkbox"
                checked={selected.includes(opt)}
                onChange={() => toggle(opt)}
                className="h-3 w-3 accent-[var(--xt-yellow-deep)]"
              />
              <span className="truncate">{opt}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

type DeleteDialogStep = "backup-warning" | "confirm-delete";

function DeleteDialog({
  count,
  exportHref,
  onConfirm,
  onClose,
}: {
  count: number;
  exportHref: string;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const [step, setStep] = useState<DeleteDialogStep>("backup-warning");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-md border border-[var(--xt-black)] bg-[var(--xt-white)] p-6 shadow-lg">
        {step === "backup-warning" ? (
          <>
            <div className="mb-4 flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-[var(--xt-yellow-deep)]" />
              <div>
                <p className="font-semibold">Antes de eliminar</p>
                <p className="mt-1 text-sm text-[var(--xt-steel)]">
                  Vas a eliminar permanentemente {count === 1 ? "1 máquina" : `${count} máquinas`}.
                  Esta acción <strong>no se puede deshacer</strong>. ¿Has exportado o guardado una copia de esta información?
                </p>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <ActionTooltip text="Descarga una copia de seguridad antes de eliminar.">
                <a
                  href={exportHref}
                  className="inline-flex h-9 w-full items-center justify-center gap-2 border border-[var(--xt-black)] bg-[var(--xt-yellow)] px-4 text-sm font-medium text-[var(--xt-black)] hover:bg-[var(--xt-yellow-soft)]"
                >
                  <Download className="h-4 w-4" />
                  Exportar ahora
                </a>
              </ActionTooltip>
              <ActionTooltip text="Continúa a la confirmación final de borrado.">
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={() => setStep("confirm-delete")}
                >
                  Ya tengo una copia - continuar
                </Button>
              </ActionTooltip>
              <ActionTooltip text="Cierra este aviso sin eliminar nada.">
                <Button type="button" variant="ghost" className="w-full" onClick={onClose}>
                  Cancelar
                </Button>
              </ActionTooltip>
            </div>
          </>
        ) : (
          <>
            <div className="mb-4 flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-500" />
              <div>
                <p className="font-semibold">Confirmar eliminación</p>
                <p className="mt-1 text-sm text-[var(--xt-steel)]">
                  ¿Estás seguro? Se eliminarán permanentemente{" "}
                  {count === 1 ? "esta máquina" : `estas ${count} máquinas`} de la base de datos.
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <ActionTooltip text="Borra definitivamente las máquinas seleccionadas.">
                <Button
                  type="button"
                  className="flex-1 border-red-600 bg-red-600 text-white hover:bg-red-700"
                  onClick={onConfirm}
                >
                  <Trash2 className="mr-1.5 h-4 w-4" />
                  Eliminar definitivamente
                </Button>
              </ActionTooltip>
              <ActionTooltip text="Vuelve atrás sin borrar máquinas.">
                <Button type="button" variant="outline" onClick={onClose}>
                  Cancelar
                </Button>
              </ActionTooltip>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export function DespachadosTablePanel({ machines }: { machines: CalculatedMachineView[] }) {
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS);
  const [sortConfig, setSortConfig] = useState<SortConfig>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleteTarget, setDeleteTarget] = useState<Set<string> | null>(null);
  const deleteFormRef = useRef<HTMLFormElement>(null);

  function toggleSelected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const clientOptions   = useMemo(() => uniqueVals(machines, "clientName"), [machines]);
  const colorOptions    = useMemo(() => uniqueVals(machines, "colorName"), [machines]);
  const cityOptions     = useMemo(() => uniqueVals(machines, "city"), [machines]);
  const lineOptions     = useMemo(() => uniqueVals(machines, "line"), [machines]);
  const assigneeOptions = useMemo(() => uniqueVals(machines, "assignedTo"), [machines]);

  const displayed = useMemo(
    () => sortMachines(filterMachines(machines, filters), sortConfig),
    [machines, filters, sortConfig],
  );

  const filtered = isFiltered(filters);

  function handleSort(key: SortKey) {
    setSortConfig((prev) => {
      if (!prev || prev.key !== key) return { key, dir: "asc" };
      if (prev.dir === "asc") return { key, dir: "desc" };
      return null;
    });
  }

  function patch(partial: Partial<FilterState>) {
    setFilters((f) => ({ ...f, ...partial }));
  }

  function buildExportHref(ids?: Set<string>) {
    const base = "/admin/despachados/export";
    if (!ids || ids.size === 0) return base;
    return `${base}?ids=${Array.from(ids).join(",")}`;
  }

  function openDeleteDialog(ids: Set<string>) {
    setDeleteTarget(new Set(ids));
  }

  function closeDeleteDialog() {
    setDeleteTarget(null);
  }

  function confirmDelete() {
    deleteFormRef.current?.requestSubmit();
    closeDeleteDialog();
  }

  const deleteCount = deleteTarget?.size ?? 0;
  const deleteExportHref = deleteTarget ? buildExportHref(deleteTarget) : "#";

  return (
    <div className="grid gap-2">
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Search */}
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-[var(--xt-aluminum)]" />
          <input
            type="text"
            placeholder="Serial, cliente, equipo…"
            value={filters.search}
            onChange={(e) => patch({ search: e.target.value })}
            className="h-7 w-48 border border-[var(--xt-cement)] bg-[var(--xt-white)] pl-6 pr-2 text-xs placeholder:text-[var(--xt-aluminum)] focus:border-[var(--xt-black)] focus:outline-none"
          />
          {filters.search && (
            <ActionTooltip text="Limpia el texto de búsqueda." align="right">
              <button
                type="button"
                onClick={() => patch({ search: "" })}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[var(--xt-aluminum)] hover:text-[var(--xt-black)]"
              >
                <X className="h-3 w-3" />
              </button>
            </ActionTooltip>
          )}
        </div>

        {/* Category dropdowns */}
        <FilterDropdown label="Cliente"  options={clientOptions}   selected={filters.clients}   onChange={(v) => patch({ clients: v })} />
        <FilterDropdown label="Color"    options={colorOptions}    selected={filters.colors}    onChange={(v) => patch({ colors: v })} />
        <FilterDropdown label="Ciudad"   options={cityOptions}     selected={filters.cities}    onChange={(v) => patch({ cities: v })} />
        <FilterDropdown label="Línea"    options={lineOptions}     selected={filters.lines}     onChange={(v) => patch({ lines: v })} />
        <FilterDropdown label="Quién"    options={assigneeOptions} selected={filters.assignees} onChange={(v) => patch({ assignees: v })} />

        {/* Clear */}
        {filtered && (
          <ActionTooltip text="Quita todos los filtros aplicados.">
            <button
              type="button"
              onClick={() => setFilters(EMPTY_FILTERS)}
              className="inline-flex h-7 items-center gap-1 px-2 text-xs text-[var(--xt-steel)] hover:text-[var(--xt-black)]"
            >
              <X className="h-3 w-3" />
              Limpiar
            </button>
          </ActionTooltip>
        )}

        {/* Export all visible */}
        <ActionTooltip text="Descarga en Excel las máquinas despachadas visibles.">
          <a
            href={buildExportHref()}
            className="ml-auto inline-flex h-7 items-center gap-1 border border-[var(--xt-cement)] bg-[var(--xt-white)] px-2 text-xs text-[var(--xt-steel)] transition-colors hover:border-[var(--xt-aluminum)] hover:text-[var(--xt-black)]"
          >
            <Download className="h-3 w-3" />
            Exportar
          </a>
        </ActionTooltip>
      </div>

      {/* Result count when filtered */}
      {filtered && (
        <p className="text-xs text-[var(--xt-steel)]">
          {displayed.length === machines.length
            ? `${machines.length} máquinas`
            : `${displayed.length} de ${machines.length} máquinas`}
        </p>
      )}

      {/* Bulk action bar */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 rounded-[2px] border border-[var(--xt-black)] bg-[var(--xt-yellow-soft)] px-3 py-2">
          <span className="text-xs font-medium">{selectedIds.size} seleccionada{selectedIds.size === 1 ? "" : "s"}</span>
          <ActionTooltip text="Exporta solo las máquinas despachadas seleccionadas.">
            <a
              href={buildExportHref(selectedIds)}
              className="ml-auto inline-flex h-7 items-center gap-1.5 border border-[var(--xt-black)] bg-[var(--xt-white)] px-3 text-xs font-medium text-[var(--xt-black)] hover:bg-[var(--xt-yellow-soft)]"
            >
              <Download className="h-3.5 w-3.5" />
              Exportar seleccionadas
            </a>
          </ActionTooltip>
          <ActionTooltip text="Abre la confirmación para eliminar las seleccionadas.">
            <button
              type="button"
              onClick={() => openDeleteDialog(selectedIds)}
              className="inline-flex h-7 items-center gap-1.5 border border-red-600 bg-red-50 px-3 text-xs font-medium text-red-700 hover:bg-red-100"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Eliminar seleccionadas
            </button>
          </ActionTooltip>
          <ActionTooltip text="Quita la selección actual.">
            <Button type="button" size="sm" variant="ghost" onClick={() => setSelectedIds(new Set())}>
              <X className="h-3.5 w-3.5" />
            </Button>
          </ActionTooltip>
        </div>
      )}

      {/* Hidden form for bulk delete — submitted programmatically after confirmation */}
      <form ref={deleteFormRef} action={bulkDeleteMachinesAction} className="hidden">
        {deleteTarget && Array.from(deleteTarget).map((id) => (
          <input key={id} type="hidden" name="machineIds" value={id} />
        ))}
      </form>

      <ProductionTable
        machines={displayed}
        shipped
        sortConfig={sortConfig}
        onSort={handleSort}
        selectedIds={selectedIds}
        onToggle={toggleSelected}
        onDeleteShipped={(id) => openDeleteDialog(new Set([id]))}
      />

      {deleteTarget && (
        <DeleteDialog
          count={deleteCount}
          exportHref={deleteExportHref}
          onConfirm={confirmDelete}
          onClose={closeDeleteDialog}
        />
      )}
    </div>
  );
}
