import { Group, Path, type FabricObject } from 'fabric';
import DxfParser, {
  type IArcEntity,
  type ICircleEntity,
  type IEntity,
  type ILineEntity,
  type ILwpolylineEntity,
  type IPoint,
  type IPolylineEntity,
} from 'dxf-parser';
import {
  classifyPathCncType,
  normalizeFabricObjectToCncFrame,
} from '../svg/pathCncGeometry';

type PathCommand = (string | number)[];

const ARC_SEGMENTS = 32;
const BULGE_SEGMENTS = 12;

function num(n: unknown): number {
  const v = typeof n === 'number' ? n : parseFloat(String(n ?? ''));
  return Number.isFinite(v) ? v : 0;
}

function pointPath(commands: PathCommand[]): Path | null {
  if (commands.length < 2) return null;
  const path = new Path(commands as never, {
    fill: 'transparent',
    stroke: '#ffffff',
    strokeWidth: 1,
    strokeUniform: true,
    objectCaching: false,
    includeDefaultValues: false,
  });
  path.set(
    'cncType',
    classifyPathCncType(commands as Parameters<typeof classifyPathCncType>[0])
  );
  normalizeFabricObjectToCncFrame(path);
  return path;
}

function sampleArc(
  cx: number,
  cy: number,
  radius: number,
  startRad: number,
  endRad: number,
  closed = false
): PathCommand[] {
  let end = endRad;
  if (end < startRad) end += Math.PI * 2;
  const sweep = end - startRad;
  const steps = Math.max(8, Math.ceil((Math.abs(sweep) / (Math.PI * 2)) * ARC_SEGMENTS));
  const commands: PathCommand[] = [];
  for (let i = 0; i <= steps; i += 1) {
    const t = startRad + (sweep * i) / steps;
    const x = cx + radius * Math.cos(t);
    const y = cy + radius * Math.sin(t);
    commands.push([i === 0 ? 'M' : 'L', x, y]);
  }
  if (closed) commands.push(['Z']);
  return commands;
}

/** Convert DXF bulge (tan of 1/4 included angle) into sampled points between two verts. */
function sampleBulge(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  bulge: number
): { x: number; y: number }[] {
  if (!bulge || Math.abs(bulge) < 1e-9) return [];
  const dx = x1 - x0;
  const dy = y1 - y0;
  const chord = Math.hypot(dx, dy);
  if (chord < 1e-9) return [];

  const included = 4 * Math.atan(bulge);
  const sagitta = (bulge * chord) / 2;
  const radius = ((chord / 2) ** 2 + sagitta ** 2) / (2 * Math.abs(sagitta));
  const midX = (x0 + x1) / 2;
  const midY = (y0 + y1) / 2;
  const nx = -dy / chord;
  const ny = dx / chord;
  const sign = bulge > 0 ? 1 : -1;
  const d = Math.sqrt(Math.max(0, radius * radius - (chord / 2) ** 2));
  const cx = midX + sign * nx * d * (Math.abs(included) > Math.PI ? -1 : 1);
  const cy = midY + sign * ny * d * (Math.abs(included) > Math.PI ? -1 : 1);

  const a0 = Math.atan2(y0 - cy, x0 - cx);
  let a1 = Math.atan2(y1 - cy, x1 - cx);
  if (bulge > 0) {
    if (a1 < a0) a1 += Math.PI * 2;
  } else if (a1 > a0) {
    a1 -= Math.PI * 2;
  }

  const steps = Math.max(4, Math.ceil((Math.abs(a1 - a0) / (Math.PI * 2)) * BULGE_SEGMENTS));
  const pts: { x: number; y: number }[] = [];
  for (let i = 1; i < steps; i += 1) {
    const t = a0 + ((a1 - a0) * i) / steps;
    pts.push({ x: cx + radius * Math.cos(t), y: cy + radius * Math.sin(t) });
  }
  return pts;
}

function lineEntityToPath(entity: ILineEntity): Path | null {
  const a = entity.vertices?.[0];
  const b = entity.vertices?.[1];
  if (!a || !b) return null;
  return pointPath([
    ['M', num(a.x), num(a.y)],
    ['L', num(b.x), num(b.y)],
  ]);
}

