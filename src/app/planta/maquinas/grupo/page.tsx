import { redirect } from "next/navigation";

/** El grupo de máquinas es una vista de /planta/piso (funciona sin conexión). */
export default async function FactoryGroupRedirect({ searchParams }: { searchParams: Promise<{ ids?: string }> }) {
  const { ids } = await searchParams;
  redirect(`/planta/piso?v=grupo&ids=${encodeURIComponent(ids ?? "")}`);
}
