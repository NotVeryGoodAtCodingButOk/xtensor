import { describe, expect, it } from "vitest";
import {
  buildMovedQueueOrder,
  calculateMachines,
  changedQueueIds,
  FACTORY_BOARD_STATUSES,
  normalizeMachineStatusFilter,
  planQueueReorder,
  shiftReestimatedDates,
} from "@/services/machines";
import { DEFAULT_SETTINGS, DEFAULT_STAGES, isBehindReestimate } from "@/services/calculations";
import type { MachineView } from "@/types/domain";

describe("factory board visibility", () => {
  it("keeps finished machines visible until they are shipped", () => {
    expect(FACTORY_BOARD_STATUSES).toEqual(["in_production", "finished"]);
    expect(FACTORY_BOARD_STATUSES).not.toContain("shipped");
  });

  it("normalizes multi-status filters without duplicates", () => {
    expect(normalizeMachineStatusFilter(["in_production", "finished", "finished"])).toEqual([
      "in_production",
      "finished",
    ]);
  });
});

describe("production queue ordering", () => {
  it("renumbers the full queue when a machine moves to a later position", () => {
    const queue = Array.from({ length: 9 }, (_, index) => ({
      id: `m${index + 1}`,
      order_position: index + 1,
      status: "in_production" as const,
      created_at: `2026-01-${String(index + 1).padStart(2, "0")}T00:00:00.000Z`,
    }));

    const orderedIds = buildMovedQueueOrder(queue, "m5", 9);

    expect(orderedIds).toEqual(["m1", "m2", "m3", "m4", "m6", "m7", "m8", "m9", "m5"]);
    expect(orderedIds).toHaveLength(9);
    expect(new Set(orderedIds).size).toBe(9);
  });

  it("clamps the target position to the end of the queue", () => {
    const queue = [
      { id: "m1", order_position: 1, status: "in_production" as const, created_at: "2026-01-01T00:00:00.000Z" },
      { id: "m2", order_position: 2, status: "in_production" as const, created_at: "2026-01-02T00:00:00.000Z" },
      { id: "m3", order_position: 3, status: "in_production" as const, created_at: "2026-01-03T00:00:00.000Z" },
    ];

    const orderedIds = buildMovedQueueOrder(queue, "m1", 99);

    expect(orderedIds).toEqual(["m2", "m3", "m1"]);
  });
});

describe("changedQueueIds", () => {
  it("returns only ids whose index moved", () => {
    const before = ["m1", "m2", "m3", "m4"];
    const after = ["m1", "m3", "m4", "m2"];

    expect(changedQueueIds(before, after)).toEqual(["m3", "m4", "m2"]);
  });

  it("returns an empty array when the order is unchanged", () => {
    const ids = ["m1", "m2", "m3"];
    expect(changedQueueIds(ids, [...ids])).toEqual([]);
  });

  it("counts ids new to the list as changed", () => {
    const before = ["m1", "m2"];
    const after = ["m1", "m3", "m2"];

    expect(changedQueueIds(before, after)).toEqual(["m3", "m2"]);
  });
});

/** 140 h de mano de obra con el 30% general y el costo hora por defecto. */
const SALE_PRICE_140_HOURS = (140 * DEFAULT_SETTINGS.hourlyCostPerWorkerCop) / DEFAULT_SETTINGS.laborFactor;

function queueMachine(id: string, orderPosition: number): MachineView {
  return {
    id,
    serialNumber: orderPosition,
    clientId: "c1",
    clientName: "Cliente",
    equipmentId: null,
    equipmentCode: null,
    equipmentName: "Equipo",
    equipmentLaborFactor: null,
    colorId: null,
    colorName: null,
    city: null,
    line: null,
    salePriceCop: SALE_PRICE_140_HOURS,
    assignedTo: null,
    promisedDate: "2026-06-30",
    reestimatedDate: null,
    orderPosition,
    status: "in_production",
    shippedAt: null,
    productionStartedAt: null,
    firstTaskAt: null,
    completedAt: null,
    isReproceso: false,
    isWarranty: false,
    stages: DEFAULT_STAGES.map((stage) => ({
      id: stage.id,
      name: stage.name,
      completionPercentage: stage.completionPercentage,
      completion: 0,
      lastWorkerName: null,
      lastUpdatedAt: null,
    })),
    openReprocessStages: [],
  };
}

