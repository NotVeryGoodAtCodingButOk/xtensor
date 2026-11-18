"use client";

import { useMemo, useState } from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { DispatchResult } from "@/lib/floor/client";
import type { FloorIntent } from "@/lib/floor/commands";
import type { FloorActivityMachine, FloorActivityMachineStatus, FloorActivityType } from "@/lib/floor/types";

/** Etiqueta del estado en el selector: carga, instalación y garantías van sobre máquinas ya terminadas o despachadas. */
const MACHINE_STATUS_LABEL: Record<FloorActivityMachineStatus, string> = {
  in_production: "En producción",
  finished: "Terminada",
  shipped: "Despachada",
};

/**
 * Header control for logging time against something other than a production
 * stage: 5S, empaque/carga/instalación, arreglos de máquinas. The worker
 * picks one or several activities from the catálogo — the time is split
 * equally among them — and, when the activity allows it, the machines it was
 * done on. Iniciar cronómetro is disabled while they already have a session
 * open.
 */
export function ActivityPanel({
  workerId,
  activityTypes,
  machines,
  hasOpenSession,
  navButtonClass,
  dispatch,
  onStarted,
}: {
  workerId: string;
  activityTypes: FloorActivityType[];
  /** En producción, terminadas y despachadas recientes (vienen en el snapshot: sirven sin red). */
  machines: FloorActivityMachine[];
  hasOpenSession: boolean;
  navButtonClass: string;
  dispatch: (intent: FloorIntent) => DispatchResult;
  onStarted?: () => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedTypeIds, setSelectedTypeIds] = useState<string[]>([]);
  const [selectedMachineIds, setSelectedMachineIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const allowsMachine = useMemo(
    () => activityTypes.some((type) => selectedTypeIds.includes(type.id) && type.allowsMachine),
    [activityTypes, selectedTypeIds],
  );

  function open() {
    setIsOpen(true);
  }

  function close() {
    setIsOpen(false);
    setSelectedTypeIds([]);
    setSelectedMachineIds([]);
    setError(null);
  }

  function toggleType(id: string) {
    setError(null);
    setSelectedTypeIds((current) => {
      const next = current.includes(id) ? current.filter((existing) => existing !== id) : [...current, id];
      // Sin una actividad que lo permita, las máquinas escogidas ya no aplican.
      if (!activityTypes.some((type) => next.includes(type.id) && type.allowsMachine)) {
        setSelectedMachineIds([]);
      }
      return next;
    });
  }

  function toggleMachine(id: string) {
    setSelectedMachineIds((current) =>
      current.includes(id) ? current.filter((existing) => existing !== id) : [...current, id],
    );
  }

  function handleSubmit() {
    if (selectedTypeIds.length === 0) {
      setError("Selecciona al menos una actividad.");
      return;
    }

    const result = dispatch({
      type: "session.start_other",
      payload: {
        workerId,
        sessionId: crypto.randomUUID(),
        activityId: crypto.randomUUID(),
        activityTypeIds: selectedTypeIds,
        machineIds: allowsMachine ? selectedMachineIds : [],
      },
    });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    close();
    onStarted?.();
  }

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className={`xt-planta-nav-button ${navButtonClass}`}
        onClick={open}
      >
        Actividades
      </Button>

      {isOpen ? (
        <div className="xt-activity-overlay" role="dialog" aria-modal="true" aria-label="Actividades">
          <div className="xt-activity-panel">
            <p className="xt-eyebrow">Actividades</p>
            <h2 className="xt-activity-title">¿Qué vas a hacer?</h2>

            {activityTypes.length === 0 ? (
              <p className="xt-activity-empty">
                No hay actividades configuradas. Pídele al administrador que las cree en Configuración.
              </p>
            ) : (
              <ul className="xt-activity-options">
                {activityTypes.map((type) => {
                  const isSelected = selectedTypeIds.includes(type.id);
                  return (
                    <li key={type.id}>
                      <button
                        type="button"
                        className={`xt-activity-option ${isSelected ? "xt-activity-option-selected" : ""}`}
                        aria-pressed={isSelected}
                        onClick={() => toggleType(type.id)}
                      >
                        <span className="xt-activity-option-check" aria-hidden="true">
                          {isSelected ? <Check className="h-4 w-4" /> : null}
                        </span>
                        <span className="xt-activity-option-text">
                          <span className="xt-activity-option-name">{type.name}</span>
                          {type.description ? (
                            <span className="xt-activity-option-description">{type.description}</span>
                          ) : null}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}

            {selectedTypeIds.length > 1 ? (
              <p className="xt-activity-note">El tiempo se reparte por igual entre las actividades marcadas.</p>
            ) : null}

            {allowsMachine ? (
              <div className="xt-activity-machines">
                <p className="xt-eyebrow">Máquina (opcional)</p>
                {machines.length === 0 ? (
                  <p className="xt-activity-note">No hay máquinas en producción, terminadas ni despachadas.</p>
                ) : (
                  <ul className="xt-activity-machine-list">
                    {machines.map((machine) => {
                      const isSelected = selectedMachineIds.includes(machine.id);
                      return (
                        <li key={machine.id}>
                          <button
                            type="button"
                            className={`xt-activity-option ${isSelected ? "xt-activity-option-selected" : ""}`}
                            aria-pressed={isSelected}
                            onClick={() => toggleMachine(machine.id)}
                          >
                            <span className="xt-activity-option-check" aria-hidden="true">
                              {isSelected ? <Check className="h-4 w-4" /> : null}
                            </span>
                            <span className="xt-activity-option-name">
                              #{machine.serial} · {machine.name} · {machine.client}
                            </span>
                            <span className={`xt-activity-machine-status xt-activity-machine-status-${machine.status}`}>
                              {MACHINE_STATUS_LABEL[machine.status]}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            ) : null}

            {hasOpenSession ? <p className="xt-activity-error">Termina o pausa lo que tienes en curso.</p> : null}
            {error ? <p className="xt-activity-error">{error}</p> : null}

            <div className="xt-activity-actions">
              <button type="button" className="xt-activity-cancel" onClick={close}>
                Cancelar
              </button>
              <button
                type="button"
                className="xt-activity-submit"
                disabled={hasOpenSession || selectedTypeIds.length === 0}
                onClick={handleSubmit}
              >
                Iniciar cronómetro
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
