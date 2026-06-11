import { Group, Path, Point, util, type FabricObject } from 'fabric';
import { classifyPathCncType } from '../svg/pathCncGeometry';
import { fabricBedToCncAbsolute } from '../canvas/cncCoords';
import { isBedObject } from '../canvas/WorkAreaBed';
import type { CutLoop, CncLoopType, G90Point } from './linkerTypes';
import { centroidG90 } from './linkerGeometry';

type PathCommand = (string | number)[];

const { transformPoint } = util;

function toNum(value: string | number | undefined): number {
  const n = typeof value === 'number' ? value : parseFloat(String(value ?? ''));
  return Number.isFinite(n) ? n : 0;
}

function roundMm(n: number): number {
  return parseFloat(n.toFixed(3));
}

function bedToG90(fabricX: number, fabricY: number): G90Point {
  const cnc = fabricBedToCncAbsolute(fabricX, fabricY);
  return { x: roundMm(cnc.x), y: roundMm(cnc.y) };
}

function pathPointToBed(path: Path, px: number, py: number): Point {
  const offset = path.pathOffset ?? new Point(0, 0);
  const local = new Point(px - offset.x, py - offset.y);
  return transformPoint(local, path.calcTransformMatrix());
}

function pushG90Unique(out: G90Point[], pt: G90Point): void {
  const last = out[out.length - 1];
  if (last && last.x === pt.x && last.y === pt.y) return;
  out.push(pt);
}

function splitSubpathCommands(data: PathCommand[]): PathCommand[][] {
  const subpaths: PathCommand[][] = [];
  let current: PathCommand[] = [];
  for (const cmd of data) {
    const op = String(cmd[0]);
    if ((op === 'M' || op === 'm') && current.length > 0) {
      subpaths.push(current);
      current = [];
    }
    current.push(cmd);
  }
  if (current.length > 0) subpaths.push(current);
  return subpaths;
}

/** Extract G90 polyline from a subpath command list. */
function extractG90FromCommands(path: Path, commands: PathCommand[]): G90Point[] {
  const out: G90Point[] = [];
  let lastBed = pathPointToBed(path, 0, 0);

  for (const cmd of commands) {
    const op = String(cmd[0]);
    if (op === 'M' || op === 'L') {
      lastBed = pathPointToBed(path, toNum(cmd[1]), toNum(cmd[2]));
      pushG90Unique(out, bedToG90(lastBed.x, lastBed.y));
    } else if (op === 'C') {
      const startPt = lastBed;
      const p1 = pathPointToBed(path, toNum(cmd[1]), toNum(cmd[2]));
      const p2 = pathPointToBed(path, toNum(cmd[3]), toNum(cmd[4]));
      const p3 = pathPointToBed(path, toNum(cmd[5]), toNum(cmd[6]));
      for (let t = 0.1; t <= 1.0; t += 0.1) {
        const x =
          (1 - t) ** 3 * startPt.x +
          3 * (1 - t) ** 2 * t * p1.x +
          3 * (1 - t) * t ** 2 * p2.x +
          t ** 3 * p3.x;
        const y =
          (1 - t) ** 3 * startPt.y +
          3 * (1 - t) ** 2 * t * p1.y +
          3 * (1 - t) * t ** 2 * p2.y +
          t ** 3 * p3.y;
        pushG90Unique(out, bedToG90(x, y));
      }
      lastBed = p3;
    } else if (op === 'Q') {
      const startPt = lastBed;
      const p1 = pathPointToBed(path, toNum(cmd[1]), toNum(cmd[2]));
      const p2 = pathPointToBed(path, toNum(cmd[3]), toNum(cmd[4]));
      for (let t = 0.1; t <= 1.0; t += 0.1) {
        const x = (1 - t) ** 2 * startPt.x + 2 * (1 - t) * t * p1.x + t ** 2 * p2.x;
        const y = (1 - t) ** 2 * startPt.y + 2 * (1 - t) * t * p1.y + t ** 2 * p2.y;
        pushG90Unique(out, bedToG90(x, y));
      }
      lastBed = p2;
    } else if (op === 'Z' || op === 'z') {
      if (out.length > 0) pushG90Unique(out, out[0]);
    }
  }

  return out;
}

function collectPaths(root: FabricObject): Path[] {
  if (isBedObject(root)) return [];
  if (root instanceof Path) return [root];
  if (root instanceof Group) return root.getObjects().flatMap((child) => collectPaths(child));
  return [];
}

/** All cut loops on bed — one entry per subpath. */
export function collectCutLoops(objects: FabricObject[]): CutLoop[] {
  const loops: CutLoop[] = [];

  for (const root of objects) {
    if (isBedObject(root)) continue;
    const sourceId = String(root.get('sceneId') ?? root.get('sceneName') ?? `obj-${loops.length}`);
    const paths = collectPaths(root);

    paths.forEach((path, pathIndex) => {
      const data = path.path as PathCommand[] | undefined;
      if (!data?.length) return;

      const subpaths = splitSubpathCommands(data);
      subpaths.forEach((commands, subpathIndex) => {
        const points = extractG90FromCommands(path, commands);
        if (points.length < 2) return;

        const cncType = classifyPathCncType(commands) as CncLoopType;
        const id = `${sourceId}:${pathIndex}:${subpathIndex}`;

        loops.push({
          id,
          sourceId,
          pathIndex,
          subpathIndex,
          points,
          cncType,
          centroid: centroidG90(points),
        });
      });
    });
  }

  return loops;
}

/** @deprecated Use collectCutLoops */
export function extractPathG90Points(path: Path): G90Point[] {
  const data = path.path as PathCommand[] | undefined;
  if (!data?.length) return [];
  return extractG90FromCommands(path, data);
}

/** @deprecated Use collectCutLoops */
export function extractCutPathsFromObjects(objects: FabricObject[]): {
  sourceId: string;
  points: G90Point[];
  sortKey: { y: number; x: number };
}[] {
  return collectCutLoops(objects).map((loop) => ({
    sourceId: loop.sourceId,
    points: loop.points,
    sortKey: { y: loop.centroid.y, x: loop.centroid.x },
  }));
}
