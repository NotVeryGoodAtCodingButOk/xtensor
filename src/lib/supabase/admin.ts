import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { assertServerOnly } from "@/lib/utils";
import { requireEnv } from "@/lib/env";

export function createSupabaseAdminClient() {
  assertServerOnly();

  return createClient<Database>(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  );
}
