"use client";

import { useOptimistic, useState, useTransition } from "react";
import { logStageAction } from "@/app/planta/actions";
import { ReturnToWorkersBar } from "@/components/factory/return-to-workers-bar";
import { QueryToast } from "@/components/ui/query-toast";

export type TaskStage = {
  id: number;
  name: string;
  completion: number;
};

function sortStagesForWorkers(a: TaskStage, b: TaskStage) {
  const aDone = a.completion === 100;
  const bDone = b.completion === 100;

  if (aDone !== bDone) {
    return aDone ? 1 : -1;
  }

  return a.id - b.id;
}

export function TaskGrid({
  machineId,
  continueHref,
  stages,
}: {
  machineId: string;
  continueHref: string;
  stages: TaskStage[];
}) {
  const [optimisticStages, applyOptimistic] = useOptimistic(
    stages,
    (current: TaskStage[], stageId: number) =>
      current.map((stage) =>
        stage.id === stageId
          ? { ...stage, completion: stage.completion === 100 ? 0 : 100 }
          : stage,
      ),
  );
  const [, startTransition] = useTransition();
  const [showReturnBar, setShowReturnBar] = useState(false);
  // Bumped on each completed machine so the toast re-shows on repeat finishes.
  const [finishedKey, setFinishedKey] = useState(0);

  const ordered = [...optimisticStages].sort(sortStagesForWorkers);

  function handleToggle(stage: TaskStage) {
    const completion = stage.completion === 100 ? 0 : 100;
    startTransition(async () => {
      // Flip the card instantly; the transition keeps it until the server confirms.
      applyOptimistic(stage.id);
      const result = await logStageAction({ machineId, stageId: stage.id, completion });
      if (!result?.ok) {
        return;
      }
      if (result.logged) {
        setShowReturnBar(true);
      }
      if (result.finished) {
        setFinishedKey((key) => key + 1);
      }
    });
  }

  return (
    <>
      <div className="xt-task-grid grid gap-4 px-5 2xl:grid-cols-2">
        {ordered.map((stage) => {
          const isDone = stage.completion === 100;

          return (
            <button
              key={stage.id}
              type="button"
              onClick={() => handleToggle(stage)}
              className={`xt-task-card ${isDone ? "xt-task-card-done" : ""}`}
            >
              <div className="xt-task-card-body">
                <div className="xt-task-card-heading">
                  <p className="xt-eyebrow">{isDone ? "Hecha" : "Pendiente"}</p>
                  <h2 className="xt-task-title [font-family:var(--font-barlow-condensed)] text-5xl font-bold leading-none break-words">
                    {stage.name}
                  </h2>
                </div>
                <div className="xt-task-action">{isDone ? "Reproceso" : "Marcar como hecha"}</div>
              </div>
            </button>
          );
        })}
      </div>

      <QueryToast
        key={finishedKey}
        message={finishedKey > 0 ? "Máquina terminada" : null}
        description={finishedKey > 0 ? "Todas las etapas quedaron hechas." : null}
      />

      {showReturnBar ? (
        <ReturnToWorkersBar
          continueHref={continueHref}
          onContinue={() => setShowReturnBar(false)}
        />
      ) : null}
    </>
  );
}
