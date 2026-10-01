"use client";

import React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { useSidebar } from "./sidebar-provider";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from "@/components/ui/tooltip";
import type { IconComponent } from "@/components/icons";

interface SidebarItemProps {
  icon?: IconComponent;
  label: string;
  href?: string;
  active?: boolean;
  target?: string;
}

export function SidebarItem({
  icon: Icon,
  label,
  href,
  active,
  target,
}: SidebarItemProps) {
  const { open } = useSidebar();
  const className = cn(
    "flex h-9 min-h-9 items-center rounded-md text-[0.8125rem] font-medium text-sidebar-foreground outline-none transition-[background-color,color] duration-150 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring/25",

    open ? "gap-2.5 px-2.5" : "justify-center px-0",
    active &&
      "bg-sidebar-primary text-sidebar-primary-foreground font-semibold hover:bg-sidebar-primary hover:text-sidebar-primary-foreground"
  );

  const content = (
    <>
      {Icon && (
        <span className="shrink-0">
          {React.createElement(Icon, { size: 16 })}
        </span>
      )}
      <span
        className={cn(
          "min-w-0 truncate transition-opacity duration-150 ease-in-out",
          !open && "w-0 opacity-0"
        )}
        title={typeof label === "string" ? label : undefined}
      >
        {label}
      </span>
    </>
  );

  const itemContent = href ? (
    <Link
      href={href}
      target={target}
      prefetch={target === "_blank" ? false : true}
      className={className}
    >
      {content}
    </Link>
  ) : (
    <div className={className}>{content}</div>
  );

  if (!open) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>{itemContent}</TooltipTrigger>
          <TooltipContent side="right">{label}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return itemContent;
}
