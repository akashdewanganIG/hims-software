"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { useSidebar } from "./sidebar-provider";

export function SidebarHeader({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  const { open } = useSidebar();
  return (
    <div
      className={cn(
        "flex h-16 items-center gap-3 border-b border-sidebar-border px-4 transition-[justify-content] duration-200 ease-in-out",
        open ? "justify-between" : "justify-center",
        className
      )}
      {...props}
    />
  );
}
