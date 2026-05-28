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
  cotiNumber: number;
  clientId: string;
  clientName: string;
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
};
