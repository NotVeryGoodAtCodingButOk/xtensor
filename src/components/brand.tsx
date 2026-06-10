import Image from "next/image";
import { cn } from "@/lib/utils";

type BrandLogoProps = {
  className?: string;
  markClassName?: string;
  inverse?: boolean;
  subtitle?: string;
};

export function BrandLogo({
  className,
  markClassName,
  inverse = false,
  subtitle = "Producción",
}: BrandLogoProps) {
  return (
    <span className={cn("xt-brand-logo inline-flex items-center gap-3", inverse && "xt-brand-logo-inverse", className)}>
      <Image
        src={inverse ? "/brand/xtensor-mark-yellow.svg" : "/brand/xtensor-mark.svg"}
        alt=""
        aria-hidden="true"
        width={36}
        height={36}
        className={cn("xt-brand-logo-mark h-9 w-9 shrink-0", markClassName)}
      />
      <span className="xt-brand-logo-text grid leading-none">
        <span className={cn("xt-brand-logo-title xt-display text-[2rem]", inverse ? "text-[var(--xt-yellow)]" : "text-[var(--xt-black)]")}>XTENSOR</span>
        {subtitle ? (
          <span
            className={cn(
              "xt-brand-logo-subtitle mt-0.5 [font-family:var(--font-barlow-condensed)] text-[0.66rem] font-bold uppercase tracking-[0.18em]",
              inverse ? "text-[var(--xt-white)]/70" : "text-[var(--xt-steel)]",
            )}
          >
            {subtitle}
          </span>
        ) : null}
      </span>
    </span>
  );
}

export function BrandStamp({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "xt-brand-stamp inline-grid h-14 w-14 place-items-center border border-[var(--xt-black)] bg-[var(--xt-yellow)] shadow-[var(--shadow-stamp)]",
        className,
      )}
    >
      <Image src="/brand/xtensor-mark.svg" alt="" aria-hidden="true" width={40} height={40} className="xt-brand-stamp-mark h-10 w-10" />
    </span>
  );
}
