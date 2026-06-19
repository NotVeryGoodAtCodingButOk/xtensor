import { describe, expect, it } from "vitest";
import { buildMovedQueueOrder, FACTORY_BOARD_STATUSES, normalizeMachineStatusFilter } from "@/services/machines";

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
