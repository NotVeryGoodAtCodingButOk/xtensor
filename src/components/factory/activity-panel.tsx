"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { startOtherSessionAction } from "@/app/planta/actions";
import { Button } from "@/components/ui/button";
import type { ActivityTypeView } from "@/services/activity-types";

export type ActivityPanelMachine = {
  id: string;
  serialNumber: number;
  equipmentName: string;
  clientName: string;
};

/**
 * Header control for logging time against something other than a production
 * stage: aseo, orden, mejoras planta, arreglos, instalaciones. The worker
 * picks one or several activities from the catálogo — the time is split
 * equally among them — and, when the activity allows it, the machines it was
 * done on. Iniciar cronómetro is disabled while they already have a session
 * open.
 */
export function ActivityPanel({
  activityTypes,
  machines,
  hasOpenSession,
  navButtonClass,
}: {
  activityTypes: ActivityTypeView[];
  machines: ActivityPanelMachine[];
  hasOpenSession: boolean;
  navButtonClass: string;
}) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [selectedTypeIds, setSelectedTypeIds] = useState<string[]>([]);
  const [selectedMachineIds, setSelectedMachineIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const allowsMachine = useMemo(
    () => activityTypes.some((type) => selectedTypeIds.includes(type.id) && type.allowsMachine),
    [activityTypes, selectedTypeIds],
  );

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

    startTransition(async () => {
      const result = await startOtherSessionAction({
        activityTypeIds: selectedTypeIds,
        machineIds: allowsMachine ? selectedMachineIds : [],
      });
      if (!result.ok) {
        setError(result.error ?? "No se pudo iniciar la actividad.");
        return;
      }
      close();
      router.refresh();
    });
  }

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className={`xt-planta-nav-button ${navButtonClass}`}
        onClick={() => setIsOpen(true)}
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
                        <span className="xt-activity-option-name">{type.name}</span>
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
                  <p className="xt-activity-note">No hay máquinas en producción.</p>
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
                              #{machine.serialNumber} · {machine.equipmentName} · {machine.clientName}
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
                disabled={hasOpenSession || isPending || selectedTypeIds.length === 0}
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
