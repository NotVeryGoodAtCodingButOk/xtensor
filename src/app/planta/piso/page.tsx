import { redirect } from "next/navigation";
import { ConfigWarning } from "@/components/config-warning";
import { FloorApp } from "@/components/floor/floor-app";
import { hasFactoryConfig } from "@/lib/env";
import { isFactoryUnlocked } from "@/lib/factory-session";

/**
 * La app de planta (operarios, máquinas, registro y almacén) en una sola
 * página de cliente que funciona sin conexión. El HTML no lleva datos: así el
 * service worker puede guardarlo y abrirlo sin red; los datos llegan por
 * /planta/api/piso y quedan en el iPad.
 */
export default async function FloorPage() {
  if (!hasFactoryConfig()) {
    return (
      <main className="grid min-h-screen place-items-center bg-[var(--xt-paper)] p-6">
        <ConfigWarning surface="La planta" />
      </main>
    );
  }

  if (!(await isFactoryUnlocked())) {
    redirect("/planta");
  }

  return <FloorApp />;
}
