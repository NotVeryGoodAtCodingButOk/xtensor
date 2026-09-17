import { describe, expect, it } from "vitest";
import {
  availableShiftMinutes,
  shiftFromSettings,
  splitEqually,
  summarizeLabor,
  UNCLASSIFIED_ACTIVITY_ID,
  workedMinutes,
  type FactoryShift,
  type LaborActivityTypeInput,
  type LaborMachineInput,
  type LaborSessionInput,
  type LaborWorkerInput,
} from "@/services/labor-time";
import { DEFAULT_SETTINGS } from "@/services/calculations";
import type { Holiday } from "@/services/schedule";

// 2026-06-01 is a Monday, 2026-06-05 is a Friday, 2026-06-06/07 is the weekend
// (matches the fixture dates already used in tests/unit/statistics.test.ts).
const shift: FactoryShift = shiftFromSettings(DEFAULT_SETTINGS);
const noHolidays: Holiday[] = [];

describe("workedMinutes", () => {
  it("subtracts a break that falls inside the session", () => {
    // 08:00-10:00 Monday: 120 raw minutes minus the 09:00-09:15 break.
    const minutes = workedMinutes(
      "2026-06-01T08:00:00-05:00",
      "2026-06-01T10:00:00-05:00",
      shift,
      noHolidays,
    );

    expect(minutes).toBe(105);
  });

  it("splits an overnight session across the calendar boundary, respecting each day's breaks", () => {
    // Monday 16:00 -> Tuesday 09:30: Monday gives a clean 60 min (no break in
    // that window); Tuesday gives 08:00-09:30 (90 min) minus the 09:00-09:15
    // break = 75 min.
    const minutes = workedMinutes(
      "2026-06-01T16:00:00-05:00",
      "2026-06-02T09:30:00-05:00",
      shift,
      noHolidays,
    );

    expect(minutes).toBe(60 + 75);
  });

  it("cuts Friday at the configured early close (14:30)", () => {
    const minutes = workedMinutes(
      "2026-06-05T14:00:00-05:00",
      "2026-06-05T18:00:00-05:00",
      shift,
      noHolidays,
    );

    expect(minutes).toBe(30);
  });

  it("counts zero on a weekend day (no Saturday shift configured)", () => {
    const minutes = workedMinutes(
      "2026-06-06T08:00:00-05:00",
      "2026-06-06T12:00:00-05:00",
      shift,
      noHolidays,
    );

    expect(minutes).toBe(0);
  });

  it("counts zero on a holiday", () => {
    const holidays: Holiday[] = [{ date: "2026-06-01", name: "Festivo de prueba", isCustom: true }];
    const minutes = workedMinutes(
      "2026-06-01T08:00:00-05:00",
      "2026-06-01T10:00:00-05:00",
      shift,
      holidays,
    );

    expect(minutes).toBe(0);
  });
});

describe("availableShiftMinutes", () => {
  it("nets out breaks on a full Monday", () => {
    // 08:00-17:00 (540 min) minus 15 + 30 min of breaks = 495.
    expect(availableShiftMinutes("2026-06-01", shift, noHolidays)).toBe(495);
  });

  it("is zero on Saturday and on holidays", () => {
    expect(availableShiftMinutes("2026-06-06", shift, noHolidays)).toBe(0);
    expect(availableShiftMinutes("2026-06-01", shift, new Set(["2026-06-01"]))).toBe(0);
  });
});

describe("splitEqually", () => {
  it("splits minutes equally among machine ids", () => {
    const ids = ["m1", "m2", "m3", "m4", "m5"];
    const split = splitEqually(100, ids);

    for (const id of ids) {
      expect(split.get(id)).toBe(20);
    }
  });

  it("returns an empty map for no ids", () => {
    expect(splitEqually(100, []).size).toBe(0);
  });
});

const workers: LaborWorkerInput[] = [{ id: "w1", fullName: "Ana", hourlyCostCop: null }];
const machines: LaborMachineInput[] = Array.from({ length: 5 }, (_, index) => ({
  id: `m${index + 1}`,
  serialNumber: 1000 + index,
  label: `Máquina ${index + 1}`,
  salePriceCop: 100_000,
}));
const stages = [{ id: 4, name: "Pulir" }];
const activityTypes: LaborActivityTypeInput[] = [
  { id: "a1", name: "Aseo" },
  { id: "a2", name: "Orden" },
  { id: "a3", name: "Arreglar máquinas" },
];

