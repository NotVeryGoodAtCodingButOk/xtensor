import { redirect } from "next/navigation";

/** La lista de máquinas es una vista de /planta/piso (funciona sin conexión). */
export default async function FactoryMachinesRedirect({ searchParams }: { searchParams: Promise<{ modo?: string }> }) {
  const { modo } = await searchParams;
  redirect(`/planta/piso?v=maquinas${modo === "varias" ? "&modo=varias" : ""}`);
}
