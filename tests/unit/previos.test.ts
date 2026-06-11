import { describe, expect, it } from "vitest";
import fixture from "../fixtures/excel-plan-prod-mayo-2026.json";
import { buildFixturePrevioMaps, buildMachinePrevioSummary, resolveFixturePrevios } from "@/services/previos";
import type { MachinePrevioView } from "@/types/domain";

describe("previos helpers", () => {
  it("extracts grouped previos from the workbook fixture and backfills by equipment code", () => {
    const maps = buildFixturePrevioMaps(fixture.rows);

    expect(resolveFixturePrevios({ serialNumber: 987, equipmentCode: "XM145" }, maps)).toEqual([
      "Torno A.",
      "Torno E.",
      "Laser",
      "Carenaje",
      "Placas",
      "Tubos",
      "Inox.",
      "Pintu.",
      "Zinc",
      "Tornillos",
      "Rodam.",
      "Cojines",
    ]);

    expect(resolveFixturePrevios({ serialNumber: 975, equipmentCode: "XM105" }, maps)).toEqual(["Torno E.", "Cojines"]);

    expect(resolveFixturePrevios({ serialNumber: 123456, equipmentCode: "XM105" }, maps)).toEqual([
      "Carenaje",
      "Cojines",
      "Laser",
      "Torno E.",
      "Tubos",
    ]);
  });

  it("summarizes machine-level previous for filtering", () => {
    const previos: MachinePrevioView[] = [
      {
        id: "1",
        previoCatalogId: "a",
        name: "Laser",
        ordered: true,
        orderedAt: "2026-05-01T00:00:00Z",
        orderedBy: "user-1",
        received: false,
        receivedAt: null,
        receivedBy: null,
        createdAt: "2026-05-01T00:00:00Z",
      },
      {
        id: "2",
        previoCatalogId: "b",
        name: "Tubos",
        ordered: false,
        orderedAt: null,
        orderedBy: null,
        received: false,
        receivedAt: null,
        receivedBy: null,
        createdAt: "2026-05-01T00:00:00Z",
      },
    ];

    expect(buildMachinePrevioSummary(previos, "in_production")).toEqual({
      total: 2,
      orderedCount: 1,
      receivedCount: 0,
      missingPrevios: false,
      pendingOrdered: true,
      pendingReceived: true,
      incompleteWhileInProduction: true,
    });
  });
});
