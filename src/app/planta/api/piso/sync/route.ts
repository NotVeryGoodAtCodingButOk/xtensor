import { NextResponse } from "next/server";
import { isFactoryUnlocked } from "@/lib/factory-session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { FloorCommand, FloorCommandOutcome, FloorSyncResponse } from "@/lib/floor/commands";
import { deviceFromUserAgent } from "@/services/connectivity";
import { applyFloorCommand } from "@/services/floor-sync/apply";
import { processFloorBatch } from "@/services/floor-sync/process";
import { parseFloorCommand, syncRequestSchema } from "@/services/floor-sync/schema";
import {
  claimFloorCommand,
  finishFloorCommand,
  recordInvalidFloorCommand,
  releaseFloorCommand,
  upsertFloorDevice,
} from "@/services/floor-sync/store";

/**
 * Recibe la bandeja de salida del iPad (comandos en orden) y los aplica una
 * sola vez cada uno. Es una ruta y no una server action: no hace fila con
 * nada del router y el iPad controla reintentos y tiempos.
 */
export async function POST(request: Request) {
  if (!(await isFactoryUnlocked())) {
    return new NextResponse(null, { status: 401 });
  }

  const parsed = syncRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Solicitud inválida." }, { status: 400 });
  }

  const body = parsed.data;
  const supabase = createSupabaseAdminClient();
  const now = () => new Date();
  const userAgent = request.headers.get("user-agent") ?? "";
  const outcomes: FloorCommandOutcome[] = [];
  const commands: FloorCommand[] = [];

  for (const raw of body.commands) {
    const result = parseFloorCommand(raw);
    if (result.ok) {
      commands.push(result.command);
    } else if (result.id) {
      await recordInvalidFloorCommand(supabase, { id: result.id, deviceId: body.deviceId, raw, error: result.error, now: now() });
      outcomes.push({ id: result.id, status: "rejected", flags: [], error: result.error });
    }
  }

  outcomes.push(
    ...(await processFloorBatch(
      { deviceId: body.deviceId, sentAt: body.sentAt, commands },
      {
        now,
        claim: (input) => claimFloorCommand(supabase, input, now()),
        apply: applyFloorCommand,
        finish: (_id, outcome) => finishFloorCommand(supabase, outcome, now()),
        release: (id, message) => releaseFloorCommand(supabase, id, message),
      },
    )),
  );

  const pendingAfter = body.pendingCount - outcomes.filter((outcome) => outcome.status !== "retry").length;
  await upsertFloorDevice(supabase, {
    deviceId: body.deviceId,
    device: deviceFromUserAgent(userAgent),
    userAgent,
    appVersion: body.appVersion,
    swSupported: body.swSupported,
    pendingCount: Math.max(0, pendingAfter),
    now: now(),
  });

  const response: FloorSyncResponse = { serverTime: Date.now(), outcomes };
  return NextResponse.json(response, { headers: { "Cache-Control": "no-store" } });
}
