import { z } from "zod";
import { FLOOR_COMMAND_TYPES, type FloorCommand } from "@/lib/floor/commands";

const uuid = z.string().uuid();
const ids = z.array(uuid).max(200);
const stageId = z.number().int().min(1).max(100);

const payloadSchemas = {
  "session.start_stage": z.object({
    workerId: uuid,
    sessionId: uuid,
    activityId: uuid,
    stageId,
    machineIds: ids.min(1),
  }),
  "session.start_other": z.object({
    workerId: uuid,
    sessionId: uuid,
    activityId: uuid,
    activityTypeIds: ids.min(1),
    machineIds: ids,
  }),
  "session.pause": z.object({ workerId: uuid, sessionId: uuid }),
  "session.finish": z.object({ workerId: uuid, sessionId: uuid }),
  "session.resume": z.object({ workerId: uuid, sessionId: uuid, activityId: uuid }),
  "activity.finish_paused": z.object({ workerId: uuid, activityId: uuid }),
  "stage.set": z.object({
    workerId: uuid,
    machineId: uuid,
    stageId,
    completion: z.union([z.literal(0), z.literal(100)]),
  }),
  "previo.set_received": z.object({ machineId: uuid, previoCatalogId: uuid, received: z.boolean() }),
} as const;

const envelopeSchema = z.object({
  id: uuid,
  v: z.literal(1),
  seq: z.number().int().nonnegative(),
  at: z.number().finite(),
  type: z.enum(FLOOR_COMMAND_TYPES),
  payload: z.unknown(),
});

export const syncRequestSchema = z.object({
  deviceId: z.string().min(1).max(60),
  sentAt: z.number().finite(),
  appVersion: z.string().max(60).default(""),
  swSupported: z.boolean().default(false),
  pendingCount: z.number().int().nonnegative().default(0),
  commands: z.array(z.unknown()).max(50),
});

export type ParsedCommand = { ok: true; command: FloorCommand } | { ok: false; id: string | null; error: string };

/**
 * Valida un comando suelto. Uno mal formado no tumba el lote: se rechaza solo
 * ese (si tiene id) y el resto sigue.
 */
export function parseFloorCommand(raw: unknown): ParsedCommand {
  const envelope = envelopeSchema.safeParse(raw);
  if (!envelope.success) {
    const id = typeof (raw as { id?: unknown })?.id === "string" ? (raw as { id: string }).id : null;
    return { ok: false, id, error: "Comando inválido." };
  }

  const payload = payloadSchemas[envelope.data.type].safeParse(envelope.data.payload);
  if (!payload.success) {
    return { ok: false, id: envelope.data.id, error: "Comando inválido." };
  }

  return { ok: true, command: { ...envelope.data, payload: payload.data } as FloorCommand };
}
