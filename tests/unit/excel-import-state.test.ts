import { describe, expect, it } from "vitest";

import {
  buildAutoMachineRows,
  collectUsedPlacasForOtherLines,
  findAutoPlacaIssue,
  initialLineState,
  resizePlacaNumbers,
} from "@/components/admin/excel-import-state";
import type { QuotePreview } from "@/app/admin/actions";

function autoPreview(): QuotePreview {
  return {
    reference: null,
    placaNumber: null,
    placaMode: "auto",
    fecha: null,
    clientName: "Cliente",
    lines: [
      {
        rowIndex: 12,
        producto: "Banco Multifunción",
        clave: "XM105",
        descripcion: "Banco",
        unidades: 2,
        pUnitCop: 1400000,
        importeCop: 2800000,
        matchedCatalogId: "catalog-1",
        matchedCatalogName: "XM105 · Banco Multifunción",
        placaNumbers: [43, 44],
      },
      {
        rowIndex: 13,
        producto: "Flexo Extensor",
        clave: "XM120",
        descripcion: "Flexo",
        unidades: 1,
        pUnitCop: 4700000,
        importeCop: 4700000,
        matchedCatalogId: "catalog-2",
        matchedCatalogName: "XM120 · Flexo Extensor",
        placaNumbers: [45],
      },
    ],
  };
}

describe("excel import preview state", () => {
  it("expands auto-mode quote lines into one row per machine", () => {
    const preview = autoPreview();
    const rows = buildAutoMachineRows(preview, initialLineState(preview));

    expect(rows.map((row) => `${row.rowIndex}:${row.machineIndex}:${row.placaNumber}`)).toEqual([
      "12:0:43",
      "12:1:44",
      "13:0:45",
    ]);
  });

  it("extends a line's placas without reusing another staged line's placa", () => {
    const preview = autoPreview();
    const state = initialLineState(preview);
    const usedByOtherLines = collectUsedPlacasForOtherLines(state, 12);

    expect(resizePlacaNumbers(state[12].placaNumbers, 3, usedByOtherLines)).toEqual([43, 44, 46]);
  });

  it("reports duplicate manual placas in the staged auto import", () => {
    const preview = autoPreview();
    const state = initialLineState(preview);
    state[13] = { ...state[13], placaNumbers: [44] };

    expect(findAutoPlacaIssue(preview, state)).toBe("La PLACA 44 está repetida en esta importación.");
  });
});
