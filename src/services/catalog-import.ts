import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { normalizeMachineLine } from "@/lib/machine-lines";
import { listCatalog } from "@/services/catalog";
import { createPrevioCatalogItem, listPrevioCatalog, normalizePrevioName } from "@/services/previos";
import type { ParsedCatalogRow } from "@/services/excel";

/**
 * Bulk equipment import — ADD-ONLY.
 *
 * The importer round-trips the exported "Catálogo" workbook. Rows are matched
 * against the existing catalog by `code` (UNIQUE in the DB). Only rows with a
 * brand-new code are created; rows whose code already exists are skipped and
 * NOTHING existing is ever updated or deleted. See {@link applyCatalogImport}
 * for the write path, which only ever INSERTs.
 */

/** A confirmed brand-new equipment row to create. JSON-serializable. */
export type CatalogImportNewRow = {
  code: string;
  name: string;
  line: string | null;
  priceCop: number | null;
  isActive: boolean;
  previos: string[];
};

export type CatalogImportInvalidRow = {
  rowIndex: number;
  code: string;
  name: string;
  reason: string;
};

/** Serializable preview passed from the preview action to the confirm action. */
export type CatalogImportSummary = {
  totalRows: number;
  newRows: CatalogImportNewRow[];
  /** Codes already present in the DB — skipped, never modified. */
  existingCodes: string[];
  /** New codes repeated within the same file — only the first is kept. */
  duplicateCodes: string[];
  invalidRows: CatalogImportInvalidRow[];
  /** Master previos referenced by new rows that don't exist yet. */
  newMasterPrevios: string[];
  counts: {
    new: number;
    existing: number;
    duplicate: number;
    invalid: number;
    newMasterPrevios: number;
  };
};

export type CatalogImportResult = {
  created: number;
  skipped: number;
  previosLinked: number;
  masterPreviosCreated: number;
};

/** Case-insensitive key for matching previo names. */
function previoKey(name: string): string {
  return normalizePrevioName(name).toLowerCase();
}

/**
 * Classify parsed rows into new / existing / duplicate / invalid, and compute
 * the master previos that would be created. Reads only — no writes.
 */
export async function classifyCatalogImport(parsedRows: ParsedCatalogRow[]): Promise<CatalogImportSummary> {
  const [catalog, previos] = await Promise.all([listCatalog(), listPrevioCatalog()]);
  const existingCodeSet = new Set(catalog.map((item) => item.code.trim()));
  const existingPrevioKeys = new Set(previos.map((previo) => previoKey(previo.name)));

  const newRows: CatalogImportNewRow[] = [];
  const existingCodes: string[] = [];
  const duplicateCodes: string[] = [];
  const invalidRows: CatalogImportInvalidRow[] = [];
  const seenNewCodes = new Set<string>();
  const referencedPrevioKeys = new Set<string>();
  const newMasterPrevios: string[] = [];

  for (const row of parsedRows) {
    const code = row.code.trim();
    const name = row.name.trim();

    if (!code || !name) {
      invalidRows.push({
        rowIndex: row.rowIndex,
        code,
        name,
        reason: !code && !name ? "Falta el código y el nombre." : !code ? "Falta el código." : "Falta el nombre del equipo.",
      });
      continue;
    }

    if (existingCodeSet.has(code)) {
      existingCodes.push(code);
      continue;
    }

    if (seenNewCodes.has(code)) {
      duplicateCodes.push(code);
      continue;
    }
    seenNewCodes.add(code);

    newRows.push({
      code,
      name,
      line: row.line,
      priceCop: row.priceCop,
      isActive: row.isActive,
      previos: row.previos,
    });

    for (const previo of row.previos) {
      const key = previoKey(previo);
      if (!key || existingPrevioKeys.has(key) || referencedPrevioKeys.has(key)) continue;
      referencedPrevioKeys.add(key);
      newMasterPrevios.push(normalizePrevioName(previo));
    }
  }

  return {
    totalRows: parsedRows.length,
    newRows,
    existingCodes,
    duplicateCodes,
    invalidRows,
    newMasterPrevios,
    counts: {
      new: newRows.length,
      existing: existingCodes.length,
      duplicate: duplicateCodes.length,
      invalid: invalidRows.length,
      newMasterPrevios: newMasterPrevios.length,
    },
  };
}

/**
 * Create the confirmed new equipment (+ their previo associations, find-or-
 * creating master previos as needed). INSERT-ONLY: never updates or deletes any
 * existing equipment or any other row. A unique-violation on `code` (a race, or
 * a code that already exists) skips that row gracefully.
 */
export async function applyCatalogImport(newRows: CatalogImportNewRow[]): Promise<CatalogImportResult> {
  const supabase = createSupabaseAdminClient();

  // Map normalized previo name → id from existing master previos.
  const existingPrevios = await listPrevioCatalog();
  const previoIdByKey = new Map<string, string>();
  for (const previo of existingPrevios) {
    previoIdByKey.set(previoKey(previo.name), previo.id);
  }

  // Find-or-create every previo referenced by the new rows (additive, safe).
  let masterPreviosCreated = 0;
  const referencedKeys = new Set<string>();
  for (const row of newRows) {
    for (const previo of row.previos) {
      const key = previoKey(previo);
      if (!key || referencedKeys.has(key)) continue;
      referencedKeys.add(key);
      if (previoIdByKey.has(key)) continue;
      const created = await createPrevioCatalogItem(normalizePrevioName(previo));
      previoIdByKey.set(key, created.id);
      masterPreviosCreated += 1;
    }
  }

  let created = 0;
  let skipped = 0;
  let previosLinked = 0;

  for (const row of newRows) {
    const code = row.code.trim();
    const name = row.name.trim();
    if (!code || !name) {
      skipped += 1;
      continue;
    }

    const { data, error } = await supabase
      .from("equipment_catalog")
      .insert({
        code,
        name,
        line: row.line ? normalizeMachineLine(row.line) : null,
        default_price_cop: row.priceCop,
        is_active: row.isActive,
        is_custom: false,
      })
      .select("id")
      .single();

    if (error || !data) {
      // 23505 = unique_violation on code: the code already exists (or a race).
      // Skip gracefully — we never touch the pre-existing row.
      if (error?.code === "23505") {
        skipped += 1;
        continue;
      }
      throw new Error(`No se pudo crear el equipo "${code}": ${error?.message ?? "sin datos."}`);
    }

    created += 1;

    const previoRows = Array.from(new Set(row.previos.map(previoKey).filter(Boolean)))
      .map((key) => previoIdByKey.get(key))
      .filter((id): id is string => Boolean(id))
      .map((previoCatalogId) => ({ equipment_id: data.id, previo_catalog_id: previoCatalogId }));

    if (previoRows.length > 0) {
      const { error: linkError } = await supabase
        .from("equipment_previos")
        .upsert(previoRows, { onConflict: "equipment_id,previo_catalog_id" });
      if (linkError) {
        throw new Error(`No se pudieron asociar los previos del equipo "${code}": ${linkError.message}`);
      }
      previosLinked += previoRows.length;
    }
  }

  return { created, skipped, previosLinked, masterPreviosCreated };
}
