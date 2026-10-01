"use client";

import * as React from "react";

import { Info } from "@/components/icons";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export function InfoHint({ label }: { label: React.ReactNode }) {
  if (!label) return null;

  const accessibleText = typeof label === "string" ? label : undefined;

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label={
              accessibleText
                ? `More information: ${accessibleText}`
                : "More information"
            }
            className="inline-flex size-4 shrink-0 items-center justify-center rounded-full text-muted-foreground outline-none transition-colors duration-150 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/30"
          >
            <Info aria-hidden="true" className="size-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-[18rem]">
          {label}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
