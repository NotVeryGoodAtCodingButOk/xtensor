import { describe, expect, it } from "vitest";
import {
  buildMovedQueueOrder,
  changedQueueIds,
  FACTORY_BOARD_STATUSES,
  normalizeMachineStatusFilter,
  planQueueReorder,
} from "@/services/machines";
import { DEFAULT_SETTINGS, DEFAULT_STAGES } from "@/services/calculations";
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
  // Lunes 1 jun: acumulado 140 → mar 2, 280 → jue 4, 420 → lun 8, 560 → mié 10.
  const queue = ["m1", "m2", "m3", "m4"].map((id, index) => queueMachine(id, index + 1));
  const base = { queue, settings: DEFAULT_SETTINGS, holidays: [], startDate: new Date(2026, 5, 1, 12) };

  it("moving the last machine first re-dates every machine whose index changed", () => {
    const plan = planQueueReorder({ ...base, orderedIds: ["m4", "m1", "m2", "m3"] });

    expect(plan.orderedIds).toEqual(["m4", "m1", "m2", "m3"]);
    expect(plan.reestimatedDates).toEqual({
      m4: "2026-06-02",
      m1: "2026-06-04",
      m2: "2026-06-08",
      m3: "2026-06-10",
    });
  });

  it("only returns dates for the ids whose index changed", () => {
    const plan = planQueueReorder({ ...base, orderedIds: ["m1", "m3", "m2", "m4"] });

    expect(plan.reestimatedDates).toEqual({ m3: "2026-06-04", m2: "2026-06-08" });
  });

  it("drops unknown ids, appends the missing ones in their current order, and is a no-op when nothing moves", () => {
    const plan = planQueueReorder({ ...base, orderedIds: ["x9", "m2", "m2"] });

    expect(plan.orderedIds).toEqual(["m2", "m1", "m3", "m4"]);
    expect(Object.keys(plan.reestimatedDates).sort()).toEqual(["m1", "m2"]);
    expect(planQueueReorder({ ...base, orderedIds: [] }).reestimatedDates).toEqual({});
  });

  it("counts machines that just entered as changed, plus the ones they displaced", () => {
    // m5 entra en la posición 2: antes la cola era m1, m2, m3, m4.
    const entering = [...queue.slice(0, 1), queueMachine("m5", 2), ...queue.slice(1).map((m, i) => ({ ...m, orderPosition: i + 3 }))];
    const plan = planQueueReorder({
      ...base,
      queue: entering,
      orderedIds: ["m1", "m5", "m2", "m3", "m4"],
      previousIds: ["m1", "m2", "m3", "m4"],
    });

    expect(Object.keys(plan.reestimatedDates)).toEqual(["m5", "m2", "m3", "m4"]);
    expect(plan.reestimatedDates.m5).toBe("2026-06-04");
  });
});
