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
    orderPosition: 1,
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

describe("new dashboard KPIs", () => {
  // now = 2026-06-13 (Saturday); L30D window = 2026-05-15 .. 2026-06-13
  const now = new Date("2026-06-13T12:00:00-05:00");
  const range = resolveStatisticsRange("all-time", now);

  // Machine completed inside L30D (2026-06-01) — on-time (promised 2026-06-03)
  const mInsideL30d = machine({
    id: "ins1",
    serialNumber: 201,
    status: "shipped",
    salePriceCop: 6_000_000,
    promisedDate: "2026-06-03",
    shippedAt: "2026-06-02T10:00:00-05:00",
    stages: [
      stage(1, "Material", 1, 100, "2026-06-01T09:00:00-05:00"),
      stage(7, "Empacar", 7, 100, "2026-06-01T17:00:00-05:00"),
    ],
    logs: [
      log("ins1-l1", 1, 0, 100, "2026-06-01T09:00:00-05:00"),
      log("ins1-l7", 7, 0, 100, "2026-06-01T17:00:00-05:00"),
    ],
  });

  // Machine completed OUTSIDE L30D (2026-04-01) — late (promised 2026-03-01)
  const mOutsideL30d = machine({
    id: "out1",
    serialNumber: 202,
    status: "shipped",
    salePriceCop: 4_000_000,
    promisedDate: "2026-03-01",
    shippedAt: "2026-04-02T10:00:00-05:00",
    stages: [
      stage(1, "Material", 1, 100, "2026-04-01T09:00:00-05:00"),
      stage(7, "Empacar", 7, 100, "2026-04-01T17:00:00-05:00"),
    ],
    logs: [
      log("out1-l1", 1, 0, 100, "2026-04-01T09:00:00-05:00"),
      log("out1-l7", 7, 0, 100, "2026-04-01T17:00:00-05:00"),
    ],
  });

  // Machine with status "pending"
  const mPending = machine({
    id: "pend1",
    serialNumber: 203,
    status: "pending",
    orderPosition: 99,
  });

  // Machine shipped this month (June 2026)
  const mShippedJune = machine({
    id: "ship1",
    serialNumber: 204,
    status: "shipped",
    salePriceCop: 8_000_000,
    shippedAt: "2026-06-05T10:00:00-05:00",
    stages: [],
    logs: [],
  });

  function buildDashboard(machines: ReturnType<typeof machine>[]) {
    return buildStatisticsDashboard({
      machines,
      warrantyEvents: [],
      range,
      settings,
      holidays: [],
      now,
    });
  }

  it("currentPreviosCount counts only status===pending machines", () => {
    const dashboard = buildDashboard([mInsideL30d, mOutsideL30d, mPending]);
    expect(dashboard.summary.currentPreviosCount).toBe(1);
  });

  it("last30Days: totalProductionCop and finishedMachinesCount cover only machines in L30D window", () => {
    const dashboard = buildDashboard([mInsideL30d, mOutsideL30d]);
    const l30 = dashboard.summary.last30Days;
    // Only mInsideL30d (completed 2026-06-01) falls in the L30D window
    expect(l30.finishedMachinesCount).toBe(1);
    expect(l30.totalProductionCop).toBe(6_000_000);
    expect(l30.workerCount).toBe(settings.activeWorkersCount); // 9
    expect(l30.productionPerWorkerCop).toBeCloseTo(6_000_000 / 9, 2);
  });

  it("last30Days: productionPerWorkerCop is null when workerCount is 0", () => {
    const zeroWorkerSettings = { ...settings, activeWorkersCount: 0 };
    const dashboard = buildStatisticsDashboard({
      machines: [mInsideL30d],
      warrantyEvents: [],
      range,
      settings: zeroWorkerSettings,
      holidays: [],
      now,
    });
    expect(dashboard.summary.last30Days.productionPerWorkerCop).toBeNull();
  });

  it("onTimeCompletion.pct is correct", () => {
    // all-time range: both machines are completed
    // mInsideL30d: promisedDate=2026-06-03, completedAt=2026-06-01 → on-time
    // mOutsideL30d: promisedDate=2026-03-01, completedAt=2026-04-01 → LATE
    const dashboard = buildDashboard([mInsideL30d, mOutsideL30d]);
    const ot = dashboard.summary.onTimeCompletion;
    expect(ot.count).toBe(2);
    expect(ot.onTimeCount).toBe(1);
    expect(ot.pct).toBeCloseTo(50, 5);
  });

  it("onTimeCompletion.pct is null when no completed machines in range", () => {
    // current-month range with only a pending machine
    const rangeCurrentMonth = resolveStatisticsRange("current-month", now);
    const dashboard = buildStatisticsDashboard({
      machines: [mPending],
      warrantyEvents: [],
      range: rangeCurrentMonth,
      settings,
      holidays: [],
      now,
    });
    expect(dashboard.summary.onTimeCompletion.pct).toBeNull();
    expect(dashboard.summary.onTimeCompletion.count).toBe(0);
  });

  it("productivityByMachine: sorted desc by productionCompletedAt, capped at 30", () => {
    const dashboard = buildDashboard([mInsideL30d, mOutsideL30d]);
    const pm = dashboard.productivityByMachine;
    // Both machines are completed (all-time range)
    expect(pm.length).toBe(2);
    // Sorted desc: mInsideL30d (2026-06-01) before mOutsideL30d (2026-04-01)
    expect(pm[0].machineId).toBe("ins1");
    expect(pm[1].machineId).toBe("out1");
    // Shape check
    expect(pm[0]).toHaveProperty("serialNumber");
    expect(pm[0]).toHaveProperty("orderToCompletionHours");
    expect(pm[0]).toHaveProperty("productionHours");
    expect(pm[0]).toHaveProperty("isProductionLate");
    expect(pm[0]).toHaveProperty("promisedDate");
    expect(pm[0]).toHaveProperty("productionCompletedAt");
  });

  it("shippedThisMonth counts only machines shipped in the current calendar month", () => {
    const dashboard = buildDashboard([mInsideL30d, mShippedJune, mOutsideL30d]);
    const stm = dashboard.summary.shippedThisMonth;
    // mInsideL30d shipped 2026-06-02, mShippedJune shipped 2026-06-05 → both in June 2026
    // mOutsideL30d shipped 2026-04-02 → outside
    expect(stm.count).toBe(2);
    expect(stm.totalCop).toBe(6_000_000 + 8_000_000);
    expect(typeof stm.monthLabel).toBe("string");
    expect(stm.monthLabel.charAt(0)).toBe(stm.monthLabel.charAt(0).toUpperCase());
  });
});
