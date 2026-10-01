"use client";

import * as React from "react";
import Link from "next/link";

import { Lock } from "@/components/icons";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { FlowStep, UserFlow } from "@/lib/architecture";
import { computeFlowLayout, orthogonalPath } from "@/lib/architecture-layout";
import { MODULE_LABEL, type Action, type Module } from "@/lib/rbac";
import { cn } from "@/lib/utils";

import {
  ArrowMarker,
  DiagramCanvas,
  DiagramLegend,
  useGraphLayout,
} from "./diagram-canvas";

const KIND_LABEL: Record<FlowStep["kind"], string> = {
  start: "Start",
  end: "Complete",
  action: "Action",
  auto: "Automatic",
  decision: "Decision",
};

export function FlowChart({
  flow,
  visible,
  can,
}: {
  flow: UserFlow;
  visible: Set<Module>;
  can: (action: Action) => boolean;
}) {
  const [hoveredId, setHoveredId] = React.useState<string | null>(null);

  const compute = React.useCallback(
    () => computeFlowLayout(flow.steps),
    [flow.steps]
  );
  const { layout, isComputing, error } = useGraphLayout(compute);
  const stepById = React.useMemo(
    () => new Map(flow.steps.map(step => [step.id, step])),
    [flow.steps]
  );

  return (
    <DiagramCanvas
      width={layout.width}
      height={layout.height}
      signature={flow.id}
      isComputing={isComputing}
      error={error}
      busyLabel="Arranging workflow"
      errorLabel="The workflow could not be arranged"
      className="min-h-[30rem] flex-1"
      svg={
        <>
          <defs>
            <ArrowMarker
              id={`workflow-arrow-${flow.id}`}
              className="fill-primary"
            />
          </defs>

          {layout.edges.map(edge => (
            <g key={edge.id}>
              <path
                d={orthogonalPath(edge.points, 10)}
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="stroke-primary opacity-70"
                strokeWidth={1.45}
                markerEnd={`url(#workflow-arrow-${flow.id})`}
              />
              {edge.label && edge.data.label ? (
                <>
                  <rect
                    x={edge.label.x}
                    y={edge.label.y}
                    width={edge.label.w}
                    height={edge.label.h}
                    rx={8}
                    className="fill-surface stroke-primary-border"
                    strokeWidth={0.8}
                  />
                  <text
                    x={edge.label.x + edge.label.w / 2}
                    y={edge.label.y + edge.label.h / 2 + 3.2}
                    textAnchor="middle"
                    className="fill-primary-surface-foreground text-[9px] font-semibold"
                  >
                    {edge.data.label}
                  </text>
                </>
              ) : null}
            </g>
          ))}

          {layout.nodes.map(box => {
            const step = stepById.get(box.id);
            if (step?.kind !== "decision") return null;
            const notch = 15;
            return (
              <path
                key={`decision-${box.id}`}
                d={`M ${box.x + notch} ${box.y} L ${box.x + box.w - notch} ${box.y} L ${box.x + box.w} ${box.y + box.h / 2} L ${box.x + box.w - notch} ${box.y + box.h} L ${box.x + notch} ${box.y + box.h} L ${box.x} ${box.y + box.h / 2} Z`}
                className={cn(
                  "transition-[fill,stroke] duration-150",
                  hoveredId === box.id
                    ? "fill-warning-surface stroke-warning"
                    : "fill-surface stroke-warning-border"
                )}
                strokeWidth={hoveredId === box.id ? 1.7 : 1.25}
              />
            );
          })}
        </>
      }
      overlay={<FlowLegend />}
    >
      {layout.nodes.map(box => {
        const step = stepById.get(box.id);
        if (!step) return null;
        const outside = step.module ? !visible.has(step.module) : false;
        const mine = Boolean(step.action && !outside && can(step.action));
        return (
          <FlowNode
            key={box.id}
            step={step}
            box={box}
            outside={outside}
            mine={mine}
            onHoverChange={hovered =>
              setHoveredId(current =>
                hovered ? box.id : current === box.id ? null : current
              )
            }
          />
        );
      })}
    </DiagramCanvas>
  );
}

