import { describe, expect, it } from "vitest";

import { buildQuotePreview, normalizeCatalogCode } from "@/services/quote-preview";
import type { ParsedQuote } from "@/services/excel";

let nextRow = 100;
function line(clave: string, producto = "Producto", overrides: Partial<ParsedQuote["lines"][number]> = {}): ParsedQuote["lines"][number] {
  return {
    rowIndex: nextRow++,
    producto,
    clave,
    descripcion: "",
    unidades: 1,
    serialNumber: null,
    pUnitCop: 1000000,
    importeCop: 1000000,
    ...overrides,
  };
}

function parsedQuote(lines: ParsedQuote["lines"]): ParsedQuote {
  return {
    reference: "6878",
    fecha: "2026-03-16",
    clientName: "Xtensor S.AS",
    email: "ventas@xtensor.co",
    phone: "3233437444",
    lines,
  };
}

describe("buildQuotePreview", () => {
  it("uses sequential per-machine seriales when the table Coti column is blank, even with a top reference", () => {
    const preview = buildQuotePreview({
      quote: parsedQuote([
        {
          rowIndex: 12,
          producto: "Flexo Extensor",
          clave: "XM120",
          descripcion: "XM120 - Tren Inferior",
          unidades: 1,
          serialNumber: null,
          pUnitCop: 4748100,
          importeCop: 4748100,
        },
        {
          rowIndex: 13,
          producto: "Banco Multifunción",
          clave: "XM105",
          descripcion: "XM105 - Multifunción",
          unidades: 3,
          serialNumber: null,
          pUnitCop: 1416100,
          importeCop: 4248300,
        },
      ]),
      catalog: [
        { id: "catalog-1", code: "XM120", name: "Flexo Extensor" },
        { id: "catalog-2", code: "XM105", name: "Banco Multifunción" },
      ],
      activeSerialNumbers: [12, 41, 42],
    });

    expect(preview.reference).toBe("6878");
    expect(preview.serialMode).toBe("auto");
    expect(preview.serialNumber).toBeNull();
    expect(preview.lines.map((line) => line.serialNumbers)).toEqual([[43], [44, 45, 46]]);
  });

  it("expands an explicit row-level Coti as the first serial for that line's machines", () => {
    const preview = buildQuotePreview({
      quote: parsedQuote([
        {
          rowIndex: 12,
          producto: "Banco Multifunción",
          clave: "XM105",
          descripcion: "XM105 - Multifunción",
          unidades: 3,
          serialNumber: 50,
          pUnitCop: 1416100,
          importeCop: 4248300,
        },
        {
          rowIndex: 13,
          producto: "Flexo Extensor",
          clave: "XM120",
          descripcion: "XM120 - Tren Inferior",
          unidades: 1,
          serialNumber: null,
          pUnitCop: 4748100,
          importeCop: 4748100,
        },
      ]),
      catalog: [],
      activeSerialNumbers: [49],
    });

    expect(preview.lines.map((line) => line.serialNumbers)).toEqual([[50, 51, 52], [53]]);
  });
});

describe("normalizeCatalogCode", () => {
  it("collapses dashes, spaces and case while keeping the alphanumeric sequence", () => {
    expect(normalizeCatalogCode("XM606")).toBe("XM606");
    expect(normalizeCatalogCode("XM 606")).toBe("XM606");
    expect(normalizeCatalogCode("XM-606")).toBe("XM606");
    expect(normalizeCatalogCode("XM- 606")).toBe("XM606");
    expect(normalizeCatalogCode("  xm-606 ")).toBe("XM606");
  });

  it("keeps genuinely different codes distinct", () => {
    expect(normalizeCatalogCode("XB 606")).not.toBe(normalizeCatalogCode("XM 606"));
    expect(normalizeCatalogCode("XB-449")).toBe("XB449");
  });
});

describe("buildQuotePreview catalog matching", () => {
  const catalog = [
    { id: "xb442", code: "XB442", name: "Sentadilla con discos" },
    { id: "xb449", code: "XB449", name: "Halon de espalda con discos" },
    { id: "xm200", code: "XM200", name: "Placas adicionales" },
  ];

  it("matches claves with dashes and spaces to dashless catalog codes", () => {
    const preview = buildQuotePreview({
      quote: parsedQuote([line("XB-442"), line("XB- 449")]),
      catalog,
      activeSerialNumbers: [],
    });
    expect(preview.lines.map((l) => l.matchedCatalogId)).toEqual(["xb442", "xb449"]);
    expect(preview.lines.every((l) => !l.ignored)).toBe(true);
  });

  it("does not match a different prefix with the same number", () => {
    const preview = buildQuotePreview({
      quote: parsedQuote([line("XM-442")]),
      catalog,
      activeSerialNumbers: [],
    });
    expect(preview.lines[0]?.matchedCatalogId).toBeNull();
  });

  it("aliases the placas-adicionales clave (XTM000) to catalog code XM200", () => {
    const preview = buildQuotePreview({
      quote: parsedQuote([line("XTM000", "PLACAS ADICIONALES")]),
      catalog,
      activeSerialNumbers: [],
    });
    expect(preview.lines[0]?.matchedCatalogId).toBe("xm200");
    expect(preview.lines[0]?.ignored).toBe(false);
  });

  it("flags transporte and instalación line items as ignored", () => {
    const preview = buildQuotePreview({
      quote: parsedQuote([line("XTF-002", "Transporte"), line("XTBS-IN001", "Instalación de equipos")]),
      catalog,
      activeSerialNumbers: [],
    });
    expect(preview.lines.map((l) => l.ignored)).toEqual([true, true]);
    expect(preview.lines.map((l) => l.matchedCatalogId)).toEqual([null, null]);
  });

  it("drops ambiguous catalog keys instead of mis-assigning them", () => {
    const preview = buildQuotePreview({
      quote: parsedQuote([line("XM-606")]),
      catalog: [
        { id: "a", code: "XM606", name: "A" },
        { id: "b", code: "XM 606", name: "B" },
      ],
      activeSerialNumbers: [],
    });
    expect(preview.lines[0]?.matchedCatalogId).toBeNull();
  });
});
