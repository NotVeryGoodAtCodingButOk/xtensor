import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/types/database";

type CatalogRow = Database["public"]["Tables"]["equipment_catalog"]["Row"];

export async function listCatalog(): Promise<CatalogRow[]> {
  const supabase = createSupabaseAdminClient();

  // Paginate to work around any PostgREST max-rows project-level setting.
  const PAGE = 500;
  const rows: CatalogRow[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from("equipment_catalog")
      .select("*")
      .order("code", { ascending: true })
      .range(from, from + PAGE - 1);

    if (error) throw new Error(`No se pudo cargar el catálogo: ${error.message}`);
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
  }

  return rows;
}

export async function createCustomEquipment(input: {
  name: string;
  line: string | null;
  defaultPriceCop: number | null;
}) {
  const supabase = createSupabaseAdminClient();
  const code = `CUSTOM-${Date.now()}`;
  const { data, error } = await supabase
    .from("equipment_catalog")
    .insert({
      code,
      name: input.name,
      line: input.line,
      default_price_cop: input.defaultPriceCop,
      is_custom: true,
    })
    .select("*")
    .single();

  if (error) {
    throw new Error(`No se pudo crear el producto personalizado: ${error.message}`);
  }

  return data;
}

export async function listColors() {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.from("colors").select("*").order("name", { ascending: true });

  if (error) {
    throw new Error(`No se pudieron cargar los colores: ${error.message}`);
  }

  return data;
}

export async function listWorkers(activeOnly = false) {
  const supabase = createSupabaseAdminClient();
  let query = supabase.from("workers").select("*").order("full_name", { ascending: true });

  if (activeOnly) {
    query = query.eq("is_active", true);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`No se pudieron cargar los operarios: ${error.message}`);
  }

  return data;
}

export async function listClients() {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.from("clients").select("*").order("name", { ascending: true });

  if (error) {
    throw new Error(`No se pudieron cargar los clientes: ${error.message}`);
  }

  return data;
}

export async function listHolidays() {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.from("holidays").select("*").order("date", { ascending: true });

  if (error) {
    throw new Error(`No se pudieron cargar los festivos: ${error.message}`);
  }

  return data.map((holiday) => ({
    date: holiday.date,
    name: holiday.name,
    isCustom: holiday.is_custom,
  }));
}

export async function createColor(name: string) {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.from("colors").insert({ name }).select("*").single();
  if (error) throw new Error(`No se pudo crear el color: ${error.message}`);
  return data;
}

export async function updateColor(id: string, name: string) {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.from("colors").update({ name }).eq("id", id).select("*").single();
  if (error) throw new Error(`No se pudo actualizar el color: ${error.message}`);
  return data;
}

export async function deleteColor(id: string) {
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.from("colors").delete().eq("id", id);
  if (error) throw new Error(`No se pudo eliminar el color: ${error.message}`);
}

export async function createWorker(input: {
  full_name: string;
  role: string;
  hourly_cost_cop: number | null;
  display_color: string | null;
  is_active: boolean;
}) {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.from("workers").insert(input).select("*").single();
  if (error) throw new Error(`No se pudo crear el operario: ${error.message}`);
  return data;
}

export async function updateWorker(
  id: string,
  input: { full_name?: string; role?: string; hourly_cost_cop?: number | null; display_color?: string | null; is_active?: boolean },
) {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.from("workers").update(input).eq("id", id).select("*").single();
  if (error) throw new Error(`No se pudo actualizar el operario: ${error.message}`);
  return data;
}

export async function createCatalogItem(input: {
  code: string;
  name: string;
  line: string | null;
  default_price_cop: number | null;
}) {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("equipment_catalog")
    .insert({ ...input, is_custom: false, is_active: true })
    .select("*")
    .single();
  if (error) throw new Error(`No se pudo crear el equipo: ${error.message}`);
  return data;
}

export async function updateCatalogItem(
  id: string,
  input: { code?: string; name?: string; line?: string | null; default_price_cop?: number | null; is_active?: boolean },
) {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.from("equipment_catalog").update(input).eq("id", id).select("*").single();
  if (error) throw new Error(`No se pudo actualizar el equipo: ${error.message}`);
  return data;
}

export async function deleteCatalogItem(id: string) {
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.from("equipment_catalog").delete().eq("id", id);
  if (error) {
    if (error.code === "23503") {
      throw new Error("No se puede eliminar este equipo porque tiene máquinas asociadas.");
    }
    throw new Error(`No se pudo eliminar el equipo: ${error.message}`);
  }
}

export async function createHoliday(date: string, name: string) {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.from("holidays").insert({ date, name, is_custom: true }).select("*").single();
  if (error) throw new Error(`No se pudo crear el festivo: ${error.message}`);
  return data;
}

export async function deleteHoliday(date: string) {
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.from("holidays").delete().eq("date", date);
  if (error) throw new Error(`No se pudo eliminar el festivo: ${error.message}`);
}
