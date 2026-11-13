import { describe, expect, it } from "vitest";
import fixture from "../fixtures/excel-plan-prod-mayo-2026.json";
import type { ProductionSettings } from "@/services/calculations";
import { buildLaborCalendar, createDeliveryDateEstimator, type Holiday } from "@/services/schedule";

const settings = fixture.settings as ProductionSettings;
const start = new Date(2026, 10, 13, 12);
const holidays: Holiday[] = [
  { date: "2026-11-16", name: "Independencia de Cartagena", isCustom: false },
  { date: "2026-12-08", name: "Inmaculada Concepción", isCustom: false },
  { date: "2026-12-25", name: "Navidad", isCustom: false },
];

/** The original algorithm: rebuild the calendar from scratch for every machine. */
function referenceEstimate(hours: number) {
  if (hours <= 0) return "2026-11-13";
  for (let days = 180; days <= 730; days *= 2) {
    const match = buildLaborCalendar(start, settings, holidays, days).find((day) => day.cumulativeHours >= hours);
    if (match) return match.date;
  }
  throw new Error("fuera de rango");
}

describe("createDeliveryDateEstimator", () => {
  it("matches the per-machine calendar for a growing queue, in any call order", () => {
    const estimate = createDeliveryDateEstimator(start, settings, holidays);
    const year = buildLaborCalendar(start, settings, holidays, 720).at(-1)!.cumulativeHours;
    // Mix late and early points so the shared calendar is reused after growing.
    const points = [0, 1, 50, year * 0.9, 300, year * 0.2, year * 0.45, year * 0.99, 10];

    for (const hours of points) {
      expect(estimate(hours)).toBe(referenceEstimate(hours));
    }
  });

  it("throws past the 720-day horizon like before", () => {
    const estimate = createDeliveryDateEstimator(start, settings, holidays);
    const beyond = buildLaborCalendar(start, settings, holidays, 720).at(-1)!.cumulativeHours + 1;
    expect(() => estimate(beyond)).toThrow();
  });
});
