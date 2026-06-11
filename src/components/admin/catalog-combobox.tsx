"use client";

import { useState, useRef, useEffect } from "react";

type CatalogItem = {
  id: string;
  code: string;
  name: string;
};

export function CatalogCombobox({
  items,
  defaultId,
  defaultLabel,
  name = "equipmentId",
}: {
  items: CatalogItem[];
  defaultId: string | null;
  defaultLabel: string;
  name?: string;
}) {
  const [query, setQuery] = useState(defaultLabel);
  const [selectedId, setSelectedId] = useState(defaultId ?? "");
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const filtered = query.trim()
    ? items.filter((item) => {
        const q = query.toLowerCase();
        return item.code.toLowerCase().includes(q) || item.name.toLowerCase().includes(q);
      })
    : items;

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        // Reset display to current selection if user typed without picking
        if (selectedId) {
          const found = items.find((i) => i.id === selectedId);
          if (found) setQuery(`${found.code} · ${found.name}`);
        } else {
          setQuery("");
        }
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [selectedId, items]);

  function handleSelect(item: CatalogItem) {
    setSelectedId(item.id);
    setQuery(`${item.code} · ${item.name}`);
    setOpen(false);
  }

  function handleClear() {
    setSelectedId("");
    setQuery("");
    setOpen(false);
  }

  return (
    <div ref={containerRef} className="relative">
      <input type="hidden" name={name} value={selectedId} />
      <div className="relative flex items-center">
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setSelectedId("");
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder="Buscar por código o nombre…"
          autoComplete="off"
          className="h-10 w-full rounded-[2px] border border-[var(--xt-aluminum)] bg-[var(--xt-white)] px-3 pr-8 text-sm focus-visible:border-[var(--xt-black)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--xt-yellow)]"
        />
        {selectedId && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-2 text-[var(--xt-cement)] hover:text-[var(--xt-black)]"
            aria-label="Limpiar selección"
          >
            ×
          </button>
        )}
      </div>
      {open && filtered.length > 0 && (
        <ul className="absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-[2px] border border-[var(--xt-aluminum)] bg-[var(--xt-white)] shadow-md">
          {filtered.slice(0, 100).map((item) => (
            <li
              key={item.id}
              onMouseDown={(e) => {
                e.preventDefault();
                handleSelect(item);
              }}
              className={`cursor-pointer px-3 py-2 text-sm hover:bg-[var(--xt-yellow)] ${
                item.id === selectedId ? "bg-[var(--xt-yellow)]" : ""
              }`}
            >
              <span className="font-mono text-xs text-[var(--xt-cement)]">{item.code}</span>
              <span className="ml-2">{item.name}</span>
            </li>
          ))}
        </ul>
      )}
      {open && filtered.length === 0 && query.trim() && (
        <div className="absolute z-50 mt-1 w-full rounded-[2px] border border-[var(--xt-aluminum)] bg-[var(--xt-white)] px-3 py-2 text-sm text-[var(--xt-cement)] shadow-md">
          Sin resultados
        </div>
      )}
    </div>
  );
}
