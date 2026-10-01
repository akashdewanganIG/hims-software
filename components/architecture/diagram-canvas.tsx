"use client";

import * as React from "react";

import { Loader2Icon } from "@/components/icons";
import type { GraphLayout } from "@/lib/architecture-layout";
import { cn } from "@/lib/utils";

import { DiagramControls } from "./diagram-controls";
import { useDiagramViewport } from "./use-diagram-viewport";

const EMPTY: GraphLayout<never> = { nodes: [], edges: [], width: 0, height: 0 };

/** Runs an ELK layout, ignoring results that arrive after `compute` changes. */
export function useGraphLayout<T>(compute: () => Promise<GraphLayout<T>>) {
  const [layout, setLayout] = React.useState<GraphLayout<T>>(EMPTY);
  const [isComputing, setComputing] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    setComputing(true);
    compute()
      .then(next => {
        if (cancelled) return;
        setLayout(next);
        setError(null);
      })
      .catch((cause: unknown) => {
        if (!cancelled)
          setError(cause instanceof Error ? cause.message : "Layout failed");
      })
      .finally(() => {
        if (!cancelled) setComputing(false);
      });
    return () => {
      cancelled = true;
    };
  }, [compute]);

  return { layout, isComputing, error };
}

/** Pannable, zoomable surface: edges go in `svg`, nodes in `children`. */
export function DiagramCanvas({
  width,
  height,
  signature,
  isComputing,
  error,
  busyLabel,
  errorLabel,
  className,
  svg,
  overlay,
  children,
}: {
  width: number;
  height: number;
  signature: string;
  isComputing: boolean;
  error: string | null;
  busyLabel: string;
  errorLabel: string;
  className?: string;
  svg: React.ReactNode;
  overlay?: React.ReactNode;
  children: React.ReactNode;
}) {
  const viewport = useDiagramViewport({ width, height, signature });

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-xl border border-border bg-surface-subtle shadow-sm shadow-foreground/[0.02]",
        className
      )}
    >
      <div
        ref={viewport.viewportRef}
        {...viewport.viewportProps}
        className="h-full w-full cursor-grab touch-none select-none overflow-hidden active:cursor-grabbing"
        style={{
          backgroundImage:
            "radial-gradient(circle, var(--border) 1px, transparent 1px)",
          backgroundSize: `${26 * viewport.zoom}px ${26 * viewport.zoom}px`,
          backgroundPosition: `${viewport.pan.x}px ${viewport.pan.y}px`,
        }}
      >
        <div
          className={cn(
            "relative origin-top-left transition-opacity duration-150",
            isComputing && "opacity-45"
          )}
          style={{
            width,
            height,
            transform: `translate(${viewport.pan.x}px, ${viewport.pan.y}px) scale(${viewport.zoom})`,
          }}
        >
          <svg
            className="pointer-events-none absolute inset-0 overflow-visible"
            width={width || 1}
            height={height || 1}
            aria-hidden="true"
          >
            {svg}
          </svg>
          {children}
        </div>
      </div>

      {isComputing ? (
        <div className="pointer-events-none absolute left-1/2 top-3 z-20 flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-border bg-surface/95 px-2.5 py-1 text-[0.6875rem] text-muted-foreground shadow-sm backdrop-blur">
          <Loader2Icon className="size-3 animate-spin" /> {busyLabel}
        </div>
      ) : null}
      {error ? (
        <div className="absolute inset-x-4 top-4 z-30 rounded-lg border border-error-border bg-error-surface p-3 text-sm text-error-foreground">
          {errorLabel}: {error}
        </div>
      ) : null}

      <DiagramControls
        zoom={viewport.zoom}
        onZoomIn={() => viewport.zoomBy(1.2)}
        onZoomOut={() => viewport.zoomBy(1 / 1.2)}
        onFit={viewport.fitToScreen}
        onReset={viewport.reset}
      />
      {overlay}
    </div>
  );
}

export function ArrowMarker({
  id,
  className,
}: {
  id: string;
  className: string;
}) {
  return (
    <marker
      id={id}
      viewBox="0 0 10 10"
      refX="9"
      refY="5"
      markerWidth="9"
      markerHeight="9"
      orient="auto-start-reverse"
      markerUnits="userSpaceOnUse"
    >
      <path d="M 0 1 L 10 5 L 0 9 z" className={className} />
    </marker>
  );
}

export function DiagramLegend({ children }: { children: React.ReactNode }) {
  return (
    <div className="pointer-events-none absolute bottom-3 left-3 z-20 hidden max-w-[calc(100%-1.5rem)] flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-border bg-surface/95 px-2.5 py-1.5 text-[0.6875rem] text-muted-foreground shadow-sm backdrop-blur sm:flex">
      {children}
    </div>
  );
}
