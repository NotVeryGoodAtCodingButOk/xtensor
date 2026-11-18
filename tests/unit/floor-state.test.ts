import { describe, expect, it } from "vitest";
import type { FloorCommand, FloorIntent } from "@/lib/floor/commands";
import {
  applyCommand,
  closedSegmentsMs,
  openActivityOf,
  pausedActivitiesOf,
  projectState,
  stateFromSnapshot,
  type FloorState,
} from "@/lib/floor/state";
import type { FloorMachine, FloorSnapshot } from "@/lib/floor/types";

const MIN = 60_000;
const T0 = Date.UTC(2026, 10, 18, 13, 0, 0);

function machine(id: string, serial: number, done: number[] = []): FloorMachine {
  const stages: FloorMachine["stages"] = {};
  for (let stageId = 1; stageId <= 3; stageId++) {
    stages[stageId] = { completion: done.includes(stageId) ? 100 : 0, lastDoneAt: null, lastIsReprocess: false };
  }
  return { id, serial, code: "X", name: `Máquina ${serial}`, client: "Cliente", city: null, color: null, status: "in_production", order: serial, stages };
}

function snapshot(overrides: Partial<FloorSnapshot> = {}): FloorSnapshot {
  return {
    version: 1,
    serverTime: T0,
    workers: [
      { id: "w1", name: "Ana", role: "Armadora", color: null },
      { id: "w2", name: "Beto", role: "Pintor", color: null },
    ],
    stages: [
      { id: 1, name: "Armar" },
      { id: 2, name: "Pulir" },
      { id: 3, name: "Pintar" },
    ],
    machines: [machine("m1", 101), machine("m2", 102)],
    activityMachines: [
      { id: "m1", serial: 101, name: "Máquina 101", client: "Cliente", status: "in_production" },
      { id: "m9", serial: 109, name: "Máquina 109", client: "Cliente", status: "shipped" },
    ],
    activityTypes: [
      { id: "t5s", name: "5S", description: null, allowsMachine: false },
      { id: "tfix", name: "Arreglar máquinas", description: null, allowsMachine: true },
    ],
    activities: [],
    previoRows: [
      { machineId: "m1", serial: 101, client: "Cliente", equipment: "Máquina", color: null, promisedDate: "2026-12-01", previos: [{ previoCatalogId: "p1", name: "Láser", received: false }] },
    ],
    ...overrides,
  };
}

let seq = 0;
function cmd(intent: FloorIntent, at: number): FloorCommand {
  seq += 1;
  return { id: `c${seq}`, v: 1, seq, at, ...intent } as FloorCommand;
}

function run(state: FloorState, intent: FloorIntent, at: number) {
  const result = applyCommand(state, cmd(intent, at));
  if (!result.ok) throw new Error(result.error);
  return result;
}

