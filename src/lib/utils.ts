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

export function assertServerOnly() {
  if (typeof window !== "undefined") {
    throw new Error("Esta operación solo puede ejecutarse en el servidor.");
  }
}
