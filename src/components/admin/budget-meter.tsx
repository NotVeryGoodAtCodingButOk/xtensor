import { formatHoursDecimal, formatPct } from "@/components/admin/stats-ui";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { BudgetStatus } from "@/types/labor-report";

/**
 * Presupuesto de horas de una máquina: llevadas vs. máximo. Colores del
 * contrato: ok = normal, riesgo = --xt-yellow-deep, excedida = --line-pro-red.
 * Sin librería de gráficas: una barra CSS como time-split-bar.
 */

export const BUDGET_STATUS_LABEL: Record<BudgetStatus, string> = {
  ok: "Dentro del máximo",
  riesgo: "En riesgo",
  excedida: "Excedida",
};

const BUDGET_STATUS_FILL: Record<BudgetStatus, string> = {
  ok: "var(--xt-black)",
  riesgo: "var(--xt-yellow-deep)",
  excedida: "var(--line-pro-red)",
};

/** Horas decimales → "42,5 h" (mismo formato de una cifra que Horas-hombre). */
export function formatLaborHours(hours: number | null | undefined) {
  return formatHoursDecimal(hours === null || hours === undefined ? hours : hours * 60);
}

/**
 * Cifra de horas para celdas de tabla. En riesgo o excedida va sobre un
 * fondo del color del estado (el amarillo como texto no se lee sobre blanco).
 */
export function BudgetHoursText({
  hours,
  status,
  text,
  title,
  className,
}: {
  hours: number;
  status: BudgetStatus;
  /** Texto a mostrar en vez de formatLaborHours(hours) (p. ej. "42.5" en la tabla densa). */
  text?: string;
  title?: string;
  className?: string;
}) {
  return (
    <span
      title={title ?? (status === "ok" ? undefined : BUDGET_STATUS_LABEL[status])}
      className={cn(
        "tabular-nums",
        status === "riesgo" && "rounded-[2px] bg-[var(--xt-yellow-deep)] px-1 font-semibold text-[var(--xt-black)]",
        status === "excedida" && "rounded-[2px] bg-[var(--line-pro-red)] px-1 font-semibold text-[var(--xt-white)]",
        className,
      )}
    >
      {text ?? formatLaborHours(hours)}
    </span>
  );
}

/** «En riesgo» / «Excedida»; nada cuando va bien. */
export function BudgetStatusBadge({ status, className }: { status: BudgetStatus; className?: string }) {
  if (status === "riesgo") {
    return <Badge className={cn("bg-[var(--xt-yellow-deep)] text-[var(--xt-black)]", className)}>En riesgo</Badge>;
  }
  if (status === "excedida") {
    return (
      <Badge variant="danger" className={className}>
        Excedida
      </Badge>
    );
  }
  return null;
}

export function BudgetMeter({
  budgetHours,
  spentHours,
  status,
  isFinal = false,
}: {
  budgetHours: number;
  spentHours: number;
  status: BudgetStatus;
  /** La máquina ya terminó: las llevadas son las horas finales. */
  isFinal?: boolean;
}) {
  const hasBudget = budgetHours > 0;
  const scale = Math.max(budgetHours, spentHours);
  const fillPct = scale > 0 ? (spentHours / scale) * 100 : 0;
  const budgetMarkPct = scale > 0 ? (budgetHours / scale) * 100 : 0;
  const over = hasBudget && spentHours > budgetHours;
  const spentLabel = isFinal ? "H. finales" : "H. llevadas";

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="xt-eyebrow">{spentLabel}</p>
          <p
            className={cn(
              "[font-family:var(--font-barlow-condensed)] text-4xl font-bold leading-none tabular-nums",
              over && "text-[var(--line-pro-red)]",
            )}
          >
            {formatLaborHours(spentHours)}
          </p>
        </div>
        <div className="text-right">
          <p className="xt-eyebrow" title="Horas máximas = venta × % MO del equipo ÷ costo hora promedio">
            H. máx
          </p>
          <p className="[font-family:var(--font-barlow-condensed)] text-2xl font-bold leading-none tabular-nums">
            {hasBudget ? formatLaborHours(budgetHours) : "Sin datos"}
          </p>
        </div>
      </div>

      <div
        className="relative h-6 w-full overflow-hidden border border-[var(--xt-black)] bg-[var(--xt-cement)]"
        role="img"
        aria-label={`${spentLabel}: ${formatLaborHours(spentHours)} de ${formatLaborHours(budgetHours)}`}
      >
        <div className="h-full" style={{ width: `${fillPct}%`, backgroundColor: BUDGET_STATUS_FILL[status] }} />
        {over ? (
          <div
            className="absolute inset-y-0 w-[3px] bg-[var(--xt-black)]"
            style={{ left: `calc(${budgetMarkPct}% - 1px)` }}
            title={`H. máx: ${formatLaborHours(budgetHours)}`}
          />
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-3 text-sm">
        {hasBudget ? (
          <span>
            <span className="text-[var(--xt-steel)]">% consumido:</span>{" "}
            <strong className="tabular-nums">{formatPct((spentHours / budgetHours) * 100)}</strong>
          </span>
        ) : (
          <span className="text-[var(--xt-steel)]">Sin horas máximas: la máquina no tiene venta registrada.</span>
        )}
        <BudgetStatusBadge status={status} />
        {over ? (
          <span className="font-semibold text-[var(--line-pro-red)]">
            {formatLaborHours(spentHours - budgetHours)} por encima del máximo
          </span>
        ) : hasBudget && isFinal ? (
          <span className="text-[var(--xt-steel)]">
            Terminó en {formatLaborHours(spentHours)} de {formatLaborHours(budgetHours)}
          </span>
        ) : hasBudget ? (
          <span className="text-[var(--xt-steel)]">Quedan {formatLaborHours(budgetHours - spentHours)}</span>
        ) : null}
      </div>
    </div>
  );
}
