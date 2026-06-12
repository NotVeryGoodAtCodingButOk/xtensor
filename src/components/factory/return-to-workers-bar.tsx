"use client";

import { useEffect, useState } from "react";

export function ReturnToWorkersBar({
  continueHref,
  onContinue,
}: {
  continueHref: string;
  /** When provided, "Continuar registrando" dismisses the bar in place
   *  instead of reloading the page — keeps the factory tablet snappy. */
  onContinue?: () => void;
}) {
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      window.location.assign("/planta/operarios");
    }, 20_000);

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
            if (onContinue) {
              onContinue();
              return;
            }
            window.location.assign(continueHref);
          }}
        >
          Continuar registrando
        </button>
      </div>
    </div>
  );
}
