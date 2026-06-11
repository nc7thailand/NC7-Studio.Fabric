import {
  Group,
  Path,
  Point,
  util,
  type Canvas,
  type FabricObject,
} from 'fabric';
import { isBedObject } from './WorkAreaBed';

type PathCommand = (string | number)[];

const NODE_DOT_RADIUS = 4.5;
const NODE_DOT_FILL = '#ef4444';
const NODE_DOT_STROKE = '#7f1d1d';

function toNum(value: string | number | undefined): number {
  return typeof value === 'number' ? value : parseFloat(String(value ?? 0));
}

function collectPaths(obj: FabricObject): Path[] {
  if (isBedObject(obj)) return [];
  if (obj instanceof Path) return [obj];
  if (obj instanceof Group) {
    return obj.getObjects().flatMap((child) => collectPaths(child));
  }
  return [];
}

/** Anchor vertices only (not Bézier control handles). */
function pathAnchorPointsLocal(path: Path): Point[] {
  const data = path.path as PathCommand[] | undefined;
  if (!data?.length) return [];

  const offset = path.pathOffset ?? new Point(0, 0);
  const points: Point[] = [];

  for (const cmd of data) {
    const op = String(cmd[0]);
    if (op === 'M' || op === 'L') {
      points.push(new Point(toNum(cmd[1]) - offset.x, toNum(cmd[2]) - offset.y));
    } else if (op === 'C') {
      points.push(new Point(toNum(cmd[5]) - offset.x, toNum(cmd[6]) - offset.y));
    } else if (op === 'Q') {
      points.push(new Point(toNum(cmd[3]) - offset.x, toNum(cmd[4]) - offset.y));
    }
  }

  return points;
}

function pathPointToCanvas(path: Path, canvas: Canvas, local: Point): Point {
  const scene = local.transform(path.calcTransformMatrix());
  const vpt = canvas.viewportTransform;
  if (!vpt) return scene;
  return util.transformPoint(scene, vpt);
}

/** Read-only red dots on every path anchor node (linker overlay). */
export function drawPathNodeDots(
  ctx: CanvasRenderingContext2D,
  canvas: Canvas,
  roots: FabricObject[]
): void {
  ctx.save();

  for (const root of roots) {
    for (const path of collectPaths(root)) {
      path.setCoords();
      for (const local of pathAnchorPointsLocal(path)) {
        const { x, y } = pathPointToCanvas(path, canvas, local);
        ctx.beginPath();
        ctx.arc(x, y, NODE_DOT_RADIUS, 0, Math.PI * 2);
        ctx.fillStyle = NODE_DOT_FILL;
        ctx.fill();
        ctx.lineWidth = 1;
        ctx.strokeStyle = NODE_DOT_STROKE;
        ctx.stroke();
      }
    }
  }

  ctx.restore();
}
