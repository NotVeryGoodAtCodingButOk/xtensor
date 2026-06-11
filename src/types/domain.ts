import type { MachineStatus } from "@/types/database";

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
  placaNumber: number;
  clientId: string;
  clientName: string;
  equipmentId: string | null;
  equipmentCode: string | null;
  equipmentName: string;
  colorName: string | null;
  city: string | null;
  line: string | null;
  salePriceCop: number;
  assignedTo: string | null;
  promisedDate: string;
  orderPosition: number;
  status: MachineStatus;
  shippedAt: string | null;
  productionStartedAt: string | null;
  completedAt: string | null;
  isReproceso: boolean;
  isWarranty: boolean;
  stages: StageView[];
};

export type CalculatedMachineView = MachineView & {
  progressPct: number;
  totalHours: number;
  remainingHours: number;
  remainingHumanDays: number;
  accumulatedHours: number;
  estimatedDate: string;
  clientEstimatedDate: string;
  lastCompletedStageAt: string | null;
};

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
  placaNumber: number;
  clientName: string;
  equipmentName: string;
  equipmentCode: string | null;
  promisedDate: string;
  status: MachineStatus;
  previos: MachinePrevioView[];
  summary: MachinePrevioSummary;
};
