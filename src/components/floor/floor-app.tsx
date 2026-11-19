"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BrandLogo } from "@/components/brand";
import { ActiveSessionBar } from "@/components/factory/active-session-bar";
import { ActivityPanel } from "@/components/factory/activity-panel";
import { AlmacenManager } from "@/components/factory/almacen-manager";
import { MachineCardGrid, type MachineCardData } from "@/components/factory/machine-card-grid";
import { MachineMultiSelect } from "@/components/factory/machine-multi-select";
import { PausedActivitiesBar } from "@/components/factory/paused-activities-bar";
import { TaskGrid } from "@/components/factory/task-grid";
import { WorkerPicker } from "@/components/factory/worker-picker";
import { FloorNavHeader, FloorWorkerHeader } from "@/components/floor/floor-header";
import { FloorStatus } from "@/components/floor/floor-status";
import type { FloorIntent } from "@/lib/floor/commands";
import { machinesInProduction, type FloorState } from "@/lib/floor/state";
import type { FloorMachine } from "@/lib/floor/types";
import { getFloorClient, useFloor } from "@/lib/floor/use-floor";
import { openSessionView, othersWorkingByStage, pausedViews, workerBadges } from "@/lib/floor/views";
import { registerFloorServiceWorker } from "@/lib/floor/service-worker";

export type FloorView =
  | { name: "operarios" }
  | { name: "maquinas"; modo: "una" | "varias" }
  | { name: "maquina"; id: string }
  | { name: "grupo"; ids: string[] }
  | { name: "almacen" };

/** La vista se guarda por pestaña: al recargar (aun sin red) se vuelve a la misma. */
const VIEW_KEY = "xt_floor_view";

/** Vista pedida en la URL (las rutas viejas redirigen con ?v=…), si hay. */
function viewFromSearch(search: string): FloorView | null {
  const params = new URLSearchParams(search);
  switch (params.get("v")) {
    case "operarios":
      return { name: "operarios" };
    case "maquinas":
      return { name: "maquinas", modo: params.get("modo") === "varias" ? "varias" : "una" };
    case "maquina":
      return params.get("id") ? { name: "maquina", id: params.get("id") as string } : null;
    case "grupo": {
      const ids = (params.get("ids") ?? "").split(",").filter(Boolean);
      return ids.length > 0 ? { name: "grupo", ids } : null;
    }
    case "almacen":
      return { name: "almacen" };
    default:
      return null;
  }
}

function initialView(): FloorView {
  if (typeof window === "undefined") return { name: "operarios" };
  const fromUrl = viewFromSearch(window.location.search);
  if (fromUrl) return fromUrl;
  try {
    const saved = window.sessionStorage.getItem(VIEW_KEY);
    if (saved) return JSON.parse(saved) as FloorView;
  } catch {
    // Sin sessionStorage: se arranca en operarios.
  }
  return { name: "operarios" };
}

/**
 * La planta completa en una sola página de cliente. Todo lo que ve el
 * operario sale del estado local (snapshot + bandeja de salida), así que
 * navegar y registrar funcionan igual con o sin red.
 */
