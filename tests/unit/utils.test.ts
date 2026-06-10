import { describe, expect, it } from "vitest";
import { formatDecimalInput, roundToFractionDigits } from "@/lib/utils";

describe("decimal utils", () => {
  it("formats numeric inputs with two decimals", () => {
    expect(formatDecimalInput(15000)).toBe("15000.00");
    expect(formatDecimalInput(123.456789)).toBe("123.46");
  });

  it("returns empty string for missing input values", () => {
    expect(formatDecimalInput(null)).toBe("");
    expect(formatDecimalInput(undefined)).toBe("");
  });

  it("rounds numbers to two decimals", () => {
    expect(roundToFractionDigits(123.456789)).toBe(123.46);
    expect(roundToFractionDigits(90)).toBe(90);
  });

  it("returns null for invalid values", () => {
    expect(roundToFractionDigits(null)).toBeNull();
    expect(roundToFractionDigits(Number.NaN)).toBeNull();
  });
});
