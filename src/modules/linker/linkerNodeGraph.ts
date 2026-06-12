import { bestLoopEntry, distG90, distPointToPolylineG90, sameG90 } from './linkerGeometry';
import type { LinkerStartPointConfig } from './linkerStartPoint';
import { resolveLinkerStartPointCnc } from './linkerStartPoint';
import type {
  CutLoop,
  G90Point,
  LinkerGraphState,
  LinkerG90Program,
  LinkerLink,
  LinkerNode,
  LinkerProgramBuildResult,
  LinkerSegment,
  LinkerTourStep,
} from './linkerTypes';
import {
  LINKER_START_LOOP_ID,
  LINKER_START_NODE_ID,
  loopById,
  loopPoints,
  makeNodeId,
  nodeById,
  parseNodeId,
} from './linkerTypes';

const MOVE_EPS = 0.001;
const NODE_HIT_MM = 10;

let linkIdCounter = 0;

function nextLinkId(): string {
  linkIdCounter += 1;
  return `link-${linkIdCounter}`;
}

/** Keep START marker in the graph so the first green link can originate there. */
export function upsertLinkerStartNode(graph: LinkerGraphState, point: G90Point): LinkerNode {
  const existing = graph.nodes.find((n) => n.id === LINKER_START_NODE_ID);
  if (existing) {
    existing.point = { ...point };
    return existing;
  }
  const node: LinkerNode = {
    id: LINKER_START_NODE_ID,
    loopId: LINKER_START_LOOP_ID,
    pointIndex: -1,
    point: { ...point },
  };
  graph.nodes.push(node);
  return node;
}

/** Build nodes at every polyline vertex (Vector Linker red dots). */
export function buildNodesFromLoops(loops: CutLoop[]): LinkerNode[] {
  const nodes: LinkerNode[] = [];
  for (const loop of loops) {
    loop.points.forEach((point, pointIndex) => {
      nodes.push({
        id: makeNodeId(loop.id, pointIndex),
        loopId: loop.id,
        pointIndex,
        point: { ...point },
      });
    });
  }
  return nodes;
}

export function refreshGraphLoops(
  graph: LinkerGraphState,
  loops: CutLoop[]
): LinkerGraphState {
  const validLoopIds = new Set(loops.map((l) => l.id));
  const nodes = buildNodesFromLoops(loops);
  const startNode = graph.nodes.find((n) => n.id === LINKER_START_NODE_ID);
  if (startNode) {
    nodes.push({ ...startNode, point: { ...startNode.point } });
  }
  const validNodeIds = new Set(nodes.map((n) => n.id));
  const links = graph.links.filter(
    (l) => validNodeIds.has(l.fromNodeId) && validNodeIds.has(l.toNodeId)
  );
  const reversed: Record<string, boolean> = {};
  for (const id of validLoopIds) {
    if (graph.reversed[id] != null) reversed[id] = graph.reversed[id];
  }
  const tourLoopIds = graph.tourLoopIds.filter((id) => validLoopIds.has(id));
  const tourSteps = graph.tourSteps?.filter((s) => {
    if (s.type === 'link') {
      return validNodeIds.has(s.fromNodeId) && validNodeIds.has(s.toNodeId);
    }
    return (
      validLoopIds.has(s.loopId) &&
      validNodeIds.has(s.entryNodeId) &&
      validNodeIds.has(s.exitNodeId)
    );
  });
  return { loops, nodes, links, reversed, tourLoopIds, tourSteps };
}

export function cloneGraph(graph: LinkerGraphState): LinkerGraphState {
  return {
    loops: graph.loops.map((l) => ({
      ...l,
      points: l.points.map((p) => ({ ...p })),
      centroid: { ...l.centroid },
    })),
    nodes: graph.nodes.map((n) => ({ ...n, point: { ...n.point } })),
    links: graph.links.map((l) => ({ ...l })),
    reversed: { ...graph.reversed },
    tourLoopIds: [...graph.tourLoopIds],
    tourSteps: graph.tourSteps?.map((s) => ({ ...s })) as LinkerTourStep[] | undefined,
  };
}

