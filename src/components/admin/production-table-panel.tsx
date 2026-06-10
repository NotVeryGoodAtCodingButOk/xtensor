"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import { ChevronDown, Palette, Search, Truck, X } from "lucide-react";
import { bulkMarkShippedAction } from "@/app/admin/actions";
import { ProductionTable } from "@/components/admin/production-table";
import type { SortConfig, SortKey } from "@/components/admin/production-table";
import { Button } from "@/components/ui/button";
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
        m.placaNumber.toString().includes(q) ||
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

export function ProductionTablePanel({ machines }: { machines: CalculatedMachineView[] }) {
  const [colorRows, setColorRows] = useState(false);
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS);
  const [sortConfig, setSortConfig] = useState<SortConfig>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

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

  return (
    <div className="grid gap-2">
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Search */}
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-[var(--xt-aluminum)]" />
          <input
            type="text"
            placeholder="Placa, cliente, equipo…"
            value={filters.search}
            onChange={(e) => patch({ search: e.target.value })}
            className="h-7 w-48 border border-[var(--xt-cement)] bg-[var(--xt-white)] pl-6 pr-2 text-xs placeholder:text-[var(--xt-aluminum)] focus:border-[var(--xt-black)] focus:outline-none"
          />
          {filters.search && (
            <button
              type="button"
              onClick={() => patch({ search: "" })}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[var(--xt-aluminum)] hover:text-[var(--xt-black)]"
            >
              <X className="h-3 w-3" />
            </button>
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
          <button
            type="button"
            onClick={() => setFilters(EMPTY_FILTERS)}
            className="inline-flex h-7 items-center gap-1 px-2 text-xs text-[var(--xt-steel)] hover:text-[var(--xt-black)]"
          >
            <X className="h-3 w-3" />
            Limpiar
          </button>
        )}

        {/* Spacer + color toggle */}
        <label className="ml-auto inline-flex cursor-pointer items-center gap-2 text-xs text-[var(--xt-steel)]">
          <span className="inline-flex h-6 w-6 items-center justify-center border border-[var(--xt-cement)] bg-[var(--xt-white)] text-[var(--xt-black)]">
            <Palette className="h-3.5 w-3.5" />
          </span>
          <span>Colorear</span>
          <input
            type="checkbox"
            checked={colorRows}
            onChange={(e) => setColorRows(e.target.checked)}
            className="h-4 w-4 accent-[var(--xt-yellow-deep)]"
            aria-label="Colorear filas según el color de la máquina"
          />
        </label>
      </div>

      {/* Result count when filtered */}
      {filtered && (
        <p className="text-xs text-[var(--xt-steel)]">
          {displayed.length === machines.length
            ? `${machines.length} máquinas`
            : `${displayed.length} de ${machines.length} máquinas`}
        </p>
      )}

      {selectedIds.size > 0 && (
        <form action={bulkMarkShippedAction} className="flex items-center gap-3 rounded-[2px] border border-[var(--xt-black)] bg-[var(--xt-yellow-soft)] px-3 py-2">
          {Array.from(selectedIds).map((id) => (
            <input key={id} type="hidden" name="machineIds" value={id} />
          ))}
          <span className="text-xs font-medium">{selectedIds.size} seleccionada{selectedIds.size === 1 ? "" : "s"}</span>
          <Button type="submit" size="sm" variant="outline" className="ml-auto gap-1.5">
            <Truck className="h-3.5 w-3.5" />
            Despachar seleccionadas
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setSelectedIds(new Set())}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </form>
      )}

      <ProductionTable
        machines={displayed}
        colorRows={colorRows}
        sortConfig={sortConfig}
        onSort={handleSort}
        selectedIds={selectedIds}
        onToggle={toggleSelected}
      />
    </div>
  );
}
