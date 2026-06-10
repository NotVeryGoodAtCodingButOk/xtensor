import Link from "next/link";
import { lockFactoryAction } from "@/app/planta/actions";
import { BrandLogo } from "@/components/brand";
import { Button } from "@/components/ui/button";

export function PlantaNav({ active }: { active?: "operarios" | "tablero" }) {
  const navButtonClass = "min-h-11 px-4 text-sm text-white hover:text-white";

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 bg-[var(--xt-black)] px-5 py-3 text-[var(--xt-white)]">
      <BrandLogo inverse />
      <nav className="flex flex-wrap items-center justify-end gap-2">
        <Button
          asChild
          variant={active === "operarios" ? "secondary" : "ghost"}
          size="sm"
          className={navButtonClass}
        >
          <Link href="/planta/operarios">Operarios</Link>
        </Button>
        <Button
          asChild
          variant={active === "tablero" ? "secondary" : "ghost"}
          size="sm"
          className={navButtonClass}
        >
          <Link href="/planta/tablero">Cartelera</Link>
        </Button>
        <form action={lockFactoryAction}>
          <Button
            type="submit"
            variant="outline"
            size="sm"
            className="min-h-11 border-white/30 bg-transparent px-4 text-sm text-white hover:bg-white/10 hover:text-white"
          >
            Cerrar sesión
          </Button>
        </form>
      </nav>
    </div>
  );
}
