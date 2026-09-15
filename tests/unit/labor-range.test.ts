import { describe, expect, it } from "vitest";
import { resolveLaborRange } from "@/services/labor-dashboard";

// 2026-06-01 is a Monday, 2026-06-05 is a Friday, 2026-06-06/07 is the
// weekend (matches the fixture dates already used in
// tests/unit/statistics.test.ts and tests/unit/labor-time.test.ts).
const wednesday = new Date("2026-06-03T15:00:00-05:00");

describe("resolveLaborRange", () => {
  it("defaults to esta-semana when no preset is given", () => {
    const range = resolveLaborRange(undefined, wednesday);
    expect(range.preset).toBe("esta-semana");
  });

  it("defaults to esta-semana on an unknown preset", () => {
    const range = resolveLaborRange("no-existe", wednesday);
    expect(range.preset).toBe("esta-semana");
  });

  it("hoy: the current Bogota-local calendar day", () => {
    const range = resolveLaborRange("hoy", wednesday);
    expect(range.label).toBe("Hoy");
    expect(range.startIso).toBe("2026-06-03T05:00:00.000Z");
    expect(range.endIso).toBe("2026-06-04T05:00:00.000Z");
  });

  it("esta-semana: Monday-start week containing a mid-week 'now'", () => {
    const range = resolveLaborRange("esta-semana", wednesday);
    expect(range.label).toBe("Esta semana");
    expect(range.startIso).toBe("2026-06-01T05:00:00.000Z");
    expect(range.endIso).toBe("2026-06-08T05:00:00.000Z");
  });

  it("esta-semana: Sunday still belongs to the week that started the previous Monday", () => {
    const sunday = new Date("2026-06-07T10:00:00-05:00");
    const range = resolveLaborRange("esta-semana", sunday);
    expect(range.startIso).toBe("2026-06-01T05:00:00.000Z");
    expect(range.endIso).toBe("2026-06-08T05:00:00.000Z");
  });

  it("este-mes: first of the current month through first of next month", () => {
    const range = resolveLaborRange("este-mes", wednesday);
    expect(range.label).toBe("Este mes");
    expect(range.startIso).toBe("2026-06-01T05:00:00.000Z");
    expect(range.endIso).toBe("2026-07-01T05:00:00.000Z");
  });

  it("mes-pasado: the previous calendar month", () => {
    const range = resolveLaborRange("mes-pasado", wednesday);
    expect(range.label).toBe("Mes pasado");
    expect(range.startIso).toBe("2026-05-01T05:00:00.000Z");
    expect(range.endIso).toBe("2026-06-01T05:00:00.000Z");
  });

  it("mes-pasado: rolls back across a year boundary", () => {
    const january = new Date("2026-01-15T12:00:00-05:00");
    const range = resolveLaborRange("mes-pasado", january);
    expect(range.startIso).toBe("2025-12-01T05:00:00.000Z");
    expect(range.endIso).toBe("2026-01-01T05:00:00.000Z");
  });

  it("ultimos-30-dias: a trailing 30-day window including today", () => {
    const range = resolveLaborRange("ultimos-30-dias", wednesday);
    expect(range.label).toBe("Últimos 30 días");
    expect(range.startIso).toBe("2026-05-05T05:00:00.000Z");
    expect(range.endIso).toBe("2026-06-04T05:00:00.000Z");
  });
});
