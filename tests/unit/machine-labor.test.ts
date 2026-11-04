import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "@/services/calculations";
import { shiftFromSettings, summarizeMachineLabor, type LaborSessionInput } from "@/services/labor-time";
import {
  buildEquipmentLaborRows,
  buildMachineLaborDetail,
  buildMachineLaborRow,
  buildMachineLaborSnapshot,
  resolveMachineLaborFilters,
  summarizeMachineLaborRows,
  type MachineLaborSource,
} from "@/services/machine-labor";

const settings = DEFAULT_SETTINGS;
const shift = shiftFromSettings(settings);
const TRACKING_SINCE = "2026-06-01T08:00:00-05:00";
/** Venta que da exactamente 100 h máximas con el 30% general. */
const SALE_100_HOURS = (100 * settings.hourlyCostPerWorkerCop) / settings.laborFactor;

function machine(overrides: Partial<MachineLaborSource> = {}): MachineLaborSource {
  return {
    id: "m1",
    serialNumber: 101,
    equipmentId: "e1",
    equipmentName: "Press de pecho",
    clientName: "Cliente",
    line: "musculacion",
    status: "finished",
    progressPct: 1,
    salePriceCop: SALE_100_HOURS,
    equipmentLaborFactor: null,
    productionStartedAt: "2026-06-02T08:00:00-05:00",
    completedAt: "2026-06-20T08:00:00-05:00",
    shippedAt: null,
    promisedDate: "2026-06-25",
    reestimatedDate: "2026-06-22",
    ...overrides,
  };
}

function stageSession(overrides: Partial<LaborSessionInput> = {}): LaborSessionInput {
  return {
    id: "s1",
    workerId: "w1",
    kind: "stage",
    stageId: 4,
    activityTypeIds: [],
    note: null,
    isReprocess: false,
    startedAt: "2026-06-02T08:00:00-05:00",
    endedAt: "2026-06-02T10:00:00-05:00",
    endReason: "completed",
    machineIds: ["m1"],
    ...overrides,
  };
}

function totalsFor(sessions: LaborSessionInput[], machineId = "m1") {
  return summarizeMachineLabor({
    sessions,
    workers: [{ id: "w1", fullName: "Ana", hourlyCostCop: 30_000 }],
    shift,
    holidays: [],
    now: "2026-06-30T12:00:00-05:00",
    hourlyCostFallback: settings.hourlyCostPerWorkerCop,
    machineIds: [machineId],
  }).get(machineId);
}

describe("buildMachineLaborSnapshot", () => {
  it("uses the equipment's own % for the budget and flags an overrun", () => {
    // 35% propio → 100 h × 35/30.
    const snapshot = buildMachineLaborSnapshot(
      machine({ equipmentLaborFactor: 0.35, status: "in_production", progressPct: 0.5 }),
      { ...totalsFor([])!, productionMinutes: 130 * 60, reprocessMinutes: 60 },
      settings,
    );

    expect(snapshot.budgetHours).toBeCloseTo(100 * (0.35 / 0.3), 6);
    expect(snapshot.spentHours).toBe(130);
    expect(snapshot.reprocessHours).toBe(1);
    expect(snapshot.spentPct).toBeCloseTo(130 / snapshot.budgetHours, 6);
    expect(snapshot.status).toBe("excedida");
    expect(snapshot.isFinal).toBe(false);
  });

  it("marks finished machines as final and has no budget without a sale price", () => {
    expect(buildMachineLaborSnapshot(machine(), undefined, settings)).toMatchObject({ isFinal: true, spentHours: 0, status: "ok" });
    expect(buildMachineLaborSnapshot(machine({ salePriceCop: 0 }), undefined, settings)).toMatchObject({
      budgetHours: 0,
      spentPct: null,
      status: "ok",
    });
  });
});

describe("buildMachineLaborRow", () => {
  it("prices real labor with each worker's cost and compares it to the sale", () => {
    // 105 min de Ana a 30.000/h = 52.500.
    const row = buildMachineLaborRow(machine(), totalsFor([stageSession()]), settings, TRACKING_SINCE);

    expect(row.spentHours).toBeCloseTo(1.75, 6);
    expect(row.realCostCop).toBeCloseTo(52_500, 6);
    expect(row.realLaborPct).toBeCloseTo(52_500 / SALE_100_HOURS, 9);
    expect(row.laborFactor).toBe(0.3);
    expect(row.laborFactorSource).toBe("general");
    expect(row.hasPartialData).toBe(false);
  });

  it("flags partial data without production sessions or when production started before the cronómetros", () => {
    expect(buildMachineLaborRow(machine(), totalsFor([]), settings, TRACKING_SINCE).hasPartialData).toBe(true);
    expect(
      buildMachineLaborRow(
        machine({ productionStartedAt: "2026-05-20T08:00:00-05:00" }),
        totalsFor([stageSession()]),
        settings,
        TRACKING_SINCE,
      ).hasPartialData,
    ).toBe(true);
  });
});

