import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/types/database";

export type ActivityTypeRow = Database["public"]["Tables"]["activity_types"]["Row"];

/** Catálogo de actividades sin etapa: aseo, orden, mejoras planta, etc. */
export type ActivityTypeView = {
  id: string;
  name: string;
  sortOrder: number;
  allowsMachine: boolean;
  isActive: boolean;
};

const NAME_MAX_LENGTH = 60;

export function mapActivityType(row: ActivityTypeRow): ActivityTypeView {
  return {
    id: row.id,
    name: row.name,
    sortOrder: row.sort_order,
    allowsMachine: row.allows_machine,
    isActive: row.is_active,
  };
}

/** Catálogo ordenado como se muestra en planta. `activeOnly` para la tablet. */
export async function listActivityTypes(activeOnly = false): Promise<ActivityTypeView[]> {
  const supabase = createSupabaseAdminClient();
  let query = supabase
    .from("activity_types")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (activeOnly) {
    query = query.eq("is_active", true);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`No se pudieron cargar las actividades: ${error.message}`);
  }

  return (data ?? []).map(mapActivityType);
}

export async function createActivityType(input: { name: string; allowsMachine: boolean }) {
  const name = normalizeName(input.name);
  const supabase = createSupabaseAdminClient();

  // Nueva actividad al final de la lista de planta.
  const { data: last, error: lastError } = await supabase
    .from("activity_types")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (lastError) {
    throw new Error(`No se pudo crear la actividad: ${lastError.message}`);
  }

  const { data, error } = await supabase
    .from("activity_types")
    .insert({ name, allows_machine: input.allowsMachine, sort_order: (last?.sort_order ?? 0) + 1 })
    .select("*")
    .single();

  if (error) {
    throw new Error(friendlyActivityTypeError(error, "No se pudo crear la actividad"));
  }

  return mapActivityType(data);
}

export async function updateActivityType(
  id: string,
  input: { name?: string; allowsMachine?: boolean; isActive?: boolean },
) {
  const supabase = createSupabaseAdminClient();
  const patch: Database["public"]["Tables"]["activity_types"]["Update"] = {};

  if (input.name !== undefined) patch.name = normalizeName(input.name);
  if (input.allowsMachine !== undefined) patch.allows_machine = input.allowsMachine;
  if (input.isActive !== undefined) patch.is_active = input.isActive;

  const { data, error } = await supabase.from("activity_types").update(patch).eq("id", id).select("*").single();

  if (error) {
    throw new Error(friendlyActivityTypeError(error, "No se pudo actualizar la actividad"));
  }

  return mapActivityType(data);
}

export async function deleteActivityType(id: string) {
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.from("activity_types").delete().eq("id", id);

  if (error) {
    if (error.code === "23503") {
      throw new Error("Esta actividad ya tiene horas registradas. Desactívala en vez de eliminarla.");
    }
    throw new Error(`No se pudo eliminar la actividad: ${error.message}`);
  }
}

function normalizeName(value: string): string {
  const name = value.trim().replace(/\s+/g, " ");
  if (!name) {
    throw new Error("Escribe el nombre de la actividad.");
  }
  if (name.length > NAME_MAX_LENGTH) {
    throw new Error(`El nombre debe tener máximo ${NAME_MAX_LENGTH} caracteres.`);
  }
  return name;
}

function friendlyActivityTypeError(error: { code?: string; message: string }, prefix: string): string {
  if (error.code === "23505") {
    return "Ya existe una actividad con ese nombre.";
  }
  return `${prefix}: ${error.message}`;
}
