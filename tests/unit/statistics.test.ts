import { describe, expect, it } from "vitest";
import {
  buildStatisticsDashboard,
  calculateLaborHoursBetween,
  calculateMachineTiming,
  calculateWorkingHoursBetween,
  resolveStatisticsRange,
  type MachineTimingInput,
} from "@/services/statistics";
import type { ProductionSettings } from "@/services/calculations";
import type { Holiday } from "@/services/schedule";

const settings: ProductionSettings = {
  hourlyCostPerWorkerCop: 22019.57,
  laborFactor: 0.3,
  dailyHoursMonFri: 9,
  dailyHoursFri: 9,
  dailyHoursSat: 6,
  dailyHoursSun: 0,
  activeWorkersCount: 9,
  clientBufferDays: 3,
  shippedRetentionDays: 60,
};

const noHolidays: Holiday[] = [];

describe("statistics working-time calculations", () => {
  it("counts only configured working hours across weekdays and weekends", () => {
    const hours = calculateWorkingHoursBetween(
      "2026-06-05T16:00:00-05:00",
      "2026-06-08T10:00:00-05:00",
      settings,
      noHolidays,
    );

    expect(hours).toBe(9);
  });

  it("excludes configured holidays", () => {
    const hours = calculateWorkingHoursBetween(
      "2026-06-05T16:00:00-05:00",
      "2026-06-08T10:00:00-05:00",
      settings,
      [{ date: "2026-06-06", name: "Festivo de prueba", isCustom: true }],
    );

    expect(hours).toBe(3);
  });
});

describe("labor schedule calculations", () => {
  it("counts Monday labor hours within the 8:00-16:15 productive window", () => {
    // 2026-06-01 is a Monday; productive window is 8:00 to 16:15 (8.25h).
    const hours = calculateLaborHoursBetween(
      "2026-06-01T09:00:00-05:00",
      "2026-06-01T14:00:00-05:00",
      noHolidays,
    );

    expect(hours).toBe(5);
  });

  it("closes Friday labor early at 13:45", () => {
    // 2026-06-05 is a Friday; productive window is 8:00 to 13:45 (5.75h).
    const hours = calculateLaborHoursBetween(
      "2026-06-05T13:00:00-05:00",
      "2026-06-05T18:00:00-05:00",
      noHolidays,
    );

    expect(hours).toBe(0.75);
  });
});

describe("machine timing", () => {
  it("derives labor cost as a share of sale price", () => {
    const timing = calculateMachineTiming(
      machine({
        salePriceCop: 1_000_000,
        stages: [
          stage(1, "Material", 1, 100, "2026-06-01T09:00:00-05:00"),
          stage(2, "Empacar", 2, 100, "2026-06-01T14:00:00-05:00"),
        ],
        logs: [
          log("l1", 1, 0, 100, "2026-06-01T09:00:00-05:00"),
          log("l2", 2, 0, 100, "2026-06-01T14:00:00-05:00"),
        ],
      }),
      settings,
      noHolidays,
      new Date("2026-06-02T10:00:00-05:00"),
    );

    // 09:00 → 14:00 on a Monday = 5 labor hours.
    expect(timing.laborHours).toBe(5);
    expect(timing.laborCostCop).toBeCloseTo(5 * settings.hourlyCostPerWorkerCop, 2);
    expect(timing.laborCostPctOfSale).toBeCloseTo((5 * settings.hourlyCostPerWorkerCop) / 1_000_000 * 100, 4);
  });

  it("computes previo lead time from ordered to received", () => {
    const timing = calculateMachineTiming(
      machine({
        previos: [
          {
            previoCatalogId: "p1",
            name: "Láser",
            ordered: true,
            orderedAt: "2026-06-01T08:00:00-05:00",
            received: true,
            receivedAt: "2026-06-03T08:00:00-05:00",
          },
          {
            previoCatalogId: "p2",
            name: "Doblado",
            ordered: true,
            orderedAt: "2026-06-01T08:00:00-05:00",
            received: false,
            receivedAt: null,
          },
        ],
      }),
      settings,
      noHolidays,
      new Date("2026-06-02T08:00:00-05:00"),
    );

    // Calendar lead time: 2 days = 48 hours.
    expect(timing.previos[0].leadTimeHours).toBe(48);
    expect(timing.previos[1].isOrderedPending).toBe(true);
    expect(timing.previos[1].pendingAgingHours).toBe(24);
  });
});

