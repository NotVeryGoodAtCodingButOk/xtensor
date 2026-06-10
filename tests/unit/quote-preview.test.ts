import { describe, expect, it } from "vitest";

import { buildQuotePreview } from "@/services/quote-preview";
import type { ParsedQuote } from "@/services/excel";

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
  it("uses sequential per-machine placas when the table Coti column is blank, even with a top reference", () => {
    const preview = buildQuotePreview({
      quote: parsedQuote([
        {
          rowIndex: 12,
          producto: "Flexo Extensor",
          clave: "XM120",
          descripcion: "XM120 - Tren Inferior",
          unidades: 1,
          placaNumber: null,
          pUnitCop: 4748100,
          importeCop: 4748100,
        },
        {
          rowIndex: 13,
          producto: "Banco Multifunción",
          clave: "XM105",
          descripcion: "XM105 - Multifunción",
          unidades: 3,
          placaNumber: null,
          pUnitCop: 1416100,
          importeCop: 4248300,
        },
      ]),
      catalog: [
        { id: "catalog-1", code: "XM120", name: "Flexo Extensor" },
        { id: "catalog-2", code: "XM105", name: "Banco Multifunción" },
      ],
      activePlacaNumbers: [12, 41, 42],
    });

    expect(preview.reference).toBe("6878");
    expect(preview.placaMode).toBe("auto");
    expect(preview.placaNumber).toBeNull();
    expect(preview.lines.map((line) => line.placaNumbers)).toEqual([[43], [44, 45, 46]]);
  });

  it("expands an explicit row-level Coti as the first placa for that line's machines", () => {
    const preview = buildQuotePreview({
      quote: parsedQuote([
        {
          rowIndex: 12,
          producto: "Banco Multifunción",
          clave: "XM105",
          descripcion: "XM105 - Multifunción",
          unidades: 3,
          placaNumber: 50,
          pUnitCop: 1416100,
          importeCop: 4248300,
        },
        {
          rowIndex: 13,
          producto: "Flexo Extensor",
          clave: "XM120",
          descripcion: "XM120 - Tren Inferior",
          unidades: 1,
          placaNumber: null,
          pUnitCop: 4748100,
          importeCop: 4748100,
        },
      ]),
      catalog: [],
      activePlacaNumbers: [49],
    });

    expect(preview.lines.map((line) => line.placaNumbers)).toEqual([[50, 51, 52], [53]]);
  });
});
