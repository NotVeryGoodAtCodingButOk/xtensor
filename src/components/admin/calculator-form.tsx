"use client";

import { useMemo, useState } from "react";
import { CalendarClock, Clock, Wallet } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { formatCurrencyCop } from "@/lib/utils";
import { estimateTotalHours, type ProductionSettings } from "@/services/calculations";
import { estimateDeliveryDate, type Holiday } from "@/services/schedule";

const IVA_DIVISOR = 1.19;

const hoursFormatter = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });
const thousandsFormatter = new Intl.NumberFormat("es-CO");

function formatThousands(digits: string) {
  if (!digits) return "";
  return thousandsFormatter.format(Number(digits));
}

function formatDateLargo(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  const formatted = new Intl.DateTimeFormat("es-CO", { dateStyle: "full" }).format(date);
  return formatted.charAt(0).toUpperCase() + formatted.slice(1);
}

type Props = {
  settings: ProductionSettings;
  holidays: Holiday[];
  baseAccumulatedHours: number;
  anchorSerial: number | null;
  anchorDate: string | null;
};

export function CalculatorForm({ settings, holidays, baseAccumulatedHours, anchorSerial, anchorDate }: Props) {
  const [digits, setDigits] = useState("");

  const valorConIva = digits ? Number(digits) : 0;

  const result = useMemo(() => {
    if (!valorConIva || valorConIva <= 0) return null;
    const valorSinIva = valorConIva / IVA_DIVISOR;
    const horas = estimateTotalHours(valorSinIva, settings);
    const fecha = estimateDeliveryDate(baseAccumulatedHours + horas, new Date(), settings, holidays);
    const diasPlanta = horas / (settings.activeWorkersCount * settings.dailyHoursMonFri);
    return { valorSinIva, horas, fecha, diasPlanta };
  }, [valorConIva, settings, holidays, baseAccumulatedHours]);

  return (
    <div className="max-w-3xl">
      <div className="grid gap-4 sm:grid-cols-3">
        {/* Cajón 1 — valor con IVA */}
        <Card>
          <CardHeader>
            <p className="xt-eyebrow flex items-center gap-1.5">
              <Wallet className="h-3.5 w-3.5" />
              Valor del pedido
            </p>
            <CardTitle>Con IVA incluido</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-1.5">
              <span className="text-lg font-bold text-[var(--xt-steel)]">$</span>
              <Input
                inputMode="numeric"
                autoFocus
                placeholder="0"
                value={formatThousands(digits)}
                onChange={(event) => setDigits(event.target.value.replace(/\D/g, ""))}
                className="text-lg font-bold"
              />
            </div>
            <p className="mt-2 text-xs text-[var(--xt-steel)]">
              {result ? <>Sin IVA: {formatCurrencyCop(result.valorSinIva)}</> : "Ingresa el valor cotizado al cliente."}
            </p>
          </CardContent>
        </Card>

        {/* Cajón 2 — horas hombre */}
        <Card>
          <CardHeader>
            <p className="xt-eyebrow flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" />
              Tiempo de fabricación
            </p>
            <CardTitle>Horas hombre</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold tabular-nums">
              {result ? hoursFormatter.format(Math.round(result.horas)) : "—"}
            </p>
            <p className="mt-2 text-xs text-[var(--xt-steel)]">
              {result ? <>≈ {result.diasPlanta.toFixed(1)} días de planta ({settings.activeWorkersCount} operarios)</> : "horas hombre"}
            </p>
          </CardContent>
        </Card>

        {/* Cajón 3 — fecha estimada */}
        <Card>
          <CardHeader>
            <p className="xt-eyebrow flex items-center gap-1.5">
              <CalendarClock className="h-3.5 w-3.5" />
              Entrega estimada
            </p>
            <CardTitle>Fecha de planta</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xl font-bold leading-tight">
              {result ? formatDateLargo(result.fecha) : "—"}
            </p>
            <p className="mt-2 text-xs text-[var(--xt-steel)]">
              Fecha estimada de planta — no incluye días adicionales de margen.
            </p>
          </CardContent>
        </Card>
      </div>

      <p className="mt-4 text-sm text-[var(--xt-steel)]">
        {anchorSerial != null && anchorDate ? (
          <>
            Tu pedido entraría después de la máquina <span className="font-bold text-[var(--xt-black)]">#{anchorSerial}</span>, que termina el{" "}
            <span className="font-bold text-[var(--xt-black)]">{formatDateLargo(anchorDate)}</span>.
          </>
        ) : (
          <>No hay máquinas en producción; el cálculo parte de hoy.</>
        )}
      </p>
    </div>
  );
}