describe("machine timing legacy", () => {
  it("uses the latest valid 100% completion after rework", () => {
    const timing = calculateMachineTiming(
      machine({
        stages: [
          stage(1, "Material", 1, 100, "2026-06-01T09:00:00-05:00"),
          stage(2, "Armar", 2, 100, "2026-06-02T09:00:00-05:00"),
        ],
        logs: [
          log("l1", 1, 0, 100, "2026-06-01T09:00:00-05:00"),
          log("l2", 2, 0, 100, "2026-06-01T10:00:00-05:00"),
          log("l3", 2, 100, 75, "2026-06-01T11:00:00-05:00"),
          log("l4", 2, 75, 100, "2026-06-02T09:00:00-05:00"),
        ],
      }),
      settings,
      noHolidays,
      new Date("2026-06-02T10:00:00-05:00"),
    );

    expect(timing.productionCompletedAt).toBe("2026-06-02T09:00:00-05:00");
    expect(timing.productionActualStartAt).toBe("2026-06-01T09:00:00-05:00");
    expect(timing.productionHours).toBe(9);
    expect(timing.orderToCompletionHours).toBe(10);
    expect(timing.stages[1].workingHours).toBe(9);
  });

  it("does not treat a currently regressed stage as completed", () => {
    const timing = calculateMachineTiming(
      machine({
        stages: [
          stage(1, "Material", 1, 100, "2026-06-01T09:00:00-05:00"),
          stage(2, "Armar", 2, 75, "2026-06-01T11:00:00-05:00"),
        ],
        logs: [
          log("l1", 1, 0, 100, "2026-06-01T09:00:00-05:00"),
          log("l2", 2, 0, 100, "2026-06-01T10:00:00-05:00"),
          log("l3", 2, 100, 75, "2026-06-01T11:00:00-05:00"),
        ],
      }),
      settings,
      noHolidays,
      new Date("2026-06-01T12:00:00-05:00"),
    );

    expect(timing.productionCompletedAt).toBeNull();
    expect(timing.currentOpenStage?.stageName).toBe("Armar");
    expect(timing.currentOpenStage?.agingHours).toBe(3);
  });
});

describe("statistics dashboard aggregation", () => {
  it("aggregates completed machines in the selected range", () => {
    const range = resolveStatisticsRange("current-month", new Date("2026-06-15T12:00:00-05:00"));
    const dashboard = buildStatisticsDashboard({
      machines: [
        machine({
          id: "m1",
          serialNumber: 101,
          equipmentName: "Equipo A",
          stages: [
            stage(1, "Material", 1, 100, "2026-06-01T09:00:00-05:00"),
            stage(2, "Empacar", 2, 100, "2026-06-02T09:00:00-05:00"),
          ],
          logs: [
            log("m1-l1", 1, 0, 100, "2026-06-01T09:00:00-05:00"),
            log("m1-l1r", 1, 100, 0, "2026-06-01T12:00:00-05:00"),
            log("m1-l1c", 1, 0, 100, "2026-06-01T13:00:00-05:00"),
            log("m1-l2", 2, 0, 100, "2026-06-02T09:00:00-05:00"),
          ],
          shippedAt: "2026-06-02T11:00:00-05:00",
          status: "shipped",
        }),
        machine({
          id: "m2",
          serialNumber: 102,
          equipmentName: "Equipo B",
          stages: [
            stage(1, "Material", 1, 100, "2026-05-20T09:00:00-05:00"),
            stage(2, "Empacar", 2, 100, "2026-05-21T09:00:00-05:00"),
          ],
          logs: [
            log("m2-l1", 1, 0, 100, "2026-05-20T09:00:00-05:00"),
            log("m2-l2", 2, 0, 100, "2026-05-21T09:00:00-05:00"),
          ],
          shippedAt: "2026-05-21T10:00:00-05:00",
          status: "shipped",
        }),
      ],
      warrantyEvents: [
        {
          id: "w1",
          machineId: "m1",
          serialNumber: 101,
          clientName: "Cliente A",
          equipmentName: "Equipo A",
          message: "Puerta desalineada",
          createdAt: "2026-06-03T09:00:00-05:00",
        },
      ],
      range,
      settings,
      holidays: noHolidays,
      now: new Date("2026-06-15T12:00:00-05:00"),
    });

    expect(dashboard.summary.completedMachinesCount).toBe(1);
    expect(dashboard.summary.shippedMachinesCount).toBe(1);
    expect(dashboard.summary.production.averageHours).toBe(9);
    expect(dashboard.summary.orderToCompletion.averageHours).toBe(10);
    expect(dashboard.summary.productionToShipment.averageHours).toBe(2);
    expect(dashboard.summary.warrantyCount).toBe(1);
    expect(dashboard.summary.reprocessCount).toBe(1);
    expect(dashboard.breakdowns.byEquipment).toHaveLength(1);
    expect(dashboard.breakdowns.byEquipment[0].label).toBe("Equipo A");
    expect(dashboard.stages[0]?.reprocessCount).toBe(1);
    expect(dashboard.workers[0]?.reprocessCount).toBe(1);
    expect(dashboard.warrantyEvents[0].message).toBe("Puerta desalineada");
  });
});

function machine(overrides: Partial<MachineTimingInput> = {}): MachineTimingInput {
  return {
    id: "m1",
    serialNumber: 100,
    clientName: "Cliente",
    equipmentName: "Equipo",
    line: "PRO",
    colorName: "Negro",
    city: "Bogotá",
    promisedDate: "2026-06-03",
    status: "in_production",
    salePriceCop: 10_000_000,
    createdAt: "2026-06-01T08:00:00-05:00",
    shippedAt: null,
    stages: [],
    logs: [],
    previos: [],
    ...overrides,
  };
}

function stage(
  id: number,
  name: string,
  displayOrder: number,
  completion: number,
  lastUpdatedAt: string | null,
) {
  return {
    id,
    name,
    displayOrder,
    completion,
    lastUpdatedAt,
  };
}

function log(
  id: string,
  stageId: number,
  previousCompletion: number,
  newCompletion: number,
  createdAt: string,
) {
  return {
    id,
    stageId,
    workerId: "w1",
    workerName: "Operario",
    previousCompletion,
    newCompletion,
    isReprocess: previousCompletion >= 100 && newCompletion < 100,
    isUndone: false,
    createdAt,
  };
}
