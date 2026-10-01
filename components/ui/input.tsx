import * as React from "react";

import { cn } from "@/lib/utils";
import {
  controlVariants,
  type ControlSize,
} from "@/components/ui/form-control";

export interface InputProps extends Omit<
  React.ComponentProps<"input">,
  "size"
> {
  size?: ControlSize;
}

function Input({ className, type, size, ...props }: InputProps) {
  return (
    <input
      type={type}
      data-slot="input"
      suppressHydrationWarning={true}
      className={cn(
        controlVariants({ size }),
        "file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground selection:bg-primary selection:text-primary-foreground",
        className
      )}
      {...props}
    />
  );
}

export { Input };
