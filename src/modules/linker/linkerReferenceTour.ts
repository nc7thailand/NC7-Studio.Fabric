/**
 * Vector Linker reference tour (ABC1-linked polyline) → sandbox sim steps + display links.
 * Matches BK / Vector Linker export (e.g. ABC1-linked.svg.txt), not greedy NNOE alone.
 */

import type { SvgPoint } from './abc1LinkedPolyline';
import {
  buildContourWireRanges,
  findNearestWirePointIndex,
  type LinkerLoadTransformResult,
} from './linkerLoadTransform';
import {
  extractAllUserLinkPairsFromTourWireSequence,
  tourPolylineToWireIndexSequence,
} from './linkerEvidenceLinks';
import type { LinkChordPair } from './linkerEvidenceLinks';

const START_HEADROOM_MM = 20;
const COORD_EPS = 0.05;

/** VL 1VectorLinkerDemo viewBox minY (−220) → sandbox ABC1 viewBox minY (−20). */
export const VL_DEMO_TO_SANDBOX_Y_OFFSET = 200;

export const ABC1_SANDBOX_REVERSE_LINKED_ASSET = 'ABC1-reverse-linked.svg';
export const ABC1_SANDBOX_FORWARD_LINKED_ASSET = 'ABC1-forward-linked.svg';
/** Legacy alias — same tour as reverse ground truth (sandbox frame). */
export const ABC1_SANDBOX_LINKED_ASSET = 'ABC1-linked.svg';

export type Abc1TourDirection = 'forward' | 'reverse';

export const ABC1_LINKED_REFERENCE_PATHS = [
  '/Users/nc7foamart/Library/CloudStorage/GoogleDrive-parinypusree@gmail.com/My Drive/1VectorLinkerDemo/ABC1-linked.svg.txt',
] as const;

/** Parse `<polyline points="…">` from linked export SVG text. */
export function parseLinkedPolylinePoints(svgText: string): SvgPoint[] | null {
  const match = svgText.match(/<polyline\b[^>]*\bpoints\s*=\s*"([^"]+)"/i);
  if (!match?.[1]) return null;

  const points: SvgPoint[] = [];
  for (const token of match[1].trim().split(/\s+/)) {
    const [xs, ys] = token.split(',');
    const x = Number(xs);
    const y = Number(ys);
    if (Number.isFinite(x) && Number.isFinite(y)) {
      points.push({ x, y });
    }
  }
  return points.length >= 2 ? points : null;
}

/** True when SVG uses VL demo frame (viewBox minY ≈ −220). */
export function isVlDemoLinkedSvgFrame(svgText: string): boolean {
  const match = svgText.match(/viewBox\s*=\s*"([^"]+)"/i);
  if (!match?.[1]) return false;
  const minY = Number(match[1].trim().split(/\s+/)[1]);
  return Number.isFinite(minY) && minY <= -200;
}

/**
 * Polyline points in sandbox ABC1.svg frame (Y down, START at 0,−20).
 * VL demo exports (viewBox −220) are shifted by {@link VL_DEMO_TO_SANDBOX_Y_OFFSET}.
 */
export function parseSandboxLinkedPolylinePoints(svgText: string): SvgPoint[] | null {
  const raw = parseLinkedPolylinePoints(svgText);
  if (!raw) return null;
  if (!isVlDemoLinkedSvgFrame(svgText)) return raw;
  return raw.map((p) => ({ x: p.x, y: p.y + VL_DEMO_TO_SANDBOX_Y_OFFSET }));
}

export function isAbc1SandboxLoad(load: LinkerLoadTransformResult): boolean {
  return (
    load.points.length === 1308 &&
    Math.abs(load.viewBox.width - 571.505) < 0.05 &&
    load.contours.length === 6
  );
}

export function letterGroupForContourIndex(contourIndex: number): 'A' | 'B' | 'C' {
  if (contourIndex <= 1) return 'A';
  if (contourIndex <= 4) return 'B';
  return 'C';
}

function contourOfWireIndex(
  wi: number,
  load: LinkerLoadTransformResult
): number {
  const ranges = buildContourWireRanges(load.contours);
  for (let ci = 0; ci < ranges.length; ci += 1) {
    const r = ranges[ci];
    if (wi >= r.startWireIndex && wi <= r.endWireIndex) return ci;
  }
  return -1;
}

function isLinkableNode(node1: number, loopStarts: ReadonlySet<number>): boolean {
  return node1 >= 1 && !loopStarts.has(node1);
}

