import { formatLaborHours } from "@/components/admin/budget-meter";
import { DEFAULT_STAGES } from "@/services/calculations";

/**
 * Barras apiladas de Estadísticas → Tiempos máquinas / Tiempos operarios:
 * una barra por fila, partida por etapa, con el largo proporcional a las horas
 * (la fila con más horas llena el ancho). Opcionalmente una rayita negra
 * marca un tope (las horas máximas de la máquina).
 */

/** Menos de un minuto = toques de prueba, no trabajo: no se grafica. */
export const MIN_VISIBLE_HOURS = 1 / 60;

const ORDERED_STAGES = [...DEFAULT_STAGES].sort((a, b) => a.displayOrder - b.displayOrder);

/** Un color fijo por etapa, en orden de proceso (paleta validada para daltonismo). */
const STAGE_PALETTE = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#6250d6"];
export const STAGE_COLORS: Record<number, string> = Object.fromEntries(
  ORDERED_STAGES.map((stage, index) => [stage.id, STAGE_PALETTE[index]]),
);
/** Actividades sin etapa (5S, empaque, arreglos…): gris neutro para no competir con las etapas. */
export const ACTIVITY_COLOR = "#8c8c8c";

export type TimeSegment = {
  key: string;
  label: string;
  hours: number;
  color: string;
  /** Texto extra del tooltip (reproceso, desglose de actividades). */
  note?: string;
};

export type TimeBarRow = {
  id: string;
  /** Columna izquierda: serial/máquina u operario. */
  header: React.ReactNode;
  segments: TimeSegment[];
  totalHours: number;
  /** Debajo del total, p. ej. «de 38 h máx». */
  totalNote?: string;
  /** Rayita negra (horas máximas); null = sin marca. */
  markerHours?: number | null;
};

export function TimeLegend({ activities = false, marker = false }: { activities?: boolean; marker?: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
      {ORDERED_STAGES.map((stage) => (
        <LegendItem key={stage.id} color={STAGE_COLORS[stage.id]} label={stage.name} />
      ))}
      {activities ? <LegendItem color={ACTIVITY_COLOR} label="Actividades" /> : null}
      {marker ? (
        <span className="inline-flex items-center gap-1.5 text-[var(--xt-steel)]">
          <span className="h-4 w-0.5 bg-[var(--xt-black)]" aria-hidden />
          Horas máximas
        </span>
      ) : null}
    </div>
  );
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="h-3 w-3 rounded-[3px]" style={{ backgroundColor: color }} aria-hidden />
      {label}
    </span>
  );
}

export function TimeBarList({ rows, empty }: { rows: TimeBarRow[]; empty: string }) {
  if (rows.length === 0) {
    return <p className="py-6 text-center text-sm text-[var(--xt-steel)]">{empty}</p>;
  }

  const scale = Math.max(...rows.map((row) => Math.max(row.totalHours, row.markerHours ?? 0)), 0.0001);

  return (
    <ul className="divide-y divide-[var(--xt-cement)]">
      {rows.map((row) => {
        const segments = row.segments.filter((segment) => segment.hours >= MIN_VISIBLE_HOURS);
        return (
          <li key={row.id} className="grid gap-x-4 gap-y-2 py-3 md:grid-cols-[13rem_1fr_6rem] md:items-center">
            <div className="min-w-0">{row.header}</div>

            <div className="min-w-0">
              <StackedBar row={row} segments={segments} scale={scale} />
              <p className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-[var(--xt-steel)]">
                {segments.map((segment) => (
                  <span key={segment.key} className="inline-flex items-center gap-1 tabular-nums" title={segment.note}>
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: segment.color }} aria-hidden />
                    {segment.label} {formatLaborHours(segment.hours)}
                  </span>
                ))}
              </p>
            </div>

            <div className="text-sm md:text-right">
              <p className="font-bold tabular-nums">{formatLaborHours(row.totalHours)}</p>
              {row.totalNote ? <p className="text-xs text-[var(--xt-steel)] tabular-nums">{row.totalNote}</p> : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function StackedBar({ row, segments, scale }: { row: TimeBarRow; segments: TimeSegment[]; scale: number }) {
  return (
    <div className="relative h-6 w-full bg-[var(--xt-paper)]">
      <div className="flex h-full gap-[2px]" style={{ width: `${(row.totalHours / scale) * 100}%` }}>
        {segments.map((segment, index) => (
          <div
            key={segment.key}
            className="group relative h-full min-w-[3px] first:rounded-l-[2px] last:rounded-r-[4px]"
            style={{ flexGrow: segment.hours, flexBasis: 0, backgroundColor: segment.color }}
          >
            <span
              className={`pointer-events-none absolute bottom-full z-10 mb-1.5 hidden whitespace-nowrap border border-[var(--xt-black)] bg-[var(--xt-white)] px-2 py-1 text-xs shadow-[var(--shadow-sm)] group-hover:block ${
                index === segments.length - 1 && segments.length > 1 ? "right-0" : "left-0"
              }`}
            >
              <strong>{segment.label}</strong> · {formatLaborHours(segment.hours)}
              {row.totalHours > 0 ? ` · ${Math.round((segment.hours / row.totalHours) * 100)}%` : null}
              {segment.note ? ` · ${segment.note}` : null}
            </span>
          </div>
        ))}
      </div>
      {row.markerHours && row.markerHours > 0 ? (
        <div
          className="absolute -inset-y-1 w-0.5 bg-[var(--xt-black)]"
          style={{ left: `calc(${(row.markerHours / scale) * 100}% - 1px)` }}
          title={`Horas máximas: ${formatLaborHours(row.markerHours)}`}
        />
      ) : null}
    </div>
  );
}
