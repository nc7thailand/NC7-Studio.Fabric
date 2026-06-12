import type { FabricObject } from 'fabric';
import { distG90 } from './linkerGeometry';
import {
  applyLetterBAutoTour,
  detectLetterBParts,
  isLetterBLoop,
} from './linkerAutoLetterB';
import {
  addLink,
  buildLinkedProgram,
  buildNodesFromLoops,
  findNearestNode,
  loopNestingDepthMap,
  pickLoopEntryExitFromNearest,
  upsertLinkerStartNode,
} from './linkerNodeGraph';
import { LINKER_START_NODE_ID } from './linkerTypes';
import { collectCutLoops } from './linkerPathExtract';
import type { LinkerStartPointConfig } from './linkerStartPoint';
import { resolveLinkerStartPointCnc } from './linkerStartPoint';
import type { G90Point, LinkerAutoLinkResult, LinkerGraphState } from './linkerTypes';
import { createEmptyGraph, loopById, nodeById } from './linkerTypes';

const TIE_EPS_MM = 0.5;

/**
 * Auto link v5 — greedy EPS + BK letter B stem-hub pattern when B is reached:
 * 1. Greedy nearest unvisited contour; tie-break inner-before-outer
 * 2. When next pick is B (outer or bowl): stem ↔ upper bowl ↔ stem ↔ lower bowl
 * 3. B outer perimeter remains for a later greedy pass
 */
export function runAutoLinkGraph(
  objects: FabricObject[],
  startConfig: LinkerStartPointConfig,
  existing?: LinkerGraphState | null
): LinkerAutoLinkResult {
  const loops = collectCutLoops(objects);
  if (loops.length === 0) {
    return { ok: false, reason: 'No cut paths on the bed.' };
  }

  const graph: LinkerGraphState = existing
    ? {
        ...existing,
        loops,
        nodes: buildNodesFromLoops(loops),
        links: [],
        tourLoopIds: [],
        reversed: { ...existing.reversed },
      }
    : { ...createEmptyGraph(loops), nodes: buildNodesFromLoops(loops) };

  graph.loops = loops;
  graph.nodes = buildNodesFromLoops(loops);
  graph.links = [];
  graph.reversed = {};
  graph.tourLoopIds = [];
  graph.tourSteps = [];

  const start = resolveLinkerStartPointCnc(startConfig);
  upsertLinkerStartNode(graph, start);
  const depth = loopNestingDepthMap(loops);
  const remaining = new Set(loops.map((l) => l.id));

  const nearestToStart = findNearestNode(graph, start);
  if (!nearestToStart) {
    return { ok: false, reason: 'No linker nodes on cut paths.' };
  }

  let current: G90Point = { ...start };
  let prevExitNodeId: string | null = null;
  let letterBApplied = false;
  const letterBParts = detectLetterBParts(loops);

  const visitLoop = (loopId: string, from: G90Point): void => {
    const loop = loopById(graph, loopId);
    if (!loop) return;

    const pick = pickLoopEntryExitFromNearest(loop, from);
    graph.reversed[loop.id] = pick.reversed;

    if (prevExitNodeId) {
      addLink(graph, prevExitNodeId, pick.entryNodeId);
    } else {
      addLink(graph, LINKER_START_NODE_ID, pick.entryNodeId);
    }

    graph.tourLoopIds.push(loop.id);
    prevExitNodeId = pick.exitNodeId;
    const exitNode = nodeById(graph, pick.exitNodeId);
    current = exitNode?.point ?? current;
    remaining.delete(loop.id);
  };

  visitLoop(nearestToStart.node.loopId, start);

  while (remaining.size > 0) {
    let bestLoopId: string | null = null;
    let bestDist = Infinity;
    let bestDepth = -1;

    for (const loopId of remaining) {
      const loop = loopById(graph, loopId);
      if (!loop) continue;

      const pick = pickLoopEntryExitFromNearest(loop, current);
      const entryNode = nodeById(graph, pick.entryNodeId);
      if (!entryNode) continue;

      const d = distG90(current, entryNode.point);
      const nest = depth.get(loopId) ?? 0;

      if (
        d < bestDist - TIE_EPS_MM ||
        (Math.abs(d - bestDist) <= TIE_EPS_MM && nest > bestDepth)
      ) {
        bestDist = d;
        bestDepth = nest;
        bestLoopId = loopId;
      }
    }

    if (!bestLoopId) break;

    if (
      !letterBApplied &&
      letterBParts &&
      isLetterBLoop(bestLoopId, letterBParts)
    ) {
      const letterB = applyLetterBAutoTour(graph, prevExitNodeId, letterBParts);
      if (letterB) {
        letterBApplied = true;
        current = letterB.exitPoint;
        prevExitNodeId = letterB.exitNodeId;
        for (const loopId of letterB.consumedLoopIds) {
          remaining.delete(loopId);
        }
        continue;
      }
    }

    visitLoop(bestLoopId, current);
  }

  const built = buildLinkedProgram(graph, startConfig);
  if (!built.ok) return { ok: false, reason: built.reason };

  return { ok: true, graph, program: built.program };
}
