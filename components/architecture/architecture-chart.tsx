"use client";

import * as React from "react";
import Link from "next/link";

import { ArrowRight } from "@/components/icons";
import { Tag } from "@/components/ui/tag";
import {
  ARCH_AREAS,
  RELATION_LABEL,
  type ArchModule,
  type ArchRelation,
  type RelationKind,
} from "@/lib/architecture";
import {
  computeArchitectureLayout,
  orthogonalPath,
} from "@/lib/architecture-layout";
import { MODULE_ICON } from "@/lib/navigation";
import {
  ACTIONS,
  ACTION_INFO,
  ACTION_MODULE,
  MODULE_LABEL,
  type Action,
  type Module,
} from "@/lib/rbac";
import { cn } from "@/lib/utils";

import {
  ArrowMarker,
  DiagramCanvas,
  DiagramLegend,
  useGraphLayout,
} from "./diagram-canvas";

const AREA_LABEL = new Map(ARCH_AREAS.map(area => [area.id, area.label]));

const EDGE_STROKE: Record<RelationKind, string> = {
  handoff: "stroke-primary",
  charge: "stroke-warning",
  shared: "stroke-muted-foreground",
  record: "stroke-info",
};

const EDGE_MARKER: Record<RelationKind, string> = {
  handoff: "url(#architecture-arrow-handoff)",
  charge: "url(#architecture-arrow-charge)",
  shared: "url(#architecture-arrow-shared)",
  record: "url(#architecture-arrow-record)",
};

export function ArchitectureChart({
  modules,
  relations,
  can,
  onOpenFlows,
}: {
  modules: ArchModule[];
  relations: ArchRelation[];
  can: (action: Action) => boolean;
  onOpenFlows: () => void;
}) {
  const [selectedId, setSelectedId] = React.useState<Module | null>(null);
  const [hoveredId, setHoveredId] = React.useState<Module | null>(null);

  const signature = React.useMemo(
    () =>
      modules
        .map(module => module.module)
        .sort()
        .join(","),
    [modules]
  );
  const compute = React.useCallback(
    () =>
      computeArchitectureLayout(
        modules.map(module => module.module),
        relations
      ),
    [modules, relations]
  );
  const { layout, isComputing, error } = useGraphLayout(compute);

  React.useEffect(() => {
    if (selectedId && !modules.some(module => module.module === selectedId))
      setSelectedId(null);
  }, [modules, selectedId]);

  const moduleById = React.useMemo(
    () => new Map(modules.map(module => [module.module, module])),
    [modules]
  );
  const activeId = hoveredId ?? selectedId;
  const related = React.useMemo(() => {
    const ids = new Set<Module>();
    if (!activeId) return ids;
    for (const relation of relations) {
      if (relation.from === activeId) ids.add(relation.to);
      if (relation.to === activeId) ids.add(relation.from);
    }
    return ids;
  }, [activeId, relations]);
  const selected = selectedId ? moduleById.get(selectedId) : undefined;

  if (!modules.length) {
    return (
      <div className="grid h-full place-items-center rounded-xl border border-border bg-surface-subtle p-8 text-sm text-muted-foreground">
        No modules match this search.
      </div>
    );
  }

  return (
    <DiagramCanvas
      width={layout.width}
      height={layout.height}
      signature={signature}
      isComputing={isComputing}
      error={error}
      busyLabel="Arranging modules"
      errorLabel="The architecture map could not be arranged"
      className="h-full min-h-[34rem]"
      svg={
        <>
          <defs>
            <ArrowMarker
              id="architecture-arrow-handoff"
              className="fill-primary"
            />
            <ArrowMarker
              id="architecture-arrow-charge"
              className="fill-warning"
            />
            <ArrowMarker
              id="architecture-arrow-shared"
              className="fill-muted-foreground"
            />
            <ArrowMarker id="architecture-arrow-record" className="fill-info" />
          </defs>
          {layout.edges.map(edge => {
            const touchesActive =
              !activeId ||
              edge.data.from === activeId ||
              edge.data.to === activeId;
            return (
              <path
                key={edge.id}
                d={orthogonalPath(edge.points, 9)}
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
                className={cn(
                  EDGE_STROKE[edge.data.kind],
                  "transition-opacity duration-150",
                  touchesActive ? "opacity-75" : "opacity-10",
                  edge.data.kind === "shared" && "[stroke-dasharray:5_5]"
                )}
                strokeWidth={touchesActive && activeId ? 2 : 1.35}
                markerEnd={EDGE_MARKER[edge.data.kind]}
              />
            );
          })}
        </>
      }
      overlay={
        selected ? (
          <ModuleDetails
            module={selected}
            relations={relations}
            can={can}
            onOpenFlows={onOpenFlows}
          />
        ) : (
          <ArchitectureLegend />
        )
      }
    >
      {layout.nodes.map(box => {
        const archModule = moduleById.get(box.id as Module);
        if (!archModule) return null;
        const Icon = MODULE_ICON.get(archModule.module);
        const state =
          selectedId === archModule.module
            ? "selected"
            : activeId === archModule.module
              ? "active"
              : related.has(archModule.module)
                ? "related"
                : activeId
                  ? "dimmed"
                  : "idle";
        return (
          <button
            key={box.id}
            data-diagram-node
            type="button"
            aria-pressed={selectedId === archModule.module}
            onClick={() =>
              setSelectedId(current =>
                current === archModule.module ? null : archModule.module
              )
            }
            onMouseEnter={() => setHoveredId(archModule.module)}
            onMouseLeave={() => setHoveredId(null)}
            onFocus={() => setHoveredId(archModule.module)}
            onBlur={() => setHoveredId(null)}
            className={cn(
              "absolute flex items-start gap-3 rounded-xl border bg-surface p-3 text-left shadow-sm outline-none transition-[opacity,border-color,box-shadow,transform] duration-150 focus-visible:ring-2 focus-visible:ring-ring/40",
              state === "selected" &&
                "z-10 border-primary ring-2 ring-primary/15",
              state === "active" &&
                "z-10 -translate-y-0.5 border-primary-border shadow-md",
              state === "related" && "border-primary-border",
              state === "dimmed" && "opacity-35",
              state === "idle" && "border-border hover:border-border-strong"
            )}
            style={{
              left: box.x,
              top: box.y,
              width: box.w,
              height: box.h,
            }}
          >
            <span className="grid size-9 shrink-0 place-items-center rounded-lg border border-primary-border bg-primary-surface text-primary">
              {Icon ? <Icon className="size-[1.125rem]" /> : null}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[0.8125rem] font-semibold text-foreground">
                {archModule.label}
              </span>
              <span className="mt-0.5 block text-[0.625rem] font-medium uppercase tracking-[0.06em] text-muted-foreground">
                {AREA_LABEL.get(archModule.area)}
              </span>
              <span className="mt-1 block truncate text-[0.6875rem] text-muted-foreground">
                {archModule.owns.length
                  ? `Owns ${archModule.owns.join(", ")}`
                  : "Cross-hospital view"}
              </span>
            </span>
          </button>
        );
      })}
    </DiagramCanvas>
  );
}

