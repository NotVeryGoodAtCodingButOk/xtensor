import "server-only";
import ExcelJS from "exceljs";

import type { CalculatedMachineView } from "@/types/domain";
import { formatDateEs } from "@/services/schedule";

/**
 * Parsing and generation for the XTENSOR cotización workbook format.
 *
 * The input workbook is a quote ("cotización"): a header block with the
 * reference, date and client data, followed by a table of line items. Each
 * line item maps to one or more machines (one per unit) in the schedule.
 */

export type ParsedQuoteLine = {
  /** 1-based source row, used as a stable key in the UI. */
  rowIndex: number;
  producto: string;
  /** Catalog code ("Clave"), e.g. XM120. */
  clave: string;
  descripcion: string;
  unidades: number;
  /** P.UNIT — unit sale price before tax. */
  pUnitCop: number;
  importeCop: number;
};

export type ParsedQuote = {
  reference: string | null;
  fecha: string | null;
  clientName: string | null;
  email: string | null;
  phone: string | null;
  lines: ParsedQuoteLine[];
};

const HEADER_LABELS: Record<string, keyof Pick<ParsedQuote, "reference" | "fecha" | "clientName" | "email" | "phone">> = {
  referencia: "reference",
  fecha: "fecha",
  cliente: "clientName",
  email: "email",
  "teléfono": "phone",
  telefono: "phone",
};

function cellString(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number") return String(value);
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "object") {
    if ("text" in value && typeof value.text === "string") return value.text.trim();
    if ("result" in value) return cellString((value as ExcelJS.CellFormulaValue).result ?? "");
    if ("richText" in value && Array.isArray(value.richText)) {
      return value.richText.map((part) => part.text).join("").trim();
    }
  }
  return String(value).trim();
}

function cellNumber(value: ExcelJS.CellValue): number {
  if (typeof value === "number") return value;
  const text = cellString(value).replace(/[^0-9.,-]/g, "").replace(/\.(?=\d{3}\b)/g, "").replace(",", ".");
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function parseQuoteWorkbook(buffer: ArrayBuffer): Promise<ParsedQuote> {
  const workbook = new ExcelJS.Workbook();
  // exceljs's typings declare `Buffer extends ArrayBuffer`, so an ArrayBuffer is what
  // it actually wants; jszip accepts it at runtime too.
  await workbook.xlsx.load(buffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) {
    throw new Error("El archivo no contiene hojas.");
  }

  const quote: ParsedQuote = {
    reference: null,
    fecha: null,
    clientName: null,
    email: null,
    phone: null,
    lines: [],
  };

  let headerRow = 0;

  sheet.eachRow((row, rowNumber) => {
    const labelRaw = cellString(row.getCell(1).value).toLowerCase().replace(/:$/, "").trim();
    if (!headerRow && labelRaw in HEADER_LABELS) {
      const key = HEADER_LABELS[labelRaw];
      const value = cellString(row.getCell(2).value);
      if (value) quote[key] = value;
    }
    if (!headerRow && labelRaw === "producto") {
      headerRow = rowNumber;
    }
  });

  if (!headerRow) {
    throw new Error("No se encontró la tabla de productos (fila 'Producto').");
  }

  for (let rowNumber = headerRow + 1; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    const producto = cellString(row.getCell(1).value);
    const clave = cellString(row.getCell(2).value);
    const colA = producto.toLowerCase();

    // Stop at the totals block ("Suma" / "Total") or once both leading columns are blank.
    if (colA === "suma" || colA === "total") break;
    const sumaMarker = cellString(row.getCell(7).value).toLowerCase();
    if (sumaMarker === "suma" || sumaMarker === "total") break;
    if (!producto && !clave) continue;

    const unidades = Math.max(1, Math.round(cellNumber(row.getCell(4).value)) || 1);
    quote.lines.push({
      rowIndex: rowNumber,
      producto,
      clave,
      descripcion: cellString(row.getCell(3).value),
      unidades,
      pUnitCop: cellNumber(row.getCell(7).value),
      importeCop: cellNumber(row.getCell(8).value),
    });
  }

  return quote;
}

/** Builds a whole-schedule workbook (one row per machine, in queue order). */
export async function buildScheduleWorkbook(machines: CalculatedMachineView[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "XTENSOR";
  workbook.created = new Date();
  const sheet = workbook.addWorksheet("Plan de producción");

  const columns: Array<{ header: string; key: string; width: number }> = [
    { header: "Posición", key: "position", width: 10 },
    { header: "COTI", key: "coti", width: 10 },
    { header: "Cliente", key: "client", width: 26 },
    { header: "Producto", key: "product", width: 30 },
    { header: "Clave", key: "code", width: 12 },
    { header: "Línea", key: "line", width: 16 },
    { header: "Color", key: "color", width: 14 },
    { header: "Ciudad", key: "city", width: 16 },
    { header: "UNID.", key: "unid", width: 8 },
    { header: "P.UNIT.", key: "punit", width: 14 },
    { header: "Importe", key: "importe", width: 14 },
    { header: "Estado", key: "status", width: 14 },
    { header: "Progreso", key: "progress", width: 10 },
    { header: "Fecha estimada", key: "estimated", width: 16 },
    { header: "Fecha ofrecida", key: "promised", width: 16 },
    { header: "Asignado", key: "assigned", width: 18 },
  ];
  sheet.columns = columns.map(({ key, width }) => ({ key, width }));

  const headerRow = sheet.addRow(Object.fromEntries(columns.map((c) => [c.key, c.header])));
  headerRow.font = { bold: true, color: { argb: "FF111111" } };
  headerRow.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF2C200" } };
    cell.alignment = { vertical: "middle" };
  });

  for (const machine of machines) {
    const row = sheet.addRow({
      position: machine.orderPosition,
      coti: machine.cotiNumber,
      client: machine.clientName,
      product: machine.equipmentName,
      code: machine.equipmentCode ?? "",
      line: machine.line ?? "",
      color: machine.colorName ?? "",
      city: machine.city ?? "",
      unid: 1,
      punit: machine.salePriceCop,
      importe: machine.salePriceCop,
      status: machine.status === "shipped" ? "Despachada" : "En producción",
      progress: `${Math.round(machine.progressPct * 100)}%`,
      estimated: machine.estimatedDate ? formatDateEs(machine.estimatedDate) : "",
      promised: machine.promisedDate ? formatDateEs(machine.promisedDate) : "",
      assigned: machine.assignedTo ?? "",
    });
    row.getCell("punit").numFmt = "#,##0";
    row.getCell("importe").numFmt = "#,##0";
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
