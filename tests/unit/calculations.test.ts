import { describe, expect, it } from "vitest";
import fixture from "../fixtures/excel-plan-prod-mayo-2026.json";
import {
  calculateProgressPct,
  calculateQueue,
  estimateTotalHours,
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
