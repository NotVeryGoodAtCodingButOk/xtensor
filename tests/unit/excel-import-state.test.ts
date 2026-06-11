import { describe, expect, it } from "vitest";

import {
  buildMachineRows,
  collectPlacasFromEntries,
  collectUsedPlacasForOtherLines,
  findPlacaIssue,
  initialLineState,
  resizePlacaNumbers,
  validateEntries,
  type ImportFileEntry,
} from "@/components/admin/excel-import-state";
import type { QuotePreview } from "@/services/quote-preview";

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
        placaNumber: null,
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
        placaNumber: null,
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
    const rows = buildMachineRows(preview, initialLineState(preview));

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

    expect(findPlacaIssue(preview, state)).toBe("La PLACA 44 está repetida en esta importación.");
  });

  it("seeds a second file's placas to avoid those already taken by the first file", () => {
    const preview = autoPreview();
    const first = initialLineState(preview);
    const seedUsed = collectPlacasFromEntries([
      { id: "a", fileName: "a.xlsx", preview, clientName: "A", promisedDate: "2026-07-01", lineState: first },
    ]);
    const second = initialLineState(preview, seedUsed);

    const firstPlacas = Object.values(first).flatMap((s) => s.placaNumbers);
    const secondPlacas = Object.values(second).flatMap((s) => s.placaNumbers);

    expect(firstPlacas).toEqual([43, 44, 45]);
    // Second file must not reuse any placa from the first.
    expect(secondPlacas.some((placa) => firstPlacas.includes(placa))).toBe(false);
  });

  function entry(id: string, overrides: Partial<ImportFileEntry> = {}): ImportFileEntry {
    const preview = autoPreview();
    return {
      id,
      fileName: `${id}.xlsx`,
      preview,
      clientName: "Cliente",
      promisedDate: "2026-07-01",
      lineState: initialLineState(preview),
      ...overrides,
    };
  }

  it("flags an entry missing its client name as invalid", () => {
    const result = validateEntries([entry("a", { clientName: "  " })]);
    expect(result.a.valid).toBe(false);
    expect(result.a.reason).toBe("Falta el nombre del cliente.");
  });

  it("flags both files when a placa collides across files", () => {
    const a = entry("a");
    // Force file b to reuse one of file a's placas.
    const b = entry("b", {
      lineState: {
        ...initialLineState(autoPreview()),
        12: { resolution: "catalog-1", unidades: 2, placaNumbers: [43, 99] },
      },
    });

    const result = validateEntries([a, b]);
    expect(result.a.valid).toBe(false);
    expect(result.b.valid).toBe(false);
    expect(result.a.reason).toBe("La PLACA 43 se repite en otro archivo.");
  });

  it("keeps independent files valid", () => {
    const a = entry("a");
    const seedUsed = collectPlacasFromEntries([a]);
    const b = entry("b", { lineState: initialLineState(autoPreview(), seedUsed) });

    const result = validateEntries([a, b]);
    expect(result.a.valid).toBe(true);
    expect(result.b.valid).toBe(true);
  });
});
