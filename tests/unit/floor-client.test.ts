import { describe, expect, it } from "vitest";
import { FLOOR_KEYS, createFloorClient, type FloorStorage } from "@/lib/floor/client";
import type { FloorCommand, FloorSyncRequest, FloorSyncResponse } from "@/lib/floor/commands";
import { openActivityOf } from "@/lib/floor/state";
import type { FloorSnapshot } from "@/lib/floor/types";

const T0 = Date.UTC(2026, 10, 18, 13, 0, 0);

function memoryStorage(): FloorStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key),
  };
}

function snapshot(serverTime = T0): FloorSnapshot {
  return {
    version: 1,
    serverTime,
    workers: [{ id: "w1", name: "Ana", role: "Armadora", color: null }],
    stages: [{ id: 1, name: "Armar" }],
    machines: [
      {
        id: "m1", serial: 101, code: "X", name: "Máquina", client: "Cliente", city: null, color: null,
        status: "in_production", order: 1,
        stages: { 1: { completion: 0, lastDoneAt: null, lastIsReprocess: false } },
      },
    ],
    activityMachines: [],
    activityTypes: [],
    activities: [],
    previoRows: [],
  };
}

type Handler = (url: string, init: RequestInit) => Response | Promise<Response>;

function setup(options: { handler?: Handler; storage?: ReturnType<typeof memoryStorage> } = {}) {
  let clock = T0;
  let ids = 0;
  const storage = options.storage ?? memoryStorage();
  const requests: Array<{ url: string; body: FloorSyncRequest | null }> = [];
  let handler: Handler = options.handler ?? (() => new Response(null, { status: 503 }));
  const client = createFloorClient({
    storage,
    now: () => clock,
    randomId: () => `id-${++ids}`,
    fetch: (async (url: string, init: RequestInit) => {
      requests.push({ url, body: init.body ? (JSON.parse(String(init.body)) as FloorSyncRequest) : null });
      return handler(url, init);
    }) as unknown as typeof fetch,
  });
  return {
    client,
    storage,
    requests,
    advance: (ms: number) => void (clock += ms),
    setHandler: (next: Handler) => void (handler = next),
  };
}

function json(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" }, ...init });
}

/** Servidor de mentira: aplica todo y devuelve un snapshot que refleja lo aplicado. */
function serverApplyingEverything(applied: FloorCommand[]): Handler {
  return (url, init) => {
    if (url.endsWith("/sync")) {
      const body = JSON.parse(String(init.body)) as FloorSyncRequest;
      applied.push(...body.commands);
      const response: FloorSyncResponse = {
        serverTime: T0 + 1_000,
        outcomes: body.commands.map((command) => ({ id: command.id, status: "applied", flags: [], error: null })),
      };
      return json(response);
    }
    const snap = snapshot(T0 + 2_000);
    if (applied.some((command) => command.type === "stage.set")) snap.machines[0].stages[1].completion = 100;
    return json(snap, { headers: { ETag: '"v2"' } });
  };
}

async function loadedClient(options: Parameters<typeof setup>[0] = {}) {
  const ctx = setup({ ...options, handler: () => json(snapshot(), { headers: { ETag: '"v1"' } }) });
  ctx.client.load();
  await ctx.client.refreshSnapshot();
  if (options.handler) ctx.setHandler(options.handler);
  return ctx;
}

describe("floor client: offline work", () => {
  it("persists the command before showing it, and keeps it across a reload with no network", async () => {
    const { client, storage } = await loadedClient();
    client.selectWorker("w1");

    const result = client.dispatch({ type: "stage.set", payload: { workerId: "w1", machineId: "m1", stageId: 1, completion: 100 } });
    expect(result.ok).toBe(true);
    expect(JSON.parse(storage.data.get(FLOOR_KEYS.outbox)!)).toHaveLength(1);
    expect(client.getState().floor?.machines.m1.stages[1].completion).toBe(100);
    expect(client.getState().pendingCount).toBe(1);

    // "Recarga" sin red: un cliente nuevo sobre el mismo almacenamiento.
    const reloaded = setup({ storage });
    reloaded.client.load();
    expect(reloaded.client.getState().floor?.machines.m1.stages[1].completion).toBe(100);
    expect(reloaded.client.getState().pendingCount).toBe(1);
    expect(reloaded.client.getState().workerId).toBe("w1");
  });

  it("rejects invalid taps right away without queueing them", async () => {
    const { client } = await loadedClient();
    client.dispatch({ type: "session.start_stage", payload: { workerId: "w1", sessionId: "s1", activityId: "a1", stageId: 1, machineIds: ["m1"] } });
    const second = client.dispatch({ type: "session.start_stage", payload: { workerId: "w1", sessionId: "s2", activityId: "a2", stageId: 1, machineIds: ["m1"] } });
    expect(second).toEqual({ ok: false, error: "Termina o pausa lo que tienes en curso." });
    expect(client.getOutbox()).toHaveLength(1);
  });

  it("keeps working while the server is unreachable and marks itself offline", async () => {
    const { client } = await loadedClient({ handler: () => Promise.reject(new TypeError("Load failed")) });
    client.dispatch({ type: "session.start_stage", payload: { workerId: "w1", sessionId: "s1", activityId: "a1", stageId: 1, machineIds: ["m1"] } });
    await client.syncNow();
    expect(client.getState().online).toBe(false);
    expect(client.getState().pendingCount).toBe(1);
    expect(openActivityOf(client.getState().floor!, "w1")?.activityId).toBe("a1");
  });
});

