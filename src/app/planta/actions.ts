"use server";

import { redirect } from "next/navigation";
import { clearFactorySession, setFactoryUnlocked } from "@/lib/factory-session";
import { verifyFactoryPassword } from "@/services/settings";

/*
 * Lo que registra el operario (sesiones, etapas, almacén) ya no pasa por
 * server actions: va por la bandeja de salida del iPad a
 * POST /planta/api/piso/sync, para funcionar sin conexión (ver src/lib/floor).
 * Aquí solo queda abrir y cerrar la planta, que necesitan red.
 */

export async function unlockFactoryAction(formData: FormData) {
  const password = String(formData.get("password") ?? "");

  if (!password || !(await verifyFactoryPassword(password))) {
    redirect("/planta?error=clave");
  }

  await setFactoryUnlocked();
  redirect("/planta/piso");
}

export async function lockFactoryAction() {
  await clearFactorySession();
  redirect("/planta");
}
