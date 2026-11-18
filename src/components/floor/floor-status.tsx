"use client";

import { useEffect, useState } from "react";
import type { FloorClientState } from "@/lib/floor/client";
import { FLOOR_COMMAND_LABELS, FLOOR_FLAG_LABELS } from "@/lib/floor/commands";

/** Datos más viejos que esto se avisan cuando no hay conexión. */
const STALE_AFTER_MS = 2 * 60_000;

/**
 * Aviso pequeño de conexión en la esquina. Nunca bloquea: el operario sigue
 * trabajando y el iPad envía todo cuando vuelve la señal.
 */
export function FloorStatus({ floor, onDismissIssues }: { floor: FloorClientState; onDismissIssues: () => void }) {
  const [now, setNow] = useState(() => Date.now());
  const [showIssues, setShowIssues] = useState(false);

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(interval);
  }, []);

  const pending = floor.pendingCount;
  const pendingLabel = `${pending} ${pending === 1 ? "registro" : "registros"}`;
  const staleMinutes =
    floor.snapshotReceivedAt !== null && now - floor.snapshotReceivedAt > STALE_AFTER_MS
      ? Math.round((now - floor.snapshotReceivedAt) / 60_000)
      : null;

  let tone: "warn" | "error" | "info" | null = null;
  let text = "";
  if (floor.storageError) {
    tone = "error";
    text = "No se pudo guardar en el iPad";
  } else if (floor.locked) {
    tone = "error";
    text = pending > 0 ? `Pon la clave de planta para enviar ${pendingLabel}` : "Pon la clave de planta";
  } else if (!floor.online) {
    tone = "warn";
    text = pending > 0 ? `Sin conexión · ${pendingLabel} guardados en el iPad` : "Sin conexión";
    if (staleMinutes !== null) text += ` · datos de hace ${staleMinutes} min`;
  } else if (pending > 0) {
    tone = "info";
    text = floor.syncing ? `Enviando ${pendingLabel}…` : `${pendingLabel} por enviar`;
  }

  const issueCount = floor.issues.length;

  return (
    <div className="xt-floor-status" aria-live="polite">
      {showIssues && issueCount > 0 ? (
        <div className="xt-floor-issues" role="dialog" aria-label="Registros para revisar">
          <p className="xt-floor-issues-title">Registros para revisar</p>
          <p className="xt-floor-issues-note">El administrador también los ve en Sincronización.</p>
          <ul className="xt-floor-issues-list">
            {floor.issues.map((issue) => (
              <li key={issue.id} className="xt-floor-issue">
                <span className="xt-floor-issue-head">
                  {FLOOR_COMMAND_LABELS[issue.type] ?? issue.type} ·{" "}
                  {new Date(issue.at).toLocaleString("es-CO", { dateStyle: "short", timeStyle: "short" })}
                </span>
                <span className="xt-floor-issue-body">
                  {issue.status === "rejected"
                    ? `No se guardó: ${issue.error ?? "error desconocido"}`
                    : issue.flags.map((flag) => FLOOR_FLAG_LABELS[flag] ?? flag).join(" ")}
                </span>
              </li>
            ))}
          </ul>
          <button
            type="button"
            className="xt-floor-issues-dismiss"
            onClick={() => {
              setShowIssues(false);
              onDismissIssues();
            }}
          >
            Entendido
          </button>
        </div>
      ) : null}

      <div className="xt-floor-status-row">
        {tone ? <span className={`xt-floor-pill xt-floor-pill-${tone}`}>{text}</span> : null}
        {issueCount > 0 ? (
          <button
            type="button"
            className="xt-floor-pill xt-floor-pill-error xt-floor-pill-button"
            onClick={() => setShowIssues((value) => !value)}
          >
            {issueCount} {issueCount === 1 ? "registro para revisar" : "registros para revisar"}
          </button>
        ) : null}
      </div>
    </div>
  );
}
