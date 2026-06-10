import type { ParsedQuote, ParsedQuoteLine } from "@/services/excel";
import { generateSequentialPlacaNumbers, normalizePlacaNumber } from "@/services/placas";

export type QuotePreviewCatalogItem = {
  id: string;
  code: string;
  name: string;
};

export type QuotePreviewLine = ParsedQuoteLine & {
  /** Catalog id matched by exact code ("Clave"), if any. */
  matchedCatalogId: string | null;
  matchedCatalogName: string | null;
  placaNumbers: number[];
};

export type QuotePreview = {
  reference: string | null;
  placaNumber: number | null;
  placaMode: "auto";
  fecha: string | null;
  clientName: string | null;
  lines: QuotePreviewLine[];
};

function unitCount(line: Pick<ParsedQuoteLine, "unidades">) {
  return Math.max(1, Math.round(line.unidades) || 1);
}

function sourcePlacaNumbers(line: ParsedQuoteLine) {
  const placaNumber = normalizePlacaNumber(line.placaNumber);
  if (!placaNumber) return null;

  return Array.from({ length: unitCount(line) }, (_, index) => placaNumber + index);
}

export function buildQuotePreview({
  quote,
  catalog,
  activePlacaNumbers,
}: {
  quote: ParsedQuote;
  catalog: QuotePreviewCatalogItem[];
  activePlacaNumbers: number[];
}): QuotePreview {
  const byCode = new Map(catalog.map((item) => [item.code.trim().toLowerCase(), item]));
  const explicitPlacaNumbers = quote.lines.flatMap((line) => sourcePlacaNumbers(line) ?? []);
  const missingPlacaUnits = quote.lines.reduce((sum, line) => {
    return sourcePlacaNumbers(line) ? sum : sum + unitCount(line);
  }, 0);
  const autoPlacaNumbers = generateSequentialPlacaNumbers(
    [...activePlacaNumbers, ...explicitPlacaNumbers],
    missingPlacaUnits,
  );
  let autoPlacaIndex = 0;

  return {
    reference: quote.reference,
    placaNumber: null,
    placaMode: "auto",
    fecha: quote.fecha,
    clientName: quote.clientName,
    lines: quote.lines.map((line) => {
      const match = byCode.get(line.clave.trim().toLowerCase()) ?? null;
      const units = unitCount(line);
      const explicit = sourcePlacaNumbers(line);
      const placaNumbers = explicit ?? autoPlacaNumbers.slice(autoPlacaIndex, autoPlacaIndex + units);
      if (!explicit) autoPlacaIndex += units;

      return {
        ...line,
        placaNumbers,
        matchedCatalogId: match?.id ?? null,
        matchedCatalogName: match ? `${match.code} · ${match.name}` : null,
      };
    }),
  };
}
