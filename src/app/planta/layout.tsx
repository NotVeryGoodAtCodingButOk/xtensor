import type { Metadata } from "next";
import { ConnectionGuard } from "@/components/factory/connection-guard";

export const metadata: Metadata = {
  title: "Planta XTENSOR",
};

export default function PlantaLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <ConnectionGuard />
      {children}
    </>
  );
}
