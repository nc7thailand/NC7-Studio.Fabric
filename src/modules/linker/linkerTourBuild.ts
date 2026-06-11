import type { FabricObject } from 'fabric';
import { runAutoLinkGraph } from './linkerAutoLink';
import { buildLinkedProgram, buildUnlinkedStitchProgram } from './linkerNodeGraph';
import type { LinkerStartPointConfig } from './linkerStartPoint';
import type { LinkerAutoLinkResult, LinkerGraphState, LinkerProgramBuildResult } from './linkerTypes';

export function buildProgramFromGraph(
  graph: LinkerGraphState,
  startConfig: LinkerStartPointConfig,
  mode: 'linked' | 'unlinked' = 'linked'
): LinkerProgramBuildResult {
  if (mode === 'unlinked') return buildUnlinkedStitchProgram(graph);
  return buildLinkedProgram(graph, startConfig);
}

export function runAutoLink(
  objects: FabricObject[],
  startConfig: LinkerStartPointConfig,
  existingGraph?: LinkerGraphState | null
): LinkerAutoLinkResult {
  return runAutoLinkGraph(objects, startConfig, existingGraph);
}

/** @deprecated Use buildProgramFromGraph */
export function buildProgramFromTour(): LinkerProgramBuildResult {
  return { ok: false, reason: 'Loop-order tour removed — use link graph.' };
}

/** @deprecated */
export function buildLinkerG90Program(
  objects: FabricObject[],
  startConfig: LinkerStartPointConfig
): LinkerProgramBuildResult {
  const result = runAutoLink(objects, startConfig);
  return {
    ok: result.ok,
    reason: result.reason,
    program: result.program,
    graph: result.graph,
  };
}
