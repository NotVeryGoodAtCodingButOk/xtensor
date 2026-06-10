import { describe, expect, it } from "vitest";
import { generateSequentialPlacaNumbers, normalizePlacaNumber } from "@/services/placas";

describe("placa sequencing", () => {
  it("starts after the highest active placa", () => {
    expect(generateSequentialPlacaNumbers([12, 41, 42], 3)).toEqual([43, 44, 45]);
  });

  it("wraps to 1 after 999", () => {
    expect(generateSequentialPlacaNumbers([997, 998], 4)).toEqual([999, 1, 2, 3]);
  });

  it("skips active placas after wrapping", () => {
    expect(generateSequentialPlacaNumbers([1, 2, 998, 999], 3)).toEqual([3, 4, 5]);
  });

  it("rejects invalid manual placa values", () => {
    expect(normalizePlacaNumber("15")).toBe(15);
    expect(normalizePlacaNumber("15.5")).toBeNull();
    expect(normalizePlacaNumber("0")).toBeNull();
  });
});
