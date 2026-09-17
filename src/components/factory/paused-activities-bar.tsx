"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { resumeActivityAction } from "@/app/planta/actions";
import { formatElapsedTime, formatMachineList } from "@/lib/work-session-ui";
import type { PausedActivityView } from "@/services/work-sessions";

/**
 * Strip on the machine list showing what the active worker left paused, so a
 * cronómetro paused yesterday is picked up again without hunting for the
 * machine. On the detail and group pages the stage card carries Reanudar
 * itself, so this bar is not rendered there.
 */
export function PausedActivitiesBar({
  activities,
  hasOpenSession,
}: {
  activities: PausedActivityView[];
  hasOpenSession: boolean;
}) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (activities.length === 0) {
    return null;
  }

  async function resume(activityId: string) {
    setPendingId(activityId);
    setError(null);
    const result = await resumeActivityAction({ activityId });
    setPendingId(null);
    if (!result.ok) {
      setError(result.error ?? "No se pudo reanudar la actividad.");
      return;
    }
    router.refresh();
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
            disabled={hasOpenSession || pendingId === activity.activityId}
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
