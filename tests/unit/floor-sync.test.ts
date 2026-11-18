import { describe, expect, it } from "vitest";
import type { FloorCommand, FloorCommandOutcome } from "@/lib/floor/commands";
import {
  FloorRejection,
  MAX_ATTEMPTS,
  clockOffsetMs,
  processFloorBatch,
  type ApplyContext,
  type ClaimInput,
  type ClaimResult,
  type FloorSyncDeps,
} from "@/services/floor-sync/process";
import { parseFloorCommand } from "@/services/floor-sync/schema";

const NOW = Date.UTC(2026, 10, 18, 15, 0, 0);
const MIN = 60_000;
const WORKER = "11111111-1111-4111-8111-111111111111";

function command(seq: number, at: number, id = `00000000-0000-4000-8000-${String(seq).padStart(12, "0")}`): FloorCommand {
  return { id, v: 1, seq, at, type: "session.pause", payload: { workerId: WORKER, sessionId: id } };
}

/** Base de datos de mentira: guarda reclamos y resultados como lo haría floor_commands. */
function fakeDeps(options: { apply?: (context: ApplyContext) => Promise<void> | void; now?: number } = {}) {
  const rows = new Map<string, { status: string; outcome?: FloorCommandOutcome; claimedAt: number; attempts: number; occurredAt: Date; flags: string[] }>();
  const applied: Array<{ id: string; occurredAt: Date }> = [];
  const nowMs = options.now ?? NOW;

  const deps: FloorSyncDeps = {
    now: () => new Date(nowMs),
    async claim(input: ClaimInput): Promise<ClaimResult> {
      const row = rows.get(input.command.id);
      if (!row) {
        rows.set(input.command.id, { status: "processing", claimedAt: nowMs, attempts: 0, occurredAt: input.occurredAt, flags: input.flags });
        return { kind: "claimed", occurredAt: input.occurredAt, flags: input.flags, attempts: 0 };
      }
      if (row.status !== "processing") return { kind: "done", outcome: row.outcome! };
      if (nowMs - row.claimedAt < 60_000) return { kind: "busy" };
      row.claimedAt = nowMs;
      return { kind: "claimed", occurredAt: row.occurredAt, flags: row.flags, attempts: row.attempts };
    },
    async apply(context) {
      await options.apply?.(context);
      applied.push({ id: context.command.id, occurredAt: context.occurredAt });
    },
    async finish(id, outcome) {
      const row = rows.get(id)!;
      row.status = outcome.status;
      row.outcome = outcome;
    },
    async release(id) {
      const row = rows.get(id)!;
      row.claimedAt = 0;
      row.attempts += 1;
    },
  };
  return { deps, rows, applied };
}

describe("processFloorBatch", () => {
  it("applies commands in seq order, once each, even if the batch is resent", async () => {
    const { deps, applied } = fakeDeps();
    const batch = { deviceId: "ipad", sentAt: NOW, commands: [command(2, NOW - MIN), command(1, NOW - 2 * MIN)] };

    const first = await processFloorBatch(batch, deps);
    expect(first.map((outcome) => outcome.status)).toEqual(["applied", "applied"]);
    expect(applied.map((entry) => entry.id.slice(-1))).toEqual(["1", "2"]);

    const again = await processFloorBatch(batch, deps);
    expect(again.map((outcome) => outcome.status)).toEqual(["applied", "applied"]);
    expect(applied).toHaveLength(2); // el reenvío no aplica nada otra vez
  });

  it("stops at a transient error and keeps the rest for the next attempt (order preserved)", async () => {
    let fail = true;
    const { deps, applied } = fakeDeps({
      apply: (context) => {
        if (context.command.seq === 2 && fail) throw new Error("timeout");
      },
    });
    const batch = { deviceId: "ipad", sentAt: NOW, commands: [command(1, NOW), command(2, NOW), command(3, NOW)] };

    const first = await processFloorBatch(batch, deps);
    expect(first.map((outcome) => outcome.status)).toEqual(["applied", "retry"]);
    expect(applied).toHaveLength(1);

    fail = false;
    const second = await processFloorBatch(batch, deps);
    expect(second.map((outcome) => outcome.status)).toEqual(["applied", "applied", "applied"]);
    expect(applied.map((entry) => entry.id.slice(-1))).toEqual(["1", "2", "3"]);
  });

  it("rejects a permanent failure and continues with the next command", async () => {
    const { deps } = fakeDeps({
      apply: (context) => {
        if (context.command.seq === 1) throw new FloorRejection("La sesión no existe.");
      },
    });
    const outcomes = await processFloorBatch({ deviceId: "ipad", sentAt: NOW, commands: [command(1, NOW), command(2, NOW)] }, deps);
    expect(outcomes).toEqual([
      expect.objectContaining({ status: "rejected", error: "La sesión no existe." }),
      expect.objectContaining({ status: "applied" }),
    ]);
  });

  it("gives up on a command that keeps failing so it cannot block the queue forever", async () => {
    const { deps, rows } = fakeDeps({
      apply: () => {
        throw new Error("bug");
      },
    });
    const batch = { deviceId: "ipad", sentAt: NOW, commands: [command(1, NOW)] };
    let last: FloorCommandOutcome[] = [];
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      last = await processFloorBatch(batch, deps);
    }
    expect(last[0]).toMatchObject({ status: "rejected", error: "Error repetido del servidor: bug" });
    expect([...rows.values()][0].status).toBe("rejected");
  });

  it("keeps the work and returns flags the applier raised", async () => {
    const { deps } = fakeDeps({ apply: (context) => void context.flags.push("machine_not_in_production") });
    const [outcome] = await processFloorBatch({ deviceId: "ipad", sentAt: NOW, commands: [command(1, NOW)] }, deps);
    expect(outcome).toMatchObject({ status: "applied_flagged", flags: ["machine_not_in_production"] });
  });

  it("corrects the iPad clock with the difference measured when sending", async () => {
    const { deps, applied } = fakeDeps();
    // El iPad va 10 minutos adelantado: su "ahora" es NOW + 10 min y el toque fue hace 3 min (su reloj).
    const deviceNow = NOW + 10 * MIN;
    await processFloorBatch({ deviceId: "ipad", sentAt: deviceNow, commands: [command(1, deviceNow - 3 * MIN)] }, deps);
    expect(applied[0].occurredAt.getTime()).toBe(NOW - 3 * MIN);
  });

  it("clamps future times to now and flags them", async () => {
    const { deps, applied } = fakeDeps();
    const [outcome] = await processFloorBatch({ deviceId: "ipad", sentAt: NOW, commands: [command(1, NOW + 30 * MIN)] }, deps);
    expect(applied[0].occurredAt.getTime()).toBe(NOW);
    expect(outcome.flags).toContain("future_time");
  });

  it("ignores clock noise under the tolerance", () => {
    expect(clockOffsetMs(NOW, NOW - 3_000)).toBe(0);
    expect(clockOffsetMs(NOW, NOW - 60_000)).toBe(60_000);
  });
});

describe("parseFloorCommand", () => {
  it("accepts a well-formed command and rejects a malformed one by id", () => {
    const good = command(1, NOW);
    expect(parseFloorCommand(good)).toEqual({ ok: true, command: good });
    expect(parseFloorCommand({ ...good, payload: { workerId: "x" } })).toEqual({ ok: false, id: good.id, error: "Comando inválido." });
    expect(parseFloorCommand({ nope: true })).toEqual({ ok: false, id: null, error: "Comando inválido." });
  });
});
