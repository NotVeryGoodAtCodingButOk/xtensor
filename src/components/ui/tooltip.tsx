import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function CellTooltip({
  text,
  children,
  className,
  variant = "dark",
}: {
  text: string | null | undefined;
  children: ReactNode;
  className?: string;
  variant?: "dark" | "light";
}) {
  if (!text) return <>{children}</>;
  return (
    <span className={cn("group relative inline-flex min-w-0 max-w-full", className)}>
      {children}
      <span
        className={cn(
          "pointer-events-none absolute left-0 top-full z-50 mt-1 hidden min-w-max max-w-[320px] whitespace-normal break-words rounded-[2px] border px-2 py-1 text-xs leading-snug shadow-md group-hover:block",
          variant === "dark"
            ? "border-[var(--xt-black)] bg-[var(--xt-black)] text-white"
            : "border-white/30 bg-white text-[var(--xt-black)]",
        )}
      >
        {text}
      </span>
    </span>
  );
}

export function ActionTooltip({
  text,
  children,
  className,
  align = "left",
}: {
  text: string | null | undefined;
  children: ReactNode;
  className?: string;
  align?: "left" | "right" | "center";
}) {
  if (!text) return <>{children}</>;

  const alignClassName =
    align === "right"
      ? "right-0"
      : align === "center"
        ? "left-1/2 -translate-x-1/2"
        : "left-0";

  return (
    <span className={cn("group relative inline-flex", className)}>
      {children}
      <span
        className={cn(
          "pointer-events-none absolute top-full z-50 mt-1 hidden w-52 whitespace-normal rounded-[2px] border border-[var(--xt-black)] bg-[var(--xt-black)] px-2 py-1 text-xs leading-snug text-white shadow-md group-hover:block group-focus-within:block",
          alignClassName,
        )}
      >
        {text}
      </span>
    </span>
  );
}
