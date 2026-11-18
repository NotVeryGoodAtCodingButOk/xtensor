/**
 * Motor de la planta sin conexión en el iPad:
 * - Bandeja de salida: cada acción se guarda en localStorage ANTES de verse en
 *   pantalla, así sobrevive a recargas, a que el navegador cierre la pestaña o
 *   a que se apague el iPad.
 * - Proyección: lo que se ve = último snapshot del servidor + comandos que el
 *   servidor todavía no refleja (state.ts).
 * - Sincronización: manda la bandeja en orden, de a 50, una petición a la vez,
 *   con reintentos crecientes. Un comando aplicado se queda en la proyección
 *   hasta que llega un snapshot que ya lo incluye (sin parpadeos).
 *
 * Sin React: se prueba con almacenamiento, red y reloj de mentira
 * (tests/unit/floor-client.test.ts). La capa de React está en use-floor.ts.
 */
import type {
  FloorCommand,
  FloorCommandOutcome,
  FloorIntent,
  FloorSyncRequest,
  FloorSyncResponse,
} from "@/lib/floor/commands";
import { FLOOR_COMMAND_VERSION } from "@/lib/floor/commands";
import { applyCommand, projectState, stateFromSnapshot, type FloorEffects, type FloorState } from "@/lib/floor/state";
import type { FloorSnapshot } from "@/lib/floor/types";

export const FLOOR_KEYS = {
  snapshot: "xt_floor_snapshot",
  outbox: "xt_floor_outbox",
  seq: "xt_floor_seq",
  issues: "xt_floor_issues",
  worker: "xt_floor_worker",
  /** Compartido con la bitácora de conexión (ConnectionGuard). */
  device: "xt_device_id",
} as const;

const SNAPSHOT_URL = "/planta/api/piso";
const SYNC_URL = "/planta/api/piso/sync";
const BATCH_SIZE = 50;
const REQUEST_TIMEOUT_MS = 20_000;
const WORKER_TTL_MS = 12 * 60 * 60_000;
const MAX_ISSUES = 30;
const MIN_BACKOFF_MS = 2_000;
const MAX_BACKOFF_MS = 15_000;

export type FloorStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

export type OutboxEntry = {
  command: FloorCommand;
  /** Hora del servidor en que se confirmó; null = sin enviar. */
  ackedAt: number | null;
};

export type FloorIssue = {
  id: string;
  type: FloorCommand["type"];
  at: number;
  status: "applied_flagged" | "rejected";
  flags: string[];
  error: string | null;
};

type StoredSnapshot = {
  snapshot: FloorSnapshot;
  etag: string | null;
  /** Hora del servidor − hora del iPad. */
  clockOffsetMs: number;
  /** Cuándo llegó (reloj del iPad): para avisar "datos de hace X min". */
  receivedAt: number;
};

export type FloorClientState = {
  /** Hay datos para trabajar (snapshot guardado o recién bajado). */
  ready: boolean;
  floor: FloorState | null;
  workerId: string | null;
  pendingCount: number;
  /** Última comunicación con el servidor salió bien. */
  online: boolean;
  syncing: boolean;
  /** El servidor dijo 401: hay que volver a poner la clave de planta para enviar. */
  locked: boolean;
  snapshotReceivedAt: number | null;
  issues: FloorIssue[];
  /** No se pudo guardar en el iPad (almacenamiento lleno o bloqueado). */
  storageError: boolean;
};

export type DispatchResult = { ok: true; effects: FloorEffects } | { ok: false; error: string };

export type FloorClientOptions = {
  storage: FloorStorage;
  fetch: typeof fetch;
  now?: () => number;
  randomId?: () => string;
  appVersion?: string;
  swSupported?: () => boolean;
};

