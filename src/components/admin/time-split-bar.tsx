import { formatHoursDecimal, formatPct } from "@/components/admin/stats-ui";
import type { LaborByActivityType } from "@/services/labor-time";

/**
 * "¿En qué se va el tiempo?" — una sola barra apilada con el reparto entre
 * producción, reproceso y cada actividad del catálogo. Sin librería de
 * gráficas: son porcentajes de un total, y el CSS los dibuja igual de bien.
 */

export type TimeSplitSegment = {
  key: string;
  label: string;
  minutes: number;
  color: string;
};

const PRODUCTION_COLOR = "var(--xt-black)";
const REPROCESS_COLOR = "var(--line-pro-red)";

// Las actividades toman colores de la paleta de marca en orden; se repiten si
// algún día el catálogo crece más allá de la lista.
const ACTIVITY_COLORS = [
  "var(--xt-yellow-deep)",
  "var(--line-semi-cyan)",
  "var(--line-kids-orange)",
  "var(--line-bio-green)",
  "var(--xt-steel)",
  "var(--xt-aluminum)",
];

/**
 * Arma los segmentos del reparto. Las actividades llegan ya ordenadas de
 * mayor a menor por `summarizeLabor`, así que el color de cada una es estable
 * dentro de un mismo rango.
 */
export function buildTimeSplit(input: {
  machineMinutes: number;
  reprocessMinutes: number;
  activities: Array<Pick<LaborByActivityType, "activityTypeId" | "name" | "minutes">>;
}): TimeSplitSegment[] {
  return [
    { key: "produccion", label: "Producción", minutes: input.machineMinutes, color: PRODUCTION_COLOR },
    { key: "reproceso", label: "Reproceso", minutes: input.reprocessMinutes, color: REPROCESS_COLOR },
    ...input.activities.map((activity, index) => ({
      key: activity.activityTypeId,
      label: activity.name,
      minutes: activity.minutes,
      color: ACTIVITY_COLORS[index % ACTIVITY_COLORS.length],
    })),
  ].filter((segment) => segment.minutes > 0);
}

export function TimeSplitBar({ segments, empty }: { segments: TimeSplitSegment[]; empty: string }) {
  const total = segments.reduce((sum, segment) => sum + segment.minutes, 0);

  if (total <= 0) {
    return <p className="border border-dashed border-[var(--xt-cement)] p-4 text-sm text-[var(--xt-steel)]">{empty}</p>;
  }

  return (
    <div>
      <div className="flex h-9 w-full overflow-hidden border border-[var(--xt-black)]">
        {segments.map((segment) => (
          <div
            key={segment.key}
            title={`${segment.label}: ${formatHoursDecimal(segment.minutes)}`}
            style={{ flex: `0 0 ${(segment.minutes / total) * 100}%`, minWidth: "3px", backgroundColor: segment.color }}
          />
        ))}
      </div>
      <ul className="mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-2 xl:grid-cols-3">
        {segments.map((segment) => (
          <li key={segment.key} className="flex items-center gap-2 text-sm">
            <span
              aria-hidden
              className="h-3 w-3 shrink-0 border border-[var(--xt-black)]"
              style={{ backgroundColor: segment.color }}
            />
            <span className="font-semibold">{segment.label}</span>
            <span className="ml-auto whitespace-nowrap text-[var(--xt-steel)]">
              {formatHoursDecimal(segment.minutes)} · {formatPct((segment.minutes / total) * 100)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
