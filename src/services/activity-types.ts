import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/types/database";

export type ActivityTypeRow = Database["public"]["Tables"]["activity_types"]["Row"];

/** Catálogo de labores fuera de etapa: 5S, empaque/carga/instalación, arreglos, etc. */
export type ActivityTypeView = {
  id: string;
  name: string;
  /** Texto corto bajo el nombre en la tablet (p. ej. "Aseo, orden, limpieza y mantenimiento de planta"). */
  description: string | null;
  sortOrder: number;
  allowsMachine: boolean;
  isActive: boolean;
};

const NAME_MAX_LENGTH = 60;
export const DESCRIPTION_MAX_LENGTH = 120;

/** La actividad tiene horas registradas y no se dijo a cuál moverlas. */
export class ActivityTypeHasHoursError extends Error {
  constructor() {
    super("Esta actividad tiene horas registradas. Elige a qué actividad moverlas.");
    this.name = "ActivityTypeHasHoursError";
  }
}

export function mapActivityType(row: ActivityTypeRow): ActivityTypeView {
  return {
    id: row.id,
    name: row.name,
    description: row.description?.trim() ? row.description.trim() : null,
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

export async function createActivityType(input: { name: string; allowsMachine: boolean; description?: string | null }) {
  const name = normalizeName(input.name);
  const description = normalizeDescription(input.description);
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
    .insert({ name, description, allows_machine: input.allowsMachine, sort_order: (last?.sort_order ?? 0) + 1 })
    .select("*")
    .single();

  if (error) {
    throw new Error(friendlyActivityTypeError(error, "No se pudo crear la actividad"));
  }

  return mapActivityType(data);
}

export async function updateActivityType(
  id: string,
  input: { name?: string; allowsMachine?: boolean; isActive?: boolean; description?: string | null },
) {
  const supabase = createSupabaseAdminClient();
  const patch: Database["public"]["Tables"]["activity_types"]["Update"] = {};

  if (input.name !== undefined) patch.name = normalizeName(input.name);
  if (input.allowsMachine !== undefined) patch.allows_machine = input.allowsMachine;
  if (input.isActive !== undefined) patch.is_active = input.isActive;
  if (input.description !== undefined) patch.description = normalizeDescription(input.description);

  const { data, error } = await supabase.from("activity_types").update(patch).eq("id", id).select("*").single();

  if (error) {
    throw new Error(friendlyActivityTypeError(error, "No se pudo actualizar la actividad"));
  }

  return mapActivityType(data);
}

/** activity_type_id → nº de sesiones vinculadas (las que no tienen uso no aparecen). */
export async function listActivityTypeUsage(): Promise<Record<string, number>> {
  const supabase = createSupabaseAdminClient();
  const PAGE = 1000;
  const usage: Record<string, number> = {};

  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("work_session_activity_types")
      .select("session_id, activity_type_id")
      .order("session_id", { ascending: true })
      .order("activity_type_id", { ascending: true })
      .range(from, from + PAGE - 1);

    if (error) {
      throw new Error(`No se pudo consultar el uso de las actividades: ${error.message}`);
    }
    for (const row of data ?? []) {
      usage[row.activity_type_id] = (usage[row.activity_type_id] ?? 0) + 1;
    }
    if ((data ?? []).length < PAGE) break;
  }

  return usage;
}

/**
 * Borra una actividad del catálogo. Sin horas registradas se borra directo;
 * con horas hay que decir a cuál moverlas (`moveToId`) y se hace en una sola
 * transacción con la RPC merge_activity_type. Sin `moveToId` lanza
 * ActivityTypeHasHoursError.
 */
export async function deleteActivityType(id: string, moveToId?: string | null): Promise<"deleted" | "moved"> {
  const supabase = createSupabaseAdminClient();
  const { count, error: usageError } = await supabase
    .from("work_session_activity_types")
    .select("session_id", { count: "exact", head: true })
    .eq("activity_type_id", id);

  if (usageError) {
    throw new Error(`No se pudo consultar el uso de la actividad: ${usageError.message}`);
  }

  if ((count ?? 0) > 0) {
    if (!moveToId) {
      throw new ActivityTypeHasHoursError();
    }

    const { error: mergeError } = await supabase.rpc("merge_activity_type", {
      source_activity_type_id: id,
      target_activity_type_id: moveToId,
    });
    if (mergeError) {
      throw new Error(`No se pudieron mover las horas: ${mergeError.message}`);
    }
    return "moved";
  }

  const { error } = await supabase.from("activity_types").delete().eq("id", id);

  if (error) {
    if (error.code === "23503") {
      // Alguien registró horas entre la consulta y el borrado.
      throw new ActivityTypeHasHoursError();
    }
    throw new Error(`No se pudo eliminar la actividad: ${error.message}`);
  }
  return "deleted";
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

/** Texto corto bajo el nombre en la tablet; vacío = null. */
export function normalizeDescription(value: string | null | undefined): string | null {
  const description = (value ?? "").trim().replace(/\s+/g, " ");
  if (!description) {
    return null;
  }
  if (description.length > DESCRIPTION_MAX_LENGTH) {
    throw new Error(`La descripción debe tener máximo ${DESCRIPTION_MAX_LENGTH} caracteres.`);
  }
  return description;
}

function friendlyActivityTypeError(error: { code?: string; message: string }, prefix: string): string {
  if (error.code === "23505") {
    return "Ya existe una actividad con ese nombre.";
  }
  return `${prefix}: ${error.message}`;
}
