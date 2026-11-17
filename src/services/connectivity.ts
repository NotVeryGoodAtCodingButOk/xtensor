import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const CONNECTIVITY_KINDS = ["offline", "fetch_failed", "slow_request", "slow_load", "gap"] as const;
export type ConnectivityKind = (typeof CONNECTIVITY_KINDS)[number];

/** Evento que anota el navegador de planta (ver ConnectionLogger). */
export type ConnectivityEventInput = {
  kind: ConnectivityKind;
  /** Epoch ms del reloj del dispositivo. */
  at: number;
  ms?: number;
  path?: string;
  detail?: string;
};

const MAX_EVENTS = 50;
const DAY_MS = 24 * 60 * 60 * 1000;

function clip(value: unknown, max: number) {
  return typeof value === "string" && value ? value.slice(0, max) : null;
}

function deviceFromUserAgent(userAgent: string) {
  if (/iPad/.test(userAgent)) return "iPad";
  if (/Tizen|SMART-TV/i.test(userAgent)) return "TV";
  if (/Windows/.test(userAgent)) return "Windows";
  if (/iPhone/.test(userAgent)) return "iPhone";
  if (/Android/.test(userAgent)) return "Android";
  if (/Macintosh/.test(userAgent)) return "Mac";
  return "Otro";
}

export async function saveConnectivityEvents(deviceId: string, userAgent: string, events: unknown[]) {
  const now = Date.now();
  const rows = events
    .slice(0, MAX_EVENTS)
    .filter((event): event is ConnectivityEventInput => {
      const candidate = event as ConnectivityEventInput;
      return (
        CONNECTIVITY_KINDS.includes(candidate?.kind) &&
        Number.isFinite(candidate.at) &&
        // Descarta relojes absurdos: hasta 7 días atrás, sin futuro.
        candidate.at > now - 7 * DAY_MS &&
        candidate.at < now + 60_000
      );
    })
    .map((event) => ({
      device_id: deviceId.slice(0, 40),
      device: deviceFromUserAgent(userAgent),
      kind: event.kind,
      started_at: new Date(event.at).toISOString(),
      duration_ms: Number.isFinite(event.ms) ? Math.min(Math.round(event.ms!), 2_000_000_000) : null,
      path: clip(event.path, 200),
      detail: clip(event.detail, 300),
      user_agent: clip(userAgent, 300),
    }));

  if (rows.length === 0) return;

  const { error } = await createSupabaseAdminClient().from("connectivity_events").insert(rows);
  if (error) throw error;
}