describe("floor state: stage sessions", () => {
  it("start → pause → resume → finish keeps the accumulated time and marks the stage done", () => {
    let state = stateFromSnapshot(snapshot());
    state = run(state, { type: "session.start_stage", payload: { workerId: "w1", sessionId: "s1", activityId: "a1", stageId: 1, machineIds: ["m1"] } }, T0).state;
    expect(openActivityOf(state, "w1")?.activityId).toBe("a1");

    state = run(state, { type: "session.pause", payload: { workerId: "w1", sessionId: "s1" } }, T0 + 30 * MIN).state;
    expect(openActivityOf(state, "w1")).toBeNull();
    const paused = pausedActivitiesOf(state, "w1");
    expect(paused).toHaveLength(1);
    expect(closedSegmentsMs(paused[0])).toBe(30 * MIN);

    state = run(state, { type: "session.resume", payload: { workerId: "w1", sessionId: "s2", activityId: "a1" } }, T0 + 60 * MIN).state;
    expect(openActivityOf(state, "w1")?.segments.map((segment) => segment.id)).toEqual(["s1", "s2"]);

    const finished = run(state, { type: "session.finish", payload: { workerId: "w1", sessionId: "s2" } }, T0 + 75 * MIN);
    expect(openActivityOf(finished.state, "w1")).toBeNull();
    expect(pausedActivitiesOf(finished.state, "w1")).toHaveLength(0);
    expect(finished.state.machines.m1.stages[1]).toMatchObject({ completion: 100, lastDoneAt: T0 + 75 * MIN });
  });

  it("refuses a second session while one is open, with the same message as before", () => {
    const state = run(stateFromSnapshot(snapshot()), { type: "session.start_stage", payload: { workerId: "w1", sessionId: "s1", activityId: "a1", stageId: 1, machineIds: ["m1"] } }, T0).state;
    const result = applyCommand(state, cmd({ type: "session.start_stage", payload: { workerId: "w1", sessionId: "s2", activityId: "a2", stageId: 2, machineIds: ["m1"] } }, T0 + MIN));
    expect(result).toEqual({ ok: false, error: "Termina o pausa lo que tienes en curso." });
    // Otro operario sí puede.
    expect(applyCommand(state, cmd({ type: "session.start_stage", payload: { workerId: "w2", sessionId: "s3", activityId: "a3", stageId: 2, machineIds: ["m1"] } }, T0 + MIN)).ok).toBe(true);
  });

  it("only allows stage sessions on machines in production", () => {
    const state = stateFromSnapshot(snapshot());
    const result = applyCommand(state, cmd({ type: "session.start_stage", payload: { workerId: "w1", sessionId: "s1", activityId: "a1", stageId: 1, machineIds: ["m9"] } }, T0));
    expect(result).toEqual({ ok: false, error: "Todas las máquinas deben estar en producción." });
  });

  it("finishing the last pending stage reports the machine as finished", () => {
    const base = stateFromSnapshot(snapshot({ machines: [machine("m1", 101, [1, 2])] }));
    let state = run(base, { type: "session.start_stage", payload: { workerId: "w1", sessionId: "s1", activityId: "a1", stageId: 3, machineIds: ["m1"] } }, T0).state;
    const result = run(state, { type: "session.finish", payload: { workerId: "w1", sessionId: "s1" } }, T0 + MIN);
    expect(result.effects.finishedMachineIds).toEqual(["m1"]);
    state = result.state;
    expect(state.machines.m1.status).toBe("finished");
  });

  it("a group session splits nothing locally but completes the stage on every machine", () => {
    let state = run(stateFromSnapshot(snapshot()), { type: "session.start_stage", payload: { workerId: "w1", sessionId: "s1", activityId: "a1", stageId: 2, machineIds: ["m1", "m2"] } }, T0).state;
    state = run(state, { type: "session.finish", payload: { workerId: "w1", sessionId: "s1" } }, T0 + MIN).state;
    expect(state.machines.m1.stages[2].completion).toBe(100);
    expect(state.machines.m2.stages[2].completion).toBe(100);
  });

  it("closing an already closed session fails like the server did", () => {
    const state = stateFromSnapshot(snapshot());
    const result = applyCommand(state, cmd({ type: "session.finish", payload: { workerId: "w1", sessionId: "nope" } }, T0));
    expect(result).toEqual({ ok: false, error: "Esta sesión ya fue cerrada." });
  });

  it("finishing a paused activity marks the stage without reopening the timer", () => {
    let state = run(stateFromSnapshot(snapshot()), { type: "session.start_stage", payload: { workerId: "w1", sessionId: "s1", activityId: "a1", stageId: 1, machineIds: ["m1"] } }, T0).state;
    state = run(state, { type: "session.pause", payload: { workerId: "w1", sessionId: "s1" } }, T0 + MIN).state;
    state = run(state, { type: "activity.finish_paused", payload: { workerId: "w1", activityId: "a1" } }, T0 + 2 * MIN).state;
    expect(state.activities).toHaveLength(0);
    expect(state.machines.m1.stages[1].completion).toBe(100);
  });

  it("a new session on a stage last sent back to reprocess counts as reprocess", () => {
    const reprocessed = machine("m1", 101);
    reprocessed.stages[1] = { completion: 0, lastDoneAt: T0 - 60 * MIN, lastIsReprocess: true };
    const state = run(stateFromSnapshot(snapshot({ machines: [reprocessed] })), { type: "session.start_stage", payload: { workerId: "w1", sessionId: "s1", activityId: "a1", stageId: 1, machineIds: ["m1"] } }, T0).state;
    expect(openActivityOf(state, "w1")?.isReprocess).toBe(true);
  });
});

