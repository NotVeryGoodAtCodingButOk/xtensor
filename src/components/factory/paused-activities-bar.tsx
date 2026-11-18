"use client";

import { useState } from "react";
import type { DispatchResult } from "@/lib/floor/client";
import type { FloorIntent } from "@/lib/floor/commands";
import type { FloorPausedView } from "@/lib/floor/views";
import { formatElapsedTime, formatMachineList } from "@/lib/work-session-ui";

/**
 * Strip on the machine list showing what the active worker left paused, so a
 * cronómetro paused yesterday is picked up again without hunting for the
 * machine. On the detail and group views the stage card carries Reanudar
 * itself, so this bar is not rendered there.
 */
export function PausedActivitiesBar({
  workerId,
  activities,
  hasOpenSession,
  dispatch,
}: {
  workerId: string;
  activities: FloorPausedView[];
  hasOpenSession: boolean;
  dispatch: (intent: FloorIntent) => DispatchResult;
}) {
  const [error, setError] = useState<string | null>(null);

  if (activities.length === 0) {
    return null;
  }

  function resume(activityId: string) {
    setError(null);
    const result = dispatch({
      type: "session.resume",
      payload: { workerId, sessionId: crypto.randomUUID(), activityId },
    });
    if (!result.ok) setError(result.error);
  }

  return (
    <div className="xt-paused-bar">
      {activities.map((activity) => (
        <div key={activity.activityId} className="xt-paused-bar-row">
          <p className="xt-paused-bar-text">
            <span className="xt-eyebrow">Pausada</span> · {activity.stageName ?? "Etapa"} ·{" "}
            {formatMachineList(activity.machines.map((machine) => machine.serialNumber))} ·{" "}
            {formatElapsedTime(activity.accumulatedMs)}
          </p>
          <button
            type="button"
            className="xt-paused-bar-btn"
            disabled={hasOpenSession}
            onClick={() => resume(activity.activityId)}
          >
            Reanudar
          </button>
        </div>
      ))}
      {hasOpenSession ? (
        <p className="xt-paused-bar-hint">Termina o pausa lo que tienes en curso para reanudar.</p>
      ) : null}
      {error ? <p className="xt-paused-bar-error">{error}</p> : null}
    </div>
  );
}