export function FloorApp() {
  const floor = useFloor();
  const [view, setView] = useState<FloorView>({ name: "operarios" });

  useEffect(() => {
    setView(initialView());
    // La URL queda limpia: la vista vive en el estado, no en el historial.
    if (window.location.search) window.history.replaceState(window.history.state, "", window.location.pathname);

    const stop = getFloorClient().start(window);
    void navigator.storage?.persist?.().catch(() => undefined);
    registerFloorServiceWorker();
    return stop;
  }, []);

  const navigate = useCallback((next: FloorView) => {
    setView(next);
    try {
      window.sessionStorage.setItem(VIEW_KEY, JSON.stringify(next));
    } catch {
      // Sin sessionStorage la vista no se recuerda al recargar; no pasa nada más.
    }
    window.scrollTo(0, 0);
  }, []);

  // El motor vive solo en el navegador: se pide en cada uso, nunca durante el render del servidor.
  const dispatch = useCallback((intent: FloorIntent) => getFloorClient().dispatch(intent), []);
  const toOperarios = useCallback(() => navigate({ name: "operarios" }), [navigate]);

  const status = <FloorStatus floor={floor} onDismissIssues={() => getFloorClient().dismissIssues()} />;

  if (!floor.ready || !floor.floor) {
    return (
      <main className="xt-planta xt-planta-page grid min-h-screen place-items-center bg-[var(--xt-paper)] p-6 text-center">
        <div className="max-w-xl">
          <BrandLogo className="mb-6 justify-center" />
          <p className="xt-eyebrow">Planta</p>
          <h1 className="[font-family:var(--font-barlow-condensed)] text-4xl font-bold leading-none">
            {floor.online ? "Cargando datos de planta…" : "Sin conexión"}
          </h1>
          {!floor.online ? (
            <p className="mt-3 text-lg text-[var(--xt-steel)]">
              El iPad necesita conectarse una vez para descargar los datos. Después puede trabajar sin señal.
            </p>
          ) : null}
        </div>
        {status}
      </main>
    );
  }

  const state = floor.floor;
  const worker = floor.workerId ? state.workers.find((item) => item.id === floor.workerId) ?? null : null;
  const needsWorker = view.name === "maquinas" || view.name === "maquina" || view.name === "grupo";
  const currentView: FloorView = needsWorker && !worker ? { name: "operarios" } : view;

  return (
    <main className="xt-planta xt-planta-page min-h-screen bg-[var(--xt-paper)]">
      {currentView.name === "operarios" || currentView.name === "almacen" ? (
        <FloorNavHeader
          active={currentView.name}
          online={floor.online}
          pendingCount={floor.pendingCount}
          onOperarios={toOperarios}
          onAlmacen={() => navigate({ name: "almacen" })}
        />
      ) : null}

      {currentView.name === "operarios" ? (
        <section className="xt-planta-section p-6">
          <WorkerPicker
            workers={state.workers}
            badges={workerBadges(state)}
            onSelect={(workerId) => {
              getFloorClient().selectWorker(workerId);
              navigate({ name: "maquinas", modo: "una" });
            }}
          />
        </section>
      ) : null}

      {currentView.name === "almacen" ? (
        <section className="xt-planta-section p-6">
          <div className="mb-5">
            <p className="xt-eyebrow">Almacén</p>
            <h1 className="text-3xl font-bold">Recibido de material</h1>
            <p className="text-sm text-[var(--xt-steel)]">
              Marca el material que va llegando: torno armado, torno ensamble, láser y cojines.
            </p>
          </div>
          <AlmacenManager machines={state.previoRows} dispatch={dispatch} />
        </section>
      ) : null}

      {worker && (currentView.name === "maquinas" || currentView.name === "maquina" || currentView.name === "grupo") ? (
        <WorkerViews
          view={currentView}
          state={state}
          workerId={worker.id}
          workerName={worker.name}
          workerColor={worker.color}
          online={floor.online}
          pendingCount={floor.pendingCount}
          dispatch={dispatch}
          navigate={navigate}
          onOperarios={toOperarios}
          onChangeWorker={() => {
            getFloorClient().clearWorker();
            toOperarios();
          }}
        />
      ) : null}

      {status}
    </main>
  );
}

