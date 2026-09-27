import type { FabricObject } from 'fabric';
import { collectAbsoluteBedSubpaths } from '../svg/pathCncGeometry';

function pair(code: number, value: string | number): string {
  return `${code}\n${value}`;
}

function roundMm(n: number): string {
  return parseFloat(n.toFixed(6)).toString();
}

/**
 * Invert Fabric/SVG-style bed Y (may already be origin-adjusted) into CAD Y-up
 * relative to the drawing extents so DXF opens upright in AutoCAD/LibreCAD.
 */
function toCadY(y: number, maxY: number): number {
  return maxY - y;
}

function emitLwPolyline(
  points: { x: number; y: number }[],
  closed: boolean,
  maxY: number,
  handle: number
): string[] {
  const lines: string[] = [
    pair(0, 'LWPOLYLINE'),
    pair(5, handle.toString(16).toUpperCase()),
    pair(100, 'AcDbEntity'),
    pair(8, '0'),
    pair(100, 'AcDbPolyline'),
    pair(90, points.length),
    pair(70, closed ? 1 : 0),
  ];
  for (const p of points) {
    lines.push(pair(10, roundMm(p.x)));
    lines.push(pair(20, roundMm(toCadY(p.y, maxY))));
    lines.push(pair(30, '0'));
  }
  return lines;
}

function emitLine(
  a: { x: number; y: number },
  b: { x: number; y: number },
  maxY: number,
  handle: number
): string[] {
  return [
    pair(0, 'LINE'),
    pair(5, handle.toString(16).toUpperCase()),
    pair(100, 'AcDbEntity'),
    pair(8, '0'),
    pair(100, 'AcDbLine'),
    pair(10, roundMm(a.x)),
    pair(20, roundMm(toCadY(a.y, maxY))),
    pair(30, '0'),
    pair(11, roundMm(b.x)),
    pair(21, roundMm(toCadY(b.y, maxY))),
    pair(31, '0'),
  ];
}

/** Convert canvas layout vectors to ASCII DXF (R12-style entities section). */
export function exportCncLayoutDxf(objects: FabricObject[]): string {
  const subpaths = objects.flatMap(collectAbsoluteBedSubpaths);
  if (subpaths.length === 0) {
    throw new Error('Nothing to export — no vector paths on the bed');
  }

  let maxY = -Infinity;
  for (const sp of subpaths) {
    for (const p of sp.points) if (p.y > maxY) maxY = p.y;
  }
  if (!Number.isFinite(maxY)) maxY = 0;

  const entities: string[] = [];
  let handle = 0x100;
  for (const sp of subpaths) {
    handle += 1;
    if (sp.points.length === 2 && !sp.closed) {
      entities.push(...emitLine(sp.points[0], sp.points[1], maxY, handle));
    } else {
      entities.push(...emitLwPolyline(sp.points, sp.closed, maxY, handle));
    }
  }

  return [
    pair(0, 'SECTION'),
    pair(2, 'HEADER'),
    pair(9, '$ACADVER'),
    pair(1, 'AC1009'),
    pair(0, 'ENDSEC'),
    pair(0, 'SECTION'),
    pair(2, 'ENTITIES'),
    ...entities,
    pair(0, 'ENDSEC'),
    pair(0, 'EOF'),
    '',
  ].join('\n');
}
