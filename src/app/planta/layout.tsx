import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Planta XTENSOR",
};

export default function PlantaLayout({ children }: { children: React.ReactNode }) {
  return children;
}
