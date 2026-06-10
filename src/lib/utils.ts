import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrencyCop(value: number | null | undefined) {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(value ?? 0);
}

export function formatPercent(value: number | null | undefined) {
  return new Intl.NumberFormat("es-CO", {
    style: "percent",
    maximumFractionDigits: 0,
  }).format(value ?? 0);
}

export function formatDecimalInput(value: number | null | undefined, fractionDigits = 2) {
  if (value == null || !Number.isFinite(value)) return "";
  return value.toFixed(fractionDigits);
}

export function roundToFractionDigits(value: number | null | undefined, fractionDigits = 2) {
  if (value == null || !Number.isFinite(value)) return null;
  const factor = 10 ** fractionDigits;
  return Math.round(value * factor) / factor;
}

export function assertServerOnly() {
  if (typeof window !== "undefined") {
    throw new Error("Esta operación solo puede ejecutarse en el servidor.");
  }
}
