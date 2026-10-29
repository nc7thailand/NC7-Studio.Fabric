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
import { parseAndTransformEntity } from './dxfPlaneTransform';

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

function rawCommandsForEntity(entity: IEntity): PathCommand[] | null {
  const transformed = parseAndTransformEntity(entity);
  const pts = transformed.transformedPoints;

  switch (entity.type) {
    case 'LINE': {
      if (pts.length < 2) return null;
      return [
        ['M', pts[0].x, pts[0].y],
        ['L', pts[1].x, pts[1].y],
      ];
    }

    case 'LWPOLYLINE': {
      const poly = entity as ILwpolylineEntity;
      const verts = poly.vertices ?? [];
      if (verts.length < 2 || pts.length < 2) return null;

      const commands: PathCommand[] = [];
      for (let i = 0; i < pts.length; i += 1) {
        const p = pts[i];
        if (i === 0) {
          commands.push(['M', p.x, p.y]);
        } else {
          const prevVert = verts[i - 1];
          const prevPt = pts[i - 1];
          const bulge = num(prevVert?.bulge);
          if (bulge) {
            for (const bp of sampleBulge(prevPt.x, prevPt.y, p.x, p.y, bulge)) {
              commands.push(['L', bp.x, bp.y]);
            }
          }
          commands.push(['L', p.x, p.y]);
        }
      }
      if (poly.shape && pts.length > 2) {
        const firstPt = pts[0];
        const lastPt = pts[pts.length - 1];
        const lastVert = verts[verts.length - 1];
        const bulge = num(lastVert?.bulge);
        if (bulge) {
          for (const bp of sampleBulge(lastPt.x, lastPt.y, firstPt.x, firstPt.y, bulge)) {
            commands.push(['L', bp.x, bp.y]);
          }
        }
        commands.push(['Z']);
      }
      return commands;
    }

    case 'POLYLINE': {
      const poly = entity as IPolylineEntity;
      if (pts.length < 2) return null;
      const commands: PathCommand[] = [];
      pts.forEach((p, i) => {
        commands.push([i === 0 ? 'M' : 'L', p.x, p.y]);
      });
      if (poly.shape) commands.push(['Z']);
      return commands;
    }

    case 'CIRCLE': {
      const circ = entity as ICircleEntity;
      const centerPt = pts[0];
      const r = num(circ.radius);
      if (!centerPt || r <= 0) return null;
      return sampleArc(centerPt.x, centerPt.y, r, 0, Math.PI * 2, true);
    }

    case 'ARC': {
      const arc = entity as IArcEntity;
      const centerPt = pts[0];
      const r = num(arc.radius);
      if (!centerPt || r <= 0) return null;
      return sampleArc(
        centerPt.x,
        centerPt.y,
        r,
        num(arc.startAngle),
        num(arc.endAngle),
        false
      );
    }

    default:
      return null;
  }
}

/** Transform a block's child entity into world CAD space for an INSERT entity. */
function transformBlockEntity(
  entity: any,
  blockBase: { x?: number; y?: number; z?: number },
  insertPos: { x?: number; y?: number; z?: number },
  scale: { x?: number; y?: number },
  rotationDeg = 0
): any {
  const cloned = JSON.parse(JSON.stringify(entity));
  const sx = scale.x ?? 1;
  const sy = scale.y ?? 1;
  const rad = (rotationDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);

  const t = (p: { x?: number; y?: number; z?: number }) => {
    const bx = ((p.x ?? 0) - (blockBase.x ?? 0)) * sx;
    const by = ((p.y ?? 0) - (blockBase.y ?? 0)) * sy;
    if (rotationDeg === 0) {
      return { x: bx + (insertPos.x ?? 0), y: by + (insertPos.y ?? 0), z: p.z };
    }
    return {
      x: bx * cos - by * sin + (insertPos.x ?? 0),
      y: bx * sin + by * cos + (insertPos.y ?? 0),
      z: p.z,
    };
  };

  if (Array.isArray(cloned.vertices)) {
    cloned.vertices = cloned.vertices.map((v: any) => {
      const tp = t(v);
      return { ...v, ...tp };
    });
  }
  if (cloned.start && cloned.end) {
    cloned.start = { ...cloned.start, ...t(cloned.start) };
    cloned.end = { ...cloned.end, ...t(cloned.end) };
  }
  if (cloned.center) {
    const tp = t(cloned.center);
    cloned.center = { ...cloned.center, ...tp };
    cloned.radius = (cloned.radius ?? 0) * Math.max(Math.abs(sx), Math.abs(sy));
    if (rotationDeg !== 0) {
      if (cloned.startAngle !== undefined) cloned.startAngle += rad;
      if (cloned.endAngle !== undefined) cloned.endAngle += rad;
    }
  }
  return cloned;
}

