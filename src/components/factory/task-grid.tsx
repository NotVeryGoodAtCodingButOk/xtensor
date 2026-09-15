"use client";

import type { MouseEvent } from "react";
import { useEffect, useOptimistic, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  finishSessionAction,
  logStageAction,
  pauseSessionAction,
  startStageSessionAction,
} from "@/app/planta/actions";
import { ReturnToWorkersBar } from "@/components/factory/return-to-workers-bar";
import { QueryToast } from "@/components/ui/query-toast";
import { deriveStageCardState, formatElapsedTime, sameMachineSet } from "@/lib/work-session-ui";
import type { OpenSessionView } from "@/services/work-sessions";

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

type ToastState = { message: string; description?: string | null } | null;

type CompletionUpdate = { machineId: string; stageId: number; completion: number };

/**
 * Renders one card per stage across one or several machines (group mode).
 * Used by both the single-machine detail page and the multi-machine group
 * page — `machines.length` determines which per-card affordances apply
 * (Reproceso and "Marcar hecha sin tiempo" are single-machine-only).
 */
export function TaskGrid({
  machines,
  openSession,
  continueHref,
}: {
  machines: TaskGridMachine[];
  openSession: OpenSessionView | null;
  continueHref: string;
}) {
  const router = useRouter();
  const [optimisticMachines, applyOptimisticCompletion] = useOptimistic(
    machines,
    (current: TaskGridMachine[], update: CompletionUpdate) =>
      current.map((machine) =>
        machine.id === update.machineId
          ? {
              ...machine,
              stages: machine.stages.map((stage) =>
                stage.id === update.stageId ? { ...stage, completion: update.completion } : stage,
              ),
            }
          : machine,
      ),
  );
  const [, startTransition] = useTransition();
  const [pendingStageId, setPendingStageId] = useState<number | null>(null);
  const [showReturnBar, setShowReturnBar] = useState(false);
  const [toast, setToast] = useState<ToastState>(null);
  const [toastKey, setToastKey] = useState(0);

  const machineIds = optimisticMachines.map((machine) => machine.id);
  const isGroup = optimisticMachines.length > 1;
  const stageDefinitions = optimisticMachines[0]?.stages ?? [];

  const cards = stageDefinitions
    .map((stageDef) => {
      const completions = optimisticMachines.map(
        (machine) => machine.stages.find((stage) => stage.id === stageDef.id)?.completion ?? 0,
      );
      const state = deriveStageCardState(completions);
      const isCurrentSession =
        openSession?.kind === "stage" &&
        openSession.stageId === stageDef.id &&
        sameMachineSet(openSession.machines.map((machine) => machine.id), machineIds);

      return { stageId: stageDef.id, name: stageDef.name, state, isCurrentSession };
    })
    .sort((a, b) => {
      if (a.isCurrentSession !== b.isCurrentSession) return a.isCurrentSession ? -1 : 1;
      if (a.state.allDone !== b.state.allDone) return a.state.allDone ? 1 : -1;
      return a.stageId - b.stageId;
    });

  function notify(message: string, description?: string | null) {
    setToast({ message, description });
    setToastKey((key) => key + 1);
  }

  function handleStart(stageId: number) {
    setPendingStageId(stageId);
    startTransition(async () => {
      const result = await startStageSessionAction({ machineIds, stageId });
      setPendingStageId(null);
      if (!result.ok) {
        notify(result.error ?? "No se pudo iniciar la actividad.");
        return;
      }
      setShowReturnBar(true);
      router.refresh();
    });
  }

  function handleFinish(stageId: number) {
    if (!openSession) return;
    setPendingStageId(stageId);
    startTransition(async () => {
      const result = await finishSessionAction({ sessionId: openSession.id });
      setPendingStageId(null);
      if (!result.ok) {
        notify(result.error ?? "No se pudo terminar la actividad.");
        return;
      }
      setShowReturnBar(true);
      const finishedCount = result.finishedMachineIds?.length ?? 0;
      if (finishedCount === 1) {
        notify("Máquina terminada", "Todas las etapas quedaron hechas.");
      } else if (finishedCount > 1) {
        notify(`${finishedCount} máquinas terminadas`, "Todas las etapas quedaron hechas.");
      }
      router.refresh();
    });
  }

  function handlePause(stageId: number) {
    if (!openSession) return;
    setPendingStageId(stageId);
    startTransition(async () => {
      const result = await pauseSessionAction({ sessionId: openSession.id });
      setPendingStageId(null);
      if (!result.ok) {
        notify(result.error ?? "No se pudo pausar la actividad.");
        return;
      }
      setShowReturnBar(true);
      router.refresh();
    });
  }

  function handleReprocess(stageId: number, machineId: string, event: MouseEvent) {
    event.stopPropagation();
    setPendingStageId(stageId);
    startTransition(async () => {
      applyOptimisticCompletion({ machineId, stageId, completion: 0 });
      const result = await logStageAction({ machineId, stageId, completion: 0 });
      setPendingStageId(null);
      if (!result.ok) {
        return;
      }
      if (result.logged) {
        setShowReturnBar(true);
      }
      if (result.revert === "undo") {
        notify("Corrección: la etapa volvió a pendiente (sin reproceso)");
      } else if (result.revert === "reprocess") {
        notify("Reproceso registrado");
      }
      router.refresh();
    });
  }

  function handleMarkDone(stageId: number, machineId: string, event: MouseEvent) {
    event.stopPropagation();
    setPendingStageId(stageId);
    startTransition(async () => {
      applyOptimisticCompletion({ machineId, stageId, completion: 100 });
      const result = await logStageAction({ machineId, stageId, completion: 100 });
      setPendingStageId(null);
      if (!result.ok) {
        return;
      }
      if (result.logged) {
        setShowReturnBar(true);
      }
      if (result.finished) {
        notify("Máquina terminada", "Todas las etapas quedaron hechas.");
      }
      router.refresh();
    });
  }

  return (
    <>
      <div className="xt-task-grid grid gap-4 px-5 2xl:grid-cols-2">
        {cards.map((card) => {
          const cardIsPending = pendingStageId === card.stageId;
          const hasOtherOpenSession = Boolean(openSession) && !card.isCurrentSession;

          return (
            <div
              key={card.stageId}
              className={`xt-task-card ${card.state.allDone ? "xt-task-card-done" : ""} ${
                card.isCurrentSession ? "xt-task-card-active" : ""
              }`}
            >
              <div className="xt-task-card-body">
                <div className="xt-task-card-heading">
                  <p className="xt-eyebrow">
                    {card.isCurrentSession
                      ? "En curso"
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
                  {card.isCurrentSession && openSession ? <CardTimer startedAt={openSession.startedAt} /> : null}
                </div>

                {card.isCurrentSession ? (
                  <div className="xt-task-card-actions">
                    <button
                      type="button"
                      className="xt-task-card-btn xt-task-card-btn-pause"
                      disabled={cardIsPending}
                      onClick={() => handlePause(card.stageId)}
                    >
                      Pausar
                    </button>
                    <button
                      type="button"
                      className="xt-task-card-btn xt-task-card-btn-finish"
                      disabled={cardIsPending}
                      onClick={() => handleFinish(card.stageId)}
                    >
                      Terminar
                    </button>
                  </div>
                ) : card.state.allDone ? (
                  !isGroup ? (
                    <button
                      type="button"
                      className="xt-task-action"
                      disabled={cardIsPending}
                      onClick={(event) => handleReprocess(card.stageId, optimisticMachines[0].id, event)}
                    >
                      Reproceso
                    </button>
                  ) : null
                ) : (
                  <div className="xt-task-card-actions xt-task-card-actions-column">
                    <button
                      type="button"
                      className="xt-task-card-btn xt-task-card-btn-start"
                      disabled={cardIsPending || hasOtherOpenSession}
                      onClick={() => handleStart(card.stageId)}
                    >
                      Iniciar
                    </button>
                    {hasOtherOpenSession ? (
                      <p className="xt-task-card-hint">Termina o pausa lo que tienes en curso</p>
                    ) : null}
                    {!isGroup ? (
                      <button
                        type="button"
                        className="xt-task-card-mark-done"
                        disabled={cardIsPending}
                        onClick={(event) => handleMarkDone(card.stageId, optimisticMachines[0].id, event)}
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
        <ReturnToWorkersBar continueHref={continueHref} onContinue={() => setShowReturnBar(false)} />
      ) : null}
    </>
  );
}

/** Live HH:MM:SS ticker for the card matching the worker's open session. */
function CardTimer({ startedAt }: { startedAt: string }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  return <p className="xt-task-card-timer">{formatElapsedTime(now - new Date(startedAt).getTime())}</p>;
}
