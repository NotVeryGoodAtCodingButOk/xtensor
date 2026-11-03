import { cn } from "@/lib/utils";
import type { MachineLaborSnapshot } from "@/types/labor-report";

/**
 * Celda «Horas» de la cartelera: horas llevadas contra las horas máximas de
 * la máquina. En curso muestra «42 / 60 h» con una barra delgada de consumo;
 * terminada, «Terminó en 58 h de 60». El color sigue el estado del
 * presupuesto: ok (normal), riesgo (amarillo) y excedida (rojo).
 */
export function BoardHoursCell({ labor }: { labor: MachineLaborSnapshot | undefined }) {
  if (!labor || !(labor.budgetHours > 0)) {
    return <p className="xt-board-hours xt-board-hours-empty">—</p>;
  }

  const spent = formatBoardHours(labor.spentHours);
  const budget = formatBoardHours(labor.budgetHours);
  const statusClass = `xt-board-hours-${labor.status}`;

  if (labor.isFinal) {
    return (
      <p className={cn("xt-board-hours xt-board-hours-final", statusClass)}>
        Terminó en {spent} h de {budget}
      </p>
    );
  }

  const consumed = labor.spentHours / labor.budgetHours;
  const fillWidth = `${Math.round(Math.min(1, Math.max(0, consumed)) * 100)}%`;

  return (
    <div className={cn("xt-board-hours", statusClass)}>
      <p className="xt-board-hours-text">
        {spent} / {budget} h
      </p>
      <div className={cn("xt-board-hours-track", consumed > 1 && "xt-board-hours-track-over")} aria-hidden="true">
        <div className="xt-board-hours-fill" style={{ width: fillWidth }} />
      </div>
    </div>
  );
}

const hoursWithDecimal = new Intl.NumberFormat("es-CO", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const wholeHours = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });

/** Horas enteras; menos de 10 h llevan un decimal (8,5). Cero se muestra como «0». */
export function formatBoardHours(hours: number): string {
  const value = Number.isFinite(hours) ? Math.max(0, hours) : 0;
  if (value === 0) return "0";
  const tenths = Math.round(value * 10) / 10;
  return tenths < 10 ? hoursWithDecimal.format(tenths) : wholeHours.format(value);
}
