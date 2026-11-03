import { describe, expect, it } from "vitest";
import {
  shiftFromSettings,
  summarizeLaborByPeriod,
  summarizeMachineLabor,
  UNCLASSIFIED_ACTIVITY_ID,
  type FactoryShift,
  type LaborSessionInput,
  type LaborWorkerInput,
  type SummarizeLaborInput,
} from "@/services/labor-time";
import { DEFAULT_SETTINGS } from "@/services/calculations";

// 2026-06-01 es lunes. Jornada por defecto: 08:00-17:00 lun-jue (495 min netos
// tras las pausas 09:00 +15 y 12:00 +30), viernes hasta 14:30, fin de semana libre.
const shift: FactoryShift = shiftFromSettings(DEFAULT_SETTINGS);

// Jornada larga y sin pausas, todos los días, para probar límites de día/semana/mes
// en hora de Bogotá con sesiones nocturnas (después de las 19:00 ya es otro día en UTC).
const lateShift: FactoryShift = {
  start: "06:00",
  endByWeekday: { 0: "23:30", 1: "23:30", 2: "23:30", 3: "23:30", 4: "23:30", 5: "23:30", 6: "23:30" },
  breaks: [],
};

const workers: LaborWorkerInput[] = [
  { id: "w1", fullName: "Ana", hourlyCostCop: 30_000 },
  { id: "w2", fullName: "Beto", hourlyCostCop: null },
];

let sessionCounter = 0;
function session(overrides: Partial<LaborSessionInput>): LaborSessionInput {
  sessionCounter += 1;
  return {
    id: `s${sessionCounter}`,
    workerId: "w1",
    kind: "stage",
    stageId: 4,
    activityTypeIds: [],
    note: null,
    isReprocess: false,
    startedAt: "2026-06-01T08:00:00-05:00",
    endedAt: "2026-06-01T10:00:00-05:00",
    endReason: "completed",
    machineIds: ["m1"],
    ...overrides,
  };
}

function periodInput(
  sessions: LaborSessionInput[],
  overrides: Partial<SummarizeLaborInput> = {},
): SummarizeLaborInput {
  return {
    sessions,
    workers,
    machines: [],
    stages: [],
    shift,
    holidays: [],
    range: { startIso: "2026-05-01T00:00:00-05:00", endIso: "2026-08-01T00:00:00-05:00" },
    now: "2026-07-31T12:00:00-05:00",
    hourlyCostFallback: 20_000,
    estimateHours: () => 0,
    ...overrides,
  };
}

