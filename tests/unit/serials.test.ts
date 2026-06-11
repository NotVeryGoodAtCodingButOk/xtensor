import { describe, expect, it } from "vitest";
import { generateSequentialSerialNumbers, normalizeSerialNumber } from "@/services/serials";

describe("serial sequencing", () => {
  it("starts after the highest active serial", () => {
    expect(generateSequentialSerialNumbers([12, 41, 42], 3)).toEqual([43, 44, 45]);
  });

  it("wraps to 1 after 999", () => {
    expect(generateSequentialSerialNumbers([997, 998], 4)).toEqual([999, 1, 2, 3]);
  });

  it("skips active seriales after wrapping", () => {
    expect(generateSequentialSerialNumbers([1, 2, 998, 999], 3)).toEqual([3, 4, 5]);
  });

  it("rejects invalid manual serial values", () => {
    expect(normalizeSerialNumber("15")).toBe(15);
    expect(normalizeSerialNumber("15.5")).toBeNull();
    expect(normalizeSerialNumber("0")).toBeNull();
  });
});
