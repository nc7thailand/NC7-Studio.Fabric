import {
  addLink,
  sliceLoopBetweenNodes,
} from './linkerNodeGraph';
import type { CutLoop, G90Point, LinkerGraphState, LinkerTourStep } from './linkerTypes';
import { LINKER_START_NODE_ID } from './linkerTypes';

const B_X_MIN = 175;
const B_X_MAX = 400;
const STEM_X_TOL_MM = 4;

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

function bowlStemSideX(bowl: CutLoop): number {
  return Math.min(...bowl.points.map((p) => p.x));
}

export interface LetterBParts {
  outer: CutLoop;
  upperBowl: CutLoop;
  lowerBowl: CutLoop;
  stemX: number;
}

export function detectLetterBParts(loops: CutLoop[]): LetterBParts | null {
  const candidates = loops.filter(
    (l) => l.cncType === 'closed' && l.centroid.x >= B_X_MIN && l.centroid.x <= B_X_MAX
  );
  if (candidates.length < 3) return null;

  const sorted = [...candidates].sort((a, b) => loopArea(b.points) - loopArea(a.points));
  const outer = sorted[0];
  const inner = sorted.slice(1).filter((l) => pointInPolygon(l.centroid, outer.points));
  if (inner.length < 2) return null;

  const bowls = inner.sort((a, b) => loopArea(b.points) - loopArea(a.points)).slice(0, 2);
  const upperBowl = bowls[0].centroid.y >= bowls[1].centroid.y ? bowls[0] : bowls[1];
  const lowerBowl = bowls[0].centroid.y >= bowls[1].centroid.y ? bowls[1] : bowls[0];
  const stemX = (bowlStemSideX(upperBowl) + bowlStemSideX(lowerBowl)) / 2;

  return { outer, upperBowl, lowerBowl, stemX };
}

export function isLetterBLoop(loopId: string, parts: LetterBParts): boolean {
  return (
    loopId === parts.outer.id ||
    loopId === parts.upperBowl.id ||
    loopId === parts.lowerBowl.id
  );
}

function nearestStemNodeOnOuter(
  graph: LinkerGraphState,
  outerId: string,
  stemX: number,
  refY: number
): string | null {
  let bestId: string | null = null;
  let bestScore = Infinity;
  for (const node of graph.nodes) {
    if (node.loopId !== outerId) continue;
    const dx = Math.abs(node.point.x - stemX);
    if (dx > STEM_X_TOL_MM) continue;
    const score = dx * 8 + Math.abs(node.point.y - refY);
    if (score < bestScore) {
      bestScore = score;
      bestId = node.id;
    }
  }
  return bestId;
}

function nearestBowlJunctionNode(
  graph: LinkerGraphState,
  bowl: CutLoop,
  stemX: number
): string | null {
  const refY = bowl.centroid.y;
  let bestId: string | null = null;
  let bestScore = Infinity;
  for (const node of graph.nodes) {
    if (node.loopId !== bowl.id) continue;
    const score = Math.abs(node.point.x - stemX) * 6 + Math.abs(node.point.y - refY);
    if (score < bestScore) {
      bestScore = score;
      bestId = node.id;
    }
  }
  return bestId;
}

function fullBowlCutStep(
  graph: LinkerGraphState,
  bowl: CutLoop,
  entryNodeId: string
): LinkerTourStep | null {
  const sliced = sliceLoopBetweenNodes(bowl, entryNodeId, entryNodeId);
  if (!sliced) return null;
  return {
    type: 'cut',
    loopId: bowl.id,
    entryNodeId,
    exitNodeId: entryNodeId,
    reversed: sliced.reversed,
  };
}

function appendTourSteps(graph: LinkerGraphState, steps: LinkerTourStep[]): void {
  graph.tourSteps = [...(graph.tourSteps ?? []), ...steps];
}

/**
 * BK B pattern — geometry-based (no absolute G90 refs):
 * stem hub on outer → upper bowl → stem → lower bowl → exit on stem for outer/C.
 */
export function buildLetterBInnerTourSteps(
  graph: LinkerGraphState,
  parts: LetterBParts,
  enterFromNodeId: string
): LinkerTourStep[] | null {
  const { outer, upperBowl, lowerBowl, stemX } = parts;

  const stemUpper = nearestStemNodeOnOuter(graph, outer.id, stemX, upperBowl.centroid.y);
  const stemBetween = nearestStemNodeOnOuter(
    graph,
    outer.id,
    stemX,
    (upperBowl.centroid.y + lowerBowl.centroid.y) / 2
  );
  const stemLower = nearestStemNodeOnOuter(graph, outer.id, stemX, lowerBowl.centroid.y);
  const upperBowlJunction = nearestBowlJunctionNode(graph, upperBowl, stemX);
  const lowerBowlJunction = nearestBowlJunctionNode(graph, lowerBowl, stemX);

  if (!stemUpper || !stemBetween || !stemLower || !upperBowlJunction || !lowerBowlJunction) {
    return null;
  }

  const upperBowlCut = fullBowlCutStep(graph, upperBowl, upperBowlJunction);
  const lowerBowlCut = fullBowlCutStep(graph, lowerBowl, lowerBowlJunction);
  if (!upperBowlCut || !lowerBowlCut) return null;

  // Four internal stem ↔ bowl links; stem hops are through-foam (outer perimeter cut later).
  return [
    { type: 'link', fromNodeId: enterFromNodeId, toNodeId: stemUpper },
    { type: 'link', fromNodeId: stemUpper, toNodeId: upperBowlJunction },
    upperBowlCut,
    { type: 'link', fromNodeId: upperBowlJunction, toNodeId: stemBetween },
    { type: 'link', fromNodeId: stemBetween, toNodeId: stemLower },
    { type: 'link', fromNodeId: stemLower, toNodeId: lowerBowlJunction },
    lowerBowlCut,
    { type: 'link', fromNodeId: lowerBowlJunction, toNodeId: stemLower },
  ];
}

export interface LetterBAutoTourResult {
  exitNodeId: string;
  exitPoint: G90Point;
  consumedLoopIds: string[];
}

export function applyLetterBAutoTour(
  graph: LinkerGraphState,
  prevExitNodeId: string | null,
  parts: LetterBParts
): LetterBAutoTourResult | null {
  const enterFrom = prevExitNodeId ?? LINKER_START_NODE_ID;
  const steps = buildLetterBInnerTourSteps(graph, parts, enterFrom);
  if (!steps) return null;

  appendTourSteps(graph, steps);
  for (const step of steps) {
    if (step.type === 'link') {
      addLink(graph, step.fromNodeId, step.toNodeId);
    }
  }

  const lastLink = [...steps].reverse().find((s) => s.type === 'link');
  const exitNodeId = lastLink?.type === 'link' ? lastLink.toNodeId : null;
  if (!exitNodeId) return null;

  const exitNode = graph.nodes.find((n) => n.id === exitNodeId);
  if (!exitNode) return null;

  return {
    exitNodeId,
    exitPoint: { ...exitNode.point },
    consumedLoopIds: [parts.upperBowl.id, parts.lowerBowl.id],
  };
}