describe("summarizeMachineLabor", () => {
  it("splits a multi-machine session equally, using each worker's cost or the fallback", () => {
    const totals = summarizeMachineLabor({
      sessions: [
        // 105 min (08:00-10:00 menos la pausa de 09:00) entre 3 máquinas, Ana a 30.000/h.
        session({ machineIds: ["m1", "m2", "m3"] }),
        // 60 min de Beto (sin costo propio → 20.000/h) solo en m1.
        session({ workerId: "w2", startedAt: "2026-06-01T10:00:00-05:00", endedAt: "2026-06-01T11:00:00-05:00" }),
      ],
      workers,
      shift,
      holidays: [],
      now: "2026-06-30T12:00:00-05:00",
      hourlyCostFallback: 20_000,
      machineIds: ["m1", "m2", "m4"],
    });

    // Solo las máquinas pedidas; m4 aparece en cero aunque no tenga sesiones, m3 no aparece.
    expect([...totals.keys()].sort()).toEqual(["m1", "m2", "m4"]);

    const m1 = totals.get("m1")!;
    expect(m1.productionMinutes).toBeCloseTo(35 + 60, 6);
    expect(m1.minutesByStage[4]).toBeCloseTo(95, 6);
    expect(m1.minutesByWorker).toEqual({ w1: expect.closeTo(35, 6), w2: expect.closeTo(60, 6) });
    expect(m1.costByWorker.w1).toBeCloseTo((1.75 * 30_000) / 3, 6);
    expect(m1.costByWorker.w2).toBeCloseTo(20_000, 6);
    expect(m1.productionCostCop).toBeCloseTo((1.75 * 30_000) / 3 + 20_000, 6);
    expect(m1.firstSessionAt).toBe("2026-06-01T08:00:00-05:00");

    expect(totals.get("m2")!.productionMinutes).toBeCloseTo(35, 6);
    expect(totals.get("m4")).toMatchObject({ productionMinutes: 0, extraMinutes: 0, firstSessionAt: null });
  });

  it("counts reprocess inside production time and also apart, by stage", () => {
    const totals = summarizeMachineLabor({
      sessions: [
        session({}),
        session({ stageId: 5, isReprocess: true, startedAt: "2026-06-02T13:00:00-05:00", endedAt: "2026-06-02T14:00:00-05:00" }),
      ],
      workers,
      shift,
      holidays: [],
      now: "2026-06-30T12:00:00-05:00",
      hourlyCostFallback: 20_000,
    });

    const m1 = totals.get("m1")!;
    expect(m1.productionMinutes).toBeCloseTo(105 + 60, 6);
    expect(m1.reprocessMinutes).toBeCloseTo(60, 6);
    expect(m1.reprocessMinutesByStage).toEqual({ 5: 60 });
    expect(m1.minutesByStage).toEqual({ 4: 105, 5: 60 });
  });

  it("keeps activities tied to a machine out of production, and ignores activities without machine", () => {
    const totals = summarizeMachineLabor({
      sessions: [
        // Empaque + Arreglar marcados a la vez sobre m1: 60 min repartidos entre las dos actividades.
        session({
          kind: "other",
          stageId: null,
          activityTypeIds: ["empaque", "arreglar"],
          startedAt: "2026-06-01T13:00:00-05:00",
          endedAt: "2026-06-01T14:00:00-05:00",
        }),
        // Sesión histórica sin tipo sobre m1 → «sin clasificar».
        session({
          kind: "other",
          stageId: null,
          note: "Instalación",
          startedAt: "2026-06-01T14:00:00-05:00",
          endedAt: "2026-06-01T14:30:00-05:00",
        }),
        // 5S sin máquina: no le toca a ninguna.
        session({ kind: "other", stageId: null, activityTypeIds: ["5s"], machineIds: [] }),
      ],
      workers,
      shift,
      holidays: [],
      now: "2026-06-30T12:00:00-05:00",
      hourlyCostFallback: 20_000,
    });

    expect([...totals.keys()]).toEqual(["m1"]);
    const m1 = totals.get("m1")!;
    expect(m1.productionMinutes).toBe(0);
    expect(m1.extraMinutes).toBeCloseTo(90, 6);
    expect(m1.extraCostCop).toBeCloseTo(1.5 * 30_000, 6);
    expect(m1.extraMinutesByActivityType).toEqual({ empaque: 30, arreglar: 30, [UNCLASSIFIED_ACTIVITY_ID]: 30 });
    expect(m1.extraCostByActivityType.empaque).toBeCloseTo(15_000, 6);
  });

  it("clips to the shift and its breaks, and an open session to now", () => {
    const totals = summarizeMachineLabor({
      sessions: [
        // 07:00-12:30: antes de las 08:00 no cuenta; pausas 09:00 (15) y 12:00 (30) fuera → 225 min.
        session({ startedAt: "2026-06-01T07:00:00-05:00", endedAt: "2026-06-01T12:30:00-05:00" }),
        // Abierta desde el martes 08:00; `now` = martes 10:00 → 105 min.
        session({ machineIds: ["m2"], startedAt: "2026-06-02T08:00:00-05:00", endedAt: null, endReason: null }),
      ],
      workers,
      shift,
      holidays: [],
      now: "2026-06-02T10:00:00-05:00",
      hourlyCostFallback: 20_000,
    });

    expect(totals.get("m1")!.productionMinutes).toBeCloseTo(225, 6);
    expect(totals.get("m2")!.productionMinutes).toBeCloseTo(105, 6);
  });
});

