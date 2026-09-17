"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { finishSessionAction, pauseSessionAction } from "@/app/planta/actions";
import { formatElapsedTime, formatMachineList, isStartedBeforeToday, totalElapsedMs } from "@/lib/work-session-ui";
import type { OpenSessionView } from "@/services/work-sessions";

/**
 * Sticky bar shown on the machine list, detail and group pages whenever the
 * active worker has an open time-capture session. Lets them Terminar/Pausar
 * without hunting for the matching stage card.
 */
export function ActiveSessionBar({ session }: { session: OpenSessionView }) {
  const router = useRouter();
  const [now, setNow] = useState(() => Date.now());
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  const startedAt = new Date(session.startedAt);
  const elapsed = formatElapsedTime(totalElapsedMs(session.accumulatedMs, session.startedAt, now));
  const activityLabel =
    session.kind === "stage"
      ? (session.stageName ?? "Etapa")
      : session.activityTypes.map((type) => type.name).join(" + ") || session.note?.trim() || "Actividad";
  const machinesLabel =
    session.machines.length > 0 ? formatMachineList(session.machines.map((machine) => machine.serialNumber)) : null;
  const label = [activityLabel, machinesLabel, elapsed].filter(Boolean).join(" · ");
  const startedBeforeToday = isStartedBeforeToday(session.startedAt, new Date(now));

  async function runClose(action: (input: { sessionId: string }) => Promise<{ ok: boolean; error?: string }>) {
    setIsPending(true);
    setError(null);
    const result = await action({ sessionId: session.id });
    setIsPending(false);
    if (!result.ok) {
      setError(result.error ?? "No se pudo completar la acción.");
      return;
    }
    router.refresh();
  }

  return (
    <div className="xt-active-bar">
      <div className="xt-active-bar-row">
        <p className="xt-active-bar-text">
          <span className="xt-eyebrow xt-eyebrow-light">En curso</span> · {label}
        </p>
        <div className="xt-active-bar-actions">
          {session.kind === "stage" ? (
            <button
              type="button"
              className="xt-active-bar-btn xt-active-bar-btn-pause"
              disabled={isPending}
              onClick={() => runClose(pauseSessionAction)}
            >
              Pausar
            </button>
          ) : null}
          <button
            type="button"
            className="xt-active-bar-btn xt-active-bar-btn-finish"
            disabled={isPending}
            onClick={() => runClose(finishSessionAction)}
          >
            Terminar
          </button>
        </div>
      </div>
      {startedBeforeToday ? (
        <p className="xt-active-bar-warning">
          Iniciada {startedAt.toLocaleDateString("es-CO")} — ¿sigue en curso?
        </p>
      ) : null}
      {error ? <p className="xt-active-bar-error">{error}</p> : null}
    </div>
  );
}