function WorkerViews({
  view,
  state,
  workerId,
  workerName,
  workerColor,
  online,
  pendingCount,
  dispatch,
  navigate,
  onOperarios,
  onChangeWorker,
}: {
  view: Extract<FloorView, { name: "maquinas" | "maquina" | "grupo" }>;
  state: FloorState;
  workerId: string;
  workerName: string;
  workerColor: string | null;
  online: boolean;
  pendingCount: number;
  dispatch: (intent: FloorIntent) => ReturnType<ReturnType<typeof getFloorClient>["dispatch"]>;
  navigate: (view: FloorView) => void;
  onOperarios: () => void;
  onChangeWorker: () => void;
}) {
  const openSession = openSessionView(state, workerId);
  const paused = pausedViews(state, workerId);
  const machines = machinesInProduction(state);
  const stageNames = useMemo(() => Object.fromEntries(state.stages.map((stage) => [stage.id, stage.name])), [state.stages]);
  const toList = () => navigate({ name: "maquinas", modo: "una" });

  const headerProps = { workerName, workerColor, online, pendingCount, onOperarios };

  if (view.name === "maquinas") {
    const isMultiMode = view.modo === "varias";
    return (
      <>
        <FloorWorkerHeader
          {...headerProps}
          onChangeWorker={onChangeWorker}
          actions={
            <ActivityPanel
              workerId={workerId}
              activityTypes={state.activityTypes}
              machines={state.activityMachines}
              hasOpenSession={Boolean(openSession)}
              navButtonClass="min-h-11 px-4 text-sm text-white hover:text-white hover:bg-white/20"
              dispatch={dispatch}
            />
          }
        />
        {openSession ? <ActiveSessionBar workerId={workerId} session={openSession} dispatch={dispatch} /> : null}
        <PausedActivitiesBar
          workerId={workerId}
          activities={paused}
          hasOpenSession={Boolean(openSession)}
          dispatch={dispatch}
        />

        {machines.length === 0 ? (
          <section className="xt-planta-empty grid min-h-[calc(100vh-7rem)] place-items-center px-5 py-12 text-center">
            <div className="xt-planta-empty-inner max-w-xl">
              <p className="xt-eyebrow">Producción</p>
              <h2 className="xt-planta-empty-title [font-family:var(--font-barlow-condensed)] text-5xl font-bold leading-none">
                No hay máquinas en producción.
              </h2>
              <p className="xt-planta-empty-copy mt-3 text-lg text-[var(--xt-steel)]">
                Cuando una máquina pase de previos a producción aparecerá aquí para registrar tareas.
              </p>
            </div>
          </section>
        ) : (
          <>
            <div className="xt-mode-toggle" role="group" aria-label="Modo de selección de máquinas">
              <button
                type="button"
                aria-pressed={!isMultiMode}
                onClick={() => navigate({ name: "maquinas", modo: "una" })}
                className={`xt-mode-toggle-option ${!isMultiMode ? "xt-mode-toggle-option-active" : ""}`}
              >
                Una
              </button>
              <button
                type="button"
                aria-pressed={isMultiMode}
                onClick={() => navigate({ name: "maquinas", modo: "varias" })}
                className={`xt-mode-toggle-option ${isMultiMode ? "xt-mode-toggle-option-active" : ""}`}
              >
                Varias
              </button>
            </div>

            {isMultiMode ? (
              <MachineMultiSelect
                machines={machines.map((machine) => ({
                  id: machine.id,
                  serialNumber: machine.serial,
                  equipmentCode: machine.code,
                  equipmentName: machine.name,
                  clientName: machine.client,
                  stages: stageList(state, machine),
                }))}
                onContinue={(ids) => navigate({ name: "grupo", ids })}
              />
            ) : (
              <MachineCardGrid
                stageNames={stageNames}
                machines={machines.map<MachineCardData>((machine) => ({
                  id: machine.id,
                  code: machine.code,
                  name: machine.name,
                  client: machine.client,
                  serial: machine.serial,
                  stages: state.stages
                    .filter((stage) => machine.stages[stage.id])
                    .map((stage) => [stage.id, machine.stages[stage.id].completion === 100 ? 1 : 0]),
                }))}
                onOpen={(id) => navigate({ name: "maquina", id })}
              />
            )}
          </>
        )}
      </>
    );
  }

  const ids = view.name === "maquina" ? [view.id] : view.ids;
  // Una máquina terminada desde este iPad sigue visible aquí hasta salir de la vista.
  const selected = ids.map((id) => state.machines[id]).filter((machine): machine is FloorMachine => Boolean(machine));
  const isGroup = view.name === "grupo";

  if (selected.length === 0) {
    return (
      <>
        <FloorWorkerHeader {...headerProps} onBack={toList} />
        <section className="grid place-items-center px-5 py-16 text-center">
          <p className="text-lg text-[var(--xt-steel)]">Esta máquina ya no está en producción.</p>
        </section>
      </>
    );
  }

  const single = selected[0];
  const doneCount = Object.values(single.stages).filter((stage) => stage.completion === 100).length;

  return (
    <div className="xt-machine-detail pb-28">
      <FloorWorkerHeader {...headerProps} onBack={toList}>
        {isGroup ? (
          <div className="xt-group-machine-list px-5 py-3">
            <p className="xt-eyebrow">Grupo · {selected.length} máquinas</p>
            <ul className="xt-group-machine-items">
              {selected.map((machine) => (
                <li key={machine.id} className="xt-group-machine-item">
                  <span className="xt-group-machine-serial">#{machine.serial}</span>
                  <span className="xt-group-machine-equipment">{machine.name}</span>
                  <span className="xt-group-machine-client">{machine.client}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="xt-machine-detail-hero px-5 py-3 text-center">
            <h2 className="xt-machine-detail-title mx-auto max-w-5xl [font-family:var(--font-barlow-condensed)] text-base font-bold leading-tight break-words lg:text-2xl">
              {single.name}
            </h2>
            <p className="xt-machine-detail-subtitle mx-auto max-w-4xl text-sm text-[var(--xt-steel)] mt-0.5">
              SERIAL {single.serial} · {single.client} · {single.city ?? "Sin ciudad"} · {single.color ?? "Sin color"} ·{" "}
              {doneCount}/{Object.keys(single.stages).length} tareas
            </p>
          </div>
        )}
      </FloorWorkerHeader>

      {openSession ? <ActiveSessionBar workerId={workerId} session={openSession} dispatch={dispatch} /> : null}

      <TaskGrid
        // Cambiar de máquina o grupo reinicia avisos y la barra de volver.
        key={ids.join(",")}
        workerId={workerId}
        machines={selected.map((machine) => ({
          id: machine.id,
          serialNumber: machine.serial,
          stages: stageList(state, machine),
        }))}
        openSession={openSession}
        othersWorking={othersWorkingByStage(state, workerId, ids)}
        pausedActivities={paused.map((activity) => ({
          activityId: activity.activityId,
          stageId: activity.stageId,
          machineIds: activity.machines.map((machine) => machine.id),
          accumulatedMs: activity.accumulatedMs,
        }))}
        dispatch={dispatch}
        onReturnToWorkers={onOperarios}
      />
    </div>
  );
}

function stageList(state: FloorState, machine: FloorMachine) {
  return state.stages
    .filter((stage) => machine.stages[stage.id])
    .map((stage) => ({ id: stage.id, name: stage.name, completion: machine.stages[stage.id].completion }));
}
