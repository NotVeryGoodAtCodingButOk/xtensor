"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

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

    const channel = supabase.channel(channelName);
    for (const table of tables) {
      channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table },
        () => {
          router.refresh();
        },
      );
    }

    channel.subscribe();

    return () => {
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
