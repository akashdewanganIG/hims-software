/**
 * Automatic geometry for the architecture and workflow diagrams.
 *
 * ELK's layered layout keeps related modules close, minimises crossings and
 * routes connections orthogonally. The engine is loaded only when a diagram
 * is rendered so it does not inflate the application's initial bundle.
 */
import type { ArchRelation, FlowStep } from "./architecture";

export interface LayoutBox {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface LayoutEdge<T> {
  id: string;
  data: T;
  points: Array<{ x: number; y: number }>;
  label?: { x: number; y: number; w: number; h: number };
}

export interface GraphLayout<T> {
  nodes: LayoutBox[];
  edges: Array<LayoutEdge<T>>;
  width: number;
  height: number;
}

interface ElkPoint {
  x: number;
  y: number;
}

interface ElkSection {
  startPoint: ElkPoint;
  endPoint: ElkPoint;
  bendPoints?: ElkPoint[];
}

interface ElkLabel {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
}

interface ElkEdge {
  id: string;
  sections?: ElkSection[];
  labels?: ElkLabel[];
}

interface ElkNode {
  id: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  children?: ElkNode[];
  edges?: ElkEdge[];
}

type ElkConstructor = new () => {
  layout: (graph: unknown) => Promise<ElkNode>;
};

let elkPromise: Promise<ElkConstructor> | null = null;

async function loadElk(): Promise<ElkConstructor> {
  if (!elkPromise) {
    elkPromise = import("elkjs/lib/elk.bundled.js").then(
      module =>
        ((module as unknown as { default: ElkConstructor }).default ??
          module) as ElkConstructor
    );
  }
  return elkPromise;
}

const ARCHITECTURE_OPTIONS: Record<string, string> = {
  "elk.algorithm": "layered",
  "elk.direction": "RIGHT",
  "elk.edgeRouting": "ORTHOGONAL",
  "elk.layered.nodePlacement.strategy": "NETWORK_SIMPLEX",
  "elk.layered.crossingMinimization.strategy": "LAYER_SWEEP",
  "elk.layered.cycleBreaking.strategy": "GREEDY",
  "elk.layered.thoroughness": "60",
  "elk.spacing.nodeNode": "34",
  "elk.spacing.edgeNode": "22",
  "elk.spacing.edgeEdge": "14",
  "elk.layered.spacing.nodeNodeBetweenLayers": "96",
  "elk.layered.spacing.edgeNodeBetweenLayers": "28",
};

const ARCH_NODE_W = 220;
const ARCH_NODE_H = 76;

export async function computeArchitectureLayout(
  nodeIds: string[],
  relations: ArchRelation[]
): Promise<GraphLayout<ArchRelation>> {
  if (!nodeIds.length) return { nodes: [], edges: [], width: 0, height: 0 };

  const present = new Set(nodeIds);
  const drawn = relations.filter(
    relation => present.has(relation.from) && present.has(relation.to)
  );
  const Elk = await loadElk();
  const result = await new Elk().layout({
    id: "architecture",
    layoutOptions: ARCHITECTURE_OPTIONS,
    children: nodeIds.map(id => ({
      id,
      width: ARCH_NODE_W,
      height: ARCH_NODE_H,
    })),
    edges: drawn.map((relation, index) => ({
      id: `architecture-edge-${index}`,
      sources: [relation.from],
      targets: [relation.to],
    })),
  });

  return readLayout(result, drawn, "architecture-edge-");
}

export interface FlowConnection {
  from: string;
  to: string;
  label?: string;
}

const FLOW_NODE_W = 232;
const FLOW_NODE_H = 62;
const FLOW_DECISION_H = 70;

const FLOW_OPTIONS: Record<string, string> = {
  "elk.algorithm": "layered",
  "elk.direction": "DOWN",
  "elk.edgeRouting": "ORTHOGONAL",
  "elk.layered.nodePlacement.strategy": "BRANDES_KOEPF",
  "elk.layered.crossingMinimization.strategy": "LAYER_SWEEP",
  "elk.layered.cycleBreaking.strategy": "GREEDY",
  "elk.layered.thoroughness": "50",
  "elk.spacing.nodeNode": "30",
  "elk.spacing.edgeNode": "24",
  "elk.spacing.edgeEdge": "16",
  "elk.spacing.edgeLabel": "7",
  "elk.layered.spacing.nodeNodeBetweenLayers": "64",
  "elk.layered.spacing.edgeNodeBetweenLayers": "26",
  "elk.edgeLabels.placement": "CENTER",
  "elk.layered.edgeLabels.sideSelection": "SMART_DOWN",
};

function flowConnections(steps: FlowStep[]): FlowConnection[] {
  const present = new Set(steps.map(step => step.id));
  const connections: FlowConnection[] = [];

  steps.forEach((step, index) => {
    if (step.kind === "end") return;
    if (step.branches?.length) {
      for (const branch of step.branches) {
        if (present.has(branch.to))
          connections.push({
            from: step.id,
            to: branch.to,
            label: branch.label,
          });
      }
      return;
    }

    const target =
      step.next === null ? undefined : (step.next ?? steps[index + 1]?.id);
    if (target && present.has(target))
      connections.push({ from: step.id, to: target });
  });

  return connections;
}

export async function computeFlowLayout(
  steps: FlowStep[]
): Promise<GraphLayout<FlowConnection>> {
  if (!steps.length) return { nodes: [], edges: [], width: 0, height: 0 };

  const connections = flowConnections(steps);
  const Elk = await loadElk();
  const result = await new Elk().layout({
    id: "workflow",
    layoutOptions: FLOW_OPTIONS,
    children: steps.map(step => ({
      id: step.id,
      width: FLOW_NODE_W,
      height: step.kind === "decision" ? FLOW_DECISION_H : FLOW_NODE_H,
    })),
    edges: connections.map((connection, index) => ({
      id: `workflow-edge-${index}`,
      sources: [connection.from],
      targets: [connection.to],
      ...(connection.label
        ? {
            labels: [
              {
                text: connection.label,
                width: connection.label.length * 5.5 + 14,
                height: 17,
              },
            ],
          }
        : {}),
    })),
  });

  return readLayout(result, connections, "workflow-edge-");
}

function readLayout<T>(
  result: ElkNode,
  data: T[],
  edgePrefix: string
): GraphLayout<T> {
  const nodes = (result.children ?? []).map(child => ({
    id: child.id,
    x: child.x ?? 0,
    y: child.y ?? 0,
    w: child.width ?? ARCH_NODE_W,
    h: child.height ?? ARCH_NODE_H,
  }));

  const edges: Array<LayoutEdge<T>> = [];
  for (const edge of result.edges ?? []) {
    const index = Number(edge.id.replace(edgePrefix, ""));
    const edgeData = data[index];
    const section = edge.sections?.[0];
    if (!edgeData || !section) continue;
    const rawLabel = edge.labels?.[0];
    edges.push({
      id: edge.id,
      data: edgeData,
      points: [
        section.startPoint,
        ...(section.bendPoints ?? []),
        section.endPoint,
      ],
      label:
        rawLabel &&
        typeof rawLabel.x === "number" &&
        typeof rawLabel.y === "number"
          ? {
              x: rawLabel.x,
              y: rawLabel.y,
              w: rawLabel.width ?? 0,
              h: rawLabel.height ?? 17,
            }
          : undefined,
    });
  }

  return {
    nodes,
    edges,
    width: result.width ?? 0,
    height: result.height ?? 0,
  };
}

/** Convert an orthogonal polyline into a path with gently rounded elbows. */
export function orthogonalPath(
  points: Array<{ x: number; y: number }>,
  radius = 8
): string {
  if (points.length < 2) return "";
  if (points.length === 2)
    return `M ${points[0]!.x} ${points[0]!.y} L ${points[1]!.x} ${points[1]!.y}`;

  const parts = [`M ${points[0]!.x} ${points[0]!.y}`];
  for (let index = 1; index < points.length - 1; index++) {
    const previous = points[index - 1]!;
    const corner = points[index]!;
    const next = points[index + 1]!;
    const incoming = Math.hypot(corner.x - previous.x, corner.y - previous.y);
    const outgoing = Math.hypot(next.x - corner.x, next.y - corner.y);
    const curve = Math.max(0, Math.min(radius, incoming / 2, outgoing / 2));

    if (curve < 0.5) {
      parts.push(`L ${corner.x} ${corner.y}`);
      continue;
    }

    const enter = {
      x: corner.x - ((corner.x - previous.x) / incoming) * curve,
      y: corner.y - ((corner.y - previous.y) / incoming) * curve,
    };
    const exit = {
      x: corner.x + ((next.x - corner.x) / outgoing) * curve,
      y: corner.y + ((next.y - corner.y) / outgoing) * curve,
    };
    parts.push(`L ${enter.x} ${enter.y}`);
    parts.push(`Q ${corner.x} ${corner.y} ${exit.x} ${exit.y}`);
  }

  const last = points[points.length - 1]!;
  parts.push(`L ${last.x} ${last.y}`);
  return parts.join(" ");
}
