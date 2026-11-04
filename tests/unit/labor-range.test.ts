import { describe, expect, it } from "vitest";
import { resolveLaborGranularity, resolveLaborRange } from "@/services/labor-dashboard";

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

  it("ultimos-90-dias: a trailing 90-day window including today", () => {
    const range = resolveLaborRange("ultimos-90-dias", wednesday);
    expect(range.label).toBe("Últimos 3 meses");
    expect(range.startIso).toBe("2026-03-06T05:00:00.000Z");
    expect(range.endIso).toBe("2026-06-04T05:00:00.000Z");
  });

  it("este-ano: January 1st through next January 1st, in Bogota time", () => {
    const range = resolveLaborRange("este-ano", wednesday);
    expect(range.label).toBe("Este año");
    expect(range.startIso).toBe("2026-01-01T05:00:00.000Z");
    expect(range.endIso).toBe("2027-01-01T05:00:00.000Z");

    // 31 dic 21:00 en Bogotá ya es 1 ene en UTC, pero sigue siendo 2026.
    const newYearsEve = resolveLaborRange("este-ano", new Date("2026-12-31T21:00:00-05:00"));
    expect(newYearsEve.startIso).toBe("2026-01-01T05:00:00.000Z");
  });
});

describe("resolveLaborGranularity", () => {
  it("accepts dia, semana and mes and defaults to dia", () => {
    expect(resolveLaborGranularity("semana")).toBe("semana");
    expect(resolveLaborGranularity("mes")).toBe("mes");
    expect(resolveLaborGranularity("dia")).toBe("dia");
    expect(resolveLaborGranularity(undefined)).toBe("dia");
    expect(resolveLaborGranularity("anual")).toBe("dia");
  });
});
