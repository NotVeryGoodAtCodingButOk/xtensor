import type { Metadata, Viewport } from "next";
import { ConnectionGuard } from "@/components/factory/connection-guard";

export const metadata: Metadata = {
  title: "Planta XTENSOR",
  // Para usarla como app de pantalla completa desde Safari (Compartir → Agregar a inicio):
  // así abre sin barra del navegador y con su propio almacenamiento.
  manifest: "/planta.webmanifest",
  appleWebApp: { capable: true, title: "Planta", statusBarStyle: "black" },
  icons: { apple: "/brand/planta-icon-180.png" },
};

export const viewport: Viewport = {
  themeColor: "#0a0a0a",
};

export default function PlantaLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <ConnectionGuard />
      {children}
    </>
  );
}
