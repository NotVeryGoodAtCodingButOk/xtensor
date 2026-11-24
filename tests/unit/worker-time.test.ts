import { describe, expect, it } from "vitest";
import type { LaborByWorker } from "@/services/labor-time";
import { buildWorkerTimeRows } from "@/services/worker-time";

function worker(workerId: string, fullName: string): LaborByWorker {
  return {
    workerId,
    fullName,
    daysWithRecords: 1,
    registeredMinutes: 0,
    machineMinutes: 0,
    reprocessMinutes: 0,
    otherMinutes: 0,
    availableMinutes: 0,
    unregisteredMinutes: 0,
    utilizationPct: null,
    laborCostCop: 0,
  };
}

const stageEntry = (workerId: string, machineId: string, stageId: number, minutes: number, isReprocess = false) => ({
  workerId,
  fullName: "",
  machineId,
  serialNumber: 1,
  stageId,
  stageName: "",
  minutes,
  isReprocess,
});

describe("buildWorkerTimeRows", () => {
  it("adds each worker's minutes per stage across machines, plus activities", () => {
    const rows = buildWorkerTimeRows({
      byWorker: [worker("w1", "Ana"), worker("w2", "Beto")],
      byWorkerMachine: [
        stageEntry("w1", "m1", 2, 60),
        stageEntry("w1", "m2", 2, 30),
        stageEntry("w1", "m1", 2, 30, true),
        stageEntry("w1", "m1", 5, 45),
        stageEntry("w2", "m1", 1, 120),
      ],
      byWorkerActivityType: [
        { workerId: "w1", fullName: "Ana", activityTypeId: "a1", name: "5S", minutes: 15 },
        { workerId: "w1", fullName: "Ana", activityTypeId: "a2", name: "Empaque", minutes: 45 },
      ],
    });

    expect(rows.map((row) => row.fullName)).toEqual(["Ana", "Beto"]);
    const ana = rows[0];
    expect(ana.byStage).toHaveLength(7);
    expect(ana.byStage.find((stage) => stage.stageId === 2)).toMatchObject({ hours: 2, reprocessHours: 0.5 });
    expect(ana.byStage.find((stage) => stage.stageId === 5)?.hours).toBeCloseTo(0.75);
    expect(ana.activityHours).toBe(1);
    expect(ana.activities.map((activity) => activity.name)).toEqual(["Empaque", "5S"]);
    expect(ana.totalHours).toBeCloseTo(3.75);
    expect(rows[1].totalHours).toBe(2);
  });

  it("drops workers with less than a minute registered", () => {
    const rows = buildWorkerTimeRows({
      byWorker: [worker("w1", "Ana"), worker("w2", "Beto")],
      byWorkerMachine: [stageEntry("w2", "m1", 1, 0.5)],
      byWorkerActivityType: [],
    });
    expect(rows).toEqual([]);
  });
});
