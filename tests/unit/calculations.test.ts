import { describe, expect, it } from "vitest";
import fixture from "../fixtures/excel-plan-prod-mayo-2026.json";
import {
  budgetStatus,
  calculateProgressPct,
  calculateQueue,
  estimateTotalHours,
  isBehindReestimate,
  resolveLaborFactor,
  type ProductionSettings,
} from "@/services/calculations";

const settings = fixture.settings as ProductionSettings;

describe("production calculations", () => {
  it("matches workbook total hours for representative rows", () => {
    for (const row of fixture.rows.slice(0, 20)) {
      expect(estimateTotalHours(row.salePriceCop, settings)).toBeCloseTo(row.excelTotalHours, 6);
    }
  });

  it("derives workbook progress from stage threshold cells", () => {
    for (const row of fixture.rows) {
      expect(calculateProgressPct(row.stages)).toBeCloseTo(row.excelProgressPct, 6);
    }
  });

  it("matches workbook remaining and accumulated hours within MVP tolerance", () => {
    const calculated = calculateQueue(
      fixture.rows.map((row) => ({
        id: String(row.row),
        salePriceCop: row.salePriceCop,
        orderPosition: row.row,
        promisedDate: "2026-05-01",
        stages: row.stages,
      })),
      settings,
    );

    for (const row of fixture.rows) {
      const result = calculated.find((item) => item.machineId === String(row.row));
      expect(result).toBeDefined();
      expect(result?.remainingHours ?? 0).toBeCloseTo(row.excelRemainingHours, 6);
      expect(result?.remainingHumanDays ?? 0).toBeCloseTo(row.excelRemainingHumanDays, 6);
      expect(result?.accumulatedHours ?? 0).toBeCloseTo(row.excelAccumulatedHours, 6);
    }
  });
});

describe("isBehindReestimate", () => {
  it("flags late only when the live estimate slips past the reestimated baseline", () => {
    expect(isBehindReestimate({ estimatedDate: "2026-05-10", reestimatedDate: "2026-05-05" })).toBe(true);
    expect(isBehindReestimate({ estimatedDate: "2026-05-05", reestimatedDate: "2026-05-10" })).toBe(false);
    expect(isBehindReestimate({ estimatedDate: "2026-05-05", reestimatedDate: "2026-05-05" })).toBe(false);
  });

  it("never flags late when there is no reestimated baseline yet", () => {
    expect(isBehindReestimate({ estimatedDate: "2026-05-10", reestimatedDate: null })).toBe(false);
  });
});

describe("labor factor per equipment", () => {
  it("uses the equipment labor factor when present and the general one otherwise", () => {
    const general = estimateTotalHours(10_000_000, settings);
    expect(estimateTotalHours(10_000_000, settings, null)).toBeCloseTo(general, 9);
    expect(estimateTotalHours(10_000_000, settings, undefined)).toBeCloseTo(general, 9);
    expect(estimateTotalHours(10_000_000, settings, 0.5)).toBeCloseTo((10_000_000 * 0.5) / settings.hourlyCostPerWorkerCop, 9);
  });

  it("ignores invalid equipment factors and reports the source", () => {
    expect(resolveLaborFactor(0.2, settings)).toEqual({ laborFactor: 0.2, source: "catalogo" });
    expect(resolveLaborFactor(null, settings)).toEqual({ laborFactor: settings.laborFactor, source: "general" });
    expect(resolveLaborFactor(0, settings).source).toBe("general");
    expect(resolveLaborFactor(1.5, settings).source).toBe("general");
    expect(resolveLaborFactor(Number.NaN, settings).source).toBe("general");
  });

  it("feeds the per-machine factor into the queue", () => {
    const [cheap, expensive] = calculateQueue(
      [
        { id: "a", salePriceCop: 1_000_000, orderPosition: 1, promisedDate: "2026-05-01", stages: [], laborFactor: 0.2 },
        { id: "b", salePriceCop: 1_000_000, orderPosition: 2, promisedDate: "2026-05-01", stages: [], laborFactor: 0.4 },
      ],
      settings,
    );
    expect(expensive.totalHours).toBeCloseTo(cheap.totalHours * 2, 9);
    expect(expensive.accumulatedHours).toBeCloseTo(cheap.totalHours * 3, 9);
  });
});

describe("budgetStatus", () => {
  it("is excedida once spent hours pass the budget, finished or not", () => {
    expect(budgetStatus({ budgetHours: 10, spentHours: 10.5, progressPct: 0.5, isFinished: false })).toBe("excedida");
    expect(budgetStatus({ budgetHours: 10, spentHours: 10.5, progressPct: 1, isFinished: true })).toBe("excedida");
  });

  it("is riesgo when consumption runs more than 10 points ahead of progress", () => {
    expect(budgetStatus({ budgetHours: 10, spentHours: 6.5, progressPct: 0.5, isFinished: false })).toBe("riesgo");
    expect(budgetStatus({ budgetHours: 10, spentHours: 6, progressPct: 0.5, isFinished: false })).toBe("ok");
    expect(budgetStatus({ budgetHours: 10, spentHours: 9, progressPct: 0.5, isFinished: true })).toBe("ok");
  });

  it("is ok when there is no budget", () => {
    expect(budgetStatus({ budgetHours: 0, spentHours: 5, progressPct: 0, isFinished: false })).toBe("ok");
  });
});
