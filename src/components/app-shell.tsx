import Link from "next/link";
import { ClipboardList, Factory, LogOut, Palette, Settings, Truck, UserRound, Users } from "lucide-react";
import { signOutAction } from "@/app/admin/actions";
import { BrandLogo } from "@/components/brand";
import { Button } from "@/components/ui/button";

const navItems = [
  { href: "/admin", label: "Producción", icon: ClipboardList },
  { href: "/admin/catalogo", label: "Catálogo", icon: Factory },
  { href: "/admin/operarios", label: "Operarios", icon: Users },
  { href: "/admin/clientes", label: "Clientes", icon: UserRound },
  { href: "/admin/colores", label: "Colores", icon: Palette },
  { href: "/admin/despachados", label: "Despachados", icon: Truck },
  { href: "/admin/configuracion", label: "Configuración", icon: Settings },
];

export function AdminShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[var(--xt-paper)]">
      <header className="sticky top-0 z-30 border-b border-[var(--xt-graphite)] bg-[var(--xt-black)] text-[var(--xt-white)]">
        <div className="flex min-h-16 items-center justify-between gap-4 px-5 py-3">
          <Link href="/admin" aria-label="XTENSOR Producción">
            <BrandLogo inverse />
          </Link>
          <form action={signOutAction}>
            <Button type="submit" variant="outline" size="sm">
              <LogOut className="h-4 w-4" />
              Cerrar sesión
            </Button>
          </form>
        </div>
        <div className="xt-hazard h-2" />
      </header>
      <div className="grid min-h-[calc(100vh-72px)] lg:grid-cols-[240px_1fr]">
        <aside className="border-b border-[var(--xt-graphite)] bg-[var(--xt-ink)] p-3 text-[var(--xt-white)] lg:border-b-0 lg:border-r">
          <nav className="grid gap-1 sm:grid-cols-2 lg:grid-cols-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="flex items-center gap-2 rounded-[2px] px-3 py-2 [font-family:var(--font-barlow-condensed)] text-sm font-bold uppercase tracking-[0.12em] text-[var(--xt-white)]/78 transition-colors hover:bg-[var(--xt-yellow)] hover:text-[var(--xt-black)]"
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </aside>
        <main className="min-w-0 p-4 sm:p-5">{children}</main>
      </div>
    </div>
  );
}
