import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full px-2.5 py-1 [font-family:var(--font-barlow-condensed)] text-xs font-bold uppercase leading-none tracking-[0.12em]",
  {
  variants: {
    variant: {
      default: "bg-[var(--xt-black)] text-[var(--xt-yellow)]",
      success: "bg-[var(--line-bio-green)] text-[var(--xt-white)]",
      warning: "bg-[var(--xt-yellow)] text-[var(--xt-black)]",
      muted: "bg-[var(--xt-cement)] text-[var(--xt-steel)]",
      danger: "bg-[var(--line-pro-red)] text-[var(--xt-white)]",
    },
  },
  defaultVariants: {
    variant: "default",
  },
});

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn("xt-badge", `xt-badge-${variant ?? "default"}`, badgeVariants({ variant, className }))} {...props} />;
}
