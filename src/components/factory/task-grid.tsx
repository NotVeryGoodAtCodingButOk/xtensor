"use client";

import type { MouseEvent } from "react";
import { useEffect, useState } from "react";
import { ReturnToWorkersBar } from "@/components/factory/return-to-workers-bar";
import { QueryToast } from "@/components/ui/query-toast";
import type { DispatchResult } from "@/lib/floor/client";
import type { FloorIntent } from "@/lib/floor/commands";
import type { FloorSessionView } from "@/lib/floor/views";
import { deriveStageCardState, formatElapsedTime, sameMachineSet, totalElapsedMs } from "@/lib/work-session-ui";

export type TaskStage = {
  id: number;
  name: string;
  completion: number;
};

export type TaskGridMachine = {
  id: string;
  serialNumber: number;
  stages: TaskStage[];
};

/** A paused activity of the active worker, narrowed to what a card needs. */
export type TaskGridPausedActivity = {
  activityId: string;
  stageId: number;
  machineIds: string[];
  accumulatedMs: number;
};

type ToastState = { message: string; description?: string | null } | null;

/**
 * Renders one card per stage across one or several machines (group mode).
 * `machines.length` determines which per-card affordances apply (Reproceso and
 * "Marcar hecha sin tiempo" are single-machine-only).
 *
 * Cada acción se guarda en el iPad al instante (funciona sin red) y se envía
 * sola cuando hay conexión: ya no hay estados "cargando" ni esperas.
 */