describe("floor client: sync", () => {
  it("sends in order with the tap times and clears the queue once the snapshot includes them", async () => {
    const applied: FloorCommand[] = [];
    const ctx = await loadedClient({ handler: serverApplyingEverything(applied) });
    ctx.client.dispatch({ type: "stage.set", payload: { workerId: "w1", machineId: "m1", stageId: 1, completion: 100 } });
    ctx.advance(60_000);
    ctx.client.dispatch({ type: "previo.set_received", payload: { machineId: "m1", previoCatalogId: "p1", received: true } });

    await ctx.client.syncNow();
    expect(applied.map((command) => [command.seq, command.at])).toEqual([[1, T0]]);
    // El previo no existe en el snapshot: el iPad lo rechazó al tocar, no se envió.
    expect(ctx.client.getOutbox()).toHaveLength(0);
    expect(ctx.client.getState().pendingCount).toBe(0);
    expect(ctx.client.getState().floor?.machines.m1.stages[1].completion).toBe(100);
  });

  it("keeps acked commands visible until a snapshot that includes them arrives (no flicker)", async () => {
    let snapshotServerTime = T0; // el servidor todavía devuelve un snapshot viejo
    const ctx = await loadedClient({
      handler: (url, init) => {
        if (url.endsWith("/sync")) {
          const body = JSON.parse(String(init.body)) as FloorSyncRequest;
          return json({ serverTime: T0 + 5_000, outcomes: body.commands.map((command) => ({ id: command.id, status: "applied", flags: [], error: null })) });
        }
        return json(snapshot(snapshotServerTime), { headers: { ETag: `"${snapshotServerTime}"` } });
      },
    });
    ctx.client.dispatch({ type: "stage.set", payload: { workerId: "w1", machineId: "m1", stageId: 1, completion: 100 } });
    await ctx.client.syncNow();
    expect(ctx.client.getState().pendingCount).toBe(0);
    expect(ctx.client.getOutbox()).toHaveLength(1); // confirmado, esperando snapshot nuevo
    expect(ctx.client.getState().floor?.machines.m1.stages[1].completion).toBe(100);

    snapshotServerTime = T0 + 6_000;
    await ctx.client.refreshSnapshot();
    expect(ctx.client.getOutbox()).toHaveLength(0);
  });

  it("stops at a 'retry' outcome and resends from there later, keeping order", async () => {
    let failSecond = true;
    const sent: number[][] = [];
    const ctx = await loadedClient({
      handler: (url, init) => {
        if (!url.endsWith("/sync")) return json(snapshot(T0 + 9_000));
        const body = JSON.parse(String(init.body)) as FloorSyncRequest;
        sent.push(body.commands.map((command) => command.seq));
        const outcomes = [];
        for (const command of body.commands) {
          if (command.seq === 2 && failSecond) {
            outcomes.push({ id: command.id, status: "retry" as const, flags: [], error: "timeout" });
            break;
          }
          outcomes.push({ id: command.id, status: "applied" as const, flags: [], error: null });
        }
        return json({ serverTime: T0 + 1_000, outcomes });
      },
    });
    ctx.client.dispatch({ type: "session.start_stage", payload: { workerId: "w1", sessionId: "s1", activityId: "a1", stageId: 1, machineIds: ["m1"] } });
    ctx.client.dispatch({ type: "session.pause", payload: { workerId: "w1", sessionId: "s1" } });
    ctx.client.dispatch({ type: "session.resume", payload: { workerId: "w1", sessionId: "s2", activityId: "a1" } });

    await ctx.client.syncNow();
    expect(ctx.client.getState().pendingCount).toBe(2);

    failSecond = false;
    await ctx.client.syncNow();
    expect(sent).toEqual([[1, 2, 3], [2, 3]]);
    expect(ctx.client.getState().pendingCount).toBe(0);
  });

  it("drops rejected commands from the screen and lists them for review", async () => {
    const ctx = await loadedClient({
      handler: (url, init) => {
        if (!url.endsWith("/sync")) return json(snapshot(T0 + 9_000));
        const body = JSON.parse(String(init.body)) as FloorSyncRequest;
        return json({ serverTime: T0 + 1_000, outcomes: body.commands.map((command) => ({ id: command.id, status: "rejected", flags: [], error: "El operario ya no existe." })) });
      },
    });
    ctx.client.dispatch({ type: "stage.set", payload: { workerId: "w1", machineId: "m1", stageId: 1, completion: 100 } });
    await ctx.client.syncNow();
    expect(ctx.client.getState().floor?.machines.m1.stages[1].completion).toBe(0);
    expect(ctx.client.getState().issues).toEqual([
      expect.objectContaining({ status: "rejected", error: "El operario ya no existe.", type: "stage.set" }),
    ]);
  });

  it("holds everything when the factory is locked (401) and says so", async () => {
    const ctx = await loadedClient({ handler: () => new Response(null, { status: 401 }) });
    ctx.client.dispatch({ type: "stage.set", payload: { workerId: "w1", machineId: "m1", stageId: 1, completion: 100 } });
    await ctx.client.syncNow();
    expect(ctx.client.getState().locked).toBe(true);
    expect(ctx.client.getState().pendingCount).toBe(1);
  });

  it("measures the iPad clock against the server so timers use server-correct times", async () => {
    const ctx = setup({ handler: () => json(snapshot(T0 + 120_000)) }); // servidor 2 min adelante
    ctx.client.load();
    await ctx.client.refreshSnapshot();
    const stored = JSON.parse(ctx.storage.data.get(FLOOR_KEYS.snapshot)!);
    expect(stored.clockOffsetMs).toBe(120_000);
  });
});