/** At most one exit link per from-node — remove prior link from same source. */
export function addLink(
  graph: LinkerGraphState,
  fromNodeId: string,
  toNodeId: string
): LinkerLink | null {
  if (fromNodeId === toNodeId) return null;
  if (!nodeById(graph, fromNodeId) || !nodeById(graph, toNodeId)) return null;

  graph.links = graph.links.filter((l) => l.fromNodeId !== fromNodeId);
  const link: LinkerLink = { id: nextLinkId(), fromNodeId, toNodeId };
  graph.links.push(link);
  return link;
}

export function removeLink(graph: LinkerGraphState, linkId: string): boolean {
  const before = graph.links.length;
  graph.links = graph.links.filter((l) => l.id !== linkId);
  return graph.links.length < before;
}

export function linkFromNode(graph: LinkerGraphState, nodeId: string): LinkerLink | undefined {
  return graph.links.find((l) => l.fromNodeId === nodeId);
}

export function hitTestNode(
  graph: LinkerGraphState,
  probe: G90Point,
  radiusMm = NODE_HIT_MM
): LinkerNode | null {
  let best: LinkerNode | null = null;
  let bestDist = radiusMm;
  for (const node of graph.nodes) {
    const d = distG90(probe, node.point);
    if (d < bestDist) {
      bestDist = d;
      best = node;
    }
  }
  return best;
}

export function hitTestLink(
  graph: LinkerGraphState,
  probe: G90Point,
  radiusMm = NODE_HIT_MM
): LinkerLink | null {
  let best: LinkerLink | null = null;
  let bestDist = radiusMm;
  for (const link of graph.links) {
    const from = nodeById(graph, link.fromNodeId);
    const to = nodeById(graph, link.toNodeId);
    if (!from || !to) continue;
    const d = distPointToPolylineG90(probe, [from.point, to.point]);
    if (d < bestDist) {
      bestDist = d;
      best = link;
    }
  }
  return best;
}

function pushUnique(out: G90Point[], pt: G90Point): void {
  const last = out[out.length - 1];
  if (last && sameG90(last, pt)) return;
  out.push(pt);
}

function linkLeg(from: G90Point, to: G90Point): G90Point[] {
  if (sameG90(from, to)) return [];
  return [to];
}

/** Polyline along loop from entry index to exit index (inclusive), respecting direction. */
export function sliceLoopTraversal(
  loop: CutLoop,
  reversed: boolean,
  entryIndex: number,
  exitIndex: number
): G90Point[] {
  const n = loop.points.length;
  if (n === 0) return [];
  if (n === 1) return [{ ...loop.points[0] }];

  const out: G90Point[] = [];
  const step = reversed ? -1 : 1;

  if (loop.cncType === 'closed') {
    let i = entryIndex;
    out.push({ ...loop.points[i] });
    if (entryIndex === exitIndex) {
      const startI = i;
      do {
        i = (i + step + n) % n;
        out.push({ ...loop.points[i] });
      } while (i !== startI);
      return out;
    }
    while (i !== exitIndex) {
      i = (i + step + n) % n;
      out.push({ ...loop.points[i] });
    }
    return out;
  }

  if (!reversed) {
    const start = Math.min(entryIndex, exitIndex);
    const end = Math.max(entryIndex, exitIndex);
    for (let i = start; i <= end; i += 1) out.push({ ...loop.points[i] });
  } else {
    const start = Math.max(entryIndex, exitIndex);
    const end = Math.min(entryIndex, exitIndex);
    for (let i = start; i >= end; i -= 1) out.push({ ...loop.points[i] });
  }
  return out;
}

export function pathLengthG90(points: G90Point[]): number {
  let len = 0;
  for (let i = 1; i < points.length; i += 1) {
    len += distG90(points[i - 1], points[i]);
  }
  return len;
}

