import { describe, expect, it } from "vitest";
import { classifyStageRevert } from "@/services/stage-revert";

describe("classifyStageRevert", () => {
  it("treats a null last-completed timestamp as a reprocess", () => {
    expect(classifyStageRevert(null, new Date("2026-06-01T10:00:00Z"))).toBe("reprocess");
  });

  it("treats a malformed timestamp as a reprocess", () => {
    expect(classifyStageRevert("not-a-date", new Date("2026-06-01T10:00:00Z"))).toBe("reprocess");
  });

  it("undoes within the grace window", () => {
    const lastCompletedAt = "2026-06-01T10:00:00Z";
    const now = new Date("2026-06-01T10:04:00Z"); // 4 minutes later
    expect(classifyStageRevert(lastCompletedAt, now)).toBe("undo");
  });

  it("undoes exactly at the grace boundary", () => {
    const lastCompletedAt = "2026-06-01T10:00:00Z";
    const now = new Date("2026-06-01T10:05:00Z"); // exactly 5 minutes later
    expect(classifyStageRevert(lastCompletedAt, now)).toBe("undo");
  });

  it("reprocesses past the grace window", () => {
    const lastCompletedAt = "2026-06-01T10:00:00Z";
    const now = new Date("2026-06-01T10:05:01Z"); // just over 5 minutes later
    expect(classifyStageRevert(lastCompletedAt, now)).toBe("reprocess");
  });

  it("respects a custom grace window", () => {
    const lastCompletedAt = "2026-06-01T10:00:00Z";
    const now = new Date("2026-06-01T10:08:00Z");
    expect(classifyStageRevert(lastCompletedAt, now, 10)).toBe("undo");
    expect(classifyStageRevert(lastCompletedAt, now, 5)).toBe("reprocess");
  });
});
