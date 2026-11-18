/**
 * Orquestación de POST /planta/api/piso/sync, sin base de datos: recibe sus
 * dependencias para poder probarla (tests/unit/floor-sync.test.ts).
 *
 * Garantías:
 * - Orden: los comandos se aplican por `seq`. Si uno falla por un error
 *   pasajero, se detiene ahí y el iPad reenvía desde ese comando.
 * - Una sola vez: cada comando se "reclama" por su id antes de aplicarse; si ya
 *   se aplicó, se devuelve el resultado guardado sin tocar nada.
 * - Hora real: `at` (reloj del iPad) se corrige con la diferencia entre el
 *   reloj del iPad y el del servidor al momento de enviar.
 */
import type { FloorCommand, FloorCommandOutcome } from "@/lib/floor/commands";

/** Diferencias de reloj menores a esto son ruido de la red, no un reloj mal puesto. */
export const CLOCK_TOLERANCE_MS = 5_000;
/** Un comando que llega con más de esto de antigüedad se aplica igual, pero se marca. */
export const OLD_COMMAND_MS = 30 * 24 * 60 * 60_000;
/** Tras estos errores del servidor seguidos, el comando se rechaza para no frenar la cola. */
export const MAX_ATTEMPTS = 8;

/** Error permanente: el comando no se puede aplicar nunca (se rechaza y se deja para revisión). */
export class FloorRejection extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FloorRejection";
  }
}

export type ClaimInput = {
  command: FloorCommand;
  deviceId: string;
  occurredAt: Date;
  clockOffsetMs: number;
  flags: string[];
};

export type ClaimResult =
  | { kind: "claimed"; occurredAt: Date; flags: string[]; attempts: number }
  | { kind: "done"; outcome: FloorCommandOutcome }
  | { kind: "busy" };

export type ApplyContext = {
  command: FloorCommand;
  occurredAt: Date;
  /** El aplicador agrega aquí los conflictos que resolvió (se guarda el trabajo y se marca). */
  flags: string[];
};

export type FloorSyncDeps = {
  now(): Date;
  claim(input: ClaimInput): Promise<ClaimResult>;
  apply(context: ApplyContext): Promise<void>;
  finish(commandId: string, outcome: FloorCommandOutcome): Promise<void>;
  /** Error pasajero: suelta el reclamo para reintentar ya, y cuenta el intento. */
  release(commandId: string, error: string): Promise<void>;
};

export function clockOffsetMs(serverNowMs: number, deviceSentAtMs: number): number {
  const offset = serverNowMs - deviceSentAtMs;
  return Math.abs(offset) <= CLOCK_TOLERANCE_MS ? 0 : offset;
}

export async function processFloorBatch(
  input: { deviceId: string; sentAt: number; commands: FloorCommand[] },
  deps: FloorSyncDeps,
): Promise<FloorCommandOutcome[]> {
  const offset = clockOffsetMs(deps.now().getTime(), input.sentAt);
  const commands = [...input.commands].sort((a, b) => a.seq - b.seq);
  const outcomes: FloorCommandOutcome[] = [];

  for (const command of commands) {
    const nowMs = deps.now().getTime();
    const flags: string[] = [];
    let occurredMs = command.at + offset;
    if (occurredMs > nowMs) {
      // Unos segundos de más son ruido; más que eso, el iPad tenía mal la hora.
      if (occurredMs - nowMs > CLOCK_TOLERANCE_MS) flags.push("future_time");
      occurredMs = nowMs;
    }
    if (nowMs - occurredMs > OLD_COMMAND_MS) flags.push("old_time");

    const claim = await deps.claim({
      command,
      deviceId: input.deviceId,
      occurredAt: new Date(occurredMs),
      clockOffsetMs: offset,
      flags,
    });

    if (claim.kind === "done") {
      outcomes.push(claim.outcome);
      continue;
    }
    if (claim.kind === "busy") {
      outcomes.push(retry(command.id, "Se está aplicando en otra petición."));
      break;
    }

    const context: ApplyContext = { command, occurredAt: claim.occurredAt, flags: [...claim.flags] };
    try {
      await deps.apply(context);
      const outcome: FloorCommandOutcome = {
        id: command.id,
        status: context.flags.length > 0 ? "applied_flagged" : "applied",
        flags: unique(context.flags),
        error: null,
      };
      await deps.finish(command.id, outcome);
      outcomes.push(outcome);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (error instanceof FloorRejection || claim.attempts + 1 >= MAX_ATTEMPTS) {
        const outcome: FloorCommandOutcome = {
          id: command.id,
          status: "rejected",
          flags: unique(context.flags),
          error: error instanceof FloorRejection ? message : `Error repetido del servidor: ${message}`,
        };
        await deps.finish(command.id, outcome);
        outcomes.push(outcome);
        continue;
      }
      await deps.release(command.id, message);
      outcomes.push(retry(command.id, message));
      break;
    }
  }

  return outcomes;
}

function retry(id: string, error: string): FloorCommandOutcome {
  return { id, status: "retry", flags: [], error };
}

function unique(values: string[]) {
  return [...new Set(values)];
}