/** Shortest arc between two nodes on the same loop (closed loops try both directions). */
export function sliceLoopBetweenNodes(
  loop: CutLoop,
  entryNodeId: string,
  exitNodeId: string
): { points: G90Point[]; reversed: boolean } | null {
  const entryParsed = parseNodeId(entryNodeId);
  const exitParsed = parseNodeId(exitNodeId);
  if (!entryParsed || !exitParsed || entryParsed.loopId !== loop.id || exitParsed.loopId !== loop.id) {
    return null;
  }

  const entryIdx = entryParsed.pointIndex;
  const exitIdx = exitParsed.pointIndex;
  const fwd = sliceLoopTraversal(loop, false, entryIdx, exitIdx);
  const rev = sliceLoopTraversal(loop, true, entryIdx, exitIdx);

  if (entryIdx === exitIdx && loop.cncType === 'closed') {
    const fwdLen = pathLengthG90(fwd);
    const revLen = pathLengthG90(rev);
    return revLen < fwdLen ? { points: rev, reversed: true } : { points: fwd, reversed: false };
  }

  if (pathLengthG90(rev) < pathLengthG90(fwd)) {
    return { points: rev, reversed: true };
  }
  return { points: fwd, reversed: false };
}

export function nearestNodeOnLoop(
  graph: LinkerGraphState,
  loopId: string,
  ref: G90Point
): LinkerNode | null {
  let best: LinkerNode | null = null;
  let bestDist = Infinity;
  for (const node of graph.nodes) {
    if (node.loopId !== loopId) continue;
    const d = distG90(node.point, ref);
    if (d < bestDist) {
      bestDist = d;
      best = node;
    }
  }
  return best;
}

function lastTourStepExitNodeId(steps: LinkerTourStep[]): string | null {
  for (let i = steps.length - 1; i >= 0; i -= 1) {
    const step = steps[i];
    if (step.type === 'cut') return step.exitNodeId;
    if (step.type === 'link') return step.toNodeId;
  }
  return null;
}

function appendTourStepsToProgram(
  graph: LinkerGraphState,
  steps: LinkerTourStep[],
  segments: LinkerSegment[],
  linkLegs: G90Point[][],
  start: G90Point
): { current: G90Point; tourIndex: number } {
  let current = { ...start };
  let tourIndex = 0;

  for (const step of steps) {
    if (step.type === 'link') {
      const toNode = nodeById(graph, step.toNodeId);
      if (!toNode) continue;
      const leg = linkLeg(current, toNode.point);
      if (leg.length > 0) {
        linkLegs.push([current, ...leg]);
        segments.push({ kind: 'link', points: leg });
        current = toNode.point;
      }
      continue;
    }

    const loop = loopById(graph, step.loopId);
    if (!loop) continue;
    const sliced = sliceLoopBetweenNodes(loop, step.entryNodeId, step.exitNodeId);
    const cutPts = sliced?.points ?? [];
    const reversed = step.reversed ?? sliced?.reversed ?? false;
    graph.reversed[step.loopId] = reversed;
    if (cutPts.length > 0) {
      tourIndex += 1;
      segments.push({
        kind: 'cut',
        points: cutPts,
        loopId: loop.id,
        tourIndex,
        sourceId: loop.sourceId,
      });
      current = cutPts[cutPts.length - 1];
    }
  }

  return { current, tourIndex };
}

export function loopEntryExitFromLinks(
  graph: LinkerGraphState,
  loopId: string,
  start: G90Point
): { entryNodeId: string; exitNodeId: string } | null {
  let entryNodeId: string | null = null;
  let exitNodeId: string | null = null;

  for (const link of graph.links) {
    const from = nodeById(graph, link.fromNodeId);
    const to = nodeById(graph, link.toNodeId);
    if (to?.loopId === loopId) entryNodeId = to.id;
    if (from?.loopId === loopId) exitNodeId = from.id;
  }

  const loop = loopById(graph, loopId);
  if (!loop) return null;

  if (!entryNodeId || !exitNodeId) {
    const pick = pickBestEntryExitNodes(loop, start);
    return pick;
  }

  return { entryNodeId, exitNodeId };
}

