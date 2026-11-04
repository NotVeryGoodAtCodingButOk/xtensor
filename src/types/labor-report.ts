import type { MachineStatus } from "@/types/database";

/**
 * Tipos compartidos del reporte de mano de obra (presupuesto de horas por
 * máquina, % MO esperado vs. real y desglose de la jornada por período).
 * Contrato: .planning/horas-mano-obra/CONTRATO.md — los consumen tanto los
 * servicios (src/services/machine-labor.ts, labor-time.ts, labor-dashboard.ts)
 * como las páginas de admin y la cartelera de planta.
 *
 * Unidades: las fracciones van de 0 a 1 (0.3 = 30%), las horas son decimales
 * y los minutos son minutos de jornada (ya recortados al horario de planta).
 */

/** ok = dentro del presupuesto; riesgo = consume más rápido de lo que avanza; excedida = pasó las horas máximas. */
export type BudgetStatus = "ok" | "riesgo" | "excedida";

/** De dónde sale el % de mano de obra de una máquina: el de su equipo en el catálogo o el general de Configuración. */
export type LaborFactorSource = "catalogo" | "general";

/** Horas de toda la vida de una máquina (no dependen de un rango de fechas). */
export type MachineLaborSnapshot = {
  /** Horas máximas = venta × % MO del equipo ÷ costo hora promedio de Configuración. */
  budgetHours: number;
  /** Horas registradas con cronómetro en etapas de producción. Incluye reproceso. */
  spentHours: number;
  /** Parte de spentHours que fue reproceso. */
  reprocessHours: number;
  /** spentHours / budgetHours; null cuando no hay presupuesto (venta 0). */
  spentPct: number | null;
  status: BudgetStatus;
  /** true si la máquina ya terminó (finished/shipped): spentHours son las horas finales. */
  isFinal: boolean;
  /**
   * Horas incompletas: la máquina entró a producción antes del primer
   * cronómetro, no hay ningún cronómetro aún, o terminó sin horas registradas.
   * La cartelera muestra «—» en vez de un engañoso «Terminó en 0 h».
   */
  hasPartialData: boolean;
};

export type MachineLaborStatusFilter = "en-produccion" | "terminadas" | "despachadas" | "todas";

export type MachineLaborFilters = {
  estado: MachineLaborStatusFilter;
  /** Línea de producto (musculacion, bioparques, …) o null = todas. */
  linea: string | null;
  /** equipment_catalog.id o null = todos. */
  equipo: string | null;
};

/** Una fila por máquina (cotización/serial) en la pestaña Estadísticas → Máquinas. */
export type MachineLaborRow = {
  machineId: string;
  serialNumber: number;
  equipmentId: string | null;
  equipmentName: string;
  clientName: string;
  line: string | null;
  status: MachineStatus;
  /** 0..1 */
  progressPct: number;
  salePriceCop: number;
  /** % MO esperado (fracción) = % vigente del equipo o el general. */
  laborFactor: number;
  laborFactorSource: LaborFactorSource;
  budgetHours: number;
  spentHours: number;
  reprocessHours: number;
  spentPct: number | null;
  budgetStatus: BudgetStatus;
  /** Horas de actividades asociadas a la máquina (empaque, carga, instalación, garantías). Fuera del presupuesto. */
  extraHours: number;
  /** Costo real de producción: horas × costo hora de cada operario. */
  realCostCop: number;
  /** Costo de las actividades asociadas (extraHours). */
  extraCostCop: number;
  /** % MO real (fracción) = realCostCop / salePriceCop; null si venta = 0. */
  realLaborPct: number | null;
  /**
   * La máquina entró a producción antes de que existieran los cronómetros
   * (o terminó sin ninguna sesión): sus horas están incompletas y no entra
   * en los promedios por tipo de máquina.
   */
  hasPartialData: boolean;
  productionStartedAt: string | null;
  completedAt: string | null;
  shippedAt: string | null;
};

