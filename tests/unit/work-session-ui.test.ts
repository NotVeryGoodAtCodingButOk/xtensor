import { describe, expect, it } from "vitest";
import {
  deriveStageCardState,
  formatElapsedTime,
  formatMachineList,
  isStartedBeforeToday,
  sameMachineSet,
} from "@/lib/work-session-ui";

describe("sameMachineSet", () => {
  it("matches identical sets regardless of order", () => {
    expect(sameMachineSet(["a", "b", "c"], ["c", "a", "b"])).toBe(true);
  });

  it("matches identical sets with duplicate entries", () => {
    expect(sameMachineSet(["a", "a", "b"], ["b", "a"])).toBe(true);
  });

  it("rejects sets of different sizes", () => {
    expect(sameMachineSet(["a", "b"], ["a"])).toBe(false);
  });

  it("rejects sets with different members", () => {
    expect(sameMachineSet(["a", "b"], ["a", "c"])).toBe(false);
  });

  it("treats two empty lists as equal", () => {
    expect(sameMachineSet([], [])).toBe(true);
  });
});

describe("formatElapsedTime", () => {
  it("formats zero as 00:00:00", () => {
    expect(formatElapsedTime(0)).toBe("00:00:00");
  });

  it("formats seconds and minutes", () => {
    expect(formatElapsedTime(65_000)).toBe("00:01:05");
  });

  it("formats hours", () => {
    expect(formatElapsedTime(3_661_000)).toBe("01:01:01");
  });

  it("clamps negative durations to zero", () => {
    expect(formatElapsedTime(-5000)).toBe("00:00:00");
  });

  it("clamps non-finite durations to zero", () => {
    expect(formatElapsedTime(NaN)).toBe("00:00:00");
  });
});

describe("formatMachineList", () => {
  it("returns an empty string for no machines", () => {
    expect(formatMachineList([])).toBe("");
  });

  it("lists every serial when under the max", () => {
    expect(formatMachineList([12, 34])).toBe("#12, #34");
  });

  it("truncates with a (+N) suffix past the max", () => {
    expect(formatMachineList([12, 34, 56, 78])).toBe("#12, #34 (+2)");
  });

  it("respects a custom max", () => {
    expect(formatMachineList([1, 2, 3], 1)).toBe("#1 (+2)");
  });
});

describe("isStartedBeforeToday", () => {
  it("is false for a session started earlier today", () => {
    const now = new Date("2026-09-15T18:00:00");
    expect(isStartedBeforeToday("2026-09-15T08:00:00", now)).toBe(false);
  });

  it("is true for a session started yesterday", () => {
    const now = new Date("2026-09-15T08:00:00");
    expect(isStartedBeforeToday("2026-09-14T22:00:00", now)).toBe(true);
  });

  it("is false for a malformed timestamp", () => {
    const now = new Date("2026-09-15T08:00:00");
    expect(isStartedBeforeToday("not-a-date", now)).toBe(false);
  });
});

describe("deriveStageCardState", () => {
  it("reports allDone for a single finished machine", () => {
    expect(deriveStageCardState([100])).toEqual({ doneCount: 1, total: 1, allDone: true, anyDone: true });
  });

  it("reports pending for a single unfinished machine", () => {
    expect(deriveStageCardState([0])).toEqual({ doneCount: 0, total: 1, allDone: false, anyDone: false });
  });

  it("reports partial progress across a group", () => {
    expect(deriveStageCardState([100, 0, 100])).toEqual({ doneCount: 2, total: 3, allDone: false, anyDone: true });
  });

  it("reports allDone across a fully finished group", () => {
    expect(deriveStageCardState([100, 100])).toEqual({ doneCount: 2, total: 2, allDone: true, anyDone: true });
  });

  it("handles an empty machine list", () => {
    expect(deriveStageCardState([])).toEqual({ doneCount: 0, total: 0, allDone: false, anyDone: false });
  });
});
