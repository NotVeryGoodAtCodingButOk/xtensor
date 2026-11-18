"use client";

import type { ReactNode } from "react";
import { lockFactoryAction } from "@/app/planta/actions";
import { BrandLogo } from "@/components/brand";
import { Button } from "@/components/ui/button";

const NAV_BUTTON = "xt-planta-nav-button min-h-11 px-4 text-sm text-white hover:text-white hover:bg-white/20";

/**
 * "Cerrar sesión" necesita red (borra la cookie de planta en el servidor) y no
 * se permite con registros sin enviar, para que nadie bloquee el iPad con
 * trabajo pendiente adentro.
 */
function LockButton({ online, pendingCount }: { online: boolean; pendingCount: number }) {
  const blocked = !online || pendingCount > 0;
  return (
    <form action={lockFactoryAction}>
      <Button
        type="submit"
        variant="outline"
        size="sm"
        disabled={blocked}
        title={
          !online
            ? "Necesita conexión"
            : pendingCount > 0
              ? `Hay ${pendingCount} registros sin enviar`
              : undefined
        }
        className="xt-planta-nav-button min-h-11 border-white/30 bg-transparent px-4 text-sm text-white hover:bg-white/10 hover:text-white"
      >
        Cerrar sesión
      </Button>
    </form>
  );
}

/** La cartelera es otra página (del servidor): sin red no abre. */
function CarteleraLink({ online }: { online: boolean }) {
  if (!online) {
    return (
      <Button type="button" variant="ghost" size="sm" disabled title="Necesita conexión" className={NAV_BUTTON}>
        Cartelera
      </Button>
    );
  }
  return (
    <Button asChild variant="ghost" size="sm" className={NAV_BUTTON}>
      <a href="/planta/tablero">Cartelera</a>
    </Button>
  );
}

/** Encabezado negro de operarios y almacén. */
export function FloorNavHeader({
  active,
  online,
  pendingCount,
  onOperarios,
  onAlmacen,
}: {
  active: "operarios" | "almacen";
  online: boolean;
  pendingCount: number;
  onOperarios: () => void;
  onAlmacen: () => void;
}) {
  return (
    <header className="xt-planta-topbar border-b border-[var(--xt-graphite)] bg-[var(--xt-black)]">
      <div className="xt-planta-nav flex flex-wrap items-center justify-between gap-3 bg-[var(--xt-black)] px-5 py-3 text-[var(--xt-white)]">
        <BrandLogo inverse />
        <nav className="xt-planta-nav-links flex flex-wrap items-center justify-end gap-2">
          <Button
            type="button"
            variant={active === "operarios" ? "secondary" : "ghost"}
            size="sm"
            className={NAV_BUTTON}
            onClick={onOperarios}
          >
            Operarios
          </Button>
          <CarteleraLink online={online} />
          <Button
            type="button"
            variant={active === "almacen" ? "secondary" : "ghost"}
            size="sm"
            className={NAV_BUTTON}
            onClick={onAlmacen}
          >
            Almacén
          </Button>
          <LockButton online={online} pendingCount={pendingCount} />
        </nav>
      </div>
      <div className="xt-hazard h-2" />
    </header>
  );
}

/** Encabezado con el color del operario activo (lista de máquinas, máquina y grupo). */
export function FloorWorkerHeader({
  workerName,
  workerColor,
  online,
  pendingCount,
  onOperarios,
  onChangeWorker,
  onBack,
  actions,
  children,
}: {
  workerName: string;
  workerColor: string | null;
  online: boolean;
  pendingCount: number;
  onOperarios: () => void;
  /** Solo en la lista: vuelve al selector sin operario. */
  onChangeWorker?: () => void;
  /** En máquina y grupo: vuelve a la lista. */
  onBack?: () => void;
  /** Botones extra (p. ej. Actividades). */
  actions?: ReactNode;
  /** Debajo de la franja de peligro (datos de la máquina o del grupo). */
  children?: ReactNode;
}) {
  const background = `linear-gradient(rgba(10, 10, 10, 0.42), rgba(10, 10, 10, 0.42)), ${workerColor ?? "var(--xt-black)"}`;

  return (
    <header
      className={
        onBack
          ? "xt-machine-detail-header mb-3 border-b border-[var(--xt-black)]"
          : "xt-planta-worker-header sticky top-0 z-10 border-b border-[var(--xt-graphite)]"
      }
    >
      <div
        className="xt-planta-worker-bar flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-[var(--xt-white)]"
        style={{ background }}
      >
        <div className="xt-planta-worker-identity flex min-w-0 items-center gap-4">
          <BrandLogo inverse />
          <div className="xt-planta-worker-name-wrap min-w-0 border-l border-white/40 pl-4">
            <p className="xt-eyebrow xt-eyebrow-light leading-none mb-0.5">Operario activo</p>
            <h1 className="xt-planta-worker-name truncate text-lg font-bold leading-none">{workerName}</h1>
          </div>
        </div>
        <nav className="xt-planta-worker-nav flex w-full flex-wrap items-center gap-2 lg:w-auto lg:justify-end">
          <Button type="button" variant="ghost" size="sm" className={NAV_BUTTON} onClick={onOperarios}>
            Operarios
          </Button>
          <CarteleraLink online={online} />
          {actions}
          {onChangeWorker ? (
            <Button type="button" variant="ghost" size="sm" className={NAV_BUTTON} onClick={onChangeWorker}>
              Cambiar operario
            </Button>
          ) : null}
          {onBack ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onBack}
              className="xt-planta-back-button min-h-11 border-[var(--xt-black)] bg-[var(--xt-yellow)] px-4 text-sm text-[var(--xt-black)] hover:bg-[var(--xt-yellow-deep)]"
            >
              Volver a máquinas
            </Button>
          ) : (
            <LockButton online={online} pendingCount={pendingCount} />
          )}
        </nav>
      </div>
      <div className="xt-hazard h-2" />
      {children}
    </header>
  );
}
