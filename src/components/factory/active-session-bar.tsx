"use client";

import { useEffect, useState } from "react";
import type { DispatchResult } from "@/lib/floor/client";
import type { FloorIntent } from "@/lib/floor/commands";
import type { FloorSessionView } from "@/lib/floor/views";
import { formatElapsedTime, formatMachineList, isStartedBeforeToday, totalElapsedMs } from "@/lib/work-session-ui";

/**
 * Sticky bar shown on the machine list, detail and group views whenever the
 * active worker has an open time-capture session. Lets them Terminar/Pausar
 * without hunting for the matching stage card. Funciona sin red.
 */
export function ActiveSessionBar({
  workerId,
  session,
  dispatch,
  onDone,
}: {
  workerId: string;
  session: FloorSessionView;
  dispatch: (intent: FloorIntent) => DispatchResult;
  /** Después de pausar o terminar (para mostrar la barra de volver a operarios). */
  onDone?: (result: Extract<DispatchResult, { ok: true }>) => void;
}) {
  const [now, setNow] = useState(() => Date.now());
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

  function close(type: "session.pause" | "session.finish") {
    setError(null);
    const result = dispatch({ type, payload: { workerId, sessionId: session.id } });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onDone?.(result);
  }

  return (
    <div className="xt-active-bar">
      <div className="xt-active-bar-row">
        <p className="xt-active-bar-text">
          <span className="xt-eyebrow xt-eyebrow-light">En curso</span> · {label}
        </p>
        <div className="xt-active-bar-actions">
          {session.kind === "stage" ? (
            <button type="button" className="xt-active-bar-btn xt-active-bar-btn-pause" onClick={() => close("session.pause")}>
              Pausar
            </button>
          ) : null}
          <button type="button" className="xt-active-bar-btn xt-active-bar-btn-finish" onClick={() => close("session.finish")}>
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
