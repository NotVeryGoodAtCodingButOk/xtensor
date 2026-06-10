import * as React from "react";
import { cn } from "@/lib/utils";

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "xt-card rounded-none border border-[var(--xt-cement)] bg-[var(--xt-white)] text-[var(--xt-black)] shadow-[var(--shadow-sm)]",
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("xt-card-header flex flex-col gap-1.5 border-b border-[var(--xt-cement)] p-5", className)} {...props} />;
}

export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3
      className={cn(
        "[font-family:var(--font-barlow-condensed)] text-2xl font-bold leading-none tracking-normal",
        "xt-card-title",
        className,
      )}
      {...props}
    />
  );
}

export function CardDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("xt-card-description text-sm text-[var(--xt-steel)]", className)} {...props} />;
}

export function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("xt-card-content p-5 pt-0", className)} {...props} />;
}
