"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { useSidebar } from "./sidebar-provider";

export function SidebarFooter({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  const { open } = useSidebar();
  return (
    <div
      className={cn(
        "flex min-h-12 items-center border-t border-sidebar-border py-3",
        open ? "px-4" : "px-2",
        className
      )}
      {...props}
    >
      {/* The footer holds an action now, so it stays usable when collapsed:
          centred rather than faded out. */}
      <div className={cn("w-full", !open && "flex justify-center")}>
        {children}
      </div>
    </div>
  );
}
