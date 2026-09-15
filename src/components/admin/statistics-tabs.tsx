import Link from "next/link";
import { cn } from "@/lib/utils";

const TABS = [
  { key: "resumen" as const, href: "/admin/estadisticas", label: "Resumen" },
  { key: "horas" as const, href: "/admin/estadisticas/horas", label: "Horas-hombre" },
];

/** Shared tab strip for the two admin Estadísticas pages (Resumen / Horas-hombre). */
export function StatisticsTabs({ active }: { active: "resumen" | "horas" }) {
  return (
    <div className="mb-5 flex gap-1 border-b border-[var(--xt-black)]">
      {TABS.map((tab) => (
        <Link
          key={tab.key}
          href={tab.href}
          className={cn(
            "border-b-[3px] px-3 py-2 [font-family:var(--font-barlow-condensed)] text-sm font-bold uppercase tracking-[0.12em] transition-colors",
            tab.key === active
              ? "border-[var(--xt-yellow)] text-[var(--xt-black)]"
              : "border-transparent text-[var(--xt-steel)] hover:text-[var(--xt-black)]",
          )}
        >
          {tab.label}
        </Link>
      ))}
    </div>
  );
}
