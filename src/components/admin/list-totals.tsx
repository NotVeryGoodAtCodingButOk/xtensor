/**
 * Cuántas máquinas hay en una lista y cuánto suman (precio de venta), como
 * los contadores de la cartelera. Con filtros muestra «de N».
 */

const copFormatter = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });

export function sumSalePrices(machines: Array<{ salePriceCop: number }>) {
  return machines.reduce((sum, machine) => sum + (Number.isFinite(machine.salePriceCop) ? machine.salePriceCop : 0), 0);
}

export function ListTotals({
  machines,
  totalCount,
}: {
  /** Las máquinas que se ven en la lista (ya filtradas). */
  machines: Array<{ salePriceCop: number }>;
  /** Cuántas hay sin filtros; si es distinto se muestra «de N». */
  totalCount?: number;
}) {
  const filtered = totalCount !== undefined && totalCount !== machines.length;

  return (
    <div className="flex items-end gap-6 text-right">
      <div>
        <p className="text-3xl font-bold tabular-nums leading-none">
          {machines.length}
          {filtered ? <span className="text-base font-semibold text-[var(--xt-steel)]"> de {totalCount}</span> : null}
        </p>
        <p className="xt-eyebrow">Máquina{machines.length === 1 ? "" : "s"}</p>
      </div>
      <div>
        <p className="text-3xl font-bold tabular-nums leading-none">{copFormatter.format(sumSalePrices(machines))}</p>
        <p className="xt-eyebrow">Suman</p>
      </div>
    </div>
  );
}
