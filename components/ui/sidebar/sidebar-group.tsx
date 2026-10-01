"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { useSidebar } from "./sidebar-provider";

export function SidebarGroup({
  title,
  children,
  className,
}: React.HTMLAttributes<HTMLDivElement> & { title?: string }) {
  const { open } = useSidebar();
  return (
    <div
      className={cn(
        "mt-3 border-t border-sidebar-border/70 pt-3 first:mt-0 first:border-t-0 first:pt-0",
        className
      )}
    >
      {title && open && (
        <h4 className="px-3 pb-1.5 text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          {title}
        </h4>
      )}
      <div className="flex flex-col gap-1">{children}</div>
    </div>
  );
}
