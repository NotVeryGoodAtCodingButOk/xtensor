"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { revalidateFactoryData } from "@/lib/factory-cache";
import {
  clearActiveWorker,
  clearFactorySession,
  getActiveWorkerId,
  isFactoryUnlocked,
  setActiveWorker,
  setFactoryUnlocked,
} from "@/lib/factory-session";
import { listWorkers } from "@/services/catalog";
import { getMachine } from "@/services/machines";
import { toggleMachinePrevio } from "@/services/previos";
import { undoStageLog, updateStageProgress } from "@/services/stages";
import { verifyFactoryPassword } from "@/services/settings";
import {
  finishPausedActivity,
  finishSession,
  resumeActivity,
  startOtherSession,
  startStageSession,
} from "@/services/work-sessions";

export async function unlockFactoryAction(formData: FormData) {
  const password = String(formData.get("password") ?? "");

  if (!password || !(await verifyFactoryPassword(password))) {
    redirect("/planta?error=clave");
  }

  await setFactoryUnlocked();
  redirect("/planta/operarios");
}

export async function lockFactoryAction() {
  await clearFactorySession();
  redirect("/planta");
}

export async function selectWorkerAction(formData: FormData) {
  const workerId = String(formData.get("workerId") ?? "");

  if (!(await isFactoryUnlocked())) {
    redirect("/planta");
  }

  const workers = await listWorkers(true);
  if (!workers.some((worker) => worker.id === workerId)) {
    redirect("/planta/operarios?error=operario");
  }

  await setActiveWorker(workerId);
  redirect("/planta/maquinas");
}

export async function changeWorkerAction() {
  await clearActiveWorker();
  redirect("/planta/operarios");
}

export type LogStageResult = {
  ok: boolean;
  logged: boolean;
  finished: boolean;
  revert: "undo" | "reprocess" | null;
};

/**
 * Toggles a stage and returns the outcome instead of redirecting, so the
 * factory tablet can update optimistically without a full page navigation.
 */
export async function logStageAction(input: {
  machineId: string;
  stageId: number;
  completion: number;
}): Promise<LogStageResult> {
  const workerId = await getActiveWorkerId();

  if (!(await isFactoryUnlocked()) || !workerId) {
    return { ok: false, logged: false, finished: false, revert: null };
  }

  const completion = input.completion === 100 ? 100 : 0;
  const result = await updateStageProgress({
    machineId: input.machineId,
    stageId: input.stageId,
    completion,
    workerId,
  });
  revalidateFactoryData();

  let finished = false;
  if (completion === 100) {
    const machine = await getMachine(input.machineId);
    finished = machine.stages.every((stage) => stage.completion === 100);
  }

  // Refresh the detail route's server data so the optimistic UI reconciles
  // against the real stage state once the mutation lands.
  revalidatePath(`/planta/maquinas/${input.machineId}`);

  return { ok: true, logged: Boolean(result.log?.id), finished, revert: result.revert };
}

/**
 * Marks a previo as received (or un-received) from the factory-floor Almacén
 * view. Only the "received" field is editable here — Gina still manages
 * "ordered" from /admin/previos. No worker attribution: the event is recorded
 * with a null actor (the previos tables reference admin profiles, not workers).
 */
export async function toggleMachinePrevioFactoryAction(formData: FormData) {
  if (!(await isFactoryUnlocked())) {
    redirect("/planta");
  }

  const machineId = String(formData.get("machineId") ?? "").trim();
  const previoCatalogId = String(formData.get("previoCatalogId") ?? "").trim();
  const checked = String(formData.get("checked") ?? "") === "true";

  if (machineId && previoCatalogId) {
    await toggleMachinePrevio({
      machineId,
      previoCatalogId,
      field: "received",
      checked,
      actorProfileId: null,
    });
  }

  revalidatePath("/planta/almacen");
}

export type SessionActionResult = {
  ok: boolean;
  error?: string;
  finishedMachineIds?: string[];
};

/** Resolves the acting worker the same way logStageAction does, without redirecting. */
async function resolveSessionWorkerId(): Promise<string | null> {
  if (!(await isFactoryUnlocked())) {
    return null;
  }
  return getActiveWorkerId();
}

function sessionErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

/**
 * Revalidates the machine-list route plus every detail/group route (using the
 * dynamic-path pattern so a single call covers every machine, without needing
 * to know which ones were affected).
 */
function revalidatePlantaRoutes() {
  revalidatePath("/planta/maquinas");
  revalidatePath("/planta/maquinas/[id]", "page");
  revalidatePath("/planta/maquinas/grupo", "page");
}

