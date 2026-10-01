"use client";

import * as React from "react";
import { Check } from "@/components/icons";
import { cn } from "@/lib/utils";

export type StepperProps = {
  steps: string[];
  currentIndex: number;
  className?: string;
};

export function Stepper({ steps, currentIndex, className }: StepperProps) {
  const safeIndex = Math.max(
    0,
    Math.min(currentIndex, Math.max(0, steps.length - 1))
  );
  const progressPercent =
    steps.length > 1 ? Math.round((safeIndex / (steps.length - 1)) * 100) : 100;

  return (
    <div className={cn("w-full", className)}>
      <div
        role="progressbar"
        aria-valuenow={safeIndex + 1}
        aria-valuemin={1}
        aria-valuemax={steps.length}
        className="flex w-full gap-2 overflow-x-auto pb-1"
      >
        {steps.map((label, index) => {
          const isActive = index === safeIndex;
          const isComplete = index < safeIndex;

          return (
            <div
              key={`${label}-${index}`}
              aria-current={isActive ? "step" : undefined}
              className={cn(
                "flex h-10 min-w-32 flex-1 items-center gap-2 rounded-lg border px-3 text-sm font-medium",
                isActive && "border-primary bg-primary text-primary-foreground",
                isComplete &&
                  "border-primary/20 bg-accent text-accent-foreground",
                !isActive &&
                  !isComplete &&
                  "border-border bg-surface text-muted-foreground"
              )}
            >
              <span
                className={cn(
                  "flex size-5 shrink-0 items-center justify-center rounded-full border text-[0.6875rem]",
                  isActive && "border-surface/40 bg-surface/15",
                  isComplete &&
                    "border-primary/20 bg-primary text-primary-foreground",
                  !isActive && !isComplete && "border-border bg-secondary"
                )}
              >
                {isComplete ? <Check className="size-3" /> : index + 1}
              </span>
              <span className="truncate">{label}</span>
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex items-center justify-between gap-3 text-xs text-muted-foreground">
        <span>
          Stage {safeIndex + 1} of {steps.length}
        </span>
        <span>{progressPercent}% complete</span>
      </div>
    </div>
  );
}
