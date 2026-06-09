import { revalidateTag, unstable_cache } from "next/cache";
import { calculateMachines, listMachines } from "@/services/machines";
import { listHolidays, listWorkers } from "@/services/catalog";
import { getSettings, mapSettings } from "@/services/settings";

const FACTORY_TAGS = {
  machines: "factory:machines",
  workers: "factory:workers",
  settings: "factory:settings",
  holidays: "factory:holidays",
} as const;

const getFactorySharedDataCached = unstable_cache(
  async (todayKey: string) => {
    const [settingsRow, holidays, workers, machines] = await Promise.all([
      getSettings(),
      listHolidays(),
      listWorkers(true),
      listMachines("in_production"),
    ]);

    return {
      settingsRow,
      holidays,
      workers,
      machines: calculateMachines(machines, mapSettings(settingsRow), holidays, new Date(`${todayKey}T12:00:00.000Z`)),
    };
  },
  ["factory-shared-data"],
  {
    tags: Object.values(FACTORY_TAGS),
  },
);

export async function getFactorySharedData() {
  return getFactorySharedDataCached(new Date().toISOString().slice(0, 10));
}

export function revalidateFactoryData() {
  for (const tag of Object.values(FACTORY_TAGS)) {
    revalidateTag(tag);
  }
}
