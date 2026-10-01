import * as React from "react";
import { cn } from "@/lib/utils";

export function SidebarContent({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("min-h-0 flex-1 overflow-y-auto px-3 py-3", className)}
      {...props}
    />
  );
}
