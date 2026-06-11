import type { QuotePreview } from "@/services/quote-preview";

export const IMPORT_AUTO_SERIAL_MAX = 999;

export type LineState = {
  resolution: string;
  unidades: number;
  serialNumbers: number[];
  colorId?: string | null;
};

type PreviewLine = QuotePreview["lines"][number];

export type MachinePreviewRow = {
  line: PreviewLine;
  rowIndex: number;
  machineIndex: number;
  unitCount: number;
  serialNumber: number;
  resolution: string;
};

export function defaultLineResolution(line: PreviewLine) {
  if (line.ignored) return "skip";
  return line.matchedCatalogId ?? "custom";
}

export function normalizeUnitCount(value: unknown) {
  const parsed = Number(value);
  return Math.max(1, Math.round(Number.isFinite(parsed) ? parsed : 0) || 1);
}

export function nextAvailableSerial(start: number, used: Set<number>) {
  let candidate = start;
  for (let attempts = 0; attempts < IMPORT_AUTO_SERIAL_MAX; attempts += 1) {
    candidate = candidate >= IMPORT_AUTO_SERIAL_MAX ? 1 : candidate + 1;
    if (!used.has(candidate)) return candidate;
  }
  return 1;
}

export function resizeSerialNumbers(current: number[], units: number, usedByOtherLines: Set<number>) {
  const target = normalizeUnitCount(units);
  const next = current.slice(0, target);
  const used = new Set([...usedByOtherLines, ...next.filter((serial) => Number.isInteger(serial) && serial > 0)]);
  let cursor = used.size > 0 ? Math.max(...used) : 0;

  while (next.length < target) {
    const serial = nextAvailableSerial(cursor, used);
    next.push(serial);
    used.add(serial);
    cursor = serial;
  }

  return next;
}

/**
 * Assign one SERIAL per unit, keeping any valid current value that does not
 * collide with `used`, and re-numbering the rest. Unlike `resizeSerialNumbers`
 * this also replaces existing values that collide — needed when seeding a new
 * file against SERIALES already taken by other files in the same batch.
 */
function assignSerialNumbers(current: number[], units: number, used: Set<number>) {
  const target = normalizeUnitCount(units);
  const taken = new Set(used);
  const result: number[] = [];
  let cursor = taken.size > 0 ? Math.max(...taken) : 0;

  for (let i = 0; i < target; i += 1) {
    let serial = current[i];
    if (!Number.isInteger(serial) || serial <= 0 || taken.has(serial)) {
      serial = nextAvailableSerial(cursor, taken);
    }
    result.push(serial);
    taken.add(serial);
    cursor = serial;
  }

  return result;
}

export function initialLineState(
  preview: QuotePreview,
  seedUsed: Set<number> = new Set(),
): Record<number, LineState> {
  const used = new Set(seedUsed);
  const result: Record<number, LineState> = {};

  for (const line of preview.lines) {
    const serialNumbers = assignSerialNumbers(line.serialNumbers, line.unidades, used);
    for (const serial of serialNumbers) used.add(serial);
    result[line.rowIndex] = {
      resolution: defaultLineResolution(line),
      unidades: normalizeUnitCount(line.unidades),
      serialNumbers,
    };
  }

  return result;
}

export function getLineResolution(line: PreviewLine, state: LineState | undefined) {
  return state?.resolution ?? defaultLineResolution(line);
}

export function getLineUnitCount(line: PreviewLine, state: LineState | undefined) {
  return normalizeUnitCount(state?.unidades ?? line.unidades);
}

export function collectUsedSerialsForOtherLines(lineState: Record<number, LineState>, rowIndex: number) {
  return new Set(
    Object.entries(lineState)
      .filter(([currentRowIndex]) => Number(currentRowIndex) !== rowIndex)
      .flatMap(([, item]) => item.serialNumbers),
  );
}

export function getLineSerialNumbers(
  line: PreviewLine,
  state: LineState | undefined,
  usedByOtherLines = new Set<number>(),
) {
  return resizeSerialNumbers(state?.serialNumbers ?? line.serialNumbers, getLineUnitCount(line, state), usedByOtherLines);
}