/** Starts a timed stage session on one or several machines. */
export async function startStageSessionAction(input: {
  machineIds: string[];
  stageId: number;
}): Promise<SessionActionResult> {
  const workerId = await resolveSessionWorkerId();
  if (!workerId) {
    return { ok: false, error: "Selecciona un operario para continuar." };
  }

  try {
    await startStageSession({ workerId, machineIds: input.machineIds, stageId: input.stageId });
  } catch (error) {
    return { ok: false, error: sessionErrorMessage(error, "No se pudo iniciar la actividad.") };
  }

  revalidateFactoryData();
  revalidatePlantaRoutes();

  return { ok: true };
}

/** Starts a timed session on one or several catalogued activities (aseo, orden…). */
export async function startOtherSessionAction(input: {
  activityTypeIds: string[];
  machineIds?: string[];
}): Promise<SessionActionResult> {
  const workerId = await resolveSessionWorkerId();
  if (!workerId) {
    return { ok: false, error: "Selecciona un operario para continuar." };
  }

  try {
    await startOtherSession({ workerId, activityTypeIds: input.activityTypeIds, machineIds: input.machineIds });
  } catch (error) {
    return { ok: false, error: sessionErrorMessage(error, "No se pudo iniciar la actividad.") };
  }

  revalidateFactoryData();
  revalidatePlantaRoutes();

  return { ok: true };
}

/** Terminar: closes the session and marks the stage done (100%) on every machine of the session. */
export async function finishSessionAction(input: { sessionId: string }): Promise<SessionActionResult> {
  const workerId = await resolveSessionWorkerId();
  if (!workerId) {
    return { ok: false, error: "Selecciona un operario para continuar." };
  }

  let finishedMachineIds: string[] = [];
  try {
    const result = await finishSession({ workerId, sessionId: input.sessionId, reason: "completed" });
    finishedMachineIds = result.finishedMachineIds;
  } catch (error) {
    return { ok: false, error: sessionErrorMessage(error, "No se pudo terminar la actividad.") };
  }

  revalidateFactoryData();
  revalidatePlantaRoutes();

  return { ok: true, finishedMachineIds };
}

/**
 * Pausar: cierra el tramo en curso sin marcar nada. La actividad queda
 * pausada y se puede reanudar con el tiempo acumulado.
 */
export async function pauseSessionAction(input: { sessionId: string }): Promise<SessionActionResult> {
  const workerId = await resolveSessionWorkerId();
  if (!workerId) {
    return { ok: false, error: "Selecciona un operario para continuar." };
  }

  try {
    await finishSession({ workerId, sessionId: input.sessionId, reason: "paused" });
  } catch (error) {
    return { ok: false, error: sessionErrorMessage(error, "No se pudo pausar la actividad.") };
  }

  revalidateFactoryData();
  revalidatePlantaRoutes();

  return { ok: true };
}

/** Reanudar: abre un tramo nuevo sobre una actividad pausada. */
export async function resumeActivityAction(input: { activityId: string }): Promise<SessionActionResult> {
  const workerId = await resolveSessionWorkerId();
  if (!workerId) {
    return { ok: false, error: "Selecciona un operario para continuar." };
  }

  try {
    await resumeActivity({ workerId, activityId: input.activityId });
  } catch (error) {
    return { ok: false, error: sessionErrorMessage(error, "No se pudo reanudar la actividad.") };
  }

  revalidateFactoryData();
  revalidatePlantaRoutes();

  return { ok: true };
}

/** Terminar sobre una actividad pausada: marca la etapa sin volver a arrancar el cronómetro. */
export async function finishPausedActivityAction(input: { activityId: string }): Promise<SessionActionResult> {
  const workerId = await resolveSessionWorkerId();
  if (!workerId) {
    return { ok: false, error: "Selecciona un operario para continuar." };
  }

  let finishedMachineIds: string[] = [];
  try {
    const result = await finishPausedActivity({ workerId, activityId: input.activityId });
    finishedMachineIds = result.finishedMachineIds;
  } catch (error) {
    return { ok: false, error: sessionErrorMessage(error, "No se pudo terminar la actividad.") };
  }

  revalidateFactoryData();
  revalidatePlantaRoutes();

  return { ok: true, finishedMachineIds };
}

export async function undoStageAction(formData: FormData) {
  const workerId = await getActiveWorkerId();
  const logId = String(formData.get("logId") ?? "");
  const machineId = String(formData.get("machineId") ?? "");

  if (!(await isFactoryUnlocked())) {
    redirect("/planta");
  }

  if (!workerId) {
    redirect("/planta/operarios");
  }

  await undoStageLog({ logId, workerId });
  revalidateFactoryData();
  redirect(`/planta/maquinas/${machineId}`);
}
