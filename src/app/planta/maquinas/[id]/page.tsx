import { redirect } from "next/navigation";

/** El detalle de máquina es una vista de /planta/piso (funciona sin conexión). */
export default async function FactoryMachineRedirect({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/planta/piso?v=maquina&id=${encodeURIComponent(id)}`);
}