export function recomputeTourLoopIds(graph: LinkerGraphState): string[] {
  if (graph.tourLoopIds.length > 0) {
    const valid = graph.tourLoopIds.filter((id) => graph.loops.some((l) => l.id === id));
    if (valid.length > 0) return valid;
  }
  const partialLoopIds = new Set(
    (graph.tourSteps ?? [])
      .filter((s) => s.type === 'cut')
      .map((s) => s.loopId)
  );
  const linked = new Set<string>();
  for (const link of graph.links) {
    const from = nodeById(graph, link.fromNodeId);
    const to = nodeById(graph, link.toNodeId);
    if (from) linked.add(from.loopId);
    if (to) linked.add(to.loopId);
  }
  return sortLoopsInnerBeforeOuter(graph.loops)
    .filter((l) => linked.has(l.id) && !partialLoopIds.has(l.id))
    .map((l) => l.id);
}

export function isFullyLinked(graph: LinkerGraphState): boolean {
  if (graph.loops.length === 0) return false;
  const linkedLoops = new Set<string>();
  for (const link of graph.links) {
    const from = nodeById(graph, link.fromNodeId);
    const to = nodeById(graph, link.toNodeId);
    if (from) linkedLoops.add(from.loopId);
    if (to) linkedLoops.add(to.loopId);
  }
  return graph.loops.every((l) => linkedLoops.has(l.id));
}

