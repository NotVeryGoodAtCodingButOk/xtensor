import { randomBytes } from "node:crypto";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getServerEnv } from "@/lib/env";
import type { Database } from "@/types/database";

type ClientRow = Database["public"]["Tables"]["clients"]["Row"];
type SupabaseAdminClient = ReturnType<typeof createSupabaseAdminClient>;

export function createClientToken() {
  return randomBytes(24).toString("base64url");
}

export function buildClientUrl(token: string) {
  const env = getServerEnv();
  return `${env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "")}/c/${token}`;
}

export async function regenerateClientToken(clientId: string) {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("clients")
    .update({ magic_link_token: createClientToken() })
    .eq("id", clientId)
    .select("*")
    .single();

  if (error) {
    throw new Error(`No se pudo regenerar el enlace: ${error.message}`);
  }

  return data;
}

export async function getClientByToken(token: string): Promise<ClientRow | null> {
  const cleanToken = token.trim();
  if (!cleanToken) {
    return null;
  }

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("clients")
    .select("*")
    .eq("magic_link_token", cleanToken)
    .maybeSingle();

  if (error) {
    return null;
  }

  if (data) {
    return data;
  }

  const { data: alias, error: aliasError } = await supabase
    .from("client_link_aliases")
    .select("client_id")
    .eq("token", cleanToken)
    .maybeSingle();

  if (aliasError || !alias) {
    return null;
  }

  const { data: mergedClient, error: mergedClientError } = await supabase
    .from("clients")
    .select("*")
    .eq("id", alias.client_id)
    .maybeSingle();

  if (mergedClientError) {
    return null;
  }

  return mergedClient;
}

export async function ensureClientByName(name: string) {
  const cleanName = name.trim();
  if (!cleanName) {
    throw new Error("El cliente es requerido.");
  }

  const supabase = createSupabaseAdminClient();
  const { data: existing } = await supabase.from("clients").select("*").eq("name", cleanName).maybeSingle();
  if (existing) {
    return existing;
  }

  const { data, error } = await supabase
    .from("clients")
    .insert({ name: cleanName, magic_link_token: createClientToken() })
    .select("*")
    .single();

  if (error) {
    throw new Error(`No se pudo crear el cliente: ${error.message}`);
  }

  return data;
}

export async function updateClient(
  id: string,
  name: string,
  supabase: SupabaseAdminClient = createSupabaseAdminClient(),
) {
  const cleanName = name.trim();
  if (!cleanName) {
    throw new Error("El cliente es requerido.");
  }

  const { data: mergeTarget, error: mergeTargetError } = await supabase
    .from("clients")
    .select("*")
    .eq("name", cleanName)
    .neq("id", id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (mergeTargetError) {
    throw new Error(`No se pudo buscar un cliente existente: ${mergeTargetError.message}`);
  }

  if (mergeTarget) {
    return mergeClients(id, mergeTarget.id, supabase);
  }

  const { data, error } = await supabase.from("clients").update({ name: cleanName }).eq("id", id).select("*").single();
  if (error) throw new Error(`No se pudo actualizar el cliente: ${error.message}`);
  return data;
}

export async function updateMachineClientName(
  machineId: string,
  name: string,
  supabase: SupabaseAdminClient = createSupabaseAdminClient(),
) {
  const cleanName = name.trim();
  if (!cleanName) {
    throw new Error("El cliente es requerido.");
  }

  const { data: machine, error } = await supabase
    .from("machines")
    .select("client_id")
    .eq("id", machineId)
    .maybeSingle();

  if (error) {
    throw new Error(`No se pudo cargar el cliente de la máquina: ${error.message}`);
  }

  if (!machine) {
    throw new Error("No se encontró la máquina.");
  }

  return updateClient(machine.client_id, cleanName, supabase);
}

export async function deleteClient(id: string) {
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.from("clients").delete().eq("id", id);
  if (error) throw new Error(`No se pudo eliminar el cliente: ${error.message}`);
}

export async function mergeClients(
  sourceClientId: string,
  targetClientId: string,
  supabase: SupabaseAdminClient = createSupabaseAdminClient(),
) {
  if (sourceClientId === targetClientId) {
    throw new Error("Los clientes deben ser diferentes.");
  }

  const { data, error } = await supabase.rpc("merge_clients", {
    source_client_id: sourceClientId,
    target_client_id: targetClientId,
  });

  if (error) {
    throw new Error(`No se pudieron fusionar los clientes: ${error.message}`);
  }

  if (!data) {
    throw new Error("No se pudo fusionar los clientes.");
  }

  return data;
}
