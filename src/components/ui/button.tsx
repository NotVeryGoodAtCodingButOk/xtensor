import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-[2px] border border-transparent text-center [font-family:var(--font-barlow-condensed)] text-sm font-bold uppercase leading-none tracking-[0.12em] transition-[background-color,border-color,color,box-shadow,transform] duration-200 ease-[var(--ease-snap)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--xt-yellow)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--xt-paper)] disabled:pointer-events-none disabled:opacity-50 active:translate-y-px",
  {
    variants: {
      variant: {
        default:
          "bg-[var(--xt-yellow)] text-[var(--xt-black)] shadow-[var(--shadow-stamp)] hover:bg-[var(--xt-yellow-deep)] active:shadow-none",
        secondary:
          "border-[var(--xt-steel)] bg-[var(--xt-graphite)] text-[var(--xt-white)] hover:bg-[var(--xt-black)]",
        outline:
          "border-[var(--xt-black)] bg-[var(--xt-white)] text-[var(--xt-black)] hover:bg-[var(--xt-yellow-soft)]",
        ghost:
          "text-[var(--xt-black)] hover:bg-[var(--xt-yellow-soft)]",
        danger:
          "bg-[var(--line-pro-red)] text-[var(--xt-white)] hover:bg-red-800",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-8 px-3 text-xs",
        lg: "h-14 px-6 text-base",
        touch: "min-h-[60px] px-6 text-lg",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
