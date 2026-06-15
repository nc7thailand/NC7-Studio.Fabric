/**
 * Auto Link engine v2 — NNOE + Book (sandbox wire / NoLink load model).
 *
 * Spec: docs/vector-linker/AUTO_LINK_DRAFT.md
 * Legacy Fabric graph auto-link: linkerAutoLink.ts (unchanged).
 */

import type { SvgPoint } from './abc1LinkedPolyline';
import {
  buildContourWireRanges,
  findNearestWirePointIndex,
  type ContourWireRange,
  type LinkerLoadTransformResult,
} from './linkerLoadTransform';
import type { LinkerStartPointConfig } from './linkerStartPoint';
import {
  buildAbc1ReferenceAutoLink,
  isAbc1SandboxLoad,
} from './linkerReferenceTour';
import type { LinkChordPair } from './linkerEvidenceLinks';

const COORD_EPS = 0.001;
const DIST_EPS = 1e-6;

export interface AutoLinkNnoeInput {
  load: LinkerLoadTransformResult;
  /** 1-based wire node numbers at loop M/start — excluded from link targets and Book. */
  loopStartNodes: ReadonlySet<number>;
  /** START in linker-frame SVG coords (Y down, headroom band). */
  startSvg: SvgPoint;
  /** Vector Linker ABC1-linked export (polyline tour) — enables reference mode. */
  referenceLinkedSvgText?: string;
}

export interface AutoLinkNnoeResult {
  ok: boolean;
  reason?: string;
  /** 1-based border node → 1-based border node (user link chords). */
  links: Map<number, number>;
  /** Full tour link chords for sandbox overlay (reference mode). */
  displayLinkChords?: LinkChordPair[];
  /** 0-based wire index — nearest vertex to SP (first entry). */
  entryWireIndex: number;
  /** Full sim steps from Vector Linker reference tour (ABC1 only). */
  tourStepIndices?: number[];
  mode?: 'abc1-reference' | 'nnoe-greedy';
}

function coordKey(p: SvgPoint): string {
  return `${p.x.toFixed(3)},${p.y.toFixed(3)}`;
}

function samePoint(a: SvgPoint, b: SvgPoint): boolean {
  return Math.abs(a.x - b.x) < COORD_EPS && Math.abs(a.y - b.y) < COORD_EPS;
}

