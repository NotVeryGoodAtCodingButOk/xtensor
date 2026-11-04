"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

/**
 * Los cambios llegan en ráfagas (reordenar la cola emite un evento por
 * máquina): se agrupan y se hace un solo refresh cuando paran ~800 ms. Con un
 * flujo continuo, el refresh igual sale a los 3 s como máximo.
 */
const REFRESH_DEBOUNCE_MS = 800;
const REFRESH_MAX_WAIT_MS = 3000;

export function RealtimeRefresh({
  channelName,
  tables,
  pollMs,
}: {
  channelName: string;
  tables: string[];
  /** When set, also refresh on a fixed interval as a fallback to realtime. */
  pollMs?: number;
}) {
  const router = useRouter();

  useEffect(() => {
    let supabase;
    try {
      supabase = createSupabaseBrowserClient();
    } catch {
      return;
    }

    let timer: ReturnType<typeof setTimeout> | null = null;
    let firstPendingAt: number | null = null;

    const flush = () => {
      timer = null;
      firstPendingAt = null;
      router.refresh();
    };

    const scheduleRefresh = () => {
      const now = Date.now();
      firstPendingAt ??= now;
      if (timer) {
        clearTimeout(timer);
      }
      const remainingMaxWait = REFRESH_MAX_WAIT_MS - (now - firstPendingAt);
      timer = setTimeout(flush, Math.max(0, Math.min(REFRESH_DEBOUNCE_MS, remainingMaxWait)));
    };

    const channel = supabase.channel(channelName);
    for (const table of tables) {
      channel.on("postgres_changes", { event: "*", schema: "public", table }, scheduleRefresh);
    }

    channel.subscribe();

    return () => {
      if (timer) {
        clearTimeout(timer);
      }
      void supabase.removeChannel(channel);
    };
  }, [channelName, router, tables]);

  // Polling fallback: keep the board fresh even if the realtime socket drops.
  useEffect(() => {
    if (!pollMs) {
      return;
    }

    const interval = setInterval(() => {
      router.refresh();
    }, pollMs);

    return () => {
      clearInterval(interval);
    };
  }, [pollMs, router]);

  return null;
}
