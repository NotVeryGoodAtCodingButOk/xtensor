import type { QuotePreview } from "@/services/quote-preview";

export const IMPORT_AUTO_SENAL_MAX = 999;

export type LineState = {
  resolution: string;
  unidades: number;
  senalNumbers: number[];
};

type PreviewLine = QuotePreview["lines"][number];

export type MachinePreviewRow = {
  line: PreviewLine;
  rowIndex: number;
  machineIndex: number;
  unitCount: number;
  senalNumber: number;
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

export function nextAvailableSenal(start: number, used: Set<number>) {
  let candidate = start;
  for (let attempts = 0; attempts < IMPORT_AUTO_SENAL_MAX; attempts += 1) {
    candidate = candidate >= IMPORT_AUTO_SENAL_MAX ? 1 : candidate + 1;
    if (!used.has(candidate)) return candidate;
  }
  return 1;
}

export function resizeSenalNumbers(current: number[], units: number, usedByOtherLines: Set<number>) {
  const target = normalizeUnitCount(units);
  const next = current.slice(0, target);
  const used = new Set([...usedByOtherLines, ...next.filter((senal) => Number.isInteger(senal) && senal > 0)]);
  let cursor = used.size > 0 ? Math.max(...used) : 0;

  while (next.length < target) {
    const senal = nextAvailableSenal(cursor, used);
    next.push(senal);
    used.add(senal);
    cursor = senal;
  }

  return next;
}

/**
 * Assign one SEÑAL per unit, keeping any valid current value that does not
 * collide with `used`, and re-numbering the rest. Unlike `resizeSenalNumbers`
 * this also replaces existing values that collide — needed when seeding a new
 * file against SEÑALES already taken by other files in the same batch.
 */
function assignSenalNumbers(current: number[], units: number, used: Set<number>) {
  const target = normalizeUnitCount(units);
  const taken = new Set(used);
  const result: number[] = [];
  let cursor = taken.size > 0 ? Math.max(...taken) : 0;

  for (let i = 0; i < target; i += 1) {
    let senal = current[i];
    if (!Number.isInteger(senal) || senal <= 0 || taken.has(senal)) {
      senal = nextAvailableSenal(cursor, taken);
    }
    result.push(senal);
    taken.add(senal);
    cursor = senal;
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
    const senalNumbers = assignSenalNumbers(line.senalNumbers, line.unidades, used);
    for (const senal of senalNumbers) used.add(senal);
    result[line.rowIndex] = {
      resolution: defaultLineResolution(line),
      unidades: normalizeUnitCount(line.unidades),
      senalNumbers,
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

export function collectUsedSenalesForOtherLines(lineState: Record<number, LineState>, rowIndex: number) {
  return new Set(
    Object.entries(lineState)
      .filter(([currentRowIndex]) => Number(currentRowIndex) !== rowIndex)
      .flatMap(([, item]) => item.senalNumbers),
  );
}

export function getLineSenalNumbers(
  line: PreviewLine,
  state: LineState | undefined,
  usedByOtherLines = new Set<number>(),
) {
  return resizeSenalNumbers(state?.senalNumbers ?? line.senalNumbers, getLineUnitCount(line, state), usedByOtherLines);
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
    const senalNumbers = getLineSenalNumbers(line, state);

    return senalNumbers.map((senalNumber, machineIndex) => ({
      line,
      rowIndex: line.rowIndex,
      machineIndex,
      unitCount,
      senalNumber,
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

/** Every SEÑAL in use across the given entries, optionally excluding one entry. */
export function collectSenalesFromEntries(entries: ImportFileEntry[], exceptId?: string) {
  const used = new Set<number>();
  for (const entry of entries) {
    if (entry.id === exceptId) continue;
    for (const state of Object.values(entry.lineState)) {
      for (const senal of state.senalNumbers) used.add(senal);
    }
  }
  return used;
}

export type EntryValidation = { valid: boolean; reason: string | null };

/**
 * Validate each entry independently so valid files can import while invalid
 * ones stay on screen. Detects in-file issues plus SEÑALES that collide across
 * files (both colliding files are flagged).
 */
export function validateEntries(entries: ImportFileEntry[]): Record<string, EntryValidation> {
  const senalCount = new Map<number, number>();
  for (const entry of entries) {
    for (const line of entry.preview.lines) {
      const state = entry.lineState[line.rowIndex];
      if (getLineResolution(line, state) === "skip") continue;
      for (const senal of getLineSenalNumbers(line, state)) {
        senalCount.set(senal, (senalCount.get(senal) ?? 0) + 1);
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
      reason = findSenalIssue(entry.preview, entry.lineState);
      if (!reason) {
        for (const line of entry.preview.lines) {
          const state = entry.lineState[line.rowIndex];
          if (getLineResolution(line, state) === "skip") continue;
          const clash = getLineSenalNumbers(line, state).find((senal) => (senalCount.get(senal) ?? 0) > 1);
          if (clash) {
            reason = `La SEÑAL ${clash} se repite en otro archivo.`;
            break;
          }
        }
      }
    }

    out[entry.id] = { valid: reason === null, reason };
  }

  return out;
}

export function findSenalIssue(preview: QuotePreview | null, lineState: Record<number, LineState>) {
  if (!preview) return null;

  const seen = new Set<number>();
  for (const line of preview.lines) {
    const state = lineState[line.rowIndex];
    const resolution = getLineResolution(line, state);
    if (resolution === "skip") continue;

    const productLabel = line.producto || line.clave || `fila ${line.rowIndex}`;
    const senalNumbers = getLineSenalNumbers(line, state);
    for (const senalNumber of senalNumbers) {
      if (!Number.isInteger(senalNumber) || senalNumber <= 0) {
        return `La SEÑAL de "${productLabel}" es inválida.`;
      }
      if (senalNumber > IMPORT_AUTO_SENAL_MAX) {
        return `La SEÑAL ${senalNumber} supera el máximo automático de ${IMPORT_AUTO_SENAL_MAX}.`;
      }
      if (seen.has(senalNumber)) {
        return `La SEÑAL ${senalNumber} está repetida en esta importación.`;
      }
      seen.add(senalNumber);
    }
  }

  return null;
}
