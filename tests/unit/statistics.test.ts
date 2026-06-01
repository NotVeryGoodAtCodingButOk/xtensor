import { describe, expect, it } from "vitest";
import {
  buildStatisticsDashboard,
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
  dailyHoursSat: 6,
  dailyHoursSun: 0,
  activeWorkersCount: 9,
  clientBufferDays: 3,
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

describe("machine timing", () => {
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
    expect(timing.productionHours).toBe(10);
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
          cotiNumber: 101,
          equipmentName: "Equipo A",
          stages: [
            stage(1, "Material", 1, 100, "2026-06-01T09:00:00-05:00"),
            stage(2, "Empacar", 2, 100, "2026-06-02T09:00:00-05:00"),
          ],
          logs: [
            log("m1-l1", 1, 0, 100, "2026-06-01T09:00:00-05:00"),
            log("m1-l2", 2, 0, 100, "2026-06-02T09:00:00-05:00"),
          ],
          shippedAt: "2026-06-02T11:00:00-05:00",
          status: "shipped",
        }),
        machine({
          id: "m2",
          cotiNumber: 102,
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
      range,
      settings,
      holidays: noHolidays,
      now: new Date("2026-06-15T12:00:00-05:00"),
    });

    expect(dashboard.summary.completedMachinesCount).toBe(1);
    expect(dashboard.summary.shippedMachinesCount).toBe(1);
    expect(dashboard.summary.production.averageHours).toBe(10);
    expect(dashboard.summary.productionToShipment.averageHours).toBe(2);
    expect(dashboard.breakdowns.byEquipment).toHaveLength(1);
    expect(dashboard.breakdowns.byEquipment[0].label).toBe("Equipo A");
  });
});

function machine(overrides: Partial<MachineTimingInput> = {}): MachineTimingInput {
  return {
    id: "m1",
    cotiNumber: 100,
    clientName: "Cliente",
    equipmentName: "Equipo",
    line: "PRO",
    colorName: "Negro",
    city: "Bogotá",
    promisedDate: "2026-06-03",
    status: "in_production",
    createdAt: "2026-06-01T08:00:00-05:00",
    shippedAt: null,
    stages: [],
    logs: [],
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
    isUndone: false,
    createdAt,
  };
}
