import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const AUTO_PLACA_MAX = 999;
export const ACTIVE_PLACA_STATUSES = ["pending", "in_production", "finished"] as const;

export function normalizePlacaNumber(value: unknown): number | null {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
}

export function generateSequentialPlacaNumbers(
  activePlacaNumbers: number[],
  count: number,
  maxPlaca = AUTO_PLACA_MAX,
): number[] {
  const needed = Math.max(0, Math.trunc(count));
  if (needed === 0) return [];

  const unavailable = new Set(
    activePlacaNumbers.filter((placa) => Number.isInteger(placa) && placa >= 1 && placa <= maxPlaca),
  );
  const start = unavailable.size > 0 ? Math.max(...unavailable) : 0;
  const placas: number[] = [];
  let candidate = start;
  let scannedSinceAssignment = 0;

  while (placas.length < needed) {
    candidate = candidate >= maxPlaca ? 1 : candidate + 1;
    scannedSinceAssignment += 1;

    if (!unavailable.has(candidate)) {
      unavailable.add(candidate);
      placas.push(candidate);
      scannedSinceAssignment = 0;
    }

    if (scannedSinceAssignment >= maxPlaca) {
      throw new Error("No hay placas disponibles entre 1 y 999 para asignar automáticamente.");
    }
  }

  return placas;
}

export async function listActivePlacaNumbers(): Promise<number[]> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("machines")
    .select("placa_number")
    .in("status", [...ACTIVE_PLACA_STATUSES]);

  if (error) {
    throw new Error(`No se pudieron cargar las placas activas: ${error.message}`);
  }

  return (data ?? []).map((row) => row.placa_number).filter((placa): placa is number => Number.isFinite(placa));
}