function dist(a: SvgPoint, b: SvgPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function buildContourOfWireIndex(
  ranges: readonly ContourWireRange[],
  pointCount: number
): Int32Array {
  const contourOf = new Int32Array(pointCount);
  contourOf.fill(-1);
  ranges.forEach((range, contourIndex) => {
    for (let i = range.startWireIndex; i <= range.endWireIndex; i += 1) {
      contourOf[i] = contourIndex;
    }
  });
  return contourOf;
}

function isLinkableNode(node1: number, loopStarts: ReadonlySet<number>): boolean {
  return node1 >= 1 && !loopStarts.has(node1);
}

function shouldRecordBook(node1: number, loopStarts: ReadonlySet<number>): boolean {
  return !loopStarts.has(node1);
}

function loopBorderResumeWireIndex(
  wi: number,
  points: readonly SvgPoint[],
  contourRanges: readonly ContourWireRange[],
  visited: ReadonlySet<number>
): number | null {
  for (const range of contourRanges) {
    if (!range.closed) continue;
    if (wi < range.startWireIndex || wi > range.endWireIndex) continue;
    const loopStart = range.startWireIndex;
    if (wi <= loopStart) continue;
    if (!samePoint(points[wi], points[loopStart])) continue;
    const next = loopStart + 1;
    if (next > range.endWireIndex || visited.has(next)) continue;
    return next;
  }
  return null;
}

/** Next wire index along border forward (wrap closed loops at link segments). */
function nextForwardBorderIndex(
  wi: number,
  points: readonly SvgPoint[],
  linkSegmentFlags: readonly boolean[],
  contourRanges: readonly ContourWireRange[],
  visited: ReadonlySet<number>
): number | null {
  if (wi < 0 || wi >= points.length) return null;

  if (wi < linkSegmentFlags.length && linkSegmentFlags[wi]) {
    const resume = loopBorderResumeWireIndex(wi, points, contourRanges, visited);
    if (resume != null) return resume;
    return null;
  }

  const next = wi + 1;
  if (next >= points.length) return null;
  return next;
}

function pickRandomIndex(indices: number[]): number {
  return indices[Math.floor(Math.random() * indices.length)];
}

function findNNOE(
  fromWi: number,
  points: readonly SvgPoint[],
  contourOf: Int32Array,
  loopStarts: ReadonlySet<number>,
  book: ReadonlySet<string>
): number | null {
  const fromContour = contourOf[fromWi];
  if (fromContour < 0) return null;
  const from = points[fromWi];

  let bestDist = Infinity;
  const tied: number[] = [];

  for (let j = 0; j < points.length; j += 1) {
    if (j === fromWi) continue;
    if (contourOf[j] === fromContour) continue;
    if (!isLinkableNode(j + 1, loopStarts)) continue;

    const key = coordKey(points[j]);
    if (book.has(key)) continue;

    const d = dist(from, points[j]);
    if (d < bestDist - DIST_EPS) {
      bestDist = d;
      tied.length = 0;
      tied.push(j);
    } else if (Math.abs(d - bestDist) <= DIST_EPS) {
      tied.push(j);
    }
  }

  if (tied.length === 0) return null;
  return pickRandomIndex(tied);
}

function findBestLinkExitWi(
  startWi: number,
  nnoeWi: number,
  points: readonly SvgPoint[],
  linkSegmentFlags: readonly boolean[],
  contourRanges: readonly ContourWireRange[],
  loopStarts: ReadonlySet<number>
): number | null {
  const target = points[nnoeWi];
  let bestWi: number | null = null;
  let bestDist = Infinity;
  let wi = startWi;
  const visited = new Set<number>([startWi]);

  if (isLinkableNode(startWi + 1, loopStarts)) {
    bestWi = startWi;
    bestDist = dist(points[startWi], target);
  }

  for (let guard = 0; guard < points.length + 4; guard += 1) {
    const next = nextForwardBorderIndex(wi, points, linkSegmentFlags, contourRanges, visited);
    if (next == null || visited.has(next)) break;
    wi = next;
    visited.add(wi);
    if (!isLinkableNode(wi + 1, loopStarts)) continue;
    const d = dist(points[wi], target);
    if (d < bestDist - DIST_EPS) {
      bestDist = d;
      bestWi = wi;
    }
    if (wi === startWi) break;
  }

  return bestWi;
}

function trySetLink(
  links: Map<number, number>,
  fromNode: number,
  toNode: number,
  loopStarts: ReadonlySet<number>
): boolean {
  if (fromNode === toNode) return false;
  if (!isLinkableNode(fromNode, loopStarts) || !isLinkableNode(toNode, loopStarts)) return false;
  if (links.has(fromNode)) return false;
  links.set(fromNode, toNode);
  return true;
}

function recordBook(
  wi: number,
  points: readonly SvgPoint[],
  loopStarts: ReadonlySet<number>,
  book: Set<string>
): void {
  if (!shouldRecordBook(wi + 1, loopStarts)) return;
  book.add(coordKey(points[wi]));
}

function walkForwardUntilEntry(
  entryWi: number,
  points: readonly SvgPoint[],
  linkSegmentFlags: readonly boolean[],
  contourRanges: readonly ContourWireRange[],
  loopStarts: ReadonlySet<number>,
  book: Set<string>
): { path: number[]; endedAtEntry: boolean } {
  const entryKey = coordKey(points[entryWi]);
  const path: number[] = [entryWi];
  const visited = new Set<number>([entryWi]);
  let wi = entryWi;

  for (let guard = 0; guard < points.length + 8; guard += 1) {
    const next = nextForwardBorderIndex(wi, points, linkSegmentFlags, contourRanges, visited);
    if (next == null) break;
    wi = next;
    if (visited.has(wi) && wi !== entryWi) break;
    visited.add(wi);
    recordBook(wi, points, loopStarts, book);
    path.push(wi);
    if (path.length > 1 && coordKey(points[wi]) === entryKey) {
      return { path, endedAtEntry: true };
    }
  }

  return { path, endedAtEntry: false };
}

function findNearestLinkableWireIndex(
  points: readonly SvgPoint[],
  target: SvgPoint,
  loopStarts: ReadonlySet<number>
): number {
  let best = -1;
  let bestDist = Infinity;
  for (let i = 0; i < points.length; i += 1) {
    if (!isLinkableNode(i + 1, loopStarts)) continue;
    const d = dist(points[i], target);
    if (d < bestDist - DIST_EPS) {
      bestDist = d;
      best = i;
    }
  }
  return best;
}

function allLinkableBorderInBook(
  points: readonly SvgPoint[],
  loopStarts: ReadonlySet<number>,
  book: ReadonlySet<string>
): boolean {
  for (let i = 0; i < points.length; i += 1) {
    if (!isLinkableNode(i + 1, loopStarts)) continue;
    if (!book.has(coordKey(points[i]))) return false;
  }
  return true;
}

/**
 * NNOE + Book auto-link for sandbox wire order.
 * Option A: out-and-back after each object visit (simulated in state, not extra link chords).
 */
export function runAutoLinkNnoeBook(input: AutoLinkNnoeInput): AutoLinkNnoeResult {
  const { load, loopStartNodes, startSvg, referenceLinkedSvgText } = input;
  const { points, linkSegmentFlags, contours } = load;

  if (points.length < 2) {
    return { ok: false, reason: 'Not enough wire points.', links: new Map(), entryWireIndex: 0 };
  }

  if (isAbc1SandboxLoad(load) && referenceLinkedSvgText?.trim()) {
    const reference = buildAbc1ReferenceAutoLink(referenceLinkedSvgText, load, loopStartNodes);
    if (reference) {
      return {
        ok: true,
        links: reference.links,
        displayLinkChords: reference.displayLinkChords,
        entryWireIndex: reference.entryWireIndex,
        tourStepIndices: reference.tourStepIndices,
        mode: 'abc1-reference',
      };
    }
  }

  const contourRanges = buildContourWireRanges(contours);
  const contourOf = buildContourOfWireIndex(contourRanges, points.length);
  const book = new Set<string>();
  const links = new Map<number, number>();

  const entryWireIndex = findNearestWirePointIndex(points, startSvg);
  let wi = entryWireIndex;
  recordBook(wi, points, loopStartNodes, book);

  const maxIterations = points.length * Math.max(contours.length, 1) * 8;

  for (let iter = 0; iter < maxIterations; iter += 1) {
    if (allLinkableBorderInBook(points, loopStartNodes, book)) break;

    const nnoeWi = findNNOE(wi, points, contourOf, loopStartNodes, book);

    if (nnoeWi == null) {
      const visited = new Set<number>([wi]);
      const next = nextForwardBorderIndex(wi, points, linkSegmentFlags, contourRanges, visited);
      if (next == null) break;
      wi = next;
      recordBook(wi, points, loopStartNodes, book);
      continue;
    }

    const exitWi = findBestLinkExitWi(
      wi,
      nnoeWi,
      points,
      linkSegmentFlags,
      contourRanges,
      loopStartNodes
    );
    if (exitWi == null) {
      const visited = new Set<number>([wi]);
      const next = nextForwardBorderIndex(wi, points, linkSegmentFlags, contourRanges, visited);
      if (next == null) break;
      wi = next;
      recordBook(wi, points, loopStartNodes, book);
      continue;
    }

    const fromNode = exitWi + 1;
    const toNode = nnoeWi + 1;
    if (!trySetLink(links, fromNode, toNode, loopStartNodes)) {
      const visited = new Set<number>([wi]);
      const next = nextForwardBorderIndex(wi, points, linkSegmentFlags, contourRanges, visited);
      if (next == null) break;
      wi = next;
      recordBook(wi, points, loopStartNodes, book);
      continue;
    }

    wi = nnoeWi;
    recordBook(wi, points, loopStartNodes, book);

    const visit = walkForwardUntilEntry(
      wi,
      points,
      linkSegmentFlags,
      contourRanges,
      loopStartNodes,
      book
    );

    if (visit.endedAtEntry && visit.path.length > 1) {
      wi = visit.path[0];
      for (let i = visit.path.length - 2; i >= 0; i -= 1) {
        wi = visit.path[i];
      }
    } else if (visit.path.length > 0) {
      wi = visit.path[visit.path.length - 1];
    }
  }

  const homingTarget = findNearestLinkableWireIndex(points, startSvg, loopStartNodes);
  if (homingTarget >= 0 && isLinkableNode(wi + 1, loopStartNodes)) {
    const homingKey = coordKey(points[homingTarget]);
    const atHome = samePoint(points[wi], startSvg) || coordKey(points[wi]) === homingKey;
    if (!atHome && homingTarget !== wi) {
      trySetLink(links, wi + 1, homingTarget + 1, loopStartNodes);
    }
  }

  return { ok: true, links, entryWireIndex, mode: 'nnoe-greedy' };
}

/** START config → linker-frame SVG point for nearest-entry search. */
export function linkerStartToSvgFramePoint(start: LinkerStartPointConfig): SvgPoint {
  return { x: start.xMm, y: -start.yMm };
}
