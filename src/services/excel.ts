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
  /** Optional row-level Coti/Serial value from the product table. */
  serialNumber: number | null;
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
  coti: "reference",
  cotizacion: "reference",
  cotización: "reference",
  referencia: "reference",
  fecha: "fecha",
  cliente: "clientName",
  email: "email",
  "teléfono": "phone",
  telefono: "phone",
};

type ProductTableColumns = {
  producto: number;
  clave: number;
  descripcion: number;
  unidades: number;
  pUnitCop: number;
  importeCop: number;
  serialNumber: number | null;
};

const DEFAULT_PRODUCT_COLUMNS: ProductTableColumns = {
  producto: 1,
  clave: 2,
  descripcion: 3,
  unidades: 4,
  pUnitCop: 7,
  importeCop: 8,
  serialNumber: null,
};

function toNodeBuffer(input: ArrayBuffer | Uint8Array | Buffer): Buffer {
  if (Buffer.isBuffer(input)) return input;
  if (input instanceof Uint8Array) return Buffer.from(input.buffer, input.byteOffset, input.byteLength);
  return Buffer.from(input);
}

function normalizeLabel(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/:$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

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

function cellOptionalNumber(value: ExcelJS.CellValue): number | null {
  if (!cellString(value)) return null;
  const parsed = cellNumber(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function resolveProductColumns(row: ExcelJS.Row): ProductTableColumns {
  const columns = { ...DEFAULT_PRODUCT_COLUMNS };

  row.eachCell((cell, colNumber) => {
    const label = normalizeLabel(cellString(cell.value));
    if (label === "producto") columns.producto = colNumber;
    if (label === "clave" || label === "codigo" || label === "código") columns.clave = colNumber;
    if (label === "descripcion" || label === "descripción") columns.descripcion = colNumber;
    if (label === "unid." || label === "unid" || label === "unidad" || label === "unidades") {
      columns.unidades = colNumber;
    }
    if (label === "p.unit." || label === "p.unit" || label === "p unit" || label === "p. unit.") {
      columns.pUnitCop = colNumber;
    }
    if (label === "importe") columns.importeCop = colNumber;
    if (label === "coti" || label === "cotizacion" || label === "serial") columns.serialNumber = colNumber;
  });

  return columns;
}

function rowContainsTotalMarker(row: ExcelJS.Row): boolean {
  const markers = new Set(["suma", "subtotal", "total"]);
  let containsMarker = false;

  row.eachCell((cell) => {
    if (markers.has(normalizeLabel(cellString(cell.value)))) {
      containsMarker = true;
    }
  });

  return containsMarker;
}

export async function parseQuoteWorkbook(
  buffer: ArrayBuffer | Uint8Array | Buffer,
): Promise<ParsedQuote> {
  const workbook = new ExcelJS.Workbook();
  // `File.arrayBuffer()` in the Server Action runtime (undici's File) can return a
  // cross-realm ArrayBuffer that jszip's internal `instanceof` checks reject with
  // "Can't read the data of 'the loaded zip file'". Normalizing to a Node Buffer
  // makes exceljs accept it regardless of where the bytes came from.
  // exceljs ships its own `Buffer` typing that doesn't line up with Node's; the
  // value is a real Node Buffer at runtime, which is what `load` actually wants.
  await workbook.xlsx.load(toNodeBuffer(buffer) as unknown as Parameters<typeof workbook.xlsx.load>[0]);
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
  let columns = DEFAULT_PRODUCT_COLUMNS;

  sheet.eachRow((row, rowNumber) => {
    const labelRaw = normalizeLabel(cellString(row.getCell(1).value));
    if (!headerRow && labelRaw in HEADER_LABELS) {
      const key = HEADER_LABELS[labelRaw];
      const value = cellString(row.getCell(2).value);
      if (value) quote[key] = value;
    }
    if (!headerRow && labelRaw === "producto") {
      headerRow = rowNumber;
      columns = resolveProductColumns(row);
    }
  });

  if (!headerRow) {
    throw new Error("No se encontró la tabla de productos (fila 'Producto').");
  }

  for (let rowNumber = headerRow + 1; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    if (rowContainsTotalMarker(row)) continue;

    const producto = cellString(row.getCell(columns.producto).value);
    const clave = cellString(row.getCell(columns.clave).value);
    const descripcion = cellString(row.getCell(columns.descripcion).value);
    const pUnitCop = cellNumber(row.getCell(columns.pUnitCop).value);
    const importeCop = cellNumber(row.getCell(columns.importeCop).value);
    const serialNumber = columns.serialNumber
      ? cellOptionalNumber(row.getCell(columns.serialNumber).value)
      : null;

    if (!producto && !clave && !descripcion && !pUnitCop && !importeCop) continue;
    if (!producto && !clave && !pUnitCop && !importeCop) continue;

    const unidades = Math.max(1, Math.round(cellNumber(row.getCell(columns.unidades).value)) || 1);
    quote.lines.push({
      rowIndex: rowNumber,
      producto,
      clave,
      descripcion,
      unidades,
      serialNumber,
      pUnitCop,
      importeCop,
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
    { header: "SERIAL", key: "serial", width: 10 },
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
    { header: "Fecha prometida", key: "promised", width: 16 },
    { header: "Fecha actualizada", key: "estimated", width: 16 },
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
      serial: machine.serialNumber,
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

type CatalogWorkbookItem = {
  code: string;
  name: string;
  line: string | null;
  default_price_cop: number | null;
  is_active: boolean;
  previos: { name: string }[];
};

/** Builds a catalog workbook (one row per equipment, with its previos). */
export async function buildCatalogWorkbook(items: CatalogWorkbookItem[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "XTENSOR";
  workbook.created = new Date();
  const sheet = workbook.addWorksheet("Catálogo");

  const columns: Array<{ header: string; key: string; width: number }> = [
    { header: "Código", key: "code", width: 14 },
    { header: "Equipo", key: "name", width: 34 },
    { header: "Línea", key: "line", width: 18 },
    { header: "Precio COP", key: "price", width: 16 },
    { header: "Estado", key: "status", width: 12 },
    { header: "Previos", key: "previos", width: 48 },
  ];
  sheet.columns = columns.map(({ key, width }) => ({ key, width }));

  const headerRow = sheet.addRow(Object.fromEntries(columns.map((c) => [c.key, c.header])));
  headerRow.font = { bold: true, color: { argb: "FF111111" } };
  headerRow.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF2C200" } };
    cell.alignment = { vertical: "middle" };
  });

  for (const item of items) {
    const price = item.default_price_cop ?? "";
    const row = sheet.addRow({
      code: item.code,
      name: item.name,
      line: item.line ?? "",
      price,
      status: item.is_active ? "Activo" : "Inactivo",
      previos: item.previos.map((p) => p.name).join(" | "),
    });
    if (price !== "") {
      row.getCell("price").numFmt = "#,##0";
    }
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

export async function buildShippedWorkbook(machines: CalculatedMachineView[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "XTENSOR";
  workbook.created = new Date();
  const sheet = workbook.addWorksheet("Despachados");

  const columns: Array<{ header: string; key: string; width: number }> = [
    { header: "SERIAL", key: "serial", width: 10 },
    { header: "Cliente", key: "client", width: 26 },
    { header: "Producto", key: "product", width: 30 },
    { header: "Clave", key: "code", width: 12 },
    { header: "Línea", key: "line", width: 16 },
    { header: "Color", key: "color", width: 14 },
    { header: "Ciudad", key: "city", width: 16 },
    { header: "P.UNIT.", key: "punit", width: 14 },
    { header: "Importe", key: "importe", width: 14 },
    { header: "Horas totales", key: "hours", width: 14 },
    { header: "Asignado", key: "assigned", width: 18 },
    { header: "Fecha prometida", key: "promised", width: 16 },
    { header: "Inicio producción", key: "started", width: 18 },
    { header: "Fecha terminada", key: "completed", width: 16 },
    { header: "Fecha despacho", key: "shipped", width: 16 },
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
      serial: machine.serialNumber,
      client: machine.clientName,
      product: machine.equipmentName,
      code: machine.equipmentCode ?? "",
      line: machine.line ?? "",
      color: machine.colorName ?? "",
      city: machine.city ?? "",
      punit: machine.salePriceCop,
      importe: machine.salePriceCop,
      hours: machine.totalHours,
      assigned: machine.assignedTo ?? "",
      promised: machine.promisedDate ? formatDateEs(machine.promisedDate) : "",
      started: machine.firstTaskAt ? formatDateEs(machine.firstTaskAt) : "",
      completed: machine.completedAt ? formatDateEs(machine.completedAt) : "",
      shipped: machine.shippedAt ? formatDateEs(machine.shippedAt) : "",
    });
    row.getCell("punit").numFmt = "#,##0";
    row.getCell("importe").numFmt = "#,##0";
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
