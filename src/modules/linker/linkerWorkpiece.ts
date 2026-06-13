/**
 * Workpiece (yellow EPS foam) vs wire segment classification.
 * Border Path = on contour edge. Link Path = chord through foam interior (NoLink identify).
 */

import type { FlattenedContour, SvgPoint } from './abc1LinkedPolyline';
import type { ContourFillRole } from './linkerLoadTransform';

const POINT_EPS = 0.001;

function samePoint(a: SvgPoint, b: SvgPoint): boolean {
  return Math.abs(a.x - b.x) < POINT_EPS && Math.abs(a.y - b.y) < POINT_EPS;
}

function contourWirePoints(contour: FlattenedContour): SvgPoint[] {
  const pts = contour.points.map((p) => ({ ...p }));
  if (contour.closed && pts.length > 0) {
    const first = pts[0];
    const last = pts[pts.length - 1];
    if (last.x !== first.x || last.y !== first.y) {
      pts.push({ ...first });
    }
  }
  return pts;
}

function pointInPolygon(point: SvgPoint, polygon: SvgPoint[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x;
    const yi = polygon[i].y;
    const xj = polygon[j].x;
    const yj = polygon[j].y;
    if ((yi > point.y) !== (yj > point.y) && point.x < ((xj - xi) * (point.y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/** EPS foam: inside outer contour, excluding nested internal holes. */
export function isPointInWorkpiece(
  point: SvgPoint,
  contours: FlattenedContour[],
  roles: ContourFillRole[]
): boolean {
  for (let i = 0; i < contours.length; i += 1) {
    if (roles[i] === 'internal' && pointInPolygon(point, contours[i].points)) {
      return false;
    }
  }
  for (let i = 0; i < contours.length; i += 1) {
    if (roles[i] === 'outer' && pointInPolygon(point, contours[i].points)) {
      return true;
    }
  }
  return false;
}

interface WirePointOwnership {
  contourIndex: number;
  pointIndex: number;
}

function buildWirePointOwnership(
  wirePoints: SvgPoint[],
  contours: FlattenedContour[]
): WirePointOwnership[] {
  const ownership: WirePointOwnership[] = [];
  const rebuilt: SvgPoint[] = [];
  for (let ci = 0; ci < contours.length; ci += 1) {
    const display = contourWirePoints(contours[ci]);
    for (let di = 0; di < display.length; di += 1) {
      const p = display[di];
      const last = rebuilt[rebuilt.length - 1];
      if (last && samePoint(last, p)) continue;
      rebuilt.push({ ...p });
      ownership.push({ contourIndex: ci, pointIndex: di });
    }
  }
  if (rebuilt.length !== wirePoints.length) {
    return wirePoints.map((_, index) => ownership[index] ?? { contourIndex: -1, pointIndex: index });
  }
  return ownership;
}

function isBorderSegment(
  a: WirePointOwnership,
  b: WirePointOwnership,
  contours: FlattenedContour[]
): boolean {
  if (a.contourIndex !== b.contourIndex || a.contourIndex < 0) return false;
  const contour = contours[a.contourIndex];
  if (b.pointIndex === a.pointIndex + 1) return true;
  if (!contour.closed) return false;
  const displayLen = contourWirePoints(contour).length;
  return a.pointIndex === displayLen - 1 && b.pointIndex === 0;
}

function isLinkPathSegment(
  p0: SvgPoint,
  p1: SvgPoint,
  contours: FlattenedContour[],
  roles: ContourFillRole[]
): boolean {
  const samples = 7;
  for (let s = 1; s < samples; s += 1) {
    const t = s / samples;
    const sample = { x: p0.x + t * (p1.x - p0.x), y: p0.y + t * (p1.y - p0.y) };
    if (isPointInWorkpiece(sample, contours, roles)) {
      return true;
    }
  }
  return false;
}

/** One flag per wire segment. True = on contour edge (Border Path). */
export function classifyWireBorderSegments(
  wirePoints: SvgPoint[],
  contours: FlattenedContour[]
): boolean[] {
  if (wirePoints.length < 2) return [];
  const ownership = buildWirePointOwnership(wirePoints, contours);
  const flags: boolean[] = [];
  for (let i = 0; i < wirePoints.length - 1; i += 1) {
    const a = ownership[i];
    const b = ownership[i + 1];
    flags.push(!!(a && b && isBorderSegment(a, b, contours)));
  }
  return flags;
}

/** One flag per wire segment (wirePoints[i] → wirePoints[i+1]). True = Link Path through foam. */
export function classifyWireLinkSegments(
  wirePoints: SvgPoint[],
  contours: FlattenedContour[],
  roles: ContourFillRole[]
): boolean[] {
  if (wirePoints.length < 2) return [];
  const ownership = buildWirePointOwnership(wirePoints, contours);
  const flags: boolean[] = [];
  for (let i = 0; i < wirePoints.length - 1; i += 1) {
    const a = ownership[i];
    const b = ownership[i + 1];
    if (a && b && isBorderSegment(a, b, contours)) {
      flags.push(false);
    } else {
      flags.push(isLinkPathSegment(wirePoints[i], wirePoints[i + 1], contours, roles));
    }
  }
  return flags;
}
