"use client";

import { useEffect } from "react";

/**
 * Bitácora de conexión de los dispositivos de planta. Vercel solo guarda 1 h de
 * logs y nunca ve las peticiones que no llegan, así que el navegador anota:
 * - offline: el sistema dijo que no había red (desde → hasta).
 * - fetch_failed: una petición de la app falló por red (no las canceladas).
 * - slow_request: una petición tardó más de 8 s.
 * - slow_load: la carga completa de la página tardó más de 8 s.
 * - gap: la app no estuvo viva un rato estando la pantalla encendida (página de
 *   error del navegador, carga que no termina o pestaña cerrada por el sistema).
 * Todo va a localStorage primero y se envía cuando hay red.
 */

type ConnEvent = { kind: string; at: number; ms?: number; path?: string; detail?: string };
type Alive = { at: number; path: string; state: "visible" | "hidden" | "unloading" };

const QUEUE_KEY = "xt_conn_queue";
const ALIVE_KEY = "xt_conn_alive";
const OFFLINE_KEY = "xt_conn_offline_since";
const DEVICE_KEY = "xt_device_id";
const ENDPOINT = "/planta/api/conexion";
const SLOW_MS = 8_000;
const HEARTBEAT_MS = 15_000;
const GAP_MS = 45_000;
const MAX_QUEUE = 100;

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Sin espacio o modo privado: no se anota, la app sigue igual.
  }
}

function deviceId() {
  let id = read<string>(DEVICE_KEY);
  if (!id) {
    id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    write(DEVICE_KEY, id);
  }
  return id;
}

function pathOf(input: RequestInfo | URL) {
  try {
    const url = input instanceof Request ? input.url : String(input);
    return new URL(url, location.href).pathname;
  } catch {
    return "?";
  }
}

export function ConnectionLogger() {
  useEffect(() => {
    const originalFetch = window.fetch;
    let flushing = false;

    const push = (event: ConnEvent) => {
      const queue = read<ConnEvent[]>(QUEUE_KEY) ?? [];
      queue.push(event);
      write(QUEUE_KEY, queue.slice(-MAX_QUEUE));
    };

    const flush = async () => {
      if (flushing || !navigator.onLine) return;
      const batch = (read<ConnEvent[]>(QUEUE_KEY) ?? []).slice(0, 50);
      if (batch.length === 0) return;
      flushing = true;
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 10_000);
      try {
        const response = await originalFetch(ENDPOINT, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ deviceId: deviceId(), events: batch }),
          signal: controller.signal,
        });
        // 401 = planta bloqueada: se guardan hasta que vuelvan a entrar.
        if (response.ok || response.status === 400) {
          const rest = (read<ConnEvent[]>(QUEUE_KEY) ?? []).slice(batch.length);
          write(QUEUE_KEY, rest);
        }
      } catch {
        // Sin red: se reintenta en el próximo ciclo.
      } finally {
        window.clearTimeout(timeout);
        flushing = false;
      }
    };

    const markAlive = (state: Alive["state"]) =>
      write(ALIVE_KEY, { at: Date.now(), path: location.pathname, state } satisfies Alive);

    // 1. ¿La app estuvo caída con la pantalla encendida desde la última vez?
    const previous = read<Alive>(ALIVE_KEY);
    const now = Date.now();
    if (previous && previous.state !== "hidden" && now - previous.at > GAP_MS) {
      push({
        kind: "gap",
        at: previous.at,
        ms: now - previous.at,
        path: previous.path,
        detail: previous.state === "unloading" ? "la carga de la página no terminó" : "la app dejó de responder",
      });
    }

    // 2. ¿Esta carga de página fue lenta? (DNS, conexión, primer byte)
    const navigation = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    if (navigation && navigation.responseEnd > SLOW_MS) {
      const ms = (a: number, b: number) => Math.round(b - a);
      push({
        kind: "slow_load",
        at: Math.round(performance.timeOrigin),
        ms: Math.round(navigation.responseEnd),
        path: location.pathname,
        detail: `dns ${ms(navigation.domainLookupStart, navigation.domainLookupEnd)} · conexión ${ms(
          navigation.connectStart,
          navigation.connectEnd,
        )} · primer byte ${ms(navigation.requestStart, navigation.responseStart)} ms`,
      });
    }

    // 3. Un corte de red que quedó abierto antes de recargar.
    const closeOffline = () => {
      const since = read<number>(OFFLINE_KEY);
      if (since) {
        push({ kind: "offline", at: since, ms: Date.now() - since, path: location.pathname });
        localStorage.removeItem(OFFLINE_KEY);
      }
    };
    if (navigator.onLine) closeOffline();
    else if (!read<number>(OFFLINE_KEY)) write(OFFLINE_KEY, Date.now());

    // 4. Peticiones de la app que fallan o tardan.
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const started = Date.now();
      try {
        const response = await originalFetch(input, init);
        const elapsed = Date.now() - started;
        if (elapsed > SLOW_MS) {
          push({ kind: "slow_request", at: started, ms: elapsed, path: pathOf(input), detail: `HTTP ${response.status}` });
        }
        return response;
      } catch (error) {
        const name = error instanceof Error ? error.name : "Error";
        if (name !== "AbortError") {
          const message = error instanceof Error ? error.message : String(error);
          push({ kind: "fetch_failed", at: started, ms: Date.now() - started, path: pathOf(input), detail: `${name}: ${message}` });
        }
        throw error;
      }
    };

    const onOffline = () => {
      if (!read<number>(OFFLINE_KEY)) write(OFFLINE_KEY, Date.now());
    };
    const onOnline = () => {
      closeOffline();
      void flush();
    };
    const onVisibility = () => {
      markAlive(document.hidden ? "hidden" : "visible");
      if (!document.hidden) void flush();
    };
    const onPageHide = () => markAlive("unloading");

    markAlive(document.hidden ? "hidden" : "visible");
    const heartbeat = window.setInterval(() => {
      if (!document.hidden) markAlive("visible");
    }, HEARTBEAT_MS);
    const flusher = window.setInterval(() => void flush(), 60_000);
    void flush();

    window.addEventListener("offline", onOffline);
    window.addEventListener("online", onOnline);
    window.addEventListener("pagehide", onPageHide);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      window.fetch = originalFetch;
      window.clearInterval(heartbeat);
      window.clearInterval(flusher);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("pagehide", onPageHide);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return null;
}
