"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { startOtherSessionAction } from "@/app/planta/actions";
import { Button } from "@/components/ui/button";

const NOTE_MAX_LENGTH = 200;

/**
 * Header control for logging time against no specific machine (cleaning,
 * maintenance, meetings, etc). A required short note replaces the machine
 * pick. Iniciar cronómetro is disabled while the worker already has an open
 * session.
 */
export function OtherActivityPanel({ hasOpenSession, navButtonClass }: { hasOpenSession: boolean; navButtonClass: string }) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function close() {
    setIsOpen(false);
    setNote("");
    setError(null);
  }

  function handleSubmit() {
    const trimmed = note.trim();
    if (!trimmed) {
      setError("Escribe una nota para la actividad.");
      return;
    }

    startTransition(async () => {
      const result = await startOtherSessionAction({ note: trimmed });
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
        Otra actividad
      </Button>

      {isOpen ? (
        <div className="xt-other-activity-overlay" role="dialog" aria-modal="true" aria-label="Otra actividad">
          <div className="xt-other-activity-panel">
            <p className="xt-eyebrow">Otra actividad</p>
            <h2 className="xt-other-activity-title">¿Qué vas a hacer?</h2>
            <textarea
              className="xt-other-activity-textarea"
              value={note}
              maxLength={NOTE_MAX_LENGTH}
              rows={4}
              placeholder="Describe la actividad (obligatorio)"
              onChange={(event) => {
                setNote(event.target.value);
                setError(null);
              }}
              autoFocus
            />
            <p className="xt-other-activity-counter">
              {note.length}/{NOTE_MAX_LENGTH}
            </p>

            {hasOpenSession ? (
              <p className="xt-other-activity-hint">Termina o pausa lo que tienes en curso.</p>
            ) : null}
            {error ? <p className="xt-other-activity-error">{error}</p> : null}

            <div className="xt-other-activity-actions">
              <button type="button" className="xt-other-activity-cancel" onClick={close}>
                Cancelar
              </button>
              <button
                type="button"
                className="xt-other-activity-submit"
                disabled={hasOpenSession || isPending || note.trim().length === 0}
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
