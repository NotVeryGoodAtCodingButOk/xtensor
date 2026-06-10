"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function ReturnToWorkersBar({ continueHref }: { continueHref: string }) {
  const router = useRouter();
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      router.push("/planta/operarios");
    }, 20_000);

    return () => window.clearTimeout(timeout);
  }, [router]);

  if (!isVisible) {
    return null;
  }

  return (
    <div className="fixed inset-x-5 bottom-5 z-20 border border-[var(--xt-black)] bg-[var(--xt-white)] p-4 text-[var(--xt-black)] shadow-lg">
      <div className="mb-3 h-2 overflow-hidden bg-[var(--xt-cement)]">
        <div className="h-full origin-left animate-[xt-countdown_20s_linear_forwards] bg-[var(--xt-yellow)]" />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <span className="min-w-0 [font-family:var(--font-barlow-condensed)] text-xl font-bold leading-tight md:text-2xl">
          Registro guardado. Volveremos a seleccionar operario en 20 segundos.
        </span>
        <Button asChild size="lg" className="shrink-0" onClick={() => setIsVisible(false)}>
          <Link href={continueHref}>Continuar registrando</Link>
        </Button>
      </div>
    </div>
  );
}
