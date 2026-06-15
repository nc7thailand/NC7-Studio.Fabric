/**
 * Extract user link chords from a Vector Linker evidence tour polyline.
 * Used to align sandbox Auto Link with ABC1-linked.svg.txt (BK / Vector Linker).
 */

import type { SvgPoint } from './abc1LinkedPolyline';
import {
  buildContourWireRanges,
  findNearestWirePointIndex,
  type ContourWireRange,
  type LinkerLoadTransformResult,
} from './linkerLoadTransform';

const COORD_EPS = 0.05;
const LINK_MIN_MM = 2;

export interface ExtractEvidenceLinksOptions {
  loopStartNodes: ReadonlySet<number>;
  /** Min chord length to count as through-foam link (mm). */
  minLinkMm?: number;
}

/** 1-based border node pair (from → to) for link chord overlay. */
export type LinkChordPair = readonly [fromNode: number, toNode: number];

function sameCoord(a: SvgPoint, b: SvgPoint): boolean {
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

/** Collapse polyline to wire-index sequence (drop consecutive duplicates). */
export function tourPolylineToWireIndexSequence(
  tourPoints: readonly SvgPoint[],
  wirePoints: readonly SvgPoint[]
): number[] {
  const seq: number[] = [];
  for (const p of tourPoints) {
    const wi = findNearestWirePointIndex(wirePoints, p);
    if (seq.length === 0 || seq[seq.length - 1] !== wi) {
      seq.push(wi);
    }
  }
  return seq;
}

/**
 * Walk wire index border forward from `fromWi` toward `toWi` without leaving contour.
 * Returns true if `toWi` is reached by +1 border steps only.
 */
function reachableBorderForward(
  fromWi: number,
  toWi: number,
  points: readonly SvgPoint[],
  linkSegmentFlags: readonly boolean[],
  contourOf: Int32Array
): boolean {
  if (fromWi === toWi) return true;
  const contour = contourOf[fromWi];
  if (contour < 0 || contour !== contourOf[toWi]) return false;

  let wi = fromWi;
  const visited = new Set<number>([fromWi]);
  for (let guard = 0; guard < points.length + 4; guard += 1) {
    if (wi === toWi) return true;
    if (wi >= linkSegmentFlags.length) return false;
    if (linkSegmentFlags[wi]) return false;
    const next = wi + 1;
    if (next >= points.length || contourOf[next] !== contour || visited.has(next)) return false;
    wi = next;
    visited.add(wi);
  }
  return false;
}

function collectTourLinkChordPairs(
  wireSequence: readonly number[],
  load: LinkerLoadTransformResult,
  options: ExtractEvidenceLinksOptions
): LinkChordPair[] {
  const { points, linkSegmentFlags } = load;
  const ranges = buildContourWireRanges(load.contours);
  const contourOf = buildContourOfWireIndex(ranges, points.length);
  const minLink = options.minLinkMm ?? LINK_MIN_MM;
  const seen = new Set<string>();
  const pairs: LinkChordPair[] = [];

  for (let i = 0; i < wireSequence.length - 1; i += 1) {
    const fromWi = wireSequence[i];
    const toWi = wireSequence[i + 1];
    if (fromWi === toWi) continue;

    const pa = points[fromWi];
    const pb = points[toWi];
    if (sameCoord(pa, pb)) continue;

    const stepDist = dist(pa, pb);
    if (stepDist < minLink) continue;

    const isBorderStep = toWi === fromWi + 1 && !linkSegmentFlags[fromWi];
    if (isBorderStep && reachableBorderForward(fromWi, toWi, points, linkSegmentFlags, contourOf)) {
      continue;
    }

    const fromNode = fromWi + 1;
    const toNode = toWi + 1;
    if (options.loopStartNodes.has(fromNode) || options.loopStartNodes.has(toNode)) continue;

    const key = `${fromNode}\t${toNode}`;
    if (seen.has(key)) continue;
    seen.add(key);
    pairs.push([fromNode, toNode]);
  }

  return pairs;
}

/**
 * From ordered tour wire indices, extract every unique 1-based link chord (display overlay).
 * Includes same-letter internal paths (e.g. A outer→inner, B outer→stem/bowl).
 */
export function extractAllUserLinkPairsFromTourWireSequence(
  wireSequence: readonly number[],
  load: LinkerLoadTransformResult,
  options: ExtractEvidenceLinksOptions
): LinkChordPair[] {
  return collectTourLinkChordPairs(wireSequence, load, options);
}

/**
 * From ordered tour wire indices, extract 1-based user link chords.
 * A chord is a tour step that is not a single border edge (wi → wi+1 on same contour).
 */
export function extractUserLinksFromTourWireSequence(
  wireSequence: readonly number[],
  load: LinkerLoadTransformResult,
  options: ExtractEvidenceLinksOptions
): Map<number, number> {
  const links = new Map<number, number>();
  for (const [fromNode, toNode] of collectTourLinkChordPairs(wireSequence, load, options)) {
    if (!links.has(fromNode)) {
      links.set(fromNode, toNode);
    }
  }
  return links;
}

export function extractUserLinksFromLinkedPolylineText(
  linkedSvgText: string,
  load: LinkerLoadTransformResult,
  options: ExtractEvidenceLinksOptions
): Map<number, number> | null {
  const match = linkedSvgText.match(/<polyline\b[^>]*\bpoints\s*=\s*"([^"]+)"/i);
  if (!match?.[1]) return null;

  const tourPoints: SvgPoint[] = [];
  for (const token of match[1].trim().split(/\s+/)) {
    const [xs, ys] = token.split(',');
    const x = Number(xs);
    const y = Number(ys);
    if (Number.isFinite(x) && Number.isFinite(y)) {
      tourPoints.push({ x, y });
    }
  }

  if (tourPoints.length < 2) return null;

  const wireSequence = tourPolylineToWireIndexSequence(tourPoints, load.points);
  return extractUserLinksFromTourWireSequence(wireSequence, load, options);
}

/** Default Vector Linker ABC1 linked export (Google Drive evidence path). */
export const ABC1_LINKED_EVIDENCE_PATH =
  '/Users/nc7foamart/Library/CloudStorage/GoogleDrive-parinypusree@gmail.com/My Drive/1VectorLinkerDemo/ABC1-linked.svg.txt';