describe("planQueueReorder", () => {
  // Planta: 9 operarios × 8,25 h = 74,25 h/día (viernes 51,75 h). Cada máquina pide 140 h.
  // Lunes 1 jun: acumulado 140 → mar 2, 280 → jue 4, 420 → lun 8, 560 → mié 10, 700 → lun 15.
  // Reestimadas con atraso real: m1 va 4 días tarde (29 may) y m3 3 días tarde (5 jun).
  const reestimated: Record<string, string> = { m1: "2026-05-29", m2: "2026-06-04", m3: "2026-06-05", m4: "2026-06-10" };
  const queue = ["m1", "m2", "m3", "m4"].map((id, index) => ({
    ...queueMachine(id, index + 1),
    reestimatedDate: reestimated[id],
  }));
  const base = { queue, settings: DEFAULT_SETTINGS, holidays: [], startDate: new Date(2026, 5, 1, 12) };

  it("moving the last machine first shifts each reestimada exactly its delta and keeps the real delay", () => {
    const plan = planQueueReorder({ ...base, orderedIds: ["m4", "m1", "m2", "m3"] });

    expect(plan.orderedIds).toEqual(["m4", "m1", "m2", "m3"]);
    // Actualizada: m4 10 → 2 jun (−8), m1 2 → 4 (+2), m2 4 → 8 (+4), m3 8 → 10 (+2).
    expect(plan.reestimatedDates).toEqual({
      m4: "2026-06-02",
      m1: "2026-05-31",
      m2: "2026-06-08",
      m3: "2026-06-07",
    });

    // El atraso (Actualizada − Reestimada) sigue igual: m1 4 días, m3 3 días, m2 y m4 al día.
    const after: Record<string, string> = { m4: "2026-06-02", m1: "2026-06-04", m2: "2026-06-08", m3: "2026-06-10" };
    for (const id of ["m1", "m2", "m3", "m4"]) {
      expect(isBehindReestimate({ estimatedDate: after[id], reestimatedDate: plan.reestimatedDates[id] })).toBe(
        id === "m1" || id === "m3",
      );
    }
  });

  it("only returns dates for the machines whose Actualizada moved", () => {
    // m1, m3, m2, m4: m3 8 → 4 jun (−4), m2 4 → 8 (+4); m1 y m4 no se mueven.
    const plan = planQueueReorder({ ...base, orderedIds: ["m1", "m3", "m2", "m4"] });

    expect(plan.reestimatedDates).toEqual({ m3: "2026-06-01", m2: "2026-06-08" });
  });

  it("drops unknown ids, appends the missing ones in their current order, and is a no-op when nothing moves", () => {
    const plan = planQueueReorder({ ...base, orderedIds: ["x9", "m2", "m2"] });

    expect(plan.orderedIds).toEqual(["m2", "m1", "m3", "m4"]);
    expect(plan.reestimatedDates).toEqual({ m2: "2026-06-02", m1: "2026-05-31" });
    expect(planQueueReorder({ ...base, orderedIds: [] }).reestimatedDates).toEqual({});
  });

  it("gives a machine that enters a fresh baseline and shifts the ones it displaces", () => {
    // m5 entra en la posición 2 (con una reestimada vieja de cuando estuvo antes en cola).
    const entering = [
      queue[0],
      { ...queueMachine("m5", 2), reestimatedDate: "2026-01-15" },
      ...queue.slice(1).map((machine, index) => ({ ...machine, orderPosition: index + 3 })),
    ];
    const plan = planQueueReorder({
      ...base,
      queue: entering,
      orderedIds: ["m1", "m5", "m2", "m3", "m4"],
      previousIds: ["m1", "m2", "m3", "m4"],
    });

    expect(plan.reestimatedDates).toEqual({
      m5: "2026-06-04", // línea base nueva = su Actualizada
      m2: "2026-06-08", // 4 → 8 (+4)
      m3: "2026-06-07", // 8 → 10 (+2), conserva sus 3 días de atraso
      m4: "2026-06-15", // 10 → 15 (+5)
    });
  });

  it("gives a machine without reestimada its Actualizada even if it did not move", () => {
    const withNull = queue.map((machine) => (machine.id === "m2" ? { ...machine, reestimatedDate: null } : machine));
    const plan = planQueueReorder({ ...base, queue: withNull, orderedIds: ["m1", "m2", "m3", "m4"] });

    expect(plan.reestimatedDates).toEqual({ m2: "2026-06-04" });
  });
});

