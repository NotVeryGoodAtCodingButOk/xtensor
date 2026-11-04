import { describe, expect, it } from "vitest";
import { ACTIVITY_MACHINE_STATUSES, sortActivityMachines } from "@/services/work-sessions";

function row(
  serial: number,
  status: string,
  extra: Partial<{ order_position: number; completed_at: string | null; shipped_at: string | null }> = {},
) {
  return { serial_number: serial, status, order_position: 0, completed_at: null, shipped_at: null, ...extra };
}

describe("activity machine options", () => {
  it("allows activities on machines in production, finished and shipped", () => {
    expect(ACTIVITY_MACHINE_STATUSES).toEqual(["in_production", "finished", "shipped"]);
  });

  it("lists the queue first by position, then finished and shipped, newest first", () => {
    const sorted = sortActivityMachines([
      row(10, "shipped", { shipped_at: "2026-10-01T15:00:00Z" }),
      row(11, "finished", { completed_at: "2026-10-20T15:00:00Z" }),
      row(12, "in_production", { order_position: 2 }),
      row(13, "shipped", { shipped_at: "2026-11-01T15:00:00Z" }),
      row(14, "in_production", { order_position: 1 }),
      row(15, "finished", { completed_at: "2026-11-02T15:00:00Z" }),
      row(16, "pending"),
    ]);

    expect(sorted.map((machine) => machine.serial_number)).toEqual([14, 12, 15, 11, 13, 10]);
  });
});