export function TaskGrid({
  workerId,
  machines,
  openSession,
  othersWorking,
  pausedActivities = [],
  dispatch,
  onReturnToWorkers,
}: {
  workerId: string;
  machines: TaskGridMachine[];
  openSession: FloorSessionView | null;
  /** Otros operarios con cronómetro corriendo, por etapa. */
  othersWorking?: Map<number, string[]>;
  pausedActivities?: TaskGridPausedActivity[];
  dispatch: (intent: FloorIntent) => DispatchResult;
  onReturnToWorkers: () => void;
}) {
  const [showReturnBar, setShowReturnBar] = useState(false);
  const [toast, setToast] = useState<ToastState>(null);
  const [toastKey, setToastKey] = useState(0);

  const machineIds = machines.map((machine) => machine.id);
  const isGroup = machines.length > 1;
  const stageDefinitions = machines[0]?.stages ?? [];

  const cards = stageDefinitions
    .map((stageDef) => {
      const completions = machines.map(
        (machine) => machine.stages.find((stage) => stage.id === stageDef.id)?.completion ?? 0,
      );
      const state = deriveStageCardState(completions);
      const isCurrentSession =
        openSession?.kind === "stage" &&
        openSession.stageId === stageDef.id &&
        sameMachineSet(openSession.machines.map((machine) => machine.id), machineIds);
      const paused =
        pausedActivities.find(
          (activity) => activity.stageId === stageDef.id && sameMachineSet(activity.machineIds, machineIds),
        ) ?? null;

      return { stageId: stageDef.id, name: stageDef.name, state, isCurrentSession, paused };
    })
    .sort((a, b) => {
      if (a.isCurrentSession !== b.isCurrentSession) return a.isCurrentSession ? -1 : 1;
      if (Boolean(a.paused) !== Boolean(b.paused)) return a.paused ? -1 : 1;
      if (a.state.allDone !== b.state.allDone) return a.state.allDone ? 1 : -1;
      return a.stageId - b.stageId;
    });

  function notify(message: string, description?: string | null) {
    setToast({ message, description });
    setToastKey((key) => key + 1);
  }

  /** Aplica la acción; si no se puede, lo dice. Devuelve el resultado para avisos extra. */
  function run(intent: FloorIntent, options: { returnBar?: boolean } = {}) {
    const result = dispatch(intent);
    if (!result.ok) {
      notify(result.error);
      return null;
    }
    if (options.returnBar !== false && !result.effects.noop) setShowReturnBar(true);
    notifyFinishedMachines(result.effects.finishedMachineIds.length);
    return result;
  }

  function handleStart(stageId: number) {
    run({
      type: "session.start_stage",
      payload: { workerId, sessionId: crypto.randomUUID(), activityId: crypto.randomUUID(), stageId, machineIds },
    });
  }

  function handleFinish() {
    if (!openSession) return;
    run({ type: "session.finish", payload: { workerId, sessionId: openSession.id } });
  }

  function handlePause() {
    if (!openSession) return;
    run({ type: "session.pause", payload: { workerId, sessionId: openSession.id } });
  }

  function handleResume(activityId: string) {
    run({ type: "session.resume", payload: { workerId, sessionId: crypto.randomUUID(), activityId } });
  }

  function handleFinishPaused(activityId: string) {
    run({ type: "activity.finish_paused", payload: { workerId, activityId } });
  }

  function notifyFinishedMachines(count: number) {
    if (count === 1) {
      notify("Máquina terminada", "Todas las etapas quedaron hechas.");
    } else if (count > 1) {
      notify(`${count} máquinas terminadas`, "Todas las etapas quedaron hechas.");
    }
  }

  function handleReprocess(stageId: number, machineId: string, event: MouseEvent) {
    event.stopPropagation();
    const result = run({ type: "stage.set", payload: { workerId, machineId, stageId, completion: 0 } });
    if (result?.effects.revert === "undo") {
      notify("Corrección: la etapa volvió a pendiente (sin reproceso)");
    } else if (result?.effects.revert === "reprocess") {
      notify("Reproceso registrado");
    }
  }

  function handleMarkDone(stageId: number, machineId: string, event: MouseEvent) {
    event.stopPropagation();
    run({ type: "stage.set", payload: { workerId, machineId, stageId, completion: 100 } });
  }

  return (
    <>
      <div className="xt-task-grid grid gap-4 px-5 2xl:grid-cols-2">
        {cards.map((card) => {
          const hasOtherOpenSession = Boolean(openSession) && !card.isCurrentSession;

          // A stage the worker paused, unless it is already running again or
          // someone closed it in the meantime.
          const paused = card.isCurrentSession || card.state.allDone ? null : card.paused;

          return (
            <div
              key={card.stageId}
              className={`xt-task-card ${card.state.allDone ? "xt-task-card-done" : ""} ${
                card.isCurrentSession ? "xt-task-card-active" : ""
              } ${paused ? "xt-task-card-paused" : ""}`}
            >
              <div className="xt-task-card-body">
                <div className="xt-task-card-heading">
                  <p className="xt-eyebrow">
                    {card.isCurrentSession
                      ? "En curso"
                      : paused
                        ? "Pausada"
                        : card.state.allDone
                          ? isGroup
                            ? "Hecha en todas"
                            : "Hecha"
                          : isGroup
                            ? `Hecha en ${card.state.doneCount} de ${card.state.total}`
                            : "Pendiente"}
                  </p>
                  <h2 className="xt-task-title [font-family:var(--font-barlow-condensed)] text-5xl font-bold leading-none break-words">
                    {card.name}
                  </h2>
                  {card.isCurrentSession && openSession ? (
                    <CardTimer startedAt={openSession.startedAt} accumulatedMs={openSession.accumulatedMs} />
                  ) : null}
                  {paused ? <p className="xt-task-card-timer">{formatElapsedTime(paused.accumulatedMs)}</p> : null}
                  {!card.state.allDone && othersWorking?.get(card.stageId) ? (
                    <p className="xt-task-card-hint">
                      También trabajando: {othersWorking.get(card.stageId)?.join(", ")}
                      {card.isCurrentSession ? ". La etapa se cierra cuando termine el último." : ""}
                    </p>
                  ) : null}
                </div>

                {paused ? (
                  <div className="xt-task-card-actions xt-task-card-actions-column">
                    <div className="xt-task-card-actions">
                      <button
                        type="button"
                        className="xt-task-card-btn xt-task-card-btn-start"
                        disabled={hasOtherOpenSession}
                        onClick={() => handleResume(paused.activityId)}
                      >
                        Reanudar
                      </button>
                      <button
                        type="button"
                        className="xt-task-card-btn"
                        onClick={() => handleFinishPaused(paused.activityId)}
                      >
                        Terminar
                      </button>
                    </div>
                    {hasOtherOpenSession ? (
                      <p className="xt-task-card-hint">Termina o pausa lo que tienes en curso</p>
                    ) : null}
                  </div>
                ) : card.isCurrentSession ? (
                  <div className="xt-task-card-actions">
                    <button
                      type="button"
                      className="xt-task-card-btn xt-task-card-btn-pause"
                      onClick={handlePause}
                    >
                      Pausar
                    </button>
                    <button
                      type="button"
                      className="xt-task-card-btn xt-task-card-btn-finish"
                      onClick={handleFinish}
                    >
                      Terminar
                    </button>
                  </div>
                ) : card.state.allDone ? (
                  !isGroup ? (
                    <button
                      type="button"
                      className="xt-task-action"
                      onClick={(event) => handleReprocess(card.stageId, machines[0].id, event)}
                    >
                      Reproceso
                    </button>
                  ) : null
                ) : (
                  <div className="xt-task-card-actions xt-task-card-actions-column">
                    <button
                      type="button"
                      className="xt-task-card-btn xt-task-card-btn-start"
                      disabled={hasOtherOpenSession}
                      onClick={() => handleStart(card.stageId)}
                    >
                      Iniciar cronómetro
                    </button>
                    {hasOtherOpenSession ? (
                      <p className="xt-task-card-hint">Termina o pausa lo que tienes en curso</p>
                    ) : null}
                    {!isGroup ? (
                      <button
                        type="button"
                        className="xt-task-card-mark-done"
                        onClick={(event) => handleMarkDone(card.stageId, machines[0].id, event)}
                      >
                        Marcar hecha sin tiempo
                      </button>
                    ) : null}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <QueryToast key={toastKey} message={toast?.message ?? null} description={toast?.description ?? null} />

      {showReturnBar ? (
        <ReturnToWorkersBar onTimeout={onReturnToWorkers} onContinue={() => setShowReturnBar(false)} />
      ) : null}
    </>
  );
}

/**
 * Live HH:MM:SS ticker for the card matching the worker's open session. Counts
 * from the time already logged before the last pause, so reanudar picks up
 * where the cronómetro left off instead of restarting at zero.
 */
function CardTimer({ startedAt, accumulatedMs }: { startedAt: string; accumulatedMs: number }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  return <p className="xt-task-card-timer">{formatElapsedTime(totalElapsedMs(accumulatedMs, startedAt, now))}</p>;
}
