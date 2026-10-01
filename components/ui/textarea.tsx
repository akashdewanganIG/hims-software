"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { controlAreaVariants } from "@/components/ui/form-control";

export type TextareaProps = React.ComponentProps<"textarea">;

function Textarea({ className, ...props }: TextareaProps) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(controlAreaVariants(), "flex min-h-24", className)}
      {...props}
    />
  );
}

export { Textarea };
