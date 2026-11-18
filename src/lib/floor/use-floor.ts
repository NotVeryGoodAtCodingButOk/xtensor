"use client";

import { useSyncExternalStore } from "react";
import { createFloorClient, type FloorClient, type FloorClientState } from "@/lib/floor/client";

/** Versión de la app que reporta el iPad (se ve en /admin/sincronizacion). */
export const FLOOR_APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? "dev";

let client: FloorClient | null = null;

/** Un solo motor por pestaña. */
export function getFloorClient(): FloorClient {
  if (!client) {
    client = createFloorClient({
      storage: window.localStorage,
      // Pasa por la bitácora de ConnectionGuard: los fallos quedan anotados.
      fetch: (input, init) => window.fetch(input, init),
      appVersion: FLOOR_APP_VERSION,
      swSupported: () => "serviceWorker" in navigator && Boolean(navigator.serviceWorker.controller),
    });
    client.load();
  }
  return client;
}

const SERVER_STATE: FloorClientState = {
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

export function useFloor(): FloorClientState {
  return useSyncExternalStore(
    (listener) => getFloorClient().subscribe(listener),
    () => getFloorClient().getState(),
    () => SERVER_STATE,
  );
}