describe("shiftReestimatedDates", () => {
  it("leaves alone the machines whose Actualizada did not change (e.g. after a % change)", () => {
    const shifted = shiftReestimatedDates({
      before: { a: "2026-06-02", b: "2026-06-04", c: "2026-06-08" },
      after: { a: "2026-06-02", b: "2026-06-06", c: "2026-06-05" },
      current: { a: "2026-05-30", b: "2026-06-01", c: "2026-06-08" },
    });

    expect(shifted).toEqual({ b: "2026-06-03", c: "2026-06-05" });
  });

  it("shifts across month and year boundaries in calendar days", () => {
    expect(
      shiftReestimatedDates({
        before: { a: "2026-12-28" },
        after: { a: "2027-01-04" },
        current: { a: "2026-12-30" },
      }),
    ).toEqual({ a: "2027-01-06" });
  });

  it("gives a fresh baseline to new machines and to machines without reestimada", () => {
    const shifted = shiftReestimatedDates({
      before: { a: "2026-06-02", b: "2026-06-04" },
      after: { a: "2026-06-02", b: "2026-06-04", c: "2026-06-09" },
      current: { a: null, b: "2026-06-04", c: "2026-03-01" },
    });

    expect(shifted).toEqual({ a: "2026-06-02", c: "2026-06-09" });
  });

  it("ignores machines that left the queue and baselines already equal to the Actualizada", () => {
    expect(
      shiftReestimatedDates({
        before: { gone: "2026-06-02", d: "2026-06-04" },
        after: { d: "2026-06-04", e: "2026-06-05" },
        current: { gone: "2026-06-01", d: "2026-06-03", e: "2026-06-05" },
      }),
    ).toEqual({});
  });
});

describe("replanning after a % change", () => {
  it("only shifts the machines whose Actualizada moved", () => {
    const startDate = new Date(2026, 5, 1, 12);
    const queue = ["m1", "m2", "m3", "m4"].map((id, index) => ({
      ...queueMachine(id, index + 1),
      reestimatedDate: "2026-06-01",
    }));
    const datesOf = (machines: MachineView[]) =>
      Object.fromEntries(
        calculateMachines(machines, DEFAULT_SETTINGS, [], startDate).map((machine) => [machine.id, machine.estimatedDate]),
      );

    // El equipo de la última máquina pasa de 30% (general) a 45%: solo su Actualizada se mueve.
    const before = datesOf(queue);
    const after = datesOf(queue.map((machine) => (machine.id === "m4" ? { ...machine, equipmentLaborFactor: 0.45 } : machine)));
    const shifted = shiftReestimatedDates({
      before,
      after,
      current: Object.fromEntries(queue.map((machine) => [machine.id, machine.reestimatedDate])),
    });

    expect(after.m4 > before.m4).toBe(true);
    expect(Object.keys(shifted)).toEqual(["m4"]);
  });
});
