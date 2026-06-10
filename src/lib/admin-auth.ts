import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type AdminUser = { id: string; email: string | undefined };

/**
 * Authorizes the caller as an admin and returns the authenticated user.
 *
 * MUST be invoked at the top of every privileged admin Server Action and admin
 * Route Handler. Middleware path-matching (`/admin/:path*`) is NOT a sufficient
 * authorization boundary: Next.js dispatches Server Actions by their action-ID
 * header regardless of which route path receives the POST, so an unauthenticated
 * request to a non-`/admin` path (or to the public `/admin/login`) can otherwise
 * invoke privileged actions. All admin data access runs through the service-role
 * client, which bypasses RLS — so this in-code check is the real gate.
 */
export async function requireAdmin(): Promise<AdminUser> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    throw new Error("No autorizado.");
  }

  // A `profiles` row is the admin allow-list (profiles_role_check only permits
  // 'admin'). Require an existing admin profile rather than minting one.
  const admin = createSupabaseAdminClient();
  const { data, error: profileError } = await admin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) {
    throw new Error(`No se pudo verificar el perfil del usuario: ${profileError.message}`);
  }

  if (!data || data.role !== "admin") {
    throw new Error("No autorizado: el usuario no tiene un perfil de administrador.");
  }

  return { id: user.id, email: user.email };
}

/**
 * Like {@link requireAdmin} but returns `null` when the caller is simply not
 * authenticated/authorized (expired session) instead of throwing. Use this in
 * interactive Server Actions so an expired session surfaces as a friendly
 * "vuelve a iniciar sesión" prompt rather than an opaque, redacted 500.
 *
 * Genuine failures (e.g. a profile lookup error) are still thrown.
 */
export async function getAdminOrAuthError(): Promise<AdminUser | null> {
  try {
    return await requireAdmin();
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("No autorizado")) {
      return null;
    }
    throw error;
  }
}
