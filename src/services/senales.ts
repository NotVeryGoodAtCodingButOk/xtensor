import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const AUTO_SENAL_MAX = 999;
export const ACTIVE_SENAL_STATUSES = ["pending", "in_production", "finished"] as const;

export function normalizeSenalNumber(value: unknown): number | null {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
}

export function generateSequentialSenalNumbers(
  activeSenalNumbers: number[],
  count: number,
  maxSenal = AUTO_SENAL_MAX,
): number[] {
  const needed = Math.max(0, Math.trunc(count));
  if (needed === 0) return [];

  const unavailable = new Set(
    activeSenalNumbers.filter((senal) => Number.isInteger(senal) && senal >= 1 && senal <= maxSenal),
  );
  const start = unavailable.size > 0 ? Math.max(...unavailable) : 0;
  const senales: number[] = [];
  let candidate = start;
  let scannedSinceAssignment = 0;

  while (senales.length < needed) {
    candidate = candidate >= maxSenal ? 1 : candidate + 1;
    scannedSinceAssignment += 1;

    if (!unavailable.has(candidate)) {
      unavailable.add(candidate);
      senales.push(candidate);
      scannedSinceAssignment = 0;
    }

    if (scannedSinceAssignment >= maxSenal) {
      throw new Error("No hay señales disponibles entre 1 y 999 para asignar automáticamente.");
    }
  }

  return senales;
}

export async function listActiveSenalNumbers(): Promise<number[]> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("machines")
    .select("senal_number")
    .in("status", [...ACTIVE_SENAL_STATUSES]);

  if (error) {
    throw new Error(`No se pudieron cargar las señales activas: ${error.message}`);
  }

  return (data ?? []).map((row) => row.senal_number).filter((senal): senal is number => Number.isFinite(senal));
}
