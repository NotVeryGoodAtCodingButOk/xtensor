import { addDays, format, isSameDay, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import Holidays from "date-holidays";
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
  if (accumulatedHours <= 0) {
    return toDateKey(startDate);
  }

  let days = 180;

  while (days <= 730) {
    const calendar = buildLaborCalendar(startDate, settings, holidays, days);
    const deliveryDay = calendar.find((day) => day.cumulativeHours >= accumulatedHours);
    if (deliveryDay) {
      return deliveryDay.date;
    }
    days *= 2;
  }

  throw new Error("No se pudo calcular la fecha estimada con el calendario disponible.");
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

export function seedColombiaHolidays(year: number) {
  const holidays = new Holidays("CO");

  return holidays.getHolidays(year).map<Holiday>((holiday) => ({
    date: toDateKey(new Date(holiday.date)),
    name: holiday.name,
    isCustom: false,
  }));
}

export function toDateKey(date: Date) {
  return format(date, "yyyy-MM-dd");
}

export function isDateHoliday(date: Date, holidays: Holiday[]) {
  const dateKey = toDateKey(date);
  return holidays.some((holiday) => isSameDay(parseISO(holiday.date), parseISO(dateKey)));
}