function shoelaceArea(points: G90Point[]): number {
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

/** Nesting depth — higher = more inner (hole inside outer letter). */
export function loopNestingDepthMap(loops: CutLoop[]): Map<string, number> {
  const closed = loops.filter((l) => l.cncType === 'closed');
  const depth = new Map<string, number>();

  for (const loop of closed) {
    let d = 0;
    const area = shoelaceArea(loop.points);
    for (const other of closed) {
      if (other.id === loop.id) continue;
      if (shoelaceArea(other.points) <= area) continue;
      if (pointInPolygon(loop.centroid, other.points)) d += 1;
    }
    depth.set(loop.id, d);
  }

  for (const loop of loops) {
    if (!depth.has(loop.id)) depth.set(loop.id, 0);
  }

  return depth;
}

/** Inner contours before containing outers (BK inner-before-outer). */
export function sortLoopsInnerBeforeOuter(loops: CutLoop[]): CutLoop[] {
  const closed = loops.filter((l) => l.cncType === 'closed');
  const open = loops.filter((l) => l.cncType !== 'closed');
  const depth = loopNestingDepthMap(loops);

  const sortedClosed = [...closed].sort((a, b) => {
    const da = depth.get(a.id) ?? 0;
    const db = depth.get(b.id) ?? 0;
    if (da !== db) return db - da;
    return shoelaceArea(a.points) - shoelaceArea(b.points);
  });

  return [...sortedClosed, ...open];
}

/** Build linked G90 program: START, tour, out-and-back link return, home duplicate. */
export function buildLinkedProgram(
  graph: LinkerGraphState,
  startConfig: LinkerStartPointConfig
): LinkerProgramBuildResult {
  const start = resolveLinkerStartPointCnc(startConfig);
  if (graph.loops.length === 0) {
    return { ok: false, reason: 'No cut paths on the bed.' };
  }
  if (graph.links.length === 0 && graph.loops.length > 1) {
    return { ok: false, reason: 'No links — run Auto or connect nodes manually.' };
  }

  const tourLoopIds = recomputeTourLoopIds(graph);
  const presetSteps = graph.tourSteps ?? [];
  if (tourLoopIds.length === 0 && presetSteps.length === 0) {
    return { ok: false, reason: 'Could not resolve tour from links.' };
  }

  const segments: LinkerSegment[] = [];
  const linkLegs: G90Point[][] = [];
  let current: G90Point = { ...start };
  let tourIndex = 0;

  if (presetSteps.length > 0) {
    const built = appendTourStepsToProgram(graph, presetSteps, segments, linkLegs, start);
    current = built.current;
    tourIndex = built.tourIndex;

    const lastNodeId = lastTourStepExitNodeId(presetSteps);
    if (lastNodeId) {
      const exitLink = linkFromNode(graph, lastNodeId);
      if (exitLink) {
        const nextNode = nodeById(graph, exitLink.toNodeId);
        if (nextNode) {
          const leg = linkLeg(current, nextNode.point);
          if (leg.length > 0) {
            linkLegs.push([current, ...leg]);
            segments.push({ kind: 'link', points: leg, linkId: exitLink.id });
            current = nextNode.point;
          }
        }
      }
    }
  } else {
    const firstLoopId = tourLoopIds[0];
    const firstEnds = loopEntryExitFromLinks(graph, firstLoopId, start);
    const firstEntry = firstEnds ? nodeById(graph, firstEnds.entryNodeId) : null;
    if (!firstEntry) {
      return { ok: false, reason: 'Invalid tour entry.' };
    }

    const toFirst = linkLeg(current, firstEntry.point);
    if (toFirst.length > 0) {
      linkLegs.push([current, ...toFirst]);
      segments.push({ kind: 'link', points: toFirst });
      current = firstEntry.point;
    }
  }

  for (let si = 0; si < tourLoopIds.length; si += 1) {
    const loopId = tourLoopIds[si];
    const loop = loopById(graph, loopId);
    if (!loop) continue;

    const ends = loopEntryExitFromLinks(graph, loopId, start);
    if (!ends) continue;

    const reversed = graph.reversed[loop.id] ?? false;
    const entryNode = nodeById(graph, ends.entryNodeId);
    const exitNode = nodeById(graph, ends.exitNodeId);
    if (!entryNode || !exitNode) continue;

    const entryIdx = entryNode.pointIndex;
    const exitIdx = exitNode.pointIndex;

    const cutPts = sliceLoopTraversal(loop, reversed, entryIdx, exitIdx);
    if (cutPts.length > 0) {
      tourIndex += 1;
      segments.push({
        kind: 'cut',
        points: cutPts,
        loopId: loop.id,
        tourIndex,
        sourceId: loop.sourceId,
      });
      current = cutPts[cutPts.length - 1];
    }

    const exitLink = linkFromNode(graph, exitNode.id);
    if (exitLink) {
      const nextNode = nodeById(graph, exitLink.toNodeId);
      if (nextNode) {
        const leg = linkLeg(current, nextNode.point);
        if (leg.length > 0) {
          linkLegs.push([current, ...leg]);
          segments.push({ kind: 'link', points: leg, linkId: exitLink.id });
          current = nextNode.point;
        }
      }
    }
  }

  for (let i = linkLegs.length - 1; i >= 0; i -= 1) {
    const reversed = [...linkLegs[i]].reverse();
    const returnPts = reversed.slice(1);
    if (returnPts.length > 0) {
      segments.push({ kind: 'link', points: returnPts });
      current = returnPts[returnPts.length - 1];
    }
  }

  if (!sameG90(current, start)) {
    const finalLeg = linkLeg(current, start);
    if (finalLeg.length > 0) segments.push({ kind: 'link', points: finalLeg });
  }

  const program: LinkerG90Program = { start, segments, mode: 'linked' };
  return { ok: true, program, graph };
}

/** Unlinked save-yes: greedy stitch all loops, no START/home. */
export function buildUnlinkedStitchProgram(
  graph: LinkerGraphState
): LinkerProgramBuildResult {
  if (graph.loops.length === 0) {
    return { ok: false, reason: 'No cut paths on the bed.' };
  }

  const remaining = new Set(graph.loops.map((l) => l.id));
  const segments: LinkerSegment[] = [];
  let current: G90Point | null = null;

  while (remaining.size > 0) {
    let bestId: string | null = null;
    let bestDist = Infinity;
    let bestReversed = false;
    let bestEntry: G90Point | null = null;
    let bestExit: G90Point | null = null;

    for (const id of remaining) {
      const loop = loopById(graph, id);
      if (!loop) continue;
      const from = current ?? loop.centroid;
      const entry = bestLoopEntry(from, loop.points);
      const d = distG90(from, entry.entry);
      if (d < bestDist) {
        bestDist = d;
        bestId = id;
        bestReversed = entry.reversed;
        bestEntry = entry.entry;
        bestExit = entry.exit;
      }
    }

    if (!bestId || !bestEntry || !bestExit) break;
    const loop = loopById(graph, bestId)!;
    graph.reversed[bestId] = bestReversed;
    const cutPts = loopPoints(loop, bestReversed);

    if (current) {
      const leg = linkLeg(current, bestEntry);
      if (leg.length > 0) segments.push({ kind: 'link', points: leg });
    }

    segments.push({
      kind: 'cut',
      points: cutPts,
      loopId: loop.id,
      sourceId: loop.sourceId,
    });
    current = bestExit;
    remaining.delete(bestId);
  }

  const program: LinkerG90Program = {
    start: current ?? { x: 0, y: 0 },
    segments,
    mode: 'unlinked',
  };
  return { ok: true, program, graph };
}

export function toggleLoopReversed(graph: LinkerGraphState, loopId: string): void {
  graph.reversed[loopId] = !graph.reversed[loopId];
}

function nearestPointIndex(points: G90Point[], target: G90Point): number {
  if (points.length === 0) return 0;
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i < points.length; i += 1) {
    const d = distG90(points[i], target);
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  }
  return best;
}

