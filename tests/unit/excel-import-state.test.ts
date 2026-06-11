import { describe, expect, it } from "vitest";

import {
  buildMachineRows,
  collectSerialsFromEntries,
  collectUsedSerialsForOtherLines,
  findSerialIssue,
  initialLineState,
  resizeSerialNumbers,
  validateEntries,
  type ImportFileEntry,
} from "@/components/admin/excel-import-state";
import type { QuotePreview } from "@/services/quote-preview";

function autoPreview(): QuotePreview {
  return {
    reference: null,
    serialNumber: null,
    serialMode: "auto",
    fecha: null,
    clientName: "Cliente",
    lines: [
      {
        rowIndex: 12,
        producto: "Banco Multifunción",
        clave: "XM105",
        descripcion: "Banco",
        unidades: 2,
        serialNumber: null,
        pUnitCop: 1400000,
        importeCop: 2800000,
        ignored: false,
        matchedCatalogId: "catalog-1",
        matchedCatalogName: "XM105 · Banco Multifunción",
        serialNumbers: [43, 44],
      },
      {
        rowIndex: 13,
        producto: "Flexo Extensor",
        clave: "XM120",
        descripcion: "Flexo",
        unidades: 1,
        serialNumber: null,
        pUnitCop: 4700000,
        importeCop: 4700000,
        ignored: false,
        matchedCatalogId: "catalog-2",
        matchedCatalogName: "XM120 · Flexo Extensor",
        serialNumbers: [45],
      },
    ],
  };
}

describe("excel import preview state", () => {
  it("expands auto-mode quote lines into one row per machine", () => {
    const preview = autoPreview();
    const rows = buildMachineRows(preview, initialLineState(preview));

    expect(rows.map((row) => `${row.rowIndex}:${row.machineIndex}:${row.serialNumber}`)).toEqual([
      "12:0:43",
      "12:1:44",
      "13:0:45",
    ]);
  });

  it("extends a line's serials without reusing another staged line's serial", () => {
    const preview = autoPreview();
    const state = initialLineState(preview);
    const usedByOtherLines = collectUsedSerialsForOtherLines(state, 12);

    expect(resizeSerialNumbers(state[12].serialNumbers, 3, usedByOtherLines)).toEqual([43, 44, 46]);
  });

  it("reports duplicate manual seriales in the staged auto import", () => {
    const preview = autoPreview();
    const state = initialLineState(preview);
    state[13] = { ...state[13], serialNumbers: [44] };

    expect(findSerialIssue(preview, state)).toBe("La SERIAL 44 está repetida en esta importación.");
  });

  it("seeds a second file's serials to avoid those already taken by the first file", () => {
    const preview = autoPreview();
    const first = initialLineState(preview);
    const seedUsed = collectSerialsFromEntries([
      { id: "a", fileName: "a.xlsx", preview, clientName: "A", promisedDate: "2026-07-01", lineState: first },
    ]);
    const second = initialLineState(preview, seedUsed);

    const firstSerials = Object.values(first).flatMap((s) => s.serialNumbers);
    const secondSerials = Object.values(second).flatMap((s) => s.serialNumbers);

    expect(firstSerials).toEqual([43, 44, 45]);
    // Second file must not reuse any serial from the first.
    expect(secondSerials.some((serial) => firstSerials.includes(serial))).toBe(false);
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

  it("flags both files when a serial collides across files", () => {
    const a = entry("a");
    // Force file b to reuse one of file a's seriales.
    const b = entry("b", {
      lineState: {
        ...initialLineState(autoPreview()),
        12: { resolution: "catalog-1", unidades: 2, serialNumbers: [43, 99] },
      },
    });

    const result = validateEntries([a, b]);
    expect(result.a.valid).toBe(false);
    expect(result.b.valid).toBe(false);
    expect(result.a.reason).toBe("La SERIAL 43 se repite en otro archivo.");
  });

  it("keeps independent files valid", () => {
    const a = entry("a");
    const seedUsed = collectSerialsFromEntries([a]);
    const b = entry("b", { lineState: initialLineState(autoPreview(), seedUsed) });

    const result = validateEntries([a, b]);
    expect(result.a.valid).toBe(true);
    expect(result.b.valid).toBe(true);
  });
});
