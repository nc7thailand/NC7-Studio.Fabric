/**
 * ABC1 evidence linker.
 *
 * This module is intentionally pure logic. It does not touch Fabric canvas,
 * graph links, slots, export buttons, or app state.
 *
 * Evidence source:
 * docs/vector-linker/abc1-svg-compare-notes.md
 *
 * Core interpretation:
 * raw compound glyph path -> contours -> flattened point loops -> ordered single polyline tour
 */

export interface SvgPoint {
  x: number;
  y: number;
}

export type AbsolutePathCommand =
  | { op: 'M'; point: SvgPoint }
  | { op: 'L'; point: SvgPoint }
  | { op: 'Q'; control: SvgPoint; point: SvgPoint }
  | { op: 'C'; control1: SvgPoint; control2: SvgPoint; point: SvgPoint }
  | { op: 'Z' };

export interface FlattenedContour {
  id: string;
  points: SvgPoint[];
  closed: boolean;
  bounds: {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  };
}

export interface Abc1LinkOptions {
  /** Linked SVG evidence starts at 0,-20. */
  start?: SvgPoint;
  /** Curve flattening density per Q/C command. */
  curveSteps?: number;
  /** Number of decimals in generated points. */
  precision?: number;
}

const DEFAULT_START: SvgPoint = { x: 0, y: -20 };
const DEFAULT_CURVE_STEPS = 32;
const DEFAULT_PRECISION = 4;
const POINT_EPS = 0.001;

const COMMAND_ARITY: Record<string, number> = {
  M: 2,
  L: 2,
  H: 1,
  V: 1,
  C: 6,
  Q: 4,
  Z: 0,
};

const ABC1_ANCHORS = {
  aTop: { x: 75.3299, y: 3.29816 },
  aOuterLeftBottom: { x: 0, y: 196.702 },
  aOuterBaseLeft: { x: 41.4248, y: 196.702 },
  aOuterInnerLeft: { x: 57.3879, y: 152.771 },
  aInnerRight: { x: 122.164, y: 120.185 },
  aInnerTop: { x: 95.5146, y: 48.4169 },
  aInnerLeft: { x: 69.3932, y: 120.185 },
  aOuterInnerRight: { x: 134.697, y: 152.771 },
  aOuterBaseRight: { x: 151.583, y: 196.702 },
  aRightBottom: { x: 194.064, y: 196.702 },
  bBottomLeft: { x: 214.908, y: 196.702 },
  cEntry: { x: 405.032, y: 126.071 },
};

function roundPoint(p: SvgPoint, precision: number): SvgPoint {
  return {
    x: Number(p.x.toFixed(precision)),
    y: Number(p.y.toFixed(precision)),
  };
}

