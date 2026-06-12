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
import { undoStageLog, updateStageProgress } from "@/services/stages";
import { verifyFactoryPassword } from "@/services/settings";

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
    return { ok: false, logged: false, finished: false };
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

  return { ok: true, logged: Boolean(result.log?.id), finished };
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
