"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Refresca la página cada `pollMs` sin cargar supabase-js ni abrir un
 * WebSocket. Es lo que usa la planta: la tablet entra sin sesión de admin y
 * las políticas RLS (solo is_admin()) no le dejan recibir eventos de Realtime,
 * así que el sondeo era lo único que la mantenía al día.
 *
 * Con la pantalla oculta no pide nada; al volver a verse refresca enseguida.
 */
export function PollRefresh({ pollMs }: { pollMs: number }) {
  const router = useRouter();

  useEffect(() => {
    let lastRefreshAt = Date.now();

    const refresh = () => {
      lastRefreshAt = Date.now();
      router.refresh();
    };

    const interval = setInterval(() => {
      if (!document.hidden) {
        refresh();
      }
    }, pollMs);

    const onVisibilityChange = () => {
      if (!document.hidden && Date.now() - lastRefreshAt >= pollMs) {
        refresh();
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [pollMs, router]);

  return null;
}