export function createFloorClient(options: FloorClientOptions) {
  const { storage } = options;
  const now = options.now ?? (() => Date.now());
  const randomId = options.randomId ?? (() => crypto.randomUUID());
  const listeners = new Set<() => void>();

  let stored: StoredSnapshot | null = null;
  let outbox: OutboxEntry[] = [];
  let issues: FloorIssue[] = [];
  let seq = 0;
  let worker: { id: string; until: number } | null = null;
  let base: FloorState | null = null;
  let state: FloorClientState = emptyState();
  let syncing = false;
  let online = true;
  let locked = false;
  let storageError = false;
  let backoffMs = 0;
  let nextSyncAt = 0;

  function emptyState(): FloorClientState {
    return {
      ready: false,
      floor: null,
      workerId: null,
      pendingCount: 0,
      online: true,
      syncing: false,
      locked: false,
      snapshotReceivedAt: null,
      issues: [],
      storageError: false,
    };
  }

  // ── Persistencia ──────────────────────────────────────────────────────────

  function read<T>(key: string): T | null {
    try {
      const raw = storage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch {
      return null;
    }
  }

  function write(key: string, value: unknown): boolean {
    try {
      storage.setItem(key, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  }

  function load() {
    stored = read<StoredSnapshot>(FLOOR_KEYS.snapshot);
    outbox = read<OutboxEntry[]>(FLOOR_KEYS.outbox) ?? [];
    issues = read<FloorIssue[]>(FLOOR_KEYS.issues) ?? [];
    seq = Math.max(read<number>(FLOOR_KEYS.seq) ?? 0, ...outbox.map((entry) => entry.command.seq));
    worker = read<{ id: string; until: number }>(FLOOR_KEYS.worker);
    base = stored ? stateFromSnapshot(stored.snapshot, stored.clockOffsetMs) : null;
    recompute();
  }

  function persistOutbox(): boolean {
    const ok = write(FLOOR_KEYS.outbox, outbox);
    storageError = !ok;
    return ok;
  }

  // ── Estado visible ────────────────────────────────────────────────────────

  function recompute() {
    const activeWorker = worker && worker.until > now() ? worker.id : null;
    state = {
      ready: base !== null,
      floor: base ? projectState(base, outbox.map((entry) => entry.command)) : null,
      workerId: activeWorker && base?.workers.some((item) => item.id === activeWorker) ? activeWorker : null,
      pendingCount: outbox.filter((entry) => entry.ackedAt === null).length,
      online,
      syncing,
      locked,
      snapshotReceivedAt: stored?.receivedAt ?? null,
      issues,
      storageError,
    };
    for (const listener of listeners) listener();
  }

  // ── Acciones del operario ─────────────────────────────────────────────────

  function dispatch(intent: FloorIntent): DispatchResult {
    if (!state.floor) return { ok: false, error: "Todavía no hay datos de la planta. Espera la conexión." };

    seq += 1;
    const command = { id: randomId(), v: FLOOR_COMMAND_VERSION, seq, at: now(), ...intent } as FloorCommand;
    const result = applyCommand(state.floor, command);
    if (!result.ok) {
      seq -= 1;
      return { ok: false, error: result.error };
    }
    if (result.effects.noop) {
      seq -= 1;
      return result;
    }

    outbox = [...outbox, { command, ackedAt: null }];
    if (!persistOutbox() || !write(FLOOR_KEYS.seq, seq)) {
      outbox = outbox.slice(0, -1);
      seq -= 1;
      storageError = true;
      recompute();
      return { ok: false, error: "No se pudo guardar en el iPad. Avisa al administrador." };
    }

    recompute();
    scheduleSync(300);
    return { ok: true, effects: result.effects };
  }

  function selectWorker(workerId: string) {
    worker = { id: workerId, until: now() + WORKER_TTL_MS };
    write(FLOOR_KEYS.worker, worker);
    recompute();
  }

  function clearWorker() {
    worker = null;
    storage.removeItem(FLOOR_KEYS.worker);
    recompute();
  }

  function dismissIssues() {
    issues = [];
    write(FLOOR_KEYS.issues, issues);
    recompute();
  }

  // ── Red ───────────────────────────────────────────────────────────────────

  async function request(url: string, init: RequestInit) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      return await options.fetch(url, { ...init, cache: "no-store", signal: controller.signal });
    } finally {
      clearTimeout(timeout);
    }
  }

  function deviceId() {
    let id = read<string>(FLOOR_KEYS.device);
    if (!id) {
      id = `${now().toString(36)}-${randomId().slice(0, 8)}`;
      write(FLOOR_KEYS.device, id);
    }
    return id;
  }

  /** Quita los comandos confirmados que el snapshot (armado a `serverTime`) ya incluye. */
  function pruneAcked(serverTime: number) {
    const before = outbox.length;
    outbox = outbox.filter((entry) => entry.ackedAt === null || entry.ackedAt > serverTime);
    if (outbox.length !== before) persistOutbox();
  }

  async function refreshSnapshot(): Promise<boolean> {
    const sentAt = now();
    try {
      const response = await request(SNAPSHOT_URL, {
        headers: stored?.etag ? { "If-None-Match": stored.etag } : undefined,
      });
      const receivedAt = now();
      const midpoint = (sentAt + receivedAt) / 2;

      if (response.status === 401) {
        markReachable(true);
        return false;
      }
      if (response.status === 304 && stored) {
        const serverTime = Number(response.headers.get("X-Server-Time")) || stored.snapshot.serverTime;
        stored = { ...stored, clockOffsetMs: Math.round(serverTime - midpoint), receivedAt };
        write(FLOOR_KEYS.snapshot, stored);
        base = stateFromSnapshot(stored.snapshot, stored.clockOffsetMs);
        pruneAcked(serverTime);
        markReachable(false);
        return true;
      }
      if (!response.ok) {
        markUnreachable();
        return false;
      }

      const snapshot = (await response.json()) as FloorSnapshot;
      stored = {
        snapshot,
        etag: response.headers.get("ETag"),
        clockOffsetMs: Math.round(snapshot.serverTime - midpoint),
        receivedAt,
      };
      write(FLOOR_KEYS.snapshot, stored);
      base = stateFromSnapshot(snapshot, stored.clockOffsetMs);
      pruneAcked(snapshot.serverTime);
      markReachable(false);
      return true;
    } catch {
      markUnreachable();
      return false;
    }
  }

  /**
   * Envía la bandeja. Con `heartbeat`, aunque esté vacía (para que el admin vea
   * el último contacto del iPad).
   */
  async function syncNow(options: { heartbeat?: boolean } = {}): Promise<void> {
    if (syncing) return;
    const pending = outbox.filter((entry) => entry.ackedAt === null);
    if (pending.length === 0 && !options.heartbeat) return;

    syncing = true;
    recompute();
    let progressed = false;
    try {
      let batch = pending.slice(0, BATCH_SIZE);
      for (;;) {
        const body: FloorSyncRequest = {
          deviceId: deviceId(),
          sentAt: now(),
          appVersion: optionsAppVersion(),
          swSupported: optionsSw(),
          pendingCount: outbox.filter((entry) => entry.ackedAt === null).length,
          commands: batch.map((entry) => entry.command),
        };
        const response = await request(SYNC_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

        if (response.status === 401) {
          markReachable(true);
          return;
        }
        if (!response.ok) {
          markUnreachable();
          return;
        }

        const result = (await response.json()) as FloorSyncResponse;
        const stopped = applyOutcomes(result);
        markReachable(false);
        progressed = progressed || result.outcomes.some((outcome) => outcome.status !== "retry");
        if (stopped) {
          backoff();
          return;
        }

        batch = outbox.filter((entry) => entry.ackedAt === null).slice(0, BATCH_SIZE);
        if (batch.length === 0) break;
      }
      backoffMs = 0;
    } catch {
      markUnreachable();
    } finally {
      syncing = false;
      recompute();
    }

    if (progressed) await refreshSnapshot();
  }

  /** Devuelve true si el servidor pidió parar (error pasajero en un comando). */
  function applyOutcomes(result: FloorSyncResponse): boolean {
    const byId = new Map<string, FloorCommandOutcome>(result.outcomes.map((outcome) => [outcome.id, outcome]));
    let stopped = false;
    const nextIssues = [...issues];

    outbox = outbox.flatMap<OutboxEntry>((entry) => {
      const outcome = byId.get(entry.command.id);
      if (!outcome || entry.ackedAt !== null) return [entry];
      if (outcome.status === "retry") {
        stopped = true;
        return [entry];
      }
      if (outcome.status !== "applied") {
        nextIssues.unshift({
          id: entry.command.id,
          type: entry.command.type,
          at: entry.command.at,
          status: outcome.status,
          flags: outcome.flags,
          error: outcome.error,
        });
      }
      // Rechazado = el servidor no lo aplicó: sale ya de la proyección.
      if (outcome.status === "rejected") return [];
      return [{ ...entry, ackedAt: result.serverTime }];
    });

    persistOutbox();
    if (nextIssues.length !== issues.length) {
      issues = nextIssues.slice(0, MAX_ISSUES);
      write(FLOOR_KEYS.issues, issues);
    }
    return stopped;
  }

  function markReachable(isLocked: boolean) {
    online = true;
    locked = isLocked;
    recompute();
  }

  function markUnreachable() {
    online = false;
    backoff();
    recompute();
  }

  function backoff() {
    backoffMs = backoffMs === 0 ? MIN_BACKOFF_MS : Math.min(backoffMs * 2, MAX_BACKOFF_MS);
    nextSyncAt = now() + backoffMs;
  }

  function optionsAppVersion() {
    return options.appVersion ?? "";
  }

  function optionsSw() {
    return options.swSupported?.() ?? false;
  }

  // ── Ciclo de vida (solo en el navegador) ──────────────────────────────────

  let syncTimer: ReturnType<typeof setTimeout> | undefined;

  function scheduleSync(delayMs: number) {
    clearTimeout(syncTimer);
    syncTimer = setTimeout(() => void syncNow(), delayMs);
  }

  function setOffline() {
    online = false;
    recompute();
  }

  /** Arranca temporizadores y escuchas. Devuelve la función para detenerlos. */
  function start(win: Window) {
    load();
    void refreshSnapshot().then(() => syncNow({ heartbeat: true }));

    let lastHeartbeat = now();
    const tick = setInterval(() => {
      if (win.document.hidden) return;
      const pending = outbox.some((entry) => entry.ackedAt === null);
      if (pending && now() >= nextSyncAt) void syncNow();
      if (now() - lastHeartbeat >= 5 * 60_000) {
        lastHeartbeat = now();
        void syncNow({ heartbeat: true });
      }
    }, 5_000);
    const snapshotTick = setInterval(() => {
      if (!win.document.hidden && !syncing) void refreshSnapshot();
    }, 30_000);

    const onOnline = () => {
      backoffMs = 0;
      nextSyncAt = 0;
      void syncNow().then(() => refreshSnapshot());
    };
    const onVisible = () => {
      if (!win.document.hidden) void syncNow().then(() => refreshSnapshot());
    };
    // Otra pestaña cambió la bandeja o el snapshot: se recarga para no pisarla.
    const onStorage = (event: StorageEvent) => {
      if (event.key && (Object.values(FLOOR_KEYS) as string[]).includes(event.key)) load();
    };

    win.addEventListener("online", onOnline);
    win.addEventListener("offline", setOffline);
    win.addEventListener("storage", onStorage);
    win.document.addEventListener("visibilitychange", onVisible);

    return () => {
      clearInterval(tick);
      clearInterval(snapshotTick);
      clearTimeout(syncTimer);
      win.removeEventListener("online", onOnline);
      win.removeEventListener("offline", setOffline);
      win.removeEventListener("storage", onStorage);
      win.document.removeEventListener("visibilitychange", onVisible);
    };
  }

  return {
    load,
    start,
    dispatch,
    selectWorker,
    clearWorker,
    dismissIssues,
    syncNow,
    refreshSnapshot,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getState: () => state,
    /** Para pruebas y diagnóstico. */
    getOutbox: () => outbox,
  };
}

export type FloorClient = ReturnType<typeof createFloorClient>;