/**
 * Parse ASCII DXF into a Fabric group (LINE / LWPOLYLINE / POLYLINE / ARC / CIRCLE).
 * Resolves INSERT block references, projects planes, flips CAD Y-up into Fabric Y-down,
 * and frames the geometry cleanly starting at (0, 0).
 */
export function loadDxfLayoutAsGroup(dxfText: string): Group {
  const parser = new DxfParser();
  const dxf = parser.parseSync(dxfText);
  if (!dxf?.entities?.length) {
    throw new Error('No entities found in DXF');
  }

  // 1. Flatten all entities, expanding INSERT block references
  const allEntities: IEntity[] = [];
  for (const entity of dxf.entities) {
    if (entity.type === 'INSERT') {
      const ins = entity as any;
      const block = dxf.blocks?.[ins.name];
      if (block?.entities && Array.isArray(block.entities)) {
        const sx = num(ins.xScale ?? 1);
        const sy = num(ins.yScale ?? 1);
        const rot = num(ins.rotation ?? 0);
        for (const be of block.entities) {
          allEntities.push(
            transformBlockEntity(
              be,
              block.position ?? { x: 0, y: 0, z: 0 },
              ins.position ?? { x: 0, y: 0, z: 0 },
              { x: sx, y: sy },
              rot
            )
          );
        }
      }
    } else {
      allEntities.push(entity);
    }
  }

  // 2. Extract raw commands and determine drawing extents across all vectors
  const rawCommandsList: PathCommand[][] = [];
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  for (const entity of allEntities) {
    const cmds = rawCommandsForEntity(entity);
    if (cmds && cmds.length >= 2) {
      rawCommandsList.push(cmds);
      for (const cmd of cmds) {
        const op = cmd[0];
        if (op === 'M' || op === 'L') {
          const x = num(cmd[1]);
          const y = num(cmd[2]);
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
  }

  if (rawCommandsList.length === 0 || !Number.isFinite(minX) || !Number.isFinite(maxY)) {
    throw new Error('No supported vector entities (LINE, LWPOLYLINE, POLYLINE, ARC, CIRCLE) in DXF');
  }

  // 3. Flip CAD Y-up to Fabric Y-down and anchor to (0, 0)
  const paths: Path[] = [];
  for (const cmds of rawCommandsList) {
    const flippedCmds: PathCommand[] = cmds.map((cmd) => {
      const op = cmd[0];
      if (op === 'M' || op === 'L') {
        return [op, num(cmd[1]) - minX, maxY - num(cmd[2])];
      }
      return cmd;
    });

    const path = pointPath(flippedCmds);
    if (path) paths.push(path);
  }

  if (paths.length === 0) {
    throw new Error('Failed to create paths from DXF entities');
  }

  // 4. Create Fabric group tagged with isDxf
  const group = new Group(paths, {
    interactive: true,
    subTargetCheck: false,
  });
  (group as any).isDxf = true;
  group.set('isDxf' as never, true as never);
  group.setCoords();

  return group;
}
