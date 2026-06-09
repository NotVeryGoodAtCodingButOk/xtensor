import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = { title: "Colores XTENSOR" };

export default async function ColorsPage() {
  redirect("/admin/configuracion#colores");
}
