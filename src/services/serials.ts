import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const AUTO_SERIAL_MAX = 999;
export const ACTIVE_SERIAL_STATUSES = ["pending", "in_production", "finished"] as const;

export function normalizeSerialNumber(value: unknown): number | null {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
}

export function generateSequentialSerialNumbers(
  activeSerialNumbers: number[],
  count: number,
  maxSerial = AUTO_SERIAL_MAX,
): number[] {
  const needed = Math.max(0, Math.trunc(count));
  if (needed === 0) return [];

  const unavailable = new Set(
    activeSerialNumbers.filter((serial) => Number.isInteger(serial) && serial >= 1 && serial <= maxSerial),
  );
  const start = unavailable.size > 0 ? Math.max(...unavailable) : 0;
  const serials: number[] = [];
  let candidate = start;
  let scannedSinceAssignment = 0;

  while (serials.length < needed) {
    candidate = candidate >= maxSerial ? 1 : candidate + 1;
    scannedSinceAssignment += 1;

    if (!unavailable.has(candidate)) {
      unavailable.add(candidate);
      serials.push(candidate);
      scannedSinceAssignment = 0;
    }

    if (scannedSinceAssignment >= maxSerial) {
      throw new Error("No hay seriales disponibles entre 1 y 999 para asignar automáticamente.");
    }
  }

  return serials;
}

export async function listActiveSerialNumbers(): Promise<number[]> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("machines")
    .select("serial_number")
    .in("status", [...ACTIVE_SERIAL_STATUSES]);

  if (error) {
    throw new Error(`No se pudieron cargar las seriales activas: ${error.message}`);
  }

  return (data ?? []).map((row) => row.serial_number).filter((serial): serial is number => Number.isFinite(serial));
}
