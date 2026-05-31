import { Group, Path, Rect, Circle, Ellipse, type FabricObject } from 'fabric';

/**
 * Loop metrics for CNC QA (F-40 / F-47 / F-53).
 * v1: counts Path/Rect/Circle children; perimeter from path segments or bbox fallback.
 */

export interface LoopInfo {
  index: number;
  pointCount: number;
  perimeterMm?: number;
}

type PathCommand = (string | number)[];

function collectLoopSources(obj: FabricObject): FabricObject[] {
  if (obj instanceof Group) {
    return obj.getObjects().flatMap(collectLoopSources);
  }
  if (obj instanceof Path || obj instanceof Rect || obj instanceof Circle || obj instanceof Ellipse) {
    return [obj];
  }
  return [];
}

function countPathCommands(path: Path): number {
  const data = path.path as PathCommand[] | undefined;
  if (!data?.length) return 0;
  let points = 0;
  for (const cmd of data) {
    const op = String(cmd[0]).toUpperCase();
    if (op === 'M' || op === 'L') points += 1;
    if (op === 'C') points += 3;
    if (op === 'Q') points += 2;
    if (op === 'Z') points += 0;
  }
  return Math.max(points, data.length);
}

function segmentLength(x1: number, y1: number, x2: number, y2: number, sx: number, sy: number): number {
  return Math.hypot((x2 - x1) * sx, (y2 - y1) * sy);
}

function estimatePathPerimeter(path: Path): number {
  const sx = path.scaleX ?? 1;
  const sy = path.scaleY ?? 1;
  const data = path.path as PathCommand[] | undefined;
  if (!data?.length) {
    return 2 * (path.getScaledWidth() + path.getScaledHeight());
  }

  let total = 0;
  let cx = 0;
  let cy = 0;
  let startX = 0;
  let startY = 0;

  for (const cmd of data) {
    const op = String(cmd[0]).toUpperCase();
    if (op === 'M') {
      cx = Number(cmd[1]) || 0;
      cy = Number(cmd[2]) || 0;
      startX = cx;
      startY = cy;
    } else if (op === 'L') {
      const nx = Number(cmd[1]) || 0;
      const ny = Number(cmd[2]) || 0;
      total += segmentLength(cx, cy, nx, ny, sx, sy);
      cx = nx;
      cy = ny;
    } else if (op === 'C') {
      const x1 = Number(cmd[1]) || 0;
      const y1 = Number(cmd[2]) || 0;
      const x2 = Number(cmd[3]) || 0;
      const y2 = Number(cmd[4]) || 0;
      const x3 = Number(cmd[5]) || 0;
      const y3 = Number(cmd[6]) || 0;
      total +=
        segmentLength(cx, cy, x1, y1, sx, sy) +
        segmentLength(x1, y1, x2, y2, sx, sy) +
        segmentLength(x2, y2, x3, y3, sx, sy);
      cx = x3;
      cy = y3;
    } else if (op === 'Q') {
      const x1 = Number(cmd[1]) || 0;
      const y1 = Number(cmd[2]) || 0;
      const x2 = Number(cmd[3]) || 0;
      const y2 = Number(cmd[4]) || 0;
      total +=
        segmentLength(cx, cy, x1, y1, sx, sy) + segmentLength(x1, y1, x2, y2, sx, sy);
      cx = x2;
      cy = y2;
    } else if (op === 'Z') {
      total += segmentLength(cx, cy, startX, startY, sx, sy);
      cx = startX;
      cy = startY;
    }
  }

  return total;
}

function estimateShapePerimeter(obj: FabricObject): number {
  if (obj instanceof Path) return estimatePathPerimeter(obj);
  if (obj instanceof Circle) {
    const r = (obj.radius ?? 0) * (obj.scaleX ?? 1);
    return 2 * Math.PI * r;
  }
  if (obj instanceof Ellipse) {
    const rx = (obj.rx ?? 0) * (obj.scaleX ?? 1);
    const ry = (obj.ry ?? 0) * (obj.scaleY ?? 1);
    return Math.PI * (3 * (rx + ry) - Math.sqrt((3 * rx + ry) * (rx + 3 * ry)));
  }
  return 2 * (obj.getScaledWidth() + obj.getScaledHeight());
}

function loopPointCount(source: FabricObject): number {
  if (source instanceof Path) return countPathCommands(source);
  if (source instanceof Rect) return 4;
  if (source instanceof Circle || source instanceof Ellipse) return 32;
  return 0;
}

export function getObjectLoops(obj: FabricObject | null | undefined): LoopInfo[] {
  if (!obj) return [];
  const sources = collectLoopSources(obj);
  if (sources.length === 0) {
    return [{ index: 0, pointCount: 0 }];
  }
  return sources.map((source, index) => ({
    index,
    pointCount: loopPointCount(source),
  }));
}

export function countObjectLoops(obj: FabricObject | null | undefined): number {
  return getObjectLoops(obj).length;
}

export function getLoopSummary(
  obj: FabricObject | null | undefined,
  includePerimeter = false
): LoopInfo[] {
  if (!obj) return [];
  const sources = collectLoopSources(obj);
  if (sources.length === 0) {
    return includePerimeter
      ? [{ index: 0, pointCount: 0, perimeterMm: 0 }]
      : [{ index: 0, pointCount: 0 }];
  }
  return sources.map((source, index) => ({
    index,
    pointCount: loopPointCount(source),
    perimeterMm: includePerimeter ? estimateShapePerimeter(source) : undefined,
  }));
}

export function totalPerimeterMm(obj: FabricObject | null | undefined): number {
  return getLoopSummary(obj, true).reduce((sum, loop) => sum + (loop.perimeterMm ?? 0), 0);
}
