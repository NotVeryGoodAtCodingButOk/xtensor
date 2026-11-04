import { describe, expect, it } from "vitest";
import { chunked, fetchAllPages, ID_CHUNK_SIZE, PAGE_SIZE } from "@/services/batching";

describe("chunked", () => {
  it("splits ids into batches of 100 by default", () => {
    const ids = Array.from({ length: 250 }, (_, index) => `m${index}`);
    const batches = chunked(ids);

    expect(ID_CHUNK_SIZE).toBe(100);
    expect(batches.map((batch) => batch.length)).toEqual([100, 100, 50]);
    expect(batches.flat()).toEqual(ids);
  });

  it("returns no batches for an empty list and rejects a zero size", () => {
    expect(chunked([])).toEqual([]);
    expect(() => chunked([1], 0)).toThrow();
  });
});

describe("fetchAllPages", () => {
  /** Simula PostgREST con max_rows = pageSize sobre `total` filas. */
  function fakeTable(total: number) {
    const calls: Array<[number, number]> = [];
    const fetchPage = async (from: number, to: number) => {
      calls.push([from, to]);
      const data = Array.from({ length: Math.max(0, Math.min(to, total - 1) - from + 1) }, (_, index) => from + index);
      return { data, error: null };
    };
    return { calls, fetchPage };
  }

  it("keeps asking until a page comes back short, so 1000 rows are never a silent cap", async () => {
    const table = fakeTable(2_345);
    const rows = await fetchAllPages<number>("error", table.fetchPage);

    expect(PAGE_SIZE).toBe(1000);
    expect(rows).toHaveLength(2_345);
    expect(rows[2_344]).toBe(2_344);
    expect(table.calls).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
    ]);
  });

  it("asks one extra page when the total is an exact multiple of the page size", async () => {
    const table = fakeTable(4);
    expect(await fetchAllPages<number>("error", table.fetchPage, 2)).toEqual([0, 1, 2, 3]);
    expect(table.calls).toHaveLength(3);
  });

  it("throws with the given prefix", async () => {
    await expect(
      fetchAllPages("No se pudieron cargar las sesiones", async () => ({ data: null, error: { message: "timeout" } })),
    ).rejects.toThrow("No se pudieron cargar las sesiones: timeout");
  });
});
