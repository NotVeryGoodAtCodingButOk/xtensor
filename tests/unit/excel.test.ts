import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";

import { parseQuoteWorkbook } from "@/services/excel";

/** Builds a workbook mirroring the XTENSOR cotización layout. */
async function buildQuoteFixture(options: { includeReference?: boolean } = {}): Promise<ArrayBuffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Cotizacion");

  if (options.includeReference !== false) {
    sheet.getCell("A3").value = "Referencia";
    sheet.getCell("B3").value = "6878";
  }
  sheet.getCell("A4").value = "Fecha";
  sheet.getCell("B4").value = "2026-03-16";
  sheet.getCell("A5").value = "Cliente";
  sheet.getCell("B5").value = "Xtensor S.AS";
  sheet.getCell("A6").value = "Email";
  sheet.getCell("B6").value = "ventas@xtensor.co";

  // Header row of the line-item table.
  const header = ["Producto", "Clave", "Descripción", "UNID.", "Descuento", "Impuesto", "P.UNIT.", "Importe", "Placa"];
  header.forEach((value, index) => {
    sheet.getCell(11, index + 1).value = value;
  });

  const rows = [
    ["Flexo Extensor", "XM120", "XM120 - Tren Inferior", 1, 0, 0, 4748100, 4748100],
    ["Banco Multifunción", "XM105", "XM105 - Multifunción", 3, 0, 0, 1416100, 4248300],
  ];
  rows.forEach((row, rowOffset) => {
    row.forEach((value, index) => {
      sheet.getCell(12 + rowOffset, index + 1).value = value;
    });
  });

  sheet.getCell("G35").value = "Suma";
  sheet.getCell("H35").value = 8996400;

  return workbook.xlsx.writeBuffer() as Promise<ArrayBuffer>;
}

describe("parseQuoteWorkbook", () => {
  it("extracts the header and line items", async () => {
    const buffer = await buildQuoteFixture();
    const quote = await parseQuoteWorkbook(buffer);

    expect(quote.reference).toBe("6878");
    expect(quote.clientName).toBe("Xtensor S.AS");
    expect(quote.lines).toHaveLength(2);

    expect(quote.lines[0]).toMatchObject({
      producto: "Flexo Extensor",
      clave: "XM120",
      unidades: 1,
      pUnitCop: 4748100,
    });
    expect(quote.lines[1]).toMatchObject({
      clave: "XM105",
      unidades: 3,
      pUnitCop: 1416100,
    });
  });

  it("stops at the Suma totals block", async () => {
    const buffer = await buildQuoteFixture();
    const quote = await parseQuoteWorkbook(buffer);
    // The "Suma" row must not be captured as a line item.
    expect(quote.lines.every((line) => line.producto.toLowerCase() !== "suma")).toBe(true);
  });

  it("does not require a COTI/reference row", async () => {
    const buffer = await buildQuoteFixture({ includeReference: false });
    const quote = await parseQuoteWorkbook(buffer);

    expect(quote.reference).toBeNull();
    expect(quote.lines).toHaveLength(2);
  });

  it("skips blank and total rows while continuing through the worksheet", async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Cotizacion");
    ["Producto", "Clave", "Descripción", "UNID.", "Descuento", "Impuesto", "P.UNIT.", "Importe"].forEach(
      (value, index) => {
        sheet.getCell(3, index + 1).value = value;
      },
    );
    sheet.getCell("A4").value = "Flexo Extensor";
    sheet.getCell("B4").value = "XM120";
    sheet.getCell("D4").value = 1;
    sheet.getCell("G4").value = 4748100;
    sheet.getCell("H4").value = 4748100;
    sheet.getCell("G6").value = "Suma";
    sheet.getCell("H6").value = 4748100;
    sheet.getCell("A8").value = "Banco Multifunción";
    sheet.getCell("B8").value = "XM105";
    sheet.getCell("D8").value = 2;
    sheet.getCell("G8").value = 1416100;
    sheet.getCell("H8").value = 2832200;

    const quote = await parseQuoteWorkbook((await workbook.xlsx.writeBuffer()) as ArrayBuffer);

    expect(quote.lines.map((line) => line.clave)).toEqual(["XM120", "XM105"]);
    expect(quote.lines[1].unidades).toBe(2);
  });
});
