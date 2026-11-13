import { addDays, format, isSameDay, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import type { ProductionSettings } from "@/services/calculations";

export type Holiday = {
  date: string;
  name: string;
  isCustom: boolean;
};

export type CapacityDay = {
  date: string;
  plantHours: number;
  cumulativeHours: number;
};

export function buildLaborCalendar(
  startDate: Date,
  settings: ProductionSettings,
  holidays: Holiday[] = [],
  days = 180,
) {
  const holidayDates = new Set(holidays.map((holiday) => holiday.date));
  const calendar: CapacityDay[] = [];
  let cumulativeHours = 0;

  for (let offset = 0; offset < days; offset += 1) {
    const date = addDays(startDate, offset);
    const dateKey = toDateKey(date);
    const day = date.getDay();
    const personHours = holidayDates.has(dateKey)
      ? 0
      : day === 0
        ? settings.dailyHoursSun
        : day === 6
          ? settings.dailyHoursSat
          : day === 5
            ? settings.dailyHoursFri
            : settings.dailyHoursMonFri;
    const plantHours = personHours * settings.activeWorkersCount;
    cumulativeHours += plantHours;

    calendar.push({
      date: dateKey,
      plantHours,
      cumulativeHours,
    });
  }

  return calendar;
}

export function estimateDeliveryDate(
  accumulatedHours: number,
  startDate: Date,
  settings: ProductionSettings,
  holidays: Holiday[] = [],
) {
  return createDeliveryDateEstimator(startDate, settings, holidays)(accumulatedHours);
}

const MAX_CALENDAR_DAYS = 730;

/**
 * Same result as estimateDeliveryDate, but the labor calendar is built once
 * and reused for every call. Use it when estimating a whole queue: before,
 * each machine rebuilt its own 180–720-day calendar.
 */
export function createDeliveryDateEstimator(
  startDate: Date,
  settings: ProductionSettings,
  holidays: Holiday[] = [],
) {
  let calendar: CapacityDay[] = [];

  return (accumulatedHours: number) => {
    if (accumulatedHours <= 0) {
      return toDateKey(startDate);
    }

    // 180 → 360 → 720 days, like the original loop. The calendar only grows
    // and its first days never change, so the first match is the same.
    for (let days = 180; days <= MAX_CALENDAR_DAYS; days *= 2) {
      if (calendar.length < days) {
        calendar = buildLaborCalendar(startDate, settings, holidays, days);
      }
      const deliveryDay = calendar.find((day) => day.cumulativeHours >= accumulatedHours);
      if (deliveryDay) {
        return deliveryDay.date;
      }
    }

    throw new Error("No se pudo calcular la fecha actualizada con el calendario disponible.");
  };
}

export function addClientBuffer(internalDate: string, bufferDays: number) {
  return toDateKey(addDays(parseISO(internalDate), bufferDays));
}

export function formatDateEs(date: string | Date) {
  const parsed = typeof date === "string" ? parseISO(date) : date;
  return format(parsed, "d MMM yyyy", { locale: es });
}

export function formatDateEsNoYear(date: string | Date) {
  const parsed = typeof date === "string" ? parseISO(date) : date;
  const str = format(parsed, "d MMM", { locale: es });
  return str.replace(/\b([a-z])/, (c) => c.toUpperCase());
}

export function toDateKey(date: Date) {
  return format(date, "yyyy-MM-dd");
}

export function isDateHoliday(date: Date, holidays: Holiday[]) {
  const dateKey = toDateKey(date);
  return holidays.some((holiday) => isSameDay(parseISO(holiday.date), parseISO(dateKey)));
}
