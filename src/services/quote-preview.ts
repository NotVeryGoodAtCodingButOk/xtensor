import type { ParsedQuote, ParsedQuoteLine } from "@/services/excel";
import { generateSequentialPlacaNumbers, normalizePlacaNumber } from "@/services/placas";

export type QuotePreviewCatalogItem = {
  id: string;
  code: string;
  name: string;
};

export type QuotePreviewLine = ParsedQuoteLine & {
  /** Catalog id matched by normalized code ("Clave"), if any. */
  matchedCatalogId: string | null;
  matchedCatalogName: string | null;
  /**
   * True for service/add-on line items that are not machines (transporte,
   * instalación) and must never be imported into the previos board. The UI
   * defaults these lines to "skip".
   */
  ignored: boolean;
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

/**
 * Deterministic catalog-code key: uppercase, strip accents, and remove every
 * non-alphanumeric character (spaces, dashes, dots). Makes "XM606" == "XM 606"
 * == "XM-606" == "XM- 606" while keeping "XB606" distinct from "XM606". This is
 * exact normalization, not fuzzy matching: two codes match only if they share
 * the same alphanumeric sequence.
 */
export function normalizeCatalogCode(code: string): string {
  return code
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

/**
 * Quote claves that don't resolve 1:1 to a catalog code by normalization.
 * Keyed by the normalized clave.
 *  - Aliases: a clave that should resolve to a different catalog code
 *    ("Placas adicionales" is quoted as XTM000 but is catalog item XM200).
 */
const CLAVE_CODE_ALIASES: Record<string, string> = {
  XTM000: "XM200",
};

/**
 * Normalized clave prefixes for non-machine service line-items (transporte /
 * flete and instalación). These are skipped on import — no catalog machine
 * code starts with "XT", so the prefix test never collides with real equipment.
 */
const IGNORED_CLAVE_PREFIXES = ["XTF", "XTBS"];

/** Classify a quote clave into a catalog lookup key plus an ignore flag. */
function classifyClave(rawClave: string): { ignored: boolean; lookupCode: string } {
  const norm = normalizeCatalogCode(rawClave);
  const aliased = CLAVE_CODE_ALIASES[norm];
  if (aliased) return { ignored: false, lookupCode: normalizeCatalogCode(aliased) };
  if (IGNORED_CLAVE_PREFIXES.some((prefix) => norm.startsWith(prefix))) {
    return { ignored: true, lookupCode: norm };
  }
  return { ignored: false, lookupCode: norm };
}

/**
 * Index the catalog by normalized code. If two distinct entries ever collapse
 * to the same key the key is dropped entirely, so an ambiguous code is left
 * unmatched (custom) rather than silently mis-assigned.
 */
function buildCatalogIndex(catalog: QuotePreviewCatalogItem[]): Map<string, QuotePreviewCatalogItem> {
  const byCode = new Map<string, QuotePreviewCatalogItem>();
  const collisions = new Set<string>();
  for (const item of catalog) {
    const key = normalizeCatalogCode(item.code);
    if (!key) continue;
    const existing = byCode.get(key);
    if (existing) {
      if (existing.id !== item.id) collisions.add(key);
      continue;
    }
    byCode.set(key, item);
  }
  for (const key of collisions) byCode.delete(key);
  return byCode;
}

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
  const byCode = buildCatalogIndex(catalog);
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
      const { ignored, lookupCode } = classifyClave(line.clave);
      const match = ignored ? null : (byCode.get(lookupCode) ?? null);
      const units = unitCount(line);
      const explicit = sourcePlacaNumbers(line);
      const placaNumbers = explicit ?? autoPlacaNumbers.slice(autoPlacaIndex, autoPlacaIndex + units);
      if (!explicit) autoPlacaIndex += units;

      return {
        ...line,
        placaNumbers,
        ignored,
        matchedCatalogId: match?.id ?? null,
        matchedCatalogName: match ? `${match.code} · ${match.name}` : null,
      };
    }),
  };
}
