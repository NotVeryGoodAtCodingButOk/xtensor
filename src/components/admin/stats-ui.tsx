import type { ComponentType } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

/**
 * Shared building blocks for the admin Estadísticas surfaces (Resumen and
 * Horas-hombre): a KPI tile and a plain data table, plus the formatters both
 * pages use to render hours/percentages/currency/dates consistently.
 */

export function MetricCard({
  icon: Icon,
  eyebrow,
  title,
  value,
  detail,
  formula,
  prominent = false,
}: {
  icon: ComponentType<{ className?: string }>;
  eyebrow: string;
  title: string;
  value: string;
  detail: string;
  formula: string;
  prominent?: boolean;
}) {
  return (
    <Card className={cn(prominent && "border-[var(--xt-black)] bg-[var(--xt-yellow-soft)]")}>
      <CardHeader className="gap-3">
        <div className="flex items-center justify-between gap-3">
          <p className="xt-eyebrow">{eyebrow}</p>
          <Icon className="h-5 w-5 text-[var(--xt-steel)]" />
        </div>
        <div>
          <CardTitle className={prominent ? "text-4xl" : "text-3xl"}>{value}</CardTitle>
          <p className="mt-1 font-semibold">{title}</p>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-[var(--xt-steel)]">{detail}</p>
        <p className="mt-1 text-xs text-[var(--xt-steel)]">Función: {formula}</p>
      </CardContent>
    </Card>
  );
}

export function StatsTable({
  headers,
  rows,
  empty,
}: {
  headers: string[];
  rows: React.ReactNode[][];
  empty: string;
}) {
  if (rows.length === 0) {
    return <p className="border border-dashed border-[var(--xt-cement)] p-4 text-sm text-[var(--xt-steel)]">{empty}</p>;
  }

  return (
    <div className="overflow-x-auto border border-[var(--xt-cement)]">
      <Table>
        <TableHeader>
          <TableRow>
            {headers.map((header) => (
              <TableHead key={header}>{header}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, rowIndex) => (
            <TableRow key={rowIndex}>
              {row.map((cell, cellIndex) => (
                <TableCell key={cellIndex} className={cellIndex > 0 ? "whitespace-nowrap" : undefined}>
                  {cell}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export function formatHours(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "Sin datos";
  }
  if (value < 1) {
    return `${Math.round(value * 60)} min`;
  }

  return `${new Intl.NumberFormat("es-CO", { maximumFractionDigits: 1 }).format(value)} h`;
}

export function formatPct(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "Sin datos";
  }

  return `${new Intl.NumberFormat("es-CO", { maximumFractionDigits: 1 }).format(value)} %`;
}

export function formatCop(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value) || value === 0) {
    return "Sin datos";
  }

  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatLeadTime(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "Sin datos";
  }
  if (value < 24) {
    return formatHours(value);
  }

  const days = value / 24;
  return `${new Intl.NumberFormat("es-CO", { maximumFractionDigits: 1 }).format(days)} d`;
}

export function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("es-CO", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Bogota",
  }).format(new Date(value));
}