function FlowNode({
  step,
  box,
  outside,
  mine,
  onHoverChange,
}: {
  step: FlowStep;
  box: { x: number; y: number; w: number; h: number };
  outside: boolean;
  mine: boolean;
  onHoverChange: (hovered: boolean) => void;
}) {
  const terminal = step.kind === "start" || step.kind === "end";
  const decision = step.kind === "decision";
  const classes = cn(
    "flex h-full w-full flex-col justify-center gap-0.5 px-3 text-left outline-none transition-[background-color,border-color,box-shadow,transform,opacity] duration-150 focus-visible:ring-2 focus-visible:ring-ring/50",
    decision
      ? "items-center border-0 bg-transparent px-7 text-center"
      : terminal
        ? "rounded-full border border-primary-border bg-primary-surface px-5"
        : step.kind === "auto"
          ? "rounded-lg border border-dashed border-border-strong bg-surface-subtle"
          : "rounded-lg border border-border bg-surface",
    mine && !decision && "border-primary ring-1 ring-primary/15",
    outside && "opacity-55",
    step.route && "cursor-pointer",
    step.route && !decision && "hover:-translate-y-px hover:shadow-md"
  );

  const content = (
    <>
      <span
        className={cn(
          "flex items-center gap-1 text-[0.5625rem] font-semibold uppercase tracking-[0.08em]",
          mine ? "text-primary" : "text-muted-foreground"
        )}
      >
        {outside ? <Lock className="size-2.5" /> : null}
        {KIND_LABEL[step.kind]}
        {mine ? (
          <>
            <span aria-hidden="true">·</span>
            <span>You</span>
          </>
        ) : null}
      </span>
      <span
        className={cn(
          "line-clamp-2 text-[0.78125rem] leading-4 text-foreground",
          decision ? "font-semibold" : "font-medium"
        )}
      >
        {step.label}
      </span>
      {step.module && !decision ? (
        <span className="truncate text-[0.625rem] leading-3 text-muted-foreground">
          {MODULE_LABEL[step.module]}
        </span>
      ) : null}
    </>
  );

  const node = step.route ? (
    <Link href={step.route} className={classes}>
      {content}
    </Link>
  ) : (
    <div className={classes} tabIndex={0} role="group" aria-label={step.label}>
      {content}
    </div>
  );

  return (
    <div
      data-diagram-node
      className="absolute"
      style={{ left: box.x, top: box.y, width: box.w, height: box.h }}
      onMouseEnter={() => onHoverChange(true)}
      onMouseLeave={() => onHoverChange(false)}
      onFocusCapture={() => onHoverChange(true)}
      onBlurCapture={() => onHoverChange(false)}
    >
      <TooltipProvider delayDuration={250}>
        <Tooltip>
          <TooltipTrigger asChild>{node}</TooltipTrigger>
          <TooltipContent side="right" className="max-w-[19rem]">
            <span className="block font-medium">{step.label}</span>
            {step.note ? (
              <span className="mt-0.5 block opacity-85">{step.note}</span>
            ) : null}
            {step.module ? (
              <span className="mt-0.5 block opacity-70">
                {outside ? "Handled by " : "In "}
                {MODULE_LABEL[step.module]}
              </span>
            ) : null}
            {step.route ? (
              <span className="mt-0.5 block opacity-70">
                Opens {step.route}
              </span>
            ) : null}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
}

function FlowLegend() {
  return (
    <DiagramLegend>
      <span className="flex items-center gap-1.5">
        <span className="h-3 w-6 rounded-full border border-primary-border bg-primary-surface" />
        Start / complete
      </span>
      <span className="flex items-center gap-1.5">
        <span className="h-3 w-6 rounded border border-primary bg-surface" />
        Your action
      </span>
      <span className="flex items-center gap-1.5">
        <span className="h-3 w-6 rounded border border-dashed border-border-strong bg-surface-subtle" />
        Automatic
      </span>
      <span className="flex items-center gap-1.5">
        <svg width="26" height="12" aria-hidden="true">
          <path
            d="M 5 1 L 21 1 L 25 6 L 21 11 L 5 11 L 1 6 Z"
            className="fill-surface stroke-warning-border"
          />
        </svg>
        Decision
      </span>
    </DiagramLegend>
  );
}