export function buildMachineRows(
  preview: QuotePreview | null,
  lineState: Record<number, LineState>,
): MachinePreviewRow[] {
  if (!preview) return [];

  return preview.lines.flatMap((line) => {
    const state = lineState[line.rowIndex];
    const unitCount = getLineUnitCount(line, state);
    const resolution = getLineResolution(line, state);
    const serialNumbers = getLineSerialNumbers(line, state);

    return serialNumbers.map((serialNumber, machineIndex) => ({
      line,
      rowIndex: line.rowIndex,
      machineIndex,
      unitCount,
      serialNumber,
      resolution,
    }));
  });
}

/** One uploaded Excel file, with its own client header and editable lines. */
export type ImportFileEntry = {
  id: string;
  fileName: string;
  preview: QuotePreview;
  clientName: string;
  promisedDate: string;
  lineState: Record<number, LineState>;
};

/** Count the machines (units) an entry will create, ignoring skipped lines. */
export function countEntryMachines(entry: ImportFileEntry) {
  return entry.preview.lines.reduce((sum, line) => {
    const state = entry.lineState[line.rowIndex];
    if (getLineResolution(line, state) === "skip") return sum;
    return sum + getLineUnitCount(line, state);
  }, 0);
}

/** Every SERIAL in use across the given entries, optionally excluding one entry. */
export function collectSerialsFromEntries(entries: ImportFileEntry[], exceptId?: string) {
  const used = new Set<number>();
  for (const entry of entries) {
    if (entry.id === exceptId) continue;
    for (const state of Object.values(entry.lineState)) {
      for (const serial of state.serialNumbers) used.add(serial);
    }
  }
  return used;
}

export type EntryValidation = { valid: boolean; reason: string | null };

/**
 * Validate each entry independently so valid files can import while invalid
 * ones stay on screen. Detects in-file issues plus SERIALES that collide across
 * files (both colliding files are flagged).
 */
export function validateEntries(entries: ImportFileEntry[]): Record<string, EntryValidation> {
  const serialCount = new Map<number, number>();
  for (const entry of entries) {
    for (const line of entry.preview.lines) {
      const state = entry.lineState[line.rowIndex];
      if (getLineResolution(line, state) === "skip") continue;
      for (const serial of getLineSerialNumbers(line, state)) {
        serialCount.set(serial, (serialCount.get(serial) ?? 0) + 1);
      }
    }
  }

  const out: Record<string, EntryValidation> = {};
  for (const entry of entries) {
    let reason: string | null = null;

    if (!entry.clientName.trim()) {
      reason = "Falta el nombre del cliente.";
    } else if (!entry.promisedDate) {
      reason = "Falta la fecha prometida.";
    } else if (countEntryMachines(entry) === 0) {
      reason = "No hay líneas seleccionadas para importar.";
    } else {
      reason = findSerialIssue(entry.preview, entry.lineState);
      if (!reason) {
        for (const line of entry.preview.lines) {
          const state = entry.lineState[line.rowIndex];
          if (getLineResolution(line, state) === "skip") continue;
          const clash = getLineSerialNumbers(line, state).find((serial) => (serialCount.get(serial) ?? 0) > 1);
          if (clash) {
            reason = `La SERIAL ${clash} se repite en otro archivo.`;
            break;
          }
        }
      }
    }

    out[entry.id] = { valid: reason === null, reason };
  }

  return out;
}

export function findSerialIssue(preview: QuotePreview | null, lineState: Record<number, LineState>) {
  if (!preview) return null;

  const seen = new Set<number>();
  for (const line of preview.lines) {
    const state = lineState[line.rowIndex];
    const resolution = getLineResolution(line, state);
    if (resolution === "skip") continue;

    const productLabel = line.producto || line.clave || `fila ${line.rowIndex}`;
    const serialNumbers = getLineSerialNumbers(line, state);
    for (const serialNumber of serialNumbers) {
      if (!Number.isInteger(serialNumber) || serialNumber <= 0) {
        return `La SERIAL de "${productLabel}" es inválida.`;
      }
      if (serialNumber > IMPORT_AUTO_SERIAL_MAX) {
        return `La SERIAL ${serialNumber} supera el máximo automático de ${IMPORT_AUTO_SERIAL_MAX}.`;
      }
      if (seen.has(serialNumber)) {
        return `La SERIAL ${serialNumber} está repetida en esta importación.`;
      }
      seen.add(serialNumber);
    }
  }

  return null;
}
