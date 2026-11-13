import { revalidateTag } from "next/cache";

/**
 * Tags kept for the admin actions that already call revalidateFactoryData().
 * Note: any revalidation inside a server action also re-renders the current
 * page in the action response.
 */
const FACTORY_TAGS = {
  machines: "factory:machines",
  workers: "factory:workers",
  settings: "factory:settings",
  holidays: "factory:holidays",
} as const;

export function revalidateFactoryData() {
  for (const tag of Object.values(FACTORY_TAGS)) {
    revalidateTag(tag);
  }
}