describe("summarizeLaborByPeriod", () => {
  const weekSessions = [
    // Ana lunes: 105 min de máquina + 60 min de 5S (sin máquina).
    session({}),
    session({
      kind: "other",
      stageId: null,
      activityTypeIds: ["5s"],
      machineIds: [],
      startedAt: "2026-06-01T13:00:00-05:00",
      endedAt: "2026-06-01T14:00:00-05:00",
    }),
    // Beto martes: 60 min de reproceso + 60 min de empaque asociado a m1.
    session({ workerId: "w2", isReprocess: true, startedAt: "2026-06-02T13:00:00-05:00", endedAt: "2026-06-02T14:00:00-05:00" }),
    session({
      workerId: "w2",
      kind: "other",
      stageId: null,
      activityTypeIds: ["empaque"],
      startedAt: "2026-06-02T14:00:00-05:00",
      endedAt: "2026-06-02T15:00:00-05:00",
    }),
  ];

  it("splits each day into assigned and unassigned, applying the absence rule per worker-day", () => {
    const rows = summarizeLaborByPeriod(periodInput(weekSessions), "dia");

    expect(rows.map((row) => row.periodKey)).toEqual(["2026-06-01", "2026-06-02"]);
    const [monday, tuesday] = rows;

    // Lunes: solo Ana registró → la jornada de Beto no cuenta (ausencia).
    expect(monday).toMatchObject({
      label: "lun 1 jun",
      startDate: "2026-06-01",
      workersWithRecords: 1,
      availableMinutes: 495,
      machineMinutes: 105,
      reprocessMinutes: 0,
      machineActivityMinutes: 0,
      plantActivityMinutes: 60,
      unregisteredMinutes: 495 - 165,
      assignedMinutes: 105,
      unassignedMinutes: 60 + 330,
      minutesByActivityType: { "5s": 60 },
    });

    expect(tuesday).toMatchObject({
      label: "mar 2 jun",
      workersWithRecords: 1,
      availableMinutes: 495,
      reprocessMinutes: 60,
      machineActivityMinutes: 60,
      unregisteredMinutes: 495 - 120,
      assignedMinutes: 120,
      unassignedMinutes: 375,
    });

    for (const row of rows) {
      expect(row.assignedMinutes + row.unassignedMinutes).toBeCloseTo(row.availableMinutes, 6);
    }
  });

  it("computes unregistered time per worker-day before adding up (over-registration does not cancel absences)", () => {
    const rows = summarizeLaborByPeriod(
      periodInput([
        // Ana con dos cronómetros simultáneos todo el lunes: 990 registrados sobre 495 de jornada.
        session({ startedAt: "2026-06-01T08:00:00-05:00", endedAt: "2026-06-01T17:00:00-05:00" }),
        session({ startedAt: "2026-06-01T08:00:00-05:00", endedAt: "2026-06-01T17:00:00-05:00", machineIds: ["m2"] }),
        // Beto solo 105 min el lunes.
        session({ workerId: "w2" }),
      ]),
      "dia",
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].availableMinutes).toBe(990);
    expect(rows[0].unregisteredMinutes).toBeCloseTo(495 - 105, 6);
  });

  it("filters to one worker", () => {
    const rows = summarizeLaborByPeriod(periodInput(weekSessions), "semana", { workerId: "w2" });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      periodKey: "2026-06-01",
      workersWithRecords: 1,
      availableMinutes: 495,
      machineMinutes: 0,
      reprocessMinutes: 60,
      plantActivityMinutes: 0,
    });
  });

  it("groups weeks from Monday to Sunday and months, in Bogota time", () => {
    const sessions = [
      // Lunes 1 jun 20:00-22:00 Bogotá = 2 jun 01:00-03:00 UTC: sigue siendo lunes 1.
      session({ startedAt: "2026-06-01T20:00:00-05:00", endedAt: "2026-06-01T22:00:00-05:00" }),
      // Domingo 7 jun: misma semana del lunes 1.
      session({ startedAt: "2026-06-07T10:00:00-05:00", endedAt: "2026-06-07T11:00:00-05:00" }),
      // Lunes 8 jun: semana nueva.
      session({ startedAt: "2026-06-08T10:00:00-05:00", endedAt: "2026-06-08T11:00:00-05:00" }),
      // Martes 30 jun 22:00-23:00 Bogotá = 1 jul en UTC: sigue siendo junio.
      session({ startedAt: "2026-06-30T22:00:00-05:00", endedAt: "2026-06-30T23:00:00-05:00" }),
      // Miércoles 1 jul.
      session({ startedAt: "2026-07-01T10:00:00-05:00", endedAt: "2026-07-01T11:00:00-05:00" }),
    ];
    const input = periodInput(sessions, { shift: lateShift });

    const days = summarizeLaborByPeriod(input, "dia");
    expect(days.map((row) => [row.periodKey, row.machineMinutes])).toEqual([
      ["2026-06-01", 120],
      ["2026-06-07", 60],
      ["2026-06-08", 60],
      ["2026-06-30", 60],
      ["2026-07-01", 60],
    ]);
    expect(days[1].label).toBe("dom 7 jun");

    const weeks = summarizeLaborByPeriod(input, "semana");
    expect(weeks.map((row) => [row.periodKey, row.label, row.machineMinutes])).toEqual([
      ["2026-06-01", "Semana del 1 jun", 180],
      ["2026-06-08", "Semana del 8 jun", 60],
      ["2026-06-29", "Semana del 29 jun", 120],
    ]);

    const months = summarizeLaborByPeriod(input, "mes");
    expect(months.map((row) => [row.periodKey, row.label, row.startDate, row.machineMinutes])).toEqual([
      ["2026-06", "Junio 2026", "2026-06-01", 300],
      ["2026-07", "Julio 2026", "2026-07-01", 60],
    ]);
    // 4 operario-días en junio con jornada larga (06:00-23:30 = 1050 min).
    expect(months[0].availableMinutes).toBe(4 * 1050);
  });

  it("clips to the range and an open session to now", () => {
    const rows = summarizeLaborByPeriod(
      periodInput(
        [
          // Fuera del rango (semana anterior).
          session({ startedAt: "2026-05-25T08:00:00-05:00", endedAt: "2026-05-25T10:00:00-05:00" }),
          // Abierta desde el lunes 08:00; now = lunes 10:00 → 105 min.
          session({ endedAt: null, endReason: null }),
        ],
        {
          range: { startIso: "2026-06-01T00:00:00-05:00", endIso: "2026-06-08T00:00:00-05:00" },
          now: "2026-06-01T10:00:00-05:00",
        },
      ),
      "dia",
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ periodKey: "2026-06-01", machineMinutes: 105, unregisteredMinutes: 390 });
  });
});