/** A two-hour activity session on the Monday shift (105 minutes once clipped). */
function otherSession(overrides: Partial<LaborSessionInput> = {}): LaborSessionInput {
  return {
    id: "s1",
    workerId: "w1",
    kind: "other",
    stageId: null,
    activityTypeIds: [],
    note: null,
    isReprocess: false,
    startedAt: "2026-06-01T08:00:00-05:00",
    endedAt: "2026-06-01T10:00:00-05:00",
    endReason: "completed",
    machineIds: [],
    ...overrides,
  };
}

describe("summarizeLabor", () => {
  it("splits a multi-machine stage session equally and prices it with the cost fallback", () => {
    const sessions: LaborSessionInput[] = [
      {
        id: "s1",
        workerId: "w1",
        kind: "stage",
        stageId: 4,
        activityTypeIds: [],
        note: null,
        isReprocess: false,
        startedAt: "2026-06-01T08:00:00-05:00",
        endedAt: "2026-06-01T10:00:00-05:00",
        endReason: "completed",
        machineIds: machines.map((m) => m.id),
      },
    ];

    const summary = summarizeLabor({
      sessions,
      workers,
      machines,
      stages,
      shift,
      holidays: noHolidays,
      range: { startIso: "2026-06-01T00:00:00-05:00", endIso: "2026-06-02T00:00:00-05:00" },
      now: "2026-06-01T12:00:00-05:00",
      hourlyCostFallback: 20_000,
      estimateHours: (salePriceCop) => salePriceCop / 100_000,
    });

    // 105 worked minutes (see workedMinutes tests) split across 5 machines.
    expect(summary.totals.registeredMinutes).toBe(105);
    expect(summary.totals.machineMinutes).toBe(105);
    for (const machine of summary.byMachine) {
      expect(machine.totalMinutes).toBeCloseTo(21, 6);
      expect(machine.minutesByStage[4]).toBeCloseTo(21, 6);
    }

    // 1.75h at the fallback hourly cost (worker has no hourlyCostCop).
    expect(summary.totals.laborCostCop).toBeCloseTo(1.75 * 20_000, 6);
    for (const machine of summary.byMachine) {
      expect(machine.laborCostCop).toBeCloseTo((1.75 * 20_000) / 5, 6);
    }

    // estimateHours(100_000) = 1h estimated per machine vs 21 worked minutes
    // (0.35h) actually spent on each machine => -65% deviation.
    for (const machine of summary.byMachine) {
      expect(machine.estimatedHours).toBe(1);
      expect(machine.deviationPct).toBeCloseTo(-65, 6);
    }
  });

  it("clips sessions to the requested range", () => {
    const sessions: LaborSessionInput[] = [
      {
        id: "s1",
        workerId: "w1",
        kind: "stage",
        stageId: 4,
        activityTypeIds: [],
        note: null,
        isReprocess: false,
        // Starts the day before the range and ends the day after it.
        startedAt: "2026-05-31T08:00:00-05:00",
        endedAt: "2026-06-02T17:00:00-05:00",
        endReason: "completed",
        machineIds: ["m1"],
      },
    ];

    const summary = summarizeLabor({
      sessions,
      workers,
      machines,
      stages,
      shift,
      holidays: noHolidays,
      // Only Monday 2026-06-01 is in range.
      range: { startIso: "2026-06-01T00:00:00-05:00", endIso: "2026-06-02T00:00:00-05:00" },
      now: "2026-06-03T00:00:00-05:00",
      hourlyCostFallback: 20_000,
      estimateHours: () => 1,
    });

    // Full Monday shift, net of breaks.
    expect(summary.totals.registeredMinutes).toBe(495);
  });

  it("uses `now` as the end of an open session", () => {
    const sessions: LaborSessionInput[] = [
      {
        id: "s1",
        workerId: "w1",
        kind: "stage",
        stageId: 4,
        activityTypeIds: [],
        note: null,
        isReprocess: false,
        startedAt: "2026-06-01T08:00:00-05:00",
        endedAt: null,
        endReason: null,
        machineIds: ["m1"],
      },
    ];

    const summary = summarizeLabor({
      sessions,
      workers,
      machines,
      stages,
      shift,
      holidays: noHolidays,
      range: { startIso: "2026-06-01T00:00:00-05:00", endIso: "2026-06-02T00:00:00-05:00" },
      now: "2026-06-01T10:00:00-05:00",
      hourlyCostFallback: 20_000,
      estimateHours: () => 1,
    });

    expect(summary.totals.registeredMinutes).toBe(105);
  });

  it("derives utilization and unregistered time from available vs registered minutes", () => {
    const sessions: LaborSessionInput[] = [
      {
        id: "s1",
        workerId: "w1",
        kind: "stage",
        stageId: 4,
        activityTypeIds: [],
        note: null,
        isReprocess: false,
        startedAt: "2026-06-01T08:00:00-05:00",
        endedAt: "2026-06-01T10:00:00-05:00",
        endReason: "completed",
        machineIds: ["m1"],
      },
    ];

    const summary = summarizeLabor({
      sessions,
      workers,
      machines,
      stages,
      shift,
      holidays: noHolidays,
      range: { startIso: "2026-06-01T00:00:00-05:00", endIso: "2026-06-02T00:00:00-05:00" },
      now: "2026-06-01T12:00:00-05:00",
      hourlyCostFallback: 20_000,
      estimateHours: () => 1,
    });

    const worker = summary.byWorker[0];
    // Available = full Monday shift (495); registered = 105 worked minutes.
    expect(worker.availableMinutes).toBe(495);
    expect(worker.registeredMinutes).toBe(105);
    expect(worker.unregisteredMinutes).toBe(495 - 105);
    expect(worker.utilizationPct).toBeCloseTo((105 / 495) * 100, 6);
    expect(summary.totals.unregisteredMinutes).toBe(495 - 105);
  });

  it("splits an activity session equally among the activities marked", () => {
    const summary = summarizeLabor({
      sessions: [otherSession({ activityTypeIds: ["a1", "a2"] })],
      workers,
      machines,
      stages,
      activityTypes,
      shift,
      holidays: noHolidays,
      range: { startIso: "2026-06-01T00:00:00-05:00", endIso: "2026-06-02T00:00:00-05:00" },
      now: "2026-06-01T12:00:00-05:00",
      hourlyCostFallback: 20_000,
      estimateHours: () => 1,
    });

    const aseo = summary.byActivityType.find((entry) => entry.activityTypeId === "a1");
    const orden = summary.byActivityType.find((entry) => entry.activityTypeId === "a2");

    // 105 real worked minutes split in two: the sum stays the time actually worked.
    expect(aseo?.minutes).toBe(52.5);
    expect(orden?.minutes).toBe(52.5);
    expect(aseo!.minutes + orden!.minutes).toBe(summary.totals.otherMinutes);
    expect(aseo!.laborCostCop + orden!.laborCostCop).toBeCloseTo(summary.totals.laborCostCop, 6);
    expect(summary.byWorkerActivityType).toHaveLength(2);
  });

  it("attributes an activity to its machine without touching the production estimate", () => {
    const summary = summarizeLabor({
      sessions: [otherSession({ activityTypeIds: ["a3"], machineIds: ["m1"] })],
      workers,
      machines,
      stages,
      activityTypes,
      shift,
      holidays: noHolidays,
      range: { startIso: "2026-06-01T00:00:00-05:00", endIso: "2026-06-02T00:00:00-05:00" },
      now: "2026-06-01T12:00:00-05:00",
      hourlyCostFallback: 20_000,
      estimateHours: () => 1,
    });

    const machine = summary.byMachine.find((entry) => entry.machineId === "m1");
    expect(machine?.otherMinutes).toBe(105);
    expect(machine?.otherCostCop).toBeCloseTo((105 / 60) * 20_000, 6);
    // Production hours and the deviation against the estimate stay untouched.
    expect(machine?.totalMinutes).toBe(0);
    expect(machine?.laborCostCop).toBe(0);
    expect(machine?.deviationPct).toBeCloseTo(-100, 6);
  });

  it("buckets sessions registered before the catálogo as Sin clasificar", () => {
    const summary = summarizeLabor({
      sessions: [otherSession({ activityTypeIds: [], note: "Reunión" })],
      workers,
      machines,
      stages,
      activityTypes,
      shift,
      holidays: noHolidays,
      range: { startIso: "2026-06-01T00:00:00-05:00", endIso: "2026-06-02T00:00:00-05:00" },
      now: "2026-06-01T12:00:00-05:00",
      hourlyCostFallback: 20_000,
      estimateHours: () => 1,
    });

    expect(summary.byActivityType).toHaveLength(1);
    expect(summary.byActivityType[0]).toMatchObject({ activityTypeId: UNCLASSIFIED_ACTIVITY_ID, minutes: 105 });
    expect(summary.otherActivities[0].note).toBe("Reunión");
  });
});
