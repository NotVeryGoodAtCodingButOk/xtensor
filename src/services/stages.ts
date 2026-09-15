import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { classifyStageRevert } from "@/services/stage-revert";

export { classifyStageRevert };

const VALID_COMPLETIONS = new Set([0, 100]);
const REPROCESS_GRACE_MINUTES = 5;

export async function updateStageProgress(input: {
  machineId: string;
  stageId: number;
  completion: number;
  workerId: string;
}) {
  if (!VALID_COMPLETIONS.has(input.completion)) {
    throw new Error("La tarea debe estar pendiente o hecha.");
  }

  const supabase = createSupabaseAdminClient();
  const { data: current, error: currentError } = await supabase
    .from("machine_stages")
    .select("*")
    .eq("machine_id", input.machineId)
    .eq("stage_id", input.stageId)
    .single();

  if (currentError) {
    throw new Error(`No se pudo cargar la etapa: ${currentError.message}`);
  }

  if (current.completion === input.completion) {
    return { stage: current, log: null, revert: null };
  }

  const isReprocess = current.completion >= 100 && input.completion < 100;

  if (isReprocess) {
    const { data: lastLog, error: lastLogError } = await supabase
      .from("stage_logs")
      .select("*")
      .eq("machine_id", input.machineId)
      .eq("stage_id", input.stageId)
      .eq("new_completion", 100)
      .eq("is_undone", false)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (lastLogError) {
      throw new Error(`No se pudo verificar el historial de la etapa: ${lastLogError.message}`);
    }

    const revert = classifyStageRevert(lastLog?.created_at ?? null, new Date(), REPROCESS_GRACE_MINUTES);

    if (revert === "undo" && lastLog) {
      const { error: undoLogError } = await supabase
        .from("stage_logs")
        .update({ is_undone: true })
        .eq("id", lastLog.id);

      if (undoLogError) {
        throw new Error(`No se pudo deshacer la acción: ${undoLogError.message}`);
      }

      const { data: stage, error: updateError } = await supabase
        .from("machine_stages")
        .update({
          completion: lastLog.previous_completion,
          last_worker_id: input.workerId,
          last_updated_at: new Date().toISOString(),
        })
        .eq("id", current.id)
        .select("*")
        .single();

      if (updateError) {
        throw new Error(`No se pudo actualizar la etapa: ${updateError.message}`);
      }

      await syncMachineCompletion(supabase, input.machineId);

      return { stage, log: null, revert: "undo" as const };
    }

    const { stage, log } = await insertStageLogAndUpdateStage(supabase, {
      machineId: input.machineId,
      stageId: input.stageId,
      workerId: input.workerId,
      currentId: current.id,
      previousCompletion: current.completion,
      newCompletion: input.completion,
      isReprocess: true,
    });

    await syncMachineCompletion(supabase, input.machineId);

    return { stage, log, revert: "reprocess" as const };
  }

  const { stage, log } = await insertStageLogAndUpdateStage(supabase, {
    machineId: input.machineId,
    stageId: input.stageId,
    workerId: input.workerId,
    currentId: current.id,
    previousCompletion: current.completion,
    newCompletion: input.completion,
    isReprocess: false,
  });

  await syncMachineCompletion(supabase, input.machineId);

  return { stage, log, revert: null };
}

async function insertStageLogAndUpdateStage(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  input: {
    machineId: string;
    stageId: number;
    workerId: string;
    currentId: string;
    previousCompletion: number;
    newCompletion: number;
    isReprocess: boolean;
  },
) {
  const { data: log, error: logError } = await supabase
    .from("stage_logs")
    .insert({
      machine_id: input.machineId,
      stage_id: input.stageId,
      worker_id: input.workerId,
      previous_completion: input.previousCompletion,
      new_completion: input.newCompletion,
      is_reprocess: input.isReprocess,
    })
    .select("*")
    .single();

  if (logError) {
    throw new Error(`No se pudo registrar la bitácora: ${logError.message}`);
  }

  const { data: stage, error: updateError } = await supabase
    .from("machine_stages")
    .update({
      completion: input.newCompletion,
      last_worker_id: input.workerId,
      last_updated_at: new Date().toISOString(),
    })
    .eq("id", input.currentId)
    .select("*")
    .single();

  if (updateError) {
    throw new Error(`No se pudo actualizar la etapa: ${updateError.message}`);
  }

  return { stage, log };
}

/**
 * Stamps `completed_at` when every stage of a machine reaches 100%, and clears
 * it again if any stage drops below 100%. Safe to call after any stage change.
 */
async function syncMachineCompletion(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  machineId: string,
) {
  const { data: stages, error: stagesError } = await supabase
    .from("machine_stages")
    .select("completion")
    .eq("machine_id", machineId);

  if (stagesError) {
    throw new Error(`No se pudo verificar el avance de la máquina: ${stagesError.message}`);
  }

  const allDone = stages.length > 0 && stages.every((stage) => stage.completion >= 100);

  const { data: machine, error: machineError } = await supabase
    .from("machines")
    .select("completed_at, status")
    .eq("id", machineId)
    .single();

  if (machineError) {
    throw new Error(`No se pudo cargar la máquina: ${machineError.message}`);
  }

  if (allDone && machine.status === "in_production") {
    await supabase
      .from("machines")
      .update({ status: "finished", completed_at: new Date().toISOString() })
      .eq("id", machineId);
  } else if (!allDone && machine.status === "finished") {
    await supabase
      .from("machines")
      .update({ status: "in_production", completed_at: null })
      .eq("id", machineId);
  }
}

export async function undoStageLog(input: { logId: string; workerId: string }) {
  const supabase = createSupabaseAdminClient();
  const { data: log, error: logError } = await supabase
    .from("stage_logs")
    .select("*")
    .eq("id", input.logId)
    .eq("worker_id", input.workerId)
    .single();

  if (logError) {
    throw new Error(`No se pudo cargar la acción: ${logError.message}`);
  }

  if (log.is_undone) {
    throw new Error("Esta acción ya fue deshecha.");
  }

  const { data: laterLogs, error: laterError } = await supabase
    .from("stage_logs")
    .select("id")
    .eq("machine_id", log.machine_id)
    .eq("stage_id", log.stage_id)
    .gt("created_at", log.created_at)
    .eq("is_undone", false)
    .limit(1);

  if (laterError) {
    throw new Error(`No se pudo validar la acción: ${laterError.message}`);
  }

  if (laterLogs.length > 0) {
    throw new Error("No se puede deshacer porque existe una acción posterior sobre esta etapa.");
  }

  const { error: updateStageError } = await supabase
    .from("machine_stages")
    .update({
      completion: log.previous_completion,
      last_worker_id: input.workerId,
      last_updated_at: new Date().toISOString(),
    })
    .eq("machine_id", log.machine_id)
    .eq("stage_id", log.stage_id);

  if (updateStageError) {
    throw new Error(`No se pudo restaurar la etapa: ${updateStageError.message}`);
  }

  const { data: updatedLog, error: updateLogError } = await supabase
    .from("stage_logs")
    .update({ is_undone: true })
    .eq("id", log.id)
    .select("*")
    .single();

  if (updateLogError) {
    throw new Error(`No se pudo marcar la acción como deshecha: ${updateLogError.message}`);
  }

  await syncMachineCompletion(supabase, log.machine_id);

  return updatedLog;
}

export async function listWorkerRecentActions(workerId: string, limit = 10) {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("stage_logs")
    .select("*")
    .eq("worker_id", workerId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`No se pudieron cargar las acciones: ${error.message}`);
  }

  return data;
}
