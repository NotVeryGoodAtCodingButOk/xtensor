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

export function initialLineState(preview: QuotePreview): Record<number, LineState> {
  return Object.fromEntries(
    preview.lines.map((line) => [
      line.rowIndex,
      {
        resolution: defaultLineResolution(line),
        unidades: normalizeUnitCount(line.unidades),
        placaNumbers: resizePlacaNumbers(line.placaNumbers, line.unidades, new Set()),
      },
    ]),
  );
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
