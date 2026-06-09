"use server";

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

export async function updateStageAction(formData: FormData) {
  const workerId = await getActiveWorkerId();
  const machineId = String(formData.get("machineId") ?? "");
  const stageId = Number(formData.get("stageId"));
  const completion = Number(formData.get("completion")) === 100 ? 100 : 0;

  if (!(await isFactoryUnlocked())) {
    redirect("/planta");
  }

  if (!workerId) {
    redirect("/planta/operarios");
  }

  const result = await updateStageProgress({ machineId, stageId, completion, workerId });
  revalidateFactoryData();
  const nextParams = new URLSearchParams();

  if (result.log?.id) {
    nextParams.set("logged", "1");
  }

  if (completion === 100) {
    const machine = await getMachine(machineId);
    const isCompleted = machine.stages.every((stage) => stage.completion === 100);
    if (isCompleted) {
      nextParams.set("toast", "finished");
    }
  }

  const query = nextParams.toString();
  redirect(`/planta/maquinas/${machineId}${query ? `?${query}` : ""}`);
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
