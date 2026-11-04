import { describe, expect, it } from "vitest";
import { LABOR_PCT_ERROR, parseLaborPct } from "@/services/calculations";

describe("parseLaborPct", () => {
  it("reads a percentage with dot or comma and returns the fraction", () => {
    expect(parseLaborPct("30")).toEqual({ ok: true, laborFactor: 0.3 });
    expect(parseLaborPct("32,5")).toEqual({ ok: true, laborFactor: 0.325 });
    expect(parseLaborPct("32.5")).toEqual({ ok: true, laborFactor: 0.325 });
    expect(parseLaborPct(" 35 % ")).toEqual({ ok: true, laborFactor: 0.35 });
    expect(parseLaborPct(100)).toEqual({ ok: true, laborFactor: 1 });
    expect(parseLaborPct(1)).toEqual({ ok: true, laborFactor: 0.01 });
  });

  it("treats empty as 'use the general %'", () => {
    expect(parseLaborPct("")).toEqual({ ok: true, laborFactor: null });
    expect(parseLaborPct("   ")).toEqual({ ok: true, laborFactor: null });
    expect(parseLaborPct(null)).toEqual({ ok: true, laborFactor: null });
    expect(parseLaborPct(undefined)).toEqual({ ok: true, laborFactor: null });
  });

  it("rejects values outside 1–100 or that are not numbers", () => {
    for (const value of ["0", "0,5", "101", "-30", "treinta", "30,5,1", "1e2"]) {
      expect(parseLaborPct(value)).toEqual({ ok: false, error: LABOR_PCT_ERROR });
    }
  });
});
