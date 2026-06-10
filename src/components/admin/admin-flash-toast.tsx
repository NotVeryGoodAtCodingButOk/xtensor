"use client";

import { useSearchParams } from "next/navigation";
import { QueryToast } from "@/components/ui/query-toast";

function buildAdminToast(toastCode: string | null, count: number) {
  const total = Number.isFinite(count) && count > 0 ? count : 1;
  const plural = total !== 1;

  switch (toastCode) {
    case "sent-production":
      return {
        message: plural ? `${total} máquinas enviadas a producción` : "Máquina enviada a producción",
      };
    case "sent-previos":
      return {
        message: plural ? `${total} máquinas enviadas a previos` : "Máquina enviada a previos",
      };
    case "shipped":
      return {
        message: plural ? `${total} máquinas despachadas` : "Máquina despachada",
        description: plural ? "Máquinas llevadas al historial." : "Máquina llevada al historial.",
      };
    case "finished":
      return {
        message: "Máquina terminada",
        description: "Todas las etapas quedaron hechas.",
      };
    case "reproceso":
      return {
        message: "Máquina enviada a reproceso",
        description: "La máquina volvió a producción.",
      };
    default:
      return null;
  }
}

export function AdminFlashToast() {
  const searchParams = useSearchParams();
  const toastCode = searchParams.get("toast");
  const count = Number(searchParams.get("count") ?? "1");
  const toast = buildAdminToast(toastCode, count);

  return (
    <QueryToast
      message={toast?.message}
      description={toast?.description}
      clearKeys={["toast", "count"]}
    />
  );
}
