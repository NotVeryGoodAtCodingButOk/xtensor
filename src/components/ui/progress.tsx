import { cn } from "@/lib/utils";

export function Progress({
  value,
  className,
  indicatorClassName,
}: {
  value: number;
  className?: string;
  indicatorClassName?: string;
}) {
  const width = `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%`;

  return (
    <div className={cn("h-2 w-full overflow-hidden rounded-[2px] border border-[var(--xt-black)] bg-[var(--xt-cement)]", className)}>
      <div className={cn("h-full bg-[var(--xt-yellow)] transition-all", indicatorClassName)} style={{ width }} />
    </div>
  );
}