function distance(a: SvgPoint, b: SvgPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function samePoint(a: SvgPoint, b: SvgPoint): boolean {
  return distance(a, b) <= POINT_EPS;
}

function pushPoint(out: SvgPoint[], p: SvgPoint, options?: { allowDuplicate?: boolean }): void {
  const last = out[out.length - 1];
  if (!options?.allowDuplicate && last && samePoint(last, p)) return;
  out.push({ ...p });
}

function tokenizePathData(d: string): string[] {
  return d.match(/[AaCcHhLlMmQqSsTtVvZz]|[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g) ?? [];
}

function isCommand(token: string | undefined): boolean {
  return Boolean(token && /^[A-Za-z]$/.test(token));
}

function readNumber(tokens: string[], index: number): number {
  const n = Number(tokens[index]);
  if (!Number.isFinite(n)) {
    throw new Error(`Invalid SVG path number at token ${index}: ${tokens[index] ?? '<missing>'}`);
  }
  return n;
}

function normalizeCommandName(command: string): string {
  const upper = command.toUpperCase();
  if (!(upper in COMMAND_ARITY)) {
    throw new Error(`Unsupported SVG path command: ${command}`);
  }
  return upper;
}

/**
 * Parse an SVG path `d` string into absolute M/L/Q/C/Z commands.
 * Supports the ABC1 source command set: M, L, H, V, Q, C, Z and relatives.
 */
export function parseSvgPathData(d: string): AbsolutePathCommand[] {
  const tokens = tokenizePathData(d);
  const commands: AbsolutePathCommand[] = [];
  let i = 0;
  let command = '';
  let current: SvgPoint = { x: 0, y: 0 };
  let subpathStart: SvgPoint = { x: 0, y: 0 };

  while (i < tokens.length) {
    if (isCommand(tokens[i])) {
      command = tokens[i];
      i += 1;
    }
    if (!command) {
      throw new Error('SVG path data starts without a command.');
    }

    const upper = normalizeCommandName(command);
    const relative = command === command.toLowerCase();

    if (upper === 'Z') {
      commands.push({ op: 'Z' });
      current = { ...subpathStart };
      command = '';
      continue;
    }

    const arity = COMMAND_ARITY[upper];
    let firstMove = upper === 'M';

    while (i < tokens.length && !isCommand(tokens[i])) {
      if (i + arity > tokens.length) {
        throw new Error(`Incomplete SVG path command: ${command}`);
      }

      if (upper === 'M' || upper === 'L') {
        const x = readNumber(tokens, i);
        const y = readNumber(tokens, i + 1);
        i += 2;
        const point = relative ? { x: current.x + x, y: current.y + y } : { x, y };
        if (firstMove) {
          commands.push({ op: 'M', point });
          subpathStart = { ...point };
          firstMove = false;
        } else {
          commands.push({ op: 'L', point });
        }
        current = { ...point };
      } else if (upper === 'H') {
        const x = readNumber(tokens, i);
        i += 1;
        const point = { x: relative ? current.x + x : x, y: current.y };
        commands.push({ op: 'L', point });
        current = { ...point };
      } else if (upper === 'V') {
        const y = readNumber(tokens, i);
        i += 1;
        const point = { x: current.x, y: relative ? current.y + y : y };
        commands.push({ op: 'L', point });
        current = { ...point };
      } else if (upper === 'Q') {
        const c = { x: readNumber(tokens, i), y: readNumber(tokens, i + 1) };
        const p = { x: readNumber(tokens, i + 2), y: readNumber(tokens, i + 3) };
        i += 4;
        const control = relative ? { x: current.x + c.x, y: current.y + c.y } : c;
        const point = relative ? { x: current.x + p.x, y: current.y + p.y } : p;
        commands.push({ op: 'Q', control, point });
        current = { ...point };
      } else if (upper === 'C') {
        const c1 = { x: readNumber(tokens, i), y: readNumber(tokens, i + 1) };
        const c2 = { x: readNumber(tokens, i + 2), y: readNumber(tokens, i + 3) };
        const p = { x: readNumber(tokens, i + 4), y: readNumber(tokens, i + 5) };
        i += 6;
        const control1 = relative ? { x: current.x + c1.x, y: current.y + c1.y } : c1;
        const control2 = relative ? { x: current.x + c2.x, y: current.y + c2.y } : c2;
        const point = relative ? { x: current.x + p.x, y: current.y + p.y } : p;
        commands.push({ op: 'C', control1, control2, point });
        current = { ...point };
      }

      if (upper === 'M') command = relative ? 'l' : 'L';
    }
  }

  return commands;
}

function quadraticAt(from: SvgPoint, control: SvgPoint, to: SvgPoint, t: number): SvgPoint {
  const u = 1 - t;
  return {
    x: u * u * from.x + 2 * u * t * control.x + t * t * to.x,
    y: u * u * from.y + 2 * u * t * control.y + t * t * to.y,
  };
}

function cubicAt(
  from: SvgPoint,
  control1: SvgPoint,
  control2: SvgPoint,
  to: SvgPoint,
  t: number
): SvgPoint {
  const u = 1 - t;
  return {
    x:
      u * u * u * from.x +
      3 * u * u * t * control1.x +
      3 * u * t * t * control2.x +
      t * t * t * to.x,
    y:
      u * u * u * from.y +
      3 * u * u * t * control1.y +
      3 * u * t * t * control2.y +
      t * t * t * to.y,
  };
}

function contourBounds(points: SvgPoint[]): FlattenedContour['bounds'] {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  return { minX, minY, maxX, maxY };
}

function stripClosingDuplicate(points: SvgPoint[]): SvgPoint[] {
  if (points.length < 2) return points;
  const first = points[0];
  const last = points[points.length - 1];
  return samePoint(first, last) ? points.slice(0, -1) : points;
}

export function flattenPathContours(
  commands: AbsolutePathCommand[],
  options: Pick<Abc1LinkOptions, 'curveSteps' | 'precision'> = {}
): FlattenedContour[] {
  const curveSteps = options.curveSteps ?? DEFAULT_CURVE_STEPS;
  const precision = options.precision ?? DEFAULT_PRECISION;
  const contours: FlattenedContour[] = [];
  let current: SvgPoint = { x: 0, y: 0 };
  let start: SvgPoint | null = null;
  let points: SvgPoint[] = [];
  let closed = false;

  const finish = () => {
    const cleaned = stripClosingDuplicate(points).map((p) => roundPoint(p, precision));
    if (cleaned.length >= 2) {
      contours.push({
        id: `contour-${contours.length}`,
        points: cleaned,
        closed,
        bounds: contourBounds(cleaned),
      });
    }
    points = [];
    start = null;
    closed = false;
  };

  for (const cmd of commands) {
    if (cmd.op === 'M') {
      if (points.length > 0) finish();
      current = { ...cmd.point };
      start = { ...cmd.point };
      pushPoint(points, current);
    } else if (cmd.op === 'L') {
      current = { ...cmd.point };
      pushPoint(points, current);
    } else if (cmd.op === 'Q') {
      const from = { ...current };
      for (let step = 1; step <= curveSteps; step += 1) {
        pushPoint(points, quadraticAt(from, cmd.control, cmd.point, step / curveSteps));
      }
      current = { ...cmd.point };
    } else if (cmd.op === 'C') {
      const from = { ...current };
      for (let step = 1; step <= curveSteps; step += 1) {
        pushPoint(points, cubicAt(from, cmd.control1, cmd.control2, cmd.point, step / curveSteps));
      }
      current = { ...cmd.point };
    } else if (cmd.op === 'Z') {
      if (start) pushPoint(points, start);
      current = start ? { ...start } : current;
      closed = true;
      finish();
    }
  }

  if (points.length > 0) finish();
  return contours;
}

function nearestPoint(points: SvgPoint[], target: SvgPoint): SvgPoint {
  if (points.length === 0) return { ...target };
  let best = points[0];
  let bestDist = distance(best, target);
  for (const point of points) {
    const d = distance(point, target);
    if (d < bestDist) {
      best = point;
      bestDist = d;
    }
  }
  return { ...best };
}

function contourCentroid(contour: FlattenedContour): SvgPoint {
  let x = 0;
  let y = 0;
  for (const p of contour.points) {
    x += p.x;
    y += p.y;
  }
  return { x: x / contour.points.length, y: y / contour.points.length };
}

function appendAEvidenceSegment(out: SvgPoint[], aOuter: FlattenedContour, aInner: FlattenedContour): void {
  const a = ABC1_ANCHORS;
  const outerPoints = aOuter.points;
  const innerPoints = aInner.points;

  pushPoint(out, nearestPoint(outerPoints, a.aTop));
  pushPoint(out, nearestPoint(outerPoints, a.aOuterLeftBottom));
  pushPoint(out, nearestPoint(outerPoints, a.aOuterBaseLeft));
  pushPoint(out, nearestPoint(outerPoints, a.aOuterInnerLeft));

  pushPoint(out, nearestPoint(innerPoints, a.aInnerLeft));
  pushPoint(out, nearestPoint(innerPoints, a.aInnerRight));
  pushPoint(out, nearestPoint(innerPoints, a.aInnerRight), { allowDuplicate: true });
  pushPoint(out, nearestPoint(innerPoints, a.aInnerTop));
  pushPoint(out, nearestPoint(innerPoints, a.aInnerLeft));

  pushPoint(out, nearestPoint(outerPoints, a.aOuterInnerLeft));
  pushPoint(out, nearestPoint(outerPoints, a.aOuterInnerRight));
  pushPoint(out, nearestPoint(outerPoints, a.aOuterBaseRight));
  pushPoint(out, nearestPoint(outerPoints, a.aRightBottom));
}

function rotatedTraversal(points: SvgPoint[], startTarget: SvgPoint, reverse: boolean): SvgPoint[] {
  const ordered = reverse ? [...points].reverse() : [...points];
  if (ordered.length === 0) return [];

  let startIndex = 0;
  let bestDist = distance(ordered[0], startTarget);
  for (let i = 1; i < ordered.length; i += 1) {
    const d = distance(ordered[i], startTarget);
    if (d < bestDist) {
      startIndex = i;
      bestDist = d;
    }
  }

  return [...ordered.slice(startIndex), ...ordered.slice(0, startIndex)];
}

function appendContour(out: SvgPoint[], contour: FlattenedContour, startTarget: SvgPoint, reverse: boolean): void {
  for (const point of rotatedTraversal(contour.points, startTarget, reverse)) {
    pushPoint(out, point);
  }
}

function sortRemainingContours(contours: FlattenedContour[]): FlattenedContour[] {
  return [...contours].sort((a, b) => {
    const ca = contourCentroid(a);
    const cb = contourCentroid(b);
    return ca.x - cb.x || ca.y - cb.y;
  });
}

/**
 * Build the first implementation of the ABC1 linked polyline from the raw path.
 *
 * Current evidence mapping:
 * - A segment is explicitly reconstructed from the linked SVG notes.
 * - Remaining contours are flattened and traversed in the observed broad order:
 *   B outer, C, then B holes/remaining contours by X/Y sort.
 *
 * This is a logic foundation, not UI wiring.
 */
export function buildAbc1LinkedPolylineFromPathData(
  rawPathData: string,
  options: Abc1LinkOptions = {}
): SvgPoint[] {
  return buildAbc1LinkedPolylineFromCommands(parseSvgPathData(rawPathData), options);
}

export function buildAbc1LinkedPolylineFromCommands(
  commands: AbsolutePathCommand[],
  options: Abc1LinkOptions = {}
): SvgPoint[] {
  const precision = options.precision ?? DEFAULT_PRECISION;
  const start = options.start ?? DEFAULT_START;
  const contours = flattenPathContours(commands, options);
  const out: SvgPoint[] = [roundPoint(start, precision)];

  if (contours.length < 2) {
    for (const contour of sortRemainingContours(contours)) {
      appendContour(out, contour, contour.points[0], false);
    }
    pushPoint(out, roundPoint(start, precision));
    pushPoint(out, roundPoint(start, precision), { allowDuplicate: true });
    return out.map((p) => roundPoint(p, precision));
  }

  const [aOuter, aInner, ...remaining] = contours;
  appendAEvidenceSegment(out, aOuter, aInner);

  const bOuter = remaining.find((c) => c.bounds.minX >= 200 && c.bounds.maxX < 390);
  const cOuter = remaining.find((c) => c.bounds.minX >= 390);
  const used = new Set<FlattenedContour>();

  if (bOuter) {
    used.add(bOuter);
    appendContour(out, bOuter, ABC1_ANCHORS.bBottomLeft, true);
  }

  if (cOuter) {
    used.add(cOuter);
    pushPoint(out, nearestPoint(cOuter.points, ABC1_ANCHORS.cEntry));
    appendContour(out, cOuter, ABC1_ANCHORS.cEntry, false);
  }

  for (const contour of sortRemainingContours(remaining.filter((c) => !used.has(c)))) {
    appendContour(out, contour, contour.points[0], false);
  }

  pushPoint(out, roundPoint(start, precision));
  pushPoint(out, roundPoint(start, precision), { allowDuplicate: true });
  return out.map((p) => roundPoint(p, precision));
}

export function formatSvgPolylinePoints(points: SvgPoint[]): string {
  return points.map((p) => `${p.x},${p.y}`).join(' ');
}

export function formatLinkedSvgPolyline(points: SvgPoint[]): string {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const maxX = Math.max(...xs);
  const maxY = Math.max(...ys);
  const width = Number((maxX - minX).toFixed(3));
  const height = Number((maxY - minY).toFixed(3));
  return [
    '<?xml version="1.0" encoding="UTF-8" standalone="no"?>',
    `<svg width="${width}mm" height="${height}mm" viewBox="${minX} ${minY} ${width} ${height}" xmlns="http://www.w3.org/2000/svg" version="1.2" baseProfile="tiny">`,
    '<g fill="none" stroke="black" stroke-width="1" fill-rule="evenodd" stroke-linecap="square" stroke-linejoin="bevel">',
    `<polyline fill="none" points="${formatSvgPolylinePoints(points)}" />`,
    '</g>',
    '</svg>',
  ].join('\n');
}

