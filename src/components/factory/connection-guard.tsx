"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Protege la planta de los cortes de Wi-Fi del iPad y deja bitácora de ellos.
 *
 * Reintento: si una petición de Next (navegación, refresco o server action)
 * falla por red o no responde en 20 s, Next haría una carga completa de página
 * y, sin señal, Chrome se queda en su página de error hasta que alguien recarga.
 * Aquí esas peticiones no fallan: esperan a que vuelva la conexión (sondeando
 * /planta/api/conexion) y se reenvían solas, sin bloquear nada. Lo usa sobre
 * todo la cartelera (TV); el registro del operario no pasa por aquí sino por la
 * bandeja de salida del iPad (src/lib/floor), que funciona sin red.
 *
 * Bitácora (Vercel solo guarda 1 h de logs y nunca ve lo que no llega):
 * - offline: el sistema dijo que no había red (desde → hasta).
 * - fetch_failed: una petición falló por red o no respondió (no las canceladas).
 * - slow_request: una petición tardó más de 8 s.
 * - slow_load: la carga completa de la página tardó más de 8 s.
 * - gap: la app no estuvo viva un rato estando la pantalla encendida (página de
 *   error del navegador, carga que no termina o pestaña cerrada por el sistema).
 * - waiting: cuánto duró el aviso "Sin conexión, reintentando…".
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
/** Sin respuesta en este tiempo, la petición se da por perdida y se reintenta. */
const ATTEMPT_TIMEOUT_MS = 20_000;
const PROBE_TIMEOUT_MS = 5_000;
const MAX_PROBE_DELAY_MS = 10_000;

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

function urlOf(input: RequestInfo | URL) {
  try {
    const url = input instanceof Request ? input.url : String(input);
    return new URL(url, location.href);
  } catch {
    return null;
  }
}

/** Peticiones propias de Next que conviene reintentar en vez de dejar fallar. */
function retryableKind(input: RequestInfo | URL, init?: RequestInit): "rsc" | "action" | null {
  if (input instanceof Request) return null; // su cuerpo no se puede reenviar
  const url = urlOf(input);
  if (!url || url.origin !== location.origin) return null;
  const headers = new Headers(init?.headers);
  if (headers.has("next-router-prefetch")) return null;
  if (headers.has("next-action")) return "action";
  if (headers.get("rsc") === "1") return "rsc";
  return null;
}

function isNetworkError(error: unknown) {
  // iOS: "TypeError: Load failed"; Chrome: "TypeError: Failed to fetch".
  return error instanceof TypeError;
}

export function ConnectionGuard() {
  const router = useRouter();

  useEffect(() => {
    const originalFetch = window.fetch;
    let flushing = false;
    let disposed = false;
    let waitPromise: Promise<void> | null = null;
    let refreshTimer: number | undefined;

    const syncStatus = () => {
      // PollRefresh no apila refrescos mientras se espera la conexión.
      if (waitPromise) document.documentElement.dataset.xtConn = "waiting";
      else delete document.documentElement.dataset.xtConn;
    };

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

    // 4. Un intento: anota si falla o tarda.
    const loggedFetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const started = Date.now();
      const path = urlOf(input)?.pathname ?? "?";
      try {
        const response = await originalFetch(input, init);
        const elapsed = Date.now() - started;
        if (elapsed > SLOW_MS) {
          push({ kind: "slow_request", at: started, ms: elapsed, path, detail: `HTTP ${response.status}` });
        }
        return response;
      } catch (error) {
        const name = error instanceof Error ? error.name : "Error";
        if (name !== "AbortError") {
          const message = error instanceof Error ? error.message : String(error);
          push({ kind: "fetch_failed", at: started, ms: Date.now() - started, path, detail: `${name}: ${message}` });
        }
        throw error;
      }
    };

    // 5. Esperar a que vuelva la conexión (una sola espera compartida).
    const pause = (ms: number) =>
      new Promise<void>((resolve) => {
        const done = () => {
          window.clearTimeout(timer);
          window.removeEventListener("online", done);
          resolve();
        };
        const timer = window.setTimeout(done, ms);
        window.addEventListener("online", done);
      });

    const probe = async () => {
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
      try {
        await originalFetch(`${ENDPOINT}?t=${Date.now()}`, { cache: "no-store", signal: controller.signal });
        return true;
      } catch {
        return false;
      } finally {
        window.clearTimeout(timeout);
      }
    };

    const waitForConnection = () => {
      if (!waitPromise) {
        const started = Date.now();
        let probes = 0;
        waitPromise = (async () => {
          let delay = 1_000;
          while (!disposed) {
            await pause(delay);
            probes += 1;
            if (await probe()) return;
            delay = Math.min(delay * 2, MAX_PROBE_DELAY_MS);
          }
        })().finally(() => {
          waitPromise = null;
          push({ kind: "waiting", at: started, ms: Date.now() - started, path: location.pathname, detail: `${probes} sondeos` });
          syncStatus();
          void flush();
        });
        syncStatus();
      }
      return waitPromise;
    };

    // 6. Peticiones de Next: no fallan por red, esperan y se reenvían.
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const kind = retryableKind(input, init);
      if (!kind) return loggedFetch(input, init);

      const callerSignal = init?.signal ?? null;
      let retried = false;

      for (;;) {
        if (callerSignal?.aborted) throw new DOMException("Aborted", "AbortError");
        // Si ya se está esperando la conexión, no gastar un intento que va a fallar.
        if (waitPromise) {
          retried = true;
          await waitPromise;
        }

        const controller = new AbortController();
        const onCallerAbort = () => controller.abort();
        callerSignal?.addEventListener("abort", onCallerAbort);
        const started = Date.now();
        let timedOut = false;
        const timeout = window.setTimeout(() => {
          timedOut = true;
          controller.abort();
        }, ATTEMPT_TIMEOUT_MS);

        let retry = false;
        try {
          const response = await loggedFetch(input, { ...init, signal: controller.signal });
          // Un 502/503/504 en una navegación también haría una carga completa.
          if (kind === "rsc" && [502, 503, 504].includes(response.status)) {
            push({ kind: "fetch_failed", at: started, ms: Date.now() - started, path: urlOf(input)?.pathname, detail: `HTTP ${response.status}` });
            retry = true;
          } else {
            if (retried) {
              // Tras un corte se muestra el estado real (por si la acción ya había llegado).
              window.clearTimeout(refreshTimer);
              refreshTimer = window.setTimeout(() => router.refresh(), 300);
            }
            return response;
          }
        } catch (error) {
          if (callerSignal?.aborted) throw error;
          if (timedOut) {
            push({
              kind: "fetch_failed",
              at: started,
              ms: Date.now() - started,
              path: urlOf(input)?.pathname,
              detail: `sin respuesta en ${ATTEMPT_TIMEOUT_MS / 1000} s`,
            });
          } else if (!isNetworkError(error)) {
            throw error;
          }
          retry = true;
        } finally {
          window.clearTimeout(timeout);
          callerSignal?.removeEventListener("abort", onCallerAbort);
        }

        if (retry) {
          retried = true;
          await waitForConnection();
        }
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
      disposed = true;
      window.fetch = originalFetch;
      window.clearInterval(heartbeat);
      window.clearInterval(flusher);
      window.clearTimeout(refreshTimer);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("pagehide", onPageHide);
      document.removeEventListener("visibilitychange", onVisibility);
      delete document.documentElement.dataset.xtConn;
    };
  }, [router]);

  return null;
}
