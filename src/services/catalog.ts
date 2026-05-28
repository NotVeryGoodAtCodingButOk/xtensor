import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function listCatalog() {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("equipment_catalog")
    .select("*")
    .order("code", { ascending: true });

  if (error) {
    throw new Error(`No se pudo cargar el catálogo: ${error.message}`);
  }

  return data;
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
