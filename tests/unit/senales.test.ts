import { describe, expect, it } from "vitest";
import { generateSequentialSenalNumbers, normalizeSenalNumber } from "@/services/senales";

describe("senal sequencing", () => {
  it("starts after the highest active señal", () => {
    expect(generateSequentialSenalNumbers([12, 41, 42], 3)).toEqual([43, 44, 45]);
  });

  it("wraps to 1 after 999", () => {
    expect(generateSequentialSenalNumbers([997, 998], 4)).toEqual([999, 1, 2, 3]);
  });

  it("skips active señales after wrapping", () => {
    expect(generateSequentialSenalNumbers([1, 2, 998, 999], 3)).toEqual([3, 4, 5]);
  });

  it("rejects invalid manual señal values", () => {
    expect(normalizeSenalNumber("15")).toBe(15);
    expect(normalizeSenalNumber("15.5")).toBeNull();
    expect(normalizeSenalNumber("0")).toBeNull();
  });
});