function dist(a: SvgPoint, b: SvgPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function isStartTravelPoint(p: SvgPoint, headroomMm = START_HEADROOM_MM): boolean {
  return Math.abs(p.x) < COORD_EPS && Math.abs(p.y + headroomMm) < COORD_EPS;
}

/**
 * Green link chords for overlay — cross-letter jumps in the Vector Linker tour
 * (A↔B↔C), one exit link per from-node.
 */
export function extractCrossLetterLinksFromReferenceTour(
  tourPoints: readonly SvgPoint[],
  load: LinkerLoadTransformResult,
  loopStartNodes: ReadonlySet<number>,
  minChordMm = 8
): Map<number, number> {
  const wireSeq = tourPolylineToWireIndexSequence(tourPoints, load.points);
  const links = new Map<number, number>();

  for (let i = 0; i < wireSeq.length - 1; i += 1) {
    const fromWi = wireSeq[i];
    const toWi = wireSeq[i + 1];
    if (fromWi === toWi) continue;

    const fromContour = contourOfWireIndex(fromWi, load);
    const toContour = contourOfWireIndex(toWi, load);
    if (fromContour < 0 || toContour < 0) continue;
    if (letterGroupForContourIndex(fromContour) === letterGroupForContourIndex(toContour)) continue;

    const pa = load.points[fromWi];
    const pb = load.points[toWi];
    if (dist(pa, pb) < minChordMm) continue;

    const fromNode = fromWi + 1;
    const toNode = toWi + 1;
    if (!isLinkableNode(fromNode, loopStartNodes) || !isLinkableNode(toNode, loopStartNodes)) continue;
    if (links.has(fromNode)) continue;
    if (links.get(toNode) === fromNode) continue;

    links.set(fromNode, toNode);
  }

  return links;
}

export function buildReferenceSimStepIndices(
  tourPoints: readonly SvgPoint[],
  load: LinkerLoadTransformResult
): number[] {
  const steps: number[] = [];
  for (const p of tourPoints) {
    if (isStartTravelPoint(p)) {
      steps.push(0);
      continue;
    }
    const wi = findNearestWirePointIndex(load.points, p);
    steps.push(wi + 1);
  }

  const collapsed: number[] = [];
  for (const step of steps) {
    if (collapsed.length === 0 || collapsed[collapsed.length - 1] !== step) {
      collapsed.push(step);
    }
  }
  return collapsed;
}

/** Min chord length for sandbox link overlay (skip ~2 mm mesh retraces on C). */
export const REFERENCE_TOUR_DISPLAY_LINK_MIN_MM = 8;

/**
 * ABC1 sandbox overlay — the five essential through-foam link paths only.
 * Excludes out-and-back retraces (8→7, 12→6, …) and homing chords (400→3, 914→262).
 */
export const ABC1_SANDBOX_ESSENTIAL_DISPLAY_LINKS: readonly LinkChordPair[] = [
  [6, 12], // A outer → A inner
  [207, 466], // B outer → B stem (upper inner)
  [207, 748], // B outer → B bowl (lower inner)
  [3, 400], // A → B
  [262, 914], // B → C
];

function filterEssentialDisplayLinks(
  allPairs: readonly LinkChordPair[],
  essential: readonly LinkChordPair[]
): LinkChordPair[] {
  const key = (pair: LinkChordPair) => `${pair[0]}\t${pair[1]}`;
  const available = new Set(allPairs.map(key));
  return essential.filter((pair) => available.has(key(pair))).map(([from, to]) => [from, to]);
}

export interface Abc1ReferenceAutoLinkResult {
  /** Cross-letter exit links (legacy map — one target per from-node). */
  links: Map<number, number>;
  /** Essential link chords for sandbox overlay (five ABC1 paths). */
  displayLinkChords: LinkChordPair[];
  tourStepIndices: number[];
  entryWireIndex: number;
}

/** Build sandbox auto link from Vector Linker ABC1 linked polyline (forward or reverse ground truth). */
export function buildAbc1ReferenceAutoLink(
  linkedSvgText: string,
  load: LinkerLoadTransformResult,
  loopStartNodes: ReadonlySet<number>
): Abc1ReferenceAutoLinkResult | null {
  const tourPoints = parseSandboxLinkedPolylinePoints(linkedSvgText);
  if (!tourPoints) return null;

  const wireSeq = tourPolylineToWireIndexSequence(tourPoints, load.points);
  const links = extractCrossLetterLinksFromReferenceTour(tourPoints, load, loopStartNodes);
  const allTourLinks = extractAllUserLinkPairsFromTourWireSequence(wireSeq, load, {
    loopStartNodes,
    minLinkMm: REFERENCE_TOUR_DISPLAY_LINK_MIN_MM,
  });
  const displayLinkChords = filterEssentialDisplayLinks(
    allTourLinks,
    ABC1_SANDBOX_ESSENTIAL_DISPLAY_LINKS
  );
  const tourStepIndices = buildReferenceSimStepIndices(tourPoints, load);
  const entryWireIndex = findNearestWirePointIndex(load.points, tourPoints[1] ?? tourPoints[0]);

  return { links, displayLinkChords, tourStepIndices, entryWireIndex };
}
