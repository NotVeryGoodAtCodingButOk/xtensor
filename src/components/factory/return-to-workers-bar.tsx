"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Tras registrar algo, vuelve solo al selector de operario en 20 s (la tablet
 * es compartida). Todo es local: no depende de la red.
 */
export function ReturnToWorkersBar({ onTimeout, onContinue }: { onTimeout: () => void; onContinue: () => void }) {
  const [isVisible, setIsVisible] = useState(true);
  const onTimeoutRef = useRef(onTimeout);
  onTimeoutRef.current = onTimeout;

  useEffect(() => {
    const timeout = window.setTimeout(() => onTimeoutRef.current(), 20_000);
    return () => window.clearTimeout(timeout);
  }, []);

  if (!isVisible) {
    return null;
  }

  return (
    <div className="xt-return-bar fixed inset-x-5 bottom-5 z-20 border border-[var(--xt-black)] bg-[var(--xt-white)] p-4 text-[var(--xt-black)] shadow-lg">
      <div className="xt-return-progress mb-3 h-2 overflow-hidden bg-[var(--xt-cement)]">
        <div className="xt-return-progress-bar h-full origin-left animate-[xt-countdown_20s_linear_forwards] bg-[var(--xt-yellow)]" />
      </div>
      <div className="xt-return-body flex flex-wrap items-center justify-between gap-4">
        <span className="xt-return-message min-w-0 [font-family:var(--font-barlow-condensed)] text-xl font-bold leading-tight md:text-2xl">
          Registro guardado. Volveremos a seleccionar operario en 20 segundos.
        </span>
        <button
          type="button"
          className="xt-return-continue xt-return-continue-btn"
          onClick={() => {
            setIsVisible(false);
            onContinue();
          }}
        >
          Continuar registrando
        </button>
      </div>
    </div>
  );
}
