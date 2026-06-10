"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, CheckCircle2, ClipboardList, Factory, ListChecks, Settings, Truck, UserRound, Users } from "lucide-react";
import { AdminFlashToast } from "@/components/admin/admin-flash-toast";
import { BrandLogo } from "@/components/brand";

const navItems = [
  { href: "/admin/previos", label: "Previos", icon: ListChecks },
  { href: "/admin", label: "Producción", icon: ClipboardList, exact: true },
  { href: "/admin/terminados", label: "Terminados", icon: CheckCircle2 },
  { href: "/admin/despachados", label: "Despachados", icon: Truck },
  { href: "/admin/clientes", label: "Clientes", icon: UserRound },
  { href: "/admin/catalogo", label: "Catálogo", icon: Factory },
  { href: "/admin/operarios", label: "Operarios", icon: Users },
  { href: "/admin/estadisticas", label: "Estadísticas", icon: BarChart3 },
  { href: "/admin/configuracion", label: "Configuración", icon: Settings },
];

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-[var(--xt-paper)]">
      <AdminFlashToast />
      <header className="sticky top-0 z-30 border-b border-[var(--xt-graphite)] bg-[var(--xt-black)] text-[var(--xt-white)]">
        <div className="flex min-h-14 items-center gap-4 px-5">
          <Link href="/admin" aria-label="XTENSOR Producción" className="shrink-0">
            <BrandLogo inverse />
          </Link>
          <nav className="flex flex-1 items-center gap-0.5 overflow-x-auto">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = item.exact ? pathname === item.href : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex shrink-0 items-center gap-1.5 rounded-[2px] px-3 py-2 [font-family:var(--font-barlow-condensed)] text-sm font-bold uppercase tracking-[0.12em] transition-colors hover:bg-[var(--xt-yellow)] hover:text-[var(--xt-black)] ${isActive ? "bg-[var(--xt-yellow)] text-[var(--xt-black)]" : "text-[var(--xt-white)]/78"}`}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
        <div className="xt-hazard h-2" />
      </header>
      <main className="min-w-0 p-4 sm:p-5">{children}</main>
    </div>
  );
}
