/**
 * Vector Linker load transform (NoLink / post-import, pre-Link).
 *
 * Raw compound SVG path → flattened contours → cropped linker frame SVG.
 * Does NOT prepend START travel (0,-20). Does NOT run evidence tour / Auto Link.
 */

import {
  flattenPathContours,
  formatSvgPolylinePoints,
  parseSvgPathData,
  type FlattenedContour,
  type SvgPoint,
} from './abc1LinkedPolyline';
import { classifyWireBorderSegments, classifyWireLinkSegments } from './linkerWorkpiece';

export interface LinkerLoadTransformOptions {
  curveSteps?: number;
  precision?: number;
  /** ViewBox headroom above art for future START (mm). Default 20 — not added to points. */
  startHeadroomMm?: number;
}

export interface LinkerViewBox {
  minX: number;
  minY: number;
  width: number;
  height: number;
}

export interface LinkerLoadTransformResult {
  /** All geometry vertices in contour order (no START travel). */
  points: SvgPoint[];
  contours: FlattenedContour[];
  /** Parallel to contours — nested loops (holes) vs outer letter boundaries. */
  contourFillRoles: ContourFillRole[];
  /** wirePoints[i]→[i+1]; true = Link Path (chord through foam interior). */
  linkSegmentFlags: boolean[];
  /** wirePoints[i]→[i+1]; true = Border Path (on contour edge). */
  borderSegmentFlags: boolean[];
  viewBox: LinkerViewBox;
  svgText: string;
}

export type ContourFillRole = 'outer' | 'internal';

const DEFAULT_START_HEADROOM_MM = 20;
const DEFAULT_PRECISION = 4;

function roundPoint(p: SvgPoint, precision: number): SvgPoint {
  return {
    x: Number(p.x.toFixed(precision)),
    y: Number(p.y.toFixed(precision)),
  };
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

function sortContoursForLoad(contours: FlattenedContour[]): FlattenedContour[] {
  return [...contours].sort((a, b) => {
    const ca = contourCentroid(a);
    const cb = contourCentroid(b);
    return ca.x - cb.x || ca.y - cb.y;
  });
}

/** First path `d` attribute in SVG text. */
export function extractFirstPathData(svgText: string): string | null {
  const match = svgText.match(/<path\b[^>]*\bd\s*=\s*"([\s\S]*?)"/i);
  return match?.[1]?.trim() ?? null;
}

function shiftContoursToLinkerFrame(
  contours: FlattenedContour[],
  startHeadroomMm: number,
  precision: number
): { contours: FlattenedContour[]; viewBox: LinkerViewBox } {
  if (contours.length === 0) {
    return {
      contours: [],
      viewBox: { minX: 0, minY: -startHeadroomMm, width: 0, height: startHeadroomMm },
    };
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const contour of contours) {
    for (const p of contour.points) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }
  }

  const offsetX = minX;
  const shifted = contours.map((contour) => {
    const points = contour.points.map((p) => roundPoint({ x: p.x - offsetX, y: p.y }, precision));
    let bMinX = Infinity;
    let bMinY = Infinity;
    let bMaxX = -Infinity;
    let bMaxY = -Infinity;
    for (const p of points) {
      bMinX = Math.min(bMinX, p.x);
      bMinY = Math.min(bMinY, p.y);
      bMaxX = Math.max(bMaxX, p.x);
      bMaxY = Math.max(bMaxY, p.y);
    }
    return {
      ...contour,
      points,
      bounds: { minX: bMinX, minY: bMinY, maxX: bMaxX, maxY: bMaxY },
    };
  });

  const viewBox: LinkerViewBox = {
    minX: 0,
    minY: -startHeadroomMm,
    width: Number((maxX - minX).toFixed(3)),
    height: Number((maxY - minY + startHeadroomMm).toFixed(3)),
  };

  return { contours: shifted, viewBox };
}