function ModuleDetails({
  module,
  relations,
  can,
  onOpenFlows,
}: {
  module: ArchModule;
  relations: ArchRelation[];
  can: (action: Action) => boolean;
  onOpenFlows: () => void;
}) {
  const connections = relations.filter(
    relation => relation.from === module.module || relation.to === module.module
  );
  const capabilities = ACTIONS.filter(
    action => ACTION_MODULE[action] === module.module && can(action)
  );
  const route = module.pages.find(page => page.route)?.route;

  return (
    <aside className="absolute bottom-3 left-3 z-20 w-[min(24rem,calc(100%-5.5rem))] rounded-xl border border-border bg-surface/95 p-3 shadow-lg backdrop-blur">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">
            {module.label}
          </p>
          <p className="mt-0.5 text-xs leading-4 text-muted-foreground">
            {module.description}
          </p>
        </div>
        {route ? (
          <Link
            href={route}
            className="inline-flex shrink-0 items-center gap-1 rounded-md border border-primary-border bg-primary-surface px-2 py-1 text-xs font-medium text-primary-surface-foreground hover:border-primary"
          >
            Open <ArrowRight className="size-3" />
          </Link>
        ) : null}
      </div>
      <div className="mt-2 flex flex-wrap gap-1">
        {capabilities.length ? (
          capabilities.map(action => (
            <Tag key={action} tone="progress">
              {ACTION_INFO[action].label}
            </Tag>
          ))
        ) : (
          <Tag tone="neutral">View only</Tag>
        )}
      </div>
      <div className="mt-2 border-t border-border pt-2">
        <p className="text-[0.625rem] font-semibold uppercase tracking-[0.07em] text-muted-foreground">
          {connections.length} connection{connections.length === 1 ? "" : "s"}
        </p>
        <ul className="mt-1 max-h-24 space-y-1 overflow-y-auto pr-1 text-[0.6875rem] text-muted-foreground">
          {connections.map(connection => {
            const outgoing = connection.from === module.module;
            const other = outgoing ? connection.to : connection.from;
            return (
              <li
                key={`${connection.from}-${connection.to}-${connection.kind}`}
              >
                <span className="font-medium text-foreground">
                  {outgoing ? "To" : "From"} {MODULE_LABEL[other]}
                </span>{" "}
                · {connection.label}
              </li>
            );
          })}
        </ul>
        <button
          type="button"
          onClick={onOpenFlows}
          className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
        >
          See related workflows <ArrowRight className="size-3" />
        </button>
      </div>
    </aside>
  );
}

function ArchitectureLegend() {
  return (
    <DiagramLegend>
      {(Object.keys(RELATION_LABEL) as RelationKind[]).map(kind => (
        <span key={kind} className="flex items-center gap-1.5">
          <span
            className={cn(
              "h-0 w-5 border-t-2",
              kind === "handoff" && "border-primary",
              kind === "charge" && "border-warning",
              kind === "record" && "border-info",
              kind === "shared" && "border-dashed border-muted-foreground"
            )}
          />
          {RELATION_LABEL[kind]}
        </span>
      ))}
    </DiagramLegend>
  );
}
