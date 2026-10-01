"use client";

import React, { useEffect, useId } from "react";
import { cn } from "@/lib/utils";
import { ChevronDown } from "@/components/icons";
import { useSidebar } from "./sidebar-provider";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from "@/components/ui/tooltip";
import type { IconComponent } from "@/components/icons";

interface SidebarCollapsibleItemProps {
  icon?: IconComponent;
  label: string;
  children: React.ReactNode;
  active?: boolean;

  defaultOpen?: boolean;

  groupId?: string;
  className?: string;
}

export function SidebarCollapsibleItem({
  icon: Icon,
  label,
  children,
  active = false,
  defaultOpen = false,
  groupId,
  className,
}: SidebarCollapsibleItemProps) {
  const {
    open: sidebarOpen,
    openGroup,
    toggleGroup,
    revealGroup,
  } = useSidebar();

  const id = groupId ?? label;
  const isOpen = sidebarOpen && openGroup === id;
  const panelId = `${useId()}-panel`;

  useEffect(() => {
    if (defaultOpen) revealGroup(id);
  }, [defaultOpen, id, revealGroup]);

  const buttonContent = (
    <button
      type="button"
      onClick={() => toggleGroup(id)}
      className={cn(
        "flex h-9 min-h-9 w-full items-center gap-2.5 rounded-md text-[0.8125rem] font-medium text-sidebar-foreground outline-none transition-[background-color,color] duration-150 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring/25",

        sidebarOpen ? "justify-between px-2.5" : "justify-center px-0",
        active &&
          "bg-sidebar-primary text-sidebar-primary-foreground font-semibold hover:bg-sidebar-primary hover:text-sidebar-primary-foreground"
      )}
      aria-expanded={isOpen}
      aria-controls={sidebarOpen ? panelId : undefined}
    >
      <div
        className={cn("flex min-w-0 items-center", sidebarOpen && "gap-2.5")}
      >
        {Icon && (
          <span className="flex-shrink-0">
            {React.createElement(Icon, { size: 16 })}
          </span>
        )}
        <span
          className={cn(
            "min-w-0 truncate transition-opacity duration-150 ease-in-out",
            !sidebarOpen && "w-0 opacity-0"
          )}
          title={typeof label === "string" ? label : undefined}
        >
          {label}
        </span>
      </div>
      {sidebarOpen && (
        <ChevronDown
          aria-hidden="true"
          size={14}
          className={cn(
            "ml-1 shrink-0 text-muted-foreground transition-transform duration-200 ease-out",
            isOpen && "rotate-180"
          )}
        />
      )}
    </button>
  );

  return (
    <div className={cn("", className)}>
      {!sidebarOpen ? (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>{buttonContent}</TooltipTrigger>
            <TooltipContent side="right">{label}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      ) : (
        buttonContent
      )}

      {sidebarOpen && (
        <div
          id={panelId}
          role="region"
          aria-label={label}
          className={cn(
            "grid transition-[grid-template-rows,opacity] duration-200 ease-out",
            isOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
          )}
        >
          <div className="min-h-0 overflow-hidden">
            <div
              inert={!isOpen}
              className="ml-[1.0625rem] space-y-0.5 border-l border-sidebar-border pl-2.5 pt-1"
            >
              {children}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
