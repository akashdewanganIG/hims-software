"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Menu } from "@/components/icons";
import { useSidebar } from "./sidebar-provider";

export function SidebarTrigger() {
  const { toggle } = useSidebar();
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      onClick={toggle}
      className="text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground"
      aria-label="Toggle navigation width"
      title="Toggle navigation width"
    >
      <Menu className="h-5 w-5" />
    </Button>
  );
}
