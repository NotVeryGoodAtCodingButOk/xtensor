import { beforeEach, describe, expect, it, vi } from "vitest";

const chainMethods = ["delete", "eq", "insert", "limit", "neq", "order", "select", "update"] as const;
type ChainMethod = (typeof chainMethods)[number];
type QueryMock = Record<ChainMethod, ReturnType<typeof vi.fn>> & {
  maybeSingle: ReturnType<typeof vi.fn>;
  single: ReturnType<typeof vi.fn>;
};
type SupabaseMock = {
  from: ReturnType<typeof vi.fn>;
  rpc: ReturnType<typeof vi.fn>;
};

const mocks = vi.hoisted((): { supabase?: SupabaseMock } => ({
  supabase: undefined,
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => mocks.supabase,
}));

import { getClientByToken, updateClient } from "@/services/clients";

function createQuery(result: unknown) {
  const query = {} as QueryMock;
  for (const method of chainMethods) {
    query[method] = vi.fn(() => query);
  }
  query.maybeSingle = vi.fn(async () => result);
  query.single = vi.fn(async () => result);
  return query;
}

function createSupabaseClient(
  tableQueries: Record<string, Array<ReturnType<typeof createQuery>>>,
  rpcResult: unknown = { data: null, error: null },
) {
  const queues = new Map(Object.entries(tableQueries));

  return {
    from: vi.fn((table: string) => {
      const queue = queues.get(table);
      const query = queue?.shift();
      if (!query) {
        throw new Error(`Unexpected query for table ${table}`);
      }
      return query;
    }),
    rpc: vi.fn(async () => rpcResult),
  };
}

describe("client services", () => {
  const targetClient = {
    id: "target-client",
    name: "Acme",
    magic_link_token: "target-token",
    created_at: "2026-01-01T00:00:00.000Z",
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("merges into an existing client when an edit reuses that client name", async () => {
    const lookupQuery = createQuery({ data: targetClient, error: null });
    mocks.supabase = createSupabaseClient(
      { clients: [lookupQuery] },
      { data: targetClient, error: null },
    );

    await expect(updateClient("source-client", " Acme ")).resolves.toEqual(targetClient);

    expect(lookupQuery.eq).toHaveBeenCalledWith("name", "Acme");
    expect(lookupQuery.neq).toHaveBeenCalledWith("id", "source-client");
    expect(mocks.supabase.rpc).toHaveBeenCalledWith("merge_clients", {
      source_client_id: "source-client",
      target_client_id: "target-client",
    });
  });

  it("renames the client when no existing client has the edited name", async () => {
    const lookupQuery = createQuery({ data: null, error: null });
    const updateQuery = createQuery({ data: targetClient, error: null });
    mocks.supabase = createSupabaseClient({ clients: [lookupQuery, updateQuery] });

    await expect(updateClient("target-client", " Acme ")).resolves.toEqual(targetClient);

    expect(updateQuery.update).toHaveBeenCalledWith({ name: "Acme" });
    expect(updateQuery.eq).toHaveBeenCalledWith("id", "target-client");
    expect(mocks.supabase.rpc).not.toHaveBeenCalled();
  });

  it("resolves merged client portal links through token aliases", async () => {
    const currentTokenQuery = createQuery({ data: null, error: null });
    const aliasQuery = createQuery({ data: { client_id: "target-client" }, error: null });
    const targetQuery = createQuery({ data: targetClient, error: null });
    mocks.supabase = createSupabaseClient({
      clients: [currentTokenQuery, targetQuery],
      client_link_aliases: [aliasQuery],
    });

    await expect(getClientByToken(" source-token ")).resolves.toEqual(targetClient);

    expect(currentTokenQuery.eq).toHaveBeenCalledWith("magic_link_token", "source-token");
    expect(aliasQuery.eq).toHaveBeenCalledWith("token", "source-token");
    expect(targetQuery.eq).toHaveBeenCalledWith("id", "target-client");
  });
});
