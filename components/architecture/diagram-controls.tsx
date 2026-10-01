"use client";

import * as React from "react";

import { Maximize2, Minus, Plus, RefreshCw } from "@/components/icons";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export function DiagramControls({
  zoom,
  onZoomIn,
  onZoomOut,
  onFit,
  onReset,
}: {
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFit: () => void;
  onReset: () => void;
}) {
  return (
    <div className="absolute right-3 top-3 z-20 flex flex-col items-center gap-0.5 rounded-lg border border-border bg-surface/95 p-1 shadow-sm backdrop-blur">
      <Control label="Zoom in" onClick={onZoomIn}>
        <Plus className="size-3.5" />
      </Control>
      <span className="min-w-8 px-1 text-center text-[0.625rem] tabular-nums text-muted-foreground">
        {Math.round(zoom * 100)}%
      </span>
      <Control label="Zoom out" onClick={onZoomOut}>
        <Minus className="size-3.5" />
      </Control>
      <div className="my-0.5 h-px w-5 bg-border" />
      <Control label="Fit to screen" onClick={onFit}>
        <Maximize2 className="size-3.5" />
      </Control>
      <Control label="Reset view" onClick={onReset}>
        <RefreshCw className="size-3.5" />
      </Control>
    </div>
  );
}

function Control({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <TooltipProvider delayDuration={250}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={onClick}
            aria-label={label}
            className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-hover hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            {children}
          </button>
        </TooltipTrigger>
        <TooltipContent side="left">{label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
