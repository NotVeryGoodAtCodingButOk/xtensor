// Lotes y paginación para no chocar con los topes de PostgREST: `max_rows` = 1000
// filas por respuesta (cortaría en silencio) y el largo de la URL en `.in()`.

/** Tamaño de lote para `.in("id", …)`: 100 uuids caben holgados en la URL. */
export const ID_CHUNK_SIZE = 100;

/** Igual al `max_rows` del proyecto: una página nunca se corta en silencio. */
export const PAGE_SIZE = 1000;

export function chunked<T>(items: T[], size: number = ID_CHUNK_SIZE): T[][] {
  if (!(size > 0)) {
    throw new Error("El tamaño del lote debe ser mayor que cero.");
  }

  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

type PageResult = { data: unknown[] | null; error: { message: string } | null };

/**
 * Trae todas las filas pidiendo páginas `[from, to]` hasta que una llegue
 * incompleta. `fetchPage` debe tener un orden estable (p. ej. por fecha + id),
 * si no PostgREST puede repetir u omitir filas entre páginas.
 */
export async function fetchAllPages<T>(
  errorPrefix: string,
  fetchPage: (from: number, to: number) => PromiseLike<PageResult>,
  pageSize: number = PAGE_SIZE,
): Promise<T[]> {
  const rows: T[] = [];

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await fetchPage(from, from + pageSize - 1);
    if (error) {
      throw new Error(`${errorPrefix}: ${error.message}`);
    }

    const page = (data ?? []) as T[];
    rows.push(...page);
    if (page.length < pageSize) {
      return rows;
    }
  }
}