/** Agregado por tipo de máquina (equipo del catálogo). Promedios solo de terminadas/despachadas con datos completos. */
export type EquipmentLaborRow = {
  /** null = productos personalizados sin equipo de catálogo. */
  equipmentId: string | null;
  equipmentName: string;
  line: string | null;
  /** % vigente del equipo (o el general). */
  laborFactor: number;
  laborFactorSource: LaborFactorSource;
  /** Máquinas que entran en los promedios. */
  machineCount: number;
  avgBudgetHours: number | null;
  avgSpentHours: number | null;
  avgSpentPct: number | null;
  avgRealLaborPct: number | null;
  totalRealCostCop: number;
};

export type MachineLaborReport = {
  filters: MachineLaborFilters;
  machines: MachineLaborRow[];
  byEquipment: EquipmentLaborRow[];
  totals: {
    machineCount: number;
    overBudgetCount: number;
    atRiskCount: number;
    /** Promedio del % esperado de las máquinas que entran en los promedios. */
    avgExpectedLaborPct: number | null;
    avgRealLaborPct: number | null;
  };
  /** Inicio del primer cronómetro registrado en la base (ISO) o null si no hay ninguno. */
  trackingSince: string | null;
};

export type MachineLaborStageRow = {
  stageId: number;
  stageName: string;
  /** budgetHours × peso de la etapa (DEFAULT_STAGES: 20/20/10/20/10/10/10 %). */
  expectedHours: number;
  spentHours: number;
  reprocessHours: number;
};

export type MachineLaborWorkerRow = {
  workerId: string;
  fullName: string;
  /** Horas de producción atribuidas a esta máquina (incluye reproceso). */
  hours: number;
  costCop: number;
};

export type MachineLaborActivityRow = {
  activityTypeId: string;
  name: string;
  hours: number;
  costCop: number;
};

export type MachineLaborSessionRow = {
  sessionId: string;
  workerName: string;
  kind: "stage" | "other";
  /** Nombre de la etapa o de las actividades marcadas. */
  label: string;
  isReprocess: boolean;
  startedAt: string;
  endedAt: string | null;
  /** Minutos atribuidos a ESTA máquina (ya repartidos si la sesión tenía varias). */
  minutes: number;
  /** Cuántas máquinas compartían el cronómetro (1 = solo esta). */
  sharedWith: number;
};

/** Ficha de una máquina: /admin/estadisticas/maquinas/[id]. */
export type MachineLaborDetail = {
  machine: MachineLaborRow;
  promisedDate: string;
  reestimatedDate: string | null;
  byStage: MachineLaborStageRow[];
  byWorker: MachineLaborWorkerRow[];
  extraByActivity: MachineLaborActivityRow[];
  /** Más recientes primero. */
  sessions: MachineLaborSessionRow[];
};

export type LaborGranularity = "dia" | "semana" | "mes";

/**
 * Una fila del desglose de la jornada por día, semana o mes (hora de Bogotá,
 * semanas de lunes a domingo). Regla de ausencia: la jornada disponible solo
 * cuenta los días en que el operario registró algo.
 *
 * Asignado a máquinas = machineMinutes + reprocessMinutes + machineActivityMinutes.
 * No asignado        = plantActivityMinutes + unregisteredMinutes.
 */
export type LaborPeriodRow = {
  /** "2026-11-03" (día), "2026-11-03" = lunes de la semana (semana), "2026-11" (mes). */
  periodKey: string;
  /** Texto para la tabla: "lun 3 nov", "Semana del 3 nov", "Noviembre 2026". */
  label: string;
  /** Primer día del período, yyyy-MM-dd. */
  startDate: string;
  workersWithRecords: number;
  /** Jornada disponible (shift − pausas) en los días con registro de cada operario. */
  availableMinutes: number;
  /** Etapas de producción, sin reproceso. */
  machineMinutes: number;
  reprocessMinutes: number;
  /** Actividades con máquina asociada (empaque/carga/instalación, garantías). */
  machineActivityMinutes: number;
  /** Actividades sin máquina (5S y similares). */
  plantActivityMinutes: number;
  /** Σ por operario-día de max(0, jornada − registrado). */
  unregisteredMinutes: number;
  assignedMinutes: number;
  unassignedMinutes: number;
  /** activity_type_id → minutos (incluye actividades con y sin máquina). */
  minutesByActivityType: Record<string, number>;
};
