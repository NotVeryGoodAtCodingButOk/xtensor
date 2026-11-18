import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { FloorCommandOutcome } from "@/lib/floor/commands";
import type { ClaimInput, ClaimResult } from "@/services/floor-sync/process";
import type { Json } from "@/types/database";

/** Un reclamo sin terminar por más de esto se considera abandonado (la petición murió). */
const STALE_CLAIM_MS = 60_000;

type Supabase = ReturnType<typeof createSupabaseAdminClient>;

/**
 * Reclama el comando para aplicarlo. La fila de floor_commands se crea con el
 * id del iPad: si ya existe, el comando ya llegó antes y se devuelve lo que pasó.
 */
export async function claimFloorCommand(supabase: Supabase, input: ClaimInput, now: Date): Promise<ClaimResult> {
  const { command } = input;
  const workerId = "workerId" in command.payload ? command.payload.workerId : null;

  const { data: inserted, error: insertError } = await supabase
    .from("floor_commands")
    .upsert(
      {
        id: command.id,
        device_id: input.deviceId,
        seq: command.seq,
        worker_id: workerId,
        type: command.type,
        payload: command.payload as unknown as Json,
        occurred_at: input.occurredAt.toISOString(),
        device_at: new Date(command.at).toISOString(),
        clock_offset_ms: input.clockOffsetMs,
        status: "processing",
        flags: input.flags,
        claimed_at: now.toISOString(),
      },
      { onConflict: "id", ignoreDuplicates: true },
    )
    .select("id");

  if (insertError) {
    throw new Error(`No se pudo registrar el comando: ${insertError.message}`);
  }
  if ((inserted ?? []).length > 0) {
    return { kind: "claimed", occurredAt: input.occurredAt, flags: input.flags, attempts: 0 };
  }

  const { data: existing, error: existingError } = await supabase
    .from("floor_commands")
    .select("status, flags, error, occurred_at, claimed_at, attempts")
    .eq("id", command.id)
    .single();

  if (existingError) {
    throw new Error(`No se pudo leer el comando: ${existingError.message}`);
  }

  if (existing.status !== "processing") {
    return {
      kind: "done",
      outcome: { id: command.id, status: existing.status, flags: existing.flags ?? [], error: existing.error },
    };
  }

  if (now.getTime() - new Date(existing.claimed_at).getTime() < STALE_CLAIM_MS) {
    return { kind: "busy" };
  }

  // Reclamo abandonado: se toma de nuevo solo si nadie lo tomó entre medio.
  const { data: retaken, error: retakeError } = await supabase
    .from("floor_commands")
    .update({ claimed_at: now.toISOString() })
    .eq("id", command.id)
    .eq("status", "processing")
    .eq("claimed_at", existing.claimed_at)
    .select("id");

  if (retakeError) {
    throw new Error(`No se pudo retomar el comando: ${retakeError.message}`);
  }
  if ((retaken ?? []).length === 0) {
    return { kind: "busy" };
  }

  // La hora que vale es la del primer intento (la corrección de reloj de entonces).
  return {
    kind: "claimed",
    occurredAt: new Date(existing.occurred_at),
    flags: existing.flags ?? [],
    attempts: existing.attempts,
  };
}

export async function finishFloorCommand(supabase: Supabase, outcome: FloorCommandOutcome, now: Date) {
  if (outcome.status === "retry") return;
  const { error } = await supabase
    .from("floor_commands")
    .update({ status: outcome.status, flags: outcome.flags, error: outcome.error, finished_at: now.toISOString() })
    .eq("id", outcome.id);

  if (error) {
    throw new Error(`No se pudo cerrar el comando: ${error.message}`);
  }
}

/** Error pasajero: el comando queda libre para el próximo intento y se cuenta. */
export async function releaseFloorCommand(supabase: Supabase, commandId: string, message: string) {
  const { data: row } = await supabase.from("floor_commands").select("attempts").eq("id", commandId).maybeSingle();
  await supabase
    .from("floor_commands")
    .update({ claimed_at: new Date(0).toISOString(), error: message.slice(0, 500), attempts: (row?.attempts ?? 0) + 1 })
    .eq("id", commandId)
    .eq("status", "processing");
}

/** Comando que ni siquiera pasó la validación: se guarda rechazado si trae id, para revisión. */
export async function recordInvalidFloorCommand(
  supabase: Supabase,
  input: { id: string; deviceId: string; raw: unknown; error: string; now: Date },
) {
  const raw = (input.raw ?? {}) as { seq?: unknown; type?: unknown; at?: unknown };
  const at = typeof raw.at === "number" && Number.isFinite(raw.at) ? new Date(raw.at) : input.now;
  await supabase.from("floor_commands").upsert(
    {
      id: input.id,
      device_id: input.deviceId,
      seq: typeof raw.seq === "number" && Number.isFinite(raw.seq) ? Math.trunc(raw.seq) : 0,
      type: typeof raw.type === "string" ? raw.type.slice(0, 60) : "desconocido",
      payload: (input.raw ?? null) as Json,
      occurred_at: at.toISOString(),
      device_at: at.toISOString(),
      status: "rejected",
      error: input.error,
      finished_at: input.now.toISOString(),
    },
    { onConflict: "id", ignoreDuplicates: true },
  );
}

export async function upsertFloorDevice(
  supabase: Supabase,
  input: { deviceId: string; device: string; userAgent: string; appVersion: string; swSupported: boolean; pendingCount: number; now: Date },
) {
  await supabase.from("floor_devices").upsert(
    {
      device_id: input.deviceId,
      device: input.device,
      user_agent: input.userAgent.slice(0, 300) || null,
      app_version: input.appVersion.slice(0, 60) || null,
      sw_supported: input.swSupported,
      pending_count: input.pendingCount,
      last_sync_at: input.now.toISOString(),
    },
    { onConflict: "device_id" },
  );
}
