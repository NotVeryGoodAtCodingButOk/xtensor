"use client";

/** Solo lo que pinta la tarjeta (las filas de workers traen salario y no llegan a la tablet). */
export type WorkerCard = {
  id: string;
  name: string;
  role: string;
  color: string | null;
};

/**
 * Selector de operario. Elegir es local (funciona sin red): las acciones que
 * siguen llevan el id del operario en cada comando.
 */
export function WorkerPicker({
  workers,
  badges,
  onSelect,
}: {
  workers: WorkerCard[];
  /** "Pulir · #12" por operario con algo en curso. */
  badges: Map<string, string>;
  onSelect: (workerId: string) => void;
}) {
  return (
    <div className="xt-worker-grid grid grid-cols-1 gap-5 sm:grid-cols-2 md:grid-cols-3">
      {workers.map((worker) => {
        const badge = badges.get(worker.id);
        return (
          <div key={worker.id} className="xt-worker-form">
            <button
              type="button"
              onClick={() => onSelect(worker.id)}
              className="xt-worker-card flex min-h-[180px] w-full flex-col justify-end border border-[var(--xt-black)] p-5 text-left text-white shadow-[var(--shadow-stamp)] md:min-h-[180px] md:p-6 xl:min-h-[200px]"
              style={{ background: worker.color ?? "var(--xt-black)" }}
            >
              {badge ? <span className="xt-worker-card-badge">En curso: {badge}</span> : null}
              <span className="xt-worker-name [font-family:var(--font-barlow-condensed)] text-2xl font-bold leading-tight break-words lg:text-3xl">
                {worker.name}
              </span>
              <span className="xt-worker-role mt-2 text-lg leading-snug opacity-90">{worker.role}</span>
            </button>
          </div>
        );
      })}
    </div>
  );
}
