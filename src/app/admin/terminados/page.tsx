import type { Metadata } from "next";
import { AdminShell } from "@/components/app-shell";
import { ConfigWarning } from "@/components/config-warning";
import { TerminadosTable } from "@/components/admin/terminados-table";
import { hasSupabaseConfig } from "@/lib/env";
import { listMachines } from "@/services/machines";

export const metadata: Metadata = { title: "Terminados XTENSOR" };

export default async function TerminadosPage() {
  if (!hasSupabaseConfig()) {
    return (
      <AdminShell>
        <ConfigWarning surface="Terminados" />
      </AdminShell>
    );
  }

  const machines = await listMachines("finished");

  return (
    <AdminShell>
      <div className="mb-5">
        <p className="xt-eyebrow">Administración</p>
        <h1 className="text-3xl font-bold">Terminados</h1>
        <p className="text-sm text-[var(--xt-steel)]">
          Máquinas con todas las etapas completas, listas para despachar.
        </p>
      </div>
      <TerminadosTable machines={machines} />
    </AdminShell>
  );
}
