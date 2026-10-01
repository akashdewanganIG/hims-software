import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";
import { CONTROL_HEIGHT, CONTROL_SQUARE } from "@/components/ui/form-control";

export interface ButtonProps
  extends
    React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg text-[0.8125rem] font-medium outline-none transition-[background-color,border-color,color,box-shadow,opacity,transform] duration-150 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:ring-offset-2 focus-visible:ring-offset-background aria-invalid:border-destructive aria-invalid:ring-destructive/20",
  {
    variants: {
      variant: {
        default:
          "btn-dimensional relative overflow-hidden border border-primary/80 bg-primary text-primary-foreground hover:bg-primary/95",
        destructive:
          "btn-dimensional relative overflow-hidden border border-destructive/80 bg-destructive text-destructive-foreground hover:bg-destructive/95 focus-visible:ring-destructive/20",
        success:
          "btn-dimensional relative overflow-hidden border border-success/80 bg-success text-success-on hover:bg-success/95",

        outline:
          "border border-input bg-surface text-foreground hover:border-border-strong hover:bg-surface-subtle",
        secondary:
          "border border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/70",
        ghost:
          "border border-transparent hover:bg-secondary hover:text-foreground",

        link: "text-primary hover:text-info",

        raised: [
          "btn-raised relative overflow-hidden",
          "border border-primary/80 bg-primary text-primary-foreground",
          "hover:bg-primary/95",
        ].join(" "),

        cardAction: [
          "btn-raised relative overflow-hidden",
          "border border-primary/80 bg-primary text-primary-foreground",
          "hover:bg-primary/95",
        ].join(" "),
      },

      size: {
        default: `${CONTROL_HEIGHT.md} px-3 has-[>svg]:px-2.5`,
        sm: `${CONTROL_HEIGHT.sm} gap-1.5 px-2.5 has-[>svg]:px-2`,
        lg: `${CONTROL_HEIGHT.lg} px-4 text-sm has-[>svg]:px-3.5`,

        card: "h-8 w-full px-3 text-[0.8125rem] has-[>svg]:px-2.5",
        icon: CONTROL_SQUARE.md,
        "icon-sm": CONTROL_SQUARE.sm,
        "icon-lg": CONTROL_SQUARE.lg,
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot : "button";

  return (
    <Comp
      data-slot="button"
      suppressHydrationWarning={true}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
