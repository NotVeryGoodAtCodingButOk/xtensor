"use client";

import { useFormStatus } from "react-dom";
import { selectWorkerAction } from "@/app/planta/actions";
import { describeOpenSession } from "@/lib/work-session-ui";
import type { OpenSessionSummary } from "@/services/work-sessions";

/** Solo lo que pinta la tarjeta: las filas de workers traen hourly_cost_cop (salario) y no deben llegar a la tablet. */
type WorkerCard = {
  id: string;
  full_name: string;
  role: string;
  display_color: string | null;
};

/**
 * Cada tarjeta es un formulario con la server action de selección: la cookie
 * del operario queda puesta ANTES de pintar /planta/maquinas (una sola
 * petición, sin prefetch por operario), así que el encabezado siempre muestra
 * a quien tocó la tarjeta.
 */
export function WorkerPicker({
  workers,
  openSessions = [],
}: {
  workers: WorkerCard[];
  openSessions?: OpenSessionSummary[];
}) {
  const openSessionByWorker = new Map(openSessions.map((session) => [session.workerId, session]));

  return (
    <div className="xt-worker-grid grid grid-cols-1 gap-5 sm:grid-cols-2 md:grid-cols-3">
      {workers.map((worker) => (
        <form key={worker.id} action={selectWorkerAction} className="xt-worker-form">
          <input type="hidden" name="workerId" value={worker.id} />
          <WorkerCardButton worker={worker} openSession={openSessionByWorker.get(worker.id)} />
        </form>
      ))}
    </div>
  );
}

function WorkerCardButton({ worker, openSession }: { worker: WorkerCard; openSession?: OpenSessionSummary }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className={`xt-worker-card ${pending ? "xt-worker-card-pending" : ""} flex min-h-[180px] w-full flex-col justify-end border border-[var(--xt-black)] p-5 text-left text-white shadow-[var(--shadow-stamp)] md:min-h-[180px] md:p-6 xl:min-h-[200px]`}
      style={{ background: worker.display_color ?? "var(--xt-black)" }}
    >
      {pending ? (
        <span className="xt-worker-card-badge">Cargando…</span>
      ) : openSession ? (
        <span className="xt-worker-card-badge">En curso: {describeOpenSession(openSession)}</span>
      ) : null}
      <span className="xt-worker-name [font-family:var(--font-barlow-condensed)] text-2xl font-bold leading-tight break-words lg:text-3xl">
        {worker.full_name}
      </span>
      <span className="xt-worker-role mt-2 text-lg leading-snug opacity-90">{worker.role}</span>
    </button>
  );
}