describe("equipment and report totals", () => {
  const complete = buildMachineLaborRow(machine(), totalsFor([stageSession()]), settings, TRACKING_SINCE);
  const shipped = buildMachineLaborRow(
    machine({ id: "m2", serialNumber: 102, status: "shipped" }),
    totalsFor([stageSession({ machineIds: ["m2"], endedAt: "2026-06-02T12:00:00-05:00" })], "m2"),
    settings,
    TRACKING_SINCE,
  );
  const inProduction = buildMachineLaborRow(
    machine({ id: "m3", serialNumber: 103, status: "in_production", progressPct: 0.2 }),
    totalsFor([stageSession({ machineIds: ["m3"] })], "m3"),
    settings,
    TRACKING_SINCE,
  );
  const custom = buildMachineLaborRow(
    machine({ id: "m4", serialNumber: 104, equipmentId: null, equipmentName: "Reja a medida" }),
    totalsFor([], "m4"),
    settings,
    TRACKING_SINCE,
  );
  const rows = [complete, shipped, inProduction, custom];

  it("averages only finished/shipped machines with complete data", () => {
    const [press, customGroup] = buildEquipmentLaborRows(rows);

    expect(press.equipmentId).toBe("e1");
    expect(press.machineCount).toBe(2);
    expect(press.avgSpentHours).toBeCloseTo((complete.spentHours + shipped.spentHours) / 2, 6);
    expect(press.totalRealCostCop).toBeCloseTo(complete.realCostCop + shipped.realCostCop + inProduction.realCostCop, 6);

    expect(customGroup).toMatchObject({
      equipmentId: null,
      equipmentName: "Productos personalizados",
      machineCount: 0,
      avgSpentHours: null,
    });
  });

  it("counts machines over budget and averages expected vs real %", () => {
    const totals = summarizeMachineLaborRows(rows);

    expect(totals.machineCount).toBe(4);
    expect(totals.overBudgetCount).toBe(0);
    expect(totals.avgExpectedLaborPct).toBeCloseTo(0.3, 9);
    expect(totals.avgRealLaborPct).toBeCloseTo(((complete.realLaborPct ?? 0) + (shipped.realLaborPct ?? 0)) / 2, 9);
  });
});

describe("resolveMachineLaborFilters", () => {
  it("defaults to every status and drops invalid values", () => {
    expect(resolveMachineLaborFilters({})).toEqual({ estado: "todas", linea: null, equipo: null });
    expect(resolveMachineLaborFilters({ estado: "x", linea: "nada", equipo: "1; drop" })).toEqual({
      estado: "todas",
      linea: null,
      equipo: null,
    });
    expect(
      resolveMachineLaborFilters({
        estado: "terminadas",
        linea: "bioparques",
        equipo: "4cdb55e2-bb70-4663-88f1-c2175e9915d2",
      }),
    ).toEqual({ estado: "terminadas", linea: "bioparques", equipo: "4cdb55e2-bb70-4663-88f1-c2175e9915d2" });
  });
});

describe("buildMachineLaborDetail", () => {
  it("splits the budget by stage weight and logs the minutes attributed to this machine", () => {
    const sessions = [
      stageSession({ id: "s1", machineIds: ["m1", "m2"] }),
      stageSession({ id: "s2", stageId: 1, startedAt: "2026-06-03T13:00:00-05:00", endedAt: "2026-06-03T14:00:00-05:00" }),
      stageSession({
        id: "s3",
        kind: "other",
        stageId: null,
        activityTypeIds: ["empaque"],
        startedAt: "2026-06-04T13:00:00-05:00",
        endedAt: "2026-06-04T14:00:00-05:00",
      }),
    ];
    const source = machine();
    const totals = totalsFor(sessions);
    const detail = buildMachineLaborDetail({
      machine: source,
      row: buildMachineLaborRow(source, totals, settings, TRACKING_SINCE),
      totals,
      sessions,
      workers: [{ id: "w1", fullName: "Ana", hourlyCostCop: 30_000 }],
      activityTypes: [{ id: "empaque", name: "Empaque, carga e instalación" }],
      shift,
      holidays: [],
      now: new Date("2026-06-30T12:00:00-05:00"),
    });

    // Pesos de DEFAULT_STAGES: 20/20/10/20/10/10/10 % de 100 h.
    expect(detail.byStage.map((stage) => stage.expectedHours)).toEqual([20, 20, 10, 20, 10, 10, 10].map((hours) => expect.closeTo(hours, 6)));
    expect(detail.byStage.find((stage) => stage.stageId === 4)?.spentHours).toBeCloseTo(52.5 / 60, 6);
    expect(detail.byStage.find((stage) => stage.stageId === 1)?.spentHours).toBeCloseTo(1, 6);

    expect(detail.byWorker).toEqual([
      { workerId: "w1", fullName: "Ana", hours: expect.closeTo(52.5 / 60 + 1, 6), costCop: expect.closeTo((52.5 / 60 + 1) * 30_000, 6) },
    ]);
    expect(detail.extraByActivity).toEqual([
      { activityTypeId: "empaque", name: "Empaque, carga e instalación", hours: 1, costCop: 30_000 },
    ]);

    expect(detail.sessions.map((session) => [session.sessionId, session.label, session.minutes, session.sharedWith])).toEqual([
      ["s3", "Empaque, carga e instalación", 60, 1],
      ["s2", "Material", 60, 1],
      ["s1", "Pulir", 52.5, 2],
    ]);
    expect(detail.promisedDate).toBe("2026-06-25");
    expect(detail.reestimatedDate).toBe("2026-06-22");
  });
});
