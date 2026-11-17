import type { Metadata } from "next";
import { ConnectionLogger } from "@/components/factory/connection-logger";

export const metadata: Metadata = {
  title: "Planta XTENSOR",
};

export default function PlantaLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <ConnectionLogger />
      {children}
    </>
  );
}
