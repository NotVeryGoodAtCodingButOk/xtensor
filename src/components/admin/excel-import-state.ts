import type { QuotePreview } from "@/services/quote-preview";

export const IMPORT_AUTO_PLACA_MAX = 999;

export type LineState = {
  resolution: string;
  unidades: number;
  placaNumbers: number[];
};

type PreviewLine = QuotePreview["lines"][number];

export type MachinePreviewRow = {
  line: PreviewLine;
  rowIndex: number;
  machineIndex: number;
  unitCount: number;
  placaNumber: number;
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

export function nextAvailablePlaca(start: number, used: Set<number>) {
  let candidate = start;
  for (let attempts = 0; attempts < IMPORT_AUTO_PLACA_MAX; attempts += 1) {
    candidate = candidate >= IMPORT_AUTO_PLACA_MAX ? 1 : candidate + 1;
    if (!used.has(candidate)) return candidate;
  }
  return 1;
}

export function resizePlacaNumbers(current: number[], units: number, usedByOtherLines: Set<number>) {
  const target = normalizeUnitCount(units);
  const next = current.slice(0, target);
  const used = new Set([...usedByOtherLines, ...next.filter((placa) => Number.isInteger(placa) && placa > 0)]);
  let cursor = used.size > 0 ? Math.max(...used) : 0;

  while (next.length < target) {
    const placa = nextAvailablePlaca(cursor, used);
    next.push(placa);
    used.add(placa);
    cursor = placa;
  }

  return next;
}

/**
 * Assign one PLACA per unit, keeping any valid current value that does not
 * collide with `used`, and re-numbering the rest. Unlike `resizePlacaNumbers`
 * this also replaces existing values that collide — needed when seeding a new
 * file against PLACAs already taken by other files in the same batch.
 */
function assignPlacaNumbers(current: number[], units: number, used: Set<number>) {
  const target = normalizeUnitCount(units);
  const taken = new Set(used);
  const result: number[] = [];
  let cursor = taken.size > 0 ? Math.max(...taken) : 0;

  for (let i = 0; i < target; i += 1) {
    let placa = current[i];
    if (!Number.isInteger(placa) || placa <= 0 || taken.has(placa)) {
      placa = nextAvailablePlaca(cursor, taken);
    }
    result.push(placa);
    taken.add(placa);
    cursor = placa;
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
    const placaNumbers = assignPlacaNumbers(line.placaNumbers, line.unidades, used);
    for (const placa of placaNumbers) used.add(placa);
    result[line.rowIndex] = {
      resolution: defaultLineResolution(line),
      unidades: normalizeUnitCount(line.unidades),
      placaNumbers,
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

export function collectUsedPlacasForOtherLines(lineState: Record<number, LineState>, rowIndex: number) {
  return new Set(
    Object.entries(lineState)
      .filter(([currentRowIndex]) => Number(currentRowIndex) !== rowIndex)
      .flatMap(([, item]) => item.placaNumbers),
  );
}

export function getLinePlacaNumbers(
  line: PreviewLine,
  state: LineState | undefined,
  usedByOtherLines = new Set<number>(),
) {
  return resizePlacaNumbers(state?.placaNumbers ?? line.placaNumbers, getLineUnitCount(line, state), usedByOtherLines);
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
    const placaNumbers = getLinePlacaNumbers(line, state);

    return placaNumbers.map((placaNumber, machineIndex) => ({
      line,
      rowIndex: line.rowIndex,
      machineIndex,
      unitCount,
      placaNumber,
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

/** Every PLACA in use across the given entries, optionally excluding one entry. */
export function collectPlacasFromEntries(entries: ImportFileEntry[], exceptId?: string) {
  const used = new Set<number>();
  for (const entry of entries) {
    if (entry.id === exceptId) continue;
    for (const state of Object.values(entry.lineState)) {
      for (const placa of state.placaNumbers) used.add(placa);
    }
  }
  return used;
}

export type EntryValidation = { valid: boolean; reason: string | null };

/**
 * Validate each entry independently so valid files can import while invalid
 * ones stay on screen. Detects in-file issues plus PLACAs that collide across
 * files (both colliding files are flagged).
 */
export function validateEntries(entries: ImportFileEntry[]): Record<string, EntryValidation> {
  const placaCount = new Map<number, number>();
  for (const entry of entries) {
    for (const line of entry.preview.lines) {
      const state = entry.lineState[line.rowIndex];
      if (getLineResolution(line, state) === "skip") continue;
      for (const placa of getLinePlacaNumbers(line, state)) {
        placaCount.set(placa, (placaCount.get(placa) ?? 0) + 1);
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
      reason = findPlacaIssue(entry.preview, entry.lineState);
      if (!reason) {
        for (const line of entry.preview.lines) {
          const state = entry.lineState[line.rowIndex];
          if (getLineResolution(line, state) === "skip") continue;
          const clash = getLinePlacaNumbers(line, state).find((placa) => (placaCount.get(placa) ?? 0) > 1);
          if (clash) {
            reason = `La PLACA ${clash} se repite en otro archivo.`;
            break;
          }
        }
      }
    }

    out[entry.id] = { valid: reason === null, reason };
  }

  return out;
}

export function findPlacaIssue(preview: QuotePreview | null, lineState: Record<number, LineState>) {
  if (!preview) return null;

  const seen = new Set<number>();
  for (const line of preview.lines) {
    const state = lineState[line.rowIndex];
    const resolution = getLineResolution(line, state);
    if (resolution === "skip") continue;

    const productLabel = line.producto || line.clave || `fila ${line.rowIndex}`;
    const placaNumbers = getLinePlacaNumbers(line, state);
    for (const placaNumber of placaNumbers) {
      if (!Number.isInteger(placaNumber) || placaNumber <= 0) {
        return `La PLACA de "${productLabel}" es inválida.`;
      }
      if (placaNumber > IMPORT_AUTO_PLACA_MAX) {
        return `La PLACA ${placaNumber} supera el máximo automático de ${IMPORT_AUTO_PLACA_MAX}.`;
      }
      if (seen.has(placaNumber)) {
        return `La PLACA ${placaNumber} está repetida en esta importación.`;
      }
      seen.add(placaNumber);
    }
  }

  return null;
}
