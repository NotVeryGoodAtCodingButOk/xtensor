"use server";

import { redirect } from "next/navigation";
import {
  clearActiveWorker,
  clearFactorySession,
  getActiveWorkerId,
  isFactoryUnlocked,
  setActiveWorker,
  setFactoryUnlocked,
} from "@/lib/factory-session";
import { listWorkers } from "@/services/catalog";
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

export async function updateStageAction(formData: FormData) {
  const workerId = await getActiveWorkerId();
  const machineId = String(formData.get("machineId") ?? "");
  const stageId = Number(formData.get("stageId"));
  const completion = Number(formData.get("completion"));

  if (!(await isFactoryUnlocked())) {
    redirect("/planta");
  }

  if (!workerId) {
    redirect("/planta/operarios");
  }

  const result = await updateStageProgress({ machineId, stageId, completion, workerId });
  const logId = result.log?.id ? `?log=${result.log.id}` : "";
  redirect(`/planta/maquinas/${machineId}${logId}`);
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
  redirect(`/planta/maquinas/${machineId}`);
}