function contourDisplayPoints(contour: FlattenedContour): SvgPoint[] {
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

function polygonAreaAbs(points: SvgPoint[]): number {
  if (points.length < 3) return 0;
  let area = 0;
  for (let i = 0; i < points.length; i += 1) {
    const p = points[i];
    const q = points[(i + 1) % points.length];
    area += p.x * q.y - q.x * p.y;
  }
  return Math.abs(area / 2);
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

/** Nested inside a larger sibling contour → internal hole (A counter, B bowls). */
export function classifyContourFillRoles(contours: FlattenedContour[]): ContourFillRole[] {
  return contours.map((contour, index) => {
    const centroid = contourCentroid(contour);
    const area = polygonAreaAbs(contour.points);
    for (let other = 0; other < contours.length; other += 1) {
      if (other === index) continue;
      if (polygonAreaAbs(contours[other].points) <= area) continue;
      if (pointInPolygon(centroid, contours[other].points)) {
        return 'internal';
      }
    }
    return 'outer';
  });
}

function contoursToPointList(contours: FlattenedContour[]): SvgPoint[] {
  const out: SvgPoint[] = [];
  for (const contour of contours) {
    for (const p of contourDisplayPoints(contour)) {
      const last = out[out.length - 1];
      if (last && last.x === p.x && last.y === p.y) continue;
      out.push({ ...p });
    }
  }
  return out;
}

export function formatLinkerFrameSvg(points: SvgPoint[], viewBox: LinkerViewBox): string {
  return [
    '<?xml version="1.0" encoding="UTF-8" standalone="no"?>',
    `<svg width="${viewBox.width}mm" height="${viewBox.height}mm" viewBox="${viewBox.minX} ${viewBox.minY} ${viewBox.width} ${viewBox.height}" xmlns="http://www.w3.org/2000/svg" version="1.2" baseProfile="tiny">`,
    '<g fill="none" stroke="black" stroke-width="1" fill-rule="evenodd" stroke-linecap="square" stroke-linejoin="bevel">',
    `<polyline fill="none" points="${formatSvgPolylinePoints(points)}" />`,
    '</g>',
    '</svg>',
  ].join('\n');
}

/** Sandbox canvas: yellow fill per closed contour + wire polyline overlay for sim sync. */
export const LINKER_SANDBOX_OBJECT_FILL = '#ffeb3b';

/** ViewBox for sandbox canvas — art only (drop START headroom band from object frame). */
export function sandboxCanvasViewBox(
  viewBox: LinkerViewBox,
  startHeadroomMm = DEFAULT_START_HEADROOM_MM
): LinkerViewBox {
  return {
    minX: viewBox.minX,
    minY: 0,
    width: viewBox.width,
    height: Number((viewBox.height - startHeadroomMm).toFixed(3)),
  };
}

function contoursToEvenOddPathD(contours: FlattenedContour[]): string {
  const parts: string[] = [];
  for (const contour of contours) {
    const pts = contourDisplayPoints(contour);
    if (pts.length === 0) continue;
    let d = `M ${pts[0].x} ${pts[0].y}`;
    for (let i = 1; i < pts.length; i += 1) {
      d += ` L ${pts[i].x} ${pts[i].y}`;
    }
    parts.push(`${d} Z`);
  }
  return parts.join(' ');
}

export function formatLinkerFrameSvgFilled(
  contours: FlattenedContour[],
  wirePoints: SvgPoint[],
  viewBox: LinkerViewBox,
  options: { fill?: string; stroke?: string; wireStroke?: string; wireStrokeWidth?: number } = {}
): string {
  const fill = options.fill ?? LINKER_SANDBOX_OBJECT_FILL;
  const stroke = options.stroke ?? '#854d0e';
  const wireStroke = options.wireStroke ?? '#3b82f6';
  const wireStrokeWidth = options.wireStrokeWidth ?? 3;
  const pathD = contoursToEvenOddPathD(contours);
  return [
    '<?xml version="1.0" encoding="UTF-8" standalone="no"?>',
    `<svg width="${viewBox.width}mm" height="${viewBox.height}mm" viewBox="${viewBox.minX} ${viewBox.minY} ${viewBox.width} ${viewBox.height}" xmlns="http://www.w3.org/2000/svg" version="1.2" baseProfile="tiny">`,
    '<g stroke-linecap="square" stroke-linejoin="bevel">',
    `<path fill="${fill}" fill-rule="evenodd" stroke="${stroke}" stroke-width="1" d="${pathD}" />`,
    `<polyline fill="none" stroke="transparent" stroke-width="0" points="${formatSvgPolylinePoints(wirePoints)}" data-nc7-wire="1" />`,
    '</g>',
    '</svg>',
  ].join('\n');
}

/** True if point matches START travel position in linker frame (excluded from load pipeline). */
export function isLinkerStartTravelPoint(p: SvgPoint, headroomMm = DEFAULT_START_HEADROOM_MM): boolean {
  return Math.abs(p.x) < 0.001 && Math.abs(p.y + headroomMm) < 0.001;
}

export function buildLinkerNoLinkFromPathData(
  pathData: string,
  options: LinkerLoadTransformOptions = {}
): LinkerLoadTransformResult {
  const precision = options.precision ?? DEFAULT_PRECISION;
  const startHeadroomMm = options.startHeadroomMm ?? DEFAULT_START_HEADROOM_MM;
  const commands = parseSvgPathData(pathData);
  const rawContours = flattenPathContours(commands, options);
  const sorted = sortContoursForLoad(rawContours);
  const { contours, viewBox } = shiftContoursToLinkerFrame(sorted, startHeadroomMm, precision);
  const contourFillRoles = classifyContourFillRoles(contours);
  const points = contoursToPointList(contours);
  const linkSegmentFlags = classifyWireLinkSegments(points, contours, contourFillRoles);
  const borderSegmentFlags = classifyWireBorderSegments(points, contours);
  const svgText = formatLinkerFrameSvg(points, viewBox);
  return { points, contours, contourFillRoles, linkSegmentFlags, borderSegmentFlags, viewBox, svgText };
}

export function buildLinkerNoLinkFromSvgText(
  svgText: string,
  options: LinkerLoadTransformOptions = {}
): LinkerLoadTransformResult {
  const pathData = extractFirstPathData(svgText);
  if (!pathData) {
    throw new Error('Linker load transform: no <path d="..."> found in SVG.');
  }
  return buildLinkerNoLinkFromPathData(pathData, options);
}
