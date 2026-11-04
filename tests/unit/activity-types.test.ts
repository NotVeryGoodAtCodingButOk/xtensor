import { describe, expect, it } from "vitest";
import {
  ActivityTypeHasHoursError,
  DESCRIPTION_MAX_LENGTH,
  mapActivityType,
  normalizeDescription,
} from "@/services/activity-types";

describe("activity type description", () => {
  it("trims, collapses spaces and turns empty into null", () => {
    expect(normalizeDescription("  Aseo,  orden y   limpieza ")).toBe("Aseo, orden y limpieza");
    expect(normalizeDescription("   ")).toBeNull();
    expect(normalizeDescription(undefined)).toBeNull();
  });

  it("rejects descriptions longer than the tablet allows", () => {
    expect(() => normalizeDescription("x".repeat(DESCRIPTION_MAX_LENGTH + 1))).toThrow(/máximo 120/);
    expect(normalizeDescription("x".repeat(DESCRIPTION_MAX_LENGTH))).toHaveLength(DESCRIPTION_MAX_LENGTH);
  });

  it("maps the description from the row", () => {
    const view = mapActivityType({
      id: "a1",
      name: "5S",
      description: "Aseo, orden, limpieza y mantenimiento de planta",
      sort_order: 1,
      allows_machine: false,
      is_active: true,
      created_at: "2026-09-17T13:21:07Z",
    });
    expect(view.description).toBe("Aseo, orden, limpieza y mantenimiento de planta");
  });

  it("explains how to delete an activity with hours", () => {
    expect(new ActivityTypeHasHoursError().message).toBe(
      "Esta actividad tiene horas registradas. Elige a qué actividad moverlas.",
    );
  });
});
