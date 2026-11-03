import type { MachineStatus } from "@/types/database";
import type { LaborFactorSource, MachineLaborSnapshot } from "@/types/labor-report";

export type StageView = {
  id: number;
  name: string;
  completionPercentage: number;
  completion: number;
  lastWorkerName: string | null;
  lastUpdatedAt: string | null;
};

export type MachineView = {
  id: string;
  serialNumber: number;
  clientId: string;
  clientName: string;
  equipmentId: string | null;
  equipmentCode: string | null;
  equipmentName: string;
  /** equipment_catalog.labor_factor crudo (fracción) o null si el equipo no tiene % propio. */
  equipmentLaborFactor: number | null;
  colorId: string | null;
  colorName: string | null;
  city: string | null;
  line: string | null;
  salePriceCop: number;
  assignedTo: string | null;
  promisedDate: string;
  reestimatedDate: string | null;
  orderPosition: number;
  status: MachineStatus;
  shippedAt: string | null;
  productionStartedAt: string | null;
  firstTaskAt: string | null;
  completedAt: string | null;
  isReproceso: boolean;
  isWarranty: boolean;
  stages: StageView[];
  /** Stage names currently in an open reprocess: reverted from 100% and not yet finished again. */
  openReprocessStages: string[];
};

export type CalculatedMachineView = MachineView & {
  /** % MO efectivo (fracción): el del equipo o, si no tiene, settings.labor_factor. */
  laborFactor: number;
  laborFactorSource: LaborFactorSource;
  /** Solo presente cuando la página lo pide con attachMachineLabor (src/services/machine-labor.ts). */
  labor?: MachineLaborSnapshot;
  progressPct: number;
  totalHours: number;
  remainingHours: number;
  remainingHumanDays: number;
  accumulatedHours: number;
  estimatedDate: string;
  clientEstimatedDate: string;
  lastCompletedStageAt: string | null;
};

/**
 * What the client portal is allowed to see. Client Components serialize their
 * props into the page HTML, so the portal must only receive these fields —
 * never prices, internal dates, queue position, hours or worker names.
 */
export type ClientMachineView = Pick<
  CalculatedMachineView,
  "id" | "equipmentName" | "progressPct" | "status" | "shippedAt" | "clientEstimatedDate"
> & {
  stages: Pick<StageView, "id" | "name" | "completion" | "lastUpdatedAt">[];
};

export function toClientMachineView(machine: CalculatedMachineView): ClientMachineView {
  return {
    id: machine.id,
    equipmentName: machine.equipmentName,
    progressPct: machine.progressPct,
    status: machine.status,
    shippedAt: machine.shippedAt,
    clientEstimatedDate: machine.clientEstimatedDate,
    stages: machine.stages.map(({ id, name, completion, lastUpdatedAt }) => ({ id, name, completion, lastUpdatedAt })),
  };
}

export type PrevioCatalogView = {
  id: string;
  name: string;
  createdAt: string;
};

export type EquipmentPrevioView = {
  id: string;
  previoCatalogId: string;
  name: string;
  createdAt: string;
};

export type MachinePrevioView = {
  /** machine_previos row id, or null when no row exists yet (state defaults to false). */
  id: string | null;
  previoCatalogId: string;
  name: string;
  ordered: boolean;
  orderedAt: string | null;
  orderedBy: string | null;
  received: boolean;
  receivedAt: string | null;
  receivedBy: string | null;
  createdAt: string | null;
};

export type MachinePrevioSummary = {
  total: number;
  orderedCount: number;
  receivedCount: number;
  missingPrevios: boolean;
  pendingOrdered: boolean;
  pendingReceived: boolean;
  incompleteWhileInProduction: boolean;
};

export type MachinePrevioListRow = {
  machineId: string;
  serialNumber: number;
  clientName: string;
  equipmentName: string;
  equipmentCode: string | null;
  colorId: string | null;
  colorName: string | null;
  promisedDate: string;
  status: MachineStatus;
  previos: MachinePrevioView[];
  summary: MachinePrevioSummary;
};
