import { randomBytes } from "node:crypto";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getServerEnv } from "@/lib/env";

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

export async function getClientByToken(token: string) {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("clients")
    .select("*")
    .eq("magic_link_token", token)
    .single();

  if (error) {
    return null;
  }

  return data;
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

export async function mergeClients(sourceClientId: string, targetClientId: string) {
  if (sourceClientId === targetClientId) {
    throw new Error("Los clientes deben ser diferentes.");
  }

  const supabase = createSupabaseAdminClient();
  const { error: moveError } = await supabase
    .from("machines")
    .update({ client_id: targetClientId })
    .eq("client_id", sourceClientId);

  if (moveError) {
    throw new Error(`No se pudieron mover las máquinas: ${moveError.message}`);
  }

  const { error: deleteError } = await supabase.from("clients").delete().eq("id", sourceClientId);

  if (deleteError) {
    throw new Error(`No se pudo eliminar el cliente duplicado: ${deleteError.message}`);
  }
}
