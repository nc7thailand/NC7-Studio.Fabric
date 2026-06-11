import type { FabricObject } from 'fabric';
import {
  addLink,
  buildLinkedProgram,
  buildNodesFromLoops,
  pickBestEntryExitNodes,
  sortLoopsInnerBeforeOuter,
} from './linkerNodeGraph';
import { collectCutLoops } from './linkerPathExtract';
import type { LinkerStartPointConfig } from './linkerStartPoint';
import { resolveLinkerStartPointCnc } from './linkerStartPoint';
import type { G90Point, LinkerAutoLinkResult, LinkerGraphState } from './linkerTypes';
import { createEmptyGraph, nodeById } from './linkerTypes';

/** Auto link v2: inner-before-outer ordering, explicit green links between nodes. */
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

  const start = resolveLinkerStartPointCnc(startConfig);
  const ordered = sortLoopsInnerBeforeOuter(loops);
  graph.tourLoopIds = ordered.map((l) => l.id);

  let current: G90Point = { ...start };
  let prevExitNodeId: string | null = null;

  for (const loop of ordered) {
    const pick = pickBestEntryExitNodes(loop, current);
    graph.reversed[loop.id] = pick.reversed;

    if (prevExitNodeId) {
      addLink(graph, prevExitNodeId, pick.entryNodeId);
    }

    prevExitNodeId = pick.exitNodeId;
    const exitNode = nodeById(graph, pick.exitNodeId);
    current = exitNode?.point ?? current;
  }

  const built = buildLinkedProgram(graph, startConfig);
  if (!built.ok) return { ok: false, reason: built.reason };

  return { ok: true, graph, program: built.program };
}
