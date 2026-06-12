/** G90 absolute CNC coordinate (mm). Origin = block top-left; Y+ up. */
export interface G90Point {
  x: number;
  y: number;
}

export type LinkerSegmentKind = 'link' | 'cut';
export type CncLoopType = 'closed' | 'open';

export interface CutLoop {
  /** Stable id: `${sourceId}:${pathIndex}:${subpathIndex}` */
  id: string;
  sourceId: string;
  pathIndex: number;
  subpathIndex: number;
  points: G90Point[];
  cncType: CncLoopType;
  centroid: G90Point;
}

/** Red dot on a path polyline vertex. */
export interface LinkerNode {
  id: string;
  loopId: string;
  pointIndex: number;
  point: G90Point;
}

/** Green through-foam connector between two nodes. */
export interface LinkerLink {
  id: string;
  fromNodeId: string;
  toNodeId: string;
}

/** Ordered tour step — partial cuts + through-foam links (Vector Linker auto style). */
export type LinkerTourStep =
  | { type: 'link'; fromNodeId: string; toNodeId: string }
  | {
      type: 'cut';
      loopId: string;
      entryNodeId: string;
      exitNodeId: string;
      reversed: boolean;
    };

/** Node + link graph — source of truth for linker tour. */
export interface LinkerGraphState {
  loops: CutLoop[];
  nodes: LinkerNode[];
  links: LinkerLink[];
  /** Per-loop cut direction (traverse points backward when true). */
  reversed: Record<string, boolean>;
  /** Resolved cut order (set by Auto link; recomputed on manual edits). */
  tourLoopIds: string[];
  /** When set, buildLinkedProgram walks these before tourLoopIds (partial contour passes). */
  tourSteps?: LinkerTourStep[];
}

export interface LinkerSegment {
  kind: LinkerSegmentKind;
  points: G90Point[];
  loopId?: string;
  linkId?: string;
  tourIndex?: number;
  sourceId?: string;
}

/** Full linker program — always G90 absolute, never G91 incremental. */
export interface LinkerG90Program {
  start: G90Point;
  segments: LinkerSegment[];
  /** Linked tour includes START + return home; unlinked stitch does not. */
  mode: 'linked' | 'unlinked';
}

export interface LinkerProgramBuildResult {
  ok: boolean;
  reason?: string;
  program?: LinkerG90Program;
  graph?: LinkerGraphState;
  tour?: LinkerTour;
}

export interface LinkerAutoLinkResult {
  ok: boolean;
  reason?: string;
  graph?: LinkerGraphState;
  program?: LinkerG90Program;
}

/** Flattened move list for simulation and G-code output. */
export interface G90Move {
  kind: LinkerSegmentKind;
  x: number;
  y: number;
}

/** @deprecated Loop-order tour — use LinkerGraphState */
export interface LinkerTour {
  loops: CutLoop[];
  order: string[];
  reversed: Record<string, boolean>;
}

/** Virtual graph node at the blue START marker (not on a cut path). */
export const LINKER_START_NODE_ID = '@linker-start';
export const LINKER_START_LOOP_ID = '@linker-start-loop';

export function isLinkerStartNodeId(nodeId: string): boolean {
  return nodeId === LINKER_START_NODE_ID;
}

export function makeNodeId(loopId: string, pointIndex: number): string {
  return `${loopId}@${pointIndex}`;
}

export function parseNodeId(nodeId: string): { loopId: string; pointIndex: number } | null {
  const at = nodeId.lastIndexOf('@');
  if (at < 0) return null;
  const loopId = nodeId.slice(0, at);
  const pointIndex = parseInt(nodeId.slice(at + 1), 10);
  if (!Number.isFinite(pointIndex)) return null;
  return { loopId, pointIndex };
}

export function nodeById(graph: LinkerGraphState, id: string): LinkerNode | undefined {
  return graph.nodes.find((n) => n.id === id);
}

export function loopById(graph: LinkerGraphState, id: string): CutLoop | undefined {
  return graph.loops.find((l) => l.id === id);
}

export function loopPoints(loop: CutLoop, reversed: boolean): G90Point[] {
  if (!reversed) return loop.points;
  return [...loop.points].reverse();
}

export function flattenLinkerProgram(program: LinkerG90Program): G90Move[] {
  const moves: G90Move[] = [];
  if (program.mode === 'linked') {
    moves.push({ kind: 'link', x: program.start.x, y: program.start.y });
    moves.push({ kind: 'link', x: program.start.x, y: program.start.y });
  }
  for (const seg of program.segments) {
    for (const pt of seg.points) {
      moves.push({ kind: seg.kind, x: pt.x, y: pt.y });
    }
  }
  if (program.mode === 'linked') {
    moves.push({ kind: 'link', x: program.start.x, y: program.start.y });
    moves.push({ kind: 'link', x: program.start.x, y: program.start.y });
  }
  return moves;
}

export function createEmptyGraph(loops: CutLoop[]): LinkerGraphState {
  return { loops, nodes: [], links: [], reversed: {}, tourLoopIds: [], tourSteps: [] };
}

/** @deprecated */
export function createEmptyTour(loops: CutLoop[]): LinkerTour {
  return { loops, order: [], reversed: {} };
}

/** @deprecated */
export function tourLoopById(tour: LinkerTour, id: string): CutLoop | undefined {
  return tour.loops.find((l) => l.id === id);
}