/** Entry at nearest vertex to `from`; direction chosen for cut along contour (not SVG default). */
export function pickLoopEntryExitFromNearest(
  loop: CutLoop,
  from: G90Point
): { entryNodeId: string; exitNodeId: string; reversed: boolean } {
  const n = loop.points.length;
  const entryIdx = nearestPointIndex(loop.points, from);

  if (loop.cncType === 'closed' || n <= 1) {
    return {
      entryNodeId: makeNodeId(loop.id, entryIdx),
      exitNodeId: makeNodeId(loop.id, entryIdx),
      reversed: false,
    };
  }

  const toStart = entryIdx;
  const toEnd = n - 1 - entryIdx;
  if (toStart >= toEnd) {
    return {
      entryNodeId: makeNodeId(loop.id, entryIdx),
      exitNodeId: makeNodeId(loop.id, 0),
      reversed: entryIdx > 0,
    };
  }

  return {
    entryNodeId: makeNodeId(loop.id, entryIdx),
    exitNodeId: makeNodeId(loop.id, n - 1),
    reversed: false,
  };
}

export function findNearestNode(
  graph: LinkerGraphState,
  from: G90Point
): { node: LinkerNode; dist: number } | null {
  let best: LinkerNode | null = null;
  let bestDist = Infinity;
  for (const node of graph.nodes) {
    const d = distG90(from, node.point);
    if (d < bestDist) {
      bestDist = d;
      best = node;
    }
  }
  return best ? { node: best, dist: bestDist } : null;
}

export function pickBestEntryExitNodes(
  loop: CutLoop,
  from: G90Point
): { entryNodeId: string; exitNodeId: string; reversed: boolean } {
  const entry = bestLoopEntry(from, loop.points);
  const entryIdx = nearestPointIndex(loop.points, entry.entry);
  const exitIdx = nearestPointIndex(loop.points, entry.exit);
  return {
    entryNodeId: makeNodeId(loop.id, entryIdx),
    exitNodeId: makeNodeId(loop.id, exitIdx),
    reversed: entry.reversed,
  };
}