describe("floor state: other activities", () => {
  it("validates the catalog and the machine rule", () => {
    const state = stateFromSnapshot(snapshot());
    expect(applyCommand(state, cmd({ type: "session.start_other", payload: { workerId: "w1", sessionId: "s1", activityId: "a1", activityTypeIds: [], machineIds: [] } }, T0))).toEqual({ ok: false, error: "Selecciona al menos una actividad." });
    expect(applyCommand(state, cmd({ type: "session.start_other", payload: { workerId: "w1", sessionId: "s1", activityId: "a1", activityTypeIds: ["t5s"], machineIds: ["m1"] } }, T0))).toEqual({ ok: false, error: "Esta actividad no se asocia a máquinas." });

    const started = run(state, { type: "session.start_other", payload: { workerId: "w1", sessionId: "s1", activityId: "a1", activityTypeIds: ["tfix"], machineIds: ["m9"] } }, T0);
    expect(openActivityOf(started.state, "w1")).toMatchObject({ kind: "other", machineSerials: [109] });
    expect(applyCommand(started.state, cmd({ type: "session.pause", payload: { workerId: "w1", sessionId: "s1" } }, T0 + MIN)).ok).toBe(false);
    expect(run(started.state, { type: "session.finish", payload: { workerId: "w1", sessionId: "s1" } }, T0 + MIN).state.activities).toHaveLength(0);
  });
});

describe("floor state: stage marks", () => {
  it("un-marking within 5 minutes of the mark is a correction (undo), later it is a reprocess", () => {
    let state = stateFromSnapshot(snapshot());
    state = run(state, { type: "stage.set", payload: { workerId: "w1", machineId: "m1", stageId: 1, completion: 100 } }, T0).state;

    const quick = run(state, { type: "stage.set", payload: { workerId: "w1", machineId: "m1", stageId: 1, completion: 0 } }, T0 + 2 * MIN);
    expect(quick.effects.revert).toBe("undo");

    const late = run(state, { type: "stage.set", payload: { workerId: "w1", machineId: "m1", stageId: 1, completion: 0 } }, T0 + 20 * MIN);
    expect(late.effects.revert).toBe("reprocess");
    expect(late.state.machines.m1.stages[1].lastIsReprocess).toBe(true);
  });

  it("uses the tap times, not the sync time: a mark and un-mark made offline 2 minutes apart stay an undo", () => {
    // Mismo par de toques, proyectado mucho después (al reconectar): la ventana se mide con `at`.
    const base = stateFromSnapshot(snapshot());
    const state = projectState(base, [
      cmd({ type: "stage.set", payload: { workerId: "w1", machineId: "m1", stageId: 2, completion: 100 } }, T0),
      cmd({ type: "stage.set", payload: { workerId: "w1", machineId: "m1", stageId: 2, completion: 0 } }, T0 + 2 * MIN),
    ]);
    expect(state.machines.m1.stages[2]).toMatchObject({ completion: 0, lastIsReprocess: false });
  });

  it("marking a stage that is already in that state is a no-op (not queued)", () => {
    const result = run(stateFromSnapshot(snapshot()), { type: "stage.set", payload: { workerId: "w1", machineId: "m1", stageId: 1, completion: 0 } }, T0);
    expect(result.effects.noop).toBe(true);
  });
});

describe("floor state: almacén", () => {
  it("toggles received and ignores repeats", () => {
    const state = stateFromSnapshot(snapshot());
    const checked = run(state, { type: "previo.set_received", payload: { machineId: "m1", previoCatalogId: "p1", received: true } }, T0);
    expect(checked.state.previoRows[0].previos[0].received).toBe(true);
    expect(run(checked.state, { type: "previo.set_received", payload: { machineId: "m1", previoCatalogId: "p1", received: true } }, T0).effects.noop).toBe(true);
  });
});

describe("floor state: snapshot clock", () => {
  it("shifts server times to the iPad clock so timers are right", () => {
    const snap = snapshot({
      activities: [
        {
          activityId: "a1", workerId: "w1", kind: "stage", stageId: 1, activityTypeIds: [], note: null, isReprocess: false,
          machineIds: ["m1"], machineSerials: [101],
          segments: [{ id: "s1", startedAt: T0, endedAt: null, endReason: null }],
        },
      ],
    });
    // El iPad va 2 minutos atrasado: el servidor marca T0, el iPad marca T0 - 2 min.
    const state = stateFromSnapshot(snap, 2 * MIN);
    expect(openActivityOf(state, "w1")?.segments[0].startedAt).toBe(T0 - 2 * MIN);
  });
});
