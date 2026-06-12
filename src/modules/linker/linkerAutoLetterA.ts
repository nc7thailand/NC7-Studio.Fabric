import { distG90 } from './linkerGeometry';
import { addLink, nearestNodeOnLoop, sliceLoopBetweenNodes } from './linkerNodeGraph';
import type { CutLoop, G90Point, LinkerGraphState, LinkerTourStep } from './linkerTypes';
import { LINKER_START_NODE_ID } from './linkerTypes';

/** ABC1_auto G90 waypoints for letter A outer (partial tour opening). */
const A_OUTER_REF = {
  leftTop: { x: 65.878847, y: -7.884363 },
  crossbarRight: { x: 101.991067, y: -7.884363 },
  bottomLeft: { x: 169.715907, y: -177.023402 },
  bottomRight: { x: 187.945077, y: -177.023402 },
  topRight: { x: 187.945077, y: -7.884363 },
} as const;

const WAYPOINT_MAX_MM = 8;
const A_REGION_MAX_CENTROID_X = 160;

function loopArea(points: G90Point[]): number {
  let a = 0;
  for (let i = 0; i < points.length; i += 1) {
    const j = (i + 1) % points.length;
    a += points[i].x * points[j].y - points[j].x * points[i].y;
  }
  return Math.abs(a) / 2;
}

function pointInPolygon(p: G90Point, poly: G90Point[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x;
    const yi = poly[i].y;
    const xj = poly[j].x;
    const yj = poly[j].y;
    const intersect =
      yi > p.y !== yj > p.y && p.x < ((xj - xi) * (p.y - yi)) / (yj - yi + 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

export function detectLetterALoops(
  loops: CutLoop[]
): { outer: CutLoop; hole: CutLoop | null } | null {
  const closed = loops.filter((l) => l.cncType === 'closed' && l.centroid.x < A_REGION_MAX_CENTROID_X);
  if (closed.length === 0) return null;

  const sorted = [...closed].sort((a, b) => loopArea(b.points) - loopArea(a.points));
  const outer = sorted[0];
  let hole: CutLoop | null = null;
  for (let i = 1; i < sorted.length; i += 1) {
    if (pointInPolygon(sorted[i].centroid, outer.points)) {
      hole = sorted[i];
      break;
    }
  }
  return { outer, hole };
}

function nodeNearRef(
  graph: LinkerGraphState,
  loopId: string,
  ref: G90Point
): { nodeId: string; dist: number } | null {
  const node = nearestNodeOnLoop(graph, loopId, ref);
  if (!node) return null;
  const dist = distG90(node.point, ref);
  if (dist > WAYPOINT_MAX_MM) return null;
  return { nodeId: node.id, dist };
}

/**
 * Vector Linker ABC1_auto opening for A outer:
 * START → left top → crossbar → link → bottom left → bottom edge → right leg up.
 */
export function buildLetterAOuterTourSteps(graph: LinkerGraphState): LinkerTourStep[] | null {
  const detected = detectLetterALoops(graph.loops);
  if (!detected) return null;

  const { outer } = detected;
  const leftTop = nodeNearRef(graph, outer.id, A_OUTER_REF.leftTop);
  const crossbarRight = nodeNearRef(graph, outer.id, A_OUTER_REF.crossbarRight);
  const bottomLeft = nodeNearRef(graph, outer.id, A_OUTER_REF.bottomLeft);
  const bottomRight = nodeNearRef(graph, outer.id, A_OUTER_REF.bottomRight);
  const topRight = nodeNearRef(graph, outer.id, A_OUTER_REF.topRight);
  if (!leftTop || !crossbarRight || !bottomLeft || !bottomRight || !topRight) return null;

  const cutTop = sliceLoopBetweenNodes(outer, leftTop.nodeId, crossbarRight.nodeId);
  const cutBottom = sliceLoopBetweenNodes(outer, bottomLeft.nodeId, bottomRight.nodeId);
  const cutLeg = sliceLoopBetweenNodes(outer, bottomRight.nodeId, topRight.nodeId);
  if (!cutTop || !cutBottom || !cutLeg) return null;

  return [
    { type: 'link', fromNodeId: LINKER_START_NODE_ID, toNodeId: leftTop.nodeId },
    {
      type: 'cut',
      loopId: outer.id,
      entryNodeId: leftTop.nodeId,
      exitNodeId: crossbarRight.nodeId,
      reversed: cutTop.reversed,
    },
    { type: 'link', fromNodeId: crossbarRight.nodeId, toNodeId: bottomLeft.nodeId },
    {
      type: 'cut',
      loopId: outer.id,
      entryNodeId: bottomLeft.nodeId,
      exitNodeId: bottomRight.nodeId,
      reversed: cutBottom.reversed,
    },
    {
      type: 'cut',
      loopId: outer.id,
      entryNodeId: bottomRight.nodeId,
      exitNodeId: topRight.nodeId,
      reversed: cutLeg.reversed,
    },
  ];
}

export interface LetterAAutoTourResult {
  exitNodeId: string;
  exitPoint: G90Point;
  consumedLoopIds: string[];
}

/** Apply ABC1_auto-style partial A outer tour; returns exit at top-right for greedy continuation. */
export function applyLetterAAutoTour(
  graph: LinkerGraphState
): LetterAAutoTourResult | null {
  const steps = buildLetterAOuterTourSteps(graph);
  if (!steps || steps.length === 0) return null;

  const detected = detectLetterALoops(graph.loops);
  if (!detected) return null;

  graph.tourSteps = steps;
  for (const step of steps) {
    if (step.type === 'link') {
      addLink(graph, step.fromNodeId, step.toNodeId);
    }
  }

  const lastCut = [...steps].reverse().find((s) => s.type === 'cut');
  const exitNodeId = lastCut?.type === 'cut' ? lastCut.exitNodeId : null;
  if (!exitNodeId) return null;

  const exitNode = graph.nodes.find((n) => n.id === exitNodeId);
  if (!exitNode) return null;

  return {
    exitNodeId,
    exitPoint: { ...exitNode.point },
    consumedLoopIds: [detected.outer.id],
  };
}