function lwpolylineToPath(entity: ILwpolylineEntity): Path | null {
  const verts = entity.vertices ?? [];
  if (verts.length < 2) return null;
  const commands: PathCommand[] = [];
  for (let i = 0; i < verts.length; i += 1) {
    const v = verts[i];
    const x = num(v.x);
    const y = num(v.y);
    if (i === 0) {
      commands.push(['M', x, y]);
    } else {
      const prev = verts[i - 1];
      const bulge = num(prev.bulge);
      if (bulge) {
        for (const p of sampleBulge(num(prev.x), num(prev.y), x, y, bulge)) {
          commands.push(['L', p.x, p.y]);
        }
      }
      commands.push(['L', x, y]);
    }
  }
  if (entity.shape && verts.length > 2) {
    const first = verts[0];
    const last = verts[verts.length - 1];
    const bulge = num(last.bulge);
    if (bulge) {
      for (const p of sampleBulge(num(last.x), num(last.y), num(first.x), num(first.y), bulge)) {
        commands.push(['L', p.x, p.y]);
      }
    }
    commands.push(['Z']);
  }
  return pointPath(commands);
}

function polylineToPath(entity: IPolylineEntity): Path | null {
  const verts = entity.vertices ?? [];
  if (verts.length < 2) return null;
  const commands: PathCommand[] = [];
  verts.forEach((v, i) => {
    commands.push([i === 0 ? 'M' : 'L', num(v.x), num(v.y)]);
  });
  if (entity.shape) commands.push(['Z']);
  return pointPath(commands);
}

function circleToPath(entity: ICircleEntity): Path | null {
  const c = entity.center;
  const r = num(entity.radius);
  if (!c || r <= 0) return null;
  return pointPath(sampleArc(num(c.x), num(c.y), r, 0, Math.PI * 2, true));
}

function arcToPath(entity: IArcEntity): Path | null {
  const c = entity.center;
  const r = num(entity.radius);
  if (!c || r <= 0) return null;
  // dxf-parser angles are radians.
  return pointPath(
    sampleArc(num(c.x), num(c.y), r, num(entity.startAngle), num(entity.endAngle), false)
  );
}

function entityToPath(entity: IEntity): Path | null {
  switch (entity.type) {
    case 'LINE':
      return lineEntityToPath(entity as ILineEntity);
    case 'LWPOLYLINE':
      return lwpolylineToPath(entity as ILwpolylineEntity);
    case 'POLYLINE':
      return polylineToPath(entity as IPolylineEntity);
    case 'CIRCLE':
      return circleToPath(entity as ICircleEntity);
    case 'ARC':
      return arcToPath(entity as IArcEntity);
    default:
      return null;
  }
}

function collectEntityPoints(obj: FabricObject, out: IPoint[]): void {
  if (obj instanceof Path && Array.isArray(obj.path)) {
    for (const cmd of obj.path as PathCommand[]) {
      const op = String(cmd[0]);
      if (op === 'M' || op === 'L') {
        out.push({ x: num(cmd[1]), y: num(cmd[2]), z: 0 });
      }
    }
    return;
  }
  if (obj instanceof Group) {
    for (const child of obj.getObjects()) collectEntityPoints(child, out);
  }
}

/** DXF is Y-up; Fabric canvas is Y-down — flip about the drawing extents. */
function flipGroupYToFabric(group: Group): void {
  const pts: IPoint[] = [];
  collectEntityPoints(group, pts);
  if (pts.length === 0) return;
  let maxY = pts[0].y;
  for (const p of pts) if (p.y > maxY) maxY = p.y;

  const flipPath = (path: Path): void => {
    const next: PathCommand[] = [];
    for (const cmd of path.path as PathCommand[]) {
      const op = String(cmd[0]);
      if (op === 'M' || op === 'L') {
        next.push([op, num(cmd[1]), maxY - num(cmd[2])]);
      } else if (op === 'Z' || op === 'z') {
        next.push(['Z']);
      } else {
        next.push(cmd);
      }
    }
    path.set({ path: next as never });
    path.setCoords();
  };

  const walk = (obj: FabricObject): void => {
    if (obj instanceof Path) flipPath(obj);
    else if (obj instanceof Group) obj.getObjects().forEach(walk);
  };
  walk(group);
  group.setCoords();
}

/**
 * Parse ASCII DXF into a Fabric group (LINE / LWPOLYLINE / POLYLINE / ARC / CIRCLE).
 * Coordinates are converted from CAD Y-up into Fabric Y-down.
 */
export function loadDxfLayoutAsGroup(dxfText: string): Group {
  const parser = new DxfParser();
  const dxf = parser.parseSync(dxfText);
  if (!dxf?.entities?.length) {
    throw new Error('No entities found in DXF');
  }

  const paths: Path[] = [];
  for (const entity of dxf.entities) {
    const path = entityToPath(entity);
    if (path) paths.push(path);
  }
  if (paths.length === 0) {
    throw new Error('No supported vector entities (LINE, LWPOLYLINE, POLYLINE, ARC, CIRCLE) in DXF');
  }

  const group = new Group(paths, {
    interactive: true,
    subTargetCheck: false,
  });
  flipGroupYToFabric(group);
  group.setCoords();
  return group;
}
